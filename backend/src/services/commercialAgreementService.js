const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const stockMovementService = require('./stockMovementService');

const PRODUCT_BONUS = 'PRODUCT_BONUS';
const CASHBACK_FIXED_PER_UNIT = 'CASHBACK_FIXED_PER_UNIT';
const BENEFIT_TYPES = new Set([PRODUCT_BONUS, CASHBACK_FIXED_PER_UNIT]);
const CASHBACK_METHODS = new Set([
    'PIX',
    'BANK_TRANSFER',
    'INVOICE_DISCOUNT',
    'NEXT_PURCHASE_CREDIT',
    'OTHER'
]);

function normalizeBenefitType(value) {
    const benefitType = value || PRODUCT_BONUS;
    if (!BENEFIT_TYPES.has(benefitType)) throw new AppError('Tipo de benefício inválido.', 400);
    return benefitType;
}

function agreementRuleData(data) {
    const benefitType = normalizeBenefitType(data.benefitType);
    if (benefitType === PRODUCT_BONUS) {
        if (!(Number(data.buyQuantity) > 0) || !(Number(data.bonusQuantity) > 0)) {
            throw new AppError('Informe uma regra de bonificação válida.', 400);
        }
        return {
            benefitType,
            buyQuantity: Number(data.buyQuantity),
            bonusQuantity: Number(data.bonusQuantity),
            cashbackPerUnit: null
        };
    }

    if (!(Number(data.cashbackPerUnit) > 0)) {
        throw new AppError('Informe um valor de cashback por unidade maior que zero.', 400);
    }
    return {
        benefitType,
        buyQuantity: 1,
        bonusQuantity: 0,
        cashbackPerUnit: Number(data.cashbackPerUnit)
    };
}

function calculateAccrual({ eligibleQuantity, buyQuantity, bonusQuantity }) {
    const invoiceQuantity = Number(eligibleQuantity);
    const threshold = Number(buyQuantity);
    if (!(threshold > 0)) throw new Error('Quantidade de compra do acordo deve ser maior que zero.');
    const cycles = Math.floor((invoiceQuantity + 1e-9) / threshold);
    return {
        earnedBonusQuantity: cycles * Number(bonusQuantity),
        balanceAfter: 0
    };
}

function calculateCashbackAccrual({ eligibleQuantity, cashbackPerUnit }) {
    const quantity = Number(eligibleQuantity);
    const valuePerUnit = Number(cashbackPerUnit);
    if (!(quantity >= 0) || !(valuePerUnit > 0)) {
        throw new Error('Quantidade elegível e cashback por unidade devem ser válidos.');
    }
    return Number((quantity * valuePerUnit).toFixed(2));
}

async function listAgreements(establishmentId) {
    return prisma.commercialAgreement.findMany({
        where: { establishmentId },
        include: {
            supplier: { select: { id: true, name: true } },
            products: { include: { product: { select: { id: true, name: true, purchaseUnit: true } } } },
            accruals: {
                select: {
                    id: true,
                    eligibleQuantity: true,
                    earnedBonusQuantity: true,
                    earnedCashbackAmount: true,
                    createdAt: true,
                    cashbackAllocations: {
                        where: { settlement: { status: 'RECEIVED' } },
                        select: { id: true, settlementId: true, amount: true }
                    },
                    invoice: {
                        select: {
                            invoiceNumber: true,
                            invoiceSeries: true,
                            issuedAt: true,
                            purchaseOrder: { select: { id: true, createdAt: true, completedAt: true } },
                            items: { select: { productId: true, quantity: true, unitPrice: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            },
            receipts: { where: { status: 'RECEIVED' }, include: { items: true } },
            cashbackSettlements: {
                where: { status: 'RECEIVED' },
                include: {
                    allocations: {
                        include: {
                            accrual: {
                                select: { invoice: { select: { invoiceNumber: true, purchaseOrderId: true } } }
                            }
                        }
                    }
                },
                orderBy: { receivedAt: 'desc' }
            }
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    });
}

async function validateAgreementReferences({ establishmentId, supplierId, productIds }) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, establishmentId } });
    if (!supplier) throw new AppError('Fornecedor inválido para este estabelecimento.', 400);
    if (!Array.isArray(productIds) || productIds.length === 0) {
        throw new AppError('Selecione pelo menos um produto elegível.', 400);
    }
    const uniqueProductIds = [...new Set(productIds.map(item => item.productId))];
    const products = await prisma.product.findMany({
        where: { id: { in: uniqueProductIds }, establishmentId, isActive: true },
        select: { id: true }
    });
    if (products.length !== uniqueProductIds.length) {
        throw new AppError('Um ou mais produtos elegíveis são inválidos.', 400);
    }
}

function validateAgreementIdentity(data) {
    if (!String(data.name || '').trim() || !data.startsAt || Number.isNaN(new Date(data.startsAt).getTime())) {
        throw new AppError('Informe o nome e a data inicial do acordo.', 400);
    }
}

function agreementProducts(productIds, benefitType) {
    return productIds.map(item => ({
        productId: item.productId,
        eligibilityFactor: Number(item.eligibilityFactor || 1),
        canGenerateBonus: item.canGenerateBonus !== false,
        canBeReceivedAsBonus: benefitType === PRODUCT_BONUS && item.canBeReceivedAsBonus !== false
    }));
}

async function createAgreement(data) {
    const { establishmentId, supplierId, productIds, createdByUserId } = data;
    await validateAgreementReferences({ establishmentId, supplierId, productIds });
    validateAgreementIdentity(data);
    const rule = agreementRuleData(data);

    return prisma.commercialAgreement.create({
        data: {
            establishmentId,
            supplierId,
            name: String(data.name).trim(),
            brand: String(data.brand || '').trim() || null,
            ...rule,
            allowMixedProducts: data.allowMixedProducts !== false,
            startsAt: new Date(data.startsAt),
            endsAt: data.endsAt ? new Date(data.endsAt) : null,
            notes: String(data.notes || '').trim() || null,
            createdByUserId,
            products: { create: agreementProducts(productIds, rule.benefitType) }
        },
        include: { supplier: true, products: { include: { product: true } } }
    });
}

async function updateAgreement(data) {
    const { id, establishmentId, supplierId, productIds } = data;
    const agreement = await prisma.commercialAgreement.findFirst({
        where: { id, establishmentId },
        include: { _count: { select: { accruals: true, receipts: true, cashbackSettlements: true } } }
    });
    if (!agreement) throw new AppError('Acordo comercial não encontrado.', 404);

    await validateAgreementReferences({ establishmentId, supplierId, productIds });
    validateAgreementIdentity(data);
    const rule = agreementRuleData(data);
    const movementCount = agreement._count.accruals + agreement._count.receipts + agreement._count.cashbackSettlements;
    if (movementCount > 0 && rule.benefitType !== agreement.benefitType) {
        throw new AppError('O tipo de benefício não pode ser alterado após existirem movimentações.', 409);
    }
    if (!['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(data.status)) {
        throw new AppError('Status do acordo inválido.', 400);
    }

    return prisma.$transaction(async tx => {
        await tx.commercialAgreementProduct.deleteMany({ where: { agreementId: id } });
        return tx.commercialAgreement.update({
            where: { id },
            data: {
                supplierId,
                name: String(data.name).trim(),
                brand: String(data.brand || '').trim() || null,
                ...rule,
                startsAt: new Date(data.startsAt),
                endsAt: data.endsAt ? new Date(data.endsAt) : null,
                status: data.status,
                products: { create: agreementProducts(productIds, rule.benefitType) }
            },
            include: { supplier: true, products: { include: { product: true } } }
        });
    });
}

async function deleteAgreement({ id, establishmentId }) {
    const agreement = await prisma.commercialAgreement.findFirst({
        where: { id, establishmentId },
        include: { _count: { select: { accruals: true, receipts: true, cashbackSettlements: true } } }
    });
    if (!agreement) throw new AppError('Acordo comercial não encontrado.', 404);
    if (agreement._count.accruals > 0 || agreement._count.receipts > 0 || agreement._count.cashbackSettlements > 0) {
        throw new AppError('Este acordo já possui movimentações e não pode ser excluído. Altere o status para Encerrado.', 409);
    }
    await prisma.commercialAgreement.delete({ where: { id } });
}

async function processInvoiceAccruals(tx, { invoice, invoiceItems }) {
    const agreements = await tx.commercialAgreement.findMany({
        where: {
            establishmentId: invoice.establishmentId,
            supplierId: invoice.supplierId,
            status: 'ACTIVE',
            startsAt: { lte: invoice.issuedAt },
            OR: [{ endsAt: null }, { endsAt: { gte: invoice.issuedAt } }]
        },
        include: { products: true }
    });

    for (const agreement of agreements) {
        const eligibility = new Map(
            agreement.products.filter(item => item.canGenerateBonus)
                .map(item => [item.productId, Number(item.eligibilityFactor || 1)])
        );
        const eligibleQuantity = invoiceItems.reduce((sum, item) =>
            sum + (eligibility.has(item.productId)
                ? Number(item.quantity) * eligibility.get(item.productId)
                : 0), 0);
        if (eligibleQuantity <= 0) continue;

        const earnedBonusQuantity = agreement.benefitType === PRODUCT_BONUS
            ? calculateAccrual({
                eligibleQuantity,
                buyQuantity: agreement.buyQuantity,
                bonusQuantity: agreement.bonusQuantity
            }).earnedBonusQuantity
            : 0;
        const earnedCashbackAmount = agreement.benefitType === CASHBACK_FIXED_PER_UNIT
            ? calculateCashbackAccrual({ eligibleQuantity, cashbackPerUnit: agreement.cashbackPerUnit })
            : 0;

        await tx.bonusAccrual.create({
            data: {
                agreementId: agreement.id,
                invoiceId: invoice.id,
                eligibleQuantity,
                balanceBefore: 0,
                earnedBonusQuantity,
                earnedCashbackAmount,
                balanceAfter: 0
            }
        });
        await tx.commercialAgreement.update({
            where: { id: agreement.id },
            data: { currentRemainder: 0 }
        });
    }
}

async function receiveBonus({ establishmentId, userId, agreementId, invoiceNumber, invoiceSeries, invoiceDate, additionalCredits, items }) {
    if (!Array.isArray(items) || items.length === 0) throw new AppError('Informe os itens bonificados.', 400);
    if (!String(invoiceNumber || '').trim() || !invoiceDate || Number.isNaN(new Date(invoiceDate).getTime())) {
        throw new AppError('Informe o número e a data da nota de bonificação.', 400);
    }
    return prisma.$transaction(async tx => {
        const agreement = await tx.commercialAgreement.findFirst({
            where: { id: agreementId, establishmentId, status: 'ACTIVE' }, include: { products: true }
        });
        if (!agreement) throw new AppError('Acordo comercial ativo não encontrado.', 404);
        if (agreement.benefitType !== PRODUCT_BONUS) {
            throw new AppError('Este acordo gera cashback financeiro e não recebe produto bonificado.', 400);
        }
        const eligible = new Set(agreement.products.filter(item => item.canBeReceivedAsBonus).map(item => item.productId));
        if (items.some(item => !eligible.has(item.productId))) {
            throw new AppError('A nota possui produto não autorizado como bonificação neste acordo.', 400);
        }

        const productIds = [...new Set(items.map(item => item.productId))];
        const products = await tx.product.findMany({ where: { id: { in: productIds }, establishmentId } });
        const productMap = new Map(products.map(product => [product.id, product]));
        const locationIds = [...new Set(items.map(item => item.locationId))];
        const locations = await tx.stockLocation.findMany({
            where: { id: { in: locationIds }, establishmentId }, select: { id: true }
        });
        if (products.length !== productIds.length || locations.length !== locationIds.length) {
            throw new AppError('Produto ou local inválido para este estabelecimento.', 400);
        }

        const receipt = await tx.bonusReceipt.create({
            data: {
                establishmentId,
                supplierId: agreement.supplierId,
                agreementId,
                invoiceNumber: String(invoiceNumber).trim(),
                invoiceSeries: String(invoiceSeries || '').trim(),
                invoiceDate: new Date(invoiceDate),
                additionalCredits: Number(additionalCredits || 0),
                createdByUserId: userId
            }
        });

        for (const item of items) {
            const product = productMap.get(item.productId);
            const quantity = Number(item.quantity);
            const fiscalUnitPrice = Number(item.fiscalUnitPrice);
            const commercialReferencePrice = Number(item.commercialReferencePrice);
            if (!(quantity > 0) || fiscalUnitPrice < 0 || !(commercialReferencePrice >= 0)) {
                throw new AppError('Quantidade e valores da bonificação são inválidos.', 400);
            }
            await tx.bonusReceiptItem.create({
                data: {
                    bonusReceiptId: receipt.id,
                    productId: item.productId,
                    locationId: item.locationId,
                    quantity,
                    fiscalUnitPrice,
                    commercialReferencePrice,
                    fiscalTotal: quantity * fiscalUnitPrice,
                    commercialBenefit: quantity * commercialReferencePrice
                }
            });
            await stockMovementService.addStock({
                productId: item.productId,
                quantity: quantity * Number(product.packQuantity || 1),
                establishmentId,
                reason: 'BONUS',
                reference: `BONUS_RECEIPT:${receipt.id}`,
                supplierId: agreement.supplierId,
                unitCost: commercialReferencePrice / Number(product.packQuantity || 1),
                locationId: item.locationId,
                updateCurrentCost: false
            }, tx);
        }
        return receipt;
    }, { maxWait: 10000, timeout: 60000 });
}

async function receiveCashback({ establishmentId, userId, agreementId, amount, receivedAt, method, reference, notes, allocations }) {
    const numericAmount = Number(amount);
    const receivedDate = new Date(receivedAt);
    if (!(numericAmount > 0) || !receivedAt || Number.isNaN(receivedDate.getTime())) {
        throw new AppError('Informe um valor e uma data de recebimento válidos.', 400);
    }
    if (!CASHBACK_METHODS.has(method)) throw new AppError('Forma de recebimento inválida.', 400);
    if (!Array.isArray(allocations) || allocations.length === 0) {
        throw new AppError('Vincule o recebimento a pelo menos uma ordem recebida.', 400);
    }
    const normalizedAllocations = allocations.map(item => ({
        accrualId: String(item.accrualId || ''),
        amount: Number(item.amount)
    }));
    if (normalizedAllocations.some(item => !item.accrualId || !(item.amount > 0))) {
        throw new AppError('As alocações por ordem devem possuir valores maiores que zero.', 400);
    }
    if (new Set(normalizedAllocations.map(item => item.accrualId)).size !== normalizedAllocations.length) {
        throw new AppError('Uma ordem recebida não pode ser informada mais de uma vez.', 400);
    }
    const allocatedTotal = Number(normalizedAllocations.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    if (Math.abs(allocatedTotal - numericAmount) > 0.001) {
        throw new AppError('O valor recebido deve ser igual ao total vinculado às ordens.', 400);
    }

    try {
        return await prisma.$transaction(async tx => {
            const agreement = await tx.commercialAgreement.findFirst({
                where: { id: agreementId, establishmentId, benefitType: CASHBACK_FIXED_PER_UNIT },
                include: {
                    accruals: {
                        where: { id: { in: normalizedAllocations.map(item => item.accrualId) } },
                        select: {
                            id: true,
                            earnedCashbackAmount: true,
                            cashbackAllocations: {
                                where: { settlement: { status: 'RECEIVED' } },
                                select: { amount: true }
                            }
                        }
                    }
                }
            });
            if (!agreement) throw new AppError('Acordo de cashback não encontrado neste estabelecimento.', 404);
            if (agreement.accruals.length !== normalizedAllocations.length) {
                throw new AppError('Uma ou mais ordens não pertencem a este acordo e estabelecimento.', 400);
            }

            const accrualMap = new Map(agreement.accruals.map(row => [row.id, row]));
            for (const allocation of normalizedAllocations) {
                const accrual = accrualMap.get(allocation.accrualId);
                const alreadyReceived = accrual.cashbackAllocations.reduce(
                    (sum, row) => sum + Number(row.amount), 0
                );
                const pending = Number((Number(accrual.earnedCashbackAmount) - alreadyReceived).toFixed(2));
                if (allocation.amount - pending > 0.001) {
                    throw new AppError(`O valor vinculado excede o saldo de R$ ${pending.toFixed(2)} desta ordem.`, 409);
                }
            }

            return tx.commercialAgreementCashbackSettlement.create({
                data: {
                    establishmentId,
                    supplierId: agreement.supplierId,
                    agreementId,
                    amount: numericAmount,
                    receivedAt: receivedDate,
                    method,
                    reference: String(reference || '').trim() || null,
                    notes: String(notes || '').trim() || null,
                    createdByUserId: userId,
                    allocations: { create: normalizedAllocations }
                },
                include: { allocations: true }
            });
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error.code === 'P2034') {
            throw new AppError('O saldo do cashback foi alterado por outra operação. Atualize e tente novamente.', 409);
        }
        throw error;
    }
}

async function cancelCashbackSettlement({ establishmentId, userId, settlementId }) {
    const settlement = await prisma.commercialAgreementCashbackSettlement.findFirst({
        where: { id: settlementId, establishmentId, status: 'RECEIVED' }
    });
    if (!settlement) throw new AppError('Recebimento de cashback não encontrado.', 404);
    return prisma.commercialAgreementCashbackSettlement.update({
        where: { id: settlementId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: userId }
    });
}

async function getSummary(establishmentId, dateFrom, dateTo) {
    const dateWhere = {};
    if (dateFrom) dateWhere.gte = new Date(`${dateFrom}T00:00:00-03:00`);
    if (dateTo) dateWhere.lte = new Date(`${dateTo}T23:59:59.999-03:00`);
    const hasDateFilter = Object.keys(dateWhere).length > 0;
    const agreements = await prisma.commercialAgreement.findMany({
        where: { establishmentId },
        include: {
            supplier: { select: { name: true } },
            accruals: { where: hasDateFilter ? { invoice: { issuedAt: dateWhere } } : undefined },
            receipts: {
                where: { status: 'RECEIVED', ...(hasDateFilter ? { invoiceDate: dateWhere } : {}) },
                include: { items: true }
            },
            cashbackSettlements: {
                where: { status: 'RECEIVED', ...(hasDateFilter ? { receivedAt: dateWhere } : {}) }
            }
        }
    });
    return agreements.map(agreement => {
        const earned = agreement.accruals.reduce((sum, row) => sum + Number(row.earnedBonusQuantity), 0);
        const received = agreement.receipts.flatMap(row => row.items).reduce((sum, row) => sum + Number(row.quantity), 0);
        const fiscalValue = agreement.receipts.flatMap(row => row.items).reduce((sum, row) => sum + Number(row.fiscalTotal), 0);
        const commercialBenefit = agreement.receipts.flatMap(row => row.items).reduce((sum, row) => sum + Number(row.commercialBenefit), 0);
        const credits = agreement.receipts.reduce((sum, row) => sum + Number(row.additionalCredits), 0);
        const earnedCashback = agreement.accruals.reduce((sum, row) => sum + Number(row.earnedCashbackAmount || 0), 0);
        const receivedCashback = agreement.cashbackSettlements.reduce((sum, row) => sum + Number(row.amount), 0);
        return {
            agreementId: agreement.id,
            name: agreement.name,
            brand: agreement.brand,
            benefitType: agreement.benefitType,
            supplierName: agreement.supplier.name,
            earnedBonusQuantity: earned,
            receivedBonusQuantity: received,
            pendingBonusQuantity: earned - received,
            fiscalValue,
            commercialBenefit,
            additionalCredits: credits,
            earnedCashbackAmount: earnedCashback,
            receivedCashbackAmount: receivedCashback,
            pendingCashbackAmount: earnedCashback - receivedCashback,
            totalBenefit: commercialBenefit + credits + receivedCashback
        };
    });
}

module.exports = {
    calculateAccrual,
    calculateCashbackAccrual,
    listAgreements,
    createAgreement,
    updateAgreement,
    deleteAgreement,
    processInvoiceAccruals,
    receiveBonus,
    receiveCashback,
    cancelCashbackSettlement,
    getSummary
};

const prisma = require('../utils/prisma');
const { Prisma } = require('@prisma/client');
const AppError = require('../utils/AppError');
const { purchaseReturnSchema } = require('../validations/purchaseReturnValidation');
const { parseEntryDate } = require('../validations/stockMovementValidation');
const D = value => new Prisma.Decimal(value);
const businessDay = date => new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// Legacy receipts have no immutable pack snapshot. Never use today's pack size.
async function receiptSnapshot(tx, item, establishmentId) {
    if (item.receivedStockQuantity !== null && item.receivedStockQuantity !== undefined) {
        return { quantity: item.receivedStockQuantity, unit: item.receivedUnit || item.product?.unit };
    }
    const order = item.purchaseOrder;
    if (!order.completedAt || !item.productId || Number(item.adjustedQuantity) <= 0) return null;
    const duplicates = await tx.purchaseOrderItem.count({
        where: { purchaseOrderId: order.id, productId: item.productId }
    });
    if (duplicates !== 1) return null;
    const movements = await tx.stockMovement.findMany({ where: {
        establishmentId, productId: item.productId, type: 'PURCHASE', reason: 'PURCHASE',
        reference: `Ordem de Compra #${order.id.slice(-6).toUpperCase()}`,
        createdAt: { gte: order.createdAt, lte: order.completedAt }
    } });
    if (movements.length !== 1 || Number(movements[0].quantity) <= 0 || movements[0].totalCost === null) return null;
    const expected = D(item.adjustedQuantity).mul(item.unitPrice);
    if (D(movements[0].totalCost).sub(expected).abs().gt('0.01')) return null;
    return { quantity: movements[0].quantity, unit: item.product?.unit };
}

async function listReceipts(establishmentId, productId) {
    const items = await prisma.purchaseOrderItem.findMany({
        where: { productId, adjustedQuantity: { gt: 0 }, purchaseOrder: { establishmentId, status: 'completed' } },
        include: { purchaseOrder: true, product: true, supplier: true, returns: { select: { quantity: true } } },
        orderBy: { purchaseOrder: { completedAt: 'desc' } }
    });
    return Promise.all(items.map(async item => {
        const snapshot = await receiptSnapshot(prisma, item, establishmentId);
        const returned = item.returns.reduce((sum, r) => sum.add(r.quantity), D(0));
        const quantity = snapshot ? D(snapshot.quantity) : D(0);
        return {
            id: item.id, purchaseOrderId: item.purchaseOrderId, productName: item.productName,
            supplierName: item.supplier?.name || 'Fornecedor não identificado',
            completedAt: item.purchaseOrder.completedAt, unit: snapshot?.unit || item.product?.unit,
            receivedQuantity: quantity.toNumber(), returnedQuantity: returned.toNumber(),
            remainingQuantity: quantity.sub(returned).toNumber(),
            unitCost: quantity.gt(0) ? D(item.adjustedQuantity).mul(item.unitPrice).div(quantity).toNumber() : 0,
            unavailableReason: !snapshot ? 'Recebimento antigo sem conversão identificável com segurança.'
                : snapshot.unit !== item.product?.unit ? 'A unidade do produto mudou desde o recebimento. Confira o cadastro.'
                : !item.supplierId ? 'Compra sem fornecedor identificado.' : null
        };
    }));
}

async function listReturns(establishmentId) {
    return prisma.purchaseReturn.findMany({
        where: { establishmentId }, orderBy: { createdAt: 'desc' }, take: 50,
        include: {
            purchaseOrderItem: { select: { purchaseOrderId: true, productName: true, receivedUnit: true, supplier: { select: { name: true } } } },
            stockMovement: { select: { location: { select: { name: true } } } }
        }
    });
}

async function createReturn(input) {
    const { establishmentId, userId, ...body } = input;
    const parsed = purchaseReturnSchema.safeParse(body);
    if (!parsed.success) throw new AppError('Dados da devolução inválidos.', 422);
    const data = parsed.data;
    if (!userId || !establishmentId) throw new AppError('Usuário ou estabelecimento não identificado.', 403);
    const returnedAt = parseEntryDate(data.returnedAt);

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await prisma.$transaction(async tx => {
                const existing = await tx.purchaseReturn.findUnique({
                    where: { establishmentId_requestId: { establishmentId, requestId: data.requestId } },
                    include: { stockMovement: { select: { locationId: true } } }
                });
                if (existing) {
                    if (existing.purchaseOrderItemId !== data.purchaseOrderItemId || !D(existing.quantity).eq(data.quantity)
                        || existing.stockMovement.locationId !== data.locationId || existing.reason !== data.reason
                        || existing.financialTreatment !== data.financialTreatment || (existing.notes || '') !== data.notes
                        || new Date(existing.returnedAt).getTime() !== returnedAt.getTime()) {
                        throw new AppError('Identificador já utilizado em outra devolução.', 409);
                    }
                    return existing;
                }
                const item = await tx.purchaseOrderItem.findFirst({
                    where: { id: data.purchaseOrderItemId, purchaseOrder: { establishmentId, status: 'completed' } },
                    include: { purchaseOrder: true, product: true, supplier: true }
                });
                if (!item || !item.product || item.product.establishmentId !== establishmentId
                    || !item.supplier || item.supplier.establishmentId !== establishmentId) {
                    throw new AppError('Compra, produto ou fornecedor inválido para este estabelecimento.', 404);
                }
                if (data.returnedAt > businessDay(new Date()) || data.returnedAt < businessDay(item.purchaseOrder.completedAt)) {
                    throw new AppError('A data deve estar entre o recebimento da compra e hoje.', 422);
                }
                const location = await tx.stockLocation.findFirst({ where: { id: data.locationId, establishmentId } });
                if (!location) throw new AppError('Local de estoque inválido.', 422);
                const snapshot = await receiptSnapshot(tx, item, establishmentId);
                if (!snapshot || !D(snapshot.quantity).gt(0)) throw new AppError('Não foi possível identificar a quantidade original recebida com segurança.', 409);
                if (snapshot.unit !== item.product.unit) throw new AppError('A unidade do produto mudou desde o recebimento. Confira o cadastro antes de devolver.', 409);
                const totals = await tx.purchaseReturn.aggregate({
                    where: { purchaseOrderItemId: item.id, establishmentId }, _sum: { quantity: true }
                });
                const quantity = D(data.quantity);
                if (quantity.add(totals._sum.quantity || 0).gt(snapshot.quantity)) {
                    throw new AppError('Quantidade superior ao saldo ainda não devolvido desta compra.', 409);
                }
                const stock = await tx.productStock.findUnique({
                    where: { productId_locationId: { productId: item.productId, locationId: data.locationId } }
                });
                const changedStock = await tx.productStock.updateMany({
                    where: { productId: item.productId, locationId: data.locationId, quantity: { gte: quantity } },
                    data: { quantity: { decrement: quantity } }
                });
                if (changedStock.count !== 1) throw new AppError('Saldo insuficiente do produto neste local.', 409);
                const changedProduct = await tx.product.updateMany({
                    where: { id: item.productId, establishmentId, quantity: { gte: quantity } },
                    data: { quantity: { decrement: quantity } }
                });
                if (changedProduct.count !== 1) throw new AppError('Saldo total insuficiente ou inconsistente. Confira o estoque.', 409);

                const unitCost = D(item.adjustedQuantity).mul(item.unitPrice).div(snapshot.quantity);
                const purchaseQuantity = quantity.mul(item.adjustedQuantity).div(snapshot.quantity);
                const totalCost = quantity.mul(unitCost).toDecimalPlaces(4);
                await tx.purchaseOrderItem.update({ where: { id: item.id }, data: {
                    receivedStockQuantity: snapshot.quantity, receivedUnitCost: unitCost.toDecimalPlaces(4), receivedUnit: snapshot.unit
                } });
                const movement = await tx.stockMovement.create({ data: {
                    establishmentId, productId: item.productId, productName: item.productName,
                    supplierId: item.supplierId, locationId: data.locationId,
                    type: 'OUT', reason: data.reason, quantity,
                    previousQuantity: stock.quantity, newQuantity: D(stock.quantity).sub(quantity),
                    unitCost: unitCost.toDecimalPlaces(4), totalCost,
                    purchaseClassification: item.purchaseClassification,
                    reference: `Devolução ao fornecedor — OC #${item.purchaseOrderId.slice(-6).toUpperCase()}`,
                    createdAt: returnedAt, notes: data.notes || null, recordedByUserId: userId
                } });
                const result = await tx.purchaseReturn.create({ data: {
                    establishmentId, requestId: data.requestId, purchaseOrderItemId: item.id,
                    stockMovementId: movement.id, quantity, purchaseQuantity: purchaseQuantity.toDecimalPlaces(9),
                    unitCost: unitCost.toDecimalPlaces(4), totalCost, returnedAt, recordedByUserId: userId,
                    reason: data.reason, financialTreatment: data.financialTreatment, notes: data.notes || null
                } });
                await tx.auditLog.create({ data: {
                    establishmentId, actionType: 'CREATE', entityType: 'PURCHASE_RETURN', entityId: result.id,
                    description: `Devolução de ${quantity} ${snapshot.unit || ''} de ${item.productName}; compra ${item.purchaseOrderId}; usuário ${userId}; valor ${totalCost}.`
                } });
                return result;
            }, { isolationLevel: 'Serializable', timeout: 15000 });
        } catch (error) {
            if (['P2034', 'P2002'].includes(error.code)) {
                if (attempt < 2) continue;
                throw new AppError('O estoque foi atualizado por outra operação. Tente novamente.', 409);
            }
            throw error;
        }
    }
}

module.exports = { listReceipts, listReturns, createReturn, receiptSnapshot };

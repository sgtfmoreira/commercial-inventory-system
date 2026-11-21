const prisma = require('../config/prisma');
const stockMovementRepo = require('../repositories/stockMovementRepository');
const AppError = require('../utils/AppError');

async function validateStockLocation(tx, locationId, establishmentId) {
    const location = await tx.stockLocation.findFirst({ where: { id: locationId, establishmentId } });
    if (!location) throw new AppError('Local de estoque inválido para este estabelecimento. Atualize a página e selecione o local novamente.', 422);
}

/**
 * 🔐 REGRA DE CUSTO (CORE FINANCEIRO)
 * 🛡️ Blindado com establishmentId
 */
/**
 * Busca custo usando um cliente de transação (tx).
 * Usado internamente em operações que já estão dentro de uma transação.
 */
const getProductCost = async (productId, establishmentId, tx) => {

    // 🥇 Última compra do estabelecimento
    const lastPurchase = await tx.purchaseOrderItem.findFirst({
        where: { 
            productId,
            purchaseOrder: {
                establishmentId
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (lastPurchase?.unitPrice) {
        const product = await tx.product.findFirst({
            where: { id: productId, establishmentId },
            select: { packQuantity: true }
        });
        const packQuantity = product?.packQuantity || 1;
        return Number(lastPurchase.unitPrice) / packQuantity;
    }

    // 🥈 Menor preço fornecedor do estabelecimento
    const supplier = await tx.productSupplier.findFirst({
        where: { 
            productId,
            product: {
                establishmentId
            }
        },
        orderBy: { price: 'asc' }
    });

    if (supplier?.price) {
        const product = await tx.product.findFirst({
            where: { id: productId, establishmentId },
            select: { packQuantity: true }
        });
        const packQuantity = product?.packQuantity || 1;
        return Number(supplier.price) / packQuantity;
    }

    // 🥉 fallback (dados do próprio produto)
    const product = await tx.product.findFirst({
        where: { id: productId, establishmentId }
    });

    if (product?.currentCost && product.currentCost > 0) {
        return Number(product.currentCost);
    }

    if (product?.unitPrice && product.unitPrice > 0) {
        const packQuantity = product.packQuantity || 1;
        return Number(product.unitPrice) / packQuantity;
    }

    return 0;
};

/**
 * 🔓 Versão FORA de transação — usa prisma diretamente.
 * Usada para pré-carregar custos antes de abrir uma transação longa,
 * evitando timeout P2028 em lotes grandes (ex: importação CSV).
 */
const getProductCostOutsideTx = async (productId, establishmentId) => {
    return getProductCost(productId, establishmentId, prisma);
};

// 🔍 CONSULTA
const getMovements = (filters) => filters.page || filters.pageSize
    ? stockMovementRepo.findPaginated(filters)
    : stockMovementRepo.findAll(filters);

/**
 * 🔥 CONSUMO (CORE)
 * 🛡️ Isolamento total garantido
 */
const consumeProduct = async ({
    productId,
    quantity,
    establishmentId,
    reason,
    reference,
    movementMetadata = {},
    enforceAvailableStock = false,
    preloadedCost, // opcional: custo pré-calculado fora da transação
    locationId, // opcional: local de onde o estoque vai sair
    ancestry = [] // controle interno para impedir ciclos em fichas técnicas
}, tx) => {

    const product = await tx.product.findFirst({
        where: { id: productId, establishmentId }
    });

    if (!product) throw new Error("Produto não encontrado ou acesso negado.");
    if (!quantity || quantity <= 0) throw new Error("Quantidade inválida");
    if (ancestry.includes(product.id)) {
        throw new Error(`Ciclo detectado na ficha técnica do produto "${product.name}".`);
    }

    // Identificar o local de saída
    let targetLocationId = locationId || product.defaultLocationId;
    if (!targetLocationId) {
        const defaultLoc = await tx.stockLocation.findFirst({ where: { establishmentId, isDefault: true }});
        targetLocationId = defaultLoc ? defaultLoc.id : null;
    }

    if (!targetLocationId) throw new Error("Local de estoque não definido para este produto.");

    await validateStockLocation(tx, targetLocationId, establishmentId);

    const stockRecord = await tx.productStock.findUnique({
        where: { productId_locationId: { productId: product.id, locationId: targetLocationId } }
    });

    const requestedQty = Number(quantity);
    const currentQty = stockRecord ? Number(stockRecord.quantity) : 0;
    const isAudit = String(reference || '').startsWith("STOCK_AUDIT");
    const isProduction = product.type === "PRODUCTION";

    // Inventário e auditoria baixam diretamente. Produção usa o saldo pronto
    // disponível e explode somente a quantidade restante da ficha técnica.
    const directQty = (!isProduction || isAudit)
        ? requestedQty
        : Math.min(Math.max(currentQty, 0), requestedQty);

    if (directQty > 0) {
        try {
            if (enforceAvailableStock) {
                const updatedStock = await tx.productStock.updateMany({
                    where: {
                        productId: product.id,
                        locationId: targetLocationId,
                        quantity: { gte: directQty }
                    },
                    data: { quantity: { decrement: directQty } }
                });
                if (updatedStock.count !== 1) {
                    throw new Error(`Saldo insuficiente de ${product.name} neste local.`);
                }
            } else {
                await tx.productStock.upsert({
                    where: { productId_locationId: { productId: product.id, locationId: targetLocationId } },
                    update: { quantity: { decrement: directQty } },
                    create: { productId: product.id, locationId: targetLocationId, quantity: -directQty }
                });
            }

            if (enforceAvailableStock) {
                const updatedProduct = await tx.product.updateMany({
                    where: { id: product.id, establishmentId, quantity: { gte: directQty } },
                    data: { quantity: { decrement: directQty } }
                });
                if (updatedProduct.count !== 1) {
                    throw new Error(`Saldo global inconsistente para ${product.name}. Faça uma auditoria antes da baixa.`);
                }
            } else {
                await tx.product.update({
                    where: { id: product.id },
                    data: { quantity: { decrement: directQty } }
                });
            }

            const previousQuantity = currentQty;
            const newQuantity = currentQty - directQty;

            const unitCost = preloadedCost !== undefined ? preloadedCost : await getProductCost(product.id, establishmentId, tx);
            const totalCost = unitCost * directQty;

            await tx.stockMovement.create({
                data: {
                    productId: product.id,
                    productName: product.name,
                    type: "OUT",
                    quantity: directQty,
                    previousQuantity,
                    newQuantity,
                    reference,
                    reason,
                    establishmentId,
                    unitCost,
                    totalCost,
                    locationId: targetLocationId,
                    purchaseClassification: product.purchaseClassification,
                    ...movementMetadata
                }
            });
        } catch (err) {
            throw err;
        }
    }

    const remainingQty = requestedQty - directQty;
    if (remainingQty <= 0) return;

    const recipe = await tx.recipe.findFirst({
        where: { productId: product.id, establishmentId },
        include: {
            items: {
                include: { product: true }
            }
        }
    });

    if (!recipe) throw new Error("Produto de produção sem receita cadastrada.");

    for (const item of recipe.items) {
        const ingredient = item.product;
        const yieldQty = Number(recipe.yieldQuantity) || 1;
        const totalNeeded = (Number(item.quantity) / yieldQty) * remainingQty;

        await consumeProduct({
            productId: ingredient.id,
            quantity: totalNeeded,
            establishmentId,
            reason,
            reference,
            movementMetadata,
            enforceAvailableStock,
            locationId: targetLocationId,
            ancestry: [...ancestry, product.id]
        }, tx);
    }
};

/**
 * 🟢 ENTRADA DE ESTOQUE
 */
const addStock = async ({
    productId,
    quantity,
    establishmentId,
    reason,
    reference,
    supplierId,
    unitCost: manualUnitCost,
    locationId,
    updateCurrentCost = true
}, tx) => {

    const product = await tx.product.findFirst({
        where: { id: productId, establishmentId }
    });

    if (!product) throw new Error("Produto não encontrado ou acesso negado.");
    if (!quantity || quantity <= 0) throw new Error("Quantidade inválida");

    let targetLocationId = locationId || product.defaultLocationId;
    if (!targetLocationId) {
        const defaultLoc = await tx.stockLocation.findFirst({ where: { establishmentId, isDefault: true }});
        targetLocationId = defaultLoc ? defaultLoc.id : null;
    }

    if (!targetLocationId) throw new Error("Local de estoque não definido para este produto.");

    await validateStockLocation(tx, targetLocationId, establishmentId);

    const stockRecord = await tx.productStock.upsert({
        where: { productId_locationId: { productId: product.id, locationId: targetLocationId } },
        create: { productId: product.id, locationId: targetLocationId, quantity: Number(quantity) },
        update: { quantity: { increment: quantity } }
    });

    const previousQuantity = Number(stockRecord.quantity) - Number(quantity);
    const newQuantity = Number(stockRecord.quantity);

    const unitCost = manualUnitCost !== undefined ? manualUnitCost : await getProductCost(product.id, establishmentId, tx);
    const totalCost = unitCost * Number(quantity);

    await tx.product.update({
        where: { id: product.id },
        data: {
            quantity: { increment: quantity },
            ...(updateCurrentCost ? { currentCost: unitCost } : {})
        }
    });

    let movementType = "PURCHASE";
    if (reason === "BONUS") movementType = "IN";

    let finalSupplierId = supplierId;
    if (!finalSupplierId) {
        const ps = await tx.productSupplier.findFirst({ 
            where: { 
                productId,
                product: { establishmentId }
            } 
        });
        if (ps) finalSupplierId = ps.supplierId;
    }

    await tx.stockMovement.create({
        data: {
            productId: product.id,
            productName: product.name,
            type: movementType,
            quantity,
            previousQuantity,
            newQuantity,
            reference,
            reason,
            establishmentId,
            unitCost,
            totalCost,
            supplierId: finalSupplierId,
            locationId: targetLocationId,
            purchaseClassification: product.purchaseClassification
        }
    });
};

// 🎁 BONUS
const addBonus = async ({
    productId,
    quantity,
    establishmentId,
    supplierId,
    locationId
}) => {
    if (!productId) throw new Error("Produto é obrigatório");
    if (!quantity || quantity <= 0) throw new Error("Quantidade inválida");

    return prisma.$transaction(async (tx) => {
        await addStock({
            productId,
            quantity,
            establishmentId,
            reason: "BONUS",
            reference: "BONIFICAÇÃO",
            supplierId,
            locationId
        }, tx);
    });
};

// 🍺 CONSUMO INTERNO
const createInternalUse = async ({
    productId,
    quantity,
    establishmentId,
    locationId
}) => {

    if (!productId) throw new Error("Produto é obrigatório");
    if (!quantity || quantity <= 0) throw new Error("Quantidade inválida");

    return prisma.$transaction(async (tx) => {
        await consumeProduct({
            productId,
            quantity,
            establishmentId,
            reason: "INTERNAL_USE",
            reference: "CONSUMO INTERNO",
            locationId
        }, tx);
    });
};

// 🍹 CONSUMO OPERACIONAL
const createOperationalUse = async ({
    productId,
    quantity,
    establishmentId,
    locationId,
    responsibleSector,
    notes,
    periodFrom,
    periodTo,
    userId
}) => {

    if (!productId) throw new Error("Produto é obrigatório");
    if (!quantity || quantity <= 0) throw new Error("Quantidade inválida");

    return prisma.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
            where: {
                id: productId,
                establishmentId,
                trackInventory: true,
                purchaseClassification: { in: ['CLEANING', 'DISPOSABLES', 'OPERATING'] }
            },
            select: { id: true, name: true, purchaseClassification: true, responsibleSector: true }
        });
        if (!product) throw new Error('Produto operacional inválido ou acesso negado.');

        const defaultLocation = locationId ? null : await tx.stockLocation.findFirst({
            where: { establishmentId, isDefault: true }, select: { id: true }
        });
        const targetLocationId = locationId || defaultLocation?.id;
        if (!targetLocationId) throw new Error('Local de estoque não definido.');

        const location = await tx.stockLocation.findFirst({
            where: { id: targetLocationId, establishmentId }, select: { id: true }
        });
        if (!location) throw new Error('Local de estoque inválido ou acesso negado.');

        const stock = await tx.productStock.findUnique({
            where: { productId_locationId: { productId, locationId: targetLocationId } }
        });
        if (Number(stock?.quantity || 0) < Number(quantity)) {
            throw new Error(`Saldo insuficiente de ${product.name} neste local.`);
        }

        await consumeProduct({
            productId,
            quantity,
            establishmentId,
            reason: "OPERATIONAL_USE",
            reference: "CONSUMO OPERACIONAL SEMANAL",
            locationId: targetLocationId,
            enforceAvailableStock: true,
            movementMetadata: {
                purchaseClassification: product.purchaseClassification,
                responsibleSector: responsibleSector || product.responsibleSector || null,
                notes: notes || null,
                periodFrom: periodFrom ? new Date(periodFrom) : null,
                periodTo: periodTo ? new Date(periodTo) : null,
                recordedByUserId: userId || null
            }
        }, tx);
    });
};

// 📋 TIPOS DE LANÇAMENTO
const ENTRY_TYPES = {
    COURTESY: { reason: 'COURTESY', reference: 'CORTESIA', label: 'Cortesia' },
    DOUBLE_DRINK: { reason: 'DOUBLE_DRINK', reference: 'DRINK EM DOBRO', label: 'Drink em Dobro' },
    PROMO: { reason: 'PROMO', reference: 'PROMOÇÃO', label: 'Promoção' },
    TASTING: { reason: 'TASTING', reference: 'DEGUSTAÇÃO', label: 'Degustação' },
    OPERATIONAL_LOSS: { reason: 'OPERATIONAL_LOSS', reference: 'PERDA OPERACIONAL', label: 'Perda Operacional' },
};

// 🎯 CRIAR LANÇAMENTO (Cortesia, Drink em Dobro, Promoção, etc.)
const createEntry = async ({
    entryDate,
    productId,
    quantity,
    entryType,
    notes,
    establishmentId,
    locationId
}) => {
    const createdAt = require('../validations/stockMovementValidation').parseEntryDate(entryDate);
    const typeConfig = ENTRY_TYPES[entryType];
    if (!typeConfig) throw new Error(`Tipo de lançamento inválido: ${entryType}`);
    if (!productId) throw new Error("Produto é obrigatório");
    if (!quantity || quantity <= 0) throw new Error("Quantidade inválida");


    const product = await prisma.product.findFirst({
        where: { id: productId, establishmentId }
    });
    if (!product) throw new Error('Produto não encontrado ou acesso negado.');
    const productName = product.name;
    
    // Injeta a quantidade e o nome do produto raiz na referência para relatórios
    // Isso é essencial porque produtos de PRODUÇÃO viram ingredientes no banco
    const rootInfo = `[${quantity} ${productName.trim()}]`;

    const reference = notes
        ? `${typeConfig.reference} ${rootInfo} — ${notes}`
        : `${typeConfig.reference} ${rootInfo}`;

    return prisma.$transaction(async (tx) => {
        await consumeProduct({
            productId,
            quantity,
            establishmentId,
            reason: typeConfig.reason,
            reference,
            movementMetadata: { createdAt },
            locationId
        }, tx);
    });
};

const createBulkEntries = async ({ items, entryType, notes, establishmentId, entryDate }) => {
    const createdAt = require('../validations/stockMovementValidation').parseEntryDate(entryDate);
    const typeConfig = ENTRY_TYPES[entryType];
    if (!typeConfig) throw new Error(`Tipo de lançamento inválido: ${entryType}`);


    return prisma.$transaction(async (tx) => {
        for (const item of items) {
            const { productId, quantity, locationId } = item;
            if (!productId) throw new Error("Produto é obrigatório em todos os itens");
            if (!quantity || quantity <= 0) throw new Error("Quantidade inválida");

            const product = await tx.product.findFirst({
                where: { id: productId, establishmentId }
            });
            if (!product) throw new Error('Produto não encontrado ou acesso negado.');
            const productName = product.name;
            
            const rootInfo = `[${quantity} ${productName.trim()}]`;
            const reference = notes
                ? `${typeConfig.reference} ${rootInfo} — ${notes}`
                : `${typeConfig.reference} ${rootInfo}`;

            await consumeProduct({
                productId,
                quantity: Number(quantity),
                establishmentId,
                reason: typeConfig.reason,
                reference,
                movementMetadata: { createdAt },
                locationId
            }, tx);
        }
    }, { maxWait: 15000, timeout: 60000 });
};

// 📊 RESUMO DE LANÇAMENTOS POR TIPO
const getEntrySummary = async ({ establishmentId, dateFrom, dateTo }) => {
    const entryReasons = Object.values(ENTRY_TYPES).map(t => t.reason);

    const where = {
        establishmentId,
        type: 'OUT',
        reason: { in: entryReasons }
    };

    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const movements = await prisma.stockMovement.findMany({
        where,
        select: {
            reason: true,
            totalCost: true,
            quantity: true,
            productName: true,
            productId: true
        }
    });

    // Agrupa por tipo
    const byType = {};
    for (const r of entryReasons) {
        byType[r] = { count: 0, totalCost: 0 };
    }

    // Top produto por tipo
    const productMap = {};

    for (const m of movements) {
        if (byType[m.reason]) {
            byType[m.reason].count += 1;
            byType[m.reason].totalCost += Number(m.totalCost || 0);
        }

        const key = `${m.reason}:${m.productId}`;
        if (!productMap[key]) {
            productMap[key] = {
                reason: m.reason,
                productId: m.productId,
                productName: m.productName,
                totalQty: 0,
                totalCost: 0
            };
        }
        productMap[key].totalQty += Number(m.quantity || 0);
        productMap[key].totalCost += Number(m.totalCost || 0);
    }

    // Top produto geral
    const topProduct = Object.values(productMap)
        .sort((a, b) => b.totalCost - a.totalCost)[0] || null;

    return { byType, topProduct, totalMovements: movements.length };
};

const createBeverageOperationalUse = async ({ productId, quantity, establishmentId, locationId, userId }) => {
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) throw new Error('Quantidade inválida');
    return prisma.$transaction(async tx => {
        const product = await tx.product.findFirst({ where: { id: productId, establishmentId } });
        if (!product || product.purchaseClassification !== 'CMV_BEVERAGES' || product.trackInventory === false || product.isActive === false) {
            throw new Error('Selecione uma bebida ou ingrediente ativo com controle de estoque.');
        }
        const defaultLocation = locationId || product.defaultLocationId ? null : await tx.stockLocation.findFirst({
            where: { establishmentId, isDefault: true }
        });
        const targetLocationId = locationId || product.defaultLocationId || defaultLocation?.id;
        const location = targetLocationId && await tx.stockLocation.findFirst({ where: { id: targetLocationId, establishmentId } });
        if (!location) throw new Error('Local de estoque inválido ou acesso negado.');
        await consumeProduct({
            productId, quantity: Number(quantity), establishmentId, locationId: targetLocationId,
            reason: 'OPERATIONAL_USE', reference: 'CONSUMO OPERACIONAL',
            enforceAvailableStock: true,
            movementMetadata: { recordedByUserId: userId || null }
        }, tx);
    });
};

module.exports = {
    createBeverageOperationalUse,
    getMovements,
    createInternalUse,
    createOperationalUse,
    consumeProduct,
    addStock,
    addBonus,
    getProductCostOutsideTx,
    getProductCost,
    createEntry,
    createBulkEntries,
    getEntrySummary,
    ENTRY_TYPES
};

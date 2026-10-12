const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const portioningRecipeRepo = require('../repositories/portioningRecipeRepository');
const portioningOrderRepo = require('../repositories/portioningOrderRepository');
const stockMovementService = require('./stockMovementService');

// ─── RECIPE ─────────────────────────────────────────────────────────────

const createRecipe = async (sourceProductId, establishmentId) => {
    const existing = await portioningRecipeRepo.findBySourceProductId(sourceProductId, establishmentId);
    if (existing) {
        throw new AppError('Este produto já possui ficha de porcionamento.', 400);
    }

    const product = await prisma.product.findFirst({
        where: { id: sourceProductId, establishmentId }
    });

    if (!product) {
        throw new AppError('Produto não encontrado ou acesso negado.', 404);
    }

    return portioningRecipeRepo.create({
        sourceProductId,
        establishmentId
    });
};

const getRecipeByProduct = async (sourceProductId, establishmentId) => {
    return portioningRecipeRepo.findBySourceProductId(sourceProductId, establishmentId) || null;
};

const addRecipeItem = async (recipeId, targetProductId, costAllocationPercentage, establishmentId) => {
    const recipe = await prisma.portioningRecipe.findFirst({
        where: { id: recipeId, establishmentId }
    });
    if (!recipe) throw new AppError('Ficha não encontrada.', 404);

    return portioningRecipeRepo.addItem({
        portioningRecipeId: recipeId,
        targetProductId,
        costAllocationPercentage: Number(costAllocationPercentage || 0)
    });
};

const removeRecipeItem = async (id, establishmentId) => {
    const removed = await portioningRecipeRepo.removeItem(id, establishmentId);
    if (removed.count === 0) throw new AppError('Item não encontrado.', 404);
    return { success: true };
};

const updateRecipeItemCost = async (id, costAllocationPercentage, establishmentId) => {
    const updated = await portioningRecipeRepo.updateItemCostPercentage(id, Number(costAllocationPercentage), establishmentId);
    if (updated.count === 0) throw new AppError('Item não encontrado.', 404);
    return { success: true };
};

const updateRecipe = async (recipeId, items, establishmentId) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw new AppError('Adicione ao menos um corte resultante.', 400);
    }

    const normalizedItems = items.map(item => ({
        targetProductId: item.targetProductId,
        costAllocationPercentage: Number(item.costAllocationPercentage)
    }));

    if (normalizedItems.some(item => !item.targetProductId
        || !Number.isFinite(item.costAllocationPercentage)
        || item.costAllocationPercentage <= 0
        || item.costAllocationPercentage > 100)) {
        throw new AppError('Produto de destino ou percentual de custo inválido.', 400);
    }

    const targetIds = normalizedItems.map(item => item.targetProductId);
    if (new Set(targetIds).size !== targetIds.length) {
        throw new AppError('Um corte resultante não pode ser informado mais de uma vez.', 400);
    }

    const totalPercentage = normalizedItems.reduce(
        (total, item) => total + item.costAllocationPercentage,
        0
    );
    if (Math.abs(totalPercentage - 100) > 0.01) {
        throw new AppError(`A soma das porcentagens deve ser 100% (atual: ${totalPercentage}%).`, 400);
    }

    return prisma.$transaction(async (tx) => {
        const recipe = await tx.portioningRecipe.findFirst({
            where: { id: recipeId, establishmentId }
        });
        if (!recipe) throw new AppError('Ficha não encontrada.', 404);

        if (targetIds.includes(recipe.sourceProductId)) {
            throw new AppError('O produto de origem não pode ser também um corte resultante.', 400);
        }

        const validTargets = await tx.product.findMany({
            where: {
                id: { in: targetIds },
                establishmentId,
                isActive: true,
                type: { not: 'ASSET' }
            },
            select: { id: true }
        });
        if (validTargets.length !== targetIds.length) {
            throw new AppError('Um ou mais cortes são inválidos ou pertencem a outro estabelecimento.', 400);
        }

        await tx.portioningRecipeItem.deleteMany({
            where: { portioningRecipeId: recipeId }
        });
        await tx.portioningRecipeItem.createMany({
            data: normalizedItems.map(item => ({
                portioningRecipeId: recipeId,
                ...item
            }))
        });

        return tx.portioningRecipe.findUnique({
            where: { id: recipeId },
            include: {
                sourceProduct: true,
                items: { include: { targetProduct: true } }
            }
        });
    });
};

const deleteRecipe = async (recipeId, establishmentId) => {
    const deleted = await portioningRecipeRepo.deleteRecipe(recipeId, establishmentId);
    if (deleted.count === 0) throw new AppError('Ficha não encontrada.', 404);

    return { success: true, message: 'Ficha excluída com sucesso!' };
};

// ─── ORDER ──────────────────────────────────────────────────────────────

const createOrder = async ({ sourceProductId, sourceQuantity, sourceLotId, notes, items, establishmentId, createdBy }) => {
    if (!createdBy || !establishmentId) {
        throw new AppError('Usuário ou estabelecimento não identificado.', 403);
    }

    const qty = Number(sourceQuantity);
    if (!qty || qty <= 0) throw new AppError('Quantidade de origem inválida.', 400);

    if (!Array.isArray(items) || items.length === 0) {
        throw new AppError('Informe ao menos um corte com quantidade produzida.', 400);
    }

    const recipe = await portioningRecipeRepo.findBySourceProductId(sourceProductId, establishmentId);
    if (!recipe) throw new AppError('Ficha de porcionamento não encontrada.', 400);

    let sourceLot = null;
    if (sourceLotId) {
        sourceLot = await prisma.inventoryLot.findFirst({
            where: { id: sourceLotId, productId: sourceProductId, establishmentId }
        });
        if (!sourceLot) throw new AppError('Lote de origem não encontrado para este produto.', 400);
        if (Number(sourceLot.remainingQuantity) < qty) {
            throw new AppError('O lote selecionado não possui saldo suficiente.', 400);
        }
    }

    // items array format: [{ targetProductId, quantity, netWeightKg, costAllocationPercentage }]
    const orderItems = items.map(item => ({
        targetProductId: item.targetProductId,
        quantity: Number(item.quantity),
        netWeightKg: item.netWeightKg === undefined || item.netWeightKg === null || item.netWeightKg === ''
            ? null
            : Number(item.netWeightKg),
        costAllocationPercentage: Number(item.costAllocationPercentage)
    }));

    if (orderItems.some(item => !item.targetProductId || !item.quantity || item.quantity <= 0)) {
        throw new AppError('Os cortes devem ter produto e quantidade maior que zero.', 400);
    }

    const recipeProducts = new Map(recipe.items.map(item => [item.targetProductId, item.targetProduct]));
    if (orderItems.some(item => !recipeProducts.has(item.targetProductId))) {
        throw new AppError('Um dos cortes não pertence à ficha selecionada.', 400);
    }
    for (const item of orderItems) {
        const unit = String(recipeProducts.get(item.targetProductId)?.unit || '').trim().toLowerCase();
        const isWeightUnit = ['kg', 'quilo', 'quilos', 'quilograma', 'quilogramas'].includes(unit);
        if (isWeightUnit) item.netWeightKg = item.quantity;
        if (!isWeightUnit && (!Number.isFinite(item.netWeightKg) || item.netWeightKg <= 0)) {
            throw new AppError('Informe o peso total em kg dos cortes controlados por unidade.', 400);
        }
    }
    const totalNetWeightKg = orderItems.reduce((total, item) => total + Number(item.netWeightKg || 0), 0);
    if (String(recipe.sourceProduct.unit || '').trim().toLowerCase() === 'kg' && totalNetWeightKg > qty + 0.001) {
        throw new AppError('O peso total dos cortes não pode superar o peso de origem.', 400);
    }

    // Verifica total de porcentagem
    const totalPercentage = orderItems.reduce((acc, item) => acc + item.costAllocationPercentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01 && totalPercentage > 0) {
        // Tolerância de falha, ou exigir exatamente 100% (ou 0 se sem custo)
        // Por ora, vamos permitir < 100% caso haja perda total do custo (não recomendado, mas possível)
        // O ideal é que a soma seja ~100%
    }

    const order = await portioningOrderRepo.create({
        sourceProductId,
        sourceQuantity: qty,
        sourceLotId: sourceLot?.id || null,
        notes,
        establishmentId,
        createdBy,
        items: {
            create: orderItems
        }
    });

    return order;
};

const listOrders = async ({ establishmentId, status, page, limit }) => {
    return portioningOrderRepo.findAll({ establishmentId, status, page, limit });
};

const listLots = async ({ establishmentId, productId }) => {
    if (!productId) throw new AppError('Produto de origem não informado.', 400);
    return prisma.inventoryLot.findMany({
        where: { establishmentId, productId, remainingQuantity: { gt: 0 } },
        include: {
            supplier: { select: { id: true, name: true } },
            purchaseOrderItem: { select: { purchaseOrderId: true } }
        },
        orderBy: { receivedAt: 'asc' }
    });
};

const completeOrder = async (orderId, establishmentId) => {
    const order = await portioningOrderRepo.findById(orderId, establishmentId);
    if (!order) throw new AppError('Ordem não encontrada.', 404);
    if (order.status !== 'PENDING') {
        throw new AppError(`A ordem já está ${order.status === 'COMPLETED' ? 'concluída' : 'cancelada'}.`, 400);
    }

    const reference = `PORCIONAMENTO-${orderId.slice(0, 8).toUpperCase()}`;

    await prisma.$transaction(async (tx) => {
        const sourceQty = Number(order.sourceQuantity);

        if (order.sourceLotId) {
            const consumedLot = await tx.inventoryLot.updateMany({
                where: {
                    id: order.sourceLotId,
                    establishmentId,
                    productId: order.sourceProductId,
                    remainingQuantity: { gte: order.sourceQuantity }
                },
                data: { remainingQuantity: { decrement: order.sourceQuantity } }
            });
            if (consumedLot.count !== 1) {
                throw new AppError('O lote selecionado não possui mais saldo suficiente.', 409);
            }
        }

        // Verifica estoque origem
        const sourceProd = await tx.product.findFirst({
            where: { id: order.sourceProductId, establishmentId }
        });

        // Descobre o custo atual da matéria prima
        const unitCostRaw = await stockMovementService.getProductCost(order.sourceProductId, establishmentId, tx);
        const totalSourceCost = unitCostRaw * sourceQty;

        // Baixa na peça inteira
        await stockMovementService.consumeProduct({
            productId: order.sourceProductId,
            quantity: sourceQty,
            establishmentId,
            reason: 'PORTIONING_SOURCE',
            reference,
            preloadedCost: unitCostRaw
        }, tx);

        // Entrada nos cortes rateados
        for (const item of order.items) {
            const yieldQty = Number(item.quantity);
            if (yieldQty > 0) {
                const percentage = Number(item.costAllocationPercentage);
                const allocatedCost = (totalSourceCost * (percentage / 100));
                const yieldUnitCost = allocatedCost / yieldQty;

                await stockMovementService.addStock({
                    productId: item.targetProductId,
                    quantity: yieldQty,
                    establishmentId,
                    reason: 'PORTIONING_YIELD',
                    reference,
                    unitCost: yieldUnitCost
                }, tx);
            }
        }

        // Atualiza Status
        await tx.portioningOrder.update({
            where: { id: orderId },
            data: { status: 'COMPLETED', completedAt: new Date() }
        });
    }, {
        maxWait: 10000,
        timeout: 30000
    });

    return { success: true, message: 'Porcionamento concluído com sucesso!' };
};

const cancelOrder = async (orderId, establishmentId) => {
    const order = await portioningOrderRepo.findById(orderId, establishmentId);
    if (!order) throw new AppError('Ordem não encontrada.', 404);
    if (order.status !== 'PENDING') throw new AppError('Apenas ordens pendentes podem ser canceladas.', 400);

    await portioningOrderRepo.updateStatus(orderId, establishmentId, 'CANCELLED');
    return { success: true };
};

module.exports = {
    createRecipe,
    getRecipeByProduct,
    addRecipeItem,
    removeRecipeItem,
    updateRecipeItemCost,
    updateRecipe,
    deleteRecipe,
    createOrder,
    listOrders,
    listLots,
    completeOrder,
    cancelOrder
};

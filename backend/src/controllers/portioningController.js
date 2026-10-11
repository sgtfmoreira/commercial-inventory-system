const portioningService = require('../services/portioningService');
const asyncHandler = require('../utils/asyncHandler');

const createRecipe = asyncHandler(async (req, res) => {
    const { sourceProductId } = req.body;
    const establishmentId = req.user.establishmentId;

    const recipe = await portioningService.createRecipe(sourceProductId, establishmentId);

    res.status(201).json({
        success: true,
        data: recipe
    });
});

const getRecipeByProduct = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const establishmentId = req.user.establishmentId;

    const recipe = await portioningService.getRecipeByProduct(productId, establishmentId);

    res.status(200).json({
        success: true,
        data: recipe
    });
});

const addRecipeItem = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { targetProductId, costAllocationPercentage } = req.body;
    const establishmentId = req.user.establishmentId;

    const item = await portioningService.addRecipeItem(id, targetProductId, costAllocationPercentage, establishmentId);

    res.status(201).json({
        success: true,
        data: item
    });
});

const removeRecipeItem = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const establishmentId = req.user.establishmentId;

    await portioningService.removeRecipeItem(itemId, establishmentId);

    res.status(200).json({
        success: true,
        message: 'Item removido com sucesso.'
    });
});

const updateRecipeItemCost = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { costAllocationPercentage } = req.body;
    const establishmentId = req.user.establishmentId;

    await portioningService.updateRecipeItemCost(itemId, costAllocationPercentage, establishmentId);

    res.status(200).json({
        success: true,
        message: 'Custo atualizado com sucesso.'
    });
});

const updateRecipe = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { items } = req.body;
    const establishmentId = req.user.establishmentId;

    const recipe = await portioningService.updateRecipe(id, items, establishmentId);

    res.status(200).json({
        success: true,
        data: recipe
    });
});

const deleteRecipe = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const establishmentId = req.user.establishmentId;

    const result = await portioningService.deleteRecipe(id, establishmentId);
    res.status(200).json(result);
});

const createOrder = asyncHandler(async (req, res) => {
    const establishmentId = req.user.establishmentId;
    const createdBy = req.user.userId;

    const order = await portioningService.createOrder({
        ...req.body,
        establishmentId,
        createdBy
    });

    res.status(201).json({
        success: true,
        data: order
    });
});

const listOrders = asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    const establishmentId = req.user.establishmentId;

    const orders = await portioningService.listOrders({
        establishmentId,
        status,
        page,
        limit
    });

    res.status(200).json({
        success: true,
        ...orders
    });
});

const completeOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const establishmentId = req.user.establishmentId;

    const result = await portioningService.completeOrder(id, establishmentId);

    res.status(200).json(result);
});

const cancelOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const establishmentId = req.user.establishmentId;

    const result = await portioningService.cancelOrder(id, establishmentId);

    res.status(200).json(result);
});

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
    completeOrder,
    cancelOrder
};

const express = require('express');
const router = express.Router();
const portioningController = require('../controllers/portioningController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

// Receitas de Porcionamento
router.post('/recipes', portioningController.createRecipe);
router.get('/recipes/product/:productId', portioningController.getRecipeByProduct);
router.put('/recipes/:id', portioningController.updateRecipe);
router.delete('/recipes/:id', portioningController.deleteRecipe);
router.post('/recipes/:id/items', portioningController.addRecipeItem);
router.delete('/recipes/items/:itemId', portioningController.removeRecipeItem);
router.patch('/recipes/items/:itemId/cost', portioningController.updateRecipeItemCost);

// Ordens de Porcionamento
router.post('/orders', portioningController.createOrder);
router.get('/orders', portioningController.listOrders);
router.get('/lots', portioningController.listLots);
router.patch('/orders/:id/complete', portioningController.completeOrder);
router.patch('/orders/:id/cancel', portioningController.cancelOrder);

module.exports = router;

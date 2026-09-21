const { Router } = require('express');
const controller = require('../controllers/stockMovementController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const Roles = require('../constants/roles');
const validate = require('../middlewares/validate');
const { operationalUseSchema, beverageOperationalUseSchema } = require('../validations/operationalUseValidation');
console.log('ROLES DEBUG:', Roles);

const router = Router();

const returns = require('../services/purchaseReturnService');
const asyncHandler = require('../utils/asyncHandler');
const { z } = require('zod');
const { purchaseReturnSchema } = require('../validations/purchaseReturnValidation');
router.get('/return-receipts', authMiddleware, requireRole(['ADMIN']), asyncHandler(async (req, res) => {
    const product = z.string().uuid().safeParse(req.query.productId);
    if (!product.success) return res.status(422).json({ success: false, message: 'Selecione um produto válido.' });
    res.json({ success: true, data: await returns.listReceipts(req.user.establishmentId, product.data) });
}));
router.get('/supplier-returns', authMiddleware, requireRole(['ADMIN']), asyncHandler(async (req, res) => {
    res.json({ success: true, data: await returns.listReturns(req.user.establishmentId) });
}));
router.post('/supplier-returns', authMiddleware, requireRole(['ADMIN']), validate(purchaseReturnSchema), asyncHandler(async (req, res) => {
    const data = await returns.createReturn({ ...req.body, establishmentId: req.user.establishmentId, userId: req.user.userId || req.user.id });
    res.status(201).json({ success: true, data });
}));

router.post(
    '/beverage-operational-use',
    authMiddleware,
    requireRole(['ADMIN']),
    validate(beverageOperationalUseSchema),
    controller.createBeverageOperationalUse
);

// 🔍 LISTAR MOVIMENTAÇÕES → ADMIN ONLY
router.get(
    '/',
    authMiddleware,
    requireRole(['ADMIN']),
    controller.getAll
);

// 🔥 CONSUMO INTERNO → ADMIN ONLY
router.post(
    '/internal-use',
    authMiddleware,
    requireRole(['ADMIN']),
    controller.createInternalUse
);

// 🍹 CONSUMO OPERACIONAL → ADMIN ONLY
router.post(
    '/operational-use',
    authMiddleware,
    requireRole(['ADMIN']),
    validate(operationalUseSchema),
    controller.createOperationalUse
);

// 🔥 BONUS → ADMIN ONLY (CRÍTICO)
router.post(
    '/bonus',
    authMiddleware,
    requireRole(['ADMIN']),
    controller.addBonus
);

module.exports = router;

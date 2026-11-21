const { Router } = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const controller = require('../controllers/billingController');

const router = Router();

router.get('/summary', authMiddleware, requireRole(['ADMIN']), controller.getSummary);
router.post('/checkout', authMiddleware, requireRole(['ADMIN']), controller.createCheckout);
router.post('/portal', authMiddleware, requireRole(['ADMIN']), controller.createPortal);
router.post('/sync-quantity', authMiddleware, requireRole(['ADMIN']), controller.syncQuantity);

module.exports = router;

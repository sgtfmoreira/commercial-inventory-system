const { Router } = require('express');
const controller = require('../controllers/commercialAgreementController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');

const router = Router();
router.use(authMiddleware);
router.get('/', controller.list);
router.get('/summary', controller.summary);
router.post('/', requireRole(['ADMIN']), controller.create);
router.put('/:id', requireRole(['ADMIN']), controller.update);
router.delete('/:id', requireRole(['ADMIN']), controller.remove);
router.post('/bonus-receipts', requireRole(['ADMIN', 'STOCK_COUNTER']), controller.receiveBonus);
router.post('/cashback-settlements', requireRole(['ADMIN']), controller.receiveCashback);
router.post('/cashback-settlements/:id/cancel', requireRole(['ADMIN']), controller.cancelCashbackSettlement);

module.exports = router;

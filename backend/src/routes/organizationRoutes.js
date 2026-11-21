const { Router } = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const controller = require('../controllers/organizationController');

const router = Router();

router.get('/current', authMiddleware, controller.getCurrent);
router.put('/current', authMiddleware, requireRole(['ADMIN']), controller.updateCurrent);

module.exports = router;

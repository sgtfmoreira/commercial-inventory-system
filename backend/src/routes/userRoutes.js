const { Router } = require('express');
const controller = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');

const router = Router();

// 🔥 só ADMIN pode criar usuário
router.post(
    '/',
    authMiddleware,
    requireRole(['ADMIN']),
    controller.create
);

router.get(
    '/',
    authMiddleware,
    requireRole(['ADMIN']),
    controller.list
);

router.put(
    '/:id',
    authMiddleware,
    requireRole(['ADMIN']),
    controller.update
);

router.delete(
    '/:id',
    authMiddleware,
    requireRole(['ADMIN']),
    controller.remove
);

module.exports = router;

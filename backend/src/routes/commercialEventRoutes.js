const { Router } = require('express');
const controller = require('../controllers/commercialEventController');
const auth = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');
const schemas = require('../validations/eventValidation');

const router = Router();
router.use(auth, requireRole(['ADMIN', 'MANAGER']));
router.get('/', controller.list);
router.post('/', validate(schemas.createCommercialEventSchema), controller.create);
router.get('/catalog-items', controller.catalog);
router.get('/responsible-users', controller.listResponsibleUsers);
router.get('/:id/budgets', controller.listBudgets);
router.get('/:id', controller.getById);
router.patch('/:id', validate(schemas.updateCommercialEventSchema), controller.update);
router.post('/:id/cancel', controller.cancel);
module.exports = router;

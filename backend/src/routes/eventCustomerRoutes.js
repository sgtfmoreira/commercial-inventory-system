const { Router } = require('express');
const controller = require('../controllers/eventCustomerController');
const auth = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');
const schemas = require('../validations/eventValidation');

const router = Router();
router.use(auth, requireRole(['ADMIN', 'MANAGER']));
router.get('/', controller.list);
router.post('/', validate(schemas.createEventCustomerSchema), controller.create);
router.get('/:id', controller.getById);
router.patch('/:id', validate(schemas.updateEventCustomerSchema), controller.update);
module.exports = router;

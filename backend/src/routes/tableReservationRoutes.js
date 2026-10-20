const { Router } = require('express');
const controller = require('../controllers/tableReservationController');
const auth = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const validate = require('../middlewares/validate');
const schemas = require('../validations/tableReservationValidation');

const router = Router();
router.use(auth, requireRole(['ADMIN', 'MANAGER']));
router.get('/', controller.list);
router.post('/', validate(schemas.createTableReservationSchema), controller.create);
router.post('/import/preview', validate(schemas.importTableReservationsSchema), controller.previewImport);
router.post('/import', validate(schemas.importTableReservationsSchema), controller.importReservations);
router.patch('/:id', validate(schemas.updateTableReservationSchema), controller.update);
router.post('/:id/cancel', validate(schemas.cancelTableReservationSchema), controller.cancel);

module.exports = router;

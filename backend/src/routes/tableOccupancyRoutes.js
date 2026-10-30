const { Router } = require('express');
const controller = require('../controllers/tableOccupancyController');
const auth = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/requireRole');
const requireEstablishment = require('../middlewares/requireEstablishment');
const validate = require('../middlewares/validate');
const schemas = require('../validations/tableOccupancyValidation');
const ESTABLISHMENTS = require('../constants/establishments');

const router = Router();
router.use(auth, requireRole(['ADMIN', 'MANAGER']), requireEstablishment([ESTABLISHMENTS.COMMERCIAL]));
router.get('/', controller.list);
router.post('/', validate(schemas.createTableOccupancySchema), controller.create);
router.post('/batch', validate(schemas.createBatchTableOccupanciesSchema), controller.createBatch);
router.post('/:id/release', validate(schemas.releaseTableOccupancySchema), controller.release);

module.exports = router;

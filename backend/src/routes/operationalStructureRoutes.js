const { Router } = require('express');
const auth = require('../middlewares/authMiddleware');
const requireCapability = require('../middlewares/requireCapability');
const validate = require('../middlewares/validate');
const validateQuery = require('../middlewares/validateQuery');
const validateParams = require('../middlewares/validateParams');
const controller = require('../controllers/operationalStructureController');
const schemas = require('../validations/operationalStructureValidation');

const router = Router();
const legacyManagers = ['ADMIN', 'MANAGER'];
const canRead = requireCapability('operational_structure.read', { legacyRoles: legacyManagers });
const canManageSectors = requireCapability('operational_sectors.manage', { legacyRoles: legacyManagers });
const canManageRoles = requireCapability('operational_functions.manage', { legacyRoles: legacyManagers });

router.use(auth);
router.get('/capabilities', controller.capabilities);

router.get('/sectors', canRead, validateQuery(schemas.listSectorSchema), controller.listSectors);
router.post('/sectors', canManageSectors, validate(schemas.createSectorSchema), controller.createSector);
router.get('/sectors/:id', validateParams(schemas.idParamSchema), canRead, controller.getSector);
router.patch('/sectors/:id', validateParams(schemas.idParamSchema), canManageSectors, validate(schemas.updateSectorSchema), controller.updateSector);
router.patch('/sectors/:id/status', validateParams(schemas.idParamSchema), canManageSectors, validate(schemas.statusSchema), controller.setSectorStatus);

router.get('/roles', canRead, validateQuery(schemas.listRoleSchema), controller.listRoles);
router.post('/roles', canManageRoles, validate(schemas.createRoleSchema), controller.createRole);
router.get('/roles/:id', validateParams(schemas.idParamSchema), canRead, controller.getRole);
router.patch('/roles/:id', validateParams(schemas.idParamSchema), canManageRoles, validate(schemas.updateRoleSchema), controller.updateRole);
router.patch('/roles/:id/status', validateParams(schemas.idParamSchema), canManageRoles, validate(schemas.statusSchema), controller.setRoleStatus);

module.exports = router;

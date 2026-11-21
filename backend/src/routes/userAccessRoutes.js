const { Router } = require('express');
const auth = require('../middlewares/authMiddleware');
const requireCapability = require('../middlewares/requireCapability');
const validate = require('../middlewares/validate');
const validateParams = require('../middlewares/validateParams');
const controller = require('../controllers/userAccessController');
const schemas = require('../validations/userAccessValidation');

const router = Router();
const legacyAdmin = { legacyRoles: ['ADMIN'] };
const canRead = requireCapability('users.permissions.read', legacyAdmin);
const canManage = requireCapability('users.permissions.manage', legacyAdmin);
const canManageOwners = requireCapability('security.owner.manage', legacyAdmin);

router.use(auth);
router.get('/permissions', canRead, controller.listPermissions);
router.get('/profiles', canRead, controller.listProfiles);
router.get('/owners', canManageOwners, controller.listOwners);
router.post('/owners/:userId', validateParams(schemas.userIdParamSchema), canManageOwners, validate(schemas.ownerDesignationSchema), controller.designateOwner);
router.delete('/owners/:userId', validateParams(schemas.userIdParamSchema), canManageOwners, validate(schemas.ownerRevocationSchema), controller.revokeOwner);
router.post('/owners/:userId/transfer', validateParams(schemas.userIdParamSchema), canManageOwners, validate(schemas.ownerTransferSchema), controller.transferOwnership);
router.get('/users/:userId', validateParams(schemas.userIdParamSchema), canRead, controller.getAccess);
router.get('/users/:userId/preview', validateParams(schemas.userIdParamSchema), canRead, controller.preview);
router.get('/users/:userId/history', validateParams(schemas.userIdParamSchema), canRead, controller.history);
router.put('/users/:userId/draft', validateParams(schemas.userIdParamSchema), canManage, validate(schemas.draftSchema), controller.saveDraft);
router.post('/users/:userId/activate', validateParams(schemas.userIdParamSchema), canManage, validate(schemas.activateSchema), controller.activate);
router.post('/users/:userId/rollback', validateParams(schemas.userIdParamSchema), canManage, validate(schemas.rollbackSchema), controller.rollback);

module.exports = router;

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const service = require('../services/userAccessConfigurationService');
const authorityService = require('../services/organizationAuthorityService');
const { PERMISSIONS, CATALOG_VERSION } = require('../constants/permissions');
const { PROFILES_V1, PROFILE_VERSION } = require('../constants/accessProfiles');

function context(req) {
    if (!req.user?.membershipId || !req.user?.establishmentId || !req.user?.organizationId) {
        throw new AppError('Contexto de organização e estabelecimento inválido.', 403);
    }
    return {
        userId: req.user.userId,
        membershipId: req.user.membershipId,
        establishmentId: req.user.establishmentId,
        organizationId: req.user.organizationId
    };
}

function authorityContext(req) {
    const accessContext = context(req);
    return {
        organizationId: accessContext.organizationId,
        establishmentId: accessContext.establishmentId,
        actorUserId: accessContext.userId,
        actorMembershipId: accessContext.membershipId
    };
}

const listPermissions = asyncHandler(async (_req, res) => {
    res.json({ version: CATALOG_VERSION, permissions: Object.values(PERMISSIONS) });
});

const listProfiles = asyncHandler(async (_req, res) => {
    res.json({ version: PROFILE_VERSION, profiles: Object.values(PROFILES_V1) });
});

const getAccess = asyncHandler(async (req, res) => {
    res.json(await service.getAccess(context(req), req.params.userId));
});

const saveDraft = asyncHandler(async (req, res) => {
    res.json(await service.saveDraft(context(req), req.params.userId, req.body));
});

const preview = asyncHandler(async (req, res) => {
    res.json(await service.preview(context(req), req.params.userId));
});

const activate = asyncHandler(async (req, res) => {
    res.json(await service.activate(context(req), req.params.userId, req.body));
});

const rollback = asyncHandler(async (req, res) => {
    res.json(await service.rollback(context(req), req.params.userId, req.body));
});

const history = asyncHandler(async (req, res) => {
    res.json({ events: await service.history(context(req), req.params.userId) });
});

const listOwners = asyncHandler(async (req, res) => {
    res.json({ owners: await authorityService.listOwners(authorityContext(req)) });
});

const designateOwner = asyncHandler(async (req, res) => {
    const authority = await authorityService.designateOwner(authorityContext(req), {
        targetUserId: req.params.userId,
        verificationMethod: req.body.verificationMethod
    });
    res.status(201).json(authority);
});

const revokeOwner = asyncHandler(async (req, res) => {
    res.json(await authorityService.revokeOwner(authorityContext(req), {
        targetUserId: req.params.userId,
        reason: req.body.reason
    }));
});

const transferOwnership = asyncHandler(async (req, res) => {
    res.json(await authorityService.transferOwnership(authorityContext(req), {
        targetUserId: req.params.userId,
        verificationMethod: req.body.verificationMethod,
        reason: req.body.reason
    }));
});

module.exports = {
    listPermissions,
    listProfiles,
    getAccess,
    saveDraft,
    preview,
    activate,
    rollback,
    history,
    listOwners,
    designateOwner,
    revokeOwner,
    transferOwnership
};

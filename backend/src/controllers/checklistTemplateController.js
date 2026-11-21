const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const service = require('../services/checklistTemplateService');

function context(req) {
    if (!req.user?.userId || !req.user?.membershipId || !req.user?.establishmentId || !req.user?.organizationId) {
        throw new AppError('Contexto de organização e estabelecimento inválido.', 403);
    }
    return {
        userId: req.user.userId,
        membershipId: req.user.membershipId,
        establishmentId: req.user.establishmentId,
        organizationId: req.user.organizationId,
        role: req.user.role,
        membershipActive: req.user.membershipActive,
        establishmentActive: req.user.establishmentActive
    };
}

const getCapabilities = asyncHandler(async (req, res) => {
    res.json({ capabilities: await service.capabilities(context(req)) });
});
const list = asyncHandler(async (req, res) => res.json({ templates: await service.list(context(req)) }));
const get = asyncHandler(async (req, res) => res.json(await service.get(context(req), req.params.templateId)));
const create = asyncHandler(async (req, res) => res.status(201).json(await service.create(context(req), req.body)));
const saveDraft = asyncHandler(async (req, res) => res.json(await service.saveDraft(context(req), req.params.templateId, req.body)));
const publish = asyncHandler(async (req, res) => res.json(await service.publish(context(req), req.params.templateId, req.body)));
const cloneVersion = asyncHandler(async (req, res) => res.status(201).json(await service.cloneVersion(context(req), req.params.templateId, req.body)));
const retire = asyncHandler(async (req, res) => res.json(await service.retire(context(req), req.params.templateId, req.params.versionId, req.body)));

module.exports = { getCapabilities, list, get, create, saveDraft, publish, cloneVersion, retire };

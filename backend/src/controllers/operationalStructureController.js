const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const service = require('../services/operationalStructureService');

function context(req) {
    if (!req.user?.userId || !req.user?.membershipId || !req.user?.organizationId || !req.user?.establishmentId) {
        throw new AppError('Contexto organizacional inválido.', 403);
    }
    return {
        userId: req.user.userId, membershipId: req.user.membershipId,
        organizationId: req.user.organizationId, establishmentId: req.user.establishmentId,
        role: req.user.role, membershipActive: req.user.membershipActive,
        establishmentActive: req.user.establishmentActive
    };
}

const capabilities = asyncHandler(async (req, res) => res.json({ capabilities: await service.capabilities(context(req)) }));
const listSectors = asyncHandler(async (req, res) => res.json({ sectors: await service.listSectors(context(req), req.query) }));
const getSector = asyncHandler(async (req, res) => res.json(await service.getSector(context(req), req.params.id)));
const createSector = asyncHandler(async (req, res) => res.status(201).json(await service.createSector(context(req), req.body)));
const updateSector = asyncHandler(async (req, res) => res.json(await service.updateSector(context(req), req.params.id, req.body)));
const setSectorStatus = asyncHandler(async (req, res) => res.json(await service.setSectorStatus(context(req), req.params.id, req.body)));
const listRoles = asyncHandler(async (req, res) => res.json({ roles: await service.listRoles(context(req), req.query) }));
const getRole = asyncHandler(async (req, res) => res.json(await service.getRole(context(req), req.params.id)));
const createRole = asyncHandler(async (req, res) => res.status(201).json(await service.createRole(context(req), req.body)));
const updateRole = asyncHandler(async (req, res) => res.json(await service.updateRole(context(req), req.params.id, req.body)));
const setRoleStatus = asyncHandler(async (req, res) => res.json(await service.setRoleStatus(context(req), req.params.id, req.body)));

module.exports = {
    context, capabilities,
    listSectors, getSector, createSector, updateSector, setSectorStatus,
    listRoles, getRole, createRole, updateRole, setRoleStatus
};

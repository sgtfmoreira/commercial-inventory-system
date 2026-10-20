const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/tableOccupancyService');

const list = asyncHandler(async (req, res) => res.json({
    success: true, data: await service.list(req.user.establishmentId)
}));
const create = asyncHandler(async (req, res) => res.status(201).json({
    success: true, data: await service.create(req.body, req.user.establishmentId, req.user.userId)
}));
const release = asyncHandler(async (req, res) => res.json({
    success: true, data: await service.release(req.params.id, req.body.version, req.user.establishmentId, req.user.userId)
}));

module.exports = { list, create, release };

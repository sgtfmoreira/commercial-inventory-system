const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/tableOccupancyService');
const schemas = require('../validations/tableOccupancyValidation');

const parseQuery = (schema, req, res) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ success: false, message: parsed.error.issues[0].message });
        return null;
    }
    return parsed.data;
};

const list = asyncHandler(async (req, res) => res.json({
    success: true, data: await service.list(req.user.establishmentId)
}));
const metrics = asyncHandler(async (req, res) => {
    const query = parseQuery(schemas.tableOccupancyMetricsQuerySchema, req, res);
    if (query) res.json({ success: true, data: await service.metrics(req.user.establishmentId, query) });
});
const create = asyncHandler(async (req, res) => res.status(201).json({
    success: true, data: await service.create(req.body, req.user.establishmentId, req.user.userId)
}));
const createBatch = asyncHandler(async (req, res) => res.status(201).json({
    success: true, data: await service.createBatch(req.body, req.user.establishmentId, req.user.userId)
}));
const release = asyncHandler(async (req, res) => res.json({
    success: true, data: await service.release(req.params.id, req.body.version, req.user.establishmentId, req.user.userId)
}));

module.exports = { list, metrics, create, createBatch, release };

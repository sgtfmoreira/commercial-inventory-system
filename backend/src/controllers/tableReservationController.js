const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/tableReservationService');
const schemas = require('../validations/tableReservationValidation');

const parseQuery = (schema, req, res) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({ success: false, message: parsed.error.issues[0].message });
        return null;
    }
    return parsed.data;
};

const list = asyncHandler(async (req, res) => {
    const query = parseQuery(schemas.listTableReservationsQuerySchema, req, res);
    if (query) res.json({ success: true, data: await service.list(req.user.establishmentId, query) });
});
const create = asyncHandler(async (req, res) => res.status(201).json({
    success: true, data: await service.create(req.body, req.user.establishmentId, req.user.userId)
}));
const update = asyncHandler(async (req, res) => res.json({
    success: true, data: await service.update(req.params.id, req.body, req.user.establishmentId, req.user.userId)
}));
const cancel = asyncHandler(async (req, res) => res.json({
    success: true, data: await service.cancel(req.params.id, req.body.version, req.user.establishmentId, req.user.userId)
}));
const previewImport = asyncHandler(async (req, res) => res.json({
    success: true, data: await service.previewImport(req.body.reservations, req.user.establishmentId)
}));
const importReservations = asyncHandler(async (req, res) => res.status(201).json({
    success: true, data: await service.importReservations(req.body.reservations, req.user.establishmentId, req.user.userId)
}));

module.exports = { list, create, update, cancel, previewImport, importReservations };

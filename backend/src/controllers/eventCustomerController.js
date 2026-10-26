const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/eventCustomerService');
const { listEventCustomersQuerySchema } = require('../validations/eventValidation');

const parseQuery = (schema, req, res) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
        res.status(422).json({ success: false, message: 'Filtros inválidos.', errors: parsed.error.flatten().fieldErrors });
        return null;
    }
    return parsed.data;
};

const list = asyncHandler(async (req, res) => {
    const filters = parseQuery(listEventCustomersQuerySchema, req, res);
    if (filters) res.json({ success: true, data: await service.list(req.user.establishmentId, filters) });
});
const getById = asyncHandler(async (req, res) => res.json({ success: true, data: await service.getById(req.params.id, req.user.establishmentId) }));
const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.create(req.body, req.user.establishmentId) }));
const update = asyncHandler(async (req, res) => res.json({ success: true, data: await service.update(req.params.id, req.body, req.user.establishmentId) }));

module.exports = { list, getById, create, update, parseQuery };

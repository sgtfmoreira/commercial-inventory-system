const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/commercialEventService');
const { listCommercialEventsQuerySchema } = require('../validations/eventValidation');
const { eventCatalogQuerySchema } = require('../validations/eventValidation');
const eventCatalogService = require('../services/eventCatalogService');
const { parseQuery } = require('./eventCustomerController');

const list = asyncHandler(async (req, res) => {
    const filters = parseQuery(listCommercialEventsQuerySchema, req, res);
    if (filters) res.json({ success: true, data: await service.list(req.user.establishmentId, filters) });
});
const getById = asyncHandler(async (req, res) => res.json({ success: true, data: await service.getById(req.params.id, req.user.establishmentId) }));
const listBudgets = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listBudgets(req.params.id, req.user.establishmentId) }));
const listResponsibleUsers = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listResponsibleUsers(req.user.establishmentId) }));
const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.create(req.body, req.user.establishmentId, req.user.userId) }));
const update = asyncHandler(async (req, res) => res.json({ success: true, data: await service.update(req.params.id, req.body, req.user.establishmentId) }));
const cancel = asyncHandler(async (req, res) => res.json({ success: true, data: await service.cancel(req.params.id, req.user.establishmentId, req.user.userId) }));
const catalog = asyncHandler(async(req,res)=>{const filters=parseQuery(eventCatalogQuerySchema,req,res);if(filters)res.json({success:true,data:await eventCatalogService.list(req.user.establishmentId,filters)});});

module.exports = { list, getById, listBudgets, listResponsibleUsers, create, update, cancel, catalog };

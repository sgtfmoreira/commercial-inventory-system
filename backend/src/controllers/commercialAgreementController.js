const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/commercialAgreementService');

const list = asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.listAgreements(req.user.establishmentId) });
});

const create = asyncHandler(async (req, res) => {
    const data = await service.createAgreement({
        ...req.body,
        establishmentId: req.user.establishmentId,
        createdByUserId: req.user.userId
    });
    res.status(201).json({ success: true, data });
});

const update = asyncHandler(async (req, res) => {
    const data = await service.updateAgreement({
        ...req.body,
        id: req.params.id,
        establishmentId: req.user.establishmentId
    });
    res.json({ success: true, data });
});

const remove = asyncHandler(async (req, res) => {
    await service.deleteAgreement({ id: req.params.id, establishmentId: req.user.establishmentId });
    res.json({ success: true, message: 'Acordo comercial excluído.' });
});

const receiveBonus = asyncHandler(async (req, res) => {
    const data = await service.receiveBonus({
        ...req.body,
        establishmentId: req.user.establishmentId,
        userId: req.user.userId
    });
    res.status(201).json({ success: true, data });
});

const receiveCashback = asyncHandler(async (req, res) => {
    const data = await service.receiveCashback({
        ...req.body,
        establishmentId: req.user.establishmentId,
        userId: req.user.userId
    });
    res.status(201).json({ success: true, data });
});

const cancelCashbackSettlement = asyncHandler(async (req, res) => {
    const data = await service.cancelCashbackSettlement({
        settlementId: req.params.id,
        establishmentId: req.user.establishmentId,
        userId: req.user.userId
    });
    res.json({ success: true, data });
});

const summary = asyncHandler(async (req, res) => {
    const data = await service.getSummary(req.user.establishmentId, req.query.dateFrom, req.query.dateTo);
    res.json({ success: true, data });
});

module.exports = {
    list,
    create,
    update,
    remove,
    receiveBonus,
    receiveCashback,
    cancelCashbackSettlement,
    summary
};

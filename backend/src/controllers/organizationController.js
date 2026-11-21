const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const billingService = require('../services/organizationBillingService');

const getCurrent = asyncHandler(async (req, res) => {
    const organizationId = await billingService.getOrganizationId(req.user.establishmentId);
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, createdAt: true }
    });
    if (!organization) throw new AppError('Organização não encontrada.', 404);
    res.json({ success: true, data: organization });
});

const updateCurrent = asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new AppError('Nome da organização é obrigatório.', 400);
    const organizationId = await billingService.getOrganizationId(req.user.establishmentId);
    const organization = await prisma.organization.update({
        where: { id: organizationId },
        data: { name },
        select: { id: true, name: true, createdAt: true }
    });
    res.json({ success: true, data: organization });
});

module.exports = { getCurrent, updateCurrent };

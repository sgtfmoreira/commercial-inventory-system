const prisma = require('../utils/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const billingService = require('../services/organizationBillingService');
const stripeBillingService = require('../services/stripeBillingService');

const DEFAULT_CATEGORIES = [
    'Bebidas', 'Alimentos', 'Proteínas', 'Hortifruti',
    'Embalagens', 'Limpeza', 'Outros'
];
async function syncBillingAfterUnitChange(establishmentId) {
    try {
        return await stripeBillingService.syncQuantity(establishmentId);
    } catch (error) {
        console.error('[STRIPE QUANTITY SYNC]', error.message);
        return { status: 'PENDING' };
    }
}

const getAll = asyncHandler(async (req, res) => {
    const current = await prisma.establishments.findFirst({
        where: { id: req.user.establishmentId, isActive: true },
        select: { id: true, organizationId: true }
    });
    if (!current) throw new AppError('Estabelecimento não encontrado.', 404);

    const establishments = await prisma.establishments.findMany({
        where: current.organizationId
            ? { organizationId: current.organizationId, isActive: true }
            : { id: current.id, isActive: true },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
    });
    res.json({ success: true, data: establishments });
});

const update = asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new AppError('Nome é obrigatório.', 400);

    const current = await prisma.establishments.findFirst({
        where: { id: req.user.establishmentId, isActive: true }
    });
    if (!current) throw new AppError('Estabelecimento logado não encontrado.', 404);

    const target = await prisma.establishments.findFirst({
        where: { id: req.params.id, organizationId: current.organizationId, isActive: true }
    });
    if (!target) throw new AppError('Você não pode editar este estabelecimento.', 403);

    const updated = await prisma.establishments.update({
        where: { id: target.id },
        data: { name }
    });
    res.json({ success: true, data: updated });
});

const create = asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new AppError('Nome é obrigatório.', 400);

    const currentEstablishmentId = req.user.establishmentId;
    const result = await prisma.$transaction(async tx => {
        const current = await tx.establishments.findFirst({
            where: { id: currentEstablishmentId, isActive: true }
        });
        if (!current) throw new AppError('Estabelecimento atual não encontrado.', 404);

        let organizationId = current.organizationId;
        if (!organizationId) {
            const organization = await tx.organization.create({
                data: { name: `Organização ${current.name}` }
            });
            organizationId = organization.id;
            await tx.establishments.update({
                where: { id: current.id },
                data: { organizationId }
            });
        }
        await billingService.ensureSubscription(organizationId, tx, 'LEGACY');

        const establishment = await tx.establishments.create({
            data: { name, organizationId }
        });
        await tx.category.createMany({
            data: DEFAULT_CATEGORIES.map(categoryName => ({
                name: categoryName,
                establishmentId: establishment.id
            }))
        });

        const initialAdmin = await tx.userEstablishment.create({
            data: {
                userId: req.user.userId,
                establishmentId: establishment.id,
                role: 'ADMIN',
                isActive: true
            }
        });
        await tx.securityAuditEvent.create({
            data: {
                organizationId,
                establishmentId: establishment.id,
                actorUserId: req.user.userId,
                actorMembershipId: req.user.membershipId,
                targetUserId: req.user.userId,
                targetMembershipId: initialAdmin.id,
                eventType: 'ESTABLISHMENT_INITIAL_ADMIN_GRANTED',
                entityType: 'UserEstablishment',
                entityId: initialAdmin.id,
                afterJson: { role: 'ADMIN', isActive: true },
                metadataJson: {
                    source: 'EXPLICIT_ESTABLISHMENT_CREATION',
                    authorizationMode: 'LEGACY'
                }
            }
        });

        const subscription = await tx.organizationSubscription.findUnique({
            where: { organizationId },
            select: { externalSubscriptionId: true }
        });
        if (subscription?.externalSubscriptionId) {
            await tx.organizationSubscription.update({
                where: { organizationId },
                data: { quantitySyncPending: true }
            });
        }
        return {
            establishment,
            shouldSyncBilling: Boolean(subscription?.externalSubscriptionId)
        };
    });

    const billingSync = result.shouldSyncBilling
        ? await syncBillingAfterUnitChange(currentEstablishmentId)
        : { status: 'NOT_APPLICABLE' };
    res.status(201).json({ success: true, data: result.establishment, billingSync });
});

async function archiveBlockers(establishmentId, db = prisma) {
    const [positiveProducts, positiveLocationStocks, pendingOrders, pendingTransfers, openAudits, activeOccupancies] =
        await Promise.all([
            db.product.count({ where: { establishmentId, isActive: true, quantity: { gt: 0 } } }),
            db.productStock.count({
                where: { quantity: { gt: 0 }, location: { establishmentId } }
            }),
            db.purchaseOrder.count({ where: { establishmentId, status: 'pending' } }),
            db.stockTransfer.count({
                where: {
                    status: 'PENDING',
                    OR: [{ fromEstablishmentId: establishmentId }, { toEstablishmentId: establishmentId }]
                }
            }),
            db.stockAudit.count({ where: { establishmentId, status: 'OPEN' } }),
            db.tableOccupancy.count({ where: { establishmentId, status: 'ACTIVE' } })
        ]);

    return {
        positiveProducts,
        positiveLocationStocks,
        pendingOrders,
        pendingTransfers,
        openAudits,
        activeOccupancies
    };
}

const archive = asyncHandler(async (req, res) => {
    const targetId = req.params.id;
    if (targetId === req.user.establishmentId) {
        throw new AppError('Troque de unidade antes de desativar o estabelecimento atual.', 409);
    }

    const current = await prisma.establishments.findFirst({
        where: { id: req.user.establishmentId, isActive: true },
        select: { organizationId: true }
    });
    if (!current?.organizationId) throw new AppError('Organização não encontrada.', 404);

    const target = await prisma.establishments.findFirst({
        where: { id: targetId, organizationId: current.organizationId, isActive: true }
    });
    if (!target) throw new AppError('Estabelecimento ativo não encontrado na organização.', 404);

    const activeCount = await prisma.establishments.count({
        where: { organizationId: current.organizationId, isActive: true }
    });
    if (activeCount <= 1) throw new AppError('A última unidade ativa não pode ser desativada.', 409);

    const blockers = await archiveBlockers(targetId);
    if (Object.values(blockers).some(value => value > 0)) {
        throw new AppError(`A unidade possui pendências operacionais: ${JSON.stringify(blockers)}.`, 409);
    }

    const reason = String(req.body.reason || '').trim();
    const result = await prisma.$transaction(async tx => {
        const archived = await tx.establishments.update({
            where: { id: targetId },
            data: {
                isActive: false,
                archivedAt: new Date(),
                archivedByUserId: req.user.userId,
                archiveReason: reason || null
            }
        });
        await tx.userEstablishment.updateMany({
            where: { establishmentId: targetId, isActive: true },
            data: { isActive: false }
        });
        await tx.auditLog.create({
            data: {
                actionType: 'ARCHIVE',
                entityType: 'ESTABLISHMENT',
                entityId: targetId,
                description: reason ? `Unidade desativada: ${reason}` : 'Unidade desativada.',
                establishmentId: targetId
            }
        });
        const subscription = await tx.organizationSubscription.findUnique({
            where: { organizationId: current.organizationId },
            select: { externalSubscriptionId: true }
        });
        if (subscription?.externalSubscriptionId) {
            await tx.organizationSubscription.update({
                where: { organizationId: current.organizationId },
                data: { quantitySyncPending: true }
            });
        }
        return { archived, shouldSyncBilling: Boolean(subscription?.externalSubscriptionId) };
    });

    const billingSync = result.shouldSyncBilling
        ? await syncBillingAfterUnitChange(req.user.establishmentId)
        : { status: 'NOT_APPLICABLE' };
    res.json({ success: true, data: result.archived, billingSync });
});

module.exports = { getAll, update, create, archive, archiveBlockers };

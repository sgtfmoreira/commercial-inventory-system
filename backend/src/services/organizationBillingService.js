const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const { ORGANIZATION_PLAN } = require('../constants/billing');

function calculateMonthlyPrice(establishmentCount, price = ORGANIZATION_PLAN) {
    const count = Number(establishmentCount);
    if (!Number.isInteger(count) || count < 1) {
        throw new AppError('A organização deve possuir ao menos um estabelecimento ativo.', 422);
    }

    const additionalEstablishments = Math.max(0, count - price.includedEstablishments);
    const additionalPriceCents = additionalEstablishments * price.additionalEstablishmentPriceCents;
    return {
        establishmentCount: count,
        includedEstablishments: price.includedEstablishments,
        additionalEstablishments,
        basePriceCents: price.basePriceCents,
        additionalEstablishmentPriceCents: price.additionalEstablishmentPriceCents,
        additionalPriceCents,
        monthlyTotalCents: price.basePriceCents + additionalPriceCents,
        currency: price.currency
    };
}

function subscriptionCreateData(organizationId, status = 'PENDING') {
    return {
        organizationId,
        planCode: ORGANIZATION_PLAN.code,
        status,
        currency: ORGANIZATION_PLAN.currency,
        includedEstablishments: ORGANIZATION_PLAN.includedEstablishments,
        basePriceCents: ORGANIZATION_PLAN.basePriceCents,
        additionalEstablishmentPriceCents: ORGANIZATION_PLAN.additionalEstablishmentPriceCents
    };
}

function ensureSubscription(organizationId, db = prisma, status = 'PENDING') {
    return db.organizationSubscription.upsert({
        where: { organizationId },
        create: subscriptionCreateData(organizationId, status),
        update: {}
    });
}

async function getOrganizationId(establishmentId, db = prisma) {
    const establishment = await db.establishments.findFirst({
        where: { id: establishmentId, isActive: true },
        select: { organizationId: true }
    });
    if (!establishment) throw new AppError('Estabelecimento ativo não encontrado.', 404);
    if (!establishment.organizationId) throw new AppError('Estabelecimento sem organização.', 409);
    return establishment.organizationId;
}

async function getSummary(establishmentId, db = prisma) {
    const organizationId = await getOrganizationId(establishmentId, db);
    const organization = await db.organization.findUnique({
        where: { id: organizationId },
        include: {
            subscription: true,
            establishments: {
                where: { isActive: true },
                select: { id: true, name: true, createdAt: true },
                orderBy: { createdAt: 'asc' }
            }
        }
    });
    if (!organization) throw new AppError('Organização não encontrada.', 404);

    const subscription = organization.subscription || await ensureSubscription(organizationId, db, 'LEGACY');
    return {
        organization: { id: organization.id, name: organization.name },
        plan: {
            code: subscription.planCode,
            name: ORGANIZATION_PLAN.name,
            billingInterval: ORGANIZATION_PLAN.billingInterval,
            status: subscription.status
        },
        pricing: calculateMonthlyPrice(organization.establishments.length, subscription),
        establishments: organization.establishments,
        billingPeriod: {
            startsAt: subscription.currentPeriodStartsAt,
            endsAt: subscription.currentPeriodEndsAt
        },
        quantitySyncPending: subscription.quantitySyncPending
    };
}

module.exports = {
    calculateMonthlyPrice,
    subscriptionCreateData,
    ensureSubscription,
    getOrganizationId,
    getSummary
};

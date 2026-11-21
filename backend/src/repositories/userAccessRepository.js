const prisma = require('../utils/prisma');

async function findAuthorizationContext(userEstablishmentId, db = prisma) {
    return db.userEstablishmentAccess.findUnique({
        where: { userEstablishmentId },
        include: {
            configurations: {
                where: { status: 'ACTIVE' },
                orderBy: { activatedAt: 'desc' },
                take: 1,
                include: { overrides: true }
            }
        }
    });
}

async function hasOrganizationAuthority(userId, organizationId, db = prisma) {
    if (!userId || !organizationId) return false;
    const authority = await db.organizationAuthority.findFirst({
        where: { userId, organizationId, type: 'OWNER', isActive: true },
        select: { id: true }
    });
    return Boolean(authority);
}

async function findScopedMembership({ userId, establishmentId, organizationId }, db = prisma) {
    return db.userEstablishment.findFirst({
        where: {
            userId,
            establishmentId,
            isActive: true,
            establishment: { organizationId, isActive: true }
        },
        include: {
            user: { select: { id: true, name: true, email: true } },
            establishment: { select: { id: true, name: true, organizationId: true, isActive: true } },
            access: {
                include: {
                    configurations: {
                        orderBy: { createdAt: 'desc' },
                        include: { overrides: true }
                    }
                }
            }
        }
    });
}

async function findActorMembership(membershipId, organizationId, db = prisma) {
    return db.userEstablishment.findFirst({
        where: {
            id: membershipId,
            isActive: true,
            establishment: { organizationId, isActive: true }
        },
        include: {
            establishment: { select: { organizationId: true } },
            access: {
                include: {
                    configurations: {
                        where: { status: 'ACTIVE' },
                        take: 1,
                        include: { overrides: true }
                    }
                }
            }
        }
    });
}

const withSerializableTransaction = (callback, db = prisma) => db.$transaction(
    callback,
    { isolationLevel: 'Serializable' }
);

module.exports = {
    findAuthorizationContext,
    hasOrganizationAuthority,
    findScopedMembership,
    findActorMembership,
    withSerializableTransaction
};

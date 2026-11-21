const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const auditRepository = require('../repositories/securityAuditRepository');

const SERIALIZABLE_RETRIES = 3;

async function withSerializableRetry(db, callback) {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
        try {
            return await db.$transaction(callback, { isolationLevel: 'Serializable' });
        } catch (error) {
            const retryable = error?.code === 'P2034' || error?.code === '40001';
            if (!retryable || attempt === SERIALIZABLE_RETRIES) throw error;
        }
    }
    throw new AppError('Falha serializável inesperada.', 409);
}

async function assertActiveOwner({ organizationId, userId, db }) {
    const authority = await db.organizationAuthority.findFirst({
        where: { organizationId, userId, type: 'OWNER', isActive: true }
    });
    if (!authority) throw new AppError('Autoridade organizacional insuficiente.', 403);
    return authority;
}

async function findTargetMembership({ organizationId, targetUserId, db }) {
    const membership = await db.userEstablishment.findFirst({
        where: {
            userId: targetUserId,
            isActive: true,
            establishment: { organizationId, isActive: true }
        },
        select: { id: true, establishmentId: true }
    });
    if (!membership) throw new AppError('Usuário ativo não encontrado nesta organização.', 404);
    return membership;
}

async function auditAuthority({ audit, tx, context, targetUserId, targetMembershipId, eventType, authority, beforeJson, afterJson }) {
    await audit.create({
        organizationId: context.organizationId,
        establishmentId: context.establishmentId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        targetUserId,
        targetMembershipId,
        eventType,
        entityType: 'OrganizationAuthority',
        entityId: authority.id,
        beforeJson: beforeJson || null,
        afterJson: afterJson || null,
        metadataJson: { verificationMethod: authority.verificationMethod }
    }, tx);
}

const createOrganizationAuthorityService = ({ db = prisma, audit = auditRepository } = {}) => {
    const listOwners = async context => {
        await assertActiveOwner({ organizationId: context.organizationId, userId: context.actorUserId, db });
        return db.organizationAuthority.findMany({
            where: { organizationId: context.organizationId, type: 'OWNER' },
            select: {
                id: true, userId: true, isActive: true, verifiedAt: true, verificationMethod: true,
                revokedAt: true, revocationReason: true,
                user: { select: { id: true, name: true, email: true } }
            },
            orderBy: [{ isActive: 'desc' }, { verifiedAt: 'asc' }]
        });
    };

    const designateOwner = async (context, { targetUserId, verificationMethod }) => {
        if (context.actorUserId === targetUserId) {
            throw new AppError('Não é permitido elevar a própria autoridade.', 403);
        }
        return withSerializableRetry(db, async tx => {
            await assertActiveOwner({ organizationId: context.organizationId, userId: context.actorUserId, db: tx });
            const targetMembership = await findTargetMembership({ organizationId: context.organizationId, targetUserId, db: tx });
            const previous = await tx.organizationAuthority.findUnique({
                where: { organizationId_userId_type: { organizationId: context.organizationId, userId: targetUserId, type: 'OWNER' } }
            });
            if (previous?.isActive) throw new AppError('Usuário já é Proprietário ativo.', 409);
            const authority = await tx.organizationAuthority.upsert({
                where: { organizationId_userId_type: { organizationId: context.organizationId, userId: targetUserId, type: 'OWNER' } },
                create: {
                    organizationId: context.organizationId,
                    userId: targetUserId,
                    type: 'OWNER',
                    verifiedAt: new Date(),
                    verifiedByUserId: context.actorUserId,
                    verificationMethod
                },
                update: {
                    isActive: true,
                    verifiedAt: new Date(),
                    verifiedByUserId: context.actorUserId,
                    verificationMethod,
                    revokedAt: null,
                    revokedByUserId: null,
                    revocationReason: null
                }
            });
            await auditAuthority({
                audit, tx, context, targetUserId, targetMembershipId: targetMembership.id,
                eventType: 'ORGANIZATION_OWNER_DESIGNATED', authority,
                beforeJson: previous ? { isActive: previous.isActive } : null,
                afterJson: { isActive: true, type: 'OWNER' }
            });
            return authority;
        });
    };

    const revokeOwner = async (context, { targetUserId, reason }) => {
        if (context.actorUserId === targetUserId) {
            throw new AppError('Autorrevogação não é permitida; use transferência de propriedade.', 403);
        }
        return withSerializableRetry(db, async tx => {
            await assertActiveOwner({ organizationId: context.organizationId, userId: context.actorUserId, db: tx });
            const targetMembership = await findTargetMembership({ organizationId: context.organizationId, targetUserId, db: tx });
            const current = await tx.organizationAuthority.findFirst({
                where: { organizationId: context.organizationId, userId: targetUserId, type: 'OWNER', isActive: true }
            });
            if (!current) throw new AppError('Proprietário ativo não encontrado.', 404);
            const activeCount = await tx.organizationAuthority.count({
                where: { organizationId: context.organizationId, type: 'OWNER', isActive: true }
            });
            if (activeCount <= 1) throw new AppError('O último Proprietário ativo não pode ser removido.', 409);
            const authority = await tx.organizationAuthority.update({
                where: { id: current.id },
                data: {
                    isActive: false,
                    revokedAt: new Date(),
                    revokedByUserId: context.actorUserId,
                    revocationReason: reason
                }
            });
            await auditAuthority({
                audit, tx, context, targetUserId, targetMembershipId: targetMembership.id,
                eventType: 'ORGANIZATION_OWNER_REVOKED', authority,
                beforeJson: { isActive: true }, afterJson: { isActive: false, reason }
            });
            return authority;
        });
    };

    const transferOwnership = async (context, { targetUserId, verificationMethod, reason }) => {
        if (context.actorUserId === targetUserId) throw new AppError('O destino deve ser outro usuário.', 422);
        return withSerializableRetry(db, async tx => {
            const source = await assertActiveOwner({ organizationId: context.organizationId, userId: context.actorUserId, db: tx });
            const targetMembership = await findTargetMembership({ organizationId: context.organizationId, targetUserId, db: tx });
            const previousTarget = await tx.organizationAuthority.findUnique({
                where: { organizationId_userId_type: { organizationId: context.organizationId, userId: targetUserId, type: 'OWNER' } }
            });
            const target = await tx.organizationAuthority.upsert({
                where: { organizationId_userId_type: { organizationId: context.organizationId, userId: targetUserId, type: 'OWNER' } },
                create: {
                    organizationId: context.organizationId, userId: targetUserId, type: 'OWNER',
                    verifiedAt: new Date(), verifiedByUserId: context.actorUserId, verificationMethod
                },
                update: {
                    isActive: true, verifiedAt: new Date(), verifiedByUserId: context.actorUserId,
                    verificationMethod, revokedAt: null, revokedByUserId: null, revocationReason: null
                }
            });
            const revokedSource = await tx.organizationAuthority.update({
                where: { id: source.id },
                data: {
                    isActive: false, revokedAt: new Date(), revokedByUserId: context.actorUserId,
                    revocationReason: reason
                }
            });
            await auditAuthority({
                audit, tx, context, targetUserId, targetMembershipId: targetMembership.id,
                eventType: 'ORGANIZATION_OWNERSHIP_TRANSFERRED', authority: target,
                beforeJson: { sourceOwnerId: source.userId, targetWasActive: previousTarget?.isActive || false },
                afterJson: { sourceOwnerActive: false, targetOwnerActive: true, reason }
            });
            return { source: revokedSource, target };
        });
    };

    return { listOwners, designateOwner, revokeOwner, transferOwnership };
};

module.exports = {
    ...createOrganizationAuthorityService(),
    createOrganizationAuthorityService,
    assertActiveOwner,
    findTargetMembership
};

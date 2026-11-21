const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const auditRepository = require('../repositories/securityAuditRepository');
const { PROFILE_VERSION, getProfile } = require('../constants/accessProfiles');
const { getPermission, isPermissionCode } = require('../constants/permissions');

const ALLOWED_ROLES = Object.freeze(['ADMIN', 'MANAGER', 'STAFF', 'STOCK_COUNTER']);
const MAX_ACTIVE_USERS_PER_ORGANIZATION = 10;
const SERIALIZABLE_RETRIES = 3;

const validatePassword = password => {
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
        throw new AppError('A senha deve ter entre 6 e 128 caracteres.', 400);
    }
};

const normalizeOverrides = overrides => {
    const seen = new Set();
    return (overrides || []).map(item => {
        const permissionCode = item?.permissionCode;
        const effect = item?.effect;
        const reason = item?.reason?.trim() || null;
        if (!isPermissionCode(permissionCode) || !['ALLOW', 'DENY'].includes(effect)) {
            throw new AppError('Override de permissão inválido.', 422);
        }
        if (seen.has(permissionCode)) throw new AppError('Permissão duplicada nos overrides.', 422);
        seen.add(permissionCode);
        const permission = getPermission(permissionCode);
        if (effect === 'ALLOW' && (permission.sensitive || permission.financial) && !reason) {
            throw new AppError('Concessões sensíveis ou financeiras exigem justificativa.', 422);
        }
        return { permissionCode, effect, reason };
    });
};

const normalizeAccesses = ({ accesses, establishmentIds, role }) => {
    const raw = Array.isArray(accesses)
        ? accesses
        : (establishmentIds || []).map(establishmentId => ({ establishmentId, legacyRole: role }));
    if (!raw.length) throw new AppError('Selecione ao menos um estabelecimento.', 422);

    const seen = new Set();
    return raw.map(item => {
        const establishmentId = item?.establishmentId;
        const legacyRole = item?.legacyRole || item?.role || role;
        const profileVersion = item?.profileVersion || PROFILE_VERSION;
        if (!establishmentId || seen.has(establishmentId)) {
            throw new AppError('Estabelecimentos de acesso devem ser únicos.', 422);
        }
        seen.add(establishmentId);
        if (!ALLOWED_ROLES.includes(legacyRole)) throw new AppError('Perfil LEGACY inválido.', 422);
        if (item?.profileCode && !getProfile(item.profileCode, profileVersion)) {
            throw new AppError('Perfil ou versão de perfil inválidos.', 422);
        }
        return {
            establishmentId,
            legacyRole,
            profileCode: item?.profileCode || null,
            profileVersion,
            overrides: normalizeOverrides(item?.overrides)
        };
    });
};

const isSerializationFailure = error => error?.code === 'P2034' || error?.code === '40001';

async function withSerializableRetry(db, callback) {
    let lastError;
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
        try {
            return await db.$transaction(callback, { isolationLevel: 'Serializable' });
        } catch (error) {
            lastError = error;
            if (!isSerializationFailure(error) || attempt === SERIALIZABLE_RETRIES) throw error;
        }
    }
    throw lastError;
}

async function findActorAdminMemberships(tx, actorUserId, organizationId) {
    return tx.userEstablishment.findMany({
        where: {
            userId: actorUserId,
            role: 'ADMIN',
            isActive: true,
            establishment: { organizationId, isActive: true }
        },
        select: { id: true, establishmentId: true }
    });
}

async function assertManageableAccesses(tx, { actorUserId, organizationId, accesses }) {
    if (!actorUserId || !organizationId) throw new AppError('Contexto organizacional inválido.', 403);
    const requestedIds = accesses.map(item => item.establishmentId);
    const establishments = await tx.establishments.findMany({
        where: { id: { in: requestedIds }, organizationId, isActive: true },
        select: { id: true }
    });
    if (establishments.length !== requestedIds.length) {
        throw new AppError('Um ou mais estabelecimentos não pertencem à organização ativa.', 403);
    }
    const actorMemberships = await findActorAdminMemberships(tx, actorUserId, organizationId);
    const byEstablishment = new Map(actorMemberships.map(item => [item.establishmentId, item]));
    if (requestedIds.some(id => !byEstablishment.has(id))) {
        throw new AppError('Você não pode administrar uma unidade sem acesso ADMIN ativo.', 403);
    }
    return byEstablishment;
}

async function assertOwnerProfiles(tx, organizationId, actorUserId, accesses) {
    if (!accesses.some(item => item.profileCode === 'OWNER')) return;
    const authority = await tx.organizationAuthority.findFirst({
        where: { organizationId, userId: actorUserId, type: 'OWNER', isActive: true },
        select: { id: true }
    });
    if (!authority) throw new AppError('Somente Proprietário organizacional validado pode preparar perfil OWNER.', 403);
}

async function countActiveUsers(tx, organizationId) {
    const memberships = await tx.userEstablishment.findMany({
        where: { isActive: true, establishment: { organizationId, isActive: true } },
        distinct: ['userId'],
        select: { userId: true }
    });
    return memberships.length;
}

async function assertCapacity(tx, organizationId) {
    if (await countActiveUsers(tx, organizationId) >= MAX_ACTIVE_USERS_PER_ORGANIZATION) {
        throw new AppError('A organização atingiu o limite de 10 usuários ativos.', 409);
    }
}

async function saveDraft(tx, membership, actorMembershipId, accessInput) {
    if (!accessInput.profileCode) return null;
    const access = await tx.userEstablishmentAccess.upsert({
        where: { userEstablishmentId: membership.id },
        create: { userEstablishmentId: membership.id, mode: 'LEGACY' },
        update: {},
        select: { id: true, version: true, mode: true }
    });
    const existing = await tx.accessConfiguration.findFirst({
        where: { accessId: access.id, status: 'DRAFT' },
        select: { id: true }
    });
    if (existing) {
        await tx.permissionOverride.deleteMany({ where: { configurationId: existing.id } });
    }
    const data = {
        profileCode: accessInput.profileCode,
        profileVersion: accessInput.profileVersion,
        basedOnLegacyRole: accessInput.legacyRole,
        createdByMembershipId: actorMembershipId,
        overrides: { create: accessInput.overrides }
    };
    const draft = existing
        ? await tx.accessConfiguration.update({ where: { id: existing.id }, data, include: { overrides: true } })
        : await tx.accessConfiguration.create({ data: { accessId: access.id, ...data }, include: { overrides: true } });
    await tx.userEstablishmentAccess.updateMany({
        where: { id: access.id, version: access.version },
        data: { mode: 'LEGACY', version: { increment: 1 } }
    });
    return draft;
}

async function auditMembership({ tx, audit, organizationId, actorUserId, actorMembershipId, targetUserId, membership, eventType, beforeJson, afterJson }) {
    await audit.create({
        organizationId,
        establishmentId: membership.establishmentId,
        actorUserId,
        actorMembershipId,
        targetUserId,
        targetMembershipId: membership.id,
        eventType,
        entityType: 'UserEstablishment',
        entityId: membership.id,
        beforeJson: beforeJson || null,
        afterJson: afterJson || null,
        metadataJson: { authorizationMode: 'LEGACY' }
    }, tx);
}

const createUserService = ({ db = prisma, passwordService = bcrypt, audit = auditRepository } = {}) => {
    const create = async input => {
        validatePassword(input.password);
        const normalizedName = input.name?.trim();
        const normalizedEmail = input.email?.trim().toLowerCase();
        if (!normalizedName || !normalizedEmail) throw new AppError('Nome e e-mail são obrigatórios.', 400);
        const accesses = normalizeAccesses(input);
        const hashedPassword = await passwordService.hash(input.password, 10);

        return withSerializableRetry(db, async tx => {
            const actorMemberships = await assertManageableAccesses(tx, { ...input, accesses });
            await assertOwnerProfiles(tx, input.organizationId, input.actorUserId, accesses);
            await assertCapacity(tx, input.organizationId);

            const user = await tx.users.create({
                data: { name: normalizedName, email: normalizedEmail, password: hashedPassword },
                select: { id: true, name: true, email: true }
            });
            const createdAccesses = [];
            for (const accessInput of accesses) {
                const membership = await tx.userEstablishment.create({
                    data: {
                        userId: user.id,
                        establishmentId: accessInput.establishmentId,
                        role: accessInput.legacyRole,
                        isActive: true
                    }
                });
                const actorMembershipId = actorMemberships.get(accessInput.establishmentId).id;
                const draft = await saveDraft(tx, membership, actorMembershipId, accessInput);
                await auditMembership({
                    tx, audit, organizationId: input.organizationId, actorUserId: input.actorUserId,
                    actorMembershipId, targetUserId: user.id, membership,
                    eventType: 'USER_MEMBERSHIP_CREATED',
                    afterJson: { role: membership.role, isActive: true, draftProfileCode: draft?.profileCode || null }
                });
                createdAccesses.push({
                    membershipId: membership.id,
                    establishmentId: membership.establishmentId,
                    legacyRole: membership.role,
                    mode: 'LEGACY',
                    draftProfileCode: draft?.profileCode || null
                });
            }
            return { ...user, accesses: createdAccesses };
        });
    };

    const list = async ({ actorUserId, organizationId }) => {
        const actorMemberships = await findActorAdminMemberships(db, actorUserId, organizationId);
        const establishmentIds = actorMemberships.map(item => item.establishmentId);
        if (!establishmentIds.length) throw new AppError('Nenhuma unidade administrável encontrada.', 403);
        return db.users.findMany({
            where: {
                establishments: { some: { establishmentId: { in: establishmentIds } } }
            },
            select: {
                id: true,
                name: true,
                email: true,
                establishments: {
                    where: { establishmentId: { in: establishmentIds } },
                    select: {
                        id: true, establishmentId: true, role: true, isActive: true,
                        establishment: { select: { id: true, name: true } },
                        access: {
                            select: {
                                mode: true, version: true,
                                configurations: {
                                    where: { status: { in: ['DRAFT', 'ACTIVE'] } },
                                    orderBy: { createdAt: 'desc' },
                                    include: { overrides: true }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });
    };

    const update = async (userId, input) => {
        const normalizedName = input.name?.trim();
        const normalizedEmail = input.email?.trim().toLowerCase();
        if (!normalizedName || !normalizedEmail) throw new AppError('Nome e e-mail são obrigatórios.', 400);
        if (input.password) validatePassword(input.password);
        const accesses = normalizeAccesses(input);
        const replacesAllManagedAccesses = Array.isArray(input.accesses);
        if (userId === input.actorUserId) throw new AppError('Não é permitido alterar o próprio acesso.', 403);

        return withSerializableRetry(db, async tx => {
            const actorMemberships = await findActorAdminMemberships(tx, input.actorUserId, input.organizationId);
            const manageableIds = actorMemberships.map(item => item.establishmentId);
            const synchronizedIds = replacesAllManagedAccesses
                ? manageableIds
                : accesses.map(item => item.establishmentId);
            if (!manageableIds.length) throw new AppError('Nenhuma unidade administrável encontrada.', 403);
            await assertManageableAccesses(tx, { ...input, accesses });
            await assertOwnerProfiles(tx, input.organizationId, input.actorUserId, accesses);

            const existing = await tx.userEstablishment.findMany({
                where: { userId, establishment: { organizationId: input.organizationId } },
                select: { id: true, establishmentId: true, role: true, isActive: true }
            });
            if (!existing.length) throw new AppError('Usuário não encontrado nesta organização.', 404);
            const requested = new Map(accesses.map(item => [item.establishmentId, item]));
            const currentlyActive = existing.filter(item => item.isActive);
            if (!currentlyActive.length) await assertCapacity(tx, input.organizationId);

            const targetOwner = await tx.organizationAuthority.findFirst({
                where: { organizationId: input.organizationId, userId, type: 'OWNER', isActive: true },
                select: { id: true }
            });
            const willRemainActive = existing.some(item => (
                (!synchronizedIds.includes(item.establishmentId) && item.isActive) || requested.has(item.establishmentId)
            ));
            if (targetOwner && !willRemainActive) {
                throw new AppError('Transfira ou revogue a autoridade OWNER antes de desativar todos os acessos.', 409);
            }

            for (const membership of existing) {
                const next = requested.get(membership.establishmentId);
                if (!synchronizedIds.includes(membership.establishmentId)) continue;
                if (membership.isActive && membership.role === 'ADMIN' && (!next || next.legacyRole !== 'ADMIN')) {
                    const otherAdmins = await tx.userEstablishment.count({
                        where: {
                            establishmentId: membership.establishmentId,
                            role: 'ADMIN', isActive: true, userId: { not: userId }
                        }
                    });
                    if (otherAdmins === 0) throw new AppError('Não é possível remover o último administrador ativo da unidade.', 409);
                }
            }

            const data = { name: normalizedName, email: normalizedEmail };
            if (input.password) data.password = await passwordService.hash(input.password, 10);
            const user = await tx.users.update({ where: { id: userId }, data, select: { id: true, name: true, email: true } });

            const finalAccesses = [];
            for (const accessInput of accesses) {
                const prior = existing.find(item => item.establishmentId === accessInput.establishmentId);
                const membership = prior
                    ? await tx.userEstablishment.update({
                        where: { userId_establishmentId: { userId, establishmentId: accessInput.establishmentId } },
                        data: { role: accessInput.legacyRole, isActive: true }
                    })
                    : await tx.userEstablishment.create({
                        data: { userId, establishmentId: accessInput.establishmentId, role: accessInput.legacyRole, isActive: true }
                    });
                const actorMembershipId = actorMemberships.find(item => item.establishmentId === accessInput.establishmentId).id;
                const draft = await saveDraft(tx, membership, actorMembershipId, accessInput);
                await auditMembership({
                    tx, audit, organizationId: input.organizationId, actorUserId: input.actorUserId,
                    actorMembershipId, targetUserId: userId, membership,
                    eventType: prior?.isActive ? 'USER_MEMBERSHIP_UPDATED' : 'USER_MEMBERSHIP_REACTIVATED',
                    beforeJson: prior ? { role: prior.role, isActive: prior.isActive } : null,
                    afterJson: { role: membership.role, isActive: true, draftProfileCode: draft?.profileCode || null }
                });
                finalAccesses.push({ establishmentId: membership.establishmentId, legacyRole: membership.role, mode: 'LEGACY', draftProfileCode: draft?.profileCode || null });
            }

            for (const prior of existing.filter(item => synchronizedIds.includes(item.establishmentId) && item.isActive && !requested.has(item.establishmentId))) {
                const membership = await tx.userEstablishment.update({ where: { id: prior.id }, data: { isActive: false } });
                await auditMembership({
                    tx, audit, organizationId: input.organizationId, actorUserId: input.actorUserId,
                    actorMembershipId: actorMemberships.find(item => item.establishmentId === prior.establishmentId).id,
                    targetUserId: userId, membership, eventType: 'USER_MEMBERSHIP_DEACTIVATED',
                    beforeJson: { role: prior.role, isActive: true }, afterJson: { role: prior.role, isActive: false }
                });
            }
            return { ...user, accesses: finalAccesses };
        });
    };

    const deactivate = async ({ userId, actorUserId, organizationId }) => {
        if (userId === actorUserId) throw new AppError('Você não pode excluir o próprio usuário.', 400);
        return withSerializableRetry(db, async tx => {
            const memberships = await tx.userEstablishment.findMany({
                where: { userId, isActive: true, establishment: { organizationId } },
                select: { id: true, establishmentId: true, role: true, isActive: true }
            });
            if (!memberships.length) throw new AppError('Usuário ativo não encontrado nesta organização.', 404);
            const actorMemberships = await findActorAdminMemberships(tx, actorUserId, organizationId);
            const actorByEstablishment = new Map(actorMemberships.map(item => [item.establishmentId, item]));
            if (memberships.some(item => !actorByEstablishment.has(item.establishmentId))) {
                throw new AppError('Você não pode desativar acessos de unidades que não administra.', 403);
            }
            const owner = await tx.organizationAuthority.findFirst({
                where: { organizationId, userId, type: 'OWNER', isActive: true }, select: { id: true }
            });
            if (owner) throw new AppError('Transfira ou revogue a autoridade OWNER antes de desativar o usuário.', 409);
            for (const membership of memberships.filter(item => item.role === 'ADMIN')) {
                const otherAdmins = await tx.userEstablishment.count({
                    where: { establishmentId: membership.establishmentId, role: 'ADMIN', isActive: true, userId: { not: userId } }
                });
                if (!otherAdmins) throw new AppError('Não é possível excluir o último administrador ativo da unidade.', 409);
            }
            const result = await tx.userEstablishment.updateMany({
                where: { userId, id: { in: memberships.map(item => item.id) }, isActive: true },
                data: { isActive: false }
            });
            for (const membership of memberships) {
                await auditMembership({
                    tx, audit, organizationId, actorUserId,
                    actorMembershipId: actorByEstablishment.get(membership.establishmentId).id,
                    targetUserId: userId, membership, eventType: 'USER_MEMBERSHIP_DEACTIVATED',
                    beforeJson: { role: membership.role, isActive: true }, afterJson: { role: membership.role, isActive: false }
                });
            }
            return { id: userId, revokedMemberships: result.count };
        });
    };

    return { create, list, update, deactivate };
};

module.exports = {
    ...createUserService(),
    createUserService,
    validatePassword,
    normalizeAccesses,
    MAX_ACTIVE_USERS_PER_ORGANIZATION
};

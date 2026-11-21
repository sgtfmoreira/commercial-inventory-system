const AppError = require('../utils/AppError');
const repository = require('../repositories/userAccessRepository');
const auditRepository = require('../repositories/securityAuditRepository');
const { PROFILE_CODES, PROFILE_VERSION, getProfile } = require('../constants/accessProfiles');
const {
    PERMISSION_CODES,
    INDELEGABLE_PERMISSIONS,
    getPermission,
    isPermissionCode
} = require('../constants/permissions');
const { legacyCapabilitiesForRole } = require('../constants/legacyPermissionMap');
const { applyProfile } = require('./permissionResolverService');

const asOverrides = overrides => (overrides || []).map(item => ({
    permissionCode: item.permissionCode,
    effect: item.effect,
    reason: item.reason?.trim() || null
}));

function assertConfiguration(profileCode, profileVersion, overrides) {
    if (!PROFILE_CODES.includes(profileCode) || !getProfile(profileCode, profileVersion)) {
        throw new AppError('Perfil ou versão de perfil inválidos.', 422);
    }
    const seen = new Set();
    for (const item of overrides) {
        if (!isPermissionCode(item.permissionCode) || !['ALLOW', 'DENY'].includes(item.effect)) {
            throw new AppError('Override de permissão inválido.', 422);
        }
        if (seen.has(item.permissionCode)) throw new AppError('Permissão duplicada nos overrides.', 422);
        seen.add(item.permissionCode);
        const permission = getPermission(item.permissionCode);
        if (item.effect === 'ALLOW' && (permission.sensitive || permission.financial) && !item.reason) {
            throw new AppError('Concessões sensíveis ou financeiras exigem justificativa.', 422);
        }
    }
}

function profileState(configuration) {
    if (!configuration) return null;
    return {
        id: configuration.id,
        profileCode: configuration.profileCode,
        profileVersion: configuration.profileVersion,
        status: configuration.status,
        basedOnLegacyRole: configuration.basedOnLegacyRole,
        overrides: configuration.overrides || [],
        createdAt: configuration.createdAt,
        activatedAt: configuration.activatedAt,
        retiredAt: configuration.retiredAt
    };
}

function accessDto(membership) {
    const configurations = membership.access?.configurations || [];
    return {
        user: membership.user,
        establishment: membership.establishment,
        membership: {
            id: membership.id,
            role: membership.role,
            isActive: membership.isActive
        },
        access: {
            mode: membership.access?.mode || 'LEGACY',
            version: membership.access?.version || 0,
            draft: profileState(configurations.find(item => item.status === 'DRAFT')),
            active: profileState(configurations.find(item => item.status === 'ACTIVE'))
        }
    };
}

function previewFor(role, configuration) {
    const current = legacyCapabilitiesForRole(role);
    const proposedResult = applyProfile({
        profileCode: configuration.profileCode,
        profileVersion: configuration.profileVersion,
        overrides: configuration.overrides
    });
    if (!proposedResult.valid) throw new AppError('Versão de perfil não suportada.', 409);
    const proposed = proposedResult.permissions;
    const groups = { maintained: [], granted: [], removed: [], unchangedDenied: [] };
    for (const code of PERMISSION_CODES) {
        if (current.has(code) && proposed.has(code)) groups.maintained.push(code);
        else if (!current.has(code) && proposed.has(code)) groups.granted.push(code);
        else if (current.has(code) && !proposed.has(code)) groups.removed.push(code);
        else groups.unchangedDenied.push(code);
    }
    return groups;
}

function actorAuthorization(actor) {
    const active = actor.access?.configurations?.find(item => item.status === 'ACTIVE');
    if (actor.access?.mode === 'PROFILED' && active) {
        const resolved = applyProfile({
            profileCode: active.profileCode,
            profileVersion: active.profileVersion,
            overrides: active.overrides
        });
        return {
            level: getProfile(active.profileCode, active.profileVersion)?.authorityLevel || 0,
            permissions: resolved.permissions,
            profileCode: active.profileCode
        };
    }
    if (actor.role === 'ADMIN') {
        return {
            level: getProfile('ADMINISTRATOR', PROFILE_VERSION).authorityLevel,
            permissions: new Set(PERMISSION_CODES.filter(code => !INDELEGABLE_PERMISSIONS.has(code))),
            profileCode: 'LEGACY_ADMIN'
        };
    }
    return { level: 0, permissions: legacyCapabilitiesForRole(actor.role), profileCode: 'LEGACY' };
}

async function assertDelegation({ actor, target, profileCode, profileVersion, overrides, db }) {
    if (actor.id === target.id || actor.userId === target.userId) {
        throw new AppError('Não é permitido elevar ou alterar o próprio acesso.', 403);
    }
    const actorAuth = actorAuthorization(actor);
    if (!actorAuth.permissions.has('users.permissions.manage')) {
        throw new AppError('Acesso negado.', 403);
    }
    const targetProfile = getProfile(profileCode, profileVersion);
    const [actorOwnerAuthority, targetOwnerAuthority] = await Promise.all([
        db.organizationAuthority?.findFirst?.({
            where: {
                organizationId: target.establishment.organizationId,
                userId: actor.userId,
                type: 'OWNER',
                isActive: true
            }
        }) || null,
        db.organizationAuthority?.findFirst?.({
            where: {
                organizationId: target.establishment.organizationId,
                userId: target.userId,
                type: 'OWNER',
                isActive: true
            }
        }) || null
    ]);
    if (targetOwnerAuthority && !actorOwnerAuthority) {
        throw new AppError('Somente Proprietário organizacional pode alterar o acesso de outro Proprietário.', 403);
    }
    if (profileCode === 'OWNER') {
        if (!actorOwnerAuthority) throw new AppError('Somente Proprietário organizacional validado pode designar OWNER.', 403);
    } else if (targetProfile.authorityLevel > actorAuth.level) {
        throw new AppError('Não é permitido conceder perfil superior ao próprio.', 403);
    }

    for (const permissionCode of targetProfile.permissions) {
        if (INDELEGABLE_PERMISSIONS.has(permissionCode)) continue;
        if (!actorAuth.permissions.has(permissionCode)) {
            throw new AppError('Não é permitido conceder privilégios superiores aos próprios.', 403);
        }
    }

    for (const item of overrides) {
        if (item.effect !== 'ALLOW') continue;
        if (INDELEGABLE_PERMISSIONS.has(item.permissionCode)) {
            throw new AppError('Capacidade estrutural não pode ser concedida por override.', 403);
        }
        if (!actorAuth.permissions.has(item.permissionCode)) {
            throw new AppError('Não é permitido conceder capacidade que o ator não possui.', 403);
        }
    }
}

async function getScopedTarget(context, userId, db) {
    const target = await repository.findScopedMembership({
        userId,
        establishmentId: context.establishmentId,
        organizationId: context.organizationId
    }, db);
    if (!target) throw new AppError('Acesso não encontrado.', 404);
    return target;
}

async function getActor(context, db) {
    const actor = await repository.findActorMembership(context.membershipId, context.organizationId, db);
    if (!actor || actor.establishmentId !== context.establishmentId) throw new AppError('Acesso negado.', 403);
    return actor;
}

async function getAccess(context, userId, db) {
    return accessDto(await getScopedTarget(context, userId, db));
}

async function saveDraft(context, userId, input, deps = {}) {
    const repo = deps.repository || repository;
    const audit = deps.auditRepository || auditRepository;
    const overrides = asOverrides(input.overrides);
    const profileVersion = input.profileVersion || PROFILE_VERSION;
    assertConfiguration(input.profileCode, profileVersion, overrides);

    return repo.withSerializableTransaction(async tx => {
        const actor = await getActor(context, tx);
        const target = await getScopedTarget(context, userId, tx);
        await assertDelegation({ actor, target, profileCode: input.profileCode, profileVersion, overrides, db: tx });

        let access = target.access;
        if (!access) {
            if (input.expectedVersion !== 0) throw new AppError('Configuração concorrente detectada.', 409);
            access = await tx.userEstablishmentAccess.create({
                data: { userEstablishmentId: target.id, mode: 'LEGACY' }
            });
        } else if (access.version !== input.expectedVersion) {
            throw new AppError('Configuração concorrente detectada.', 409);
        }

        const existingDraft = target.access?.configurations?.find(item => item.status === 'DRAFT');
        let draft;
        if (existingDraft) {
            await tx.permissionOverride.deleteMany({ where: { configurationId: existingDraft.id } });
            draft = await tx.accessConfiguration.update({
                where: { id: existingDraft.id },
                data: {
                    profileCode: input.profileCode,
                    profileVersion,
                    basedOnLegacyRole: target.role,
                    overrides: { create: overrides }
                },
                include: { overrides: true }
            });
        } else {
            draft = await tx.accessConfiguration.create({
                data: {
                    accessId: access.id,
                    profileCode: input.profileCode,
                    profileVersion,
                    status: 'DRAFT',
                    basedOnLegacyRole: target.role,
                    createdByMembershipId: actor.id,
                    overrides: { create: overrides }
                },
                include: { overrides: true }
            });
        }

        const updated = await tx.userEstablishmentAccess.updateMany({
            where: { id: access.id, version: access.version },
            data: { version: { increment: 1 } }
        });
        if (updated.count !== 1) throw new AppError('Configuração concorrente detectada.', 409);

        await audit.create({
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            actorUserId: context.userId,
            actorMembershipId: context.membershipId,
            targetUserId: target.userId,
            targetMembershipId: target.id,
            eventType: 'ACCESS_DRAFT_SAVED',
            entityType: 'AccessConfiguration',
            entityId: draft.id,
            beforeJson: existingDraft ? profileState(existingDraft) : null,
            afterJson: profileState(draft),
            metadataJson: { accessVersion: access.version + 1 }
        }, tx);
        return { draft: profileState(draft), version: access.version + 1 };
    });
}

async function preview(context, userId, db) {
    const target = await getScopedTarget(context, userId, db);
    const draft = target.access?.configurations?.find(item => item.status === 'DRAFT');
    if (!draft) throw new AppError('Rascunho não encontrado.', 404);
    return { draft: profileState(draft), diff: previewFor(target.role, draft) };
}

async function activate(context, userId, input, deps = {}) {
    const repo = deps.repository || repository;
    const audit = deps.auditRepository || auditRepository;
    return repo.withSerializableTransaction(async tx => {
        const actor = await getActor(context, tx);
        const target = await getScopedTarget(context, userId, tx);
        const access = target.access;
        if (!access || access.version !== input.expectedVersion) throw new AppError('Configuração concorrente detectada.', 409);
        const draft = access.configurations.find(item => item.status === 'DRAFT');
        if (!draft) throw new AppError('Rascunho não encontrado.', 404);
        await assertDelegation({
            actor,
            target,
            profileCode: draft.profileCode,
            profileVersion: draft.profileVersion,
            overrides: draft.overrides,
            db: tx
        });
        const diff = previewFor(target.role, draft);
        if ((diff.granted.length || diff.removed.length) && input.confirm !== true) {
            throw new AppError('Confirmação explícita obrigatória para ativar alterações.', 422);
        }

        const previous = access.configurations.find(item => item.status === 'ACTIVE');
        if (previous) {
            await tx.accessConfiguration.update({
                where: { id: previous.id },
                data: { status: 'RETIRED', retiredAt: new Date() }
            });
        }
        const active = await tx.accessConfiguration.update({
            where: { id: draft.id },
            data: {
                status: 'ACTIVE',
                previousConfigurationId: previous?.id || null,
                activatedAt: new Date(),
                activatedByMembershipId: actor.id
            },
            include: { overrides: true }
        });
        const updated = await tx.userEstablishmentAccess.updateMany({
            where: { id: access.id, version: access.version },
            data: { mode: 'PROFILED', version: { increment: 1 } }
        });
        if (updated.count !== 1) throw new AppError('Configuração concorrente detectada.', 409);

        await audit.create({
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            actorUserId: context.userId,
            actorMembershipId: context.membershipId,
            targetUserId: target.userId,
            targetMembershipId: target.id,
            eventType: 'ACCESS_PROFILE_ACTIVATED',
            entityType: 'UserEstablishmentAccess',
            entityId: access.id,
            beforeJson: { mode: access.mode, activeConfigurationId: previous?.id || null },
            afterJson: { mode: 'PROFILED', activeConfigurationId: active.id },
            metadataJson: { diff, accessVersion: access.version + 1 }
        }, tx);
        return { mode: 'PROFILED', version: access.version + 1, active: profileState(active), diff };
    });
}

async function rollback(context, userId, input, deps = {}) {
    const repo = deps.repository || repository;
    const audit = deps.auditRepository || auditRepository;
    return repo.withSerializableTransaction(async tx => {
        const actor = await getActor(context, tx);
        const target = await getScopedTarget(context, userId, tx);
        if (actor.id === target.id) throw new AppError('Não é permitido alterar o próprio acesso.', 403);
        const actorAuth = actorAuthorization(actor);
        if (!actorAuth.permissions.has('users.permissions.manage')) throw new AppError('Acesso negado.', 403);
        const targetOwnerAuthority = await tx.organizationAuthority.findFirst({
            where: {
                organizationId: context.organizationId,
                userId: target.userId,
                type: 'OWNER',
                isActive: true
            }
        });
        if (targetOwnerAuthority) {
            const actorOwnerAuthority = await tx.organizationAuthority.findFirst({
                where: {
                    organizationId: context.organizationId,
                    userId: actor.userId,
                    type: 'OWNER',
                    isActive: true
                }
            });
            if (!actorOwnerAuthority) throw new AppError('Somente Proprietário organizacional pode alterar outro Proprietário.', 403);
        }
        const access = target.access;
        if (!access || access.version !== input.expectedVersion) throw new AppError('Configuração concorrente detectada.', 409);
        const updated = await tx.userEstablishmentAccess.updateMany({
            where: { id: access.id, version: access.version },
            data: { mode: 'LEGACY', version: { increment: 1 } }
        });
        if (updated.count !== 1) throw new AppError('Configuração concorrente detectada.', 409);
        await audit.create({
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            actorUserId: context.userId,
            actorMembershipId: context.membershipId,
            targetUserId: target.userId,
            targetMembershipId: target.id,
            eventType: 'AUTHORIZATION_MODE_ROLLED_BACK',
            entityType: 'UserEstablishmentAccess',
            entityId: access.id,
            beforeJson: { mode: access.mode },
            afterJson: { mode: 'LEGACY' },
            metadataJson: { reason: input.reason, accessVersion: access.version + 1 }
        }, tx);
        return { mode: 'LEGACY', version: access.version + 1 };
    });
}

async function history(context, userId, db) {
    const target = await getScopedTarget(context, userId, db);
    return auditRepository.listForTarget(target.id, context.organizationId, db);
}

module.exports = {
    accessDto,
    previewFor,
    actorAuthorization,
    assertDelegation,
    getAccess,
    saveDraft,
    preview,
    activate,
    rollback,
    history
};

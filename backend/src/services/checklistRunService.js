const { createHash } = require('node:crypto');
const AppError = require('../utils/AppError');
const repository = require('../repositories/checklistRunRepository');
const permissionResolver = require('./permissionResolverService');
const userAccessRepository = require('../repositories/userAccessRepository');
const { getAuthorizationFlags } = require('../config/authorization');

const MAX_TRANSACTION_RETRIES = 3;

function membershipContext(context, membership = context) {
    return {
        id: membership.id || membership.membershipId,
        userId: membership.userId,
        role: membership.role,
        isActive: membership.isActive ?? membership.membershipActive !== false,
        establishmentActive: membership.establishmentActive ?? true,
        establishmentId: membership.establishmentId,
        organizationId: membership.organizationId || membership.establishment?.organizationId
    };
}

function permissionRepository(db) {
    if (!db) return userAccessRepository;
    return {
        findAuthorizationContext: id => userAccessRepository.findAuthorizationContext(id, db),
        hasOrganizationAuthority: (userId, organizationId) => userAccessRepository.hasOrganizationAuthority(userId, organizationId, db)
    };
}

async function canExecute(membership, options = {}) {
    return permissionResolver.resolve({
        capability: 'checklists.execute',
        legacyRoles: ['ADMIN', 'MANAGER', 'STAFF', 'STOCK_COUNTER'],
        membership: membershipContext({}, membership),
        flags: options.flags || getAuthorizationFlags(),
        repository: options.permissionRepository || permissionRepository(options.db)
    });
}

const iso = value => value ? new Date(value).toISOString() : null;
const numberValue = value => value === null || value === undefined ? null : Number(value);

function personDto(membership) {
    if (!membership) return null;
    return { membershipId: membership.id, userId: membership.user?.id, name: membership.user?.name, email: membership.user?.email };
}

function runDto(run) {
    return {
        id: run.id,
        clientRequestId: run.clientRequestId,
        templateVersionId: run.templateVersionId,
        template: run.templateVersion ? {
            id: run.templateVersion.template.id,
            name: run.templateVersion.template.name,
            category: run.templateVersion.template.category,
            version: run.templateVersion.version,
            approvalRequired: run.templateVersion.approvalRequired,
            passingScore: numberValue(run.templateVersion.passingScore)
        } : undefined,
        assignedTo: personDto(run.assignedTo),
        createdBy: personDto(run.createdBy),
        scheduleId: run.scheduleId || null,
        scheduledFor: iso(run.scheduledFor),
        dueAt: iso(run.dueAt),
        status: run.status,
        version: run.version,
        createdAt: iso(run.createdAt),
        updatedAt: iso(run.updatedAt),
        assignments: (run.assignments || []).map(entry => ({
            id: entry.id,
            sequence: entry.sequence,
            changeType: entry.changeType,
            reason: entry.reason,
            previous: personDto(entry.previous),
            assignedTo: personDto(entry.assignedTo),
            changedBy: personDto(entry.changedBy),
            createdAt: iso(entry.createdAt)
        }))
    };
}

function fingerprint(input) {
    return createHash('sha256').update(JSON.stringify({
        templateVersionId: input.templateVersionId,
        assignedMembershipId: input.assignedMembershipId,
        dueAt: new Date(input.dueAt).toISOString()
    })).digest('hex');
}

function translate(error) {
    if (error instanceof AppError) throw error;
    if (error?.code === 'P2034' || error?.code === 'P2002') throw new AppError('Conflito concorrente. Recarregue e tente novamente.', 409);
    if (error?.code === 'P2004' || /checklist/i.test(error?.message || '')) {
        throw new AppError('A operação viola uma regra de integridade da ocorrência.', 422);
    }
    throw error;
}

async function serializable(callback, db) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt += 1) {
        try { return await repository.withSerializableTransaction(callback, db); }
        catch (error) {
            lastError = error;
            if (error?.code !== 'P2034' || attempt === MAX_TRANSACTION_RETRIES) break;
        }
    }
    throw lastError;
}

async function capabilities(context, options = {}) {
    const base = membershipContext(context);
    const flags = options.flags || getAuthorizationFlags();
    const permissionRepositoryOption = options.permissionRepository;
    const [templates, runs, execute, approve] = await Promise.all([
        permissionResolver.resolve({ capability: 'checklists.templates.manage', legacyRoles: ['ADMIN'], membership: base, flags, repository: permissionRepositoryOption || userAccessRepository }),
        permissionResolver.resolve({ capability: 'checklists.runs.manage', legacyRoles: ['ADMIN', 'MANAGER'], membership: base, flags, repository: permissionRepositoryOption || userAccessRepository }),
        permissionResolver.resolve({ capability: 'checklists.execute', legacyRoles: ['ADMIN', 'MANAGER', 'STAFF', 'STOCK_COUNTER'], membership: base, flags, repository: permissionRepositoryOption || userAccessRepository }),
        permissionResolver.resolve({ capability: 'checklists.approve', legacyRoles: ['ADMIN', 'MANAGER'], membership: base, flags, repository: permissionRepositoryOption || userAccessRepository })
    ]);
    return {
        'checklists.templates.manage': templates.allowed,
        'checklists.runs.manage': runs.allowed,
        'checklists.execute': execute.allowed,
        'checklists.approve': approve.allowed
    };
}

async function publishedTemplates(context, options = {}) {
    const rows = await repository.listPublishedTemplates(context.organizationId, options.db);
    return rows.map(row => ({
        id: row.id, version: row.version, approvalRequired: row.approvalRequired,
        passingScore: numberValue(row.passingScore), publishedAt: iso(row.publishedAt),
        template: row.template
    }));
}

async function eligibleAssignees(context, options = {}) {
    const memberships = await repository.listActiveMemberships(context.establishmentId, options.db);
    const eligible = [];
    for (const membership of memberships) {
        const decision = await canExecute({
            ...membership,
            establishmentActive: membership.establishment.isActive,
            organizationId: membership.establishment.organizationId
        }, options);
        if (decision.allowed) eligible.push({
            membershipId: membership.id, userId: membership.user.id, name: membership.user.name,
            email: membership.user.email, role: membership.role
        });
    }
    return eligible;
}

async function assertEligible(context, membershipId, options = {}) {
    const memberships = await repository.listActiveMemberships(context.establishmentId, options.db);
    const membership = memberships.find(candidate => candidate.id === membershipId);
    if (!membership) throw new AppError('Responsável inválido ou inativo para esta unidade.', 422);
    const decision = await canExecute({
        ...membership, establishmentActive: membership.establishment.isActive,
        organizationId: membership.establishment.organizationId
    }, options);
    if (!decision.allowed) throw new AppError('O responsável não possui permissão efetiva para executar checklists.', 422);
    return membership;
}

async function list(context, options = {}) {
    return (await repository.listScoped(context, options.db)).map(runDto);
}

async function get(context, runId, options = {}) {
    const run = await repository.findScoped(runId, context, options.db);
    if (!run) throw new AppError('Ocorrência de checklist não encontrada.', 404);
    return runDto(run);
}

async function create(context, input, options = {}) {
    if (new Date(input.dueAt).getTime() <= Date.now()) throw new AppError('O prazo precisa estar no futuro.', 422);
    const requestFingerprint = fingerprint(input);
    try {
        const runId = await serializable(async tx => {
            const existing = await repository.findByClientRequest(context.organizationId, input.clientRequestId, tx);
            if (existing) {
                if (existing.requestFingerprint !== requestFingerprint) {
                    throw new AppError('clientRequestId já utilizado com dados diferentes.', 409);
                }
                return existing.id;
            }
            await assertEligible(context, input.assignedMembershipId, { ...options, db: tx });
            const templateVersion = await tx.checklistTemplateVersion.findFirst({
                where: { id: input.templateVersionId, status: 'PUBLISHED', template: { organizationId: context.organizationId, status: 'ACTIVE' } },
                select: { id: true }
            });
            if (!templateVersion) throw new AppError('Versão publicada do modelo não encontrada.', 422);
            const run = await tx.checklistRun.create({
                data: {
                    clientRequestId: input.clientRequestId,
                    requestFingerprint,
                    organizationId: context.organizationId,
                    establishmentId: context.establishmentId,
                    templateVersionId: input.templateVersionId,
                    assignedMembershipId: input.assignedMembershipId,
                    createdByMembershipId: context.membershipId,
                    dueAt: new Date(input.dueAt),
                    assignments: { create: { sequence: 1, assignedMembershipId: input.assignedMembershipId, changedByMembershipId: context.membershipId, changeType: 'INITIAL' } },
                    events: { create: { sequence: 1, eventType: 'RUN_CREATED', actorMembershipId: context.membershipId, metadataJson: { assignedMembershipId: input.assignedMembershipId } } }
                },
                select: { id: true }
            });
            return run.id;
        }, options.db);
        return get(context, runId, options);
    } catch (error) {
        if (error?.code === 'P2002') {
            const existing = await repository.findByClientRequest(
                context.organizationId, input.clientRequestId, options.db
            );
            if (existing && existing.requestFingerprint === requestFingerprint) {
                return runDto(existing);
            }
        }
        return translate(error);
    }
}

async function reassign(context, runId, input, options = {}) {
    try {
        await serializable(async tx => {
            const run = await repository.findScoped(runId, context, tx);
            if (!run) throw new AppError('Ocorrência de checklist não encontrada.', 404);
            if (run.status !== 'ASSIGNED') throw new AppError('Somente ocorrências ainda não iniciadas podem ser reatribuídas.', 409);
            if (run.version !== input.version) throw new AppError('A ocorrência foi alterada em outra sessão.', 409);
            if (run.assignedMembershipId === input.assignedMembershipId) throw new AppError('Escolha um responsável diferente do atual.', 422);
            await assertEligible(context, input.assignedMembershipId, { ...options, db: tx });
            const updated = await tx.checklistRun.updateMany({
                where: { id: run.id, version: input.version, status: 'ASSIGNED' },
                data: { assignedMembershipId: input.assignedMembershipId, version: { increment: 1 } }
            });
            if (updated.count !== 1) throw new AppError('A ocorrência foi alterada em outra sessão.', 409);
            const nextAssignment = (run.assignments.at(-1)?.sequence || 0) + 1;
            const nextEvent = await tx.checklistRunEvent.count({ where: { runId: run.id } }) + 1;
            await tx.checklistRunAssignment.create({ data: {
                runId: run.id, sequence: nextAssignment, previousMembershipId: run.assignedMembershipId,
                assignedMembershipId: input.assignedMembershipId, changedByMembershipId: context.membershipId,
                changeType: 'REASSIGNMENT', reason: input.reason
            } });
            await tx.checklistRunEvent.create({ data: {
                runId: run.id, sequence: nextEvent, eventType: 'ASSIGNMENT_CHANGED', actorMembershipId: context.membershipId,
                metadataJson: { previousMembershipId: run.assignedMembershipId, assignedMembershipId: input.assignedMembershipId, reason: input.reason }
            } });
        }, options.db);
        return get(context, runId, options);
    } catch (error) { return translate(error); }
}

module.exports = {
    capabilities, publishedTemplates, eligibleAssignees, list, get, create, reassign,
    fingerprint, runDto, canExecute, assertEligible
};

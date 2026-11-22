const { createHash } = require('node:crypto');
const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const auditRepository = require('../repositories/securityAuditRepository');
const runService = require('./checklistRunService');
const { BUSINESS_TIME_ZONE, nextSelectedOccurrence } = require('../utils/checklistScheduleTime');

const scheduleInclude = Object.freeze({
    templateVersion: { select: { id: true, version: true, status: true, template: { select: { id: true, name: true, category: true, status: true } } } },
    assignedTo: { select: { id: true, role: true, isActive: true, user: { select: { id: true, name: true, email: true } } } },
    createdBy: { select: { id: true, user: { select: { id: true, name: true, email: true } } } }
});

const iso = value => value ? new Date(value).toISOString() : null;
const dateOnly = value => value ? new Date(value).toISOString().slice(0, 10) : null;
const personDto = membership => membership ? {
    membershipId: membership.id, userId: membership.user?.id,
    name: membership.user?.name, email: membership.user?.email
} : null;

function scheduleDto(schedule) {
    return {
        id: schedule.id,
        templateVersionId: schedule.templateVersionId,
        template: schedule.templateVersion ? {
            id: schedule.templateVersion.template.id,
            name: schedule.templateVersion.template.name,
            category: schedule.templateVersion.template.category,
            version: schedule.templateVersion.version
        } : undefined,
        assignedTo: personDto(schedule.assignedTo),
        createdBy: personDto(schedule.createdBy),
        weekdays: schedule.weekdays,
        localTime: schedule.localTime,
        timeZone: schedule.timeZone,
        dueAfterMinutes: schedule.dueAfterMinutes,
        startsOn: dateOnly(schedule.startsOn),
        endsOn: dateOnly(schedule.endsOn),
        nextRunAt: iso(schedule.nextRunAt),
        status: schedule.status,
        version: schedule.version,
        lastAttemptAt: iso(schedule.lastAttemptAt),
        lastGeneratedAt: iso(schedule.lastGeneratedAt),
        lastError: schedule.lastError,
        createdAt: iso(schedule.createdAt),
        updatedAt: iso(schedule.updatedAt)
    };
}

function deterministicRequestId(scheduleId, scheduledFor) {
    const hex = createHash('sha256').update(`${scheduleId}:${new Date(scheduledFor).toISOString()}`).digest('hex').slice(0, 32).split('');
    hex[12] = '5';
    hex[16] = (parseInt(hex[16], 16) & 0x3 | 0x8).toString(16);
    const value = hex.join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function list(context, options = {}) {
    const db = options.db || prisma;
    const rows = await db.checklistSchedule.findMany({
        where: { organizationId: context.organizationId, establishmentId: context.establishmentId },
        orderBy: [{ status: 'asc' }, { nextRunAt: 'asc' }, { createdAt: 'desc' }],
        include: scheduleInclude
    });
    return rows.map(scheduleDto);
}

async function validateReferences(context, input, db, options = {}) {
    await runService.assertEligible(context, input.assignedMembershipId, { ...options, db });
    const templateVersion = await db.checklistTemplateVersion.findFirst({
        where: { id: input.templateVersionId, status: 'PUBLISHED', template: { organizationId: context.organizationId, status: 'ACTIVE' } },
        select: { id: true }
    });
    if (!templateVersion) throw new AppError('Versão publicada do modelo não encontrada.', 422);
}

async function create(context, input, options = {}) {
    const db = options.db || prisma;
    const nextRunAt = nextSelectedOccurrence({
        weekdays: input.weekdays, localTime: input.localTime, startsOn: input.startsOn,
        endsOn: input.endsOn, from: options.now || new Date(), timeZone: BUSINESS_TIME_ZONE
    });
    if (!nextRunAt) throw new AppError('O período informado não possui uma próxima execução.', 422);
    const schedule = await db.$transaction(async tx => {
        await validateReferences(context, input, tx, options);
        const created = await tx.checklistSchedule.create({
            data: {
                organizationId: context.organizationId,
                establishmentId: context.establishmentId,
                templateVersionId: input.templateVersionId,
                assignedMembershipId: input.assignedMembershipId,
                createdByMembershipId: context.membershipId,
                weekdays: input.weekdays,
                localTime: input.localTime,
                timeZone: BUSINESS_TIME_ZONE,
                dueAfterMinutes: input.dueAfterMinutes,
                startsOn: new Date(`${input.startsOn}T00:00:00.000Z`),
                endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00.000Z`) : null,
                nextRunAt
            },
            include: scheduleInclude
        });
        await (options.audit || auditRepository).create({
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            actorUserId: context.userId,
            actorMembershipId: context.membershipId,
            targetMembershipId: input.assignedMembershipId,
            eventType: 'CHECKLIST_SCHEDULE_CREATED',
            entityType: 'ChecklistSchedule',
            entityId: created.id,
            afterJson: {
                templateVersionId: input.templateVersionId,
                assignedMembershipId: input.assignedMembershipId,
                weekdays: input.weekdays,
                localTime: input.localTime,
                dueAfterMinutes: input.dueAfterMinutes,
                startsOn: input.startsOn,
                endsOn: input.endsOn || null
            }
        }, tx);
        return created;
    }, { isolationLevel: 'Serializable' });
    return scheduleDto(schedule);
}

async function update(context, scheduleId, input, options = {}) {
    const db = options.db || prisma;
    const updatedId = await db.$transaction(async tx => {
        const schedule = await tx.checklistSchedule.findFirst({
            where: { id: scheduleId, organizationId: context.organizationId, establishmentId: context.establishmentId },
            include: scheduleInclude
        });
        if (!schedule) throw new AppError('Agendamento não encontrado.', 404);
        if (schedule.version !== input.version) throw new AppError('O agendamento foi alterado em outra sessão.', 409);
        if (schedule.status === 'ENDED') throw new AppError('Agendamentos encerrados não podem ser editados.', 409);

        await validateReferences(context, input, tx, options);
        const nextRunAt = nextSelectedOccurrence({
            weekdays: input.weekdays, localTime: input.localTime, startsOn: input.startsOn,
            endsOn: input.endsOn, from: options.now || new Date(), timeZone: schedule.timeZone
        });
        if (!nextRunAt) throw new AppError('O período informado não possui uma próxima execução.', 422);

        const changed = await tx.checklistSchedule.updateMany({
            where: { id: schedule.id, version: input.version, status: { in: ['ACTIVE', 'PAUSED'] } },
            data: {
                templateVersionId: input.templateVersionId,
                assignedMembershipId: input.assignedMembershipId,
                weekdays: input.weekdays,
                localTime: input.localTime,
                dueAfterMinutes: input.dueAfterMinutes,
                startsOn: new Date(`${input.startsOn}T00:00:00.000Z`),
                endsOn: input.endsOn ? new Date(`${input.endsOn}T00:00:00.000Z`) : null,
                nextRunAt,
                lastError: null,
                version: { increment: 1 }
            }
        });
        if (changed.count !== 1) throw new AppError('O agendamento foi alterado em outra sessão.', 409);

        await (options.audit || auditRepository).create({
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            actorUserId: context.userId,
            actorMembershipId: context.membershipId,
            targetMembershipId: input.assignedMembershipId,
            eventType: 'CHECKLIST_SCHEDULE_UPDATED',
            entityType: 'ChecklistSchedule',
            entityId: schedule.id,
            beforeJson: {
                templateVersionId: schedule.templateVersionId,
                assignedMembershipId: schedule.assignedMembershipId,
                weekdays: schedule.weekdays,
                localTime: schedule.localTime,
                dueAfterMinutes: schedule.dueAfterMinutes,
                startsOn: dateOnly(schedule.startsOn),
                endsOn: dateOnly(schedule.endsOn),
                nextRunAt: iso(schedule.nextRunAt),
                version: schedule.version
            },
            afterJson: {
                templateVersionId: input.templateVersionId,
                assignedMembershipId: input.assignedMembershipId,
                weekdays: input.weekdays,
                localTime: input.localTime,
                dueAfterMinutes: input.dueAfterMinutes,
                startsOn: input.startsOn,
                endsOn: input.endsOn || null,
                nextRunAt: nextRunAt.toISOString(),
                version: schedule.version + 1
            }
        }, tx);
        return schedule.id;
    }, { isolationLevel: 'Serializable' });

    const updated = await db.checklistSchedule.findUnique({ where: { id: updatedId }, include: scheduleInclude });
    return scheduleDto(updated);
}

async function setStatus(context, scheduleId, input, options = {}) {
    const db = options.db || prisma;
    const updatedId = await db.$transaction(async tx => {
        const schedule = await tx.checklistSchedule.findFirst({
            where: { id: scheduleId, organizationId: context.organizationId, establishmentId: context.establishmentId },
            include: scheduleInclude
        });
        if (!schedule) throw new AppError('Agendamento não encontrado.', 404);
        if (schedule.version !== input.version) throw new AppError('O agendamento foi alterado em outra sessão.', 409);
        let nextRunAt = schedule.nextRunAt;
        if (input.status === 'ACTIVE') {
            await validateReferences(context, schedule, tx, options);
            nextRunAt = nextSelectedOccurrence({
                weekdays: schedule.weekdays, localTime: schedule.localTime,
                startsOn: schedule.startsOn, endsOn: schedule.endsOn,
                from: options.now || new Date(), timeZone: schedule.timeZone
            });
            if (!nextRunAt) throw new AppError('Este agendamento já ultrapassou a data final.', 422);
        }
        const changed = await tx.checklistSchedule.updateMany({
            where: { id: schedule.id, version: input.version },
            data: { status: input.status, nextRunAt, lastError: null, version: { increment: 1 } }
        });
        if (changed.count !== 1) throw new AppError('O agendamento foi alterado em outra sessão.', 409);
        await (options.audit || auditRepository).create({
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            actorUserId: context.userId,
            actorMembershipId: context.membershipId,
            targetMembershipId: schedule.assignedMembershipId,
            eventType: input.status === 'ACTIVE' ? 'CHECKLIST_SCHEDULE_RESUMED' : 'CHECKLIST_SCHEDULE_PAUSED',
            entityType: 'ChecklistSchedule',
            entityId: schedule.id,
            beforeJson: { status: schedule.status, version: schedule.version },
            afterJson: { status: input.status, version: schedule.version + 1, nextRunAt: nextRunAt.toISOString() }
        }, tx);
        return schedule.id;
    }, { isolationLevel: 'Serializable' });
    const updated = await db.checklistSchedule.findUnique({ where: { id: updatedId }, include: scheduleInclude });
    return scheduleDto(updated);
}

async function processOne(scheduleId, now, db, options = {}) {
    try {
        return await db.$transaction(async tx => {
            const schedule = await tx.checklistSchedule.findUnique({
                where: { id: scheduleId },
                include: {
                    ...scheduleInclude,
                    establishment: { select: { isActive: true, organizationId: true } }
                }
            });
            if (!schedule || schedule.status !== 'ACTIVE' || schedule.nextRunAt > now) return { skipped: true };
            const scheduledFor = schedule.nextRunAt;
            const nextRunAt = nextSelectedOccurrence({
                weekdays: schedule.weekdays, localTime: schedule.localTime,
                startsOn: schedule.startsOn, endsOn: schedule.endsOn,
                from: new Date(scheduledFor.getTime() + 1), timeZone: schedule.timeZone
            });
            const nextStatus = nextRunAt ? 'ACTIVE' : 'ENDED';
            const pause = async message => {
                await tx.checklistSchedule.update({
                    where: { id: schedule.id },
                    data: { status: 'PAUSED', lastAttemptAt: now, lastError: message, version: { increment: 1 } }
                });
                return { paused: true, reason: message };
            };
            if (!schedule.establishment.isActive || !schedule.assignedTo.isActive) {
                return pause('Responsável ou estabelecimento inativo; agendamento pausado automaticamente.');
            }
            if (schedule.templateVersion.status !== 'PUBLISHED' || schedule.templateVersion.template.status !== 'ACTIVE') {
                return pause('Modelo não está mais publicado; agendamento pausado automaticamente.');
            }
            const decision = await runService.canExecute({
                id: schedule.assignedTo.id,
                userId: schedule.assignedTo.user.id,
                role: schedule.assignedTo.role,
                isActive: schedule.assignedTo.isActive,
                establishmentActive: schedule.establishment.isActive,
                establishmentId: schedule.establishmentId,
                organizationId: schedule.organizationId
            }, { ...options, db: tx });
            if (!decision.allowed) return pause('Responsável perdeu a permissão de execução; agendamento pausado automaticamente.');

            const dueAt = new Date(scheduledFor.getTime() + schedule.dueAfterMinutes * 60_000);
            if (dueAt <= now) {
                await tx.checklistSchedule.update({
                    where: { id: schedule.id },
                    data: {
                        status: nextStatus, nextRunAt: nextRunAt || schedule.nextRunAt,
                        lastAttemptAt: now, lastError: 'Janela da ocorrência expirada antes da geração.',
                        version: { increment: 1 }
                    }
                });
                return { expired: true };
            }
            const clientRequestId = deterministicRequestId(schedule.id, scheduledFor);
            const requestFingerprint = runService.fingerprint({
                templateVersionId: schedule.templateVersionId,
                assignedMembershipId: schedule.assignedMembershipId,
                dueAt
            });
            const run = await tx.checklistRun.create({
                data: {
                    clientRequestId, requestFingerprint,
                    organizationId: schedule.organizationId,
                    establishmentId: schedule.establishmentId,
                    templateVersionId: schedule.templateVersionId,
                    assignedMembershipId: schedule.assignedMembershipId,
                    createdByMembershipId: schedule.createdByMembershipId,
                    scheduleId: schedule.id,
                    scheduledFor,
                    dueAt,
                    assignments: { create: {
                        sequence: 1, assignedMembershipId: schedule.assignedMembershipId,
                        changedByMembershipId: schedule.createdByMembershipId, changeType: 'INITIAL'
                    } },
                    events: { create: {
                        sequence: 1, eventType: 'RUN_CREATED', actorMembershipId: schedule.createdByMembershipId,
                        metadataJson: { assignedMembershipId: schedule.assignedMembershipId, scheduleId: schedule.id, scheduledFor: scheduledFor.toISOString() }
                    } }
                },
                select: { id: true }
            });
            await tx.checklistSchedule.update({
                where: { id: schedule.id },
                data: {
                    status: nextStatus, nextRunAt: nextRunAt || schedule.nextRunAt,
                    lastAttemptAt: now, lastGeneratedAt: now, lastError: null,
                    version: { increment: 1 }
                }
            });
            return { generated: true, runId: run.id };
        }, { isolationLevel: 'Serializable' });
    } catch (error) {
        if (error?.code === 'P2002' || error?.code === 'P2034') return { concurrent: true };
        throw error;
    }
}

async function processDue(options = {}) {
    const db = options.db || prisma;
    const now = new Date(options.now || Date.now());
    const due = await db.checklistSchedule.findMany({
        where: { status: 'ACTIVE', nextRunAt: { lte: now } },
        orderBy: { nextRunAt: 'asc' }, take: options.limit || 50,
        select: { id: true }
    });
    const results = [];
    for (const schedule of due) {
        try {
            results.push(await processOne(schedule.id, now, db, options));
        } catch (error) {
            results.push({ failed: true, scheduleId: schedule.id, error });
            if (options.throwOnError) throw error;
            console.error(`[CHECKLIST_SCHEDULER] Falha no agendamento ${schedule.id}:`, error);
        }
    }
    return results;
}

module.exports = {
    scheduleDto, deterministicRequestId, list, create, update, setStatus, processDue
};

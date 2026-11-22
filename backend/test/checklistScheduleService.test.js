const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://local:local@127.0.0.1:1/local';

const schemas = require('../src/validations/checklistRunValidation');
const service = require('../src/services/checklistScheduleService');
const runService = require('../src/services/checklistRunService');
const { nextDailyOccurrence, nextWeeklyOccurrence, nextSelectedOccurrence, zonedDateTimeToUtc } = require('../src/utils/checklistScheduleTime');

test('calcula a próxima ocorrência semanal no horário de São Paulo', () => {
    assert.equal(
        zonedDateTimeToUtc('2026-11-23', '09:00', 'America/Sao_Paulo').toISOString(),
        '2026-11-23T12:00:00.000Z'
    );
    assert.equal(nextWeeklyOccurrence({
        weekday: 1, localTime: '09:00', startsOn: '2026-11-22',
        from: new Date('2026-11-22T20:00:00.000Z')
    }).toISOString(), '2026-11-23T12:00:00.000Z');
    assert.equal(nextWeeklyOccurrence({
        weekday: 1, localTime: '09:00', startsOn: '2026-11-22', endsOn: '2026-11-29',
        from: new Date('2026-11-23T13:00:00.000Z')
    }), null);
});

test('calcula a próxima ocorrência diária sem reaproveitar a tarefa anterior', () => {
    assert.equal(nextDailyOccurrence({
        localTime: '08:00', startsOn: '2026-11-22',
        from: new Date('2026-11-22T12:00:00.000Z')
    }).toISOString(), '2026-11-23T11:00:00.000Z');
    assert.equal(nextDailyOccurrence({
        localTime: '08:00', startsOn: '2026-11-22', endsOn: '2026-11-23',
        from: new Date('2026-11-23T12:00:00.000Z')
    }), null);
});

test('calcula a próxima ocorrência somente entre os dias marcados', () => {
    assert.equal(nextSelectedOccurrence({
        weekdays: [1, 3, 5], localTime: '08:00', startsOn: '2026-11-22',
        from: new Date('2026-11-23T12:00:00.000Z')
    }).toISOString(), '2026-11-25T11:00:00.000Z');
});

test('contrato recorrente aceita de um a sete dias distintos com datas e prazo seguros', () => {
    const valid = {
        templateVersionId: '50000000-0000-4000-8000-000000000001',
        assignedMembershipId: '60000000-0000-4000-8000-000000000001',
        weekdays: [1], localTime: '09:00', dueAfterMinutes: 1440,
        startsOn: '2026-11-23', endsOn: null
    };
    assert.equal(schemas.createScheduleSchema.safeParse(valid).success, true);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, weekdays: [0, 1, 2, 3, 4, 5, 6] }).success, true);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, weekdays: [] }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, weekdays: [1, 1] }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, organizationId: 'org-b' }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, weekdays: [7] }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, localTime: '25:00' }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, startsOn: '2026-02-31' }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, endsOn: '2026-11-22' }).success, false);
    assert.equal(schemas.updateScheduleSchema.safeParse({ ...valid, version: 2 }).success, true);
    assert.equal(schemas.updateScheduleSchema.safeParse(valid).success, false);
    assert.equal(schemas.updateScheduleSchema.safeParse({ ...valid, version: 2, establishmentId: 'forged' }).success, false);
});

test('criação deriva tenant e ator do contexto e registra auditoria', async t => {
    const originalAssertEligible = runService.assertEligible;
    t.after(() => { runService.assertEligible = originalAssertEligible; });
    let eligibleContext;
    runService.assertEligible = async (context, membershipId) => { eligibleContext = { context, membershipId }; };
    let createdData;
    let auditEvent;
    const input = {
        templateVersionId: '50000000-0000-4000-8000-000000000001',
        assignedMembershipId: '60000000-0000-4000-8000-000000000001',
        weekdays: [1], localTime: '09:00', dueAfterMinutes: 1440,
        startsOn: '2026-11-23', endsOn: null
    };
    const context = {
        userId: '10000000-0000-4000-8000-000000000001',
        membershipId: '20000000-0000-4000-8000-000000000001',
        establishmentId: '30000000-0000-4000-8000-000000000001',
        organizationId: 'org-a', role: 'ADMIN'
    };
    const tx = {
        checklistTemplateVersion: { findFirst: async () => ({ id: input.templateVersionId }) },
        checklistSchedule: { create: async ({ data }) => {
            createdData = data;
            return {
                id: '70000000-0000-4000-8000-000000000001', ...data,
                status: 'ACTIVE', version: 1, createdAt: new Date(), updatedAt: new Date(),
                assignedTo: { id: input.assignedMembershipId, user: { id: 'user-a', name: 'Pessoa' } },
                createdBy: { id: context.membershipId, user: { id: context.userId, name: 'Gestor' } },
                templateVersion: { version: 1, template: { id: 'template-a', name: 'Semanal', category: null } }
            };
        } }
    };
    const db = { $transaction: callback => callback(tx) };
    const audit = { create: async event => { auditEvent = event; } };
    const result = await service.create(context, input, {
        db, audit, now: new Date('2026-11-22T20:00:00.000Z')
    });
    assert.equal(createdData.organizationId, context.organizationId);
    assert.equal(createdData.establishmentId, context.establishmentId);
    assert.equal(createdData.createdByMembershipId, context.membershipId);
    assert.equal(eligibleContext.membershipId, input.assignedMembershipId);
    assert.equal(auditEvent.eventType, 'CHECKLIST_SCHEDULE_CREATED');
    assert.equal(auditEvent.actorUserId, context.userId);
    assert.equal(result.nextRunAt, '2026-11-23T12:00:00.000Z');
});

test('edição altera somente a rotina futura com lock otimista e auditoria', async t => {
    const originalAssertEligible = runService.assertEligible;
    t.after(() => { runService.assertEligible = originalAssertEligible; });
    let eligibleMembershipId;
    runService.assertEligible = async (_context, membershipId) => { eligibleMembershipId = membershipId; };

    const context = {
        userId: '10000000-0000-4000-8000-000000000001',
        membershipId: '20000000-0000-4000-8000-000000000001',
        establishmentId: '30000000-0000-4000-8000-000000000001',
        organizationId: 'org-a', role: 'ADMIN'
    };
    const schedule = {
        id: '70000000-0000-4000-8000-000000000001',
        organizationId: context.organizationId,
        establishmentId: context.establishmentId,
        templateVersionId: '50000000-0000-4000-8000-000000000001',
        assignedMembershipId: '60000000-0000-4000-8000-000000000001',
        createdByMembershipId: context.membershipId,
        weekdays: [1], localTime: '09:00', timeZone: 'America/Sao_Paulo', dueAfterMinutes: 1440,
        startsOn: new Date('2026-11-23T00:00:00.000Z'), endsOn: null,
        nextRunAt: new Date('2026-11-23T12:00:00.000Z'), status: 'ACTIVE', version: 3,
        createdAt: new Date('2026-11-20T12:00:00.000Z'), updatedAt: new Date('2026-11-20T12:00:00.000Z'),
        templateVersion: { version: 1, status: 'PUBLISHED', template: { id: 'template-a', name: 'Abertura', category: null, status: 'ACTIVE' } },
        assignedTo: { id: '60000000-0000-4000-8000-000000000001', role: 'STAFF', isActive: true, user: { id: 'user-a', name: 'Pessoa A' } },
        createdBy: { id: context.membershipId, user: { id: context.userId, name: 'Gestor' } }
    };
    const input = {
        templateVersionId: '50000000-0000-4000-8000-000000000002',
        assignedMembershipId: '60000000-0000-4000-8000-000000000002',
        weekdays: [2, 4], localTime: '10:00', dueAfterMinutes: 720,
        startsOn: '2026-11-23', endsOn: '2026-12-31', version: 3
    };
    let updateWhere;
    let updateData;
    let auditEvent;
    const tx = {
        checklistSchedule: {
            findFirst: async () => schedule,
            updateMany: async ({ where, data }) => { updateWhere = where; updateData = data; return { count: 1 }; }
        },
        checklistTemplateVersion: { findFirst: async () => ({ id: input.templateVersionId }) }
    };
    const db = {
        $transaction: callback => callback(tx),
        checklistSchedule: { findUnique: async () => ({
            ...schedule,
            ...updateData,
            version: schedule.version + 1,
            assignedTo: { id: input.assignedMembershipId, role: 'STAFF', isActive: true, user: { id: 'user-b', name: 'Pessoa B' } },
            templateVersion: { version: 2, status: 'PUBLISHED', template: { id: 'template-a', name: 'Abertura', category: null, status: 'ACTIVE' } }
        }) }
    };
    const audit = { create: async event => { auditEvent = event; } };

    const result = await service.update(context, schedule.id, input, {
        db, audit, now: new Date('2026-11-22T20:00:00.000Z')
    });

    assert.equal(updateWhere.version, 3);
    assert.deepEqual(updateWhere.status, { in: ['ACTIVE', 'PAUSED'] });
    assert.deepEqual(updateData.weekdays, [2, 4]);
    assert.equal(updateData.nextRunAt.toISOString(), '2026-11-24T13:00:00.000Z');
    assert.equal(eligibleMembershipId, input.assignedMembershipId);
    assert.equal(auditEvent.eventType, 'CHECKLIST_SCHEDULE_UPDATED');
    assert.equal(auditEvent.beforeJson.version, 3);
    assert.equal(auditEvent.afterJson.version, 4);
    assert.equal(result.version, 4);
    assert.equal(result.assignedTo.name, 'Pessoa B');
});

test('gerador diário cria uma única ocorrência e avança para o dia seguinte', async () => {
    const scheduledFor = new Date('2026-11-23T12:00:00.000Z');
    const schedule = {
        id: '70000000-0000-4000-8000-000000000001',
        organizationId: 'org-a', establishmentId: '30000000-0000-4000-8000-000000000001',
        templateVersionId: '50000000-0000-4000-8000-000000000001',
        assignedMembershipId: '60000000-0000-4000-8000-000000000001',
        createdByMembershipId: '20000000-0000-4000-8000-000000000001',
        weekdays: [0, 1, 2, 3, 4, 5, 6], localTime: '09:00', timeZone: 'America/Sao_Paulo', dueAfterMinutes: 1440,
        startsOn: new Date('2026-11-23T00:00:00.000Z'), endsOn: null,
        nextRunAt: scheduledFor, status: 'ACTIVE', version: 1,
        establishment: { isActive: true, organizationId: 'org-a' },
        templateVersion: { status: 'PUBLISHED', template: { status: 'ACTIVE', id: 'template-a', name: 'Diário' } },
        assignedTo: { id: '60000000-0000-4000-8000-000000000001', role: 'STAFF', isActive: true, user: { id: 'user-a', name: 'Pessoa' } },
        createdBy: { id: '20000000-0000-4000-8000-000000000001', user: { id: 'user-b', name: 'Gestor' } }
    };
    const runs = [];
    const tx = {
        checklistSchedule: {
            findUnique: async () => ({ ...schedule }),
            update: async ({ data }) => {
                Object.assign(schedule, data, { version: schedule.version + 1 });
                if (data.version) delete schedule.version.increment;
                return schedule;
            }
        },
        checklistRun: { create: async ({ data }) => { runs.push(data); return { id: `run-${runs.length}` }; } }
    };
    const db = {
        checklistSchedule: {
            findMany: async ({ where }) => schedule.status === 'ACTIVE' && schedule.nextRunAt <= where.nextRunAt.lte ? [{ id: schedule.id }] : []
        },
        $transaction: callback => callback(tx)
    };
    const options = {
        db, now: new Date('2026-11-23T12:01:00.000Z'),
        flags: { enabled: false, killSwitch: true }
    };
    const first = await service.processDue(options);
    const second = await service.processDue(options);
    assert.equal(first[0].generated, true);
    assert.deepEqual(second, []);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].scheduleId, schedule.id);
    assert.equal(runs[0].dueAt.toISOString(), '2026-11-24T12:00:00.000Z');
    assert.equal(schedule.nextRunAt.toISOString(), '2026-11-24T12:00:00.000Z');
    assert.match(service.deterministicRequestId(schedule.id, scheduledFor), /^[0-9a-f-]{36}$/);
});

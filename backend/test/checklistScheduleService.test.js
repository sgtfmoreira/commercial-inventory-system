const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://local:local@127.0.0.1:1/local';

const schemas = require('../src/validations/checklistRunValidation');
const service = require('../src/services/checklistScheduleService');
const runService = require('../src/services/checklistRunService');
const { nextWeeklyOccurrence, zonedDateTimeToUtc } = require('../src/utils/checklistScheduleTime');

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

test('contrato semanal aceita somente frequência, datas e prazo seguros', () => {
    const valid = {
        templateVersionId: '50000000-0000-4000-8000-000000000001',
        assignedMembershipId: '60000000-0000-4000-8000-000000000001',
        weekday: 1, localTime: '09:00', dueAfterMinutes: 1440,
        startsOn: '2026-11-23', endsOn: null
    };
    assert.equal(schemas.createScheduleSchema.safeParse(valid).success, true);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, organizationId: 'org-b' }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, weekday: 7 }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, localTime: '25:00' }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, startsOn: '2026-02-31' }).success, false);
    assert.equal(schemas.createScheduleSchema.safeParse({ ...valid, endsOn: '2026-11-22' }).success, false);
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
        weekday: 1, localTime: '09:00', dueAfterMinutes: 1440,
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

test('gerador cria uma única ocorrência e avança a agenda antes do próximo ciclo', async () => {
    const scheduledFor = new Date('2026-11-23T12:00:00.000Z');
    const schedule = {
        id: '70000000-0000-4000-8000-000000000001',
        organizationId: 'org-a', establishmentId: '30000000-0000-4000-8000-000000000001',
        templateVersionId: '50000000-0000-4000-8000-000000000001',
        assignedMembershipId: '60000000-0000-4000-8000-000000000001',
        createdByMembershipId: '20000000-0000-4000-8000-000000000001',
        weekday: 1, localTime: '09:00', timeZone: 'America/Sao_Paulo', dueAfterMinutes: 1440,
        startsOn: new Date('2026-11-23T00:00:00.000Z'), endsOn: null,
        nextRunAt: scheduledFor, status: 'ACTIVE', version: 1,
        establishment: { isActive: true, organizationId: 'org-a' },
        templateVersion: { status: 'PUBLISHED', template: { status: 'ACTIVE', id: 'template-a', name: 'Semanal' } },
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
    assert.equal(schedule.nextRunAt.toISOString(), '2026-11-30T12:00:00.000Z');
    assert.match(service.deterministicRequestId(schedule.id, scheduledFor), /^[0-9a-f-]{36}$/);
});

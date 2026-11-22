const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://local:local@127.0.0.1:1/local';

const schemas = require('../src/validations/checklistRunValidation');
const service = require('../src/services/checklistRunService');
const repository = require('../src/repositories/checklistRunRepository');

const context = {
    userId: '10000000-0000-4000-8000-000000000001',
    membershipId: '20000000-0000-4000-8000-000000000001',
    establishmentId: '30000000-0000-4000-8000-000000000001',
    organizationId: 'org-a', role: 'ADMIN', membershipActive: true, establishmentActive: true
};

test('contratos de criação e reatribuição rejeitam autoridade enviada pelo cliente', () => {
    const valid = {
        clientRequestId: '40000000-0000-4000-8000-000000000001',
        templateVersionId: '50000000-0000-4000-8000-000000000001',
        assignedMembershipId: '60000000-0000-4000-8000-000000000001',
        dueAt: '2026-12-01T12:00:00.000Z'
    };
    assert.equal(schemas.createRunSchema.safeParse(valid).success, true);
    assert.equal(schemas.createRunSchema.safeParse({ ...valid, organizationId: 'org-b' }).success, false);
    assert.equal(schemas.reassignRunSchema.safeParse({
        assignedMembershipId: valid.assignedMembershipId, reason: 'Cobertura operacional', version: 1
    }).success, true);
    assert.equal(schemas.reassignRunSchema.safeParse({
        assignedMembershipId: valid.assignedMembershipId, reason: ' ', version: 1
    }).success, false);
});

test('fingerprint é determinístico e muda quando o pedido muda', () => {
    const input = {
        templateVersionId: 'template-a', assignedMembershipId: 'membership-a',
        dueAt: '2026-12-01T12:00:00.000Z'
    };
    assert.equal(service.fingerprint(input), service.fingerprint({ ...input }));
    assert.notEqual(service.fingerprint(input), service.fingerprint({ ...input, assignedMembershipId: 'membership-b' }));
    assert.match(service.fingerprint(input), /^[0-9a-f]{64}$/);
});

test('listagem permanece limitada à organização e unidade do contexto', async t => {
    const original = repository.listScoped;
    t.after(() => { repository.listScoped = original; });
    let received;
    repository.listScoped = async scoped => { received = scoped; return []; };
    assert.deepEqual(await service.list(context), []);
    assert.equal(received.organizationId, 'org-a');
    assert.equal(received.establishmentId, context.establishmentId);
});

test('DTO distingue criador, responsável atual e histórico de reatribuição', () => {
    const now = new Date('2026-11-18T10:00:00.000Z');
    const membership = (id, name) => ({ id, user: { id: `user-${id}`, name, email: `${id}@local` } });
    const dto = service.runDto({
        id: 'run-a', clientRequestId: 'request-a', templateVersionId: 'version-a',
        templateVersion: { version: 1, approvalRequired: true, passingScore: 80, template: { id: 'template-a', name: 'Abertura', category: null } },
        assignedTo: membership('new', 'Novo'), createdBy: membership('creator', 'Gestor'),
        scheduleId: null, scheduledFor: null,
        dueAt: now, status: 'ASSIGNED', version: 2, createdAt: now, updatedAt: now,
        assignments: [{ id: 'assignment-a', sequence: 2, changeType: 'REASSIGNMENT', reason: 'Troca', createdAt: now,
            previous: membership('old', 'Anterior'), assignedTo: membership('new', 'Novo'), changedBy: membership('creator', 'Gestor') }]
    });
    assert.equal(dto.createdBy.name, 'Gestor');
    assert.equal(dto.assignedTo.name, 'Novo');
    assert.equal(dto.assignments[0].previous.name, 'Anterior');
    assert.equal(dto.template.passingScore, 80);
    assert.equal(dto.scheduleId, null);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../src/repositories/checklistRunRepository');
const service = require('../src/services/checklistReportService');
const schemas = require('../src/validations/checklistRunValidation');

const membership = (id, name) => ({ id, user: { id: `user-${id}`, name, email: `${id}@local` } });
const version = (id, number, name = 'Abertura segura') => ({
    id, version: number, template: { id: 'template-a', name, category: 'Operação' }
});
const attempt = ({ id, number = 1, score, compliant, critical = false, executor, approver, failures = [] }) => ({
    id, attemptNumber: number, status: compliant ? 'APPROVED' : 'REJECTED', score,
    isCompliant: compliant, criticalFailure: critical,
    submittedAt: new Date('2026-11-10T12:00:00.000Z'), decidedAt: new Date('2026-11-10T13:00:00.000Z'),
    executor, approvals: approver ? [{ decision: compliant ? 'APPROVE' : 'REJECT', approver }] : [],
    responses: failures.map((item, index) => ({
        outcome: 'FAIL', item: { id: `item-${index}`, stableKey: item.key, title: item.title, critical: item.critical }
    }))
});

const responsibleA = membership('responsible-a', 'Pessoa A');
const responsibleB = membership('responsible-b', 'Pessoa B');
const executorA = membership('executor-a', 'Executor A');
const approverA = membership('approver-a', 'Aprovador A');

test('relatório agrega score, prazo, retrabalho, falhas e paginação sem misturar versões', () => {
    const rows = [
        {
            id: 'run-a', status: 'APPROVED', dueAt: new Date('2026-11-10T15:00:00.000Z'),
            completedAt: new Date('2026-11-10T14:00:00.000Z'), createdAt: new Date(),
            assignedTo: responsibleA, templateVersion: version('version-1', 1),
            attempts: [attempt({ id: 'attempt-a', score: 100, compliant: true, executor: executorA, approver: approverA })]
        },
        {
            id: 'run-b', status: 'REJECTED', dueAt: new Date('2026-11-09T15:00:00.000Z'),
            completedAt: null, createdAt: new Date(), assignedTo: responsibleA,
            templateVersion: version('version-1', 1),
            attempts: [attempt({
                id: 'attempt-b', number: 2, score: 50, compliant: false, critical: true,
                executor: executorA, approver: approverA,
                failures: [{ key: 'temperature', title: 'Temperatura correta?', critical: true }]
            })]
        },
        {
            id: 'run-c', status: 'ASSIGNED', dueAt: new Date('2026-11-08T15:00:00.000Z'),
            completedAt: null, createdAt: new Date(), assignedTo: responsibleB,
            templateVersion: version('version-2', 2), attempts: []
        }
    ];
    const filters = {
        fromKey: '2026-11-01', toKey: '2026-11-30', page: 1, limit: 2,
        from: new Date('2026-11-01T03:00:00.000Z'), to: new Date('2026-12-01T02:59:59.999Z')
    };
    const report = service.reportFromRows(rows, filters, { templates: [], responsible: [] }, new Date('2026-11-20T12:00:00.000Z'));
    assert.equal(report.summary.totalRuns, 3);
    assert.equal(report.summary.scoredRuns, 2);
    assert.equal(report.summary.averageScore, 75);
    assert.equal(report.summary.complianceRate, 50);
    assert.equal(report.summary.onTimeRuns, 1);
    assert.equal(report.summary.overdueRuns, 2);
    assert.equal(report.summary.notStartedOverdueRuns, 1);
    assert.equal(report.summary.criticalFailureRuns, 1);
    assert.equal(report.summary.reworkRuns, 1);
    assert.equal(report.byTemplateVersion.length, 2);
    assert.deepEqual(report.byTemplateVersion.map(item => item.version).sort(), [1, 2]);
    assert.equal(report.failedItems[0].stableKey, 'temperature');
    assert.equal(report.byExecutor[0].count, 2);
    assert.equal(report.byApprover[0].count, 2);
    assert.equal(report.runs.length, 2);
    assert.deepEqual(report.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
});

test('serviço deriva tenant e unidade do contexto e rejeita agregação excessiva', async () => {
    const originalRuns = repository.listReportRuns;
    const originalOptions = repository.listReportFilterOptions;
    let received;
    repository.listReportRuns = async (context, filters) => {
        received = { context, filters };
        return Array.from({ length: service.MAX_AGGREGATE_ROWS + 1 }, (_, index) => ({ id: `run-${index}` }));
    };
    repository.listReportFilterOptions = async () => ({ templates: [], responsible: [] });
    try {
        await assert.rejects(service.getReport(
            { organizationId: 'org-a', establishmentId: 'unit-a' },
            { from: '2026-11-01', to: '2026-11-30', page: 1, limit: 25 },
            { now: new Date('2026-11-20T12:00:00.000Z') }
        ), error => error.statusCode === 422);
        assert.equal(received.context.organizationId, 'org-a');
        assert.equal(received.context.establishmentId, 'unit-a');
        assert.equal(received.filters.maxRows, 5000);
    } finally {
        repository.listReportRuns = originalRuns;
        repository.listReportFilterOptions = originalOptions;
    }
});

test('valida datas reais, janela máxima, UUIDs e paginação', () => {
    assert.equal(schemas.reportQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-30', page: '2', limit: '50' }).success, true);
    assert.equal(schemas.reportQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success, false);
    assert.equal(schemas.reportQuerySchema.safeParse({ from: '2025-01-01', to: '2026-12-31' }).success, false);
    assert.equal(schemas.reportQuerySchema.safeParse({ templateId: 'forged', limit: '101' }).success, false);
});

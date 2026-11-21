const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://local:local@127.0.0.1:1/local';
const schemas = require('../src/validations/checklistTemplateApiValidation');

const response = () => ({
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

function loadController(service) {
    const servicePath = require.resolve('../src/services/checklistTemplateService');
    const controllerPath = require.resolve('../src/controllers/checklistTemplateController');
    const original = require.cache[servicePath];
    require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: service };
    delete require.cache[controllerPath];
    const controller = require('../src/controllers/checklistTemplateController');
    return {
        controller,
        restore() {
            delete require.cache[controllerPath];
            if (original) require.cache[servicePath] = original;
            else delete require.cache[servicePath];
        }
    };
}

test('criação não aceita organizationId, establishmentId ou membershipId do cliente', () => {
    for (const forbidden of ['organizationId', 'establishmentId', 'membershipId']) {
        const parsed = schemas.createTemplateSchema.safeParse({
            name: 'Abertura da cozinha', approvalRequired: true, passingScore: 80,
            [forbidden]: 'valor-controlado-pelo-cliente'
        });
        assert.equal(parsed.success, false, forbidden);
    }
});

test('rascunho aceita os quatro tipos do MVP e rejeita posições duplicadas', () => {
    const baseItem = {
        title: 'Pergunta', instructions: null, required: true, allowNotApplicable: false,
        critical: false, evidenceRequired: false, maxPoints: 10, position: 1
    };
    const body = {
        expectedUpdatedAt: '2026-11-17T18:00:00.000Z', name: 'Abertura', category: null,
        description: null, approvalRequired: true, passingScore: 80,
        sections: [{
            stableKey: 'opening', title: 'Abertura', description: null, position: 1,
            items: [
                { ...baseItem, stableKey: 'bool', responseType: 'BOOLEAN', scoringConfigJson: { expected: true }, answerConfigJson: null },
                { ...baseItem, stableKey: 'choice', position: 2, responseType: 'CHOICE', answerConfigJson: { options: [{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }] }, scoringConfigJson: { pointsByValue: { yes: 10, no: 0 } } },
                { ...baseItem, stableKey: 'number', position: 3, responseType: 'NUMBER', answerConfigJson: {}, scoringConfigJson: { operator: 'BETWEEN', min: 1, max: 5 } },
                { ...baseItem, stableKey: 'text', position: 4, responseType: 'TEXT', answerConfigJson: { maxLength: 500 }, scoringConfigJson: { mode: 'COMPLETION' } }
            ]
        }]
    };
    assert.equal(schemas.saveDraftSchema.safeParse(body).success, true);
    body.sections[0].items[1].position = 1;
    assert.equal(schemas.saveDraftSchema.safeParse(body).success, false);
});

test('controller deriva tenant e ator exclusivamente da sessão autenticada', async () => {
    let received;
    const loaded = loadController({
        create: async (context, body) => { received = { context, body }; return { id: 'template-a' }; }
    });
    const req = {
        user: {
            userId: 'user-a', membershipId: 'membership-a', establishmentId: 'est-a',
            organizationId: 'org-a', role: 'ADMIN', membershipActive: true, establishmentActive: true
        },
        body: { name: 'Abertura', passingScore: 80 }
    };
    const res = response();
    let failure;
    await loaded.controller.create(req, res, error => { failure = error; });
    loaded.restore();
    assert.equal(failure, undefined);
    assert.equal(res.statusCode, 201);
    assert.equal(received.context.organizationId, 'org-a');
    assert.equal(received.context.membershipId, 'membership-a');
    assert.equal(received.body.organizationId, undefined);
});

test('controller falha fechado quando o contexto multi-tenant está incompleto', async () => {
    const loaded = loadController({ list: async () => [] });
    const req = { user: { userId: 'user-a', role: 'ADMIN' } };
    const res = response();
    let failure;
    await loaded.controller.list(req, res, error => { failure = error; });
    loaded.restore();
    assert.equal(failure?.statusCode, 403);
});

test('router expõe templates e distribuição manual com políticas diretas', () => {
    const router = require('../src/routes/checklistTemplateRoutes');
    const contracts = router.stack.filter(layer => layer.route).map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).sort()
    }));
    assert.deepEqual(contracts, [
        { path: '/capabilities', methods: ['get'] },
        { path: '/my-runs', methods: ['get'] },
        { path: '/runs/:runId/start', methods: ['post'] },
        { path: '/attempts/:attemptId', methods: ['get'] },
        { path: '/attempts/:attemptId/responses/:itemId', methods: ['put'] },
        { path: '/responses/:responseId/evidences', methods: ['post'] },
        { path: '/evidences/:evidenceId/content', methods: ['get'] },
        { path: '/attempts/:attemptId/submit', methods: ['post'] },
        { path: '/approvals', methods: ['get'] },
        { path: '/approval-attempts/:attemptId', methods: ['get'] },
        { path: '/attempts/:attemptId/approve', methods: ['post'] },
        { path: '/attempts/:attemptId/reject', methods: ['post'] },
        { path: '/approval-evidences/:evidenceId/content', methods: ['get'] },
        { path: '/runs/:runId/history', methods: ['get'] },
        { path: '/reports', methods: ['get'] },
        { path: '/published-templates', methods: ['get'] },
        { path: '/eligible-assignees', methods: ['get'] },
        { path: '/runs', methods: ['get'] },
        { path: '/runs', methods: ['post'] },
        { path: '/runs/:runId', methods: ['get'] },
        { path: '/runs/:runId/assignment', methods: ['patch'] },
        { path: '/templates', methods: ['get'] },
        { path: '/templates', methods: ['post'] },
        { path: '/templates/:templateId', methods: ['get'] },
        { path: '/templates/:templateId/draft', methods: ['put'] },
        { path: '/templates/:templateId/publish', methods: ['post'] },
        { path: '/templates/:templateId/versions', methods: ['post'] },
        { path: '/templates/:templateId/versions/:versionId/retire', methods: ['post'] }
    ]);
});

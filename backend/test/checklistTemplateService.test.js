const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://local:local@127.0.0.1:1/local';
const service = require('../src/services/checklistTemplateService');

const now = new Date('2026-11-17T18:00:00.000Z');
const context = {
    userId: 'user-a', membershipId: 'membership-a', establishmentId: 'est-a',
    organizationId: 'org-a', role: 'ADMIN', membershipActive: true, establishmentActive: true
};

const item = {
    id: 'item-a', templateVersionId: 'version-a', sectionId: 'section-a', stableKey: 'temperature_ok',
    title: 'Temperatura está adequada?', instructions: null, position: 1, responseType: 'BOOLEAN',
    required: true, allowNotApplicable: false, critical: true, evidenceRequired: false,
    maxPoints: 10, answerConfigJson: null, scoringConfigJson: { expected: true },
    createdAt: now, updatedAt: now
};
const section = {
    id: 'section-a', templateVersionId: 'version-a', stableKey: 'opening', title: 'Abertura',
    description: null, position: 1, createdAt: now, updatedAt: now, items: [item]
};
const version = (overrides = {}) => ({
    id: 'version-a', templateId: 'template-a', version: 1, status: 'DRAFT', approvalRequired: true,
    passingScore: 80, scoringAlgorithmVersion: 1, sourceVersionId: null,
    createdByMembershipId: 'membership-a', publishedByMembershipId: null,
    createdAt: now, updatedAt: now, publishedAt: null, retiredAt: null,
    sections: [section], ...overrides
});
const template = (versions = [version()]) => ({
    id: 'template-a', organizationId: 'org-a', code: 'opening_a', name: 'Abertura',
    category: 'Operação', description: null, status: 'ACTIVE', createdByMembershipId: 'membership-a',
    createdAt: now, updatedAt: now, versions
});

test('capability mínima preserva o fallback LEGACY sem alterar o resolvedor', async () => {
    const admin = await service.capabilities(context, { flags: { enabled: false, killSwitch: true } });
    const staff = await service.capabilities({ ...context, role: 'STAFF' }, { flags: { enabled: false, killSwitch: true } });
    assert.deepEqual(admin, { 'checklists.templates.manage': true });
    assert.deepEqual(staff, { 'checklists.templates.manage': false });
});

test('listagem deriva o tenant exclusivamente do contexto autenticado', async () => {
    let query;
    const db = { checklistTemplate: { findMany: async input => { query = input; return [template()]; } } };
    const result = await service.list(context, { db });
    assert.equal(query.where.organizationId, 'org-a');
    assert.equal(result[0].organizationId, 'org-a');
    assert.equal(result[0].versions[0].passingScore, 80);
});

test('consulta cross-tenant falha como recurso inexistente', async () => {
    const db = { checklistTemplate: { findFirst: async ({ where }) => {
        assert.deepEqual(where, { id: 'template-b', organizationId: 'org-a' });
        return null;
    } } };
    await assert.rejects(() => service.get(context, 'template-b', { db }), error => error.statusCode === 404);
});

test('salvamento rejeita optimistic lock obsoleto antes de substituir conteúdo', async () => {
    let mutated = false;
    const db = {
        $transaction: async callback => callback(db),
        checklistTemplate: {
            findFirst: async () => template(),
            update: async () => { mutated = true; }
        },
        checklistTemplateVersion: { updateMany: async () => { mutated = true; return { count: 1 }; } },
        checklistTemplateItem: { deleteMany: async () => { mutated = true; } },
        checklistTemplateSection: { deleteMany: async () => { mutated = true; } }
    };
    await assert.rejects(() => service.saveDraft(context, 'template-a', {
        expectedUpdatedAt: '2026-11-17T17:59:00.000Z', name: 'Abertura', category: null,
        description: null, approvalRequired: true, passingScore: 80, sections: []
    }, { db }), error => error.statusCode === 409);
    assert.equal(mutated, false);
});

test('publicação valida o documento completo e fecha quando ele está incompleto', async () => {
    const incomplete = template([version({ sections: [] })]);
    const db = {
        $transaction: async callback => callback(db),
        checklistTemplate: { findFirst: async () => incomplete },
        checklistTemplateVersion: { updateMany: async () => assert.fail('não deveria publicar') }
    };
    await assert.rejects(() => service.publish(context, 'template-a', {
        expectedUpdatedAt: now.toISOString()
    }, { db }), error => error.statusCode === 422);
});

test('publicação válida é protegida contra duas decisões concorrentes', async () => {
    let calls = 0;
    const current = template();
    const db = {
        $transaction: async callback => callback(db),
        checklistTemplate: { findFirst: async () => current },
        checklistTemplateVersion: { updateMany: async () => ({ count: calls++ === 0 ? 1 : 0 }) }
    };
    await service.publish(context, 'template-a', { expectedUpdatedAt: now.toISOString() }, { db });
    await assert.rejects(() => service.publish(context, 'template-a', {
        expectedUpdatedAt: now.toISOString()
    }, { db }), error => error.statusCode === 409);
});

test('clonagem cria exatamente a próxima versão e preserva a origem', async () => {
    const published = version({ status: 'PUBLISHED', publishedAt: now, publishedByMembershipId: 'membership-a' });
    const current = template([published]);
    let createInput;
    let sectionInput;
    const db = {
        $transaction: async callback => callback(db),
        checklistTemplate: { findFirst: async () => current },
        checklistTemplateVersion: { create: async ({ data }) => { createInput = data; return { id: 'version-b' }; } },
        checklistTemplateSection: { create: async ({ data }) => { sectionInput = data; return { id: 'section-b' }; } },
        checklistTemplateItem: { createMany: async () => ({ count: 1 }) }
    };
    await service.cloneVersion(context, 'template-a', { sourceVersionId: 'version-a' }, { db });
    assert.equal(createInput.version, 2);
    assert.equal(createInput.sourceVersionId, 'version-a');
    assert.equal(sectionInput.templateVersionId, 'version-b');
});

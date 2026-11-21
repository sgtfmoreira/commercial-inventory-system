const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.CHECKLIST_HTTP_TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest('API de templates preserva autorização, tenant, publicação concorrente e N+1', async t => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'bastidor-b2212-local-secret';
    process.env.NODE_ENV = 'test';
    process.env.USER_PERMISSIONS_ENABLED = 'false';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';

    const jwt = require('jsonwebtoken');
    const prisma = require('../src/utils/prisma');
    const app = require('../src/app');
    const suffix = randomUUID();
    const organizationA = await prisma.organization.create({ data: { name: `Checklist HTTP A ${suffix}` } });
    const organizationB = await prisma.organization.create({ data: { name: `Checklist HTTP B ${suffix}` } });
    const establishmentA = await prisma.establishments.create({ data: { name: 'Central Checklist', organizationId: organizationA.id } });
    const establishmentB = await prisma.establishments.create({ data: { name: 'Vizinha Checklist', organizationId: organizationB.id } });
    const admin = await prisma.users.create({ data: { name: 'Admin Checklist', email: `admin-${suffix}@checklist.local`, password: 'local' } });
    const staff = await prisma.users.create({ data: { name: 'Staff Checklist', email: `staff-${suffix}@checklist.local`, password: 'local' } });
    const neighbor = await prisma.users.create({ data: { name: 'Neighbor Checklist', email: `neighbor-${suffix}@checklist.local`, password: 'local' } });
    const adminMembershipId = randomUUID();
    const staffMembershipId = randomUUID();
    const neighborMembershipId = randomUUID();
    await prisma.userEstablishment.createMany({ data: [
        { id: adminMembershipId, userId: admin.id, establishmentId: establishmentA.id, role: 'ADMIN' },
        { id: staffMembershipId, userId: staff.id, establishmentId: establishmentA.id, role: 'STAFF' },
        { id: neighborMembershipId, userId: neighbor.id, establishmentId: establishmentB.id, role: 'ADMIN' }
    ] });

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await prisma.$disconnect();
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    const token = (user, establishment, role) => jwt.sign({
        userId: user.id, establishmentId: establishment.id, role
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const adminToken = token(admin, establishmentA, 'ADMIN');
    const staffToken = token(staff, establishmentA, 'STAFF');
    const neighborToken = token(neighbor, establishmentB, 'ADMIN');
    const request = async (path, { bearer = adminToken, method = 'GET', body } = {}) => {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: {
                ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : null };
    };

    assert.equal((await request('/api/checklists/templates', { bearer: null })).status, 401);
    assert.equal((await request('/api/checklists/templates', { bearer: staffToken })).status, 403);
    assert.deepEqual((await request('/api/checklists/capabilities', { bearer: staffToken })).body.capabilities, {
        'checklists.templates.manage': false,
        'checklists.runs.manage': false
    });

    const adminAccess = await prisma.userEstablishmentAccess.create({
        data: { userEstablishmentId: adminMembershipId, mode: 'PROFILED', version: 1 }
    });
    const staffAccess = await prisma.userEstablishmentAccess.create({
        data: { userEstablishmentId: staffMembershipId, mode: 'PROFILED', version: 1 }
    });
    await prisma.accessConfiguration.createMany({ data: [
        {
            accessId: adminAccess.id, profileCode: 'ADMINISTRATOR', profileVersion: 1, status: 'ACTIVE',
            basedOnLegacyRole: 'ADMIN', createdByMembershipId: adminMembershipId,
            activatedByMembershipId: adminMembershipId, activatedAt: new Date()
        },
        {
            accessId: staffAccess.id, profileCode: 'SUPERVISOR', profileVersion: 1, status: 'ACTIVE',
            basedOnLegacyRole: 'STAFF', createdByMembershipId: adminMembershipId,
            activatedByMembershipId: adminMembershipId, activatedAt: new Date()
        }
    ] });
    process.env.USER_PERMISSIONS_ENABLED = 'true';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'false';
    assert.deepEqual((await request('/api/checklists/capabilities')).body.capabilities, {
        'checklists.templates.manage': true,
        'checklists.runs.manage': true
    });
    assert.equal((await request('/api/checklists/templates', { bearer: staffToken })).status, 403);
    process.env.USER_PERMISSIONS_ENABLED = 'false';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';

    const created = await request('/api/checklists/templates', {
        method: 'POST',
        body: { name: 'Abertura da cozinha', category: 'Operação', description: 'Rotina local', approvalRequired: true, passingScore: 80 }
    });
    assert.equal(created.status, 201);
    const templateId = created.body.id;
    const draft = created.body.versions.find(version => version.status === 'DRAFT');
    assert.ok(draft);

    const neighborList = await request('/api/checklists/templates', { bearer: neighborToken });
    assert.equal(neighborList.status, 200);
    assert.equal(neighborList.body.templates.some(item => item.id === templateId), false);
    assert.equal((await request(`/api/checklists/templates/${templateId}`, { bearer: neighborToken })).status, 404);

    const incompletePublish = await request(`/api/checklists/templates/${templateId}/publish`, {
        method: 'POST', body: { expectedUpdatedAt: draft.updatedAt }
    });
    assert.equal(incompletePublish.status, 422);

    const saved = await request(`/api/checklists/templates/${templateId}/draft`, {
        method: 'PUT',
        body: {
            expectedUpdatedAt: draft.updatedAt,
            name: 'Abertura da cozinha', category: 'Operação', description: 'Rotina validada',
            approvalRequired: true, passingScore: 80,
            sections: [{
                stableKey: 'opening', title: 'Abertura', description: 'Antes do atendimento', position: 1,
                items: [{
                    stableKey: 'temperature', title: 'Temperatura está correta?', instructions: null,
                    position: 1, responseType: 'BOOLEAN', required: true, allowNotApplicable: false,
                    critical: true, evidenceRequired: false, maxPoints: 10,
                    answerConfigJson: null, scoringConfigJson: { expected: true }
                }]
            }]
        }
    });
    assert.equal(saved.status, 200);
    const savedDraft = saved.body.versions.find(version => version.status === 'DRAFT');

    const publishRequest = () => request(`/api/checklists/templates/${templateId}/publish`, {
        method: 'POST', body: { expectedUpdatedAt: savedDraft.updatedAt }
    });
    const concurrent = await Promise.all([publishRequest(), publishRequest()]);
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
    const published = concurrent.find(result => result.status === 200).body.versions.find(version => version.status === 'PUBLISHED');
    assert.ok(published);

    const immutable = await request(`/api/checklists/templates/${templateId}/draft`, {
        method: 'PUT', body: { expectedUpdatedAt: published.updatedAt, name: 'Inválido', category: null, description: null, approvalRequired: true, passingScore: 80, sections: [] }
    });
    assert.equal(immutable.status, 409);

    const cloned = await request(`/api/checklists/templates/${templateId}/versions`, {
        method: 'POST', body: { sourceVersionId: published.id }
    });
    assert.equal(cloned.status, 201);
    const nextDraft = cloned.body.versions.find(version => version.status === 'DRAFT');
    assert.equal(nextDraft.version, 2);
    assert.equal(nextDraft.sourceVersionId, published.id);
    assert.equal(nextDraft.sections[0].items[0].stableKey, 'temperature');

    const retired = await request(`/api/checklists/templates/${templateId}/versions/${published.id}/retire`, {
        method: 'POST', body: { expectedUpdatedAt: published.updatedAt }
    });
    assert.equal(retired.status, 200);
    assert.equal(retired.body.versions.find(version => version.id === published.id).status, 'RETIRED');

    const persisted = await prisma.checklistTemplate.findUnique({
        where: { id: templateId }, include: { versions: { include: { sections: { include: { items: true } } } } }
    });
    assert.equal(persisted.organizationId, organizationA.id);
    assert.deepEqual(persisted.versions.map(item => item.status).sort(), ['DRAFT', 'RETIRED']);
    assert.equal(persisted.versions.reduce((total, item) => total + item.sections.length, 0), 2);
});

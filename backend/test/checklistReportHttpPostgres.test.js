const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.CHECKLIST_REPORT_HTTP_TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest('relatório HTTP isola tenant/unidade, filtra e preserva a matriz LEGACY', async t => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'bastidor-b2216-local-secret';
    process.env.NODE_ENV = 'test';
    process.env.USER_PERMISSIONS_ENABLED = 'false';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';

    const jwt = require('jsonwebtoken');
    const prisma = require('../src/utils/prisma');
    const app = require('../src/app');
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Report ${suffix}` } });
    const establishment = await prisma.establishments.create({ data: { name: 'Report Unit', organizationId: organization.id } });
    const createPerson = async (name, role, unit = establishment) => {
        const user = await prisma.users.create({ data: { name, email: `${name.toLowerCase().replace(/\s/g, '-')}-${suffix}@local`, password: 'local' } });
        const membership = await prisma.userEstablishment.create({ data: { userId: user.id, establishmentId: unit.id, role } });
        return { user, membership, unit };
    };
    const admin = await createPerson('Report Admin', 'ADMIN');
    const manager = await createPerson('Report Manager', 'MANAGER');
    const executor = await createPerson('Report Staff', 'STAFF');

    const createTemplate = async (org, creator, name) => {
        const template = await prisma.checklistTemplate.create({
            data: {
                organizationId: org.id, code: `${name.toLowerCase().replace(/\s/g, '-')}-${suffix.slice(0, 8)}`,
                name, status: 'ACTIVE', createdByMembershipId: creator.membership.id,
                versions: { create: {
                    version: 1, status: 'DRAFT', approvalRequired: false, passingScore: 80,
                    scoringAlgorithmVersion: 1, createdByMembershipId: creator.membership.id,
                    sections: { create: {
                        stableKey: 'opening', title: 'Abertura', position: 1,
                        items: { create: {
                            stableKey: 'ready', title: 'Unidade pronta?', position: 1,
                            responseType: 'BOOLEAN', required: true, maxPoints: 10,
                            scoringConfigJson: { expected: true }
                        } }
                    } }
                } }
            },
            include: { versions: { include: { sections: { include: { items: true } } } } }
        });
        const published = await prisma.checklistTemplateVersion.update({
            where: { id: template.versions[0].id },
            data: { status: 'PUBLISHED', publishedByMembershipId: creator.membership.id, publishedAt: new Date() }
        });
        return { template, version: published, item: template.versions[0].sections[0].items[0] };
    };
    const catalog = await createTemplate(organization, admin, 'Relatorio operacional');

    const otherOrganization = await prisma.organization.create({ data: { name: `Other Report ${suffix}` } });
    const otherEstablishment = await prisma.establishments.create({ data: { name: 'Other Report Unit', organizationId: otherOrganization.id } });
    const otherAdmin = await createPerson('Other Report Admin', 'ADMIN', otherEstablishment);
    const otherCatalog = await createTemplate(otherOrganization, otherAdmin, 'Modelo vizinho');

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });

    const token = person => jwt.sign({ userId: person.user.id, establishmentId: person.unit.id, role: person.membership.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const tokens = { admin: token(admin), manager: token(manager), executor: token(executor) };
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (route, { bearer = tokens.admin, method = 'GET', body } = {}) => {
        const response = await fetch(`${base}${route}`, {
            method, headers: { Authorization: `Bearer ${bearer}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        return { status: response.status, body: await response.json() };
    };

    const tomorrow = new Date(Date.now() + 86_400_000);
    const created = await request('/api/checklists/runs', { method: 'POST', body: {
        clientRequestId: randomUUID(), templateVersionId: catalog.version.id,
        assignedMembershipId: executor.membership.id, dueAt: tomorrow.toISOString()
    } });
    assert.equal(created.status, 201);
    const started = await request(`/api/checklists/runs/${created.body.id}/start`, { bearer: tokens.executor, method: 'POST' });
    const saved = await request(`/api/checklists/attempts/${started.body.id}/responses/${catalog.item.id}`, {
        bearer: tokens.executor, method: 'PUT', body: { value: true, notApplicable: false, version: 0 }
    });
    assert.equal(saved.status, 200);
    const submitted = await request(`/api/checklists/attempts/${started.body.id}/submit`, {
        bearer: tokens.executor, method: 'POST', body: { version: started.body.version }
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.status, 'APPROVED');

    const createdAt = new Date(Date.now() - 3 * 86_400_000);
    const overdue = await prisma.checklistRun.create({ data: {
        clientRequestId: randomUUID(), requestFingerprint: 'a'.repeat(64), organizationId: organization.id,
        establishmentId: establishment.id, templateVersionId: catalog.version.id,
        assignedMembershipId: executor.membership.id, createdByMembershipId: admin.membership.id,
        createdAt, dueAt: new Date(Date.now() - 2 * 86_400_000),
        assignments: { create: { sequence: 1, assignedMembershipId: executor.membership.id, changedByMembershipId: admin.membership.id, changeType: 'INITIAL' } },
        events: { create: { sequence: 1, eventType: 'RUN_CREATED', actorMembershipId: admin.membership.id } }
    } });
    assert.ok(overdue.id);

    const dateKey = date => date.toISOString().slice(0, 10);
    const from = dateKey(new Date(Date.now() - 5 * 86_400_000));
    const to = dateKey(new Date(Date.now() + 2 * 86_400_000));
    const report = await request(`/api/checklists/reports?from=${from}&to=${to}&templateVersionId=${catalog.version.id}&responsibleMembershipId=${executor.membership.id}`);
    assert.equal(report.status, 200);
    assert.equal(report.body.summary.totalRuns, 2);
    assert.equal(report.body.summary.scoredRuns, 1);
    assert.equal(report.body.summary.averageScore, 100);
    assert.equal(report.body.summary.overdueRuns, 1);
    assert.equal(report.body.summary.notStartedOverdueRuns, 1);
    assert.equal(report.body.byTemplateVersion.length, 1);
    assert.equal(report.body.byTemplateVersion[0].version, 1);
    assert.equal(report.body.pagination.total, 2);
    assert.equal((await request(`/api/checklists/reports?from=${from}&to=${to}`, { bearer: tokens.manager })).status, 200);
    assert.equal((await request(`/api/checklists/reports?from=${from}&to=${to}`, { bearer: tokens.executor })).status, 403);

    const foreignFilter = await request(`/api/checklists/reports?from=${from}&to=${to}&templateId=${otherCatalog.template.id}`);
    assert.equal(foreignFilter.status, 200);
    assert.equal(foreignFilter.body.summary.totalRuns, 0);
    assert.equal(foreignFilter.body.options.templates.some(item => item.templateId === otherCatalog.template.id), false);
    assert.equal((await request('/api/checklists/reports?from=2025-01-01&to=2026-12-31')).status, 422);
    assert.equal((await request('/api/checklists/reports?from=2026-02-30&to=2026-03-01')).status, 422);
});

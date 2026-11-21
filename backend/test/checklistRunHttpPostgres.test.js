const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.CHECKLIST_RUN_HTTP_TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest('distribuição manual preserva autorização, idempotência, concorrência e histórico', async t => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'bastidor-b2213-local-secret';
    process.env.NODE_ENV = 'test';
    process.env.USER_PERMISSIONS_ENABLED = 'false';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';

    const jwt = require('jsonwebtoken');
    const prisma = require('../src/utils/prisma');
    const app = require('../src/app');
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `Checklist Runs ${suffix}` } });
    const neighborOrganization = await prisma.organization.create({ data: { name: `Checklist Neighbor ${suffix}` } });
    const establishment = await prisma.establishments.create({ data: { name: 'Central Runs', organizationId: organization.id } });
    const neighborEstablishment = await prisma.establishments.create({ data: { name: 'Neighbor Runs', organizationId: neighborOrganization.id } });

    const createPerson = async (name, role, establishmentId = establishment.id) => {
        const user = await prisma.users.create({ data: { name, email: `${name.toLowerCase().replace(/\s/g, '-')}-${suffix}@local`, password: 'local' } });
        const membership = await prisma.userEstablishment.create({ data: { userId: user.id, establishmentId, role } });
        return { user, membership };
    };
    const admin = await createPerson('Admin Runs', 'ADMIN');
    const manager = await createPerson('Manager Runs', 'MANAGER');
    const staffA = await createPerson('Staff A', 'STAFF');
    const staffB = await createPerson('Staff B', 'STOCK_COUNTER');
    const viewer = await createPerson('Viewer Runs', 'VIEWER');
    const neighbor = await createPerson('Neighbor Admin', 'ADMIN', neighborEstablishment.id);

    const template = await prisma.checklistTemplate.create({
        data: {
            organizationId: organization.id,
            code: `run-${suffix.slice(0, 8)}`,
            name: 'Abertura operacional',
            status: 'ACTIVE',
            createdByMembershipId: admin.membership.id,
            versions: {
                create: {
                    version: 1,
                    status: 'DRAFT',
                    approvalRequired: true,
                    passingScore: 80,
                    scoringAlgorithmVersion: 1,
                    createdByMembershipId: admin.membership.id,
                    sections: {
                        create: {
                            stableKey: 'opening', title: 'Abertura', position: 1,
                            items: { create: {
                                stableKey: 'ready', title: 'Unidade pronta?', position: 1,
                                responseType: 'BOOLEAN', required: true, maxPoints: 10,
                                scoringConfigJson: { expected: true }
                            } }
                        }
                    }
                }
            }
        },
        include: { versions: true }
    });
    const draft = template.versions[0];
    const published = await prisma.checklistTemplateVersion.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedByMembershipId: admin.membership.id, publishedAt: new Date() }
    });

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
    const token = person => jwt.sign({
        userId: person.user.id,
        establishmentId: person.membership.establishmentId,
        role: person.membership.role
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const adminToken = token(admin);
    const managerToken = token(manager);
    const staffToken = token(staffA);
    const neighborToken = token(neighbor);
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

    assert.equal((await request('/api/checklists/runs', { bearer: null })).status, 401);
    assert.equal((await request('/api/checklists/runs', { bearer: staffToken })).status, 403);
    assert.equal((await request('/api/checklists/runs', { bearer: managerToken })).status, 200);
    const eligible = await request('/api/checklists/eligible-assignees');
    assert.equal(eligible.status, 200);
    assert.equal(eligible.body.assignees.some(item => item.membershipId === staffA.membership.id), true);
    assert.equal(eligible.body.assignees.some(item => item.membershipId === viewer.membership.id), false);
    assert.equal(eligible.body.assignees.some(item => item.membershipId === neighbor.membership.id), false);

    const dueAt = new Date(Date.now() + 86_400_000).toISOString();
    const clientRequestId = randomUUID();
    const payload = {
        clientRequestId,
        templateVersionId: published.id,
        assignedMembershipId: staffA.membership.id,
        dueAt
    };
    const first = await request('/api/checklists/runs', { method: 'POST', body: payload });
    assert.equal(first.status, 201);
    const repeated = await request('/api/checklists/runs', { method: 'POST', body: payload });
    assert.equal(repeated.status, 201);
    assert.equal(repeated.body.id, first.body.id);
    assert.equal((await request('/api/checklists/runs', {
        method: 'POST', body: { ...payload, assignedMembershipId: staffB.membership.id }
    })).status, 409);
    assert.equal((await request('/api/checklists/runs', {
        method: 'POST', body: { ...payload, clientRequestId: randomUUID(), assignedMembershipId: neighbor.membership.id }
    })).status, 422);
    assert.equal((await request(`/api/checklists/runs/${first.body.id}`, { bearer: neighborToken })).status, 404);

    const concurrentPayload = { ...payload, clientRequestId: randomUUID() };
    const concurrentCreate = await Promise.all([
        request('/api/checklists/runs', { method: 'POST', body: concurrentPayload }),
        request('/api/checklists/runs', { method: 'POST', body: concurrentPayload })
    ]);
    assert.deepEqual(concurrentCreate.map(result => result.status), [201, 201]);
    assert.equal(concurrentCreate[0].body.id, concurrentCreate[1].body.id);

    const reassignPayload = { assignedMembershipId: staffB.membership.id, reason: 'Cobertura do turno', version: first.body.version };
    const concurrentReassign = await Promise.all([
        request(`/api/checklists/runs/${first.body.id}/assignment`, { method: 'PATCH', body: reassignPayload }),
        request(`/api/checklists/runs/${first.body.id}/assignment`, { method: 'PATCH', body: reassignPayload })
    ]);
    assert.deepEqual(concurrentReassign.map(result => result.status).sort(), [200, 409]);
    const reassigned = concurrentReassign.find(result => result.status === 200).body;
    assert.equal(reassigned.assignedTo.membershipId, staffB.membership.id);
    assert.equal(reassigned.assignments.length, 2);
    assert.equal(reassigned.assignments[1].reason, 'Cobertura do turno');

    const assignment = await prisma.checklistRunAssignment.findFirst({ where: { runId: first.body.id, sequence: 2 } });
    await assert.rejects(
        prisma.checklistRunAssignment.update({ where: { id: assignment.id }, data: { reason: 'Tentativa de reescrita' } }),
        /append-only/
    );

    const ownerAccess = await prisma.userEstablishmentAccess.create({
        data: { userEstablishmentId: admin.membership.id, mode: 'PROFILED', version: 1 }
    });
    await prisma.accessConfiguration.create({ data: {
        accessId: ownerAccess.id,
        profileCode: 'OWNER', profileVersion: 1, status: 'ACTIVE', basedOnLegacyRole: 'ADMIN',
        createdByMembershipId: admin.membership.id, activatedByMembershipId: admin.membership.id, activatedAt: new Date()
    } });
    process.env.USER_PERMISSIONS_ENABLED = 'true';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'false';
    assert.equal((await request('/api/checklists/runs')).status, 403);
});

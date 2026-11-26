const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.OPERATIONAL_ASSIGNMENT_HTTP_TEST_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest('APIs de vínculos operacionais preservam matriz PROFILED, LEGACY e permissões existentes', async t => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'o2-local-http-secret';
    process.env.NODE_ENV = 'test';
    process.env.USER_PERMISSIONS_ENABLED = 'true';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'false';

    const jwt = require('jsonwebtoken');
    const prisma = require('../src/utils/prisma');
    const service = require('../src/services/operationalStructureService');
    const app = require('../src/app');
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `O2 HTTP ${suffix}` } });
    const establishment = await prisma.establishments.create({ data: { name: 'O2 HTTP Unit', organizationId: organization.id } });
    const definitions = [
        ['OWNER', 'ADMIN'], ['ADMINISTRATOR', 'ADMIN'], ['MANAGER', 'MANAGER'],
        ['SUPERVISOR', 'STAFF'], ['COLLABORATOR', 'STAFF'], ['AUDITOR', 'STAFF']
    ];
    const actors = {};
    for (const [profileCode, legacyRole] of definitions) {
        const user = await prisma.users.create({ data: {
            name: profileCode, email: `${profileCode.toLowerCase()}-${suffix}@o2.local`, password: 'local'
        } });
        const membership = await prisma.userEstablishment.create({ data: { userId: user.id, establishmentId: establishment.id, role: legacyRole } });
        const access = await prisma.userEstablishmentAccess.create({ data: { userEstablishmentId: membership.id, mode: 'PROFILED', version: 1 } });
        await prisma.accessConfiguration.create({ data: {
            accessId: access.id, profileCode, profileVersion: 1, status: 'ACTIVE', basedOnLegacyRole: legacyRole,
            createdByMembershipId: membership.id, activatedByMembershipId: membership.id, activatedAt: new Date()
        } });
        actors[profileCode] = { user, membership, legacyRole };
    }
    const admin = actors.ADMINISTRATOR;
    const adminContext = {
        userId: admin.user.id, membershipId: admin.membership.id, establishmentId: establishment.id,
        organizationId: organization.id, role: admin.legacyRole, membershipActive: true, establishmentActive: true
    };
    const sector = await service.createSector(adminContext, { name: `Caixa ${suffix}` });
    const role = await service.createRole(adminContext, { sectorId: sector.id, name: `Operador ${suffix}` });

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    t.after(async () => {
        process.env.USER_PERMISSIONS_ENABLED = 'false';
        process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';
        await new Promise(resolve => server.close(resolve));
        await prisma.$disconnect();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const bearer = profile => jwt.sign({
        userId: actors[profile].user.id, establishmentId: establishment.id, role: actors[profile].legacyRole
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const request = async (path, { profile, method = 'GET', body } = {}) => {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: {
                ...(profile ? { Authorization: `Bearer ${bearer(profile)}` } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : null };
    };

    for (const profile of ['OWNER', 'ADMINISTRATOR', 'MANAGER', 'SUPERVISOR']) {
        assert.equal((await request('/api/operational-structure/memberships', { profile })).status, 200, profile);
    }
    for (const profile of ['COLLABORATOR', 'AUDITOR']) {
        assert.equal((await request('/api/operational-structure/memberships', { profile })).status, 403, profile);
    }
    const payload = { operationalRoleId: role.id, isPrimary: false, reason: 'Validação HTTP' };
    assert.equal((await request(`/api/operational-structure/memberships/${actors.COLLABORATOR.membership.id}/roles`, {
        profile: 'ADMINISTRATOR', method: 'POST', body: payload
    })).status, 201);
    assert.equal((await request(`/api/operational-structure/memberships/${actors.SUPERVISOR.membership.id}/roles`, {
        profile: 'MANAGER', method: 'POST', body: payload
    })).status, 201);
    for (const profile of ['OWNER', 'SUPERVISOR', 'COLLABORATOR', 'AUDITOR']) {
        assert.equal((await request(`/api/operational-structure/memberships/${actors.AUDITOR.membership.id}/roles`, {
            profile, method: 'POST', body: payload
        })).status, 403, profile);
        const capabilities = await request('/api/operational-structure/capabilities', { profile });
        assert.equal(capabilities.body.capabilities['operational_assignments.manage'], false, profile);
    }
    assert.equal((await request('/api/operational-structure/sectors', { profile: 'COLLABORATOR' })).status, 403);

    process.env.USER_PERMISSIONS_ENABLED = 'false';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';
    assert.equal((await request(`/api/operational-structure/memberships/${actors.AUDITOR.membership.id}/roles`, {
        profile: 'OWNER', method: 'POST', body: payload
    })).status, 201);
    assert.equal((await request(`/api/operational-structure/memberships/${actors.AUDITOR.membership.id}/roles`, {
        profile: 'SUPERVISOR', method: 'POST', body: payload
    })).status, 403);
});

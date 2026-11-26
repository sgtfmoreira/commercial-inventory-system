const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.OPERATIONAL_STRUCTURE_HTTP_TEST_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest('APIs de estrutura operacional preservam PROFILED, LEGACY e isolamento de tenant', async t => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'o1v-local-http-secret';
    process.env.NODE_ENV = 'test';
    process.env.USER_PERMISSIONS_ENABLED = 'true';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'false';

    const jwt = require('jsonwebtoken');
    const prisma = require('../src/utils/prisma');
    const app = require('../src/app');
    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `O1V HTTP ${suffix}` } });
    const neighborOrganization = await prisma.organization.create({ data: { name: `O1V HTTP Neighbor ${suffix}` } });
    const establishment = await prisma.establishments.create({ data: { name: 'O1V HTTP Unit', organizationId: organization.id } });
    const neighborEstablishment = await prisma.establishments.create({ data: { name: 'O1V HTTP Neighbor Unit', organizationId: neighborOrganization.id } });

    const definitions = [
        ['OWNER', 'ADMIN'], ['ADMINISTRATOR', 'ADMIN'], ['MANAGER', 'MANAGER'],
        ['SUPERVISOR', 'STAFF'], ['COLLABORATOR', 'STAFF'], ['AUDITOR', 'STAFF']
    ];
    const actors = {};
    for (const [profileCode, legacyRole] of definitions) {
        const user = await prisma.users.create({
            data: { name: profileCode, email: `${profileCode.toLowerCase()}-${suffix}@o1v.local`, password: 'local' }
        });
        const membership = await prisma.userEstablishment.create({
            data: { userId: user.id, establishmentId: establishment.id, role: legacyRole }
        });
        const access = await prisma.userEstablishmentAccess.create({
            data: { userEstablishmentId: membership.id, mode: 'PROFILED', version: 1 }
        });
        await prisma.accessConfiguration.create({ data: {
            accessId: access.id, profileCode, profileVersion: 1, status: 'ACTIVE',
            basedOnLegacyRole: legacyRole, createdByMembershipId: membership.id,
            activatedByMembershipId: membership.id, activatedAt: new Date()
        } });
        actors[profileCode] = { user, membership, legacyRole };
    }

    const neighbor = await prisma.users.create({
        data: { name: 'Neighbor', email: `neighbor-${suffix}@o1v.local`, password: 'local' }
    });
    const neighborMembership = await prisma.userEstablishment.create({
        data: { userId: neighbor.id, establishmentId: neighborEstablishment.id, role: 'ADMIN' }
    });

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    t.after(async () => {
        process.env.USER_PERMISSIONS_ENABLED = 'false';
        process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';
        await new Promise(resolve => server.close(resolve));
        await prisma.$disconnect();
    });

    const base = `http://127.0.0.1:${server.address().port}`;
    const token = actor => jwt.sign({
        userId: actor.user.id, establishmentId: establishment.id, role: actor.legacyRole
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const neighborToken = jwt.sign({
        userId: neighbor.id, establishmentId: neighborEstablishment.id, role: 'ADMIN'
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const request = async (path, { bearer, method = 'GET', body } = {}) => {
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
    const bearer = profile => token(actors[profile]);

    assert.equal((await request('/api/operational-structure/sectors')).status, 401);
    for (const profile of ['OWNER', 'ADMINISTRATOR', 'MANAGER', 'SUPERVISOR']) {
        assert.equal((await request('/api/operational-structure/sectors', { bearer: bearer(profile) })).status, 200, profile);
    }
    for (const profile of ['COLLABORATOR', 'AUDITOR']) {
        assert.equal((await request('/api/operational-structure/sectors', { bearer: bearer(profile) })).status, 403, profile);
    }

    const ownerSector = await request('/api/operational-structure/sectors', {
        bearer: bearer('OWNER'), method: 'POST', body: { name: `Cozinha ${suffix}` }
    });
    assert.equal(ownerSector.status, 201);
    const adminSector = await request('/api/operational-structure/sectors', {
        bearer: bearer('ADMINISTRATOR'), method: 'POST', body: { name: `Salão ${suffix}` }
    });
    assert.equal(adminSector.status, 201);
    const managerSector = await request('/api/operational-structure/sectors', {
        bearer: bearer('MANAGER'), method: 'POST', body: { name: `Caixa ${suffix}` }
    });
    assert.equal(managerSector.status, 201);
    for (const profile of ['SUPERVISOR', 'COLLABORATOR', 'AUDITOR']) {
        assert.equal((await request('/api/operational-structure/sectors', {
            bearer: bearer(profile), method: 'POST', body: { name: `Negado ${profile} ${suffix}` }
        })).status, 403, profile);
    }

    const role = await request('/api/operational-structure/roles', {
        bearer: bearer('ADMINISTRATOR'), method: 'POST',
        body: { sectorId: ownerSector.body.id, name: `Cozinheiro ${suffix}` }
    });
    assert.equal(role.status, 201);
    assert.equal((await request('/api/operational-structure/sectors', { bearer: bearer('COLLABORATOR') })).status, 403);

    const neighborList = await request('/api/operational-structure/sectors', { bearer: neighborToken });
    assert.equal(neighborList.status, 200);
    assert.equal(neighborList.body.sectors.some(item => item.id === ownerSector.body.id), false);
    assert.equal((await request(`/api/operational-structure/sectors/${ownerSector.body.id}`, { bearer: neighborToken })).status, 404);

    process.env.USER_PERMISSIONS_ENABLED = 'false';
    process.env.USER_PERMISSIONS_KILL_SWITCH = 'true';
    assert.equal((await request('/api/operational-structure/sectors', { bearer: bearer('ADMINISTRATOR') })).status, 200);
    assert.equal((await request('/api/operational-structure/sectors', { bearer: bearer('MANAGER') })).status, 200);
    assert.equal((await request('/api/operational-structure/sectors', { bearer: bearer('SUPERVISOR') })).status, 403);
    assert.equal((await request('/api/operational-structure/sectors', {
        bearer: bearer('MANAGER'), method: 'POST', body: { name: `Legacy manager ${suffix}` }
    })).status, 201);
    assert.equal((await request('/api/operational-structure/sectors', {
        bearer: bearer('SUPERVISOR'), method: 'POST', body: { name: `Legacy denied ${suffix}` }
    })).status, 403);
});

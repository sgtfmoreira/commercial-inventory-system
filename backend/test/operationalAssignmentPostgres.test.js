const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.OPERATIONAL_ASSIGNMENT_TEST_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest('vínculos funcionário-função preservam escopo, histórico e autorização existente', async t => {
    process.env.DATABASE_URL = databaseUrl;
    const prisma = require('../src/utils/prisma');
    const service = require('../src/services/operationalStructureService');
    t.after(() => prisma.$disconnect());

    const suffix = randomUUID();
    const organization = await prisma.organization.create({ data: { name: `O2 ${suffix}` } });
    const unit = await prisma.establishments.create({ data: { name: 'O2 Unit', organizationId: organization.id } });
    const neighborUnit = await prisma.establishments.create({ data: { name: 'O2 Neighbor', organizationId: organization.id } });
    const adminUser = await prisma.users.create({ data: { name: 'O2 Admin', email: `admin-${suffix}@o2.local`, password: 'local' } });
    const workerUser = await prisma.users.create({ data: { name: 'Juliana', email: `juliana-${suffix}@o2.local`, password: 'local' } });
    const inactiveUser = await prisma.users.create({ data: { name: 'Inactive', email: `inactive-${suffix}@o2.local`, password: 'local' } });
    const neighborUser = await prisma.users.create({ data: { name: 'Neighbor', email: `neighbor-${suffix}@o2.local`, password: 'local' } });
    const admin = await prisma.userEstablishment.create({ data: { userId: adminUser.id, establishmentId: unit.id, role: 'ADMIN' } });
    const worker = await prisma.userEstablishment.create({ data: { userId: workerUser.id, establishmentId: unit.id, role: 'STAFF' } });
    const inactive = await prisma.userEstablishment.create({ data: { userId: inactiveUser.id, establishmentId: unit.id, role: 'STAFF', isActive: false } });
    const neighbor = await prisma.userEstablishment.create({ data: { userId: neighborUser.id, establishmentId: neighborUnit.id, role: 'ADMIN' } });
    const context = {
        userId: adminUser.id, membershipId: admin.id, establishmentId: unit.id,
        organizationId: organization.id, role: 'ADMIN', membershipActive: true, establishmentActive: true
    };
    const neighborContext = {
        userId: neighborUser.id, membershipId: neighbor.id, establishmentId: neighborUnit.id,
        organizationId: organization.id, role: 'ADMIN', membershipActive: true, establishmentActive: true
    };

    const cash = await service.createSector(context, { name: `Caixa ${suffix}` });
    const front = await service.createSector(context, { name: `Salão ${suffix}` });
    const cashier = await service.createRole(context, { sectorId: cash.id, name: `Operador de caixa ${suffix}` });
    const support = await service.createRole(context, { sectorId: front.id, name: `Apoio de salão ${suffix}` });
    const neighborSector = await service.createSector(neighborContext, { name: `Vizinho ${suffix}` });
    const neighborRole = await service.createRole(neighborContext, { sectorId: neighborSector.id, name: `Função vizinha ${suffix}` });

    const primary = await service.createMembershipRole(context, worker.id, {
        operationalRoleId: cashier.id, isPrimary: true, reason: 'Função principal'
    });
    const secondary = await service.createMembershipRole(context, worker.id, {
        operationalRoleId: support.id, isPrimary: false, reason: 'Apoio eventual'
    });
    assert.equal(primary.isPrimary, true);
    assert.equal(secondary.isPrimary, false);

    await assert.rejects(
        service.createMembershipRole(context, worker.id, { operationalRoleId: cashier.id, isPrimary: false }),
        error => error.statusCode === 409
    );
    await assert.rejects(
        service.createMembershipRole(context, worker.id, { operationalRoleId: support.id, isPrimary: true }),
        error => error.statusCode === 409
    );
    await assert.rejects(
        service.createMembershipRole(context, inactive.id, { operationalRoleId: cashier.id }),
        error => error.statusCode === 409
    );
    await assert.rejects(
        service.createMembershipRole(context, worker.id, { operationalRoleId: neighborRole.id }),
        error => error.statusCode === 404
    );
    await assert.rejects(
        service.setRoleStatus(context, cashier.id, { isActive: false, version: cashier.version }),
        error => error.statusCode === 409
    );

    const endedAt = new Date(new Date(primary.validFrom).getTime() + 1000).toISOString();
    const ended = await service.endMembershipRole(context, primary.id, {
        version: primary.version, endedAt, reason: 'Mudança de responsabilidade'
    });
    assert.equal(ended.status, 'ENDED');
    await assert.rejects(
        service.endMembershipRole(context, primary.id, { version: primary.version, reason: 'Concorrente' }),
        error => error.statusCode === 409
    );
    await assert.rejects(prisma.membershipOperationalRole.delete({ where: { id: primary.id } }));

    const persistedWorker = await prisma.userEstablishment.findUnique({ where: { id: worker.id } });
    assert.equal(persistedWorker.role, 'STAFF');
    assert.equal(persistedWorker.isActive, true);
    assert.equal(await prisma.userEstablishmentAccess.count({ where: { userEstablishmentId: worker.id } }), 0);
    const assignments = await service.listMembershipRoles(context, worker.id);
    assert.equal(assignments.length, 2);
    assert.equal(assignments.filter(item => item.status === 'ACTIVE').length, 1);
    const people = await service.listMemberships(context, { search: 'juliana', active: 'true' });
    assert.equal(people.some(item => item.id === worker.id), true);
    assert.equal(people.find(item => item.id === worker.id).legacyRole, 'STAFF');

    const events = await prisma.securityAuditEvent.findMany({
        where: { entityId: { in: [primary.id, secondary.id] } },
        select: { eventType: true, targetMembershipId: true }
    });
    assert.ok(events.some(event => event.eventType === 'MEMBERSHIP_OPERATIONAL_ROLE_ASSIGNED'));
    assert.ok(events.some(event => event.eventType === 'MEMBERSHIP_OPERATIONAL_ROLE_ENDED'));
    assert.ok(events.every(event => event.targetMembershipId === worker.id));
});

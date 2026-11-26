const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const databaseUrl = process.env.OPERATIONAL_STRUCTURE_TEST_DATABASE_URL;
const postgresTest = databaseUrl ? test : test.skip;

postgresTest('estrutura operacional preserva tenant, integridade, concorrência e auditoria em PostgreSQL', async t => {
    process.env.DATABASE_URL = databaseUrl;
    const prisma = require('../src/utils/prisma');
    const service = require('../src/services/operationalStructureService');
    t.after(() => prisma.$disconnect());

    const suffix = randomUUID();
    const organizationA = await prisma.organization.create({ data: { name: `O1V A ${suffix}` } });
    const organizationB = await prisma.organization.create({ data: { name: `O1V B ${suffix}` } });
    const establishmentA1 = await prisma.establishments.create({ data: { name: 'O1V Unit A1', organizationId: organizationA.id } });
    const establishmentA2 = await prisma.establishments.create({ data: { name: 'O1V Unit A2', organizationId: organizationA.id } });
    const establishmentB1 = await prisma.establishments.create({ data: { name: 'O1V Unit B1', organizationId: organizationB.id } });
    const userA1 = await prisma.users.create({ data: { name: 'O1V Admin A1', email: `a1-${suffix}@o1v.local`, password: 'local' } });
    const userA2 = await prisma.users.create({ data: { name: 'O1V Admin A2', email: `a2-${suffix}@o1v.local`, password: 'local' } });
    const userB1 = await prisma.users.create({ data: { name: 'O1V Admin B1', email: `b1-${suffix}@o1v.local`, password: 'local' } });
    const membershipA1 = await prisma.userEstablishment.create({ data: { userId: userA1.id, establishmentId: establishmentA1.id, role: 'ADMIN' } });
    const membershipA2 = await prisma.userEstablishment.create({ data: { userId: userA2.id, establishmentId: establishmentA2.id, role: 'ADMIN' } });
    const membershipB1 = await prisma.userEstablishment.create({ data: { userId: userB1.id, establishmentId: establishmentB1.id, role: 'ADMIN' } });

    const context = (user, membership, establishment, organization) => ({
        userId: user.id, membershipId: membership.id, establishmentId: establishment.id,
        organizationId: organization.id, role: 'ADMIN', membershipActive: true, establishmentActive: true
    });
    const contextA1 = context(userA1, membershipA1, establishmentA1, organizationA);
    const contextA2 = context(userA2, membershipA2, establishmentA2, organizationA);
    const contextB1 = context(userB1, membershipB1, establishmentB1, organizationB);

    const kitchen = await service.createSector(contextA1, { name: '  COZÍNHA   Principal  ', description: 'Produção' });
    const persistedKitchen = await prisma.operationalSector.findUnique({ where: { id: kitchen.id } });
    assert.equal(kitchen.name, 'COZÍNHA Principal');
    assert.equal(persistedKitchen.normalizedName, 'cozinha principal');

    await assert.rejects(
        service.createSector(contextA1, { name: 'cozinha principal' }),
        error => error.statusCode === 409
    );
    const sameNameA2 = await service.createSector(contextA2, { name: 'Cozinha Principal' });
    const sameNameB1 = await service.createSector(contextB1, { name: 'Cozinha Principal' });
    assert.ok(sameNameA2.id);
    assert.ok(sameNameB1.id);

    const cook = await service.createRole(contextA1, { sectorId: kitchen.id, name: 'Cozinheiro', description: 'Preparo' });
    await assert.rejects(
        service.createRole(contextA2, { sectorId: kitchen.id, name: 'Função cruzada' }),
        error => error.statusCode === 404
    );

    await assert.rejects(
        prisma.$executeRawUnsafe(
            'INSERT INTO "operational_roles" ("id","organizationId","establishmentId","sectorId","name","normalizedName","createdByMembershipId","updatedByMembershipId","createdAt","updatedAt") VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::uuid,$7::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
            randomUUID(), organizationA.id, establishmentA2.id, kitchen.id, 'Cross unit', 'cross unit', membershipA2.id
        )
    );

    const pantry = await service.createSector(contextA1, { name: 'Despensa' });
    const pantryInactive = await service.setSectorStatus(contextA1, pantry.id, { isActive: false, version: pantry.version });
    assert.equal(pantryInactive.isActive, false);
    await assert.rejects(
        service.createRole(contextA1, { sectorId: pantry.id, name: 'Estoquista da despensa' }),
        error => error.statusCode === 409
    );

    await assert.rejects(
        service.setSectorStatus(contextA1, kitchen.id, { isActive: false, version: kitchen.version }),
        error => error.statusCode === 409
    );
    const cookInactive = await service.setRoleStatus(contextA1, cook.id, { isActive: false, version: cook.version });
    const kitchenInactive = await service.setSectorStatus(contextA1, kitchen.id, { isActive: false, version: kitchen.version });
    assert.equal(kitchenInactive.isActive, false);
    await assert.rejects(
        service.setRoleStatus(contextA1, cook.id, { isActive: true, version: cookInactive.version }),
        error => error.statusCode === 409
    );
    const kitchenActive = await service.setSectorStatus(contextA1, kitchen.id, { isActive: true, version: kitchenInactive.version });
    const cookActive = await service.setRoleStatus(contextA1, cook.id, { isActive: true, version: cookInactive.version });
    assert.equal(kitchenActive.isActive, true);
    assert.equal(cookActive.isActive, true);

    const renamed = await service.updateSector(contextA1, kitchen.id, { name: 'Cozinha Central', version: kitchenActive.version });
    await assert.rejects(
        service.updateSector(contextA1, kitchen.id, { description: 'Concorrente', version: kitchenActive.version }),
        error => error.statusCode === 409
    );
    assert.equal(renamed.name, 'Cozinha Central');

    await assert.rejects(
        prisma.$executeRawUnsafe(
            'UPDATE "operational_sectors" SET "establishmentId"=$1::uuid,"updatedByMembershipId"=$2::uuid WHERE "id"=$3::uuid',
            establishmentA2.id, membershipA2.id, kitchen.id
        )
    );
    const immutable = await prisma.operationalSector.findUnique({ where: { id: kitchen.id } });
    assert.equal(immutable.establishmentId, establishmentA1.id);
    assert.equal(immutable.organizationId, organizationA.id);

    const events = await prisma.securityAuditEvent.findMany({
        where: { entityId: { in: [kitchen.id, pantry.id, cook.id] } },
        select: { eventType: true, actorMembershipId: true }
    });
    for (const required of [
        'OPERATIONAL_SECTOR_CREATED', 'OPERATIONAL_ROLE_CREATED', 'OPERATIONAL_ROLE_DEACTIVATED',
        'OPERATIONAL_SECTOR_DEACTIVATED', 'OPERATIONAL_SECTOR_ACTIVATED',
        'OPERATIONAL_ROLE_ACTIVATED', 'OPERATIONAL_SECTOR_UPDATED'
    ]) assert.ok(events.some(event => event.eventType === required), `Evento ausente: ${required}`);
    assert.ok(events.every(event => event.actorMembershipId === membershipA1.id));

    const preservedMemberships = await prisma.userEstablishment.count({
        where: { id: { in: [membershipA1.id, membershipA2.id, membershipB1.id] }, isActive: true }
    });
    assert.equal(preservedMemberships, 3);
});

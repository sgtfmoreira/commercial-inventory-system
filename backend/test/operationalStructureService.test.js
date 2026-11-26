const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://local:local@127.0.0.1:1/local';

const service = require('../src/services/operationalStructureService');
const schemas = require('../src/validations/operationalStructureValidation');

const context = {
    userId: '10000000-0000-4000-8000-000000000001',
    membershipId: '20000000-0000-4000-8000-000000000001',
    establishmentId: '30000000-0000-4000-8000-000000000001',
    organizationId: 'org-a', role: 'ADMIN', membershipActive: true, establishmentActive: true
};

const scope = { id: context.establishmentId, organizationId: context.organizationId, users: [{ id: context.membershipId }] };

test('normaliza nomes sem misturar a apresentação com a chave de unicidade', () => {
    assert.equal(service.cleanName('  Salão   Principal  '), 'Salão Principal');
    assert.equal(service.normalizedName('  SALÃO   Principal  '), 'salao principal');
});

test('contratos rejeitam tenant e ator enviados pelo cliente', () => {
    const sector = { name: 'Cozinha', description: 'Produção' };
    assert.equal(schemas.createSectorSchema.safeParse(sector).success, true);
    assert.equal(schemas.createSectorSchema.safeParse({ ...sector, organizationId: 'org-b' }).success, false);
    assert.equal(schemas.createRoleSchema.safeParse({
        sectorId: context.establishmentId, name: 'Cozinheiro', userId: context.userId
    }).success, false);
    assert.equal(schemas.statusSchema.safeParse({ isActive: false, version: 1 }).success, true);
    assert.equal(schemas.statusSchema.safeParse({ isActive: false, version: 0 }).success, false);
});

test('listagens propagam somente o escopo autenticado e filtros normalizados', async () => {
    let receivedContext;
    let receivedFilters;
    const fakeRepository = {
        findScope: async received => { receivedContext = received; return scope; },
        listSectors: async (received, filters) => { receivedContext = received; receivedFilters = filters; return []; }
    };
    const result = await service.listSectors(context, { search: ' SALÃO ', active: 'true' }, {
        db: {}, repository: fakeRepository
    });
    assert.deepEqual(result, []);
    assert.equal(receivedContext.organizationId, 'org-a');
    assert.equal(receivedContext.establishmentId, context.establishmentId);
    assert.deepEqual(receivedFilters, { search: 'salao', isActive: true });
});

test('falha fechado quando o membership não pertence ao estabelecimento', async () => {
    const fakeRepository = {
        findScope: async () => ({ id: context.establishmentId, organizationId: context.organizationId, users: [] }),
        listSectors: async () => { throw new Error('não deveria consultar'); }
    };
    await assert.rejects(
        service.listSectors(context, {}, { db: {}, repository: fakeRepository }),
        error => error.statusCode === 403
    );
});

test('DTOs não expõem organização, estabelecimento nem memberships internos', () => {
    const sector = service.sectorDto({
        id: 'sector-a', name: 'Cozinha', description: null, isActive: true, version: 1,
        organizationId: 'org-a', establishmentId: context.establishmentId,
        createdByMembershipId: context.membershipId, _count: { roles: 2 }
    });
    assert.deepEqual(Object.keys(sector).sort(), [
        'createdAt', 'deactivatedAt', 'description', 'id', 'isActive', 'name', 'roleCount', 'updatedAt', 'version'
    ]);
    assert.equal(sector.roleCount, 2);
});

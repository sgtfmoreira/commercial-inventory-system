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

test('contratos de vínculo operacional rejeitam tenant, usuário e perfil enviados pelo cliente', () => {
    const valid = { operationalRoleId: context.establishmentId, isPrimary: true, reason: 'Função principal' };
    assert.equal(schemas.createAssignmentSchema.safeParse(valid).success, true);
    assert.equal(schemas.createAssignmentSchema.safeParse({ ...valid, userId: context.userId }).success, false);
    assert.equal(schemas.createAssignmentSchema.safeParse({ ...valid, role: 'ADMIN' }).success, false);
    assert.equal(schemas.endAssignmentSchema.safeParse({ version: 1, reason: 'Mudança de função' }).success, true);
    assert.equal(schemas.endAssignmentSchema.safeParse({ version: 1, reason: 'x' }).success, false);
});

test('vincular função deriva escopo e ator sem alterar o perfil existente', async () => {
    const target = {
        id: '20000000-0000-4000-8000-000000000002',
        userId: '10000000-0000-4000-8000-000000000002', role: 'STAFF', isActive: true,
        user: { id: '10000000-0000-4000-8000-000000000002', name: 'Juliana', email: 'juliana@local.test' }
    };
    const role = { id: context.establishmentId, name: 'Operador de caixa', isActive: true, sector: { id: 'sector-a', name: 'Caixa', isActive: true } };
    let created;
    const tx = { securityAuditEvent: { create: async ({ data }) => data } };
    const fakeDb = { $transaction: callback => callback(tx) };
    const fakeRepository = {
        findScope: async () => scope,
        findMembership: async () => target,
        findRole: async () => role,
        findActiveAssignment: async () => null,
        findActivePrimary: async () => null,
        createAssignment: async data => {
            created = data;
            return { id: 'assignment-a', ...data, status: 'ACTIVE', version: 1, validUntil: null, createdAt: new Date(), endedAt: null, operationalRole: role };
        }
    };
    const result = await service.createMembershipRole(context, target.id, {
        operationalRoleId: role.id, isPrimary: true, reason: 'Função principal'
    }, { db: fakeDb, repository: fakeRepository });
    assert.equal(result.operationalRole.name, 'Operador de caixa');
    assert.equal(created.organizationId, context.organizationId);
    assert.equal(created.establishmentId, context.establishmentId);
    assert.equal(created.createdByMembershipId, context.membershipId);
    assert.equal(target.role, 'STAFF');
    assert.equal(Object.hasOwn(created, 'role'), false);
    assert.equal(Object.hasOwn(created, 'userId'), false);
});

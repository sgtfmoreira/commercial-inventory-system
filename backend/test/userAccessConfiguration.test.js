const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/userAccessConfigurationService');
const repository = require('../src/repositories/userAccessRepository');
const auditRepository = require('../src/repositories/securityAuditRepository');

const context = {
    userId: '11111111-1111-4111-8111-111111111111',
    membershipId: '22222222-2222-4222-8222-222222222222',
    establishmentId: '33333333-3333-4333-8333-333333333333',
    organizationId: 'organization-1'
};

const actor = {
    id: context.membershipId,
    userId: context.userId,
    establishmentId: context.establishmentId,
    role: 'ADMIN',
    isActive: true,
    establishment: { organizationId: context.organizationId },
    access: null
};

const targetBase = {
    id: '44444444-4444-4444-8444-444444444444',
    userId: '55555555-5555-4555-8555-555555555555',
    establishmentId: context.establishmentId,
    role: 'STAFF',
    isActive: true,
    user: { id: '55555555-5555-4555-8555-555555555555', name: 'Target', email: 'target@example.test' },
    establishment: {
        id: context.establishmentId,
        name: 'Unit',
        organizationId: context.organizationId,
        isActive: true
    }
};

async function withRepositoryStubs(target, run) {
    const originals = {
        actor: repository.findActorMembership,
        target: repository.findScopedMembership,
        transaction: repository.withSerializableTransaction,
        audit: auditRepository.create
    };
    const auditEvents = [];
    repository.findActorMembership = async () => actor;
    repository.findScopedMembership = async () => target;
    repository.withSerializableTransaction = async callback => callback({});
    auditRepository.create = async event => { auditEvents.push(event); return event; };
    try {
        return await run(auditEvents);
    } finally {
        repository.findActorMembership = originals.actor;
        repository.findScopedMembership = originals.target;
        repository.withSerializableTransaction = originals.transaction;
        auditRepository.create = originals.audit;
    }
}

test('preview classifica mantidas, concedidas, removidas e negativas sem escrever', () => {
    const diff = service.previewFor('STAFF', {
        profileCode: 'COLLABORATOR',
        profileVersion: 1,
        overrides: []
    });
    assert.ok(diff.maintained.includes('products.read'));
    assert.ok(diff.removed.includes('production.create'));
    assert.ok(diff.unchangedDenied.includes('users.create'));
    assert.equal(new Set([...diff.maintained, ...diff.granted, ...diff.removed, ...diff.unchangedDenied]).size > 100, true);
});

test('autoelevação e OWNER sem autoridade organizacional são bloqueados', async () => {
    await assert.rejects(
        service.assertDelegation({
            actor,
            target: { ...targetBase, userId: actor.userId },
            profileCode: 'COLLABORATOR', profileVersion: 1, overrides: [], db: {}
        }),
        error => error.statusCode === 403
    );
    await assert.rejects(
        service.assertDelegation({
            actor,
            target: targetBase,
            profileCode: 'OWNER', profileVersion: 1, overrides: [],
            db: { organizationAuthority: { findFirst: async () => null } }
        }),
        error => error.statusCode === 403
    );
});

test('override ALLOW indelegável e concessão acima do ator são bloqueados', async () => {
    await assert.rejects(
        service.assertDelegation({
            actor,
            target: targetBase,
            profileCode: 'COLLABORATOR', profileVersion: 1,
            overrides: [{ permissionCode: 'security.owner.manage', effect: 'ALLOW', reason: 'no' }],
            db: {}
        }),
        error => error.statusCode === 403
    );
    const manager = {
        ...actor,
        role: 'MANAGER',
        access: {
            mode: 'PROFILED',
            configurations: [{ profileCode: 'MANAGER', profileVersion: 1, status: 'ACTIVE', overrides: [] }]
        }
    };
    await assert.rejects(
        service.assertDelegation({
            actor: manager, target: targetBase,
            profileCode: 'ADMINISTRATOR', profileVersion: 1, overrides: [], db: {}
        }),
        error => error.statusCode === 403
    );
});

test('queries de acesso são escopadas pela unidade ativa e organização', async () => {
    const original = repository.findScopedMembership;
    let received;
    repository.findScopedMembership = async scope => { received = scope; return null; };
    try {
        await assert.rejects(service.getAccess(context, targetBase.userId), error => error.statusCode === 404);
        assert.deepEqual(received, {
            userId: targetBase.userId,
            establishmentId: context.establishmentId,
            organizationId: context.organizationId
        });
    } finally {
        repository.findScopedMembership = original;
    }
});

test('optimistic locking rejeita draft concorrente antes de qualquer escrita', async () => {
    const target = {
        ...targetBase,
        access: { id: 'access-1', mode: 'LEGACY', version: 3, configurations: [] }
    };
    await withRepositoryStubs(target, async () => {
        await assert.rejects(
            service.saveDraft(context, target.userId, {
                profileCode: 'COLLABORATOR', profileVersion: 1, overrides: [], expectedVersion: 2
            }),
            error => error.statusCode === 409
        );
    });
});

test('ativação e rollback são auditados, versionados e preservam role legado', async () => {
    const draft = {
        id: 'draft-1', profileCode: 'COLLABORATOR', profileVersion: 1,
        status: 'DRAFT', basedOnLegacyRole: 'STAFF', overrides: []
    };
    const target = {
        ...targetBase,
        access: { id: 'access-1', mode: 'LEGACY', version: 4, configurations: [draft] }
    };
    const auditEvents = [];
    const tx = {
        organizationAuthority: { findFirst: async () => null },
        accessConfiguration: {
            update: async ({ data }) => ({ ...draft, ...data, overrides: [] })
        },
        userEstablishmentAccess: { updateMany: async () => ({ count: 1 }) }
    };
    const repo = { withSerializableTransaction: async callback => callback(tx) };
    const audit = { create: async event => { auditEvents.push(event); } };
    const originals = {
        actor: repository.findActorMembership,
        target: repository.findScopedMembership
    };
    repository.findActorMembership = async () => actor;
    repository.findScopedMembership = async () => target;
    try {
        const activated = await service.activate(context, target.userId, {
            expectedVersion: 4,
            confirm: true
        }, { repository: repo, auditRepository: audit });
        assert.equal(activated.mode, 'PROFILED');
        assert.equal(activated.version, 5);
        assert.equal(target.role, 'STAFF');
        assert.equal(auditEvents[0].eventType, 'ACCESS_PROFILE_ACTIVATED');

        target.access.mode = 'PROFILED';
        target.access.version = 5;
        const rolledBack = await service.rollback(context, target.userId, {
            expectedVersion: 5,
            reason: 'Teste controlado'
        }, { repository: repo, auditRepository: audit });
        assert.deepEqual(rolledBack, { mode: 'LEGACY', version: 6 });
        assert.equal(target.role, 'STAFF');
        assert.equal(auditEvents[1].eventType, 'AUTHORIZATION_MODE_ROLLED_BACK');
    } finally {
        repository.findActorMembership = originals.actor;
        repository.findScopedMembership = originals.target;
    }
});

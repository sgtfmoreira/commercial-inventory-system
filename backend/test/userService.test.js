const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createUserService,
    validatePassword,
    normalizeAccesses,
    MAX_ACTIVE_USERS_PER_ORGANIZATION
} = require('../src/services/userService');

const baseInput = overrides => ({
    name: ' Maria ',
    email: ' MARIA@EXAMPLE.COM ',
    password: 'nova-senha',
    actorUserId: 'actor-a',
    organizationId: 'org-a',
    accesses: [{ establishmentId: 'est-a', legacyRole: 'MANAGER', profileCode: 'MANAGER' }],
    ...overrides
});

function createTx({ activeUsers = 2, establishments = ['est-a'], actorEstablishments = establishments } = {}) {
    const calls = { memberships: [], drafts: [], audits: [] };
    const tx = {
        establishments: {
            findMany: async args => establishments
                .filter(id => args.where.id.in.includes(id))
                .map(id => ({ id }))
        },
        organizationAuthority: { findFirst: async () => null },
        users: {
            create: async args => ({ id: 'user-b', name: args.data.name, email: args.data.email }),
            update: async args => ({ id: args.where.id, name: args.data.name, email: args.data.email }),
            findMany: async () => []
        },
        userEstablishment: {
            findMany: async args => {
                if (args.where?.userId === 'actor-a') {
                    return actorEstablishments.map((establishmentId, index) => ({ id: `actor-m-${index}`, establishmentId }));
                }
                if (args.distinct) return Array.from({ length: activeUsers }, (_, index) => ({ userId: `active-${index}` }));
                return [];
            },
            create: async args => {
                const membership = { id: `membership-${args.data.establishmentId}`, ...args.data };
                calls.memberships.push(membership);
                return membership;
            },
            update: async args => ({ id: 'membership-est-a', establishmentId: 'est-a', ...args.data }),
            updateMany: async () => ({ count: 1 }),
            count: async () => 1
        },
        userEstablishmentAccess: {
            upsert: async args => ({ id: `access-${args.where.userEstablishmentId}`, version: 1, mode: 'LEGACY' }),
            updateMany: async args => {
                calls.accessUpdate = args;
                return { count: 1 };
            }
        },
        accessConfiguration: {
            findFirst: async () => null,
            create: async args => {
                const draft = { id: 'draft-a', status: 'DRAFT', ...args.data, overrides: args.data.overrides.create };
                calls.drafts.push(draft);
                return draft;
            },
            update: async () => { throw new Error('não esperado'); }
        },
        permissionOverride: { deleteMany: async () => ({ count: 0 }) }
    };
    const db = {
        $transaction: async (callback, options) => {
            calls.transactionOptions = options;
            return callback(tx);
        }
    };
    const audit = { create: async event => calls.audits.push(event) };
    return { tx, db, audit, calls };
}

test('lista vínculos inativos somente nas unidades administráveis para permitir reativação', async () => {
    const fixture = createTx({ actorEstablishments: ['est-a'] });
    const inactiveUser = {
        id: 'user-inactive',
        name: 'Usuário inativo',
        email: 'inactive@example.com',
        establishments: [{ id: 'membership-inactive', establishmentId: 'est-a', role: 'STAFF', isActive: false }]
    };
    let query;
    fixture.db.userEstablishment = fixture.tx.userEstablishment;
    fixture.db.users = {
        findMany: async args => {
            query = args;
            return [inactiveUser];
        }
    };
    const service = createUserService({ db: fixture.db, audit: fixture.audit });

    const result = await service.list({ actorUserId: 'actor-a', organizationId: 'org-a' });

    assert.deepEqual(result, [inactiveUser]);
    assert.deepEqual(query.where.establishments.some, { establishmentId: { in: ['est-a'] } });
    assert.deepEqual(query.select.establishments.where, { establishmentId: { in: ['est-a'] } });
    assert.equal(Object.hasOwn(query.where.establishments.some, 'isActive'), false);
});

test('cria usuário somente nas unidades selecionadas com perfis distintos em DRAFT e modo LEGACY', async () => {
    const fixture = createTx({ establishments: ['est-a', 'est-b'] });
    const service = createUserService({
        db: fixture.db,
        audit: fixture.audit,
        passwordService: { hash: async value => `hash:${value}` }
    });
    const result = await service.create(baseInput({
        accesses: [
            { establishmentId: 'est-a', legacyRole: 'MANAGER', profileCode: 'MANAGER' },
            { establishmentId: 'est-b', legacyRole: 'STAFF', profileCode: 'AUDITOR' }
        ]
    }));

    assert.deepEqual(fixture.calls.memberships.map(item => item.establishmentId), ['est-a', 'est-b']);
    assert.deepEqual(fixture.calls.memberships.map(item => item.role), ['MANAGER', 'STAFF']);
    assert.deepEqual(fixture.calls.drafts.map(item => item.profileCode), ['MANAGER', 'AUDITOR']);
    assert.ok(fixture.calls.drafts.every(item => item.status === 'DRAFT'));
    assert.ok(result.accesses.every(item => item.mode === 'LEGACY'));
    assert.equal(fixture.calls.audits.length, 2);
    assert.equal(fixture.calls.transactionOptions.isolationLevel, 'Serializable');
});

test('não propaga acesso automaticamente para unidades futuras ou não selecionadas', async () => {
    const fixture = createTx({ establishments: ['est-a', 'est-b'], actorEstablishments: ['est-a', 'est-b'] });
    const service = createUserService({ db: fixture.db, audit: fixture.audit, passwordService: { hash: async () => 'hash' } });
    await service.create(baseInput({ accesses: [{ establishmentId: 'est-a', legacyRole: 'STAFF', profileCode: 'COLLABORATOR' }] }));
    assert.deepEqual(fixture.calls.memberships.map(item => item.establishmentId), ['est-a']);
});

test('bloqueia o 11º usuário ativo sem criar registro', async () => {
    const fixture = createTx({ activeUsers: MAX_ACTIVE_USERS_PER_ORGANIZATION });
    let created = false;
    fixture.tx.users.create = async () => { created = true; };
    const service = createUserService({ db: fixture.db, audit: fixture.audit, passwordService: { hash: async () => 'hash' } });
    await assert.rejects(() => service.create(baseInput()), error => error.statusCode === 409 && /limite de 10/.test(error.message));
    assert.equal(created, false);
});

test('rejeita unidade de outra organização e unidade não administrada', async () => {
    const crossTenant = createTx({ establishments: [] });
    const crossService = createUserService({ db: crossTenant.db, audit: crossTenant.audit, passwordService: { hash: async () => 'hash' } });
    await assert.rejects(() => crossService.create(baseInput()), error => error.statusCode === 403);

    const unauthorized = createTx({ establishments: ['est-a'], actorEstablishments: [] });
    const unauthorizedService = createUserService({ db: unauthorized.db, audit: unauthorized.audit, passwordService: { hash: async () => 'hash' } });
    await assert.rejects(() => unauthorizedService.create(baseInput()), error => error.statusCode === 403);
});

test('somente OWNER organizacional explícito pode preparar perfil OWNER', async () => {
    const fixture = createTx();
    const service = createUserService({ db: fixture.db, audit: fixture.audit, passwordService: { hash: async () => 'hash' } });
    await assert.rejects(
        () => service.create(baseInput({ accesses: [{ establishmentId: 'est-a', legacyRole: 'ADMIN', profileCode: 'OWNER' }] })),
        error => error.statusCode === 403
    );
});

test('reativação de usuário inativo também respeita o limite organizacional', async () => {
    const fixture = createTx({ activeUsers: 10 });
    fixture.tx.userEstablishment.findMany = async args => {
        if (args.where?.userId === 'actor-a') return [{ id: 'actor-m', establishmentId: 'est-a' }];
        if (args.where?.userId === 'user-b') return [{ id: 'membership-est-a', establishmentId: 'est-a', role: 'STAFF', isActive: false }];
        if (args.distinct) return Array.from({ length: 10 }, (_, index) => ({ userId: `active-${index}` }));
        return [];
    };
    const service = createUserService({ db: fixture.db, audit: fixture.audit });
    await assert.rejects(
        () => service.update('user-b', baseInput({ password: undefined, accesses: [{ establishmentId: 'est-a', legacyRole: 'STAFF' }] })),
        error => error.statusCode === 409 && /limite de 10/.test(error.message)
    );
});

test('falha serializável é repetida sem ultrapassar o limite silenciosamente', async () => {
    const fixture = createTx();
    let attempts = 0;
    fixture.db.$transaction = async (callback, options) => {
        attempts += 1;
        if (attempts === 1) {
            const error = new Error('serialization conflict');
            error.code = 'P2034';
            throw error;
        }
        fixture.calls.transactionOptions = options;
        return callback(fixture.tx);
    };
    const service = createUserService({ db: fixture.db, audit: fixture.audit, passwordService: { hash: async () => 'hash' } });
    await service.create(baseInput());
    assert.equal(attempts, 2);
    assert.equal(fixture.calls.transactionOptions.isolationLevel, 'Serializable');
});

test('impede autoalteração de acessos e preserva validação de senha', async () => {
    const fixture = createTx();
    const service = createUserService({ db: fixture.db, audit: fixture.audit });
    await assert.rejects(
        () => service.update('actor-a', baseInput({ password: undefined })),
        error => error.statusCode === 403
    );
    assert.doesNotThrow(() => validatePassword('123456'));
    assert.throws(() => validatePassword('12345'), /entre 6 e 128/);
    assert.throws(() => normalizeAccesses({
        accesses: [
            { establishmentId: 'est-a', legacyRole: 'STAFF' },
            { establishmentId: 'est-a', legacyRole: 'STAFF' }
        ]
    }), /únicos/);
});

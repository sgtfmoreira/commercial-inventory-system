const test = require('node:test');
const assert = require('node:assert/strict');

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send() { return this; }
});

function loadController(service) {
    const servicePath = require.resolve('../src/services/userService');
    const controllerPath = require.resolve('../src/controllers/userController');
    const original = require.cache[servicePath];
    require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: service };
    delete require.cache[controllerPath];
    const controller = require('../src/controllers/userController');
    return {
        controller,
        restore() {
            delete require.cache[controllerPath];
            if (original) require.cache[servicePath] = original;
            else delete require.cache[servicePath];
        }
    };
}

test('criação deriva organização e ator da sessão e preserva acessos explícitos', async () => {
    let received;
    const loaded = loadController({
        create: async input => { received = input; return { id: 'user-b', accesses: input.accesses }; }
    });
    const req = {
        body: {
            name: 'Maria', email: 'maria@example.com', password: '123456',
            accesses: [{ establishmentId: 'est-b', legacyRole: 'STAFF', profileCode: 'AUDITOR' }]
        },
        user: { userId: 'actor-a', establishmentId: 'est-a', organizationId: 'org-a' }
    };
    const res = response();
    await loaded.controller.create(req, res);
    loaded.restore();

    assert.equal(res.statusCode, 201);
    assert.equal(received.actorUserId, 'actor-a');
    assert.equal(received.organizationId, 'org-a');
    assert.equal(received.accesses[0].establishmentId, 'est-b');
});

test('contrato LEGACY continua limitado ao estabelecimento ativo', async () => {
    let received;
    const loaded = loadController({
        create: async input => { received = input; return { id: 'user-b' }; }
    });
    const req = {
        body: { name: 'Maria', email: 'maria@example.com', password: '123456', role: 'MANAGER' },
        user: { userId: 'actor-a', establishmentId: 'est-a', organizationId: 'org-a' }
    };
    const res = response();
    await loaded.controller.create(req, res);
    loaded.restore();

    assert.deepEqual(received.accesses, [{
        establishmentId: 'est-a', legacyRole: 'MANAGER',
        profileCode: undefined, profileVersion: undefined, overrides: undefined
    }]);
});

test('erro de domínio do service preserva status HTTP', async () => {
    const error = new Error('A organização atingiu o limite de 10 usuários ativos.');
    error.statusCode = 409;
    const loaded = loadController({ create: async () => { throw error; } });
    const req = {
        body: { name: 'Maria', email: 'maria@example.com', password: '123456', role: 'MANAGER' },
        user: { userId: 'actor-a', establishmentId: 'est-a', organizationId: 'org-a' }
    };
    const res = response();
    await loaded.controller.create(req, res);
    loaded.restore();
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /limite de 10/);
});

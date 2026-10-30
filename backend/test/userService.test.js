const test = require('node:test');
const assert = require('node:assert/strict');
const { createUserService, validatePassword } = require('../src/services/userService');

const transactionDb = tx => ({
    $transaction: async callback => callback(tx)
});

test('atualiza a senha usando hash e nunca persiste o valor aberto', async () => {
    let userUpdate;
    const tx = {
        users: {
            update: async args => {
                userUpdate = args;
                return { id: 'user-b', name: args.data.name, email: args.data.email };
            }
        },
        userEstablishment: { update: async () => ({}) }
    };
    const passwordService = {
        hash: async (password, rounds) => `hash:${rounds}:${password}`
    };
    const service = createUserService({ db: transactionDb(tx), passwordService });

    await service.update('user-b', {
        name: ' Maria ',
        email: ' MARIA@EXAMPLE.COM ',
        password: 'nova-senha',
        role: 'MANAGER',
        establishmentId: 'est-a'
    });

    assert.equal(userUpdate.data.name, 'Maria');
    assert.equal(userUpdate.data.email, 'maria@example.com');
    assert.equal(userUpdate.data.password, 'hash:10:nova-senha');
    assert.notEqual(userUpdate.data.password, 'nova-senha');
});

test('revoga todos os vínculos ativos da organização e preserva o usuário', async () => {
    let updateMany;
    const tx = {
        establishments: {
            findUnique: async () => ({ organizationId: 'org-a' }),
            findMany: async () => [{ id: 'est-a' }, { id: 'est-b' }]
        },
        userEstablishment: {
            findMany: async args => args.where.userId
                ? [{ role: 'STOCK_COUNTER' }, { role: 'STOCK_COUNTER' }]
                : [],
            updateMany: async args => {
                updateMany = args;
                return { count: 2 };
            }
        }
    };
    const service = createUserService({ db: transactionDb(tx) });

    const result = await service.deactivate({
        userId: 'user-b',
        actorUserId: 'admin-a',
        establishmentId: 'est-a'
    });

    assert.deepEqual(updateMany.where.establishmentId.in, ['est-a', 'est-b']);
    assert.equal(updateMany.data.isActive, false);
    assert.equal(result.revokedMemberships, 2);
    assert.equal(tx.users, undefined);
});

test('impede autoexclusão e exclusão do último administrador', async () => {
    const selfService = createUserService({ db: transactionDb({}) });
    await assert.rejects(
        () => selfService.deactivate({ userId: 'admin-a', actorUserId: 'admin-a', establishmentId: 'est-a' }),
        /próprio usuário/
    );

    const tx = {
        establishments: {
            findUnique: async () => ({ organizationId: 'org-a' }),
            findMany: async () => [{ id: 'est-a' }]
        },
        userEstablishment: {
            findMany: async args => args.where.userId
                ? [{ role: 'ADMIN' }]
                : [{ userId: 'admin-b' }],
            updateMany: async () => {
                throw new Error('não deveria revogar');
            }
        }
    };
    const service = createUserService({ db: transactionDb(tx) });
    await assert.rejects(
        () => service.deactivate({ userId: 'admin-b', actorUserId: 'admin-a', establishmentId: 'est-a' }),
        /último administrador/
    );
});

test('valida os limites da nova senha', () => {
    assert.doesNotThrow(() => validatePassword('123456'));
    assert.throws(() => validatePassword('12345'), /entre 6 e 128/);
    assert.throws(() => validatePassword('a'.repeat(129)), /entre 6 e 128/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

test('middleware recusa imediatamente uma associação de usuário revogada', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const prismaPath = require.resolve('../src/utils/prisma');
    const middlewarePath = require.resolve('../src/middlewares/authMiddleware');
    require.cache[prismaPath] = {
        id: prismaPath,
        filename: prismaPath,
        loaded: true,
        exports: {
            userEstablishment: {
                findUnique: async () => ({ role: 'ADMIN', isActive: false })
            }
        }
    };
    delete require.cache[middlewarePath];
    const authMiddleware = require('../src/middlewares/authMiddleware');
    const token = jwt.sign({ userId: 'user-a', establishmentId: 'est-a', role: 'ADMIN' }, process.env.JWT_SECRET);
    const request = { headers: { authorization: `Bearer ${token}` } };
    const response = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    let nextCalled = false;

    await authMiddleware(request, response, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
    assert.match(response.body.error, /não tem acesso/);
});

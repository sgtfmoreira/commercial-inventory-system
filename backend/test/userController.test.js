const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../src/controllers/userController');

const response = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send() { return this; }
});

test('administrador não pode remover o próprio perfil pela edição', async () => {
    const req = {
        params: { id: 'admin-a' },
        body: { name: 'Admin', email: 'admin@example.com', role: 'STOCK_COUNTER' },
        user: { userId: 'admin-a', establishmentId: 'est-a', role: 'ADMIN' }
    };
    const res = response();

    await controller.update(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /próprio perfil de administrador/);
});

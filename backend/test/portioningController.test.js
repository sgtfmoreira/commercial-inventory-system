const test = require('node:test');
const assert = require('node:assert/strict');

let receivedInput;
const servicePath = require.resolve('../src/services/portioningService');
require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
        createOrder: async input => {
            receivedInput = input;
            return { id: 'order' };
        }
    }
};

const controller = require('../src/controllers/portioningController');

test('criação da ordem usa o userId definido pelo middleware de autenticação', async () => {
    const req = {
        body: { sourceProductId: 'source', sourceQuantity: 1, items: [] },
        user: { userId: 'authenticated-user', establishmentId: 'establishment' }
    };

    const response = await new Promise((resolve, reject) => {
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(body) { resolve({ statusCode: this.statusCode, body }); }
        };
        controller.createOrder(req, res, reject);
    });

    assert.equal(response.statusCode, 201);
    assert.equal(receivedInput.createdBy, 'authenticated-user');
    assert.equal(receivedInput.establishmentId, 'establishment');
    assert.equal(response.body.data.id, 'order');
});

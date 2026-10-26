const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventCustomerService } = require('../src/services/eventCustomerService');

test('lista clientes com paginação limitada ao estabelecimento', async () => {
    const calls = [];
    const repository = {
        listCustomers: async (...args) => { calls.push(args); return [{ id: 'c1', name: 'Cliente' }]; },
        countCustomers: async () => 1
    };
    const service = createEventCustomerService({ repository });
    const result = await service.list('est-a', { page: 2, pageSize: 10, search: 'cli' });
    assert.deepEqual(result, { items: [{ id: 'c1', name: 'Cliente' }], page: 2, pageSize: 10, total: 1 });
    assert.equal(calls[0][0], 'est-a');
    assert.deepEqual(calls[0][1], { search: 'cli', skip: 10, take: 10 });
});

test('criação ignora tenant externo e normaliza campos opcionais', async () => {
    let created;
    const service = createEventCustomerService({ repository: {
        createCustomer: async data => { created = data; return { id: 'c1', ...data }; }
    } });
    await service.create({ name: '  Cliente  ', document: '', phone: null, email: ' a@b.com ' }, 'est-a');
    assert.equal(created.establishmentId, 'est-a');
    assert.equal(created.name, 'Cliente');
    assert.equal(created.document, null);
    assert.equal(created.email, 'a@b.com');
});

test('edição não encontra cliente de outro tenant', async () => {
    const service = createEventCustomerService({ repository: { findCustomer: async () => null } });
    await assert.rejects(service.update('c1', { name: 'Novo' }, 'est-b'), error => error.statusCode === 404);
});

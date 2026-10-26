const test = require('node:test');
const assert = require('node:assert/strict');
const { createCommercialEventService } = require('../src/services/commercialEventService');
const { buildCommercialEvent } = require('./helpers/eventFixtures');

const fixedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const database = { $transaction: async callback => callback({ tx: true }) };

test('lista responsaveis ativos do estabelecimento com seus papeis', async () => {
    const service = createCommercialEventService({ repository: {
        listResponsibleUsers: async establishmentId => establishmentId === 'est-a' ? [
            { role: 'MANAGER', user: { id: 'user-a', name: 'Ana', email: 'ana@example.com' } }
        ] : []
    }, database });
    assert.deepEqual(await service.listResponsibleUsers('est-a'), [
        { id: 'user-a', name: 'Ana', email: 'ana@example.com', role: 'MANAGER' }
    ]);
});

test('lista historico dedicado somente depois de validar o evento no tenant', async () => {
    const calls = [];
    const repository = {
        expireBudgets: async () => {},
        findEvent: async (_id, establishmentId) => establishmentId === 'est-a' ? { id: 'event-1' } : null,
        listEventBudgets: async (id, establishmentId) => { calls.push([id, establishmentId]); return [{ id: 'budget-1', revision: 1 }]; }
    };
    const service = createCommercialEventService({ repository, database });
    assert.deepEqual(await service.listBudgets('event-1', 'est-a'), [{ id: 'budget-1', revision: 1 }]);
    assert.deepEqual(calls, [['event-1', 'est-a']]);
    await assert.rejects(service.listBudgets('event-1', 'est-b'), error => error.statusCode === 404);
});

test('cria evento e revisão 1 atomicamente usando tenant e usuário autenticados', async () => {
    const calls = { event: null, budget: null, audit: null };
    const repository = {
        expireBudgets: async () => {},
        findCustomer: async (_id, establishmentId) => establishmentId === 'est-a' ? { id: 'customer' } : null,
        findResponsibleUser: async () => ({ userId: 'user-a' }),
        createEvent: async data => { calls.event = data; return data; },
        createBudget: async data => { calls.budget = data; return data; },
        createAudit: async data => { calls.audit = data; },
        findEvent: async id => ({ ...calls.event, id, customer: {}, budgets: [{ revision: 1, status: 'DRAFT' }], approvedBudget: null })
    };
    const service = createCommercialEventService({ repository, database, uuid: () => fixedId });
    const result = await service.create(buildCommercialEvent(), 'est-a', 'user-a');

    assert.equal(result.code, 'EV-2026-AAAAAAAA');
    assert.equal(result.eventDate, '2026-11-15');
    assert.equal(result.startTime, '19:00');
    assert.equal(calls.event.establishmentId, 'est-a');
    assert.equal(calls.event.status, 'BUDGETING');
    assert.deepEqual(calls.budget, { eventId: fixedId, revision: 1, guestCountSnapshot: 150, createdByUserId: 'user-a' });
    assert.equal(calls.audit.establishmentId, 'est-a');
});

test('recusa cliente e responsável de outro estabelecimento', async () => {
    const noCustomer = createCommercialEventService({ repository: { findCustomer: async () => null }, database, uuid: () => fixedId });
    await assert.rejects(noCustomer.create(buildCommercialEvent(), 'est-a', 'user-a'), error => error.statusCode === 422);

    const noResponsible = createCommercialEventService({ repository: {
        findCustomer: async () => ({ id: 'customer' }), findResponsibleUser: async () => null
    }, database, uuid: () => fixedId });
    await assert.rejects(noResponsible.create(buildCommercialEvent(), 'est-a', 'user-a'), error => error.statusCode === 422);
});

test('impede editar evento sem revisão em rascunho', async () => {
    const service = createCommercialEventService({ repository: {
        expireBudgets: async () => {},
        findEvent: async () => ({ id: 'event', status: 'BUDGETING', budgets: [{ status: 'SENT' }] })
    }, database });
    await assert.rejects(service.update('event', { name: 'Novo' }, 'est-a'), error => error.statusCode === 409);
});

test('cancelamento é idempotente e cancela revisões abertas', async () => {
    let updates = 0;
    let budgetCancels = 0;
    const repository = {
        expireBudgets: async () => {},
        findEvent: async () => ({ id: 'event', status: updates ? 'CANCELLED' : 'BUDGETING', eventDate: new Date('2026-11-15Z'), budgets: [] }),
        updateEvent: async () => { updates += 1; },
        cancelOpenBudgets: async () => { budgetCancels += 1; },
        createAudit: async () => {}
    };
    const service = createCommercialEventService({ repository, database });
    await service.cancel('event', 'est-a');
    await service.cancel('event', 'est-a');
    assert.equal(updates, 1);
    assert.equal(budgetCancels, 1);
});

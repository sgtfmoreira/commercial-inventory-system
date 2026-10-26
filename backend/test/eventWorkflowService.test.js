const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventWorkflowService } = require('../src/services/eventWorkflowService');

const database = { $transaction: async callback => callback({ tx: true }) };
const now = new Date('2026-10-06T12:00:00.000Z');

const budget = (overrides = {}) => ({
    id: 'budget-1', eventId: 'event-1', revision: 1, status: 'DRAFT', items: [],
    event: { id: 'event-1', code: 'EV-2026-TEST', name: 'Evento X', type: 'CORPORATE',
        eventDate: new Date('2026-11-15T00:00:00.000Z'), startTime: new Date('1970-01-01T19:00:00.000Z'),
        endTime: new Date('1970-01-01T23:00:00.000Z'), guestCount: 100, location: 'Salão',
        approvedBudgetId: null, customer: { id: 'customer-1', name: 'Cliente X', document: null, phone: null, email: null } },
    ...overrides
});

test('envio recalcula, valida e congela snapshots do cliente e evento', async () => {
    const updates = [];
    let current = budget();
    const repository = {
        findBudget: async () => current,
        updateBudget: async (_id, data) => { updates.push(data); current = { ...current, ...data }; },
        createAudit: async () => {}
    };
    const recalculated = { ...current, readyToSend: true, qualityChecklist: [] };
    const service = createEventWorkflowService({ repository, database,
        budgetService: { recalculateBudget: async () => recalculated }, clock: () => now });
    const result = await service.send('budget-1', 'est-a', 'user-a');
    assert.equal(result.status, 'SENT');
    assert.equal(updates[0].sentAt, now);
    assert.equal(updates[0].customerSnapshot.name, 'Cliente X');
    assert.equal(updates[0].eventSnapshot.eventDate, '2026-11-15');
});

test('envio bloqueia checklist incompleto', async () => {
    const current = budget();
    const service = createEventWorkflowService({
        repository: { findBudget: async () => current }, database,
        budgetService: { recalculateBudget: async () => ({ ...current, readyToSend: false,
            qualityChecklist: [{ passed: false, label: 'Preço informado' }] }) }
    });
    await assert.rejects(service.send('budget-1', 'est-a', 'user-a'), error => error.statusCode === 422 && error.message.includes('Preço informado'));
});

test('nova revisão copia premissas e itens sem reutilizar snapshots comerciais', async () => {
    const source = budget({ status: 'REJECTED', quotedPrice: '9000', items: [{ id: 'item-1', itemType: 'MANUAL', costGroup: 'MENU', nameSnapshot: 'Canapé', quantityMode: 'FIXED', fixedQuantity: '100', plannedQuantity: '100', unitSnapshot: 'un', unitCostSnapshot: '2', totalCost: '200', visibleInProposal: true, sortOrder: 0 }] });
    let created;
    const repository = {
        findBudget: async id => id === 'budget-2' ? { ...source, id, revision: 2, status: 'DRAFT' } : source,
        latestBudget: async () => ({ revision: 1 }),
        createBudget: async data => { created = data; return { id: 'budget-2', revision: data.revision }; },
        createAudit: async () => {}
    };
    const service = createEventWorkflowService({ repository, database });
    await service.newRevision('budget-1', 'est-a', 'user-a');
    assert.equal(created.revision, 2);
    assert.equal(created.parentBudgetId, 'budget-1');
    assert.equal(created.customerSnapshot, null);
    assert.equal(created.items.create[0].nameSnapshot, 'Canapé');
    assert.equal('id' in created.items.create[0], false);
});

test('aprovação é atômica, cancela abertas e vincula orçamento ao evento', async () => {
    let current = budget({ status: 'SENT' });
    const calls = [];
    const repository = {
        findBudget: async () => current,
        updateBudgets: async (where, data) => calls.push(['others', where, data]),
        updateBudget: async (_id, data) => { calls.push(['budget', data]); current = { ...current, ...data }; },
        updateEvent: async (_id, _establishmentId, data) => calls.push(['event', data]),
        createAudit: async () => calls.push(['audit'])
    };
    const service = createEventWorkflowService({ repository, database, clock: () => now });
    const result = await service.approve('budget-1', 'est-a', 'user-a');
    assert.equal(result.status, 'APPROVED');
    assert.deepEqual(calls.find(call => call[0] === 'event')[1], { status: 'APPROVED', approvedBudgetId: 'budget-1' });
    assert.equal(calls.find(call => call[0] === 'others')[2].status, 'CANCELLED');
});

test('conflito concorrente de aprovação retorna 409', async () => {
    const databaseWithConflict = { $transaction: async () => { const error = new Error('conflict'); error.code = 'P2034'; throw error; } };
    const service = createEventWorkflowService({ repository: {}, database: databaseWithConflict });
    await assert.rejects(service.approve('budget-1', 'est-a', 'user-a'), error => error.statusCode === 409);
});

test('conflito concorrente de nova revisao retorna 409', async () => {
    const databaseWithConflict = { $transaction: async () => { const error = new Error('conflict'); error.code = 'P2034'; throw error; } };
    const service = createEventWorkflowService({ repository: {}, database: databaseWithConflict });
    await assert.rejects(service.newRevision('budget-1', 'est-a', 'user-a'), error => error.statusCode === 409);
});

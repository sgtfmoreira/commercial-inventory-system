const test = require('node:test');
const assert = require('node:assert/strict');
const { createTableReservationService } = require('../src/services/tableReservationService');

const date = new Date('2026-10-20T00:00:00.000Z');
const time = new Date('1970-01-01T19:30:00.000Z');
const record = (overrides = {}) => ({
    id: 'reservation-a', establishmentId: 'est-a', tableNumber: 26,
    reservationDate: date, reservationTime: time, customerName: 'Cliente A', phone: null,
    partySize: 4, notes: null, status: 'CONFIRMED', version: 1,
    createdByUserId: 'user-a', updatedByUserId: 'user-a', ...overrides
});
const input = { tableNumber:26, reservationDate:'2026-10-20', reservationTime:'19:30', customerName:'Cliente A', phone:null, partySize:4, notes:null };
const database = { $transaction: async callback => callback({ transaction:true }) };

test('lista somente o tenant e calcula resumo das reservas ativas', async () => {
    let receivedTenant;
    const repository = { listByDate: async tenant => { receivedTenant = tenant; return [record(), record({ id:'b',tableNumber:2,partySize:6 })]; } };
    const service = createTableReservationService({ repository, database });
    const result = await service.list('est-a', { date:'2026-10-20' });
    assert.equal(receivedTenant, 'est-a');
    assert.deepEqual(result.summary, { reservedTables:2, freeTables:25, expectedPeople:10 });
    assert.equal(result.reservations[0].reservationTime, '19:30');
});

test('cria com tenant e usuários autenticados e converte conflito simultâneo em 409', async () => {
    let created;
    const repository = { create: async data => { created = data; return record(data); } };
    const service = createTableReservationService({ repository, database });
    await service.create(input, 'est-a', 'user-a');
    assert.equal(created.establishmentId, 'est-a');
    assert.equal(created.createdByUserId, 'user-a');

    const conflicting = createTableReservationService({ repository: { create: async () => { const error = new Error('unique'); error.code = 'P2002'; throw error; } }, database });
    await assert.rejects(conflicting.create(input, 'est-a', 'user-b'), error => error.statusCode === 409 && /já foi reservada/.test(error.message));
});

test('cria várias mesas atomicamente para o mesmo cliente', async () => {
    const created = [];
    const repository = {
        findActiveForKeys: async () => [],
        create: async (data, client) => {
            assert.equal(client.transaction, true);
            created.push(data);
            return record({ ...data, id:`reservation-${data.tableNumber}` });
        }
    };
    const service = createTableReservationService({ repository, database });
    const { tableNumber, ...details } = input;
    const result = await service.createBatch({ ...details, tableNumbers:[2, 26] }, 'est-a', 'user-a');
    assert.equal(result.count, 2);
    assert.deepEqual(created.map(item => item.tableNumber), [2, 26]);
    assert.ok(created.every(item => item.customerName === 'Cliente A' && item.establishmentId === 'est-a'));
});

test('não cria nenhuma mesa quando o lote possui conflito', async () => {
    let createCalled = false;
    const repository = {
        findActiveForKeys: async () => [record({ tableNumber:26 })],
        create: async () => { createCalled = true; }
    };
    const service = createTableReservationService({ repository, database });
    const { tableNumber, ...details } = input;
    await assert.rejects(
        service.createBatch({ ...details, tableNumbers:[2, 26] }, 'est-a', 'user-a'),
        error => error.statusCode === 409 && /Nenhuma reserva foi criada/.test(error.message)
    );
    assert.equal(createCalled, false);
});

test('impede sobrescrita quando a versão mudou', async () => {
    const repository = { findById: async () => record({ version:3 }) };
    const service = createTableReservationService({ repository, database });
    await assert.rejects(service.update('reservation-a', { customerName:'Outro', version:2 }, 'est-a', 'user-b'), error => error.statusCode === 409 && /outra pessoa/.test(error.message));
});

test('cancelamento preserva registro e incrementa versão por atualização condicional', async () => {
    let update;
    const repository = {
        findById: async () => update ? record({ status:'CANCELLED', version:2 }) : record(),
        updateActiveVersioned: async (id, establishmentId, version, data) => { update = { id, establishmentId, version, data }; return { count:1 }; }
    };
    const service = createTableReservationService({ repository, database });
    const result = await service.cancel('reservation-a', 1, 'est-a', 'user-b');
    assert.equal(update.data.status, 'CANCELLED');
    assert.equal(update.data.updatedByUserId, 'user-b');
    assert.equal(result.status, 'CANCELLED');
});

test('prévia de importação separa conflitos sem sobrescrever reserva existente', async () => {
    const repository = { findActiveForKeys: async () => [{ tableNumber:26, reservationDate:date, customerName:'Já existe' }] };
    const service = createTableReservationService({ repository, database });
    const result = await service.previewImport([input, { ...input, tableNumber:27 }], 'est-a');
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.available.length, 1);
    assert.match(result.conflicts[0].reason, /Já existe/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTableOccupancyService, todayInSaoPaulo } = require('../src/services/tableOccupancyService');
const { createTableOccupancySchema, releaseTableOccupancySchema } = require('../src/validations/tableOccupancyValidation');

const record = (overrides = {}) => ({
    id: 'occupancy-a', establishmentId: 'est-a', tableNumber: 4, customerName: null,
    partySize: 3, notes: null, status: 'ACTIVE', version: 1,
    createdByUserId: 'user-a', releasedByUserId: null, ...overrides
});
const database = { $transaction: async callback => callback({ transaction:true }) };

test('valida ocupação walk-in e liberação', () => {
    assert.equal(createTableOccupancySchema.safeParse({ tableNumber:'4', partySize:'3', customerName:'', notes:null }).success, true);
    assert.equal(createTableOccupancySchema.safeParse({ tableNumber:28, partySize:3 }).success, false);
    assert.equal(createTableOccupancySchema.safeParse({ tableNumber:4, partySize:0 }).success, false);
    assert.equal(releaseTableOccupancySchema.parse({ version:'2' }).version, 2);
});

test('calcula a data atual em São Paulo sem depender do UTC do servidor', () => {
    assert.equal(todayInSaoPaulo(new Date('2026-10-21T01:30:00.000Z')), '2026-10-20');
});

test('lista somente ocupações ativas do estabelecimento e resume pessoas', async () => {
    let tenant;
    const repository = { listActive: async establishmentId => { tenant = establishmentId; return [record(), record({ id:'b', tableNumber:7, partySize:5 })]; } };
    const service = createTableOccupancyService({ repository, database });
    const result = await service.list('est-a');
    assert.equal(tenant, 'est-a');
    assert.deepEqual(result.summary, { occupiedTables:2, seatedPeople:8 });
});

test('cria walk-in somente quando a mesa não está ocupada nem reservada hoje', async () => {
    let created;
    const repository = {
        findActiveByTable: async () => null,
        findReservation: async () => null,
        create: async (data, client) => { assert.equal(client.transaction, true); created = data; return record(data); }
    };
    const service = createTableOccupancyService({ repository, database, now:() => new Date('2026-10-20T15:00:00Z') });
    await service.create({ tableNumber:4, partySize:3, customerName:'Visitante', notes:null }, 'est-a', 'user-a');
    assert.equal(created.establishmentId, 'est-a');
    assert.equal(created.createdByUserId, 'user-a');

    const reserved = createTableOccupancyService({
        repository: { ...repository, findReservation:async () => ({ id:'reservation-a' }) }, database
    });
    await assert.rejects(
        reserved.create({ tableNumber:4, partySize:3 }, 'est-a', 'user-a'),
        error => error.statusCode === 409 && /reserva confirmada/.test(error.message)
    );
});

test('libera a mesa com versão e responsável, preservando histórico', async () => {
    let update;
    const repository = {
        findById: async () => update ? record({ status:'RELEASED', version:2, ...update.data }) : record(),
        releaseActiveVersioned: async (id, establishmentId, version, data) => {
            update = { id, establishmentId, version, data }; return { count:1 };
        }
    };
    const service = createTableOccupancyService({ repository, database, now:() => new Date('2026-10-20T23:00:00Z') });
    const result = await service.release('occupancy-a', 1, 'est-a', 'user-b');
    assert.equal(update.data.status, 'RELEASED');
    assert.equal(update.data.releasedByUserId, 'user-b');
    assert.equal(result.status, 'RELEASED');
});

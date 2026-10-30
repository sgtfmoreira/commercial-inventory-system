const test = require('node:test');
const assert = require('node:assert/strict');
const { createTableOccupancyService, todayInSaoPaulo } = require('../src/services/tableOccupancyService');
const {
    createTableOccupancySchema,
    createBatchTableOccupanciesSchema,
    releaseTableOccupancySchema
} = require('../src/validations/tableOccupancyValidation');

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
    assert.deepEqual(
        createBatchTableOccupanciesSchema.parse({ tableNumbers:['2', '26'], partySize:'8' }).tableNumbers,
        [2, 26]
    );
    assert.equal(createBatchTableOccupanciesSchema.safeParse({ tableNumbers:[2, 2], partySize:8 }).success, false);
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

test('conta as pessoas uma única vez quando várias mesas estão juntas', async () => {
    const repository = {
        listActive: async () => [
            record({ id:'a', tableNumber:2, partySize:8, occupancyGroupId:'group-a' }),
            record({ id:'b', tableNumber:26, partySize:8, occupancyGroupId:'group-a' })
        ]
    };
    const service = createTableOccupancyService({ repository, database });
    const result = await service.list('est-a');
    assert.deepEqual(result.summary, { occupiedTables:2, seatedPeople:8 });
    assert.deepEqual(result.occupancies[0].groupTableNumbers, [2, 26]);
    assert.deepEqual(result.occupancies[1].groupTableNumbers, [2, 26]);
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

test('junta quaisquer mesas livres de forma atômica', async () => {
    const created = [];
    const repository = {
        findActiveForTables: async () => [],
        findReservationsForTables: async () => [],
        create: async (data, client) => {
            assert.equal(client.transaction, true);
            created.push(data);
            return record({ ...data, id:`occupancy-${data.tableNumber}` });
        }
    };
    const service = createTableOccupancyService({ repository, database });
    const result = await service.createBatch(
        { tableNumbers:[2, 26], partySize:8, customerName:'Grupo A', notes:null },
        'est-a',
        'user-a'
    );
    assert.equal(result.count, 2);
    assert.deepEqual(created.map(item => item.tableNumber), [2, 26]);
    assert.ok(created[0].occupancyGroupId);
    assert.equal(created[0].occupancyGroupId, created[1].occupancyGroupId);
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

test('libera todas as mesas juntas em uma única operação', async () => {
    const group = [
        record({ id:'a', tableNumber:2, occupancyGroupId:'group-a' }),
        record({ id:'b', tableNumber:26, occupancyGroupId:'group-a' })
    ];
    let released;
    const repository = {
        findById: async id => released
            ? record({ ...group.find(item => item.id === id), status:'RELEASED', version:2 })
            : group.find(item => item.id === id),
        findActiveGroup: async () => group,
        releaseActiveGroupVersioned: async (groupId, establishmentId, version, data) => {
            released = { groupId, establishmentId, version, data };
            return { count:2 };
        }
    };
    const service = createTableOccupancyService({ repository, database });
    await service.release('a', 1, 'est-a', 'user-b');
    assert.equal(released.groupId, 'group-a');
    assert.equal(released.data.status, 'RELEASED');
    assert.equal(released.data.releasedByUserId, 'user-b');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createTableReservationSchema,
    createBatchTableReservationsSchema,
    updateTableReservationSchema,
    listTableReservationsQuerySchema
} = require('../src/validations/tableReservationValidation');

const valid = {
    tableNumber: 26,
    reservationDate: '2026-10-20',
    reservationTime: '19:30',
    customerName: 'Cliente Teste',
    phone: null,
    partySize: 4,
    notes: null
};

test('aceita reserva válida e converte inteiros', () => {
    const parsed = createTableReservationSchema.parse({ ...valid, tableNumber: '26', partySize: '4' });
    assert.equal(parsed.tableNumber, 26);
    assert.equal(parsed.partySize, 4);
});

test('aceita várias mesas distintas e rejeita seleção duplicada', () => {
    const { tableNumber, ...details } = valid;
    const parsed = createBatchTableReservationsSchema.parse({ ...details, tableNumbers: ['2', '26'] });
    assert.deepEqual(parsed.tableNumbers, [2, 26]);
    assert.equal(createBatchTableReservationsSchema.safeParse({ ...details, tableNumbers: [2] }).success, false);
    assert.equal(createBatchTableReservationsSchema.safeParse({ ...details, tableNumbers: [2, 2] }).success, false);
});

test('rejeita mesa inexistente, quantidade inválida e tenant forjado', () => {
    assert.equal(createTableReservationSchema.safeParse({ ...valid, tableNumber: 28 }).success, false);
    assert.equal(createTableReservationSchema.safeParse({ ...valid, partySize: 0 }).success, false);
    assert.equal(createTableReservationSchema.safeParse({ ...valid, establishmentId: 'forged' }).success, false);
});

test('valida datas reais, horários e versão obrigatória na edição', () => {
    assert.equal(createTableReservationSchema.safeParse({ ...valid, reservationDate: '2026-02-30' }).success, false);
    assert.equal(createTableReservationSchema.safeParse({ ...valid, reservationTime: '25:00' }).success, false);
    assert.equal(updateTableReservationSchema.safeParse({ customerName: 'Novo nome' }).success, false);
    assert.equal(updateTableReservationSchema.safeParse({ customerName: 'Novo nome', version: 2 }).success, true);
    assert.equal(listTableReservationsQuerySchema.parse({ date: '2026-10-20' }).includeCancelled, false);
});

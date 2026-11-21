const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('../scripts/repair-park-stock-locations');
const est = '6dcb1af1-3636-412c-9697-5da785c966f3';
const source = 'dbbd5942-7873-4f91-bcbe-2bc0362acbfa';
const target = '79bfed2c-1fc5-4526-a756-c28ba842b590';
function fixture() {
    return {
        locations: [{ id: source, establishmentId: 'other' }, { id: target, establishmentId: est }],
        products: [{ id: 'water', name: 'Água', defaultLocationId: target, quantity: '40', productStocks: [
            { id: 'bad', locationId: source, quantity: '-18' }, { id: 'good', locationId: target, quantity: '58' }
        ] }],
        movements: [{ id: 'sale', productId: 'water', establishmentId: est, locationId: source,
            type: 'OUT', reason: 'SALE', quantity: '18', previousQuantity: '0', newQuantity: '-18', notes: 'Original' }]
    };
}
test('repair moves the 18-unit debit without changing the 40-unit total or historical values', () => {
    const data = fixture();
    const original = JSON.stringify(data);
    const [plan] = buildPlan(data);
    assert.equal(plan.before, '58');
    assert.equal(plan.after, '40');
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].locationId, target);
    assert.match(plan.updates[0].notes, /Original/);
    assert.deepEqual(Object.keys(plan.updates[0]).sort(), ['id', 'locationId', 'notes']);
    assert.equal(JSON.stringify(data), original);
});
test('repair refuses unexplained balances or unrecognized movements', () => {
    const data = fixture();
    data.products[0].quantity = '39';
    assert.throws(() => buildPlan(data), /Unreconciled/);
    data.products[0].quantity = '40';
    data.movements[0].reason = 'LOSS';
    assert.throws(() => buildPlan(data), /Unexpected movements/);
});
test('repair reconciles a misplaced bonus followed by a sale', () => {
    const data = fixture();
    const sale = data.movements[0];
    data.movements = [{ ...sale, id: 'bonus', type: 'IN', reason: 'BONUS', quantity: '2', previousQuantity: '0', newQuantity: '2' },
        { ...sale, quantity: '20', previousQuantity: '2', newQuantity: '-18' }];
    assert.equal(buildPlan(data)[0].after, '40');
    assert.equal(buildPlan(data)[0].updates.length, 2);
});

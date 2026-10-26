const test = require('node:test');
const assert = require('node:assert/strict');
const {
    EventPricingError,
    calculatePlannedQuantity,
    calculateItemTotal,
    aggregateCosts,
    calculateBudgetPricing
} = require('../src/services/eventPricingService');

const asString = (value) => value === null ? null : value.toFixed();

test('calcula quantidade fixa e por convidado com margem de segurança', () => {
    const fixed = calculatePlannedQuantity({
        quantityMode: 'FIXED', fixedQuantity: '100', safetyPercent: '10'
    });
    const perGuest = calculatePlannedQuantity({
        quantityMode: 'PER_GUEST', quantityPerGuest: '4', guestCount: '150', safetyPercent: '10'
    });

    assert.equal(asString(fixed), '110');
    assert.equal(asString(perGuest), '660');
});

test('calcula custo do item sem usar ponto flutuante binário', () => {
    const total = calculateItemTotal({ plannedQuantity: '0.3', unitCost: '0.2' });
    assert.equal(asString(total), '0.06');
});

test('agrega custos pelo grupo explícito do item manual', () => {
    const costs = aggregateCosts([
        { costGroup: 'MENU', totalCost: '4380' },
        { costGroup: 'STAFF', totalCost: '1720' },
        { costGroup: 'OTHER', totalCost: '300' }
    ]);

    assert.equal(asString(costs.costMenu), '4380');
    assert.equal(asString(costs.costStaff), '1720');
    assert.equal(asString(costs.costOther), '300');
    assert.equal(asString(costs.costTransport), '0');
});

test('reproduz o gross-up do PRD e calcula indicadores do preço negociado', () => {
    const result = calculateBudgetPricing({
        items: [
            { costGroup: 'MENU', totalCost: '4380' },
            { costGroup: 'STAFF', totalCost: '1720' },
            { costGroup: 'EQUIPMENT', totalCost: '800' },
            { costGroup: 'TRANSPORT', totalCost: '600' },
            { costGroup: 'OTHER', totalCost: '300' }
        ],
        desiredMarginPercent: '30',
        taxPercent: '7',
        quotedPrice: '12000',
        guestCount: 150
    });

    assert.equal(result.calculationVersion, 'EVENT_PRICING_V1');
    assert.equal(asString(result.totalCost), '7800');
    assert.equal(asString(result.recommendedPrice), '12380.9524');
    assert.equal(asString(result.expectedFeeAmount), '840');
    assert.equal(asString(result.expectedProfit), '3360');
    assert.equal(asString(result.effectiveMarginPercent), '28');
    assert.equal(asString(result.menuCMVPercent), '36.5');
    assert.equal(asString(result.pricePerGuest), '80');
    assert.equal(asString(result.costPerGuest), '52');
    assert.equal(asString(result.profitPerGuest), '22.4');
    assert.deepEqual(result.warnings, ['MARGIN_BELOW_TARGET']);
});

test('mantém indicadores dependentes de receita nulos sem preço negociado', () => {
    const result = calculateBudgetPricing({
        items: [{ costGroup: 'MENU', totalCost: '500' }],
        desiredMarginPercent: '25',
        guestCount: 10
    });

    assert.equal(asString(result.recommendedPrice), '666.6667');
    assert.equal(result.quotedPrice, null);
    assert.equal(result.expectedProfit, null);
    assert.equal(result.effectiveMarginPercent, null);
    assert.deepEqual(result.warnings, []);
});

test('alerta quando o preço negociado fica abaixo do ponto de equilíbrio', () => {
    const result = calculateBudgetPricing({
        items: [{ costGroup: 'MENU', totalCost: '1000' }],
        desiredMarginPercent: '20',
        taxPercent: '10',
        quotedPrice: '900',
        guestCount: 10
    });

    assert.deepEqual(result.warnings, ['MARGIN_BELOW_TARGET', 'PRICE_BELOW_BREAK_EVEN']);
    assert.equal(asString(result.expectedProfit), '-190');
});

test('rejeita percentuais que zeram o denominador', () => {
    assert.throws(
        () => calculateBudgetPricing({
            items: [], desiredMarginPercent: 80, taxPercent: 20, guestCount: 1
        }),
        (error) => error instanceof EventPricingError && error.code === 'INVALID_PRICING_PERCENTAGES'
    );
});

test('rejeita valores negativos, grupo inválido e convidados zero', () => {
    assert.throws(
        () => calculateItemTotal({ plannedQuantity: 1, unitCost: -1 }),
        (error) => error.code === 'NEGATIVE_VALUE'
    );
    assert.throws(
        () => aggregateCosts([{ costGroup: 'UNKNOWN', totalCost: 1 }]),
        (error) => error.code === 'INVALID_COST_GROUP'
    );
    assert.throws(
        () => calculateBudgetPricing({ items: [], guestCount: 0 }),
        (error) => error.code === 'INVALID_GUEST_COUNT'
    );
});

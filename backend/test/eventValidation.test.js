const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createEventCustomerSchema,
    createCommercialEventSchema,
    updateCommercialEventSchema,
    budgetPricingSchema,
    eventBudgetItemSchema
} = require('../src/validations/eventValidation');
const {
    buildEventCustomer,
    buildCommercialEvent,
    buildBudgetItem
} = require('./helpers/eventFixtures');

test('aceita DTOs válidos de cliente e evento', () => {
    assert.equal(createEventCustomerSchema.safeParse(buildEventCustomer()).success, true);
    const event = createCommercialEventSchema.parse(buildCommercialEvent());
    assert.equal(event.guestCount, 150);
});

test('rejeita tenant forjado, data inválida e horário final anterior', () => {
    assert.equal(createCommercialEventSchema.safeParse({
        ...buildCommercialEvent(), establishmentId: 'forged'
    }).success, false);
    assert.equal(createCommercialEventSchema.safeParse(buildCommercialEvent({
        eventDate: '15/11/2026'
    })).success, false);
    assert.equal(createCommercialEventSchema.safeParse(buildCommercialEvent({
        eventDate: '2026-02-31'
    })).success, false);
    const invalidTime = createCommercialEventSchema.safeParse(buildCommercialEvent({
        startTime: '23:00', endTime: '19:00'
    }));
    assert.equal(invalidTime.success, false);
    assert.match(invalidTime.error.flatten().fieldErrors.endTime[0], /anterior/);
});

test('atualização exige ao menos um campo e valida intervalo quando completo', () => {
    assert.equal(updateCommercialEventSchema.safeParse({}).success, false);
    assert.equal(updateCommercialEventSchema.safeParse({ name: 'Nova versão' }).success, true);
    assert.equal(updateCommercialEventSchema.safeParse({
        startTime: '20:00', endTime: '18:00'
    }).success, false);
});

test('normaliza decimais do orçamento como strings', () => {
    const parsed = budgetPricingSchema.parse({
        desiredMarginPercent: 30,
        taxPercent: '7.5',
        quotedPrice: 12000
    });
    assert.equal(parsed.desiredMarginPercent, '30');
    assert.equal(parsed.taxPercent, '7.5');
    assert.equal(parsed.quotedPrice, '12000');
});

test('rejeita orçamento cuja margem e encargos inviabilizam o preço', () => {
    assert.equal(budgetPricingSchema.safeParse({
        desiredMarginPercent: '80',
        taxPercent: '20'
    }).success, false);
    assert.equal(budgetPricingSchema.safeParse({
        desiredMarginPercent: '79.9999',
        taxPercent: '20'
    }).success, true);
});

test('valida quantidade condicional e costGroup do item', () => {
    assert.equal(eventBudgetItemSchema.safeParse(buildBudgetItem()).success, true);
    assert.equal(eventBudgetItemSchema.safeParse(buildBudgetItem({
        quantityMode: 'FIXED', fixedQuantity: null
    })).success, false);
    assert.equal(eventBudgetItemSchema.safeParse(buildBudgetItem({
        quantityMode: 'FIXED', fixedQuantity: '0'
    })).success, false);
    assert.equal(eventBudgetItemSchema.safeParse(buildBudgetItem({
        quantityPerGuest: '0'
    })).success, false);
    assert.equal(eventBudgetItemSchema.safeParse(buildBudgetItem({
        costGroup: 'INVALID'
    })).success, false);
    assert.equal(eventBudgetItemSchema.safeParse(buildBudgetItem({
        itemType: 'PRODUCT', sourceId: null
    })).success, false);
});

test('rejeita campos desconhecidos e valores financeiros negativos', () => {
    assert.equal(eventBudgetItemSchema.safeParse(buildBudgetItem({
        establishmentId: 'forged'
    })).success, false);
    assert.equal(eventBudgetItemSchema.safeParse(buildBudgetItem({
        unitCostSnapshot: '-1'
    })).success, false);
});

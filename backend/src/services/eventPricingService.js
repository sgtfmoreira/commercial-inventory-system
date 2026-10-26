const { Prisma } = require('@prisma/client');
const {
    EVENT_BUDGET_COST_GROUP,
    EVENT_QUANTITY_MODE,
    EVENT_PRICING,
    EVENT_PRICING_WARNING
} = require('../constants/eventConstants');

const Decimal = Prisma.Decimal;
const ZERO = new Decimal(0);
const ONE_HUNDRED = new Decimal(100);
const ROUNDING = Decimal.ROUND_HALF_UP;

const costFields = Object.freeze({
    [EVENT_BUDGET_COST_GROUP.MENU]: 'costMenu',
    [EVENT_BUDGET_COST_GROUP.STAFF]: 'costStaff',
    [EVENT_BUDGET_COST_GROUP.SERVICE]: 'costService',
    [EVENT_BUDGET_COST_GROUP.EQUIPMENT]: 'costEquipment',
    [EVENT_BUDGET_COST_GROUP.TRANSPORT]: 'costTransport',
    [EVENT_BUDGET_COST_GROUP.FEE]: 'costFees',
    [EVENT_BUDGET_COST_GROUP.OTHER]: 'costOther'
});

class EventPricingError extends Error {
    constructor(code, message, field) {
        super(message);
        this.name = 'EventPricingError';
        this.code = code;
        this.field = field;
    }
}

function toDecimal(value, field, { nullable = false } = {}) {
    if (value === null || value === undefined || value === '') {
        if (nullable) return null;
        throw new EventPricingError('REQUIRED_VALUE', `${field} é obrigatório.`, field);
    }

    try {
        return new Decimal(value);
    } catch (_error) {
        throw new EventPricingError('INVALID_DECIMAL', `${field} deve ser um número decimal válido.`, field);
    }
}

function assertNonNegative(value, field) {
    if (value.isNegative()) {
        throw new EventPricingError('NEGATIVE_VALUE', `${field} não pode ser negativo.`, field);
    }
}

function round(value, scale) {
    return value.toDecimalPlaces(scale, ROUNDING);
}

function percentRate(value, field) {
    const percent = toDecimal(value ?? 0, field);
    assertNonNegative(percent, field);
    if (percent.greaterThan(ONE_HUNDRED)) {
        throw new EventPricingError('PERCENT_OUT_OF_RANGE', `${field} não pode ser maior que 100%.`, field);
    }
    return percent.dividedBy(ONE_HUNDRED);
}

function calculatePlannedQuantity({
    quantityMode,
    fixedQuantity,
    quantityPerGuest,
    guestCount,
    safetyPercent = 0
}) {
    let baseQuantity;

    if (quantityMode === EVENT_QUANTITY_MODE.FIXED) {
        baseQuantity = toDecimal(fixedQuantity, 'fixedQuantity');
    } else if (quantityMode === EVENT_QUANTITY_MODE.PER_GUEST) {
        const perGuest = toDecimal(quantityPerGuest, 'quantityPerGuest');
        const guests = toDecimal(guestCount, 'guestCount');
        assertNonNegative(perGuest, 'quantityPerGuest');
        assertNonNegative(guests, 'guestCount');
        baseQuantity = perGuest.times(guests);
    } else {
        throw new EventPricingError('INVALID_QUANTITY_MODE', 'Modo de quantidade inválido.', 'quantityMode');
    }

    assertNonNegative(baseQuantity, 'baseQuantity');
    const safetyRate = percentRate(safetyPercent, 'safetyPercent');
    return round(baseQuantity.times(safetyRate.plus(1)), EVENT_PRICING.QUANTITY_SCALE);
}

function calculateItemTotal({ plannedQuantity, unitCost }) {
    const quantity = toDecimal(plannedQuantity, 'plannedQuantity');
    const cost = toDecimal(unitCost, 'unitCost');
    assertNonNegative(quantity, 'plannedQuantity');
    assertNonNegative(cost, 'unitCost');
    return round(quantity.times(cost), EVENT_PRICING.MONEY_SCALE);
}

function emptyCosts() {
    return Object.values(costFields).reduce((result, field) => {
        result[field] = new Decimal(0);
        return result;
    }, {});
}

function aggregateCosts(items = []) {
    if (!Array.isArray(items)) {
        throw new EventPricingError('INVALID_ITEMS', 'items deve ser uma lista.', 'items');
    }

    const costs = emptyCosts();

    for (const [index, item] of items.entries()) {
        const field = costFields[item?.costGroup];
        if (!field) {
            throw new EventPricingError(
                'INVALID_COST_GROUP',
                `Grupo de custo inválido no item ${index + 1}.`,
                `items.${index}.costGroup`
            );
        }
        const total = toDecimal(item.totalCost, `items.${index}.totalCost`);
        assertNonNegative(total, `items.${index}.totalCost`);
        costs[field] = costs[field].plus(total);
    }

    Object.keys(costs).forEach((field) => {
        costs[field] = round(costs[field], EVENT_PRICING.MONEY_SCALE);
    });

    return costs;
}

function nullableRatio(numerator, denominator, scale) {
    if (denominator.isZero()) return null;
    return round(numerator.dividedBy(denominator), scale);
}

function calculateBudgetPricing({
    items = [],
    desiredMarginPercent = 0,
    taxPercent = 0,
    commissionPercent = 0,
    cardFeePercent = 0,
    otherFeePercent = 0,
    quotedPrice = null,
    guestCount
}) {
    const costs = aggregateCosts(items);
    const totalCost = round(
        Object.values(costs).reduce((total, value) => total.plus(value), new Decimal(0)),
        EVENT_PRICING.MONEY_SCALE
    );

    const desiredMarginRate = percentRate(desiredMarginPercent, 'desiredMarginPercent');
    const taxRate = percentRate(taxPercent, 'taxPercent');
    const commissionRate = percentRate(commissionPercent, 'commissionPercent');
    const cardFeeRate = percentRate(cardFeePercent, 'cardFeePercent');
    const otherFeeRate = percentRate(otherFeePercent, 'otherFeePercent');
    const revenueRate = taxRate.plus(commissionRate).plus(cardFeeRate).plus(otherFeeRate);
    const denominator = new Decimal(1).minus(desiredMarginRate).minus(revenueRate);

    if (denominator.lessThanOrEqualTo(0)) {
        throw new EventPricingError(
            'INVALID_PRICING_PERCENTAGES',
            'Não é possível calcular o preço recomendado. Revise margem e encargos.',
            'desiredMarginPercent'
        );
    }

    const recommendedPrice = round(totalCost.dividedBy(denominator), EVENT_PRICING.MONEY_SCALE);
    const price = toDecimal(quotedPrice, 'quotedPrice', { nullable: true });
    const guests = toDecimal(guestCount, 'guestCount');
    assertNonNegative(guests, 'guestCount');
    if (guests.isZero()) {
        throw new EventPricingError('INVALID_GUEST_COUNT', 'guestCount deve ser maior que zero.', 'guestCount');
    }

    const result = {
        calculationVersion: EVENT_PRICING.VERSION,
        ...costs,
        totalCost,
        totalRevenuePercent: round(revenueRate.times(ONE_HUNDRED), EVENT_PRICING.PERCENT_SCALE),
        recommendedPrice,
        quotedPrice: price ? round(price, EVENT_PRICING.MONEY_SCALE) : null,
        expectedFeeAmount: null,
        expectedProfit: null,
        effectiveMarginPercent: null,
        menuCMVPercent: null,
        pricePerGuest: null,
        costPerGuest: round(totalCost.dividedBy(guests), EVENT_PRICING.MONEY_SCALE),
        profitPerGuest: null,
        warnings: []
    };

    if (!price) return result;

    assertNonNegative(price, 'quotedPrice');
    const expectedFeeAmount = round(price.times(revenueRate), EVENT_PRICING.MONEY_SCALE);
    const expectedProfit = round(price.minus(totalCost).minus(expectedFeeAmount), EVENT_PRICING.MONEY_SCALE);
    const effectiveMarginRate = nullableRatio(expectedProfit, price, EVENT_PRICING.PERCENT_SCALE + 2);
    const menuCMVRate = nullableRatio(costs.costMenu, price, EVENT_PRICING.PERCENT_SCALE + 2);

    result.expectedFeeAmount = expectedFeeAmount;
    result.expectedProfit = expectedProfit;
    result.effectiveMarginPercent = effectiveMarginRate
        ? round(effectiveMarginRate.times(ONE_HUNDRED), EVENT_PRICING.PERCENT_SCALE)
        : null;
    result.menuCMVPercent = menuCMVRate
        ? round(menuCMVRate.times(ONE_HUNDRED), EVENT_PRICING.PERCENT_SCALE)
        : null;
    result.pricePerGuest = round(price.dividedBy(guests), EVENT_PRICING.MONEY_SCALE);
    result.profitPerGuest = round(expectedProfit.dividedBy(guests), EVENT_PRICING.MONEY_SCALE);

    if (result.effectiveMarginPercent && result.effectiveMarginPercent.lessThan(
        desiredMarginRate.times(ONE_HUNDRED)
    )) {
        result.warnings.push(EVENT_PRICING_WARNING.MARGIN_BELOW_TARGET);
    }
    if (expectedProfit.isNegative()) {
        result.warnings.push(EVENT_PRICING_WARNING.PRICE_BELOW_BREAK_EVEN);
    }

    return result;
}

module.exports = {
    EventPricingError,
    calculatePlannedQuantity,
    calculateItemTotal,
    aggregateCosts,
    calculateBudgetPricing
};

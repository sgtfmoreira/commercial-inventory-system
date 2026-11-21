const { checklistTemplateItemSchema } = require('../validations/checklistTemplateValidation');

class ChecklistScoringError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'ChecklistScoringError';
        this.code = code;
        this.details = details;
    }
}

const roundScore = value => Math.round((value + Number.EPSILON) * 100) / 100;

function validateValue(item, value) {
    if (item.responseType === 'BOOLEAN' && typeof value !== 'boolean') {
        throw new ChecklistScoringError('INVALID_BOOLEAN', 'Boolean response required', { itemKey: item.stableKey });
    }
    if (item.responseType === 'CHOICE') {
        const options = item.answerConfigJson.options.map(option => option.value);
        if (typeof value !== 'string' || !options.includes(value)) {
            throw new ChecklistScoringError('INVALID_CHOICE', 'Unknown choice response', { itemKey: item.stableKey });
        }
    }
    if (item.responseType === 'NUMBER') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new ChecklistScoringError('INVALID_NUMBER', 'Finite numeric response required', { itemKey: item.stableKey });
        }
        const config = item.answerConfigJson || {};
        if (config.min !== undefined && value < config.min) {
            throw new ChecklistScoringError('NUMBER_OUT_OF_RANGE', 'Numeric response is below minimum', { itemKey: item.stableKey });
        }
        if (config.max !== undefined && value > config.max) {
            throw new ChecklistScoringError('NUMBER_OUT_OF_RANGE', 'Numeric response is above maximum', { itemKey: item.stableKey });
        }
    }
    if (item.responseType === 'TEXT') {
        if (typeof value !== 'string') {
            throw new ChecklistScoringError('INVALID_TEXT', 'Text response required', { itemKey: item.stableKey });
        }
        const config = item.answerConfigJson || {};
        const length = value.trim().length;
        if (config.minLength !== undefined && length < config.minLength) {
            throw new ChecklistScoringError('TEXT_TOO_SHORT', 'Text response is shorter than minimum', { itemKey: item.stableKey });
        }
        if (config.maxLength !== undefined && length > config.maxLength) {
            throw new ChecklistScoringError('TEXT_TOO_LONG', 'Text response is longer than maximum', { itemKey: item.stableKey });
        }
    }
}

function earnedPoints(item, value) {
    if (item.responseType === 'BOOLEAN') return value === item.scoringConfigJson.expected ? item.maxPoints : 0;
    if (item.responseType === 'CHOICE') return item.scoringConfigJson.pointsByValue[value];
    if (item.responseType === 'TEXT') return value.trim().length > 0 ? item.maxPoints : 0;
    const rule = item.scoringConfigJson;
    const passed = rule.operator === 'GTE'
        ? value >= rule.value
        : rule.operator === 'LTE'
            ? value <= rule.value
            : value >= rule.min && value <= rule.max;
    return passed ? item.maxPoints : 0;
}

function calculateChecklistScore({ items, responses, passingScore }) {
    if (!Array.isArray(items) || !Array.isArray(responses)) {
        throw new ChecklistScoringError('INVALID_INPUT', 'Items and responses must be arrays');
    }
    if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) {
        throw new ChecklistScoringError('INVALID_PASSING_SCORE', 'passingScore must be between 0 and 100');
    }

    const responseByItemKey = new Map();
    for (const response of responses) {
        if (!response?.itemKey || responseByItemKey.has(response.itemKey)) {
            throw new ChecklistScoringError('DUPLICATE_OR_INVALID_RESPONSE', 'Each item may have only one response');
        }
        responseByItemKey.set(response.itemKey, response);
    }

    let applicablePoints = 0;
    let totalEarnedPoints = 0;
    let criticalFailure = false;
    const results = [];

    for (const rawItem of items) {
        const item = checklistTemplateItemSchema.parse(rawItem);
        const response = responseByItemKey.get(item.stableKey);
        if (!response) {
            if (item.required) throw new ChecklistScoringError('REQUIRED_RESPONSE_MISSING', 'Required response missing', { itemKey: item.stableKey });
            applicablePoints += item.maxPoints;
            results.push({ itemKey: item.stableKey, outcome: 'UNASSESSED', earnedPoints: 0, maxPoints: item.maxPoints });
            continue;
        }
        if (response.notApplicable === true) {
            if (!item.allowNotApplicable) {
                throw new ChecklistScoringError('NOT_APPLICABLE_FORBIDDEN', 'Item does not allow N/A', { itemKey: item.stableKey });
            }
            results.push({ itemKey: item.stableKey, outcome: 'NOT_APPLICABLE', earnedPoints: 0, maxPoints: 0 });
            continue;
        }

        validateValue(item, response.value);
        const earned = roundScore(earnedPoints(item, response.value));
        applicablePoints += item.maxPoints;
        totalEarnedPoints += earned;
        const passed = earned >= item.maxPoints;
        if (item.critical && !passed) criticalFailure = true;
        results.push({
            itemKey: item.stableKey,
            outcome: passed ? 'PASS' : 'FAIL',
            earnedPoints: earned,
            maxPoints: item.maxPoints
        });
    }

    const score = applicablePoints > 0 ? roundScore((totalEarnedPoints / applicablePoints) * 100) : null;
    return {
        score,
        earnedPoints: roundScore(totalEarnedPoints),
        applicablePoints: roundScore(applicablePoints),
        criticalFailure,
        isCompliant: score !== null && score >= passingScore && !criticalFailure,
        results
    };
}

module.exports = { ChecklistScoringError, calculateChecklistScore };

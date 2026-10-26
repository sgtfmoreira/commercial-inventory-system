const {
    COMMERCIAL_EVENT_STATUS,
    EVENT_BUDGET_STATUS
} = require('../constants/eventConstants');

const budgetTransitions = Object.freeze({
    [EVENT_BUDGET_STATUS.DRAFT]: Object.freeze([
        EVENT_BUDGET_STATUS.SENT,
        EVENT_BUDGET_STATUS.CANCELLED
    ]),
    [EVENT_BUDGET_STATUS.SENT]: Object.freeze([
        EVENT_BUDGET_STATUS.APPROVED,
        EVENT_BUDGET_STATUS.REJECTED,
        EVENT_BUDGET_STATUS.EXPIRED,
        EVENT_BUDGET_STATUS.CANCELLED
    ]),
    [EVENT_BUDGET_STATUS.APPROVED]: Object.freeze([]),
    [EVENT_BUDGET_STATUS.REJECTED]: Object.freeze([]),
    [EVENT_BUDGET_STATUS.EXPIRED]: Object.freeze([]),
    [EVENT_BUDGET_STATUS.CANCELLED]: Object.freeze([])
});

const eventTransitions = Object.freeze({
    [COMMERCIAL_EVENT_STATUS.DRAFT]: Object.freeze([
        COMMERCIAL_EVENT_STATUS.BUDGETING,
        COMMERCIAL_EVENT_STATUS.CANCELLED
    ]),
    [COMMERCIAL_EVENT_STATUS.BUDGETING]: Object.freeze([
        COMMERCIAL_EVENT_STATUS.APPROVED,
        COMMERCIAL_EVENT_STATUS.CANCELLED
    ]),
    [COMMERCIAL_EVENT_STATUS.APPROVED]: Object.freeze([
        COMMERCIAL_EVENT_STATUS.PLANNING_PENDING,
        COMMERCIAL_EVENT_STATUS.CANCELLED
    ]),
    [COMMERCIAL_EVENT_STATUS.PLANNING_PENDING]: Object.freeze([
        COMMERCIAL_EVENT_STATUS.CANCELLED
    ]),
    [COMMERCIAL_EVENT_STATUS.CANCELLED]: Object.freeze([])
});

function canTransition(transitionMap, from, to) {
    return Boolean(transitionMap[from]?.includes(to));
}

function canTransitionBudget(from, to) {
    return canTransition(budgetTransitions, from, to);
}

function canTransitionEvent(from, to) {
    return canTransition(eventTransitions, from, to);
}

function isBudgetEditable(status) {
    return status === EVENT_BUDGET_STATUS.DRAFT;
}

function assertBudgetTransition(from, to) {
    if (!canTransitionBudget(from, to)) {
        throw new Error(`Transição de orçamento inválida: ${from} -> ${to}`);
    }
}

function assertEventTransition(from, to) {
    if (!canTransitionEvent(from, to)) {
        throw new Error(`Transição de evento inválida: ${from} -> ${to}`);
    }
}

module.exports = {
    budgetTransitions,
    eventTransitions,
    canTransitionBudget,
    canTransitionEvent,
    isBudgetEditable,
    assertBudgetTransition,
    assertEventTransition
};

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canTransitionBudget,
    canTransitionEvent,
    isBudgetEditable,
    assertBudgetTransition
} = require('../src/services/eventLifecycleService');

test('permite apenas as transições comerciais previstas para orçamento', () => {
    assert.equal(canTransitionBudget('DRAFT', 'SENT'), true);
    assert.equal(canTransitionBudget('SENT', 'APPROVED'), true);
    assert.equal(canTransitionBudget('SENT', 'REJECTED'), true);
    assert.equal(canTransitionBudget('APPROVED', 'DRAFT'), false);
    assert.equal(canTransitionBudget('DRAFT', 'APPROVED'), false);
});

test('somente orçamento em rascunho é editável', () => {
    assert.equal(isBudgetEditable('DRAFT'), true);
    for (const status of ['SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']) {
        assert.equal(isBudgetEditable(status), false);
    }
});

test('matriz de evento preserva aprovação antes do planejamento', () => {
    assert.equal(canTransitionEvent('DRAFT', 'BUDGETING'), true);
    assert.equal(canTransitionEvent('BUDGETING', 'APPROVED'), true);
    assert.equal(canTransitionEvent('APPROVED', 'PLANNING_PENDING'), true);
    assert.equal(canTransitionEvent('DRAFT', 'APPROVED'), false);
});

test('transição inválida lança erro de domínio', () => {
    assert.throws(
        () => assertBudgetTransition('APPROVED', 'DRAFT'),
        /Transição de orçamento inválida/
    );
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validatePublishableChecklistTemplateVersion
} = require('../src/validations/checklistTemplateValidation');
const {
    ChecklistScoringError,
    calculateChecklistScore
} = require('../src/services/checklistScoringService');

const booleanItem = (overrides = {}) => ({
    stableKey: 'temperature_ok',
    title: 'Temperature is compliant',
    position: 1,
    responseType: 'BOOLEAN',
    required: true,
    allowNotApplicable: false,
    critical: false,
    evidenceRequired: false,
    maxPoints: 10,
    answerConfigJson: null,
    scoringConfigJson: { expected: true },
    ...overrides
});

const choiceItem = (overrides = {}) => ({
    stableKey: 'cleanliness',
    title: 'Cleanliness level',
    position: 2,
    responseType: 'CHOICE',
    required: true,
    allowNotApplicable: false,
    critical: false,
    evidenceRequired: false,
    maxPoints: 10,
    answerConfigJson: {
        options: [
            { value: 'clean', label: 'Clean' },
            { value: 'dirty', label: 'Dirty' }
        ]
    },
    scoringConfigJson: { pointsByValue: { clean: 10, dirty: 0 } },
    ...overrides
});

const numberItem = (overrides = {}) => ({
    stableKey: 'freezer_temperature',
    title: 'Freezer temperature',
    position: 3,
    responseType: 'NUMBER',
    required: true,
    allowNotApplicable: false,
    critical: true,
    evidenceRequired: false,
    maxPoints: 20,
    answerConfigJson: { min: -30, max: 10 },
    scoringConfigJson: { operator: 'LTE', value: -18 },
    ...overrides
});

const textItem = (overrides = {}) => ({
    stableKey: 'notes',
    title: 'Operational notes',
    position: 4,
    responseType: 'TEXT',
    required: false,
    allowNotApplicable: true,
    critical: false,
    evidenceRequired: false,
    maxPoints: 5,
    answerConfigJson: { minLength: 3, maxLength: 200 },
    scoringConfigJson: { mode: 'COMPLETION' },
    ...overrides
});

const validVersion = () => ({
    version: 1,
    approvalRequired: true,
    passingScore: 80,
    scoringAlgorithmVersion: 1,
    sections: [{
        stableKey: 'opening',
        title: 'Opening',
        position: 1,
        items: [booleanItem(), choiceItem(), numberItem(), textItem()]
    }]
});

test('publishable template accepts all MVP response types', () => {
    const parsed = validatePublishableChecklistTemplateVersion(validVersion());
    assert.deepEqual(parsed.sections[0].items.map(item => item.responseType), [
        'BOOLEAN', 'CHOICE', 'NUMBER', 'TEXT'
    ]);
});

test('publishable template reports actionable errors for missing sections and questions', () => {
    const withoutSections = validVersion();
    withoutSections.sections = [];
    assert.throws(
        () => validatePublishableChecklistTemplateVersion(withoutSections),
        error => error.issues.some(issue => issue.message === 'Adicione pelo menos uma seção antes de publicar.')
    );

    const withoutQuestions = validVersion();
    withoutQuestions.sections[0].items = [];
    assert.throws(
        () => validatePublishableChecklistTemplateVersion(withoutQuestions),
        error => error.issues.some(issue => issue.message === 'Adicione pelo menos uma pergunta nesta seção antes de publicar.')
    );
});

test('publishable template rejects duplicate keys, positions and malformed scoring configs', () => {
    const duplicate = validVersion();
    duplicate.sections[0].items[1] = choiceItem({
        stableKey: 'temperature_ok',
        position: 1,
        scoringConfigJson: { pointsByValue: { clean: 11, missing: 0 } }
    });
    assert.throws(
        () => validatePublishableChecklistTemplateVersion(duplicate),
        error => error.issues.some(issue => issue.message.includes('Duplicate'))
            && error.issues.some(issue => issue.message.includes('cannot exceed maxPoints'))
    );

    const invalidNumber = validVersion();
    invalidNumber.sections[0].items[2] = numberItem({
        answerConfigJson: { min: 10, max: -10 },
        scoringConfigJson: { operator: 'BETWEEN', min: 5, max: 1 }
    });
    assert.throws(() => validatePublishableChecklistTemplateVersion(invalidNumber));
});

test('scoring excludes allowed N/A from denominator and calculates deterministic score', () => {
    const items = [booleanItem(), choiceItem(), textItem()];
    const result = calculateChecklistScore({
        items,
        responses: [
            { itemKey: 'temperature_ok', value: true },
            { itemKey: 'cleanliness', value: 'dirty' },
            { itemKey: 'notes', notApplicable: true }
        ],
        passingScore: 50
    });
    assert.deepEqual({
        score: result.score,
        earnedPoints: result.earnedPoints,
        applicablePoints: result.applicablePoints,
        criticalFailure: result.criticalFailure,
        isCompliant: result.isCompliant
    }, {
        score: 50,
        earnedPoints: 10,
        applicablePoints: 20,
        criticalFailure: false,
        isCompliant: true
    });
});

test('critical failure makes execution non-compliant even above threshold', () => {
    const result = calculateChecklistScore({
        items: [booleanItem({ maxPoints: 90 }), numberItem({ maxPoints: 10 })],
        responses: [
            { itemKey: 'temperature_ok', value: true },
            { itemKey: 'freezer_temperature', value: -10 }
        ],
        passingScore: 80
    });
    assert.equal(result.score, 90);
    assert.equal(result.criticalFailure, true);
    assert.equal(result.isCompliant, false);
});

test('required responses and forbidden N/A fail closed', () => {
    assert.throws(
        () => calculateChecklistScore({ items: [booleanItem()], responses: [], passingScore: 80 }),
        error => error instanceof ChecklistScoringError && error.code === 'REQUIRED_RESPONSE_MISSING'
    );
    assert.throws(
        () => calculateChecklistScore({
            items: [booleanItem()],
            responses: [{ itemKey: 'temperature_ok', notApplicable: true }],
            passingScore: 80
        }),
        error => error instanceof ChecklistScoringError && error.code === 'NOT_APPLICABLE_FORBIDDEN'
    );
});

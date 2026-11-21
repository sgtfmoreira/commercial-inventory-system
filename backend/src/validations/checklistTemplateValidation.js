const { z } = require('zod');
const {
    CHECKLIST_RESPONSE_TYPES,
    CHECKLIST_NUMBER_OPERATORS,
    CHECKLIST_SCORING_ALGORITHM_VERSION
} = require('../constants/checklistTemplates');

const stableKeySchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9_-]+$/);
const positivePositionSchema = z.number().int().positive();
const pointsSchema = z.number().finite().positive().max(1000000);

const optionSchema = z.object({
    value: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(160)
}).strict();

const checklistTemplateItemSchema = z.object({
    stableKey: stableKeySchema,
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().max(5000).nullable().optional(),
    position: positivePositionSchema,
    responseType: z.enum(CHECKLIST_RESPONSE_TYPES),
    required: z.boolean().default(true),
    allowNotApplicable: z.boolean().default(false),
    critical: z.boolean().default(false),
    evidenceRequired: z.boolean().default(false),
    maxPoints: pointsSchema,
    answerConfigJson: z.unknown().nullable().optional(),
    scoringConfigJson: z.unknown().nullable().optional()
}).strict().superRefine((item, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const scoring = item.scoringConfigJson;
    const answer = item.answerConfigJson;

    if (item.responseType === 'BOOLEAN') {
        const parsed = z.object({ expected: z.boolean() }).strict().safeParse(scoring);
        if (!parsed.success) issue(['scoringConfigJson'], 'BOOLEAN requires { expected: boolean }');
        return;
    }

    if (item.responseType === 'CHOICE') {
        const answerParsed = z.object({ options: z.array(optionSchema).min(2).max(50) }).strict().safeParse(answer);
        const scoringParsed = z.object({ pointsByValue: z.record(z.number().finite().min(0)) }).strict().safeParse(scoring);
        if (!answerParsed.success) {
            issue(['answerConfigJson'], 'CHOICE requires between 2 and 50 unique options');
            return;
        }
        if (!scoringParsed.success) {
            issue(['scoringConfigJson'], 'CHOICE requires pointsByValue');
            return;
        }
        const values = answerParsed.data.options.map(option => option.value);
        if (new Set(values).size !== values.length) issue(['answerConfigJson', 'options'], 'CHOICE option values must be unique');
        for (const value of values) {
            if (!Object.prototype.hasOwnProperty.call(scoringParsed.data.pointsByValue, value)) {
                issue(['scoringConfigJson', 'pointsByValue'], `Missing points for option ${value}`);
            } else if (scoringParsed.data.pointsByValue[value] > item.maxPoints) {
                issue(['scoringConfigJson', 'pointsByValue', value], 'Option points cannot exceed maxPoints');
            }
        }
        for (const value of Object.keys(scoringParsed.data.pointsByValue)) {
            if (!values.includes(value)) issue(['scoringConfigJson', 'pointsByValue', value], 'Points reference an unknown option');
        }
        return;
    }

    if (item.responseType === 'NUMBER') {
        const answerParsed = z.object({
            min: z.number().finite().optional(),
            max: z.number().finite().optional()
        }).strict().safeParse(answer || {});
        if (!answerParsed.success || (
            answerParsed.success
            && answerParsed.data.min !== undefined
            && answerParsed.data.max !== undefined
            && answerParsed.data.min > answerParsed.data.max
        )) issue(['answerConfigJson'], 'NUMBER min cannot exceed max');

        const scoringParsed = z.object({
            operator: z.enum(CHECKLIST_NUMBER_OPERATORS),
            value: z.number().finite().optional(),
            min: z.number().finite().optional(),
            max: z.number().finite().optional()
        }).strict().safeParse(scoring);
        if (!scoringParsed.success) {
            issue(['scoringConfigJson'], 'NUMBER requires a valid comparison rule');
            return;
        }
        const rule = scoringParsed.data;
        if ((rule.operator === 'GTE' || rule.operator === 'LTE') && rule.value === undefined) {
            issue(['scoringConfigJson', 'value'], `${rule.operator} requires value`);
        }
        if (rule.operator === 'BETWEEN' && (
            rule.min === undefined || rule.max === undefined || rule.min > rule.max
        )) issue(['scoringConfigJson'], 'BETWEEN requires min <= max');
        return;
    }

    const answerParsed = z.object({
        minLength: z.number().int().min(0).max(5000).optional(),
        maxLength: z.number().int().positive().max(5000).optional()
    }).strict().safeParse(answer || {});
    if (!answerParsed.success || (
        answerParsed.success
        && answerParsed.data.minLength !== undefined
        && answerParsed.data.maxLength !== undefined
        && answerParsed.data.minLength > answerParsed.data.maxLength
    )) issue(['answerConfigJson'], 'TEXT minLength cannot exceed maxLength');
    if (!z.object({ mode: z.literal('COMPLETION') }).strict().safeParse(scoring).success) {
        issue(['scoringConfigJson'], 'TEXT requires { mode: "COMPLETION" }');
    }
});

const checklistTemplateSectionSchema = z.object({
    stableKey: stableKeySchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).nullable().optional(),
    position: positivePositionSchema,
    items: z.array(checklistTemplateItemSchema).min(1).max(200)
}).strict();

const publishableChecklistTemplateVersionSchema = z.object({
    version: z.number().int().positive(),
    approvalRequired: z.boolean().default(true),
    passingScore: z.number().finite().min(0).max(100),
    scoringAlgorithmVersion: z.literal(CHECKLIST_SCORING_ALGORITHM_VERSION),
    sections: z.array(checklistTemplateSectionSchema).min(1).max(100)
}).strict().superRefine((version, ctx) => {
    const sectionKeys = new Set();
    const sectionPositions = new Set();
    const itemKeys = new Set();
    for (const [sectionIndex, section] of version.sections.entries()) {
        if (sectionKeys.has(section.stableKey)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'stableKey'], message: 'Duplicate section stableKey' });
        }
        if (sectionPositions.has(section.position)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'position'], message: 'Duplicate section position' });
        }
        sectionKeys.add(section.stableKey);
        sectionPositions.add(section.position);
        const itemPositions = new Set();
        for (const [itemIndex, item] of section.items.entries()) {
            if (itemKeys.has(item.stableKey)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'items', itemIndex, 'stableKey'], message: 'Duplicate item stableKey' });
            }
            if (itemPositions.has(item.position)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'items', itemIndex, 'position'], message: 'Duplicate item position in section' });
            }
            itemKeys.add(item.stableKey);
            itemPositions.add(item.position);
        }
    }
});

function validatePublishableChecklistTemplateVersion(input) {
    return publishableChecklistTemplateVersionSchema.parse(input);
}

module.exports = {
    stableKeySchema,
    checklistTemplateItemSchema,
    checklistTemplateSectionSchema,
    publishableChecklistTemplateVersionSchema,
    validatePublishableChecklistTemplateVersion
};

const { z } = require('zod');
const {
    stableKeySchema,
    checklistTemplateItemSchema
} = require('./checklistTemplateValidation');

const uuid = z.string().uuid();
const nullableText = max => z.string().trim().max(max).nullable().optional();

const templateIdParamSchema = z.object({ templateId: uuid }).strict();
const versionParamsSchema = z.object({ templateId: uuid, versionId: uuid }).strict();

const createTemplateSchema = z.object({
    name: z.string().trim().min(2).max(160),
    category: nullableText(80),
    description: nullableText(500),
    approvalRequired: z.boolean().default(true),
    passingScore: z.coerce.number().finite().min(0).max(100).default(80)
}).strict();

const draftSectionSchema = z.object({
    stableKey: stableKeySchema,
    title: z.string().trim().min(1).max(200),
    description: nullableText(500),
    position: z.number().int().positive(),
    items: z.array(checklistTemplateItemSchema).max(200)
}).strict();

const saveDraftSchema = z.object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    name: z.string().trim().min(2).max(160),
    category: nullableText(80),
    description: nullableText(500),
    approvalRequired: z.boolean(),
    passingScore: z.coerce.number().finite().min(0).max(100),
    sections: z.array(draftSectionSchema).max(100)
}).strict().superRefine((draft, ctx) => {
    const sectionKeys = new Set();
    const sectionPositions = new Set();
    const itemKeys = new Set();
    draft.sections.forEach((section, sectionIndex) => {
        if (sectionKeys.has(section.stableKey)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'stableKey'], message: 'Chave de seção duplicada.' });
        }
        if (sectionPositions.has(section.position)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'position'], message: 'Posição de seção duplicada.' });
        }
        sectionKeys.add(section.stableKey);
        sectionPositions.add(section.position);
        const positions = new Set();
        section.items.forEach((item, itemIndex) => {
            if (itemKeys.has(item.stableKey)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'items', itemIndex, 'stableKey'], message: 'Chave de pergunta duplicada.' });
            }
            if (positions.has(item.position)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sections', sectionIndex, 'items', itemIndex, 'position'], message: 'Posição de pergunta duplicada.' });
            }
            itemKeys.add(item.stableKey);
            positions.add(item.position);
        });
    });
});

const expectedVersionSchema = z.object({
    expectedUpdatedAt: z.string().datetime({ offset: true })
}).strict();

const cloneVersionSchema = z.object({ sourceVersionId: uuid }).strict();

module.exports = {
    templateIdParamSchema,
    versionParamsSchema,
    createTemplateSchema,
    saveDraftSchema,
    expectedVersionSchema,
    cloneVersionSchema
};

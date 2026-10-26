const { z } = require('zod');
const {
    COMMERCIAL_EVENT_TYPE,
    EVENT_BUDGET_ITEM_TYPE,
    EVENT_BUDGET_COST_GROUP,
    EVENT_QUANTITY_MODE
} = require('../constants/eventConstants');

const uuid = z.string().uuid('ID inválido');
const nullableUuid = uuid.optional().nullable();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const decimalPattern = /^\d+(?:\.\d{1,4})?$/;

function isValidIsoDate(value) {
    if (!datePattern.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

const isoDate = (field) => z.string().refine(isValidIsoDate, {
    message: `${field} deve ser uma data válida no formato YYYY-MM-DD`
});

const decimalInput = ({ field, max = '9999999999.9999', nullable = false } = {}) => {
    const schema = z.union([
        z.number().finite(),
        z.string().trim().regex(decimalPattern, `${field} deve ser um decimal válido`)
    ]).transform((value) => String(value));

    const ranged = schema.refine((value) => Number(value) >= 0 && Number(value) <= Number(max), {
        message: `${field} está fora do intervalo permitido`
    });
    return nullable ? ranged.optional().nullable() : ranged;
};

const percentInput = (field) => decimalInput({ field, max: '100' });
const paginationFields = {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional()
};

const listEventCustomersQuerySchema = z.object(paginationFields).strict();
const listCommercialEventsQuerySchema = z.object({
    ...paginationFields,
    status: z.enum(['DRAFT', 'BUDGETING', 'APPROVED', 'PLANNING_PENDING', 'CANCELLED']).optional(),
    dateFrom: isoDate('Data inicial').optional(),
    dateTo: isoDate('Data final').optional()
}).strict().refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'Período inválido', path: ['dateTo']
});
const eventCatalogQuerySchema = z.object({
    search: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30)
}).strict();

const eventCustomerFields = z.object({
    name: z.string().trim().min(1, 'Nome é obrigatório').max(160),
    document: z.string().trim().max(30).optional().nullable(),
    phone: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().email('E-mail inválido').max(254).optional().nullable(),
    notes: z.string().trim().max(5000).optional().nullable()
}).strict();

const createEventCustomerSchema = eventCustomerFields;
const updateEventCustomerSchema = eventCustomerFields.partial().refine(
    (value) => Object.keys(value).length > 0,
    { message: 'Informe ao menos um campo para atualizar' }
);

const commercialEventFields = z.object({
    customerId: uuid,
    name: z.string().trim().min(1, 'Nome do evento é obrigatório').max(180),
    type: z.enum(Object.values(COMMERCIAL_EVENT_TYPE)),
    eventDate: isoDate('Data'),
    startTime: z.string().regex(timePattern, 'Horário inicial inválido').optional().nullable(),
    endTime: z.string().regex(timePattern, 'Horário final inválido').optional().nullable(),
    guestCount: z.coerce.number().int().positive('Convidados deve ser maior que zero').max(1000000),
    location: z.string().trim().max(2000).optional().nullable(),
    responsibleUserId: nullableUuid,
    internalNotes: z.string().trim().max(10000).optional().nullable()
}).strict();

function validateTimeRange(value, context) {
    if (value.startTime && value.endTime && value.endTime < value.startTime) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endTime'],
            message: 'Horário final não pode ser anterior ao horário inicial'
        });
    }
}

const createCommercialEventSchema = commercialEventFields.superRefine(validateTimeRange);
const updateCommercialEventSchema = commercialEventFields.partial()
    .refine((value) => Object.keys(value).length > 0, {
        message: 'Informe ao menos um campo para atualizar'
    })
    .superRefine(validateTimeRange);

const budgetPricingFields = {
    desiredMarginPercent: percentInput('Margem desejada').default('0'),
    taxPercent: percentInput('Impostos').default('0'),
    commissionPercent: percentInput('Comissão').default('0'),
    cardFeePercent: percentInput('Taxa de cartão').default('0'),
    otherFeePercent: percentInput('Outras taxas').default('0'),
    quotedPrice: decimalInput({ field: 'Preço do orçamento', nullable: true }),
    validUntil: isoDate('Validade').optional().nullable(),
    customerProposalNotes: z.string().trim().max(10000).optional().nullable(),
    internalNotes: z.string().trim().max(10000).optional().nullable()
};
const validatePricingTotal = (value, context) => {
    const total = [
        value.desiredMarginPercent,
        value.taxPercent,
        value.commissionPercent,
        value.cardFeePercent,
        value.otherFeePercent
    ].reduce((sum, current) => sum + Number(current || 0), 0);
    if (total >= 100) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['desiredMarginPercent'],
            message: 'A soma de margem e encargos deve ser menor que 100%'
        });
    }
};
const budgetPricingSchema = z.object(budgetPricingFields).strict().superRefine(validatePricingTotal);
const updateEventBudgetSchema = z.object({
    desiredMarginPercent: percentInput('Margem desejada').optional(),
    taxPercent: percentInput('Impostos').optional(),
    commissionPercent: percentInput('Comissão').optional(),
    cardFeePercent: percentInput('Taxa de cartão').optional(),
    otherFeePercent: percentInput('Outras taxas').optional(),
    quotedPrice: decimalInput({ field: 'Preço do orçamento', nullable: true }),
    validUntil: isoDate('Validade').optional().nullable(),
    customerProposalNotes: z.string().trim().max(10000).optional().nullable(),
    internalNotes: z.string().trim().max(10000).optional().nullable()
}).strict().refine(value => Object.keys(value).length > 0, {
    message: 'Informe ao menos um campo para atualizar'
}).superRefine(validatePricingTotal);

const eventBudgetItemSchema = z.object({
    itemType: z.enum(Object.values(EVENT_BUDGET_ITEM_TYPE)),
    costGroup: z.enum(Object.values(EVENT_BUDGET_COST_GROUP)),
    sourceId: nullableUuid,
    sourceType: z.string().trim().max(50).optional().nullable(),
    nameSnapshot: z.string().trim().min(1, 'Nome do item é obrigatório').max(180),
    categorySnapshot: z.string().trim().max(100).optional().nullable(),
    quantityMode: z.enum(Object.values(EVENT_QUANTITY_MODE)),
    fixedQuantity: decimalInput({ field: 'Quantidade fixa', nullable: true }),
    quantityPerGuest: decimalInput({ field: 'Quantidade por convidado', nullable: true }),
    safetyPercent: percentInput('Margem de segurança').default('0'),
    unitSnapshot: z.string().trim().min(1, 'Unidade é obrigatória').max(30),
    unitCostSnapshot: decimalInput({ field: 'Custo unitário' }),
    suggestedUnitPriceSnapshot: decimalInput({ field: 'Preço sugerido', nullable: true }),
    visibleInProposal: z.boolean().default(true),
    proposalLabel: z.string().trim().max(180).optional().nullable(),
    internalNotes: z.string().trim().max(5000).optional().nullable(),
    compositionSnapshot: z.unknown().optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(100000).default(0)
}).strict().superRefine((value, context) => {
    if (['PRODUCT', 'RECIPE'].includes(value.itemType) && !value.sourceId) {
        context.addIssue({ code:z.ZodIssueCode.custom,path:['sourceId'],message:'Origem é obrigatória para produto ou ficha' });
    }
    if (value.quantityMode === EVENT_QUANTITY_MODE.FIXED && value.fixedQuantity == null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fixedQuantity'],
            message: 'Quantidade fixa é obrigatória neste modo'
        });
    } else if (value.quantityMode === EVENT_QUANTITY_MODE.FIXED && Number(value.fixedQuantity) <= 0) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fixedQuantity'],
            message: 'Quantidade fixa deve ser maior que zero'
        });
    }
    if (value.quantityMode === EVENT_QUANTITY_MODE.PER_GUEST && value.quantityPerGuest == null) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['quantityPerGuest'],
            message: 'Quantidade por convidado é obrigatória neste modo'
        });
    } else if (value.quantityMode === EVENT_QUANTITY_MODE.PER_GUEST && Number(value.quantityPerGuest) <= 0) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['quantityPerGuest'],
            message: 'Quantidade por convidado deve ser maior que zero'
        });
    }
});
const rejectEventBudgetSchema=z.object({reason:z.string().trim().min(1).max(1000).optional().nullable()}).strict();

module.exports = {
    decimalInput,
    listEventCustomersQuerySchema,
    listCommercialEventsQuerySchema,
    eventCatalogQuerySchema,
    createEventCustomerSchema,
    updateEventCustomerSchema,
    createCommercialEventSchema,
    updateCommercialEventSchema,
    budgetPricingSchema,
    updateEventBudgetSchema,
    eventBudgetItemSchema,
    rejectEventBudgetSchema
};

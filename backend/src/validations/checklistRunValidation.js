const { z } = require('zod');

const uuid = z.string().uuid();

const runIdParamSchema = z.object({ runId: uuid }).strict();
const scheduleIdParamSchema = z.object({ scheduleId: uuid }).strict();

const createRunSchema = z.object({
    clientRequestId: uuid,
    templateVersionId: uuid,
    assignedMembershipId: uuid,
    dueAt: z.string().datetime({ offset: true })
}).strict();

const reassignRunSchema = z.object({
    assignedMembershipId: uuid,
    reason: z.string().trim().min(3).max(500),
    version: z.number().int().positive()
}).strict();

const calendarDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Informe uma data real no formato YYYY-MM-DD.');
const createScheduleSchema = z.object({
    templateVersionId: uuid,
    assignedMembershipId: uuid,
    weekday: z.number().int().min(0).max(6),
    localTime: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
    dueAfterMinutes: z.number().int().min(15).max(10080),
    startsOn: calendarDateInput,
    endsOn: calendarDateInput.nullable().optional()
}).strict().superRefine((value, ctx) => {
    if (value.endsOn && value.endsOn < value.startsOn) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsOn'], message: 'A data final deve ser igual ou posterior à inicial.' });
    }
});
const scheduleStatusSchema = z.object({
    status: z.enum(['ACTIVE', 'PAUSED']),
    version: z.number().int().positive()
}).strict();

const attemptIdParamSchema = z.object({ attemptId: uuid }).strict();
const responseIdParamSchema = z.object({ responseId: uuid }).strict();
const evidenceIdParamSchema = z.object({ evidenceId: uuid }).strict();
const responseParamsSchema = z.object({ attemptId: uuid, itemId: uuid }).strict();

const saveResponseSchema = z.object({
    value: z.union([z.boolean(), z.string().max(5000), z.number().finite()]).nullable().optional(),
    notApplicable: z.boolean().default(false),
    note: z.string().trim().max(1000).nullable().optional(),
    version: z.number().int().nonnegative()
}).strict().superRefine((value, ctx) => {
    if (!value.notApplicable && (value.value === undefined || value.value === null)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Informe uma resposta ou marque N/A.' });
    }
});

const submitAttemptSchema = z.object({ version: z.number().int().positive() }).strict();
const approveAttemptSchema = z.object({
    version: z.number().int().positive(),
    reason: z.string().trim().max(1000).nullable().optional()
}).strict();
const rejectAttemptSchema = z.object({
    version: z.number().int().positive(),
    reason: z.string().trim().min(3).max(1000)
}).strict();

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Informe uma data real no formato YYYY-MM-DD.');

const reportQuerySchema = z.object({
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    templateId: uuid.optional(),
    templateVersionId: uuid.optional(),
    responsibleMembershipId: uuid.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25)
}).strict().superRefine((value, ctx) => {
    if (!value.from || !value.to) return;
    const from = new Date(`${value.from}T12:00:00.000Z`);
    const to = new Date(`${value.to}T12:00:00.000Z`);
    if (to < from) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'A data final deve ser igual ou posterior à inicial.' });
        return;
    }
    const days = Math.floor((to - from) / 86_400_000) + 1;
    if (days > 366) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'O período máximo é de 366 dias.' });
});

module.exports = {
    runIdParamSchema, scheduleIdParamSchema, createRunSchema, reassignRunSchema,
    createScheduleSchema, scheduleStatusSchema, attemptIdParamSchema,
    responseIdParamSchema, evidenceIdParamSchema, responseParamsSchema,
    saveResponseSchema, submitAttemptSchema, approveAttemptSchema, rejectAttemptSchema,
    reportQuerySchema
};

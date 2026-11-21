const { z } = require('zod');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(datePattern, 'Data deve estar no formato YYYY-MM-DD').refine(value => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Data inválida');

const createTableOccupancySchema = z.object({
    tableNumber: z.coerce.number().int().min(1).max(27),
    customerName: z.string().trim().max(160).optional().nullable(),
    partySize: z.coerce.number().int().positive('Quantidade de pessoas deve ser positiva').max(10000),
    notes: z.string().trim().max(5000).optional().nullable()
}).strict();

const createBatchTableOccupanciesSchema = z.object({
    tableNumbers: z.array(z.coerce.number().int().min(1).max(27))
        .min(2, 'Selecione ao menos duas mesas')
        .max(27),
    customerName: z.string().trim().max(160).optional().nullable(),
    partySize: z.coerce.number().int().positive('Quantidade de pessoas deve ser positiva').max(10000),
    notes: z.string().trim().max(5000).optional().nullable()
}).strict().refine(value => new Set(value.tableNumbers).size === value.tableNumbers.length, {
    message: 'Não repita a mesma mesa',
    path: ['tableNumbers']
});

const releaseTableOccupancySchema = z.object({
    version: z.coerce.number().int().positive()
}).strict();

const tableOccupancyMetricsQuerySchema = z.object({
    dateFrom: isoDate,
    dateTo: isoDate
}).strict().refine(value => value.dateFrom <= value.dateTo, {
    message: 'A data inicial deve ser anterior ou igual Ã  data final'
}).refine(value => {
    const from = new Date(`${value.dateFrom}T00:00:00.000Z`);
    const to = new Date(`${value.dateTo}T00:00:00.000Z`);
    return (to - from) / 86400000 <= 366;
}, { message: 'O período máximo para análise é de 366 dias' });

module.exports = {
    createTableOccupancySchema,
    createBatchTableOccupanciesSchema,
    releaseTableOccupancySchema,
    tableOccupancyMetricsQuerySchema
};

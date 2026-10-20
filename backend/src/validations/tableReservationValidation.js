const { z } = require('zod');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const isoDate = z.string().regex(datePattern, 'Data deve estar no formato YYYY-MM-DD').refine(value => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Data inválida');

const reservationFields = z.object({
    tableNumber: z.coerce.number().int().min(1).max(27),
    reservationDate: isoDate,
    reservationTime: z.string().regex(timePattern, 'Horário inválido'),
    customerName: z.string().trim().min(1, 'Nome é obrigatório').max(160),
    phone: z.string().trim().max(30).optional().nullable(),
    partySize: z.coerce.number().int().positive('Quantidade de pessoas deve ser positiva').max(10000),
    notes: z.string().trim().max(5000).optional().nullable()
}).strict();

const createTableReservationSchema = reservationFields;
const updateTableReservationSchema = reservationFields.partial().extend({
    version: z.coerce.number().int().positive()
}).refine(value => Object.keys(value).some(key => key !== 'version'), {
    message: 'Informe ao menos um campo para atualizar'
});
const cancelTableReservationSchema = z.object({ version: z.coerce.number().int().positive() }).strict();
const listTableReservationsQuerySchema = z.object({
    date: isoDate,
    includeCancelled: z.enum(['true', 'false']).optional().transform(value => value === 'true')
}).strict();
const importTableReservationsSchema = z.object({
    reservations: z.array(reservationFields).min(1).max(500)
}).strict();

module.exports = {
    createTableReservationSchema,
    updateTableReservationSchema,
    cancelTableReservationSchema,
    listTableReservationsQuerySchema,
    importTableReservationsSchema
};

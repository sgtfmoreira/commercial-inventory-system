const { z } = require('zod');

const createTableOccupancySchema = z.object({
    tableNumber: z.coerce.number().int().min(1).max(27),
    customerName: z.string().trim().max(160).optional().nullable(),
    partySize: z.coerce.number().int().positive('Quantidade de pessoas deve ser positiva').max(10000),
    notes: z.string().trim().max(5000).optional().nullable()
}).strict();

const releaseTableOccupancySchema = z.object({
    version: z.coerce.number().int().positive()
}).strict();

module.exports = { createTableOccupancySchema, releaseTableOccupancySchema };

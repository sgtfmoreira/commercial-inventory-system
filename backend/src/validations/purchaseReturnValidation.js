const { z } = require('zod');
const { parseEntryDate } = require('./stockMovementValidation');

const purchaseReturnSchema = z.object({
    purchaseOrderItemId: z.string().uuid(),
    locationId: z.string().uuid(),
    requestId: z.string().uuid(),
    quantity: z.number().finite().positive().max(999999999.999)
        .refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.00001, 'Use até três casas decimais.'),
    returnedAt: z.string().refine(value => {
        try { parseEntryDate(value); return true; } catch { return false; }
    }, 'Data inválida.'),
    reason: z.enum(['CONSIGNMENT_RETURN', 'SUPPLIER_RETURN']),
    financialTreatment: z.enum(['PENDING', 'PAYABLE_REDUCTION', 'SUPPLIER_CREDIT', 'REFUND']),
    notes: z.string().trim().max(1000).default('')
}).strict();

module.exports = { purchaseReturnSchema };

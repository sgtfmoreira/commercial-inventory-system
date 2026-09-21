const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/utils/prisma');
const { createReturn, receiptSnapshot } = require('../src/services/purchaseReturnService');
const { purchaseReturnSchema } = require('../src/validations/purchaseReturnValidation');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = {
    establishmentId: uuid(1), userId: uuid(2), purchaseOrderItemId: uuid(3), locationId: uuid(4),
    requestId: uuid(5), quantity: 8, returnedAt: '2026-09-01', reason: 'CONSIGNMENT_RETURN',
    financialTreatment: 'PENDING', notes: 'Retorno parcial'
};

function fixture(overrides = {}) {
    let state = {
        stock: 20, productStock: 20, returns: [], movements: [], audits: [],
        item: {
            id: uuid(3), purchaseOrderId: uuid(6), productId: uuid(7), supplierId: uuid(8),
            productName: 'Produto consignado', purchaseClassification: 'CMV_BEVERAGES',
            adjustedQuantity: 2, unitPrice: 100, receivedStockQuantity: 20, receivedUnitCost: 10, receivedUnit: 'un',
            product: { id: uuid(7), establishmentId: uuid(1), type: 'PRODUCTION', quantity: 20, packQuantity: 99, currentCost: 50, unit: 'un' },
            supplier: { id: uuid(8), establishmentId: uuid(1) },
            purchaseOrder: { id: uuid(6), status: 'completed', establishmentId: uuid(1), createdAt: new Date('2026-08-30'), completedAt: new Date('2026-08-31') }
        },
        ...overrides
    };
    let attempts = 0;
    const original = prisma.$transaction;
    prisma.$transaction = async (callback, options) => {
        attempts++;
        assert.equal(options.isolationLevel, 'Serializable');
        const draft = structuredClone(state);
        const tx = {
            purchaseOrderItem: {
                findFirst: async ({ where }) => where.id === draft.item.id && where.purchaseOrder.establishmentId === draft.item.purchaseOrder.establishmentId && draft.item.purchaseOrder.status === 'completed' ? draft.item : null,
                update: async ({ data }) => {
                    Object.assign(draft.item, data, { receivedStockQuantity: Number(data.receivedStockQuantity), receivedUnitCost: Number(data.receivedUnitCost) });
                    return draft.item;
                }
            },
            purchaseReturn: {
                findUnique: async ({ where }) => {
                    const existing = draft.returns.find(r => r.requestId === where.establishmentId_requestId.requestId && r.establishmentId === where.establishmentId_requestId.establishmentId);
                    return existing ? { ...existing, stockMovement: draft.movements.find(m => m.id === existing.stockMovementId) } : null;
                },
                aggregate: async () => ({ _sum: { quantity: draft.returns.reduce((sum, r) => sum + Number(r.quantity), 0) } }),
                create: async ({ data }) => {
                    const r = { id: uuid(20 + draft.returns.length), ...data };
                    for (const field of ['quantity', 'purchaseQuantity', 'unitCost', 'totalCost']) r[field] = Number(r[field]);
                    draft.returns.push(r); return r;
                }
            },
            stockLocation: { findFirst: async ({ where }) => where.id === uuid(4) && where.establishmentId === uuid(1) ? { id: uuid(4) } : null },
            productStock: {
                findUnique: async () => ({ quantity: draft.stock }),
                updateMany: async ({ where, data }) => {
                    if (draft.stock < Number(where.quantity.gte)) return { count: 0 };
                    draft.stock -= Number(data.quantity.decrement); return { count: 1 };
                }
            },
            product: { updateMany: async ({ where, data }) => {
                if (draft.productStock < Number(where.quantity.gte)) return { count: 0 };
                draft.productStock -= Number(data.quantity.decrement); return { count: 1 };
            } },
            stockMovement: { create: async ({ data }) => {
                const movement = { id: uuid(40 + draft.movements.length), ...data };
                for (const field of ['quantity', 'previousQuantity', 'newQuantity', 'unitCost', 'totalCost']) movement[field] = Number(movement[field]);
                draft.movements.push(movement); return movement;
            } },
            auditLog: { create: async ({ data }) => { draft.audits.push(data); } }
        };
        const result = await callback(tx);
        if (overrides.conflict && attempts === 1) throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
        state = draft;
        return result;
    };
    return { get state() { return state; }, get attempts() { return attempts; }, restore: () => { prisma.$transaction = original; } };
}

test('devolução usa custo e conversão originais, baixa produto físico e preserva compra', async () => {
    const f = fixture();
    try {
        const result = await createReturn(input);
        assert.equal(result.totalCost, 80);
        assert.equal(result.purchaseQuantity, 0.8);
        assert.equal(f.state.stock, 12);
        assert.equal(f.state.productStock, 12);
        assert.equal(f.state.item.adjustedQuantity, 2);
        assert.equal(f.state.item.unitPrice, 100);
        assert.equal(f.state.movements[0].productId, uuid(7)); // No recipe expansion, even for PRODUCTION.
        assert.equal(f.state.movements[0].reason, 'CONSIGNMENT_RETURN');
        assert.equal(f.state.movements[0].previousQuantity, 20);
        assert.equal(f.state.movements[0].newQuantity, 12);
        assert.equal(f.state.movements[0].recordedByUserId, uuid(2));
        assert.equal(f.state.audits.length, 1);
        assert.equal(f.state.item.product.currentCost, 50);
    } finally { f.restore(); }
});

test('reenvio idempotente não baixa novamente e não aceita alterar o conteúdo', async () => {
    const f = fixture();
    try {
        const first = await createReturn(input);
        const second = await createReturn(input);
        assert.equal(first.id, second.id);
        assert.equal(f.state.movements.length, 1);
        assert.equal(f.state.stock, 12);
        await assert.rejects(createReturn({ ...input, quantity: 2 }), /Identificador/);
    } finally { f.restore(); }
});

test('limita devoluções parciais acumuladas e permite completar o saldo', async () => {
    const f = fixture({ stock: 100, productStock: 100 });
    try {
        await createReturn(input);
        await assert.rejects(createReturn({ ...input, requestId: uuid(9), quantity: 13 }), /ainda não devolvido/);
        await createReturn({ ...input, requestId: uuid(9), quantity: 12 });
        assert.equal(f.state.returns.reduce((s, r) => s + r.totalCost, 0), 200);
        await assert.rejects(createReturn({ ...input, requestId: uuid(10), quantity: 1 }), /ainda não devolvido/);
    } finally { f.restore(); }
});

test('falha no saldo local ou global desfaz toda a operação', async () => {
    for (const overrides of [{ stock: 2 }, { productStock: 2 }]) {
        const f = fixture(overrides);
        try {
            const before = f.state.stock;
            await assert.rejects(createReturn(input), /Saldo/);
            assert.equal(f.state.stock, before);
            assert.equal(f.state.returns.length, 0);
            assert.equal(f.state.movements.length, 0);
        } finally { f.restore(); }
    }
});

test('isola compras e locais, rejeita datas anteriores à compra ou futuras', async () => {
    const f = fixture();
    try {
        for (const changes of [
            { establishmentId: uuid(90) }, { locationId: uuid(90) }, { purchaseOrderItemId: uuid(90) },
            { returnedAt: '2026-08-01' }, { returnedAt: '2099-01-01' }
        ]) await assert.rejects(createReturn({ ...input, ...changes }));
        assert.equal(f.state.movements.length, 0);
    } finally { f.restore(); }
});

test('conflito serializável reexecuta operação sem duplicar a baixa', async () => {
    const f = fixture({ conflict: true });
    try {
        await createReturn(input);
        assert.equal(f.attempts, 2);
        assert.equal(f.state.movements.length, 1);
        assert.equal(f.state.stock, 12);
    } finally { f.restore(); }
});

test('rejeita compra pendente, produto/fornecedor de outra casa e mudança de unidade base', async () => {
    for (const mutate of [
        item => { item.purchaseOrder.status = 'pending'; },
        item => { item.product.establishmentId = uuid(90); },
        item => { item.supplier.establishmentId = uuid(90); },
        item => { item.product.unit = 'ml'; }
    ]) {
        const f = fixture();
        try {
            mutate(f.state.item);
            await assert.rejects(createReturn(input));
            assert.equal(f.state.stock, 20);
            assert.equal(f.state.returns.length, 0);
        } finally { f.restore(); }
    }
});

test('legado recupera quantidade original e bloqueia referências ambíguas ou valores divergentes', async () => {
    const item = { productId: uuid(7), adjustedQuantity: 2, unitPrice: 100, product: { unit: 'un', packQuantity: 99 }, purchaseOrder: { id: uuid(6), createdAt: new Date('2026-08-30'), completedAt: new Date('2026-08-31') } };
    let matches = [{ quantity: 20, totalCost: 200 }];
    const tx = { purchaseOrderItem: { count: async () => 1 }, stockMovement: { findMany: async ({ where }) => { assert.equal(where.establishmentId, uuid(1)); return matches; } } };
    assert.equal((await receiptSnapshot(tx, item, uuid(1))).quantity, 20);
    matches = [...matches, ...matches];
    assert.equal(await receiptSnapshot(tx, item, uuid(1)), null);
    matches = [{ quantity: 20, totalCost: 199 }];
    assert.equal(await receiptSnapshot(tx, item, uuid(1)), null);
});

test('validação rejeita zero, negativos, precisão excedida, infinito e datas inválidas', () => {
    const { establishmentId, userId, ...body } = input;
    for (const quantity of [0, -1, 0.0001, Infinity, NaN, '1']) {
        assert.equal(purchaseReturnSchema.safeParse({ ...body, quantity }).success, false);
    }
    assert.equal(purchaseReturnSchema.safeParse({ ...body, returnedAt: '2026-02-30' }).success, false);
    assert.equal(purchaseReturnSchema.safeParse(body).success, true);
});

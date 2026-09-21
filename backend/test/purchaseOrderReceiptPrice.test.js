const test = require('node:test');
const assert = require('node:assert/strict');

const mockModule = (relativePath, exports) => {
    const resolved = require.resolve(relativePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

test('recebimento persiste preço editado no item, produto, fornecedor e histórico', async () => {
    const calls = {};
    const order = {
        id: '00000000-0000-0000-0000-000000000001',
        status: 'pending',
        items: [{
            id: '00000000-0000-0000-0000-000000000002',
            productId: '00000000-0000-0000-0000-000000000003',
            supplierId: '00000000-0000-0000-0000-000000000004',
            adjustedQuantity: 2,
            unitPrice: 100
        }]
    };

    const tx = {
        purchaseOrder: {
            updateMany: async ({ data }) => data.status === 'processing' ? { count: 1 } : { count: 1 }
        },
        product: {
            findFirst: async () => ({ packQuantity: 10, unit: 'un' }),
            updateMany: async (args) => { calls.product = args.data; return { count: 1 }; }
        },
        purchaseOrderItem: {
            update: async (args) => { calls.item = args.data; return args.data; }
        },
        productSupplier: {
            upsert: async (args) => { calls.supplier = args.update; return args.update; }
        },
        supplierPriceHistory: {
            create: async (args) => { calls.history = args.data; return args.data; }
        },
        purchaseInvoice: {
            create: async ({ data }) => ({ id: 'invoice-id', ...data })
        },
        auditLog: { create: async () => ({}) }
    };

    mockModule('../src/repositories/purchaseOrderRepository', {
        findById: async () => order
    });
    mockModule('../src/repositories/auditLogRepository', { create: async () => ({}) });
    mockModule('../src/utils/prisma', { $transaction: async (callback) => callback(tx) });
    mockModule('../src/services/stockMovementService', {
        addStock: async (data) => { calls.stock = data; }
    });
    mockModule('../src/services/commercialAgreementService', {
        processInvoiceAccruals: async () => {}
    });

    const { completeOrder } = require('../src/services/purchaseOrderService');
    await completeOrder(
        order.id,
        '00000000-0000-0000-0000-000000000005',
        [{ id: order.items[0].id, adjustedQuantity: 3, unitPrice: 125 }],
        { invoiceNumber: '123', issuedAt: '2026-08-30' },
        '00000000-0000-0000-0000-000000000006'
    );

    assert.deepEqual(calls.item, { adjustedQuantity: 3, unitPrice: 125, receivedStockQuantity: 30, receivedUnitCost: 12.5, receivedUnit: 'un' });
    assert.deepEqual(calls.product, { unitPrice: 125, currentCost: 12.5 });
    assert.deepEqual(calls.supplier, { price: 125 });
    assert.equal(calls.history.price, 125);
    assert.equal(calls.history.purchaseOrderId, order.id);
    assert.equal(calls.stock.unitCost, 12.5);
    assert.equal(calls.stock.supplierId, order.items[0].supplierId);
});

test('recebimento inclui produto extra e não movimenta item ausente', async () => {
    const original = { id: 'item-original', productId: 'original', supplierId: 'supplier', adjustedQuantity: 2, unitPrice: 100 };
    const order = { id: 'order', status: 'pending', items: [original] };
    const movements = [];
    const persisted = [];
    let invoiceItems;
    const tx = {
        purchaseOrder: { updateMany: async () => ({ count: 1 }) },
        product: {
            findFirst: async ({ where }) => where.id === 'foreign' ? null : ({ id: where.id, name: 'Produto extra', packQuantity: 6, purchaseClassification: 'CMV_BEVERAGES' }),
            updateMany: async () => ({ count: 1 })
        },
        supplier: { findFirst: async () => ({ id: 'supplier' }) },
        purchaseOrderItem: {
            create: async ({ data }) => { persisted.push(data); return { id: 'extra-id', ...data }; },
            update: async ({ data }) => { persisted.push(data); return data; }
        },
        productSupplier: { upsert: async () => ({}) },
        supplierPriceHistory: { create: async () => ({}) },
        purchaseInvoice: { create: async ({ data }) => { invoiceItems = data.items.create; return { id: 'invoice', ...data }; } },
        auditLog: { create: async () => ({}) }
    };
    mockModule('../src/repositories/purchaseOrderRepository', { findById: async () => order });
    mockModule('../src/utils/prisma', { $transaction: async callback => callback(tx) });
    mockModule('../src/services/stockMovementService', { addStock: async data => movements.push(data) });
    mockModule('../src/services/commercialAgreementService', { processInvoiceAccruals: async () => {} });
    delete require.cache[require.resolve('../src/services/purchaseOrderService')];
    const { completeOrder } = require('../src/services/purchaseOrderService');
    const invoice = { invoiceNumber: '123', issuedAt: '2026-09-06' };
    await completeOrder('order', 'tenant', [
        { id: 'item-original', adjustedQuantity: 0, unitPrice: 100 },
        { productId: 'extra', adjustedQuantity: 3, unitPrice: 120 }
    ], invoice, 'user');
    assert.equal(persisted[0].supplierId, 'supplier');
    assert.equal(persisted[1].adjustedQuantity, 0);
    assert.equal(movements.length, 1);
    assert.equal(movements[0].productId, 'extra');
    assert.equal(movements[0].quantity, 18);
    assert.equal(movements[0].unitCost, 20);
    assert.deepEqual(invoiceItems, [{ productId: 'extra', quantity: 3, unitPrice: 120 }]);
    await assert.rejects(completeOrder('order', 'tenant', [{ productId: 'foreign', adjustedQuantity: 1, unitPrice: 10 }], invoice), /não pertence/);
    await assert.rejects(completeOrder('order', 'tenant', [{ id: 'another-order-item', adjustedQuantity: 1, unitPrice: 10 }], invoice), /não pertence/);
    await assert.rejects(completeOrder('order', 'tenant', [{ productId: 'extra', adjustedQuantity: -1, unitPrice: 10 }], invoice), /não negativos/);
});

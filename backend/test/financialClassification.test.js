const test = require('node:test');
const assert = require('node:assert/strict');

const prismaPath = require.resolve('../src/config/prisma');
const movementDate = new Date('2026-08-20T15:00:00.000Z');

const fakePrisma = {
    stockMovement: {
        findMany: async () => [
            { reason: 'SALE', totalCost: 100, createdAt: movementDate, purchaseClassification: 'CMV_BEVERAGES', product: null },
            { reason: 'SALE', totalCost: 999, createdAt: movementDate, purchaseClassification: 'CLEANING', product: null },
            { reason: 'OPERATIONAL_USE', totalCost: 20, createdAt: movementDate, purchaseClassification: 'CLEANING', product: null },
            { reason: 'OPERATIONAL_USE', totalCost: 10, createdAt: movementDate, purchaseClassification: 'DISPOSABLES', product: null },
            { reason: 'OPERATIONAL_USE', totalCost: 5, createdAt: movementDate, purchaseClassification: 'OPERATING', product: null },
            { reason: 'OPERATIONAL_USE', totalCost: 12, createdAt: movementDate, purchaseClassification: 'CMV_BEVERAGES', product: null },
            { reason: 'LOSS', reference: 'STOCK_AUDIT:audit-1', totalCost: 90, createdAt: movementDate, purchaseClassification: 'CMV_BEVERAGES', product: null },
            { reason: 'GAIN', reference: 'STOCK_AUDIT:audit-1', totalCost: 60, createdAt: movementDate, purchaseClassification: 'CMV_BEVERAGES', product: null },
            { reason: 'OPERATIONAL_LOSS', totalCost: 7, createdAt: movementDate, purchaseClassification: 'CMV_BEVERAGES', product: null }
        ]
    },
    purchaseOrderItem: {
        findMany: async () => [
            { purchaseClassification: 'CMV_BEVERAGES', adjustedQuantity: 2, unitPrice: 30 },
            { purchaseClassification: 'CLEANING', adjustedQuantity: 3, unitPrice: 10 }
        ]
    },
    sale: {
        findMany: async () => [
            { grossTotal: 250, discountTotal: 50, netTotal: 200, soldAt: movementDate }
        ]
    }
};

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
const reportsService = require('../src/services/reportsService');

test('devoluções reduzem compras líquidas sem aumentar CMV, consumo ou perdas', async () => {
    const original = fakePrisma.stockMovement.findMany;
    try {
        fakePrisma.stockMovement.findMany = async () => [
            ...await original(),
            { reason: 'CONSIGNMENT_RETURN', totalCost: 25, createdAt: movementDate, purchaseClassification: 'CMV_BEVERAGES' },
            { reason: 'SUPPLIER_RETURN', totalCost: 5, createdAt: movementDate, purchaseClassification: 'CLEANING' }
        ];
        const { summary } = await reportsService.getFinancialSummary('establishment', '2026-08-20', '2026-08-20');
        assert.equal(summary.grossPurchases, 90);
        assert.equal(summary.purchaseReturns, 30);
        assert.equal(summary.netPurchases, 60);
        assert.equal(summary.purchasesByClassification.CMV_BEVERAGES, 35);
        assert.equal(summary.purchasesByClassification.CLEANING, 25);
        assert.equal(summary.salesCogs, 100);
        assert.equal(summary.operationalConsumption, 47);
        assert.equal(summary.losses, 97);
    } finally { fakePrisma.stockMovement.findMany = original; }
});

test('compras por produto incluem devolução no próprio período, mesmo com compra anterior', async () => {
    const original = fakePrisma.purchaseOrderItem.findMany;
    let returnQuery;
    try {
        fakePrisma.purchaseOrderItem.findMany = async () => [];
        fakePrisma.purchaseReturn = { findMany: async query => {
            returnQuery = query;
            return [{ id: 'return', returnedAt: movementDate, purchaseQuantity: 0.8, totalCost: 80, purchaseOrderItem: {
                unitPrice: 100, purchaseOrder: { id: 'order', completedAt: new Date('2026-07-01') }, product: { name: 'Produto' }, supplier: { name: 'Fornecedor' }
            } }];
        } };
        const rows = await reportsService.getPurchasesByProduct('establishment', 'product', '2026-08-20', '2026-08-20');
        assert.equal(rows.length, 1);
        assert.equal(rows[0].rowType, 'RETURN');
        assert.equal(rows[0].adjustedQuantity, -0.8);
        assert.equal(rows[0].totalAmount, -80);
        assert.equal(returnQuery.where.establishmentId, 'establishment');
        assert.equal(returnQuery.where.purchaseOrderItem.productId, 'product');
        assert.equal(returnQuery.where.returnedAt.gte.toISOString(), '2026-08-20T03:00:00.000Z');
        assert.equal(returnQuery.where.returnedAt.lte.toISOString(), '2026-08-21T02:59:59.999Z');
    } finally {
        fakePrisma.purchaseOrderItem.findMany = original;
        delete fakePrisma.purchaseReturn;
    }
});

test('relatório separa CMV de bebidas dos custos operacionais', async () => {
    const result = await reportsService.getFinancialSummary('establishment', '2026-08-20', '2026-08-20');

    assert.equal(result.summary.salesCogs, 100);
    assert.equal(result.summary.cleaningConsumption, 20);
    assert.equal(result.summary.disposablesConsumption, 10);
    assert.equal(result.summary.otherOperationalConsumption, 5);
    assert.equal(result.summary.beverageOperationalConsumption, 12);
    assert.equal(result.summary.operationalConsumption, 47);
    assert.equal(result.summary.purchasesByClassification.CMV_BEVERAGES, 60);
    assert.equal(result.summary.purchasesByClassification.CLEANING, 30);
    assert.equal(result.summary.netRevenue, 200);
    assert.equal(result.summary.cogsPercentage, 50);
    assert.equal(result.summary.grossProfit, 100);
    assert.equal(result.summary.grossMarginPercentage, 50);
    assert.equal(result.summary.auditLosses, 90);
    assert.equal(result.summary.auditGains, 60);
    assert.equal(result.summary.auditNetImpact, -30);
    assert.equal(result.summary.operationalLosses, 7);
    assert.equal(result.summary.losses, 97);
    assert.equal(result.summary.hasMixedAuditAdjustments, true);
    assert.equal(result.summary.suspectedExchangeAudits, 1);
});

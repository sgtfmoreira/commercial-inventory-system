const test = require('node:test');
const assert = require('node:assert/strict');
const { consumeProduct } = require('../src/services/stockMovementService');

test('consumo operacional de bebidas baixa ingredientes e rejeita materiais e local de outra casa', async () => {
    const prisma = require('../src/utils/prisma');
    const { createBeverageOperationalUse } = require('../src/services/stockMovementService');
    const original = prisma.$transaction;
    const fixture = createFakeTransaction({
        products: [
            { id: 'drink', name: 'Drink', type: 'PRODUCTION', quantity: 0, establishmentId: 'est', defaultLocationId: 'loc', purchaseClassification: 'CMV_BEVERAGES' },
            { id: 'ingredient', name: 'Ingrediente', type: 'INVENTORY', quantity: 10, establishmentId: 'est', defaultLocationId: 'loc', currentCost: 2, purchaseClassification: 'CMV_BEVERAGES' },
            { id: 'material', name: 'Limpeza', type: 'INVENTORY', quantity: 10, establishmentId: 'est', purchaseClassification: 'CLEANING' }
        ],
        stocks: [{ productId: 'ingredient', locationId: 'loc', quantity: 10 }],
        recipes: { drink: { yieldQuantity: 1, items: [{ quantity: 2, product: { id: 'ingredient' } }] } }
    });
    fixture.tx.stockLocation.findFirst = async ({ where }) => where.id === 'loc' && where.establishmentId === 'est' ? { id: 'loc' } : null;
    prisma.$transaction = async callback => callback(fixture.tx);
    try {
        const input = { productId: 'drink', quantity: 2, establishmentId: 'est', userId: 'user' };
        await createBeverageOperationalUse(input);
        assert.equal(fixture.stockMap.get('ingredient:loc').quantity, 6);
        assert.equal(fixture.movements[0].reason, 'OPERATIONAL_USE');
        assert.equal(fixture.movements[0].purchaseClassification, 'CMV_BEVERAGES');
        assert.equal(fixture.movements[0].recordedByUserId, 'user');
        await assert.rejects(createBeverageOperationalUse({ ...input, productId: 'material' }), /bebida ou ingrediente/);
        await assert.rejects(createBeverageOperationalUse({ ...input, locationId: 'other' }), /Local de estoque/);
        await assert.rejects(createBeverageOperationalUse({ ...input, establishmentId: 'other' }), /bebida ou ingrediente/);
        await assert.rejects(createBeverageOperationalUse({ ...input, quantity: 100 }), /Saldo insuficiente/);
        assert.equal(fixture.movements.length, 1);
    } finally {
        prisma.$transaction = original;
    }
});

test('lançamentos individuais e em lote propagam a data aos ingredientes', async () => {
    const prisma = require('../src/utils/prisma');
    const service = require('../src/services/stockMovementService');
    const originalTransaction = prisma.$transaction;
    const originalFind = prisma.product.findFirst;
    try {
        for (const entryType of Object.keys(service.ENTRY_TYPES)) {
            for (const bulk of [false, true]) {
                const fixture = createFakeTransaction({
                    products: [
                        { id: 'drink', name: 'Drink', type: 'PRODUCTION', quantity: 0, establishmentId: 'est', defaultLocationId: 'loc' },
                        { id: 'ingredient', name: 'Ingrediente', type: 'INVENTORY', quantity: 10, establishmentId: 'est', defaultLocationId: 'loc', currentCost: 2 }
                    ],
                    stocks: [{ productId: 'ingredient', locationId: 'loc', quantity: 10 }],
                    recipes: { drink: { yieldQuantity: 1, items: [{ quantity: 2, product: { id: 'ingredient' } }] } }
                });
                prisma.$transaction = async callback => callback(fixture.tx);
                prisma.product.findFirst = fixture.tx.product.findFirst;
                const item = { productId: 'drink', quantity: 1, locationId: 'loc' };
                const input = { entryType, establishmentId: 'est', entryDate: '2026-08-31' };
                if (bulk) await service.createBulkEntries({ ...input, items: [item, item] });
                else await service.createEntry({ ...input, ...item });
                assert.equal(fixture.movements.length, bulk ? 2 : 1);
                for (const movement of fixture.movements) {
                    assert.equal(movement.createdAt.toISOString(), '2026-08-31T15:00:00.000Z');
                    assert.equal(movement.reason, entryType);
                    assert.equal(movement.productId, 'ingredient');
                }
            }
        }
    } finally {
        prisma.$transaction = originalTransaction;
        prisma.product.findFirst = originalFind;
    }
});

const createFakeTransaction = ({ products, stocks, recipes }) => {
    const movements = [];
    const stockMap = new Map(stocks.map(stock => [`${stock.productId}:${stock.locationId}`, { ...stock }]));
    const productMap = new Map(products.map(product => [product.id, { ...product }]));

    const tx = {
        product: {
            findFirst: async ({ where }) => {
                const product = productMap.get(where.id);
                return product && product.establishmentId === where.establishmentId ? { ...product } : null;
            },
            update: async ({ where, data }) => {
                const product = productMap.get(where.id);
                if (data.quantity?.decrement !== undefined) {
                    product.quantity -= Number(data.quantity.decrement);
                }
                return { ...product };
            },
            updateMany: async ({ where, data }) => {
                const product = productMap.get(where.id);
                if (!product || product.establishmentId !== where.establishmentId || product.quantity < Number(where.quantity.gte)) {
                    return { count: 0 };
                }
                product.quantity -= Number(data.quantity.decrement);
                return { count: 1 };
            }
        },
        productStock: {
            findUnique: async ({ where }) => {
                const key = `${where.productId_locationId.productId}:${where.productId_locationId.locationId}`;
                return stockMap.get(key) || null;
            },
            upsert: async ({ where, update, create }) => {
                const key = `${where.productId_locationId.productId}:${where.productId_locationId.locationId}`;
                let stock = stockMap.get(key);
                if (!stock) {
                    stock = { ...create };
                    stockMap.set(key, stock);
                } else {
                    stock.quantity -= Number(update.quantity.decrement);
                }
                return { ...stock };
            },
            updateMany: async ({ where, data }) => {
                const key = `${where.productId}:${where.locationId}`;
                const stock = stockMap.get(key);
                if (!stock || stock.quantity < Number(where.quantity.gte)) return { count: 0 };
                stock.quantity -= Number(data.quantity.decrement);
                return { count: 1 };
            }
        },
        recipe: {
            findFirst: async ({ where }) => recipes[where.productId] || null
        },
        stockLocation: { findFirst: async ({ where }) => where.id === 'loc' && where.establishmentId === 'est' ? { id: 'loc' } : null },
        stockMovement: { create: async ({ data }) => movements.push(data) },
        purchaseOrderItem: { findFirst: async () => null },
        productSupplier: { findFirst: async () => null }
    };

    return { tx, productMap, stockMap, movements };
};

test('venda rejeita local de outro estabelecimento antes de alterar qualquer saldo', async () => {
    const fixture = createFakeTransaction({
        products: [{ id: 'water', name: 'Água', type: 'INVENTORY', quantity: 58, establishmentId: 'est', defaultLocationId: 'loc' }],
        stocks: [{ productId: 'water', locationId: 'loc', quantity: 58 }], recipes: {}
    });
    await assert.rejects(consumeProduct({ productId: 'water', quantity: 18, establishmentId: 'est',
        locationId: 'foreign', reason: 'SALE', reference: 'MANUAL_SALE', preloadedCost: 1 }, fixture.tx), /Local de estoque inválido/);
    assert.equal(fixture.productMap.get('water').quantity, 58);
    assert.equal(fixture.stockMap.size, 1);
    assert.equal(fixture.movements.length, 0);
    await consumeProduct({ productId: 'water', quantity: 18, establishmentId: 'est',
        reason: 'SALE', reference: 'MANUAL_SALE', preloadedCost: 1 }, fixture.tx);
    assert.equal(fixture.productMap.get('water').quantity, 40);
    assert.equal(fixture.stockMap.get('water:loc').quantity, 40);
});

test('entrada também rejeita local de outro estabelecimento', async () => {
    const fixture = createFakeTransaction({
        products: [{ id: 'water', quantity: 40, establishmentId: 'est', defaultLocationId: 'foreign' }], stocks: [], recipes: {}
    });
    await assert.rejects(require('../src/services/stockMovementService').addStock({ productId: 'water', quantity: 2,
        establishmentId: 'est', reason: 'PURCHASE' }, fixture.tx), /Local de estoque inválido/);
    assert.equal(fixture.productMap.get('water').quantity, 40);
    assert.equal(fixture.stockMap.size, 0);
});

test('consome saldo pronto e explode apenas a diferença da produção', async () => {
    const fixture = createFakeTransaction({
        products: [
            { id: 'drink', name: 'Drink', type: 'PRODUCTION', quantity: 5, establishmentId: 'est', defaultLocationId: 'loc' },
            { id: 'insumo', name: 'Insumo', type: 'INVENTORY', quantity: 100, establishmentId: 'est', defaultLocationId: 'loc', currentCost: 1 }
        ],
        stocks: [
            { productId: 'drink', locationId: 'loc', quantity: 5 },
            { productId: 'insumo', locationId: 'loc', quantity: 100 }
        ],
        recipes: {
            drink: { yieldQuantity: 1, items: [{ quantity: 1, product: { id: 'insumo' } }] }
        }
    });

    await consumeProduct({
        productId: 'drink', quantity: 10, establishmentId: 'est',
        reason: 'SALE', reference: 'TEST', preloadedCost: 2
    }, fixture.tx);

    assert.equal(fixture.productMap.get('drink').quantity, 0);
    assert.equal(fixture.productMap.get('insumo').quantity, 95);
    assert.deepEqual(fixture.movements.map(m => [m.productId, m.quantity]), [['drink', 5], ['insumo', 5]]);
});

test('explode ingredientes de produção de forma recursiva', async () => {
    const fixture = createFakeTransaction({
        products: [
            { id: 'final', name: 'Final', type: 'PRODUCTION', quantity: 0, establishmentId: 'est', defaultLocationId: 'loc' },
            { id: 'intermediario', name: 'Intermediário', type: 'PRODUCTION', quantity: 1, establishmentId: 'est', defaultLocationId: 'loc', currentCost: 1 },
            { id: 'base', name: 'Base', type: 'INVENTORY', quantity: 100, establishmentId: 'est', defaultLocationId: 'loc', currentCost: 1 }
        ],
        stocks: [
            { productId: 'final', locationId: 'loc', quantity: 0 },
            { productId: 'intermediario', locationId: 'loc', quantity: 1 },
            { productId: 'base', locationId: 'loc', quantity: 100 }
        ],
        recipes: {
            final: { yieldQuantity: 1, items: [{ quantity: 2, product: { id: 'intermediario' } }] },
            intermediario: { yieldQuantity: 1, items: [{ quantity: 3, product: { id: 'base' } }] }
        }
    });

    await consumeProduct({
        productId: 'final', quantity: 2, establishmentId: 'est',
        reason: 'SALE', reference: 'TEST'
    }, fixture.tx);

    assert.equal(fixture.productMap.get('intermediario').quantity, 0);
    assert.equal(fixture.productMap.get('base').quantity, 91);
});

test('interrompe ciclos em fichas técnicas', async () => {
    const fixture = createFakeTransaction({
        products: [
            { id: 'a', name: 'A', type: 'PRODUCTION', quantity: 0, establishmentId: 'est', defaultLocationId: 'loc' },
            { id: 'b', name: 'B', type: 'PRODUCTION', quantity: 0, establishmentId: 'est', defaultLocationId: 'loc' }
        ],
        stocks: [],
        recipes: {
            a: { yieldQuantity: 1, items: [{ quantity: 1, product: { id: 'b' } }] },
            b: { yieldQuantity: 1, items: [{ quantity: 1, product: { id: 'a' } }] }
        }
    });

    await assert.rejects(
        consumeProduct({
            productId: 'a', quantity: 1, establishmentId: 'est',
            reason: 'SALE', reference: 'TEST'
        }, fixture.tx),
        /Ciclo detectado/
    );
});

test('baixa protegida não permite saldo local negativo', async () => {
    const fixture = createFakeTransaction({
        products: [{ id: 'detergente', name: 'Detergente', type: 'INVENTORY', quantity: 2, establishmentId: 'est', defaultLocationId: 'loc', currentCost: 5 }],
        stocks: [{ productId: 'detergente', locationId: 'loc', quantity: 2 }],
        recipes: {}
    });

    await assert.rejects(
        consumeProduct({
            productId: 'detergente', quantity: 3, establishmentId: 'est',
            reason: 'OPERATIONAL_USE', reference: 'TEST', enforceAvailableStock: true
        }, fixture.tx),
        /Saldo insuficiente/
    );
    assert.equal(fixture.stockMap.get('detergente:loc').quantity, 2);
    assert.equal(fixture.productMap.get('detergente').quantity, 2);
});

test('baixa protegida congela classificação e mantém saldos consistentes', async () => {
    const fixture = createFakeTransaction({
        products: [{ id: 'papel', name: 'Papel', type: 'INVENTORY', quantity: 10, establishmentId: 'est', defaultLocationId: 'loc', currentCost: 2, purchaseClassification: 'CLEANING' }],
        stocks: [{ productId: 'papel', locationId: 'loc', quantity: 10 }],
        recipes: {}
    });

    await consumeProduct({
        productId: 'papel', quantity: 4, establishmentId: 'est', reason: 'OPERATIONAL_USE',
        reference: 'TEST', enforceAvailableStock: true
    }, fixture.tx);

    assert.equal(fixture.stockMap.get('papel:loc').quantity, 6);
    assert.equal(fixture.productMap.get('papel').quantity, 6);
    assert.equal(fixture.movements[0].purchaseClassification, 'CLEANING');
});

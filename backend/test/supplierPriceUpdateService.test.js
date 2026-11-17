const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/supplierPriceUpdateService');

test('lotes remotos usam janela transacional suficiente para múltiplos itens', () => {
    assert.equal(service.TRANSACTION_OPTIONS.maxWait, 15000);
    assert.equal(service.TRANSACTION_OPTIONS.timeout, 60000);
});

test('normaliza preço do pacote pela quantidade sem usar Float persistido', () => {
    assert.equal(service.normalizedPrice(120, 24), 5);
    assert.equal(service.normalizedPrice(10, 3), 3.3333);
});

test('rejeita preço ou quantidade não positiva', () => {
    assert.throws(() => service.normalizedPrice(0, 12), error => error.statusCode === 422);
    assert.throws(() => service.normalizedPrice(10, 0), error => error.statusCode === 422);
});

test('propagação monta alvos apenas quando produto e fornecedor pertencem ao mesmo estabelecimento', async () => {
    const db = {
        product: { findMany: async () => [
            { id: 'product-a', name: 'Produto A', establishmentId: 'a', establishment: { name: 'A' } },
            { id: 'product-b', name: 'Produto B', establishmentId: 'b', establishment: { name: 'B' } }
        ] },
        supplier: { findMany: async () => [
            { id: 'supplier-a', name: 'Fornecedor A', establishmentId: 'a' },
            { id: 'supplier-c', name: 'Fornecedor C', establishmentId: 'c' }
        ] },
        productSupplier: { findMany: async () => [{
            id: 'valid', price: 10,
            product: { id: 'product-a', establishmentId: 'a' },
            supplier: { id: 'supplier-a', establishmentId: 'a' }
        }] }
    };
    const targets = await service.localTargets({ organizationProductId: 'product', organizationSupplierId: 'supplier' }, db);
    assert.deepEqual(targets.map(item => ({ id: item.id, product: item.product.id, supplier: item.supplier.id })), [
        { id: 'valid', product: 'product-a', supplier: 'supplier-a' }
    ]);
});

test('aplicação cria vínculo ausente e grava histórico para todas as casas elegíveis', async () => {
    const upserts = [];
    const histories = [];
    const db = {
        product: { findMany: async () => [
            { id: 'product-a', name: 'Produto A', establishmentId: 'a', establishment: { name: 'A' } },
            { id: 'product-b', name: 'Produto B', establishmentId: 'b', establishment: { name: 'B' } }
        ] },
        supplier: { findMany: async () => [
            { id: 'supplier-a', name: 'Fornecedor A', establishmentId: 'a' },
            { id: 'supplier-b', name: 'Fornecedor B', establishmentId: 'b' }
        ] },
        productSupplier: {
            findMany: async () => [{
                id: 'existing', price: 10,
                product: { id: 'product-a', establishmentId: 'a' },
                supplier: { id: 'supplier-a', establishmentId: 'a' }
            }],
            upsert: async args => { upserts.push(args); return args.create; }
        },
        supplierPriceHistory: { create: async args => { histories.push(args.data); return args.data; } }
    };
    const targets = await service.applyCatalogPrice(
        { organizationProductId: 'product', organizationSupplierId: 'supplier' },
        125,
        db
    );
    assert.equal(targets.length, 2);
    assert.equal(upserts.length, 2);
    assert.deepEqual(upserts.map(item => item.where.productId_supplierId), [
        { productId: 'product-a', supplierId: 'supplier-a' },
        { productId: 'product-b', supplierId: 'supplier-b' }
    ]);
    assert.deepEqual(histories.map(item => item.price), [125, 125]);
});

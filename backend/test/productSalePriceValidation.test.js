const test = require('node:test');
const assert = require('node:assert/strict');
const { createProductSchema, updateProductSchema } = require('../src/validations/productValidation');

test('preço de venda é opcional e permite limpar ou cadastrar zero', () => {
    const product = { name: 'Bebida', categoryId: '00000000-0000-4000-8000-000000000001', unit: 'unidade', type: 'INVENTORY', packQuantity: 1, idealQuantity: 0 };
    assert.equal(createProductSchema.parse(product).salePrice, undefined);
    for (const salePrice of [null, 0, 12.5]) {
        assert.equal(createProductSchema.parse({ ...product, salePrice }).salePrice, salePrice);
        assert.equal(updateProductSchema.parse({ salePrice }).salePrice, salePrice);
    }
    for (const salePrice of [-1, Infinity, NaN, 100000000]) {
        assert.equal(updateProductSchema.safeParse({ salePrice }).success, false);
    }
});

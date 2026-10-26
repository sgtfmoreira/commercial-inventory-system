const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTransferConversion } = require('../src/utils/stockTransferConversion');

test('converte 3000 ml de garrafa de 1000 ml em 3 unidades', () => {
    const result = calculateTransferConversion({
        sourceProduct: { unit: 'ml', purchaseUnit: 'GARRAFA', packQuantity: 1000 },
        destinationProduct: { unit: 'unidade', purchaseUnit: 'garrafa', packQuantity: 1 },
        quantity: 3000
    });
    assert.equal(result.destinationQuantity, 3);
    assert.equal(result.conversionFactor, 0.001);
    assert.equal(result.mode, 'PACKAGE');
});

test('mantem a quantidade quando as unidades-base sao iguais', () => {
    const result = calculateTransferConversion({
        sourceProduct: { unit: 'ml', purchaseUnit: 'GARRAFA', packQuantity: 1000 },
        destinationProduct: { unit: 'ML', purchaseUnit: 'GARRAFA', packQuantity: 750 },
        quantity: 500
    });
    assert.equal(result.destinationQuantity, 500);
    assert.equal(result.mode, 'SAME_UNIT');
});

test('trata UN e unidade como a mesma unidade-base', () => {
    const result = calculateTransferConversion({
        sourceProduct: { unit: 'UN', packQuantity: 1 },
        destinationProduct: { unit: 'unidade', packQuantity: 1 },
        quantity: 4
    });
    assert.equal(result.destinationQuantity, 4);
    assert.equal(result.mode, 'SAME_UNIT');
});

test('rejeita conversao sem unidade comercial comum', () => {
    assert.throws(() => calculateTransferConversion({
        sourceProduct: { unit: 'ml', purchaseUnit: 'GARRAFA', packQuantity: 1000 },
        destinationProduct: { unit: 'unidade', purchaseUnit: 'CAIXA', packQuantity: 1 },
        quantity: 1000
    }), /Unidades incompativeis/);
});

test('rejeita fracao quando o destino e uma unidade indivisivel', () => {
    assert.throws(() => calculateTransferConversion({
        sourceProduct: { unit: 'ml', purchaseUnit: 'GARRAFA', packQuantity: 1000 },
        destinationProduct: { unit: 'unidade', purchaseUnit: 'GARRAFA', packQuantity: 1 },
        quantity: 1500
    }), /apenas unidades inteiras/);
});

test('rejeita fator de embalagem zerado', () => {
    assert.throws(() => calculateTransferConversion({
        sourceProduct: { unit: 'ml', purchaseUnit: 'GARRAFA', packQuantity: 0 },
        destinationProduct: { unit: 'unidade', purchaseUnit: 'GARRAFA', packQuantity: 1 },
        quantity: 1000
    }), /maior que zero/);
});

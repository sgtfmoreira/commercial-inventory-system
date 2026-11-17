const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/utils/prisma');
const {
    calculateAccrual,
    calculateCashbackAccrual,
    processInvoiceAccruals,
    receiveCashback
} = require('../src/services/commercialAgreementService');

test('calcula cada nota isoladamente sem acumular compras anteriores', () => {
    const first = calculateAccrual({ eligibleQuantity: 9, buyQuantity: 10, bonusQuantity: 1 });
    assert.deepEqual(first, { earnedBonusQuantity: 0, balanceAfter: 0 });
    const second = calculateAccrual({ eligibleQuantity: 2, buyQuantity: 10, bonusQuantity: 1 });
    assert.deepEqual(second, { earnedBonusQuantity: 0, balanceAfter: 0 });
});

test('descarta o excedente da nota depois de calcular ciclos completos', () => {
    const result = calculateAccrual({ eligibleQuantity: 19, buyQuantity: 10, bonusQuantity: 1 });
    assert.deepEqual(result, { earnedBonusQuantity: 1, balanceAfter: 0 });
});

test('aceita mais de uma unidade bonificada por ciclo', () => {
    const result = calculateAccrual({ eligibleQuantity: 24, buyQuantity: 12, bonusQuantity: 2 });
    assert.deepEqual(result, { earnedBonusQuantity: 4, balanceAfter: 0 });
});

test('calcula cashback fixo para cada unidade elegível recebida', () => {
    assert.equal(calculateCashbackAccrual({ eligibleQuantity: 5, cashbackPerUnit: 10 }), 50);
    assert.equal(calculateCashbackAccrual({ eligibleQuantity: 1.5, cashbackPerUnit: 3.33 }), 5);
});

test('apuração de cashback usa apenas fornecedor, vigência e estabelecimento da nota', async () => {
    let agreementQuery;
    let accrualData;
    const tx = {
        commercialAgreement: {
            findMany: async ({ where }) => {
                agreementQuery = where;
                return [{
                    id: 'agreement-lights',
                    benefitType: 'CASHBACK_FIXED_PER_UNIT',
                    cashbackPerUnit: 10,
                    products: [{ productId: 'absolut-lights', eligibilityFactor: 1, canGenerateBonus: true }]
                }];
            },
            update: async () => ({})
        },
        bonusAccrual: {
            create: async ({ data }) => { accrualData = data; return data; }
        }
    };
    const invoice = {
        id: 'invoice-lights',
        establishmentId: 'lights',
        supplierId: 'sanguine-lights',
        issuedAt: new Date('2026-11-17T12:00:00Z')
    };

    await processInvoiceAccruals(tx, {
        invoice,
        invoiceItems: [{ productId: 'absolut-lights', quantity: 5, unitPrice: 98 }]
    });

    assert.equal(agreementQuery.establishmentId, 'lights');
    assert.equal(agreementQuery.supplierId, 'sanguine-lights');
    assert.equal(accrualData.eligibleQuantity, 5);
    assert.equal(accrualData.earnedCashbackAmount, 50);
    assert.equal(accrualData.earnedBonusQuantity, 0);
});

test('recebimento de cashback respeita o saldo e o estabelecimento do acordo', async () => {
    const originalTransaction = prisma.$transaction;
    let agreementWhere;
    let settlementData;
    prisma.$transaction = async callback => callback({
        commercialAgreement: {
            findFirst: async ({ where }) => {
                agreementWhere = where;
                return {
                    supplierId: 'sanguine-lights',
                    accruals: [{ earnedCashbackAmount: 50 }],
                    cashbackSettlements: [{ amount: 20 }]
                };
            }
        },
        commercialAgreementCashbackSettlement: {
            create: async ({ data }) => { settlementData = data; return data; }
        }
    });
    try {
        await receiveCashback({
            establishmentId: 'lights',
            userId: 'admin',
            agreementId: 'agreement-lights',
            amount: 30,
            receivedAt: '2026-11-17',
            method: 'PIX',
            reference: 'PIX-001'
        });
        assert.equal(agreementWhere.establishmentId, 'lights');
        assert.equal(agreementWhere.benefitType, 'CASHBACK_FIXED_PER_UNIT');
        assert.equal(settlementData.amount, 30);
        assert.equal(settlementData.supplierId, 'sanguine-lights');

        await assert.rejects(receiveCashback({
            establishmentId: 'lights',
            userId: 'admin',
            agreementId: 'agreement-lights',
            amount: 30.01,
            receivedAt: '2026-11-17',
            method: 'PIX'
        }), /excede o cashback pendente/);
    } finally {
        prisma.$transaction = originalTransaction;
    }
});

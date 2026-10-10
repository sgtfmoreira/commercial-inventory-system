const test = require('node:test');
const assert = require('node:assert/strict');

const prismaPath = require.resolve('../src/config/prisma');

let deletedItems = false;
let createdItems = [];

const tx = {
    portioningRecipe: {
        findFirst: async ({ where }) => where.id === 'recipe'
            && where.establishmentId === 'establishment'
            ? { id: 'recipe', sourceProductId: 'source', establishmentId: 'establishment' }
            : null,
        findUnique: async () => ({ id: 'recipe', sourceProductId: 'source', items: createdItems })
    },
    product: {
        findMany: async ({ where }) => where.id.in.map(id => ({ id }))
    },
    portioningRecipeItem: {
        deleteMany: async () => {
            deletedItems = true;
        },
        createMany: async ({ data }) => {
            createdItems = data;
        }
    }
};

require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
        $transaction: async callback => callback(tx)
    }
};

const { updateRecipe } = require('../src/services/portioningService');

test.beforeEach(() => {
    deletedItems = false;
    createdItems = [];
});

test('edita os cortes da ficha de forma atômica', async () => {
    const result = await updateRecipe('recipe', [
        { targetProductId: 'escalope', costAllocationPercentage: 70 },
        { targetProductId: 'iscas', costAllocationPercentage: 30 }
    ], 'establishment');

    assert.equal(deletedItems, true);
    assert.deepEqual(createdItems, [
        { portioningRecipeId: 'recipe', targetProductId: 'escalope', costAllocationPercentage: 70 },
        { portioningRecipeId: 'recipe', targetProductId: 'iscas', costAllocationPercentage: 30 }
    ]);
    assert.equal(result.items.length, 2);
});

test('rejeita edição quando os percentuais não totalizam 100%', async () => {
    await assert.rejects(
        updateRecipe('recipe', [
            { targetProductId: 'escalope', costAllocationPercentage: 60 },
            { targetProductId: 'iscas', costAllocationPercentage: 30 }
        ], 'establishment'),
        /soma das porcentagens deve ser 100%/
    );

    assert.equal(deletedItems, false);
});

test('rejeita o mesmo corte informado mais de uma vez', async () => {
    await assert.rejects(
        updateRecipe('recipe', [
            { targetProductId: 'escalope', costAllocationPercentage: 50 },
            { targetProductId: 'escalope', costAllocationPercentage: 50 }
        ], 'establishment'),
        /não pode ser informado mais de uma vez/
    );
});

const prisma = require('../src/utils/prisma');

async function main() {
    const counts = await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const [products, recipes, productStocks, stockMovements, purchaseOrders, sales, consumptionEvents] = await Promise.all([
            tx.product.count(), tx.recipe.count(), tx.productStock.count(), tx.stockMovement.count(),
            tx.purchaseOrder.count(), tx.sale.count(), tx.consumptionEvent.count()
        ]);
        return { products, recipes, productStocks, stockMovements, purchaseOrders, sales, consumptionEvents };
    }, { maxWait: 15000, timeout: 30000 });
    console.log(JSON.stringify({ success: true, readOnlyTransaction: true, modules: counts }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());

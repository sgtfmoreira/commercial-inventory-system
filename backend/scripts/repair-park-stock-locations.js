// Incident repair: Park sales incorrectly allocated to a Lights location.
// Preview is read-only. Apply requires the saved preview and rejects changed data.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient({ log: [] });
const ESTABLISHMENT = '6dcb1af1-3636-412c-9697-5da785c966f3';
const SOURCE = 'dbbd5942-7873-4f91-bcbe-2bc0362acbfa';
const TARGET = '79bfed2c-1fc5-4526-a756-c28ba842b590';
const D = value => new Prisma.Decimal(value);

async function snapshot(db) {
    const locations = await db.stockLocation.findMany({ where: { id: { in: [SOURCE, TARGET] } }, orderBy: { id: 'asc' } });
    const products = await db.product.findMany({
        where: { establishmentId: ESTABLISHMENT, productStocks: { some: { locationId: SOURCE } } },
        include: { productStocks: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' }
    });
    const ids = products.map(p => p.id);
    const movements = await db.stockMovement.findMany({ where: { productId: { in: ids } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const audits = await db.stockAuditItem.findMany({ where: { productId: { in: ids } }, orderBy: { id: 'asc' } });
    return JSON.parse(JSON.stringify({ locations, products, movements, audits }));
}

function buildPlan(data) {
    if (data.locations.find(l => l.id === TARGET)?.establishmentId !== ESTABLISHMENT
        || data.locations.find(l => l.id === SOURCE)?.establishmentId === ESTABLISHMENT) throw new Error('Unexpected location ownership');
    return data.products.map(p => {
        const source = p.productStocks.find(s => s.locationId === SOURCE);
        const target = p.productStocks.find(s => s.locationId === TARGET);
        if (p.defaultLocationId !== TARGET || !source || !target || p.productStocks.length !== 2) throw new Error(`Ambiguous stock: ${p.name}`);
        const moves = data.movements.filter(m => m.productId === p.id && m.locationId === SOURCE);
        if (!moves.length || moves.some(m => m.establishmentId !== ESTABLISHMENT
            || !((m.type === 'OUT' && m.reason === 'SALE') || (m.type === 'IN' && m.reason === 'BONUS')))) throw new Error(`Unexpected movements: ${p.name}`);
        let sourceBalance = D(0);
        for (const move of moves) {
            const change = m => m.type === 'OUT' ? D(m.quantity).neg() : D(m.quantity);
            if (!sourceBalance.eq(move.previousQuantity) || !sourceBalance.add(change(move)).eq(move.newQuantity)) throw new Error(`Broken source history: ${p.name}`);
            sourceBalance = sourceBalance.add(change(move));
        }
        const debit = sourceBalance.neg();
        if (!D(source.quantity).eq(sourceBalance) || !D(target.quantity).add(source.quantity).eq(p.quantity)) throw new Error(`Unreconciled balance: ${p.name}`);
        // Dates can be backdated: never invent a chronological balance history.
        // Preserve original snapshots and explicitly document their original scope.
        const updates = moves.map(m => ({ id: m.id, locationId: TARGET,
            notes: [m.notes, `Correção de local em 21/09/2026: ${SOURCE} -> ${TARGET}. Saldos anterior/posterior preservam o registro original no local incorreto. Quantidade e valores da operação preservados.`].filter(Boolean).join('\n') }));
        return { productId: p.id, name: p.name, sourceId: source.id, targetId: target.id,
            before: target.quantity, after: p.quantity, debit: debit.toString(), updates };
    });
}

async function main() {
    const apply = process.argv.includes('--apply');
    const output = path.resolve(__dirname, '../../backups/stock-location-incident-2026-09-21.json');
    if (!apply) {
        const data = await prisma.$transaction(tx => snapshot(tx), { isolationLevel: 'RepeatableRead', timeout: 60000 });
        const plan = buildPlan(data);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify({ capturedAt: new Date().toISOString(), data, plan }, null, 2), { flag: 'wx' });
        console.log(JSON.stringify({ mode: 'preview', backup: output, products: plan.map(({ name, before, after, debit, updates }) => ({ name, before, after, debit, movements: updates.length })) }, null, 2));
        return;
    }
    const saved = JSON.parse(fs.readFileSync(output, 'utf8'));
    const result = await prisma.$transaction(async tx => {
        // Short maintenance lock prevents concurrent sales/counts from racing repair.
        await tx.$executeRawUnsafe('LOCK TABLE products, product_stocks, stock_movements, stock_audit_items IN SHARE ROW EXCLUSIVE MODE');
        const current = await snapshot(tx);
        if (JSON.stringify(current) !== JSON.stringify(saved.data)) throw new Error('Data changed since preview; create a fresh reviewed backup');
        const plan = buildPlan(current);
        for (const item of plan) {
            await tx.productStock.update({ where: { id: item.targetId }, data: { quantity: item.after } });
            await tx.productStock.delete({ where: { id: item.sourceId } });
            for (const { id, ...data } of item.updates) await tx.stockMovement.update({ where: { id }, data });
            await tx.auditLog.create({ data: { establishmentId: ESTABLISHMENT, entityType: 'PRODUCT', entityId: item.productId,
                actionType: 'REPAIR_STOCK_LOCATION', description: `Correção de local de vendas Park/Lights. Local ${SOURCE} -> ${TARGET}; saldo local ${item.before} -> ${item.after}; total do produto preservado; backup stock-location-incident-2026-09-21.json.` } });
        }
        for (const item of plan) {
            const product = await tx.product.findUnique({ where: { id: item.productId }, include: { productStocks: true } });
            if (!D(product.quantity).eq(item.after) || product.productStocks.length !== 1 || product.productStocks[0].locationId !== TARGET
                || !D(product.productStocks[0].quantity).eq(item.after)) throw new Error('Post-repair verification failed');
        }
        return { repairedProducts: plan.length, relocatedAndReconciledMovements: plan.reduce((n, p) => n + p.updates.length, 0), totalsPreserved: true };
    }, { timeout: 120000, maxWait: 15000 });
    console.log(JSON.stringify(result, null, 2));
    fs.writeFileSync(output.replace('.json', '-result.json'), JSON.stringify({ appliedAt: new Date().toISOString(), ...result }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
module.exports = { buildPlan };

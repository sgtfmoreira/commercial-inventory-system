const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const prisma = require('../src/utils/prisma');

const runId = randomUUID().slice(0, 8);
const marker = `[SMOKE-EVENTS-HTTP-${runId}]`;
const createdUserIds = [];
const protectedEstablishmentIds = [];

const tokenFor = (userId, establishmentId, role) => jwt.sign(
    { userId, establishmentId, role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
);

async function protectedSnapshot(establishmentIds) {
    const [products, productStocks, stockMovements, purchaseOrders, sales, consumptionEvents] = await Promise.all([
        prisma.product.findMany({
            where: { establishmentId: { in: establishmentIds } },
            select: { id: true, quantity: true }, orderBy: { id: 'asc' }
        }),
        prisma.productStock.findMany({
            where: { product: { establishmentId: { in: establishmentIds } } },
            select: { id: true, quantity: true }, orderBy: { id: 'asc' }
        }),
        prisma.stockMovement.count({ where: { establishmentId: { in: establishmentIds } } }),
        prisma.purchaseOrder.count({ where: { establishmentId: { in: establishmentIds } } }),
        prisma.sale.count({ where: { establishmentId: { in: establishmentIds } } }),
        prisma.consumptionEvent.count({ where: { establishmentId: { in: establishmentIds } } })
    ]);
    return {
        productQuantities: products.map(row => [row.id, row.quantity.toString()]),
        productStockQuantities: productStocks.map(row => [row.id, row.quantity.toString()]),
        counts: { stockMovements, purchaseOrders, sales, consumptionEvents }
    };
}

async function cleanup() {
    const events = await prisma.commercialEvent.findMany({
        where: { name: { startsWith: marker } }, select: { id: true, budgets: { select: { id: true } } }
    });
    const eventIds = events.map(event => event.id);
    const budgetIds = events.flatMap(event => event.budgets.map(budget => budget.id));
    if (eventIds.length || budgetIds.length) {
        await prisma.auditLog.deleteMany({ where: { entityId: { in: [...eventIds, ...budgetIds] } } });
    }
    if (eventIds.length) await prisma.commercialEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.eventCustomer.deleteMany({ where: { name: { startsWith: marker } } });
    if (createdUserIds.length) {
        await prisma.userEstablishment.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    const [remainingEvents, remainingCustomers, remainingUsers] = await Promise.all([
        prisma.commercialEvent.count({ where: { name: { startsWith: marker } } }),
        prisma.eventCustomer.count({ where: { name: { startsWith: marker } } }),
        createdUserIds.length ? prisma.users.count({ where: { id: { in: createdUserIds } } }) : 0
    ]);
    assert.deepEqual(
        { remainingEvents, remainingCustomers, remainingUsers },
        { remainingEvents: 0, remainingCustomers: 0, remainingUsers: 0 },
        'A limpeza do smoke HTTP não removeu todos os dados identificáveis.'
    );
}

async function main() {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET é obrigatório para o smoke autenticado.');
    const establishments = await prisma.establishments.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' }, take: 2 });
    assert.equal(establishments.length, 2, 'O smoke exige dois estabelecimentos existentes para provar isolamento de tenant.');
    protectedEstablishmentIds.push(...establishments.map(item => item.id));
    const [tenantA, tenantB] = establishments;

    const users = await prisma.$transaction(async tx => {
        const definitions = [
            { role: 'ADMIN', establishmentId: tenantA.id },
            { role: 'MANAGER', establishmentId: tenantB.id },
            { role: 'STOCK_COUNTER', establishmentId: tenantA.id }
        ];
        const result = [];
        for (const definition of definitions) {
            const user = await tx.users.create({ data: {
                name: `${marker} ${definition.role}`,
                email: `smoke-events-${runId}-${definition.role.toLowerCase()}@example.invalid`,
                password: 'SMOKE-NOT-FOR-LOGIN'
            } });
            createdUserIds.push(user.id);
            await tx.userEstablishment.create({ data: {
                userId: user.id, establishmentId: definition.establishmentId, role: definition.role, isActive: true
            } });
            result.push({ ...definition, userId: user.id, token: tokenFor(user.id, definition.establishmentId, definition.role) });
        }
        return result;
    });
    const [admin, manager, forbidden] = users;
    const before = await protectedSnapshot(protectedEstablishmentIds);

    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api`;

    const request = async (method, route, token, body, expectedStatus, responseType = 'json') => {
        const response = await fetch(`${baseUrl}${route}`, {
            method,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        const data = responseType === 'buffer'
            ? Buffer.from(await response.arrayBuffer())
            : await response.json().catch(() => ({}));
        assert.equal(response.status, expectedStatus, `${method} ${route}: esperado ${expectedStatus}, recebido ${response.status}: ${JSON.stringify(data)}`);
        return { response, data: responseType === 'json' && data?.data !== undefined ? data.data : data };
    };

    try {
        await request('GET', '/events', null, null, 401);
        await request('GET', '/events', forbidden.token, null, 403);
        await request('GET', '/events', admin.token, null, 200);
        await request('GET', '/events', manager.token, null, 200);

        const customerA = (await request('POST', '/event-customers', admin.token, {
            name: `${marker} Cliente A`, document: null, phone: null, email: null, notes: null
        }, 201)).data;
        const customerB = (await request('POST', '/event-customers', manager.token, {
            name: `${marker} Cliente B`, document: null, phone: null, email: null, notes: null
        }, 201)).data;
        await request('GET', `/event-customers/${customerB.id}`, admin.token, null, 404);
        await request('GET', `/event-customers/${customerA.id}`, manager.token, null, 404);

        const eventDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const event = (await request('POST', '/events', admin.token, {
            customerId: customerA.id, name: `${marker} Evento`, type: 'CORPORATE', eventDate,
            startTime: '18:00', endTime: '23:00', guestCount: 40, location: 'Salão São José',
            responsibleUserId: admin.userId, internalNotes: `${marker} nota interna`
        }, 201)).data;
        const firstBudget = event.budgets.find(budget => budget.revision === 1);
        assert.ok(firstBudget?.id, 'A criação do evento deve devolver a revisão 1.');
        await request('GET', `/events/${event.id}`, manager.token, null, 404);
        await request('GET', `/event-budgets/${firstBudget.id}`, manager.token, null, 404);

        const budgetWithItem = (await request('POST', `/event-budgets/${firstBudget.id}/items`, admin.token, {
            itemType: 'MANUAL', costGroup: 'MENU', sourceId: null, sourceType: null,
            nameSnapshot: 'Canapé de queijo', categorySnapshot: 'Entrada', quantityMode: 'PER_GUEST',
            fixedQuantity: null, quantityPerGuest: '2', safetyPercent: '10', unitSnapshot: 'un',
            unitCostSnapshot: '2.50', suggestedUnitPriceSnapshot: null, visibleInProposal: true,
            proposalLabel: 'Canapés especiais', internalNotes: `${marker} custo interno`,
            compositionSnapshot: null, sortOrder: 0
        }, 201)).data;
        assert.equal(budgetWithItem.totalCost, '220');

        const priced = (await request('PATCH', `/event-budgets/${firstBudget.id}`, admin.token, {
            desiredMarginPercent: '30', taxPercent: '5', commissionPercent: '0', cardFeePercent: '0',
            otherFeePercent: '0', quotedPrice: '400', validUntil: eventDate,
            customerProposalNotes: 'Condições comerciais com acentuação: café, salão e recepção.',
            internalNotes: `${marker} lucro e custo não públicos`
        }, 200)).data;
        assert.equal(priced.totalCost, '220');
        assert.equal(priced.quotedPrice, '400');
        assert.ok(Number(priced.recommendedPrice) > 0);

        const sent = (await request('POST', `/event-budgets/${firstBudget.id}/send`, admin.token, null, 200)).data;
        assert.equal(sent.status, 'SENT');
        const proposal = (await request('GET', `/event-budgets/${firstBudget.id}/proposal`, admin.token, null, 200)).data;
        const proposalText = JSON.stringify(proposal);
        for (const forbiddenField of ['unitCostSnapshot', 'totalCost', 'expectedProfit', 'effectiveMarginPercent', 'menuCMVPercent', 'internalNotes']) {
            assert.ok(!proposalText.includes(forbiddenField), `A proposta não pode expor ${forbiddenField}.`);
        }
        const pdfResult = await request('GET', `/event-budgets/${firstBudget.id}/proposal.pdf`, admin.token, null, 200, 'buffer');
        assert.match(pdfResult.response.headers.get('content-type') || '', /^application\/pdf/);
        assert.equal(pdfResult.data.subarray(0, 4).toString(), '%PDF');
        assert.ok(pdfResult.data.length > 1000, 'O PDF deve conter conteúdo renderizado.');

        const revision = (await request('POST', `/event-budgets/${firstBudget.id}/new-revision`, admin.token, null, 201)).data;
        assert.equal(revision.revision, 2);
        assert.equal(revision.status, 'DRAFT');
        const sentRevision = (await request('POST', `/event-budgets/${revision.id}/send`, admin.token, null, 200)).data;
        assert.equal(sentRevision.status, 'SENT');
        const approved = (await request('POST', `/event-budgets/${revision.id}/approve`, admin.token, null, 200)).data;
        assert.equal(approved.status, 'APPROVED');

        const after = await protectedSnapshot(protectedEstablishmentIds);
        assert.deepEqual(after, before, 'O fluxo de Eventos alterou módulos operacionais protegidos.');

        console.log(JSON.stringify({
            success: true,
            runId,
            authorization: { admin: true, manager: true, forbiddenRoleBlocked: true, unauthenticatedBlocked: true },
            tenantIsolation: { establishments: 2, customer: true, event: true, budget: true },
            workflow: ['customer', 'event', 'item', 'pricing', 'send', 'revision', 'approve'],
            proposal: { publicDtoHasNoInternalFinancialFields: true, pdfGenerated: true, pdfBytes: pdfResult.data.length },
            protectedModulesUnchanged: true
        }, null, 2));
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

main()
    .catch(error => {
        console.error(JSON.stringify({ success: false, runId, error: error.message }, null, 2));
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await cleanup();
            console.log(JSON.stringify({ cleanupSuccess: true, runId, testDataRemaining: false }, null, 2));
        }
        catch (error) {
            console.error(JSON.stringify({ cleanupSuccess: false, runId, error: error.message }, null, 2));
            process.exitCode = 1;
        }
        await prisma.$disconnect();
    });

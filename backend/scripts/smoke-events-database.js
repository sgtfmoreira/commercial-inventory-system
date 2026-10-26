const { randomUUID } = require('node:crypto');
const prisma = require('../src/utils/prisma');
const eventRepository = require('../src/repositories/commercialEventRepository');

const rollbackMarker = 'ROLLBACK_EVENTS_SMOKE';
const ids = { customer: randomUUID(), event: randomUUID(), budget: randomUUID(), item: randomUUID() };

async function main() {
    let rolledBack = false;
    try {
        await prisma.$transaction(async tx => {
            const membership = await tx.userEstablishment.findFirst({
                where: { isActive: true, role: { in: ['ADMIN', 'MANAGER'] } },
                select: { establishmentId: true, userId: true }
            });
            if (!membership) throw new Error('Nenhum usuário ADMIN/MANAGER ativo disponível para o smoke.');

            await tx.eventCustomer.create({ data: {
                id: ids.customer, establishmentId: membership.establishmentId,
                name: `[SMOKE] Eventos ${ids.customer.slice(0, 8)}`
            } });
            await tx.commercialEvent.create({ data: {
                id: ids.event, establishmentId: membership.establishmentId, customerId: ids.customer,
                code: `SMK-${ids.event.slice(0, 8).toUpperCase()}`, name: '[SMOKE] Evento transacional',
                type: 'INTERNAL', eventDate: new Date('2026-12-31T00:00:00.000Z'), guestCount: 10,
                status: 'BUDGETING', responsibleUserId: membership.userId
            } });
            await tx.eventBudget.create({ data: {
                id: ids.budget, eventId: ids.event, revision: 1, guestCountSnapshot: 10,
                createdByUserId: membership.userId
            } });
            await tx.eventBudgetItem.create({ data: {
                id: ids.item, budgetId: ids.budget, itemType: 'MANUAL', costGroup: 'MENU',
                nameSnapshot: '[SMOKE] Item', quantityMode: 'FIXED', fixedQuantity: '10',
                guestCountSnapshot: 10, plannedQuantity: '10', unitSnapshot: 'un',
                unitCostSnapshot: '2.5', totalCost: '25'
            } });
            const created = await tx.commercialEvent.findUnique({
                where: { id: ids.event }, include: { customer: true, budgets: { include: { items: true } } }
            });
            if (!created || created.budgets[0]?.items.length !== 1) throw new Error('Leitura relacional do smoke não corresponde à gravação.');
            const volumePrefix = `SMK-VOL-${ids.event.slice(0, 8).toUpperCase()}`;
            await tx.commercialEvent.createMany({ data: Array.from({ length: 55 }, (_, index) => ({
                id: randomUUID(), establishmentId: membership.establishmentId, customerId: ids.customer,
                code: `${volumePrefix}-${String(index + 1).padStart(2, '0')}`,
                name: `${volumePrefix} Evento ${String(index + 1).padStart(2, '0')}`,
                type: 'INTERNAL', eventDate: new Date(`2026-12-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
                guestCount: 10, status: 'BUDGETING', responsibleUserId: membership.userId
            })) });
            const [page, total] = await eventRepository.listEvents(membership.establishmentId, {
                search: volumePrefix, skip: 20, take: 20
            }, tx);
            if (total !== 55 || page.length !== 20) throw new Error(`Paginação inválida no smoke: total=${total}, página=${page.length}.`);
            throw new Error(rollbackMarker);
        }, { maxWait: 15000, timeout: 30000 });
    } catch (error) {
        if (error.message !== rollbackMarker) throw error;
        rolledBack = true;
    }

    const persisted = await prisma.eventCustomer.findUnique({ where: { id: ids.customer }, select: { id: true } });
    if (!rolledBack || persisted) throw new Error('O rollback do smoke não foi confirmado.');
    console.log(JSON.stringify({ success: true, relationalWriteValidated: true, paginationValidated: true,
        paginationFixtureSize: 55, rollbackConfirmed: true }, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exitCode = 1;
}).finally(() => prisma.$disconnect());

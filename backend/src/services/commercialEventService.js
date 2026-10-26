const { randomUUID } = require('node:crypto');
const prisma = require('../utils/prisma');
const defaultRepository = require('../repositories/commercialEventRepository');
const AppError = require('../utils/AppError');

const asDate = value => new Date(`${value}T00:00:00.000Z`);
const asTime = value => value ? new Date(`1970-01-01T${value}:00.000Z`) : null;
const dateText = value => value?.toISOString().slice(0, 10) || null;
const timeText = value => value?.toISOString().slice(11, 16) || null;
const toDto = event => ({ ...event, eventDate: dateText(event.eventDate), startTime: timeText(event.startTime), endTime: timeText(event.endTime) });

function createCommercialEventService({ repository = defaultRepository, database = prisma, uuid = randomUUID } = {}) {
    const getById = async (id, establishmentId, client) => {
        await repository.expireBudgets(establishmentId, new Date(new Date().toISOString().slice(0,10)), client);
        const event = await repository.findEvent(id, establishmentId, client);
        if (!event) throw new AppError('Evento não encontrado.', 404);
        return event;
    };
    const validateRelations = async (input, establishmentId, client) => {
        const customer = await repository.findCustomer(input.customerId, establishmentId, client);
        if (!customer) throw new AppError('Cliente não pertence a este estabelecimento.', 422);
        if (input.responsibleUserId) {
            const user = await repository.findResponsibleUser(input.responsibleUserId, establishmentId, client);
            if (!user) throw new AppError('Responsável não pertence a este estabelecimento.', 422);
        }
        return customer;
    };
    return {
        async listResponsibleUsers(establishmentId) {
            const memberships = await repository.listResponsibleUsers(establishmentId);
            return memberships.map(({ user, role }) => ({ ...user, role }));
        },
        async list(establishmentId, filters) {
            await repository.expireBudgets(establishmentId, new Date(new Date().toISOString().slice(0,10)));
            const query = {
                ...filters, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
                dateFrom: filters.dateFrom ? asDate(filters.dateFrom) : undefined,
                dateTo: filters.dateTo ? asDate(filters.dateTo) : undefined
            };
            const [items, total] = await repository.listEvents(establishmentId, query);
            return { items: items.map(toDto), page: filters.page, pageSize: filters.pageSize, total };
        },
        async getById(id, establishmentId) { return toDto(await getById(id, establishmentId)); },
        async listBudgets(id, establishmentId) {
            await getById(id, establishmentId);
            return repository.listEventBudgets(id, establishmentId);
        },
        create(input, establishmentId, userId) {
            return database.$transaction(async tx => {
                await validateRelations(input, establishmentId, tx);
                const id = uuid();
                const code = `EV-${input.eventDate.slice(0, 4)}-${id.slice(0, 8).toUpperCase()}`;
                const event = await repository.createEvent({
                    id, establishmentId, customerId: input.customerId, code, name: input.name.trim(), type: input.type,
                    eventDate: asDate(input.eventDate), startTime: asTime(input.startTime), endTime: asTime(input.endTime),
                    guestCount: input.guestCount, location: input.location || null,
                    responsibleUserId: input.responsibleUserId || null, status: 'BUDGETING', internalNotes: input.internalNotes || null
                }, tx);
                await repository.createBudget({ eventId: event.id, revision: 1, guestCountSnapshot: event.guestCount, createdByUserId: userId }, tx);
                await repository.createAudit({ actionType: 'CREATE', entityType: 'COMMERCIAL_EVENT', entityId: event.id,
                    description: `Evento ${code} criado.`, establishmentId }, tx);
                return toDto(await getById(event.id, establishmentId, tx));
            });
        },
        update(id, input, establishmentId) {
            return database.$transaction(async tx => {
                const existing = await getById(id, establishmentId, tx);
                if (!['DRAFT', 'BUDGETING'].includes(existing.status) || !existing.budgets.some(b => b.status === 'DRAFT')) {
                    throw new AppError('Evento não pode ser editado neste estado.', 409);
                }
                const merged = { ...existing, ...input };
                const mergedStart = input.startTime !== undefined ? input.startTime : timeText(existing.startTime);
                const mergedEnd = input.endTime !== undefined ? input.endTime : timeText(existing.endTime);
                if (mergedStart && mergedEnd && mergedEnd < mergedStart) throw new AppError('Horário final não pode ser anterior ao inicial.', 422);
                if (input.customerId || input.responsibleUserId !== undefined) await validateRelations(merged, establishmentId, tx);
                const data = {};
                for (const field of ['customerId', 'name', 'type', 'guestCount', 'location', 'responsibleUserId', 'internalNotes']) if (input[field] !== undefined) data[field] = input[field] || null;
                if (input.eventDate !== undefined) data.eventDate = asDate(input.eventDate);
                if (input.startTime !== undefined) data.startTime = asTime(input.startTime);
                if (input.endTime !== undefined) data.endTime = asTime(input.endTime);
                await repository.updateEvent(id, establishmentId, data, tx);
                return toDto(await getById(id, establishmentId, tx));
            });
        },
        cancel(id, establishmentId, userId) {
            return database.$transaction(async tx => {
                const existing = await getById(id, establishmentId, tx);
                if (existing.status === 'CANCELLED') return toDto(existing);
                await repository.updateEvent(id, establishmentId, { status: 'CANCELLED' }, tx);
                await repository.cancelOpenBudgets(id, tx);
                await repository.createAudit({actionType:'CANCEL',entityType:'COMMERCIAL_EVENT',entityId:id,
                    description:`Evento cancelado por ${userId}.`,establishmentId},tx);
                return toDto(await getById(id, establishmentId, tx));
            });
        }
    };
}

module.exports = { ...createCommercialEventService(), createCommercialEventService, toDto };

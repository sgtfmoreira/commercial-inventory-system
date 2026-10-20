const prisma = require('../utils/prisma');
const { randomUUID } = require('node:crypto');
const defaultRepository = require('../repositories/tableReservationRepository');
const AppError = require('../utils/AppError');

const asDate = value => new Date(`${value}T00:00:00.000Z`);
const asTime = value => new Date(`1970-01-01T${value}:00.000Z`);
const dateText = value => value.toISOString().slice(0, 10);
const timeText = value => value.toISOString().slice(11, 16);
const toDto = value => ({
    ...value,
    reservationDate: dateText(value.reservationDate),
    reservationTime: timeText(value.reservationTime)
});
const normalizeData = input => ({
    ...(input.tableNumber !== undefined ? { tableNumber: input.tableNumber } : {}),
    ...(input.reservationDate !== undefined ? { reservationDate: asDate(input.reservationDate) } : {}),
    ...(input.reservationTime !== undefined ? { reservationTime: asTime(input.reservationTime) } : {}),
    ...(input.customerName !== undefined ? { customerName: input.customerName.trim() } : {}),
    ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
    ...(input.partySize !== undefined ? { partySize: input.partySize } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {})
});

function conflictError() {
    return new AppError('Esta mesa já foi reservada para a data selecionada. Os dados foram atualizados.', 409);
}

function mapDatabaseConflict(error) {
    if (error?.code === 'P2002') throw conflictError();
    throw error;
}

function createTableReservationService({ repository = defaultRepository, database = prisma } = {}) {
    const ensureEditable = async (id, establishmentId, version, client) => {
        const current = await repository.findById(id, establishmentId, client);
        if (!current) throw new AppError('Reserva não encontrada.', 404);
        if (current.status === 'CANCELLED') throw new AppError('Esta reserva já foi cancelada.', 409);
        if (current.version !== version) throw new AppError('Esta reserva foi alterada por outra pessoa. Atualize os dados antes de continuar.', 409);
        return current;
    };

    return {
        async list(establishmentId, { date, includeCancelled = false }) {
            const items = await repository.listByDate(establishmentId, asDate(date), includeCancelled);
            const tablesByGroup = items.reduce((groups, item) => {
                if (!item.reservationGroupId) return groups;
                const tables = groups.get(item.reservationGroupId) || [];
                tables.push(item.tableNumber);
                groups.set(item.reservationGroupId, tables);
                return groups;
            }, new Map());
            const reservations = items.map(item => ({
                ...toDto(item),
                groupTableNumbers: item.reservationGroupId
                    ? tablesByGroup.get(item.reservationGroupId).sort((a, b) => a - b)
                    : [item.tableNumber]
            }));
            const active = reservations.filter(item => item.status === 'CONFIRMED');
            const countedGroups = new Set();
            const expectedPeople = active.reduce((total, item) => {
                if (!item.reservationGroupId) return total + item.partySize;
                if (countedGroups.has(item.reservationGroupId)) return total;
                countedGroups.add(item.reservationGroupId);
                return total + item.partySize;
            }, 0);
            return {
                reservations,
                summary: {
                    reservedTables: active.length,
                    freeTables: 27 - active.length,
                    expectedPeople
                }
            };
        },

        async create(input, establishmentId, userId) {
            try {
                const result = await repository.create({
                    ...normalizeData(input), establishmentId, status: 'CONFIRMED',
                    createdByUserId: userId, updatedByUserId: userId
                });
                return toDto(result);
            } catch (error) {
                mapDatabaseConflict(error);
            }
        },

        async createBatch(input, establishmentId, userId) {
            const { tableNumbers, ...details } = input;
            const reservationGroupId = randomUUID();
            try {
                return await database.$transaction(async tx => {
                    const reservationDate = asDate(details.reservationDate);
                    const existing = await repository.findActiveForKeys(
                        establishmentId,
                        tableNumbers.map(tableNumber => ({ tableNumber, reservationDate })),
                        tx
                    );
                    if (existing.length) {
                        const numbers = existing.map(item => item.tableNumber).sort((a, b) => a - b).join(', ');
                        throw new AppError(`As mesas ${numbers} já estão reservadas para a data selecionada. Nenhuma reserva foi criada.`, 409);
                    }
                    const created = await Promise.all(tableNumbers.map(tableNumber => repository.create({
                        ...normalizeData({ ...details, tableNumber }),
                        establishmentId,
                        reservationGroupId,
                        status: 'CONFIRMED',
                        createdByUserId: userId,
                        updatedByUserId: userId
                    }, tx)));
                    return { count: created.length, reservations: created.map(toDto) };
                });
            } catch (error) {
                mapDatabaseConflict(error);
            }
        },

        async update(id, input, establishmentId, userId) {
            try {
                return await database.$transaction(async tx => {
                    const current = await ensureEditable(id, establishmentId, input.version, tx);
                    const { version, ...fields } = input;
                    const normalized = normalizeData(fields);
                    if (current.reservationGroupId) delete normalized.tableNumber;
                    const group = current.reservationGroupId
                        ? await repository.findActiveGroup(current.reservationGroupId, establishmentId, tx)
                        : [current];
                    if (group.some(item => item.version !== version)) {
                        throw new AppError('Esta reserva foi alterada por outra pessoa. Atualize os dados antes de continuar.', 409);
                    }
                    const data = { ...normalized, updatedByUserId: userId };
                    const result = current.reservationGroupId
                        ? await repository.updateActiveGroupVersioned(current.reservationGroupId, establishmentId, version, data, tx)
                        : await repository.updateActiveVersioned(id, establishmentId, version, data, tx);
                    if (result.count !== group.length) throw new AppError('Esta reserva foi alterada por outra pessoa. Atualize os dados antes de continuar.', 409);
                    return toDto(await repository.findById(id, establishmentId, tx));
                });
            } catch (error) {
                mapDatabaseConflict(error);
            }
        },

        async cancel(id, version, establishmentId, userId) {
            return database.$transaction(async tx => {
                const current = await ensureEditable(id, establishmentId, version, tx);
                const group = current.reservationGroupId
                    ? await repository.findActiveGroup(current.reservationGroupId, establishmentId, tx)
                    : [current];
                if (group.some(item => item.version !== version)) {
                    throw new AppError('Esta reserva foi alterada por outra pessoa. Atualize os dados antes de continuar.', 409);
                }
                const data = { status: 'CANCELLED', updatedByUserId: userId };
                const result = current.reservationGroupId
                    ? await repository.updateActiveGroupVersioned(current.reservationGroupId, establishmentId, version, data, tx)
                    : await repository.updateActiveVersioned(id, establishmentId, version, data, tx);
                if (result.count !== group.length) throw new AppError('Esta reserva foi alterada por outra pessoa. Atualize os dados antes de continuar.', 409);
                return toDto(await repository.findById(id, establishmentId, tx));
            });
        },

        async previewImport(items, establishmentId) {
            const seen = new Set();
            const duplicateIndexes = new Set();
            items.forEach((item, index) => {
                const key = `${item.tableNumber}:${item.reservationDate}`;
                if (seen.has(key)) duplicateIndexes.add(index);
                else seen.add(key);
            });
            const keys = items.map(item => ({ tableNumber: item.tableNumber, reservationDate: asDate(item.reservationDate) }));
            const existing = await repository.findActiveForKeys(establishmentId, keys);
            const existingKeys = new Map(existing.map(item => [`${item.tableNumber}:${dateText(item.reservationDate)}`, item]));
            const conflicts = [];
            const available = [];
            items.forEach((item, index) => {
                const key = `${item.tableNumber}:${item.reservationDate}`;
                const current = existingKeys.get(key);
                if (duplicateIndexes.has(index)) conflicts.push({ index, reason: 'Reserva duplicada no arquivo.', reservation: item });
                else if (current) conflicts.push({ index, reason: `A mesa já está reservada para ${current.customerName}.`, reservation: item });
                else available.push(item);
            });
            return { available, conflicts, total: items.length };
        },

        async importReservations(items, establishmentId, userId) {
            const preview = await this.previewImport(items, establishmentId);
            if (preview.conflicts.length) throw new AppError('Existem conflitos. Faça uma nova prévia antes de importar.', 409);
            try {
                const created = await database.$transaction(async tx => Promise.all(items.map(item => repository.create({
                    ...normalizeData(item), establishmentId, status: 'CONFIRMED',
                    createdByUserId: userId, updatedByUserId: userId
                }, tx))));
                return { imported: created.length };
            } catch (error) {
                mapDatabaseConflict(error);
            }
        }
    };
}

module.exports = { ...createTableReservationService(), createTableReservationService, toDto };

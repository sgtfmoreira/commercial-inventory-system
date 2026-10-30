const prisma = require('../utils/prisma');
const { randomUUID } = require('node:crypto');
const defaultRepository = require('../repositories/tableOccupancyRepository');
const AppError = require('../utils/AppError');

const todayInSaoPaulo = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
};
const asDate = value => new Date(`${value}T00:00:00.000Z`);

function mapConflict(error) {
    if (error?.code === 'P2002') throw new AppError('Esta mesa já está ocupada. Atualize o mapa.', 409);
    throw error;
}

function createTableOccupancyService({ repository = defaultRepository, database = prisma, now = () => new Date() } = {}) {
    return {
        async list(establishmentId) {
            const occupancies = await repository.listActive(establishmentId);
            const tablesByGroup = occupancies.reduce((groups, item) => {
                if (!item.occupancyGroupId) return groups;
                const tables = groups.get(item.occupancyGroupId) || [];
                tables.push(item.tableNumber);
                groups.set(item.occupancyGroupId, tables);
                return groups;
            }, new Map());
            const groupedOccupancies = occupancies.map(item => ({
                ...item,
                groupTableNumbers: item.occupancyGroupId
                    ? tablesByGroup.get(item.occupancyGroupId).sort((a, b) => a - b)
                    : [item.tableNumber]
            }));
            const countedGroups = new Set();
            const seatedPeople = groupedOccupancies.reduce((total, item) => {
                if (!item.occupancyGroupId) return total + item.partySize;
                if (countedGroups.has(item.occupancyGroupId)) return total;
                countedGroups.add(item.occupancyGroupId);
                return total + item.partySize;
            }, 0);
            return {
                occupancies: groupedOccupancies,
                summary: {
                    occupiedTables: occupancies.length,
                    seatedPeople
                }
            };
        },

        async create(input, establishmentId, userId) {
            try {
                return await database.$transaction(async tx => {
                    const active = await repository.findActiveByTable(establishmentId, input.tableNumber, tx);
                    if (active) throw new AppError('Esta mesa já está ocupada. Atualize o mapa.', 409);
                    const reservation = await repository.findReservation(
                        establishmentId, input.tableNumber, asDate(todayInSaoPaulo(now())), tx
                    );
                    if (reservation) throw new AppError('Esta mesa possui uma reserva confirmada para hoje.', 409);
                    return repository.create({
                        tableNumber: input.tableNumber,
                        customerName: input.customerName || null,
                        partySize: input.partySize,
                        notes: input.notes || null,
                        establishmentId,
                        status: 'ACTIVE',
                        createdByUserId: userId
                    }, tx);
                });
            } catch (error) {
                mapConflict(error);
            }
        },

        async createBatch(input, establishmentId, userId) {
            const { tableNumbers, ...details } = input;
            const occupancyGroupId = randomUUID();
            try {
                return await database.$transaction(async tx => {
                    const active = await repository.findActiveForTables(establishmentId, tableNumbers, tx);
                    if (active.length) {
                        const numbers = active.map(item => item.tableNumber).sort((a, b) => a - b).join(', ');
                        throw new AppError(`As mesas ${numbers} já estão ocupadas. Atualize o mapa.`, 409);
                    }
                    const reservations = await repository.findReservationsForTables(
                        establishmentId, tableNumbers, asDate(todayInSaoPaulo(now())), tx
                    );
                    if (reservations.length) {
                        const numbers = reservations.map(item => item.tableNumber).sort((a, b) => a - b).join(', ');
                        throw new AppError(`As mesas ${numbers} possuem reserva confirmada para hoje.`, 409);
                    }
                    const created = await Promise.all(tableNumbers.map(tableNumber => repository.create({
                        tableNumber,
                        customerName: details.customerName || null,
                        partySize: details.partySize,
                        notes: details.notes || null,
                        occupancyGroupId,
                        establishmentId,
                        status: 'ACTIVE',
                        createdByUserId: userId
                    }, tx)));
                    return { count: created.length, occupancies: created };
                });
            } catch (error) {
                mapConflict(error);
            }
        },

        async release(id, version, establishmentId, userId) {
            return database.$transaction(async tx => {
                const current = await repository.findById(id, establishmentId, tx);
                if (!current) throw new AppError('Ocupação não encontrada.', 404);
                if (current.status !== 'ACTIVE') throw new AppError('Esta mesa já foi liberada.', 409);
                if (current.version !== version) throw new AppError('A ocupação foi alterada por outra pessoa. Atualize o mapa.', 409);
                const group = current.occupancyGroupId
                    ? await repository.findActiveGroup(current.occupancyGroupId, establishmentId, tx)
                    : [current];
                if (group.some(item => item.version !== version)) {
                    throw new AppError('A ocupação foi alterada por outra pessoa. Atualize o mapa.', 409);
                }
                const data = { status: 'RELEASED', releasedAt: now(), releasedByUserId: userId };
                const result = current.occupancyGroupId
                    ? await repository.releaseActiveGroupVersioned(current.occupancyGroupId, establishmentId, version, data, tx)
                    : await repository.releaseActiveVersioned(id, establishmentId, version, data, tx);
                if (result.count !== group.length) throw new AppError('A ocupação foi alterada por outra pessoa. Atualize o mapa.', 409);
                return repository.findById(id, establishmentId, tx);
            });
        }
    };
}

module.exports = { ...createTableOccupancyService(), createTableOccupancyService, todayInSaoPaulo };

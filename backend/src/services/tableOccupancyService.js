const prisma = require('../utils/prisma');
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
            return {
                occupancies,
                summary: {
                    occupiedTables: occupancies.length,
                    seatedPeople: occupancies.reduce((total, item) => total + item.partySize, 0)
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

        async release(id, version, establishmentId, userId) {
            return database.$transaction(async tx => {
                const current = await repository.findById(id, establishmentId, tx);
                if (!current) throw new AppError('Ocupação não encontrada.', 404);
                if (current.status !== 'ACTIVE') throw new AppError('Esta mesa já foi liberada.', 409);
                if (current.version !== version) throw new AppError('A ocupação foi alterada por outra pessoa. Atualize o mapa.', 409);
                const result = await repository.releaseActiveVersioned(id, establishmentId, version, {
                    status: 'RELEASED', releasedAt: now(), releasedByUserId: userId
                }, tx);
                if (result.count !== 1) throw new AppError('A ocupação foi alterada por outra pessoa. Atualize o mapa.', 409);
                return repository.findById(id, establishmentId, tx);
            });
        }
    };
}

module.exports = { ...createTableOccupancyService(), createTableOccupancyService, todayInSaoPaulo };

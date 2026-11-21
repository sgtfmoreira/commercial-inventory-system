const prisma = require('../utils/prisma');
const db = client => client || prisma;

const personSelect = { id: true, name: true };
const includePeople = {
    createdByUser: { select: personSelect },
    updatedByUser: { select: personSelect },
    checkedInByUser: { select: personSelect },
    occupancy: {
        select: {
            id: true,
            status: true,
            version: true,
            seatedAt: true,
            releasedAt: true,
            partySize: true,
            occupancyGroupId: true
        }
    }
};

const listByDate = (establishmentId, reservationDate, includeCancelled, client) => db(client).tableReservation.findMany({
    where: {
        establishmentId,
        reservationDate,
        ...(!includeCancelled ? { status: 'CONFIRMED' } : {})
    },
    include: includePeople,
    orderBy: [{ tableNumber: 'asc' }, { createdAt: 'asc' }]
});

const findById = (id, establishmentId, client) => db(client).tableReservation.findFirst({
    where: { id, establishmentId }, include: includePeople
});

const findActiveGroup = (reservationGroupId, establishmentId, client) => db(client).tableReservation.findMany({
    where: { reservationGroupId, establishmentId, status: 'CONFIRMED' },
    include: includePeople,
    orderBy: { tableNumber: 'asc' }
});
const findGroup = (reservationGroupId, establishmentId, client) => db(client).tableReservation.findMany({
    where: { reservationGroupId, establishmentId },
    include: includePeople,
    orderBy: { tableNumber: 'asc' }
});

const findActiveForKeys = (establishmentId, keys, client) => {
    if (!keys.length) return [];
    return db(client).tableReservation.findMany({
        where: {
            establishmentId,
            status: 'CONFIRMED',
            OR: keys.map(({ tableNumber, reservationDate }) => ({ tableNumber, reservationDate }))
        },
        select: { id: true, tableNumber: true, reservationDate: true, customerName: true }
    });
};

const create = (data, client) => db(client).tableReservation.create({ data, include: includePeople });
const updateActiveVersioned = (id, establishmentId, version, data, client) => db(client).tableReservation.updateMany({
    where: { id, establishmentId, version, status: 'CONFIRMED', checkedInAt: null },
    data: { ...data, version: { increment: 1 } }
});

const updateActiveGroupVersioned = (reservationGroupId, establishmentId, version, data, client) => db(client).tableReservation.updateMany({
    where: { reservationGroupId, establishmentId, version, status: 'CONFIRMED', checkedInAt: null },
    data: { ...data, version: { increment: 1 } }
});

const markCheckedInVersioned = (id, establishmentId, version, data, client) => db(client).tableReservation.updateMany({
    where: { id, establishmentId, version, status: 'CONFIRMED', checkedInAt: null },
    data: { ...data, version: { increment: 1 } }
});

const markCheckedInGroupVersioned = (reservationGroupId, establishmentId, version, data, client) => db(client).tableReservation.updateMany({
    where: { reservationGroupId, establishmentId, version, status: 'CONFIRMED', checkedInAt: null },
    data: { ...data, version: { increment: 1 } }
});

const findActiveOccupanciesForTables = (establishmentId, tableNumbers, client) => db(client).tableOccupancy.findMany({
    where: { establishmentId, tableNumber: { in: tableNumbers }, status: 'ACTIVE' },
    select: { id: true, tableNumber: true }
});

const createOccupancy = (data, client) => db(client).tableOccupancy.create({
    data,
    include: {
        createdByUser: { select: personSelect },
        releasedByUser: { select: personSelect },
        reservation: { select: { id: true, customerName: true, reservationTime: true } }
    }
});

module.exports = {
    listByDate, findById, findActiveGroup, findGroup, findActiveForKeys, create,
    updateActiveVersioned, updateActiveGroupVersioned,
    markCheckedInVersioned, markCheckedInGroupVersioned,
    findActiveOccupanciesForTables, createOccupancy
};

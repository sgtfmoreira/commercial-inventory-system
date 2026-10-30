const prisma = require('../utils/prisma');
const db = client => client || prisma;

const personSelect = { id: true, name: true };
const includePeople = {
    createdByUser: { select: personSelect },
    releasedByUser: { select: personSelect }
};

const listActive = (establishmentId, client) => db(client).tableOccupancy.findMany({
    where: { establishmentId, status: 'ACTIVE' },
    include: includePeople,
    orderBy: [{ tableNumber: 'asc' }]
});
const findActiveByTable = (establishmentId, tableNumber, client) => db(client).tableOccupancy.findFirst({
    where: { establishmentId, tableNumber, status: 'ACTIVE' }, include: includePeople
});
const findActiveForTables = (establishmentId, tableNumbers, client) => db(client).tableOccupancy.findMany({
    where: { establishmentId, tableNumber: { in: tableNumbers }, status: 'ACTIVE' },
    include: includePeople
});
const findActiveGroup = (occupancyGroupId, establishmentId, client) => db(client).tableOccupancy.findMany({
    where: { occupancyGroupId, establishmentId, status: 'ACTIVE' },
    include: includePeople,
    orderBy: { tableNumber: 'asc' }
});
const findById = (id, establishmentId, client) => db(client).tableOccupancy.findFirst({
    where: { id, establishmentId }, include: includePeople
});
const findReservation = (establishmentId, tableNumber, reservationDate, client) => db(client).tableReservation.findFirst({
    where: { establishmentId, tableNumber, reservationDate, status: 'CONFIRMED' },
    select: { id: true, customerName: true, reservationTime: true }
});
const findReservationsForTables = (establishmentId, tableNumbers, reservationDate, client) => db(client).tableReservation.findMany({
    where: { establishmentId, tableNumber: { in: tableNumbers }, reservationDate, status: 'CONFIRMED' },
    select: { id: true, tableNumber: true, customerName: true }
});
const create = (data, client) => db(client).tableOccupancy.create({ data, include: includePeople });
const releaseActiveVersioned = (id, establishmentId, version, data, client) => db(client).tableOccupancy.updateMany({
    where: { id, establishmentId, version, status: 'ACTIVE' },
    data: { ...data, version: { increment: 1 } }
});
const releaseActiveGroupVersioned = (occupancyGroupId, establishmentId, version, data, client) => db(client).tableOccupancy.updateMany({
    where: { occupancyGroupId, establishmentId, version, status: 'ACTIVE' },
    data: { ...data, version: { increment: 1 } }
});

module.exports = {
    listActive, findActiveByTable, findActiveForTables, findActiveGroup, findById,
    findReservation, findReservationsForTables, create,
    releaseActiveVersioned, releaseActiveGroupVersioned
};

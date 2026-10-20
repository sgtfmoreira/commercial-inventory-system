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
const findById = (id, establishmentId, client) => db(client).tableOccupancy.findFirst({
    where: { id, establishmentId }, include: includePeople
});
const findReservation = (establishmentId, tableNumber, reservationDate, client) => db(client).tableReservation.findFirst({
    where: { establishmentId, tableNumber, reservationDate, status: 'CONFIRMED' },
    select: { id: true, customerName: true, reservationTime: true }
});
const create = (data, client) => db(client).tableOccupancy.create({ data, include: includePeople });
const releaseActiveVersioned = (id, establishmentId, version, data, client) => db(client).tableOccupancy.updateMany({
    where: { id, establishmentId, version, status: 'ACTIVE' },
    data: { ...data, version: { increment: 1 } }
});

module.exports = { listActive, findActiveByTable, findById, findReservation, create, releaseActiveVersioned };

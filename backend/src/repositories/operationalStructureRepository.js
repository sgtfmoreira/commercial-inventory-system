const prisma = require('../utils/prisma');

const db = client => client || prisma;

const sectorInclude = Object.freeze({ _count: { select: { roles: true } } });
const roleInclude = Object.freeze({ sector: { select: { id: true, name: true, isActive: true } } });

function findScope(context, client) {
    return db(client).establishments.findFirst({
        where: { id: context.establishmentId, organizationId: context.organizationId, isActive: true },
        select: {
            id: true, organizationId: true,
            users: {
                where: { id: context.membershipId, userId: context.userId, isActive: true },
                select: { id: true }, take: 1
            }
        }
    });
}

function listSectors(context, filters = {}, client) {
    return db(client).operationalSector.findMany({
        where: {
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
            ...(filters.search ? { normalizedName: { contains: filters.search } } : {})
        },
        include: sectorInclude,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
    });
}

function findSector(id, context, client) {
    return db(client).operationalSector.findFirst({
        where: { id, organizationId: context.organizationId, establishmentId: context.establishmentId },
        include: sectorInclude
    });
}

function findSectorByName(normalizedName, context, excludeId, client) {
    return db(client).operationalSector.findFirst({
        where: {
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            normalizedName,
            ...(excludeId ? { id: { not: excludeId } } : {})
        },
        select: { id: true }
    });
}

function createSector(data, client) {
    return db(client).operationalSector.create({ data, include: sectorInclude });
}

async function updateSector(id, context, version, data, client) {
    const result = await db(client).operationalSector.updateMany({
        where: { id, organizationId: context.organizationId, establishmentId: context.establishmentId, version },
        data: { ...data, version: { increment: 1 } }
    });
    if (result.count !== 1) return null;
    return findSector(id, context, client);
}

function countActiveRoles(sectorId, context, client) {
    return db(client).operationalRole.count({
        where: { sectorId, organizationId: context.organizationId, establishmentId: context.establishmentId, isActive: true }
    });
}

function listRoles(context, filters = {}, client) {
    return db(client).operationalRole.findMany({
        where: {
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
            ...(filters.sectorId ? { sectorId: filters.sectorId } : {}),
            ...(filters.search ? { normalizedName: { contains: filters.search } } : {})
        },
        include: roleInclude,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
    });
}

function findRole(id, context, client) {
    return db(client).operationalRole.findFirst({
        where: { id, organizationId: context.organizationId, establishmentId: context.establishmentId },
        include: roleInclude
    });
}

function findRoleByName(normalizedName, context, excludeId, client) {
    return db(client).operationalRole.findFirst({
        where: {
            organizationId: context.organizationId,
            establishmentId: context.establishmentId,
            normalizedName,
            ...(excludeId ? { id: { not: excludeId } } : {})
        },
        select: { id: true }
    });
}

function createRole(data, client) {
    return db(client).operationalRole.create({ data, include: roleInclude });
}

async function updateRole(id, context, version, data, client) {
    const result = await db(client).operationalRole.updateMany({
        where: { id, organizationId: context.organizationId, establishmentId: context.establishmentId, version },
        data: { ...data, version: { increment: 1 } }
    });
    if (result.count !== 1) return null;
    return findRole(id, context, client);
}

module.exports = {
    findScope, listSectors, findSector, findSectorByName, createSector, updateSector, countActiveRoles,
    listRoles, findRole, findRoleByName, createRole, updateRole
};

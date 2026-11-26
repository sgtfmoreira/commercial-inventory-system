const prisma = require('../utils/prisma');

const db = client => client || prisma;

const sectorInclude = Object.freeze({ _count: { select: { roles: true } } });
const roleInclude = Object.freeze({ sector: { select: { id: true, name: true, isActive: true } } });
const assignmentInclude = Object.freeze({
    operationalRole: { include: { sector: { select: { id: true, name: true, isActive: true } } } }
});

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

function countActiveAssignments(operationalRoleId, context, client) {
    return db(client).membershipOperationalRole.count({
        where: { operationalRoleId, organizationId: context.organizationId, establishmentId: context.establishmentId, status: 'ACTIVE' }
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

function listMemberships(context, filters = {}, client) {
    return db(client).userEstablishment.findMany({
        where: {
            establishmentId: context.establishmentId,
            ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
            ...(filters.search ? { user: { OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } }
            ] } } : {})
        },
        select: {
            id: true, role: true, isActive: true, createdAt: true,
            user: { select: { id: true, name: true, email: true } },
            operationalRoleAssignments: {
                include: assignmentInclude,
                orderBy: [{ status: 'asc' }, { isPrimary: 'desc' }, { validFrom: 'desc' }]
            }
        },
        orderBy: { user: { name: 'asc' } }
    });
}

function findMembership(id, context, client) {
    return db(client).userEstablishment.findFirst({
        where: { id, establishmentId: context.establishmentId },
        select: { id: true, userId: true, role: true, isActive: true, user: { select: { id: true, name: true, email: true } } }
    });
}

function listMembershipRoles(membershipId, context, client) {
    return db(client).membershipOperationalRole.findMany({
        where: { membershipId, organizationId: context.organizationId, establishmentId: context.establishmentId },
        include: assignmentInclude,
        orderBy: [{ status: 'asc' }, { isPrimary: 'desc' }, { validFrom: 'desc' }]
    });
}

function findAssignment(id, context, client) {
    return db(client).membershipOperationalRole.findFirst({
        where: { id, organizationId: context.organizationId, establishmentId: context.establishmentId },
        include: assignmentInclude
    });
}

function findActiveAssignment(membershipId, operationalRoleId, context, client) {
    return db(client).membershipOperationalRole.findFirst({
        where: { membershipId, operationalRoleId, organizationId: context.organizationId, establishmentId: context.establishmentId, status: 'ACTIVE' },
        select: { id: true }
    });
}

function findActivePrimary(membershipId, context, client) {
    return db(client).membershipOperationalRole.findFirst({
        where: { membershipId, organizationId: context.organizationId, establishmentId: context.establishmentId, status: 'ACTIVE', isPrimary: true },
        select: { id: true }
    });
}

function createAssignment(data, client) {
    return db(client).membershipOperationalRole.create({ data, include: assignmentInclude });
}

async function endAssignment(id, context, version, data, client) {
    const result = await db(client).membershipOperationalRole.updateMany({
        where: { id, organizationId: context.organizationId, establishmentId: context.establishmentId, status: 'ACTIVE', version },
        data: { ...data, version: { increment: 1 } }
    });
    if (result.count !== 1) return null;
    return findAssignment(id, context, client);
}

module.exports = {
    findScope, listSectors, findSector, findSectorByName, createSector, updateSector, countActiveRoles,
    listRoles, findRole, findRoleByName, createRole, updateRole, countActiveAssignments,
    listMemberships, findMembership, listMembershipRoles, findAssignment,
    findActiveAssignment, findActivePrimary, createAssignment, endAssignment
};

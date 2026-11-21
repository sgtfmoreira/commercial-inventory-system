const prisma = require('../utils/prisma');

function create(event, db = prisma) {
    return db.securityAuditEvent.create({ data: event });
}

function listForTarget(targetMembershipId, organizationId, db = prisma) {
    return db.securityAuditEvent.findMany({
        where: { targetMembershipId, organizationId },
        orderBy: { occurredAt: 'desc' }
    });
}

module.exports = { create, listForTarget };

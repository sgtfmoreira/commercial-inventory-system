const prisma = require('../utils/prisma');

const versionInclude = Object.freeze({
    sections: {
        orderBy: { position: 'asc' },
        include: { items: { orderBy: { position: 'asc' } } }
    }
});

async function listByOrganization(organizationId, db = prisma) {
    return db.checklistTemplate.findMany({
        where: { organizationId },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
        include: {
            versions: {
                orderBy: { version: 'desc' },
                select: {
                    id: true, version: true, status: true, approvalRequired: true,
                    passingScore: true, createdAt: true, updatedAt: true,
                    publishedAt: true, retiredAt: true, sourceVersionId: true
                }
            }
        }
    });
}

async function findScoped(templateId, organizationId, db = prisma) {
    return db.checklistTemplate.findFirst({
        where: { id: templateId, organizationId },
        include: {
            versions: {
                orderBy: { version: 'desc' },
                include: versionInclude
            }
        }
    });
}

async function findVersionScoped(versionId, templateId, organizationId, db = prisma) {
    return db.checklistTemplateVersion.findFirst({
        where: { id: versionId, templateId, template: { organizationId } },
        include: {
            ...versionInclude,
            template: { select: { id: true, organizationId: true, status: true } }
        }
    });
}

const withSerializableTransaction = (callback, db = prisma) => db.$transaction(
    callback,
    { isolationLevel: 'Serializable' }
);

module.exports = {
    versionInclude,
    listByOrganization,
    findScoped,
    findVersionScoped,
    withSerializableTransaction
};

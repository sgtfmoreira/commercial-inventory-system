const prisma = require('../config/prisma');

const create = (data) => {
    return prisma.portioningOrder.create({
        data
    });
};

const findById = (id, establishmentId) => {
    return prisma.portioningOrder.findFirst({
        where: {
            id,
            establishmentId
        },
        include: {
            items: {
                include: {
                    targetProduct: true
                }
            },
            sourceProduct: true,
            sourceLot: true,
            user: {
                select: { id: true, name: true }
            }
        }
    });
};

const findAll = ({ establishmentId, status, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;

    const where = { establishmentId };
    if (status) {
        where.status = status;
    }

    return prisma.$transaction([
        prisma.portioningOrder.count({ where }),
        prisma.portioningOrder.findMany({
            where,
            include: {
                sourceProduct: true,
                sourceLot: true,
                items: {
                    include: { targetProduct: true }
                },
                user: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit)
        })
    ]).then(([total, data]) => ({
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
        data
    }));
};

const updateStatus = (id, establishmentId, status) => {
    return prisma.portioningOrder.updateMany({
        where: {
            id,
            establishmentId
        },
        data: {
            status,
            completedAt: status === 'COMPLETED' ? new Date() : null
        }
    });
};

module.exports = {
    create,
    findById,
    findAll,
    updateStatus
};

const prisma = require('../utils/prisma');

const ENTRY_TYPES = ['PURCHASE', 'IN', 'BONUS'];
const INTERNAL_CONSUMPTION_REASONS = ['INTERNAL_USE'];

const movementDirectionWhere = (direction) => {
    if (direction === 'entry') {
        return {
            OR: [
                { type: { in: ENTRY_TYPES } },
                { type: 'TRANSFER', newQuantity: { gt: prisma.stockMovement.fields.previousQuantity } }
            ]
        };
    }

    if (direction === 'exit') {
        return {
            OR: [
                { type: 'OUT' },
                { type: 'TRANSFER', newQuantity: { lt: prisma.stockMovement.fields.previousQuantity } }
            ]
        };
    }

    if (direction === 'adjustment') {
        return {
            NOT: {
                OR: [
                    { type: { in: ENTRY_TYPES } },
                    { type: 'OUT' },
                    { type: 'TRANSFER' }
                ]
            }
        };
    }

    return {};
};

/**
 * @param {object} filters
 * @param {string} [filters.productId]
 * @param {string} [filters.dateFrom]  ISO string
 * @param {string} [filters.dateTo]    ISO string
 */
const buildWhere = ({ productId, dateFrom, dateTo, type, movementType, reason, supplierId, establishmentId } = {}) => {
    const where = {};
    if (establishmentId) where.establishmentId = establishmentId;

    if (productId) where.productId = productId;

    if (type === 'IN' && reason === 'BONUS') {
        where.OR = [
            { type: 'IN', reason: 'BONUS' },
            { type: 'BONUS' }
        ];
    } else if (movementType) {
        Object.assign(where, movementDirectionWhere(movementType));
    } else {
        if (type) where.type = type;
        if (reason) where.reason = reason;
    }

    if (supplierId) where.supplierId = supplierId;

    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(`${dateFrom}T00:00:00-03:00`);
        if (dateTo) where.createdAt.lte = new Date(`${dateTo}T23:59:59.999-03:00`);
    }

    return where;
};

const findAll = (filters = {}) => {
    const where = buildWhere(filters);

    return prisma.stockMovement.findMany({
        where,
        include: {
            product: { select: { id: true, name: true, unit: true } },
            supplier: { select: { name: true } },
            location: { select: { id: true, name: true } },
            purchaseReturn: { select: { purchaseQuantity: true, financialTreatment: true, purchaseOrderItemId: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
};

const findPaginated = async (filters = {}) => {
    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(filters.pageSize, 10) || 50, 10), 100);
    const where = buildWhere(filters);

    const totalItems = await prisma.stockMovement.count({ where });
    const totalPages = Math.ceil(totalItems / pageSize);
    const normalizedPage = Math.min(page, Math.max(totalPages, 1));
    const entryWhere = { AND: [where, movementDirectionWhere('entry')] };
    const exitWhere = { AND: [where, movementDirectionWhere('exit')] };
    const consumptionWhere = { AND: [where, { type: 'OUT', reason: { in: INTERNAL_CONSUMPTION_REASONS } }] };
    const bonusWhere = {
        AND: [
            where,
            {
                OR: [
                    { reason: 'BONUS' },
                    { type: 'BONUS' },
                    { reference: { contains: 'BONIFICA', mode: 'insensitive' } }
                ]
            }
        ]
    };

    const [items, entry, exit, bonus, consumption] = await Promise.all([
        prisma.stockMovement.findMany({
            where,
            select: {
                id: true,
                productId: true,
                productName: true,
                type: true,
                quantity: true,
                previousQuantity: true,
                newQuantity: true,
                reference: true,
                reason: true,
                createdAt: true
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (normalizedPage - 1) * pageSize,
            take: pageSize
        }),
        prisma.stockMovement.aggregate({ where: entryWhere, _sum: { quantity: true } }),
        prisma.stockMovement.aggregate({ where: exitWhere, _sum: { quantity: true } }),
        prisma.stockMovement.aggregate({ where: bonusWhere, _sum: { quantity: true } }),
        prisma.stockMovement.aggregate({ where: consumptionWhere, _sum: { quantity: true } })
    ]);

    return {
        items,
        pagination: {
            page: normalizedPage,
            pageSize,
            totalItems,
            totalPages
        },
        summary: {
            total: totalItems,
            entry: Number(entry._sum.quantity || 0),
            exit: Number(exit._sum.quantity || 0),
            bonus: Number(bonus._sum.quantity || 0),
            consumption: Number(consumption._sum.quantity || 0)
        }
    };
};

const create = (data) =>
    prisma.stockMovement.create({ data });

module.exports = { findAll, findPaginated, create };

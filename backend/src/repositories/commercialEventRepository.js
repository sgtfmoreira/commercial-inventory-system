const prisma = require('../utils/prisma');
const db = client => client || prisma;

const listCustomers = (establishmentId, { search, skip, take }, client) => db(client).eventCustomer.findMany({
    where: {
        establishmentId,
        ...(search ? { OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { document: { contains: search, mode: 'insensitive' } }
        ] } : {})
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take
});
const countCustomers = (establishmentId, search, client) => db(client).eventCustomer.count({
    where: { establishmentId, ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { document: { contains: search, mode: 'insensitive' } }
    ] } : {}) }
});
const findCustomer = (id, establishmentId, client) => db(client).eventCustomer.findFirst({ where: { id, establishmentId } });
const createCustomer = (data, client) => db(client).eventCustomer.create({ data });
const updateCustomer = (id, establishmentId, data, client) => db(client).eventCustomer.updateMany({ where: { id, establishmentId }, data });

const findResponsibleUser = (userId, establishmentId, client) => db(client).userEstablishment.findFirst({
    where: { userId, establishmentId, isActive: true }, select: { userId: true }
});
const listResponsibleUsers = (establishmentId, client) => db(client).userEstablishment.findMany({
    where: { establishmentId, isActive: true },
    select: { role: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: 'asc' } }
});
const createEvent = (data, client) => db(client).commercialEvent.create({ data });
const createBudget = (data, client) => db(client).eventBudget.create({ data });
const findEvent = (id, establishmentId, client) => db(client).commercialEvent.findFirst({
    where: { id, establishmentId },
    include: {
        customer: true,
        responsibleUser: { select: { id: true, name: true, email: true } },
        budgets: { orderBy: { revision: 'desc' }, include: {
            _count: { select: { items: true } },
            createdByUser: { select: { id: true, name: true, email: true } },
            approvedByUser: { select: { id: true, name: true, email: true } }
        } },
        approvedBudget: true
    }
});
const listEvents = (establishmentId, filters, client) => {
    const where = {
        establishmentId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.dateFrom || filters.dateTo ? { eventDate: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {})
        } } : {}),
        ...(filters.search ? { OR: [
            { code: { contains: filters.search, mode: 'insensitive' } },
            { name: { contains: filters.search, mode: 'insensitive' } },
            { customer: { name: { contains: filters.search, mode: 'insensitive' } } }
        ] } : {})
    };
    return Promise.all([
        db(client).commercialEvent.findMany({
            where,
            include: {
                customer: { select: { id: true, name: true } },
                budgets: { orderBy: { revision: 'desc' }, take: 1, select: {
                    id: true, revision: true, status: true, quotedPrice: true, effectiveMarginPercent: true
                } }
            },
            orderBy: [{ eventDate: 'asc' }, { code: 'asc' }], skip: filters.skip, take: filters.take
        }),
        db(client).commercialEvent.count({ where })
    ]);
};
const updateEvent = (id, establishmentId, data, client) => db(client).commercialEvent.updateMany({
    where: { id, establishmentId }, data
});
const listEventBudgets = (eventId, establishmentId, client) => db(client).eventBudget.findMany({
    where: { eventId, event: { establishmentId } },
    orderBy: { revision: 'desc' },
    select: {
        id: true, revision: true, status: true, quotedPrice: true,
        effectiveMarginPercent: true, sentAt: true, approvedAt: true, createdAt: true,
        createdByUser: { select: { id: true, name: true, email: true } },
        approvedByUser: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } }
    }
});
const cancelOpenBudgets = (eventId, client) => db(client).eventBudget.updateMany({
    where: { eventId, status: { in: ['DRAFT', 'SENT'] } }, data: { status: 'CANCELLED' }
});
const createAudit = (data, client) => db(client).auditLog.create({ data });
const findBudget = (id, establishmentId, client) => db(client).eventBudget.findFirst({
    where: { id, event: { establishmentId } },
    include: { event: { include: { customer: true } }, items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } }
});
const updateBudget = (id, data, client) => db(client).eventBudget.update({ where: { id }, data });
const updateBudgets = (where, data, client) => db(client).eventBudget.updateMany({ where, data });
const latestBudget = (eventId, client) => db(client).eventBudget.findFirst({ where:{eventId},orderBy:{revision:'desc'},select:{revision:true} });
const findBudgetItem = (id, establishmentId, client) => db(client).eventBudgetItem.findFirst({
    where: { id, budget: { event: { establishmentId } } }, include: { budget: { include: { event: true } } }
});
const createBudgetItem = (data, client) => db(client).eventBudgetItem.create({ data });
const updateBudgetItem = (id, data, client) => db(client).eventBudgetItem.update({ where: { id }, data });
const deleteBudgetItem = (id, client) => db(client).eventBudgetItem.delete({ where: { id } });
const expireBudgets = (establishmentId, before, client) => db(client).eventBudget.updateMany({
    where:{status:'SENT',validUntil:{lt:before},event:{establishmentId}},data:{status:'EXPIRED'}
});
const catalogInclude = {
    category: { select: { id: true, name: true } },
    Recipe: { include: { items: { include: { product: { select: {
        id:true,name:true,unit:true,currentCost:true,unitPrice:true,packQuantity:true,
        category:{select:{id:true,name:true}}
    } } }, orderBy: { createdAt:'asc' } } } }
};
const listCatalogProducts = (establishmentId,{search,limit},client) => db(client).product.findMany({
    where:{establishmentId,isActive:true,type:{in:['INVENTORY','PRODUCTION']},...(search?{name:{contains:search,mode:'insensitive'}}:{})},
    include:catalogInclude,orderBy:{name:'asc'},take:limit
});
const findCatalogProduct = (id,establishmentId,client) => db(client).product.findFirst({
    where:{id,establishmentId,isActive:true},include:catalogInclude
});

module.exports = {
    listCustomers, countCustomers, findCustomer, createCustomer, updateCustomer,
    findResponsibleUser, listResponsibleUsers, createEvent, createBudget, findEvent, listEvents, updateEvent, listEventBudgets,
    cancelOpenBudgets, createAudit, findBudget, updateBudget, updateBudgets, latestBudget, findBudgetItem,
    createBudgetItem, updateBudgetItem, deleteBudgetItem, expireBudgets, listCatalogProducts, findCatalogProduct
};

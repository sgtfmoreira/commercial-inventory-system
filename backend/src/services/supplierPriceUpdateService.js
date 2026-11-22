const prisma = require('../utils/prisma');
const AppError = require('../utils/AppError');
const TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 60000 };

const normalizedPrice = (packagePrice, unitsPerPackage) => {
    const price = Number(packagePrice);
    const units = Number(unitsPerPackage);
    if (!(price > 0) || !(units > 0)) throw new AppError('Preço e unidades por embalagem devem ser positivos.', 422);
    return Number((price / units).toFixed(4));
};
const scope = async (establishmentId, db = prisma) => {
    const establishment = await db.establishments.findUnique({ where: { id: establishmentId }, select: { organizationId: true } });
    if (!establishment?.organizationId) throw new AppError('Organização não encontrada.', 404);
    return establishment.organizationId;
};
const ensureSupplier = async (id, organizationId, db = prisma) => {
    const supplier = await db.organizationSupplier.findFirst({ where: { id, organizationId, isActive: true } });
    if (!supplier) throw new AppError('Fornecedor central não encontrado.', 404);
    return supplier;
};
const list = async (establishmentId, query = {}) => {
    const organizationId = await scope(establishmentId);
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const where = {
        organizationSupplier: {
            organizationId,
            ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {})
        },
        ...(query.organizationSupplierId ? { organizationSupplierId: query.organizationSupplierId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.dateFrom || query.dateTo ? { createdAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(query.dateTo ? { lte: query.dateTo } : {}) } } : {})
    };
    const [totalItems, items] = await prisma.$transaction([
        prisma.supplierPriceUpdate.count({ where }),
        prisma.supplierPriceUpdate.findMany({
            where,
            select: {
                id: true, status: true, note: true, submittedAt: true, approvedAt: true,
                appliedAt: true, createdAt: true, updatedAt: true,
                organizationSupplier: { select: { id: true, name: true } },
                _count: { select: { items: true } }
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize
        })
    ]);
    return { items, pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
};
const catalog = async (organizationSupplierId, establishmentId) => {
    const organizationId = await scope(establishmentId);
    await ensureSupplier(organizationSupplierId, organizationId);
    return prisma.supplierCatalogItem.findMany({
        where: { organizationSupplierId },
        include: { organizationProduct: { select: { id: true, internalCode: true, name: true, baseUnit: true } } },
        orderBy: { organizationProduct: { name: 'asc' } }
    });
};
const localTargets = async (catalogItem, db = prisma) => {
    const [products, suppliers, links] = await Promise.all([
        db.product.findMany({
            where: { organizationProductId: catalogItem.organizationProductId, isActive: true },
            select: { id: true, name: true, establishmentId: true, establishment: { select: { name: true } } }
        }),
        db.supplier.findMany({
            where: { organizationSupplierId: catalogItem.organizationSupplierId },
            select: { id: true, name: true, establishmentId: true }
        }),
        db.productSupplier.findMany({
            where: {
                product: { organizationProductId: catalogItem.organizationProductId },
                supplier: { organizationSupplierId: catalogItem.organizationSupplierId }
            },
            include: {
                product: { select: { id: true, name: true, establishmentId: true, establishment: { select: { name: true } } } },
                supplier: { select: { id: true, name: true, establishmentId: true } }
            }
        })
    ]);
    const supplierByEstablishment = new Map(suppliers.map(item => [item.establishmentId, item]));
    const linkByPair = new Map(links.map(item => [`${item.product.id}:${item.supplier.id}`, item]));
    return products.flatMap(product => {
        const supplier = supplierByEstablishment.get(product.establishmentId);
        if (!supplier) return [];
        const link = linkByPair.get(`${product.id}:${supplier.id}`);
        return [{
            id: link?.id || null,
            price: link?.price ?? null,
            product,
            supplier,
            willCreate: !link
        }];
    });
};
const localLinks = async (catalogItem, db = prisma) => (await localTargets(catalogItem, db)).filter(item => item.id);
const applyCatalogPrice = async (catalogItem, packagePrice, db = prisma) => {
    const targets = await localTargets(catalogItem, db);
    for (const target of targets) {
        await db.productSupplier.upsert({
            where: { productId_supplierId: { productId: target.product.id, supplierId: target.supplier.id } },
            update: { price: packagePrice },
            create: { productId: target.product.id, supplierId: target.supplier.id, price: packagePrice }
        });
        await db.supplierPriceHistory.create({
            data: { productId: target.product.id, supplierId: target.supplier.id, price: packagePrice }
        });
    }
    return targets;
};
const create = (input, establishmentId, userId) => prisma.$transaction(async tx => {
    const organizationId = await scope(establishmentId, tx);
    await ensureSupplier(input.organizationSupplierId, organizationId, tx);
    const productIds = [...new Set(input.items.map(item => item.organizationProductId))];
    if (productIds.length !== input.items.length) throw new AppError('Não repita o mesmo produto no lote.', 422);
    const products = await tx.organizationProduct.findMany({ where: { id: { in: productIds }, organizationId, isActive: true }, select: { id: true } });
    if (products.length !== productIds.length) throw new AppError('Um ou mais produtos centrais não pertencem à organização.', 404);
    const update = await tx.supplierPriceUpdate.create({ data: { organizationSupplierId: input.organizationSupplierId, status: 'SUBMITTED', note: input.note || null, submittedAt: new Date(), createdByUserId: userId } });
    for (const item of input.items) {
        const nextNormalized = normalizedPrice(item.packagePrice, item.unitsPerPackage);
        let catalogItem = await tx.supplierCatalogItem.findUnique({ where: { organizationSupplierId_organizationProductId: { organizationSupplierId: input.organizationSupplierId, organizationProductId: item.organizationProductId } } });
        if (!catalogItem) catalogItem = await tx.supplierCatalogItem.create({ data: { organizationSupplierId: input.organizationSupplierId, organizationProductId: item.organizationProductId, supplierCode: item.supplierCode || null, commercialUnit: item.commercialUnit, unitsPerPackage: item.unitsPerPackage, packagePrice: item.packagePrice, normalizedUnitPrice: nextNormalized, available: item.available, minimumOrder: item.minimumOrder || null, deliveryLeadDays: item.deliveryLeadDays ?? null, validUntil: item.validUntil ? new Date(item.validUntil) : null, status: 'PENDING', lastSubmittedAt: new Date() } });
        const links = await localTargets(catalogItem, tx);
        await tx.supplierPriceUpdateItem.create({ data: { supplierPriceUpdateId: update.id, supplierCatalogItemId: catalogItem.id, previousPackagePrice: catalogItem.packagePrice, newPackagePrice: item.packagePrice, previousNormalizedPrice: catalogItem.normalizedUnitPrice, newNormalizedPrice: nextNormalized, commercialUnit: item.commercialUnit, unitsPerPackage: item.unitsPerPackage, available: item.available, deliveryLeadDays: item.deliveryLeadDays ?? null, affectedEstablishments: links.length } });
    }
    await tx.auditLog.create({ data: { actionType: 'SUBMIT', entityType: 'SUPPLIER_PRICE_UPDATE', entityId: update.id, description: `Lote com ${input.items.length} preço(s) enviado por ${userId}.`, establishmentId } });
    return getById(update.id, establishmentId, tx);
}, TRANSACTION_OPTIONS);
const getById = async (id, establishmentId, db = prisma) => {
    const organizationId = await scope(establishmentId, db);
    const update = await db.supplierPriceUpdate.findFirst({ where: { id, organizationSupplier: { organizationId } }, include: { organizationSupplier: true, items: { include: { catalogItem: { include: { organizationProduct: true } } } } } });
    if (!update) throw new AppError('Lote não encontrado.', 404);
    return update;
};
const preview = async (id, establishmentId) => {
    const update = await getById(id, establishmentId);
    const items = [];
    for (const item of update.items) {
        const links = await localTargets(item.catalogItem);
        const previous = Number(item.previousNormalizedPrice);
        const next = Number(item.newNormalizedPrice);
        items.push({ id: item.id, product: item.catalogItem.organizationProduct, previousPackagePrice: Number(item.previousPackagePrice), newPackagePrice: Number(item.newPackagePrice), previousNormalizedPrice: previous, newNormalizedPrice: next, percentageVariation: previous > 0 ? ((next - previous) / previous) * 100 : null, affectedLinks: links.map(link => ({ productSupplierId: link.id, establishment: link.product.establishment.name, product: link.product.name, supplier: link.supplier.name, currentPrice: link.price === null ? null : Number(link.price), willCreate: link.willCreate })) });
    }
    return { id: update.id, status: update.status, supplier: update.organizationSupplier, items };
};
const apply = (id, establishmentId, userId) => prisma.$transaction(async tx => {
    const update = await getById(id, establishmentId, tx);
    if (update.status === 'APPLIED') return { update, idempotent: true };
    if (update.status !== 'SUBMITTED') throw new AppError('Somente lotes enviados podem ser aplicados.', 409);
    let affected = 0;
    for (const item of update.items) {
        const links = await applyCatalogPrice(item.catalogItem, item.newPackagePrice, tx);
        affected += links.length;
        await tx.supplierCatalogItem.update({ where: { id: item.catalogItem.id }, data: { commercialUnit: item.commercialUnit, unitsPerPackage: item.unitsPerPackage, packagePrice: item.newPackagePrice, normalizedUnitPrice: item.newNormalizedPrice, available: item.available, deliveryLeadDays: item.deliveryLeadDays, status: 'ACTIVE' } });
        await tx.supplierPriceUpdateItem.update({ where: { id: item.id }, data: { status: 'APPROVED', affectedEstablishments: links.length } });
    }
    const applied = await tx.supplierPriceUpdate.update({ where: { id }, data: { status: 'APPLIED', approvedAt: new Date(), appliedAt: new Date(), approvedByUserId: userId } });
    await tx.auditLog.create({ data: { actionType: 'APPLY', entityType: 'SUPPLIER_PRICE_UPDATE', entityId: id, description: `Lote aplicado em ${affected} vínculo(s) local(is) por ${userId}.`, establishmentId } });
    return { update: applied, affectedLinks: affected, idempotent: false };
}, TRANSACTION_OPTIONS);
const reject = (id, reason, establishmentId, userId) => prisma.$transaction(async tx => {
    const update = await getById(id, establishmentId, tx);
    if (update.status !== 'SUBMITTED') throw new AppError('Somente lotes enviados podem ser rejeitados.', 409);
    await tx.supplierPriceUpdateItem.updateMany({ where: { supplierPriceUpdateId: id }, data: { status: 'REJECTED', rejectionReason: reason } });
    const rejected = await tx.supplierPriceUpdate.update({ where: { id }, data: { status: 'REJECTED', approvedByUserId: userId, approvedAt: new Date(), note: [update.note, `Rejeição: ${reason}`].filter(Boolean).join('\n') } });
    await tx.auditLog.create({ data: { actionType: 'REJECT', entityType: 'SUPPLIER_PRICE_UPDATE', entityId: id, description: `Lote rejeitado por ${userId}: ${reason}`, establishmentId } });
    return rejected;
}, TRANSACTION_OPTIONS);

module.exports = { TRANSACTION_OPTIONS, normalizedPrice, list, catalog, getById, create, preview, apply, reject, localTargets, localLinks, applyCatalogPrice };

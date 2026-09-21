const prisma = require('../config/prisma');

const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const parseBusinessDateBoundary = (date, endOfDay = false) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Data inválida. Use o formato YYYY-MM-DD.');
    }

    const time = endOfDay ? '23:59:59.999' : '00:00:00.000';

    // O calendário operacional do sistema é o de São Paulo (UTC-03 desde 2019).
    return new Date(`${date}T${time}-03:00`);
};

const getBusinessDayKey = (date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const getMonthlyBonusTrend = async (establishmentId, dateFrom, dateTo) => {
    const where = {
        establishmentId,
        OR: [
            { reason: 'BONUS' },
            { type: 'BONUS' }
        ]
    };

    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59');
    } else {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); // 6 meses incluindo o atual
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);
        where.createdAt = { gte: sixMonthsAgo };
    }

    const movements = await prisma.stockMovement.findMany({
        where,
        include: {
            product: true
        },
        orderBy: { createdAt: 'asc' }
    });

    const monthlyDataMap = {};
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    movements.forEach(m => {
        const date = new Date(m.createdAt);
        const year = date.getFullYear();
        const monthNum = date.getMonth();
        const key = `${year}-${monthNum}`;
        
        if (!monthlyDataMap[key]) {
            monthlyDataMap[key] = {
                month: `${months[monthNum]}/${year.toString().slice(-2)}`,
                total: 0,
                sortKey: date.getTime()
            };
        }

        // Soma totalCost ou calcula fallback via custo atual do produto
        const cost = Number(m.totalCost || (Number(m.quantity) * Number(m.product?.currentCost || m.product?.unitPrice || 0)));
        monthlyDataMap[key].total += cost;
    });

    return Object.values(monthlyDataMap).sort((a, b) => a.sortKey - b.sortKey);
};

const getFinancialSummary = async (establishmentId, dateFrom, dateTo) => {
    const where = { establishmentId };

    if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = parseBusinessDateBoundary(dateFrom);
        if (dateTo) where.createdAt.lte = parseBusinessDateBoundary(dateTo, true);
    } else {
        // Default to last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        where.createdAt = { gte: sevenDaysAgo };
    }

    const saleWhere = {
        establishmentId,
        status: 'COMPLETED',
        netTotal: { not: null }
    };
    if (where.createdAt) saleWhere.soldAt = where.createdAt;

    const [movements, purchaseItems, sales] = await Promise.all([
        prisma.stockMovement.findMany({
            where,
            select: {
                reason: true,
                reference: true,
                totalCost: true,
                createdAt: true,
                purchaseClassification: true,
                product: { select: { purchaseClassification: true } }
            },
            orderBy: { createdAt: 'asc' }
        }),
        prisma.purchaseOrderItem.findMany({
            where: {
                purchaseOrder: {
                    establishmentId,
                    status: 'completed',
                    ...(where.createdAt ? { completedAt: where.createdAt } : {})
                }
            },
            select: {
                purchaseClassification: true,
                adjustedQuantity: true,
                unitPrice: true
            }
        }),
        prisma.sale.findMany({
            where: saleWhere,
            select: { grossTotal: true, discountTotal: true, netTotal: true, soldAt: true },
            orderBy: { soldAt: 'asc' }
        })
    ]);

    const summary = {
        salesCogs: 0,
        grossRevenue: 0,
        discounts: 0,
        netRevenue: 0,
        cogsPercentage: null,
        grossProfit: null,
        grossMarginPercentage: null,
        revenueAvailable: false,
        grossPurchases: 0,
        purchaseReturns: 0,
        netPurchases: 0,
        returnsByClassification: {},
        internalConsumption: 0,
        operationalConsumption: 0,
        beverageOperationalConsumption: 0,
        cleaningConsumption: 0,
        disposablesConsumption: 0,
        otherOperationalConsumption: 0,
        bonuses: 0,
        losses: 0,
        auditLosses: 0,
        auditGains: 0,
        auditNetImpact: 0,
        operationalLosses: 0,
        hasMixedAuditAdjustments: false,
        suspectedExchangeAudits: 0,
        purchasesByClassification: {
            CMV_BEVERAGES: 0,
            CLEANING: 0,
            DISPOSABLES: 0,
            OPERATING: 0,
            EXCLUDED: 0
        }
    };

    const dailyChart = {};
    const auditAdjustments = new Map();

    movements.forEach(m => {
        const cost = Number(m.totalCost || 0);
        const reason = m.reason;

        const dayKey = getBusinessDayKey(m.createdAt);

        if (!dailyChart[dayKey]) {
            dailyChart[dayKey] = {
                date: dayKey,
                salesCogs: 0,
                netRevenue: 0,
                cogsPercentage: null,
                internalConsumption: 0,
                operationalConsumption: 0,
                beverageOperationalConsumption: 0,
                cleaningConsumption: 0,
                disposablesConsumption: 0,
                otherOperationalConsumption: 0,
                bonuses: 0,
                losses: 0,
                auditLosses: 0,
                auditGains: 0,
                auditNetImpact: 0,
                operationalLosses: 0
            };
        }

        const classification = m.purchaseClassification || m.product?.purchaseClassification || 'EXCLUDED';

        if (['CONSIGNMENT_RETURN', 'SUPPLIER_RETURN'].includes(reason)) {
            summary.purchaseReturns += cost;
            summary.returnsByClassification[classification] = (summary.returnsByClassification[classification] || 0) + cost;
        }

        if (reason === 'SALE' && classification === 'CMV_BEVERAGES') {
            summary.salesCogs += cost;
            dailyChart[dayKey].salesCogs += cost;
        } 
        else if (reason === 'INTERNAL_USE') {
            summary.internalConsumption += cost;
            dailyChart[dayKey].internalConsumption += cost;
        }
        else if (reason === 'OPERATIONAL_USE') {
            summary.operationalConsumption += cost;
            dailyChart[dayKey].operationalConsumption += cost;

            if (classification === 'CMV_BEVERAGES') {
                summary.beverageOperationalConsumption += cost;
                dailyChart[dayKey].beverageOperationalConsumption += cost;
            } else if (classification === 'CLEANING') {
                summary.cleaningConsumption += cost;
                dailyChart[dayKey].cleaningConsumption += cost;
            } else if (classification === 'DISPOSABLES') {
                summary.disposablesConsumption += cost;
                dailyChart[dayKey].disposablesConsumption += cost;
            } else if (classification === 'OPERATING') {
                summary.otherOperationalConsumption += cost;
                dailyChart[dayKey].otherOperationalConsumption += cost;
            }
        }
        else if (['PROMO', 'COURTESY', 'DOUBLE_DRINK', 'TASTING'].includes(reason)) {
            summary.operationalConsumption += cost;
            summary.beverageOperationalConsumption += cost;
            dailyChart[dayKey].operationalConsumption += cost;
            dailyChart[dayKey].beverageOperationalConsumption += cost;
        }
        else if (reason === 'BONUS') {
            summary.bonuses += cost;
            dailyChart[dayKey].bonuses += cost;
        }
        else if (reason === 'LOSS') {
            summary.losses += cost;
            summary.auditLosses += cost;
            dailyChart[dayKey].losses += cost;
            dailyChart[dayKey].auditLosses += cost;
            dailyChart[dayKey].auditNetImpact -= cost;
            if (String(m.reference || '').startsWith('STOCK_AUDIT')) {
                const adjustment = auditAdjustments.get(m.reference) || { losses: 0, gains: 0 };
                adjustment.losses += cost;
                auditAdjustments.set(m.reference, adjustment);
            }
        }
        else if (reason === 'GAIN') {
            summary.auditGains += cost;
            dailyChart[dayKey].auditGains += cost;
            dailyChart[dayKey].auditNetImpact += cost;
            if (String(m.reference || '').startsWith('STOCK_AUDIT')) {
                const adjustment = auditAdjustments.get(m.reference) || { losses: 0, gains: 0 };
                adjustment.gains += cost;
                auditAdjustments.set(m.reference, adjustment);
            }
        }
        else if (reason === 'OPERATIONAL_LOSS') {
            summary.losses += cost;
            summary.operationalLosses += cost;
            dailyChart[dayKey].losses += cost;
            dailyChart[dayKey].operationalLosses += cost;
        }
    });

    purchaseItems.forEach(item => {
        const classification = item.purchaseClassification || 'EXCLUDED';
        summary.purchasesByClassification[classification] +=
            Number(item.adjustedQuantity || 0) * Number(item.unitPrice || 0);
    });

    summary.grossPurchases = Object.values(summary.purchasesByClassification).reduce((sum, value) => sum + value, 0);
    summary.grossPurchasesByClassification = { ...summary.purchasesByClassification };
    Object.entries(summary.returnsByClassification).forEach(([classification, value]) => {
        summary.purchasesByClassification[classification] = (summary.purchasesByClassification[classification] || 0) - value;
    });
    summary.netPurchases = summary.grossPurchases - summary.purchaseReturns;

    sales.forEach(sale => {
        const gross = Number(sale.grossTotal || 0);
        const discount = Number(sale.discountTotal || 0);
        const net = Number(sale.netTotal || 0);
        summary.grossRevenue += gross;
        summary.discounts += discount;
        summary.netRevenue += net;

        const dayKey = getBusinessDayKey(sale.soldAt);
        if (!dailyChart[dayKey]) {
            dailyChart[dayKey] = {
                date: dayKey,
                salesCogs: 0,
                netRevenue: 0,
                cogsPercentage: null,
                internalConsumption: 0,
                operationalConsumption: 0,
                beverageOperationalConsumption: 0,
                cleaningConsumption: 0,
                disposablesConsumption: 0,
                otherOperationalConsumption: 0,
                bonuses: 0,
                losses: 0,
                auditLosses: 0,
                auditGains: 0,
                auditNetImpact: 0,
                operationalLosses: 0
            };
        }
        dailyChart[dayKey].netRevenue += net;
    });

    if (summary.netRevenue > 0) {
        summary.revenueAvailable = true;
        summary.cogsPercentage = (summary.salesCogs / summary.netRevenue) * 100;
        summary.grossProfit = summary.netRevenue - summary.salesCogs;
        summary.grossMarginPercentage = (summary.grossProfit / summary.netRevenue) * 100;
    }

    summary.auditNetImpact = summary.auditGains - summary.auditLosses;
    summary.suspectedExchangeAudits = [...auditAdjustments.values()]
        .filter(adjustment => adjustment.losses > 0 && adjustment.gains > 0).length;
    summary.hasMixedAuditAdjustments = summary.suspectedExchangeAudits > 0;

    Object.values(dailyChart).forEach(day => {
        day.cogsPercentage = day.netRevenue > 0
            ? (day.salesCogs / day.netRevenue) * 100
            : null;
    });

    return {
        summary,
        chartData: Object.values(dailyChart).sort((a, b) => a.date.localeCompare(b.date))
    };
};

const getPurchasesByProduct = async (establishmentId, productId, dateFrom, dateTo) => {
    const where = {
        purchaseOrder: {
            establishmentId,
            status: 'completed'
        }
    };

    if (productId) {
        where.productId = productId;
    }

    if (dateFrom || dateTo) {
        where.purchaseOrder.completedAt = {};
        if (dateFrom) where.purchaseOrder.completedAt.gte = parseBusinessDateBoundary(dateFrom);
        if (dateTo) where.purchaseOrder.completedAt.lte = parseBusinessDateBoundary(dateTo, true);
    }

    const items = await prisma.purchaseOrderItem.findMany({
        where,
        include: {
            purchaseOrder: {
                select: {
                    id: true,
                    completedAt: true
                }
            },
            product: {
                select: { name: true, unit: true, purchaseUnit: true, packQuantity: true }
            },
            supplier: {
                select: { name: true }
            }
        },
        orderBy: {
            purchaseOrder: { completedAt: 'desc' }
        }
    });

    const returns = await prisma.purchaseReturn.findMany({
        where: {
            establishmentId,
            ...(productId ? { purchaseOrderItem: { productId } } : {}),
            ...(where.purchaseOrder.completedAt ? { returnedAt: where.purchaseOrder.completedAt } : {})
        },
        include: { purchaseOrderItem: { include: { product: true, supplier: { select: { name: true } }, purchaseOrder: { select: { id: true, completedAt: true } } } } }
    });
    return [
        ...items.map(item => ({ ...item, rowType: 'PURCHASE', eventAt: item.purchaseOrder.completedAt, totalAmount: Number(item.adjustedQuantity) * Number(item.unitPrice) })),
        ...returns.map(item => ({
            id: item.id, rowType: 'RETURN', eventAt: item.returnedAt,
            purchaseOrder: item.purchaseOrderItem.purchaseOrder,
            product: item.purchaseOrderItem.product, supplier: item.purchaseOrderItem.supplier,
            adjustedQuantity: -Number(item.purchaseQuantity), unitPrice: Number(item.purchaseOrderItem.unitPrice),
            totalAmount: -Number(item.totalCost)
        }))
    ].sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt));
};

module.exports = {
    getMonthlyBonusTrend,
    getFinancialSummary,
    getPurchasesByProduct
};

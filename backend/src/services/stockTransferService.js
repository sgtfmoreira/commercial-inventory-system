const prisma = require('../config/prisma');
const { consumeProduct, addStock } = require('./stockMovementService');
const { calculateTransferConversion } = require('../utils/stockTransferConversion');

const conversionData = (conversion) => ({
    destinationQuantity: conversion.destinationQuantity,
    sourceUnit: conversion.sourceUnit,
    destinationUnit: conversion.destinationUnit,
    sourcePackQuantity: conversion.sourcePackQuantity,
    destinationPackQuantity: conversion.destinationPackQuantity,
    conversionFactor: conversion.conversionFactor
});

const resolveDestinationConversion = async ({
    db,
    sourceProduct,
    destinationProductId,
    toEstablishmentId,
    quantity
}) => {
    if (!destinationProductId) {
        return {
            destinationProduct: null,
            conversion: calculateTransferConversion({
                sourceProduct,
                destinationProduct: sourceProduct,
                quantity
            })
        };
    }

    const destinationProduct = await db.product.findFirst({
        where: { id: destinationProductId, establishmentId: toEstablishmentId }
    });

    if (!destinationProduct) {
        throw new Error('Produto de destino nao encontrado ou nao pertence ao estabelecimento de destino.');
    }

    return {
        destinationProduct,
        conversion: calculateTransferConversion({ sourceProduct, destinationProduct, quantity })
    };
};

/**
 * 🔐 CRIAR TRANSFERÊNCIA
 * Valida que o usuário pertence ao estabelecimento de ORIGEM.
 */
const createTransfer = async ({
    productId,
    destinationProductId,
    quantity,
    fromEstablishmentId,
    toEstablishmentId,
    userId
}) => {

    if (!productId) {
        throw new Error("Produto é obrigatório");
    }

    if (!quantity || quantity <= 0) {
        throw new Error("Quantidade inválida");
    }

    if (fromEstablishmentId === toEstablishmentId) {
        throw new Error("Não é possível transferir para o mesmo estabelecimento");
    }

    const [fromEst, toEst] = await Promise.all([
        prisma.establishments.findUnique({ where: { id: fromEstablishmentId } }),
        prisma.establishments.findUnique({ where: { id: toEstablishmentId } })
    ]);

    if (!fromEst || !toEst) {
        throw new Error("Estabelecimento de origem ou destino não encontrado.");
    }

    // 🛡️ SEGURANÇA: Só pode transferir se estiverem na mesma rede (organização)
    if (fromEst.organizationId !== toEst.organizationId) {
        throw new Error("Não é permitido transferir estoque entre organizações diferentes.");
    }

    const product = await prisma.product.findFirst({
        where: {
            id: productId,
            establishmentId: fromEstablishmentId
        }
    });

    if (!product) {
        throw new Error("Produto não encontrado ou não pertence ao seu estabelecimento.");
    }

    const { conversion } = await resolveDestinationConversion({
        db: prisma,
        sourceProduct: product,
        destinationProductId,
        toEstablishmentId,
        quantity
    });

    const transfer = await prisma.stockTransfer.create({
        data: {
            productId,
            destinationProductId: destinationProductId || null,
            quantity: Number(quantity),
            fromEstablishmentId,
            toEstablishmentId,
            createdBy: userId,
            status: "PENDING",
            ...conversionData(conversion)
        }
    });

    return transfer;
};

/**
 * 🔐 CRIAR TRANSFERÊNCIAS EM LOTE (MÚLTIPLOS ITENS)
 */
const createBulkTransfers = async ({
    items,
    fromEstablishmentId,
    toEstablishmentId,
    userId
}) => {

    if (!items || items.length === 0) {
        throw new Error("Nenhum item informado para transferência.");
    }

    if (fromEstablishmentId === toEstablishmentId) {
        throw new Error("Não é possível transferir para o mesmo estabelecimento");
    }

    const [fromEst, toEst] = await Promise.all([
        prisma.establishments.findUnique({ where: { id: fromEstablishmentId } }),
        prisma.establishments.findUnique({ where: { id: toEstablishmentId } })
    ]);

    if (!fromEst || !toEst) {
        throw new Error("Estabelecimento de origem ou destino não encontrado.");
    }

    if (fromEst.organizationId !== toEst.organizationId) {
        throw new Error("Não é permitido transferir estoque entre organizações diferentes.");
    }

    const transfers = [];

    await prisma.$transaction(async (tx) => {
        for (const item of items) {
            const { productId, quantity, destinationProductId } = item;

            if (!productId || !quantity || quantity <= 0) {
                throw new Error("Item com produto ou quantidade inválida.");
            }

            const product = await tx.product.findFirst({
                where: {
                    id: productId,
                    establishmentId: fromEstablishmentId
                }
            });

            if (!product) {
                throw new Error(`Produto não encontrado na origem.`);
            }

            const { conversion } = await resolveDestinationConversion({
                db: tx,
                sourceProduct: product,
                destinationProductId,
                toEstablishmentId,
                quantity
            });

            const transfer = await tx.stockTransfer.create({
                data: {
                    productId,
                    destinationProductId: destinationProductId || null,
                    quantity: Number(quantity),
                    fromEstablishmentId,
                    toEstablishmentId,
                    createdBy: userId,
                    status: "PENDING",
                    ...conversionData(conversion)
                }
            });

            transfers.push(transfer);
        }
    });

    return transfers;
};


/**
 * 🔐 LISTAR ENVIADAS
 */
const getSentTransfers = async (establishmentId) => {
    return prisma.stockTransfer.findMany({
        where: {
            fromEstablishmentId: establishmentId
        },
        include: {
            product: {
                select: { id: true, name: true, unit: true }
            },
            destinationProduct: {
                select: { id: true, name: true, unit: true }
            },
            toEstablishment: {
                select: { id: true, name: true }
            }
        },
        orderBy: { createdAt: "desc" }
    });
};

/**
 * 🔐 LISTAR RECEBIDAS
 */
const getReceivedTransfers = async (establishmentId) => {
    return prisma.stockTransfer.findMany({
        where: {
            toEstablishmentId: establishmentId
        },
        include: {
            product: {
                select: { id: true, name: true, unit: true }
            },
            destinationProduct: {
                select: { id: true, name: true, unit: true }
            },
            fromEstablishment: {
                select: { id: true, name: true }
            }
        },
        orderBy: { createdAt: "desc" }
    });
};

/**
 * 🔐 APROVAR TRANSFERÊNCIA
 * 🛡️ Valida que o destino (quem aprova) é o estabelecimento do usuário.
 */
const approveTransfer = async (transferId, userId, establishmentId) => {
    return prisma.$transaction(async (tx) => {
        // Reserva a transferência de forma atômica. Uma segunda aprovação
        // concorrente não consegue mudar PENDING para APPROVED novamente.
        const claimed = await tx.stockTransfer.updateMany({
            where: {
                id: transferId,
                toEstablishmentId: establishmentId,
                status: "PENDING"
            },
            data: {
                status: "APPROVED",
                approvedBy: userId,
                approvedAt: new Date()
            }
        });

        if (claimed.count !== 1) {
            throw new Error("Transferência não encontrada, sem permissão ou já processada.");
        }

        const transfer = await tx.stockTransfer.findFirst({
            where: { 
                id: transferId,
                toEstablishmentId: establishmentId
            }
        });

        if (!transfer) {
            throw new Error("Transferência não encontrada ou você não tem permissão para aprová-la.");
        }

        const {
            productId,
            destinationProductId,
            quantity,
            fromEstablishmentId,
            toEstablishmentId
        } = transfer;

        // 2️⃣ Buscar produto origem
        const product = await tx.product.findFirst({
            where: {
                id: productId,
                establishmentId: fromEstablishmentId
            }
        });

        if (!product) {
            throw new Error("Produto de origem não encontrado.");
        }


        // 3️⃣ Buscar ou criar produto no destino
        let destinationProduct = null;
        
        if (destinationProductId) {
             destinationProduct = await tx.product.findFirst({
                 where: {
                     id: destinationProductId,
                     establishmentId: toEstablishmentId
                 }
             });

             if (!destinationProduct) {
                 throw new Error("Produto de destino não encontrado ou não pertence ao estabelecimento de destino.");
             }

        }

        if (!destinationProduct) {
            const sourceCategory = await tx.category.findFirst({
                where: { id: product.categoryId, establishmentId: fromEstablishmentId }
            });

            if (!sourceCategory) {
                throw new Error("Categoria do produto de origem não encontrada.");
            }

            let destinationCategory = await tx.category.findFirst({
                where: { name: sourceCategory.name, establishmentId: toEstablishmentId }
            });

            if (!destinationCategory) {
                destinationCategory = await tx.category.create({
                    data: { name: sourceCategory.name, establishmentId: toEstablishmentId }
                });
            }

            const destinationDefaultLocation = await tx.stockLocation.findFirst({
                where: { establishmentId: toEstablishmentId, isDefault: true },
                orderBy: { createdAt: 'asc' }
            });

            if (!destinationDefaultLocation) {
                throw new Error("O estabelecimento de destino não possui local de estoque padrão.");
            }

            destinationProduct = await tx.product.create({
                data: {
                    name: product.name,
                    unit: product.unit,
                    unitPrice: product.unitPrice,
                    currentCost: product.currentCost,
                    quantity: 0,
                    minQuantity: product.minQuantity,
                    type: product.type,
                    purchaseUnit: product.purchaseUnit,
                    packQuantity: product.packQuantity,
                    categoryId: destinationCategory.id,
                    defaultLocationId: destinationDefaultLocation.id,
                    establishmentId: toEstablishmentId,
                    isActive: product.isActive
                }
            });
        }

        const calculatedConversion = calculateTransferConversion({
            sourceProduct: product,
            destinationProduct,
            quantity: Number(quantity)
        });
        if (
            transfer.destinationQuantity != null &&
            Math.abs(Number(transfer.destinationQuantity) - calculatedConversion.destinationQuantity) > 0.000001
        ) {
            throw new Error('A embalagem do produto mudou depois da criacao da transferencia. Rejeite e crie uma nova transferencia.');
        }
        const destinationQuantity = transfer.destinationQuantity == null
            ? calculatedConversion.destinationQuantity
            : Number(transfer.destinationQuantity);

        // BAIXA NO ORIGEM
        await consumeProduct({
            productId,
            quantity,
            establishmentId: fromEstablishmentId,
            reason: "TRANSFER",
            reference: `Transferência para ${toEstablishmentId}`,
            enforceAvailableStock: true
        }, tx);

        // ENTRADA NO DESTINO
        await addStock({
            productId: destinationProduct.id,
            quantity: destinationQuantity,
            establishmentId: toEstablishmentId,
            reason: "TRANSFER",
            reference: `Transferência de ${fromEstablishmentId}`
        }, tx);

        return tx.stockTransfer.update({
            where: { id: transferId },
            data: {
                destinationProductId: destinationProduct.id,
                ...(transfer.destinationQuantity == null
                    ? conversionData(calculatedConversion)
                    : {})
            }
        });
    }, { maxWait: 15000, timeout: 60000 });
};

/**
 * 🔐 REJEITAR TRANSFERÊNCIA
 */
const rejectTransfer = async (transferId, userId, establishmentId) => {
    const updated = await prisma.stockTransfer.updateMany({
        where: {
            id: transferId,
            toEstablishmentId: establishmentId,
            status: "PENDING"
        },
        data: {
            status: "REJECTED",
            approvedBy: userId,
            approvedAt: new Date()
        }
    });

    if (updated.count !== 1) {
        throw new Error("Transferência não encontrada, sem permissão ou já processada.");
    }

    return prisma.stockTransfer.findUnique({ where: { id: transferId } });
};

/**
 * 📊 RESUMO DE TRANSFERÊNCIAS POR PERÍODO
 * Retorna totais de quantidade e valor estimado, agrupados por estabelecimento e produto
 */
const getTransferSummary = async (establishmentId, { startDate, endDate }) => {
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
    }

    const createdAtFilter = Object.keys(dateFilter).length > 0 ? dateFilter : undefined;

    // Transferências ENVIADAS (aprovadas) no período
    const sent = await prisma.stockTransfer.findMany({
        where: {
            fromEstablishmentId: establishmentId,
            status: "APPROVED",
            ...(createdAtFilter ? { approvedAt: createdAtFilter } : {})
        },
        include: {
            product: {
                select: { id: true, name: true, unit: true, unitPrice: true, currentCost: true, packQuantity: true }
            },
            toEstablishment: {
                select: { id: true, name: true }
            }
        },
        orderBy: { approvedAt: "desc" }
    });

    // Transferências RECEBIDAS (aprovadas) no período
    const received = await prisma.stockTransfer.findMany({
        where: {
            toEstablishmentId: establishmentId,
            status: "APPROVED",
            ...(createdAtFilter ? { approvedAt: createdAtFilter } : {})
        },
        include: {
            product: {
                select: { id: true, name: true, unit: true, unitPrice: true, currentCost: true, packQuantity: true }
            },
            destinationProduct: {
                select: { id: true, name: true, unit: true, unitPrice: true, currentCost: true, packQuantity: true }
            },
            fromEstablishment: {
                select: { id: true, name: true }
            }
        },
        orderBy: { approvedAt: "desc" }
    });

    // Calcula custo unitário base de um produto
    const getUnitCost = (product) => {
        if (product.currentCost && Number(product.currentCost) > 0) {
            return Number(product.currentCost);
        }
        if (product.unitPrice && Number(product.unitPrice) > 0) {
            const pack = product.packQuantity || 1;
            return Number(product.unitPrice) / pack;
        }
        return 0;
    };

    // Agrupa ENVIADAS por estabelecimento destino
    const sentByEstablishment = {};
    let totalSentQty = 0;
    let totalSentValue = 0;

    for (const t of sent) {
        const estName = t.toEstablishment?.name || "Desconhecido";
        const estId = t.toEstablishment?.id || "unknown";
        const unitCost = getUnitCost(t.product);
        const qty = Number(t.quantity);
        const value = unitCost * qty;

        totalSentQty += qty;
        totalSentValue += value;

        if (!sentByEstablishment[estId]) {
            sentByEstablishment[estId] = {
                establishmentId: estId,
                establishmentName: estName,
                totalQuantity: 0,
                totalValue: 0,
                products: []
            };
        }

        sentByEstablishment[estId].totalQuantity += qty;
        sentByEstablishment[estId].totalValue += value;
        sentByEstablishment[estId].products.push({
            productId: t.product.id,
            productName: t.product.name,
            unit: t.product.unit,
            quantity: qty,
            unitCost,
            totalCost: value,
            date: t.approvedAt || t.createdAt
        });
    }

    // Agrupa RECEBIDAS por estabelecimento origem
    const receivedByEstablishment = {};
    let totalReceivedQty = 0;
    let totalReceivedValue = 0;

    for (const t of received) {
        const estName = t.fromEstablishment?.name || "Desconhecido";
        const estId = t.fromEstablishment?.id || "unknown";
        const receivedProduct = t.destinationProduct || t.product;
        const unitCost = getUnitCost(receivedProduct);
        const qty = t.destinationQuantity == null ? Number(t.quantity) : Number(t.destinationQuantity);
        const value = unitCost * qty;

        totalReceivedQty += qty;
        totalReceivedValue += value;

        if (!receivedByEstablishment[estId]) {
            receivedByEstablishment[estId] = {
                establishmentId: estId,
                establishmentName: estName,
                totalQuantity: 0,
                totalValue: 0,
                products: []
            };
        }

        receivedByEstablishment[estId].totalQuantity += qty;
        receivedByEstablishment[estId].totalValue += value;
        receivedByEstablishment[estId].products.push({
            productId: receivedProduct.id,
            productName: receivedProduct.name,
            unit: t.destinationUnit || receivedProduct.unit,
            quantity: qty,
            unitCost,
            totalCost: value,
            date: t.approvedAt || t.createdAt
        });
    }

    return {
        sent: {
            totalQuantity: totalSentQty,
            totalValue: totalSentValue,
            transferCount: sent.length,
            byEstablishment: Object.values(sentByEstablishment)
        },
        received: {
            totalQuantity: totalReceivedQty,
            totalValue: totalReceivedValue,
            transferCount: received.length,
            byEstablishment: Object.values(receivedByEstablishment)
        }
    };
};

/**
 * 📦 BUSCAR PRODUTOS DO DESTINO
 * Retorna todos os produtos ativos do estabelecimento de destino para permitir o mapeamento.
 */
const getDestinationProducts = async (establishmentId) => {
    return prisma.product.findMany({
        where: {
            establishmentId,
            isActive: true
        },
        select: {
            id: true,
            name: true,
            unit: true,
            purchaseUnit: true,
            packQuantity: true,
            organizationProductId: true,
            quantity: true
        },
        orderBy: { name: 'asc' }
    });
};

module.exports = {
    createTransfer,
    createBulkTransfers,
    approveTransfer,
    rejectTransfer,
    getSentTransfers,
    getReceivedTransfers,
    getTransferSummary,
    getDestinationProducts
};

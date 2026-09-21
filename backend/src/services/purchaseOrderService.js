const purchaseOrderRepo = require('../repositories/purchaseOrderRepository');
const auditLogRepo = require('../repositories/auditLogRepository');
const AppError = require('../utils/AppError');
const prisma = require('../utils/prisma');
const PDFDocument = require('pdfkit');
const stockMovementService = require('./stockMovementService');
const commercialAgreementService = require('./commercialAgreementService');
const { validateAutomaticOrderClassifications } = require('../utils/purchaseOrderRules');

/**
 * 🔐 LISTAR ORDENS
 */
const getAllOrders = (establishmentId) =>
    purchaseOrderRepo.findAll(establishmentId);

/**
 * 🔐 BUSCAR POR ID
 */
const getOrderById = async (id, establishmentId) => {
    const order = await purchaseOrderRepo.findById(id, establishmentId);

    if (!order) {
        throw new AppError('Ordem de compra não encontrada ou acesso negado.', 404);
    }

    return order;
};

/**
 * 🔐 CRIAR ORDEM
 */
const createOrder = async (data) => {
    const { establishmentId } = data;

    if (!establishmentId) {
        throw new AppError('EstablishmentId não informado.', 400);
    }

    const productIds = [...new Set((data.items || []).map(item => item.productId).filter(Boolean))];
    const products = await prisma.product.findMany({
        where: { id: { in: productIds }, establishmentId },
        select: { id: true, purchaseClassification: true }
    });

    if (products.length !== productIds.length) {
        throw new AppError('Um ou mais produtos não pertencem a este estabelecimento.', 400);
    }

    validateAutomaticOrderClassifications(products, data.generationMode);

    const order = await purchaseOrderRepo.create(data);

    await auditLogRepo.create({
        actionType: 'CREATE',
        entityType: 'PURCHASE_ORDER',
        entityId: order.id,
        description: `Ordem de compra #${order.id.slice(-6).toUpperCase()} criada com ${order.items.length} item(s).`,
        establishmentId
    });

    return order;
};

/**
 * 🔐 CONCLUIR ORDEM (RECEBIMENTO)
 * 🛡️ Blindado com establishmentId em todas as queries
 */
const completeOrder = async (orderId, establishmentId, incomingItems = [], invoiceData = {}, userId) => {

    const order = await getOrderById(orderId, establishmentId);

    if (order.status === 'completed') {
        throw new AppError('Esta ordem já foi concluída.', 400);
    }

    if (!Array.isArray(incomingItems)) throw new AppError('Itens de recebimento inválidos.', 400);
    const seen = new Set();
    for (const item of incomingItems) {
        if (!item || (item.id && !order.items.some(existing => existing.id === item.id))) {
            throw new AppError('Item não pertence a esta ordem.', 400);
        }
        const key = item.id || item.productId;
        if (!key || seen.has(key)) throw new AppError('Item inválido ou repetido.', 400);
        seen.add(key);
        for (const field of ['adjustedQuantity', 'unitPrice']) {
            if ((!item.id || item[field] !== undefined) &&
                (typeof item[field] !== 'number' || !Number.isFinite(item[field]) || item[field] < 0)) {
                throw new AppError('Quantidade e preço devem ser números não negativos.', 400);
            }
        }
    }

    const supplierIds = [...new Set(order.items.map(item => item.supplierId).filter(Boolean))];
    if (supplierIds.length !== 1) throw new AppError('A nota deve corresponder a um único fornecedor.', 400);
    if (!String(invoiceData.invoiceNumber || '').trim() || !invoiceData.issuedAt) {
        throw new AppError('Informe o número e a data de emissão da nota fiscal.', 400);
    }

    const ref = `Ordem de Compra #${orderId.slice(-6).toUpperCase()}`;

    const completedOrder = await prisma.$transaction(async (tx) => {
        const claimed = await tx.purchaseOrder.updateMany({
            where: {
                id: orderId,
                establishmentId,
                status: 'pending'
            },
            data: { status: 'processing' }
        });

        if (claimed.count !== 1) {
            throw new AppError('Esta ordem já foi concluída ou está sendo processada.', 409);
        }

        const receiptItems = [...order.items];
        for (const incoming of incomingItems.filter(item => !item.id)) {
            const product = await tx.product.findFirst({ where: { id: incoming.productId, establishmentId } });
            if (!product) throw new AppError('Produto extra não pertence a este estabelecimento.', 400);
            const supplier = await tx.supplier.findFirst({ where: { id: supplierIds[0], establishmentId } });
            if (!supplier) throw new AppError('Fornecedor não pertence a este estabelecimento.', 400);
            if (receiptItems.some(item => item.productId === incoming.productId)) {
                throw new AppError('Produto já incluído. Ajuste a quantidade recebida.', 400);
            }
            receiptItems.push(await tx.purchaseOrderItem.create({ data: {
                purchaseOrderId: orderId,
                productId: product.id,
                productName: product.name,
                supplierId: supplierIds[0],
                purchaseClassification: product.purchaseClassification,
                adjustedQuantity: incoming.adjustedQuantity,
                unitPrice: incoming.unitPrice
            } }));
        }
        const invoiceItems = [];
        for (const dbItem of receiptItems) {

            if (!dbItem.productId) continue;

            const product = await tx.product.findFirst({
                where: { id: dbItem.productId, establishmentId }
            });

            if (!product) continue;

            const incoming = incomingItems.find(i => i.id === dbItem.id) || {};
            const quantity = Number(incoming.adjustedQuantity !== undefined ? incoming.adjustedQuantity : dbItem.adjustedQuantity);
            const unitPrice = Number(incoming.unitPrice !== undefined ? incoming.unitPrice : dbItem.unitPrice);

            const packQuantity = product.packQuantity || 1;
            const finalQuantity = quantity * packQuantity;
            const finalUnitCost = unitPrice / packQuantity;
            if (quantity > 0) invoiceItems.push({ productId: dbItem.productId, quantity, unitPrice });

            // 🔹 Atualiza o item (contexto da ordem já validado)
            await tx.purchaseOrderItem.update({
                where: { id: dbItem.id },
                data: {
                    adjustedQuantity: quantity,
                    unitPrice: unitPrice,
                    receivedStockQuantity: finalQuantity,
                    receivedUnitCost: finalUnitCost,
                    receivedUnit: product.unit
                }
            });

            if (quantity > 0) {
                // 🔥 ENTRADA PADRONIZADA NO ESTOQUE (VALIDADO)
                await stockMovementService.addStock({
                    productId: dbItem.productId,
                    quantity: finalQuantity,
                    establishmentId,
                    reason: "PURCHASE",
                    reference: ref,
                    supplierId: dbItem.supplierId,
                    unitCost: finalUnitCost
                }, tx);

                // 🔹 ATUALIZA CUSTO DO PRODUTO
                await tx.product.updateMany({
                    where: { id: dbItem.productId, establishmentId },
                    data: {
                        // unitPrice representa o valor da embalagem de compra;
                        // currentCost representa o custo por unidade-base.
                        unitPrice,
                        currentCost: finalUnitCost
                    }
                });

                // 🔹 HISTÓRICO DO FORNECEDOR (Vínculo Produto-Supplier)
                if (dbItem.supplierId) {
                    // Upsert garantindo que o produto é do tenant
                    await tx.productSupplier.upsert({
                        where: {
                            productId_supplierId: {
                                productId: dbItem.productId,
                                supplierId: dbItem.supplierId
                            }
                        },
                        update: { price: unitPrice },
                        create: {
                            productId: dbItem.productId,
                            supplierId: dbItem.supplierId,
                            price: unitPrice
                        }
                    });

                    // Cada recebimento precisa de um snapshot, inclusive quando
                    // o preço não mudou, para preservar a série histórica real.
                    await tx.supplierPriceHistory.create({
                        data: {
                            productId: dbItem.productId,
                            supplierId: dbItem.supplierId,
                            price: unitPrice,
                            purchaseOrderId: orderId
                        }
                    });
                }
            }
        }

        const invoice = await tx.purchaseInvoice.create({
            data: {
                establishmentId,
                supplierId: supplierIds[0],
                purchaseOrderId: orderId,
                invoiceNumber: String(invoiceData.invoiceNumber).trim(),
                invoiceSeries: String(invoiceData.invoiceSeries || '').trim(),
                issuedAt: new Date(invoiceData.issuedAt),
                netPaidAmount: invoiceData.netPaidAmount === undefined || invoiceData.netPaidAmount === null
                    ? null : Number(invoiceData.netPaidAmount),
                createdByUserId: userId,
                items: { create: invoiceItems }
            }
        });
        await commercialAgreementService.processInvoiceAccruals(tx, { invoice, invoiceItems });

        const updated = await tx.purchaseOrder.updateMany({
            where: { id: orderId, establishmentId, status: 'processing' },
            data: {
                status: 'completed',
                completedAt: new Date()
            }
        });

        await tx.auditLog.create({
            data: {
                actionType: 'COMPLETE',
                entityType: 'PURCHASE_ORDER',
                entityId: orderId,
                description: `Ordem ${ref} concluída. ${invoiceItems.length} produto(s) reabastecido(s).`,
                establishmentId: establishmentId
            }
        });

        return updated;
    }, {
        maxWait: 5000,
        timeout: 20000
    });

    return completedOrder;
};

/**
 * 🔐 EXCLUIR ORDEM
 */
const deleteOrder = async (id, establishmentId) => {
    const order = await getOrderById(id, establishmentId);
    if (order.status !== 'pending') {
        throw new AppError('Somente ordens pendentes podem ser excluídas. Registre uma devolução para produtos já recebidos.', 409);
    }
    await purchaseOrderRepo.remove(id, establishmentId);

    await auditLogRepo.create({
        actionType: 'DELETE',
        entityType: 'PURCHASE_ORDER',
        entityId: id,
        description: `Ordem de compra #${id.slice(-6).toUpperCase()} excluída.`,
        establishmentId
    });
};

/**
 * 🔐 CRIAR ORDENS AGRUPADAS
 */
const createOrdersGroupedBySupplier = async (data) => {

    const { items, establishmentId, user_id } = data;

    const ordersBySupplier = {};

    for (const item of items) {
        const supplierId = item.supplierId;
        if (!supplierId) continue;
        if (!ordersBySupplier[supplierId]) {
            ordersBySupplier[supplierId] = [];
        }
        ordersBySupplier[supplierId].push(item);
    }

    const createdOrders = [];

    for (const supplierId in ordersBySupplier) {
        const orderData = {
            establishmentId,
            user_id,
            items: ordersBySupplier[supplierId].map(item => ({
                productId: item.productId,
                productName: item.productName,
                adjustedQuantity: item.adjustedQuantity,
                unitPrice: item.unitPrice,
                supplierId
            }))
        };

        const order = await purchaseOrderRepo.create(orderData);
        createdOrders.push(order);
    }

    return createdOrders;
};

/**
 * 🔐 GERAR PDF
 */
const generatePdf = async (orderId, establishmentId) => {

    const order = await prisma.purchaseOrder.findFirst({
        where: { id: orderId, establishmentId },
        include: { items: true }
    });

    if (!order) {
        throw new AppError('Ordem não encontrada ou acesso negado.', 404);
    }

    const establishment = await prisma.establishments.findUnique({
        where: { id: establishmentId }
    });

    if (!establishment) {
        throw new AppError('Estabelecimento não encontrado.', 404);
    }

    const supplierId = order.items?.[0]?.supplierId;
    const supplier = supplierId
        ? await prisma.supplier.findFirst({ where: { id: supplierId, establishmentId } })
        : null;

    const doc = new PDFDocument({ margin: 40 });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));

    doc.fontSize(22).fillColor("#111827").text(establishment.name, { align: "center" });
    doc.moveDown(0.5);

    const enderecoCompleto = [establishment.endereco, establishment.cidade, establishment.estado].filter(Boolean).join(" - ");

    doc.fontSize(10).fillColor("#6b7280").text(`CNPJ: ${establishment.cnpj || "-"}`).text(`Telefone: ${establishment.telefone || "-"}`).text(`Endereço: ${enderecoCompleto || "-"}`);
    doc.moveDown(2);

    doc.fontSize(14).text(`Pedido #${order.id.slice(-6).toUpperCase()}`);
    doc.fontSize(10).text(`Data: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    doc.fontSize(12).text(`Fornecedor: ${supplier?.name || "-"}`);
    doc.moveDown(1.5);

    const startY = doc.y;
    doc.fontSize(10).text("Produto", 40, startY).text("Qtd", 250, startY).text("Preço", 320, startY).text("Total", 420, startY);
    doc.moveDown();

    doc.strokeColor("#e5e7eb").moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    let totalGeral = 0;
    order.items.forEach(item => {
        const total = item.adjustedQuantity * item.unitPrice;
        totalGeral += total;
        const y = doc.y;
        doc.fontSize(10).text(item.productName, 40, y).text(item.adjustedQuantity.toString(), 250, y).text(`R$ ${item.unitPrice.toFixed(2)}`, 320, y).text(`R$ ${total.toFixed(2)}`, 420, y);
        doc.moveDown();
    });

    doc.moveDown();
    doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(14).text(`TOTAL: R$ ${totalGeral.toFixed(2)}`, { align: "right" });
    doc.moveDown(2);
    doc.fontSize(10).text("Gerado automaticamente pelo sistema", { align: "center" });

    doc.end();

    return await new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", reject);
    });
};

module.exports = {
    getAllOrders,
    getOrderById,
    createOrder,
    createOrdersGroupedBySupplier,
    completeOrder,
    deleteOrder,
    generatePdf
};

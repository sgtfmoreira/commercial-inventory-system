import DataTable, { TableSurface } from '../components/Table';
import React, { useState, useMemo, useEffect } from "react";
import styled from "styled-components";
import {
    MdCheckCircle,
    MdDelete,
    MdShoppingCart,
    MdAdd,
    MdRemoveCircleOutline
} from "react-icons/md";

import Modal from '../components/Modal';
import { useApp, ACTIONS } from "../context/AppContext";
import { formatCurrency } from "../utils/formatCurrency";

import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import { Input, CurrencyInput, SelectControl } from "../components/FormFields";
import Select from "../components/Select";
import toast from "react-hot-toast";

import api from "../services/api";
import { Page, PageHeader, PageHeading, PageTitle, PageSubtitle, SectionTitle } from '../components/PageLayout';
import { Tabs, Tab } from '../components/Tabs';

/* -------------------------------------------------------------------------- */
/*                                Styled UI                                   */
/* -------------------------------------------------------------------------- */

const Table = styled(DataTable)`
  width: 100%;
  border-collapse: collapse;
  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px;
    background: transparent;
  }
`;

const Th = styled.th`
  text-align: left;
  padding: 12px 16px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${({ theme }) => theme.colors.bgHover};
  @media (max-width: 768px) {
    display: none;
  }
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  @media (max-width: 768px) {
    display: block;
    padding: 8px 12px;
  }
`;

const Tr = styled.tr`
  transition: ${({ theme }) => theme.transition};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  @media (max-width: 768px) {
    display: block;
    margin-bottom: 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radii.md};
    overflow: hidden;
  }
`;

const StatusBadge = styled.span`
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.warningLight};
  color: ${({ theme }) => theme.colors.warning};
  @media (max-width: 768px) {
    margin-left: 0;
    margin-top: 4px;
  }
`;

/* -------------------------------------------------------------------------- */
/*                          Manual Order Styled UI                            */
/* -------------------------------------------------------------------------- */

const ManualItemCard = styled.div`
  background: ${({ theme }) => theme.colors.bgHover};
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 16px;
  margin-bottom: 12px;
  position: relative;
`;

const ManualItemHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const ManualItemNumber = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.primary};
  background: ${({ theme }) => theme.colors.primaryGlow};
  padding: 2px 10px;
  border-radius: 999px;
`;

const ManualGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  @media (max-width: 540px) {
    grid-template-columns: 1fr;
  }
`;

const ManualSubtotal = styled.div`
  text-align: right;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 10px;

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }
`;

const ManualTotalBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 2px solid ${({ theme }) => theme.colors.border};
  margin-top: 16px;
  padding-top: 16px;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const EMPTY_ITEM = () => ({
    _key: Math.random().toString(36).slice(2),
    productId: "",
    supplierId: "",
    quantity: "",
    unitPrice: ""
});

const formatInvoiceDate = (value) => {
    if (!value) return "—";
    const [year, month, day] = String(value).slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : "—";
};

/* -------------------------------------------------------------------------- */
/*                            ManualOrderModal                                 */
/* -------------------------------------------------------------------------- */

const ManualOrderModal = ({ isOpen, onClose, products, suppliers, onSuccess }) => {

    const [items, setItems] = useState([EMPTY_ITEM()]);
    const [loading, setLoading] = useState(false);

    // Reset ao abrir
    useEffect(() => {
        if (isOpen) setItems([EMPTY_ITEM()]);
    }, [isOpen]);

    const updateItem = (key, field, value) => {
        setItems(prev => prev.map(item => {
            if (item._key !== key) return item;
            // Ao trocar produto, reseta fornecedor e tenta preencher preço
            if (field === "productId") {
                const product = products.find(p => p.id === value);
                const firstSupplier = product?.productSuppliers?.[0];
                return {
                    ...item,
                    productId: value,
                    supplierId: firstSupplier?.supplier?.id || "",
                    unitPrice: firstSupplier?.price ? String(firstSupplier.price) : item.unitPrice
                };
            }
            // Ao trocar fornecedor, tenta preencher preço
            if (field === "supplierId") {
                const product = products.find(p => p.id === item.productId);
                const ps = product?.productSuppliers?.find(ps => ps.supplier?.id === value);
                return {
                    ...item,
                    supplierId: value,
                    unitPrice: ps?.price ? String(ps.price) : item.unitPrice
                };
            }
            return { ...item, [field]: value };
        }));
    };

    const addItem = () => setItems(prev => [...prev, EMPTY_ITEM()]);

    const removeItem = (key) => {
        if (items.length === 1) return;
        setItems(prev => prev.filter(i => i._key !== key));
    };

    const grandTotal = items.reduce((acc, item) => {
        return acc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);

    const handleSubmit = async () => {
        // Validação
        for (const item of items) {
            if (!item.productId) {
                toast.error("Selecione o produto em todos os itens.");
                return;
            }
            if (!item.quantity || Number(item.quantity) <= 0) {
                toast.error("Informe uma quantidade válida em todos os itens.");
                return;
            }
            if (!item.unitPrice || Number(item.unitPrice) <= 0) {
                toast.error("Informe o preço unitário em todos os itens.");
                return;
            }
        }

        setLoading(true);
        try {
            const payload = {
                items: items.map(item => {
                    const product = products.find(p => p.id === item.productId);
                    return {
                        productId: item.productId,
                        productName: product?.name || "Produto",
                        supplierId: item.supplierId || undefined,
                        adjustedQuantity: Number(item.quantity),
                        unitPrice: Number(item.unitPrice)
                    };
                })
            };

            await api.post("/purchase-orders", payload);
            toast.success("Ordem de compra criada com sucesso!");
            await onSuccess(); // 🔥 aguarda o fetchOrders atualizar o state antes de fechar
            onClose();
        } catch (err) {
            console.error("Erro ao criar ordem manual:", err);
            toast.error(err?.response?.data?.error || "Erro ao criar ordem de compra.");
        } finally {
            setLoading(false);
        }
    };

    const purchasableProducts = products.filter(p => p.type !== "ASSET");

    const productOptions = [
        { value: "", label: "Selecione um produto..." },
        ...purchasableProducts.map(p => ({ value: p.id, label: p.name }))
    ];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Nova Ordem de Compra"
        >
            {items.map((item, idx) => {
                const selectedProduct = products.find(p => p.id === item.productId);
                // 🐛 Fix: [] é truthy em JS, então || não funciona com arrays vazios.
                // Usamos .length > 0 para garantir o fallback correto.
                const linkedSuppliers = selectedProduct?.productSuppliers?.length > 0
                    ? selectedProduct.productSuppliers.map(ps => ({
                        value: ps.supplier.id,
                        label: ps.supplier.name
                    }))
                    : suppliers.map(s => ({ value: s.id, label: s.name }));

                const supplierOptions = [
                    { value: "", label: "Selecione um fornecedor..." },
                    ...linkedSuppliers
                ];

                const subtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

                return (
                    <ManualItemCard key={item._key}>
                        <ManualItemHeader>
                            <ManualItemNumber>Item {idx + 1}</ManualItemNumber>
                            {items.length > 1 && (
                                <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => removeItem(item._key)}
                                    style={{ padding: "4px 8px" }}
                                >
                                    <MdRemoveCircleOutline size={16} />
                                </Button>
                            )}
                        </ManualItemHeader>

                        <ManualGrid>
                            <Select
                                label="Produto"
                                value={item.productId}
                                onChange={(val) => updateItem(item._key, "productId", val)}
                                options={productOptions}
                            />
                            <Select
                                label="Fornecedor"
                                value={item.supplierId}
                                onChange={(val) => updateItem(item._key, "supplierId", val)}
                                options={supplierOptions}
                            />
                            <Input
                                label="Quantidade"
                                type="number"
                                inputMode="decimal"
                                min="0.01"
                                step="0.01"
                                placeholder="Ex: 5"
                                value={item.quantity}
                                onChange={(e) => updateItem(item._key, "quantity", e.target.value)}
                            />
                            <CurrencyInput
                                label="Preço Unitário (R$)"
                                placeholder="Ex: R$ 45,00"
                                value={item.unitPrice}
                                onChange={(val) => updateItem(item._key, "unitPrice", val)}
                            />
                        </ManualGrid>

                        {subtotal > 0 && (
                            <ManualSubtotal>
                                Subtotal: <strong>{formatCurrency(subtotal)}</strong>
                            </ManualSubtotal>
                        )}
                    </ManualItemCard>
                );
            })}

            <Button
                variant="ghost"
                onClick={addItem}
                style={{ width: "100%", marginBottom: 8, border: "1.5px dashed", borderRadius: 10 }}
            >
                <MdAdd size={16} style={{ marginRight: 6 }} />
                Adicionar outro produto
            </Button>

            {grandTotal > 0 && (
                <ManualTotalBar>
                    <span>Total do Pedido</span>
                    <span>{formatCurrency(grandTotal)}</span>
                </ManualTotalBar>
            )}

            <Button
                variant="primary"
                fullWidth
                onClick={handleSubmit}
                disabled={loading}
                style={{ marginTop: 16, minHeight: 48 }}
            >
                {loading ? "Criando..." : "Criar Ordem de Compra"}
            </Button>
        </Modal>
    );
};

/* -------------------------------------------------------------------------- */
/*                                Component                                   */
/* -------------------------------------------------------------------------- */

const PurchaseOrders = () => {

    const { state, dispatch, getSupplierById, fetchAllData } = useApp();

    const [suggestions, setSuggestions] = useState([]);
    const [receivedQty, setReceivedQty] = useState({});
    const [receivedPrice, setReceivedPrice] = useState({});
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [tab, setTab] = useState("PENDING");
    const [classificationFilter, setClassificationFilter] = useState('');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showManualModal, setShowManualModal] = useState(false);
    const [invoiceData, setInvoiceData] = useState({
        invoiceNumber: '',
        invoiceSeries: '',
        issuedAt: new Date().toISOString().split('T')[0],
        netPaidAmount: ''
    });

    /* -------------------------------------------------------------------------- */
    /*                                   EFFECT                                   */
    /* -------------------------------------------------------------------------- */

    useEffect(() => {

        const fetchSuggestions = async () => {

            try {

                const res = await api.get("/purchase-suggestions");

                console.log("SUGGESTIONS RAW:", res);
                console.log("SUGGESTIONS PARSED:", res.items);

                setSuggestions(res.items || []);

            } catch (err) {

                console.error("Erro suggestions:", err);

            }

        };

        fetchSuggestions();

    }, []);

    const fetchOrders = async () => {

        try {

            const res = await api.get("/purchase-orders");

            const orders = res || [];

            dispatch({
                type: ACTIONS.SET_PURCHASE_ORDERS,
                payload: orders
            });

        } catch (err) {

            console.error("Erro ao buscar ordens:", err);

        }

    };

    useEffect(() => {
        fetchOrders();
    }, []);

    /* -------------------------------------------------------------------------- */
    /*                                   MEMOS                                    */
    /* -------------------------------------------------------------------------- */

    const lowStockProducts = useMemo(() => {

        return state.products.filter(
            p => Number(p.quantity) < Number(p.minQuantity)
        );

    }, [state.products]);

    const totalEstimated = useMemo(() => {

        return lowStockProducts.reduce((sum, p) => {

            const suggestion = suggestions.find(
                s => s.productId === p.id
            );

            const price = suggestion?.bestPrice || Number(p.unitPrice);

            return sum + price;

        }, 0);

    }, [lowStockProducts, suggestions]);

    const pendingOrders = useMemo(() => {

        console.log("STATE PURCHASE ORDERS:", state.purchaseOrders);

        return state.purchaseOrders.filter(
            o => o.status === "pending"
        );

    }, [state.purchaseOrders]);
    const filteredOrders = state.purchaseOrders.filter(order => {
        if (order.status.toUpperCase() !== tab) return false;
        if (classificationFilter && !order.items?.some(item =>
            (item.purchaseClassification || 'CMV_BEVERAGES') === classificationFilter
        )) return false;
        if (supplierFilter && !order.items?.some(item => item.supplierId === supplierFilter)) return false;

        const orderDate = new Date(order.createdAt);
        if (dateFrom && orderDate < new Date(`${dateFrom}T00:00:00`)) return false;
        if (dateTo && orderDate > new Date(`${dateTo}T23:59:59`)) return false;
        return true;
    });

    /* -------------------------------------------------------------------------- */
    /*                                  HANDLERS                                  */
    /* -------------------------------------------------------------------------- */

    const handleCompleteOrder = async () => {
        try {
            // 🛡️ Mapeia os itens garantindo a prioridade dos valores editados (como o preço de 55)
            const items = selectedOrder.items.map(item => ({
                id: item.isExtra ? undefined : item.id,
                productId: item.productId,

                // Se houve alteração manual na quantidade, usa ela. Senão, mantém a original.
                adjustedQuantity: receivedQty[item.id] !== undefined
                    ? Number(receivedQty[item.id])
                    : Number(item.adjustedQuantity),

                // 🔥 Se você digitou 55 no modal, o receivedPrice[id] existirá e será convertido aqui
                unitPrice: receivedPrice[item.id] !== undefined
                    ? Number(receivedPrice[item.id])
                    : Number(item.unitPrice)
            }));

            console.log("🚀 Enviando para finalização com valores atualizados:", items);

            // Chamada à API para completar a ordem e atualizar o custo e estoque do produto
            await api.put(`/purchase-orders/${selectedOrder.id}/complete`, {
                items,
                invoice: {
                    ...invoiceData,
                    netPaidAmount: invoiceData.netPaidAmount === '' ? undefined : Number(invoiceData.netPaidAmount)
                }
            });

            toast.success("Recebimento concluído e estoque atualizado!");

            // 🔄 Atualiza a lista de ordens e fecha o modal
            await fetchAllData(false);
            setSelectedOrder(null);

            // ✨ Limpa os estados temporários para não "sujar" o próximo recebimento
            setReceivedQty({});
            setReceivedPrice({});
            setInvoiceData({
                invoiceNumber: '',
                invoiceSeries: '',
                issuedAt: new Date().toISOString().split('T')[0],
                netPaidAmount: ''
            });

        } catch (err) {
            console.error("❌ Erro ao finalizar ordem:", err);
            toast.error(err.response?.data?.error || "Erro ao finalizar pedido");
        }
    };

    const handleDeleteOrder = async (order) => {
        const confirmed = window.confirm(
            `⚠️ Tem certeza que deseja excluir o pedido #${order.id.slice(-4)}?\n\nEsta ação não pode ser desfeita.`
        );

        if (!confirmed) return;

        try {
            await api.delete(`/purchase-orders/${order.id}`);
            toast.success(`Pedido #${order.id.slice(-4)} excluído com sucesso.`);
            await fetchOrders();
        } catch (err) {
            console.error("Erro ao excluir ordem:", err);
            toast.error(err?.message || "Erro ao excluir pedido.");
        }
    };

    const handleDownloadPdf = async () => {
        try {
            const response = await api.get(`/purchase-orders/${selectedOrder.id}/pdf`, {
                responseType: 'blob'
            });

            const blob = response; // Já é o blob se o unwrap for inteligente ou o Axios retornar o data

            const url = window.URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = `pedido-${selectedOrder.id}.pdf`;

            document.body.appendChild(link);
            link.click();

            link.remove();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error("Erro ao baixar PDF:", err);
            alert("Erro ao baixar PDF");
        }
    };
    const handleSendWhatsApp = (order) => {

        const supplierId = order.items?.[0]?.supplierId;

        const supplier = state.suppliers.find(
            s => s.id === supplierId
        );

        if (!supplier?.phone) {
            alert("Fornecedor sem telefone cadastrado");
            return;
        }

        const total = order.items.reduce(
            (acc, item) =>
                acc + item.adjustedQuantity * item.unitPrice,
            0
        );

        const message = `
Pedido #${order.id.slice(-6)}

Fornecedor: ${supplier.name}
Total: R$ ${total.toFixed(2)}

Segue o pedido em PDF.
    `;

        window.open(
            `https://wa.me/55${supplier.phone}?text=${encodeURIComponent(message)}`,
            "_blank"
        );
    };
    /* -------------------------------------------------------------------------- */
    /*                                   RENDER                                   */
    /* -------------------------------------------------------------------------- */

    return (
        <Page>
            <ManualOrderModal
                isOpen={showManualModal}
                onClose={() => setShowManualModal(false)}
                products={state.products}
                suppliers={state.suppliers}
                onSuccess={fetchOrders}
            />

            <PageHeader>
                <PageHeading>
                    <PageTitle>Ordens de Compra</PageTitle>

                    <PageSubtitle>
                        Gerencie e acompanhe suas ordens de reposição
                    </PageSubtitle>
                </PageHeading>

                <Button
                    variant="primary"
                    onClick={() => setShowManualModal(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                    <MdAdd size={18} />
                    Nova Ordem
                </Button>
            </PageHeader>
            <Tabs>
                <Tab active={tab === "PENDING"} onClick={() => setTab("PENDING")}>
                    Pendentes
                </Tab>
                <Tab active={tab === "COMPLETED"} onClick={() => setTab("COMPLETED")}>
                    Finalizadas
                </Tab>
            </Tabs>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'end' }}>
                <div style={{ minWidth: 190 }}>
                    <Select
                        value={classificationFilter}
                        onChange={setClassificationFilter}
                        options={[
                            { value: '', label: 'Todas as classificações' },
                            { value: 'CMV_BEVERAGES', label: 'Bebidas / CMV' },
                            { value: 'CLEANING', label: 'Limpeza' },
                            { value: 'DISPOSABLES', label: 'Descartáveis' },
                            { value: 'OPERATING', label: 'Outros operacionais' }
                        ]}
                    />
                </div>
                <div style={{ minWidth: 190 }}>
                    <Select
                        value={supplierFilter}
                        onChange={setSupplierFilter}
                        options={[
                            { value: '', label: 'Todos os fornecedores' },
                            ...state.suppliers.map(supplier => ({ value: supplier.id, label: supplier.name }))
                        ]}
                    />
                </div>
                <Input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
                <Input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
            </div>
            {filteredOrders.length > 0 && (

                <>

                    <SectionTitle>{tab === "PENDING" ? "Ordens Pendentes" : "Ordens Finalizadas"}</SectionTitle>

                    <TableSurface>
                            <Table>

                                <thead>

                                    <tr>

                                        <Th>Pedido</Th>
                                        <Th>Data</Th>
                                        <Th>Fornecedor</Th>
                                        <Th>Itens</Th>
                                        <Th>{tab === "COMPLETED" ? "Valor da nota" : "Total estimado"}</Th>
                                        {tab === "COMPLETED" && <Th>Nota / Série</Th>}
                                        {tab === "COMPLETED" && <Th>Data da nota</Th>}
                                        <Th>Status</Th>
                                        <Th>Ações</Th>

                                    </tr>

                                </thead>

                                <tbody>

                                    {filteredOrders.map(order => {

                                        const total = order.items.reduce(
                                            (s, i) => s + i.adjustedQuantity * i.unitPrice,
                                            0
                                        );

                                        return (

                                            <Tr key={order.id}>

                                                <Td>#{order.id.slice(-4)}</Td>

                                                <Td>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</Td>

                                                <Td>
                                                    {(() => {
                                                        const supplierId = order.items?.[0]?.supplierId;

                                                        const supplier = state.suppliers.find(
                                                            s => s.id === supplierId
                                                        );

                                                        return supplier?.name || "Fornecedor";
                                                    })()}
                                                </Td>

                                                <Td>{order.items.length}</Td>

                                                <Td>{formatCurrency(order.invoice?.netPaidAmount ?? total)}</Td>

                                                {tab === "COMPLETED" && (
                                                    <Td>
                                                        {order.invoice?.invoiceNumber || "—"}
                                                        {order.invoice?.invoiceSeries ? ` / ${order.invoice.invoiceSeries}` : ""}
                                                    </Td>
                                                )}

                                                {tab === "COMPLETED" && (
                                                    <Td>{formatInvoiceDate(order.invoice?.issuedAt)}</Td>
                                                )}

                                                <Td>

                                                    <StatusBadge>
                                                        {order.status === "completed" ? "Finalizada" : "Pendente"}
                                                    </StatusBadge>

                                                </Td>

                                                <Td>

                                                    {order.status === "pending" && (
                                                        <Button
                                                            size="sm"
                                                            variant="success"
                                                            iconOnly
                                                            title="Receber ordem"
                                                            aria-label="Receber ordem"
                                                            onClick={() => { setReceivedQty({}); setReceivedPrice({}); setSelectedOrder(order); }}
                                                        >
                                                            <MdCheckCircle />
                                                        </Button>
                                                    )}

                                                    <Button
                                                        size="sm"
                                                        variant="danger"
                                                        iconOnly
                                                        title="Excluir ordem"
                                                        aria-label="Excluir ordem"
                                                        onClick={() => handleDeleteOrder(order)}
                                                    >
                                                        <MdDelete />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        iconOnly
                                                        title="Enviar pelo WhatsApp"
                                                        aria-label="Enviar pelo WhatsApp"
                                                        onClick={() => handleSendWhatsApp(order)}
                                                    >
                                                        📲
                                                    </Button>

                                                </Td>

                                            </Tr>

                                        )

                                    })}

                                </tbody>

                            </Table>
                    </TableSurface>

                </>

            )}

            {state.purchaseOrders.length === 0 && (

                <EmptyState
                    icon={<MdShoppingCart />}
                    title="Nenhuma ordem de compra"
                    subtitle="Quando produtos atingirem o mínimo, aparecerão aqui."
                />

            )}

            <Modal
                isOpen={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                title={`Pedido #${selectedOrder?.id.slice(-4)}`}
                style={{ maxWidth: "95%", borderRadius: 0 }}
            >
                {selectedOrder && (
                    <>
                        {/* 🔍 LOGS PARA DEBUG PRESERVADOS */}
                        {console.log("ORDER:", selectedOrder)}
                        {console.log("SUPPLIER ID:", selectedOrder?.supplierId)}
                        {console.log("SUPPLIERS:", state.suppliers)}

                        {/* 🔍 BUSCA DO FORNECEDOR */}
                        {(() => {
                            const supplierId = selectedOrder.items[0]?.supplierId;
                            const supplier = state.suppliers.find(s => s.id === supplierId);

                            return (
                                <div>
                                    {/* 🔥 HEADER COM FORNECEDOR + PDF */}
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: 20,
                                            flexWrap: "wrap",
                                            gap: "10px"
                                        }}
                                    >
                                        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                                            Fornecedor:{" "}
                                            <strong style={{ color: "var(--color-text)" }}>
                                                {supplier?.name || "Fornecedor não encontrado"}
                                            </strong>
                                        </div>

                                        <Button
                                            variant="primary"
                                            onClick={handleDownloadPdf}
                                        >
                                            Exportar PDF
                                        </Button>
                                    </div>

                                    <div style={{ marginBottom: 20, padding: 16, border: '1px solid #BFDBFE', borderRadius: 12, background: '#EFF6FF' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 12, color: '#1E3A8A' }}>Nota fiscal recebida</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                                            <Input
                                                label="Número da nota"
                                                value={invoiceData.invoiceNumber}
                                                onChange={(e) => setInvoiceData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                                            />
                                            <Input
                                                label="Série"
                                                value={invoiceData.invoiceSeries}
                                                onChange={(e) => setInvoiceData(prev => ({ ...prev, invoiceSeries: e.target.value }))}
                                            />
                                            <Input
                                                label="Data de emissão"
                                                type="date"
                                                value={invoiceData.issuedAt}
                                                onChange={(e) => setInvoiceData(prev => ({ ...prev, issuedAt: e.target.value }))}
                                            />
                                            <CurrencyInput
                                                label="Valor líquido pago"
                                                value={invoiceData.netPaidAmount}
                                                onChange={(value) => setInvoiceData(prev => ({ ...prev, netPaidAmount: value }))}
                                                placeholder="R$ 0,00"
                                            />
                                        </div>
                                        <div style={{ fontSize: 12, color: '#1E40AF', marginTop: 10 }}>
                                            Os acordos comerciais serão apurados pelos itens efetivamente recebidos nesta nota.
                                        </div>
                                    </div>

                                    {/* 🔥 LISTA DE ITENS AJUSTADA COM LABELS */}
                                    <label style={{ display: 'block', marginBottom: 16 }}>
                                        Adicionar item extra recebido
                                        <SelectControl
                                            aria-label="Adicionar item extra recebido"
                                            value=""
                                            style={{ display: 'block', width: '100%', padding: 12, marginTop: 8 }}
                                            onChange={(event) => {
                                                const product = state.products.find(p => p.id === event.target.value);
                                                if (!product) return;
                                                setSelectedOrder(prev => ({ ...prev, items: [...prev.items, {
                                                    id: `extra-${product.id}`, isExtra: true,
                                                    productId: product.id, productName: product.name,
                                                    supplierId, adjustedQuantity: 1, unitPrice: Number(product.unitPrice || 0)
                                                }] }));
                                            }}
                                        >
                                            <option value="">Selecione um produto</option>
                                            {state.products.filter(product => !selectedOrder.items.some(item => item.productId === product.id))
                                                .map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                                        </SelectControl>
                                    </label>
                                    {selectedOrder.items.map((item) => {
                                        const qty = receivedQty[item.id] ?? item.adjustedQuantity;
                                        const price = receivedPrice[item.id] ?? item.unitPrice;
                                        const total = qty * price;

                                        return (
                                            <div
                                                key={item.id}
                                                style={{
                                                    marginBottom: 16,
                                                    padding: "16px 12px",
                                                    border: "1px solid var(--color-border)",
                                                    borderRadius: 12,
                                                    background: "var(--color-background)",
                                                }}
                                            >
                                                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15, color: "var(--color-text)" }}>
                                                    {item.productName}
                                                    {item.notReceived && <span> — Não recebido</span>}
                                                </div>

                                                <Button variant="secondary" onClick={() => {
                                                    if (item.isExtra) {
                                                        setSelectedOrder(prev => ({ ...prev, items: prev.items.filter(row => row.id !== item.id) }));
                                                        setReceivedQty(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                                                        setReceivedPrice(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                                                    } else {
                                                        setReceivedQty(prev => ({ ...prev, [item.id]: item.notReceived ? item.adjustedQuantity : 0 }));
                                                        setSelectedOrder(prev => ({ ...prev, items: prev.items.map(row => row.id === item.id ? { ...row, notReceived: !row.notReceived } : row) }));
                                                    }
                                                }}>
                                                    {item.notReceived ? 'Restaurar item' : 'Remover do recebimento'}
                                                </Button>

                                                {/* Grid de Inputs Responsivo */}
                                                <div style={{
                                                    display: "flex",
                                                    gap: 12,
                                                    flexDirection: window.innerWidth < 640 ? "column" : "row"
                                                }}>

                                                    {/* Campo de Quantidade */}
                                                    <div style={{ flex: 1 }}>
                                                        <Input
                                                            label="Qtd. Recebida"
                                                            type="number"
                                                            inputMode="decimal"
                                                            // 🛡️ Mantemos como string para permitir edição fluida
                                                            value={receivedQty[item.id] ?? item.adjustedQuantity}
                                                            min="0"
                                                            disabled={item.notReceived}
                                                            onChange={(e) =>
                                                                setReceivedQty((prev) => ({
                                                                    ...prev,
                                                                    [item.id]: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="0"
                                                        />
                                                    </div>

                                                    {/* Campo de Preço */}
                                                    <div style={{ flex: 1 }}>
                                                        <CurrencyInput
                                                            label="Preço Unitário"
                                                            value={price}
                                                            onChange={(val) =>
                                                                setReceivedPrice((prev) => ({
                                                                    ...prev,
                                                                    [item.id]: Number(val),
                                                                }))
                                                            }
                                                            placeholder="R$ 0,00"
                                                        />
                                                    </div>
                                                </div>

                                                <div style={{ marginTop: 10, fontSize: 13, color: "#4B5563", textAlign: "right", fontWeight: 500 }}>
                                                    Subtotal: <strong style={{ color: "var(--color-text)" }}>{formatCurrency(total)}</strong>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* 🔥 TOTAL GERAL */}
                                    <div
                                        style={{
                                            marginTop: 20,
                                            padding: "16px 0",
                                            borderTop: "2px solid var(--color-border)",
                                            fontWeight: 700,
                                            display: "flex",
                                            justifyContent: "space-between",
                                            fontSize: "18px",
                                            color: "var(--color-text)"
                                        }}
                                    >
                                        <span>Total do Pedido</span>
                                        <span>
                                            {formatCurrency(
                                                selectedOrder.items.reduce((acc, item) => {
                                                    const qty = receivedQty[item.id] ?? item.adjustedQuantity;
                                                    const price = receivedPrice[item.id] ?? item.unitPrice;
                                                    return acc + (qty * price);
                                                }, 0)
                                            )}
                                        </span>
                                    </div>

                                    {/* 🔥 BOTÃO FINAL */}
                                    <Button
                                        variant="primary"
                                        fullWidth
                                        onClick={handleCompleteOrder}
                                        disabled={!invoiceData.invoiceNumber || !invoiceData.issuedAt}
                                        style={{ marginTop: 10, minHeight: 48 }}
                                    >
                                        Concluir Recebimento
                                    </Button>

                                </div>
                            );
                        })()}
                    </>
                )}
            </Modal>

        </Page>
    );

};

export default PurchaseOrders;

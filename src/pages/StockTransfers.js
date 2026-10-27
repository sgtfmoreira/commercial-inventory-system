import { SelectControl } from '../components/FormFields';
import { InputControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import styled from "styled-components";
import api from "../services/api";
import Badge from "../components/Badge";
import Select from "../components/Select";
import toast from "react-hot-toast"
import Button from "../components/Button";
import Card, { CardGrid, StatCard } from '../components/Card';
import { Page, PageHeader, PageHeading, PageTitle, PageSubtitle } from '../components/PageLayout';
import { Tabs, Tab } from '../components/Tabs';
import { MdRemoveCircleOutline, MdAdd } from "react-icons/md";

const KpiTitle = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const KpiValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes["2xl"]};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`;

const TableOverflow = styled.div`
  overflow-x: auto;
`;

const Table = styled(DataTable)`
  width: 100%;
  border-collapse: collapse;
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
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Tr = styled.tr`
  transition: ${({ theme }) => theme.transition};

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
`;



const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const Input = styled(InputControl)`
  padding: 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgInput};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.borderFocus};
  }
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: flex-end;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const FilterField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FilterLabel = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const FilterInput = styled(InputControl)`
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgInput};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.borderFocus};
  }
`;

const SummarySection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl || '32px'};
`;

const SectionTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SectionIcon = styled.span`
  font-size: 1.2em;
`;

const GroupCard = styled.div`
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: ${({ theme }) => theme.radii.md};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const GroupHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  transition: ${({ theme }) => theme.transition};

  &:hover {
    background: ${({ theme }) => theme.colors.bgCard};
  }
`;

const GroupName = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const GroupMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const GroupMetaItem = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};

  strong {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ExpandIcon = styled.span`
  transition: transform 0.2s ease;
  transform: ${({ $expanded }) => $expanded ? 'rotate(180deg)' : 'rotate(0deg)'};
  font-size: 0.8em;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const GroupBody = styled.div`
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  padding: 0;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

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
  align-items: end;
  @media (max-width: 540px) {
    grid-template-columns: 1fr;
  }
`;


const normalizeTransferUnit = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return ['un', 'und', 'unid', 'unidade', 'unidades'].includes(normalized) ? 'unidade' : normalized;
};

const getTransferPreview = (source, destination, quantity) => {
    const sourceQuantity = Number(quantity);
    if (!source || !destination || !Number.isFinite(sourceQuantity) || sourceQuantity <= 0) return null;

    if (normalizeTransferUnit(source.unit) === normalizeTransferUnit(destination.unit)) {
        return { quantity: sourceQuantity, unit: destination.unit };
    }

    const sourcePurchaseUnit = normalizeTransferUnit(source.purchaseUnit);
    const destinationPurchaseUnit = normalizeTransferUnit(destination.purchaseUnit);
    const sourcePack = Number(source.packQuantity ?? 1);
    const destinationPack = Number(destination.packQuantity ?? 1);

    if (!sourcePurchaseUnit || sourcePurchaseUnit !== destinationPurchaseUnit || sourcePack <= 0 || destinationPack <= 0) {
        return { error: 'Unidades incompatíveis para conversão.' };
    }

    const converted = Number(((sourceQuantity / sourcePack) * destinationPack).toFixed(6));
    if (['un', 'und', 'unid', 'unidade', 'unidades'].includes(normalizeTransferUnit(destination.unit)) && !Number.isInteger(converted)) {
        return { error: `A conversão resulta em ${converted} ${destination.unit}; informe uma quantidade que complete unidades inteiras.` };
    }

    return { quantity: converted, unit: destination.unit };
};

export default function StockTransfers() {

    const { state } = useApp();
    const { products } = state;


    const EMPTY_ITEM = () => ({
        _key: Math.random().toString(36).slice(2),
        productId: "",
        quantity: "",
        destinationProductId: ""
    });

    const [tab, setTab] = useState("create");
    const [sentTransfers, setSentTransfers] = useState([]);
    const [receivedTransfers, setReceivedTransfers] = useState([]);
    const [establishments, setEstablishments] = useState([]);
    const [items, setItems] = useState([EMPTY_ITEM()]);
    const [destinationId, setDestinationId] = useState("");
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState(null);

    // Mapeamento de produto no destino
    const [destinationProducts, setDestinationProducts] = useState([]);
    const [loadingDestProducts, setLoadingDestProducts] = useState(false);

    // Summary state
    const [summaryData, setSummaryData] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [expandedGroups, setExpandedGroups] = useState({});

    const topProduct = getTopTransferredProduct();

    // 🔹 Criar transferência
    const updateItem = (key, field, value) => {
        setItems(prev => prev.map(item => {
            if (item._key !== key) return item;
            
            const newItem = { ...item, [field]: value };
            
            if (field === "productId" && destinationProducts.length > 0) {
                const sourceProduct = products.find(p => p.id === value);
                if (sourceProduct) {
                    const sourceName = sourceProduct.name.toLowerCase();
                    const match = destinationProducts.find(p => {
                        if (sourceProduct.organizationProductId && p.organizationProductId === sourceProduct.organizationProductId) return true;
                        const n = p.name.toLowerCase();
                        return n === sourceName || n.includes(sourceName) || sourceName.includes(n);
                    });
                    newItem.destinationProductId = match ? match.id : "";
                }
            }
            
            return newItem;
        }));
    };

    const addItem = () => setItems(prev => [...prev, EMPTY_ITEM()]);
    
    const removeItem = (key) => {
        if (items.length === 1) return;
        setItems(prev => prev.filter(i => i._key !== key));
    };

    useEffect(() => {
        if (destinationProducts.length > 0) {
            setItems(prev => prev.map(item => {
                if (item.productId && !item.destinationProductId) {
                    const sourceProduct = products.find(p => p.id === item.productId);
                    if (sourceProduct) {
                        const sourceName = sourceProduct.name.toLowerCase();
                        const match = destinationProducts.find(p => {
                            if (sourceProduct.organizationProductId && p.organizationProductId === sourceProduct.organizationProductId) return true;
                            const n = p.name.toLowerCase();
                            return n === sourceName || n.includes(sourceName) || sourceName.includes(n);
                        });
                        if (match) return { ...item, destinationProductId: match.id };
                    }
                }
                return item;
            }));
        }
    }, [destinationProducts, products]);

    function getTopTransferredProduct() {

        const map = {};

        sentTransfers.forEach(t => {

            const name = t.product?.name;

            if (!name) return;

            if (!map[name]) {
                map[name] = 0;
            }

            map[name] += Number(t.quantity);

        });

        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1]);

        if (sorted.length === 0) return null;

        return {
            name: sorted[0][0],
            quantity: sorted[0][1]
        };

    }

    async function loadSentTransfers() {
        try {

            const res = await api.get("/stock-transfers/sent");

            setSentTransfers(res);

        } catch (err) {

            console.error(err);
            toast.error("Erro ao carregar transferências enviadas");

        }
    }
    async function loadReceivedTransfers() {

        try {

            const res = await api.get("/stock-transfers/received");

            const pendingTransfers = res.filter(
                (t) => t.status === "PENDING"
            );

            setReceivedTransfers(pendingTransfers);

        } catch (err) {

            console.error(err);
            toast.error("Erro ao carregar transferências recebidas");

        }

    }



    async function approveTransfer(id) {

        try {

            await api.patch(`/stock-transfers/${id}/approve`);
            toast.success("Transferência aprovada com sucesso");

            loadReceivedTransfers();
            loadSentTransfers();

        } catch (err) {
            console.error(err);
        }

    }
    async function rejectTransfer(id) {

        try {

            await api.patch(`/stock-transfers/${id}/reject`);

            loadReceivedTransfers();
            loadSentTransfers();

        } catch (err) {
            console.error(err);
        }

    }

    async function handleTransfer() {
        if (!destinationId) {
            toast.error("Selecione o estabelecimento de destino");
            return;
        }

        for (const item of items) {
            if (!item.productId || !item.quantity) {
                toast.error("Preencha produto e quantidade em todos os itens");
                return;
            }
            const selectedProduct = products.find(p => p.id === item.productId);
            if (selectedProduct && Number(item.quantity) > Number(selectedProduct.quantity)) {
                toast.error(`Estoque insuficiente no estabelecimento de origem para: ${selectedProduct.name}`);
                return;
            }
            const destinationProduct = destinationProducts.find(p => p.id === item.destinationProductId);
            const preview = getTransferPreview(selectedProduct, destinationProduct, item.quantity);
            if (preview?.error) {
                toast.error(`${selectedProduct.name}: ${preview.error}`);
                return;
            }
        }

        try {

            setLoading(true);

            await api.post("/stock-transfers", {
                toEstablishmentId: destinationId,
                items: items.map(item => ({
                    productId: item.productId,
                    quantity: Number(item.quantity),
                    destinationProductId: item.destinationProductId || null
                }))
            });

            toast.success("Transferência criada com sucesso");
            setItems([EMPTY_ITEM()]);
            setDestinationId("");
            setDestinationProducts([]);

        } catch (err) {

            console.error(err);
            const status = err.response?.status;

            if (status === 403) {
                toast.error("Você não tem permissão para criar transferência");
            } else {
                toast.error(err.response?.data?.message || "Erro ao criar transferência");
            }

        } finally {

            setLoading(false);
            loadSentTransfers();
        }

    }

    async function loadDestinationProducts(estId) {
        if (!estId) {
            setDestinationProducts([]);
            return;
        }
        try {
            setLoadingDestProducts(true);
            const res = await api.get(`/stock-transfers/destination-products/${estId}`);
            setDestinationProducts(res);
        } catch (err) {
            console.error(err);
            toast.error("Erro ao carregar produtos do destino");
        } finally {
            setLoadingDestProducts(false);
        }
    }



    // 🔹 Carregar estabelecimentos

    // Summary helpers
    const toggleGroup = (key) => {
        setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    };

    async function loadSummary() {
        try {
            setSummaryLoading(true);
            const res = await api.get(`/stock-transfers/summary?startDate=${startDate}&endDate=${endDate}`);
            setSummaryData(res);
        } catch (err) {
            console.error(err);
            toast.error("Erro ao carregar resumo de transferências");
        } finally {
            setSummaryLoading(false);
        }
    }

    useEffect(() => {

        if (tab === "sent") {
            loadSentTransfers();
        }

        if (tab === "received") {
            loadReceivedTransfers();
        }
        if (tab === "summary") {
            loadSummary();
        }

    }, [tab]);

    // Carrega produtos do destino sempre que o destino mudar
    useEffect(() => {
        loadDestinationProducts(destinationId);
    }, [destinationId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {

        async function loadContext() {

            try {

                const topProduct = getTopTransferredProduct();

                const res = await api.get("/auth/context");

                const context = res;

                const { establishments = [], establishment } = context;

                const filtered = establishments.filter(
                    (est) => est.id !== establishment?.id
                );

                setEstablishments(filtered);

            } catch (err) {

                console.error(err);

            }

        }

        loadContext();



    }, []);

    return (

        <Page>

            <PageHeader>
                <PageHeading>
                    <PageTitle>Transferências de estoque</PageTitle>
                    <PageSubtitle>Envie, receba e acompanhe movimentações entre unidades.</PageSubtitle>
                </PageHeading>
            </PageHeader>

            <Tabs>

                <Tab
                    active={tab === "create"}
                    onClick={() => setTab("create")}
                >
                    Nova Transferência
                </Tab>

                <Tab
                    active={tab === "sent"}
                    onClick={() => {
                        setTab("sent");
                        loadSentTransfers();
                    }}
                >
                    Enviadas
                </Tab>

                <Tab
                    active={tab === "received"}
                    onClick={() => {
                        setTab("received");
                        loadReceivedTransfers();
                    }}
                >
                    Recebidas
                </Tab>

                <Tab
                    active={tab === "summary"}
                    onClick={() => {
                        setTab("summary");
                    }}
                >
                    📊 Resumo
                </Tab>

            </Tabs>

            <Card>

                {tab === "sent" && topProduct && (

                    <CardGrid>

                        <StatCard>

                            <KpiTitle>Produto mais transferido</KpiTitle>

                            <KpiValue>
                                {topProduct.name}
                            </KpiValue>

                            <span>
                                {topProduct.quantity} transferências
                            </span>

                        </StatCard>

                    </CardGrid>

                )}

                {tab === "create" && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <Card>
                            <Field>
                                <Select
                                    label="Estabelecimento Destino"
                                    value={destinationId}
                                    onChange={setDestinationId}
                                    options={[
                                        { value: "", label: "-- Selecione um destino --" },
                                        ...establishments.map((est) => ({
                                            value: est.id,
                                            label: est.name,
                                        }))
                                    ]}
                                />
                            </Field>
                            {destinationId && loadingDestProducts && (
                                <div style={{ marginTop: 8, fontSize: 14, color: 'var(--color-text-secondary)' }}>🔄 Buscando produtos do destino...</div>
                            )}
                        </Card>

                        {items.map((item, idx) => {
                            const selectedProduct = products.find(p => p.id === item.productId);
                            const selectedDestinationProduct = destinationProducts.find(p => p.id === item.destinationProductId);
                            const transferPreview = getTransferPreview(selectedProduct, selectedDestinationProduct, item.quantity);
                            const q = Number(item.quantity);
                            const isExceeded = selectedProduct && q > Number(selectedProduct.quantity);

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
                                        <Field>
                                            <Select
                                                label="Produto (Origem)"
                                                value={item.productId}
                                                onChange={(val) => updateItem(item._key, "productId", val)}
                                                options={[
                                                    { value: "", label: "-- Selecione um produto --" },
                                                    ...products.map((product) => ({
                                                        value: product.id,
                                                        label: `${product.name} (Estoque: ${product.quantity || 0} ${product.unit || 'ml'})`,
                                                    }))
                                                ]}
                                            />
                                        </Field>

                                        <Field>
                                            <Label>Quantidade ({selectedProduct?.unit || 'ml'})</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                placeholder="Quantidade"
                                                value={item.quantity}
                                                onChange={(e) => updateItem(item._key, "quantity", e.target.value)}
                                            />
                                            {selectedProduct && q > 0 && (
                                                <div style={{ fontSize: '0.8rem', color: isExceeded ? 'var(--color-danger)' : 'var(--color-text-secondary)', marginTop: '4px', fontWeight: isExceeded ? 600 : 400 }}>
                                                    {isExceeded ? `⚠️ Estoque insuficiente! Máximo: ${selectedProduct.quantity} ${selectedProduct.unit}` : `Equivale a ${(q / (selectedProduct.packQuantity || 1)).toFixed(2)} ${selectedProduct.purchaseUnit || 'un'}(s)`}
                                                </div>
                                            )}
                                        </Field>

                                        {destinationId && (
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <Label style={{ display: 'block', marginBottom: 4 }}>Produto correspondente no destino</Label>
                                                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <SelectControl
                                                        value={item.destinationProductId}
                                                        onChange={(e) => updateItem(item._key, "destinationProductId", e.target.value)}
                                                        style={{
                                                            padding: '10px',
                                                            borderRadius: '8px',
                                                            border: '1px solid var(--color-border)',
                                                            background: '#fff',
                                                            fontSize: '0.875rem',
                                                            flex: 1,
                                                            minWidth: 250,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <option value="">➕ Criar como NOVO produto no destino</option>
                                                        {destinationProducts.map(p => (
                                                            <option key={p.id} value={p.id}>
                                                                {p.name} ({Number(p.quantity).toFixed(1)} {p.unit})
                                                            </option>
                                                        ))}
                                                    </SelectControl>
                                                    {item.destinationProductId ? (
                                                        <Badge variant="success">✅ Incrementar estoque existente</Badge>
                                                    ) : (
                                                        <Badge variant="warning">⚠️ Novo produto será criado</Badge>
                                                    )}
                                                </div>
                                                {transferPreview && (
                                                    <div style={{
                                                        marginTop: 8,
                                                        fontSize: '0.85rem',
                                                        color: transferPreview.error ? 'var(--color-danger)' : '#166534',
                                                        fontWeight: 600
                                                    }}>
                                                        {transferPreview.error || `Entrada prevista: ${transferPreview.quantity} ${transferPreview.unit}`}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </ManualGrid>
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

                        <Button
                            variant="primary"
                            onClick={handleTransfer}
                            disabled={loading || !destinationId || items.some(item => {
                                const p = products.find(prod => prod.id === item.productId);
                                return p && Number(item.quantity) > Number(p.quantity);
                            })}
                            style={{ padding: '16px', fontSize: '1rem', marginTop: '10px' }}
                        >
                            {loading ? "Transferindo..." : "Finalizar Transferência"}
                        </Button>

                    </div>
                )}

                {tab === "sent" && (

                    <DataTable style={{ width: "100%" }}>
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th>Quantidade</th>
                                <th>Destino</th>
                                <th>Status</th>
                                <th>Data</th>
                            </tr>
                        </thead>

                        <tbody>

                            {sentTransfers.length === 0 && (

                                <tr>
                                    <td colSpan="5" style={{ textAlign: "center", padding: "20px" }}>
                                        Nenhuma transferência encontrada
                                    </td>
                                </tr>

                            )}

                            {sentTransfers.map((transfer) => (

                                <Tr key={transfer.id}>

                                    <Td>{transfer.product?.name}</Td>

                                    <Td>
                                        {transfer.quantity} {transfer.sourceUnit || transfer.product?.unit}
                                        {transfer.destinationQuantity != null && transfer.destinationProduct && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                Entrada: {transfer.destinationQuantity} {transfer.destinationUnit || transfer.destinationProduct.unit}
                                            </div>
                                        )}
                                    </Td>

                                    <Td>{transfer.toEstablishment?.name}</Td>

                                    <Td>

                                        {transfer.status === "PENDING" && (
                                            <Badge variant="warning">PENDENTE</Badge>
                                        )}

                                        {transfer.status === "APPROVED" && (
                                            <Badge variant="success">APROVADO</Badge>
                                        )}

                                        {transfer.status === "REJECTED" && (
                                            <Badge variant="danger">REJEITADO</Badge>
                                        )}

                                    </Td>

                                    <Td>
                                        {new Date(transfer.createdAt).toLocaleDateString()}
                                    </Td>

                                </Tr>

                            ))}

                        </tbody>

                    </DataTable>

                )}

                {tab === "received" && (

                    <TableOverflow>

                        <Table>

                            <thead>
                                <tr>
                                    <Th>Produto</Th>
                                    <Th>Quantidade</Th>
                                    <Th>Origem</Th>
                                    <Th>Status</Th>
                                    <Th>Ações</Th>
                                </tr>
                            </thead>

                            <tbody>

                                {receivedTransfers.map((transfer) => (

                                    <Tr key={transfer.id}>

                                        <Td>{transfer.destinationProduct?.name || transfer.product?.name}</Td>

                                        <Td>
                                            {transfer.destinationQuantity ?? transfer.quantity}{' '}
                                            {transfer.destinationUnit || transfer.destinationProduct?.unit || transfer.product?.unit}
                                            {transfer.destinationQuantity != null && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                    Origem: {transfer.quantity} {transfer.sourceUnit || transfer.product?.unit}
                                                </div>
                                            )}
                                        </Td>

                                        <Td>{transfer.fromEstablishment?.name}</Td>

                                        <Td>

                                            {transfer.status === "PENDING" && (
                                                <Badge variant="warning">PENDING</Badge>
                                            )}

                                            {transfer.status === "APPROVED" && (
                                                <Badge variant="success">APPROVED</Badge>
                                            )}

                                            {transfer.status === "REJECTED" && (
                                                <Badge variant="danger">REJECTED</Badge>
                                            )}

                                        </Td>

                                        <Td>

                                            {transfer.status === "PENDING" && (

                                                <>
                                                    <div style={{ display: "flex", gap: "8px" }}>

                                                        <Button
                                                            size="sm"
                                                            variant="success"
                                                            onClick={() => approveTransfer(transfer.id)}
                                                            disabled={processingId === transfer.id}
                                                        >
                                                            {processingId === transfer.id ? "Aprovando..." : "Aprovar"}
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="danger"
                                                            onClick={() => rejectTransfer(transfer.id)}
                                                        >
                                                            Rejeitar
                                                        </Button>

                                                    </div>
                                                </>

                                            )}

                                        </Td>

                                    </Tr>

                                ))}

                            </tbody>

                        </Table>

                    </TableOverflow>

                )}

                {tab === "summary" && (
                    <>
                        <FilterRow>
                            <FilterField>
                                <FilterLabel>Data Início</FilterLabel>
                                <FilterInput
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </FilterField>

                            <FilterField>
                                <FilterLabel>Data Fim</FilterLabel>
                                <FilterInput
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </FilterField>

                            <Button
                                onClick={loadSummary}
                                disabled={summaryLoading}
                                variant="primary"
                                size="sm"
                            >
                                {summaryLoading ? "Carregando..." : "Filtrar"}
                            </Button>
                        </FilterRow>

                        {summaryLoading && (
                            <EmptyState>Carregando dados...</EmptyState>
                        )}

                        {!summaryLoading && summaryData && (
                            <>
                                <CardGrid>
                                    <StatCard>
                                        <KpiTitle>Total Enviado (Qtd)</KpiTitle>
                                        <KpiValue>{summaryData.sent?.totalQuantity?.toFixed(1) || 0}</KpiValue>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                            {summaryData.sent?.transferCount || 0} transferência(s)
                                        </span>
                                    </StatCard>

                                    <StatCard>
                                        <KpiTitle>Total Enviado (Valor)</KpiTitle>
                                        <KpiValue style={{ color: 'var(--color-danger)' }}>
                                            {formatCurrency(summaryData.sent?.totalValue)}
                                        </KpiValue>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Saída de valor</span>
                                    </StatCard>

                                    <StatCard>
                                        <KpiTitle>Total Recebido (Qtd)</KpiTitle>
                                        <KpiValue>{summaryData.received?.totalQuantity?.toFixed(1) || 0}</KpiValue>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                            {summaryData.received?.transferCount || 0} transferência(s)
                                        </span>
                                    </StatCard>

                                    <StatCard>
                                        <KpiTitle>Total Recebido (Valor)</KpiTitle>
                                        <KpiValue style={{ color: '#22c55e' }}>
                                            {formatCurrency(summaryData.received?.totalValue)}
                                        </KpiValue>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Entrada de valor</span>
                                    </StatCard>
                                </CardGrid>

                                {/* ENVIADAS POR ESTABELECIMENTO */}
                                <SummarySection>
                                    <SectionTitle>
                                        <SectionIcon>📤</SectionIcon>
                                        Enviadas por Destino
                                    </SectionTitle>

                                    {(!summaryData.sent?.byEstablishment || summaryData.sent.byEstablishment.length === 0) && (
                                        <EmptyState>Nenhuma transferência enviada no período</EmptyState>
                                    )}

                                    {summaryData.sent?.byEstablishment?.map((group) => (
                                        <GroupCard key={`sent-${group.establishmentId}`}>
                                            <GroupHeader onClick={() => toggleGroup(`sent-${group.establishmentId}`)}>
                                                <GroupName>🏪 {group.establishmentName}</GroupName>
                                                <GroupMeta>
                                                    <GroupMetaItem>
                                                        Qtd: <strong>{group.totalQuantity.toFixed(1)}</strong>
                                                    </GroupMetaItem>
                                                    <GroupMetaItem>
                                                        Valor: <strong>{formatCurrency(group.totalValue)}</strong>
                                                    </GroupMetaItem>
                                                    <ExpandIcon $expanded={expandedGroups[`sent-${group.establishmentId}`]}>
                                                        ▼
                                                    </ExpandIcon>
                                                </GroupMeta>
                                            </GroupHeader>

                                            {expandedGroups[`sent-${group.establishmentId}`] && (
                                                <GroupBody>
                                                    <Table>
                                                        <thead>
                                                            <tr>
                                                                <Th>Produto</Th>
                                                                <Th>Quantidade</Th>
                                                                <Th>Custo Unit.</Th>
                                                                <Th>Valor Total</Th>
                                                                <Th>Data</Th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {group.products.map((p, idx) => (
                                                                <Tr key={idx}>
                                                                    <Td>{p.productName}</Td>
                                                                    <Td>{p.quantity.toFixed(1)} {p.unit}</Td>
                                                                    <Td>{formatCurrency(p.unitCost)}</Td>
                                                                    <Td>{formatCurrency(p.totalCost)}</Td>
                                                                    <Td>{new Date(p.date).toLocaleDateString('pt-BR')}</Td>
                                                                </Tr>
                                                            ))}
                                                        </tbody>
                                                    </Table>
                                                </GroupBody>
                                            )}
                                        </GroupCard>
                                    ))}
                                </SummarySection>

                                {/* RECEBIDAS POR ESTABELECIMENTO */}
                                <SummarySection>
                                    <SectionTitle>
                                        <SectionIcon>📥</SectionIcon>
                                        Recebidas por Origem
                                    </SectionTitle>

                                    {(!summaryData.received?.byEstablishment || summaryData.received.byEstablishment.length === 0) && (
                                        <EmptyState>Nenhuma transferência recebida no período</EmptyState>
                                    )}

                                    {summaryData.received?.byEstablishment?.map((group) => (
                                        <GroupCard key={`recv-${group.establishmentId}`}>
                                            <GroupHeader onClick={() => toggleGroup(`recv-${group.establishmentId}`)}>
                                                <GroupName>🏪 {group.establishmentName}</GroupName>
                                                <GroupMeta>
                                                    <GroupMetaItem>
                                                        Qtd: <strong>{group.totalQuantity.toFixed(1)}</strong>
                                                    </GroupMetaItem>
                                                    <GroupMetaItem>
                                                        Valor: <strong>{formatCurrency(group.totalValue)}</strong>
                                                    </GroupMetaItem>
                                                    <ExpandIcon $expanded={expandedGroups[`recv-${group.establishmentId}`]}>
                                                        ▼
                                                    </ExpandIcon>
                                                </GroupMeta>
                                            </GroupHeader>

                                            {expandedGroups[`recv-${group.establishmentId}`] && (
                                                <GroupBody>
                                                    <Table>
                                                        <thead>
                                                            <tr>
                                                                <Th>Produto</Th>
                                                                <Th>Quantidade</Th>
                                                                <Th>Custo Unit.</Th>
                                                                <Th>Valor Total</Th>
                                                                <Th>Data</Th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {group.products.map((p, idx) => (
                                                                <Tr key={idx}>
                                                                    <Td>{p.productName}</Td>
                                                                    <Td>{p.quantity.toFixed(1)} {p.unit}</Td>
                                                                    <Td>{formatCurrency(p.unitCost)}</Td>
                                                                    <Td>{formatCurrency(p.totalCost)}</Td>
                                                                    <Td>{new Date(p.date).toLocaleDateString('pt-BR')}</Td>
                                                                </Tr>
                                                            ))}
                                                        </tbody>
                                                    </Table>
                                                </GroupBody>
                                            )}
                                        </GroupCard>
                                    ))}
                                </SummarySection>
                            </>
                        )}

                        {!summaryLoading && !summaryData && (
                            <EmptyState>Selecione um período e clique em "Filtrar" para ver o resumo</EmptyState>
                        )}
                    </>
                )}

            </Card>


        </Page>

    );

}

import DataTable from '../components/Table';
import React, { useState, useMemo, useEffect } from "react";
import { MdRefresh, MdWarning, MdPrint } from "react-icons/md";
import Card from "../components/Card";
import Button from "../components/Button";
import { Input } from "../components/FormFields";
import Select from "../components/Select";
import { useApp, ACTIONS } from "../context/AppContext";
import api from "../services/api";
import styled, { useTheme } from "styled-components";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Tabs, Tab } from '../components/Tabs';

const PURCHASE_CLASSIFICATIONS = [
    { value: 'CMV_BEVERAGES', label: 'Bebidas / CMV' },
    { value: 'CLEANING', label: 'Limpeza' },
    { value: 'DISPOSABLES', label: 'Descartáveis' },
    { value: 'OPERATING', label: 'Outros operacionais' }
];



const PageHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 32px;
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PageSubtitle = styled.p`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const StatusBadge = styled.span`
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  background: ${({ isSug, theme }) => isSug ? theme.colors.warningLight : theme.colors.successLight};
  color: ${({ isSug, theme }) => isSug ? theme.colors.warning : theme.colors.success};
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const StatCard = styled.div`
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
`;

const StatLabel = styled.div`
  font-size: 13px;
  color: #6b7280;
`;

const StatValue = styled.div`
  font-size: 22px;
  font-weight: 600;
`;

const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
`;

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
  padding: 14px 16px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  @media (max-width: 768px) {
    display: none;
  }
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: middle;
  @media (max-width: 768px) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    &:before {
      content: attr(data-label);
      font-weight: 700;
      font-size: 11px;
      color: ${({ theme }) => theme.colors.textMuted};
      text-transform: uppercase;
    }
  }
`;

const Tr = styled.tr`
  transition: ${({ theme }) => theme.transition};
  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }
  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radii.md};
    overflow: hidden;
    background: #fff;
  }
`;

const SupplierRow = styled.tr`
  background: ${({ theme }) => theme.colors.bgHover};
  @media (max-width: 768px) {
    display: block;
    border-radius: ${({ theme }) => theme.radii.md};
    margin-bottom: 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
  }
`;

const SupplierHeader = styled.td`
  padding: 14px 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  @media (max-width: 768px) {
    display: block;
  }
`;


const PurchaseSuggestions = () => {
    const [generatedSuggestions, setGeneratedSuggestions] = useState({});
    const { state, dispatch, getSupplierById } = useApp();
    
    // 🛡️ Definição de Cache Key Multi-Tenant
    const CACHE_KEY = `draft_po_qtys_${state.user?.establishmentId || 'global'}`;
    const SUPPLIER_CACHE_KEY = `draft_po_suppliers_${state.user?.establishmentId || 'global'}`;

    const [selectedSuppliers, setSelectedSuppliers] = useState(() => {
        const saved = sessionStorage.getItem(SUPPLIER_CACHE_KEY);
        return saved ? JSON.parse(saved) : {};
    });

    const [suggestions, setSuggestions] = useState([]);

    const [adjustedQtys, setAdjustedQtys] = useState(() => {
        const saved = sessionStorage.getItem(CACHE_KEY);
        return saved ? JSON.parse(saved) : {};
    });

    const [targetDays, setTargetDays] = useState(7);
    const [ignoredProducts, setIgnoredProducts] = useState({});
    const [viewMode, setViewMode] = useState("active"); // active | ignored
    const [activeClassification, setActiveClassification] = useState('CMV_BEVERAGES');
    const [filterCategory, setFilterCategory] = useState('');
    const theme = useTheme();

    const productsMap = useMemo(() => {
        const map = {};
        state.products.forEach((p) => {
            map[p.id] = p;
        });
        return map;
    }, [state.products]);

    const getAdjusted = (s) => {
        return adjustedQtys[s.productId] ?? s.suggestedQuantity;
    };


    useEffect(() => {

        const fetchSuggestions = async () => {
            try {
                const res = await api.get(
                    `/purchase-suggestions?days=${targetDays}`
                );
                setSuggestions(res.items || []);
                // Não limpamos mais o adjustedQtys aqui para permitir persistência entre re-fetches de dias
            } catch (err) {
                console.error(err);
            }
        };

        fetchSuggestions();

    }, [targetDays]);

    // 💾 Auto-Save Quantidades
    useEffect(() => {
        if (Object.keys(adjustedQtys).length > 0) {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(adjustedQtys));
        }
    }, [adjustedQtys, CACHE_KEY]);

    // 💾 Auto-Save Fornecedores
    useEffect(() => {
        if (Object.keys(selectedSuppliers).length > 0) {
            sessionStorage.setItem(SUPPLIER_CACHE_KEY, JSON.stringify(selectedSuppliers));
        }
    }, [selectedSuppliers, SUPPLIER_CACHE_KEY]);

    const lowStockProducts = useMemo(() => {
        return state.products.filter(
            p => (p.purchaseClassification || 'CMV_BEVERAGES') === activeClassification &&
                p.trackInventory !== false &&
                Number(p.quantity) < Number(
                    activeClassification === 'CMV_BEVERAGES'
                        ? p.minQuantity
                        : (p.idealQuantity || p.minQuantity)
                )
        );
    }, [state.products, activeClassification]);

    const classificationCounts = useMemo(() => {
        return suggestions.reduce((counts, suggestion) => {
            const classification = suggestion.purchaseClassification ||
                productsMap[suggestion.productId]?.purchaseClassification ||
                'CMV_BEVERAGES';
            counts[classification] = (counts[classification] || 0) + 1;
            return counts;
        }, {});
    }, [suggestions, productsMap]);


    const filteredSuggestions = useMemo(() => {
        return suggestions.filter(s => {
            const p = productsMap[s.productId];
            const classification = s.purchaseClassification || p?.purchaseClassification || 'CMV_BEVERAGES';
            return classification === activeClassification &&
                (!filterCategory || String(p?.categoryId) === String(filterCategory));
        });
    }, [suggestions, productsMap, filterCategory, activeClassification]);

    const newSuggestions = useMemo(() => {
        return filteredSuggestions.filter(s =>
            !s.hasOpenOrder &&
            !ignoredProducts[s.productId]
        );
    }, [filteredSuggestions, ignoredProducts]);

    const ignoredSuggestions = useMemo(() => {
        return filteredSuggestions.filter(s => ignoredProducts[s.productId]);
    }, [filteredSuggestions, ignoredProducts]);

    const coverageStats = useMemo(() => {

        let critical = 0;
        let warning = 0;
        let ok = 0;

        newSuggestions.forEach(s => {

            const product = productsMap[s.productId];
            const pack = Number(product?.packQuantity || 1);
            const consumption = Number(s.consumptionLast7Days || 0);

            // Qtd ajustada (em GARRAFAS) convertida para ML para comparar com consumo em ML
            const qtyMl = Number(getAdjusted(s) ?? s.suggestedQuantity ?? 0) * pack;

            if (consumption <= 0) return;

            const coverage = qtyMl / consumption;

            if (coverage < 1) {
                critical++;
            } else if (coverage < 1.3) {
                warning++;
            } else {
                ok++;
            }

        });

        return {
            critical,
            warning,
            ok
        };

    }, [newSuggestions, adjustedQtys, productsMap]);
    console.log("STATS:", coverageStats);

    const openOrderSuggestions = useMemo(() => {
        return suggestions.filter(s => s.hasOpenOrder);
    }, [suggestions]);

    // 👇 ADICIONE ESTE BLOCO AQUI
    const groupedNewSuggestions = useMemo(() => {

        const groups = {};

        newSuggestions.forEach((s) => {

            const p = productsMap[s.productId];
            const supplierId =
                selectedSuppliers[s.productId] ?? s.bestSupplierId ?? p?.supplierId ?? "unassigned";

            if (!groups[supplierId]) {
                groups[supplierId] = [];
            }

            groups[supplierId].push(s);

        });

        return groups;

    }, [newSuggestions, selectedSuppliers]);

    const groupedIgnoredSuggestions = useMemo(() => {

        const groups = {};

        ignoredSuggestions.forEach((s) => {

            const p = productsMap[s.productId];
            const supplierId =
                selectedSuppliers[s.productId] ?? s.bestSupplierId ?? p?.supplierId ?? "unassigned";

            if (!groups[supplierId]) {
                groups[supplierId] = [];
            }

            groups[supplierId].push(s);

        });


        return groups;

    }, [ignoredSuggestions, selectedSuppliers]);

    // 👇 continua normal
    const totalEstimatedCost = (newSuggestions || []).reduce((acc, s) => {

        const qty = getAdjusted(s);

        const p = productsMap[s.productId];
        const selectedSupplierId =
            selectedSuppliers[s.productId] ?? s.bestSupplierId ?? p?.supplierId;

        const supplier = s.suppliers?.find(
            sup => sup.supplierId === selectedSupplierId
        );

        const price = Number(supplier?.price || p?.costPrice || p?.unitPrice || 0);

        return acc + qty * price;

    }, 0);

    const totalEstimatedSaving = (newSuggestions || []).reduce((acc, s) => {

        const qty = getAdjusted(s);



        const p = productsMap[s.productId];
        const selectedSupplierId =
            selectedSuppliers[s.productId] ?? s.bestSupplierId ?? p?.supplierId;

        const supplier = s.suppliers?.find(
            sup => sup.supplierId === selectedSupplierId
        );

        const price = Number(supplier?.price || p?.costPrice || p?.unitPrice || 0);

        const prices = s.suppliers?.map(sup => Number(sup.price)) || [];
        const highestPrice = prices.length > 0 ? Math.max(...prices, price) : price;

        const saving = (highestPrice - price) * qty;

        return acc + saving;

    }, 0);

    const handleExportPDF = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();

        // Cabeçalho
        doc.setFontSize(16);
        doc.setTextColor(30, 41, 59); // Slate-800
        doc.text('Ordem de Compra - Bastidor OS', 14, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139); // Slate-500
        doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 26);
        doc.text(`Estabelecimento: ${state.establishment?.name || 'N/A'}`, 14, 31);

        // Preparar os dados para a tabela
        const tableData = newSuggestions.map(s => {
            const p = productsMap[s.productId];
            const selectedSupplierId = selectedSuppliers[s.productId] ?? s.bestSupplierId ?? p?.supplierId;
            const supplierData = s.suppliers?.find(sup => sup.supplierId === selectedSupplierId);
            const supplierName = getSupplierById(selectedSupplierId)?.name || 'Sem Fornecedor';
            
            const qty = Number(getAdjusted(s));
            const price = Number(supplierData?.price || p?.currentCost || p?.unitPrice || 0);
            const total = qty * price;

            return [
                s.productName,
                supplierName,
                qty.toFixed(2),
                p?.purchaseUnit || 'un',
                `R$ ${price.toFixed(2)}`,
                `R$ ${total.toFixed(2)}`
            ];
        });

        // Tabela
        autoTable(doc, {
            startY: 40,
            head: [['Produto', 'Fornecedor', 'Qtd. Comprar', 'Unidade', 'Custo Unit.', 'Total Est.']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] },
            styles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 40 },
                1: { cellWidth: 35 },
                2: { halign: 'center' },
                3: { halign: 'center' },
                4: { halign: 'right' },
                5: { halign: 'right' }
            }
        });

        // Rodapé (Resumo Financeiro)
        const finalY = (doc).lastAutoTable.finalY + 15;

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('Resumo Financeiro', 14, finalY);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Total da Compra: R$ ${totalEstimatedCost.toFixed(2)}`, 14, finalY + 8);

        // Destaque da Economia
        doc.setTextColor(22, 163, 74); // Verde (green-600)
        doc.setFont(undefined, 'bold');
        doc.text(`Economia Estimada: R$ ${totalEstimatedSaving.toFixed(2)}`, 14, finalY + 14);

        doc.setTextColor(30, 41, 59);
        doc.setFont(undefined, 'normal');

        // Assinaturas
        const signY = finalY + 35;
        doc.text('_________________________________', 14, signY);
        doc.text('Aprovado por (Assinatura)', 14, signY + 7);

        doc.save(`ordem-compra-sugestao-${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const handleGenerate = async () => {

        try {

            // 🔥 1. DEFINIR newSuggestions PRIMEIRO (ESSENCIAL)
            const newSuggestionsForOrder = filteredSuggestions.filter(s =>
                !s.hasOpenOrder &&
                !ignoredProducts[s.productId]
            );

            if (newSuggestionsForOrder.length === 0) {
                alert("Nenhuma sugestão para gerar pedido.");
                return;
            }

            const groupedBySupplier = {};

            newSuggestionsForOrder.forEach((s) => {

                const p = state.products.find(
                    prod => prod.id === s.productId
                );

                const supplierId =
                    selectedSuppliers[s.productId] ||
                    s.bestSupplierId ||
                    p?.supplierId || 
                    "unassigned";

                const supplier = s.suppliers?.find(
                    sup => sup.supplierId === supplierId
                );

                const price = Number(supplier?.price || p?.costPrice || p?.unitPrice || 0);

                if (!groupedBySupplier[supplierId]) {
                    groupedBySupplier[supplierId] = [];
                }

                groupedBySupplier[supplierId].push({
                    productId: s.productId,
                    productName: s.productName,
                    unitPrice: price,
                    adjustedQuantity: Number(getAdjusted(s)),
                    supplierId
                });

            });

            // 🔥 2. CRIAR ORDENS
            for (const items of Object.values(groupedBySupplier)) {

                await api.post("/purchase-orders", {
                    generationMode: 'AUTOMATIC',
                    items
                });

            }

            // 🔥 3. LIMPAR STORAGE (DRAFT)
            sessionStorage.removeItem(CACHE_KEY);
            sessionStorage.removeItem(SUPPLIER_CACHE_KEY);

            // 🔥 4. LIMPAR STATE
            setAdjustedQtys({});
            setSelectedSuppliers({});
            setSuggestions([]);

            // 🔥 5. BUSCAR NOVAS SUGESTÕES
            const res = await api.get(`/purchase-suggestions?days=${targetDays}`);
            const freshSuggestions = res.items || [];

            setSuggestions(freshSuggestions);

            // 🔥 6. MARCAR GERADOS (USA OS ANTIGOS)
            const generated = {};
            newSuggestionsForOrder.forEach((s) => {
                generated[s.productId] = true;
            });

            setGeneratedSuggestions(generated);

        } catch (err) {
            console.error(err);

            const status = err.response?.status;
            const message = err.response?.data?.error;

            if (status === 403 || message?.includes('Acesso negado')) {
                toast.error('Você não tem permissão para gerar pedidos');
            } else if (status === 401) {
                toast.error('Sessão expirada, faça login novamente');
            } else {
                toast.error('Erro ao gerar pedidos');
            }
        }
    };

    const groupedSuggestions = useMemo(() => {

        const groups = {};

        (filteredSuggestions || []).forEach((s) => {

            const p = productsMap[s.productId];
            const supplierId =
                selectedSuppliers[s.productId] ?? s.bestSupplierId ?? p?.supplierId ?? "unassigned";

            if (!groups[supplierId]) {
                groups[supplierId] = [];
            }

            groups[supplierId].push(s);

        });

        return groups;

    }, [filteredSuggestions, selectedSuppliers]);

    // 👇 COLOCA EXATAMENTE AQUI
    const currentGroupedSuggestions =
        viewMode === "active"
            ? groupedNewSuggestions
            : groupedIgnoredSuggestions;

    return (
        <div>

            <PageHeader>

                <PageTitle>
                    Compras Inteligentes
                </PageTitle>

                <PageSubtitle>
                    Sugestões automáticas de compra baseadas no estoque mínimo
                </PageSubtitle>

            </PageHeader>

            <StatsGrid>
                <Card padding="16px" accent={theme.colors.primary}>
                    <div style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 8 }}>
                        Situação do estoque
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.danger }}>
                        🔴 {coverageStats.critical} crítico
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.warning }}>
                        🟡 {coverageStats.warning} atenção
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: theme.colors.success }}>
                        🟢 {coverageStats.ok} ok
                    </div>
                </Card>

                <Card padding="16px" accent={theme.colors.danger}>
                    <div style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                        Abaixo do mínimo
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: theme.colors.textPrimary }}>
                        {lowStockProducts.length}
                    </div>
                </Card>

                <Card padding="16px" accent={theme.colors.warning}>
                    <div style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                        Pendentes
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: theme.colors.textPrimary }}>
                        {newSuggestions.length}
                    </div>
                </Card>

                <Card padding="16px" accent={theme.colors.primary}>
                    <div style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                        Custo estimado
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: theme.colors.textPrimary }}>
                        R$ {totalEstimatedCost.toFixed(2)}
                    </div>
                </Card>

                <Card padding="16px" accent={theme.colors.success}>
                    <div style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                        Economia estimada
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: theme.colors.success }}>
                        R$ {totalEstimatedSaving.toFixed(2)}
                    </div>
                </Card>
            </StatsGrid>

            <hr style={{ margin: "20px 0", border: 'none', borderTop: `1px solid ${theme.colors.border}` }} />

            <Tabs style={{ flexWrap: 'wrap' }}>
                {PURCHASE_CLASSIFICATIONS.map(classification => (
                    <Tab
                        key={classification.value}
                        active={activeClassification === classification.value}
                        onClick={() => {
                            setActiveClassification(classification.value);
                            setFilterCategory('');
                        }}
                    >
                        {classification.label} ({classificationCounts[classification.value] || 0})
                    </Tab>
                ))}
            </Tabs>

            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: "10px"
            }}>
                <h3 style={{ margin: 0, fontSize: theme.fontSizes.xl, color: theme.colors.textPrimary }}>
                    Lista de Compras
                </h3>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <Button
                        variant="secondary"
                        onClick={handleExportPDF}
                        disabled={!newSuggestions.length}
                    >
                        <MdPrint /> Exportar Ordem (PDF)
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleGenerate}
                        disabled={!newSuggestions.length}
                    >
                        Gerar Ordens de Compra
                    </Button>
                </div>

            </div>

            <div style={{ marginTop: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 500, fontSize: theme.fontSizes.sm, color: theme.colors.textSecondary }}>
                    Dias de estoque desejado:
                </span>
                <div style={{ width: "80px" }}>
                    <Input
                        type="number"
                        inputMode="decimal"
                        size="sm"
                        value={targetDays}
                        onChange={(e) => setTargetDays(Number(e.target.value))}
                    />
                </div>
                <span style={{ fontWeight: 500, fontSize: theme.fontSizes.sm, color: theme.colors.textSecondary, marginLeft: '10px' }}>
                    Categoria:
                </span>
                <div style={{ minWidth: "200px" }}>
                    <Select
                        value={filterCategory}
                        onChange={setFilterCategory}
                        options={[
                            { value: '', label: 'Todas as categorias' },
                            ...(state.categories || []).map((c) => ({ value: c.id, label: c.name }))
                        ]}
                    />
                </div>
            </div>
            <Tabs>

                <Tab
                    active={viewMode === "active"}
                    onClick={() => setViewMode("active")}
                >
                    Compras
                </Tab>

                <Tab
                    active={viewMode === "ignored"}
                    onClick={() => setViewMode("ignored")}
                >
                    Ignorados
                </Tab>

            </Tabs>

            <TableWrapper>
                <Table>

                    <thead>
                        <tr>
                            <Th>Produto</Th>
                            <Th>Estoque</Th>
                            <Th>Mínimo</Th>
                            <Th>Ajustar</Th>
                            <Th>Preço</Th>
                            <Th>Total</Th>
                            <Th>Economia</Th>
                            <Th>Fornecedor</Th>
                            <Th>Status</Th>
                        </tr>
                    </thead>

                    <tbody>

                        {Object.entries(currentGroupedSuggestions).map(([supplierId, items]) => {

                            const supplierName =
                                getSupplierById(supplierId)?.name || "Fornecedor";
                            const supplierTotal = items.reduce((acc, s) => {


                                const qty = getAdjusted(s);

                                const p = productsMap[s.productId];
                                const selectedSupplierId =
                                    selectedSuppliers[s.productId] ?? s.bestSupplierId ?? p?.supplierId;

                                const supplier = s.suppliers?.find(
                                    sup => sup.supplierId === selectedSupplierId
                                );

                                const price = Number(supplier?.price || p?.costPrice || p?.unitPrice || 0);

                                return acc + qty * price;

                            }, 0);

                            return (

                                <React.Fragment key={supplierId}>

                                    <SupplierRow>
                                        <SupplierHeader colSpan="9">

                                            <div style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center"
                                            }}>

                                                <strong>{supplierName}</strong>

                                                <div style={{ display: "flex", gap: 15, fontSize: 12, color: "#6b7280" }}>

                                                    <span>
                                                        {items.length} produtos
                                                    </span>

                                                    <span style={{ fontWeight: 600 }}>
                                                        Total: R$ {supplierTotal.toFixed(2)}
                                                    </span>

                                                </div>

                                            </div>

                                        </SupplierHeader>
                                    </SupplierRow>

                                    {items.map(s => {
                                        const product = productsMap[s.productId];
                                        if (!product) return null;

                                        const selectedSupplierId =
                                            selectedSuppliers[s.productId] ?? s.bestSupplierId ?? product?.supplierId;

                                        const supplier = s.suppliers?.find(
                                            sup => sup.supplierId === selectedSupplierId
                                        );

                                        const price = Number(supplier?.price || product?.costPrice || product?.unitPrice || 0);

                                        const consumption = Number(s.consumptionLast7Days || 0);
                                        const qty = Number(getAdjusted(s));

                                        const total = qty * price;

                                        const prices = s.suppliers?.map(sup => Number(sup.price)) || [];
                                        const highestPrice = prices.length > 0 ? Math.max(...prices, price) : price;

                                        const savingTotal = (highestPrice - price) * qty;

                                        let coverage = null;

                                        if (consumption > 0) {
                                            coverage = qty / consumption;
                                        }
                                        let coverageLabel = null;
                                        let coverageColor = "#6b7280";

                                        if (coverage !== null) {
                                            if (coverage < 1) {
                                                coverageLabel = "crítico";
                                                coverageColor = "#dc2626"; // vermelho
                                            } else if (coverage < 1.3) {
                                                coverageLabel = "atenção";
                                                coverageColor = "#d97706"; // amarelo
                                            } else {
                                                coverageLabel = "ok";
                                                coverageColor = "#059669"; // verde
                                            }
                                        }

                                        return (

                                            <Tr key={s.productId}>

                                                <Td data-label="Produto">
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                                        <span style={{ fontWeight: 600 }}>{s.productName}</span>
                                                        {consumption > 0 && (
                                                            <span style={{ fontSize: 11, color: coverageColor }}>
                                                                {coverage < 1 ? "🔴" : coverage < 1.3 ? "🟡" : "🟢"}{" "}
                                                                cobre ~{coverage.toFixed(1)} períodos
                                                            </span>
                                                        )}
                                                    </div>
                                                </Td>

                                                <Td data-label="Estoque" style={{ textAlign: "center" }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 500 }}>{(Number(product?.quantity || 0) / Number(product?.packQuantity || 1)).toFixed(2)} {product?.purchaseUnit}</span>
                                                        <span style={{ fontSize: '11px', color: '#64748B' }}>({product?.quantity} {product?.unit})</span>
                                                    </div>
                                                </Td>

                                                <Td data-label="Mínimo" style={{ textAlign: "center" }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 500 }}>{(Number(product?.minQuantity || 0) / Number(product?.packQuantity || 1)).toFixed(2)} {product?.purchaseUnit}</span>
                                                        <span style={{ fontSize: '11px', color: '#64748B' }}>({product?.minQuantity} {product?.unit})</span>
                                                    </div>
                                                </Td>

                                                <Td data-label="Ajustar" style={{ textAlign: "center" }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                                        <div style={{ width: '80px' }}>
                                                            <Input
                                                                type="number"
                                                                inputMode="decimal"
                                                                size="sm"
                                                                min="0"
                                                                value={getAdjusted(s)}
                                                                onChange={(e) => {
                                                                    const updated = {
                                                                        ...adjustedQtys,
                                                                        [s.productId]: Number(e.target.value)
                                                                    };

                                                                    setAdjustedQtys(updated);
                                                                    sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated));
                                                                }}
                                                            />
                                                        </div>
                                                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                            {product?.purchaseUnit || 'un'}
                                                        </span>
                                                    </div>
                                                </Td>

                                                <Td data-label="Preço" style={{ textAlign: "center" }}>
                                                    R$ {price.toFixed(2)}
                                                </Td>

                                                <Td data-label="Total" style={{ textAlign: "center", fontWeight: 600 }}>
                                                    R$ {total.toFixed(2)}
                                                </Td>

                                                <Td data-label="Economia" style={{
                                                    textAlign: "center",
                                                    color: savingTotal > 0 ? theme.colors.success : theme.colors.textMuted
                                                }}>
                                                    {savingTotal > 0
                                                        ? `R$ ${savingTotal.toFixed(2)}`
                                                        : "R$ 0.00"}
                                                </Td>

                                                <Td data-label="Fornecedor" style={{ textAlign: "center" }}>

                                                    {(() => {
                                                        const p = productsMap[s.productId];
                                                        const activeSupplierId = selectedSuppliers[s.productId] ?? s.bestSupplierId ?? p?.supplierId;

                                                        let optionList = s.suppliers?.map((sup) => ({
                                                            value: sup.supplierId,
                                                            label: sup.supplierId === s.bestSupplierId
                                                                ? `💎 ${sup.supplierName} — R$ ${Number(sup.price).toFixed(2)}`
                                                                : `${sup.supplierName} — R$ ${Number(sup.price).toFixed(2)}`
                                                        })) || [];

                                                        if (activeSupplierId && !optionList.some(o => o.value === activeSupplierId)) {
                                                            const fallbackName = getSupplierById(activeSupplierId)?.name || 'Fornecedor Padrão';
                                                            const fallbackPrice = p?.costPrice || p?.unitPrice || 0;
                                                            optionList.push({
                                                                value: activeSupplierId,
                                                                label: `${fallbackName} (Padrão) — R$ ${Number(fallbackPrice).toFixed(2)}`
                                                            });
                                                        }

                                                        if (optionList.length === 0) {
                                                            optionList.push({ value: "", label: "Sem Fornecedor" });
                                                        }

                                                        return (
                                                            <Select
                                                                value={activeSupplierId ?? ""}
                                                                options={optionList}
                                                                onChange={(val) => {
                                                                    const value = val?.target?.value !== undefined ? val.target.value : val;
                                                                    const updated = {
                                                                        ...selectedSuppliers,
                                                                        [s.productId]: value
                                                                    };
                                                                    // ✅ Atualiza o state — o useEffect de auto-save persiste no sessionStorage com a chave correta
                                                                    setSelectedSuppliers(updated);
                                                                    // 🔥 Persiste imediatamente para não perder em re-renders
                                                                    sessionStorage.setItem(SUPPLIER_CACHE_KEY, JSON.stringify(updated));
                                                                }}
                                                            />
                                                        );
                                                    })()}

                                                </Td>
                                                <Td data-label="Status" style={{ textAlign: "center" }}>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
                                                        <StatusBadge isSug={!s.hasOpenOrder}>
                                                            {s.hasOpenOrder ? "Pedido gerado" : "Sugestão"}
                                                        </StatusBadge>

                                                        {viewMode === "active" ? (
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                fullWidth
                                                                onClick={() =>
                                                                    setIgnoredProducts(prev => ({
                                                                        ...prev,
                                                                        [s.productId]: true
                                                                    }))
                                                                }
                                                            >
                                                                Ignorar
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                fullWidth
                                                                onClick={() =>
                                                                    setIgnoredProducts(prev => {
                                                                        const copy = { ...prev };
                                                                        delete copy[s.productId];
                                                                        return copy;
                                                                    })
                                                                }
                                                            >
                                                                Reativar
                                                            </Button>
                                                        )}
                                                    </div>
                                                </Td>
                                            </Tr>

                                        );

                                    })}

                                </React.Fragment>

                            );

                        })}

                    </tbody>

                </Table>
            </TableWrapper>

        </div>
    );

};

export default PurchaseSuggestions;

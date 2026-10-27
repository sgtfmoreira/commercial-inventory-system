import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import { TextareaControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import {
    MdLocalBar,
    MdCardGiftcard,
    MdLocalOffer,
    MdScience,
    MdBrokenImage,
    MdFilterList,
    MdAdd,
    MdReceiptLong,
    MdPictureAsPdf,
    MdRemoveCircleOutline
} from 'react-icons/md';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/formatCurrency';
import Card from '../components/Card';
import Button from '../components/Button';
import Select from '../components/Select';
import Modal from '../components/Modal';
import { Input } from '../components/FormFields';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import api from '../services/api';
import toast from 'react-hot-toast';

// ─── Config ───────────────────────────────────────────────────────────────────
const ENTRY_TYPES = {
    DOUBLE_DRINK: {
        label: 'Drink em Dobro',
        icon: <MdLocalBar />,
        color: '#A89EFF',
        bgColor: 'rgba(168, 158, 255, 0.1)',
        description: 'Promoção onde o cliente paga 1 e leva 2'
    },
    COURTESY: {
        label: 'Cortesia',
        icon: <MdCardGiftcard />,
        color: '#EC4899',
        bgColor: 'rgba(236, 72, 153, 0.1)',
        description: 'Oferta gratuita para clientes VIP, influenciadores'
    },
    PROMO: {
        label: 'Promoção',
        icon: <MdLocalOffer />,
        color: '#F59E0B',
        bgColor: 'rgba(245, 158, 11, 0.1)',
        description: 'Happy hour, combos, descontos'
    },
    TASTING: {
        label: 'Degustação',
        icon: <MdScience />,
        color: '#06B6D4',
        bgColor: 'rgba(6, 182, 212, 0.1)',
        description: 'Teste de novos produtos'
    },
    OPERATIONAL_LOSS: {
        label: 'Perda Operacional',
        icon: <MdBrokenImage />,
        color: '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.1)',
        description: 'Derramou, quebrou, descartou'
    }
};

// ─── Styled ───────────────────────────────────────────────────────────────────
const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PageSubtitle = styled.p`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-top: 4px;
`;

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const KpiCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid ${({ $accent }) => $accent || 'transparent'};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: ${({ theme }) => theme.transition};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
  }
`;

const KpiIcon = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;

  svg {
    font-size: 1.2rem;
    color: ${({ $color }) => $color};
  }
`;

const KpiLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const KpiValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color }) => $color || 'inherit'};
`;

const KpiSub = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const FiltersBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const FilterGroup = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

const DateInput = styled(InputControl)`
  background: ${({ theme }) => theme.colors.bgInput};
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  padding: 7px 10px;
  outline: none;
  transition: ${({ theme }) => theme.transition};
  &:focus { border-color: ${({ theme }) => theme.colors.borderFocus}; }
  &::-webkit-calendar-picker-indicator { opacity: 0.6; cursor: pointer; }
`;

const ClearBtn = (props) => <DSButton size="sm" variant="danger" {...props} />;

const TableWrap = styled.div`overflow-x: auto;`;

const Table = styled(DataTable)`
  width: 100%;
  border-collapse: collapse;

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px;
  }
`;

const Th = styled.th`
  text-align: left;
  padding: 12px 16px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgInput};
  white-space: nowrap;

  @media (max-width: 768px) {
    display: none;
  }
`;

const Td = styled.td`
  padding: 13px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: middle;

  @media (max-width: 768px) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    width: 100%;

    &:before {
      content: attr(data-label);
      font-weight: 700;
      font-size: 11px;
      color: ${({ theme }) => theme.colors.textMuted};
      text-transform: uppercase;
    }

    &:last-child {
      border-bottom: none;
    }
  }
`;

const Tr = styled.tr`
  transition: ${({ theme }) => theme.transition};
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:last-child td { border-bottom: none; }

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    background: ${({ theme }) => theme.colors.bgCard};
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  }
`;

const TypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 700;
  background: ${({ $bg }) => $bg};
  color: ${({ $color }) => $color};

  svg { font-size: 0.9rem; }
`;

// Modal form
const FormGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const TypeSelector = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
`;

const TypeOption = ({ $active, $color, $bg, ...props }) => (
  <DSButton fullWidth variant={$active ? 'primary' : 'outlined'} {...props} />
);

const NoteInput = styled(TextareaControl)`
  width: 100%;
  min-height: 60px;
  padding: 10px 12px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.bgInput};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: ${({ theme }) => theme.transition};

  &:focus { border-color: ${({ theme }) => theme.colors.borderFocus}; }
  &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; }
`;

const ResultBox = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.colors.bgHover};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 14px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function Entries() {
    const { state, fetchAllData } = useApp();

    // Filters
    const [filterType, setFilterType] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [formType, setFormType] = useState('DOUBLE_DRINK');
    const [formNotes, setFormNotes] = useState('');
    const [entryDate, setEntryDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()));
    const [submitting, setSubmitting] = useState(false);

    const EMPTY_ITEM = () => ({
        _key: Math.random().toString(36).slice(2),
        productId: "",
        quantity: "",
        locationId: ""
    });
    const [items, setItems] = useState([EMPTY_ITEM()]);
    
    const updateItem = (key, field, value) => {
        setItems(prev => prev.map(item => {
            if (item._key !== key) return item;
            
            const newItem = { ...item, [field]: value };
            
            if (field === "productId") {
                const prod = state.products?.find(p => p.id === value);
                if (prod) {
                    const defaultLocId = prod.defaultLocationId || (locations.find(l => l.isDefault)?.id) || '';
                    newItem.locationId = defaultLocId;
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

    // Data
    const [entries, setEntries] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loadingEntries, setLoadingEntries] = useState(true);
    const [locations, setLocations] = useState([]);

    React.useEffect(() => {
        const loadLocs = async () => {
            try {
                const res = await api.get('/stock-locations');
                setLocations(res);
            } catch (err) {
                console.error(err);
            }
        };
        loadLocs();
    }, []);

    const ENTRY_REASONS = useMemo(() =>
        Object.keys(ENTRY_TYPES), []);

    // ─── Fetch entries ──────────────────────────────────────────────────────
    const fetchEntries = useCallback(async () => {
        setLoadingEntries(true);
        try {
            let url = '/entries?';
            const params = new URLSearchParams();
            if (filterType) params.append('entryType', filterType);
            if (dateFrom) params.append('dateFrom', dateFrom);
            if (dateTo) params.append('dateTo', dateTo);
            url += params.toString();

            const res = await api.get(url);
            const data = res.data || res || [];
            setEntries(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Erro ao buscar lançamentos:", err);
        } finally {
            setLoadingEntries(false);
        }
    }, [filterType, dateFrom, dateTo]);

    const fetchSummary = useCallback(async () => {
        try {
            let url = '/entries/summary?';
            const params = new URLSearchParams();
            if (dateFrom) params.append('dateFrom', dateFrom);
            if (dateTo) params.append('dateTo', dateTo);
            url += params.toString();

            const res = await api.get(url);
            setSummary(res.data || res || null);
        } catch (err) {
            console.error("Erro ao buscar resumo:", err);
        }
    }, [dateFrom, dateTo]);

    useEffect(() => {
        fetchEntries();
        fetchSummary();
    }, [fetchEntries, fetchSummary]);

    // ─── Filtered from state (fallback + real-time) ─────────────────────────
    const entriesFromState = useMemo(() => {
        if (!state.stockMovements?.length) return [];

        let list = state.stockMovements.filter(m =>
            ENTRY_REASONS.includes(m.reason)
        );

        if (filterType) list = list.filter(m => m.reason === filterType);
        if (dateFrom) list = list.filter(m => new Date(m.createdAt) >= new Date(dateFrom));
        if (dateTo) list = list.filter(m => new Date(m.createdAt) <= new Date(dateTo + 'T23:59:59'));

        return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [state.stockMovements, filterType, dateFrom, dateTo, ENTRY_REASONS]);

    // Use API entries if loaded, fallback to state
    const displayEntries = entries.length > 0 ? entries : entriesFromState;

    // ─── KPI from state (always real-time) ──────────────────────────────────
    const kpis = useMemo(() => {
        let movements = state.stockMovements || [];

        if (dateFrom) movements = movements.filter(m => new Date(m.createdAt) >= new Date(dateFrom));
        if (dateTo) movements = movements.filter(m => new Date(m.createdAt) <= new Date(dateTo + 'T23:59:59'));

        const result = {};
        for (const key of ENTRY_REASONS) {
            const filtered = movements.filter(m => m.reason === key);
            result[key] = {
                count: filtered.length,
                totalCost: filtered.reduce((sum, m) => sum + Number(m.totalCost || 0), 0)
            };
        }

        const totalCost = Object.values(result).reduce((sum, v) => sum + v.totalCost, 0);

        return { ...result, totalCost };
    }, [state.stockMovements, dateFrom, dateTo, ENTRY_REASONS]);

    // ─── Submit ─────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!entryDate) return toast.error('Informe a data do lançamento');
        for (const item of items) {
            if (!item.productId) return toast.error("Selecione um produto em todos os itens");
            if (!item.quantity || Number(item.quantity) <= 0) return toast.error("Informe uma quantidade válida em todos os itens");
        }

        const payloadItems = items.map(item => {
            const selectedProduct = state.products.find(p => p.id === item.productId);
            const pack = selectedProduct?.type === 'PRODUCTION' ? 1 : Number(selectedProduct?.packQuantity || 1);
            return {
                productId: item.productId,
                quantity: Number(item.quantity) * pack,
                locationId: item.locationId || undefined
            };
        });

        setSubmitting(true);
        try {
            await api.post('/entries', {
                entryDate,
                entryType: formType,
                notes: formNotes || undefined,
                items: payloadItems
            });
            toast.success("Lançamento(s) registrado(s) com sucesso!");
            setShowModal(false);
            setItems([EMPTY_ITEM()]);
            setFormNotes('');
            await fetchAllData();
            await fetchEntries();
            await fetchSummary();
        } catch (err) {
            console.error(err);
            toast.error(err.response?.data?.message || "Erro ao registrar lançamento");
        } finally {
            setSubmitting(false);
        }
    };

    const hasFilters = filterType || dateFrom || dateTo;

    // ─── Export PDF ─────────────────────────────────────────────────────────
    const exportToPDF = () => {
        const doc = new jsPDF('landscape');
        
        doc.setFontSize(18);
        doc.text('Relatório de Lançamentos', 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        
        const periodText = (dateFrom || dateTo) 
            ? `Período: ${dateFrom ? new Date(dateFrom).toLocaleDateString('pt-BR') : 'Início'} até ${dateTo ? new Date(dateTo + 'T23:59:59').toLocaleDateString('pt-BR') : 'Hoje'}`
            : 'Período: Todos os lançamentos';
            
        doc.text(periodText, 14, 30);
        
        if (filterType && ENTRY_TYPES[filterType]) {
            doc.text(`Filtro: ${ENTRY_TYPES[filterType].label}`, 14, 36);
        }

        const tableColumn = ["Data/Hora", "Produto", "Tipo", "Quantidade", "Custo", "Referência"];
        const tableRows = [];

        displayEntries.forEach(m => {
            const config = ENTRY_TYPES[m.reason] || { label: m.reason };
            const product = state.products?.find(p => p.id === m.productId);
            const pack = Number(product?.packQuantity || 1);
            const pUnit = product?.purchaseUnit || 'un';
            const bUnit = product?.unit || 'ml';
            const qty = Math.abs(Number(m.quantity || 0));
            const qtyInUnits = (qty / pack).toFixed(2);
            
            const dateStr = `${new Date(m.createdAt).toLocaleDateString('pt-BR')} ${new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            
            const rowData = [
                dateStr,
                m.productName || '-',
                config.label,
                `${qtyInUnits} ${pUnit} (${qty.toFixed(0)} ${bUnit})`,
                formatCurrency(Number(m.totalCost || 0)),
                m.reference || '-'
            ];
            
            tableRows.push(rowData);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: filterType ? 42 : 36,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255 }
        });
        
        let currentY = doc.lastAutoTable.finalY + 10 || 52;
        
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont(undefined, 'bold');
        doc.text('Resumo (KPIs):', 14, currentY);
        currentY += 6;
        
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        
        Object.entries(ENTRY_TYPES).forEach(([key, config]) => {
            const kpi = kpis[key];
            if (kpi && kpi.count > 0) {
                doc.text(`- ${config.label}: ${kpi.count} lançamento(s) | Custo: ${formatCurrency(kpi.totalCost)}`, 14, currentY);
                currentY += 6;
            }
        });
        
        currentY += 2;
        doc.setFont(undefined, 'bold');
        doc.setFontSize(11);
        doc.text(`Custo Total Geral: ${formatCurrency(kpis.totalCost || 0)}`, 14, currentY);

        doc.save('lancamentos.pdf');
    };

    return (
        <>
            <PageHeader>
                <div>
                    <PageTitle>Lançamentos</PageTitle>
                    <PageSubtitle>
                        Registre e acompanhe cortesias, drinks em dobro, promoções e perdas operacionais
                    </PageSubtitle>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button onClick={exportToPDF} size="md" variant="secondary">
                        <MdPictureAsPdf style={{ color: '#EF4444' }} /> Exportar PDF
                    </Button>
                    <Button onClick={() => { setEntryDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())); setShowModal(true); }} size="md">
                        <MdAdd /> Novo Lançamento
                    </Button>
                </div>
            </PageHeader>

            {/* ─── KPI Cards ─────────────────────────────────────────────────────── */}
            <KpiGrid>
                {Object.entries(ENTRY_TYPES).map(([key, config]) => (
                    <KpiCard key={key} $accent={config.color}>
                        <KpiIcon $color={config.color}>
                            {config.icon}
                            <KpiLabel>{config.label}</KpiLabel>
                        </KpiIcon>
                        <KpiValue $color={config.color}>
                            {formatCurrency(kpis[key]?.totalCost || 0)}
                        </KpiValue>
                        <KpiSub>
                            {kpis[key]?.count || 0} lançamento(s) no período
                        </KpiSub>
                    </KpiCard>
                ))}

                <KpiCard $accent="#1E293B">
                    <KpiIcon $color="#1E293B">
                        <MdReceiptLong />
                        <KpiLabel>Total Geral</KpiLabel>
                    </KpiIcon>
                    <KpiValue $color="#1E293B">
                        {formatCurrency(kpis.totalCost || 0)}
                    </KpiValue>
                    <KpiSub>
                        custo total de lançamentos
                    </KpiSub>
                </KpiCard>
            </KpiGrid>

            {/* ─── Filters ───────────────────────────────────────────────────────── */}
            <FiltersBar>
                <MdFilterList style={{ color: '#6D5EF4', flexShrink: 0 }} />

                <FilterGroup>
                    Tipo:
                    <Select value={filterType} onChange={setFilterType}
                        options={[
                            { value: "", label: "Todos" },
                            ...Object.entries(ENTRY_TYPES).map(([key, cfg]) => ({
                                value: key,
                                label: cfg.label
                            }))
                        ]}
                    />
                </FilterGroup>

                <FilterGroup>
                    De:
                    <DateInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </FilterGroup>

                <FilterGroup>
                    Até:
                    <DateInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </FilterGroup>

                {hasFilters && (
                    <ClearBtn onClick={() => { setFilterType(''); setDateFrom(''); setDateTo(''); }}>
                        Limpar
                    </ClearBtn>
                )}
            </FiltersBar>

            {/* ─── Table ─────────────────────────────────────────────────────────── */}
            <Card padding="0">
                {displayEntries.length === 0 ? (
                    <EmptyState
                        icon={<MdReceiptLong />}
                        title="Nenhum lançamento encontrado"
                        subtitle="Os lançamentos de cortesia, promoções e drink em dobro aparecerão aqui."
                    />
                ) : (
                    <TableWrap>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Data / Hora</Th>
                                    <Th>Produto</Th>
                                    <Th>Tipo</Th>
                                    <Th>Quantidade</Th>
                                    <Th>Custo</Th>
                                    <Th>Referência</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayEntries.map((m) => {
                                    const config = ENTRY_TYPES[m.reason] || {
                                        label: m.reason,
                                        icon: <MdReceiptLong />,
                                        color: '#64748B',
                                        bgColor: 'rgba(100,116,139,0.1)'
                                    };

                                    const product = state.products?.find(p => p.id === m.productId);
                                    const pack = Number(product?.packQuantity || 1);
                                    const pUnit = product?.purchaseUnit || 'un';
                                    const bUnit = product?.unit || 'ml';
                                    const qty = Math.abs(Number(m.quantity || 0));
                                    const qtyInUnits = (qty / pack).toFixed(2);

                                    return (
                                        <Tr key={m.id}>
                                            <Td data-label="Data / Hora" style={{ whiteSpace: 'nowrap', color: '#6B7280', fontSize: '0.8rem' }}>
                                                {new Date(m.createdAt).toLocaleDateString('pt-BR')}{' '}
                                                {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </Td>
                                            <Td data-label="Produto">
                                                <strong>{m.productName}</strong>
                                            </Td>
                                            <Td data-label="Tipo">
                                                <TypeBadge $color={config.color} $bg={config.bgColor}>
                                                    {config.icon} {config.label}
                                                </TypeBadge>
                                            </Td>
                                            <Td data-label="Quantidade">
                                                <span style={{ fontWeight: 600, color: '#DC2626' }}>
                                                    -{qtyInUnits} {pUnit}
                                                </span>
                                                <span style={{ marginLeft: '8px', fontSize: '11px', color: '#94A3B8' }}>
                                                    ({qty.toFixed(0)} {bUnit})
                                                </span>
                                            </Td>
                                            <Td data-label="Custo">
                                                <span style={{ fontWeight: 700, color: '#DC2626' }}>
                                                    {formatCurrency(Number(m.totalCost || 0))}
                                                </span>
                                            </Td>
                                            <Td data-label="Referência" style={{ color: '#4B5563', fontSize: '0.8rem' }}>
                                                {m.reference}
                                            </Td>
                                        </Tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </TableWrap>
                )}
            </Card>

            {/* ─── Modal Novo Lançamento ──────────────────────────────────────────── */}
            {showModal && (
                <Modal
                    isOpen={true}
                    title="Novo Lançamento"
                    onClose={() => setShowModal(false)}
                    maxWidth="600px"
                >
                    <FormGrid>
                        <Input
                            label="Data do lançamento"
                            type="date"
                            value={entryDate}
                            onChange={(event) => setEntryDate(event.target.value)}
                            required
                        />
                        {/* Tipo */}
                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '10px', display: 'block', color: '#64748b' }}>
                                Tipo de Lançamento
                            </label>
                            <TypeSelector>
                                {Object.entries(ENTRY_TYPES).map(([key, cfg]) => (
                                    <TypeOption
                                        key={key}
                                        $active={formType === key}
                                        $color={cfg.color}
                                        $bg={cfg.bgColor}
                                        onClick={() => setFormType(key)}
                                        type="button"
                                    >
                                        {cfg.icon}
                                        {cfg.label}
                                    </TypeOption>
                                ))}
                            </TypeSelector>
                            {formType && (
                                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '8px' }}>
                                    {ENTRY_TYPES[formType]?.description}
                                </p>
                            )}
                        </div>

                        {items.map((item, idx) => {
                            const selectedProduct = state.products?.find(p => p.id === item.productId);
                            return (
                                <ManualItemCard key={item._key}>
                                    <ManualItemHeader>
                                        <ManualItemNumber>Item {idx + 1}</ManualItemNumber>
                                        {items.length > 1 && (
                                            <DSButton
                                                type="button"
                                                onClick={() => removeItem(item._key)}
                                                style={{ 
                                                    background: 'transparent', border: 'none', color: '#EF4444', 
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center' 
                                                }}
                                            >
                                                <MdRemoveCircleOutline size={20} />
                                            </DSButton>
                                        )}
                                    </ManualItemHeader>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {/* Produto */}
                                        <Select
                                            label="Produto"
                                            value={item.productId}
                                            onChange={(val) => updateItem(item._key, "productId", val)}
                                            options={[
                                                { value: '', label: 'Selecione um produto...' },
                                                ...(state.products || [])
                                                    .filter(p => p.isActive !== false)
                                                    .map((p) => {
                                                        const pack = Number(p.packQuantity || 1);
                                                        const inUnits = (Number(p.quantity || 0) / pack).toFixed(2);
                                                        return {
                                                            value: p.id,
                                                            label: `${p.name} (Estoque: ${inUnits} ${p.purchaseUnit || 'un'})`,
                                                        };
                                                    })
                                            ]}
                                        />

                                        <ManualGrid>
                                            {/* Local */}
                                            <Select
                                                label="Local (Opcional)"
                                                value={item.locationId}
                                                onChange={(val) => updateItem(item._key, "locationId", val)}
                                                options={[
                                                    { value: "", label: "Local padrão" },
                                                    ...locations.map(l => ({ value: l.id, label: l.name }))
                                                ]}
                                            />

                                            {/* Quantidade */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <Input
                                                    label={`Quantidade (${selectedProduct?.purchaseUnit || 'unidades'})`}
                                                    type="number"
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    value={item.quantity}
                                                    onChange={(e) => updateItem(item._key, "quantity", e.target.value)}
                                                />
                                            </div>
                                        </ManualGrid>

                                        {/* Preview */}
                                        {selectedProduct && item.quantity && Number(item.quantity) > 0 && (() => {
                                            const pack = selectedProduct.type === 'PRODUCTION' ? 1 : Number(selectedProduct.packQuantity || 1);
                                            const moveAmount = Number(item.quantity) * pack;
                                            
                                            const targetLocId = item.locationId || selectedProduct.defaultLocationId || (locations.find(l => l.isDefault)?.id);
                                            const stockObj = selectedProduct.productStocks?.find(s => s.locationId === targetLocId);
                                            const prevQty = stockObj ? Number(stockObj.quantity) : 0;
                                            
                                            const newQty = prevQty - moveAmount;
                                            const inUnits = (newQty / pack).toFixed(2);

                                            return (
                                                <ResultBox>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span>Estoque base: {(Number(item.quantity) * pack).toFixed(0)} {selectedProduct.unit || 'ml'}</span>
                                                        <strong>Atual: {(prevQty / pack).toFixed(2)} {selectedProduct.purchaseUnit}</strong>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>Após lançamento:</span>
                                                        <strong style={{
                                                            color: newQty < 0 ? "#DC2626" : "#059669",
                                                            fontSize: '15px'
                                                        }}>
                                                            {inUnits} {selectedProduct.purchaseUnit}
                                                        </strong>
                                                    </div>
                                                </ResultBox>
                                            );
                                        })()}
                                    </div>
                                </ManualItemCard>
                            );
                        })}

                        <DSButton
                            type="button"
                            onClick={addItem}
                            style={{ 
                                width: "100%", padding: "10px", marginBottom: "8px", 
                                border: "1.5px dashed #CBD5E1", borderRadius: "10px",
                                background: "transparent", color: "#475569", fontWeight: 600,
                                cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px"
                            }}
                        >
                            <MdAdd size={18} />
                            Adicionar outro produto
                        </DSButton>

                        {/* Observação */}
                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', display: 'block', color: '#64748b' }}>
                                Observação (opcional)
                            </label>
                            <NoteInput
                                placeholder="Ex: Cliente VIP mesa 12, Promoção sexta-feira..."
                                value={formNotes}
                                onChange={(e) => setFormNotes(e.target.value)}
                            />
                        </div>

                        {/* Submit */}
                        <Button
                            fullWidth
                            onClick={handleSubmit}
                            disabled={submitting || items.length === 0 || items.some(i => !i.productId || !i.quantity)}
                            size="lg"
                        >
                            {submitting ? "Registrando..." : "Confirmar Lançamento"}
                        </Button>
                    </FormGrid>
                </Modal>
            )}
        </>
    );
}

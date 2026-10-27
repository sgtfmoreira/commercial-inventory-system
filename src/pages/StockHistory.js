import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import {
    MdHistory,
    MdArrowUpward,
    MdArrowDownward,
    MdSwapHoriz,
    MdFilterList,
} from 'react-icons/md';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Select from '../components/Select';
import Button from '../components/Button';
import api from '../services/api';


// ─── Styled ───────────────────────────────────────────────────────────────────
const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};

  @media (max-width: 480px) {
    flex-direction: column;
    align-items: stretch;
    
    button {
      width: 100%;
      justify-content: center;
    }
  }
`;
const PageTitle = styled.h1`font-size:${({ theme }) => theme.fontSizes['3xl']};font-weight:${({ theme }) => theme.fontWeights.bold};`;
const PageSubtitle = styled.p`color:${({ theme }) => theme.colors.textSecondary};font-size:${({ theme }) => theme.fontSizes.sm};margin-top:4px;`;

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

const SummaryRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SummaryCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 3px solid ${({ accent }) => accent || 'transparent'};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const SummaryLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;

const SummaryValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ color }) => color || 'inherit'};
`;

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
      padding-top: 15px;
      justify-content: stretch;
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

const TypeIcon = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 1rem;
  color: ${({ color }) => color};
`;

const QtyDelta = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ $positive, theme }) => $positive ? theme.colors.success : theme.colors.danger};
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const PaginationActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

// ─── Type config ──────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
    entry: { label: 'Entrada', variant: 'success', icon: <MdArrowUpward />, color: 'var(--color-success)', positive: true },
    exit: { label: 'Saída', variant: 'danger', icon: <MdArrowDownward />, color: 'var(--color-danger)', positive: false },
    adjustment: { label: 'Ajuste', variant: 'info', icon: <MdSwapHoriz />, color: 'var(--color-info)', positive: null },
};

// ─── Component ────────────────────────────────────────────────────────────────
const StockHistory = () => {
    const { state } = useApp();

    const [filterProduct, setFilterProduct] = useState('');
    const [filterType, setFilterType] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 50, totalItems: 0, totalPages: 0 });
    const [summary, setSummary] = useState({ total: 0, entry: 0, exit: 0, bonus: 0, consumption: 0 });
    const requestSequence = useRef(0);


    // 🔥 1. FUNÇÃO PRIMEIRO
    const getMovementType = (m) => {
        const type = m.type?.toUpperCase();

        if (["PURCHASE", "BONUS", "IN"].includes(type)) return "entry";

        if (type === "OUT") return "exit";

        if (type === "TRANSFER") {
            return m.newQuantity > m.previousQuantity ? "entry" : "exit";
        }

        return "adjustment";
    };

    const loadMovements = useCallback(async () => {
        const requestId = ++requestSequence.current;
        setLoading(true);
        try {
            const params = { page, pageSize: 50 };
            if (filterProduct) params.productId = filterProduct;
            if (filterType) params.movementType = filterType;
            if (dateFrom) params.dateFrom = dateFrom;
            if (dateTo) params.dateTo = dateTo;

            const result = await api.get('/stock-movements', { params });
            if (requestId !== requestSequence.current) return;
            setMovements(result?.items || []);
            setPagination(result?.pagination || { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 });
            setSummary(result?.summary || { total: 0, entry: 0, exit: 0, bonus: 0, consumption: 0 });
            if (result?.pagination?.page && result.pagination.page !== page) {
                setPage(result.pagination.page);
            }
        } finally {
            if (requestId === requestSequence.current) setLoading(false);
        }
    }, [page, filterProduct, filterType, dateFrom, dateTo]);

    useEffect(() => {
        const timer = setTimeout(loadMovements, 250);
        return () => clearTimeout(timer);
    }, [loadMovements, state.establishment?.id]);

    useEffect(() => {
        setPage(1);
    }, [state.establishment?.id]);

    const hasFilters = filterProduct || filterType || dateFrom || dateTo;

    const clearFilters = () => {
        setFilterProduct('');
        setFilterType('');
        setDateFrom('');
        setDateTo('');
        setPage(1);
    };

    const movementProducts = useMemo(() => {
        return [...(state.products || [])]
            .filter((product) => product.trackInventory !== false)
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }, [state.products]);

    const productsById = useMemo(
        () => new Map((state.products || []).map((product) => [product.id, product])),
        [state.products]
    );

    const updateFilter = (setter) => (value) => {
        setter(value);
        setPage(1);
    };

    return (
        <>
            <PageHeader>
                <div>
                    <PageTitle>Histórico de Estoque</PageTitle>
                    <PageSubtitle>
                        {pagination.totalItems} movimento(s) encontrado(s)
                    </PageSubtitle>
                </div>
            </PageHeader>

            {/* Filters */}
            <FiltersBar>
                <MdFilterList style={{ color: '#6D5EF4', flexShrink: 0 }} />

                <FilterGroup>
                    Produto:
                    <Select value={filterProduct} onChange={updateFilter(setFilterProduct)}
                        options={[
                            { value: "", label: "Todos" },
                            ...movementProducts.map(p => ({ value: p.id, label: p.name }))
                        ]}
                    />
                </FilterGroup>

                <FilterGroup>
                    Tipo:
                    <Select value={filterType} onChange={updateFilter(setFilterType)}
                        options={[
                            { value: "", label: "Todos" },
                            { value: "entry", label: "Entrada" },
                            { value: "exit", label: "Saída" },
                            { value: "adjustment", label: "Ajuste" }
                        ]}
                    />
                </FilterGroup>

                <FilterGroup>
                    De:
                    <DateInput type="date" value={dateFrom} onChange={(e) => updateFilter(setDateFrom)(e.target.value)} />
                </FilterGroup>

                <FilterGroup>
                    Até:
                    <DateInput type="date" value={dateTo} onChange={(e) => updateFilter(setDateTo)(e.target.value)} />
                </FilterGroup>

                {hasFilters && <ClearBtn onClick={clearFilters}>Limpar</ClearBtn>}
            </FiltersBar>

            {/* Summary */}
            <SummaryRow>
                <SummaryCard accent="#6D5EF4">
                    <SummaryLabel>Total filtrado</SummaryLabel>
                    <SummaryValue color="var(--color-text)">{summary.total}</SummaryValue>
                </SummaryCard>
                <SummaryCard accent="var(--color-success)">
                    <SummaryLabel>Entradas</SummaryLabel>
                    <SummaryValue color="var(--color-success)">{summary.entry}</SummaryValue>
                </SummaryCard>
                <SummaryCard accent="var(--color-danger)">
                    <SummaryLabel>Saídas</SummaryLabel>
                    <SummaryValue color="var(--color-danger)">{summary.exit}</SummaryValue>
                </SummaryCard>
                <SummaryCard accent="#5B4BD8">
                    <SummaryLabel>Bonificação</SummaryLabel>
                    <SummaryValue>{summary.bonus}</SummaryValue>
                </SummaryCard>

                <SummaryCard accent="var(--color-danger)">
                    <SummaryLabel>Consumo Interno</SummaryLabel>
                    <SummaryValue>{summary.consumption}</SummaryValue>
                </SummaryCard>

            </SummaryRow>

            {/* Table */}
            <Card padding="0">
                {!loading && movements.length === 0 ? (
                    <EmptyState
                        icon={<MdHistory />}
                        title="Nenhum movimento encontrado"
                        subtitle="Os movimentos de estoque aparecerão aqui à medida que forem registrados."
                    />
                ) : (
                    <TableWrap>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>Data / Hora</Th>
                                    <Th>Produto</Th>
                                    <Th>Tipo</Th>
                                    <Th>Qtd. Movimentada</Th>
                                    <Th>Estoque Anterior</Th>
                                    <Th>Estoque Novo</Th>
                                    <Th>Referência</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {movements.map((m) => {
                                    const movementType = getMovementType(m);
                                    const cfg = TYPE_CONFIG[movementType];
                                    const isPositive = Number(m.newQuantity) > Number(m.previousQuantity);

                                    const product = productsById.get(m.productId);
                                    const pack = Number(product?.packQuantity || 1);
                                    const pUnit = product?.purchaseUnit || 'un';
                                    const bUnit = product?.unit || 'ml';

                                    const deltaRaw = Number(m.newQuantity) - Number(m.previousQuantity);
                                    const deltaConv = deltaRaw / pack;
                                    const prevConv = Number(m.previousQuantity) / pack;
                                    const newConv = Number(m.newQuantity) / pack;

                                    return (
                                        <Tr key={m.id}>
                                            <Td data-label="Data / Hora" style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                                                {new Date(m.createdAt).toLocaleDateString('pt-BR')}{' '}
                                                {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </Td>
                                            <Td data-label="Produto"><strong>{m.productName}</strong></Td>
                                            <Td data-label="Tipo">
                                                <Badge variant={cfg.variant}>
                                                    <TypeIcon color={cfg.color}>{cfg.icon}</TypeIcon>
                                                    {cfg.label}
                                                </Badge>
                                            </Td>
                                            <Td data-label="Qtd. Movimentada">
                                                <QtyDelta $positive={isPositive}>
                                                    {isPositive ? '+' : ''}{deltaConv.toFixed(2)} {pUnit}
                                                </QtyDelta>
                                                <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                                                    ({isPositive ? '+' : ''}{deltaRaw.toFixed(0)} {bUnit})
                                                </span>
                                            </Td>
                                            <Td data-label="Estoque Anterior">
                                                <span style={{ color: '#4B5563', fontWeight: 500 }}>
                                                    {prevConv.toFixed(2)} {pUnit}
                                                </span>
                                                <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                    ({Number(m.previousQuantity).toFixed(0)} {bUnit})
                                                </span>
                                            </Td>
                                            <Td data-label="Estoque Novo">
                                                <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
                                                    {newConv.toFixed(2)} {pUnit}
                                                </span>
                                                <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                    ({Number(m.newQuantity).toFixed(0)} {bUnit})
                                                </span>
                                            </Td>
                                            <Td data-label="Referência" style={{ color: '#4B5563', fontSize: '0.8rem' }}>{m.reference}</Td>
                                        </Tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </TableWrap>
                )}
                <Pagination>
                    <span>
                        {loading ? 'Carregando...' : `${pagination.totalItems} registro(s) · Página ${pagination.page} de ${pagination.totalPages || 1}`}
                    </span>
                    <PaginationActions>
                        <Button size="sm" variant="secondary" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>
                            Anterior
                        </Button>
                        <Button size="sm" variant="secondary" disabled={loading || page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>
                            Próxima
                        </Button>
                    </PaginationActions>
                </Pagination>
            </Card>
        </>
    );
};

export default StockHistory;

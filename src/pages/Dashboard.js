import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useState, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import { MdCalendarToday } from 'react-icons/md';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/formatCurrency';
import Card from '../components/Card';
import Select from '../components/Select';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  ResponsiveContainer
} from "recharts";

// ─── Styled ────────────────────────────────────────────────────────────────────
const PageHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 4px;
`;



const PageSubtitle = styled.p`
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const FiltersRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  flex-wrap: wrap;
`;

const FilterLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DateInput = styled(InputControl)`
  background: ${({ theme }) => theme.colors.bgInput};
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  padding: 8px 12px;
  outline: none;
  transition: ${({ theme }) => theme.transition};
  &:focus { border-color: ${({ theme }) => theme.colors.borderFocus}; }
  &::-webkit-calendar-picker-indicator { filter: invert(0.8); }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const StatCard = styled(Card)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0,0,0,0.06);
  }
`;



const StatInfo = styled.div``;

const StatLabel = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`;

const StatValue = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const StatSub = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const LowStockTable = styled.div`
  overflow-x: auto;
`;

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

  &:hover {
    background: ${({ theme }) => theme.colors.bgHover};
  }

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

const StockBar = styled.div`
  width: 100%;
  height: 5px;
  background: ${({ theme }) => theme.colors.bgInput};
  border-radius: 999px;
  overflow: hidden;
  margin-top: 4px;
`;

const StockFill = styled.div`
  height: 100%;
  width: ${({ pct }) => Math.min(pct, 100)}%;
  background: ${({ pct, theme }) =>
    pct < 30 ? theme.colors.danger :
      pct < 60 ? theme.colors.warning :
        theme.colors.success};
  border-radius: 3px;
  transition: width 0.6s ease;
`;

const EmptyNote = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.successLight};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.success};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`;

// ─── Component ─────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { state, getLowStockProducts } = useApp();

  const now = new Date();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [productionStats, setProductionStats] = useState(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const { default: api } = await import('../services/api');
        const res = await api.get('/purchase-suggestions?days=7');
        setSuggestions(res.items || []);
      } catch (err) {
        console.error("Erro ao buscar suggestions no dashboard:", err);
      }
    };
    fetchSuggestions();
  }, []);

  useEffect(() => {
    const fetchProductionStats = async () => {
      try {
        const { default: api } = await import('../services/api');
        let url = '/productions/stats';
        const params = new URLSearchParams();
        if (dateFrom) params.append('startDate', dateFrom);
        if (dateTo) params.append('endDate', dateTo);
        if (params.toString()) url += `?${params.toString()}`;
        const res = await api.get(url);
        setProductionStats(res);
      } catch (err) {
        console.error("Erro ao buscar stats de produção:", err);
      }
    };
    fetchProductionStats();
  }, [dateFrom, dateTo]);

  const totalEstimatedPurchase = useMemo(() => {
    return suggestions.reduce((sum, s) => {
      const price = Number(s.bestPrice || 0);
      const qty = Number(s.suggestedQuantity || 0);
      return sum + (price * qty);
    }, 0);
  }, [suggestions]);

  const filteredProducts = useMemo(() => {
    let list = state.products || [];
    if (filterCategory) {
      list = list.filter(p => p.categoryId === filterCategory);
    }
    return list;
  }, [state.products, filterCategory]);

  const filteredMovements = useMemo(() => {
    console.log("MOVEMENTS:", state.stockMovements);
    let list = state.stockMovements || [];

    if (dateFrom) {
      list = list.filter(m => new Date(m.createdAt) >= new Date(dateFrom));
    }

    if (dateTo) {
      list = list.filter(m => new Date(m.createdAt) <= new Date(dateTo + 'T23:59:59'));
    }

    if (filterCategory) {
      // Assuming m.productId can be used to find the product category
      list = list.filter(m => {
        const product = state.products?.find(p => p.id === m.productId);
        return product?.categoryId === filterCategory;
      });
    }

    console.log("MOVEMENTS:", state.stockMovements);

    return list;
  }, [state.stockMovements, dateFrom, dateTo, filterCategory, state.products]);

  const filteredValue = useMemo(
    () => filteredProducts
      // 🔥 FIX: Excluir ASSET (patrimônio) — eles não são estoque de insumos
      .filter(p => p.type === 'INVENTORY')
      .reduce(
        (sum, p) => {
          // 🔥 FIX: Usar mesma hierarquia de custo do backend:
          // 1º currentCost (atualizado a cada compra)
          // 2º menor preço de fornecedor ÷ packQuantity
          // 3º unitPrice ÷ packQuantity
          let unitCost = 0;
          if (Number(p.currentCost) > 0) {
            unitCost = Number(p.currentCost);
          } else if (p.productSuppliers && p.productSuppliers.length > 0) {
            const bestPrice = Math.min(...p.productSuppliers.map(s => Number(s.price)));
            unitCost = bestPrice / (Number(p.packQuantity) || 1);
          } else {
            unitCost = Number(p.unitPrice || 0) / (Number(p.packQuantity) || 1);
          }
          return sum + (unitCost * Number(p.quantity || 0));
        },
        0
      ),
    [filteredProducts]
  );

  const totalConsumption = useMemo(() => {
    if (!filteredMovements?.length) return 0;

    const outValue = filteredMovements
      .filter(m => m.type === "OUT" && !["LOSS", "OPERATIONAL_LOSS", "CONSIGNMENT_RETURN", "SUPPLIER_RETURN"].includes(m.reason))
      .reduce((sum, m) => sum + Number(m.totalCost || 0), 0);

    const inValue = filteredMovements
      .filter(m => m.type === "IN" && m.reason === "MARKETING_EVENT_IN")
      .reduce((sum, m) => sum + Number(m.totalCost || 0), 0);

    return Math.max(0, outValue - inValue);

  }, [filteredMovements]);

  const internalConsumptionValue = useMemo(() => {
    if (!filteredMovements?.length) return 0;

    return filteredMovements
      .filter(m => m.reason === "INTERNAL_USE")
      .reduce((sum, m) => sum + Number(m.totalCost || 0), 0);

  }, [filteredMovements]);

  const internalConsumptionPercent = useMemo(() => {
    if (!totalConsumption) return 0;

    return (internalConsumptionValue / totalConsumption) * 100;

  }, [internalConsumptionValue, totalConsumption]);

  const criticalProducts = useMemo(() => {
    if (!filteredProducts?.length) return 0;

    return filteredProducts.filter(
      (p) => Number(p.quantity || 0) <= Number(p.minQuantity || 0)
    ).length;

  }, [filteredProducts]);

  const mostLossProduct = useMemo(() => {
    if (!filteredMovements?.length) return null;

    const map = {};

    filteredMovements
      .filter(m => m.reason === "LOSS" || m.reason === "OPERATIONAL_LOSS")
      .forEach(m => {
        if (!map[m.productId]) {
          map[m.productId] = {
            id: m.productId,
            name: m.productName,
            value: 0,
            quantity: 0
          };
        }

        map[m.productId].value += Number(m.totalCost || 0);
        map[m.productId].quantity += Math.abs(Number(m.quantity || 0));
      });

    // Ordena por valor, mas se todos forem 0, ordena por quantidade
    const sorted = Object.values(map).sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return b.quantity - a.quantity;
    });

    return sorted[0] || null;

  }, [filteredMovements]);



  const lowStock = useMemo(() => {
    const list = getLowStockProducts();
    if (filterCategory) {
      return list.filter(p => p.categoryId === filterCategory);
    }
    return list;
  }, [getLowStockProducts, filterCategory]);
  const pendingOrders = state.purchaseOrders.filter((o) => o.status === 'pending');
  const lossValue = useMemo(() => {
    if (!filteredMovements?.length) return { value: 0, count: 0 };

    const lossMovements = filteredMovements.filter((m) => m.reason === "LOSS");

    return {
      value: lossMovements.reduce((sum, m) => sum + Number(m.totalCost || 0), 0),
      count: lossMovements.length
    };

  }, [filteredMovements]);
  const mostConsumedProduct = useMemo(() => {
    if (!filteredMovements?.length) return null;

    const map = {};

    filteredMovements.forEach(m => {
      if ((m.type === "OUT" && !["LOSS", "CONSIGNMENT_RETURN", "SUPPLIER_RETURN"].includes(m.reason)) || (m.type === "IN" && m.reason === "MARKETING_EVENT_IN")) {
        if (!map[m.productId]) {
          map[m.productId] = {
            id: m.productId,
            name: m.productName,
            quantity: 0
          };
        }

        if (m.type === "OUT") {
          map[m.productId].quantity += Math.abs(Number(m.quantity));
        } else {
          map[m.productId].quantity -= Math.abs(Number(m.quantity));
        }
      }
    });

    const sorted = Object.values(map)
      .filter(p => p.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity);

    return sorted[0] || null;

  }, [filteredMovements]);

  const topConsumedProducts = useMemo(() => {
    if (!filteredMovements?.length) return [];

    const map = {};

    filteredMovements.forEach(m => {
      if ((m.type === "OUT" && !["LOSS", "CONSIGNMENT_RETURN", "SUPPLIER_RETURN"].includes(m.reason)) || (m.type === "IN" && m.reason === "MARKETING_EVENT_IN")) {
        if (!map[m.productId]) {
          map[m.productId] = {
            name: m.productName,
            quantity: 0
          };
        }

        if (m.type === "OUT") {
          map[m.productId].quantity += Math.abs(Number(m.quantity));
        } else {
          map[m.productId].quantity -= Math.abs(Number(m.quantity));
        }
      }
    });

    const result = Object.values(map)
      .filter(p => p.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    console.log("TOP PRODUCTS:", result);

    return result;

  }, [filteredMovements]);



  // 🔥 CONSUMO INTERNO (mantido)
  const mostInternalUse = useMemo(() => {
    if (!filteredMovements?.length) return null;

    const map = {};

    filteredMovements
      .filter(m => m.reason === "INTERNAL_USE")
      .forEach(m => {
        if (!map[m.productId]) {
          map[m.productId] = {
            id: m.productId,
            name: m.productName,
            quantity: 0
          };
        }

        map[m.productId].quantity += Number(m.quantity);
      });

    const sorted = Object.values(map).sort((a, b) => b.quantity - a.quantity);

    return sorted[0] || null;

  }, [filteredMovements]);

  const totalBonus = useMemo(() => {
    if (!filteredMovements?.length) return 0;

    return filteredMovements
      .filter(m => m.reason === "BONUS")
      .reduce((sum, m) => sum + Number(m.totalCost || 0), 0);

  }, [filteredMovements]);

  const doubleDrinkValue = useMemo(() => {
    if (!filteredMovements?.length) return 0;
    return filteredMovements
      .filter(m => m.reason === 'DOUBLE_DRINK')
      .reduce((sum, m) => sum + Number(m.totalCost || 0), 0);
  }, [filteredMovements]);

  const courtesyValue = useMemo(() => {
    if (!filteredMovements?.length) return 0;
    return filteredMovements
      .filter(m => m.reason === 'COURTESY')
      .reduce((sum, m) => sum + Number(m.totalCost || 0), 0);
  }, [filteredMovements]);

  const promoValue = useMemo(() => {
    if (!filteredMovements?.length) return 0;
    return filteredMovements
      .filter(m => m.reason === 'PROMO')
      .reduce((sum, m) => sum + Number(m.totalCost || 0), 0);
  }, [filteredMovements]);

  const totalLoss = useMemo(() => {
    if (!state.stockMovements?.length) return { value: 0, count: 0 };

    const lossMovements = state.stockMovements.filter(m => m.reason === "LOSS");

    return {
      value: lossMovements.reduce((sum, m) => sum + Number(m.totalCost || 0), 0),
      count: lossMovements.length
    };

  }, [state.stockMovements]);

  const topInternalUseProducts = useMemo(() => {
    if (!filteredMovements?.length) return [];

    const map = {};

    filteredMovements
      .filter(m => m.reason === "INTERNAL_USE")
      .forEach(m => {
        if (!map[m.productId]) {
          map[m.productId] = {
            name: m.productName,
            quantity: 0
          };
        }

        map[m.productId].quantity += Number(m.quantity);
      });

    const result = Object.values(map)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    console.log("INTERNAL USE:", result);

    return result;

  }, [filteredMovements]);


  const marketingInvestmentValue = useMemo(() => {
    if (!filteredMovements?.length) return 0;

    const withdrawals = filteredMovements
      .filter(m => m.reason === "MARKETING_EVENT_OUT")
      .reduce((acc, m) => acc + (Math.abs(Number(m.quantity)) * Number(m.unitCost || 0)), 0);

    const returns = filteredMovements
      .filter(m => m.reason === "MARKETING_EVENT_IN")
      .reduce((acc, m) => acc + (Math.abs(Number(m.quantity)) * Number(m.unitCost || 0)), 0);

    return withdrawals - returns;
  }, [filteredMovements]);

  const internalUseTrend = useMemo(() => {
    if (!filteredMovements?.length) return [];

    const map = {};

    filteredMovements
      .filter(m => m.reason === "INTERNAL_USE")
      .forEach(m => {
        const date = new Date(m.createdAt).toLocaleDateString('pt-BR');

        if (!map[date]) {
          map[date] = {
            date,
            value: 0
          };
        }

        map[date].value += Number(m.totalCost || 0);
      });

    return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date));

  }, [filteredMovements]);

  return (
    <>
      <PageHeader>
        <PageTitle>Dashboard</PageTitle>
        <PageSubtitle>
          Visão geral do seu estoque em{' '}
          {now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </PageSubtitle>
      </PageHeader>

      {/* Date Range Filter */}
      <FiltersRow>
        <MdCalendarToday color="var(--color-text-secondary)" />
        <FilterLabel>
          De:
          <DateInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </FilterLabel>
        <FilterLabel>
          Até:
          <DateInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </FilterLabel>

        <FilterLabel style={{ marginLeft: '16px' }}>
          Categoria:
          <div style={{ minWidth: '200px' }}>
            <Select 
              value={filterCategory} 
              onChange={setFilterCategory}
              options={[
                { value: "", label: "Todas as categorias" },
                ...(state.categories || []).map((c) => ({ value: c.id, label: c.name }))
              ]}
            />
          </div>
        </FilterLabel>
        {(dateFrom || dateTo || filterCategory) && (
          <DSButton
            onClick={() => { setDateFrom(''); setDateTo(''); setFilterCategory(''); }}
            style={{ fontSize: '0.75rem', color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: '16px' }}
          >
            Limpar filtro
          </DSButton>
        )}
      </FiltersRow>

      {/* Stat Cards */}
      <StatsGrid>
        <StatCard accent="#6D5EF4">

          <StatInfo>
            <StatLabel>Total de Produtos</StatLabel>
            <StatValue>{filteredProducts.length}</StatValue>
            <StatSub>no período selecionado</StatSub>
          </StatInfo>
        </StatCard>
        <StatCard accent="var(--color-warning)">


          <StatInfo>
            <StatLabel>Consumo Interno</StatLabel>

            {mostInternalUse ? (
              <>
                <StatValue style={{ fontSize: '1.1rem' }}>
                  {mostInternalUse.name}
                </StatValue>

                <StatSub>
                  {(() => {
                    const product = state.products?.find(p => p.id === mostInternalUse.id);
                    const pack = Number(product?.packQuantity || 1);
                    const unit = product?.purchaseUnit || 'un';
                    const bUnit = product?.unit || 'ml';
                    const qty = Number(mostInternalUse.quantity);
                    const inUnits = (qty / pack).toFixed(2);
                    return `${inUnits} ${unit} (${qty} ${bUnit})`;
                  })()} consumidos internamente
                </StatSub>
              </>
            ) : (
              <StatSub>Nenhum consumo interno</StatSub>
            )}
          </StatInfo>
        </StatCard>

        <StatCard accent="#7f1d1d">


          <StatInfo>
            <StatLabel>Perda Total</StatLabel>

            <StatValue style={{ fontSize: '1.3rem', color: '#b91c1c' }}>
              {totalLoss.value > 0 ? formatCurrency(totalLoss.value) : `${totalLoss.count} ocorrência(s)`}
            </StatValue>

            <StatSub>
              {totalLoss.count > 0
                ? `${totalLoss.count} perda(s) registrada(s)${totalLoss.value > 0 ? '' : ' — sem custo cadastrado'}`
                : 'nenhuma perda registrada'}
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="#6D5EF4">

          <StatInfo>
            <StatLabel>Consumo Total</StatLabel>

            <StatValue style={{ fontSize: '1.3rem' }}>
              {formatCurrency(totalConsumption)}
            </StatValue>

            <StatSub>
              valor consumido no período
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="var(--color-success)">
          <StatInfo>
            <StatLabel>Bonificação Recebida</StatLabel>
            <StatValue style={{ fontSize: '1.3rem', color: 'var(--color-success)' }}>
              {formatCurrency(totalBonus)}
            </StatValue>
            <StatSub>
              economia no período
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="#ec4899">
          <StatInfo>
            <StatLabel>Investimento Marketing</StatLabel>
            <StatValue style={{ fontSize: '1.3rem', color: '#ec4899' }}>
              {formatCurrency(marketingInvestmentValue)}
            </StatValue>
            <StatSub>
              custo líquido de ações
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="#A89EFF">
          <StatInfo>
            <StatLabel>Drink em Dobro</StatLabel>
            <StatValue style={{ fontSize: '1.3rem', color: '#A89EFF' }}>
              {formatCurrency(doubleDrinkValue)}
            </StatValue>
            <StatSub>
              custo promoção no período
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="#EC4899">
          <StatInfo>
            <StatLabel>Cortesias</StatLabel>
            <StatValue style={{ fontSize: '1.3rem', color: '#EC4899' }}>
              {formatCurrency(courtesyValue)}
            </StatValue>
            <StatSub>
              valor em cortesias no período
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="var(--color-warning)">
          <StatInfo>
            <StatLabel>Promoções</StatLabel>
            <StatValue style={{ fontSize: '1.3rem', color: 'var(--color-warning)' }}>
              {formatCurrency(promoValue)}
            </StatValue>
            <StatSub>
              custo de promoções no período
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="#5B4BD8">

          <StatInfo>
            <StatLabel>Produto Mais Consumido</StatLabel>

            {mostConsumedProduct ? (
              <>
                <StatValue style={{ fontSize: '1.1rem' }}>
                  {mostConsumedProduct.name}
                </StatValue>
                <StatSub>
                  {(() => {
                    const product = state.products?.find(p => p.id === mostConsumedProduct.id);
                    const pack = Number(product?.packQuantity || 1);
                    const unit = product?.purchaseUnit || 'un';
                    const bUnit = product?.unit || 'ml';
                    const qty = Number(mostConsumedProduct.quantity);
                    const inUnits = (qty / pack).toFixed(2);
                    return `${inUnits} ${unit} (${qty} ${bUnit})`;
                  })()} consumidos no total
                </StatSub>
              </>
            ) : (
              <StatSub>Nenhum consumo registrado</StatSub>
            )}
          </StatInfo>
        </StatCard>
        <StatCard accent="var(--color-danger)">

          <StatInfo>
            <StatLabel>Perda no Período</StatLabel>
            <StatValue style={{ fontSize: '1.3rem', color: 'var(--color-danger)' }}>
              {lossValue.value > 0 ? formatCurrency(lossValue.value) : `${lossValue.count} ocorrência(s)`}
            </StatValue>
            <StatSub>
              {lossValue.count > 0
                ? `${lossValue.count} perda(s) no período${lossValue.value > 0 ? '' : ' — cadastre custos para ver valores'}`
                : 'nenhuma perda no período'}
            </StatSub>
          </StatInfo>
        </StatCard>
        <StatCard accent="var(--color-danger)">

          <StatInfo>
            <StatLabel>Abaixo do Mínimo</StatLabel>
            <StatValue>{lowStock.length}</StatValue>
            <StatSub>Reposição: {formatCurrency(totalEstimatedPurchase)}</StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="#b91c1c">

          <StatInfo>
            <StatLabel>Maior Perda</StatLabel>

            {mostLossProduct ? (
              <>
                <StatValue style={{ fontSize: '1.1rem' }}>
                  {mostLossProduct.name}
                </StatValue>

                <StatSub>
                  {mostLossProduct.value > 0
                    ? `${formatCurrency(mostLossProduct.value)} perdidos`
                    : (() => {
                        const product = state.products?.find(p => p.id === mostLossProduct.id);
                        const pack = Number(product?.packQuantity || 1);
                        const unit = product?.purchaseUnit || 'un';
                        const bUnit = product?.unit || 'ml';
                        const qty = mostLossProduct.quantity;
                        const inUnits = (qty / pack).toFixed(2);
                        return `${inUnits} ${unit} (${qty} ${bUnit}) perdidos`;
                      })()}
                </StatSub>
              </>
            ) : (
              <StatSub>Nenhuma perda registrada</StatSub>
            )}
          </StatInfo>
        </StatCard>

        <StatCard accent="var(--color-danger)">

          <StatInfo>
            <StatLabel>Produtos Críticos</StatLabel>

            <StatValue>
              {criticalProducts}
            </StatValue>

            <StatSub>
              {criticalProducts > 0
                ? "requer atenção imediata"
                : "estoque sob controle"}
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="var(--color-warning)">

          <StatInfo>
            <StatLabel>% Consumo Interno</StatLabel>

            <StatValue style={{ fontSize: '1.3rem' }}>
              {internalConsumptionPercent.toFixed(1)}%
            </StatValue>

            <StatSub>
              {internalConsumptionPercent > 10
                ? "alto consumo interno"
                : "nível saudável"}
            </StatSub>
            <StatSub>
              {formatCurrency(internalConsumptionValue)} de {formatCurrency(totalConsumption)}
            </StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="#1072b9ff">

          <StatInfo>
            <StatLabel>Valor do Estoque</StatLabel>
            <StatValue style={{ fontSize: '1.3rem' }}>{formatCurrency(filteredValue)}</StatValue>
            <StatSub>valor total dos produtos</StatSub>
          </StatInfo>
        </StatCard>

        <StatCard accent="var(--color-warning)">

          <StatInfo>
            <StatLabel>Ordens Pendentes</StatLabel>
            <StatValue>{pendingOrders.length}</StatValue>
            <StatSub>aguardando conclusão</StatSub>
          </StatInfo>
        </StatCard>

        {productionStats !== null && (
          <>
            <StatCard accent="#6D5EF4">
              <StatInfo>
                <StatLabel>🏭 Produções Pendentes</StatLabel>
                <StatValue style={{ color: productionStats.pending > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                  {productionStats.pending}
                </StatValue>
                <StatSub>
                  {productionStats.pending > 0
                    ? `${productionStats.pending} ordem(ns) aguardando`
                    : 'nenhuma pendente'}
                </StatSub>
              </StatInfo>
            </StatCard>

            <StatCard accent="var(--color-success)">
              <StatInfo>
                <StatLabel>✅ Produções Concluídas</StatLabel>
                <StatValue style={{ color: 'var(--color-success)' }}>
                  {productionStats.completed}
                </StatValue>
                <StatSub>
                  {productionStats.total > 0
                    ? `de ${productionStats.total} ordens no período`
                    : 'nenhuma produção no período'}
                </StatSub>
              </StatInfo>
            </StatCard>

            <StatCard accent="#A89EFF">
              <StatInfo>
                <StatLabel>💰 Custo de Produção</StatLabel>
                <StatValue style={{ fontSize: '1.2rem', color: '#A89EFF' }}>
                  {formatCurrency(productionStats.productionCost)}
                </StatValue>
                <StatSub>insumos consumidos em produções</StatSub>
              </StatInfo>
            </StatCard>
          </>
        )}
      </StatsGrid>

      {/* Low Stock Table */}
      <SectionTitle>Produtos Abaixo do Estoque Mínimo</SectionTitle>
      <Card padding="0">
        {lowStock.length === 0 ? (
          <EmptyNote style={{ margin: '16px' }}>
            Todos os produtos estão com estoque adequado!
          </EmptyNote>
        ) : (
          <LowStockTable>
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Categoria</Th>
                  <Th>Qtd. Atual</Th>
                  <Th>Estoque Mínimo</Th>
                  <Th>Progresso</Th>
                  <Th>Estimativa Reposição</Th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => {
                  const pct = p.minQuantity > 0 ? (p.quantity / p.minQuantity) * 100 : 0;
                  const suggestion = suggestions.find(s => s.productId === p.id);
                  let packPrice = suggestion ? Number(suggestion.bestPrice || 0) : 0;
                  if (!packPrice) {
                      packPrice = p.productSuppliers && p.productSuppliers.length > 0
                        ? Math.min(...p.productSuppliers.map(s => Number(s.price)))
                        : Number(p.unitPrice || 0);
                  }
                  const packQty = Number(p.packQuantity || 1);
                  const needsMl = Math.max(0, Number(p.minQuantity) - Number(p.quantity));
                  const needsPacks = Math.ceil(needsMl / packQty);
                  
                  return (
                    <Tr key={p.id}>
                      <Td data-label="Produto" style={{ fontWeight: 600 }}>{p.name}</Td>
                      <Td data-label="Categoria">{p.category?.name || 'N/A'}</Td>
                      <Td data-label="Qtd. Atual" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                        {p.quantity} {p.unit}
                      </Td>
                      <Td data-label="Estoque Mínimo">{p.minQuantity} {p.unit}</Td>
                      <Td data-label="Progresso" style={{ minWidth: 120 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)' }}>{Math.round(pct)}%</span>
                        <StockBar><StockFill pct={pct} /></StockBar>
                      </Td>
                      <Td data-label="Estimativa Reposição">
                        {formatCurrency(packPrice * needsPacks)}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </LowStockTable>
        )}
      </Card>
      <SectionTitle>Top Produtos Consumidos</SectionTitle>

      <Card>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={topConsumedProducts} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                axisLine={false} 
                tickLine={false} 
                interval={0}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip 
                cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const product = state.products?.find(p => p.name === data.name);
                    const pack = Number(product?.packQuantity || 1);
                    const unit = product?.purchaseUnit || 'un';
                    const baseUnit = product?.unit || 'ml';
                    const qty = Number(payload[0].value);
                    const inUnits = (qty / pack).toFixed(2);

                    return (
                      <div style={{ 
                        background: '#fff', 
                        padding: '12px', 
                        border: 'none', 
                        borderRadius: '12px', 
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' 
                      }}>
                        <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: 'var(--color-text)' }}>{data.name}</p>
                        <p style={{ color: '#F97316', fontWeight: 500, fontSize: '14px' }}>
                          {inUnits} {unit}
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
                            ({qty} {baseUnit})
                          </span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="quantity" name="Consumo" fill="#F97316" radius={[6, 6, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <SectionTitle>Consumo Interno por Produto</SectionTitle>

      <Card>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={topInternalUseProducts} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                axisLine={false} 
                tickLine={false} 
                interval={0}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip 
                cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const product = state.products?.find(p => p.name === data.name);
                    const pack = Number(product?.packQuantity || 1);
                    const unit = product?.purchaseUnit || 'un';
                    const baseUnit = product?.unit || 'ml';
                    const qty = Number(payload[0].value);
                    const inUnits = (qty / pack).toFixed(2);

                    return (
                      <div style={{ 
                        background: '#fff', 
                        padding: '12px', 
                        border: 'none', 
                        borderRadius: '12px', 
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' 
                      }}>
                        <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: 'var(--color-text)' }}>{data.name}</p>
                        <p style={{ color: '#F97316', fontWeight: 500, fontSize: '14px' }}>
                          {inUnits} {unit}
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: '6px' }}>
                            ({qty} {baseUnit})
                          </span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="quantity" name="Consumo Interno" fill="#F97316" radius={[6, 6, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <SectionTitle>Evolução do Consumo Interno (R$)</SectionTitle>

      <Card>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={internalUseTrend} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                formatter={(value) => [formatCurrency(value), "Valor"]}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                name="Valor Consumido" 
                stroke="#6D5EF4"
                strokeWidth={3}
                dot={{ fill: '#6D5EF4', strokeWidth: 2, r: 4, stroke: '#fff' }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
};

export default Dashboard;

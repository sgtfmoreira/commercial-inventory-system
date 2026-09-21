import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { MdTrendingUp, MdTrendingDown, MdInfoOutline } from 'react-icons/md';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';
import api from '../services/api';

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xl};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const FilterGroup = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;

  input[type="date"] {
    padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radii.md};
    background: ${({ theme }) => theme.colors.bgInput};
    color: ${({ theme }) => theme.colors.textPrimary};
    font-size: ${({ theme }) => theme.fontSizes.sm};
    outline: none;
    transition: ${({ theme }) => theme.transition};

    &:focus {
      border-color: ${({ theme }) => theme.colors.primary};
      box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primaryLight};
    }
  }

  button {
    padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
    border: none;
    border-radius: ${({ theme }) => theme.radii.md};
    font-size: ${({ theme }) => theme.fontSizes.sm};
    font-weight: ${({ theme }) => theme.fontWeights.medium};
    cursor: pointer;
    transition: ${({ theme }) => theme.transition};

    &:hover {
      background: ${({ theme }) => theme.colors.primaryDark};
    }
  }
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: ${({ theme }) => theme.spacing.md};

  @media (max-width: 1100px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;

const MetricCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.radii.xl};
  padding: 22px;
  box-shadow: ${({ theme }) => theme.shadows.card};
  border: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 100%;
    background: ${({ color }) => color};
  }
`;

const MetricHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const MetricIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: ${({ bg }) => bg};
  color: ${({ color }) => color};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
`;

const MetricTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  margin: 0;
`;

const MetricValue = styled.h2`
  font-size: clamp(1.65rem, 2.4vw, 2.15rem);
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  margin: 0;
`;

const MetricDetail = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  min-height: 20px;
`;

const Notice = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.radii.lg};
  background: #FFF7ED;
  border: 1px solid #FED7AA;
  color: #9A3412;
  font-size: ${({ theme }) => theme.fontSizes.sm};

  svg { flex: 0 0 auto; font-size: 20px; margin-top: 1px; }
`;

const SectionGrid = styled.div`
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const DetailPanel = styled.section`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.xl};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
`;

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 13px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.sm};

  &:last-child { border-bottom: 0; }
  strong { color: ${({ theme }) => theme.colors.textPrimary}; white-space: nowrap; }
`;

const ChartContainer = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.radii.xl};
  padding: ${({ theme }) => theme.spacing.xl};
  box-shadow: ${({ theme }) => theme.shadows.card};
  border: 1px solid ${({ theme }) => theme.colors.border};
  height: 360px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const ChartTitle = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  margin: 0;
`;

const FinancialReport = () => {
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    
    const [dateTo, setDateTo] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    const [summary, setSummary] = useState({
        salesCogs: 0,
        grossRevenue: 0,
        discounts: 0,
        netRevenue: 0,
        cogsPercentage: null,
        grossProfit: null,
        grossMarginPercentage: null,
        revenueAvailable: false,
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
        purchasesByClassification: {}
    });

    const [chartData, setChartData] = useState([]);

    const loadData = async () => {
        try {
            const res = await api.get('/reports/financial-summary', {
                params: { dateFrom, dateTo }
            });
            setSummary(res.summary);
            setChartData(res.chartData);
        } catch (error) {
            console.error("Erro ao buscar relatório", error);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line
    }, []);

    const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
    const formatPercentage = (val) => val === null || val === undefined
        ? '—'
        : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + '%';
    const formatSignedCurrency = (val) => `${Number(val) > 0 ? '+' : ''}${formatCurrency(val)}`;

    const primaryMetrics = [
        {
            title: "Receita líquida",
            value: summary.netRevenue,
            detail: `Bruta ${formatCurrency(summary.grossRevenue)} · Descontos ${formatCurrency(summary.discounts)}`,
            icon: <MdTrendingUp />,
            color: "#2563EB",
            bg: "rgba(37, 99, 235, 0.12)"
        },
        {
            title: "CMV de bebidas",
            value: summary.salesCogs,
            detail: "Custo congelado das vendas",
            icon: <MdTrendingDown />,
            color: "#7C3AED",
            bg: "rgba(124, 58, 237, 0.12)"
        },
        {
            title: "CMV",
            value: summary.cogsPercentage,
            formatter: formatPercentage,
            detail: summary.revenueAvailable ? "Sobre a receita líquida" : "Aguardando dados de receita",
            icon: <MdTrendingDown />,
            color: "#7C3AED",
            bg: "rgba(124, 58, 237, 0.12)"
        },
        {
            title: "Lucro bruto",
            value: summary.grossProfit,
            formatter: summary.revenueAvailable ? undefined : () => '—',
            detail: summary.revenueAvailable
                ? `Margem ${formatPercentage(summary.grossMarginPercentage)}`
                : "Aguardando dados de receita",
            icon: <MdTrendingUp />,
            color: "#0F766E",
            bg: "rgba(15, 118, 110, 0.12)"
        }
    ];

    const operationalDetails = [
        ['Consumo interno', summary.internalConsumption],
        ['Consumo operacional de bebidas (inclui cortesias e promoções)', summary.beverageOperationalConsumption],
        ['Limpeza', summary.cleaningConsumption],
        ['Descartáveis', summary.disposablesConsumption],
        ['Outros consumos operacionais', summary.otherOperationalConsumption],
        ['Bonificações', summary.bonuses],
        ['Perdas operacionais', summary.operationalLosses],
        ['Perdas de auditoria', summary.auditLosses],
        ['Sobras de auditoria', summary.auditGains]
    ];
    const purchaseDetails = [
        ['Bebidas / CMV', summary.purchasesByClassification?.CMV_BEVERAGES],
        ['Limpeza', summary.purchasesByClassification?.CLEANING],
        ['Descartáveis', summary.purchasesByClassification?.DISPOSABLES],
        ['Outros operacionais', summary.purchasesByClassification?.OPERATING],
        ['Fora do CMV', summary.purchasesByClassification?.EXCLUDED]
    ];

    return (
        <PageContainer>
            <Header>
                <Title>Relatório Financeiro</Title>
                <FilterGroup>
                    <input 
                        type="date" 
                        value={dateFrom} 
                        onChange={(e) => setDateFrom(e.target.value)} 
                        max={dateTo}
                    />
                    <span style={{ color: '#9CA3AF' }}>até</span>
                    <input 
                        type="date" 
                        value={dateTo} 
                        onChange={(e) => setDateTo(e.target.value)} 
                        min={dateFrom}
                    />
                    <button onClick={loadData}>Filtrar</button>
                </FilterGroup>
            </Header>

            {!summary.revenueAvailable && summary.salesCogs > 0 && (
                <Notice>
                    <MdInfoOutline />
                    <div>
                        <strong>Faturamento indisponível neste período.</strong><br />
                        O CMV em reais está calculado, mas percentual, lucro e margem dependem da importação da receita das vendas.
                    </div>
                </Notice>
            )}

            {summary.hasMixedAuditAdjustments && (
                <Notice>
                    <MdInfoOutline />
                    <div>
                        <strong>Possível troca ou divergência entre produtos.</strong><br />
                        {summary.suspectedExchangeAudits} auditoria(s) possui(em) perdas e sobras simultâneas. No período são {formatCurrency(summary.auditLosses)} em perdas e {formatCurrency(summary.auditGains)} em sobras. Revise os produtos contados antes de interpretar apenas o saldo líquido.
                    </div>
                </Notice>
            )}

            <CardsGrid>
                {primaryMetrics.map((metric, idx) => (
                    <MetricCard key={idx} color={metric.color}>
                        <MetricHeader>
                            <MetricTitle>{metric.title}</MetricTitle>
                            <MetricIcon bg={metric.bg} color={metric.color}>
                                {metric.icon}
                            </MetricIcon>
                        </MetricHeader>
                        <MetricValue>{metric.formatter ? metric.formatter(metric.value) : formatCurrency(metric.value)}</MetricValue>
                        <MetricDetail>{metric.detail}</MetricDetail>
                    </MetricCard>
                ))}
            </CardsGrid>

            <ChartContainer>
                <ChartTitle>Receita e CMV por dia</ChartTitle>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#6B7280', fontSize: 12 }} 
                            tickFormatter={(val) => {
                                const parts = val.split('-');
                                return `${parts[2]}/${parts[1]}`;
                            }}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#6B7280', fontSize: 12 }}
                            tickFormatter={(val) => `R$ ${val}`} 
                        />
                        <RechartsTooltip 
                            formatter={(value) => formatCurrency(value)}
                            labelFormatter={(label) => {
                                const parts = label.split('-');
                                return `${parts[2]}/${parts[1]}/${parts[0]}`;
                            }}
                            cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar name="CMV de bebidas" dataKey="salesCogs" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                        <Bar name="Receita líquida" dataKey="netRevenue" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </ChartContainer>

            <SectionGrid>
                <DetailPanel>
                    <PanelHeader>
                        <ChartTitle>Consumos e ajustes</ChartTitle>
                    </PanelHeader>
                    {operationalDetails.map(([label, value]) => (
                        <DetailRow key={label}>
                            <span>{label}</span>
                            <strong>{formatCurrency(value)}</strong>
                        </DetailRow>
                    ))}
                    <DetailRow>
                        <span>Impacto líquido das auditorias</span>
                        <strong style={{ color: Number(summary.auditNetImpact) < 0 ? '#DC2626' : '#059669' }}>
                            {formatSignedCurrency(summary.auditNetImpact)}
                        </strong>
                    </DetailRow>
                </DetailPanel>

                <DetailPanel>
                    <PanelHeader><ChartTitle>Compras e devoluções</ChartTitle></PanelHeader>
                    <DetailRow><span>Compras brutas</span><strong>{formatCurrency(summary.grossPurchases)}</strong></DetailRow>
                    <DetailRow><span>Devoluções no período</span><strong>{formatCurrency(summary.purchaseReturns)}</strong></DetailRow>
                    <DetailRow><span>Compras líquidas</span><strong>{formatCurrency(summary.netPurchases)}</strong></DetailRow>
                    <p>Valores líquidos por classificação. Devoluções consideradas na data em que ocorreram; não representam reembolsos recebidos.</p>
                    {purchaseDetails.map(([label, value]) => (
                        <DetailRow key={label}>
                            <span>{label}</span>
                            <strong>{formatCurrency(value)}</strong>
                        </DetailRow>
                    ))}
                </DetailPanel>
            </SectionGrid>

        </PageContainer>
    );
};

export default FinancialReport;

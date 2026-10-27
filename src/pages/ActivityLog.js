import DSButton from '../components/Button';
import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import {
    MdEventNote,
    MdAddCircle,
    MdEdit,
    MdDelete,
    MdCheckCircle,
    MdFilterList,
} from 'react-icons/md';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Select from '../components/Select';

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



const ClearBtn = (props) => <DSButton size="sm" variant="danger" {...props} />;

const Timeline = styled.div`
  display: flex;
  flex-direction: column;
`;

const LogEntry = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  transition: ${({ theme }) => theme.transition};
  align-items: flex-start;

  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:last-child { border-bottom: none; }
`;

const Dot = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${({ bg }) => bg};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  color: ${({ color }) => color};
  flex-shrink: 0;
  margin-top: 2px;
`;

const LogContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const LogDescription = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: 4px;
  line-height: 1.5;
`;

const LogMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const LogTime = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

// ─── Action / Entity config ───────────────────────────────────────────────────
const ACTION_CONFIG = {
    CREATE: { icon: <MdAddCircle />, bg: 'rgba(5,150,105,0.12)', color: 'var(--color-success)', badgeVariant: 'success', label: 'Criação' },
    UPDATE: { icon: <MdEdit />, bg: 'rgba(37,99,235,0.12)', color: 'var(--color-info)', badgeVariant: 'info', label: 'Edição' },
    DELETE: { icon: <MdDelete />, bg: 'rgba(220,38,38,0.12)', color: 'var(--color-danger)', badgeVariant: 'danger', label: 'Exclusão' },
    COMPLETE: { icon: <MdCheckCircle />, bg: 'rgba(5,150,105,0.12)', color: 'var(--color-success)', badgeVariant: 'success', label: 'Conclusão' },
};

const ENTITY_LABELS = {
    PRODUCT: 'Produto',
    SUPPLIER: 'Fornecedor',
    PURCHASE_ORDER: 'Ordem de Compra',
};

// ─── Component ────────────────────────────────────────────────────────────────
const ActivityLog = () => {
    const { state } = useApp();

    const [filterEntity, setFilterEntity] = useState('');
    const [filterAction, setFilterAction] = useState('');

    const filtered = useMemo(() => {
        return state.auditLogs.filter((log) => {
            if (filterEntity && log.entityType !== filterEntity) return false;
            if (filterAction && log.actionType !== filterAction) return false;
            return true;
        });
    }, [state.auditLogs, filterEntity, filterAction]);

    const hasFilters = filterEntity || filterAction;

    return (
        <>
            <PageHeader>
                <div>
                    <PageTitle>Registro de Atividades</PageTitle>
                    <PageSubtitle>
                        {state.auditLogs.length} evento(s) registrado(s) no sistema
                    </PageSubtitle>
                </div>
            </PageHeader>

            {/* Filters */}
            <FiltersBar>
                <MdFilterList style={{ color: '#6D5EF4', flexShrink: 0 }} />

                <FilterGroup>
                    Entidade:
                    <Select value={filterEntity} onChange={setFilterEntity}
                        options={[
                            { value: "", label: "Todas" },
                            { value: "PRODUCT", label: "Produto" },
                            { value: "SUPPLIER", label: "Fornecedor" },
                            { value: "PURCHASE_ORDER", label: "Ordem de Compra" }
                        ]}
                    />
                </FilterGroup>

                <FilterGroup>
                    Ação:
                    <Select value={filterAction} onChange={setFilterAction}
                        options={[
                            { value: "", label: "Todas" },
                            { value: "CREATE", label: "Criação" },
                            { value: "UPDATE", label: "Edição" },
                            { value: "DELETE", label: "Exclusão" },
                            { value: "COMPLETE", label: "Conclusão" }
                        ]}
                    />
                </FilterGroup>

                {hasFilters && (
                    <ClearBtn onClick={() => { setFilterEntity(''); setFilterAction(''); }}>
                        Limpar
                    </ClearBtn>
                )}

                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {filtered.length} resultado(s)
                </span>
            </FiltersBar>

            {/* Timeline */}
            <Card padding="0">
                {filtered.length === 0 ? (
                    <EmptyState
                        icon={<MdEventNote />}
                        title="Nenhuma atividade registrada"
                        subtitle="Todas as ações no sistema serão registradas aqui automaticamente."
                    />
                ) : (
                    <Timeline>
                        {filtered.map((log) => {
                            const cfg = ACTION_CONFIG[log.actionType] || ACTION_CONFIG.UPDATE;
                            const entityLabel = ENTITY_LABELS[log.entityType] || log.entityType;
                            const dateStr = new Date(log.createdAt).toLocaleDateString('pt-BR', {
                                day: '2-digit', month: 'short', year: 'numeric',
                            });
                            const timeStr = new Date(log.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit', minute: '2-digit',
                            });

                            return (
                                <LogEntry key={log.id}>
                                    <Dot bg={cfg.bg} color={cfg.color}>
                                        {cfg.icon}
                                    </Dot>
                                    <LogContent>
                                        <LogDescription>{log.description}</LogDescription>
                                        <LogMeta>
                                            <Badge variant={cfg.badgeVariant}>{cfg.label}</Badge>
                                            <Badge variant="primary">{entityLabel}</Badge>
                                            <LogTime>{dateStr} às {timeStr}</LogTime>
                                        </LogMeta>
                                    </LogContent>
                                </LogEntry>
                            );
                        })}
                    </Timeline>
                )}
            </Card>
        </>
    );
};

export default ActivityLog;

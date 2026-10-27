import { InputControl } from '../components/FormFields';
import { SelectControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { MdAdd, MdEventNote, MdSearch } from 'react-icons/md';
import eventService from '../services/eventService';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import Card from '../components/Card';
import StatusBadge from '../components/Badge';
import Loading from '../components/Loading';
import { useApp } from '../context/AppContext';

const Page = styled.div`display:grid;gap:${({ theme }) => theme.spacing.lg};`;
const Header = styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;`;
const Title = styled.h1`color:${({ theme }) => theme.colors.textPrimary};font-size:${({ theme }) => theme.fontSizes['3xl']};`;
const Hint = styled.p`margin:6px 0 0;color:${({ theme }) => theme.colors.textMuted};`;
const Panel = styled(Card).attrs({ as: 'section' })`padding:${({ theme }) => theme.spacing.md};`;
const Filters = styled.div`display:grid;grid-template-columns:minmax(220px,1fr) 190px 160px 160px;gap:12px;margin-bottom:16px;@media(max-width:980px){grid-template-columns:1fr 1fr;}@media(max-width:640px){grid-template-columns:1fr;}`;
const controlStyles = `min-height:40px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface);color:var(--color-text);font-size:.875rem;transition:120ms ease;&:hover{border-color:var(--color-primary);}&:focus-within{border-color:var(--color-primary);box-shadow:var(--focus-ring);}`;
const Search = styled.label`display:flex;align-items:center;gap:8px;padding:0 11px;${controlStyles}color:${({ theme }) => theme.colors.textMuted};input{width:100%;padding:9px 0;border:0;outline:0;background:transparent;color:${({ theme }) => theme.colors.textPrimary};}`;
const Select = styled(SelectControl)`padding:9px 12px;${controlStyles}`;
const DateInput = styled(InputControl)`padding:9px 12px;${controlStyles}`;
const TableWrap = styled.div`overflow-x:auto;border:1px solid ${({ theme }) => theme.colors.border};border-radius:${({ theme }) => theme.radii.md};`;
const Table = styled(DataTable)`width:100%;border-collapse:collapse;min-width:920px;th,td{text-align:left;padding:11px 12px;border-bottom:1px solid ${({ theme }) => theme.colors.border};color:${({ theme }) => theme.colors.textPrimary};}th{font-size:${({ theme }) => theme.fontSizes.xs};font-weight:${({ theme }) => theme.fontWeights.semibold};text-transform:uppercase;letter-spacing:.04em;color:${({ theme }) => theme.colors.textMuted};background:${({ theme }) => theme.colors.bgHover};}tbody tr{transition:${({ theme }) => theme.transitions.fast};}tbody tr:hover{background:${({ theme }) => theme.colors.primarySurface};}tbody tr:last-child td{border-bottom:0;}`;
const OpenLink = styled(Link)`color:${({ theme }) => theme.colors.primary};font-weight:700;&:hover{text-decoration:underline;}`;
const ErrorNote = styled.div`display:flex;align-items:center;justify-content:center;gap:12px;color:${({ theme }) => theme.colors.danger};padding:24px;text-align:center;`;
const Pagination = styled.div`display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px;color:${({ theme }) => theme.colors.textMuted};div{display:flex;gap:8px;}@media(max-width:640px){align-items:stretch;flex-direction:column;}`;

const statusLabels = { DRAFT: 'Rascunho', BUDGETING: 'Em orçamento', APPROVED: 'Aprovado', PLANNING_PENDING: 'Aguardando planejamento', CANCELLED: 'Cancelado' };
const budgetLabels = { DRAFT: 'Rascunho', SENT: 'Proposta enviada', APPROVED: 'Aprovado', REJECTED: 'Recusado', EXPIRED: 'Expirado', CANCELLED: 'Cancelado' };
const money = (value) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—';
const badgeVariant = (status) => status === 'APPROVED' ? 'success' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(status) ? 'danger' : status === 'SENT' ? 'info' : 'warning';

export default function Events() {
  const { state } = useApp();
  const establishmentId = state.establishment?.id;
  const [data, setData] = useState({ items: [], total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await eventService.listEvents({ search: search || undefined, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, pageSize });
      setData(result || { items: [], total: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, dateFrom, dateTo, page]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search, establishmentId]);

  const pageCount = Math.max(1, Math.ceil(data.total / pageSize));

  return <Page>
    <Header>
      <div><Title>Eventos</Title><Hint>Propostas, revisões e margens dos eventos comerciais.</Hint></div>
      <Button as={Link} to="/events/new"><MdAdd />Novo evento</Button>
    </Header>
    <Panel>
      <Filters>
        <Search><MdSearch /><InputControl aria-label="Buscar eventos" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por evento, cliente ou código" /></Search>
        <Select aria-label="Filtrar por status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <DateInput aria-label="Data inicial" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
        <DateInput aria-label="Data final" type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
      </Filters>
      {error ? <ErrorNote>{error}<Button size="sm" variant="outlined" onClick={load}>Tentar novamente</Button></ErrorNote> : loading ? <Loading message="Carregando eventos..." size="32px" /> : !data.items?.length ? <EmptyState icon={<MdEventNote />} title="Nenhum evento encontrado" subtitle="Crie o primeiro evento comercial para iniciar um orçamento." action={<Button as={Link} to="/events/new" size="sm"><MdAdd />Criar evento</Button>} /> : <>
        <TableWrap><Table><thead><tr><th>Código</th><th>Evento</th><th>Cliente</th><th>Data</th><th>Convidados</th><th>Valor</th><th>Margem</th><th>Status</th><th>Ações</th></tr></thead><tbody>{data.items.map((event) => { const budget = event.budgets?.[0]; const currentStatus = budget?.status || event.status; return <tr key={event.id}><td>{event.code}</td><td><strong>{event.name}</strong></td><td>{event.customer?.name}</td><td>{date(event.eventDate)}</td><td>{event.guestCount}</td><td>{money(budget?.quotedPrice)}</td><td>{budget?.effectiveMarginPercent == null ? '—' : `${Number(budget.effectiveMarginPercent).toLocaleString('pt-BR')}%`}</td><td><StatusBadge variant={badgeVariant(currentStatus)}>{budgetLabels[budget?.status] || statusLabels[event.status] || event.status}</StatusBadge></td><td><OpenLink to={`/events/${event.id}`}>Abrir</OpenLink></td></tr>; })}</tbody></Table></TableWrap>
        <Pagination><span>{data.total} evento(s) · página {page} de {pageCount}</span><div><Button size="sm" variant="outlined" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><Button size="sm" variant="outlined" disabled={page * pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>Próxima</Button></div></Pagination>
      </>}
    </Panel>
  </Page>;
}

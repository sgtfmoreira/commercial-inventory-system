import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { MdAdd, MdEventNote, MdSearch } from 'react-icons/md';
import eventService from '../services/eventService';
import EmptyState from '../components/EmptyState';
import { useApp } from '../context/AppContext';

const Page = styled.div`display:grid;gap:20px;`;
const Header = styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;`;
const Title = styled.h1`margin:0;color:${({theme})=>theme.colors.textPrimary};font-size:1.8rem;`;
const Hint = styled.p`margin:6px 0 0;color:${({theme})=>theme.colors.textMuted};`;
const PrimaryLink = styled(Link)`display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.primary};color:white;text-decoration:none;font-weight:700;`;
const Panel = styled.section`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:18px;box-shadow:${({theme})=>theme.shadows.card};`;
const Filters = styled.div`display:grid;grid-template-columns:minmax(220px,1fr) 190px 160px 160px;gap:12px;margin-bottom:16px;@media(max-width:980px){grid-template-columns:1fr 1fr;}@media(max-width:640px){grid-template-columns:1fr;}`;
const Search = styled.label`display:flex;align-items:center;gap:8px;padding:0 11px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textMuted};input{width:100%;padding:10px 0;border:0;outline:0;background:transparent;color:${({theme})=>theme.colors.textPrimary};}`;
const Select = styled.select`padding:10px 12px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const DateInput = styled.input`padding:10px 12px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const TableWrap = styled.div`overflow-x:auto;`;
const Table = styled.table`width:100%;border-collapse:collapse;min-width:920px;th,td{text-align:left;padding:12px;border-bottom:1px solid ${({theme})=>theme.colors.border};color:${({theme})=>theme.colors.textPrimary};}th{font-size:.75rem;text-transform:uppercase;color:${({theme})=>theme.colors.textMuted};}`;
const Badge = styled.span`display:inline-flex;padding:5px 8px;border-radius:999px;font-size:.72rem;font-weight:700;background:${({theme})=>theme.colors.infoLight};color:${({theme})=>theme.colors.info};`;
const OpenLink = styled(Link)`color:${({theme})=>theme.colors.info};font-weight:700;text-decoration:none;`;
const ErrorNote = styled.div`color:${({theme})=>theme.colors.danger};padding:16px;text-align:center;`;
const Pagination = styled.div`display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px;color:${({theme})=>theme.colors.textMuted};button{padding:8px 12px;border:1px solid ${({theme})=>theme.colors.border};border-radius:8px;background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};cursor:pointer;}button:disabled{opacity:.45;cursor:not-allowed;}`;

const statusLabels = { DRAFT:'Rascunho', BUDGETING:'Em orçamento', APPROVED:'Aprovado', PLANNING_PENDING:'Aguardando planejamento', CANCELLED:'Cancelado' };
const budgetLabels = { DRAFT:'Rascunho', SENT:'Proposta enviada', APPROVED:'Aprovado', REJECTED:'Recusado', EXPIRED:'Expirado', CANCELLED:'Cancelado' };
const money = value => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const date = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—';

export default function Events() {
  const { state } = useApp();
  const establishmentId = state.establishment?.id;
  const [data, setData] = useState({ items:[], total:0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await eventService.listEvents({ search:search || undefined, status:status || undefined, dateFrom:dateFrom||undefined, dateTo:dateTo||undefined, page, pageSize });
      setData(result || { items:[], total:0 });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [search, status, dateFrom, dateTo, page]);

  useEffect(() => { const timer=setTimeout(load, search ? 250 : 0); return()=>clearTimeout(timer); }, [load, search, establishmentId]);

  return <Page>
    <Header><div><Title>Eventos</Title><Hint>Propostas, revisões e margens dos eventos comerciais.</Hint></div><PrimaryLink to="/events/new"><MdAdd/>Novo evento</PrimaryLink></Header>
    <Panel>
      <Filters><Search><MdSearch/><input aria-label="Buscar eventos" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Buscar por evento, cliente ou código"/></Search><Select aria-label="Filtrar por status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">Todos os status</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select><DateInput aria-label="Data inicial" type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1);}}/><DateInput aria-label="Data final" type="date" min={dateFrom||undefined} value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1);}}/></Filters>
      {error ? <ErrorNote>{error} <button onClick={load}>Tentar novamente</button></ErrorNote> : loading ? <Hint>Carregando eventos...</Hint> : !data.items?.length ? <EmptyState icon={<MdEventNote/>} title="Nenhum evento encontrado" subtitle="Crie o primeiro evento comercial para iniciar um orçamento."/> : <><TableWrap><Table><thead><tr><th>Código</th><th>Evento</th><th>Cliente</th><th>Data</th><th>Convidados</th><th>Valor</th><th>Margem</th><th>Status</th><th>Ações</th></tr></thead><tbody>{data.items.map(event=>{const budget=event.budgets?.[0];return <tr key={event.id}><td>{event.code}</td><td><strong>{event.name}</strong></td><td>{event.customer?.name}</td><td>{date(event.eventDate)}</td><td>{event.guestCount}</td><td>{money(budget?.quotedPrice)}</td><td>{budget?.effectiveMarginPercent==null?'—':`${Number(budget.effectiveMarginPercent).toLocaleString('pt-BR')}%`}</td><td><Badge>{budgetLabels[budget?.status] || statusLabels[event.status] || event.status}</Badge></td><td><OpenLink to={`/events/${event.id}`}>Abrir</OpenLink></td></tr>})}</tbody></Table></TableWrap><Pagination><span>{data.total} evento(s) · página {page} de {Math.max(1,Math.ceil(data.total/pageSize))}</span><div><button disabled={page===1} onClick={()=>setPage(value=>value-1)}>Anterior</button> <button disabled={page*pageSize>=data.total} onClick={()=>setPage(value=>value+1)}>Próxima</button></div></Pagination></>}
    </Panel>
  </Page>;
}

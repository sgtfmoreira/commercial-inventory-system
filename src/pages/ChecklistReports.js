import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { MdAssessment, MdRefresh, MdWarning } from 'react-icons/md';
import Button from '../components/Button';
import Card from '../components/Card';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import { Input, Select } from '../components/FormFields';
import {
  TableSurface, DataTable, TableHead, TableBody, TableRow,
  TableHeaderCell, TableCell, TableEmptyCell,
} from '../components/Table';
import checklistRunService from '../services/checklistRunService';

const Header = styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:22px;h1{margin:0 0 6px;font-size:1.75rem;}p{margin:0;color:${({theme})=>theme.colors.textMuted};}@media(max-width:640px){flex-direction:column;button{width:100%;}}`;
const Filters = styled.form`display:grid;grid-template-columns:repeat(5,minmax(150px,1fr)) auto;gap:12px;align-items:end;margin-bottom:22px;@media(max-width:1100px){grid-template-columns:repeat(3,1fr);}@media(max-width:680px){grid-template-columns:1fr;}`;
const Kpis = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;margin-bottom:24px;`;
const Kpi = styled(Card)`display:grid;gap:5px;span{color:${({theme})=>theme.colors.textMuted};font-size:.82rem;}strong{font-size:1.55rem;color:${({theme})=>theme.colors.textPrimary};}small{color:${({theme})=>theme.colors.textMuted};}`;
const Section = styled.section`margin:28px 0;h2{font-size:1.2rem;margin:0 0 12px;color:${({theme})=>theme.colors.textPrimary};}p{color:${({theme})=>theme.colors.textMuted};}`;
const ErrorBox = styled.div`padding:12px;border-radius:10px;background:${({theme})=>theme.colors.dangerLight};color:${({theme})=>theme.colors.danger};margin-bottom:16px;`;
const Split = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:18px;@media(max-width:900px){grid-template-columns:1fr;}`;
const Pager = styled.div`display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;color:${({theme})=>theme.colors.textMuted};`;

const dateKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
const initialPeriod = () => {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86_400_000);
  return { from: dateKey(from), to: dateKey(to) };
};
const statusLabel = { ASSIGNED:'Atribuído', IN_PROGRESS:'Em andamento', SUBMITTED:'Enviado', APPROVED:'Aprovado', REJECTED:'Rejeitado', CANCELLED:'Cancelado' };
const percent = value => `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const score = value => value === null || value === undefined ? '—' : percent(value);
const dateTime = value => value ? new Date(value).toLocaleString('pt-BR') : '—';

export default function ChecklistReports() {
  const period = useMemo(initialPeriod, []);
  const [filters, setFilters] = useState({ ...period, templateId:'', templateVersionId:'', responsibleMembershipId:'' });
  const [report, setReport] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (requestedPage = page) => {
    setLoading(true);setError('');
    try {
      const params = { from: filters.from, to: filters.to, page: requestedPage, limit: 25 };
      if (filters.templateId) params.templateId = filters.templateId;
      if (filters.templateVersionId) params.templateVersionId = filters.templateVersionId;
      if (filters.responsibleMembershipId) params.responsibleMembershipId = filters.responsibleMembershipId;
      setReport(await checklistRunService.report(params));
      setPage(requestedPage);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const templateOptions = useMemo(() => {
    const values = new Map((report?.options?.templates || []).map(item => [item.templateId, item.name]));
    return [{ value:'', label:'Todos os modelos' }, ...[...values].map(([value,label]) => ({ value,label }))];
  }, [report]);
  const versionOptions = useMemo(() => [{ value:'', label:'Todas as versões' }, ...(report?.options?.templates || [])
    .filter(item => !filters.templateId || item.templateId === filters.templateId)
    .map(item => ({ value:item.templateVersionId, label:`${item.name} · v${item.version}` }))], [report, filters.templateId]);
  const responsibleOptions = useMemo(() => [{ value:'', label:'Todos os responsáveis' }, ...(report?.options?.responsible || [])
    .map(item => ({ value:item.membershipId, label:item.name }))], [report]);

  const submit = event => { event.preventDefault(); load(1); };
  const summary = report?.summary;

  return <>
    <Header><div><h1>Relatórios de checklists</h1><p>Conformidade, prazo, falhas e desempenho sem misturar versões do modelo.</p></div><Button variant="ghost" onClick={()=>load(page)} disabled={loading}><MdRefresh/>Atualizar</Button></Header>
    <Filters onSubmit={submit}>
      <Input label="De" type="date" required value={filters.from} onChange={event=>setFilters(current=>({...current,from:event.target.value}))}/>
      <Input label="Até" type="date" required value={filters.to} onChange={event=>setFilters(current=>({...current,to:event.target.value}))}/>
      <Select label="Modelo" value={filters.templateId} options={templateOptions} onChange={value=>setFilters(current=>({...current,templateId:value,templateVersionId:''}))}/>
      <Select label="Versão" value={filters.templateVersionId} options={versionOptions} onChange={value=>setFilters(current=>({...current,templateVersionId:value}))}/>
      <Select label="Responsável" value={filters.responsibleMembershipId} options={responsibleOptions} onChange={value=>setFilters(current=>({...current,responsibleMembershipId:value}))}/>
      <Button type="submit" disabled={loading}><MdAssessment/>{loading?'Consultando…':'Aplicar'}</Button>
    </Filters>
    {error&&<ErrorBox role="alert">{error}</ErrorBox>}
    {!loading&&!report&&<EmptyState icon={<MdAssessment/>} title="Relatório indisponível" subtitle="Revise os filtros e tente novamente."/>}
    {report&&<>
      <Kpis>
        <Kpi><span>Ocorrências</span><strong>{summary.totalRuns}</strong><small>{summary.statusCounts.APPROVED} aprovadas</small></Kpi>
        <Kpi><span>Pontuação média</span><strong>{score(summary.averageScore)}</strong><small>{summary.scoredRuns} avaliadas</small></Kpi>
        <Kpi><span>Conformidade</span><strong>{percent(summary.complianceRate)}</strong><small>sobre tentativas avaliadas</small></Kpi>
        <Kpi><span>Conclusão</span><strong>{percent(summary.completionRate)}</strong><small>{summary.onTimeRuns} dentro do prazo</small></Kpi>
        <Kpi><span>Atrasadas</span><strong>{summary.overdueRuns}</strong><small>{summary.notStartedOverdueRuns} nem iniciadas</small></Kpi>
        <Kpi><span>Retrabalho</span><strong>{summary.reworkRuns}</strong><small>{summary.criticalFailureRuns} com falha crítica</small></Kpi>
      </Kpis>

      <Section><h2>Desempenho por modelo e versão</h2><TableSurface><DataTable><TableHead><TableRow><TableHeaderCell>Modelo</TableHeaderCell><TableHeaderCell>Versão</TableHeaderCell><TableHeaderCell>Execuções</TableHeaderCell><TableHeaderCell>Média</TableHeaderCell><TableHeaderCell>Conformidade</TableHeaderCell></TableRow></TableHead><TableBody>
        {!report.byTemplateVersion.length?<TableRow><TableEmptyCell colSpan="5">Sem dados no período.</TableEmptyCell></TableRow>:report.byTemplateVersion.map(item=><TableRow key={item.templateVersionId}><TableCell>{item.name}</TableCell><TableCell>v{item.version}</TableCell><TableCell>{item.totalRuns}</TableCell><TableCell>{score(item.averageScore)}</TableCell><TableCell>{percent(item.complianceRate)}</TableCell></TableRow>)}
      </TableBody></DataTable></TableSurface></Section>

      <Split>
        <Section><h2>Responsáveis</h2><TableSurface><DataTable><TableHead><TableRow><TableHeaderCell>Responsável atual</TableHeaderCell><TableHeaderCell>Volume</TableHeaderCell><TableHeaderCell>Média</TableHeaderCell><TableHeaderCell>Conformidade</TableHeaderCell></TableRow></TableHead><TableBody>
          {!report.byResponsible.length?<TableRow><TableEmptyCell colSpan="4">Sem responsáveis.</TableEmptyCell></TableRow>:report.byResponsible.map(item=><TableRow key={item.membershipId}><TableCell>{item.name}</TableCell><TableCell>{item.totalRuns}</TableCell><TableCell>{score(item.averageScore)}</TableCell><TableCell>{percent(item.complianceRate)}</TableCell></TableRow>)}
        </TableBody></DataTable></TableSurface></Section>
        <Section><h2>Itens com mais falhas</h2><TableSurface><DataTable><TableHead><TableRow><TableHeaderCell>Item</TableHeaderCell><TableHeaderCell>Modelo/versão</TableHeaderCell><TableHeaderCell>Falhas</TableHeaderCell></TableRow></TableHead><TableBody>
          {!report.failedItems.length?<TableRow><TableEmptyCell colSpan="3">Nenhuma falha registrada.</TableEmptyCell></TableRow>:report.failedItems.map(item=><TableRow key={`${item.templateVersionId}:${item.stableKey}`}><TableCell>{item.critical&&<MdWarning aria-label="Item crítico"/>} {item.title}</TableCell><TableCell>{item.templateName} · v{item.version}</TableCell><TableCell>{item.failures}</TableCell></TableRow>)}
        </TableBody></DataTable></TableSurface></Section>
      </Split>

      <Section><h2>Ocorrências do período</h2><TableSurface><DataTable><TableHead><TableRow><TableHeaderCell>Modelo</TableHeaderCell><TableHeaderCell>Responsável</TableHeaderCell><TableHeaderCell>Prazo</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Score</TableHeaderCell></TableRow></TableHead><TableBody>
        {!report.runs.length?<TableRow><TableEmptyCell colSpan="5">Nenhuma ocorrência encontrada.</TableEmptyCell></TableRow>:report.runs.map(run=><TableRow key={run.id}><TableCell>{run.template.name} · v{run.template.version}</TableCell><TableCell>{run.assignedTo.name}</TableCell><TableCell>{dateTime(run.dueAt)}{run.overdue?' · atrasado':''}</TableCell><TableCell><Badge>{statusLabel[run.status]||run.status}</Badge></TableCell><TableCell>{score(run.attempt?.score)}</TableCell></TableRow>)}
      </TableBody></DataTable></TableSurface><Pager><Button variant="ghost" disabled={page<=1||loading} onClick={()=>load(page-1)}>Anterior</Button><span>Página {report.pagination.page} de {report.pagination.totalPages} · {report.pagination.total} registros</span><Button variant="ghost" disabled={page>=report.pagination.totalPages||loading} onClick={()=>load(page+1)}>Próxima</Button></Pager></Section>
    </>}
  </>;
}

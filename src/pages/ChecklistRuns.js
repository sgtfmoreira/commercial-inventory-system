import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { MdAddTask, MdAssignmentInd, MdChecklist, MdEdit, MdHistory, MdPause, MdPlayArrow, MdSchedule } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { Input, Select, Textarea } from '../components/FormFields';
import checklistRunService from '../services/checklistRunService';

const Header = styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px;@media(max-width:640px){flex-direction:column;button{width:100%;}}`;
const HeaderActions = styled.div`display:flex;gap:10px;flex-wrap:wrap;@media(max-width:640px){width:100%;}`;
const Title = styled.div`h1{font-size:1.75rem;margin:0 0 6px;color:${({ theme }) => theme.colors.textPrimary};}p{margin:0;color:${({ theme }) => theme.colors.textMuted};}`;
const Grid = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px;`;
const RunCard = styled(Card)`display:flex;flex-direction:column;gap:14px;`;
const RunTop = styled.div`display:flex;justify-content:space-between;gap:12px;align-items:flex-start;h3{margin:0;font-size:1.05rem;color:${({ theme }) => theme.colors.textPrimary};}small{display:block;margin-top:4px;color:${({ theme }) => theme.colors.textMuted};}`;
const Meta = styled.dl`display:grid;grid-template-columns:auto 1fr;gap:7px 12px;margin:0;font-size:.9rem;dt{color:${({ theme }) => theme.colors.textMuted};}dd{margin:0;color:${({ theme }) => theme.colors.textPrimary};font-weight:500;}`;
const Actions = styled.div`display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:auto;`;
const Form = styled.form`display:grid;gap:16px;`;
const ErrorBox = styled.div`padding:12px;border-radius:10px;background:${({ theme }) => theme.colors.dangerLight};color:${({ theme }) => theme.colors.danger};`;
const History = styled.div`display:grid;gap:10px;margin-top:8px;`;
const HistoryRow = styled.div`padding:10px;border-left:3px solid ${({ theme }) => theme.colors.primary};background:${({ theme }) => theme.colors.bgHover};border-radius:0 8px 8px 0;font-size:.88rem;strong{display:block;}small{color:${({ theme }) => theme.colors.textMuted};}`;
const SectionTitle = styled.h2`margin:28px 0 14px;color:${({ theme }) => theme.colors.textPrimary};font-size:1.25rem;`;
const ScheduleCard = styled(Card)`display:flex;flex-direction:column;gap:12px;border-left:4px solid ${({ theme }) => theme.colors.primary};`;
const DayPicker = styled.div`display:grid;gap:8px;span{font-size:.9rem;font-weight:600;color:${({ theme }) => theme.colors.textSecondary};}`;
const DayOptions = styled.div`display:grid;grid-template-columns:repeat(7,minmax(42px,1fr));gap:6px;button{padding:9px 5px;}@media(max-width:640px){grid-template-columns:repeat(4,1fr);}`;

const statusLabel = { ASSIGNED: 'Atribuído', IN_PROGRESS: 'Em andamento', SUBMITTED: 'Enviado', APPROVED: 'Aprovado', REJECTED: 'Rejeitado', CANCELLED: 'Cancelado' };
const scheduleStatusLabel = { ACTIVE: 'Ativo', PAUSED: 'Pausado', ENDED: 'Encerrado' };
const weekdayOptions = [
  { value: '0', label: 'Domingo' }, { value: '1', label: 'Segunda-feira' },
  { value: '2', label: 'Terça-feira' }, { value: '3', label: 'Quarta-feira' },
  { value: '4', label: 'Quinta-feira' }, { value: '5', label: 'Sexta-feira' },
  { value: '6', label: 'Sábado' },
];
const localDateKey = date => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};
const newRequestId = () => window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : ((r & 3) | 8)).toString(16); });
const apiMessage = error => error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Não foi possível concluir a operação.';

export default function ChecklistRuns() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [myRuns, setMyRuns] = useState([]);
  const [capabilities, setCapabilities] = useState({});
  const [templates, setTemplates] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [reassigning, setReassigning] = useState(null);
  const [form, setForm] = useState({ templateVersionId: '', assignedMembershipId: '', dueAt: '' });
  const [scheduleForm, setScheduleForm] = useState({ templateVersionId: '', assignedMembershipId: '', weekdays: [0, 1, 2, 3, 4, 5, 6], localTime: '09:00', dueAfterHours: 24, startsOn: '', endsOn: '' });
  const [reassignForm, setReassignForm] = useState({ assignedMembershipId: '', reason: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const effective = await checklistRunService.capabilities();
      setCapabilities(effective);
      const canManage = effective['checklists.runs.manage'] === true;
      const canExecute = effective['checklists.execute'] === true;
      const [runRows, templateRows, people, assigned, scheduleRows] = await Promise.all([
        canManage ? checklistRunService.list() : [],
        canManage ? checklistRunService.publishedTemplates() : [],
        canManage ? checklistRunService.eligibleAssignees() : [],
        canExecute ? checklistRunService.listMine() : [],
        canManage ? checklistRunService.listSchedules() : []
      ]);
      setRuns(runRows); setTemplates(templateRows); setAssignees(people); setMyRuns(assigned); setSchedules(scheduleRows);
    } catch (err) { setError(apiMessage(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const templateOptions = useMemo(() => [{ value: '', label: 'Selecione um modelo' }, ...templates.map(item => ({ value: item.id, label: `${item.template.name} · versão ${item.version}` }))], [templates]);
  const assigneeOptions = useMemo(() => [{ value: '', label: 'Selecione um responsável' }, ...assignees.map(item => ({ value: item.membershipId, label: `${item.name} · ${item.role}` }))], [assignees]);

  const openCreate = () => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    setForm({ templateVersionId: '', assignedMembershipId: '', dueAt: date.toISOString().slice(0, 16) });
    setError(''); setCreating(true);
  };

  const submitCreate = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await checklistRunService.create({ ...form, dueAt: new Date(form.dueAt).toISOString(), clientRequestId: newRequestId() });
      setCreating(false); await load();
    } catch (err) { setError(apiMessage(err)); }
    finally { setSaving(false); }
  };

  const openSchedule = () => {
    const now = new Date();
    setEditingSchedule(null);
    setScheduleForm({
      templateVersionId: '', assignedMembershipId: '', weekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: '09:00', dueAfterHours: 24, startsOn: localDateKey(now), endsOn: '',
    });
    setError(''); setScheduling(true);
  };

  const openScheduleEdit = schedule => {
    setEditingSchedule(schedule);
    setScheduleForm({
      templateVersionId: schedule.templateVersionId,
      assignedMembershipId: schedule.assignedTo?.membershipId || '',
      weekdays: [...(schedule.weekdays || [])],
      localTime: schedule.localTime,
      dueAfterHours: schedule.dueAfterMinutes / 60,
      startsOn: schedule.startsOn,
      endsOn: schedule.endsOn || '',
    });
    setError(''); setScheduling(true);
  };

  const submitSchedule = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const payload = {
        templateVersionId: scheduleForm.templateVersionId,
        assignedMembershipId: scheduleForm.assignedMembershipId,
        weekdays: [...scheduleForm.weekdays].sort((a, b) => a - b),
        localTime: scheduleForm.localTime,
        dueAfterMinutes: Number(scheduleForm.dueAfterHours) * 60,
        startsOn: scheduleForm.startsOn,
        endsOn: scheduleForm.endsOn || null,
      };
      if (editingSchedule) {
        await checklistRunService.updateSchedule(editingSchedule.id, { ...payload, version: editingSchedule.version });
      } else {
        await checklistRunService.createSchedule(payload);
      }
      setScheduling(false); setEditingSchedule(null); await load();
    } catch (err) { setError(apiMessage(err)); }
    finally { setSaving(false); }
  };

  const toggleSchedule = async schedule => {
    setSaving(true); setError('');
    try {
      await checklistRunService.setScheduleStatus(schedule.id, {
        status: schedule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE', version: schedule.version,
      });
      await load();
    } catch (err) { setError(apiMessage(err)); }
    finally { setSaving(false); }
  };

  const openReassign = run => {
    setReassigning(run); setReassignForm({ assignedMembershipId: '', reason: '' }); setError('');
  };

  const submitReassign = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await checklistRunService.reassign(reassigning.id, { ...reassignForm, version: reassigning.version });
      setReassigning(null); await load();
    } catch (err) { setError(apiMessage(err)); }
    finally { setSaving(false); }
  };

  const startRun = async run => {
    setSaving(true); setError('');
    try {
      const attempt = run.status === 'IN_PROGRESS' && run.attempt?.id
        ? await checklistRunService.getAttempt(run.attempt.id)
        : await checklistRunService.start(run.id);
      navigate(`/checklists/execute/${attempt.id}`);
    } catch (err) { setError(apiMessage(err)); }
    finally { setSaving(false); }
  };

  if (loading) return <p>Carregando checklists…</p>;

  return <>
    <Header>
      <Title><h1>Checklists operacionais</h1><p>Execute suas rotinas e, quando autorizado, distribua novas ocorrências.</p></Title>
      {capabilities['checklists.runs.manage'] && <HeaderActions>
        <Button variant="outlined" onClick={openSchedule} disabled={!templates.length || !assignees.length}><MdSchedule /> Agendar rotina</Button>
        <Button onClick={openCreate} disabled={!templates.length || !assignees.length}><MdAddTask /> Nova execução</Button>
      </HeaderActions>}
    </Header>
    {error && !creating && !scheduling && !reassigning && <ErrorBox role="alert">{error}</ErrorBox>}
    {capabilities['checklists.execute'] && <><SectionTitle>Meus checklists</SectionTitle>
      {!myRuns.length ? <EmptyState icon={<MdChecklist />} title="Nenhum checklist atribuído" subtitle="Suas rotinas pendentes aparecerão aqui." /> :
        <Grid>{myRuns.map(run => <RunCard key={`mine-${run.id}`}><RunTop><div><h3>{run.template.name}</h3><small>Versão {run.template.version}</small></div><Badge>{statusLabel[run.status] || run.status}</Badge></RunTop><Meta><dt>Prazo</dt><dd>{new Date(run.dueAt).toLocaleString('pt-BR')}</dd></Meta><Actions><Button onClick={() => startRun(run)} disabled={saving}>{run.status === 'IN_PROGRESS' ? 'Continuar' : run.status === 'REJECTED' ? 'Refazer' : 'Iniciar'}</Button></Actions></RunCard>)}</Grid>}
    </>}
    {capabilities['checklists.runs.manage'] && <><SectionTitle>Distribuição da unidade</SectionTitle>
    {!templates.length && <ErrorBox>Nenhum modelo publicado está disponível para distribuição.</ErrorBox>}
    {!!templates.length && !assignees.length && <ErrorBox>Nenhum funcionário com permissão de execução está elegível nesta unidade.</ErrorBox>}
    {!runs.length ? <EmptyState icon={<MdChecklist />} title="Nenhuma execução criada" subtitle="As ocorrências distribuídas para esta unidade aparecerão aqui." /> :
      <Grid>{runs.map(run => <RunCard key={run.id}>
        <RunTop><div><h3>{run.template?.name}</h3><small>Versão {run.template?.version}</small></div><Badge>{statusLabel[run.status] || run.status}</Badge></RunTop>
        <Meta><dt>Responsável</dt><dd>{run.assignedTo?.name}</dd><dt>Prazo</dt><dd>{new Date(run.dueAt).toLocaleString('pt-BR')}</dd><dt>Criado por</dt><dd>{run.createdBy?.name}</dd></Meta>
        {run.assignments?.length > 1 && <History><strong><MdHistory /> Histórico</strong>{run.assignments.slice(1).map(item => <HistoryRow key={item.id}><strong>{item.previous?.name} → {item.assignedTo?.name}</strong>{item.reason}<small>{new Date(item.createdAt).toLocaleString('pt-BR')} · {item.changedBy?.name}</small></HistoryRow>)}</History>}
        <Actions><Button variant="ghost" onClick={() => openReassign(run)} disabled={run.status !== 'ASSIGNED'}><MdAssignmentInd /> Reatribuir</Button></Actions>
      </RunCard>)}</Grid>}</>}

    {capabilities['checklists.runs.manage'] && <><SectionTitle>Agendamentos recorrentes</SectionTitle>
      {!schedules.length ? <EmptyState icon={<MdSchedule />} title="Nenhum agendamento recorrente" subtitle="Crie uma rotina para gerar ocorrências automaticamente todos os dias ou toda semana." /> :
        <Grid>{schedules.map(schedule => <ScheduleCard key={schedule.id}>
          <RunTop><div><h3>{schedule.template?.name}</h3><small>Versão {schedule.template?.version} · {schedule.weekdays?.length === 7 ? 'Todos os dias' : schedule.weekdays?.map(day => weekdayOptions.find(option => option.value === String(day))?.label).join(', ')}, {schedule.localTime}</small></div><Badge>{scheduleStatusLabel[schedule.status] || schedule.status}</Badge></RunTop>
          <Meta><dt>Responsável</dt><dd>{schedule.assignedTo?.name}</dd><dt>Prazo</dt><dd>{schedule.dueAfterMinutes / 60} hora(s) após a geração</dd><dt>Próxima geração</dt><dd>{schedule.status === 'ACTIVE' ? new Date(schedule.nextRunAt).toLocaleString('pt-BR') : '—'}</dd>{schedule.endsOn && <><dt>Até</dt><dd>{new Date(`${schedule.endsOn}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</dd></>}</Meta>
          {schedule.lastError && <ErrorBox>{schedule.lastError}</ErrorBox>}
          <Actions>{schedule.status !== 'ENDED' && <><Button variant="ghost" onClick={() => openScheduleEdit(schedule)} disabled={saving}><MdEdit /> Editar</Button><Button variant="ghost" onClick={() => toggleSchedule(schedule)} disabled={saving}>{schedule.status === 'ACTIVE' ? <><MdPause /> Pausar</> : <><MdPlayArrow /> Reativar</>}</Button></>}</Actions>
        </ScheduleCard>)}</Grid>}
    </>}

    <Modal isOpen={creating} onClose={() => !saving && setCreating(false)} title="Nova execução">
      <Form onSubmit={submitCreate}>
        {error && <ErrorBox role="alert">{error}</ErrorBox>}
        <Select label="Modelo publicado" required options={templateOptions} value={form.templateVersionId} onChange={value => setForm(current => ({ ...current, templateVersionId: value }))} />
        <Select label="Responsável" required options={assigneeOptions} value={form.assignedMembershipId} onChange={value => setForm(current => ({ ...current, assignedMembershipId: value }))} />
        <Input label="Prazo" type="datetime-local" required value={form.dueAt} onChange={event => setForm(current => ({ ...current, dueAt: event.target.value }))} />
        <Button type="submit" disabled={saving || !form.templateVersionId || !form.assignedMembershipId || !form.dueAt}>{saving ? 'Criando…' : 'Criar e atribuir'}</Button>
      </Form>
    </Modal>

    <Modal isOpen={scheduling} onClose={() => { if (!saving) { setScheduling(false); setEditingSchedule(null); } }} title={editingSchedule ? 'Editar rotina recorrente' : 'Novo agendamento recorrente'}>
      <Form onSubmit={submitSchedule}>
        {error && <ErrorBox role="alert">{error}</ErrorBox>}
        {editingSchedule && <p>As alterações serão aplicadas somente às próximas ocorrências. Checklists já gerados não serão modificados.</p>}
        <Select label="Modelo publicado" required options={templateOptions} value={scheduleForm.templateVersionId} onChange={value => setScheduleForm(current => ({ ...current, templateVersionId: value }))} />
        <Select label="Responsável" required options={assigneeOptions} value={scheduleForm.assignedMembershipId} onChange={value => setScheduleForm(current => ({ ...current, assignedMembershipId: value }))} />
        <DayPicker><span>Dias em que o checklist aparecerá *</span><DayOptions>
          {weekdayOptions.map(day => {
            const value = Number(day.value);
            const selected = scheduleForm.weekdays.includes(value);
            return <Button key={day.value} type="button" variant={selected ? 'primary' : 'outlined'} aria-pressed={selected} onClick={() => setScheduleForm(current => ({
              ...current,
              weekdays: selected ? current.weekdays.filter(item => item !== value) : [...current.weekdays, value],
            }))}>{day.label.slice(0, 3)}</Button>;
          })}
        </DayOptions></DayPicker>
        <Input label="Horário de geração" type="time" required value={scheduleForm.localTime} onChange={event => setScheduleForm(current => ({ ...current, localTime: event.target.value }))} />
        <Input label="Prazo após geração (horas)" type="number" min="0.25" max="168" step="0.25" required value={scheduleForm.dueAfterHours} onChange={event => setScheduleForm(current => ({ ...current, dueAfterHours: event.target.value }))} />
        <Input label="Início" type="date" required value={scheduleForm.startsOn} onChange={event => setScheduleForm(current => ({ ...current, startsOn: event.target.value }))} />
        <Input label="Término (opcional)" type="date" min={scheduleForm.startsOn} value={scheduleForm.endsOn} onChange={event => setScheduleForm(current => ({ ...current, endsOn: event.target.value }))} />
        <Button type="submit" disabled={saving || !scheduleForm.templateVersionId || !scheduleForm.assignedMembershipId || !scheduleForm.weekdays.length || !scheduleForm.startsOn}>{saving ? 'Salvando…' : editingSchedule ? 'Salvar alterações' : 'Criar agendamento'}</Button>
      </Form>
    </Modal>

    <Modal isOpen={Boolean(reassigning)} onClose={() => !saving && setReassigning(null)} title="Reatribuir checklist">
      <Form onSubmit={submitReassign}>
        {error && <ErrorBox role="alert">{error}</ErrorBox>}
        <p>Responsável atual: <strong>{reassigning?.assignedTo?.name}</strong></p>
        <Select label="Novo responsável" required options={assigneeOptions.filter(option => option.value !== reassigning?.assignedTo?.membershipId)} value={reassignForm.assignedMembershipId} onChange={value => setReassignForm(current => ({ ...current, assignedMembershipId: value }))} />
        <Textarea label="Justificativa" required maxLength={500} value={reassignForm.reason} onChange={event => setReassignForm(current => ({ ...current, reason: event.target.value }))} />
        <Button type="submit" disabled={saving || !reassignForm.assignedMembershipId || reassignForm.reason.trim().length < 3}>{saving ? 'Salvando…' : 'Confirmar reatribuição'}</Button>
      </Form>
    </Modal>
  </>;
}

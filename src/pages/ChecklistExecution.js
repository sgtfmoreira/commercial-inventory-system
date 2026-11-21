import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { MdArrowBack, MdCameraAlt, MdCheckCircle, MdSave } from 'react-icons/md';
import Button from '../components/Button';
import Card from '../components/Card';
import { CheckboxControl, Input, Select, Textarea } from '../components/FormFields';
import checklistRunService from '../services/checklistRunService';

const Header = styled.div`display:flex;align-items:flex-start;gap:12px;margin-bottom:20px;h1{margin:0;font-size:1.55rem;}p{margin:5px 0 0;color:${({ theme }) => theme.colors.textMuted};}`;
const Progress = styled.div`height:8px;border-radius:999px;background:${({ theme }) => theme.colors.bgHover};overflow:hidden;margin:16px 0 24px;span{display:block;height:100%;background:${({ theme }) => theme.colors.primary};transition:width .2s;}`;
const Section = styled.section`margin-bottom:24px;h2{font-size:1.15rem;margin:0 0 12px;}`;
const Item = styled(Card)`display:grid;gap:14px;margin-bottom:12px;border-left:4px solid ${({ theme, $critical }) => $critical ? theme.colors.danger : theme.colors.primary};`;
const ItemTitle = styled.div`display:flex;justify-content:space-between;gap:10px;strong{font-size:1rem;}small{color:${({ theme }) => theme.colors.textMuted};}`;
const Flags = styled.div`display:flex;gap:8px;flex-wrap:wrap;font-size:.78rem;color:${({ theme }) => theme.colors.textMuted};`;
const Row = styled.div`display:flex;align-items:center;gap:8px;`;
const Actions = styled.div`display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;`;
const Notice = styled.div`padding:12px;border-radius:10px;background:${({ theme }) => theme.colors.primarySurface};color:${({ theme }) => theme.colors.textPrimary};`;
const ErrorBox = styled.div`padding:12px;border-radius:10px;background:${({ theme }) => theme.colors.dangerLight};color:${({ theme }) => theme.colors.danger};margin-bottom:16px;`;
const PhotoPreview = styled.img`width:92px;height:92px;object-fit:cover;border-radius:10px;border:1px solid ${({ theme }) => theme.colors.border};`;
const SubmitBar = styled.div`position:sticky;bottom:12px;display:flex;justify-content:flex-end;padding:12px;background:${({ theme }) => theme.colors.bgCard};border:1px solid ${({ theme }) => theme.colors.border};border-radius:14px;box-shadow:${({ theme }) => theme.shadows.md};`;

const message = error => error?.message || 'Não foi possível concluir a operação.';

export default function ChecklistExecution() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [previews, setPreviews] = useState({});
  const previewUrls = useRef(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await checklistRunService.getAttempt(attemptId);
      setAttempt(data);
      const byItem = {};
      data.responses.forEach(response => { byItem[response.templateItemId] = {
        value: response.value ?? '', notApplicable: response.outcome === 'NOT_APPLICABLE', note: response.note || '',
        version: response.version, responseId: response.id, evidences: response.evidences || []
      }; });
      setAnswers(byItem);
    } catch (err) { setError(message(err)); }
  }, [attemptId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  const items = useMemo(() => attempt?.template.sections.flatMap(section => section.items) || [], [attempt]);
  const completed = items.filter(item => {
    const answer = answers[item.id];
    return answer?.notApplicable || (answer?.value !== '' && answer?.value !== null && answer?.value !== undefined);
  }).length;

  const update = (itemId, patch) => setAnswers(current => ({ ...current, [itemId]: { version: 0, value: '', note: '', evidences: [], ...current[itemId], ...patch } }));

  const normalizedValue = (item, value) => {
    if (item.responseType === 'BOOLEAN') return value === true || value === 'true';
    if (item.responseType === 'NUMBER') return Number(value);
    return value;
  };

  const save = async item => {
    const answer = answers[item.id] || { version: 0, value: '', note: '', notApplicable: false };
    setBusy(item.id); setError('');
    try {
      const response = await checklistRunService.saveResponse(attempt.id, item.id, {
        value: answer.notApplicable ? null : normalizedValue(item, answer.value),
        notApplicable: Boolean(answer.notApplicable), note: answer.note || null, version: answer.version || 0
      });
      update(item.id, { version: response.version, responseId: response.id, evidences: response.evidences || answer.evidences || [] });
      return response;
    } catch (err) { setError(message(err)); throw err; }
    finally { setBusy(''); }
  };

  const upload = async (item, file) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    previewUrls.current.add(preview);
    setPreviews(current => {
      if (current[item.id]) {
        URL.revokeObjectURL(current[item.id]);
        previewUrls.current.delete(current[item.id]);
      }
      return { ...current, [item.id]: preview };
    });
    setBusy(`photo-${item.id}`); setError('');
    try {
      let responseId = answers[item.id]?.responseId;
      if (!responseId) responseId = (await save(item)).id;
      const evidence = await checklistRunService.uploadEvidence(responseId, file);
      update(item.id, { evidences: [...(answers[item.id]?.evidences || []), evidence], responseId });
    } catch (err) { setError(message(err)); }
    finally { setBusy(''); }
  };

  const submit = async () => {
    setBusy('submit'); setError('');
    try {
      for (const item of items) {
        const answer = answers[item.id];
        if (answer && (answer.notApplicable || answer.value !== '')) await save(item);
      }
      const refreshed = await checklistRunService.getAttempt(attempt.id);
      const submitted = await checklistRunService.submit(attempt.id, refreshed.version);
      setAttempt(submitted);
    } catch (err) { setError(message(err)); }
    finally { setBusy(''); }
  };

  if (!attempt && !error) return <p>Carregando execução…</p>;
  if (!attempt) return <ErrorBox role="alert">{error}</ErrorBox>;
  if (['SUBMITTED', 'APPROVED', 'REJECTED'].includes(attempt.status)) {
    const approval = attempt.approvals?.[0];
    const finalMessage = attempt.status === 'APPROVED'
      ? 'Execução aprovada e concluída.'
      : attempt.status === 'REJECTED'
        ? 'Execução rejeitada. Retorne à fila para iniciar o retrabalho.'
        : 'Execução enviada para análise.';
    return <><Header><Button variant="ghost" onClick={() => navigate('/checklists')}><MdArrowBack /></Button><div><h1>{attempt.template.name}</h1><p>{finalMessage}</p></div></Header><Notice><MdCheckCircle /> Pontuação: <strong>{attempt.score}%</strong> · {attempt.isCompliant ? 'Conforme' : 'Não conforme'}{approval?.reason && <> · Motivo: {approval.reason}</>}</Notice></>;
  }

  return <>
    <Header><Button variant="ghost" onClick={() => navigate('/checklists')} aria-label="Voltar"><MdArrowBack /></Button><div><h1>{attempt.template.name}</h1><p>Versão {attempt.template.version} · prazo {new Date(attempt.run.dueAt).toLocaleString('pt-BR')}</p></div></Header>
    {error && <ErrorBox role="alert">{error}</ErrorBox>}
    <Progress aria-label={`${completed} de ${items.length} respondidos`}><span style={{ width: `${items.length ? completed / items.length * 100 : 0}%` }} /></Progress>
    {attempt.template.sections.map(section => <Section key={section.id}><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}
      {section.items.map(item => {
        const answer = answers[item.id] || { value: '', note: '', version: 0, evidences: [] };
        const disabled = Boolean(answer.notApplicable);
        return <Item key={item.id} $critical={item.critical}>
          <ItemTitle><strong>{item.title}</strong><span>{item.maxPoints} pts</span></ItemTitle>
          {item.instructions && <p>{item.instructions}</p>}
          <Flags>{item.required && <span>Obrigatório</span>}{item.critical && <span>Crítico</span>}{item.evidenceRequired && <span>Foto obrigatória</span>}</Flags>
          {item.responseType === 'BOOLEAN' && <Select label="Resposta" value={String(answer.value)} disabled={disabled} options={[{ value: '', label: 'Selecione' }, { value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]} onChange={value => update(item.id, { value })} />}
          {item.responseType === 'CHOICE' && <Select label="Resposta" value={answer.value} disabled={disabled} options={[{ value: '', label: 'Selecione' }, ...(item.answerConfigJson?.options || []).map(option => ({ value: option.value, label: option.label }))]} onChange={value => update(item.id, { value })} />}
          {item.responseType === 'NUMBER' && <Input label="Resposta" type="number" value={answer.value} disabled={disabled} onChange={event => update(item.id, { value: event.target.value })} />}
          {item.responseType === 'TEXT' && <Textarea label="Resposta" value={answer.value} disabled={disabled} onChange={event => update(item.id, { value: event.target.value })} />}
          {item.allowNotApplicable && <Row><CheckboxControl checked={Boolean(answer.notApplicable)} onChange={event => update(item.id, { notApplicable: event.target.checked })} /><span>Não se aplica</span></Row>}
          <Textarea label="Observação" value={answer.note} onChange={event => update(item.id, { note: event.target.value })} />
          {(item.evidenceRequired || answer.responseId) && <div><label><Button as="span" variant="ghost"><MdCameraAlt /> {busy === `photo-${item.id}` ? 'Enviando…' : 'Adicionar foto'}</Button><Input aria-label="Selecionar foto" hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => upload(item, event.target.files?.[0])} /></label><p>{answer.evidences?.length || 0} foto(s) confirmada(s)</p>{previews[item.id] && <PhotoPreview src={previews[item.id]} alt="Prévia da evidência" />}</div>}
          <Actions><span>{answer.responseId ? 'Progresso salvo' : 'Ainda não salvo'}</span><Button onClick={() => save(item)} disabled={busy === item.id}><MdSave /> {busy === item.id ? 'Salvando…' : 'Salvar item'}</Button></Actions>
        </Item>;
      })}
    </Section>)}
    <SubmitBar><Button onClick={submit} disabled={busy === 'submit'}>{busy === 'submit' ? 'Enviando…' : 'Enviar checklist'}</Button></SubmitBar>
  </>;
}

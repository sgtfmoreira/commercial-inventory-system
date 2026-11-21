import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { MdCheckCircle, MdFactCheck, MdRefresh, MdWarning } from 'react-icons/md';
import Button from '../components/Button';
import Card from '../components/Card';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { Textarea } from '../components/FormFields';
import checklistRunService from '../services/checklistRunService';

const Header = styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px;h1{margin:0 0 6px;font-size:1.75rem;}p{margin:0;color:${({theme})=>theme.colors.textMuted};}`;
const Grid = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px;`;
const AttemptCard = styled(Card)`display:grid;gap:12px;`;
const Top = styled.div`display:flex;justify-content:space-between;gap:12px;h3{margin:0;font-size:1.05rem;}small{display:block;margin-top:4px;color:${({theme})=>theme.colors.textMuted};}`;
const Meta = styled.dl`display:grid;grid-template-columns:auto 1fr;gap:7px 12px;margin:0;font-size:.9rem;dt{color:${({theme})=>theme.colors.textMuted};}dd{margin:0;font-weight:600;}`;
const Review = styled.div`display:grid;gap:18px;`;
const Item = styled(Card)`display:grid;gap:10px;border-left:4px solid ${({theme,$failed})=>$failed?theme.colors.danger:theme.colors.primary};h4{margin:0;}p{margin:0;}`;
const Answer = styled.div`padding:10px;border-radius:10px;background:${({theme})=>theme.colors.bgHover};`;
const Photos = styled.div`display:flex;gap:10px;flex-wrap:wrap;`;
const Photo = styled.img`width:112px;height:112px;object-fit:cover;border-radius:10px;border:1px solid ${({theme})=>theme.colors.border};`;
const Actions = styled.div`display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;`;
const ErrorBox = styled.div`padding:12px;border-radius:10px;background:${({theme})=>theme.colors.dangerLight};color:${({theme})=>theme.colors.danger};`;

const statusLabel = status => ({ PASS:'Conforme', FAIL:'Falha', NOT_APPLICABLE:'N/A', UNASSESSED:'Não avaliado' }[status] || status);
const valueLabel = value => typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : value ?? '—';

export default function ChecklistApprovals() {
  const [attempts,setAttempts] = useState([]);
  const [selected,setSelected] = useState(null);
  const [reason,setReason] = useState('');
  const [photos,setPhotos] = useState({});
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const photoUrls = useRef(new Set());

  const load = useCallback(async()=>{
    setLoading(true);setError('');
    try{setAttempts(await checklistRunService.listApprovals());}
    catch(err){setError(err.message);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>()=>{photoUrls.current.forEach(url=>URL.revokeObjectURL(url));photoUrls.current.clear();},[]);

  const close = ()=>{
    Object.values(photos).forEach(URL.revokeObjectURL);
    Object.values(photos).forEach(url=>photoUrls.current.delete(url));
    setPhotos({});setSelected(null);setReason('');setError('');
  };

  const open = async attempt=>{
    setError('');
    try{
      const detail = await checklistRunService.getApprovalAttempt(attempt.id);
      setSelected(detail);
      const evidences = detail.responses.flatMap(response=>response.evidences || []);
      const entries = await Promise.all(evidences.map(async evidence=>{
        const blob = await checklistRunService.evidenceBlob(evidence.id);
        const url = URL.createObjectURL(blob);photoUrls.current.add(url);return [evidence.id,url];
      }));
      setPhotos(Object.fromEntries(entries));
    }catch(err){setError(err.message);}
  };

  const decide = async decision=>{
    setSaving(true);setError('');
    try{
      if(decision==='APPROVE') await checklistRunService.approve(selected.id,{version:selected.version,reason:null});
      else await checklistRunService.reject(selected.id,{version:selected.version,reason:reason.trim()});
      close();await load();
    }catch(err){setError(err.message);}
    finally{setSaving(false);}
  };

  const responseByItem = useMemo(()=>new Map((selected?.responses||[]).map(response=>[response.templateItemId,response])),[selected]);

  if(loading)return <p>Carregando aprovações…</p>;
  return <>
    <Header><div><h1>Aprovações de checklists</h1><p>Revise respostas, evidências e pontuação antes da decisão.</p></div><Button variant="ghost" onClick={load}><MdRefresh/>Atualizar</Button></Header>
    {error&&!selected&&<ErrorBox role="alert">{error}</ErrorBox>}
    {!attempts.length?<EmptyState icon={<MdFactCheck/>} title="Nenhuma aprovação pendente" subtitle="As tentativas submetidas por outros executores aparecerão aqui."/>:<Grid>{attempts.map(attempt=><AttemptCard key={attempt.id}><Top><div><h3>{attempt.template.name}</h3><small>Versão {attempt.template.version} · tentativa {attempt.attemptNumber}</small></div><Badge>{attempt.score}%</Badge></Top><Meta><dt>Executor</dt><dd>{attempt.executor?.name}</dd><dt>Resultado</dt><dd>{attempt.isCompliant?'Conforme':'Não conforme'}</dd><dt>Enviado</dt><dd>{new Date(attempt.submittedAt).toLocaleString('pt-BR')}</dd></Meta><Button onClick={()=>open(attempt)}>Revisar</Button></AttemptCard>)}</Grid>}
    <Modal isOpen={Boolean(selected)} onClose={()=>!saving&&close()} title="Revisar checklist">
      {selected&&<Review>
        {error&&<ErrorBox role="alert">{error}</ErrorBox>}
        <Meta><dt>Modelo</dt><dd>{selected.template.name} · v{selected.template.version}</dd><dt>Executor</dt><dd>{selected.executor?.name}</dd><dt>Pontuação</dt><dd>{selected.score}%</dd><dt>Resultado</dt><dd>{selected.isCompliant?'Conforme':'Não conforme'}{selected.criticalFailure?' · falha crítica':''}</dd></Meta>
        {selected.template.sections.flatMap(section=>section.items).map(item=>{const response=responseByItem.get(item.id);return <Item key={item.id} $failed={response?.outcome==='FAIL'}><h4>{item.title}</h4><Answer><strong>{statusLabel(response?.outcome)}</strong><p>Resposta: {String(valueLabel(response?.value))}</p>{response?.note&&<p>Observação: {response.note}</p>}</Answer>{response?.evidences?.length>0&&<Photos>{response.evidences.map(evidence=>photos[evidence.id]?<Photo key={evidence.id} src={photos[evidence.id]} alt={`Evidência de ${item.title}`}/>:null)}</Photos>}</Item>;})}
        <Textarea label="Justificativa da rejeição" value={reason} maxLength={1000} onChange={event=>setReason(event.target.value)} helperText="Obrigatória somente para rejeitar."/>
        <Actions><Button variant="danger" disabled={saving||reason.trim().length<3} onClick={()=>decide('REJECT')}><MdWarning/>Rejeitar e solicitar retrabalho</Button><Button disabled={saving} onClick={()=>decide('APPROVE')}><MdCheckCircle/>Aprovar</Button></Actions>
      </Review>}
    </Modal>
  </>;
}

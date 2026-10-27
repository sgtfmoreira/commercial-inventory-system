import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import { SelectControl } from '../components/FormFields';
import { TextareaControl } from '../components/FormFields';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import eventService from '../services/eventService';
import { useApp } from '../context/AppContext';

const Page=styled.div`width:100%;display:grid;gap:18px;`;
const Panel=styled.section`padding:20px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};background:${({theme})=>theme.colors.bgCard};color:${({theme})=>theme.colors.textPrimary};`;
const Header=styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;h1{margin:0;}p{margin:4px 0;color:${({theme})=>theme.colors.textMuted};}`;
const Grid=styled.div`display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;@media(max-width:760px){grid-template-columns:1fr;}div{display:grid;gap:4px;}span{font-size:.78rem;color:${({theme})=>theme.colors.textMuted};}strong{overflow-wrap:anywhere;}`;
const FormGrid=styled.div`display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;@media(max-width:680px){grid-template-columns:1fr;}`;
const Field=styled.label`display:grid;gap:6px;font-size:.82rem;font-weight:700;${({$wide})=>$wide?'grid-column:1/-1;':''}`;
const control=`width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;font:inherit;`;
const Input=styled(InputControl)`${control}border:1px solid ${({theme})=>theme.colors.border};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const Select=styled(SelectControl)`${control}border:1px solid ${({theme})=>theme.colors.border};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const Textarea=styled(TextareaControl)`${control}min-height:90px;border:1px solid ${({theme})=>theme.colors.border};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const Actions=styled.div`display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;`;
const Button=DSButton;
const Revision=styled.article`display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid ${({theme})=>theme.colors.border};@media(max-width:900px){grid-template-columns:repeat(2,minmax(0,1fr));}.links{display:flex;gap:10px;flex-wrap:wrap;}small{display:block;color:${({theme})=>theme.colors.textMuted};}`;
const types=[['CORPORATE','Corporativo'],['WEDDING','Casamento'],['BIRTHDAY','Aniversário'],['GRADUATION','Formatura'],['GET_TOGETHER','Confraternização'],['CATERING','Catering'],['INTERNAL','Evento interno'],['OTHER','Outro']];
const nullable=value=>value?.trim()?value.trim():null;
const money=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=value=>value?new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`)):'—';
const dateTime=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const initial={customerId:'',name:'',type:'CORPORATE',eventDate:'',startTime:'',endTime:'',guestCount:'',location:'',responsibleUserId:'',internalNotes:''};

export default function EventDetail(){
  const{id}=useParams();const{state}=useApp();const establishmentId=state.establishment?.id;
  const[event,setEvent]=useState(null);const[budgets,setBudgets]=useState([]);const[customers,setCustomers]=useState([]);const[responsibles,setResponsibles]=useState([]);
  const[form,setForm]=useState(initial);const[editing,setEditing]=useState(false);const[saving,setSaving]=useState(false);const[error,setError]=useState('');
  const load=useCallback(async()=>{setEvent(null);setError('');try{const[eventData,budgetData,customerData,userData]=await Promise.all([eventService.getEvent(id),eventService.listEventBudgets(id),eventService.listCustomers({page:1,pageSize:100}),eventService.listResponsibleUsers()]);setEvent(eventData);setBudgets(budgetData||[]);setCustomers(customerData?.items||[]);setResponsibles(userData||[]);setForm({customerId:eventData.customerId||eventData.customer?.id||'',name:eventData.name||'',type:eventData.type||'CORPORATE',eventDate:eventData.eventDate||'',startTime:eventData.startTime||'',endTime:eventData.endTime||'',guestCount:String(eventData.guestCount||''),location:eventData.location||'',responsibleUserId:eventData.responsibleUserId||eventData.responsibleUser?.id||'',internalNotes:eventData.internalNotes||''});}catch(e){setError(e.message||'Não foi possível carregar o evento.');}},[id,establishmentId]);
  useEffect(()=>{load();},[load]);
  const change=e=>setForm(current=>({...current,[e.target.name]:e.target.value}));
  const save=async e=>{e.preventDefault();setSaving(true);try{await eventService.updateEvent(id,{...form,guestCount:Number(form.guestCount),startTime:nullable(form.startTime),endTime:nullable(form.endTime),location:nullable(form.location),responsibleUserId:form.responsibleUserId||null,internalNotes:nullable(form.internalNotes)});setEditing(false);toast.success('Evento atualizado.');await load();}finally{setSaving(false);}};
  const cancel=async()=>{if(!window.confirm('Cancelar este evento e todos os orçamentos ainda abertos?'))return;setSaving(true);try{await eventService.cancelEvent(id);setEditing(false);toast.success('Evento cancelado.');await load();}finally{setSaving(false);}};
  if(error)return <Page><Link to="/events">← Eventos</Link><Panel>{error} <Button $secondary onClick={load}>Tentar novamente</Button></Panel></Page>;
  if(!event)return <Page>Carregando evento...</Page>;
  const canEdit=['DRAFT','BUDGETING'].includes(event.status)&&budgets.some(b=>b.status==='DRAFT');
  return <Page><Link to="/events">← Eventos</Link><Header><div><h1>{event.name}</h1><p>{event.code}</p></div><Actions>{canEdit&&!editing&&<Button onClick={()=>setEditing(true)}>Editar evento</Button>}{event.status!=='CANCELLED'&&<Button $danger disabled={saving} onClick={cancel}>Cancelar evento</Button>}</Actions></Header>
    {editing?<Panel><form onSubmit={save}><FormGrid><Field $wide>Nome<Input required name="name" value={form.name} onChange={change}/></Field><Field>Cliente<Select required name="customerId" value={form.customerId} onChange={change}>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></Field><Field>Responsável<Select name="responsibleUserId" value={form.responsibleUserId} onChange={change}><option value="">Sem responsável definido</option>{responsibles.map(user=><option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</Select></Field><Field>Tipo<Select name="type" value={form.type} onChange={change}>{types.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field>Data<Input required type="date" name="eventDate" value={form.eventDate} onChange={change}/></Field><Field>Início<Input type="time" name="startTime" value={form.startTime} onChange={change}/></Field><Field>Fim<Input type="time" name="endTime" min={form.startTime||undefined} value={form.endTime} onChange={change}/></Field><Field>Convidados<Input required type="number" min="1" name="guestCount" value={form.guestCount} onChange={change}/></Field><Field $wide>Local<Textarea name="location" value={form.location} onChange={change}/></Field><Field $wide>Observações internas<Textarea name="internalNotes" value={form.internalNotes} onChange={change}/></Field></FormGrid><Actions><Button type="button" $secondary onClick={()=>setEditing(false)}>Descartar</Button><Button disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</Button></Actions></form></Panel>:<Panel><Grid><div><span>Cliente</span><strong>{event.customer?.name}</strong></div><div><span>Responsável</span><strong>{event.responsibleUser?.name||'—'}</strong></div><div><span>Data</span><strong>{date(event.eventDate)}</strong></div><div><span>Convidados</span><strong>{event.guestCount}</strong></div><div><span>Status</span><strong>{event.status}</strong></div><div><span>Horário</span><strong>{event.startTime||'—'}{event.endTime?` – ${event.endTime}`:''}</strong></div><div><span>Local</span><strong>{event.location||'—'}</strong></div></Grid></Panel>}
    <Panel><h2>Revisões do orçamento</h2>{budgets.map(b=><Revision key={b.id}><div><strong>Revisão {b.revision}</strong><small>{b.status}</small></div><div><small>Valor</small><strong>{money(b.quotedPrice)}</strong></div><div><small>Criada por</small><strong>{b.createdByUser?.name||'—'}</strong></div><div><small>Enviada</small><strong>{dateTime(b.sentAt)}</strong></div><div><small>Aprovada</small><strong>{dateTime(b.approvedAt)}</strong></div><div className="links"><Link to={`/events/${event.id}/budgets/${b.id}/edit`}>{b.status==='DRAFT'?'Editar':'Abrir'}</Link><Link to={`/events/${event.id}/budgets/${b.id}/proposal`}>Proposta</Link></div></Revision>)}</Panel>
  </Page>;
}

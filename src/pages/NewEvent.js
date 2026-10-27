import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import { SelectControl } from '../components/FormFields';
import { TextareaControl } from '../components/FormFields';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import eventService from '../services/eventService';
import { useApp } from '../context/AppContext';

const Page = styled.div`width:100%;display:grid;gap:20px;`;
const Header = styled.div`h1{margin:0;color:${({theme})=>theme.colors.textPrimary};}p{color:${({theme})=>theme.colors.textMuted};}`;
const Panel = styled.form`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:22px;box-shadow:${({theme})=>theme.shadows.card};`;
const Grid = styled.div`display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;@media(max-width:680px){grid-template-columns:1fr;}`;
const Field = styled.label`display:grid;gap:6px;color:${({theme})=>theme.colors.textSecondary};font-size:.86rem;font-weight:700;${({$wide})=>$wide?'grid-column:1/-1;':''}`;
const control = `width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;font:inherit;`;
const Input = styled(InputControl)`${control}border:1px solid ${({theme})=>theme.colors.border};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const Select = styled(SelectControl)`${control}border:1px solid ${({theme})=>theme.colors.border};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const Textarea = styled(TextareaControl)`${control}min-height:90px;resize:vertical;border:1px solid ${({theme})=>theme.colors.border};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const Actions = styled.div`display:flex;justify-content:flex-end;gap:10px;margin-top:22px;flex-wrap:wrap;`;
const Button = DSButton;
const CustomerRow = styled.div`display:grid;grid-template-columns:1fr auto auto;gap:8px;@media(max-width:680px){grid-template-columns:1fr;}`;
const ModalGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:14px;@media(max-width:560px){grid-template-columns:1fr;}`;
const ErrorNotice = styled.div`margin-top:8px;padding:11px 13px;border-radius:8px;background:${({theme})=>theme.colors.bgInput};border-left:4px solid ${({theme})=>theme.colors.warning||'var(--color-warning)'};display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;`;

const types = [['CORPORATE','Corporativo'],['WEDDING','Casamento'],['BIRTHDAY','Aniversário'],['GRADUATION','Formatura'],['GET_TOGETHER','Confraternização'],['CATERING','Catering'],['INTERNAL','Evento interno'],['OTHER','Outro']];
const initial = { name:'', customerId:'', type:'CORPORATE', eventDate:'', startTime:'', endTime:'', guestCount:'', location:'', responsibleUserId:'', internalNotes:'' };
const emptyCustomer = { name:'', document:'', phone:'', email:'', notes:'' };
const nullable = value => value?.trim() ? value.trim() : null;

export default function NewEvent() {
  const navigate = useNavigate();
  const { state } = useApp();
  const establishmentId = state.establishment?.id;
  const [form,setForm] = useState(initial);
  const [customers,setCustomers] = useState([]);
  const [customerSearch,setCustomerSearch] = useState('');
  const [responsibleUsers,setResponsibleUsers] = useState([]);
  const [customerForm,setCustomerForm] = useState(emptyCustomer);
  const [customerModal,setCustomerModal] = useState(false);
  const [editingCustomerId,setEditingCustomerId] = useState(null);
  const [saving,setSaving] = useState(false);
  const [customersLoading,setCustomersLoading] = useState(false);
  const [customersError,setCustomersError] = useState('');
  const [customersReloadToken,setCustomersReloadToken] = useState(0);

  useEffect(()=>{
    let active=true;
    setCustomers([]);setForm(current=>({...current,customerId:''}));setCustomersLoading(true);setCustomersError('');
    const timer=setTimeout(()=>eventService.listCustomers({page:1,pageSize:20,search:customerSearch||undefined})
      .then(data=>{if(active)setCustomers(data?.items||[]);})
      .catch(error=>{if(active)setCustomersError(error.message||'Não foi possível carregar os clientes.');})
      .finally(()=>{if(active)setCustomersLoading(false);}),customerSearch?250:0);
    return()=>{active=false;clearTimeout(timer);};
  },[establishmentId,customersReloadToken,customerSearch]);
  useEffect(()=>{
    let active=true;
    eventService.listResponsibleUsers().then(users=>{if(active)setResponsibleUsers(users||[]);}).catch(()=>{if(active)setResponsibleUsers([]);});
    return()=>{active=false;};
  },[establishmentId]);
  const change = event => setForm(current=>({...current,[event.target.name]:event.target.value}));
  const saveCustomer = async () => {
    setSaving(true);
    try {
      const payload={name:customerForm.name.trim(),document:nullable(customerForm.document),phone:nullable(customerForm.phone),email:nullable(customerForm.email),notes:nullable(customerForm.notes)};
      const customer=editingCustomerId?await eventService.updateCustomer(editingCustomerId,payload):await eventService.createCustomer(payload);
      setCustomers(current=>[...current.filter(item=>item.id!==customer.id),customer].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));
      setForm(current=>({...current,customerId:customer.id})); setCustomerModal(false); setCustomerForm(emptyCustomer); toast.success(editingCustomerId?'Cliente atualizado.':'Cliente criado.');
      setEditingCustomerId(null);
    } finally { setSaving(false); }
  };
  const openNewCustomer=()=>{setEditingCustomerId(null);setCustomerForm(emptyCustomer);setCustomerModal(true);};
  const openCustomerEdit=()=>{const customer=customers.find(item=>item.id===form.customerId);if(!customer)return;setEditingCustomerId(customer.id);setCustomerForm({name:customer.name||'',document:customer.document||'',phone:customer.phone||'',email:customer.email||'',notes:customer.notes||''});setCustomerModal(true);};
  const submit = async event => {
    event.preventDefault(); setSaving(true);
    try {
      await eventService.createEvent({...form,guestCount:Number(form.guestCount),startTime:nullable(form.startTime),endTime:nullable(form.endTime),location:nullable(form.location),responsibleUserId:form.responsibleUserId||null,internalNotes:nullable(form.internalNotes)});
      toast.success('Evento criado com orçamento inicial.'); navigate('/events');
    } finally { setSaving(false); }
  };

  return <Page><Header><h1>Novo evento</h1><p>Cadastre as informações comerciais iniciais. Cardápio e custos serão incluídos na próxima etapa.</p></Header><Panel onSubmit={submit}><Grid>
    <Field $wide>Nome do evento<Input required name="name" value={form.name} onChange={change} maxLength="180"/></Field>
    <Field $wide>Buscar cliente<Input aria-label="Buscar cliente" value={customerSearch} onChange={event=>setCustomerSearch(event.target.value)} placeholder="Nome ou documento"/></Field>
    <Field $wide>Cliente<CustomerRow><Select required name="customerId" value={form.customerId} onChange={change} disabled={customersLoading}><option value="">{customersLoading?'Carregando clientes...':'Selecione um cliente'}</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select><Button type="button" $secondary onClick={openNewCustomer}>+ Novo cliente</Button><Button type="button" $secondary disabled={!form.customerId} onClick={openCustomerEdit}>Editar cliente</Button></CustomerRow>{customersError&&<ErrorNotice role="alert"><span>Não foi possível carregar os clientes: {customersError}</span><Button type="button" $secondary onClick={()=>setCustomersReloadToken(value=>value+1)}>Tentar novamente</Button></ErrorNotice>}</Field>
    <Field>Tipo de evento<Select name="type" value={form.type} onChange={change}>{types.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
    <Field>Data<Input required type="date" name="eventDate" value={form.eventDate} onChange={change}/></Field>
    <Field>Horário inicial<Input type="time" name="startTime" value={form.startTime} onChange={change}/></Field><Field>Horário final<Input type="time" name="endTime" min={form.startTime||undefined} value={form.endTime} onChange={change}/></Field>
    <Field>Número de convidados<Input required type="number" min="1" max="1000000" name="guestCount" value={form.guestCount} onChange={change}/></Field>
    <Field>Responsável<Select name="responsibleUserId" value={form.responsibleUserId} onChange={change}><option value="">Sem responsável definido</option>{responsibleUsers.map(user=><option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</Select></Field>
    <Field $wide>Local<Textarea name="location" value={form.location} onChange={change}/></Field><Field $wide>Observações internas<Textarea name="internalNotes" value={form.internalNotes} onChange={change}/></Field>
  </Grid><Actions><Button type="button" $secondary onClick={()=>navigate('/events')}>Cancelar</Button><Button disabled={saving}>{saving?'Salvando...':'Criar evento'}</Button></Actions></Panel>
  <Modal isOpen={customerModal} onClose={()=>setCustomerModal(false)} title={editingCustomerId?'Editar cliente':'Novo cliente'} footer={<><Button $secondary onClick={()=>setCustomerModal(false)}>Cancelar</Button><Button disabled={saving||!customerForm.name.trim()} onClick={saveCustomer}>{saving?'Salvando...':editingCustomerId?'Salvar cliente':'Criar cliente'}</Button></>}><ModalGrid><Field $wide>Nome / razão social<Input value={customerForm.name} onChange={e=>setCustomerForm({...customerForm,name:e.target.value})}/></Field><Field>CPF/CNPJ<Input value={customerForm.document} onChange={e=>setCustomerForm({...customerForm,document:e.target.value})}/></Field><Field>Telefone<Input value={customerForm.phone} onChange={e=>setCustomerForm({...customerForm,phone:e.target.value})}/></Field><Field $wide>E-mail<Input type="email" value={customerForm.email} onChange={e=>setCustomerForm({...customerForm,email:e.target.value})}/></Field><Field $wide>Observações<Textarea value={customerForm.notes} onChange={e=>setCustomerForm({...customerForm,notes:e.target.value})}/></Field></ModalGrid></Modal>
  </Page>;
}

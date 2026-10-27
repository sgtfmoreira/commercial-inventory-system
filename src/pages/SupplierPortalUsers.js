import { SelectControl } from '../components/FormFields';
import { InputControl } from '../components/FormFields';
import React,{useEffect,useState}from'react';import styled from'styled-components';import toast from'react-hot-toast';import organizationSupplierService from'../services/organizationSupplierService';import{portalAdmin}from'../services/supplierPortalService';import Button from'../components/Button';
import {useApp} from '../context/AppContext';
const Page=styled.div`display:flex;flex-direction:column;gap:20px;color:${({theme})=>theme.colors.textPrimary};`;const Box=styled.div`padding:18px;background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:12px;display:flex;gap:10px;flex-wrap:wrap;input,select{padding:10px;background:${({theme})=>theme.colors.bgInput};color:inherit;border:1px solid ${({theme})=>theme.colors.border};border-radius:8px;}`;const Row=styled(Box)`justify-content:space-between;align-items:center;`;
const emptyForm={name:'',email:'',password:''};
export default function SupplierPortalUsers(){
 const {state}=useApp();
 const [suppliers,setSuppliers]=useState([]),[supplierId,setSupplierId]=useState(''),[users,setUsers]=useState([]);
 const [form,setForm]=useState(emptyForm),[editing,setEditing]=useState(null),[reset,setReset]=useState(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  setLoading(true);setError('');setUsers([]);setSuppliers([]);setSupplierId('');setEditing(null);setForm(emptyForm);setReset(null);
  Promise.all([organizationSupplierService.list(),portalAdmin.listAll()]).then(([s,u])=>{
   if(active){setSuppliers(s||[]);setUsers(u||[]);}
  }).catch(()=>{if(active)setError('Não foi possível carregar os acessos. Atualize a página para tentar novamente.');}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[state.establishment?.id]);
 const reload=async()=>setUsers(await portalAdmin.listAll());
 const cancel=()=>{setEditing(null);setForm(emptyForm);};
 const save=async e=>{
  e.preventDefault();if(saving)return;setSaving(true);setError('');
  try{
   const data={name:form.name,email:form.email,...(form.password?{password:form.password}:{})};
   if(editing)await portalAdmin.update(editing.id,data);else await portalAdmin.create(supplierId,data);
   toast.success(editing?'Acesso atualizado.':'Conta externa criada.');cancel();await reload();
  }catch{setError('Não foi possível concluir a operação. Confira a mensagem de erro e tente novamente.');}finally{setSaving(false);}
 };
 const edit=user=>{setEditing(user);setForm({name:user.name,email:user.email,password:''});setReset(null);};
 const revoke=async id=>{
  if(!window.confirm('Revogar esta conta e todas as sessões?'))return;
  setSaving(true);try{await portalAdmin.revoke(id);toast.success('Conta revogada.');await reload();}catch{setError('Não foi possível revogar o acesso.');}finally{setSaving(false);}
 };
 const token=async user=>{setSaving(true);try{setReset({...await portalAdmin.resetToken(user.id),email:user.email});}catch{setError('Não foi possível gerar a recuperação.');}finally{setSaving(false);}};
 const visible=users.filter(user=>!supplierId||user.organizationSupplierId===supplierId);
 return <Page>
  <div><h1>Acessos do Portal</h1><p>Consulte os logins por fornecedor e edite nome, e-mail ou senha.</p></div>
  <Box><label>Fornecedor <SelectControl aria-label="Filtrar fornecedor" disabled={saving||loading} value={supplierId} onChange={e=>{setSupplierId(e.target.value);cancel();setReset(null);}}><option value="">Todos os fornecedores</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{!s.isActive?' (inativo)':''}</option>)}</SelectControl></label></Box>
  {error&&<p role="alert">{error}</p>}
  {(editing||supplierId)&&!loading&&<form onSubmit={save}><h2>{editing?`Editar acesso — ${editing.organizationSupplier?.name}`:'Novo acesso'}</h2><Box>
   <label>Nome <InputControl required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
   <label>E-mail de acesso <InputControl required type="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
   <label>{editing?'Nova senha (opcional)':'Senha inicial'} <InputControl required={!editing} type="password" autoComplete="new-password" minLength={6} maxLength={128} placeholder="Mínimo 6 caracteres" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
   {editing&&<p>Deixe a senha vazia para manter a atual.</p>}
   <Button type="submit" disabled={saving||(!editing&&!suppliers.find(s=>s.id===supplierId)?.isActive)}>{saving?'Salvando...':editing?'Salvar alterações':'Criar conta'}</Button>
   {editing&&<Button type="button" variant="secondary" disabled={saving} onClick={cancel}>Cancelar</Button>}
  </Box></form>}
  {!supplierId&&!editing&&<p>Selecione um fornecedor para criar um novo acesso.</p>}
  <h2>Logins cadastrados ({visible.length})</h2>
  {loading?<p>Carregando acessos...</p>:!visible.length&&!error?<p>Nenhum acesso cadastrado para este filtro.</p>:visible.map(user=><Row key={user.id}>
   <div><strong>{user.organizationSupplier?.name}</strong><p>{user.name} · {user.email}</p><small>{!user.isActive?'Revogada':user.isBlocked?'Bloqueada':'Ativa'} · Último acesso: {user.lastLoginAt?new Date(user.lastLoginAt).toLocaleString('pt-BR'):'Ainda não acessou'}</small></div>
   <div><Button size="sm" variant="secondary" disabled={saving} onClick={()=>edit(user)}>Editar</Button>{user.isActive&&<> <Button size="sm" variant="secondary" disabled={saving} onClick={()=>token(user)}>Recuperação</Button> <Button size="sm" variant="danger" disabled={saving} onClick={()=>revoke(user.id)}>Revogar</Button></>}</div>
  </Row>)}
  {reset&&<Box><div><strong>Recuperação de {reset.email} — válida por {reset.expiresInMinutes} minutos</strong><p style={{wordBreak:'break-all'}}>{reset.token}</p><small>Compartilhe por canal seguro. O token será invalidado após o uso.</small></div></Box>}
 </Page>;
}

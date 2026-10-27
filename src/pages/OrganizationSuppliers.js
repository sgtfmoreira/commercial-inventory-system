import { CheckboxControl } from '../components/FormFields';
import { InputControl } from '../components/FormFields';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { MdBusiness, MdAdd, MdEdit, MdSearch, MdFactCheck, MdCheckCircle, MdCancel, MdToggleOff } from 'react-icons/md';
import service from '../services/organizationSupplierService';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

const emptyForm = { name: '', legalName: '', cnpj: '', isActive: true };
const formatCnpj = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : value || 'Sem CNPJ';
};
const Page = styled.div`display:flex;flex-direction:column;gap:24px;`;
const Header = styled.header`display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;`;
const Title = styled.h1`font-size:${({theme})=>theme.fontSizes['3xl']};color:${({theme})=>theme.colors.textPrimary};`;
const Subtitle = styled.p`color:${({theme})=>theme.colors.textSecondary};margin-top:4px;max-width:760px;`;
const Actions = styled.div`display:flex;gap:8px;flex-wrap:wrap;`;
const Stats = styled.div`display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;@media(max-width:700px){grid-template-columns:1fr;}`;
const Stat = styled.div`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:16px;span{display:block;color:${({theme})=>theme.colors.textMuted};font-size:13px;}strong{display:block;margin-top:4px;font-size:24px;color:${({theme})=>theme.colors.textPrimary};}`;
const Toolbar = styled.div`display:flex;gap:12px;align-items:center;flex-wrap:wrap;`;
const Search = styled.label`flex:1;min-width:240px;display:flex;align-items:center;gap:8px;background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};padding:0 12px;color:${({theme})=>theme.colors.textMuted};input{width:100%;padding:11px 0;background:transparent;border:0;color:${({theme})=>theme.colors.textPrimary};outline:none;}`;
const Toggle = styled.label`display:flex;align-items:center;gap:8px;color:${({theme})=>theme.colors.textSecondary};font-size:14px;cursor:pointer;`;
const Grid = styled.div`display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px;@media(max-width:430px){grid-template-columns:1fr;}`;
const Card = styled.article`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:18px;display:flex;flex-direction:column;gap:14px;opacity:${({$inactive})=>$inactive?.68:1};`;
const CardTop = styled.div`display:flex;justify-content:space-between;gap:12px;h2{font-size:18px;color:${({theme})=>theme.colors.textPrimary};}small{display:block;margin-top:4px;color:${({theme})=>theme.colors.textMuted};}`;
const Status = styled.span`font-size:12px;font-weight:700;color:${({theme,$active})=>$active?theme.colors.success:theme.colors.textMuted};`;
const LocalList = styled.div`border-top:1px solid ${({theme})=>theme.colors.border};padding-top:12px;display:flex;flex-direction:column;gap:8px;`;
const Local = styled.div`padding:9px;background:${({theme})=>theme.colors.bgInput};border-radius:${({theme})=>theme.radii.sm};font-size:13px;color:${({theme})=>theme.colors.textPrimary};small{display:block;color:${({theme})=>theme.colors.textMuted};margin-top:2px;}`;
const FormGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:16px;@media(max-width:560px){grid-template-columns:1fr;}`;
const Field = styled.label`display:flex;flex-direction:column;gap:6px;color:${({theme})=>theme.colors.textSecondary};font-size:13px;font-weight:600;${({$wide})=>$wide?'grid-column:1/-1;':''}`;
const Input = styled(InputControl)`padding:10px 12px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};outline:none;`;
const Notice = styled.div`padding:12px;border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.warningLight};color:${({theme})=>theme.colors.warning};font-size:13px;margin-bottom:16px;`;
const ReviewList = styled.div`display:flex;flex-direction:column;gap:14px;max-height:60vh;overflow:auto;`;
const ReviewCard = styled.article`border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};padding:14px;display:flex;flex-direction:column;gap:12px;`;
const ReviewTop = styled.div`display:flex;justify-content:space-between;gap:12px;strong{color:${({theme})=>theme.colors.textPrimary};}small{display:block;color:${({theme})=>theme.colors.textMuted};margin-top:3px;}`;
const ReviewGrid = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:12px;`;
const Selectable = styled.label`display:flex;gap:9px;padding:9px;background:${({$selected,theme})=>$selected?theme.colors.infoLight:theme.colors.bgInput};border-radius:${({theme})=>theme.radii.sm};font-size:13px;color:${({theme})=>theme.colors.textPrimary};cursor:pointer;input{margin-top:3px;}small{display:block;color:${({theme})=>theme.colors.textMuted};}`;

export default function OrganizationSuppliers() {
  const { state } = useApp();
  const isAdmin = state.user?.role === 'ADMIN';
  const [items, setItems] = useState([]);
  const [reviews, setReviews] = useState({ summary: {}, candidates: [] });
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [formModal, setFormModal] = useState(false);
  const [reviewModal, setReviewModal] = useState(false);
  const [approvalModal, setApprovalModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const [central, candidates] = await Promise.all([service.list(), service.listReviewCandidates()]);
    setItems(Array.isArray(central) ? central : []);
    setReviews(candidates || { summary: {}, candidates: [] });
  }, []);
  useEffect(() => { load().catch(()=>{}); }, [load, state.establishment?.id]);
  const filtered = useMemo(() => items.filter(item => {
    if (!showInactive && !item.isActive) return false;
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return !term || [item.name,item.legalName,item.cnpj].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(term));
  }), [items, search, showInactive]);
  const visible = (reviews.candidates||[]).filter(item=>showRejected||item.review?.status!=='REJECTED');
  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormModal(true); };
  const openEdit = item => { setEditing(item); setForm({name:item.name||'',legalName:item.legalName||'',cnpj:item.cnpj||'',isActive:item.isActive}); setFormModal(true); };
  const save = async event => { event.preventDefault(); setSaving(true); try { const data={...form,legalName:form.legalName||null,cnpj:form.cnpj||null}; editing?await service.update(editing.id,data):await service.create(data); toast.success(editing?'Fornecedor central atualizado.':'Fornecedor central criado.'); setFormModal(false); await load(); } finally { setSaving(false); } };
  const deactivate = async item => { if(!window.confirm(`Desativar o fornecedor central "${item.name}"?`))return; await service.deactivate(item.id); toast.success('Fornecedor central desativado.'); await load(); };
  const openApproval = item => { setCandidate(item); setSelected(item.suppliers.map(local=>local.id)); setForm({...emptyForm,name:item.suggestedName,cnpj:item.normalizedCnpj}); setApprovalModal(true); };
  const toggle = id => setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  const approve = async () => { if(!candidate||selected.length<2)return; setSaving(true); try { await service.approveCandidate({candidateKey:candidate.candidateKey,supplierIds:selected,name:form.name,legalName:form.legalName||null}); toast.success('Fornecedores consolidados.'); setApprovalModal(false); await load(); } finally { setSaving(false); } };
  const reject = async item => { if(!window.confirm(`Rejeitar a sugestão "${item.suggestedName}"?`))return; await service.rejectCandidate(item.candidateKey); toast.success('Sugestão rejeitada.'); await load(); };

  return <Page>
    <Header><div><Title>Fornecedores Centrais</Title><Subtitle>Identidades compartilhadas pela organização. Contatos, preços e vínculos operacionais continuam locais em cada estabelecimento.</Subtitle></div>{isAdmin&&<Actions><Button variant="secondary" onClick={()=>setReviewModal(true)}><MdFactCheck/>Revisar sugestões ({reviews.summary?.pending||0})</Button><Button onClick={openCreate}><MdAdd/>Novo fornecedor central</Button></Actions>}</Header>
    <Stats><Stat><span>Fornecedores centrais</span><strong>{items.length}</strong></Stat><Stat><span>Vínculos locais</span><strong>{items.reduce((sum,item)=>sum+(item.localSuppliers?.length||0),0)}</strong></Stat><Stat><span>Locais sem vínculo</span><strong>{reviews.summary?.unlinked||0}</strong></Stat></Stats>
    <Toolbar><Search><MdSearch/><InputControl value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, razão social ou CNPJ"/></Search><Toggle><CheckboxControl checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/>Mostrar inativos</Toggle></Toolbar>
    {!filtered.length?<EmptyState icon={<MdBusiness/>} title="Nenhum fornecedor central encontrado" subtitle="Crie uma identidade ou revise as sugestões encontradas por CNPJ."/>:<Grid>{filtered.map(item=><Card key={item.id} $inactive={!item.isActive}><CardTop><div><h2>{item.name}</h2><small>{item.legalName||formatCnpj(item.cnpj)}</small></div><Status $active={item.isActive}>{item.isActive?'Ativo':'Inativo'}</Status></CardTop>{item.legalName&&<small>{formatCnpj(item.cnpj)}</small>}<LocalList><strong>Cadastros locais ({item.localSuppliers?.length||0})</strong>{(item.localSuppliers||[]).map(local=><Local key={local.id}><strong>{local.name}</strong><small>{local.establishment?.name} · {formatCnpj(local.cnpj)}</small></Local>)}{!item.localSuppliers?.length&&<small>Nenhum cadastro local vinculado.</small>}</LocalList>{isAdmin&&<Actions><Button size="sm" variant="secondary" onClick={()=>openEdit(item)}><MdEdit/>Editar</Button>{item.isActive&&<Button size="sm" variant="ghost" onClick={()=>deactivate(item)}><MdToggleOff/>Desativar</Button>}</Actions>}</Card>)}</Grid>}
    <Modal isOpen={formModal} onClose={()=>setFormModal(false)} title={editing?'Editar fornecedor central':'Novo fornecedor central'} maxWidth="700px" footer={<><Button variant="secondary" onClick={()=>setFormModal(false)}>Cancelar</Button><Button disabled={saving} onClick={save}>{saving?'Salvando...':'Salvar'}</Button></>}><form onSubmit={save}><FormGrid><Field $wide>Nome comercial<Input required minLength="2" maxLength="160" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field $wide>Razão social<Input maxLength="200" value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})}/></Field><Field $wide>CNPJ<Input inputMode="numeric" maxLength="18" value={form.cnpj} onChange={e=>setForm({...form,cnpj:e.target.value})} placeholder="00.000.000/0000-00"/></Field>{editing&&<Toggle><CheckboxControl checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})}/>Fornecedor central ativo</Toggle>}</FormGrid></form></Modal>
    <Modal isOpen={reviewModal} onClose={()=>setReviewModal(false)} title="Revisão de fornecedores" maxWidth="940px"><Notice>As sugestões usam somente CNPJ completo e igual entre estabelecimentos. Aprovar não altera preços, produtos, pedidos ou históricos.</Notice><Toggle><CheckboxControl checked={showRejected} onChange={e=>setShowRejected(e.target.checked)}/>Mostrar sugestões rejeitadas</Toggle><ReviewList>{visible.map(item=><ReviewCard key={item.candidateKey}><ReviewTop><div><strong>{item.suggestedName}</strong><small>{formatCnpj(item.normalizedCnpj)} · correspondência exata · {item.suppliers.length} estabelecimentos</small></div>{item.review?.status==='REJECTED'&&<Status>Rejeitada</Status>}</ReviewTop><ReviewGrid>{item.suppliers.map(local=><Local key={local.id}><strong>{local.name}</strong><small>{local.establishment.name} · {formatCnpj(local.cnpj)}</small></Local>)}</ReviewGrid>{isAdmin&&<Actions><Button size="sm" variant="ghost" onClick={()=>reject(item)}><MdCancel/>Rejeitar</Button><Button size="sm" onClick={()=>openApproval(item)}><MdCheckCircle/>Revisar e aprovar</Button></Actions>}</ReviewCard>)}{!visible.length&&<EmptyState icon={<MdFactCheck/>} title="Nenhuma sugestão pendente" subtitle="Não existem CNPJs iguais entre estabelecimentos aguardando revisão."/>}</ReviewList></Modal>
    <Modal isOpen={approvalModal} onClose={()=>setApprovalModal(false)} title="Aprovar consolidação" maxWidth="820px" footer={<><Button variant="secondary" onClick={()=>setApprovalModal(false)}>Cancelar</Button><Button disabled={saving||selected.length<2||!form.name.trim()} onClick={approve}>{saving?'Aplicando...':'Criar e vincular'}</Button></>}><Notice>Se os registros representarem filiais ou distribuidores comerciais diferentes, mantenha identidades separadas.</Notice><FormGrid><Field $wide>Nome central<Input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field $wide>Razão social<Input value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})}/></Field><Field $wide>CNPJ<Input readOnly value={formatCnpj(candidate?.normalizedCnpj)}/></Field></FormGrid><ReviewGrid>{(candidate?.suppliers||[]).map(local=><Selectable key={local.id} $selected={selected.includes(local.id)}><CheckboxControl checked={selected.includes(local.id)} onChange={()=>toggle(local.id)}/><div><strong>{local.name}</strong><small>{local.establishment.name}</small></div></Selectable>)}</ReviewGrid></Modal>
  </Page>;
}

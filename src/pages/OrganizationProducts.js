import { CheckboxControl } from '../components/FormFields';
import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import { TextareaControl } from '../components/FormFields';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import {
  MdAccountTree,
  MdAdd,
  MdEdit,
  MdLink,
  MdLinkOff,
  MdSearch,
  MdToggleOff,
  MdFactCheck,
  MdCheckCircle,
  MdCancel,
} from 'react-icons/md';
import organizationProductService from '../services/organizationProductService';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

const emptyForm = {
  name: '',
  brand: '',
  baseUnit: 'un',
  barcode: '',
  description: '',
  isActive: true,
};

const normalizeSearch = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR');

const Page = styled.div`display:flex;flex-direction:column;gap:24px;`;
const Header = styled.header`display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;`;
const Title = styled.h1`font-size:${({theme})=>theme.fontSizes['3xl']};color:${({theme})=>theme.colors.textPrimary};`;
const Subtitle = styled.p`color:${({theme})=>theme.colors.textSecondary};margin-top:4px;max-width:720px;`;
const Stats = styled.div`display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;@media(max-width:700px){grid-template-columns:1fr;}`;
const Stat = styled.div`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:16px;box-shadow:${({theme})=>theme.shadows.card};span{display:block;color:${({theme})=>theme.colors.textMuted};font-size:13px;}strong{display:block;margin-top:4px;font-size:24px;color:${({theme})=>theme.colors.textPrimary};}`;
const Toolbar = styled.div`display:flex;gap:12px;align-items:center;flex-wrap:wrap;`;
const SearchBox = styled.label`flex:1;min-width:240px;display:flex;align-items:center;gap:8px;background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};padding:0 12px;color:${({theme})=>theme.colors.textMuted};input{width:100%;padding:11px 0;background:transparent;border:0;color:${({theme})=>theme.colors.textPrimary};outline:none;}`;
const Toggle = styled.label`display:flex;align-items:center;gap:8px;color:${({theme})=>theme.colors.textSecondary};font-size:14px;cursor:pointer;`;
const Grid = styled.div`display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px;@media(max-width:430px){grid-template-columns:1fr;}`;
const ProductCard = styled.article`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:18px;box-shadow:${({theme})=>theme.shadows.card};display:flex;flex-direction:column;gap:14px;opacity:${({$inactive})=>$inactive?0.68:1};`;
const CardTop = styled.div`display:flex;align-items:flex-start;justify-content:space-between;gap:12px;`;
const Code = styled.span`display:inline-flex;padding:4px 8px;border-radius:${({theme})=>theme.radii.pill};background:${({theme})=>theme.colors.infoLight};color:${({theme})=>theme.colors.info};font-size:12px;font-weight:700;letter-spacing:.03em;`;
const Status = styled.span`font-size:12px;font-weight:700;color:${({theme,$active})=>$active?theme.colors.success:theme.colors.textMuted};`;
const ProductName = styled.h2`font-size:18px;color:${({theme})=>theme.colors.textPrimary};margin-top:8px;`;
const Meta = styled.div`display:flex;gap:8px;flex-wrap:wrap;color:${({theme})=>theme.colors.textSecondary};font-size:13px;span{background:${({theme})=>theme.colors.bgHover};padding:4px 8px;border-radius:${({theme})=>theme.radii.sm};}`;
const Links = styled.div`border-top:1px solid ${({theme})=>theme.colors.border};padding-top:12px;display:flex;flex-direction:column;gap:8px;`;
const LinksHeader = styled.div`display:flex;justify-content:space-between;color:${({theme})=>theme.colors.textSecondary};font-size:13px;font-weight:700;`;
const LinkRow = styled.div`display:flex;align-items:center;justify-content:space-between;gap:8px;background:${({theme})=>theme.colors.bgInput};padding:8px 10px;border-radius:${({theme})=>theme.radii.sm};font-size:13px;color:${({theme})=>theme.colors.textPrimary};small{display:block;color:${({theme})=>theme.colors.textMuted};}`;
const IconButton = (props) => <DSButton size="sm" iconOnly variant="danger" aria-label="Desvincular produto" {...props} />;
const Actions = styled.div`display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;`;
const FormGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:16px;@media(max-width:560px){grid-template-columns:1fr;}`;
const Field = styled.label`display:flex;flex-direction:column;gap:6px;color:${({theme})=>theme.colors.textSecondary};font-size:13px;font-weight:600;${({$wide})=>$wide?'grid-column:1/-1;':''}`;
const Input = styled(InputControl)`padding:10px 12px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};outline:none;&:focus{border-color:${({theme})=>theme.colors.borderFocus};}`;
const Textarea = styled(TextareaControl)`min-height:90px;resize:vertical;padding:10px 12px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};outline:none;`;
const EstablishmentGroup = styled.section`border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};overflow:hidden;margin-bottom:12px;`;
const GroupTitle = styled.h3`padding:10px 12px;background:${({theme})=>theme.colors.bgHover};font-size:14px;color:${({theme})=>theme.colors.textPrimary};display:flex;justify-content:space-between;`;
const Candidate = styled.label`display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-top:1px solid ${({theme})=>theme.colors.border};cursor:pointer;background:${({$selected,theme})=>$selected?theme.colors.infoLight:'transparent'};input{margin-top:3px;}strong{display:block;color:${({theme})=>theme.colors.textPrimary};font-size:14px;}small{color:${({theme})=>theme.colors.textMuted};}`;
const Notice = styled.div`padding:12px;border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.warningLight};color:${({theme})=>theme.colors.warning};font-size:13px;margin-bottom:16px;`;
const ReviewList = styled.div`display:flex;flex-direction:column;gap:14px;max-height:60vh;overflow:auto;padding-right:4px;`;
const ReviewCard = styled.article`border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};padding:14px;display:flex;flex-direction:column;gap:12px;`;
const ReviewTop = styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:12px;strong{color:${({theme})=>theme.colors.textPrimary};}small{display:block;color:${({theme})=>theme.colors.textMuted};margin-top:3px;}`;
const ReviewProducts = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;`;
const ReviewProduct = styled.div`padding:9px;background:${({theme})=>theme.colors.bgInput};border-radius:${({theme})=>theme.radii.sm};font-size:13px;color:${({theme})=>theme.colors.textPrimary};small{display:block;color:${({theme})=>theme.colors.textMuted};}`;
const ReviewActions = styled.div`display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;`;

const OrganizationProducts = () => {
  const { state } = useApp();
  const isAdmin = state.user?.role === 'ADMIN';
  const [products, setProducts] = useState([]);
  const [unlinked, setUnlinked] = useState([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [formModal, setFormModal] = useState(false);
  const [linkModal, setLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [linking, setLinking] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [reviewData, setReviewData] = useState({ summary: {}, candidates: [] });
  const [reviewModal, setReviewModal] = useState(false);
  const [approvalModal, setApprovalModal] = useState(false);
  const [approvalCandidate, setApprovalCandidate] = useState(null);
  const [approvalForm, setApprovalForm] = useState(emptyForm);
  const [approvalIds, setApprovalIds] = useState([]);
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(async () => {
    const [central, local, review] = await Promise.all([
      organizationProductService.list(),
      organizationProductService.listUnlinked(),
      organizationProductService.listReviewCandidates(),
    ]);
    setProducts(Array.isArray(central) ? central : []);
    setUnlinked(Array.isArray(local) ? local : []);
    setReviewData(review || { summary: {}, candidates: [] });
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load, state.establishment?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return products.filter(product => {
      if (!showInactive && !product.isActive) return false;
      if (!term) return true;
      return [product.internalCode, product.name, product.brand, product.barcode]
        .some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [products, search, showInactive]);

  const groupedUnlinked = useMemo(() => unlinked
    .filter(product => normalizeSearch(product.name).includes(normalizeSearch(linkSearch.trim())))
    .reduce((groups, product) => {
    const id = product.establishment.id;
    if (!groups[id]) groups[id] = { establishment: product.establishment, products: [] };
    groups[id].products.push(product);
    return groups;
  }, {}), [unlinked, linkSearch]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormModal(true);
  };

  const openEdit = product => {
    setEditing(product);
    setForm({
      name: product.name || '', brand: product.brand || '', baseUnit: product.baseUnit || 'un',
      barcode: product.barcode || '', description: product.description || '', isActive: product.isActive,
    });
    setFormModal(true);
  };

  const saveForm = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, brand: form.brand || null, barcode: form.barcode || null, description: form.description || null };
      if (editing) await organizationProductService.update(editing.id, payload);
      else await organizationProductService.create(payload);
      toast.success(editing ? 'Produto central atualizado.' : 'Produto central criado.');
      setFormModal(false);
      await load();
    } finally { setSaving(false); }
  };

  const deactivate = async product => {
    if (!window.confirm(`Desativar ${product.internalCode} — ${product.name}?`)) return;
    await organizationProductService.deactivate(product.id);
    toast.success('Produto central desativado.');
    await load();
  };

  const openLinks = product => {
    setLinking(product);
    setSelectedIds([]);
    setLinkSearch('');
    setLinkModal(true);
  };

  const toggleCandidate = candidate => {
    setSelectedIds(current => {
      if (current.includes(candidate.id)) return current.filter(id => id !== candidate.id);
      const sameEstablishmentIds = unlinked
        .filter(item => item.establishment.id === candidate.establishment.id)
        .map(item => item.id);
      return [...current.filter(id => !sameEstablishmentIds.includes(id)), candidate.id];
    });
  };

  const submitLinks = async () => {
    if (!selectedIds.length) return;
    setSaving(true);
    try {
      await organizationProductService.link(linking.id, selectedIds);
      toast.success(`${selectedIds.length} produto(s) vinculado(s).`);
      setLinkModal(false);
      await load();
    } finally { setSaving(false); }
  };

  const unlink = async (central, local) => {
    if (!window.confirm(`Desvincular ${local.name} de ${central.internalCode}?`)) return;
    await organizationProductService.unlink(central.id, local.id);
    toast.success('Produto local desvinculado.');
    await load();
  };

  const visibleCandidates = (reviewData.candidates || []).filter(candidate =>
    showRejected || candidate.review?.status !== 'REJECTED'
  );

  const openApproval = candidate => {
    setApprovalCandidate(candidate);
    setApprovalIds(candidate.products.map(product => product.id));
    setApprovalForm({
      ...emptyForm,
      name: candidate.suggestedName,
      baseUnit: candidate.suggestedBaseUnit || 'un',
      description: `Consolidado a partir de ${candidate.products.length} cadastros locais revisados.`
    });
    setApprovalModal(true);
  };

  const toggleApprovalProduct = productId => setApprovalIds(current =>
    current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId]
  );

  const approveCandidate = async () => {
    if (!approvalCandidate || approvalIds.length < 2) return;
    setSaving(true);
    try {
      await organizationProductService.approveReviewCandidate({
        candidateKey: approvalCandidate.candidateKey,
        productIds: approvalIds,
        name: approvalForm.name,
        brand: approvalForm.brand || null,
        baseUnit: approvalForm.baseUnit,
        barcode: approvalForm.barcode || null,
        description: approvalForm.description || null
      });
      toast.success('Grupo consolidado e vínculos aplicados.');
      setApprovalModal(false);
      await load();
    } finally { setSaving(false); }
  };

  const rejectCandidate = async candidate => {
    if (!window.confirm(`Rejeitar a sugestão "${candidate.suggestedName}"?`)) return;
    await organizationProductService.rejectReviewCandidate(candidate.candidateKey);
    toast.success('Sugestão rejeitada e registrada.');
    await load();
  };

  return <Page>
    <Header>
      <div><Title>Catálogo Central</Title><Subtitle>Identidades compartilhadas pela organização. Estoque, custo, categoria e configurações continuam locais em cada estabelecimento.</Subtitle></div>
      {isAdmin && <Actions>
        <Button variant="secondary" onClick={()=>setReviewModal(true)}><MdFactCheck/>Revisar sugestões ({reviewData.summary?.pending || 0})</Button>
        <Button onClick={openCreate}><MdAdd/>Novo produto central</Button>
      </Actions>}
    </Header>

    <Stats>
      <Stat><span>Produtos centrais</span><strong>{products.length}</strong></Stat>
      <Stat><span>Vínculos locais</span><strong>{products.reduce((sum,item)=>sum+(item.localProducts?.length||0),0)}</strong></Stat>
      <Stat><span>Elegíveis sem vínculo</span><strong>{unlinked.length}</strong></Stat>
    </Stats>

    <Toolbar>
      <SearchBox><MdSearch/><InputControl value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por código, nome, marca ou EAN"/></SearchBox>
      <Toggle><CheckboxControl checked={showInactive} onChange={event=>setShowInactive(event.target.checked)}/>Mostrar inativos</Toggle>
    </Toolbar>

    {!filtered.length ? <EmptyState icon={<MdAccountTree/>} title="Nenhum produto central encontrado" subtitle={isAdmin?'Crie a primeira identidade central e depois vincule os produtos locais revisados.':'A organização ainda não possui produtos centrais.'}/> : <Grid>
      {filtered.map(product => <ProductCard key={product.id} $inactive={!product.isActive}>
        <CardTop><div><Code>{product.internalCode}</Code><ProductName>{product.name}</ProductName></div><Status $active={product.isActive}>{product.isActive?'Ativo':'Inativo'}</Status></CardTop>
        <Meta>{product.brand&&<span>{product.brand}</span>}<span>Base: {product.baseUnit}</span>{product.barcode&&<span>EAN {product.barcode}</span>}</Meta>
        <Links><LinksHeader><span>Produtos locais</span><span>{product.localProducts?.length||0}</span></LinksHeader>
          {(product.localProducts||[]).map(local=><LinkRow key={local.id}><div><strong>{local.name}</strong><small>{local.establishment.name} · {local.unit}{local.packQuantity?` · pacote ${local.packQuantity}`:''}</small></div>{isAdmin&&<IconButton onClick={()=>unlink(product,local)} title="Desvincular"><MdLinkOff/></IconButton>}</LinkRow>)}
          {!product.localProducts?.length&&<small>Nenhum produto local vinculado.</small>}
        </Links>
        {isAdmin&&<Actions><Button size="sm" variant="secondary" onClick={()=>openEdit(product)}><MdEdit/>Editar</Button><Button size="sm" variant="secondary" onClick={()=>openLinks(product)}><MdLink/>Vincular</Button>{product.isActive&&<Button size="sm" variant="ghost" onClick={()=>deactivate(product)}><MdToggleOff/>Desativar</Button>}</Actions>}
      </ProductCard>)}
    </Grid>}

    <Modal isOpen={formModal} onClose={()=>setFormModal(false)} title={editing?`Editar ${editing.internalCode}`:'Novo produto central'} maxWidth="720px" footer={<><Button variant="secondary" onClick={()=>setFormModal(false)}>Cancelar</Button><Button disabled={saving} onClick={saveForm}>{saving?'Salvando...':'Salvar'}</Button></>}>
      <form onSubmit={saveForm}><FormGrid>
        <Field $wide>Nome padronizado<Input required minLength="2" maxLength="160" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
        <Field>Marca<Input maxLength="100" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></Field>
        <Field>Unidade-base<Input required maxLength="30" value={form.baseUnit} onChange={e=>setForm({...form,baseUnit:e.target.value})} placeholder="un, ml, g, kg"/></Field>
        <Field $wide>EAN / código de barras<Input inputMode="numeric" maxLength="32" value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/></Field>
        <Field $wide>Descrição<Textarea maxLength="1000" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
        {editing&&<Toggle><CheckboxControl checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})}/>Produto central ativo</Toggle>}
      </FormGrid></form>
    </Modal>

    <Modal isOpen={linkModal} onClose={()=>setLinkModal(false)} title={linking?`Vincular a ${linking.internalCode}`:'Vincular produtos'} maxWidth="820px" footer={<><Button variant="secondary" onClick={()=>setLinkModal(false)}>Cancelar</Button><Button disabled={saving||!selectedIds.length} onClick={submitLinks}>{saving?'Vinculando...':`Vincular ${selectedIds.length||''}`}</Button></>}>
      <Notice>Selecione no máximo um produto por estabelecimento. O vínculo não altera estoque, custo, preço ou histórico.</Notice>
      <SearchBox><MdSearch/><InputControl value={linkSearch} onChange={event=>setLinkSearch(event.target.value)} placeholder="Procurar produto por nome" autoFocus/></SearchBox>
      {Object.values(groupedUnlinked).map(group=><EstablishmentGroup key={group.establishment.id}><GroupTitle><span>{group.establishment.name}</span><span>{group.products.length} disponíveis</span></GroupTitle>{group.products.map(candidate=><Candidate key={candidate.id} $selected={selectedIds.includes(candidate.id)}><CheckboxControl checked={selectedIds.includes(candidate.id)} onChange={()=>toggleCandidate(candidate)}/><div><strong>{candidate.name}</strong><small>{candidate.unit} · {candidate.purchaseUnit||'sem unidade de compra'} · pacote {candidate.packQuantity||1}</small></div></Candidate>)}</EstablishmentGroup>)}
      {!!unlinked.length&&!Object.keys(groupedUnlinked).length&&<EmptyState title="Nenhum produto encontrado" subtitle={`Não há produtos disponíveis com o nome “${linkSearch}”.`}/>}
      {!unlinked.length&&<EmptyState title="Nenhum produto elegível sem vínculo" subtitle="Todos os produtos locais elegíveis já foram revisados."/>}
    </Modal>

    <Modal isOpen={reviewModal} onClose={()=>setReviewModal(false)} title="Revisão de consolidação" maxWidth="940px">
      <Notice>As sugestões usam nome, unidade, unidade de compra e embalagem normalizados. Aprovar cria uma identidade central e aplica somente os vínculos selecionados.</Notice>
      <Toolbar><Toggle><CheckboxControl checked={showRejected} onChange={event=>setShowRejected(event.target.checked)}/>Mostrar sugestões rejeitadas</Toggle></Toolbar>
      <ReviewList>
        {visibleCandidates.map(candidate=><ReviewCard key={candidate.candidateKey}>
          <ReviewTop><div><strong>{candidate.suggestedName}</strong><small>Correspondência normalizada exata · {candidate.products.length} estabelecimentos</small></div>{candidate.review?.status==='REJECTED'&&<Status>Rejeitada</Status>}</ReviewTop>
          <ReviewProducts>{candidate.products.map(product=><ReviewProduct key={product.id}><strong>{product.name}</strong><small>{product.establishment.name} · {product.unit} · {product.purchaseUnit||'sem un. compra'} · pacote {product.packQuantity||1}</small></ReviewProduct>)}</ReviewProducts>
          {isAdmin&&<ReviewActions><Button size="sm" variant="ghost" onClick={()=>rejectCandidate(candidate)}><MdCancel/>Rejeitar</Button><Button size="sm" onClick={()=>openApproval(candidate)}><MdCheckCircle/>Revisar e aprovar</Button></ReviewActions>}
        </ReviewCard>)}
        {!visibleCandidates.length&&<EmptyState icon={<MdFactCheck/>} title="Nenhuma sugestão pendente" subtitle="Não existem grupos equivalentes entre estabelecimentos aguardando revisão."/>}
      </ReviewList>
    </Modal>

    <Modal isOpen={approvalModal} onClose={()=>setApprovalModal(false)} title="Aprovar consolidação" maxWidth="820px" footer={<><Button variant="secondary" onClick={()=>setApprovalModal(false)}>Cancelar</Button><Button disabled={saving||approvalIds.length<2} onClick={approveCandidate}>{saving?'Aplicando...':'Criar e vincular'}</Button></>}>
      <Notice>Revise o nome central e os produtos incluídos. A operação é transacional e não altera estoque, custos, preços ou históricos.</Notice>
      <FormGrid>
        <Field $wide>Nome central<Input required value={approvalForm.name} onChange={event=>setApprovalForm({...approvalForm,name:event.target.value})}/></Field>
        <Field>Marca<Input value={approvalForm.brand} onChange={event=>setApprovalForm({...approvalForm,brand:event.target.value})}/></Field>
        <Field>Unidade-base<Input required value={approvalForm.baseUnit} onChange={event=>setApprovalForm({...approvalForm,baseUnit:event.target.value})}/></Field>
        <Field $wide>EAN / código de barras<Input inputMode="numeric" value={approvalForm.barcode} onChange={event=>setApprovalForm({...approvalForm,barcode:event.target.value})}/></Field>
        <Field $wide>Descrição<Textarea value={approvalForm.description} onChange={event=>setApprovalForm({...approvalForm,description:event.target.value})}/></Field>
      </FormGrid>
      <ReviewProducts>{(approvalCandidate?.products||[]).map(product=><Candidate key={product.id} $selected={approvalIds.includes(product.id)}><CheckboxControl checked={approvalIds.includes(product.id)} onChange={()=>toggleApprovalProduct(product.id)}/><div><strong>{product.name}</strong><small>{product.establishment.name} · {product.unit} · pacote {product.packQuantity||1}</small></div></Candidate>)}</ReviewProducts>
    </Modal>
  </Page>;
};

export default OrganizationProducts;

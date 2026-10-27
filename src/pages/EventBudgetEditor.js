import { CheckboxControl } from '../components/FormFields';
import DSButton from '../components/Button';
import { InputControl } from '../components/FormFields';
import { SelectControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import eventService from '../services/eventService';
import EventPricingPanel from '../components/EventPricingPanel';
import EventBudgetSummary from '../components/EventBudgetSummary';
import { useApp } from '../context/AppContext';
import { Tabs, Tab } from '../components/Tabs';

const Page = styled.div`display:grid;gap:18px;color:${({ theme }) => theme.colors.textPrimary};`;
const Header = styled.div`display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;h1{margin:4px 0;}p{margin:0;color:${({ theme }) => theme.colors.textMuted};}`;
const Panel = styled.section`background:${({ theme }) => theme.colors.bgCard};border:1px solid ${({ theme }) => theme.colors.border};border-radius:${({ theme }) => theme.radii.lg};padding:20px;`;
const Grid = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;`;
const Field = styled.label`display:grid;gap:5px;font-size:.82rem;font-weight:700;`;
const Input = styled(InputControl)`padding:10px;border:1px solid ${({ theme }) => theme.colors.border};border-radius:8px;background:${({ theme }) => theme.colors.bgInput};color:${({ theme }) => theme.colors.textPrimary};`;
const Select = styled(SelectControl)`padding:10px;border:1px solid ${({ theme }) => theme.colors.border};border-radius:8px;background:${({ theme }) => theme.colors.bgInput};color:${({ theme }) => theme.colors.textPrimary};`;
const Button = DSButton;
const Cards = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;`;
const Card = styled.div`padding:14px;border-radius:10px;background:${({ theme }) => theme.colors.bgInput};span{display:block;color:${({ theme }) => theme.colors.textMuted};font-size:.75rem}strong{font-size:1.15rem}`;
const Notice = styled.div`margin:12px 0;padding:11px 13px;border-radius:8px;background:${({ theme }) => theme.colors.bgInput};border-left:4px solid ${({ $warning, theme }) => $warning ? (theme.colors.warning || 'var(--color-warning)') : theme.colors.primary};font-size:.86rem;`;
const Table = styled(DataTable)`width:100%;border-collapse:collapse;margin-top:16px;th,td{text-align:left;padding:10px;border-bottom:1px solid ${({ theme }) => theme.colors.border};vertical-align:top;}th{font-size:.72rem;text-transform:uppercase;color:${({ theme }) => theme.colors.textMuted};}`;
const Actions = styled.div`display:flex;gap:7px;margin-top:14px;`;

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const empty = {
  itemType: 'MANUAL', sourceId: null, nameSnapshot: '', costGroup: 'MENU', quantityMode: 'FIXED',
  fixedQuantity: '1', quantityPerGuest: '', safetyPercent: '0', unitSnapshot: 'un',
  unitCostSnapshot: '', visibleInProposal: true, compositionSnapshot: null, hasCostWarning: false
};
const groups = [['STAFF', 'Equipe'], ['SERVICE', 'Serviço'], ['EQUIPMENT', 'Equipamento'], ['TRANSPORT', 'Transporte'], ['FEE', 'Taxa'], ['OTHER', 'Outro']];
const sourceKey = item => item.itemType === 'MANUAL' ? 'MANUAL' : `${item.itemType}:${item.sourceId}`;

function payload(form, tab) {
  const group = tab === 'menu' ? 'MENU' : form.costGroup;
  return {
    itemType: tab === 'menu' ? form.itemType : group,
    costGroup: group,
    sourceId: tab === 'menu' ? form.sourceId : null,
    sourceType: tab === 'menu' && form.itemType !== 'MANUAL' ? form.itemType : null,
    nameSnapshot: form.nameSnapshot.trim(), categorySnapshot: null,
    quantityMode: tab === 'menu' ? form.quantityMode : 'FIXED',
    fixedQuantity: (tab !== 'menu' || form.quantityMode === 'FIXED') ? form.fixedQuantity : null,
    quantityPerGuest: tab === 'menu' && form.quantityMode === 'PER_GUEST' ? form.quantityPerGuest : null,
    safetyPercent: tab === 'menu' ? form.safetyPercent : '0',
    unitSnapshot: form.unitSnapshot.trim(), unitCostSnapshot: form.unitCostSnapshot,
    suggestedUnitPriceSnapshot: null, visibleInProposal: form.visibleInProposal,
    proposalLabel: null, internalNotes: null, compositionSnapshot: null, sortOrder: 0
  };
}

function Composition({ snapshot }) {
  if (!snapshot?.components?.length) return null;
  return <details><summary>Ver composição ({snapshot.components.length})</summary><ul>{snapshot.components.map((component, index) => <li key={`${component.productId}-${index}`}>{component.name}: {Number(component.quantity).toLocaleString('pt-BR')} {component.unit} × {money(component.unitCost)} = {money(component.totalCost)}</li>)}</ul></details>;
}

export default function EventBudgetEditor() {
  const { eventId, budgetId } = useParams();
  const { state } = useApp();
  const establishmentId = state.establishment?.id;
  const [budget, setBudget] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [tab, setTab] = useState('menu');
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setBudget(null); setCatalog([]); setLoadError(''); setCatalogError('');
    eventService.getBudget(budgetId)
      .then(result => { if (active) setBudget(result); })
      .catch(error => { if (active) setLoadError(error.message || 'Não foi possível carregar o orçamento.'); });
    eventService.searchCatalog({ limit: 100 })
      .then(result => { if (active) setCatalog(result); })
      .catch(error => { if (active) { setCatalog([]); setCatalogError(error.message || 'Não foi possível carregar o catálogo.'); } });
    return () => { active = false; };
  }, [budgetId, establishmentId, reloadToken]);

  const items = useMemo(() => budget?.items?.filter(item => tab === 'menu' ? item.costGroup === 'MENU' : item.costGroup !== 'MENU') || [], [budget, tab]);
  const editable = budget?.status === 'DRAFT';
  const isSourced = form.itemType === 'PRODUCT' || form.itemType === 'RECIPE';
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const reset = () => { setForm({ ...empty, costGroup: tab === 'menu' ? 'MENU' : 'STAFF' }); setEditing(''); };
  const selectSource = event => {
    if (event.target.value === 'MANUAL') { setForm(current => ({ ...empty, fixedQuantity: current.fixedQuantity, quantityMode: current.quantityMode, safetyPercent: current.safetyPercent })); return; }
    const selected = catalog.find(item => sourceKey(item) === event.target.value);
    if (!selected) return;
    setForm(current => ({ ...current, itemType: selected.itemType, sourceId: selected.sourceId, nameSnapshot: selected.nameSnapshot, unitSnapshot: selected.unitSnapshot, unitCostSnapshot: String(selected.unitCostSnapshot), compositionSnapshot: selected.compositionSnapshot, hasCostWarning: selected.hasCostWarning }));
  };
  const save = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const data = payload(form, tab);
      const result = editing ? await eventService.updateBudgetItem(editing, data) : await eventService.addBudgetItem(budgetId, data);
      setBudget(result); reset(); toast.success(editing ? 'Item atualizado.' : 'Item adicionado.');
    } finally { setSaving(false); }
  };
  const edit = item => {
    setEditing(item.id);
    setForm({
      itemType: item.itemType, sourceId: item.sourceId, nameSnapshot: item.nameSnapshot,
      costGroup: item.costGroup, quantityMode: item.quantityMode, fixedQuantity: item.fixedQuantity || '',
      quantityPerGuest: item.quantityPerGuest || '', safetyPercent: item.safetyPercent || '0',
      unitSnapshot: item.unitSnapshot, unitCostSnapshot: item.unitCostSnapshot,
      visibleInProposal: item.visibleInProposal, compositionSnapshot: item.compositionSnapshot,
      hasCostWarning: Number(item.unitCostSnapshot) <= 0
    });
  };
  const remove = async item => { if (window.confirm(`Remover "${item.nameSnapshot}"?`)) setBudget(await eventService.deleteBudgetItem(item.id)); };

  if (loadError) return <Page>
    <Link to={`/events/${eventId}`}>← Voltar ao evento</Link>
    <Panel role="alert"><h2>Não foi possível carregar o orçamento</h2><p>{loadError}</p><Actions><Button type="button" onClick={() => setReloadToken(value => value + 1)}>Tentar novamente</Button></Actions></Panel>
  </Page>;
  if (!budget) return <Page>Carregando orçamento...</Page>;
  return <Page>
    <Link to={`/events/${eventId}`}>← Voltar ao evento</Link>
    <Header><div><h1>Orçamento · revisão {budget.revision}</h1><p>{budget.event?.name} · {budget.event?.guestCount} convidados · {budget.status}</p></div><Tabs><Tab active={tab === 'menu'} onClick={() => { setTab('menu'); setForm({ ...empty, costGroup: 'MENU' }); setEditing(''); }}>Cardápio</Tab><Tab active={tab === 'costs'} onClick={() => { setTab('costs'); setForm({ ...empty, costGroup: 'STAFF' }); setEditing(''); }}>Custos</Tab><Tab active={tab === 'pricing'} onClick={() => { setTab('pricing'); setEditing(''); }}>Precificação</Tab><Tab active={tab === 'summary'} onClick={() => { setTab('summary'); setEditing(''); }}>Resumo</Tab></Tabs></Header>
    <Cards><Card><span>Cardápio</span><strong>{money(budget.costMenu)}</strong></Card><Card><span>Equipe</span><strong>{money(budget.costStaff)}</strong></Card><Card><span>Demais custos</span><strong>{money(Number(budget.costService || 0) + Number(budget.costEquipment || 0) + Number(budget.costTransport || 0) + Number(budget.costFees || 0) + Number(budget.costOther || 0))}</strong></Card><Card><span>Custo total</span><strong>{money(budget.totalCost)}</strong></Card></Cards>
    {budget.qualityWarnings?.length > 0 && <Notice $warning>Revise os itens sem custo antes de enviar ou aprovar este orçamento.</Notice>}
    {tab === 'pricing' && editable && <EventPricingPanel budget={budget} onUpdate={setBudget}/>}
    {tab === 'summary' && <EventBudgetSummary budget={budget} eventId={eventId} onUpdate={setBudget}/>}
    {!editable && tab !== 'summary' && <Notice>Esta revisão está {budget.status} e permanece somente para leitura. Use a aba Resumo para as ações disponíveis.</Notice>}
    {(tab === 'menu' || tab === 'costs') && <Panel><h2>{tab === 'menu' ? 'Item de cardápio' : 'Custo adicional'}</h2>
      {tab === 'menu' && catalogError && <Notice $warning role="alert">Não foi possível carregar produtos e fichas: {catalogError} <Button type="button" $secondary onClick={() => setReloadToken(value => value + 1)}>Tentar novamente</Button></Notice>}
      {editable && <form onSubmit={save}>
        {tab === 'menu' && <Field>Origem<Select aria-label="Origem" value={sourceKey(form)} onChange={selectSource} disabled={editing && isSourced}><option value="MANUAL">Item manual</option>{catalog.map(item => <option key={sourceKey(item)} value={sourceKey(item)}>{item.itemType === 'RECIPE' ? 'Ficha' : 'Produto'} · {item.nameSnapshot}{item.hasCostWarning ? ' · sem custo' : ''}</option>)}</Select></Field>}
        {form.hasCostWarning && <Notice $warning>Este produto ou ficha está sem custo. Corrija o cadastro de origem antes de enviar ou aprovar o orçamento.</Notice>}
        <Composition snapshot={form.compositionSnapshot} />
        <Grid>
          <Field>Descrição<Input required name="nameSnapshot" value={form.nameSnapshot} onChange={change} disabled={isSourced} /></Field>
          {tab === 'costs' && <Field>Tipo<Select name="costGroup" value={form.costGroup} onChange={change}>{groups.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>}
          {tab === 'menu' && <Field>Modo<Select name="quantityMode" value={form.quantityMode} onChange={change}><option value="FIXED">Quantidade fixa</option><option value="PER_GUEST">Por convidado</option></Select></Field>}
          <Field>{form.quantityMode === 'PER_GUEST' && tab === 'menu' ? 'Quantidade por convidado' : 'Quantidade'}<Input required type="number" min="0.0001" step="0.0001" name={form.quantityMode === 'PER_GUEST' && tab === 'menu' ? 'quantityPerGuest' : 'fixedQuantity'} value={form.quantityMode === 'PER_GUEST' && tab === 'menu' ? form.quantityPerGuest : form.fixedQuantity} onChange={change} /></Field>
          <Field>Unidade<Input required name="unitSnapshot" value={form.unitSnapshot} onChange={change} disabled={isSourced} /></Field>
          <Field>Custo unitário<Input required type="number" min="0" step="0.0001" name="unitCostSnapshot" value={form.unitCostSnapshot} onChange={change} disabled={isSourced} /></Field>
          {tab === 'menu' && <Field>Margem de segurança (%)<Input type="number" min="0" max="100" step="0.01" name="safetyPercent" value={form.safetyPercent} onChange={change} /></Field>}
          <Field>Proposta<span><CheckboxControl name="visibleInProposal" checked={form.visibleInProposal} onChange={change} /> Visível para o cliente</span></Field>
        </Grid>
        <Actions><Button disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar alteração' : 'Adicionar item'}</Button>{editing && <Button type="button" $secondary onClick={reset}>Cancelar edição</Button>}</Actions>
      </form>}
      <div style={{ overflowX: 'auto' }}><Table><thead><tr><th>Item</th><th>Qtd. planejada</th><th>Custo unit.</th><th>Total</th>{editable&&<th>Ações</th>}</tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.nameSnapshot}{Number(item.unitCostSnapshot) <= 0 && <div>⚠ Sem custo</div>}<Composition snapshot={item.compositionSnapshot} /></td><td>{Number(item.plannedQuantity).toLocaleString('pt-BR')} {item.unitSnapshot}</td><td>{money(item.unitCostSnapshot)}</td><td>{money(item.totalCost)}</td>{editable&&<td><Button type="button" $secondary onClick={() => edit(item)}>Editar</Button> <Button type="button" $secondary onClick={() => remove(item)}>Remover</Button></td>}</tr>)}{!items.length && <tr><td colSpan={editable?5:4}>Nenhum item adicionado.</td></tr>}</tbody></Table></div>
    </Panel>}
  </Page>;
}

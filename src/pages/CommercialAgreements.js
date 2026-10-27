import { CheckboxControl, InputControl, SelectControl } from '../components/FormFields';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import Card, { CardGrid, StatCard } from '../components/Card';
import DataTable, { TableSurface } from '../components/Table';
import { Page, PageHeader, PageHeading, PageTitle, PageSubtitle } from '../components/PageLayout';
import { Tabs, Tab } from '../components/Tabs';

const Panel = styled(Card).attrs({ as: 'section' })``;
const Grid = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;`;
const Field = styled.label`display:grid;gap:6px;color:${({theme})=>theme.colors.text};font-size:.88rem;font-weight:600;`;
const Control = styled(InputControl)``;
const Select = styled(SelectControl)``;
const ProductList = styled.div`max-height:220px;overflow:auto;display:grid;gap:7px;border:1px solid ${({theme})=>theme.colors.border};border-radius:9px;padding:10px;`;
const ProductRow = styled.label`display:flex;gap:9px;align-items:center;color:${({theme})=>theme.colors.text};font-weight:400;`;
const Hint = styled(PageSubtitle)``;
const Table = styled(DataTable)`min-width:850px;`;

const today = () => new Date().toISOString().slice(0, 10);
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qty = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export default function CommercialAgreements() {
  const { state } = useApp();
  const { suppliers = [], products = [] } = state;
  const [tab, setTab] = useState('summary');
  const [agreements, setAgreements] = useState([]);
  const [summary, setSummary] = useState([]);
  const [locations, setLocations] = useState([]);
  const emptyForm = () => ({ name:'', brand:'', supplierId:'', buyQuantity:10, bonusQuantity:1, startsAt:today(), endsAt:'', status:'ACTIVE', productIds:[] });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [receipt, setReceipt] = useState({ agreementId:'', invoiceNumber:'', invoiceSeries:'', invoiceDate:today(), additionalCredits:'', productId:'', locationId:'', quantity:'', fiscalUnitPrice:'', commercialReferencePrice:'' });

  const load = useCallback(async () => {
    const [agreementData, summaryData, locationData] = await Promise.all([
      api.get('/commercial-agreements'), api.get('/commercial-agreements/summary'), api.get('/stock-locations')
    ]);
    setAgreements(Array.isArray(agreementData) ? agreementData : []);
    setSummary(Array.isArray(summaryData) ? summaryData : []);
    setLocations(Array.isArray(locationData) ? locationData : []);
  }, []);
  useEffect(() => { load().catch(()=>{}); }, [load]);

  const selectedAgreement = useMemo(() => agreements.find(a => a.id === receipt.agreementId), [agreements, receipt.agreementId]);
  const eligibleReceiptProducts = selectedAgreement?.products?.filter(p => p.canBeReceivedAsBonus) || [];
  const totalBenefit = summary.reduce((sum,row)=>sum+Number(row.totalBenefit||0),0);
  const totalPending = summary.reduce((sum,row)=>sum+Number(row.pendingBonusQuantity||0),0);

  const toggleProduct = productId => setForm(current => ({...current, productIds: current.productIds.includes(productId) ? current.productIds.filter(id=>id!==productId) : [...current.productIds, productId]}));
  const saveAgreement = async event => {
    event.preventDefault();
    const payload = {...form, productIds: form.productIds.map(productId=>({productId}))};
    if (editingId) await api.put(`/commercial-agreements/${editingId}`, payload);
    else await api.post('/commercial-agreements', payload);
    toast.success(editingId ? 'Acordo comercial atualizado.' : 'Acordo comercial criado.');
    setEditingId(''); setForm(emptyForm());
    await load(); setTab('summary');
  };
  const editAgreement = agreement => {
    setEditingId(agreement.id);
    setForm({
      name:agreement.name || '', brand:agreement.brand || '', supplierId:agreement.supplierId,
      buyQuantity:Number(agreement.buyQuantity), bonusQuantity:Number(agreement.bonusQuantity),
      startsAt:String(agreement.startsAt).slice(0,10), endsAt:agreement.endsAt ? String(agreement.endsAt).slice(0,10) : '',
      status:agreement.status, productIds:(agreement.products || []).map(item=>item.productId)
    });
    setTab('agreement');
  };
  const deleteAgreement = async agreement => {
    if (!window.confirm(`Excluir o acordo "${agreement.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/commercial-agreements/${agreement.id}`);
      toast.success('Acordo comercial excluído.');
      await load();
    } catch (error) {
      toast.error(error.message || 'Não foi possível excluir o acordo.');
    }
  };
  const receiveBonus = async event => {
    event.preventDefault();
    await api.post('/commercial-agreements/bonus-receipts', {
      ...receipt,
      additionalCredits:Number(receipt.additionalCredits||0),
      items:[{productId:receipt.productId,locationId:receipt.locationId,quantity:Number(receipt.quantity),fiscalUnitPrice:Number(receipt.fiscalUnitPrice),commercialReferencePrice:Number(receipt.commercialReferencePrice)}]
    });
    toast.success('Bonificacao recebida e estoque atualizado.');
    setReceipt({ agreementId:'', invoiceNumber:'', invoiceSeries:'', invoiceDate:today(), additionalCredits:'', productId:'', locationId:'', quantity:'', fiscalUnitPrice:'', commercialReferencePrice:'' });
    await load(); setTab('summary');
  };

  return <Page>
    <PageHeader><PageHeading><PageTitle>Acordos e bonificações</PageTitle><Hint>A bonificação é calculada individualmente em cada nota fiscal, sem acumular quantidades entre notas. O valor fiscal fica separado do benefício comercial real.</Hint></PageHeading>
      <Tabs>{[['summary','Resumo'],['agreement',editingId?'Editar acordo':'Novo acordo'],['receipt','Receber bonificação']].map(([id,label])=><Tab key={id} active={tab===id} onClick={()=>{setTab(id);if(id==='agreement'&&tab!=='agreement'){setEditingId('');setForm(emptyForm());}}}>{label}</Tab>)}</Tabs>
    </PageHeader>
    {tab === 'summary' && <><CardGrid><StatCard><span>Benefício comercial total</span><strong>{money(totalBenefit)}</strong></StatCard><StatCard><span>Bonificações pendentes</span><strong>{qty(totalPending)}</strong></StatCard><StatCard><span>Acordos cadastrados</span><strong>{agreements.length}</strong></StatCard></CardGrid><TableSurface><Table><thead><tr><th>Acordo</th><th>Fornecedor</th><th>Ganho</th><th>Recebido</th><th>Pendente</th><th>Valor fiscal</th><th>Benefício real</th><th>Ações</th></tr></thead><tbody>{summary.map(row=>{const agreement=agreements.find(item=>item.id===row.agreementId);return <tr key={row.agreementId}><td>{row.name}</td><td>{row.supplierName}</td><td>{qty(row.earnedBonusQuantity)}</td><td>{qty(row.receivedBonusQuantity)}</td><td>{qty(row.pendingBonusQuantity)}</td><td>{money(row.fiscalValue)}</td><td><strong>{money(row.totalBenefit)}</strong></td><td>{agreement&&<><Button size="sm" variant="outlined" onClick={()=>editAgreement(agreement)}>Editar</Button>{' '}<Button size="sm" variant="danger" onClick={()=>deleteAgreement(agreement)}>Excluir</Button></>}</td></tr>})}{!summary.length&&<tr><td colSpan="8">Nenhum acordo cadastrado.</td></tr>}</tbody></Table></TableSurface></>}
    {tab === 'agreement' && <Panel><form onSubmit={saveAgreement}><Grid><Field>Nome do acordo<Control required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field>Marca<Control value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></Field><Field>Fornecedor<Select required value={form.supplierId} onChange={e=>setForm({...form,supplierId:e.target.value})}><option value="">Selecione</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Field>Quantidade comprada<Control required min="0.001" step="0.001" type="number" value={form.buyQuantity} onChange={e=>setForm({...form,buyQuantity:e.target.value})}/></Field><Field>Quantidade bonificada<Control required min="0.001" step="0.001" type="number" value={form.bonusQuantity} onChange={e=>setForm({...form,bonusQuantity:e.target.value})}/></Field><Field>Início<Control required type="date" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></Field><Field>Fim (opcional)<Control type="date" value={form.endsAt} onChange={e=>setForm({...form,endsAt:e.target.value})}/></Field>{editingId&&<Field>Status<Select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="ACTIVE">Ativo</option><option value="SUSPENDED">Suspenso</option><option value="CLOSED">Encerrado</option></Select></Field>}</Grid><Field style={{margin:'16px 0'}}>Produtos elegíveis<ProductList>{products.filter(p=>p.isActive!==false).map(p=><ProductRow key={p.id}><CheckboxControl checked={form.productIds.includes(p.id)} onChange={()=>toggleProduct(p.id)}/>{p.name}</ProductRow>)}</ProductList></Field><Button disabled={!form.productIds.length}>{editingId?'Salvar alterações':'Salvar acordo'}</Button>{editingId&&<Button type="button" variant="secondary" onClick={()=>{setEditingId('');setForm(emptyForm());setTab('summary');}} style={{marginLeft:8}}>Cancelar</Button>}</form></Panel>}
    {tab === 'receipt' && <Panel><form onSubmit={receiveBonus}><Grid><Field>Acordo<Select required value={receipt.agreementId} onChange={e=>setReceipt({...receipt,agreementId:e.target.value,productId:''})}><option value="">Selecione</option>{agreements.filter(a=>a.status==='ACTIVE').map(a=><option key={a.id} value={a.id}>{a.name} - {a.supplier?.name}</option>)}</Select></Field><Field>Numero da nota<Control required value={receipt.invoiceNumber} onChange={e=>setReceipt({...receipt,invoiceNumber:e.target.value})}/></Field><Field>Serie<Control value={receipt.invoiceSeries} onChange={e=>setReceipt({...receipt,invoiceSeries:e.target.value})}/></Field><Field>Data da nota<Control required type="date" value={receipt.invoiceDate} onChange={e=>setReceipt({...receipt,invoiceDate:e.target.value})}/></Field><Field>Produto bonificado<Select required value={receipt.productId} onChange={e=>setReceipt({...receipt,productId:e.target.value})}><option value="">Selecione</option>{eligibleReceiptProducts.map(row=><option key={row.productId} value={row.productId}>{row.product.name}</option>)}</Select></Field><Field>Local de entrada<Select required value={receipt.locationId} onChange={e=>setReceipt({...receipt,locationId:e.target.value})}><option value="">Selecione</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field><Field>Quantidade recebida<Control required min="0.001" step="0.001" type="number" value={receipt.quantity} onChange={e=>setReceipt({...receipt,quantity:e.target.value})}/></Field><Field>Preco unitario fiscal<Control required min="0" step="0.01" type="number" value={receipt.fiscalUnitPrice} onChange={e=>setReceipt({...receipt,fiscalUnitPrice:e.target.value})}/></Field><Field>Valor comercial unitario<Control required min="0" step="0.01" type="number" value={receipt.commercialReferencePrice} onChange={e=>setReceipt({...receipt,commercialReferencePrice:e.target.value})}/></Field><Field>Credito adicional<Control min="0" step="0.01" type="number" value={receipt.additionalCredits} onChange={e=>setReceipt({...receipt,additionalCredits:e.target.value})}/></Field></Grid><Hint style={{margin:'14px 0'}}>Valor fiscal: {money(Number(receipt.quantity||0)*Number(receipt.fiscalUnitPrice||0))}. Beneficio comercial: {money(Number(receipt.quantity||0)*Number(receipt.commercialReferencePrice||0)+Number(receipt.additionalCredits||0))}.</Hint><Button>Confirmar recebimento</Button></form></Panel>}
  </Page>;
}

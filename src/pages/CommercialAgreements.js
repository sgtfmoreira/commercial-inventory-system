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

const PRODUCT_BONUS = 'PRODUCT_BONUS';
const CASHBACK_FIXED_PER_UNIT = 'CASHBACK_FIXED_PER_UNIT';

const Panel = styled(Card).attrs({ as: 'section' })``;
const Grid = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;`;
const Field = styled.label`display:grid;gap:6px;color:${({theme})=>theme.colors.text};font-size:.88rem;font-weight:600;`;
const Control = styled(InputControl)``;
const Select = styled(SelectControl)``;
const ProductList = styled.div`max-height:220px;overflow:auto;display:grid;gap:7px;border:1px solid ${({theme})=>theme.colors.border};border-radius:9px;padding:10px;`;
const ProductRow = styled.label`display:flex;gap:9px;align-items:center;color:${({theme})=>theme.colors.text};font-weight:400;`;
const Hint = styled(PageSubtitle)``;
const Table = styled(DataTable)`min-width:980px;`;
const Actions = styled.div`display:flex;gap:8px;flex-wrap:wrap;`;

const today = () => new Date().toISOString().slice(0, 10);
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const qty = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const emptyForm = () => ({
  name:'', brand:'', supplierId:'', benefitType:PRODUCT_BONUS,
  buyQuantity:10, bonusQuantity:1, cashbackPerUnit:'',
  startsAt:today(), endsAt:'', status:'ACTIVE', productIds:[]
});
const emptyBonusReceipt = () => ({
  agreementId:'', invoiceNumber:'', invoiceSeries:'', invoiceDate:today(), additionalCredits:'',
  productId:'', locationId:'', quantity:'', fiscalUnitPrice:'', commercialReferencePrice:''
});
const emptyCashbackReceipt = () => ({
  agreementId:'', amount:0, receivedAt:today(), method:'PIX', reference:'', notes:'', allocations:{}
});
const orderLabel = id => id ? `OC-${String(id).slice(-6).toUpperCase()}` : '—';

export default function CommercialAgreements() {
  const { state } = useApp();
  const { suppliers = [], products = [] } = state;
  const [tab, setTab] = useState('summary');
  const [agreements, setAgreements] = useState([]);
  const [summary, setSummary] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [receipt, setReceipt] = useState(emptyBonusReceipt);
  const [cashback, setCashback] = useState(emptyCashbackReceipt);

  const load = useCallback(async () => {
    const [agreementData, summaryData, locationData] = await Promise.all([
      api.get('/commercial-agreements'),
      api.get('/commercial-agreements/summary'),
      api.get('/stock-locations')
    ]);
    setAgreements(Array.isArray(agreementData) ? agreementData : []);
    setSummary(Array.isArray(summaryData) ? summaryData : []);
    setLocations(Array.isArray(locationData) ? locationData : []);
  }, []);
  useEffect(() => { load().catch(()=>{}); }, [load]);

  const selectedAgreement = useMemo(
    () => agreements.find(agreement => agreement.id === receipt.agreementId),
    [agreements, receipt.agreementId]
  );
  const selectedCashbackAgreement = useMemo(
    () => agreements.find(agreement => agreement.id === cashback.agreementId),
    [agreements, cashback.agreementId]
  );
  const selectedCashbackSummary = useMemo(
    () => summary.find(row => row.agreementId === cashback.agreementId),
    [summary, cashback.agreementId]
  );
  const eligibleReceiptProducts = selectedAgreement?.products?.filter(product => product.canBeReceivedAsBonus) || [];
  const totalBenefit = summary.reduce((sum,row)=>sum+Number(row.totalBenefit||0),0);
  const totalPendingBonus = summary.reduce((sum,row)=>sum+Number(row.pendingBonusQuantity||0),0);
  const totalPendingCashback = summary.reduce((sum,row)=>sum+Number(row.pendingCashbackAmount||0),0);

  const toggleProduct = productId => setForm(current => ({
    ...current,
    productIds: current.productIds.includes(productId)
      ? current.productIds.filter(id=>id!==productId)
      : [...current.productIds, productId]
  }));

  const saveAgreement = async event => {
    event.preventDefault();
    const payload = {
      ...form,
      productIds: form.productIds.map(productId=>({ productId }))
    };
    if (editingId) await api.put(`/commercial-agreements/${editingId}`, payload);
    else await api.post('/commercial-agreements', payload);
    toast.success(editingId ? 'Acordo comercial atualizado.' : 'Acordo comercial criado.');
    setEditingId('');
    setForm(emptyForm());
    await load();
    setTab('summary');
  };

  const editAgreement = agreement => {
    setEditingId(agreement.id);
    setForm({
      name:agreement.name || '',
      brand:agreement.brand || '',
      supplierId:agreement.supplierId,
      benefitType:agreement.benefitType || PRODUCT_BONUS,
      buyQuantity:Number(agreement.buyQuantity),
      bonusQuantity:Number(agreement.bonusQuantity),
      cashbackPerUnit:agreement.cashbackPerUnit === null ? '' : Number(agreement.cashbackPerUnit),
      startsAt:String(agreement.startsAt).slice(0,10),
      endsAt:agreement.endsAt ? String(agreement.endsAt).slice(0,10) : '',
      status:agreement.status,
      productIds:(agreement.products || []).map(item=>item.productId)
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
      items:[{
        productId:receipt.productId,
        locationId:receipt.locationId,
        quantity:Number(receipt.quantity),
        fiscalUnitPrice:Number(receipt.fiscalUnitPrice),
        commercialReferencePrice:Number(receipt.commercialReferencePrice)
      }]
    });
    toast.success('Bonificação recebida e estoque atualizado.');
    setReceipt(emptyBonusReceipt());
    await load();
    setTab('summary');
  };

  const receiveCashback = async event => {
    event.preventDefault();
    const allocations = Object.entries(cashback.allocations)
      .map(([accrualId, amount]) => ({ accrualId, amount:Number(amount) }))
      .filter(item => item.amount > 0);
    await api.post('/commercial-agreements/cashback-settlements', {
      ...cashback,
      amount:Number(cashback.amount),
      allocations
    });
    toast.success('Recebimento de cashback registrado.');
    setCashback(emptyCashbackReceipt());
    await load();
    setTab('summary');
  };

  const cancelCashback = async settlement => {
    if (!window.confirm(`Cancelar o recebimento de ${money(settlement.amount)}?`)) return;
    await api.post(`/commercial-agreements/cashback-settlements/${settlement.id}/cancel`, {});
    toast.success('Recebimento de cashback cancelado.');
    await load();
  };

  const cashbackAccrualDetails = useMemo(() => {
    if (!selectedCashbackAgreement) return [];
    const eligibleProducts = new Set((selectedCashbackAgreement.products || []).map(item => item.productId));
    return (selectedCashbackAgreement.accruals || []).map(accrual => {
      const eligibleItems = (accrual.invoice?.items || []).filter(item => eligibleProducts.has(item.productId));
      const fiscalTotal = eligibleItems.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
        0
      );
      const earned = Number(accrual.earnedCashbackAmount || 0);
      const received = (accrual.cashbackAllocations || []).reduce(
        (sum, allocation) => sum + Number(allocation.amount || 0), 0
      );
      return {
        ...accrual,
        fiscalTotal,
        received,
        pending:Math.max(0, earned - received),
        effectiveTotal:fiscalTotal - earned
      };
    });
  }, [selectedCashbackAgreement]);

  const updateCashbackAllocation = (accrualId, value) => {
    const allocations = { ...cashback.allocations, [accrualId]:value };
    const amount = Object.values(allocations).reduce((sum, item) => sum + Number(item || 0), 0);
    setCashback({ ...cashback, allocations, amount:Number(amount.toFixed(2)) });
  };

  const changeTab = id => {
    setTab(id);
    if (id === 'agreement' && tab !== 'agreement') {
      setEditingId('');
      setForm(emptyForm());
    }
  };

  return <Page>
    <PageHeader>
      <PageHeading>
        <PageTitle>Acordos e bonificações</PageTitle>
        <Hint>Cada acordo pertence somente à casa atual. Bonificações movimentam estoque; cashback é controlado financeiramente sem alterar o custo fiscal.</Hint>
      </PageHeading>
      <Tabs>{[
        ['summary','Resumo'],
        ['agreement',editingId?'Editar acordo':'Novo acordo'],
        ['receipt','Receber bonificação'],
        ['cashback','Receber cashback']
      ].map(([id,label])=><Tab key={id} active={tab===id} onClick={()=>changeTab(id)}>{label}</Tab>)}</Tabs>
    </PageHeader>

    {tab === 'summary' && <>
      <CardGrid>
        <StatCard><span>Benefício recebido</span><strong>{money(totalBenefit)}</strong></StatCard>
        <StatCard><span>Produtos bonificados pendentes</span><strong>{qty(totalPendingBonus)}</strong></StatCard>
        <StatCard><span>Cashback pendente</span><strong>{money(totalPendingCashback)}</strong></StatCard>
        <StatCard><span>Acordos cadastrados</span><strong>{agreements.length}</strong></StatCard>
      </CardGrid>
      <TableSurface><Table><thead><tr>
        <th>Acordo</th><th>Fornecedor</th><th>Tipo</th><th>Gerado</th><th>Recebido</th><th>Pendente</th><th>Benefício realizado</th><th>Ações</th>
      </tr></thead><tbody>{summary.map(row=>{
        const agreement=agreements.find(item=>item.id===row.agreementId);
        const isCashback=row.benefitType===CASHBACK_FIXED_PER_UNIT;
        return <tr key={row.agreementId}>
          <td>{row.name}</td><td>{row.supplierName}</td>
          <td>{isCashback?'Cashback por unidade':'Bonificação em produto'}</td>
          <td>{isCashback?money(row.earnedCashbackAmount):qty(row.earnedBonusQuantity)}</td>
          <td>{isCashback?money(row.receivedCashbackAmount):qty(row.receivedBonusQuantity)}</td>
          <td><strong>{isCashback?money(row.pendingCashbackAmount):qty(row.pendingBonusQuantity)}</strong></td>
          <td>{money(row.totalBenefit)}</td>
          <td>{agreement&&<Actions><Button size="sm" variant="outlined" onClick={()=>editAgreement(agreement)}>Editar</Button><Button size="sm" variant="danger" onClick={()=>deleteAgreement(agreement)}>Excluir</Button></Actions>}</td>
        </tr>;
      })}{!summary.length&&<tr><td colSpan="8">Nenhum acordo cadastrado nesta casa.</td></tr>}</tbody></Table></TableSurface>
    </>}

    {tab === 'agreement' && <Panel><form onSubmit={saveAgreement}>
      <Grid>
        <Field>Nome do acordo<Control required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
        <Field>Marca<Control value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></Field>
        <Field>Fornecedor<Select required value={form.supplierId} onChange={e=>setForm({...form,supplierId:e.target.value})}><option value="">Selecione</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field>Tipo de benefício<Select value={form.benefitType} onChange={e=>setForm({...form,benefitType:e.target.value})}><option value={PRODUCT_BONUS}>Bonificação em produto</option><option value={CASHBACK_FIXED_PER_UNIT}>Cashback fixo por unidade</option></Select></Field>
        {form.benefitType===PRODUCT_BONUS ? <>
          <Field>Quantidade comprada<Control required min="0.001" step="0.001" type="number" value={form.buyQuantity} onChange={e=>setForm({...form,buyQuantity:e.target.value})}/></Field>
          <Field>Quantidade bonificada<Control required min="0.001" step="0.001" type="number" value={form.bonusQuantity} onChange={e=>setForm({...form,bonusQuantity:e.target.value})}/></Field>
        </> : <Field>Cashback por unidade (R$)<Control required min="0.01" step="0.01" type="number" value={form.cashbackPerUnit} onChange={e=>setForm({...form,cashbackPerUnit:e.target.value})}/></Field>}
        <Field>Início<Control required type="date" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></Field>
        <Field>Fim (opcional)<Control type="date" value={form.endsAt} onChange={e=>setForm({...form,endsAt:e.target.value})}/></Field>
        {editingId&&<Field>Status<Select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="ACTIVE">Ativo</option><option value="SUSPENDED">Suspenso</option><option value="CLOSED">Encerrado</option></Select></Field>}
      </Grid>
      <Field style={{margin:'16px 0'}}>Produtos que geram o benefício<ProductList>{products.filter(p=>p.isActive!==false).map(p=><ProductRow key={p.id}><CheckboxControl checked={form.productIds.includes(p.id)} onChange={()=>toggleProduct(p.id)}/>{p.name}</ProductRow>)}</ProductList></Field>
      <Button disabled={!form.productIds.length}>{editingId?'Salvar alterações':'Salvar acordo'}</Button>
      {editingId&&<Button type="button" variant="secondary" onClick={()=>{setEditingId('');setForm(emptyForm());setTab('summary');}} style={{marginLeft:8}}>Cancelar</Button>}
    </form></Panel>}

    {tab === 'receipt' && <Panel><form onSubmit={receiveBonus}><Grid>
      <Field>Acordo<Select required value={receipt.agreementId} onChange={e=>setReceipt({...receipt,agreementId:e.target.value,productId:''})}><option value="">Selecione</option>{agreements.filter(a=>a.status==='ACTIVE'&&(a.benefitType||PRODUCT_BONUS)===PRODUCT_BONUS).map(a=><option key={a.id} value={a.id}>{a.name} - {a.supplier?.name}</option>)}</Select></Field>
      <Field>Número da nota<Control required value={receipt.invoiceNumber} onChange={e=>setReceipt({...receipt,invoiceNumber:e.target.value})}/></Field>
      <Field>Série<Control value={receipt.invoiceSeries} onChange={e=>setReceipt({...receipt,invoiceSeries:e.target.value})}/></Field>
      <Field>Data da nota<Control required type="date" value={receipt.invoiceDate} onChange={e=>setReceipt({...receipt,invoiceDate:e.target.value})}/></Field>
      <Field>Produto bonificado<Select required value={receipt.productId} onChange={e=>setReceipt({...receipt,productId:e.target.value})}><option value="">Selecione</option>{eligibleReceiptProducts.map(row=><option key={row.productId} value={row.productId}>{row.product.name}</option>)}</Select></Field>
      <Field>Local de entrada<Select required value={receipt.locationId} onChange={e=>setReceipt({...receipt,locationId:e.target.value})}><option value="">Selecione</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
      <Field>Quantidade recebida<Control required min="0.001" step="0.001" type="number" value={receipt.quantity} onChange={e=>setReceipt({...receipt,quantity:e.target.value})}/></Field>
      <Field>Preço unitário fiscal<Control required min="0" step="0.01" type="number" value={receipt.fiscalUnitPrice} onChange={e=>setReceipt({...receipt,fiscalUnitPrice:e.target.value})}/></Field>
      <Field>Valor comercial unitário<Control required min="0" step="0.01" type="number" value={receipt.commercialReferencePrice} onChange={e=>setReceipt({...receipt,commercialReferencePrice:e.target.value})}/></Field>
      <Field>Crédito adicional<Control min="0" step="0.01" type="number" value={receipt.additionalCredits} onChange={e=>setReceipt({...receipt,additionalCredits:e.target.value})}/></Field>
    </Grid><Hint style={{margin:'14px 0'}}>Valor fiscal: {money(Number(receipt.quantity||0)*Number(receipt.fiscalUnitPrice||0))}. Benefício comercial: {money(Number(receipt.quantity||0)*Number(receipt.commercialReferencePrice||0)+Number(receipt.additionalCredits||0))}.</Hint><Button>Confirmar recebimento</Button></form></Panel>}

    {tab === 'cashback' && <Panel><form onSubmit={receiveCashback}><Grid>
      <Field>Acordo de cashback<Select required value={cashback.agreementId} onChange={e=>setCashback({...emptyCashbackReceipt(),agreementId:e.target.value})}><option value="">Selecione</option>{agreements.filter(a=>a.benefitType===CASHBACK_FIXED_PER_UNIT).map(a=><option key={a.id} value={a.id}>{a.name} - {a.supplier?.name}</option>)}</Select></Field>
      <Field>Valor recebido (soma das ordens)<Control readOnly type="number" value={cashback.amount}/></Field>
      <Field>Data do recebimento<Control required type="date" value={cashback.receivedAt} onChange={e=>setCashback({...cashback,receivedAt:e.target.value})}/></Field>
      <Field>Forma de recebimento<Select required value={cashback.method} onChange={e=>setCashback({...cashback,method:e.target.value})}><option value="PIX">PIX</option><option value="BANK_TRANSFER">Transferência bancária</option><option value="INVOICE_DISCOUNT">Desconto em boleto</option><option value="NEXT_PURCHASE_CREDIT">Crédito na próxima compra</option><option value="OTHER">Outro</option></Select></Field>
      <Field>Referência/comprovante<Control value={cashback.reference} onChange={e=>setCashback({...cashback,reference:e.target.value})}/></Field>
      <Field>Observação<Control value={cashback.notes} onChange={e=>setCashback({...cashback,notes:e.target.value})}/></Field>
    </Grid>
      {selectedCashbackSummary&&<Hint style={{margin:'14px 0'}}>Gerado: {money(selectedCashbackSummary.earnedCashbackAmount)}. Recebido: {money(selectedCashbackSummary.receivedCashbackAmount)}. Pendente: <strong>{money(selectedCashbackSummary.pendingCashbackAmount)}</strong>.</Hint>}
      <Button disabled={!cashback.agreementId||Number(cashback.amount)<=0}>Registrar cashback vinculado</Button>
    </form>
      {selectedCashbackAgreement?.cashbackSettlements?.length>0&&<TableSurface style={{marginTop:18}}><Table><thead><tr><th>Data</th><th>Valor</th><th>Ordens vinculadas</th><th>Forma</th><th>Referência</th><th>Ação</th></tr></thead><tbody>{selectedCashbackAgreement.cashbackSettlements.map(item=><tr key={item.id}><td>{String(item.receivedAt).slice(0,10).split('-').reverse().join('/')}</td><td>{money(item.amount)}</td><td>{(item.allocations||[]).map(allocation=>`${orderLabel(allocation.accrual?.invoice?.purchaseOrderId)} (${money(allocation.amount)})`).join(', ')||'—'}</td><td>{item.method}</td><td>{item.reference||'—'}</td><td><Button size="sm" variant="danger" onClick={()=>cancelCashback(item)}>Cancelar</Button></td></tr>)}</tbody></Table></TableSurface>}
      {cashbackAccrualDetails.length>0&&<TableSurface style={{marginTop:18}}><Table><thead><tr><th>Ordem recebida</th><th>Nota de compra</th><th>Data</th><th>Quantidade elegível</th><th>Valor fiscal</th><th>Cashback gerado</th><th>Já recebido</th><th>Pendente</th><th>Vincular agora</th><th>Custo líquido gerencial</th></tr></thead><tbody>{cashbackAccrualDetails.map(item=><tr key={item.id}><td><strong>{orderLabel(item.invoice?.purchaseOrder?.id)}</strong></td><td>{item.invoice?.invoiceNumber}{item.invoice?.invoiceSeries?`/${item.invoice.invoiceSeries}`:''}</td><td>{String(item.invoice?.issuedAt||'').slice(0,10).split('-').reverse().join('/')}</td><td>{qty(item.eligibleQuantity)}</td><td>{money(item.fiscalTotal)}</td><td>{money(item.earnedCashbackAmount)}</td><td>{money(item.received)}</td><td><strong>{money(item.pending)}</strong></td><td><Control aria-label={`Valor para ${orderLabel(item.invoice?.purchaseOrder?.id)}`} disabled={item.pending<=0} min="0" max={item.pending} step="0.01" type="number" value={cashback.allocations[item.id]||''} onChange={e=>updateCashbackAllocation(item.id,e.target.value)}/></td><td><strong>{money(item.effectiveTotal)}</strong></td></tr>)}</tbody></Table></TableSurface>}
      {selectedCashbackAgreement&&!cashbackAccrualDetails.length&&<Hint style={{marginTop:18}}>Nenhuma ordem recebida gerou cashback para este acordo.</Hint>}
    </Panel>}
  </Page>;
}

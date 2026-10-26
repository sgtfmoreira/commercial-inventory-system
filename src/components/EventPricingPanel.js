import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import eventService from '../services/eventService';

const Panel=styled.section`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:20px;display:grid;gap:18px;`;
const Grid=styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;`;
const Field=styled.label`display:grid;gap:5px;font-size:.82rem;font-weight:700;`;
const Input=styled.input`padding:10px;border:1px solid ${({theme})=>theme.colors.border};border-radius:8px;background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};`;
const Textarea=styled.textarea`padding:10px;border:1px solid ${({theme})=>theme.colors.border};border-radius:8px;background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};min-height:90px;`;
const Card=styled.div`padding:14px;border-radius:10px;background:${({theme})=>theme.colors.bgInput};span{display:block;color:${({theme})=>theme.colors.textMuted};font-size:.75rem}strong{font-size:1.1rem}`;
const Button=styled.button`border:0;border-radius:8px;padding:10px 14px;background:${({theme})=>theme.colors.primary};color:white;font-weight:700;cursor:pointer;justify-self:start;`;
const Stepper=styled.div`display:grid;grid-template-columns:38px 1fr 38px;button{border:1px solid ${({theme})=>theme.colors.border};background:${({theme})=>theme.colors.bgHover};color:${({theme})=>theme.colors.textPrimary};font-size:1.1rem;cursor:pointer;}input{border-radius:0;}`;
const Notice=styled.div`padding:11px 13px;border-radius:8px;background:${({theme})=>theme.colors.bgInput};border-left:4px solid #d97706;`;

const money=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const percent=value=>value==null?'—':`${Number(value).toLocaleString('pt-BR',{maximumFractionDigits:2})}%`;
const fields=['desiredMarginPercent','taxPercent','commissionPercent','cardFeePercent','otherFeePercent'];
const initial=budget=>Object.fromEntries([...fields,'quotedPrice','validUntil','customerProposalNotes','internalNotes'].map(field=>[field,budget[field]==null?'':field==='validUntil'?String(budget[field]).slice(0,10):String(budget[field])]));

export default function EventPricingPanel({budget,onUpdate}){
  const[form,setForm]=useState(()=>initial(budget));const[saving,setSaving]=useState(false);
  useEffect(()=>setForm(initial(budget)),[budget]);
  const change=event=>setForm(current=>({...current,[event.target.name]:event.target.value}));
  const difference=useMemo(()=>form.quotedPrice===''?null:Number(form.quotedPrice)-Number(budget.recommendedPrice||0),[form.quotedPrice,budget.recommendedPrice]);
  const step=delta=>setForm(current=>({...current,desiredMarginPercent:String(Math.max(0,Number(current.desiredMarginPercent||0)+delta))}));
  const save=async event=>{event.preventDefault();setSaving(true);try{const data={...form,quotedPrice:form.quotedPrice===''?null:form.quotedPrice,validUntil:form.validUntil||null,customerProposalNotes:form.customerProposalNotes||null,internalNotes:form.internalNotes||null};const updated=await eventService.updateBudget(budget.id,data);onUpdate(updated);toast.success('Precificação atualizada.');}finally{setSaving(false);}};
  const warningLabels={MARGIN_BELOW_TARGET:'Atenção: margem abaixo da meta definida.',PRICE_BELOW_BREAK_EVEN:'Este orçamento está abaixo do custo previsto.'};
  return <Panel><div><h2>Precificação</h2><p>Os encargos incidem sobre a receita. Os indicadores exibidos abaixo são os valores persistidos pelo servidor.</p></div>
    <Grid><Card><span>Cardápio</span><strong>{money(budget.costMenu)}</strong></Card><Card><span>Equipe</span><strong>{money(budget.costStaff)}</strong></Card><Card><span>Serviços</span><strong>{money(budget.costService)}</strong></Card><Card><span>Equipamentos</span><strong>{money(budget.costEquipment)}</strong></Card><Card><span>Transporte</span><strong>{money(budget.costTransport)}</strong></Card><Card><span>Taxas fixas</span><strong>{money(budget.costFees)}</strong></Card><Card><span>Outros</span><strong>{money(budget.costOther)}</strong></Card><Card><span>Custo total</span><strong>{money(budget.totalCost)}</strong></Card></Grid>
    <form onSubmit={save}><Grid>
      <Field>Margem desejada (%)<Stepper><button type="button" onClick={()=>step(-1)} aria-label="Diminuir margem">−</button><Input required type="number" min="0" max="100" step="0.01" name="desiredMarginPercent" value={form.desiredMarginPercent} onChange={change}/><button type="button" onClick={()=>step(1)} aria-label="Aumentar margem">+</button></Stepper></Field>
      <Field>Impostos (%)<Input required type="number" min="0" max="100" step="0.01" name="taxPercent" value={form.taxPercent} onChange={change}/></Field>
      <Field>Comissão (%)<Input required type="number" min="0" max="100" step="0.01" name="commissionPercent" value={form.commissionPercent} onChange={change}/></Field>
      <Field>Taxa de cartão (%)<Input required type="number" min="0" max="100" step="0.01" name="cardFeePercent" value={form.cardFeePercent} onChange={change}/></Field>
      <Field>Outras taxas sobre venda (%)<Input required type="number" min="0" max="100" step="0.01" name="otherFeePercent" value={form.otherFeePercent} onChange={change}/></Field>
      <Field>Preço do orçamento<Input type="number" min="0" step="0.01" name="quotedPrice" value={form.quotedPrice} onChange={change}/></Field>
      <Field>Validade da proposta<Input type="date" name="validUntil" value={form.validUntil} onChange={change}/></Field>
    </Grid><Grid><Field>Observações para o cliente<Textarea name="customerProposalNotes" value={form.customerProposalNotes} onChange={change}/></Field><Field>Observações internas<Textarea name="internalNotes" value={form.internalNotes} onChange={change}/></Field></Grid><Button disabled={saving}>{saving?'Salvando...':'Salvar precificação'}</Button></form>
    <Grid><Card><span>Preço recomendado</span><strong>{money(budget.recommendedPrice)}</strong></Card><Card><span>Preço negociado</span><strong>{money(budget.quotedPrice)}</strong></Card><Card><span>Diferença</span><strong>{money(difference)}</strong></Card><Card><span>Encargos</span><strong>{money(budget.expectedFeeAmount)}</strong></Card><Card><span>Lucro previsto</span><strong>{money(budget.expectedProfit)}</strong></Card><Card><span>Margem efetiva</span><strong>{percent(budget.effectiveMarginPercent)}</strong></Card><Card><span>CMV do cardápio</span><strong>{percent(budget.menuCMVPercent)}</strong></Card></Grid>
    <Grid><Card><span>Preço por convidado</span><strong>{money(budget.pricePerGuest)}</strong></Card><Card><span>Custo por convidado</span><strong>{money(budget.costPerGuest)}</strong></Card><Card><span>Lucro por convidado</span><strong>{money(budget.profitPerGuest)}</strong></Card><Card><span>Cardápio por convidado</span><strong>{money(Number(budget.costMenu||0)/Number(budget.event?.guestCount||1))}</strong></Card></Grid>
    {budget.pricingWarnings?.map(code=><Notice key={code}>{warningLabels[code]||code}</Notice>)}
    {budget.qualityWarnings?.length>0&&<Notice>Existem itens sem custo. Revise-os antes de enviar ou aprovar.</Notice>}
  </Panel>;
}

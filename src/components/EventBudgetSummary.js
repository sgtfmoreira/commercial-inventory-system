import DSButton from './Button';
import React,{useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import toast from 'react-hot-toast';
import styled from 'styled-components';
import eventService from '../services/eventService';

const Panel=styled.section`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:20px;display:grid;gap:16px;`;
const Grid=styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;`;
const Card=styled.div`padding:14px;border-radius:10px;background:${({theme})=>theme.colors.bgInput};span{display:block;color:${({theme})=>theme.colors.textMuted};font-size:.75rem}`;
const Check=styled.li`margin:7px 0;color:${({$passed,theme})=>$passed?theme.colors.textPrimary:'#b45309'};`;
const Actions=styled.div`display:flex;gap:8px;flex-wrap:wrap;align-items:center;`;
const Button=DSButton;
const money=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const percent=value=>value==null?'—':`${Number(value).toLocaleString('pt-BR',{maximumFractionDigits:2})}%`;
const date=value=>value?new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(new Date(value.length===10?`${value}T00:00:00Z`:value)):'—';
const time=value=>value?(value.includes('T')?value.slice(11,16):value.slice(0,5)):'horário a definir';

export default function EventBudgetSummary({budget,eventId,onUpdate}){
  const navigate=useNavigate();
  const[working,setWorking]=useState(false);
  const other=Number(budget.costService||0)+Number(budget.costEquipment||0)+Number(budget.costTransport||0)+Number(budget.costFees||0)+Number(budget.costOther||0);
  const run=async(action,message)=>{setWorking(true);try{const result=await action();onUpdate?.(result);toast.success(message);return result;}catch(error){toast.error(error.message);return null;}finally{setWorking(false);}};
  const reject=()=>{const reason=window.prompt('Motivo da rejeição (opcional):')??null;if(reason!==null)run(()=>eventService.rejectBudget(budget.id,reason||null),'Orçamento rejeitado.');};
  const revise=async()=>{const result=await run(()=>eventService.createBudgetRevision(budget.id),'Nova revisão criada.');if(result)navigate(`/events/${eventId}/budgets/${result.id}/edit`);};
  const download=async()=>{setWorking(true);try{const blob=await eventService.getProposalPdf(budget.id);const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`proposta-${budget.event?.code||eventId}-rev-${budget.revision}.pdf`;anchor.click();URL.revokeObjectURL(url);}catch(error){toast.error(error.message);}finally{setWorking(false);}};
  return <Panel><div><h2>Resumo interno</h2><p>{budget.event?.name} · {budget.event?.customer?.name} · {date(budget.event?.eventDate)} · {time(budget.event?.startTime)}{budget.event?.endTime?` às ${time(budget.event.endTime)}`:''} · {budget.event?.guestCount} convidados</p></div><Grid>
    <Card><span>Receita prevista</span><strong>{money(budget.quotedPrice)}</strong></Card><Card><span>Cardápio</span><strong>{money(budget.costMenu)}</strong></Card><Card><span>Equipe</span><strong>{money(budget.costStaff)}</strong></Card><Card><span>Outros custos</span><strong>{money(other)}</strong></Card><Card><span>Custo total</span><strong>{money(budget.totalCost)}</strong></Card><Card><span>Lucro previsto</span><strong>{money(budget.expectedProfit)}</strong></Card><Card><span>Margem total</span><strong>{percent(budget.effectiveMarginPercent)}</strong></Card><Card><span>CMV cardápio</span><strong>{percent(budget.menuCMVPercent)}</strong></Card><Card><span>Preço por convidado</span><strong>{money(budget.pricePerGuest)}</strong></Card>
  </Grid><div><h3>Checklist de qualidade</h3><ul>{budget.qualityChecklist?.map(item=><Check key={item.code} $passed={item.passed}>{item.passed?'✓':'⚠'} {item.label}</Check>)}</ul></div>
  <div><strong>{budget.readyForProposal?'Proposta pronta para visualização.':'Complete os itens pendentes antes de enviar a proposta.'}</strong></div>
  <Actions><Link to={`/events/${eventId}/budgets/${budget.id}/proposal`}>Visualizar proposta</Link><Button type="button" $secondary disabled={working} onClick={download}>Baixar PDF</Button>{budget.status==='DRAFT'&&<Button type="button" disabled={working||!budget.readyToSend} onClick={()=>run(()=>eventService.sendBudget(budget.id),'Proposta marcada como enviada.')}>Marcar como enviada</Button>}{budget.status==='SENT'&&<><Button type="button" disabled={working} onClick={()=>run(()=>eventService.approveBudget(budget.id),'Orçamento aprovado.')}>Aprovar</Button><Button type="button" $secondary disabled={working} onClick={reject}>Rejeitar</Button><Button type="button" $secondary disabled={working} onClick={revise}>Nova revisão</Button></>}{['REJECTED','EXPIRED'].includes(budget.status)&&<Button type="button" disabled={working} onClick={revise}>Nova revisão</Button>}</Actions></Panel>;
}

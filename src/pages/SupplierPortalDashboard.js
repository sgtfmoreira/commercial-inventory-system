import { InputControl } from '../components/FormFields';
import { CheckboxControl } from '../components/FormFields';
import DataTable from '../components/Table';
import SupplierPortalLogo from '../components/SupplierPortalLogo';
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { MdLogout, MdSearch, MdSend, MdInventory2, MdHistory, MdCheckCircle, MdEdit } from 'react-icons/md';
import { portal } from '../services/supplierPortalService';
import Button from '../components/Button';
import Card from '../components/Card';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';
import { Input } from '../components/FormFields';

const Shell = styled.div`min-height:100vh;background:${({theme})=>theme.colors.bg};color:${({theme})=>theme.colors.textPrimary};`;
const Page = styled.main`width:100%;max-width:1400px;margin:0 auto;padding:32px 28px 56px;display:flex;flex-direction:column;gap:28px;@media(max-width:700px){padding:20px 16px 40px;gap:22px;}`;
const Header = styled.header`display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;`;
const Eyebrow = styled.span`color:${({theme})=>theme.colors.primary};font-size:${({theme})=>theme.fontSizes.sm};font-weight:${({theme})=>theme.fontWeights.semibold};`;
const Title = styled.h1`margin-top:4px;font-size:${({theme})=>theme.fontSizes['3xl']};line-height:1.15;`;
const Subtitle = styled.p`margin-top:7px;color:${({theme})=>theme.colors.textSecondary};`;
const Stats = styled.div`display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;@media(max-width:680px){grid-template-columns:1fr;}`;
const StatCard = styled(Card)`display:flex;align-items:center;gap:14px;svg{color:${({theme})=>theme.colors.primary};font-size:24px;}span{display:block;color:${({theme})=>theme.colors.textMuted};font-size:13px;}strong{display:block;margin-top:2px;font-size:24px;}`;
const Section = styled.section`display:flex;flex-direction:column;gap:16px;`;
const SectionHeader = styled.div`display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;`;
const SectionTitle = styled.div`h2{font-size:${({theme})=>theme.fontSizes['2xl']};}p{color:${({theme})=>theme.colors.textSecondary};margin-top:4px;font-size:14px;}`;
const Search = styled.label`min-width:min(100%,320px);display:flex;align-items:center;gap:9px;padding:0 12px;background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};color:${({theme})=>theme.colors.textMuted};input{width:100%;padding:11px 0;border:0;outline:0;background:transparent;color:${({theme})=>theme.colors.textPrimary};}`;
const TableWrapper = styled(Card)`padding:0;overflow-x:auto;`;
const Table = styled(DataTable)`width:100%;border-collapse:collapse;min-width:980px;@media(max-width:768px){min-width:0;display:flex;flex-direction:column;padding:10px;gap:10px;thead{display:none;}tbody{display:flex;flex-direction:column;gap:10px;}}`;
const Th = styled.th`padding:13px 14px;text-align:left;font-size:${({theme})=>theme.fontSizes.xs};font-weight:${({theme})=>theme.fontWeights.semibold};color:${({theme})=>theme.colors.textMuted};text-transform:uppercase;letter-spacing:.04em;background:${({theme})=>theme.colors.bgHover};border-bottom:1px solid ${({theme})=>theme.colors.border};white-space:nowrap;`;
const Tr = styled.tr`transition:${({theme})=>theme.transition};background:${({$changed,theme})=>$changed?theme.colors.primaryLight:'transparent'};&:hover{background:${({theme})=>theme.colors.bgHover};}@media(max-width:768px){display:flex;flex-direction:column;border:1px solid ${({$changed,theme})=>$changed?theme.colors.primary:theme.colors.border};border-radius:${({theme})=>theme.radii.md};overflow:hidden;background:${({theme})=>theme.colors.bgCard};}`;
const Td = styled.td`padding:12px 14px;border-bottom:1px solid ${({theme})=>theme.colors.border};vertical-align:middle;font-size:${({theme})=>theme.fontSizes.sm};@media(max-width:768px){display:flex;justify-content:space-between;align-items:center;gap:16px;padding:9px 12px;&:before{content:attr(data-label);font-size:11px;font-weight:700;color:${({theme})=>theme.colors.textMuted};text-transform:uppercase;} &:first-child{display:block;padding:13px 12px;&:before{display:none;}}}`;
const ProductName = styled.div`min-width:220px;strong{display:block;line-height:1.3;}small{display:block;margin-top:4px;color:${({theme})=>theme.colors.textMuted};}`;
const CompactInput = styled(Input)`min-width:110px;`;
const UnitValue = styled.div`display:flex;align-items:center;gap:8px;min-width:150px;span{color:${({theme})=>theme.colors.textSecondary};font-size:13px;font-weight:600;white-space:nowrap;}label{flex:1;}`;
const Availability = styled.label`display:flex;align-items:center;gap:8px;color:${({theme})=>theme.colors.textSecondary};font-size:14px;cursor:pointer;white-space:nowrap;input{width:17px;height:17px;accent-color:${({theme})=>theme.colors.primary};}`;
const ActionBar = styled(Card)`position:sticky;bottom:16px;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;p{color:${({theme})=>theme.colors.textSecondary};font-size:14px;}strong{color:${({theme})=>theme.colors.textPrimary};}@media(max-width:620px){align-items:stretch;flex-direction:column;button{width:100%;}}`;
const Success = styled.div`padding:13px 16px;border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.successLight};color:${({theme})=>theme.colors.success};font-weight:${({theme})=>theme.fontWeights.semibold};`;
const HistoryList = styled.div`display:grid;gap:10px;`;
const HistoryCard = styled(Card)`display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 16px;p{font-weight:${({theme})=>theme.fontWeights.semibold};}small{display:block;margin-top:3px;color:${({theme})=>theme.colors.textMuted};}`;

const decorate=item=>({...item,nextPrice:Number(item.packagePrice),nextUnits:Number(item.unitsPerPackage),nextUnit:item.commercialUnit,nextAvailable:item.available,nextLead:item.deliveryLeadDays??''});
const changed=item=>Number(item.nextPrice)!==Number(item.packagePrice)||Number(item.nextUnits)!==Number(item.unitsPerPackage)||item.nextUnit!==item.commercialUnit||item.nextAvailable!==item.available||String(item.nextLead??'')!==String(item.deliveryLeadDays??'');
const status=value=>({SUBMITTED:['Enviado','warning'],APPLIED:['Aplicado','success'],REJECTED:['Rejeitado','danger']}[value]||[value,'info']);

export default function SupplierPortalDashboard(){
 const[context,setContext]=useState(null),[items,setItems]=useState([]),[history,setHistory]=useState([]),[message,setMessage]=useState(''),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[submitting,setSubmitting]=useState(false);
 const load=async()=>{const[catalogContext,catalog,currentHistory]=await Promise.all([portal.me(),portal.catalog(),portal.history()]);setContext(catalogContext);setItems(catalog.map(decorate));setHistory(currentHistory);};
 useEffect(()=>{load().catch(error=>toast.error(error.message)).finally(()=>setLoading(false));},[]);
 const changedItems=useMemo(()=>items.filter(changed),[items]);
 const filteredItems=useMemo(()=>{const term=search.trim().toLocaleLowerCase('pt-BR');return items.filter(item=>!term||`${item.organizationProduct.internalCode} ${item.organizationProduct.name}`.toLocaleLowerCase('pt-BR').includes(term));},[items,search]);
 const change=(id,key,value)=>{setMessage('');setItems(list=>list.map(item=>item.id===id?{...item,[key]:value}:item));};
 const submit=async()=>{if(!changedItems.length||submitting)return;setSubmitting(true);setMessage('');try{const result=await portal.submit({note:null,items:changedItems.map(item=>({catalogItemId:item.id,packagePrice:Number(item.nextPrice),commercialUnit:item.nextUnit,unitsPerPackage:Number(item.nextUnits),available:item.nextAvailable,deliveryLeadDays:item.nextLead===''?null:Number(item.nextLead)}))});setMessage(`Lote enviado com ${changedItems.length} alteração(ões). Protocolo ${result.id.slice(0,8)}.`);toast.success('Alterações enviadas para análise.');const[catalog,currentHistory]=await Promise.all([portal.catalog(),portal.history()]);setItems(catalog.map(decorate));setHistory(currentHistory);}catch(error){toast.error(error.message);}finally{setSubmitting(false);}};
 const logout=()=>{localStorage.removeItem('supplierPortalToken');window.location.href='/supplier-portal/login';};
 if(loading)return <Shell><Page><Loading message="Carregando catálogo do fornecedor..."/></Page></Shell>;
 return <Shell><Page>
  <Header><div><SupplierPortalLogo/><Eyebrow>Portal do fornecedor</Eyebrow><Title>{context?.supplier?.name||'Fornecedor'}</Title><Subtitle>{context?.user?.name} · catálogo central da organização</Subtitle></div><Button variant="secondary" onClick={logout}><MdLogout/>Sair</Button></Header>
  <Stats><StatCard><MdInventory2/><div><span>Produtos no catálogo</span><strong>{items.length}</strong></div></StatCard><StatCard><MdEdit/><div><span>Alterações pendentes</span><strong>{changedItems.length}</strong></div></StatCard><StatCard><MdHistory/><div><span>Lotes enviados</span><strong>{history.length}</strong></div></StatCard></Stats>
  <Section><SectionHeader><SectionTitle><h2>Catálogo</h2><p>Informe apenas os valores que mudaram. Os demais produtos permanecem inalterados.</p></SectionTitle><Search><MdSearch/><InputControl value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar produto ou código"/></Search></SectionHeader>
   {!items.length?<EmptyState icon={<MdInventory2/>} title="Catálogo ainda não disponível" subtitle="Nenhum produto foi autorizado para este fornecedor."/>:!filteredItems.length?<EmptyState icon={<MdSearch/>} title="Nenhum produto encontrado" subtitle="Tente buscar por outro nome ou código."/>:<TableWrapper><Table><thead><tr><Th>Produto</Th><Th>Preço da embalagem</Th><Th>Conteúdo da embalagem</Th><Th>Unidade comercial</Th><Th>Disponibilidade</Th></tr></thead><tbody>{filteredItems.map(item=>{const isChanged=changed(item);const baseUnit=item.organizationProduct.baseUnit||'unidade';return <Tr key={item.id} $changed={isChanged}><Td data-label="Produto"><ProductName><strong>{item.organizationProduct.name}</strong><small>{item.organizationProduct.internalCode}{isChanged&&<> · <Badge variant="warning">Alterado</Badge></>}</small></ProductName></Td><Td data-label="Preço da embalagem"><CompactInput aria-label={`Preço de ${item.organizationProduct.name}`} type="number" min="0.01" step="0.01" value={item.nextPrice} onChange={event=>change(item.id,'nextPrice',event.target.value)}/></Td><Td data-label="Conteúdo"><UnitValue><CompactInput aria-label={`Unidades de ${item.organizationProduct.name}`} type="number" min="0.001" step="0.001" value={item.nextUnits} onChange={event=>change(item.id,'nextUnits',event.target.value)}/><span>{baseUnit}</span></UnitValue></Td><Td data-label="Unidade comercial"><CompactInput aria-label={`Unidade comercial de ${item.organizationProduct.name}`} value={item.nextUnit} onChange={event=>change(item.id,'nextUnit',event.target.value)}/></Td><Td data-label="Disponibilidade"><Availability><CheckboxControl checked={item.nextAvailable} onChange={event=>change(item.id,'nextAvailable',event.target.checked)}/>{item.nextAvailable?'Disponível':'Indisponível'}</Availability></Td></Tr>;})}</tbody></Table></TableWrapper>}
   {items.length>0&&<ActionBar><p>{changedItems.length?<><strong>{changedItems.length}</strong> produto(s) pronto(s) para envio</>:'Altere algum valor para habilitar o envio.'}</p><Button disabled={submitting||!changedItems.length} onClick={submit}><MdSend/>{submitting?'Enviando...':changedItems.length?`Enviar ${changedItems.length} alteração(ões)`:'Nenhuma alteração pendente'}</Button></ActionBar>}{message&&<Success role="status"><MdCheckCircle style={{display:'inline',marginRight:8}}/>{message}</Success>}
  </Section>
  <Section><SectionHeader><SectionTitle><h2>Histórico de envios</h2><p>Acompanhe a situação das alterações enviadas para análise.</p></SectionTitle></SectionHeader>{!history.length?<EmptyState icon={<MdHistory/>} title="Nenhum envio realizado" subtitle="Seus lotes aparecerão aqui após o primeiro envio."/>:<HistoryList>{history.map(item=>{const[label,variant]=status(item.status);return <HistoryCard key={item.id}><div><p>Protocolo {item.id.slice(0,8)}</p><small>{new Date(item.createdAt).toLocaleString('pt-BR')} · {item.items.length} item(ns)</small></div><Badge variant={variant}>{label}</Badge></HistoryCard>;})}</HistoryList>}</Section>
 </Page></Shell>;
}

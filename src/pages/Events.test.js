import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { theme } from '../styles/theme';
import eventService from '../services/eventService';
import Events from './Events';
import NewEvent from './NewEvent';
import EventBudgetEditor from './EventBudgetEditor';
import EventProposal from './EventProposal';
import EventDetail from './EventDetail';
import { useApp } from '../context/AppContext';

jest.mock('../services/eventService', () => ({ listEvents: jest.fn(), listCustomers: jest.fn(), createCustomer: jest.fn(), updateCustomer:jest.fn(), createEvent: jest.fn(), getEvent:jest.fn(), updateEvent:jest.fn(), cancelEvent:jest.fn(), listEventBudgets:jest.fn(), listResponsibleUsers:jest.fn(), searchCatalog:jest.fn(), getBudget:jest.fn(), getProposal:jest.fn(), getProposalPdf:jest.fn(), updateBudget:jest.fn(), addBudgetItem:jest.fn(), updateBudgetItem:jest.fn(), deleteBudgetItem:jest.fn(), sendBudget:jest.fn(), approveBudget:jest.fn(), rejectBudget:jest.fn(), createBudgetRevision:jest.fn() }));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));
jest.mock('../context/AppContext', () => ({ useApp: jest.fn() }));

const mount = async element => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  const render = async next => act(async () => root.render(<ThemeProvider theme={theme}>{next}</ThemeProvider>));
  await render(element);
  return { container, rerender: render, cleanup: async () => { await act(async()=>root.unmount()); container.remove(); } };
};
const button = (container, text) => [...container.querySelectorAll('button')].find(node=>node.textContent.includes(text));
const field = (container, text) => [...container.querySelectorAll('label')].find(node=>node.textContent.startsWith(text))?.querySelector('input,select,textarea');

beforeEach(()=>{jest.clearAllMocks();useApp.mockReturnValue({state:{establishment:{id:'est-a'}}});eventService.searchCatalog.mockResolvedValue([]);eventService.listResponsibleUsers.mockResolvedValue([]);});

test('lista eventos e apresenta os principais indicadores comerciais', async () => {
  eventService.listEvents.mockResolvedValue({ items:[{ id:'event-1',code:'EV-2026-ABC',name:'Evento Empresa X',eventDate:'2026-11-15',guestCount:150,status:'BUDGETING',customer:{name:'Empresa X'},budgets:[{status:'DRAFT',quotedPrice:'12000',effectiveMarginPercent:'28'}] }],total:1 });
  const view=await mount(<MemoryRouter><Events/></MemoryRouter>);
  try { await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));}); expect(view.container.textContent).toContain('Evento Empresa X'); expect(view.container.textContent).toContain('Empresa X'); expect(view.container.textContent.replace(/\s/g,'')).toContain('R$12.000,00'); expect([...view.container.querySelectorAll('a')].find(link=>link.textContent==='Abrir').getAttribute('href')).toBe('/events/event-1'); }
  finally { await view.cleanup(); }
});

test('cria cliente no modal, seleciona-o e cria evento com payload normalizado', async () => {
  eventService.listCustomers.mockResolvedValue({items:[],total:0}); eventService.createCustomer.mockResolvedValue({id:'customer-1',name:'Empresa Nova'}); eventService.createEvent.mockResolvedValue({id:'event-1'});
  const view=await mount(<MemoryRouter initialEntries={['/events/new']}><Routes><Route path="/events/new" element={<NewEvent/>}/><Route path="/events" element={<div>Lista de eventos</div>}/></Routes></MemoryRouter>);
  try {
    await act(async()=>button(view.container,'+ Novo cliente').click());
    await act(async()=>Simulate.change(field(view.container,'Nome / razão social'),{target:{value:'Empresa Nova'}}));
    await act(async()=>button(view.container,'Criar cliente').click());
    expect(eventService.createCustomer).toHaveBeenCalledWith(expect.objectContaining({name:'Empresa Nova',email:null}));
    await act(async()=>Simulate.change(field(view.container,'Nome do evento'),{target:{name:'name',value:'Evento Empresa Nova'}}));
    await act(async()=>Simulate.change(field(view.container,'Data'),{target:{name:'eventDate',value:'2026-11-15'}}));
    await act(async()=>Simulate.change(field(view.container,'Número de convidados'),{target:{name:'guestCount',value:'150'}}));
    await act(async()=>Simulate.submit(view.container.querySelector('form')));
    expect(eventService.createEvent).toHaveBeenCalledWith(expect.objectContaining({name:'Evento Empresa Nova',customerId:'customer-1',guestCount:150,startTime:null,endTime:null}));
    expect(view.container.textContent).toContain('Lista de eventos');
  } finally { await view.cleanup(); }
});

test('adiciona item manual ao cardápio pelo editor do orçamento',async()=>{
  const budget={id:'budget-1',revision:1,status:'DRAFT',event:{name:'Evento X',guestCount:100},items:[],costMenu:'0',costStaff:'0',costService:'0',costEquipment:'0',costTransport:'0',costFees:'0',costOther:'0',totalCost:'0'};
  eventService.getBudget.mockResolvedValue(budget);
  eventService.addBudgetItem.mockResolvedValue({...budget,costMenu:'220',totalCost:'220',items:[{id:'item-1',nameSnapshot:'Canapé',costGroup:'MENU',plannedQuantity:'110',unitSnapshot:'un',unitCostSnapshot:'2',totalCost:'220',visibleInProposal:true}]});
  const view=await mount(<MemoryRouter initialEntries={['/events/event-1/budgets/budget-1/edit']}><Routes><Route path="/events/:eventId/budgets/:budgetId/edit" element={<EventBudgetEditor/>}/></Routes></MemoryRouter>);
  try{
    await act(async()=>{});
    await act(async()=>Simulate.change(field(view.container,'Descrição'),{target:{name:'nameSnapshot',value:'Canapé'}}));
    await act(async()=>Simulate.change(field(view.container,'Custo unitário'),{target:{name:'unitCostSnapshot',value:'2'}}));
    await act(async()=>Simulate.submit(view.container.querySelector('form')));
    expect(eventService.addBudgetItem).toHaveBeenCalledWith('budget-1',expect.objectContaining({nameSnapshot:'Canapé',costGroup:'MENU',fixedQuantity:'1'}));
    expect(view.container.textContent).toContain('Canapé');expect(view.container.textContent.replace(/\s/g,'')).toContain('R$220,00');
  }finally{await view.cleanup();}
});

test('seleciona ficha do catálogo e envia sua origem para criar o snapshot',async()=>{
  const budget={id:'budget-1',revision:1,status:'DRAFT',event:{name:'Evento X',guestCount:100},items:[],costMenu:'0',costStaff:'0',costService:'0',costEquipment:'0',costTransport:'0',costFees:'0',costOther:'0',totalCost:'0'};
  const recipe={itemType:'RECIPE',sourceId:'recipe-product-1',nameSnapshot:'Drink da casa',unitSnapshot:'porção',unitCostSnapshot:'7.5',hasCostWarning:false,compositionSnapshot:{components:[{productId:'ingredient-1',name:'Gin',quantity:'0.05',unit:'L',unitCost:'80',totalCost:'4'}]}};
  eventService.getBudget.mockResolvedValue(budget);eventService.searchCatalog.mockResolvedValue([recipe]);eventService.addBudgetItem.mockResolvedValue(budget);
  const view=await mount(<MemoryRouter initialEntries={['/events/event-1/budgets/budget-1/edit']}><Routes><Route path="/events/:eventId/budgets/:budgetId/edit" element={<EventBudgetEditor/>}/></Routes></MemoryRouter>);
  try{
    await act(async()=>{});
    await act(async()=>Simulate.change(field(view.container,'Origem'),{target:{value:'RECIPE:recipe-product-1'}}));
    expect(view.container.textContent).toContain('Gin');expect(view.container.textContent).toContain('Ver composição');
    await act(async()=>Simulate.submit(view.container.querySelector('form')));
    expect(eventService.addBudgetItem).toHaveBeenCalledWith('budget-1',expect.objectContaining({itemType:'RECIPE',sourceId:'recipe-product-1',nameSnapshot:'Drink da casa',unitCostSnapshot:'7.5'}));
  }finally{await view.cleanup();}
});

test('salva premissas e exibe indicadores persistidos da precificação',async()=>{
  const budget={id:'budget-1',revision:1,status:'DRAFT',event:{name:'Evento X',guestCount:100},items:[],desiredMarginPercent:'30',taxPercent:'0',commissionPercent:'0',cardFeePercent:'0',otherFeePercent:'0',quotedPrice:null,recommendedPrice:'10000',costMenu:'4000',costStaff:'1000',costService:'0',costEquipment:'0',costTransport:'0',costFees:'0',costOther:'0',totalCost:'5000',costPerGuest:'50',qualityChecklist:[]};
  const updated={...budget,taxPercent:'7',quotedPrice:'9000',expectedFeeAmount:'630',expectedProfit:'3370',effectiveMarginPercent:'37.4444',menuCMVPercent:'44.4444',pricePerGuest:'90',profitPerGuest:'33.7',pricingWarnings:['MARGIN_BELOW_TARGET']};
  eventService.getBudget.mockResolvedValue(budget);eventService.updateBudget.mockResolvedValue(updated);
  const view=await mount(<MemoryRouter initialEntries={['/events/event-1/budgets/budget-1/edit']}><Routes><Route path="/events/:eventId/budgets/:budgetId/edit" element={<EventBudgetEditor/>}/></Routes></MemoryRouter>);
  try{await act(async()=>{});await act(async()=>button(view.container,'Precificação').click());await act(async()=>Simulate.change(field(view.container,'Impostos'),{target:{name:'taxPercent',value:'7'}}));await act(async()=>Simulate.change(field(view.container,'Preço do orçamento'),{target:{name:'quotedPrice',value:'9000'}}));await act(async()=>Simulate.submit(view.container.querySelector('form')));expect(eventService.updateBudget).toHaveBeenCalledWith('budget-1',expect.objectContaining({desiredMarginPercent:'30',taxPercent:'7',quotedPrice:'9000'}));expect(view.container.textContent.replace(/\s/g,'')).toContain('R$3.370,00');expect(view.container.textContent).toContain('margem abaixo da meta');}finally{await view.cleanup();}
});

test('proposta mostra somente o DTO público devolvido pela API',async()=>{
  eventService.getProposal.mockResolvedValue({budgetId:'budget-1',revision:1,status:'DRAFT',customer:{name:'Cliente X'},event:{name:'Evento X',eventDate:'2026-11-15',startTime:'19:00',endTime:'23:00',guestCount:100,location:'Salão'},items:[{id:'item-1',name:'Canapé',costGroup:'MENU',quantity:'100',unit:'un'}],value:'9000',pricePerGuest:'90',validUntil:'2026-10-20',notes:'Condições comerciais.'});
  const view=await mount(<MemoryRouter initialEntries={['/events/event-1/budgets/budget-1/proposal']}><Routes><Route path="/events/:eventId/budgets/:budgetId/proposal" element={<EventProposal/>}/></Routes></MemoryRouter>);
  try{await act(async()=>{});expect(view.container.textContent).toContain('Cliente X');expect(view.container.textContent).toContain('Canapé');expect(view.container.textContent.replace(/\s/g,'')).toContain('R$9.000,00');expect(view.container.textContent).not.toContain('Custo unitário');expect(view.container.textContent).not.toContain('Lucro previsto');}finally{await view.cleanup();}
});

test('envia orçamento pronto e troca a revisão para somente leitura',async()=>{
  const budget={id:'budget-1',revision:1,status:'DRAFT',event:{name:'Evento X',guestCount:100,customer:{name:'Cliente X'}},items:[],costMenu:'4000',costStaff:'1000',costService:'0',costEquipment:'0',costTransport:'0',costFees:'0',costOther:'0',totalCost:'5000',quotedPrice:'9000',expectedProfit:'4000',readyToSend:true,readyForProposal:true,qualityChecklist:[]};
  eventService.getBudget.mockResolvedValue(budget);eventService.sendBudget.mockResolvedValue({...budget,status:'SENT'});
  const view=await mount(<MemoryRouter initialEntries={['/events/event-1/budgets/budget-1/edit']}><Routes><Route path="/events/:eventId/budgets/:budgetId/edit" element={<EventBudgetEditor/>}/></Routes></MemoryRouter>);
  try{await act(async()=>{});await act(async()=>button(view.container,'Resumo').click());await act(async()=>button(view.container,'Marcar como enviada').click());expect(eventService.sendBudget).toHaveBeenCalledWith('budget-1');expect(view.container.textContent).toContain('SENT');expect(button(view.container,'Aprovar')).toBeTruthy();}finally{await view.cleanup();}
});

test('trocar estabelecimento com editor aberto limpa e recarrega o orçamento',async()=>{
  const first={id:'budget-1',revision:1,status:'DRAFT',event:{name:'Evento A',guestCount:100},items:[],costMenu:'0',costStaff:'0',costService:'0',costEquipment:'0',costTransport:'0',costFees:'0',costOther:'0',totalCost:'0'};
  const second={...first,event:{name:'Evento B',guestCount:80}};
  eventService.getBudget.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const page=()=> <MemoryRouter initialEntries={['/events/event-1/budgets/budget-1/edit']}><Routes><Route path="/events/:eventId/budgets/:budgetId/edit" element={<EventBudgetEditor/>}/></Routes></MemoryRouter>;
  const view=await mount(page());
  try{await act(async()=>{});expect(view.container.textContent).toContain('Evento A');useApp.mockReturnValue({state:{establishment:{id:'est-b'}}});await view.rerender(page());await act(async()=>{});expect(eventService.getBudget).toHaveBeenCalledTimes(2);expect(view.container.textContent).toContain('Evento B');expect(view.container.textContent).not.toContain('Evento A');}finally{await view.cleanup();}
});

test('editor mostra erro e permite tentar carregar o orçamento novamente',async()=>{
  const budget={id:'budget-1',revision:1,status:'DRAFT',event:{name:'Evento recuperado',guestCount:20},items:[],costMenu:'0',costStaff:'0',costService:'0',costEquipment:'0',costTransport:'0',costFees:'0',costOther:'0',totalCost:'0'};
  eventService.getBudget.mockRejectedValueOnce(new Error('Orçamento indisponível.')).mockResolvedValueOnce(budget);
  const view=await mount(<MemoryRouter initialEntries={['/events/event-1/budgets/budget-1/edit']}><Routes><Route path="/events/:eventId/budgets/:budgetId/edit" element={<EventBudgetEditor/>}/></Routes></MemoryRouter>);
  try{await act(async()=>{});expect(view.container.textContent).toContain('Não foi possível carregar o orçamento');expect(view.container.textContent).not.toContain('Carregando orçamento');await act(async()=>button(view.container,'Tentar novamente').click());await act(async()=>{});expect(eventService.getBudget).toHaveBeenCalledTimes(2);expect(view.container.textContent).toContain('Evento recuperado');}finally{await view.cleanup();}
});

test('novo evento informa falha ao carregar clientes e oferece nova tentativa',async()=>{
  eventService.listCustomers.mockRejectedValueOnce(new Error('Clientes indisponíveis.')).mockResolvedValueOnce({items:[{id:'customer-1',name:'Cliente recuperado'}]});
  const view=await mount(<MemoryRouter initialEntries={['/events/new']}><Routes><Route path="/events/new" element={<NewEvent/>}/></Routes></MemoryRouter>);
  try{await act(async()=>{});expect(view.container.textContent).toContain('Não foi possível carregar os clientes');await act(async()=>button(view.container,'Tentar novamente').click());await act(async()=>{});expect(eventService.listCustomers).toHaveBeenCalledTimes(2);expect(view.container.textContent).toContain('Cliente recuperado');}finally{await view.cleanup();}
});

test('lista permite navegar entre paginas e filtrar por periodo',async()=>{
  eventService.listEvents.mockResolvedValue({items:[{id:'event-1',code:'EV-1',name:'Evento',eventDate:'2026-11-15',guestCount:10,status:'BUDGETING',customer:{name:'Cliente'},budgets:[]}],total:25});
  const view=await mount(<MemoryRouter><Events/></MemoryRouter>);
  try{
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
    const dateInputs=view.container.querySelectorAll('input[type="date"]');
    await act(async()=>Simulate.change(dateInputs[0],{target:{value:'2026-11-01'}}));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
    expect(eventService.listEvents).toHaveBeenLastCalledWith(expect.objectContaining({dateFrom:'2026-11-01',page:1,pageSize:20}));
    await act(async()=>button(view.container,'Próxima').click());
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
    expect(eventService.listEvents).toHaveBeenLastCalledWith(expect.objectContaining({page:2}));
  }finally{await view.cleanup();}
});

test('novo evento permite selecionar responsavel e editar o cliente escolhido',async()=>{
  eventService.listCustomers.mockResolvedValue({items:[{id:'customer-1',name:'Cliente Antigo',email:'old@example.com'}],total:1});
  eventService.listResponsibleUsers.mockResolvedValue([{id:'user-1',name:'Ana',role:'MANAGER'}]);
  eventService.updateCustomer.mockResolvedValue({id:'customer-1',name:'Cliente Atualizado',email:'old@example.com'});
  const view=await mount(<MemoryRouter initialEntries={['/events/new']}><Routes><Route path="/events/new" element={<NewEvent/>}/></Routes></MemoryRouter>);
  try{
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
    await act(async()=>Simulate.change(view.container.querySelector('select[name="customerId"]'),{target:{name:'customerId',value:'customer-1'}}));
    await act(async()=>Simulate.change(view.container.querySelector('select[name="responsibleUserId"]'),{target:{name:'responsibleUserId',value:'user-1'}}));
    await act(async()=>button(view.container,'Editar cliente').click());
    await act(async()=>Simulate.change(field(view.container,'Nome / razão social'),{target:{value:'Cliente Atualizado'}}));
    await act(async()=>button(view.container,'Salvar cliente').click());
    expect(eventService.updateCustomer).toHaveBeenCalledWith('customer-1',expect.objectContaining({name:'Cliente Atualizado'}));
    expect(view.container.querySelector('select[name="responsibleUserId"]').value).toBe('user-1');
  }finally{await view.cleanup();}
});

test('detalhe mostra historico comercial e permite editar o evento',async()=>{
  const event={id:'event-1',code:'EV-2026-1',name:'Evento Original',type:'CORPORATE',eventDate:'2026-11-15',startTime:'19:00',endTime:'23:00',guestCount:100,location:'Salão',status:'BUDGETING',customerId:'customer-1',customer:{id:'customer-1',name:'Cliente X'},responsibleUserId:'user-1',responsibleUser:{id:'user-1',name:'Ana'}};
  const budgets=[{id:'budget-1',revision:1,status:'DRAFT',quotedPrice:'9000',createdByUser:{name:'Ana'},sentAt:'2026-10-20T12:00:00.000Z',approvedAt:null}];
  eventService.getEvent.mockResolvedValue(event);eventService.listEventBudgets.mockResolvedValue(budgets);eventService.listCustomers.mockResolvedValue({items:[event.customer],total:1});eventService.listResponsibleUsers.mockResolvedValue([{id:'user-1',name:'Ana',role:'MANAGER'}]);eventService.updateEvent.mockResolvedValue({...event,name:'Evento Atualizado'});
  const view=await mount(<MemoryRouter initialEntries={['/events/event-1']}><Routes><Route path="/events/:id" element={<EventDetail/>}/></Routes></MemoryRouter>);
  try{
    await act(async()=>{});
    expect(view.container.textContent).toContain('R$ 9.000,00');expect(view.container.textContent).toContain('Criada por');expect(view.container.textContent).toContain('Ana');
    await act(async()=>button(view.container,'Editar evento').click());
    await act(async()=>Simulate.change(field(view.container,'Nome'),{target:{name:'name',value:'Evento Atualizado'}}));
    await act(async()=>Simulate.submit(view.container.querySelector('form')));
    expect(eventService.updateEvent).toHaveBeenCalledWith('event-1',expect.objectContaining({name:'Evento Atualizado',responsibleUserId:'user-1'}));
  }finally{await view.cleanup();}
});

test('detalhe confirma e cancela o evento',async()=>{
  const event={id:'event-1',code:'EV-1',name:'Evento',type:'CORPORATE',eventDate:'2026-11-15',guestCount:10,status:'BUDGETING',customer:{id:'customer-1',name:'Cliente'}};
  eventService.getEvent.mockResolvedValueOnce(event).mockResolvedValueOnce({...event,status:'CANCELLED'});eventService.listEventBudgets.mockResolvedValue([]);eventService.listCustomers.mockResolvedValue({items:[event.customer],total:1});eventService.cancelEvent.mockResolvedValue({...event,status:'CANCELLED'});
  const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);
  const view=await mount(<MemoryRouter initialEntries={['/events/event-1']}><Routes><Route path="/events/:id" element={<EventDetail/>}/></Routes></MemoryRouter>);
  try{await act(async()=>{});await act(async()=>button(view.container,'Cancelar evento').click());expect(eventService.cancelEvent).toHaveBeenCalledWith('event-1');expect(view.container.textContent).toContain('CANCELLED');}
  finally{confirm.mockRestore();await view.cleanup();}
});

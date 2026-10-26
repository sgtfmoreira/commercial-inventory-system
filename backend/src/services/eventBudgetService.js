const prisma = require('../utils/prisma');
const repository = require('../repositories/commercialEventRepository');
const AppError = require('../utils/AppError');
const { calculatePlannedQuantity, calculateItemTotal, calculateBudgetPricing } = require('./eventPricingService');
const eventCatalogService = require('./eventCatalogService');

const ensureDraft = budget => { if (budget.status !== 'DRAFT') throw new AppError('Somente orçamentos em rascunho podem ser alterados.', 409); };
const nullable = value => value == null || value === '' ? null : value;
const pricingData = result => ({
    costMenu:result.costMenu,costStaff:result.costStaff,costService:result.costService,costEquipment:result.costEquipment,
    costTransport:result.costTransport,costFees:result.costFees,costOther:result.costOther,totalCost:result.totalCost,
    recommendedPrice:result.recommendedPrice,expectedRevenue:result.quotedPrice,expectedFeeAmount:result.expectedFeeAmount,
    expectedProfit:result.expectedProfit,effectiveMarginPercent:result.effectiveMarginPercent,menuCMVPercent:result.menuCMVPercent,
    pricePerGuest:result.pricePerGuest,costPerGuest:result.costPerGuest,profitPerGuest:result.profitPerGuest,
    calculationVersion:result.calculationVersion
});
const dateText = value => value instanceof Date ? value.toISOString().slice(0,10) : typeof value==='string' ? value.slice(0,10) : null;
const timeText = value => value instanceof Date ? value.toISOString().slice(11,16) : typeof value==='string' ? (value.includes('T')?value.slice(11,16):value.slice(0,5)) : null;
const quality = budget => {
    const items=budget.items||[];
    const zeroCostItems=items.filter(item=>Number(item.unitCostSnapshot)<=0);
    const checklist=[
        {code:'HAS_MENU_ITEM',label:'Cardápio possui ao menos um item',passed:items.some(item=>item.costGroup==='MENU'),blocking:true},
        {code:'HAS_VISIBLE_ITEM',label:'Proposta possui ao menos um item visível',passed:items.some(item=>item.visibleInProposal),blocking:true},
        {code:'HAS_QUOTED_PRICE',label:'Preço do orçamento foi informado',passed:budget.quotedPrice!=null&&Number(budget.quotedPrice)>0,blocking:true},
        {code:'NO_ZERO_COST_ITEMS',label:'Todos os itens possuem custo',passed:zeroCostItems.length===0,blocking:true}
    ];
    return{
        qualityChecklist:checklist,
        qualityWarnings:zeroCostItems.map(item=>({code:'ZERO_COST_ITEM',itemId:item.id,name:item.nameSnapshot})),
        readyForProposal:checklist.filter(item=>item.code!=='NO_ZERO_COST_ITEMS').every(item=>item.passed),
        readyToSend:checklist.every(item=>item.passed)
    };
};
const decorateBudget = budget => {
    const pricing=calculateBudgetPricing({items:budget.items||[],desiredMarginPercent:budget.desiredMarginPercent,
        taxPercent:budget.taxPercent,commissionPercent:budget.commissionPercent,cardFeePercent:budget.cardFeePercent,
        otherFeePercent:budget.otherFeePercent,quotedPrice:budget.quotedPrice,guestCount:budget.event.guestCount});
    return{...budget,...quality(budget),pricingWarnings:pricing.warnings};
};
const proposalDto = budget => {
    const customer=budget.customerSnapshot||budget.event.customer||{};
    const event=budget.eventSnapshot||budget.event;
    return{
        budgetId:budget.id,revision:budget.revision,status:budget.status,
        customer:{name:customer.name||null,document:customer.document||null},
        event:{name:event.name,type:event.type,eventDate:dateText(event.eventDate),startTime:timeText(event.startTime),
            endTime:timeText(event.endTime),guestCount:event.guestCount||budget.guestCountSnapshot,location:event.location||null},
        items:(budget.items||[]).filter(item=>item.visibleInProposal).map(item=>({
            id:item.id,name:item.proposalLabel||item.nameSnapshot,costGroup:item.costGroup,
            quantity:item.plannedQuantity.toString(),unit:item.unitSnapshot
        })),
        value:budget.quotedPrice?.toString()||null,pricePerGuest:budget.pricePerGuest?.toString()||null,
        validUntil:dateText(budget.validUntil),notes:budget.customerProposalNotes||null
    };
};

async function getBudget(id, establishmentId, client) {
    const budget = await repository.findBudget(id, establishmentId, client);
    if (!budget) throw new AppError('Orçamento não encontrado.', 404);
    return budget;
}

async function recalculate(id, establishmentId, client) {
    let budget = await getBudget(id, establishmentId, client);
    const guestCount = budget.event.guestCount;
    for (const item of budget.items) {
        const plannedQuantity = calculatePlannedQuantity({
            quantityMode:item.quantityMode,fixedQuantity:item.fixedQuantity,quantityPerGuest:item.quantityPerGuest,
            guestCount,safetyPercent:item.safetyPercent
        });
        const totalCost = calculateItemTotal({ plannedQuantity, unitCost:item.unitCostSnapshot });
        if (!plannedQuantity.equals(item.plannedQuantity) || !totalCost.equals(item.totalCost) || item.guestCountSnapshot !== guestCount) {
            await repository.updateBudgetItem(item.id, { plannedQuantity,totalCost,guestCountSnapshot:guestCount }, client);
        }
        item.plannedQuantity=plannedQuantity; item.totalCost=totalCost; item.guestCountSnapshot=guestCount;
    }
    const result=calculateBudgetPricing({items:budget.items,desiredMarginPercent:budget.desiredMarginPercent,taxPercent:budget.taxPercent,
        commissionPercent:budget.commissionPercent,cardFeePercent:budget.cardFeePercent,otherFeePercent:budget.otherFeePercent,
        quotedPrice:budget.quotedPrice,guestCount});
    await repository.updateBudget(id, { guestCountSnapshot:guestCount,...pricingData(result) }, client);
    budget = await getBudget(id, establishmentId, client);
    return { ...decorateBudget(budget), warnings:result.warnings };
}

const service = {
    getById: async (id, establishmentId) => decorateBudget(await getBudget(id, establishmentId)),
    getProposal: async (id, establishmentId) => proposalDto(await getBudget(id, establishmentId)),
    update(id, input, establishmentId) {
        return prisma.$transaction(async tx => {
            const budget=await getBudget(id,establishmentId,tx); ensureDraft(budget);
            const percentageFields=['desiredMarginPercent','taxPercent','commissionPercent','cardFeePercent','otherFeePercent'];
            const percentageTotal=percentageFields.reduce((sum,field)=>sum+Number(input[field]??budget[field]??0),0);
            if(percentageTotal>=100) throw new AppError('A soma de margem e encargos deve ser menor que 100%.',422);
            const data={};
            for(const field of ['desiredMarginPercent','taxPercent','commissionPercent','cardFeePercent','otherFeePercent','quotedPrice','validUntil','customerProposalNotes','internalNotes']) {
                if(input[field]!==undefined) data[field]=nullable(input[field]);
            }
            if(data.validUntil) data.validUntil=new Date(`${data.validUntil}T00:00:00.000Z`);
            await repository.updateBudget(id,data,tx); return recalculate(id,establishmentId,tx);
        });
    },
    recalculate(id, establishmentId) { return prisma.$transaction(tx=>recalculate(id,establishmentId,tx)); },
    addItem(budgetId,input,establishmentId) {
        return prisma.$transaction(async tx=>{
            const budget=await getBudget(budgetId,establishmentId,tx); ensureDraft(budget);
            let itemData=input;
            if(['PRODUCT','RECIPE'].includes(input.itemType)){
                const source=await eventCatalogService.resolveSnapshot(input.sourceId,input.itemType,establishmentId,tx);
                itemData={...input,...source};delete itemData.hasCostWarning;
            }
            const plannedQuantity=calculatePlannedQuantity({...itemData,guestCount:budget.event.guestCount});
            const totalCost=calculateItemTotal({plannedQuantity,unitCost:itemData.unitCostSnapshot});
            await repository.createBudgetItem({...itemData,budgetId,guestCountSnapshot:budget.event.guestCount,plannedQuantity,totalCost,
                fixedQuantity:nullable(itemData.fixedQuantity),quantityPerGuest:nullable(itemData.quantityPerGuest),sourceId:nullable(itemData.sourceId),
                suggestedUnitPriceSnapshot:nullable(itemData.suggestedUnitPriceSnapshot)},tx);
            return recalculate(budgetId,establishmentId,tx);
        });
    },
    updateItem(itemId,input,establishmentId) {
        return prisma.$transaction(async tx=>{
            const existing=await repository.findBudgetItem(itemId,establishmentId,tx);
            if(!existing) throw new AppError('Item do orçamento não encontrado.',404); ensureDraft(existing.budget);
            const sourceFields=['itemType','sourceId','sourceType','nameSnapshot','categorySnapshot','unitSnapshot','unitCostSnapshot','suggestedUnitPriceSnapshot','compositionSnapshot','sourceSnapshot'];
            const itemData={...input};if(['PRODUCT','RECIPE'].includes(existing.itemType))sourceFields.forEach(field=>{itemData[field]=existing[field];});
            const plannedQuantity=calculatePlannedQuantity({...itemData,guestCount:existing.budget.event.guestCount});
            const totalCost=calculateItemTotal({plannedQuantity,unitCost:itemData.unitCostSnapshot});
            await repository.updateBudgetItem(itemId,{...itemData,guestCountSnapshot:existing.budget.event.guestCount,plannedQuantity,totalCost,
                fixedQuantity:nullable(itemData.fixedQuantity),quantityPerGuest:nullable(itemData.quantityPerGuest),sourceId:nullable(itemData.sourceId),
                suggestedUnitPriceSnapshot:nullable(itemData.suggestedUnitPriceSnapshot)},tx);
            return recalculate(existing.budgetId,establishmentId,tx);
        });
    },
    removeItem(itemId,establishmentId) {
        return prisma.$transaction(async tx=>{const existing=await repository.findBudgetItem(itemId,establishmentId,tx);
            if(!existing) throw new AppError('Item do orçamento não encontrado.',404); ensureDraft(existing.budget);
            await repository.deleteBudgetItem(itemId,tx); return recalculate(existing.budgetId,establishmentId,tx);});
    }
};

module.exports={...service,recalculateBudget:recalculate,getBudget};

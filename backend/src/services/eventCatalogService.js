const {Prisma}=require('@prisma/client');const repository=require('../repositories/commercialEventRepository');const AppError=require('../utils/AppError');
const D=value=>new Prisma.Decimal(value||0);const round=value=>value.toDecimalPlaces(4,Prisma.Decimal.ROUND_HALF_UP);
function baseCost(product){if(D(product.currentCost).greaterThan(0))return{unitCost:round(D(product.currentCost)),costSource:'CURRENT_COST'};const pack=D(product.packQuantity||1);if(D(product.unitPrice).greaterThan(0)&&pack.greaterThan(0))return{unitCost:round(D(product.unitPrice).div(pack)),costSource:'UNIT_PRICE_PER_PACK'};return{unitCost:D(0),costSource:'MISSING'};}
function snapshotProduct(product,itemType){
  let resolved=baseCost(product);let compositionSnapshot=null;
  if(itemType==='RECIPE'){
    if(!product.Recipe)throw new AppError('Ficha técnica não encontrada para este produto.',422);
    const components=product.Recipe.items.map(item=>{const cost=baseCost(item.product);const total=round(D(item.quantity).times(cost.unitCost));return{productId:item.product.id,name:item.product.name,quantity:String(item.quantity),unit:item.product.unit,unitCost:cost.unitCost.toString(),totalCost:total.toString(),costSource:cost.costSource};});
    const total=components.reduce((sum,item)=>sum.plus(item.totalCost),D(0));const yieldQuantity=D(product.Recipe.yieldQuantity||1);
    resolved={unitCost:yieldQuantity.greaterThan(0)?round(total.div(yieldQuantity)):D(0),costSource:'RECIPE_COMPONENTS'};
    compositionSnapshot={recipeId:product.Recipe.id,yieldQuantity:yieldQuantity.toString(),capturedAt:new Date().toISOString(),components};
  }
  return{itemType,sourceId:product.id,sourceType:itemType,nameSnapshot:product.name,categorySnapshot:product.category?.name||null,unitSnapshot:product.unit,unitCostSnapshot:resolved.unitCost,suggestedUnitPriceSnapshot:product.salePrice||null,compositionSnapshot,sourceSnapshot:{productId:product.id,productType:product.type,costSource:resolved.costSource,currentCost:product.currentCost?.toString()||null,unitPrice:product.unitPrice?.toString()||null,packQuantity:String(product.packQuantity||1),capturedAt:new Date().toISOString()},hasCostWarning:resolved.unitCost.lessThanOrEqualTo(0)};
}
async function resolveSnapshot(sourceId,itemType,establishmentId,client){if(!['PRODUCT','RECIPE'].includes(itemType))throw new AppError('Tipo de origem inválido.',422);const product=await repository.findCatalogProduct(sourceId,establishmentId,client);if(!product)throw new AppError('Produto ou ficha não pertence a este estabelecimento.',404);return snapshotProduct(product,itemType);}
async function list(establishmentId,filters){const products=await repository.listCatalogProducts(establishmentId,filters);return products.flatMap(product=>{const result=[snapshotProduct(product,'PRODUCT')];if(product.Recipe)result.push(snapshotProduct(product,'RECIPE'));return result;});}
module.exports={baseCost,snapshotProduct,resolveSnapshot,list};

export const getPortioningSourceProducts = (products = []) =>
    products.filter(product => product.type === 'INVENTORY' && product.isActive !== false);

export const getPortioningTargetProducts = (products = []) =>
    products.filter(product => product.type !== 'ASSET' && product.isActive !== false);

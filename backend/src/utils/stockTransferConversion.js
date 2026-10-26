const DISCRETE_UNITS = new Set(['un', 'und', 'unid', 'unidade', 'unidades']);

const normalizeUnit = (value) => {
    const normalized = String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    return DISCRETE_UNITS.has(normalized) ? 'unidade' : normalized;
};

const positiveNumber = (value, field) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${field} deve ser maior que zero.`);
    }
    return parsed;
};

const roundQuantity = (value) => Number(value.toFixed(6));

const calculateTransferConversion = ({ sourceProduct, destinationProduct, quantity }) => {
    const sourceQuantity = positiveNumber(quantity, 'Quantidade');
    const sourceUnit = String(sourceProduct?.unit || '').trim();
    const destinationUnit = String(destinationProduct?.unit || '').trim();

    if (!sourceUnit || !destinationUnit) {
        throw new Error('Origem e destino precisam ter unidade cadastrada.');
    }

    const sourcePackQuantity = positiveNumber(sourceProduct.packQuantity ?? 1, 'Fator de embalagem da origem');
    const destinationPackQuantity = positiveNumber(destinationProduct.packQuantity ?? 1, 'Fator de embalagem do destino');
    let destinationQuantity;
    let mode;

    if (normalizeUnit(sourceUnit) === normalizeUnit(destinationUnit)) {
        destinationQuantity = sourceQuantity;
        mode = 'SAME_UNIT';
    } else {
        const sourcePurchaseUnit = normalizeUnit(sourceProduct.purchaseUnit);
        const destinationPurchaseUnit = normalizeUnit(destinationProduct.purchaseUnit);

        if (!sourcePurchaseUnit || sourcePurchaseUnit !== destinationPurchaseUnit) {
            throw new Error(
                `Unidades incompativeis: origem em ${sourceUnit} e destino em ${destinationUnit}. ` +
                'Cadastre a mesma unidade comercial nos dois produtos para permitir a conversao.'
            );
        }

        destinationQuantity = roundQuantity(
            (sourceQuantity / sourcePackQuantity) * destinationPackQuantity
        );
        mode = 'PACKAGE';
    }

    if (!Number.isFinite(destinationQuantity) || destinationQuantity <= 0) {
        throw new Error('A conversao resultou em uma quantidade de destino invalida.');
    }

    if (DISCRETE_UNITS.has(normalizeUnit(destinationUnit)) && !Number.isInteger(destinationQuantity)) {
        throw new Error(
            `A quantidade informada equivale a ${destinationQuantity} ${destinationUnit}. ` +
            'O destino aceita apenas unidades inteiras.'
        );
    }

    return {
        sourceQuantity,
        destinationQuantity,
        conversionFactor: roundQuantity(destinationQuantity / sourceQuantity),
        sourceUnit,
        destinationUnit,
        sourcePackQuantity,
        destinationPackQuantity,
        mode
    };
};

module.exports = { calculateTransferConversion, normalizeUnit };

import { getPortioningSourceProducts, getPortioningTargetProducts } from './portioningProducts';

describe('portioning product options', () => {
    const products = [
        { id: 'file', name: 'FILÉ MIGNON', type: 'INVENTORY', isActive: true },
        { id: 'escalope', name: 'ESCALOPE', type: 'PRODUCTION', isActive: true },
        { id: 'iscas', name: 'ISCAS DE FILÉ MIGNON', type: 'INVENTORY', isActive: true },
        { id: 'forno', name: 'FORNO', type: 'ASSET', isActive: true },
        { id: 'inativo', name: 'CORTE INATIVO', type: 'PRODUCTION', isActive: false },
    ];

    test('oferece somente insumos ativos como produto inteiro', () => {
        expect(getPortioningSourceProducts(products).map(product => product.id)).toEqual([
            'file',
            'iscas',
        ]);
    });

    test('oferece produtos de producao ativos como cortes resultantes', () => {
        expect(getPortioningTargetProducts(products).map(product => product.id)).toEqual([
            'file',
            'escalope',
            'iscas',
        ]);
    });
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { ThemeProvider } from 'styled-components';
import { theme } from '../styles/theme';
import StockMovement from './StockMovement';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';

jest.mock('../services/api', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));
jest.mock('../context/AppContext', () => ({
    useApp: jest.fn(() => ({
        state: { products: [
            { id: 'drink', name: 'Bebida da equipe', type: 'INVENTORY', purchaseClassification: 'CMV_BEVERAGES', quantity: 20, packQuantity: 6, defaultLocationId: 'loc' },
            { id: 'soap', name: 'Detergente', type: 'INVENTORY', purchaseClassification: 'CLEANING', quantity: 20 }
        ] },
        fetchAllData: jest.fn()
    }))
}));
jest.mock('../components/Select', () => ({ label, value, onChange, options }) => (
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
));

const defaultAppContext = () => ({
    state: { products: [
        { id: 'drink', name: 'Bebida da equipe', type: 'INVENTORY', purchaseClassification: 'CMV_BEVERAGES', quantity: 20, packQuantity: 6, defaultLocationId: 'loc' },
        { id: 'soap', name: 'Detergente', type: 'INVENTORY', purchaseClassification: 'CLEANING', quantity: 20 }
    ] },
    fetchAllData: jest.fn()
});

beforeEach(() => {
    useApp.mockReturnValue(defaultAppContext());
});

test('trocar estabelecimento limpa o local anterior e descarta respostas atrasadas', async () => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const original = useApp.getMockImplementation();
    const context = id => ({ state: { products: [], establishment: { id } }, fetchAllData: jest.fn() });
    let resolveOld;
    api.get.mockReset();
    api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
        .mockResolvedValueOnce([{ id: 'park-location', name: 'Park' }]);
    useApp.mockReturnValue(context('lights'));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
        const render = () => root.render(<ThemeProvider theme={theme}><StockMovement /></ThemeProvider>);
        await act(async () => render());
        useApp.mockReturnValue(context('park'));
        await act(async () => render());
        await act(async () => resolveOld([{ id: 'lights-location', name: 'Lights' }]));
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(container.querySelector('option[value="park-location"]')).not.toBeNull();
        expect(container.querySelector('option[value="lights-location"]')).toBeNull();
        const select = container.querySelector('option[value="park-location"]').parentElement;
        await act(async () => Simulate.change(select, { target: { value: 'park-location' } }));
        expect(select.value).toBe('park-location');
        api.get.mockResolvedValue([{ id: 'lights-location', name: 'Lights' }]);
        useApp.mockReturnValue(context('lights'));
        await act(async () => render());
        expect(select.value).toBe('');
        expect(container.querySelector('option[value="park-location"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        container.remove();
        useApp.mockImplementation(original);
        api.get.mockReset();
    }
});

test('consumo operacional permanece na movimentação e baixa produtos em unidades de estoque', async () => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    api.get.mockResolvedValue([{ id: 'loc', name: 'Bar', isDefault: true }]);
    api.post.mockResolvedValue({ success: true });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const clickButton = text => act(async () => {
        [...container.querySelectorAll('button')].find(button => button.textContent.includes(text)).click();
    });
    try {
        await act(async () => root.render(<ThemeProvider theme={theme}><StockMovement /></ThemeProvider>));
        await clickButton('Consumo Operacional');
        expect(container.textContent).toContain('Saída de produtos consumidos pela equipe');
        expect(container.textContent).not.toContain('Detergente');
        await act(async () => Simulate.change(container.querySelector('select'), { target: { value: 'drink' } }));
        await act(async () => Simulate.change(container.querySelector('input[type="number"]'), { target: { value: '4' } }));
        await clickButton('Confirmar Movimentação');
        expect(api.post).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith('Estoque insuficiente no sistema');
        await act(async () => Simulate.change(container.querySelector('input[type="number"]'), { target: { value: '2' } }));
        await clickButton('Confirmar Movimentação');
        expect(api.post).toHaveBeenCalledWith('/stock-movements/beverage-operational-use', {
            productId: 'drink', quantity: 12, locationId: 'loc'
        });
        expect(toast.success).toHaveBeenCalledWith('Movimentação realizada com sucesso');
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

test('devolução usa unidades de estoque, mostra custo original e repete requestId após falha', async () => {
    jest.clearAllMocks();
    global.IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => 'request-id') } });
    api.get.mockImplementation(url => {
        if (url === '/stock-locations') return Promise.resolve([{ id: 'loc', name: 'Bar', isDefault: true }]);
        if (url.startsWith('/stock-movements/return-receipts')) return Promise.resolve([{
            id: 'receipt', purchaseOrderId: 'order-123456', supplierName: 'Fornecedor original',
            completedAt: '2026-08-01T15:00:00Z', receivedQuantity: 20, returnedQuantity: 0,
            remainingQuantity: 20, unit: 'un', unitCost: 10
        }]);
        return Promise.resolve([]);
    });
    api.post.mockRejectedValueOnce(new Error('Conexão interrompida')).mockResolvedValueOnce({ id: 'return' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const changeField = (label, value) => act(async () => {
        const node = [...container.querySelectorAll('label')].find(element => element.textContent.startsWith(label));
        Simulate.change(node.querySelector('select, input, textarea'), { target: { value } });
    });
    try {
        await act(async () => root.render(<ThemeProvider theme={theme}><StockMovement /></ThemeProvider>));
        await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent.includes('Devolução ao fornecedor')).click());
        await changeField('Produto devolvido', 'drink');
        await changeField('Compra original', 'receipt');
        await changeField('Quantidade devolvida', '8');
        await changeField('Data da devolução', '2026-09-01');
        expect(container.textContent).toContain('Fornecedor original');
        expect(container.textContent.replace(/\s/g, '')).toContain('R$80,00');
        await act(async () => Simulate.submit(container.querySelector('form')));
        expect(toast.error).toHaveBeenCalledWith('Conexão interrompida');
        await act(async () => Simulate.submit(container.querySelector('form')));
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(api.post.mock.calls[0][1]).toEqual(api.post.mock.calls[1][1]);
        expect(api.post).toHaveBeenLastCalledWith('/stock-movements/supplier-returns', expect.objectContaining({
            purchaseOrderItemId: 'receipt', locationId: 'loc', quantity: 8,
            requestId: 'request-id', reason: 'CONSIGNMENT_RETURN', financialTreatment: 'PENDING'
        }));
        expect(toast.success).toHaveBeenCalledWith('Devolução registrada. Estoque e compras líquidas atualizados.');
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

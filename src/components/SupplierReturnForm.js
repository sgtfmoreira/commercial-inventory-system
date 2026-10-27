import DataTable from './Table';
import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import Card from './Card';
import Button from './Button';
import { Input, Select, Textarea } from './FormFields';
import api from '../services/api';
import toast from 'react-hot-toast';

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const treatments = {
    PENDING: 'Acerto pendente', PAYABLE_REDUCTION: 'Abatimento do valor a pagar',
    SUPPLIER_CREDIT: 'Crédito com o fornecedor', REFUND: 'Reembolso'
};

const Content = styled.div`
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.lg};
    min-width: 0;
`;

const SectionHeader = styled.div`
    margin-bottom: ${({ theme }) => theme.spacing.lg};
    h2 { margin: 0 0 6px; font-size: ${({ theme }) => theme.fontSizes.xl}; }
    p { margin: 0; color: ${({ theme }) => theme.colors.textSecondary}; line-height: 1.5; }
`;

const FormGrid = styled.fieldset`
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px 24px;
    align-items: start;
    > * { min-width: 0; }
    select { text-overflow: ellipsis; }

    @media (max-width: 768px) {
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
    }
`;

const FullRow = styled.div`
    grid-column: 1 / -1;
    min-width: 0;
`;

const Hint = styled.p`
    margin: 8px 0 0;
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: ${({ theme }) => theme.fontSizes.sm};
    line-height: 1.5;
`;

const ReceiptSummary = styled(FullRow)`
    padding: 14px 16px;
    border-radius: ${({ theme }) => theme.radii.md};
    background: ${({ theme }) => theme.colors.bgHover};
    color: ${({ theme }) => theme.colors.textSecondary};
    font-size: ${({ theme }) => theme.fontSizes.sm};
    line-height: 1.6;
`;

const FormFooter = styled(FullRow)`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid ${({ theme }) => theme.colors.border};
    padding-top: 20px;
    p { margin: 0; }
    button { margin-left: auto; }

    @media (max-width: 768px) {
        flex-direction: column;
        align-items: stretch;
        button { width: 100%; margin-left: 0; }
    }
`;

const HistoryTable = styled(DataTable)`
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    th, td { padding: 12px; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; }
    th { font-size: 12px; color: ${({ theme }) => theme.colors.textSecondary}; white-space: nowrap; }
    td { font-size: ${({ theme }) => theme.fontSizes.sm}; vertical-align: top; }
`;

export default function SupplierReturnForm({ products, locations, onSaved }) {
    const [productId, setProductId] = useState('');
    const [receipts, setReceipts] = useState([]);
    const [history, setHistory] = useState([]);
    const [receiptId, setReceiptId] = useState('');
    const [locationId, setLocationId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [returnedAt, setReturnedAt] = useState(today);
    const [reason, setReason] = useState('CONSIGNMENT_RETURN');
    const [financialTreatment, setFinancialTreatment] = useState('PENDING');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [revision, setRevision] = useState(0);
    const request = useRef(null);
    const submitting = useRef(false);
    const receipt = receipts.find(item => item.id === receiptId);

    useEffect(() => {
        let active = true;
        api.get('/stock-movements/supplier-returns').then(data => { if (active) setHistory(data); })
            .catch(error => { if (active) toast.error(error.message); });
        return () => { active = false; };
    }, [revision]);

    useEffect(() => {
        let active = true;
        setReceipts([]);
        setReceiptId('');
        setLoadError('');
        if (!productId) { setLoading(false); return () => { active = false; }; }
        setLoading(true);
        api.get(`/stock-movements/return-receipts?productId=${productId}`)
            .then(data => { if (active) setReceipts(data); })
            .catch(error => { if (active) setLoadError(error.message); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [productId, revision]);

    const submit = async event => {
        event.preventDefault();
        if (submitting.current || !receipt || receipt.unavailableReason) return;
        const qty = Number(quantity);
        if (!Number.isFinite(qty) || qty <= 0 || qty > receipt.remainingQuantity) {
            toast.error('Informe uma quantidade válida dentro do saldo da compra.');
            return;
        }
        const body = { purchaseOrderItemId: receiptId, locationId, quantity: qty, returnedAt, reason, financialTreatment, notes };
        const signature = JSON.stringify(body);
        if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
        submitting.current = true;
        setSaving(true);
        try {
            await api.post('/stock-movements/supplier-returns', { ...body, requestId: request.current.id });
            toast.success('Devolução registrada. Estoque e compras líquidas atualizados.');
            request.current = null;
            setQuantity('');
            setNotes('');
            setReceiptId('');
            setRevision(value => value + 1);
            try { await onSaved(); } catch { toast.error('Devolução salva. Recarregue a página para atualizar os saldos.'); }
        } catch (error) {
            toast.error(error.message || 'Erro ao registrar devolução.');
        } finally {
            submitting.current = false;
            setSaving(false);
        }
    };

    return <Content>
        <Card>
            <SectionHeader>
            <h2>Devolução ao fornecedor</h2>
            <p>Selecione a compra recebida. A devolução reduz o estoque e o valor líquido das compras na data informada.</p>
            </SectionHeader>
            <form onSubmit={submit}>
                <FormGrid disabled={saving}>
                    <Select label="Produto devolvido" value={productId} required onChange={value => {
                        setProductId(value);
                        setReceiptId('');
                        setQuantity('');
                        const product = products.find(item => item.id === value);
                        setLocationId(product?.defaultLocationId || locations.find(item => item.isDefault)?.id || '');
                    }}>
                        <option value="">Selecione o produto</option>
                        {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </Select>
                    <Select label="Compra original" value={receiptId} required disabled={loading || !productId}
                        onChange={value => { setReceiptId(value); setQuantity(''); }}>
                        <option value="">{loading ? 'Carregando compras...' : 'Selecione a compra recebida'}</option>
                        {receipts.map(item => <option key={item.id} value={item.id} disabled={!!item.unavailableReason || item.remainingQuantity <= 0}>
                            {new Date(item.completedAt).toLocaleDateString('pt-BR')} — {item.supplierName} — OC #{item.purchaseOrderId.slice(-6).toUpperCase()} — {item.unavailableReason || `Disponível para devolver: ${item.remainingQuantity} ${item.unit}`}
                        </option>)}
                    </Select>
                    {loadError && <FullRow role="alert">{loadError} <Button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></FullRow>}
                    {productId && !loading && !loadError && !receipts.length && <FullRow><Hint>Nenhuma compra recebida para este produto.</Hint></FullRow>}
                    {receipt && <ReceiptSummary>Fornecedor: <strong>{receipt.supplierName}</strong>. Recebido: {receipt.receivedQuantity} {receipt.unit}; já devolvido: {receipt.returnedQuantity} {receipt.unit}. Custo original por {receipt.unit}: {money(receipt.unitCost)}.</ReceiptSummary>}
                    <Select label="Local de saída" value={locationId} required onChange={setLocationId}>
                        <option value="">Selecione o local</option>
                        {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                    </Select>
                    <Input label={`Quantidade devolvida (${receipt?.unit || 'unidade de estoque'})`} type="number" min="0.001" step="0.001"
                        max={receipt?.remainingQuantity} value={quantity} required onChange={event => setQuantity(event.target.value)} />
                    <Input label="Data da devolução" type="date" value={returnedAt} required max={today()}
                        min={receipt ? new Date(receipt.completedAt).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : undefined}
                        onChange={event => setReturnedAt(event.target.value)} />
                    <Select label="Motivo" value={reason} onChange={setReason}>
                        <option value="CONSIGNMENT_RETURN">Devolução de consignação</option>
                        <option value="SUPPLIER_RETURN">Outra devolução ao fornecedor</option>
                    </Select>
                    <div>
                    <Select label="Tratamento financeiro previsto" value={financialTreatment} onChange={setFinancialTreatment}>
                        {Object.entries(treatments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                    <Hint>O tratamento financeiro registra como o acerto será feito. Não confirma pagamento, crédito ou reembolso.</Hint>
                    </div>
                    <Textarea label="Observação / documento de devolução" maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} />
                    <FormFooter>
                    {receipt && Number(quantity) > 0 && <p>Valor da devolução: <strong>{money(Number(quantity) * receipt.unitCost)}</strong></p>}
                    <Button type="submit" variant="primary" disabled={!receipt || loading || saving || !!receipt.unavailableReason}>
                        {saving ? 'Registrando...' : 'Confirmar devolução'}
                    </Button>
                    </FormFooter>
                </FormGrid>
            </form>
        </Card>
        <Card>
            <SectionHeader>
            <h2>Últimas 50 devoluções registradas</h2>
            </SectionHeader>
            {!history.length ? <p>Nenhuma devolução registrada.</p> : <div style={{ overflowX: 'auto' }}>
                <HistoryTable>
                    <thead><tr><th>Data</th><th>Compra / produto</th><th>Fornecedor / local</th><th>Quantidade</th><th>Valor</th><th>Acerto previsto</th><th>Motivo / observação</th></tr></thead>
                    <tbody>{history.map(item => <tr key={item.id}>
                        <td>{new Date(item.returnedAt).toLocaleDateString('pt-BR')}</td>
                        <td>#{item.purchaseOrderItem.purchaseOrderId.slice(-6).toUpperCase()} — {item.purchaseOrderItem.productName}</td>
                        <td>{item.purchaseOrderItem.supplier?.name} / {item.stockMovement.location?.name}</td>
                        <td>{Number(item.quantity)} {item.purchaseOrderItem.receivedUnit}</td>
                        <td>{money(item.totalCost)}</td><td>{treatments[item.financialTreatment]}</td>
                        <td>{item.reason === 'CONSIGNMENT_RETURN' ? 'Consignação' : 'Devolução ao fornecedor'}{item.notes ? ` — ${item.notes}` : ''}</td>
                    </tr>)}</tbody>
                </HistoryTable>
            </div>}
        </Card>
    </Content>;
}

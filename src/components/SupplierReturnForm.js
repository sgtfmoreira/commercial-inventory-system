import React, { useEffect, useRef, useState } from 'react';
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

    return <>
        <Card>
            <h2>Devolução ao fornecedor</h2>
            <p>Selecione a compra recebida. A devolução reduz o estoque e o valor líquido das compras na data informada.</p>
            <form onSubmit={submit}>
                <fieldset disabled={saving} style={{ border: 0, padding: 0, display: 'grid', gap: 16 }}>
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
                    {loadError && <p role="alert">{loadError} <Button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></p>}
                    {productId && !loading && !loadError && !receipts.length && <p>Nenhuma compra recebida para este produto.</p>}
                    {receipt && <p>Fornecedor: <strong>{receipt.supplierName}</strong>. Recebido: {receipt.receivedQuantity} {receipt.unit}; já devolvido: {receipt.returnedQuantity} {receipt.unit}. Custo original por {receipt.unit}: {money(receipt.unitCost)}.</p>}
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
                    <Select label="Tratamento financeiro previsto" value={financialTreatment} onChange={setFinancialTreatment}>
                        {Object.entries(treatments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                    <p>O tratamento financeiro registra como o acerto será feito. Não confirma pagamento, crédito ou reembolso.</p>
                    <Textarea label="Observação / documento de devolução" maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} />
                    {receipt && Number(quantity) > 0 && <p>Valor da devolução: <strong>{money(Number(quantity) * receipt.unitCost)}</strong></p>}
                    <Button type="submit" variant="primary" disabled={!receipt || loading || saving || !!receipt.unavailableReason}>
                        {saving ? 'Registrando...' : 'Confirmar devolução'}
                    </Button>
                </fieldset>
            </form>
        </Card>
        <Card>
            <h2>Últimas 50 devoluções registradas</h2>
            {!history.length ? <p>Nenhuma devolução registrada.</p> : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderSpacing: 12 }}>
                    <thead><tr><th>Data</th><th>Compra / produto</th><th>Fornecedor / local</th><th>Quantidade</th><th>Valor</th><th>Acerto previsto</th><th>Motivo / observação</th></tr></thead>
                    <tbody>{history.map(item => <tr key={item.id}>
                        <td>{new Date(item.returnedAt).toLocaleDateString('pt-BR')}</td>
                        <td>#{item.purchaseOrderItem.purchaseOrderId.slice(-6).toUpperCase()} — {item.purchaseOrderItem.productName}</td>
                        <td>{item.purchaseOrderItem.supplier?.name} / {item.stockMovement.location?.name}</td>
                        <td>{Number(item.quantity)} {item.purchaseOrderItem.receivedUnit}</td>
                        <td>{money(item.totalCost)}</td><td>{treatments[item.financialTreatment]}</td>
                        <td>{item.reason === 'CONSIGNMENT_RETURN' ? 'Consignação' : 'Devolução ao fornecedor'}{item.notes ? ` — ${item.notes}` : ''}</td>
                    </tr>)}</tbody>
                </table>
            </div>}
        </Card>
    </>;
}

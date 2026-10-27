import DataTable from '../components/Table';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import Card from '../components/Card';
import Button from '../components/Button';
import Select from '../components/Select';
import { Input } from '../components/FormFields';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import { formatCurrency } from '../utils/formatCurrency';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
`;

const Table = styled(DataTable)`
  width: 100%;
  border-collapse: collapse;
  th, td { padding: 11px; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; text-align: left; }
  th { color: ${({ theme }) => theme.colors.textSecondary}; font-size: 12px; }
`;

const labels = { CLEANING: 'Limpeza', DISPOSABLES: 'Descartáveis', OPERATING: 'Outros operacionais' };
const toDateInput = date => date.toISOString().slice(0, 10);

export default function MaterialConsumption() {
  const { state } = useApp();
  const navigate = useNavigate();
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  const [form, setForm] = useState({ productId: '', locationId: '', quantity: '', responsibleSector: '', notes: '', periodFrom: toDateInput(weekStart), periodTo: toDateInput(today) });
  const [locations, setLocations] = useState([]);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);

  const products = useMemo(() => state.products.filter(product =>
    product.isActive !== false && product.trackInventory !== false &&
    ['CLEANING', 'DISPOSABLES', 'OPERATING'].includes(product.purchaseClassification)
  ), [state.products]);
  const selectedProduct = products.find(product => product.id === form.productId);

  const loadData = useCallback(async () => {
    const [locationData, movementData] = await Promise.all([
      api.get('/stock-locations'), api.get('/stock-movements?type=OUT&reason=OPERATIONAL_USE')
    ]);
    setLocations(Array.isArray(locationData) ? locationData : locationData?.data || []);
    setHistory(Array.isArray(movementData) ? movementData : movementData?.data || []);
  }, []);

  useEffect(() => { loadData().catch(() => toast.error('Erro ao carregar consumos.')); }, [loadData]);

  const submit = async event => {
    event.preventDefault();
    if (!form.productId || !form.locationId || Number(form.quantity) <= 0) return toast.error('Informe produto, local e quantidade.');
    if (form.periodFrom > form.periodTo) return toast.error('O início do período não pode ser posterior ao fim.');
    setSaving(true);
    try {
      await api.post('/stock-movements/operational-use', { ...form, quantity: Number(form.quantity) });
      toast.success('Consumo operacional registrado.');
      setForm(current => ({ ...current, productId: '', locationId: '', quantity: '', notes: '' }));
      await loadData();
    } catch (error) {
      toast.error(error.message || 'Não foi possível registrar o consumo.');
    } finally { setSaving(false); }
  };

  return <div>
    <h1>Consumo de materiais</h1>
    <p>Registre a baixa semanal de limpeza, descartáveis e outros materiais operacionais.</p>
    <Card padding="20px"><form onSubmit={submit}>
      <Grid>
        <div>
          <Select label="Produto" value={form.productId} onChange={value => setForm({ ...form, productId: value })} options={[{ value: '', label: 'Selecione...' }, ...products.map(product => ({ value: product.id, label: `${product.name} — ${labels[product.purchaseClassification]}` }))]} />
          {!products.length && <div style={{ marginTop: 8, fontSize: 13, color: '#b45309' }}>
            Nenhum material operacional cadastrado. Classifique o produto como limpeza, descartável ou outro custo operacional antes de lançar o consumo.
            <Button type="button" variant="secondary" onClick={() => navigate('/products')} style={{ marginTop: 8, width: '100%' }}>Classificar produtos</Button>
          </div>}
        </div>
        <Select label="Local de estoque" value={form.locationId} onChange={value => setForm({ ...form, locationId: value })} options={[{ value: '', label: 'Selecione...' }, ...locations.map(location => ({ value: location.id, label: location.name }))]} />
        <Input label={`Quantidade${selectedProduct?.unit ? ` (${selectedProduct.unit})` : ''}`} type="number" min="0.001" step="0.001" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} />
        <Input label="Setor responsável" value={form.responsibleSector} onChange={event => setForm({ ...form, responsibleSector: event.target.value })} />
        <Input label="Início do período" type="date" value={form.periodFrom} onChange={event => setForm({ ...form, periodFrom: event.target.value })} />
        <Input label="Fim do período" type="date" value={form.periodTo} onChange={event => setForm({ ...form, periodTo: event.target.value })} />
      </Grid>
      <div style={{ marginTop: 14 }}><Input label="Motivo / observação" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></div>
      <Button type="submit" variant="primary" disabled={saving || !products.length} style={{ marginTop: 16 }}>{saving ? 'Registrando...' : 'Registrar baixa semanal'}</Button>
    </form></Card>

    <h2 style={{ marginTop: 28 }}>Histórico de consumo operacional</h2>
    <Card padding="0" style={{ overflowX: 'auto' }}><Table>
      <thead><tr><th>Data</th><th>Produto</th><th>Classificação</th><th>Quantidade</th><th>Local</th><th>Setor</th><th>Custo</th><th>Observação</th></tr></thead>
      <tbody>{history.map(item => <tr key={item.id}>
        <td>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</td><td>{item.productName}</td><td>{labels[item.purchaseClassification] || 'Operacional'}</td>
        <td>{Number(item.quantity).toLocaleString('pt-BR')}</td><td>{item.location?.name || '—'}</td><td>{item.responsibleSector || '—'}</td>
        <td>{formatCurrency(Number(item.totalCost || 0))}</td><td>{item.notes || '—'}</td>
      </tr>)}{!history.length && <tr><td colSpan="8">Nenhum consumo operacional registrado.</td></tr>}</tbody>
    </Table></Card>
  </div>;
}

import { InputControl, TextareaControl } from '../components/FormFields';
import DataTable from '../components/Table';
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import styled, { keyframes } from "styled-components";
import { useApp } from "../context/AppContext";
import api from "../services/api";
import axios from "axios";
import toast from "react-hot-toast";
import {
    MdAdd, MdClose, MdCheckCircle, MdCancel, MdPendingActions,
    MdFactory, MdPictureAsPdf, MdSearch, MdRefresh, MdWarning, MdInfo
} from "react-icons/md";
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { Input } from '../components/FormFields';
import Select from '../components/Select';
import EmptyState from '../components/EmptyState';
import { Tabs, Tab } from '../components/Tabs';
// ─── Animations ─────────────────────────────────────────────────────────────
const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;
const spin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;
const pulse = keyframes`0%,100% { opacity: 1; } 50% { opacity: 0.5; }`;

// ─── Layout ──────────────────────────────────────────────────────────────────
const Container = styled.div`
  animation: ${fadeIn} 0.3s ease;
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  flex-wrap: wrap;
  gap: 12px;
`;

const TitleBlock = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const TitleIcon = styled.div`
  width: 44px; height: 44px;
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.primary};
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  font-size: 1.4rem;
  box-shadow: 0 4px 14px rgba(109, 94, 244,0.35);
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes["2xl"]};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PageSubtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

// ─── KPI Cards ────────────────────────────────────────────────────────────────
const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const KpiCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};
  border-left: 4px solid ${({ $color }) => $color || '#6D5EF4'};
  display: flex; flex-direction: column; gap: 4px;
`;

const KpiLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
`;

const KpiValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes["2xl"]};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color, theme }) => $color || theme.colors.textPrimary};
`;

// ─── Tabs ─────────────────────────────────────────────────────────────────────
// ─── Table ────────────────────────────────────────────────────────────────────

const TableHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  flex-wrap: wrap; gap: 10px;
`;

const SearchBox = styled.div`
  display: flex; align-items: center; gap: 8px;
  background: ${({ theme }) => theme.colors.bgInput || theme.colors.bgHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 8px 12px;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 14px;
  input {
    border: none; background: transparent;
    color: ${({ theme }) => theme.colors.textPrimary};
    font-size: 14px; outline: none; width: 180px;
    &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; }
  }
`;

const TableOverflow = styled.div`overflow-x: auto;`;

const Table = styled(DataTable)`
  width: 100%; border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left; padding: 12px 16px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase; letter-spacing: 0.06em;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 14px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: middle;
`;

const Tr = styled.tr`
  transition: 0.15s;
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }
  &:last-child td { border-bottom: none; }
`;

// ─── Status Config ────────────────────────────────────────────────────────────
const statusConfig = {
    PENDING:   { label: 'Pendente',  variant: 'warning', icon: <MdPendingActions /> },
    COMPLETED: { label: 'Concluída', variant: 'success', icon: <MdCheckCircle /> },
    CANCELLED: { label: 'Cancelada', variant: 'danger', icon: <MdCancel /> },
};

// ─── Action Buttons ───────────────────────────────────────────────────────────
const ActionRow = styled.div`display: flex; gap: 6px; align-items: center;`;

const IconBtn = ({ $variant, ...props }) => (
  <Button size="sm" variant={$variant === 'danger' ? 'danger' : $variant === 'success' ? 'success' : $variant === 'pdf' ? 'primary' : 'outlined'} {...props} />
);

// ─── Spinner ──────────────────────────────────────────────────────────────────
const Spinner = styled.div`
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
`;



const StyledTextarea = styled(TextareaControl)`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bgInput || theme.colors.bg};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px; resize: vertical; min-height: 72px;
  &:focus { outline: none; border-color: #6D5EF4; }
`;

// ─── Preview Panel ────────────────────────────────────────────────────────────
const PreviewBox = styled.div`
  border-radius: ${({ theme }) => theme.radii.lg};
  border: 1px solid ${({ $hasIssue }) => $hasIssue ? '#f97316' : '#6D5EF4'};
  background: ${({ $hasIssue }) => $hasIssue ? 'rgba(249,115,22,0.06)' : 'rgba(109, 94, 244,0.06)'};
  padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
`;

const PreviewTitle = styled.div`
  font-size: 13px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: ${({ $hasIssue }) => $hasIssue ? '#f97316' : '#6D5EF4'};
  display: flex; align-items: center; gap: 6px;
`;

const IngredientRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 100px 80px;
  gap: 8px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ $insufficient }) => $insufficient ? 'rgba(201, 54, 79, 0.2)' : 'transparent'};
`;

const IngName = styled.span`
  font-size: 13px; font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const IngValue = styled.span`
  font-size: 13px; font-weight: 700;
  color: ${({ $ok }) => $ok === false ? 'var(--color-danger)' : $ok === true ? 'var(--color-success)' : '#6D5EF4'};
  text-align: right;
`;

const IngLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: right;
`;

const TotalCostBox = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px;
  background: rgba(109, 94, 244,0.1); border-radius: ${({ theme }) => theme.radii.md};
  font-weight: 700; font-size: 15px;
`;

const InsufficientAlert = styled.div`
  display: flex; gap: 8px; align-items: flex-start;
  background: #fef3c7; border: 1px solid var(--color-warning);
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 10px 14px; font-size: 13px; color: #92400e; font-weight: 600;
  animation: ${pulse} 2s ease-in-out infinite;
`;

// ─── Cancel Confirm Modal ─────────────────────────────────────────────────────
const ConfirmBox = styled.div`
  padding: 24px; text-align: center;
  display: flex; flex-direction: column; gap: 16px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatCurrency = (v) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

const formatDate = (d) =>
    d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

const formatQty = (v, unit) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unit || ''}`;

// ─── PDF GENERATOR ────────────────────────────────────────────────────────────
function generateProductionPDF({ preview, order, establishment, notes }) {
    const now = new Date().toLocaleString('pt-BR');
    const title = order
        ? `Ficha de Produção #${order.id.slice(0, 8).toUpperCase()}`
        : 'Prévia de Produção';

    const ingredientsRows = preview.ingredients.map(ing => `
        <tr>
            <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0;">${ing.name}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; text-align:right;">
                <strong>${Number(ing.quantityPerUnit).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong> ${ing.unit}
            </td>
            <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; text-align:right; color:${ing.sufficient ? 'var(--color-success)' : 'var(--color-danger)'}">
                <strong>${Number(ing.quantityNeeded).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong> ${ing.unit}
            </td>
            <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; text-align:right; color:${ing.sufficient ? 'var(--color-success)' : 'var(--color-danger)'}">
                <strong>${Number(ing.quantityAvailable).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</strong> ${ing.unit}
            </td>
            <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; text-align:center;">
                <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${ing.sufficient ? '#d1fae5' : '#fee2e2'};color:${ing.sufficient ? '#065f46' : '#991b1b'}">
                    ${ing.sufficient ? '✓ OK' : '⚠ Insuficiente'}
                </span>
            </td>
        </tr>
    `).join('');

    const alertBanner = !preview.canProduce ? `
        <div style="background:#fef3c7;border:1px solid var(--color-warning);border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;gap:10px;align-items:center">
            <span style="font-size:20px">⚠️</span>
            <span style="font-weight:700;color:#92400e">Atenção: Estoque insuficiente para um ou mais ingredientes!</span>
        </div>
    ` : '';

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  :root { --color-text:#171327; --color-text-secondary:#5F5A72; --color-text-muted:#858096; --color-background:#FAFAFD; --color-border:#E8E5F2; --color-success:#16845B; --color-warning:#B7660B; --color-danger:#C9364F; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: var(--color-text); background: #fff; padding: 32px; font-size: 14px; }
  @media print { body { padding: 16px; } }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #6D5EF4; }
  .brand { font-size: 26px; font-weight: 900; color: #6D5EF4; }
  .brand span { color: #A89EFF; }
  .doc-title { font-size: 20px; font-weight: 800; color: var(--color-text); margin-bottom: 4px; }
  .doc-meta { font-size: 12px; color: var(--color-text-secondary); }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 28px; }
  .info-card { background: var(--color-background); border-radius: 10px; padding: 14px 16px; border-left: 4px solid #6D5EF4; }
  .info-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-muted); font-weight: 700; margin-bottom: 4px; }
  .info-value { font-size: 16px; font-weight: 800; color: var(--color-text); }
  .section-title { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #6D5EF4; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  thead { background: #6D5EF4; color: #fff; }
  thead th { padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
  thead th:not(:first-child) { text-align: right; }
  tbody tr:hover { background: var(--color-background); }
  .cost-row { background: #F3F0FF; border-radius: 10px; padding: 16px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
  .cost-label { font-size: 14px; font-weight: 700; color: #6D5EF4; }
  .cost-value { font-size: 22px; font-weight: 900; color: #6D5EF4; }
  .notes-box { background: var(--color-background); border-radius: 10px; padding: 16px; border: 1px dashed var(--color-border); margin-top: 20px; }
  .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; font-size: 11px; color: var(--color-text-muted); }
  .status-badge { display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">Bastidor<span>·</span>OS</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px">${establishment || 'Produção'}</div>
  </div>
  <div style="text-align:right">
    <div class="doc-title">${title}</div>
    <div class="doc-meta">Gerado em: ${now}</div>
    ${order ? `<div class="doc-meta">Status: <span class="status-badge" style="background:${order.status === 'COMPLETED' ? '#d1fae5' : order.status === 'CANCELLED' ? '#fee2e2' : '#fef3c7'};color:${order.status === 'COMPLETED' ? '#065f46' : order.status === 'CANCELLED' ? '#991b1b' : '#92400e'}">${statusConfig[order.status]?.label || order.status}</span></div>` : ''}
  </div>
</div>

<div class="info-grid">
  <div class="info-card">
    <div class="info-label">Produto a Produzir</div>
    <div class="info-value">${preview.productName}</div>
    <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px">Unidade: ${preview.productUnit}</div>
  </div>
  <div class="info-card" style="border-left-color:var(--color-success)">
    <div class="info-label">Quantidade Produzida</div>
    <div class="info-value" style="color:var(--color-success)">${Number(preview.quantity).toLocaleString('pt-BR', {maximumFractionDigits: 3})} ${preview.productUnit}</div>
  </div>
  <div class="info-card" style="border-left-color:var(--color-warning)">
    <div class="info-label">Custo Total Estimado</div>
    <div class="info-value" style="color:var(--color-warning)">${formatCurrency(preview.estimatedTotalCost)}</div>
  </div>
</div>

${alertBanner}

<div class="section-title">📋 Insumos Necessários</div>

<table>
  <thead>
    <tr>
      <th>Ingrediente</th>
      <th style="text-align:right">Qtd p/ unidade</th>
      <th style="text-align:right">Total necessário</th>
      <th style="text-align:right">Estoque disponível</th>
      <th style="text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>
    ${ingredientsRows}
  </tbody>
</table>

<div class="cost-row">
  <div class="cost-label">💰 Custo Total Estimado da Produção</div>
  <div class="cost-value">${formatCurrency(preview.estimatedTotalCost)}</div>
</div>

${notes ? `
<div class="notes-box">
  <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#6D5EF4;margin-bottom:6px">📝 Observações</div>
  <div style="color:#374151">${notes}</div>
</div>
` : ''}

<div class="footer">
  <span>Bastidor OS · Controle de Produção</span>
  <span>Documento gerado em ${now}</span>
</div>

</body>
</html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Production() {
    const { state } = useApp();
    const { products = [], establishment } = state;

    const productionProducts = useMemo(() => {
        return products.filter(p => p.type === 'PRODUCTION' && p.isActive !== false);
    }, [products]);

    const [tab, setTab] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [search, setSearch] = useState('');

    // Fichas Técnicas
    const [recipes, setRecipes] = useState([]);  // { product, recipe }
    const [loadingRecipes, setLoadingRecipes] = useState(false);
    const [expandedRecipes, setExpandedRecipes] = useState({});

    // Modal nova produção
    const [showModal, setShowModal] = useState(false);
    const [modalProductId, setModalProductId] = useState('');
    const [modalQty, setModalQty] = useState('');
    const [modalNotes, setModalNotes] = useState('');
    const [preview, setPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Confirm modals
    const [completeTarget, setCompleteTarget] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [processing, setProcessing] = useState(false);

    // Preview debounce ref
    const previewTimer = useRef(null);

    // ─── Data ──────────────────────────────────────────────────────────────────
    const loadOrders = useCallback(async () => {
        setLoadingOrders(true);
        try {
            const res = await api.get('/productions');
            setOrders(Array.isArray(res?.orders) ? res.orders : []);
        } catch {
            toast.error('Erro ao carregar ordens de produção');
        } finally {
            setLoadingOrders(false);
        }
    }, []);

    const loadRecipes = useCallback(async () => {
        setLoadingRecipes(true);
        try {
            const token = localStorage.getItem('token');
            const baseURL = (process.env.REACT_APP_API_URL || 'http://localhost:3333') + '/api';

            const results = await Promise.all(
                productionProducts.map(async (p) => {
                    try {
                        const res = await axios.get(`${baseURL}/recipes/product/${p.id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        const recipe = res.data?.data !== undefined ? res.data.data : res.data;
                        return { product: p, recipe };
                    } catch {
                        // 404 = sem receita, sem toast
                        return { product: p, recipe: null };
                    }
                })
            );
            setRecipes(results);
        } catch {
            toast.error('Erro ao carregar fichas técnicas');
        } finally {
            setLoadingRecipes(false);
        }
    }, [productionProducts]);

    useEffect(() => { loadOrders(); }, [loadOrders]);
    useEffect(() => {
        if (tab === 'recipes') loadRecipes();
    }, [tab, loadRecipes]);

    // ─── Preview on qty/product change ────────────────────────────────────────
    useEffect(() => {
        if (!modalProductId || !modalQty || Number(modalQty) <= 0) {
            setPreview(null);
            return;
        }
        clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(async () => {
            setLoadingPreview(true);
            try {
                const res = await api.get(`/productions/preview?productId=${modalProductId}&quantity=${modalQty}`);
                setPreview(res);
            } catch (e) {
                setPreview(null);
                toast.error(e.message || 'Erro ao calcular ingredientes');
            } finally {
                setLoadingPreview(false);
            }
        }, 600);
        return () => clearTimeout(previewTimer.current);
    }, [modalProductId, modalQty]);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const openModal = () => {
        setModalProductId('');
        setModalQty('');
        setModalNotes('');
        setPreview(null);
        setShowModal(true);
    };

    const handleCreate = async () => {
        if (!modalProductId || !modalQty) return toast.error('Preencha produto e quantidade');
        setSubmitting(true);
        try {
            await api.post('/productions', {
                productId: modalProductId,
                quantity: Number(modalQty),
                notes: modalNotes
            });
            toast.success('Ordem de produção criada!');
            setShowModal(false);
            loadOrders();
        } catch (e) {
            toast.error(e.message || 'Erro ao criar ordem');
        } finally {
            setSubmitting(false);
        }
    };

    const handleComplete = async () => {
        if (!completeTarget) return;
        setProcessing(true);
        try {
            await api.patch(`/productions/${completeTarget.id}/complete`);
            toast.success('Produção concluída! Estoque atualizado.');
            setCompleteTarget(null);
            loadOrders();
        } catch (e) {
            toast.error(e.message || 'Erro ao concluir produção');
        } finally {
            setProcessing(false);
        }
    };

    const handleCancel = async () => {
        if (!cancelTarget) return;
        setProcessing(true);
        try {
            await api.patch(`/productions/${cancelTarget.id}/cancel`);
            toast.success('Ordem cancelada');
            setCancelTarget(null);
            loadOrders();
        } catch (e) {
            toast.error(e.message || 'Erro ao cancelar ordem');
        } finally {
            setProcessing(false);
        }
    };

    // ─── KPIs ─────────────────────────────────────────────────────────────────
    const kpiPending = orders.filter(o => o.status === 'PENDING').length;
    const kpiCompleted = orders.filter(o => o.status === 'COMPLETED').length;
    const kpiTotal = orders.length;

    // ─── Filtered ─────────────────────────────────────────────────────────────
    const tabOrders = tab === 'orders'
        ? orders
        : orders.filter(o => o.status === tab);

    const filtered = tabOrders.filter(o =>
        o.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
        o.id.includes(search)
    );

    return (
        <Container>
            {/* ── Header ───────────────────────────────────────────────────── */}
            <PageHeader>
                <TitleBlock>
                    <TitleIcon><MdFactory /></TitleIcon>
                    <div>
                        <PageTitle>Produção</PageTitle>
                        <PageSubtitle>Gerencie ordens de produção e fichas técnicas</PageSubtitle>
                    </div>
                </TitleBlock>
                <Button variant="primary" onClick={openModal} id="btn-nova-producao">
                    <MdAdd /> Nova Produção
                </Button>
            </PageHeader>

            {/* ── KPIs ─────────────────────────────────────────────────────── */}
            <KpiGrid>
                <KpiCard $color="#6D5EF4">
                    <KpiLabel>Total de Ordens</KpiLabel>
                    <KpiValue>{kpiTotal}</KpiValue>
                </KpiCard>
                <KpiCard $color="var(--color-warning)">
                    <KpiLabel>Pendentes</KpiLabel>
                    <KpiValue $color="var(--color-warning)">{kpiPending}</KpiValue>
                </KpiCard>
                <KpiCard $color="var(--color-success)">
                    <KpiLabel>Concluídas</KpiLabel>
                    <KpiValue $color="var(--color-success)">{kpiCompleted}</KpiValue>
                </KpiCard>
                <KpiCard $color="var(--color-text-secondary)">
                    <KpiLabel>Produtos de Produção</KpiLabel>
                    <KpiValue>{productionProducts.length}</KpiValue>
                </KpiCard>
            </KpiGrid>

            {/* ── Tabs ─────────────────────────────────────────────────────── */}
            <Tabs>
                {[
                    { key: 'orders', label: 'Todas' },
                    { key: 'PENDING', label: `Pendentes (${kpiPending})` },
                    { key: 'COMPLETED', label: 'Concluídas' },
                    { key: 'CANCELLED', label: 'Canceladas' },
                    { key: 'recipes', label: '📋 Fichas Técnicas' },
                ].map(t => (
                    <Tab key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</Tab>
                ))}
            </Tabs>

            {/* ── Table ────────────────────────────────────────────────────── */}
            <Card>
                <TableHeader>
                    <SearchBox>
                        <MdSearch />
                        <InputControl
                            placeholder="Buscar por produto..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            id="input-search-producao"
                        />
                    </SearchBox>
                    <IconBtn $variant="default" onClick={loadOrders} title="Recarregar" id="btn-refresh-producao">
                        <MdRefresh />
                    </IconBtn>
                </TableHeader>

                <TableOverflow>
                    <Table>
                        <thead>
                            <tr>
                                <Th>ID</Th>
                                <Th>Produto</Th>
                                <Th>Quantidade</Th>
                                <Th>Status</Th>
                                <Th>Criado por</Th>
                                <Th>Data</Th>
                                <Th>Ações</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingOrders ? (
                                <tr>
                                    <Td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
                                        Carregando...
                                    </Td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <Td colSpan={7}>
                                        <EmptyState
                                            title="Nenhuma ordem encontrada"
                                            subtitle="Clique em 'Nova Produção' para começar"
                                        />
                                    </Td>
                                </tr>
                            ) : filtered.map(order => {
                                const s = statusConfig[order.status] || {};
                                return (
                                    <Tr key={order.id}>
                                        <Td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)' }}>
                                            #{order.id.slice(0, 8).toUpperCase()}
                                        </Td>
                                        <Td>
                                            <span style={{ fontWeight: 700 }}>{order.product?.name}</span>
                                        </Td>
                                        <Td style={{ fontWeight: 700 }}>
                                            {formatQty(order.quantity, order.product?.unit)}
                                        </Td>
                                        <Td>
                                            <Badge variant={s.variant}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {s.icon} {s.label}
                                                </div>
                                            </Badge>
                                        </Td>
                                        <Td>{order.user?.name || '-'}</Td>
                                        <Td style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                                            {formatDate(order.createdAt)}
                                        </Td>
                                        <Td>
                                            <ActionRow>
                                                {/* PDF sempre disponível */}
                                                <IconBtn
                                                    $variant="pdf"
                                                    title="Exportar PDF"
                                                    onClick={async () => {
                                                        try {
                                                            const res = await api.get(
                                                                `/productions/preview?productId=${order.productId}&quantity=${order.quantity}`
                                                            );
                                                            generateProductionPDF({
                                                                preview: res,
                                                                order,
                                                                establishment: establishment?.name,
                                                                notes: order.notes
                                                            });
                                                        } catch (e) {
                                                            toast.error('Erro ao gerar PDF');
                                                        }
                                                    }}
                                                >
                                                    <MdPictureAsPdf /> PDF
                                                </IconBtn>

                                                {order.status === 'PENDING' && (
                                                    <>
                                                        <IconBtn
                                                            $variant="success"
                                                            onClick={() => setCompleteTarget(order)}
                                                        >
                                                            <MdCheckCircle /> Concluir
                                                        </IconBtn>
                                                        <IconBtn
                                                            $variant="danger"
                                                            onClick={() => setCancelTarget(order)}
                                                        >
                                                            <MdCancel />
                                                        </IconBtn>
                                                    </>
                                                )}
                                            </ActionRow>
                                        </Td>
                                    </Tr>
                                );
                            })}
                        </tbody>
                    </Table>
                </TableOverflow>
            </Card>

            {/* ═══════════════════════════════════════════════════════════════
                FICHAS TÉCNICAS
            ═══════════════════════════════════════════════════════════════ */}
            {tab === 'recipes' && (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid', borderColor: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Fichas Técnicas de Produção</span>
                        <IconBtn $variant="default" onClick={loadRecipes} title="Recarregar">
                            <MdRefresh />
                        </IconBtn>
                    </div>

                    {loadingRecipes ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>Carregando fichas técnicas...</div>
                    ) : recipes.length === 0 ? (
                        <EmptyState
                            title="Nenhum produto de produção cadastrado"
                            subtitle="Cadastre produtos com tipo 'Produção' na tela de Produtos"
                        />
                    ) : (
                        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {recipes.map(({ product, recipe }) => {
                                const isExpanded = expandedRecipes[product.id];
                                const hasRecipe = recipe && recipe.items && recipe.items.length > 0;
                                return (
                                    <div
                                        key={product.id}
                                        style={{
                                            border: '1px solid',
                                            borderColor: hasRecipe ? 'rgba(109, 94, 244, 0.2)' : 'rgba(183, 102, 11, 0.2)',
                                            borderRadius: 12,
                                            overflow: 'hidden',
                                            background: hasRecipe ? 'rgba(109, 94, 244,0.03)' : 'rgba(245,158,11,0.04)'
                                        }}
                                    >
                                        {/* Header da ficha */}
                                        <div
                                            style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '14px 16px', cursor: hasRecipe ? 'pointer' : 'default'
                                            }}
                                            onClick={() => hasRecipe && setExpandedRecipes(prev => ({ ...prev, [product.id]: !prev[product.id] }))}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 8,
                                                    background: hasRecipe ? '#6D5EF4' : 'rgba(183, 102, 11, 0.14)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: hasRecipe ? '#fff' : 'var(--color-warning)', fontSize: '1.1rem'
                                                }}>
                                                    {hasRecipe ? '🏭' : '⚠️'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{product.name}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                                        {hasRecipe
                                                            ? `${recipe.items.length} ingrediente(s) • ${product.unit}`
                                                            : 'Sem ficha técnica cadastrada'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '3px 10px',
                                                    borderRadius: 999,
                                                    background: hasRecipe ? '#d1fae5' : '#fef3c7',
                                                    color: hasRecipe ? '#065f46' : '#92400e'
                                                }}>
                                                    {hasRecipe ? '✓ Com receita' : 'Sem receita'}
                                                </span>
                                                {hasRecipe && (
                                                    <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                                                        {isExpanded ? '▲' : '▼'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Ingredientes expandidos */}
                                        {hasRecipe && isExpanded && (
                                            <div style={{ borderTop: '1px solid #6D5EF420', padding: '12px 16px' }}>
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr 120px 120px 80px',
                                                    gap: 8, padding: '4px 8px',
                                                    fontSize: 11, fontWeight: 700,
                                                    textTransform: 'uppercase', color: 'var(--color-text-muted)',
                                                    letterSpacing: '0.05em'
                                                }}>
                                                    <span>Ingrediente</span>
                                                    <span style={{ textAlign: 'right' }}>Qtd p/ unid.</span>
                                                    <span style={{ textAlign: 'right' }}>Estoque atual</span>
                                                    <span style={{ textAlign: 'center' }}>Status</span>
                                                </div>
                                                {recipe.items.map(item => {
                                                    const available = Number(item.product?.quantity || 0);
                                                    const needed = Number(item.quantity || 0);
                                                    const ok = available >= needed;
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: '1fr 120px 120px 80px',
                                                                gap: 8, padding: '10px 8px',
                                                                borderRadius: 8,
                                                                background: ok ? 'transparent' : 'rgba(239,68,68,0.04)',
                                                                border: ok ? 'none' : '1px solid rgba(239,68,68,0.15)',
                                                                marginBottom: 4
                                                            }}
                                                        >
                                                            <span style={{ fontSize: 13, fontWeight: 600 }}>
                                                                {item.product?.name}
                                                            </span>
                                                            <span style={{ fontSize: 13, textAlign: 'right', color: '#6D5EF4', fontWeight: 700 }}>
                                                                {Number(needed).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.product?.unit}
                                                            </span>
                                                            <span style={{ fontSize: 13, textAlign: 'right', color: ok ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>
                                                                {Number(available).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.product?.unit}
                                                            </span>
                                                            <span style={{ textAlign: 'center' }}>
                                                                <span style={{
                                                                    fontSize: 11, fontWeight: 700, padding: '2px 8px',
                                                                    borderRadius: 999,
                                                                    background: ok ? '#d1fae5' : '#fee2e2',
                                                                    color: ok ? '#065f46' : '#991b1b'
                                                                }}>
                                                                    {ok ? 'OK' : 'Falta'}
                                                                </span>
                                                            </span>
                                                        </div>
                                                    );
                                                })}

                                                {/* Custo estimado da ficha */}
                                                {recipe.items.length > 0 && (() => {
                                                    const totalCost = recipe.items.reduce((sum, item) => {
                                                        return sum + (Number(item.quantity) * Number(item.product?.currentCost || 0));
                                                    }, 0);
                                                    return totalCost > 0 ? (
                                                        <div style={{
                                                            display: 'flex', justifyContent: 'flex-end',
                                                            marginTop: 8, padding: '8px 8px',
                                                            background: 'rgba(109, 94, 244,0.08)',
                                                            borderRadius: 8, fontWeight: 700
                                                        }}>
                                                            <span style={{ color: 'var(--color-text-muted)', marginRight: 8 }}>Custo estimado por unidade:</span>
                                                            <span style={{ color: '#6D5EF4' }}>
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}
                                                            </span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                MODAL — NOVA PRODUÇÃO
            ════════════════════════════════════════════════════════════════ */}
            {/* ═══════════════════════════════════════════════════════════════
                MODAL — NOVA PRODUÇÃO
            ════════════════════════════════════════════════════════════════ */}
            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title="🏭 Nova Ordem de Produção"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>
                            Cancelar
                        </Button>
                        <Button
                            id="btn-confirmar-producao"
                            variant="primary"
                            onClick={handleCreate}
                            disabled={submitting || !modalProductId || !modalQty}
                        >
                            {submitting ? <><Spinner style={{ display: 'inline-block', width: 14, height: 14, marginRight: 6 }} /> Criando...</> : <><MdAdd /> Criar Ordem</>}
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Produto */}
                    <Select
                        label="Produto a Produzir *"
                        id="select-produto-producao"
                        value={modalProductId}
                        onChange={val => { setModalProductId(val); setPreview(null); }}
                        options={[
                            { value: "", label: "-- Selecione um produto de produção --" },
                            ...productionProducts.map(p => ({ value: p.id, label: `${p.name} (${p.unit})` }))
                        ]}
                    />
                    {productionProducts.length === 0 && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--color-warning)', background: '#fef3c720', padding: '8px 12px', borderRadius: 8 }}>
                            <MdInfo /> Nenhum produto do tipo "Produção" encontrado. Cadastre produtos com tipo "Produção" na tela de Produtos.
                        </div>
                    )}

                    {/* Quantidade */}
                    <Input
                        label={`Quantidade a Produzir *${modalProductId ? ` (${productionProducts.find(p => p.id === modalProductId)?.unit || ''})` : ''}`}
                        id="input-quantidade-producao"
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="Ex: 10"
                        value={modalQty}
                        onChange={e => setModalQty(e.target.value)}
                    />

                    {/* Preview de ingredientes */}
                    {loadingPreview && (
                        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13, padding: '8px 0' }}>
                            ⏳ Calculando ingredientes...
                        </div>
                    )}

                    {preview && !loadingPreview && (
                        <PreviewBox $hasIssue={!preview.canProduce}>
                            <PreviewTitle $hasIssue={!preview.canProduce}>
                                {preview.canProduce ? <MdCheckCircle /> : <MdWarning />}
                                Insumos Necessários para {Number(preview.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {preview.productUnit}
                            </PreviewTitle>

                            {!preview.canProduce && (
                                <InsufficientAlert>
                                    <MdWarning style={{ flexShrink: 0, fontSize: 18 }} />
                                    <span>Estoque insuficiente para um ou mais ingredientes. Você pode criar a ordem, mas não conseguirá concluir a produção.</span>
                                </InsufficientAlert>
                            )}

                            {/* Header da tabela de ingredientes */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px', gap: 8, padding: '4px 12px' }}>
                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Ingrediente</span>
                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', textAlign: 'right' }}>Por unid.</span>
                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', textAlign: 'right' }}>Necessário</span>
                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', textAlign: 'right' }}>Disponível</span>
                            </div>

                            {preview.ingredients.map(ing => (
                                <IngredientRow key={ing.productId} $insufficient={!ing.sufficient}>
                                    <IngName>{ing.name}</IngName>
                                    <IngLabel style={{ textAlign: 'right' }}>
                                        {Number(ing.quantityPerUnit).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {ing.unit}
                                    </IngLabel>
                                    <IngValue $ok={ing.sufficient}>
                                        {Number(ing.quantityNeeded).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {ing.unit}
                                    </IngValue>
                                    <IngValue $ok={ing.sufficient}>
                                        {Number(ing.quantityAvailable).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {ing.unit}
                                        {!ing.sufficient && <span style={{ fontSize: 10 }}> ⚠</span>}
                                    </IngValue>
                                </IngredientRow>
                            ))}

                            <TotalCostBox>
                                <span style={{ color: '#6D5EF4' }}>💰 Custo Estimado</span>
                                <span style={{ color: '#6D5EF4', fontSize: 18 }}>{formatCurrency(preview.estimatedTotalCost)}</span>
                            </TotalCostBox>

                            {/* Botão PDF da prévia */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                                <Button
                                    variant="secondary"
                                    onClick={() => generateProductionPDF({
                                        preview,
                                        order: null,
                                        establishment: establishment?.name,
                                        notes: modalNotes
                                    })}
                                    id="btn-pdf-preview"
                                >
                                    <MdPictureAsPdf /> Exportar Prévia em PDF
                                </Button>
                            </div>
                        </PreviewBox>
                    )}

                    {/* Observações */}
                    <Input
                        label="Observações (opcional)"
                        id="textarea-notas-producao"
                        placeholder="Ex: Lote especial para evento de sábado"
                        value={modalNotes}
                        onChange={e => setModalNotes(e.target.value)}
                    />
                </div>
            </Modal>

            {/* ═══════════════════════════════════════════════════════════════
                MODAL — CONFIRMAR CONCLUSÃO
            ════════════════════════════════════════════════════════════════ */}
            <Modal
                isOpen={!!completeTarget}
                onClose={() => !processing && setCompleteTarget(null)}
                title="✅ Confirmar Produção"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => !processing && setCompleteTarget(null)} disabled={processing}>
                            Cancelar
                        </Button>
                        <Button variant="primary" onClick={handleComplete} disabled={processing} id="btn-confirmar-conclusao">
                            {processing ? <><Spinner style={{ display: 'inline-block', width: 14, height: 14, marginRight: 6 }} /> Processando...</> : <><MdCheckCircle /> Confirmar Produção</>}
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 48 }}>🏭</div>
                    <div>
                        <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                            Confirmar conclusão da produção?
                        </p>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                            Serão dadas baixas nos insumos e entrada de{' '}
                            <strong>{formatQty(completeTarget?.quantity, completeTarget?.product?.unit)}</strong> de{' '}
                            <strong>{completeTarget?.product?.name}</strong> no estoque.
                        </p>
                        <p style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 10, fontWeight: 600 }}>
                            ⚠ Esta ação não pode ser desfeita.
                        </p>
                    </div>
                </div>
            </Modal>

            {/* ═══════════════════════════════════════════════════════════════
                MODAL — CONFIRMAR CANCELAMENTO
            ════════════════════════════════════════════════════════════════ */}
            <Modal
                isOpen={!!cancelTarget}
                onClose={() => !processing && setCancelTarget(null)}
                title="❌ Cancelar Ordem"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => !processing && setCancelTarget(null)} disabled={processing}>
                            Voltar
                        </Button>
                        <Button variant="danger" onClick={handleCancel} disabled={processing} id="btn-confirmar-cancelamento">
                            {processing ? <><Spinner style={{ display: 'inline-block', width: 14, height: 14, marginRight: 6 }} /> Cancelando...</> : <><MdCancel /> Cancelar Ordem</>}
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 48 }}>🗑</div>
                    <div>
                        <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                            Cancelar esta ordem de produção?
                        </p>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                            A ordem <strong>#{cancelTarget?.id?.slice(0, 8).toUpperCase()}</strong> será cancelada.
                            Nenhum estoque será alterado.
                        </p>
                    </div>
                </div>
            </Modal>
        </Container>
    );
}

import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled, { keyframes } from "styled-components";
import { useApp } from "../context/AppContext";
import api from "../services/api";
import axios from "axios";
import toast from "react-hot-toast";
import {
    MdAdd, MdClose, MdCheckCircle, MdCancel, MdPendingActions,
    MdSearch, MdRefresh, MdContentCut, MdInfo, MdEdit, MdDelete
} from "react-icons/md";
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { Input } from '../components/FormFields';
import Select from '../components/Select';
import EmptyState from '../components/EmptyState';
import { getPortioningSourceProducts, getPortioningTargetProducts } from '../utils/portioningProducts';

const fadeIn = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); }`;

const Container = styled.div`padding: ${({ theme }) => theme.spacing.lg}; animation: ${fadeIn} 0.3s ease;`;
const PageHeader = styled.div`display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 12px; flex-wrap: wrap;`;
const TitleBlock = styled.div`display: flex; align-items: center; gap: 12px;`;
const TitleIcon = styled.div`
  width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #f59e0b, #ea580c);
  display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.4rem;
`;
const PageTitle = styled.h1`font-size: 24px; font-weight: 700; color: ${({ theme }) => theme.colors.textPrimary};`;
const PageSubtitle = styled.p`font-size: 14px; color: ${({ theme }) => theme.colors.textMuted}; margin-top: 2px;`;

const KpiGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;`;
const KpiCard = styled.div`
  background: ${({ theme }) => theme.colors.bgCard}; border-radius: 12px; padding: 20px; box-shadow: ${({ theme }) => theme.shadows.card};
  border-left: 4px solid ${({ $color }) => $color || '#f59e0b'}; display: flex; flex-direction: column; gap: 4px;
`;
const KpiLabel = styled.span`font-size: 12px; color: ${({ theme }) => theme.colors.textMuted}; text-transform: uppercase; font-weight: 600;`;
const KpiValue = styled.span`font-size: 24px; font-weight: 700; color: ${({ $color, theme }) => $color || theme.colors.textPrimary};`;

const Tabs = styled.div`display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; padding-bottom: 10px; overflow-x: auto;`;
const Tab = styled.button`
  background: ${({ $active, theme }) => $active ? theme.colors.primaryLight : 'transparent'};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textSecondary};
  font-weight: 600; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; transition: 0.2s; white-space: nowrap;
  &:hover { background: ${({ theme }) => theme.colors.primaryLight}; color: ${({ theme }) => theme.colors.primary}; }
`;

const TableHeader = styled.div`display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; gap: 12px;`;
const SearchBox = styled.div`
  display: flex; align-items: center; gap: 8px; background: ${({ theme }) => theme.colors.bgHover};
  padding: 8px 12px; border-radius: 8px; flex: 1; max-width: 300px;
  input { border: none; background: transparent; outline: none; font-size: 14px; width: 100%; color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const TableOverflow = styled.div`overflow-x: auto;`;
const Table = styled.table`width: 100%; border-collapse: collapse; min-width: 700px;`;
const Th = styled.th`text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 700; color: ${({ theme }) => theme.colors.textMuted}; text-transform: uppercase; background: ${({ theme }) => theme.colors.bgHover}; border-bottom: 1px solid ${({ theme }) => theme.colors.border};`;
const Td = styled.td`padding: 14px 16px; font-size: 14px; color: ${({ theme }) => theme.colors.textPrimary}; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; vertical-align: middle;`;
const Tr = styled.tr`&:hover { background: ${({ theme }) => theme.colors.bgHover}; } &:last-child td { border-bottom: none; }`;

const ActionRow = styled.div`display: flex; gap: 6px; align-items: center;`;

const statusConfig = {
    PENDING:   { label: 'Pendente',  variant: 'warning', icon: <MdPendingActions /> },
    COMPLETED: { label: 'Concluída', variant: 'success', icon: <MdCheckCircle /> },
    CANCELLED: { label: 'Cancelada', variant: 'danger', icon: <MdCancel /> },
};

const formatQty = (v, unit) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unit || ''}`;
const formatDate = (d) => {
    try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
};

export default function Portioning() {
    const { state } = useApp();
    const { products = [] } = state;

    // Apenas insumos podem ser desossados
    const inventoryProducts = useMemo(() => {
        return getPortioningSourceProducts(products);
    }, [products]);

    // Cortes resultantes podem ser insumos ou produtos de producao.
    // Ativos imobilizados nao representam uma saida valida de desossa.
    const targetProducts = useMemo(() => {
        return getPortioningTargetProducts(products);
    }, [products]);

    const [tab, setTab] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(false);

    // Modal de Nova Ordem
    const [showModal, setShowModal] = useState(false);
    const [modalProductId, setModalProductId] = useState('');
    const [modalQty, setModalQty] = useState('');
    const [modalNotes, setModalNotes] = useState('');
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [yields, setYields] = useState({}); // { targetProductId: quantity }
    const [submitting, setSubmitting] = useState(false);

    // Modal de Nova Ficha Técnica
    const [showRecipeModal, setShowRecipeModal] = useState(false);
    const [recipeSourceId, setRecipeSourceId] = useState('');
    const [recipeItems, setRecipeItems] = useState([]); // { id: string, targetProductId: string, percentage: string }
    const [submittingRecipe, setSubmittingRecipe] = useState(false);
    const [editingRecipe, setEditingRecipe] = useState(null);
    const [deleteRecipeTarget, setDeleteRecipeTarget] = useState(null);
    const [deletingRecipe, setDeletingRecipe] = useState(false);

    const [recipes, setRecipes] = useState([]);
    const [loadingRecipes, setLoadingRecipes] = useState(false);

    const [completeTarget, setCompleteTarget] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [processing, setProcessing] = useState(false);

    const [search, setSearch] = useState('');

    const loadOrders = useCallback(async () => {
        setLoadingOrders(true);
        try {
            const res = await api.get('/portioning/orders');
            setOrders(Array.isArray(res) ? res : []);
        } catch {
            toast.error('Erro ao carregar ordens de desossa');
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
                inventoryProducts.map(async (p) => {
                    try {
                        const res = await axios.get(`${baseURL}/portioning/recipes/product/${p.id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        const recipe = res.data?.data;
                        return { product: p, recipe };
                    } catch {
                        return { product: p, recipe: null };
                    }
                })
            );
            // Mostrar apenas os que têm ficha configurada
            setRecipes(results.filter(r => r.recipe));
        } catch (error) {
            console.error('Erro no loadRecipes:', error);
            toast.error(`Erro ao carregar fichas técnicas: ${error.message}`);
        } finally {
            setLoadingRecipes(false);
        }
    }, [inventoryProducts]);

    useEffect(() => { loadOrders(); }, [loadOrders]);
    useEffect(() => {
        if (tab === 'recipes') loadRecipes();
    }, [tab, loadRecipes]);

    // Handle product selection in modal
    useEffect(() => {
        if (modalProductId) {
            api.get(`/portioning/recipes/product/${modalProductId}`)
                .then(res => {
                    setSelectedRecipe(res || null);
                    // Reset yields
                    const initialYields = {};
                    if (res?.items) {
                        res.items.forEach(i => initialYields[i.targetProductId] = '');
                    }
                    setYields(initialYields);
                })
                .catch(() => setSelectedRecipe(null));
        } else {
            setSelectedRecipe(null);
        }
    }, [modalProductId]);

    const handleCreate = async () => {
        if (!modalProductId || !modalQty) return;
        setSubmitting(true);
        try {
            // Build items array
            const items = Object.entries(yields).map(([targetProductId, quantity]) => {
                const recipeItem = selectedRecipe?.items?.find(i => i.targetProductId === targetProductId);
                return {
                    targetProductId,
                    quantity: Number(quantity) || 0,
                    costAllocationPercentage: recipeItem?.costAllocationPercentage || 0
                };
            }).filter(i => i.quantity > 0);

            if (items.length === 0) {
                toast.error('Informe a quantidade produzida de ao menos um corte');
                return;
            }

            await api.post('/portioning/orders', {
                sourceProductId: modalProductId,
                sourceQuantity: Number(modalQty),
                notes: modalNotes,
                items
            });
            toast.success('Desossa iniciada!');
            setShowModal(false);
            setModalProductId('');
            setModalQty('');
            setModalNotes('');
            setYields({});
            loadOrders();
        } catch (e) {
            toast.error(e.message || 'Erro ao criar ordem');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddRecipeItem = () => {
        setRecipeItems([...recipeItems, { id: Math.random().toString(), targetProductId: '', percentage: '' }]);
    };

    const closeRecipeModal = () => {
        if (submittingRecipe) return;
        setShowRecipeModal(false);
        setEditingRecipe(null);
        setRecipeSourceId('');
        setRecipeItems([]);
    };

    const openNewRecipeModal = () => {
        setEditingRecipe(null);
        setRecipeSourceId('');
        setRecipeItems([]);
        setShowRecipeModal(true);
    };

    const openEditRecipeModal = (recipe) => {
        setEditingRecipe(recipe);
        setRecipeSourceId(recipe.sourceProductId);
        setRecipeItems((recipe.items || []).map(item => ({
            id: item.id,
            targetProductId: item.targetProductId,
            percentage: String(item.costAllocationPercentage)
        })));
        setShowRecipeModal(true);
    };

    const handleCreateRecipe = async () => {
        if (!recipeSourceId) {
            return toast.error('Selecione o produto de origem');
        }
        if (recipeItems.length === 0) {
            return toast.error('Adicione ao menos um corte resultante');
        }
        if (recipeItems.some(i => !i.targetProductId || !i.percentage)) {
            return toast.error('Preencha todos os campos dos cortes');
        }

        const totalPercentage = recipeItems.reduce((acc, curr) => acc + Number(curr.percentage), 0);
        if (totalPercentage !== 100) {
            return toast.error(`A soma das porcentagens deve ser 100% (atual: ${totalPercentage}%)`);
        }

        setSubmittingRecipe(true);
        try {
            if (editingRecipe) {
                await api.put(`/portioning/recipes/${editingRecipe.id}`, {
                    items: recipeItems.map(item => ({
                        targetProductId: item.targetProductId,
                        costAllocationPercentage: Number(item.percentage)
                    }))
                });
            } else {
                const recipe = await api.post('/portioning/recipes', { sourceProductId: recipeSourceId });

                try {
                    for (const item of recipeItems) {
                        await api.post(`/portioning/recipes/${recipe.id}/items`, {
                            targetProductId: item.targetProductId,
                            costAllocationPercentage: Number(item.percentage)
                        });
                    }
                } catch (error) {
                    await api.delete(`/portioning/recipes/${recipe.id}`).catch(() => undefined);
                    throw error;
                }
            }

            toast.success(editingRecipe ? 'Ficha atualizada com sucesso!' : 'Ficha Técnica criada com sucesso!');
            setShowRecipeModal(false);
            setEditingRecipe(null);
            setRecipeSourceId('');
            setRecipeItems([]);
            loadRecipes();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao criar ficha técnica');
        } finally {
            setSubmittingRecipe(false);
        }
    };

    const handleDeleteRecipe = async () => {
        if (!deleteRecipeTarget) return;
        setDeletingRecipe(true);
        try {
            await api.delete(`/portioning/recipes/${deleteRecipeTarget.id}`);
            toast.success('Ficha excluída com sucesso!');
            setDeleteRecipeTarget(null);
            loadRecipes();
        } catch (e) {
            toast.error(e.message || 'Erro ao excluir ficha');
        } finally {
            setDeletingRecipe(false);
        }
    };

    const handleComplete = async () => {
        if (!completeTarget) return;
        setProcessing(true);
        try {
            await api.patch(`/portioning/orders/${completeTarget.id}/complete`);
            toast.success('Desossa concluída!');
            setCompleteTarget(null);
            loadOrders();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao concluir ordem');
        } finally {
            setProcessing(false);
        }
    };

    const handleCancel = async () => {
        if (!cancelTarget) return;
        setProcessing(true);
        try {
            await api.patch(`/portioning/orders/${cancelTarget.id}/cancel`);
            toast.success('Desossa cancelada!');
            setCancelTarget(null);
            loadOrders();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao cancelar ordem');
        } finally {
            setProcessing(false);
        }
    };

    const kpiPending = orders.filter(o => o.status === 'PENDING').length;
    const kpiCompleted = orders.filter(o => o.status === 'COMPLETED').length;
    const kpiTotal = orders.length;

    const filteredOrders = orders.filter(o => 
        (tab === 'orders' || o.status === tab) &&
        (o.sourceProduct?.name?.toLowerCase().includes(search.toLowerCase()) || o.id.includes(search))
    );

    return (
        <Container>
            <PageHeader>
                <TitleBlock>
                    <TitleIcon><MdContentCut /></TitleIcon>
                    <div>
                        <PageTitle>Porcionamento (Desossa)</PageTitle>
                        <PageSubtitle>Fracione itens inteiros e distribua os custos de acordo com o rendimento</PageSubtitle>
                    </div>
                </TitleBlock>
                <Button variant="primary" onClick={() => setShowModal(true)}>
                    <MdAdd /> Novo Porcionamento
                </Button>
            </PageHeader>

            <KpiGrid>
                <KpiCard $color="#f59e0b"><KpiLabel>Total de Ordens</KpiLabel><KpiValue>{kpiTotal}</KpiValue></KpiCard>
                <KpiCard $color="#f59e0b"><KpiLabel>Pendentes</KpiLabel><KpiValue $color="#f59e0b">{kpiPending}</KpiValue></KpiCard>
                <KpiCard $color="#10b981"><KpiLabel>Concluídas</KpiLabel><KpiValue $color="#10b981">{kpiCompleted}</KpiValue></KpiCard>
            </KpiGrid>

            <Tabs>
                {[{ key: 'orders', label: 'Todas as Ordens' }, { key: 'PENDING', label: 'Pendentes' }, { key: 'COMPLETED', label: 'Concluídas' }, { key: 'CANCELLED', label: 'Canceladas' }, { key: 'recipes', label: '📋 Fichas Técnicas' }].map(t => (
                    <Tab key={t.key} $active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</Tab>
                ))}
            </Tabs>

            {tab !== 'recipes' && (
                <Card>
                    <TableHeader>
                        <SearchBox>
                            <MdSearch />
                            <input placeholder="Buscar ordem..." value={search} onChange={e => setSearch(e.target.value)} />
                        </SearchBox>
                        <Button variant="secondary" onClick={loadOrders}><MdRefresh /></Button>
                    </TableHeader>

                    <TableOverflow>
                        <Table>
                            <thead>
                                <tr>
                                    <Th>ID</Th>
                                    <Th>Origem</Th>
                                    <Th>Qtd Original</Th>
                                    <Th>Status</Th>
                                    <Th>Criado por</Th>
                                    <Th>Data</Th>
                                    <Th>Ações</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingOrders ? (
                                    <tr><Td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>Carregando...</Td></tr>
                                ) : filteredOrders.length === 0 ? (
                                    <tr><Td colSpan={7}><EmptyState title="Nenhuma ordem encontrada" subtitle="Clique em 'Novo Porcionamento' para começar" /></Td></tr>
                                ) : filteredOrders.map(order => {
                                    const s = statusConfig[order.status] || {};
                                    return (
                                        <Tr key={order.id}>
                                            <Td style={{ fontFamily: 'monospace', fontSize: 12 }}>#{order.id.slice(0, 8).toUpperCase()}</Td>
                                            <Td><strong>{order.sourceProduct?.name}</strong></Td>
                                            <Td><strong>{formatQty(order.sourceQuantity, order.sourceProduct?.unit)}</strong></Td>
                                            <Td><Badge variant={s.variant}><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{s.icon} {s.label}</div></Badge></Td>
                                            <Td>{order.user?.name || '-'}</Td>
                                            <Td style={{ fontSize: 12 }}>{formatDate(order.createdAt)}</Td>
                                            <Td>
                                                <ActionRow>
                                                    {order.status === 'PENDING' && (
                                                        <>
                                                            <Button variant="success" onClick={() => setCompleteTarget(order)}>Concluir</Button>
                                                            <Button variant="danger" onClick={() => setCancelTarget(order)}><MdCancel /></Button>
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
            )}

            {tab === 'recipes' && (
                <Card style={{ padding: 0 }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid', borderColor: 'inherit', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Fichas de Desossa Ativas</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button variant="secondary" onClick={loadRecipes}><MdRefresh /></Button>
                            <Button variant="primary" onClick={openNewRecipeModal}>+ Nova Ficha</Button>
                        </div>
                    </div>
                    {loadingRecipes ? (
                        <div style={{ textAlign: 'center', padding: 40 }}>Carregando...</div>
                    ) : recipes.length === 0 ? (
                        <EmptyState title="Nenhuma ficha técnica cadastrada" subtitle="Clique em Nova Ficha para configurar as regras de desossa." />
                    ) : (
                        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {recipes.map(({ product, recipe }) => (
                                <div key={product.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{product.name} ({product.unit})</div>
                                        <ActionRow>
                                            <Button variant="secondary" onClick={() => openEditRecipeModal(recipe)}><MdEdit /> Editar</Button>
                                            <Button variant="danger" onClick={() => setDeleteRecipeTarget(recipe)}><MdDelete /> Excluir</Button>
                                        </ActionRow>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                                        {recipe?.items?.map(i => (
                                            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, background: '#f8fafc', padding: '6px 12px', borderRadius: 6 }}>
                                                <span>↳ {i.targetProduct?.name}</span>
                                                <span style={{ fontWeight: 600, color: '#f59e0b' }}>{i.costAllocationPercentage}% custo</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="✂️ Nova Ordem de Porcionamento" footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button><Button variant="primary" onClick={handleCreate} disabled={submitting || !modalProductId || !modalQty}>Criar Ordem</Button></>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <Select label="Produto Inteiro (Origem) *" value={modalProductId} onChange={setModalProductId} options={[{ value: "", label: "-- Selecione --" }, ...inventoryProducts.map(p => ({ value: p.id, label: `${p.name} (${p.unit})` }))]} />
                    <Input label="Peso Original (Quantidade de Origem) *" type="number" step="0.001" value={modalQty} onChange={e => setModalQty(e.target.value)} />
                    
                    {selectedRecipe ? (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 16 }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: 13, color: '#b45309' }}>Rendimentos Esperados (Informe o peso gerado para cada corte)</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {selectedRecipe.items?.map(i => (
                                    <Input key={i.id} label={`${i.targetProduct?.name} (${i.targetProduct?.unit}) - ${i.costAllocationPercentage}% custo`} type="number" step="0.001" value={yields[i.targetProductId] || ''} onChange={e => setYields({ ...yields, [i.targetProductId]: e.target.value })} />
                                ))}
                            </div>
                        </div>
                    ) : modalProductId ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#ef4444', background: '#fee2e2', padding: '8px 12px', borderRadius: 8 }}>
                            <MdInfo /> Este produto não possui uma ficha de desossa configurada.
                        </div>
                    ) : null}

                    <Input label="Observações" value={modalNotes} onChange={e => setModalNotes(e.target.value)} />
                </div>
            </Modal>

            <Modal
                isOpen={!!deleteRecipeTarget}
                onClose={() => !deletingRecipe && setDeleteRecipeTarget(null)}
                title="Excluir Ficha de Desossa"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteRecipeTarget(null)} disabled={deletingRecipe}>Cancelar</Button>
                        <Button variant="danger" onClick={handleDeleteRecipe} disabled={deletingRecipe}>
                            {deletingRecipe ? 'Excluindo...' : 'Excluir Ficha'}
                        </Button>
                    </>
                }
            >
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
                    A ficha de <strong>{deleteRecipeTarget?.sourceProduct?.name}</strong> e seus cortes serão excluídos.
                    Ordens de porcionamento já registradas não serão alteradas.
                </p>
            </Modal>

            <Modal isOpen={!!completeTarget} onClose={() => !processing && setCompleteTarget(null)} title="✅ Concluir Desossa" footer={<><Button variant="secondary" onClick={() => !processing && setCompleteTarget(null)} disabled={processing}>Cancelar</Button><Button variant="primary" onClick={handleComplete} disabled={processing}>Confirmar</Button></>}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 48 }}>✂️</div>
                    <div>
                        <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Confirmar conclusão da desossa?</p>
                        <p style={{ color: '#64748b', fontSize: 14 }}>Será dada baixa de <strong>{formatQty(completeTarget?.sourceQuantity, completeTarget?.sourceProduct?.unit)}</strong> de <strong>{completeTarget?.sourceProduct?.name}</strong> e as entradas dos cortes gerados no estoque. Esta ação não pode ser desfeita.</p>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={!!cancelTarget} onClose={() => !processing && setCancelTarget(null)} title="❌ Cancelar Desossa" footer={<><Button variant="secondary" onClick={() => !processing && setCancelTarget(null)} disabled={processing}>Voltar</Button><Button variant="danger" onClick={handleCancel} disabled={processing}>Cancelar Ordem</Button></>}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 48 }}>🗑</div>
                    <div>
                        <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Cancelar esta ordem de desossa?</p>
                        <p style={{ color: '#64748b', fontSize: 14 }}>A ordem <strong>#{cancelTarget?.id?.slice(0, 8).toUpperCase()}</strong> será cancelada e não afetará o estoque.</p>
                    </div>
                </div>
            </Modal>

            <Modal 
                isOpen={showRecipeModal} 
                onClose={closeRecipeModal}
                title={editingRecipe ? "Editar Ficha de Desossa" : "📑 Nova Ficha de Desossa"}
                footer={
                    <>
                        <Button variant="secondary" onClick={closeRecipeModal}>Cancelar</Button>
                        <Button variant="primary" onClick={handleCreateRecipe} disabled={submittingRecipe}>
                            {submittingRecipe ? 'Salvando...' : (editingRecipe ? 'Salvar Alterações' : 'Salvar Ficha')}
                        </Button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {editingRecipe ? (
                        <Input
                            label="Produto Inteiro (Origem)"
                            value={editingRecipe.sourceProduct?.name || ''}
                            disabled
                        />
                    ) : (
                        <Select
                            label="Produto Inteiro (Origem) *"
                            value={recipeSourceId}
                            onChange={setRecipeSourceId}
                            options={[{ value: "", label: "Selecione o insumo..." }, ...inventoryProducts.map(p => ({ value: p.id, label: p.name }))]}
                        />
                    )}

                    <div style={{ marginTop: 8, marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Cortes Resultantes (Destino) *</div>
                    
                    {recipeItems.map((item, index) => (
                        <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                            <div style={{ flex: 1 }}>
                                <Select 
                                    label={`Corte ${index + 1}`}
                                    value={item.targetProductId} 
                                    onChange={val => {
                                        const newItems = [...recipeItems];
                                        newItems[index].targetProductId = val;
                                        setRecipeItems(newItems);
                                    }}
                                    options={[{ value: "", label: "Selecione o corte..." }, ...targetProducts.filter(p => p.id !== recipeSourceId).map(p => ({ value: p.id, label: p.name }))]}
                                />
                            </div>
                            <div style={{ width: 120 }}>
                                <Input 
                                    label="% Custo"
                                    type="number" 
                                    placeholder="Ex: 40" 
                                    value={item.percentage}
                                    onChange={e => {
                                        const newItems = [...recipeItems];
                                        newItems[index].percentage = e.target.value;
                                        setRecipeItems(newItems);
                                    }}
                                />
                            </div>
                            <Button 
                                variant="danger" 
                                onClick={() => setRecipeItems(recipeItems.filter((_, i) => i !== index))}
                                style={{ padding: '8px 12px', height: 40, marginBottom: 2 }}
                            >
                                <MdClose />
                            </Button>
                        </div>
                    ))}

                    <Button variant="secondary" onClick={handleAddRecipeItem} style={{ width: '100%', marginTop: 8 }}>
                        + Adicionar Corte
                    </Button>
                </div>
            </Modal>
        </Container>
    );
}

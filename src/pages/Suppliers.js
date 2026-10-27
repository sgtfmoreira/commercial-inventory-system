import { InputControl } from '../components/FormFields';
import React, { useState } from 'react';
import styled from 'styled-components';
import { MdAdd, MdEdit, MdDelete, MdSearch, MdBusiness } from 'react-icons/md';
import { useApp, ACTIONS } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Input } from '../components/FormFields';
import Badge from '../components/Badge';
import api from '../services/api';
import toast from "react-hot-toast";
// ─── Constants ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = { name: '', cnpj: '', phone: '', email: '' };

// ─── Styled ────────────────────────────────────────────────────────────────────
const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};

  @media (max-width: 480px) {
    flex-direction: column;
    align-items: stretch;
    
    button {
      width: 100%;
      justify-content: center;
    }
  }
`;

const PageTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`;

const PageSubtitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  margin-top: 4px;
`;

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${({ theme }) => theme.colors.bgInput};
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 9px 14px;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  transition: ${({ theme }) => theme.transition};
  &:focus-within {
    border-color: ${({ theme }) => theme.colors.borderFocus};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primaryGlow};
  }
`;

const SearchInput = styled(InputControl)`
  background: none;
  border: none;
  outline: none;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  width: 100%;
  &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: ${({ theme }) => theme.spacing.lg};
`;

const SupplierCard = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  transition: ${({ theme }) => theme.transition};
  cursor: default;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const CardHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Avatar = styled.div`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.primaryLight};
  color: ${({ theme }) => theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  flex-shrink: 0;
`;

const SupplierName = styled.h3`
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FieldRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FieldLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const FieldValue = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const CardActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const FormGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const LinkedBadge = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.textMuted};
`;

// ─── Component ─────────────────────────────────────────────────────────────────
const Suppliers = () => {
    const { state, dispatch } = useApp();

    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [deleteModal, setDeleteModal] = useState(null);
    const [editTarget, setEditTarget] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    const filtered = state.suppliers.filter(
        (s) =>
            s?.name?.toLowerCase().includes(search.toLowerCase()) ||
            s?.cnpj?.includes(search) ||
            s?.email?.toLowerCase().includes(search.toLowerCase())
    );

    const getLinkedProducts = (supplierId) =>
        state.products.filter((p) => p.supplierId === supplierId).length;

    const validate = () => {
        const e = {};
        if (!form.name.trim()) e.name = 'Campo obrigatório';
        if (!form.cnpj.trim()) e.cnpj = 'Campo obrigatório';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const openAdd = () => {
        setEditTarget(null);
        setForm(EMPTY_FORM);
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (s) => {
        setEditTarget(s);
        setForm({ name: s.name, cnpj: s.cnpj, phone: s.phone || '', email: s.email || '' });
        setErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!validate()) return;

        try {

            if (editTarget) {

                const res = await api.put(`/suppliers/${editTarget.id}`, form);

                dispatch({
                    type: ACTIONS.UPDATE_SUPPLIER,
                    payload: res
                });

            } else {

                const res = await api.post('/suppliers', form);

                dispatch({
                    type: ACTIONS.ADD_SUPPLIER,
                    payload: res
                });

            }
            toast.success(editTarget ? 'Fornecedor atualizado com sucesso' : 'Fornecedor criado com sucesso');
            setModalOpen(false);

        } catch (err) {
            const status = err.response?.status;
            const message = err.response?.data?.message;

            if (status === 403) {
                toast.error('Você não tem permissão para essa ação');
            } else {
                toast.error(message || 'Erro ao salvar fornecedor');
            }

            console.error("Erro ao salvar fornecedor:", err);
        }
    };

    const handleDelete = async () => {
        try {

            await api.delete(`/suppliers/${deleteModal.id}`);

            dispatch({
                type: ACTIONS.DELETE_SUPPLIER,
                payload: deleteModal.id
            });
            toast.success('Fornecedor excluído com sucesso');
            setDeleteModal(null);

        } catch (err) {
            const status = err.response?.status;
            const message = err.response?.data?.message;

            if (status === 403) {
                toast.error('Você não tem permissão para essa ação');
            } else {
                toast.error(message || 'Erro ao deletar fornecedor');
            }

            console.error("Erro ao deletar fornecedor:", err);
        }
    };

    const field = (key) => ({
        value: form[key],
        onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
        error: errors[key],
    });

    return (
        <>
            <PageHeader>
                <div>
                    <PageTitle>Fornecedores</PageTitle>
                    <PageSubtitle>{state.suppliers.length} fornecedor(es) cadastrado(s)</PageSubtitle>
                </div>
                <Button onClick={openAdd}>
                    <MdAdd /> Novo Fornecedor
                </Button>
            </PageHeader>

            <SearchBox>
                <MdSearch color="#555a72" />
                <SearchInput
                    placeholder="Buscar por nome, CNPJ ou e-mail..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </SearchBox>

            {filtered.length === 0 ? (
                <EmptyState
                    icon={<MdBusiness />}
                    title="Nenhum fornecedor encontrado"
                    subtitle="Cadastre fornecedores e vincule-os aos seus produtos."
                />
            ) : (
                <Grid>
                    {filtered.map((s) => {
                        const linked = getLinkedProducts(s.id);
                        return (
                            <SupplierCard key={s.id}>
                                <CardHead>
                                    <Avatar><MdBusiness /></Avatar>
                                    <div>
                                        <SupplierName>{s.name}</SupplierName>
                                        <LinkedBadge>
                                            {linked > 0 ? (
                                                <Badge variant="info">{linked} produto(s) vinculado(s)</Badge>
                                            ) : (
                                                <span>Sem produtos vinculados</span>
                                            )}
                                        </LinkedBadge>
                                    </div>
                                </CardHead>

                                <FieldRow>
                                    <FieldLabel>CNPJ</FieldLabel>
                                    <FieldValue>{s.cnpj}</FieldValue>
                                </FieldRow>

                                {s.phone && (
                                    <FieldRow>
                                        <FieldLabel>Telefone</FieldLabel>
                                        <FieldValue>{s.phone}</FieldValue>
                                    </FieldRow>
                                )}

                                {s.email && (
                                    <FieldRow>
                                        <FieldLabel>E-mail</FieldLabel>
                                        <FieldValue>{s.email}</FieldValue>
                                    </FieldRow>
                                )}

                                <FieldRow>
                                    <FieldLabel>Cadastrado em</FieldLabel>
                                    <FieldValue>{new Date(s.createdAt).toLocaleDateString('pt-BR')}</FieldValue>
                                </FieldRow>

                                <CardActions>
                                    <Button variant="secondary" size="sm" fullWidth onClick={() => openEdit(s)}>
                                        <MdEdit /> Editar
                                    </Button>
                                    <Button variant="danger" size="sm" fullWidth onClick={() => setDeleteModal(s)}>
                                        <MdDelete /> Excluir
                                    </Button>
                                </CardActions>
                            </SupplierCard>
                        );
                    })}
                </Grid>
            )}

            {/* Add/Edit Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editTarget ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSubmit}>{editTarget ? 'Salvar' : 'Criar Fornecedor'}</Button>
                    </>
                }
            >
                <FormGrid>
                    <Input label="Nome do Fornecedor *" placeholder="Razão Social" {...field('name')} />
                    <Input label="CNPJ *" placeholder="00.000.000/0001-00" {...field('cnpj')} />
                    <Input label="Telefone" placeholder="(11) 99999-9999" {...field('phone')} />
                    <Input label="E-mail" type="email" placeholder="contato@fornecedor.com" {...field('email')} />
                </FormGrid>
            </Modal>

            {/* Delete Confirm */}
            <Modal
                isOpen={!!deleteModal}
                onClose={() => setDeleteModal(null)}
                title="Confirmar Exclusão"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={handleDelete}>Excluir</Button>
                    </>
                }
            >
                <p style={{ color: '#4B5563', lineHeight: 1.7 }}>
                    Tem certeza que deseja excluir o fornecedor{' '}
                    <strong style={{ color: 'var(--color-text)' }}>{deleteModal?.name}</strong>?
                </p>
            </Modal>
        </>
    );
};

export default Suppliers;

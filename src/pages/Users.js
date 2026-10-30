import DataTable from '../components/Table';
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { MdAdd, MdDelete, MdEdit } from 'react-icons/md';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useApp } from '../context/AppContext';

import Modal from '../components/Modal';
import Button from '../components/Button';
import Card from '../components/Card';
import { Input } from '../components/FormFields';
import Select from '../components/Select';

/* -------------------------------------------------------------------------- */
/* Styled UI                                   */
/* -------------------------------------------------------------------------- */

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl};
  gap: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const Table = styled(DataTable)`
  width: 100%;
  border-collapse: collapse;

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px;
  }
`;

const Th = styled.th`
  text-align: left;
  padding: 16px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  background: ${({ theme }) => theme.colors.bgHover};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    display: none;
  }
`;

const Tr = styled.tr`
  transition: all 0.2s;
  &:hover { background: ${({ theme }) => theme.colors.bgHover}; }

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 12px;
    padding: 12px;
  }
`;

const Td = styled.td`
  padding: 16px;
  font-size: 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-primary-surface);
    width: 100%;

    &:before {
      content: attr(data-label);
      font-weight: 700;
      font-size: 11px;
      color: ${({ theme }) => theme.colors.textMuted};
      text-transform: uppercase;
    }

    &:last-child { 
        border-bottom: none; 
        padding-top: 12px;
    }
  }
`;

const RoleBadge = styled.span`
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  background: ${({ role }) => (role === 'ADMIN' ? '#E0E7FF' : '#F3E8FF')};
  color: ${({ role }) => (role === 'ADMIN' ? '#4338CA' : '#7E22CE')};
`;

const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const ROLE_LABELS = {
    ADMIN: 'Administrador',
    MANAGER: 'Gerente',
    STOCK_COUNTER: 'Contador de estoque',
    STAFF: 'Equipe'
};

/* -------------------------------------------------------------------------- */
/* Component                                   */
/* -------------------------------------------------------------------------- */

export default function Users() {
    const { state } = useApp();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

    const loadUsers = async () => {
        try {
            const res = await api.get('/users');
            setUsers(res.data || res || []);
        } catch (err) {
            console.error('Erro ao carregar usuários:', err);
            // 🔥 tratamento de permissão
            if (err.response?.status === 403) {
                alert('Você não tem permissão para visualizar usuários');
            }
            // 🔥 fallback para não quebrar UI
            setUsers([]);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleDelete = async (user) => {
        if (user.id === state.user?.id) {
            toast.error('Você não pode excluir o próprio usuário.');
            return;
        }
        if (!window.confirm(`Excluir o acesso de ${user.name} em toda a organização? O histórico será preservado.`)) return;

        setDeletingId(user.id);
        try {
            await api.delete(`/users/${user.id}`);
            await loadUsers();
            toast.success('Acesso do usuário excluído.');
        } catch (error) {
            toast.error(error.message || 'Não foi possível excluir o usuário.');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div>
            <PageHeader>
                <div>
                    <Title>Usuários</Title>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
                        Gerencie os acessos da sua equipe
                    </p>
                </div>

                <Button
                    onClick={() => setShowCreateModal(true)}
                    style={{ width: window.innerWidth < 768 ? "100%" : "auto" }}
                >
                    <MdAdd size={20} />
                    Criar Usuário
                </Button>
            </PageHeader>

            <Card padding="0">
                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <Th>Nome</Th>
                                <Th>Email</Th>
                                <Th>Perfil de Acesso</Th>
                                <Th>Ações</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr>
                                    <Td colSpan="4" style={{ textAlign: "center", padding: "40px", color: "var(--color-text-secondary)" }}>
                                        Nenhum usuário encontrado.
                                    </Td>
                                </tr>
                            ) : (
                                users.map(user => (
                                    <Tr key={user.id}>
                                        <Td data-label="Nome">
                                            <strong>{user.name}</strong>
                                        </Td>

                                        <Td data-label="Email">
                                            {user.email}
                                        </Td>

                                        <Td data-label="Perfil de Acesso">
                                            <RoleBadge role={user.role}>
                                                {ROLE_LABELS[user.role] || user.role}
                                            </RoleBadge>
                                        </Td>

                                        <Td data-label="Ações">
                                            <ActionButtons>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedUser(user);
                                                        setShowEditModal(true);
                                                    }}
                                                >
                                                    <MdEdit size={16} />
                                                    Editar
                                                </Button>
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    loading={deletingId === user.id}
                                                    loadingLabel="Excluindo"
                                                    disabled={user.id === state.user?.id || Boolean(deletingId)}
                                                    title={user.id === state.user?.id ? 'Você não pode excluir o próprio usuário' : undefined}
                                                    onClick={() => handleDelete(user)}
                                                >
                                                    <MdDelete size={16} />
                                                    Excluir
                                                </Button>
                                            </ActionButtons>
                                        </Td>
                                    </Tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </TableWrapper>
            </Card>

            {/* MODAL CRIAR */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Criar Novo Usuário"
                style={{ maxWidth: "450px" }}
            >
                <CreateUserForm
                    onClose={() => setShowCreateModal(false)}
                    onCreated={loadUsers}
                />
            </Modal>

            {/* MODAL EDITAR */}
            <Modal
                isOpen={showEditModal}
                onClose={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                }}
                title="Editar Usuário"
                style={{ maxWidth: "450px" }}
            >
                {selectedUser && (
                    <EditUserForm
                        user={selectedUser}
                        isCurrentUser={selectedUser.id === state.user?.id}
                        onClose={() => setShowEditModal(false)}
                        onUpdated={loadUsers}
                    />
                )}
            </Modal>
        </div>
    );
}

/* ========================= */
/* CREATE USER FORM */
/* ========================= */

function CreateUserForm({ onClose, onCreated }) {
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        role: 'STOCK_COUNTER'
    });
    const [saving, setSaving] = useState(false);

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async () => {
        if (!form.name || !form.email || !form.password) {
            toast.error('Preencha todos os campos obrigatórios.');
            return;
        }
        if (form.password.length < 6) {
            toast.error('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setSaving(true);
        try {
            await api.post('/users', form);
            await onCreated();
            onClose();
            toast.success('Usuário criado com sucesso.');

        } catch (err) {
            console.error('Erro ao criar usuário:', err);
            toast.error(err.message || 'Erro ao criar usuário.');
        } finally {
            setSaving(false);
        }
    };
    return (
        <>
            <FormContainer>
                <Input
                    label="Nome Completo"
                    name="name"
                    placeholder="Ex: João da Silva"
                    value={form.name}
                    onChange={handleChange}
                />

                <Input
                    label="E-mail"
                    name="email"
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={form.email}
                    onChange={handleChange}
                />

                <Input
                    label="Senha"
                    name="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={handleChange}
                />

                <Select
                    label="Nível de Acesso"
                    name="role"
                    value={form.role}
                    onChange={(val) => setForm({ ...form, role: val })}
                    options={[
                        { value: 'ADMIN', label: 'Administrador' },
                        { value: 'STOCK_COUNTER', label: 'Gerente' }
                    ]}
                />
            </FormContainer>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <Button variant="secondary" onClick={onClose} fullWidth>
                    Cancelar
                </Button>
                <Button variant="primary" onClick={handleSubmit} loading={saving} loadingLabel="Salvando" fullWidth>
                    Criar Usuário
                </Button>
            </div>
        </>
    );
}

/* ========================= */
/* EDIT USER FORM */
/* ========================= */

function EditUserForm({ user, isCurrentUser, onClose, onUpdated }) {
    const [form, setForm] = useState({
        name: user.name || '',
        email: user.email || '',
        role: user.role || 'STOCK_COUNTER',
        password: '',
        passwordConfirmation: ''
    });
    const [saving, setSaving] = useState(false);

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async () => {
        if (form.password && form.password.length < 6) {
            toast.error('A nova senha deve ter pelo menos 6 caracteres.');
            return;
        }
        if (form.password !== form.passwordConfirmation) {
            toast.error('A confirmação da nova senha não confere.');
            return;
        }

        setSaving(true);
        try {
            const { passwordConfirmation, ...payload } = form;
            if (!payload.password) delete payload.password;
            await api.put(`/users/${user.id}`, payload);
            await onUpdated();
            onClose();
            toast.success(payload.password ? 'Usuário e senha atualizados.' : 'Usuário atualizado.');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Erro ao atualizar usuário');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <FormContainer>
                <Input
                    label="Nome Completo"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                />

                <Input
                    label="E-mail"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                />

                <Select
                    label="Nível de Acesso"
                    name="role"
                    value={form.role}
                    onChange={(val) => setForm({ ...form, role: val })}
                    isDisabled={isCurrentUser}
                    helperText={isCurrentUser ? 'Seu próprio perfil de administrador não pode ser removido.' : undefined}
                    options={[
                        { value: 'ADMIN', label: 'Administrador' },
                        { value: 'STOCK_COUNTER', label: 'Gerente' }
                    ]}
                />

                <Input
                    label="Nova senha (opcional)"
                    name="password"
                    type="password"
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    value={form.password}
                    onChange={handleChange}
                />

                <Input
                    label="Confirmar nova senha"
                    name="passwordConfirmation"
                    type="password"
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    value={form.passwordConfirmation}
                    onChange={handleChange}
                />
            </FormContainer>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <Button variant="secondary" onClick={onClose} fullWidth>
                    Cancelar
                </Button>
                <Button variant="primary" onClick={handleSubmit} loading={saving} loadingLabel="Salvando" fullWidth>
                    Salvar Alterações
                </Button>
            </div>
        </>
    );
}

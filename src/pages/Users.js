import DataTable from '../components/Table';
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { MdAdd, MdEdit } from 'react-icons/md';
import api from '../services/api';

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

/* -------------------------------------------------------------------------- */
/* Component                                   */
/* -------------------------------------------------------------------------- */

export default function Users() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);

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
                                                {user.role === 'ADMIN' ? 'Administrador' : 'Gerente'}
                                            </RoleBadge>
                                        </Td>

                                        <Td data-label="Ações">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                fullWidth={window.innerWidth < 768}
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setShowEditModal(true);
                                                }}
                                            >
                                                <MdEdit size={16} />
                                                Editar
                                            </Button>
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
        // 1. Validação de campos do formulário
        if (!form.name || !form.email || !form.password) {
            alert("Preencha todos os campos obrigatórios.");
            return;
        }

        setSaving(true);
        try {
            // 2. Lógica baseada EXATAMENTE na sua imagem do LocalStorage
            const raw = localStorage.getItem('establishments'); // Nome da chave na sua imagem
            const establishmentsList = raw ? JSON.parse(raw) : [];

            // Pegamos o ID do primeiro estabelecimento da lista (que é o "LIGHTS" na imagem)
            const activeId = establishmentsList.length > 0 ? establishmentsList[0].id : null;

            // DEBUG: Isso vai aparecer no seu console (F12) para termos certeza
            console.log("ID capturado do LocalStorage:", activeId);

            if (!activeId) {
                alert("Erro: Não encontramos o ID do estabelecimento no seu navegador. Tente fazer login novamente.");
                setSaving(false);
                return;
            }

            // 3. Montagem do objeto de envio
            // Enviamos 'establishmentId' (singular) pois o erro do Prisma indica que o back espera um valor único
            const payload = {
                name: form.name,
                email: form.email,
                password: form.password,
                role: form.role
            };

            console.log("Enviando para o Backend:", payload);

            await api.post('/users', payload);

            onCreated();
            onClose();
            alert("Usuário criado com sucesso!");

        } catch (err) {
            console.error("Erro detalhado:", err);
            alert(err.response?.data?.error || 'Erro ao criar usuário. Verifique o console.');
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
                <Button variant="primary" onClick={handleSubmit} disabled={saving} fullWidth>
                    {saving ? "Salvando..." : "Criar Usuário"}
                </Button>
            </div>
        </>
    );
}

/* ========================= */
/* EDIT USER FORM */
/* ========================= */

function EditUserForm({ user, onClose, onUpdated }) {
    const [form, setForm] = useState({
        name: user.name || '',
        email: user.email || '',
        role: user.role || 'STOCK_COUNTER'
    });
    const [saving, setSaving] = useState(false);

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async () => {
        setSaving(true);
        try {
            console.log("ENVIANDO PUT USUÁRIO:", form);
            await api.put(`/users/${user.id}`, form);
            onUpdated();
            onClose();
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || 'Erro ao atualizar usuário');
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
                <Button variant="primary" onClick={handleSubmit} disabled={saving} fullWidth>
                    {saving ? "Salvando..." : "Salvar Alterações"}
                </Button>
            </div>
        </>
    );
}
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { MdAdd, MdBusiness, MdEdit, MdRefresh, MdWork } from 'react-icons/md';
import { useApp } from '../context/AppContext';
import operationalStructureService from '../services/operationalStructureService';
import Badge from '../components/Badge';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { Input, Select, Textarea } from '../components/FormFields';
import { Page, PageActions, PageHeader, PageHeading, PageSubtitle, PageTitle } from '../components/PageLayout';
import { Tabs, Tab } from '../components/Tabs';
import {
  TableSurface, DataTable, TableHead, TableBody, TableRow,
  TableHeaderCell, TableCell,
} from '../components/Table';

const Toolbar = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(160px, 220px) auto;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: end;
  @media (max-width: 720px) { grid-template-columns: 1fr; }
`;
const RoleToolbar = styled(Toolbar)`grid-template-columns: minmax(200px, 1fr) minmax(180px, 260px) minmax(150px, 200px) auto; @media (max-width: 900px) { grid-template-columns: 1fr 1fr; } @media (max-width: 560px) { grid-template-columns: 1fr; }`;
const Actions = styled.div`display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;`;
const FormGrid = styled.div`display: grid; gap: ${({ theme }) => theme.spacing.md};`;
const Hint = styled.p`margin: 0; color: ${({ theme }) => theme.colors.textSecondary}; font-size: ${({ theme }) => theme.fontSizes.sm};`;
const MobileCards = styled.div`
  display: none;
  @media (max-width: 720px) { display: grid; gap: ${({ theme }) => theme.spacing.sm}; }
`;
const MobileCard = styled.article`
  display: grid; gap: 10px; padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.bgCard}; box-shadow: ${({ theme }) => theme.shadows.card};
`;
const CardTop = styled.div`display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;`;
const Name = styled.strong`color: ${({ theme }) => theme.colors.textPrimary};`;
const DesktopTable = styled.div`@media (max-width: 720px) { display: none; }`;

const emptySector = { name: '', description: '' };
const emptyRole = { sectorId: '', name: '', description: '' };
const statusOptions = [
  { value: 'all', label: 'Todos os status' },
  { value: 'true', label: 'Ativos' },
  { value: 'false', label: 'Inativos' },
];

const apiFilters = filters => Object.fromEntries(
  Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined && value !== null),
);

const messageFrom = error => error?.response?.data?.message || error?.message || 'Não foi possível concluir a operação.';

export default function OperationalStructure() {
  const { state, hasCapability } = useApp();
  const [tab, setTab] = useState('sectors');
  const [sectors, setSectors] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sectorFilters, setSectorFilters] = useState({ search: '', active: 'all' });
  const [roleFilters, setRoleFilters] = useState({ search: '', sectorId: '', active: 'all' });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptySector);

  const canRead = hasCapability('operational_structure.read');
  const canManageSectors = hasCapability('operational_sectors.manage');
  const canManageRoles = hasCapability('operational_functions.manage');

  const activeSectorOptions = useMemo(() => [
    { value: '', label: 'Selecione um setor' },
    ...sectors.filter(item => item.isActive).map(item => ({ value: item.id, label: item.name })),
  ], [sectors]);
  const filterSectorOptions = useMemo(() => [
    { value: '', label: 'Todos os setores' },
    ...sectors.map(item => ({ value: item.id, label: item.name })),
  ], [sectors]);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      const [sectorData, roleData] = await Promise.all([
        operationalStructureService.listSectors(apiFilters(sectorFilters)),
        operationalStructureService.listRoles(apiFilters(roleFilters)),
      ]);
      setSectors(sectorData);
      setRoles(roleData);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }, [canRead, sectorFilters, roleFilters]);

  useEffect(() => {
    if (!state.capabilitiesLoaded) return;
    if (!canRead) { setLoading(false); return; }
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [state.capabilitiesLoaded, canRead, load]);

  const openSector = item => {
    setForm(item ? { name: item.name, description: item.description || '' } : emptySector);
    setModal({ type: 'sector', item });
  };
  const openRole = item => {
    setForm(item ? { sectorId: item.sectorId, name: item.name, description: item.description || '' } : emptyRole);
    setModal({ type: 'role', item });
  };
  const closeModal = () => { if (!saving) setModal(null); };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      if (modal.type === 'sector') {
        const payload = { name: form.name, description: form.description || null };
        if (modal.item) await operationalStructureService.updateSector(modal.item.id, { ...payload, version: modal.item.version });
        else await operationalStructureService.createSector(payload);
      } else {
        const payload = { sectorId: form.sectorId, name: form.name, description: form.description || null };
        if (modal.item) await operationalStructureService.updateRole(modal.item.id, { ...payload, version: modal.item.version });
        else await operationalStructureService.createRole(payload);
      }
      toast.success(modal.item ? 'Cadastro atualizado.' : 'Cadastro criado.');
      setModal(null);
      await load();
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleSector = async item => {
    const action = item.isActive ? 'desativar' : 'ativar';
    if (!window.confirm(`Deseja ${action} o setor “${item.name}”?`)) return;
    try {
      await operationalStructureService.setSectorStatus(item.id, { isActive: !item.isActive, version: item.version });
      toast.success(`Setor ${item.isActive ? 'desativado' : 'ativado'}.`);
      await load();
    } catch (error) { toast.error(messageFrom(error)); }
  };

  const toggleRole = async item => {
    const action = item.isActive ? 'desativar' : 'ativar';
    if (!window.confirm(`Deseja ${action} a função “${item.name}”?`)) return;
    try {
      await operationalStructureService.setRoleStatus(item.id, { isActive: !item.isActive, version: item.version });
      toast.success(`Função ${item.isActive ? 'desativada' : 'ativada'}.`);
      await load();
    } catch (error) { toast.error(messageFrom(error)); }
  };

  if (!state.capabilitiesLoaded || loading) return <Loading />;
  if (!canRead) return <EmptyState title="Acesso não autorizado" subtitle="Seu perfil não possui acesso à estrutura operacional desta unidade." />;

  const renderStatus = active => <Badge variant={active ? 'success' : 'warning'}>{active ? 'Ativo' : 'Inativo'}</Badge>;
  const renderSectorActions = item => canManageSectors && <Actions>
    <Button size="sm" variant="ghost" onClick={() => openSector(item)}><MdEdit /> Editar</Button>
    <Button size="sm" variant={item.isActive ? 'danger' : 'secondary'} onClick={() => toggleSector(item)}>{item.isActive ? 'Desativar' : 'Ativar'}</Button>
  </Actions>;
  const renderRoleActions = item => canManageRoles && <Actions>
    <Button size="sm" variant="ghost" onClick={() => openRole(item)}><MdEdit /> Editar</Button>
    <Button size="sm" variant={item.isActive ? 'danger' : 'secondary'} onClick={() => toggleRole(item)}>{item.isActive ? 'Desativar' : 'Ativar'}</Button>
  </Actions>;

  return <Page>
    <PageHeader>
      <PageHeading>
        <PageTitle>Estrutura operacional</PageTitle>
        <PageSubtitle>Organize os setores e as funções desta unidade sem alterar os perfis de acesso dos usuários.</PageSubtitle>
      </PageHeading>
      <PageActions><Button variant="outlined" onClick={load}><MdRefresh /> Atualizar</Button></PageActions>
    </PageHeader>

    <Tabs aria-label="Estrutura operacional">
      <Tab active={tab === 'sectors'} onClick={() => setTab('sectors')}>Setores</Tab>
      <Tab active={tab === 'roles'} onClick={() => setTab('roles')}>Funções</Tab>
    </Tabs>

    {tab === 'sectors' ? <>
      <Toolbar>
        <Input label="Buscar setor" value={sectorFilters.search} placeholder="Ex.: Cozinha" onChange={event => setSectorFilters(current => ({ ...current, search: event.target.value }))} />
        <Select label="Status" value={sectorFilters.active} options={statusOptions} onChange={value => setSectorFilters(current => ({ ...current, active: value }))} />
        {canManageSectors && <Button onClick={() => openSector(null)}><MdAdd /> Novo setor</Button>}
      </Toolbar>
      {sectors.length === 0 ? <EmptyState title="Nenhum setor encontrado" subtitle="Cadastre um setor para começar a organizar as funções da unidade." icon={<MdBusiness />} action={canManageSectors ? <Button onClick={() => openSector(null)}>Novo setor</Button> : null} /> : <>
        <DesktopTable><TableSurface><DataTable><TableHead><TableRow><TableHeaderCell>Setor</TableHeaderCell><TableHeaderCell>Descrição</TableHeaderCell><TableHeaderCell>Funções</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Ações</TableHeaderCell></TableRow></TableHead><TableBody>
          {sectors.map(item => <TableRow key={item.id}><TableCell><Name>{item.name}</Name></TableCell><TableCell>{item.description || '—'}</TableCell><TableCell>{item.roleCount}</TableCell><TableCell>{renderStatus(item.isActive)}</TableCell><TableCell>{renderSectorActions(item)}</TableCell></TableRow>)}
        </TableBody></DataTable></TableSurface></DesktopTable>
        <MobileCards>{sectors.map(item => <MobileCard key={item.id}><CardTop><Name>{item.name}</Name>{renderStatus(item.isActive)}</CardTop><Hint>{item.description || 'Sem descrição'}</Hint><Hint>{item.roleCount} função(ões)</Hint>{renderSectorActions(item)}</MobileCard>)}</MobileCards>
      </>}
    </> : <>
      <RoleToolbar>
        <Input label="Buscar função" value={roleFilters.search} placeholder="Ex.: Caixa" onChange={event => setRoleFilters(current => ({ ...current, search: event.target.value }))} />
        <Select label="Setor" value={roleFilters.sectorId} options={filterSectorOptions} onChange={value => setRoleFilters(current => ({ ...current, sectorId: value }))} />
        <Select label="Status" value={roleFilters.active} options={statusOptions} onChange={value => setRoleFilters(current => ({ ...current, active: value }))} />
        {canManageRoles && <Button onClick={() => openRole(null)} disabled={!activeSectorOptions.slice(1).length}><MdAdd /> Nova função</Button>}
      </RoleToolbar>
      {roles.length === 0 ? <EmptyState title="Nenhuma função encontrada" subtitle="Cadastre uma função vinculada a um setor ativo." icon={<MdWork />} action={canManageRoles && activeSectorOptions.slice(1).length ? <Button onClick={() => openRole(null)}>Nova função</Button> : null} /> : <>
        <DesktopTable><TableSurface><DataTable><TableHead><TableRow><TableHeaderCell>Função</TableHeaderCell><TableHeaderCell>Setor</TableHeaderCell><TableHeaderCell>Descrição</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Ações</TableHeaderCell></TableRow></TableHead><TableBody>
          {roles.map(item => <TableRow key={item.id}><TableCell><Name>{item.name}</Name></TableCell><TableCell>{item.sector?.name || '—'}</TableCell><TableCell>{item.description || '—'}</TableCell><TableCell>{renderStatus(item.isActive)}</TableCell><TableCell>{renderRoleActions(item)}</TableCell></TableRow>)}
        </TableBody></DataTable></TableSurface></DesktopTable>
        <MobileCards>{roles.map(item => <MobileCard key={item.id}><CardTop><Name>{item.name}</Name>{renderStatus(item.isActive)}</CardTop><Hint>Setor: {item.sector?.name || '—'}</Hint><Hint>{item.description || 'Sem descrição'}</Hint>{renderRoleActions(item)}</MobileCard>)}</MobileCards>
      </>}
    </>}

    <Modal isOpen={Boolean(modal)} onClose={closeModal} title={`${modal?.item ? 'Editar' : 'Novo'} ${modal?.type === 'role' ? 'função' : 'setor'}`} footer={<><Button variant="outlined" onClick={closeModal} disabled={saving}>Cancelar</Button><Button type="submit" form="operational-structure-form" loading={saving}>Salvar</Button></>}>
      <FormGrid as="form" id="operational-structure-form" onSubmit={submit}>
        {modal?.type === 'role' && <Select label="Setor" required value={form.sectorId || ''} options={activeSectorOptions} onChange={value => setForm(current => ({ ...current, sectorId: value }))} />}
        <Input label="Nome" required maxLength={120} value={form.name || ''} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
        <Textarea label="Descrição" maxLength={modal?.type === 'role' ? 1000 : 500} value={form.description || ''} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
        <Hint>Este cadastro organiza a operação. Ele não concede permissões nem altera o usuário.</Hint>
      </FormGrid>
    </Modal>
  </Page>;
}

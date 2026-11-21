import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import {
  MdAdd, MdDelete, MdEdit, MdHistory, MdLockOutline,
  MdManageAccounts, MdPersonSearch, MdPreview, MdSecurity,
} from 'react-icons/md';
import { useApp } from '../context/AppContext';
import userAccessService from '../services/userAccessService';
import Button from '../components/Button';
import Card, { StatCard } from '../components/Card';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { CheckboxControl, Input, Select } from '../components/FormFields';
import {
  Page, PageActions, PageHeader, PageHeading, PageSubtitle, PageTitle,
} from '../components/PageLayout';

export const USER_LIMIT = 10;
export const LEGACY_ROLE_LABELS = Object.freeze({
  ADMIN: 'Administrador LEGACY',
  MANAGER: 'Gerente',
  STOCK_COUNTER: 'Contador de estoque',
  STAFF: 'Equipe',
});
export const PROFILE_LABELS = Object.freeze({
  OWNER: 'Proprietário',
  ADMINISTRATOR: 'Administrador',
  MANAGER: 'Gerente',
  SUPERVISOR: 'Supervisor',
  COLLABORATOR: 'Colaborador',
  AUDITOR: 'Auditor / Consultor',
});

const LEGACY_OPTIONS = Object.entries(LEGACY_ROLE_LABELS).map(([value, label]) => ({ value, label }));
const VERIFICATION_OPTIONS = [
  { value: 'ASSISTED_VERIFICATION', label: 'Verificação assistida' },
  { value: 'LEGAL_DOCUMENT_REVIEW', label: 'Revisão documental' },
  { value: 'CONTRACT_VERIFICATION', label: 'Verificação contratual' },
];

const Grid = styled.div`display: grid; gap: ${({ theme }) => theme.spacing.md};`;
const Stats = styled(Grid)`grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));`;
const Toolbar = styled(Card)`
  display: grid; grid-template-columns: minmax(220px, 1fr) minmax(180px, 260px);
  gap: ${({ theme }) => theme.spacing.md}; padding: ${({ theme }) => theme.spacing.md};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
const UserList = styled.div`display: grid; gap: ${({ theme }) => theme.spacing.md};`;
const UserCard = styled(Card)`display: grid; gap: ${({ theme }) => theme.spacing.md}; padding: ${({ theme }) => theme.spacing.md};`;
const UserHeader = styled.div`
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md}; flex-wrap: wrap;
`;
const UserIdentity = styled.div`
  min-width: 0;
  h3 { margin: 0; color: ${({ theme }) => theme.colors.textPrimary}; font-size: ${({ theme }) => theme.fontSizes.lg}; }
  p { margin: 4px 0 0; color: ${({ theme }) => theme.colors.textSecondary}; font-size: ${({ theme }) => theme.fontSizes.sm}; overflow-wrap: anywhere; }
`;
const Actions = styled.div`display: flex; gap: ${({ theme }) => theme.spacing.sm}; flex-wrap: wrap;`;
const AccessGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: ${({ theme }) => theme.spacing.sm};
`;
const AccessCard = styled.div`
  padding: ${({ theme }) => theme.spacing.md}; border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md}; background: ${({ theme }) => theme.colors.bgHover};
  h4 { margin: 0 0 8px; font-size: ${({ theme }) => theme.fontSizes.md}; color: ${({ theme }) => theme.colors.textPrimary}; }
`;
const BadgeRow = styled.div`display: flex; gap: ${({ theme }) => theme.spacing.xs}; flex-wrap: wrap;`;
const Notice = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme, $kind }) => $kind === 'danger' ? theme.colors.danger : $kind === 'warning' ? theme.colors.warning : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme, $kind }) => $kind === 'danger' ? theme.colors.danger : $kind === 'warning' ? theme.colors.warning : theme.colors.textSecondary};
  background: ${({ theme, $kind }) => $kind === 'danger' ? theme.colors.dangerLight : $kind === 'warning' ? theme.colors.warningLight : theme.colors.bgHover};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;
const Form = styled.form`display: grid; gap: ${({ theme }) => theme.spacing.md};`;
const FormGrid = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${({ theme }) => theme.spacing.md};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
const UnitEditor = styled.fieldset`
  display: grid; gap: ${({ theme }) => theme.spacing.md}; padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.bgHover};
`;
const UnitLegend = styled.legend`
  padding: 0 6px; color: ${({ theme }) => theme.colors.textPrimary}; font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;
const CheckLabel = styled.label`
  display: flex; align-items: center; gap: ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.textPrimary}; font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  input { width: 18px; height: 18px; accent-color: ${({ theme }) => theme.colors.primary}; }
`;
const OverrideRow = styled.div`
  display: grid; grid-template-columns: minmax(180px, 1fr) 120px minmax(160px, 1fr) auto;
  gap: ${({ theme }) => theme.spacing.sm}; align-items: end;
  @media (max-width: 760px) { grid-template-columns: 1fr; }
`;
const ModalActions = styled.div`
  display: flex; justify-content: flex-end; gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap; padding-top: ${({ theme }) => theme.spacing.sm};
`;
const Details = styled.div`display: grid; gap: ${({ theme }) => theme.spacing.md};`;
const DiffGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: ${({ theme }) => theme.spacing.sm};
`;
const DiffBox = styled.div`
  padding: ${({ theme }) => theme.spacing.sm}; border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  h4 { margin: 0 0 6px; font-size: ${({ theme }) => theme.fontSizes.sm}; }
  p { margin: 0; color: ${({ theme }) => theme.colors.textSecondary}; font-size: ${({ theme }) => theme.fontSizes.xs}; overflow-wrap: anywhere; }
`;
const OwnerList = styled.div`display: grid; gap: ${({ theme }) => theme.spacing.sm};`;
const OwnerRow = styled.div`
  display: flex; justify-content: space-between; align-items: center; gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm}; border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  @media (max-width: 640px) { align-items: flex-start; flex-direction: column; }
`;

const cleanArray = (value, key) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  return [];
};
const configuration = (membership, status) => (
  membership?.access?.configurations?.find((item) => item.status === status) || null
);
export const activeUserCount = (users) => users.filter((user) => (
  (user.establishments || []).some((membership) => membership.isActive)
)).length;
export const manageableEstablishments = (state) => (state?.establishments || [])
  .filter((establishment) => establishment.role === 'ADMIN')
  .map(({ id, name, role }) => ({ id, name, role }));
export const profileForMembership = (membership) => {
  const draft = configuration(membership, 'DRAFT');
  const active = configuration(membership, 'ACTIVE');
  return draft?.profileCode || active?.profileCode || null;
};
export const userStatus = (user) => (
  (user.establishments || []).some((membership) => membership.isActive) ? 'ACTIVE' : 'INACTIVE'
);
const errorMessage = (error, fallback) => {
  const status = error?.response?.status;
  const message = error?.response?.data?.error || error?.response?.data?.message || error?.message;
  if (status === 403) return message || 'Você não possui autorização para esta operação.';
  if (status === 409) return message || 'A operação entrou em conflito. Atualize os dados e tente novamente.';
  if (status === 422) return message || 'Revise os dados informados.';
  return message || fallback;
};
const profileOptions = (profiles) => [
  { value: '', label: 'Somente compatibilidade LEGACY' },
  ...profiles.filter((profile) => profile.code !== 'OWNER').map((profile) => ({
    value: profile.code, label: PROFILE_LABELS[profile.code] || profile.code,
  })),
];
const emptyAccess = (establishment) => ({
  establishmentId: establishment.id, establishmentName: establishment.name, selected: false,
  legacyRole: 'STAFF', profileCode: 'COLLABORATOR', profileVersion: 1, overrides: [],
});
const initialAccesses = (user, establishments) => Object.fromEntries(establishments.map((establishment) => {
  const membership = user?.establishments?.find((item) => item.establishmentId === establishment.id);
  const draft = configuration(membership, 'DRAFT');
  const active = configuration(membership, 'ACTIVE');
  const selectedConfiguration = draft || active;
  return [establishment.id, {
    ...emptyAccess(establishment), selected: Boolean(membership?.isActive),
    legacyRole: membership?.role || 'STAFF',
    profileCode: selectedConfiguration?.profileCode || (membership ? '' : 'COLLABORATOR'),
    profileVersion: selectedConfiguration?.profileVersion || 1,
    overrides: (selectedConfiguration?.overrides || []).map(({ permissionCode, effect, reason }) => ({
      permissionCode, effect, reason: reason || '',
    })),
  }];
}));

function AccessEditor({ user, establishments, profiles, permissions, onCancel, onSaved }) {
  const editing = Boolean(user);
  const [form, setForm] = useState({
    name: user?.name || '', email: user?.email || '', password: '', passwordConfirmation: '',
  });
  const [accesses, setAccesses] = useState(() => initialAccesses(user, establishments));
  const [saving, setSaving] = useState(false);
  const initiallySelected = useMemo(() => new Set(
    Object.values(initialAccesses(user, establishments)).filter((item) => item.selected).map((item) => item.establishmentId)
  ), [user, establishments]);

  const updateAccess = (id, patch) => setAccesses((current) => ({
    ...current, [id]: { ...current[id], ...patch },
  }));
  const updateOverride = (establishmentId, index, patch) => {
    const next = [...accesses[establishmentId].overrides];
    next[index] = { ...next[index], ...patch };
    updateAccess(establishmentId, { overrides: next });
  };
  const addOverride = (establishmentId) => {
    const used = new Set(accesses[establishmentId].overrides.map((item) => item.permissionCode));
    const permission = permissions.find((item) => item.delegable && !used.has(item.code));
    if (!permission) return toast.error('Não há outra permissão delegável disponível.');
    updateAccess(establishmentId, {
      overrides: [...accesses[establishmentId].overrides, { permissionCode: permission.code, effect: 'DENY', reason: '' }],
    });
  };
  const removeOverride = (establishmentId, index) => updateAccess(establishmentId, {
    overrides: accesses[establishmentId].overrides.filter((_, itemIndex) => itemIndex !== index),
  });

  const submit = async (event) => {
    event.preventDefault();
    const selected = Object.values(accesses).filter((item) => item.selected);
    if (!form.name.trim() || !form.email.trim()) return toast.error('Informe nome e e-mail.');
    if (!editing && form.password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.');
    if (form.password && form.password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.');
    if (form.password !== form.passwordConfirmation) return toast.error('A confirmação da senha não confere.');
    if (!selected.length) return toast.error('Selecione ao menos uma unidade administrável.');
    const removed = [...initiallySelected].filter((id) => !accesses[id]?.selected);
    if (removed.length && !window.confirm('Remover os acessos selecionados? Vínculos fora da sua administração serão preservados.')) return;

    const payload = {
      name: form.name.trim(), email: form.email.trim(),
      accesses: selected.map((item) => ({
        establishmentId: item.establishmentId, legacyRole: item.legacyRole,
        ...(item.profileCode ? {
          profileCode: item.profileCode, profileVersion: item.profileVersion,
          overrides: item.overrides.map(({ permissionCode, effect, reason }) => ({
            permissionCode, effect, ...(reason.trim() ? { reason: reason.trim() } : {}),
          })),
        } : {}),
      })),
    };
    if (form.password) payload.password = form.password;
    setSaving(true);
    try {
      if (editing) await userAccessService.updateUser(user.id, payload);
      else await userAccessService.createUser(payload);
      toast.success(editing ? 'Usuário atualizado.' : 'Usuário criado.');
      await onSaved();
    } catch (error) { toast.error(errorMessage(error, 'Não foi possível salvar o usuário.')); }
    finally { setSaving(false); }
  };

  return (
    <Form onSubmit={submit} aria-label={editing ? 'Editar usuário' : 'Criar usuário'}>
      <FormGrid>
        <Input label="Nome" name="name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <Input label="E-mail" name="email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <Input label={editing ? 'Nova senha (opcional)' : 'Senha'} name="password" type="password" required={!editing} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <Input label="Confirmar senha" name="passwordConfirmation" type="password" required={!editing} value={form.passwordConfirmation} onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })} />
      </FormGrid>
      <Notice>Selecione somente unidades que você administra. Vínculos fora do seu alcance não são enviados e permanecem preservados pelo servidor.</Notice>
      {establishments.map((establishment) => {
        const access = accesses[establishment.id];
        return (
          <UnitEditor key={establishment.id}>
            <UnitLegend>{establishment.name}</UnitLegend>
            <CheckLabel>
              <CheckboxControl aria-label={`Acesso à unidade ${establishment.name}`} checked={access.selected}
                onChange={(event) => updateAccess(establishment.id, { selected: event.target.checked })} />
              Autorizar acesso a esta unidade
            </CheckLabel>
            {access.selected && (
              <>
                <FormGrid>
                  <Select label="Papel de compatibilidade LEGACY" value={access.legacyRole} options={LEGACY_OPTIONS}
                    onChange={(value) => updateAccess(establishment.id, { legacyRole: value })} />
                  <Select label="Perfil B2 em rascunho" value={access.profileCode} options={profileOptions(profiles)}
                    onChange={(value) => updateAccess(establishment.id, { profileCode: value, overrides: value ? access.overrides : [] })}
                    helperText="OWNER é administrado somente pela cerimônia de autoridade." />
                </FormGrid>
                {access.profileCode && (
                  <Grid>
                    {access.overrides.map((override, index) => (
                      <OverrideRow key={`${establishment.id}-${index}`}>
                        <Select label="Permissão" aria-label={`Permissão individual ${establishment.name} ${index + 1}`}
                          value={override.permissionCode}
                          options={permissions.filter((item) => item.delegable).map((item) => ({ value: item.code, label: item.code }))}
                          onChange={(value) => updateOverride(establishment.id, index, { permissionCode: value })} />
                        <Select label="Efeito" value={override.effect}
                          options={[{ value: 'ALLOW', label: 'Permitir' }, { value: 'DENY', label: 'Negar' }]}
                          onChange={(value) => updateOverride(establishment.id, index, { effect: value })} />
                        <Input label="Justificativa" value={override.reason}
                          onChange={(event) => updateOverride(establishment.id, index, { reason: event.target.value })}
                          helperText="Obrigatória para concessões sensíveis ou financeiras." />
                        <Button type="button" variant="danger" size="sm" onClick={() => removeOverride(establishment.id, index)}>Remover</Button>
                      </OverrideRow>
                    ))}
                    <Button type="button" variant="outlined" size="sm" onClick={() => addOverride(establishment.id)}>
                      <MdAdd /> Permissão individual
                    </Button>
                  </Grid>
                )}
              </>
            )}
          </UnitEditor>
        );
      })}
      <ModalActions>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={saving} loadingLabel="Salvando">{editing ? 'Salvar alterações' : 'Criar usuário'}</Button>
      </ModalActions>
    </Form>
  );
}

function AccessDetails({ user, profiles, permissions, activeEstablishment, onClose, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [profileCode, setProfileCode] = useState('AUDITOR');
  const [overrides, setOverrides] = useState([]);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const access = await userAccessService.getAccess(user.id);
      setDetail(access);
      const source = access?.access?.draft || access?.access?.active;
      setProfileCode(source?.profileCode || 'AUDITOR');
      setOverrides((source?.overrides || []).map((item) => ({ ...item, reason: item.reason || '' })));
    } catch (error) { toast.error(errorMessage(error, 'Não foi possível carregar a configuração.')); }
    finally { setLoading(false); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const saveDraft = async () => {
    setSaving(true);
    try {
      const result = await userAccessService.saveDraft(user.id, {
        profileCode, profileVersion: profiles.find((item) => item.code === profileCode)?.version || 1,
        overrides: overrides.map(({ permissionCode, effect, reason }) => ({
          permissionCode, effect, ...(String(reason || '').trim() ? { reason: String(reason).trim() } : {}),
        })), expectedVersion: detail?.access?.version || 0,
      });
      toast.success('Rascunho salvo. Nenhuma permissão foi ativada.');
      setDetail((current) => ({ ...current, access: { ...current.access, draft: result.draft, version: result.version } }));
      setPreview(null);
      await onChanged();
    } catch (error) { toast.error(errorMessage(error, 'Não foi possível salvar o rascunho.')); }
    finally { setSaving(false); }
  };
  const loadPreview = async () => {
    try { setPreview(await userAccessService.preview(user.id)); }
    catch (error) { toast.error(errorMessage(error, 'Não foi possível gerar a prévia.')); }
  };
  const loadHistory = async () => {
    try { setHistory(cleanArray(await userAccessService.history(user.id), 'events')); }
    catch (error) { toast.error(errorMessage(error, 'Não foi possível carregar o histórico.')); }
  };
  const rollback = async () => {
    const reason = window.prompt('Motivo do rollback para LEGACY:');
    if (!reason || reason.trim().length < 3 || !window.confirm('Confirmar retorno para o modo LEGACY?')) return;
    try {
      await userAccessService.rollback(user.id, { expectedVersion: detail.access.version, reason: reason.trim() });
      toast.success('Acesso retornado ao modo LEGACY.');
      await load(); await onChanged();
    } catch (error) { toast.error(errorMessage(error, 'Não foi possível executar o rollback.')); }
  };
  if (loading) return <Loading message="Carregando acesso..." />;
  if (!detail) return <Notice $kind="danger">Configuração indisponível para o estabelecimento ativo.</Notice>;
  const delegablePermissions = permissions.filter((item) => item.delegable);
  return (
    <Details>
      <Notice>Configuração escopada à unidade <strong>{activeEstablishment?.name || detail.establishment?.name}</strong>. Para outra unidade, troque o estabelecimento ativo.</Notice>
      <BadgeRow>
        <Badge variant={detail.access.mode === 'PROFILED' ? 'warning' : 'info'}>{detail.access.mode}</Badge>
        <Badge>Versão {detail.access.version}</Badge>
        {detail.access.draft && <Badge variant="warning">DRAFT</Badge>}
      </BadgeRow>
      <Select label="Perfil do rascunho" value={profileCode} options={profileOptions(profiles).filter((item) => item.value)}
        onChange={setProfileCode} helperText="OWNER não pode ser atribuído por esta configuração." />
      {overrides.map((override, index) => (
        <OverrideRow key={index}>
          <Select label="Permissão" value={override.permissionCode}
            options={delegablePermissions.map((item) => ({ value: item.code, label: item.code }))}
            onChange={(value) => setOverrides((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, permissionCode: value } : item))} />
          <Select label="Efeito" value={override.effect}
            options={[{ value: 'ALLOW', label: 'Permitir' }, { value: 'DENY', label: 'Negar' }]}
            onChange={(value) => setOverrides((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, effect: value } : item))} />
          <Input label="Justificativa" value={override.reason || ''}
            onChange={(event) => setOverrides((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, reason: event.target.value } : item))} />
          <Button type="button" size="sm" variant="danger" onClick={() => setOverrides((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
        </OverrideRow>
      ))}
      <Actions>
        <Button type="button" variant="outlined" size="sm" onClick={() => {
          const first = delegablePermissions.find((permission) => !overrides.some((item) => item.permissionCode === permission.code));
          if (first) setOverrides([...overrides, { permissionCode: first.code, effect: 'DENY', reason: '' }]);
        }}><MdAdd /> Override</Button>
        <Button type="button" onClick={saveDraft} loading={saving} loadingLabel="Salvando">Salvar DRAFT</Button>
        <Button type="button" variant="secondary" onClick={loadPreview}><MdPreview /> Preview</Button>
        <Button type="button" variant="secondary" onClick={loadHistory}><MdHistory /> Histórico</Button>
      </Actions>
      {preview?.diff && (
        <DiffGrid aria-label="Prévia de permissões">
          <DiffBox><h4>Mantidas</h4><p>{preview.diff.maintained.join(', ') || 'Nenhuma'}</p></DiffBox>
          <DiffBox><h4>Concedidas</h4><p>{preview.diff.granted.join(', ') || 'Nenhuma'}</p></DiffBox>
          <DiffBox><h4>Removidas</h4><p>{preview.diff.removed.join(', ') || 'Nenhuma'}</p></DiffBox>
          <DiffBox><h4>Continuam negadas</h4><p>{preview.diff.unchangedDenied.join(', ') || 'Nenhuma'}</p></DiffBox>
        </DiffGrid>
      )}
      {history.length > 0 && (
        <Grid aria-label="Histórico de acesso">
          {history.map((event) => (
            <AccessCard key={event.id}><h4>{event.eventType}</h4><small>{event.occurredAt ? new Date(event.occurredAt).toLocaleString('pt-BR') : 'Data indisponível'}</small></AccessCard>
          ))}
        </Grid>
      )}
      <Notice $kind="warning">A ativação PROFILED está bloqueada nesta etapa. O rascunho e a prévia não alteram a autorização efetiva.</Notice>
      <Actions>
        <Button type="button" disabled title="Ativação PROFILED não autorizada"><MdLockOutline /> Ativar PROFILED</Button>
        {detail.access.mode === 'PROFILED' && <Button type="button" variant="danger" onClick={rollback}>Rollback para LEGACY</Button>}
        <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
      </Actions>
    </Details>
  );
}

function OwnerPanel({ users, state, reloadUsers }) {
  const [status, setStatus] = useState('loading');
  const [owners, setOwners] = useState([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [verificationMethod, setVerificationMethod] = useState('ASSISTED_VERIFICATION');
  const [busy, setBusy] = useState(false);
  const loadOwners = useCallback(async () => {
    setStatus('loading');
    try { setOwners(cleanArray(await userAccessService.listOwners(), 'owners')); setStatus('ready'); }
    catch (error) {
      const authorityUnavailable = error?.response?.status === 403
        || /autoridade organizacional insuficiente/i.test(error?.message || '');
      if (authorityUnavailable) setStatus('unavailable');
      else { setStatus('error'); toast.error(errorMessage(error, 'Não foi possível carregar autoridades.')); }
    }
  }, []);
  useEffect(() => { loadOwners(); }, [loadOwners]);
  if (status === 'loading') return <Loading message="Verificando autoridades..." size="32px" />;
  if (status === 'unavailable') return (
    <Notice $kind="warning" role="status">A administração de OWNER não está disponível para esta sessão. Se a organização ainda não possui OWNER inicializado, solicite a cerimônia administrativa externa. Não existe bootstrap pela interface.</Notice>
  );
  if (status === 'error') return <Notice $kind="danger">Autoridades indisponíveis.</Notice>;
  const activeOwnerIds = new Set(owners.filter((owner) => owner.isActive).map((owner) => owner.userId));
  const candidates = users.filter((user) => userStatus(user) === 'ACTIVE' && !activeOwnerIds.has(user.id));
  const designate = async () => {
    if (!targetUserId) return toast.error('Selecione um usuário.');
    setBusy(true);
    try {
      await userAccessService.designateOwner(targetUserId, { verificationMethod });
      toast.success('OWNER designado com auditoria.'); setTargetUserId(''); await Promise.all([loadOwners(), reloadUsers()]);
    } catch (error) { toast.error(errorMessage(error, 'Não foi possível designar OWNER.')); }
    finally { setBusy(false); }
  };
  const revoke = async (owner) => {
    const reason = window.prompt(`Motivo para revogar OWNER de ${owner.user?.name || owner.userId}:`);
    if (!reason || reason.trim().length < 10 || !window.confirm('Confirmar revogação desta autoridade?')) return;
    try { await userAccessService.revokeOwner(owner.userId, reason.trim()); toast.success('Autoridade revogada.'); await loadOwners(); }
    catch (error) { toast.error(errorMessage(error, 'Não foi possível revogar OWNER.')); }
  };
  const transfer = async () => {
    if (!targetUserId) return toast.error('Selecione o novo OWNER.');
    const reason = window.prompt('Motivo da transferência de propriedade:');
    if (!reason || reason.trim().length < 10 || !window.confirm('A transferência revogará a autoridade do OWNER atual. Continuar?')) return;
    setBusy(true);
    try {
      await userAccessService.transferOwnership(targetUserId, { verificationMethod, reason: reason.trim() });
      toast.success('Propriedade transferida.'); await loadOwners();
    } catch (error) { toast.error(errorMessage(error, 'Não foi possível transferir OWNER.')); }
    finally { setBusy(false); }
  };
  return (
    <Grid>
      <Notice>Autoridades OWNER são organizacionais e independentes do perfil comum. O primeiro OWNER nunca pode ser criado por esta tela.</Notice>
      <OwnerList>
        {owners.map((owner) => (
          <OwnerRow key={owner.id}>
            <div><strong>{owner.user?.name || owner.userId}</strong><div><small>{owner.user?.email}</small></div></div>
            <Actions>
              <Badge variant={owner.isActive ? 'success' : 'warning'}>{owner.isActive ? 'OWNER ativo' : 'Revogado'}</Badge>
              {owner.isActive && owner.userId !== state.user?.id && <Button type="button" variant="danger" size="sm" onClick={() => revoke(owner)}>Revogar</Button>}
            </Actions>
          </OwnerRow>
        ))}
      </OwnerList>
      <FormGrid>
        <Select label="Usuário elegível" value={targetUserId}
          options={[{ value: '', label: 'Selecione...' }, ...candidates.map((user) => ({ value: user.id, label: `${user.name} · ${user.email}` }))]}
          onChange={setTargetUserId} />
        <Select label="Método de verificação" value={verificationMethod} options={VERIFICATION_OPTIONS} onChange={setVerificationMethod} />
      </FormGrid>
      <Actions>
        <Button type="button" onClick={designate} loading={busy}>Designar outro OWNER</Button>
        <Button type="button" variant="outlined" onClick={transfer} disabled={!targetUserId || busy}>Transferir propriedade</Button>
      </Actions>
    </Grid>
  );
}

export default function Users() {
  const { state } = useApp();
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editor, setEditor] = useState(null);
  const [accessUser, setAccessUser] = useState(null);
  const [showOwners, setShowOwners] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const establishments = useMemo(() => manageableEstablishments(state), [state]);
  const loadUsers = useCallback(async () => setUsers(cleanArray(await userAccessService.listUsers(), 'users')), []);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [usersResponse, profilesResponse, permissionsResponse] = await Promise.all([
        userAccessService.listUsers(), userAccessService.listProfiles(), userAccessService.listPermissions(),
      ]);
      setUsers(cleanArray(usersResponse, 'users'));
      setProfiles(cleanArray(profilesResponse, 'profiles'));
      setPermissions(cleanArray(permissionsResponse, 'permissions'));
    } catch (loadError) { setError(errorMessage(loadError, 'Não foi possível carregar usuários e permissões.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const activeCount = activeUserCount(users);
  const filtered = users.filter((user) => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    const matchesSearch = !search || `${user.name} ${user.email}`.toLocaleLowerCase('pt-BR').includes(search);
    return matchesSearch && (statusFilter === 'ALL' || userStatus(user) === statusFilter);
  });
  const deactivate = async (user) => {
    if (user.id === state.user?.id) return toast.error('Você não pode desativar o próprio usuário.');
    if (!window.confirm(`Desativar os acessos administráveis de ${user.name}? Vínculos fora do seu alcance serão preservados.`)) return;
    setDeletingId(user.id);
    try { await userAccessService.deactivateUser(user.id); toast.success('Acessos desativados.'); await loadUsers(); }
    catch (deleteError) { toast.error(errorMessage(deleteError, 'Não foi possível desativar o usuário.')); }
    finally { setDeletingId(null); }
  };
  if (loading) return <Loading message="Carregando administração de usuários..." />;
  return (
    <Page>
      <PageHeader>
        <PageHeading><PageTitle>Usuários e permissões</PageTitle><PageSubtitle>Administre acessos por unidade, prepare perfis B2 e preserve a operação LEGACY até a ativação autorizada.</PageSubtitle></PageHeading>
        <PageActions>
          <Button variant="outlined" onClick={() => setShowOwners(true)}><MdSecurity /> Autoridades OWNER</Button>
          <Button onClick={() => setEditor({ mode: 'create', user: null })} disabled={activeCount >= USER_LIMIT || establishments.length === 0}><MdAdd /> Novo usuário</Button>
        </PageActions>
      </PageHeader>
      <Stats>
        <StatCard><span>Ativos visíveis / limite</span><strong>{activeCount} / {USER_LIMIT}</strong></StatCard>
        <StatCard><span>Unidades administráveis</span><strong>{establishments.length}</strong></StatCard>
        <StatCard><span>Modo efetivo</span><strong>LEGACY</strong></StatCard>
      </Stats>
      {activeCount >= USER_LIMIT && <Notice $kind="warning" role="alert">Limite de 10 usuários ativos atingido. Desative um usuário antes de cadastrar ou reativar outro.</Notice>}
      {error && <Notice $kind="danger" role="alert">{error}</Notice>}
      {establishments.length === 0 && <Notice $kind="danger">Você não possui unidade com papel ADMIN para administrar usuários.</Notice>}
      <Toolbar>
        <Input label="Buscar" aria-label="Buscar usuários" placeholder="Nome ou e-mail" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select label="Status" value={statusFilter}
          options={[{ value: 'ALL', label: 'Todos' }, { value: 'ACTIVE', label: 'Ativos' }, { value: 'INACTIVE', label: 'Inativos' }]}
          onChange={setStatusFilter} />
      </Toolbar>
      {filtered.length === 0 ? (
        <Card><EmptyState icon={<MdPersonSearch />} title="Nenhum usuário encontrado" subtitle="Ajuste a busca ou os filtros." /></Card>
      ) : (
        <UserList aria-label="Lista de usuários">
          {filtered.map((user) => {
            const status = userStatus(user);
            const currentMembership = user.establishments?.find((item) => item.establishmentId === state.establishment?.id && item.isActive);
            return (
              <UserCard key={user.id}>
                <UserHeader>
                  <UserIdentity><h3>{user.name}</h3><p>{user.email} · ID {user.id}</p></UserIdentity>
                  <Actions>
                    <Badge variant={status === 'ACTIVE' ? 'success' : 'warning'}>{status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => setEditor({ mode: 'edit', user })}><MdEdit /> Editar</Button>
                    <Button size="sm" variant="outlined" disabled={!currentMembership || user.id === state.user?.id}
                      title={!currentMembership ? 'Troque para uma unidade em que o usuário possua acesso' : undefined}
                      onClick={() => setAccessUser(user)}><MdManageAccounts /> Permissões</Button>
                    <Button size="sm" variant="danger" loading={deletingId === user.id}
                      disabled={user.id === state.user?.id || Boolean(deletingId)} onClick={() => deactivate(user)}><MdDelete /> Desativar</Button>
                  </Actions>
                </UserHeader>
                <AccessGrid>
                  {(user.establishments || []).map((membership) => {
                    const draft = configuration(membership, 'DRAFT');
                    const active = configuration(membership, 'ACTIVE');
                    return (
                      <AccessCard key={membership.id || membership.establishmentId}>
                        <h4>{membership.establishment?.name || membership.establishmentId}</h4>
                        <BadgeRow>
                          <Badge variant={membership.isActive ? 'success' : 'warning'}>{membership.isActive ? 'Acesso ativo' : 'Acesso inativo'}</Badge>
                          <Badge>{LEGACY_ROLE_LABELS[membership.role] || membership.role}</Badge>
                          <Badge variant={membership.access?.mode === 'PROFILED' ? 'warning' : 'info'}>{membership.access?.mode || 'LEGACY'}</Badge>
                          {draft && <Badge variant="warning">DRAFT: {PROFILE_LABELS[draft.profileCode] || draft.profileCode}</Badge>}
                          {active && <Badge variant="success">ACTIVE: {PROFILE_LABELS[active.profileCode] || active.profileCode}</Badge>}
                        </BadgeRow>
                      </AccessCard>
                    );
                  })}
                </AccessGrid>
              </UserCard>
            );
          })}
        </UserList>
      )}
      <Modal isOpen={Boolean(editor)} onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? 'Editar usuário e unidades' : 'Cadastrar usuário'} maxWidth="900px">
        {editor && <AccessEditor user={editor.user} establishments={establishments} profiles={profiles} permissions={permissions}
          onCancel={() => setEditor(null)} onSaved={async () => { await loadUsers(); setEditor(null); }} />}
      </Modal>
      <Modal isOpen={Boolean(accessUser)} onClose={() => setAccessUser(null)} title={`Permissões de ${accessUser?.name || ''}`} maxWidth="900px">
        {accessUser && <AccessDetails user={accessUser} profiles={profiles} permissions={permissions}
          activeEstablishment={state.establishment} onClose={() => setAccessUser(null)} onChanged={loadUsers} />}
      </Modal>
      <Modal isOpen={showOwners} onClose={() => setShowOwners(false)} title="Autoridades OWNER" maxWidth="760px">
        {showOwners && <OwnerPanel users={users} state={state} reloadUsers={loadUsers} />}
      </Modal>
    </Page>
  );
}

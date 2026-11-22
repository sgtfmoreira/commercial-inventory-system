import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import Users from './Users';
import { lightTheme } from '../styles/theme';
import { useApp } from '../context/AppContext';
import userAccessService from '../services/userAccessService';
import toast from 'react-hot-toast';

jest.mock('../context/AppContext', () => ({ useApp: jest.fn() }));
jest.mock('../services/userAccessService', () => ({
  __esModule: true,
  default: {
    listUsers: jest.fn(), createUser: jest.fn(), updateUser: jest.fn(), deactivateUser: jest.fn(),
    listProfiles: jest.fn(), listPermissions: jest.fn(), getAccess: jest.fn(), saveDraft: jest.fn(),
    preview: jest.fn(), history: jest.fn(), activate: jest.fn(), rollback: jest.fn(),
    listOwners: jest.fn(), designateOwner: jest.fn(), revokeOwner: jest.fn(), transferOwnership: jest.fn(),
  },
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const profiles = [
  { code: 'OWNER', version: 1 }, { code: 'ADMINISTRATOR', version: 1 },
  { code: 'MANAGER', version: 1 }, { code: 'SUPERVISOR', version: 1 },
  { code: 'COLLABORATOR', version: 1 }, { code: 'AUDITOR', version: 1 },
];
const permissions = [
  { code: 'products.read', delegable: true, sensitive: false, financial: false },
  { code: 'reports.financial.read', delegable: true, sensitive: false, financial: true },
];
const membership = (establishmentId, establishmentName, role = 'STOCK_COUNTER', extra = {}) => ({
  id: `membership-${establishmentId}`,
  establishmentId,
  role,
  isActive: true,
  establishment: { id: establishmentId, name: establishmentName },
  access: { mode: 'LEGACY', version: 0, configurations: [], ...(extra.access || {}) },
  ...extra,
});
const user = (id, name, memberships = [membership('est-a', 'Centro')]) => ({
  id, name, email: `${id}@example.com`, establishments: memberships,
});
const defaultState = {
  user: { id: 'actor', name: 'Admin', role: 'ADMIN' },
  establishment: { id: 'est-a', name: 'Centro' },
  establishments: [
    { id: 'est-a', name: 'Centro', role: 'ADMIN' },
    { id: 'est-b', name: 'Praia', role: 'ADMIN' },
    { id: 'est-hidden', name: 'Restrita', role: 'MANAGER' },
  ],
};

let container;
let root;

const flush = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const renderPage = async (users = [user('user-a', 'Ana')], state = defaultState) => {
  useApp.mockReturnValue({ state });
  userAccessService.listUsers.mockResolvedValue(users);
  userAccessService.listProfiles.mockResolvedValue({ version: 1, profiles });
  userAccessService.listPermissions.mockResolvedValue({ version: 1, permissions });
  userAccessService.listOwners.mockResolvedValue({ owners: [] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ThemeProvider theme={lightTheme}><Users /></ThemeProvider>);
    await flush();
  });
};

const button = (label) => [...container.querySelectorAll('button')].find((item) => item.textContent.includes(label));
const input = (label) => container.querySelector(`[aria-label="${label}"]`)
  || [...container.querySelectorAll('label')].find((item) => item.textContent.includes(label))?.querySelector('input');
const change = async (element, value) => {
  await act(async () => {
    const prototype = element.tagName === 'SELECT'
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await flush();
  });
};
const click = async (element) => {
  expect(element).toBeTruthy();
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush(); });
};
const fieldset = (name) => [...container.querySelectorAll('fieldset')]
  .find((item) => item.querySelector('legend')?.textContent === name);

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);
  window.prompt = jest.fn(() => 'Motivo operacional válido');
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

test('lista, busca e corrige a nomenclatura STOCK_COUNTER', async () => {
  await renderPage([user('user-a', 'Ana'), user('user-b', 'Bruno')]);
  expect(container.textContent).toContain('Ana');
  expect(container.textContent).toContain('Bruno');
  expect(container.textContent).toContain('Contador de estoque');
  await change(input('Buscar usuários'), 'Bruno');
  expect(container.textContent).not.toContain('Ana');
  expect(container.textContent).toContain('Bruno');
});

test('lista, filtra e reativa usuário totalmente inativo em unidade administrável', async () => {
  const target = user('user-inactive', 'Inativa', [
    membership('est-a', 'Centro', 'STAFF', { isActive: false }),
  ]);
  userAccessService.updateUser.mockResolvedValue(target);
  await renderPage([target]);

  expect(container.textContent).toContain('Inativa');
  expect(container.textContent).toContain('Inativo');
  const statusSelect = [...container.querySelectorAll('label')]
    .find((item) => item.textContent.includes('Status'))?.querySelector('select');
  await change(statusSelect, 'INACTIVE');
  expect(container.textContent).toContain('Inativa');

  await click(button('Editar'));
  const accessCheckbox = input('Acesso à unidade Centro');
  expect(accessCheckbox.checked).toBe(false);
  await click(accessCheckbox);
  await click(button('Salvar alterações'));

  expect(userAccessService.updateUser).toHaveBeenCalledWith('user-inactive', expect.objectContaining({
    accesses: [expect.objectContaining({ establishmentId: 'est-a', legacyRole: 'STAFF' })],
  }));
});

test('cadastra em uma única unidade sem concessão automática', async () => {
  userAccessService.createUser.mockResolvedValue({ id: 'new-user' });
  await renderPage([]);
  await click(button('Novo usuário'));
  await change(input('Nome'), 'Carla');
  await change(input('E-mail'), 'carla@example.com');
  await change(input('Senha'), '123456');
  await change(input('Confirmar senha'), '123456');
  await click(input('Acesso à unidade Centro'));
  await click(button('Criar usuário'));

  const payload = userAccessService.createUser.mock.calls[0][0];
  expect(payload.accesses).toHaveLength(1);
  expect(payload.accesses[0]).toMatchObject({ establishmentId: 'est-a', legacyRole: 'STAFF', profileCode: 'COLLABORATOR' });
  expect(payload.accesses.some((item) => item.establishmentId === 'est-b')).toBe(false);
  expect(payload.accesses.some((item) => item.establishmentId === 'est-hidden')).toBe(false);
});

test('cadastra em múltiplas unidades com perfis diferentes e sem OWNER comum', async () => {
  userAccessService.createUser.mockResolvedValue({ id: 'new-user' });
  await renderPage([]);
  await click(button('Novo usuário'));
  await change(input('Nome'), 'Diego');
  await change(input('E-mail'), 'diego@example.com');
  await change(input('Senha'), '123456');
  await change(input('Confirmar senha'), '123456');
  await click(input('Acesso à unidade Centro'));
  await click(input('Acesso à unidade Praia'));

  const centerSelects = fieldset('Centro').querySelectorAll('select');
  const beachSelects = fieldset('Praia').querySelectorAll('select');
  expect([...centerSelects[1].options].some((item) => item.value === 'OWNER')).toBe(false);
  await change(centerSelects[1], 'MANAGER');
  await change(beachSelects[1], 'AUDITOR');
  await click(button('Criar usuário'));

  expect(userAccessService.createUser.mock.calls[0][0].accesses).toEqual([
    expect.objectContaining({ establishmentId: 'est-a', profileCode: 'MANAGER' }),
    expect.objectContaining({ establishmentId: 'est-b', profileCode: 'AUDITOR' }),
  ]);
});

test('edição não oferece unidade não administrável e preserva o vínculo fora do payload', async () => {
  const target = user('user-a', 'Ana', [
    membership('est-a', 'Centro', 'MANAGER'),
    membership('est-hidden', 'Restrita', 'STAFF'),
  ]);
  userAccessService.updateUser.mockResolvedValue(target);
  await renderPage([target]);
  await click(button('Editar'));
  expect(input('Acesso à unidade Centro')).toBeTruthy();
  expect(input('Acesso à unidade Restrita')).toBeFalsy();
  expect(container.textContent).toContain('Vínculos fora do seu alcance');
  await click(button('Salvar alterações'));
  expect(userAccessService.updateUser.mock.calls[0][1].accesses.map((item) => item.establishmentId)).toEqual(['est-a']);
});

test('bloqueia cadastro quando quinze pessoas ativas já existem', async () => {
  await renderPage(Array.from({ length: 15 }, (_, index) => user(`user-${index}`, `Pessoa ${index}`)));
  expect(container.textContent).toContain('15 / 15');
  expect(container.textContent).toContain('Limite de 15 usuários ativos atingido');
  expect(button('Novo usuário').disabled).toBe(true);
});

test('exibe falha de autorização sem esconder a causa', async () => {
  useApp.mockReturnValue({ state: defaultState });
  userAccessService.listUsers.mockRejectedValue({ response: { status: 403, data: { error: 'Acesso negado para usuários.' } } });
  userAccessService.listProfiles.mockResolvedValue({ profiles });
  userAccessService.listPermissions.mockResolvedValue({ permissions });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<ThemeProvider theme={lightTheme}><Users /></ThemeProvider>); await flush(); });
  expect(container.textContent).toContain('Acesso negado para usuários.');
});

test('mostra simultaneamente LEGACY, DRAFT e o perfil por unidade', async () => {
  const draft = { id: 'draft-a', status: 'DRAFT', profileCode: 'AUDITOR', profileVersion: 1, overrides: [] };
  await renderPage([user('user-a', 'Ana', [membership('est-a', 'Centro', 'STOCK_COUNTER', {
    access: { mode: 'LEGACY', version: 1, configurations: [draft] },
  })])]);
  expect(container.textContent).toContain('LEGACY');
  expect(container.textContent).toContain('DRAFT: Auditor / Consultor');
  expect(container.textContent).toContain('Contador de estoque');
});

test('salva DRAFT, gera preview, mantém activate bloqueado e permite rollback seguro', async () => {
  const target = user('user-a', 'Ana');
  userAccessService.getAccess.mockResolvedValue({
    user: target, establishment: { id: 'est-a', name: 'Centro' }, membership: { id: 'membership-est-a', role: 'MANAGER', isActive: true },
    access: { mode: 'PROFILED', version: 3, draft: { profileCode: 'AUDITOR', profileVersion: 1, overrides: [] }, active: { profileCode: 'MANAGER' } },
  });
  userAccessService.saveDraft.mockResolvedValue({ draft: { profileCode: 'AUDITOR', overrides: [] }, version: 4 });
  userAccessService.preview.mockResolvedValue({ diff: { maintained: ['products.read'], granted: [], removed: ['reports.financial.read'], unchangedDenied: [] } });
  userAccessService.history.mockResolvedValue({ events: [{ id: 'event-a', eventType: 'ACCESS_DRAFT_SAVED', occurredAt: '2026-11-13T12:00:00Z' }] });
  userAccessService.rollback.mockResolvedValue({ mode: 'LEGACY', version: 4 });
  await renderPage([target]);
  await click(button('Permissões'));
  await click(button('Salvar DRAFT'));
  expect(userAccessService.saveDraft).toHaveBeenCalledWith('user-a', expect.objectContaining({ profileCode: 'AUDITOR', expectedVersion: 3 }));
  await click(button('Preview'));
  expect(container.textContent).toContain('products.read');
  expect(container.textContent).toContain('reports.financial.read');
  await click(button('Histórico'));
  expect(container.textContent).toContain('ACCESS_DRAFT_SAVED');
  expect(button('Ativar PROFILED').disabled).toBe(true);
  expect(userAccessService.activate).not.toHaveBeenCalled();
  await click(button('Rollback para LEGACY'));
  expect(userAccessService.rollback).toHaveBeenCalledWith('user-a', { expectedVersion: 4, reason: 'Motivo operacional válido' });
});

test('protege OWNER e orienta sobre a cerimônia inicial sem oferecer bootstrap', async () => {
  await renderPage([user('user-a', 'Ana')]);
  // O interceptor HTTP preserva a mensagem, mas converte a resposta 403 em Error.
  userAccessService.listOwners.mockRejectedValue(new Error('Autoridade organizacional insuficiente.'));
  await click(button('Autoridades OWNER'));
  expect(container.textContent).toContain('cerimônia administrativa externa');
  expect(container.textContent).toContain('Não existe bootstrap pela interface');
  expect(button('Designar outro OWNER')).toBeFalsy();
  expect(userAccessService.designateOwner).not.toHaveBeenCalled();
});

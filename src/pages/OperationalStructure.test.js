import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import OperationalStructure from './OperationalStructure';
import operationalStructureService from '../services/operationalStructureService';
import { lightTheme } from '../styles/theme';

jest.mock('../context/AppContext', () => ({
  useApp: () => ({
    state: { capabilitiesLoaded: true },
    hasCapability: code => ['operational_structure.read', 'operational_sectors.manage', 'operational_functions.manage', 'operational_assignments.manage'].includes(code),
  }),
}));
jest.mock('../services/operationalStructureService', () => ({
  __esModule: true,
  default: {
    listSectors: jest.fn(), listRoles: jest.fn(), createSector: jest.fn(), updateSector: jest.fn(),
    setSectorStatus: jest.fn(), createRole: jest.fn(), updateRole: jest.fn(), setRoleStatus: jest.fn(),
    listMemberships: jest.fn(), assignMembershipRole: jest.fn(), endMembershipRole: jest.fn(),
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;
const flush = async (wait = 0) => { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, wait)); };
const click = async element => act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush(10); });

beforeEach(() => {
  jest.clearAllMocks();
  operationalStructureService.listSectors.mockResolvedValue([
    { id: 'sector-a', name: 'Cozinha', description: 'Produção', isActive: true, version: 1, roleCount: 1 },
  ]);
  operationalStructureService.listRoles.mockResolvedValue([
    { id: 'role-a', sectorId: 'sector-a', name: 'Cozinheiro', description: null, isActive: true, version: 1, sector: { id: 'sector-a', name: 'Cozinha', isActive: true } },
  ]);
  operationalStructureService.listMemberships.mockResolvedValue([
    { id: 'membership-a', name: 'Juliana', email: 'juliana@local.test', legacyRole: 'STAFF', isActive: true, assignments: [] },
  ]);
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove(); root = null; container = null;
});

test('lista setores e funções sem misturar cadastro operacional com usuários', async () => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<ThemeProvider theme={lightTheme}><OperationalStructure /></ThemeProvider>); });
  await act(async () => { await flush(350); });

  expect(document.body.textContent).toContain('Estrutura operacional');
  expect(document.body.textContent).toContain('Cozinha');
  expect(document.body.textContent).toContain('sem alterar os perfis de acesso');

  const roleTab = [...document.body.querySelectorAll('button')].find(item => item.textContent === 'Funções');
  await click(roleTab);
  expect(document.body.textContent).toContain('Cozinheiro');
  expect(operationalStructureService.listSectors).toHaveBeenCalledWith({ active: 'all' });
  expect(operationalStructureService.listRoles).toHaveBeenCalledWith({ active: 'all' });
  expect(operationalStructureService.listMemberships).toHaveBeenCalledWith({ active: 'all' });
});

test('segrega vínculos operacionais das permissões do funcionário', async () => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<ThemeProvider theme={lightTheme}><OperationalStructure /></ThemeProvider>); });
  await act(async () => { await flush(350); });
  const peopleTab = [...document.body.querySelectorAll('button')].find(item => item.textContent === 'Pessoas e funções');
  await click(peopleTab);
  expect(document.body.textContent).toContain('Juliana');
  expect(document.body.textContent).toContain('não concedem permissões');
  expect(document.body.textContent).toContain('Vincular função');
});

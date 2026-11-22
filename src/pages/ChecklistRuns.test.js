import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter } from 'react-router-dom';
import ChecklistRuns from './ChecklistRuns';
import { lightTheme } from '../styles/theme';
import checklistRunService from '../services/checklistRunService';

jest.mock('../services/checklistRunService', () => ({
  __esModule: true,
  default: {
    capabilities: jest.fn(), listMine: jest.fn(), start: jest.fn(), getAttempt: jest.fn(),
    list: jest.fn(), publishedTemplates: jest.fn(), eligibleAssignees: jest.fn(),
    create: jest.fn(), reassign: jest.fn(), listSchedules: jest.fn(),
    createSchedule: jest.fn(), setScheduleStatus: jest.fn(),
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const run = {
  id: 'run-a', version: 1, status: 'ASSIGNED', dueAt: '2026-12-01T12:00:00.000Z',
  template: { id: 'template-a', name: 'Abertura segura', version: 1 },
  assignedTo: { membershipId: 'membership-a', name: 'Pessoa A' },
  createdBy: { membershipId: 'manager-a', name: 'Gestor A' },
  assignments: [{ id: 'assignment-a', sequence: 1, changeType: 'INITIAL', assignedTo: { membershipId: 'membership-a', name: 'Pessoa A' } }],
};
const templates = [{ id: 'version-a', version: 1, template: { id: 'template-a', name: 'Abertura segura' } }];
const assignees = [
  { membershipId: 'membership-a', name: 'Pessoa A', role: 'STAFF' },
  { membershipId: 'membership-b', name: 'Pessoa B', role: 'STOCK_COUNTER' },
];

let container;
let root;
const flush = async () => {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};
const renderPage = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter><ThemeProvider theme={lightTheme}><ChecklistRuns /></ThemeProvider></MemoryRouter>);
    await flush();
  });
};
const button = label => [...document.body.querySelectorAll('button')].find(element => element.textContent.includes(label));
const field = label => [...document.body.querySelectorAll('label')].find(element => element.textContent.includes(label))?.querySelector('input,textarea,select');
const click = async element => {
  expect(element).toBeTruthy();
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush(); });
};
const change = async (element, value) => {
  expect(element).toBeTruthy();
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
      : element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await flush();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  checklistRunService.capabilities.mockResolvedValue({
    'checklists.runs.manage': true,
    'checklists.execute': true,
  });
  checklistRunService.listMine.mockResolvedValue([]);
  checklistRunService.start.mockResolvedValue({ id: 'attempt-a' });
  checklistRunService.getAttempt.mockResolvedValue({ id: 'attempt-a' });
  checklistRunService.list.mockResolvedValue([run]);
  checklistRunService.publishedTemplates.mockResolvedValue(templates);
  checklistRunService.eligibleAssignees.mockResolvedValue(assignees);
  checklistRunService.create.mockResolvedValue(run);
  checklistRunService.reassign.mockResolvedValue({ ...run, version: 2, assignedTo: { membershipId: 'membership-b', name: 'Pessoa B' } });
  checklistRunService.listSchedules.mockResolvedValue([]);
  checklistRunService.createSchedule.mockResolvedValue({ id: 'schedule-a' });
  checklistRunService.setScheduleStatus.mockResolvedValue({ id: 'schedule-a', status: 'PAUSED', version: 2 });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  document.body.querySelectorAll('[role="dialog"]').forEach(element => element.remove());
  root = null;
  container = null;
});

test('lista ocorrências distinguindo modelo, responsável, criador e prazo', async () => {
  await renderPage();
  expect(document.body.textContent).toContain('Abertura segura');
  expect(document.body.textContent).toContain('Pessoa A');
  expect(document.body.textContent).toContain('Gestor A');
  expect(checklistRunService.list).toHaveBeenCalledTimes(1);
});

test('lista a fila pessoal e inicia a tentativa atribuída', async () => {
  checklistRunService.listMine.mockResolvedValue([{
    id: 'mine-a', status: 'ASSIGNED', dueAt: '2026-12-01T12:00:00.000Z',
    template: { name: 'Fechamento seguro', version: 1 }, attempt: null,
  }]);
  await renderPage();
  expect(document.body.textContent).toContain('Fechamento seguro');
  await click(button('Iniciar'));
  expect(checklistRunService.start).toHaveBeenCalledWith('mine-a');
});

test('inicia nova tentativa ao refazer uma ocorrência rejeitada', async () => {
  checklistRunService.listMine.mockResolvedValue([{
    id: 'mine-rejected', status: 'REJECTED', dueAt: '2026-12-01T12:00:00.000Z',
    template: { name: 'Fechamento seguro', version: 1 },
    attempt: { id: 'attempt-rejected', status: 'REJECTED', version: 2 },
  }]);
  await renderPage();
  await click(button('Refazer'));
  expect(checklistRunService.start).toHaveBeenCalledWith('mine-rejected');
  expect(checklistRunService.getAttempt).not.toHaveBeenCalled();
});

test('cria ocorrência com modelo, responsável, prazo UTC e chave idempotente', async () => {
  await renderPage();
  await click(button('Nova execução'));
  await change(field('Modelo publicado'), 'version-a');
  await change(field('Responsável'), 'membership-a');
  await change(field('Prazo'), '2026-12-01T09:30');
  const form = field('Modelo publicado').closest('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); });
  expect(checklistRunService.create).toHaveBeenCalledWith(expect.objectContaining({
    templateVersionId: 'version-a', assignedMembershipId: 'membership-a',
    clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    dueAt: expect.stringMatching(/^2026-12-01T/),
  }));
  expect(checklistRunService.list).toHaveBeenCalledTimes(2);
});

test('reatribui somente para outra pessoa e exige justificativa', async () => {
  await renderPage();
  await click(button('Reatribuir'));
  expect([...field('Novo responsável').options].some(option => option.value === 'membership-a')).toBe(false);
  await change(field('Novo responsável'), 'membership-b');
  await change(field('Justificativa'), 'Cobertura do turno');
  const form = field('Novo responsável').closest('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); });
  expect(checklistRunService.reassign).toHaveBeenCalledWith('run-a', {
    assignedMembershipId: 'membership-b', reason: 'Cobertura do turno', version: 1,
  });
});

test('cria agendamento semanal com responsável, horário e prazo', async () => {
  await renderPage();
  await click(button('Agendar semanal'));
  const modelFields = [...document.body.querySelectorAll('label')].filter(label => label.textContent.includes('Modelo publicado'));
  const responsibleFields = [...document.body.querySelectorAll('label')].filter(label => label.textContent.includes('Responsável'));
  await change(modelFields.at(-1).querySelector('select'), 'version-a');
  await change(responsibleFields.at(-1).querySelector('select'), 'membership-a');
  await change(field('Dia da semana'), '1');
  await change(field('Horário de geração'), '08:30');
  await change(field('Prazo após geração'), '12');
  const form = field('Dia da semana').closest('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); });
  expect(checklistRunService.createSchedule).toHaveBeenCalledWith(expect.objectContaining({
    templateVersionId: 'version-a', assignedMembershipId: 'membership-a',
    weekday: 1, localTime: '08:30', dueAfterMinutes: 720,
  }));
});

test('informa quando não existem modelos ou responsáveis elegíveis', async () => {
  checklistRunService.list.mockResolvedValue([]);
  checklistRunService.publishedTemplates.mockResolvedValue([]);
  checklistRunService.eligibleAssignees.mockResolvedValue([]);
  await renderPage();
  expect(document.body.textContent).toContain('Nenhum modelo publicado');
  expect(button('Nova execução')).toBeDisabled();
});

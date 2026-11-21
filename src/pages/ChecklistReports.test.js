import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import ChecklistReports from './ChecklistReports';
import { lightTheme } from '../styles/theme';
import checklistRunService from '../services/checklistRunService';

jest.mock('../services/checklistRunService', () => ({
  __esModule: true,
  default: { report: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const response = page => ({
  metadata: { period: { from: '2026-11-01', to: '2026-11-30' }, timeZone: 'America/Sao_Paulo' },
  summary: {
    totalRuns: 3, scoredRuns: 2, averageScore: 75, complianceRate: 50, completionRate: 33.33,
    onTimeRuns: 1, overdueRuns: 2, notStartedOverdueRuns: 1, criticalFailureRuns: 1, reworkRuns: 1,
    statusCounts: { ASSIGNED: 1, IN_PROGRESS: 0, SUBMITTED: 0, APPROVED: 1, REJECTED: 1, CANCELLED: 0 },
  },
  byTemplateVersion: [
    { templateVersionId: 'version-1', templateId: 'template-a', name: 'Abertura segura', version: 1, totalRuns: 2, averageScore: 75, complianceRate: 50 },
    { templateVersionId: 'version-2', templateId: 'template-a', name: 'Abertura segura', version: 2, totalRuns: 1, averageScore: null, complianceRate: 0 },
  ],
  byResponsible: [{ membershipId: 'person-a', name: 'Pessoa A', totalRuns: 3, averageScore: 75, complianceRate: 50 }],
  failedItems: [{ templateVersionId: 'version-1', stableKey: 'temperature', title: 'Temperatura correta?', templateName: 'Abertura segura', version: 1, failures: 1, critical: true }],
  byExecutor: [], byApprover: [],
  runs: [{ id: `run-${page}`, status: page === 1 ? 'APPROVED' : 'ASSIGNED', dueAt: '2026-11-20T15:00:00.000Z', overdue: page > 1, assignedTo: { name: 'Pessoa A' }, template: { name: 'Abertura segura', version: 1 }, attempt: page === 1 ? { score: 100 } : null }],
  pagination: { page, limit: 25, total: 26, totalPages: 2 },
  options: {
    templates: [
      { templateVersionId: 'version-1', templateId: 'template-a', name: 'Abertura segura', version: 1 },
      { templateVersionId: 'version-2', templateId: 'template-a', name: 'Abertura segura', version: 2 },
    ],
    responsible: [{ membershipId: 'person-a', name: 'Pessoa A' }],
  },
});

let container;
let root;
const flush = async () => { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); };
const renderPage = async () => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<ThemeProvider theme={lightTheme}><ChecklistReports/></ThemeProvider>); await flush(); });
};
const button = label => [...document.body.querySelectorAll('button')].find(element => element.textContent.includes(label));
const field = label => [...document.body.querySelectorAll('label')].find(element => element.textContent.includes(label))?.querySelector('input,select');
const change = async (element, value) => {
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles:true }));
    await flush();
  });
};
const click = async element => { await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles:true })); await flush(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  checklistRunService.report.mockImplementation(params => Promise.resolve(response(params.page || 1)));
});
afterEach(async () => { if(root) await act(async()=>root.unmount()); container?.remove(); root=null; container=null; });

test('mostra indicadores, versões separadas, falhas e ocorrências paginadas', async () => {
  await renderPage();
  expect(document.body.textContent).toContain('Pontuação média');
  expect(document.body.textContent).toContain('75%');
  expect(document.body.textContent).toContain('Temperatura correta?');
  expect(document.body.textContent).toContain('v1');
  expect(document.body.textContent).toContain('v2');
  await click(button('Próxima'));
  expect(checklistRunService.report).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 25 }));
  expect(document.body.textContent).toContain('Página 2 de 2');
});

test('envia somente filtros selecionados e reinicia a paginação', async () => {
  await renderPage();
  await change(field('Modelo'), 'template-a');
  await change(field('Versão'), 'version-2');
  await change(field('Responsável'), 'person-a');
  await act(async () => { field('Modelo').closest('form').dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); await flush(); });
  expect(checklistRunService.report).toHaveBeenLastCalledWith(expect.objectContaining({
    templateId:'template-a', templateVersionId:'version-2', responsibleMembershipId:'person-a', page:1,
  }));
});

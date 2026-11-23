import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import ChecklistExecution from './ChecklistExecution';
import { lightTheme } from '../styles/theme';
import checklistRunService from '../services/checklistRunService';

jest.mock('../services/checklistRunService', () => ({
  __esModule: true,
  default: {
    getAttempt: jest.fn(), saveResponse: jest.fn(), uploadEvidence: jest.fn(), submit: jest.fn(),
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
global.URL.createObjectURL = jest.fn(() => 'blob:preview');
global.URL.revokeObjectURL = jest.fn();

const attempt = {
  id: 'attempt-a', status: 'IN_PROGRESS', version: 1,
  run: { id: 'run-a', dueAt: '2026-12-01T12:00:00.000Z', status: 'IN_PROGRESS', version: 2 },
  template: {
    name: 'Abertura segura', version: 1, passingScore: 80,
    sections: [{ id: 'section-a', title: 'Abertura', items: [{
      id: 'item-a', stableKey: 'ready', title: 'Unidade pronta?', responseType: 'BOOLEAN',
      required: true, allowNotApplicable: false, critical: true, evidenceRequired: true, maxPoints: 10,
    }] }],
  },
  responses: [],
};

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
    root.render(<MemoryRouter initialEntries={['/checklists/execute/attempt-a']}><ThemeProvider theme={lightTheme}><Routes><Route path="/checklists/execute/:attemptId" element={<ChecklistExecution />} /></Routes></ThemeProvider></MemoryRouter>);
    await flush();
  });
};
const button = label => [...document.body.querySelectorAll('button')].find(element => element.textContent.includes(label));

beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL.mockReturnValue('blob:preview');
  checklistRunService.getAttempt.mockResolvedValue(attempt);
  checklistRunService.saveResponse.mockResolvedValue({
    id: 'response-a', templateItemId: 'item-a', version: 1, outcome: 'PASS', evidences: [],
  });
  checklistRunService.uploadEvidence.mockResolvedValue({ id: 'evidence-a', contentType: 'image/png' });
  checklistRunService.submit.mockResolvedValue({ ...attempt, status: 'SUBMITTED', score: 100, isCompliant: true });
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

test('salva resposta incremental, envia foto e submete a tentativa', async () => {
  await renderPage();
  expect(document.body.textContent).toContain('Unidade pronta?');

  const select = document.body.querySelector('select');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, 'true');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
  });
  await act(async () => { button('Salvar item').dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush(); });
  expect(checklistRunService.saveResponse).toHaveBeenCalledWith('attempt-a', 'item-a', expect.objectContaining({ value: true, version: 0 }));

  const input = document.body.querySelector('input[type="file"]');
  const file = new File(['png'], 'evidence.png', { type: 'image/png' });
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
  });
  expect(checklistRunService.uploadEvidence).toHaveBeenCalledWith('response-a', file);
  expect(document.body.textContent).toContain('1 foto(s) confirmada(s)');

  await act(async () => { button('Enviar checklist').dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush(); });
  expect(checklistRunService.submit).toHaveBeenCalledWith('attempt-a', 1);
  expect(document.body.textContent).toContain('Pontuação:');
  expect(document.body.textContent).toContain('100%');
});

test('remove a prévia local quando o storage rejeita o upload e permite nova tentativa', async () => {
  checklistRunService.uploadEvidence.mockRejectedValue(new Error('Storage de evidências não configurado para produção.'));
  await renderPage();

  const input = document.body.querySelector('input[type="file"]');
  const file = new File(['png'], 'evidence.png', { type: 'image/png' });
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    await flush();
  });

  expect(checklistRunService.uploadEvidence).toHaveBeenCalledWith('response-a', file);
  expect(document.body.textContent).toContain('Storage de evidências não configurado para produção.');
  expect(document.body.textContent).toContain('0 foto(s) confirmada(s)');
  expect(document.body.querySelector('img[alt="Prévia da evidência confirmada"]')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  expect(input.value).toBe('');
});

test('exibe decisão final imutável e o motivo de rejeição', async () => {
  checklistRunService.getAttempt.mockResolvedValue({
    ...attempt, status: 'REJECTED', score: 75, isCompliant: false,
    approvals: [{ decision: 'REJECT', reason: 'Refazer a conferência' }],
  });
  await renderPage();
  expect(document.body.textContent).toContain('Execução rejeitada');
  expect(document.body.textContent).toContain('Refazer a conferência');
  expect(button('Salvar item')).toBeUndefined();
  expect(button('Enviar checklist')).toBeUndefined();
});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import ChecklistApprovals from './ChecklistApprovals';
import { lightTheme } from '../styles/theme';
import checklistRunService from '../services/checklistRunService';

jest.mock('../services/checklistRunService', () => ({
  __esModule: true,
  default: {
    listApprovals: jest.fn(), getApprovalAttempt: jest.fn(), evidenceBlob: jest.fn(),
    approve: jest.fn(), reject: jest.fn(),
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
global.URL.createObjectURL = jest.fn(() => 'blob:approval-evidence');
global.URL.revokeObjectURL = jest.fn();

const attempt = {
  id: 'attempt-a', attemptNumber: 1, status: 'SUBMITTED', version: 2,
  score: 100, isCompliant: true, criticalFailure: false,
  submittedAt: '2026-11-20T18:00:00.000Z',
  executor: { membershipId: 'executor-a', name: 'Pessoa executora' },
  template: {
    name: 'Abertura segura', version: 1,
    sections: [{ id: 'section-a', title: 'Abertura', items: [{ id: 'item-a', title: 'Unidade pronta?' }] }],
  },
  responses: [{
    id: 'response-a', templateItemId: 'item-a', value: true, outcome: 'PASS', note: 'Conferido',
    evidences: [{ id: 'evidence-a', contentType: 'image/png' }],
  }],
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
    root.render(<ThemeProvider theme={lightTheme}><ChecklistApprovals /></ThemeProvider>);
    await flush();
  });
};
const button = label => [...document.body.querySelectorAll('button')].find(element => element.textContent.includes(label));
const click = async element => {
  expect(element).toBeTruthy();
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  checklistRunService.listApprovals.mockResolvedValue([attempt]);
  checklistRunService.getApprovalAttempt.mockResolvedValue(attempt);
  checklistRunService.evidenceBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  checklistRunService.approve.mockResolvedValue({ ...attempt, status: 'APPROVED' });
  checklistRunService.reject.mockResolvedValue({ ...attempt, status: 'REJECTED' });
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  document.body.querySelectorAll('[role="dialog"]').forEach(element => element.remove());
  root = null;
  container = null;
});

test('revisa respostas e evidências autenticadas antes de aprovar', async () => {
  await renderPage();
  expect(document.body.textContent).toContain('Pessoa executora');
  await click(button('Revisar'));
  expect(checklistRunService.getApprovalAttempt).toHaveBeenCalledWith('attempt-a');
  expect(checklistRunService.evidenceBlob).toHaveBeenCalledWith('evidence-a');
  expect(document.body.textContent).toContain('Unidade pronta?');
  expect(global.URL.createObjectURL).toHaveBeenCalled();
  await click(button('Aprovar'));
  expect(checklistRunService.approve).toHaveBeenCalledWith('attempt-a', { version: 2, reason: null });
});

test('exige justificativa e envia a rejeição para retrabalho', async () => {
  await renderPage();
  await click(button('Revisar'));
  const rejectButton = button('Rejeitar e solicitar retrabalho');
  expect(rejectButton).toBeDisabled();
  const textarea = document.body.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Refazer a conferência');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  });
  await click(rejectButton);
  expect(checklistRunService.reject).toHaveBeenCalledWith('attempt-a', {
    version: 2, reason: 'Refazer a conferência',
  });
});

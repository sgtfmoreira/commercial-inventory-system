import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import ChecklistTemplates from './ChecklistTemplates';
import { lightTheme } from '../styles/theme';
import { useApp } from '../context/AppContext';
import checklistTemplateService from '../services/checklistTemplateService';
import toast from 'react-hot-toast';

let mockParams = {};
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));
jest.mock('../context/AppContext', () => ({ useApp: jest.fn() }));
jest.mock('../services/checklistTemplateService', () => ({
  __esModule: true,
  default: {
    list: jest.fn(), get: jest.fn(), create: jest.fn(), saveDraft: jest.fn(),
    publish: jest.fn(), cloneVersion: jest.fn(), retire: jest.fn(), capabilities: jest.fn(),
  },
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const draftVersion = {
  id: 'draft-a', version: 1, status: 'DRAFT', approvalRequired: true, passingScore: 80,
  createdAt: '2026-11-17T17:00:00.000Z',
  updatedAt: '2026-11-17T18:00:00.000Z',
  sections: [{
    id: 'section-a', stableKey: 'opening', title: 'Abertura', description: '', position: 1,
    items: [{
      id: 'item-a', stableKey: 'temperature', title: 'Temperatura correta?', instructions: '', position: 1,
      responseType: 'BOOLEAN', required: true, allowNotApplicable: false, critical: true,
      evidenceRequired: false, maxPoints: 10, answerConfigJson: null, scoringConfigJson: { expected: true },
    }],
  }],
};
const publishedVersion = {
  ...draftVersion, id: 'published-a', status: 'PUBLISHED', publishedAt: '2026-11-17T19:00:00.000Z',
};
const template = versions => ({
  id: 'template-a', name: 'Abertura da cozinha', category: 'Operação', description: 'Rotina diária',
  versions,
});

let container;
let root;
const flush = async () => {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
};
const renderPage = async ({ canManage = true } = {}) => {
  useApp.mockReturnValue({
    state: { capabilitiesLoaded: true, capabilities: canManage ? { 'checklists.templates.manage': true } : {} },
    hasCapability: code => canManage && code === 'checklists.templates.manage',
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ThemeProvider theme={lightTheme}><ChecklistTemplates /></ThemeProvider>);
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
  mockParams = {};
  window.confirm = jest.fn(() => true);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  document.body.querySelectorAll('[role="dialog"]').forEach(element => element.remove());
  root = null;
  container = null;
});

test('nega visualmente o módulo sem a capability efetiva', async () => {
  await renderPage({ canManage: false });
  expect(document.body.textContent).toContain('Acesso restrito');
  expect(checklistTemplateService.list).not.toHaveBeenCalled();
});

test('lista modelos e cria um novo rascunho pelo formulário visual', async () => {
  checklistTemplateService.list.mockResolvedValue([template([draftVersion])]);
  checklistTemplateService.create.mockResolvedValue({ id: 'template-new' });
  await renderPage();
  expect(document.body.textContent).toContain('Abertura da cozinha');
  await click(button('Novo modelo'));
  await change(field('Nome do modelo'), 'Fechamento do salão');
  await change(field('Categoria'), 'Fechamento');
  const form = document.body.querySelector('#create-checklist');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); });
  expect(checklistTemplateService.create).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Fechamento do salão', category: 'Fechamento', passingScore: 80,
  }));
  expect(mockNavigate).toHaveBeenCalledWith('/checklists/templates/template-new');
});

test('edita o DRAFT, configura tipo e salva posições determinísticas', async () => {
  mockParams = { templateId: 'template-a' };
  checklistTemplateService.get.mockResolvedValue(template([draftVersion]));
  checklistTemplateService.saveDraft.mockResolvedValue(template([draftVersion]));
  await renderPage();
  expect(field('Pergunta 1').value).toBe('Temperatura correta?');
  await change(field('Tipo de resposta'), 'TEXT');
  await change(field('Peso / pontos'), '7');
  await click(button('Salvar'));
  expect(checklistTemplateService.saveDraft).toHaveBeenCalledWith('template-a', expect.objectContaining({
    expectedUpdatedAt: draftVersion.updatedAt,
    sections: [expect.objectContaining({
      position: 1,
      items: [expect.objectContaining({ responseType: 'TEXT', position: 1, maxPoints: 7 })],
    })],
  }));
  expect(toast.success).toHaveBeenCalledWith('Rascunho salvo.');
});

test('orienta o usuário antes de publicar um modelo sem perguntas', async () => {
  mockParams = { templateId: 'template-a' };
  const incompleteDraft = {
    ...draftVersion,
    sections: [{ ...draftVersion.sections[0], items: [] }],
  };
  checklistTemplateService.get.mockResolvedValue(template([incompleteDraft]));
  await renderPage();

  await click(button('Publicar'));

  expect(toast.error).toHaveBeenCalledWith('Adicione pelo menos uma pergunta na seção 1 antes de publicar.');
  expect(checklistTemplateService.saveDraft).not.toHaveBeenCalled();
  expect(checklistTemplateService.publish).not.toHaveBeenCalled();
});

test('remove metadados persistidos ao salvar um rascunho recarregado ou clonado', async () => {
  mockParams = { templateId: 'template-a' };
  const persistedDraft = {
    ...draftVersion,
    templateId: 'template-a',
    createdAt: '2026-11-17T17:00:00.000Z',
    sections: draftVersion.sections.map(section => ({
      ...section,
      templateVersionId: 'draft-a',
      createdAt: '2026-11-17T17:00:00.000Z',
      updatedAt: '2026-11-17T18:00:00.000Z',
      items: section.items.map(item => ({
        ...item,
        templateVersionId: 'draft-a',
        sectionId: section.id,
        createdAt: '2026-11-17T17:00:00.000Z',
        updatedAt: '2026-11-17T18:00:00.000Z',
      })),
    })),
  };
  checklistTemplateService.get.mockResolvedValue(template([persistedDraft]));
  checklistTemplateService.saveDraft.mockResolvedValue(template([persistedDraft]));
  await renderPage();
  await click(button('Salvar'));

  const payload = checklistTemplateService.saveDraft.mock.calls[0][1];
  expect(payload.sections[0]).toEqual(expect.objectContaining({
    stableKey: 'opening', title: 'Abertura', position: 1,
  }));
  expect(payload.sections[0]).not.toHaveProperty('id');
  expect(payload.sections[0]).not.toHaveProperty('templateVersionId');
  expect(payload.sections[0]).not.toHaveProperty('createdAt');
  expect(payload.sections[0].items[0]).toEqual(expect.objectContaining({
    stableKey: 'temperature', title: 'Temperatura correta?', position: 1,
  }));
  expect(payload.sections[0].items[0]).not.toHaveProperty('id');
  expect(payload.sections[0].items[0]).not.toHaveProperty('templateVersionId');
  expect(payload.sections[0].items[0]).not.toHaveProperty('sectionId');
  expect(payload.sections[0].items[0]).not.toHaveProperty('updatedAt');
});

test('versão publicada é consultável, protegida e pode originar N+1', async () => {
  mockParams = { templateId: 'template-a' };
  checklistTemplateService.get.mockResolvedValue(template([publishedVersion]));
  checklistTemplateService.cloneVersion.mockResolvedValue(template([{ ...draftVersion, id: 'draft-b', version: 2 }, publishedVersion]));
  await renderPage();
  expect(document.body.textContent).toContain('Fica protegida para preservar rotinas e resultados');
  expect(document.body.textContent).toContain('Para que serve cada versão?');
  expect(document.body.textContent).toContain('Temperatura correta?');
  expect(button('Salvar')).toBeFalsy();
  await click(button('Criar versão editável a partir desta'));
  expect(checklistTemplateService.cloneVersion).toHaveBeenCalledWith('template-a', 'published-a');
});

test('abre o rascunho existente ao tentar editar uma versão publicada', async () => {
  mockParams = { templateId: 'template-a' };
  const nextDraft = { ...draftVersion, id: 'draft-b', version: 2, sourceVersionId: 'published-a' };
  checklistTemplateService.get.mockResolvedValue(template([nextDraft, publishedVersion]));
  await renderPage();

  await click(button('Versão 1'));
  expect(document.body.textContent).toContain('Abrir rascunho V2');
  await click(button('Abrir rascunho V2'));

  expect(field('Pergunta 1').value).toBe('Temperatura correta?');
  expect(button('Salvar')).toBeTruthy();
  expect(checklistTemplateService.cloneVersion).not.toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalledWith('A versão 2 já está em edição como rascunho.');
});

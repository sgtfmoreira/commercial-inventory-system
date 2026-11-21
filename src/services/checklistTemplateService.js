import api from './api';

const templatesFrom = value => value?.templates || (Array.isArray(value) ? value : []);

const checklistTemplateService = {
  async capabilities() {
    const result = await api.get('/checklists/capabilities', { skipGlobalLoading: true });
    return result?.capabilities || {};
  },
  async list() {
    return templatesFrom(await api.get('/checklists/templates'));
  },
  get(templateId) {
    return api.get(`/checklists/templates/${templateId}`);
  },
  create(payload) {
    return api.post('/checklists/templates', payload);
  },
  saveDraft(templateId, payload) {
    return api.put(`/checklists/templates/${templateId}/draft`, payload);
  },
  publish(templateId, expectedUpdatedAt) {
    return api.post(`/checklists/templates/${templateId}/publish`, { expectedUpdatedAt });
  },
  cloneVersion(templateId, sourceVersionId) {
    return api.post(`/checklists/templates/${templateId}/versions`, { sourceVersionId });
  },
  retire(templateId, versionId, expectedUpdatedAt) {
    return api.post(`/checklists/templates/${templateId}/versions/${versionId}/retire`, { expectedUpdatedAt });
  },
};

export default checklistTemplateService;

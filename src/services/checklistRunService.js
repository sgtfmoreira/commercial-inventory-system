import api from './api';

const checklistRunService = {
  async capabilities() {
    const result = await api.get('/checklists/capabilities', { skipGlobalLoading: true });
    return result?.capabilities || {};
  },
  async list() {
    const result = await api.get('/checklists/runs');
    return result?.runs || [];
  },
  async publishedTemplates() {
    const result = await api.get('/checklists/published-templates');
    return result?.templates || [];
  },
  async eligibleAssignees() {
    const result = await api.get('/checklists/eligible-assignees');
    return result?.assignees || [];
  },
  create(payload) {
    return api.post('/checklists/runs', payload);
  },
  reassign(runId, payload) {
    return api.patch(`/checklists/runs/${runId}/assignment`, payload);
  },
  async listMine() {
    const result = await api.get('/checklists/my-runs');
    return result?.runs || [];
  },
  start(runId) {
    return api.post(`/checklists/runs/${runId}/start`, {});
  },
  getAttempt(attemptId) {
    return api.get(`/checklists/attempts/${attemptId}`);
  },
  saveResponse(attemptId, itemId, payload) {
    return api.put(`/checklists/attempts/${attemptId}/responses/${itemId}`, payload);
  },
  uploadEvidence(responseId, file) {
    const form = new FormData();
    form.append('evidence', file);
    return api.post(`/checklists/responses/${responseId}/evidences`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  submit(attemptId, version) {
    return api.post(`/checklists/attempts/${attemptId}/submit`, { version });
  },
  async listApprovals() {
    const result = await api.get('/checklists/approvals');
    return result?.attempts || [];
  },
  getApprovalAttempt(attemptId) {
    return api.get(`/checklists/approval-attempts/${attemptId}`);
  },
  approve(attemptId, payload) {
    return api.post(`/checklists/attempts/${attemptId}/approve`, payload);
  },
  reject(attemptId, payload) {
    return api.post(`/checklists/attempts/${attemptId}/reject`, payload);
  },
  history(runId) {
    return api.get(`/checklists/runs/${runId}/history`);
  },
  report(params) {
    return api.get('/checklists/reports', { params });
  },
  evidenceBlob(evidenceId) {
    return api.get(`/checklists/approval-evidences/${evidenceId}/content`, {
      responseType: 'blob', skipGlobalLoading: true,
    });
  },
};

export default checklistRunService;

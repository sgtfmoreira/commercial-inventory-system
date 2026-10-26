import api from './api';

const eventService = {
  listCustomers: params => api.get('/event-customers', { params }),
  createCustomer: data => api.post('/event-customers', data),
  getCustomer: id => api.get(`/event-customers/${id}`),
  updateCustomer: (id, data) => api.patch(`/event-customers/${id}`, data),
  listEvents: params => api.get('/events', { params }),
  listResponsibleUsers: () => api.get('/events/responsible-users'),
  getEvent: id => api.get(`/events/${id}`),
  listEventBudgets: id => api.get(`/events/${id}/budgets`),
  createEvent: data => api.post('/events', data),
  updateEvent: (id, data) => api.patch(`/events/${id}`, data),
  cancelEvent: id => api.post(`/events/${id}/cancel`),
  searchCatalog: params => api.get('/events/catalog-items',{params}),
  getBudget: id => api.get(`/event-budgets/${id}`),
  getProposal: id => api.get(`/event-budgets/${id}/proposal`),
  getProposalPdf: id => api.get(`/event-budgets/${id}/proposal.pdf`, { responseType: 'blob' }),
  updateBudget: (id,data) => api.patch(`/event-budgets/${id}`,data),
  recalculateBudget: id => api.post(`/event-budgets/${id}/recalculate`),
  addBudgetItem: (id,data) => api.post(`/event-budgets/${id}/items`,data),
  updateBudgetItem: (id,data) => api.patch(`/event-budget-items/${id}`,data),
  deleteBudgetItem: id => api.delete(`/event-budget-items/${id}`),
  sendBudget: id => api.post(`/event-budgets/${id}/send`),
  approveBudget: id => api.post(`/event-budgets/${id}/approve`),
  rejectBudget: (id, reason) => api.post(`/event-budgets/${id}/reject`, { reason }),
  createBudgetRevision: id => api.post(`/event-budgets/${id}/new-revision`),
};

export default eventService;

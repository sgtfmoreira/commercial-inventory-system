import api from './api';

const userAccessService = {
  listUsers: () => api.get('/users'),
  createUser: (payload) => api.post('/users', payload),
  updateUser: (userId, payload) => api.put(`/users/${userId}`, payload),
  deactivateUser: (userId) => api.delete(`/users/${userId}`),

  listProfiles: () => api.get('/user-access/profiles'),
  listPermissions: () => api.get('/user-access/permissions'),
  getAccess: (userId) => api.get(`/user-access/users/${userId}`),
  saveDraft: (userId, payload) => api.put(`/user-access/users/${userId}/draft`, payload),
  preview: (userId) => api.get(`/user-access/users/${userId}/preview`),
  history: (userId) => api.get(`/user-access/users/${userId}/history`),
  activate: (userId, payload) => api.post(`/user-access/users/${userId}/activate`, payload),
  rollback: (userId, payload) => api.post(`/user-access/users/${userId}/rollback`, payload),

  listOwners: () => api.get('/user-access/owners'),
  designateOwner: (userId, payload) => api.post(`/user-access/owners/${userId}`, payload),
  revokeOwner: (userId, reason) => api.delete(`/user-access/owners/${userId}`, { data: { reason } }),
  transferOwnership: (userId, payload) => api.post(`/user-access/owners/${userId}/transfer`, payload),
};

export default userAccessService;

import api from './api';

const operationalStructureService = {
  async capabilities() {
    const result = await api.get('/operational-structure/capabilities', { skipGlobalLoading: true });
    return result?.capabilities || {};
  },
  async listSectors(params = {}) {
    const result = await api.get('/operational-structure/sectors', { params });
    return result?.sectors || [];
  },
  getSector(id) { return api.get(`/operational-structure/sectors/${id}`); },
  createSector(payload) { return api.post('/operational-structure/sectors', payload); },
  updateSector(id, payload) { return api.patch(`/operational-structure/sectors/${id}`, payload); },
  setSectorStatus(id, payload) { return api.patch(`/operational-structure/sectors/${id}/status`, payload); },
  async listRoles(params = {}) {
    const result = await api.get('/operational-structure/roles', { params });
    return result?.roles || [];
  },
  getRole(id) { return api.get(`/operational-structure/roles/${id}`); },
  createRole(payload) { return api.post('/operational-structure/roles', payload); },
  updateRole(id, payload) { return api.patch(`/operational-structure/roles/${id}`, payload); },
  setRoleStatus(id, payload) { return api.patch(`/operational-structure/roles/${id}/status`, payload); },
};

export default operationalStructureService;

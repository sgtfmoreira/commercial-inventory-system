import api from './api';

const tableOccupancyService = {
  list: (config = {}) => api.get('/table-occupancies', { skipGlobalLoading:true, ...config }),
  metrics: (dateFrom, dateTo, config = {}) => api.get('/table-occupancies/metrics', {
    skipGlobalLoading:true,
    ...config,
    params:{ dateFrom, dateTo }
  }),
  create: data => api.post('/table-occupancies', data),
  createBatch: data => api.post('/table-occupancies/batch', data),
  release: (id, version) => api.post(`/table-occupancies/${id}/release`, { version })
};

export default tableOccupancyService;

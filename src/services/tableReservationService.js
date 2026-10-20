import api from './api';

const tableReservationService = {
  list: (date, config = {}) => api.get('/table-reservations', { skipGlobalLoading:true, ...config, params: { date } }),
  create: data => api.post('/table-reservations', data),
  createBatch: data => api.post('/table-reservations/batch', data),
  update: (id, data) => api.patch(`/table-reservations/${id}`, data),
  cancel: (id, version) => api.post(`/table-reservations/${id}/cancel`, { version }),
  previewImport: reservations => api.post('/table-reservations/import/preview', { reservations }),
  importReservations: reservations => api.post('/table-reservations/import', { reservations })
};

export default tableReservationService;

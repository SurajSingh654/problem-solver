import api from './api.js'

export const problemsApi = {

  getAll: (params = {}) =>
    api.get('/problems', { params }),

  getById: (id) =>
    api.get(`/problems/${id}`),

  create: (data) =>
    api.post('/problems', data),

  update: (id, data) =>
    api.put(`/problems/${id}`, data),

  delete: (id) =>
    api.delete(`/problems/${id}`),

}
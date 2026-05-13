import api from './api.js'

export const designReferencesApi = {
    list: (params = {}) => api.get('/design-references', { params }),
    get: (id) => api.get(`/design-references/${id}`),
    create: (data) => api.post('/design-references', data),
    update: (id, data) => api.patch(`/design-references/${id}`, data),
    delete: (id) => api.delete(`/design-references/${id}`),
}

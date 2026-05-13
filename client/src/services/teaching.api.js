// ============================================================================
// Team Teaching Sessions — API client
// ============================================================================
//
// Thin wrappers over `api.{get,post,patch,delete}`. P0 covers create /
// list / detail / patch / cancel + start/end transitions. Later phases
// add notes (P3), rating + flag (P2), join + leave (P1), admin queue.
// ============================================================================
import api from "./api.js";

export const teachingApi = {
    list: (params = {}) => api.get("/teaching", { params }),
    get: (id) => api.get(`/teaching/${id}`),
    create: (data) => api.post("/teaching", data),
    update: (id, data) => api.patch(`/teaching/${id}`, data),
    cancel: (id) => api.delete(`/teaching/${id}`),
    start: (id) => api.post(`/teaching/${id}/start`),
    end: (id) => api.post(`/teaching/${id}/end`),
    join: (id) => api.post(`/teaching/${id}/join`),
    leave: (id) => api.post(`/teaching/${id}/leave`),
    rate: (id, data) => api.post(`/teaching/${id}/rate`, data),
    flag: (id, data) => api.post(`/teaching/${id}/flag`, data),
    submitNotes: (id, data) => api.post(`/teaching/${id}/notes`, data),

    // Admin
    listFlags: (params = {}) => api.get("/teaching/admin/flags", { params }),
    dismissFlag: (flagId, data = {}) =>
        api.post(`/teaching/admin/flags/${flagId}/dismiss`, data),
    upholdFlag: (flagId, data = {}) =>
        api.post(`/teaching/admin/flags/${flagId}/uphold`, data),
};

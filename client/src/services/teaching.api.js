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
};

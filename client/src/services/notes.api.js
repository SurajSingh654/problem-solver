// ============================================================================
// Notes — API client (P0)
// ============================================================================
// P0: create / list / detail / patch / archive / restore / pin.
// P1+ adds entity linking, tags, AI surfaces, related, flashcards.
// ============================================================================
import api from "./api.js";

export const notesApi = {
    list: (params = {}) => api.get("/notes", { params }),
    get: (id) => api.get(`/notes/${id}`),
    create: (data) => api.post("/notes", data),
    update: (id, data) => api.patch(`/notes/${id}`, data),
    archive: (id) => api.delete(`/notes/${id}`),
    restore: (id) => api.post(`/notes/${id}/restore`),
    togglePin: (id) => api.post(`/notes/${id}/pin`),
    listByEntity: (type, id) => api.get(`/notes/by-entity/${type}/${id}`),
    linkSearch: (type, q = "") =>
        api.get("/notes/link-search", { params: { type, q } }),
}

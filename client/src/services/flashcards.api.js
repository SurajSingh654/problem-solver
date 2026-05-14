// ============================================================================
// Flashcards — API client (P5)
// ============================================================================
import api from "./api.js";

export const flashcardsApi = {
    list: (params = {}) => api.get("/flashcards", { params }),
    queue: () => api.get("/flashcards/queue"),
    stats: () => api.get("/flashcards/stats"),
    create: (data) => api.post("/flashcards", data),
    update: (id, data) => api.patch(`/flashcards/${id}`, data),
    archive: (id) => api.delete(`/flashcards/${id}`),
    review: (id, data) => api.post(`/flashcards/${id}/review`, data),
}

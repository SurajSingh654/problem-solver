// ============================================================================
// Topic Mastery Tracks — API client (v1 scaffold)
// ============================================================================
// User-facing only. Admin endpoints (publish/edit) live in a separate
// admin client when those routes ship.
// ============================================================================
import api from "./api.js";

export const topicsApi = {
    list: () => api.get("/topics"),
    get: (slug) => api.get(`/topics/${slug}`),
    state: (slug) => api.get(`/topics/${slug}/state`),
    enroll: (slug, preferences) =>
        api.post(`/topics/${slug}/enroll`, { preferences }),
    updateEnrollment: (slug, data) =>
        api.patch(`/topics/${slug}/enrollment`, data),
    getCalibration: (slug) => api.get(`/topics/${slug}/calibration`),
    submitCalibration: (slug, responses) =>
        api.post(`/topics/${slug}/calibration/submit`, { responses }),
    getConcept: (slug, conceptSlug) =>
        api.get(`/topics/${slug}/concepts/${conceptSlug}`),
    markConceptRead: (slug, conceptSlug) =>
        api.post(`/topics/${slug}/concepts/${conceptSlug}/mark-read`),
}

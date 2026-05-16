// ============================================================================
// Topic Mastery Tracks — Admin API client (SuperAdmin)
// ============================================================================
// Mirrors the server's admin endpoints (/admin/learning/*). Sees ALL rows
// regardless of status. Used only by /super-admin/learning pages.
// ============================================================================
import api from "./api.js";

const ROOT = "/admin/learning";

export const topicsAdminApi = {
    // Topics
    listTopics: () => api.get(`${ROOT}/topics`),
    getTopic: (slug) => api.get(`${ROOT}/topics/${slug}`),
    updateTopic: (slug, data) => api.patch(`${ROOT}/topics/${slug}`, data),

    // Concepts
    createConcept: (topicSlug, data) =>
        api.post(`${ROOT}/topics/${topicSlug}/concepts`, data),
    updateConcept: (id, data) => api.patch(`${ROOT}/concepts/${id}`, data),
    deleteConcept: (id) => api.delete(`${ROOT}/concepts/${id}`),

    // Concept prereqs
    addPrereq: (id, prereqId) =>
        api.post(`${ROOT}/concepts/${id}/prereqs`, { prereqId }),
    removePrereq: (id, depId) =>
        api.delete(`${ROOT}/concepts/${id}/prereqs/${depId}`),
}

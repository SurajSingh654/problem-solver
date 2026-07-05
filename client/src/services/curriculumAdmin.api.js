// ============================================================================
// Curriculum Admin — TEAM_ADMIN API client (W3.T8 + W3.T9)
// ============================================================================
// Mirrors the server's `/curriculum/admin/*` surface (curriculumAdmin.routes.js).
// Every endpoint here is TEAM_ADMIN-gated on the server; the client renders
// them behind the `admin` route wrappers, and the middleware chain is
// authoritative — no client-side role check duplicates.
//
// Response shape: server uses the standard { success, data, meta? } envelope
// (see services/api.js). All calls return `axios.Response`; the hooks in
// `useCurriculumAdmin.js` unwrap `.data.data`.
// ============================================================================
import api from "./api.js";

const ROOT = "/curriculum/admin";

export const curriculumAdminApi = {
    // Team's Topic collection.
    listTopics: () => api.get(`${ROOT}/topics`),
    createTopic: (body) => api.post(`${ROOT}/topics`, body),
    getTopicDetail: (id) => api.get(`${ROOT}/topics/${id}`),
    updateTopic: (id, body) => api.patch(`${ROOT}/topics/${id}`, body),

    // Global TopicTemplate library (PUBLISHED only, read-only for TEAM_ADMIN).
    listTemplates: () => api.get(`${ROOT}/templates`),

    // Fork a TopicTemplate into the current team.
    forkTemplate: (templateSlug) =>
        api.post(`${ROOT}/topics/from-template/${encodeURIComponent(templateSlug)}`),

    // Template drift indicator ("template updated" chip on the authoring page).
    getTemplateStatus: (id) => api.get(`${ROOT}/topics/${id}/template-status`),

    // ── Concept + Lab CRUD (W3.T3) ──────────────────────────────────
    createConcept: (body) => api.post(`${ROOT}/concepts`, body),
    updateConcept: (id, body) => api.patch(`${ROOT}/concepts/${id}`, body),
    createLab: (body) => api.post(`${ROOT}/labs`, body),
    updateLab: (id, body) => api.patch(`${ROOT}/labs/${id}`, body),

    // ── Review triggers (W3.T4) ─────────────────────────────────────
    reviewTopic: (id) => api.post(`${ROOT}/topics/${id}/review`),
    reviewConcept: (id) => api.post(`${ROOT}/concepts/${id}/review`),
    reviewLab: (id) => api.post(`${ROOT}/labs/${id}/review`),

    // ── Publish (W3.T4) ─────────────────────────────────────────────
    // 400 with PUBLISH_GATE_BLOCKED carries `error.details.gates[]` —
    // callers extract via extractErrorCode + err.response.data.error.details.
    publishTopic: (id) => api.post(`${ROOT}/topics/${id}/publish`),
    publishConcept: (id) => api.post(`${ROOT}/concepts/${id}/publish`),
}

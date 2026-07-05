// ============================================================================
// Curriculum Admin — TEAM_ADMIN API client (W3.T8)
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
    updateTopic: (id, body) => api.patch(`${ROOT}/topics/${id}`, body),

    // Global TopicTemplate library (PUBLISHED only, read-only for TEAM_ADMIN).
    listTemplates: () => api.get(`${ROOT}/templates`),

    // Fork a TopicTemplate into the current team.
    forkTemplate: (templateSlug) =>
        api.post(`${ROOT}/topics/from-template/${encodeURIComponent(templateSlug)}`),

    // Template drift indicator ("template updated" chip on the authoring page).
    getTemplateStatus: (id) => api.get(`${ROOT}/topics/${id}/template-status`),
}

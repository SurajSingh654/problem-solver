// ============================================================================
// Curriculum Learner — MEMBER-facing API client (W4.T5)
// ============================================================================
// Mirrors the server's `/curriculum/*` learner surface (curriculum.routes.js).
// Distinct from `curriculumAdmin.api.js` which targets TEAM_ADMIN routes at
// `/curriculum/admin/*`. Both share the standard `{ success, data, meta? }`
// envelope from services/api.js — hooks unwrap `.data.data` in
// `useCurriculumLearn.js`, matching the pattern established in
// `useCurriculumAdmin.js` (W3.T8).
//
// Endpoint map (from server/src/routes/curriculum.routes.js):
//   GET  /topics                              → listTopics
//   GET  /topics/:slug                        → getTopicDetail
//   POST /topics/:slug/enroll                 → enrollInTopic
//   GET  /concepts/:slug                      → getConceptDetail
//   POST /labs/:id/attempts                   → submitAttempt (202 async)
//   GET  /labs/:id/attempts/:attemptId        → getAttempt (polling target)
//   POST /labs/:id/reveal-reference           → revealReference (server gate)
//   POST /concepts/:slug/checkin              → submitCheckIn
//   POST /concepts/:slug/mark-primer-read     → markPrimerRead (engagement)
// ============================================================================
import api from "./api.js";

const ROOT = "/curriculum";

export const curriculumLearnApi = {
    // Topic catalog + detail.
    listTopics: () => api.get(`${ROOT}/topics`),
    getTopicDetail: (slug) => api.get(`${ROOT}/topics/${slug}`),

    // Enrollment (idempotent upsert on the server).
    enrollInTopic: (slug, body) =>
        api.post(`${ROOT}/topics/${slug}/enroll`, body ?? {}),

    // Concept detail — reference solution / starter code are NOT included
    // unless the server-side gate has flipped `revealedReferenceAt`.
    getConceptDetail: (slug) => api.get(`${ROOT}/concepts/${slug}`),

    // Lab attempts (W4.T2 — POST returns 202 with { attemptId, reviewStatus:
    // "PENDING", attemptNumber }; the caller polls GET until COMPLETED/ERROR
    // or receives the WS `curriculum:review_ready` event, whichever comes
    // first).
    submitAttempt: (labId, body) =>
        api.post(`${ROOT}/labs/${labId}/attempts`, body),
    getAttempt: (labId, attemptId) =>
        api.get(`${ROOT}/labs/${labId}/attempts/${attemptId}`),

    // Reveal reference solution — server enforces the struggle-first gate
    // (STRONG/ADEQUATE verdict + READY_FOR_REFERENCE concept status). 403
    // GATE_BLOCKED on failure. When FEATURE_CURRICULUM_WALKTHROUGH is on
    // server-side, the response also includes `walkthroughEnabled: true` +
    // `attempt.walkthroughStatus`, and the AI walkthrough task is dispatched
    // fire-and-forget through the per-team semaphore.
    revealReference: (labId) =>
        api.post(`${ROOT}/labs/${labId}/reveal-reference`),

    // Walkthrough (Phase R.1, 2026-07-11) — GET returns { status, walkthrough
    // (only when COMPLETED), usedFallback, generatedAt, viewedAt, inputStale }.
    // First successful GET after COMPLETED stamps walkthroughViewedAt server-
    // side (D10 metacognition signal). Cheap DB read; poll safely.
    getWalkthrough: (labId, attemptId) =>
        api.get(`${ROOT}/labs/${labId}/attempts/${attemptId}/walkthrough`),
    // Retry from ERROR state — owner-gated, requires revealedReferenceAt to
    // be set. Chained AI limiters at the route layer.
    retryWalkthrough: (labId, attemptId) =>
        api.post(`${ROOT}/labs/${labId}/attempts/${attemptId}/walkthrough/retry`),

    // Check-in submit (recall / apply / build → AI verdict + calibration).
    submitCheckIn: (slug, body) =>
        api.post(`${ROOT}/concepts/${slug}/checkin`, body),

    // Primer-read engagement signal — fire-and-forget, server dedups within
    // 24 h so the client can call it on every ConceptPrimerTab mount without
    // guarding.
    markPrimerRead: (slug) =>
        api.post(`${ROOT}/concepts/${slug}/mark-primer-read`),
};

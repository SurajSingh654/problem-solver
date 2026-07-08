// ============================================================================
// Curriculum Admin — TEAM_ADMIN React Query hooks (W3.T8 + W3.T9)
// ============================================================================
//
// Client-side entry point to the TEAM_ADMIN curriculum authoring flow. Wraps
// `curriculumAdmin.api.js` in TanStack Query hooks with:
//   - Query keys namespaced under ["curriculum", "admin", ...] so the whole
//     tree can be invalidated on a single call (e.g. after a fork).
//   - Mutations via `useToastingMutation` (per Sprint 9 memory — every DB
//     mutation gets a toast on success/error unless silenced).
//   - Ownership of side effects: the fork mutation navigates the user to
//     the newly created topic on success, so the calling page doesn't have
//     to manually route.
//
// The mounted routes at `/curriculum/admin/*` are TEAM_ADMIN-gated on the
// server (auth → requireTeamContext → requireTeamAdmin) — the client renders
// these behind the `<ProtectedRoute requireTeamAdmin>` wrapper. If a MEMBER
// somehow lands on the URL, the 403 flows through the existing api.js
// interceptor + useToastingMutation's toast handler.
// ============================================================================
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { curriculumAdminApi } from "@services/curriculumAdmin.api";
import { useToastingMutation, extractErrorCode } from "./useToastingMutation";

const KEYS = {
    topics: ["curriculum", "admin", "topics"],
    templates: ["curriculum", "admin", "templates"],
    topicDetail: (id) => ["curriculum", "admin", "topic", id],
    templateStatus: (id) => ["curriculum", "admin", "topics", id, "template-status"],
    // Review verdicts are cached per (target-kind, id) so a "Re-run review"
    // action can invalidate exactly that entry without touching sibling caches.
    reviewTopic: (id) => ["curriculum", "admin", "review", "topic", id],
    reviewConcept: (id) => ["curriculum", "admin", "review", "concept", id],
    reviewLab: (id) => ["curriculum", "admin", "review", "lab", id],
}

// The api client returns axios responses; server envelope is { data: {...} }
// so we unwrap `.data.data` to get the payload.
function unwrap(promise) {
    return promise.then((r) => r.data.data)
}

// ============================================================================
// TOPICS (team-scoped)
// ============================================================================

/**
 * List the current team's topics with their status + concept count.
 * Drives the CurriculumAdminPage status board + topics table.
 */
export function useCurriculumAdminTopics() {
    return useQuery({
        queryKey: KEYS.topics,
        queryFn: () => unwrap(curriculumAdminApi.listTopics()).then((d) => d.topics ?? []),
    })
}

/**
 * Single-topic detail — topic + ordered concepts + each concept's lab.
 * Drives every tab of TopicAuthoringPage. `enabled: !!topicId` keeps the
 * query dormant while the router URL is still resolving.
 */
export function useTopicDetail(topicId) {
    return useQuery({
        queryKey: KEYS.topicDetail(topicId),
        // Server returns { data: { topic: {...} } }. unwrap gives us
        // { topic: ... } — flatten once more so callers get the topic
        // object directly (matches useAllTopics + useTemplates shape).
        queryFn: () => unwrap(curriculumAdminApi.getTopicDetail(topicId)).then(x => x.topic),
        enabled: !!topicId,
    })
}

/**
 * Create a blank Topic in the current team.
 * Body: { slug, name, description, category, estimatedHoursToMastery? }
 */
export function useCreateBlankTopic() {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: (body) => unwrap(curriculumAdminApi.createTopic(body)),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.topics })
        },
        successMessage: "Topic created.",
        errorPrefix: "Failed to create topic",
        // Duplicate slug within the same team → server returns 409 DUPLICATE_SLUG.
        // Give it a friendlier message than the raw server text.
        conflictMessage: "A topic with that slug already exists in your team.",
    })
}

/**
 * PATCH /topics/:id — update Topic metadata.
 * Invalidates both the single-topic detail (so the current page refetches)
 * and the topics list (so the status board on the landing page reflects
 * the change on next navigation).
 */
export function useUpdateTopic(topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: (body) => unwrap(curriculumAdminApi.updateTopic(topicId, body)),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            qc.invalidateQueries({ queryKey: KEYS.topics })
        },
        successMessage: "Topic saved.",
        errorPrefix: "Failed to save topic",
    })
}

// ============================================================================
// TEMPLATE LIBRARY (global, read-only from TEAM_ADMIN perspective)
// ============================================================================

/**
 * List global TopicTemplates available for forking (PUBLISHED only —
 * DRAFT / REVIEWED templates are filtered server-side).
 */
export function useCurriculumTemplates() {
    return useQuery({
        queryKey: KEYS.templates,
        queryFn: () => unwrap(curriculumAdminApi.listTemplates()).then((d) => d.templates ?? []),
    })
}

/**
 * Fork a template into the current team. Navigates to the newly created
 * topic's authoring page on success.
 *
 * The response `data` shape is `{ topic, conceptCount, labCount }`; we
 * navigate on `topic.id`, not on slug, so a downstream slug-rename won't
 * break the URL contract.
 */
export function useForkTemplate() {
    const qc = useQueryClient()
    const navigate = useNavigate()
    return useToastingMutation({
        mutationFn: (templateSlug) =>
            unwrap(curriculumAdminApi.forkTemplate(templateSlug)),
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: KEYS.topics })
            if (data?.topic?.id) {
                navigate(`/admin/curriculum/topics/${data.topic.id}`)
            }
        },
        // Compose the success message with the topic name if available.
        successMessage: "Template forked into your team.",
        errorPrefix: "Failed to fork template",
        // 409 fires when this team already forked the same slug. The
        // TemplateBrowserPage also surfaces this inline on the card via
        // `mutation.error` — the toast is a redundant safety net.
        conflictMessage:
            "You've already forked this template — see it under \"My Topics\".",
    })
}

/**
 * Drift indicator — is the source template newer than when we forked?
 * `enabled: !!topicId` keeps the query dormant until we have an ID.
 */
export function useTemplateStatus(topicId) {
    return useQuery({
        queryKey: KEYS.templateStatus(topicId),
        queryFn: () => unwrap(curriculumAdminApi.getTemplateStatus(topicId)),
        enabled: !!topicId,
    })
}

// ============================================================================
// CONCEPT + LAB CRUD (W3.T3)
// ============================================================================
//
// All Concept/Lab writes invalidate the parent Topic detail cache — the
// authoring UI reads the tree from `useTopicDetail`, so any child change
// must trigger a refetch there. A finer-grained cache split would let us
// patch the tree in place, but the detail response is small (<50 KB in
// practice) and refetching after a save gives us reload-parity for free.
// ============================================================================

/**
 * POST /concepts — create a Concept under a Topic. Body includes topicId
 * so the callsite doesn't need a curried factory hook per topic.
 */
export function useCreateConcept(topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: (body) => unwrap(curriculumAdminApi.createConcept(body)),
        onSuccess: () => {
            if (topicId) {
                qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            }
        },
        successMessage: "Concept created.",
        errorPrefix: "Failed to create concept",
        conflictMessage: "A concept with that slug already exists in this topic.",
    })
}

/**
 * PATCH /concepts/:id — update a Concept in place. Callers pass the
 * parent topicId so the hook can invalidate the topic detail cache.
 */
export function useUpdateConcept(conceptId, topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: (body) => unwrap(curriculumAdminApi.updateConcept(conceptId, body)),
        onSuccess: () => {
            if (topicId) {
                qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            }
        },
        successMessage: "Concept saved.",
        errorPrefix: "Failed to save concept",
    })
}

/**
 * POST /labs — attach a Lab to a Concept. Lab is 1:1 with Concept
 * (schema.prisma), so the server returns 409 DUPLICATE_LAB if a lab
 * already exists.
 */
export function useCreateLab(topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: (body) => unwrap(curriculumAdminApi.createLab(body)),
        onSuccess: () => {
            if (topicId) {
                qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            }
        },
        successMessage: "Lab created.",
        errorPrefix: "Failed to create lab",
        conflictMessage: "This concept already has a lab.",
    })
}

/**
 * PATCH /labs/:id — update a Lab in place.
 */
export function useUpdateLab(labId, topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: (body) => unwrap(curriculumAdminApi.updateLab(labId, body)),
        onSuccess: () => {
            if (topicId) {
                qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            }
        },
        successMessage: "Lab saved.",
        errorPrefix: "Failed to save lab",
    })
}

// ============================================================================
// REVIEW TRIGGERS (W3.T4)
// ============================================================================
//
// Reviews return `{ verdict, body, logId, usedFallback }`. We seed the
// dedicated review cache with the result so re-rendering across tabs
// doesn't require a re-fetch — the tab shows the "last run" verdict
// immediately from cache, and only calls out to the server when the user
// clicks "Re-run review". Topic review also invalidates the topic detail
// (server caches the verdict onto `topic.curriculumReview`).
// ============================================================================

/**
 * POST /topics/:id/review — trigger the curriculum-review AI validator.
 * Server writes `topic.curriculumReview` + `topic.lastReviewedAt`, so we
 * also invalidate the topic detail cache after success.
 */
export function useRunCurriculumReview(topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: () => unwrap(curriculumAdminApi.reviewTopic(topicId)),
        onSuccess: (data) => {
            qc.setQueryData(KEYS.reviewTopic(topicId), data)
            qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
        },
        successMessage: "Curriculum review complete.",
        errorPrefix: "Failed to run curriculum review",
    })
}

/**
 * POST /concepts/:id/review — trigger the lesson-review AI validator.
 * Concept status doesn't auto-flip; the reviewer must publish to move it.
 */
export function useRunLessonReview(conceptId, topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: () => unwrap(curriculumAdminApi.reviewConcept(conceptId)),
        onSuccess: (data) => {
            qc.setQueryData(KEYS.reviewConcept(conceptId), data)
            if (topicId) {
                qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            }
        },
        successMessage: "Lesson review complete.",
        errorPrefix: "Failed to run lesson review",
    })
}

/**
 * POST /labs/:id/review — deterministic lab shape check. Fast, no AI.
 */
export function useRunLabShapeCheck(labId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: () => unwrap(curriculumAdminApi.reviewLab(labId)),
        onSuccess: (data) => {
            qc.setQueryData(KEYS.reviewLab(labId), data)
        },
        successMessage: "Lab shape check complete.",
        errorPrefix: "Failed to run lab shape check",
    })
}

// ============================================================================
// PUBLISH GATES (W3.T4)
// ============================================================================
//
// 400 PUBLISH_GATE_BLOCKED carries `error.details.gates[]` — the client
// renders each gate row via <PublishGateChecklist>. Using `silent: true`
// so the generic toast doesn't compete with the inline checklist UX.
// Non-gate errors (500 etc.) fall through to the caller's `onError` path,
// which surfaces its own toast via `extractErrorMessage`.
// ============================================================================

/**
 * POST /topics/:id/publish — enforce publish gates and flip status.
 * Caller reads `mutation.error.response.data.error.details.gates` on 400.
 */
export function usePublishTopic(topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        // Accepts { force: true } to bypass the advisory curriculum-review
        // gate (SUPER_ADMIN only; concepts-all-published gate is not
        // bypassable).
        mutationFn: (opts = {}) =>
            unwrap(curriculumAdminApi.publishTopic(topicId, !!opts.force)),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            qc.invalidateQueries({ queryKey: KEYS.topics })
        },
        // Silence the default toast — the checklist inline is the primary
        // UX on 400 and a success toast fires from the caller's onSuccess
        // callback for the 200 path.
        silent: true,
    })
}

/**
 * POST /concepts/:id/publish — enforce concept publish gates.
 */
export function usePublishConcept(conceptId, topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        // Accepts { force: true } to bypass the advisory lesson-review gate
        // (SUPER_ADMIN only; the readiness rubric gate is not bypassable).
        mutationFn: (opts = {}) =>
            unwrap(curriculumAdminApi.publishConcept(conceptId, !!opts.force)),
        onSuccess: () => {
            if (topicId) {
                qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            }
        },
        silent: true,
    })
}

/**
 * POST /labs/:id/publish — enforce deterministic lab publish gates
 * (referenceSolution + timebox). Both structural, no force= support.
 * Caller reads `mutation.error.response.data.error.details.gates` on 400.
 */
export function usePublishLab(labId, topicId) {
    const qc = useQueryClient()
    return useToastingMutation({
        mutationFn: () => unwrap(curriculumAdminApi.publishLab(labId)),
        onSuccess: () => {
            if (topicId) {
                qc.invalidateQueries({ queryKey: KEYS.topicDetail(topicId) })
            }
        },
        silent: true,
    })
}

// Re-export for callers that want to distinguish gate errors from other
// errors without pulling from services/api directly.
export { extractErrorCode }

// ============================================================================
// Curriculum Admin — TEAM_ADMIN React Query hooks (W3.T8)
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
import { useToastingMutation } from "./useToastingMutation";

const KEYS = {
    topics: ["curriculum", "admin", "topics"],
    templates: ["curriculum", "admin", "templates"],
    templateStatus: (id) => ["curriculum", "admin", "topics", id, "template-status"],
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
        queryFn: () => unwrap(curriculumAdminApi.listTopics()),
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
        queryFn: () => unwrap(curriculumAdminApi.listTemplates()),
    })
}

/**
 * Fork a template into the current team. Navigates to the newly created
 * topic's authoring page on success (route lands in W3.T9; until then the
 * URL resolves to the catch-all + redirects to /dashboard — safe).
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
            // W3.T9 will wire this route; today it falls through to the
            // catch-all. Once T9 ships the URL will land on the authoring
            // page directly — no callsite changes needed.
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

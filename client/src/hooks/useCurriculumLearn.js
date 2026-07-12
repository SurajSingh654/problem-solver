// ============================================================================
// Curriculum Learner — MEMBER React Query hooks (W4.T5)
// ============================================================================
//
// Client-side entry point to the learner curriculum surface. Wraps
// `curriculumLearn.api.js` in TanStack Query hooks with:
//   - Query keys namespaced under ["curriculum", "learner", ...] so the
//     whole tree can be invalidated on a single call without touching the
//     admin cache ["curriculum", "admin", ...].
//   - Mutations via `useToastingMutation` with static `successMessage` +
//     `errorPrefix` (W3 established this signature — no callback form).
//   - Async lab-attempt polling: `useAttempt` returns `refetchInterval:
//     false` once `reviewStatus` becomes terminal (COMPLETED | ERROR),
//     stopping the poll without unmounting the query.
//   - `useCurriculumReviewReady` — a raw WebSocket subscription that
//     mirrors the pattern in `components/teaching/LiveTeachingRoom.jsx`:
//     open a socket, send `{ type: "auth", token }` as the first frame,
//     react to targeted per-user events (server routes these via
//     `sendToUser(userId, ...)`, so every event arriving on this socket
//     already belongs to the current user).
//
// The mounted routes at `/curriculum/*` (non-admin) require
// authenticate + requireTeamContext — MEMBER, TEAM_ADMIN, and SUPER_ADMIN
// all reach them. The client renders these behind the standard main-app
// `<ProtectedRoute requireTeamContext>` wrapper.
// ============================================================================
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { curriculumLearnApi } from "@services/curriculumLearn.api";
import { useToastingMutation } from "./useToastingMutation";

const KEYS = {
    topics: ["curriculum", "learner", "topics"],
    topicDetail: (slug) => ["curriculum", "learner", "topic", slug],
    conceptDetail: (slug) => ["curriculum", "learner", "concept", slug],
    // Per-attempt cache — the polling hook reads from this key, and the
    // WS-review-ready hook invalidates the same key so the two paths
    // converge on the same cache entry.
    attempt: (labId, attemptId) => [
        "curriculum",
        "learner",
        "attempt",
        labId,
        attemptId,
    ],
    // Per-attempt walkthrough (Phase R.1). Separate key from `attempt` so
    // walkthrough polling can terminate independently of code-review
    // polling; also lets the reveal-invalidation touch only walkthrough
    // state without evicting the main attempt row.
    walkthrough: (labId, attemptId) => [
        "curriculum",
        "learner",
        "walkthrough",
        labId,
        attemptId,
    ],
};

// The api client returns axios responses; server envelope is `{ success,
// data, meta? }`. Unwrap `.data.data` to get the payload — matches the
// convention in `useCurriculumAdmin.js`.
function unwrap(promise) {
    return promise.then((r) => r.data.data);
}

// ============================================================================
// LEARNER READS
// ============================================================================

/**
 * Topic catalog for the LearnPage. Returns the shaped topics array (name,
 * slug, category, status, conceptCount, enrolledConceptCount, etc.).
 */
export function useLearnCatalog() {
    return useQuery({
        queryKey: KEYS.topics,
        queryFn: () => unwrap(curriculumLearnApi.listTopics()).then((d) => d.topics),
    });
}

/**
 * Single-topic detail for TopicDetailPage — topic metadata + ordered
 * concepts (with per-concept enrollment / mastery state). `enabled: !!slug`
 * keeps the query dormant while the router URL is still resolving.
 */
export function useTopicDetail(slug) {
    return useQuery({
        queryKey: KEYS.topicDetail(slug),
        queryFn: () =>
            unwrap(curriculumLearnApi.getTopicDetail(slug)).then((d) => d.topic),
        enabled: !!slug,
    });
}

/**
 * Concept detail for ConceptPage (5-tab shell). Includes the concept body,
 * lab metadata, primer read/checkin state, and `latestAttempt` (which
 * embeds `revealedReferenceAt` — the client uses that to render the
 * "Reveal reference" affordance).
 */
export function useConceptDetail(slug) {
    return useQuery({
        queryKey: KEYS.conceptDetail(slug),
        queryFn: () =>
            unwrap(curriculumLearnApi.getConceptDetail(slug)).then(
                (d) => d.concept,
            ),
        enabled: !!slug,
    });
}

// ============================================================================
// ENROLLMENT
// ============================================================================

/**
 * POST /topics/:slug/enroll — idempotent upsert. Invalidates both the
 * single-topic detail (so the current page reflects "enrolled") and the
 * topics list (so the LearnPage badge counts refresh on next navigation).
 */
export function useEnrollInTopic(slug) {
    const qc = useQueryClient();
    return useToastingMutation({
        mutationFn: (body) =>
            unwrap(curriculumLearnApi.enrollInTopic(slug, body)),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.topicDetail(slug) });
            qc.invalidateQueries({ queryKey: KEYS.topics });
        },
        successMessage: "Enrolled.",
        errorPrefix: "Enrollment failed",
    });
}

// ============================================================================
// LAB ATTEMPTS — async submit + polling (W4.T2)
// ============================================================================

/**
 * POST /labs/:id/attempts — returns 202 with { attemptId, reviewStatus:
 * "PENDING", attemptNumber }. The caller should immediately mount
 * `useAttempt(labId, attemptId)` to poll (fallback for when the WS event
 * is dropped) and optionally `useCurriculumReviewReady(attemptId, ...)`
 * to react to the low-latency WS event.
 *
 * The caller can pass a `conceptSlug` in the mutation variables so we can
 * invalidate the concept detail cache (which embeds `latestAttempt`) on
 * success. Absent that, the caller must invalidate manually — the labId
 * → conceptSlug mapping doesn't live here.
 */
export function useSubmitAttempt(labId) {
    const qc = useQueryClient();
    return useToastingMutation({
        mutationFn: ({ code }) =>
            unwrap(curriculumLearnApi.submitAttempt(labId, { code })),
        onSuccess: (_data, variables) => {
            if (variables?.conceptSlug) {
                qc.invalidateQueries({
                    queryKey: KEYS.conceptDetail(variables.conceptSlug),
                });
            }
        },
        successMessage: "Submitted. Waiting for review…",
        errorPrefix: "Submit failed",
    });
}

/**
 * Poll for an attempt's review status. Stops polling once BOTH
 * `reviewStatus` and `walkthroughStatus` are in terminal states — that
 * matters because the walkthrough is dispatched after codeReview
 * completes, and pre-R.1 the polling would stop the moment reviewStatus
 * flipped to COMPLETED, hiding walkthrough state changes.
 *
 * Terminal-status truth table:
 *   reviewStatus:    COMPLETED | ERROR                     — terminal
 *   walkthroughStatus: NOT_STARTED (feature off / pre-reveal) — terminal
 *                    | COMPLETED | ERROR                    — terminal
 *                    | PENDING                              — non-terminal
 *
 * 3 s cadence matches the perceived-latency budget for lab reviews;
 * anything faster is wasteful given the WS event is the primary path.
 */
function isReviewStatusTerminal(status) {
    return status === "COMPLETED" || status === "ERROR";
}
function isWalkthroughStatusTerminal(status) {
    // NOT_STARTED covers pre-reveal + feature-off; explicitly terminal so
    // we don't hold open a poll for a walkthrough that will never fire.
    return (
        !status ||
        status === "NOT_STARTED" ||
        status === "COMPLETED" ||
        status === "ERROR"
    );
}

export function useAttempt(labId, attemptId) {
    return useQuery({
        queryKey: KEYS.attempt(labId, attemptId),
        queryFn: () =>
            unwrap(curriculumLearnApi.getAttempt(labId, attemptId)).then(
                (d) => d.attempt,
            ),
        enabled: !!labId && !!attemptId,
        refetchInterval: (query) => {
            const data = query.state.data;
            const reviewTerm = isReviewStatusTerminal(data?.reviewStatus);
            const walkTerm = isWalkthroughStatusTerminal(data?.walkthroughStatus);
            if (reviewTerm && walkTerm) return false;
            return 3000;
        },
    });
}

// ============================================================================
// WALKTHROUGH (Phase R.1, 2026-07-11)
// ============================================================================
//
// GET returns { status, walkthrough, usedFallback, generatedAt, viewedAt,
// inputStale, walkthroughType }. Server stamps `walkthroughViewedAt` on
// first successful COMPLETED fetch. Client polling stops on terminal
// state (COMPLETED | ERROR) — pre-reveal / NOT_STARTED gets a one-shot
// check and stops.

/**
 * Poll for a walkthrough's status + body. Enabled only when we have both
 * ids AND `walkthroughEnabled` is true (server-side flag echoed from the
 * reveal response or gated on the client-side VITE flag by the caller).
 *
 * The `enabled` gate lets us keep the same hook shape for the pre-reveal
 * state (renders nothing) and post-reveal (polls until terminal).
 */
export function useWalkthrough(labId, attemptId, { enabled = true } = {}) {
    return useQuery({
        queryKey: KEYS.walkthrough(labId, attemptId),
        queryFn: () =>
            unwrap(curriculumLearnApi.getWalkthrough(labId, attemptId)),
        enabled: !!labId && !!attemptId && enabled,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            if (status === "COMPLETED" || status === "ERROR") return false;
            if (status === "NOT_STARTED") return false;
            return 3000;
        },
    });
}

/**
 * POST /labs/:id/attempts/:attemptId/walkthrough/retry — only allowed
 * when the current status is ERROR (server-side gate). On success flips
 * back to PENDING and re-dispatches the AI task.
 */
export function useRetryWalkthrough(labId, attemptId) {
    const qc = useQueryClient();
    return useToastingMutation({
        mutationFn: () =>
            unwrap(curriculumLearnApi.retryWalkthrough(labId, attemptId)),
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: KEYS.walkthrough(labId, attemptId),
            });
            // Also invalidate the attempt row so the walkthroughStatus
            // change shows up in downstream consumers.
            qc.invalidateQueries({
                queryKey: KEYS.attempt(labId, attemptId),
            });
        },
        successMessage: "Regenerating walkthrough…",
        errorPrefix: "Retry failed",
    });
}

// ============================================================================
// REVEAL REFERENCE (server-side gate)
// ============================================================================

/**
 * POST /labs/:id/reveal-reference — server enforces the struggle-first
 * policy (attempt verdict STRONG/ADEQUATE + concept status
 * READY_FOR_REFERENCE). 403 GATE_BLOCKED on failure — the caller can
 * inspect `err.response.data.error.code` to render a specific empty-state.
 *
 * On success the server stamps `revealedReferenceAt` on the latest
 * attempt, so we invalidate the concept detail cache to pull that back in.
 */
export function useRevealReference(labId, conceptSlug) {
    const qc = useQueryClient();
    return useToastingMutation({
        mutationFn: () => unwrap(curriculumLearnApi.revealReference(labId)),
        onSuccess: () => {
            if (conceptSlug) {
                qc.invalidateQueries({
                    queryKey: KEYS.conceptDetail(conceptSlug),
                });
            }
            // Broad-brush walkthrough cache invalidation — the reveal
            // dispatched a walkthrough task; any cached NOT_STARTED
            // response for THIS lab's attempts should refetch so the
            // client picks up walkthroughStatus=PENDING next poll.
            qc.invalidateQueries({
                queryKey: ["curriculum", "learner", "walkthrough", labId],
            });
        },
        successMessage: "Reference solution unlocked.",
        errorPrefix: "Reveal blocked",
    });
}

// ============================================================================
// CHECK-IN SUBMIT
// ============================================================================

/**
 * POST /concepts/:slug/checkin — 3-question grader (recall / apply /
 * build). Server returns the AI verdict + calibration delta plus a
 * `usedFallback` flag when the AI review timed out. Callers surface both.
 */
export function useSubmitCheckIn(slug) {
    const qc = useQueryClient();
    return useToastingMutation({
        mutationFn: (body) =>
            unwrap(curriculumLearnApi.submitCheckIn(slug, body)),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.conceptDetail(slug) });
        },
        successMessage: "Check-in submitted.",
        errorPrefix: "Check-in failed",
    });
}

// ============================================================================
// PRIMER-READ (engagement telemetry)
// ============================================================================

/**
 * POST /concepts/:slug/mark-primer-read — fire-and-forget signal write.
 * Called from ConceptPrimerTab on mount; server dedups within 24 h so we
 * do NOT guard on the client. No toast, no error UI — engagement
 * telemetry only. Bypasses useToastingMutation on purpose (this is not
 * a user-facing action).
 */
export function useMarkPrimerRead() {
    return useMutation({
        mutationFn: (slug) => unwrap(curriculumLearnApi.markPrimerRead(slug)),
    });
}

// ============================================================================
// WEBSOCKET SUBSCRIPTION — curriculum:review_ready
// ============================================================================

// The client does not currently share a WS connection across features —
// `LiveTeachingRoom`, `MockInterviewPage`, and the DS interview workspace
// each open their own socket. This hook follows the same convention: it
// opens a dedicated socket for the lifetime of the caller (typically the
// ConceptLabTab while an attempt is in flight) and closes it on unmount.
//
// The server routes `curriculum:review_ready` per-user via `sendToUser`,
// so every event arriving here already belongs to the authenticated
// user — we only need to filter by `attemptId`.
function getCurriculumWsUrl() {
    const apiUrl = import.meta.env.VITE_API_URL || "";
    if (apiUrl.includes("railway.app")) {
        return (
            apiUrl.replace("https://", "wss://").replace("/api", "") +
            "/ws/curriculum"
        );
    }
    return "ws://localhost:5000/ws/curriculum";
}

/**
 * Subscribe to `curriculum:review_ready` WS events for a specific
 * `attemptId`. On event: (a) invalidate the attempt query so the polling
 * hook's next tick pulls the fresh row, (b) invalidate the concept detail
 * (embeds `latestAttempt`), (c) call `onEvent` if provided.
 *
 * Passing `null`/`undefined` for `attemptId` is a no-op (the socket is
 * not opened). The caller should mount this hook only while an attempt
 * is in flight — e.g. while `attempt.reviewStatus === "PENDING"`.
 *
 * The polling fallback in `useAttempt` still runs in parallel; if the WS
 * event is dropped (mobile background, transient network blip), the poll
 * catches it within 3 s.
 */
export function useCurriculumReviewReady(
    attemptId,
    { conceptSlug, labId, onEvent } = {},
) {
    const qc = useQueryClient();
    // Cache the latest callback in a ref so re-renders that pass a fresh
    // `onEvent` closure don't tear down + reopen the socket.
    const onEventRef = useRef(onEvent);
    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        if (!attemptId) return undefined;

        const token = localStorage.getItem("token");
        if (!token) return undefined;

        const url = getCurriculumWsUrl();
        let ws;
        try {
            ws = new WebSocket(url);
        } catch {
            // URL parse / mixed-content failure — polling fallback is the
            // safety net so we swallow.
            return undefined;
        }

        ws.onopen = () => {
            try {
                ws.send(JSON.stringify({ type: "auth", token }));
            } catch {
                /* ignore — the server auth-window will close and drop us */
            }
        };

        ws.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            if (msg?.type !== "curriculum:review_ready") return;
            if (msg.attemptId !== attemptId) return;

            qc.invalidateQueries({
                queryKey: KEYS.attempt(labId, attemptId),
            });
            if (conceptSlug) {
                qc.invalidateQueries({
                    queryKey: KEYS.conceptDetail(conceptSlug),
                });
            }
            onEventRef.current?.(msg);
        };

        // Silent onerror — the polling fallback is the safety net. We do
        // NOT surface a banner here (the interview / teaching flows do,
        // but those are room-critical; the review event is opportunistic).
        ws.onerror = () => {};

        return () => {
            try {
                ws.close();
            } catch {
                /* ignore */
            }
        };
    }, [attemptId, labId, conceptSlug, qc]);
}

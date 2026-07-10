// ============================================================================
// reviewSemaphore.js — per-team in-flight cap for fire-and-forget CODE_REVIEW
// ============================================================================
//
// PROBLEM: `submitAttempt` (curriculum.controller.js) dispatches
// `runValidator("CODE_REVIEW", ...)` fire-and-forget with no concurrency
// ceiling. Fifty simultaneous learner submits from one team = fifty
// simultaneous OpenAI calls, each up to `AI_REQUEST_TIMEOUT_MS` (30s) at
// $3-5 per call. That's a $150+ burst + rate-limit breach + a fragile
// pool that can hang the process.
//
// FIX: per-team in-flight counter with a soft cap. Under the cap → run
// immediately. At the cap → queue behind the currently-running reviews.
// Every completion drains one queued entry. FIFO — a learner who submits
// first gets their review first.
//
// The cap is intentionally per-team, not global — one busy team should
// not starve every other team's learners. Configurable via
// `CURRICULUM_REVIEW_CONCURRENCY` env, default 3.
//
// Not a durable queue — a process restart drops queued work. The
// LabAttempt row stays PENDING; a follow-up cron / manual retry could
// pick them up. That's roadmap `curriculum-review-durable-queue`.
// ============================================================================

const DEFAULT_CAP = 3;
const DEFAULT_MAX_QUEUE_DEPTH = 10;

// Marker error thrown when a team's queue is full. Callers should catch it,
// flip the LabAttempt to ERROR, and surface a "retry later" message —
// NOT translate it into a HTTP 5xx or leave the attempt in PENDING.
export const REVIEW_QUEUE_FULL = Symbol.for("curriculum:review_queue_full");
export function isReviewQueueFullError(err) {
    return err?.reason === REVIEW_QUEUE_FULL;
}

// teamId -> { inFlight: number, queue: Array<() => Promise<void>> }
const state = new Map();

function getCap() {
    const raw = process.env.CURRICULUM_REVIEW_CONCURRENCY;
    if (!raw) return DEFAULT_CAP;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_CAP;
    return Math.floor(n);
}

function getMaxQueueDepth() {
    const raw = process.env.CURRICULUM_REVIEW_QUEUE_MAX;
    if (!raw) return DEFAULT_MAX_QUEUE_DEPTH;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_QUEUE_DEPTH;
    return Math.floor(n);
}

function getSlot(teamId) {
    let slot = state.get(teamId);
    if (!slot) {
        slot = { inFlight: 0, queue: [] };
        state.set(teamId, slot);
    }
    return slot;
}

/**
 * Dispatch a CODE_REVIEW (or any async task) under a per-team concurrency
 * cap. Returns a promise that resolves when the task eventually runs (which
 * may be after other queued tasks complete).
 *
 * @param {string} teamId
 * @param {() => Promise<any>} task async fn to run when a slot is free
 * @returns {Promise<any>} resolves/rejects with the task's outcome
 */
export function dispatchReview(teamId, task) {
    return new Promise((resolve, reject) => {
        const slot = getSlot(teamId);
        const cap = getCap();
        const maxDepth = getMaxQueueDepth();

        const run = async () => {
            slot.inFlight += 1;
            try {
                const result = await task();
                resolve(result);
            } catch (err) {
                reject(err);
            } finally {
                slot.inFlight -= 1;
                const next = slot.queue.shift();
                if (next) {
                    next();
                } else if (slot.inFlight === 0 && slot.queue.length === 0) {
                    // No pending work for this team — clean up to prevent
                    // unbounded Map growth across many teams.
                    state.delete(teamId);
                }
            }
        };

        if (slot.inFlight < cap) {
            run();
            return;
        }

        // Bounded queue: sustained abuse (500 submits × 100 KB code strings)
        // used to pin ~50 MB per team burst because each queued closure kept
        // its `task` alive. Reject once the queue is full so the caller can
        // fail-fast the LabAttempt to ERROR and the learner sees a real
        // recovery path instead of a forever-spinner.
        if (slot.queue.length >= maxDepth) {
            const err = new Error(
                `Curriculum review queue is full for team ${teamId} (cap=${cap}, maxDepth=${maxDepth}). Try again in a minute.`,
            );
            err.reason = REVIEW_QUEUE_FULL;
            reject(err);
            return;
        }

        slot.queue.push(run);
    });
}

/**
 * Diagnostics — snapshot the current per-team semaphore state.
 */
export function _debugSnapshot() {
    const out = {};
    for (const [teamId, slot] of state.entries()) {
        out[teamId] = { inFlight: slot.inFlight, queued: slot.queue.length };
    }
    return { cap: getCap(), teams: out };
}

/**
 * Test-only reset — clear all queues + counters.
 */
export function _resetForTest() {
    state.clear();
}

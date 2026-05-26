// ============================================================================
// Retention Stats — D6 v2 computation
// ============================================================================
//
// D6 is structurally the cleanest dim in the app — its score formula was
// already research-backed before v2. This utility PRESERVES the legacy
// FSRS-based score formula verbatim and adds:
//
//   1. Leech detection — items with lapseCount ≥ 8 (Anki convention from
//      schema.prisma:817-818) are surfaced as `leechCount` and contribute
//      to a `leechRate` (proportion of distinct solutions). The score
//      itself is NOT penalized — leech surfacing happens through tier
//      gates (FAANG requires leechRate ≤ 0.20) and verdict prose.
//
//   2. Sample-size gating data (`attemptCount`) for tier mastery checks.
//      Original-report user had retention=93 with n=4 — score is correct
//      but statistically noisy. Tier 2 readiness now requires ≥10
//      attempts, FAANG ≥25 (Lange et al. 2013).
//
// References:
//   Karpicke & Roediger (2008) "The Critical Importance of Retrieval for
//   Learning" (Science) — already cited in schema.prisma:955-958. The
//   foundation for the FSRS retrievability formula.
//
//   Wozniak (1990) SuperMemo lineage → modern FSRS (Free Spaced Repetition
//   Scheduler). Implementation in fsrsRetention.js. Retrievability =
//   (1 + FACTOR × daysSince/stability)^DECAY.
//
//   Bjork & Bjork (1992) "A New Theory of Disuse and an Old Theory of
//   Stimulus Fluctuation" — desirable difficulties; spacing builds
//   durable retention. The daysSince factor in retrievability captures it.
//
//   Lange, Wang, Dunlosky (2013) "Self-paced study strategies" — accurate
//   self-assessment of retention requires repeated probes; small-sample
//   retention scores are unreliable. The basis for the n≥10 floor on
//   tier2 retention claims (Rule 13 enforcement).
//
//   Anki leech convention — items repeatedly failed (lapseCount ≥ 8 by
//   default) warrant focused review. Schema comment at line 817 sets
//   the convention; this utility surfaces them.
// ============================================================================

import { retrievability, stabilityAfterReps } from "./fsrsRetention.js";
import { meanCI } from "./dimensionStats.js";

// Activation thresholds — match legacy D6 gate.
export const MIN_ATTEMPTS = 3;
export const MIN_DISTINCT_SOLUTIONS = 2;

// Leech threshold — Anki convention from schema.prisma:817 ("Items with
// lapseCount >= 8 are flagged as 'leeches'"). Don't introduce a second
// threshold elsewhere.
export const LEECH_THRESHOLD = 8;

// Rule 13 floor — high-confidence retention strengths require this many
// attempts. Below it, claims must hedge (Lange, Wang, Dunlosky 2013).
export const HIGH_CONFIDENCE_MIN_N = 10;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Compute D6 retention score, CI, and leech surfacing.
 *
 * @param {object} input
 * @param {Array<{
 *   solutionId: string,
 *   createdAt: Date|string,
 *   solution: {
 *     sm2EasinessFactor?: number,
 *     sm2Repetitions?: number,
 *     lapseCount?: number,
 *   }
 * }>} input.successfulReviewAttempts
 *   Already filtered to quality ≥ 3 by the caller. Each row's `solution`
 *   sub-object MUST include `lapseCount` for leech detection (caller
 *   extends the existing Prisma select).
 * @param {number} input.overdueCount  Existing overdue-reviews count
 *   (passed through to basis lines unchanged).
 *
 * @returns {{
 *   active: boolean,
 *   score: number | null,
 *   ci: [number, number] | null,
 *   attemptCount: number,
 *   distinctSolutionCount: number,
 *   leechCount: number,
 *   leechRate: number,
 *   inactiveMessage: string | null,
 *   basis: string[],
 * }}
 */
export function computeRetentionStats({
  successfulReviewAttempts,
  overdueCount = 0,
} = {}) {
  // ── Dedupe to most-recent successful attempt per solution ───────
  // Same logic as legacy D6 at stats.controller.js:1723-1731.
  const latestSuccessfulBySolution = new Map();
  for (const attempt of successfulReviewAttempts || []) {
    if (!attempt?.solutionId) continue;
    const existing = latestSuccessfulBySolution.get(attempt.solutionId);
    if (!existing || new Date(attempt.createdAt) > new Date(existing.createdAt)) {
      latestSuccessfulBySolution.set(attempt.solutionId, attempt);
    }
  }
  const dedupedAttempts = Array.from(latestSuccessfulBySolution.values());
  const attemptCount = dedupedAttempts.length;
  const distinctSolutionCount = latestSuccessfulBySolution.size;

  // ── Activation gate (preserved from legacy) ─────────────────────
  if (attemptCount < MIN_ATTEMPTS || distinctSolutionCount < MIN_DISTINCT_SOLUTIONS) {
    const need = Math.max(0, MIN_ATTEMPTS - attemptCount);
    const needSol = Math.max(0, MIN_DISTINCT_SOLUTIONS - distinctSolutionCount);
    const inactiveMessage =
      needSol > 0
        ? `Review ${need || "a few"} more problems across ${needSol} more solution${needSol === 1 ? "" : "s"} to unlock retention tracking`
        : `Need ${need} more successful review${need === 1 ? "" : "s"} to unlock retention tracking`;
    return {
      active: false,
      score: null,
      ci: null,
      attemptCount,
      distinctSolutionCount,
      leechCount: 0,
      leechRate: 0,
      inactiveMessage,
      basis: [
        `successful_reviews: ${attemptCount}`,
        `distinct_solutions: ${distinctSolutionCount}`,
      ],
    };
  }

  // ── Score formula PRESERVED from legacy ─────────────────────────
  // FSRS retrievability per attempt; mean across deduped attempts.
  // Same code path as stats.controller.js:1745-1757 — byte-for-byte.
  const now = Date.now();
  const retentionValues = dedupedAttempts.map((a) => {
    const daysSince = (now - new Date(a.createdAt).getTime()) / MS_PER_DAY;
    const reps = a.solution?.sm2Repetitions ?? 1;
    const ef = a.solution?.sm2EasinessFactor ?? 2.5;
    // Difficulty inferred from EF: lower EF = harder card.
    const difficulty = Math.max(1, Math.min(10, 10 - (ef - 1.3) * 3));
    const stability = stabilityAfterReps(reps, difficulty);
    return retrievability(daysSince, stability) * 100;
  });
  const ci = meanCI(retentionValues);

  // ── Leech detection (NEW in v2) ─────────────────────────────────
  // Count solutions with lapseCount ≥ LEECH_THRESHOLD. Counted from
  // the deduped attempts so each solution contributes at most once.
  let leechCount = 0;
  for (const a of dedupedAttempts) {
    const lc = a.solution?.lapseCount;
    if (typeof lc === "number" && lc >= LEECH_THRESHOLD) {
      leechCount += 1;
    }
  }
  const leechRate = distinctSolutionCount > 0
    ? leechCount / distinctSolutionCount
    : 0;

  return {
    active: true,
    score: ci.score,
    ci: ci.ci,
    attemptCount,
    distinctSolutionCount,
    leechCount,
    leechRate: Math.round(leechRate * 100) / 100, // 2 decimal places
    inactiveMessage: null,
    basis: [
      `successful_reviews: ${attemptCount}`,
      `distinct_solutions: ${distinctSolutionCount}`,
      `overdue: ${overdueCount}`,
      `leeches: ${leechCount}`,
      ...(distinctSolutionCount > 0
        ? [`leech_rate: ${(leechRate * 100).toFixed(0)}%`]
        : []),
    ],
  };
}

// ============================================================================
// Coding Pattern Mastery — D1 v2 computation
// ============================================================================
//
// The legacy D1 ("Pattern Recognition") gave 30 free points just for tagging
// a pattern, 50 for the AI agreeing, and a tiny diversity bonus. A user with
// 3 patterns touched could score 85 — the dimension's name was a lie.
//
// This module replaces that formula with a five-state per-pattern mastery
// scheme grounded in cognitive-science research:
//
//   UNTOUCHED → TOUCHED → WORKING → SOLID → OWNED
//   (0 pts)    (25 pts)  (50 pts)  (75 pts) (100 pts)
//
// State transitions reflect what's actually known about how procedural
// expertise builds:
//
//   Chase & Simon (1973) "Perception in Chess" — expertise is fast chunk
//   recognition, not deliberate reasoning. Recognition is millisecond-scale
//   retrieval; the only way to test it is on novel surface features.
//
//   Sweller (1988) Cognitive Load Theory — schemas in long-term memory free
//   working memory for novel reasoning. Pattern coverage = schema breadth.
//   Per-pattern depth = schema strength.
//
//   Dunlosky et al. (2013) "Improving Students' Learning" — the three
//   highest-evidence learning techniques are practice testing, distributed
//   (spaced) practice, and interleaved practice. The OWNED state requires
//   FSRS-validated retention; SOLID requires multi-difficulty exposure
//   (interleaving across E/M/H).
//
//   Ericsson (1993) Deliberate Practice — expertise via *targeted* practice
//   with feedback on weaknesses, not just hours. The wrongPattern AI flag
//   blocks WORKING transitions even when raw counts qualify.
//
// Score formula: saturating-breadth + depth, weighted 60/40.
//
//   coreMean      = mean(mastery for p in FAANG_CORE_PATTERNS)        // 0-100
//   nonCoreMean   = mean(mastery for p in (CANONICAL - FAANG_CORE))   // 0-100
//   bonusBreadth  = nonCoreMean * 0.2                                  // ≤+20
//   breadth       = min(coreMean + bonusBreadth, 100)
//   depth         = mean(mastery for p where state >= TOUCHED)
//   score         = 0.6 * breadth + 0.4 * depth
//
// FAANG_CORE_PATTERNS is the 15-pattern list in patternTaxonomy.js — the
// patterns that empirically dominate FAANG coding rounds. Covering all 15
// at OWNED earns full breadth (100); the other 10 contribute a small bonus
// up to +20, modeling them as nice-to-have rather than required.
//
// Pre-2026-05-26 solutions can have NULL solveMethod. Treat them as
// COLD-equivalent for mastery (legacy permissive). Post-deploy NULLs are
// NOT counted as COLD — the user must explicitly mark the solve.
// ============================================================================

import {
  CANONICAL_PATTERN_LABELS,
  FAANG_CORE_PATTERNS,
  isFaangCorePattern,
} from "./patternTaxonomy.js";

export const MASTERY_STATES = Object.freeze({
  UNTOUCHED: { points: 0, label: "Untouched" },
  TOUCHED: { points: 25, label: "Touched" },
  WORKING: { points: 50, label: "Working" },
  SOLID: { points: 75, label: "Solid" },
  OWNED: { points: 100, label: "Owned" },
});

// Stamped at the Phase 2 deploy. Solutions created before this date with
// NULL solveMethod are treated as COLD-equivalent (legacy permissive);
// solutions created after must specify a value to count toward WORKING.
export const SOLVE_METHOD_REQUIRED_AFTER = new Date("2026-05-26T00:00:00Z");

// State transition thresholds. Tunable but documented — every change here
// shifts mastery scores for every user.
const MIN_COLD_SOLVES_FOR_WORKING = 2;
const MIN_PATTERN_ACCURACY_FOR_WORKING = 7; // out of 10
const MIN_DIFFICULTIES_FOR_SOLID = 2; // need at least 2 of E/M/H
const MIN_SM2_REPS_FOR_OWNED = 2; // ≥2 successful FSRS recalls

const NON_CORE_BONUS_WEIGHT = 0.2;
const BREADTH_WEIGHT = 0.6;
const DEPTH_WEIGHT = 0.4;

/**
 * Treat a Solution row's solveMethod as COLD?
 * - Explicit "COLD" → yes
 * - NULL on legacy row (createdAt before deploy) → yes (permissive)
 * - NULL on post-deploy row → no (user must specify)
 * - "HINTS" or "SAW_APPROACH" → no
 */
function isColdSolve(solution) {
  if (solution.solveMethod === "COLD") return true;
  if (solution.solveMethod == null) {
    const created = solution.createdAt ? new Date(solution.createdAt) : null;
    if (created && created < SOLVE_METHOD_REQUIRED_AFTER) return true;
  }
  return false;
}

/**
 * Get the latest AI review attached to a solution (or null).
 * Mirrors the convention in stats.controller.js — last item in aiFeedback.
 */
function latestAiReview(solution) {
  if (!Array.isArray(solution.aiFeedback) || solution.aiFeedback.length === 0) {
    return null;
  }
  return solution.aiFeedback[solution.aiFeedback.length - 1];
}

/**
 * Compute mastery state per canonical pattern.
 *
 * @param {object} input
 * @param {Array}  input.solutions  Solution rows. MUST include: id, patterns,
 *   solveMethod, createdAt, sm2Repetitions, aiFeedback, problem.{category,difficulty}.
 * @param {Array}  input.reviewAttempts  Successful (quality≥3) review attempts,
 *   each with `solutionId`. Used for OWNED-state retention check.
 * @returns {{
 *   matrix: Array<{
 *     pattern: string,
 *     state: keyof typeof MASTERY_STATES,
 *     solves: number,
 *     coldSolves: number,
 *     difficulties: string[],
 *     retained: boolean,
 *     hasWrongFlag: boolean,
 *     isCore: boolean,
 *   }>,
 *   counts: {
 *     untouched: number, touched: number, working: number, solid: number, owned: number,
 *     touchedOrAbove: number, workingOrAbove: number, solidOrAbove: number,
 *     totalCanonical: number,
 *     coreUntouched: number, coreTouchedOrAbove: number,
 *     coreSolidOrAbove: number, coreOwned: number,
 *     totalCore: number,
 *   },
 *   breadth: number,  // 0-100, saturating
 *   depth: number,    // 0-100, mean of touched-or-above
 * }}
 */
export function computePatternMastery({ solutions, reviewAttempts }) {
  const codingSolutions = (solutions || []).filter((s) => {
    // Mirror isCodingSolution() — coding-only dim by design. Other modes
    // get parallel dims (B-bundle, S-bundle, F-bundle) in later phases.
    const cat = s?.problem?.category;
    return !cat || cat === "CODING";
  });

  // Index successful review attempts by solutionId for O(1) retention lookup.
  const successfulSolutionIds = new Set(
    (reviewAttempts || []).map((r) => r.solutionId).filter(Boolean),
  );

  // Build the per-pattern matrix.
  const matrix = CANONICAL_PATTERN_LABELS.map((pattern) => {
    // All coding solutions tagged with this pattern.
    const solves = codingSolutions.filter((s) =>
      Array.isArray(s.patterns) && s.patterns.includes(pattern),
    );

    if (solves.length === 0) {
      return {
        pattern,
        state: "UNTOUCHED",
        solves: 0,
        coldSolves: 0,
        difficulties: [],
        retained: false,
        hasWrongFlag: false,
        isCore: isFaangCorePattern(pattern),
      };
    }

    const coldSolves = solves.filter(isColdSolve).length;

    const difficultiesSet = new Set();
    for (const s of solves) {
      const d = s?.problem?.difficulty;
      if (d) difficultiesSet.add(d);
    }
    const difficulties = Array.from(difficultiesSet);

    // Per-pattern AI signal: mean patternAccuracy and any wrongPattern flag
    // where the AI's correctPattern is NOT this pattern (so a wrong-flag
    // for a different claimed pattern doesn't punish this one).
    let patternAccuracySum = 0;
    let patternAccuracyCount = 0;
    let hasWrongFlag = false;
    for (const s of solves) {
      const review = latestAiReview(s);
      if (!review) continue;
      const acc = review?.dimensionScores?.patternAccuracy;
      if (typeof acc === "number") {
        patternAccuracySum += acc;
        patternAccuracyCount += 1;
      }
      const flagged = review?.flags?.wrongPattern === true;
      const correctPattern = review?.flags?.correctPattern;
      if (flagged && correctPattern && correctPattern !== pattern) {
        // The AI thought a *different* pattern was right for one of this
        // user's solves tagged with `pattern`. That's evidence the user is
        // mis-claiming this pattern — block WORKING for it.
        hasWrongFlag = true;
      }
    }
    const avgPatternAccuracy = patternAccuracyCount > 0
      ? patternAccuracySum / patternAccuracyCount
      : null;

    // Retention: does ANY solve under this pattern have a successful review
    // attempt AND sm2Repetitions ≥ 2 on the solution itself?
    const retained = solves.some(
      (s) => successfulSolutionIds.has(s.id)
        && (s.sm2Repetitions ?? 0) >= MIN_SM2_REPS_FOR_OWNED,
    );

    // State machine. Each level requires the previous one's conditions.
    let state = "TOUCHED";

    const meetsWorking =
      coldSolves >= MIN_COLD_SOLVES_FOR_WORKING
      && avgPatternAccuracy !== null
      && avgPatternAccuracy >= MIN_PATTERN_ACCURACY_FOR_WORKING
      && !hasWrongFlag;

    if (meetsWorking) state = "WORKING";

    if (state === "WORKING" && difficulties.length >= MIN_DIFFICULTIES_FOR_SOLID) {
      state = "SOLID";
    }

    if (state === "SOLID" && retained) {
      state = "OWNED";
    }

    return {
      pattern,
      state,
      solves: solves.length,
      coldSolves,
      difficulties,
      retained,
      hasWrongFlag,
      isCore: isFaangCorePattern(pattern),
    };
  });

  // Counts: per-state and cumulative; FAANG-core subset breakdown.
  const counts = {
    untouched: 0,
    touched: 0,
    working: 0,
    solid: 0,
    owned: 0,
    touchedOrAbove: 0,
    workingOrAbove: 0,
    solidOrAbove: 0,
    totalCanonical: CANONICAL_PATTERN_LABELS.length,
    coreUntouched: 0,
    coreTouchedOrAbove: 0,
    coreSolidOrAbove: 0,
    coreOwned: 0,
    totalCore: FAANG_CORE_PATTERNS.length,
  };

  for (const row of matrix) {
    const stateLower = row.state.toLowerCase();
    counts[stateLower] += 1;

    if (row.state !== "UNTOUCHED") counts.touchedOrAbove += 1;
    if (row.state === "WORKING" || row.state === "SOLID" || row.state === "OWNED") {
      counts.workingOrAbove += 1;
    }
    if (row.state === "SOLID" || row.state === "OWNED") {
      counts.solidOrAbove += 1;
    }

    if (row.isCore) {
      if (row.state === "UNTOUCHED") counts.coreUntouched += 1;
      else counts.coreTouchedOrAbove += 1;
      if (row.state === "SOLID" || row.state === "OWNED") {
        counts.coreSolidOrAbove += 1;
      }
      if (row.state === "OWNED") counts.coreOwned += 1;
    }
  }

  // Saturating breadth: FAANG-core mean + small non-core bonus.
  const coreRows = matrix.filter((r) => r.isCore);
  const nonCoreRows = matrix.filter((r) => !r.isCore);

  const coreMean = coreRows.length === 0
    ? 0
    : coreRows.reduce((a, r) => a + MASTERY_STATES[r.state].points, 0) / coreRows.length;
  const nonCoreMean = nonCoreRows.length === 0
    ? 0
    : nonCoreRows.reduce((a, r) => a + MASTERY_STATES[r.state].points, 0) / nonCoreRows.length;

  const breadth = Math.min(coreMean + nonCoreMean * NON_CORE_BONUS_WEIGHT, 100);

  // Depth: mean over touched-or-above only. A user with 3 SOLID patterns
  // has 75 depth; a user with 25 TOUCHED has 25 depth.
  const touchedRows = matrix.filter((r) => r.state !== "UNTOUCHED");
  const depth = touchedRows.length === 0
    ? 0
    : touchedRows.reduce((a, r) => a + MASTERY_STATES[r.state].points, 0) / touchedRows.length;

  return { matrix, counts, breadth, depth };
}

/**
 * Pure aggregator — combine breadth + depth into the D1 score.
 * Caller can subtract any cross-cutting penalty (e.g. wrongPatternPenalty)
 * after this returns. Score is rounded but not clamped here; clamp at the
 * activeDim boundary.
 */
export function masteryScore({ breadth, depth }) {
  return Math.round(BREADTH_WEIGHT * breadth + DEPTH_WEIGHT * depth);
}

// Exported for tests + UI mapping; matches the human-readable label scheme.
export { BREADTH_WEIGHT, DEPTH_WEIGHT };

// ============================================================================
// Optimization Stats — D4 v2 computation
// ============================================================================
//
// The legacy D4 ("Optimization") scored on length thresholds (`bruteForce`
// and `optimizedApproach` text >20 chars) plus a multiplicative gate from
// `avgAiCodeCorrectness`. Two structural problems:
//
//   1. Length thresholds reward typing, not optimization thinking. A user
//      can paste "this is brute force lol" (19+1 chars) and earn 15 pts.
//
//   2. The `(avgAiCodeCorrectness/10)^0.6` multiplier conflates two
//      separable signals — code correctness and trade-off articulation.
//      A user whose code has a bug but who clearly explained the
//      complexity trade-off shouldn't lose D4 score on that basis;
//      conversely, correctly-coded but trade-off-mute solutions
//      shouldn't be lifted by the multiplier.
//
// D4 v2 reframes the dim around the cognitive science of trade-off
// reasoning:
//
//   Newell & Simon (1972) "Human Problem Solving" — optimization is
//   means-ends analysis: identify the bottleneck, apply a heuristic to
//   remove it. The signal is "did the user articulate the bottleneck,"
//   not "did the user write text in two slots."
//
//   Schoenfeld (1985) "Mathematical Problem Solving" — heuristic
//   monitoring (explicit comparison of alternatives) is what
//   differentiates expert from novice problem-solvers. The TRADE_OFF
//   state requires demonstrated comparison, not just two approaches.
//
//   Voss et al. (1983) "Problem-solving skill in the social sciences" —
//   domain expertise transfers to optimization performance only when
//   *explicit comparison* is required. Writing both approaches is
//   necessary but not sufficient; comparing them is what counts.
//
//   Sweller (1988) Cognitive Load Theory — optimization schemas in
//   long-term memory free working memory for novel reasoning.
//   Retrieval-validated solutions (OWNED state) tap into this.
//
//   CtCI BUD framework (Laakmann McDowell) — Bottleneck, Unnecessary
//   work, Duplicated work — the canonical interview heuristic for
//   optimization. The complexityCheck.optimizationNote AI signal
//   captures whether the user articulated which BUD they removed.
//
//   interviewing.io 2023 data — at L4/L5+, "did not consider
//   alternatives" is the #1 cited reason for "no hire". Trade-off
//   articulation is the senior-level differentiator.
//
// Per-solution five-state machine:
//
//   NONE → DOCUMENTED → OPTIMIZED → TRADE_OFF → OWNED
//   (0)    (25)         (50)        (75)       (100)
//
// SAW_APPROACH solutions cap at NONE — same hard line as D2. A user who
// looked at the canonical answer can paste two approaches without
// reasoning about the trade-off; that doesn't measure their thinking.
//
// TRADE_OFF dual-path gate:
//   Path A: AI complexityCheck verifies the optimization (timeCorrect AND
//           spaceCorrect AND optimizationNote present)
//   Path B: User explicitly stated DIFFERENT complexities for brute vs
//           optimized via bruteForceMeta — demonstrating actual
//           improvement, not just two approaches at the same big-O
//
// Big-O normalizer: "O(n²)" / "O(n^2)" / "O(n*n)" must compare equal.
// "O(n log n)" / "O(n*log(n))" / "O(nlogn)" likewise. Conservative
// implementation — handles common cases without trying to be a parser.
// ============================================================================

import { SOLVE_METHOD_REQUIRED_AFTER } from "./patternMastery.js";
import {
  RECALL_QUALITY_FLOOR,
  RECALL_TEXT_FLOOR,
} from "./solutionDepth.js";
import { stripHtml } from "./stripHtml.js";

export const OPT_STATES = Object.freeze({
  NONE:       { points: 0,   label: "None"       },
  DOCUMENTED: { points: 25,  label: "Documented" },
  OPTIMIZED:  { points: 50,  label: "Optimized"  },
  TRADE_OFF:  { points: 75,  label: "Trade-off"  },
  OWNED:      { points: 100, label: "Owned"      },
});

// State-transition tunables. Documented; tests pin them.
const BRUTE_MIN_CHARS = 80;          // (was >20 in legacy — 80 forces actual prose)
const OPTIMIZED_MIN_CHARS = 80;
const CODE_CORRECTNESS_FLOOR = 7;    // gates OPTIMIZED when AI review exists
const CALIBRATION_FLOOR = 0.70;      // mirrors D2 (Kruger-Dunning intent)
const CALIBRATION_CEILING = 1.00;

// Big-O normalizer — "O(n²)" / "O(n^2)" / "O(n*n)" must compare equal.
// Conservative — handles common interview-speak without trying to be a
// full parser. Returns lowercase, whitespace-free, with common
// equivalences collapsed.
export function normalizeBigO(s) {
  if (typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/n\*log\(n\)/g, "nlogn")
    .replace(/n\*logn/g, "nlogn")
    .replace(/nlog\(n\)/g, "nlogn")
    .replace(/n\(logn\)/g, "nlogn")
    .replace(/n\*n/g, "n^2");
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Treat solveMethod NULL on legacy rows (createdAt < deploy date) as COLD-
// equivalent. Post-deploy NULL = NOT-COLD (user must specify). SAW_APPROACH
// is handled separately as a hard cap at NONE.
function isQualifyingSolveMethod(solution) {
  if (solution.solveMethod === "COLD") return true;
  if (solution.solveMethod === "HINTS") return true;
  if (solution.solveMethod == null) {
    const created = solution.createdAt ? new Date(solution.createdAt) : null;
    if (created && created < SOLVE_METHOD_REQUIRED_AFTER) return true;
  }
  return false;
}

function latestAiReview(solution) {
  if (!Array.isArray(solution.aiFeedback) || solution.aiFeedback.length === 0) {
    return null;
  }
  return solution.aiFeedback[solution.aiFeedback.length - 1];
}

/**
 * Compute per-solution optimization state + aggregate score.
 *
 * @param {object} input
 * @param {Array}  input.solutions       Solution rows. MUST include: id,
 *   bruteForce, optimizedApproach, timeComplexity, spaceComplexity,
 *   bruteForceMeta (Json?), solveMethod, createdAt, aiFeedback,
 *   problem.{category}.
 * @param {Array}  input.reviewAttempts  ALL review attempts (NOT filtered
 *   by quality). Each MUST include: solutionId, quality, recallText.
 * @param {number|null} input.metacognitiveAccuracy  Already-computed metacog
 *   accuracy from stats.controller.js. null when n<3 reviews.
 * @returns {{
 *   matrix: Array<{
 *     solutionId, state, hasBruteText, hasOptimizedText, codeCorrectness,
 *     complexityCheckSignal, bruteMetaSignal, recallSuccess, solveMethod,
 *   }>,
 *   counts: {
 *     optAtNone, optAtDocumented, optAtOptimized, optAtTradeOff, optAtOwned,
 *     optAtDocumentedOrAbove, optAtOptimizedOrAbove, optAtTradeOffOrAbove,
 *     optAtOwnedOrAbove, optTotalCoding,
 *   },
 *   baseScore: number,
 *   calibrationModifier: number,
 *   score: number,
 * }}
 */
export function computeOptimizationStats({
  solutions,
  reviewAttempts,
  metacognitiveAccuracy,
}) {
  // Coding-only — non-CODING categories don't express brute/optimized.
  const codingSolutions = (solutions || []).filter((s) => {
    const cat = s?.problem?.category;
    return !cat || cat === "CODING";
  });

  // Index ReviewAttempts by solutionId (mirrors solutionDepth).
  const attemptsBySolution = new Map();
  for (const ra of reviewAttempts || []) {
    if (!ra?.solutionId) continue;
    const arr = attemptsBySolution.get(ra.solutionId) || [];
    arr.push(ra);
    attemptsBySolution.set(ra.solutionId, arr);
  }

  // ── Per-solution state machine ───────────────────────────────────
  const matrix = codingSolutions.map((s) => {
    const review = latestAiReview(s);
    const codeCorrectness = review?.dimensionScores?.codeCorrectness ?? null;
    const complexityCheck = review?.complexityCheck ?? null;

    // SAW_APPROACH: hard cap at NONE. Pasted both approaches doesn't
    // measure trade-off thinking.
    if (s.solveMethod === "SAW_APPROACH") {
      return {
        solutionId: s.id,
        state: "NONE",
        hasBruteText: false,
        hasOptimizedText: false,
        codeCorrectness,
        complexityCheckSignal: false,
        bruteMetaSignal: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
      };
    }

    // Post-deploy NULL solveMethod: NOT counted as COLD-equivalent.
    if (!isQualifyingSolveMethod(s)) {
      return {
        solutionId: s.id,
        state: "NONE",
        hasBruteText: false,
        hasOptimizedText: false,
        codeCorrectness,
        complexityCheckSignal: false,
        bruteMetaSignal: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
      };
    }

    // DOCUMENTED gate: both brute + optimized text meet length floors.
    const bruteText = stripHtml(s.bruteForce);
    const optText = stripHtml(s.optimizedApproach);
    const hasBruteText = bruteText.length >= BRUTE_MIN_CHARS;
    const hasOptimizedText = optText.length >= OPTIMIZED_MIN_CHARS;
    if (!hasBruteText || !hasOptimizedText) {
      return {
        solutionId: s.id,
        state: "NONE",
        hasBruteText,
        hasOptimizedText,
        codeCorrectness,
        complexityCheckSignal: false,
        bruteMetaSignal: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
      };
    }

    // OPTIMIZED gate: complexity declared on optimized + AI codeCorrectness
    // ≥7 OR cold-start fallback (no AI review yet).
    const hasComplexityDeclared =
      typeof s.timeComplexity === "string"
      && s.timeComplexity.trim() !== ""
      && typeof s.spaceComplexity === "string"
      && s.spaceComplexity.trim() !== "";
    if (!hasComplexityDeclared) {
      return {
        solutionId: s.id,
        state: "DOCUMENTED",
        hasBruteText: true,
        hasOptimizedText: true,
        codeCorrectness,
        complexityCheckSignal: false,
        bruteMetaSignal: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
      };
    }

    // Cold-start fallback: when there's no AI review, user-stated
    // complexity is sufficient to advance to OPTIMIZED. Without this,
    // D4 becomes "AI-review mastery" — locks out users who don't run
    // AI on every solve.
    const hasAiReview = review !== null;
    const meetsCodeCorrectness =
      hasAiReview
        ? typeof codeCorrectness === "number"
          && codeCorrectness >= CODE_CORRECTNESS_FLOOR
        : true; // cold-start path

    if (!meetsCodeCorrectness) {
      return {
        solutionId: s.id,
        state: "DOCUMENTED",
        hasBruteText: true,
        hasOptimizedText: true,
        codeCorrectness,
        complexityCheckSignal: false,
        bruteMetaSignal: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
      };
    }

    // TRADE_OFF dual-path gate.
    //
    // Path A: AI complexityCheck verification.
    //   Plan agent push: must null-check parent object first; optimizationNote
    //   is `<string|null>` per AI prompt schema; treat empty string and
    //   whitespace-only as absent.
    const complexityCheckSignal =
      complexityCheck !== null
      && complexityCheck.timeCorrect === true
      && complexityCheck.spaceCorrect === true
      && typeof complexityCheck.optimizationNote === "string"
      && complexityCheck.optimizationNote.trim().length > 0;

    // Path B: bruteForceMeta explicit complexity comparison.
    //   User stated DIFFERENT complexity for brute vs optimized →
    //   demonstrated actual improvement. Big-O normalizer handles
    //   "O(n²)"/"O(n^2)"/"O(n*n)" equivalence.
    const meta = s.bruteForceMeta;
    const bruteMetaTime =
      meta && typeof meta === "object" && typeof meta.timeComplexity === "string"
        ? meta.timeComplexity.trim()
        : "";
    const bruteMetaSignal =
      bruteMetaTime !== ""
      && normalizeBigO(bruteMetaTime) !== normalizeBigO(s.timeComplexity);

    const meetsTradeOff = complexityCheckSignal || bruteMetaSignal;
    if (!meetsTradeOff) {
      return {
        solutionId: s.id,
        state: "OPTIMIZED",
        hasBruteText: true,
        hasOptimizedText: true,
        codeCorrectness,
        complexityCheckSignal,
        bruteMetaSignal,
        recallSuccess: false,
        solveMethod: s.solveMethod,
      };
    }

    // OWNED gate: ≥1 ReviewAttempt with quality ≥ floor AND recallText
    // ≥ length floor — same gold standard as D2's OWNED.
    const attempts = attemptsBySolution.get(s.id) || [];
    const recallSuccess = attempts.some(
      (a) =>
        typeof a?.quality === "number"
        && a.quality >= RECALL_QUALITY_FLOOR
        && typeof a?.recallText === "string"
        && a.recallText.trim().length >= RECALL_TEXT_FLOOR,
    );

    return {
      solutionId: s.id,
      state: recallSuccess ? "OWNED" : "TRADE_OFF",
      hasBruteText: true,
      hasOptimizedText: true,
      codeCorrectness,
      complexityCheckSignal,
      bruteMetaSignal,
      recallSuccess,
      solveMethod: s.solveMethod,
    };
  });

  // ── Aggregate counts ─────────────────────────────────────────────
  const counts = {
    optAtNone: 0,
    optAtDocumented: 0,
    optAtOptimized: 0,
    optAtTradeOff: 0,
    optAtOwned: 0,
    optAtDocumentedOrAbove: 0,
    optAtOptimizedOrAbove: 0,
    optAtTradeOffOrAbove: 0,
    optAtOwnedOrAbove: 0,
    optTotalCoding: codingSolutions.length,
  };

  for (const row of matrix) {
    if (row.state === "NONE") counts.optAtNone += 1;
    if (row.state === "DOCUMENTED") counts.optAtDocumented += 1;
    if (row.state === "OPTIMIZED") counts.optAtOptimized += 1;
    if (row.state === "TRADE_OFF") counts.optAtTradeOff += 1;
    if (row.state === "OWNED") counts.optAtOwned += 1;

    if (row.state !== "NONE") counts.optAtDocumentedOrAbove += 1;
    if (
      row.state === "OPTIMIZED"
      || row.state === "TRADE_OFF"
      || row.state === "OWNED"
    ) {
      counts.optAtOptimizedOrAbove += 1;
    }
    if (row.state === "TRADE_OFF" || row.state === "OWNED") {
      counts.optAtTradeOffOrAbove += 1;
    }
    if (row.state === "OWNED") counts.optAtOwnedOrAbove += 1;
  }

  // ── Score ────────────────────────────────────────────────────────
  const baseScore = codingSolutions.length === 0
    ? 0
    : matrix.reduce((a, r) => a + OPT_STATES[r.state].points, 0)
        / codingSolutions.length;

  const ma = typeof metacognitiveAccuracy === "number"
    ? metacognitiveAccuracy
    : 1.0;
  const calibrationModifier = clamp(ma, CALIBRATION_FLOOR, CALIBRATION_CEILING);
  const score = Math.round(baseScore * calibrationModifier);

  return {
    matrix,
    counts,
    baseScore: Math.round(baseScore),
    calibrationModifier: Math.round(calibrationModifier * 100) / 100,
    score,
  };
}

// Exposed for tests + UI mapping.
export {
  BRUTE_MIN_CHARS,
  OPTIMIZED_MIN_CHARS,
  CODE_CORRECTNESS_FLOOR,
  CALIBRATION_FLOOR,
  CALIBRATION_CEILING,
};

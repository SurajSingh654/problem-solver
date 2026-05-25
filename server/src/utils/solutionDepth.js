// ============================================================================
// Solution Depth — D2 v2 computation
// ============================================================================
//
// The legacy D2 ("Solution Depth") scored on length thresholds (keyInsight ≥60
// chars, feynman ≥200, realWorld ≥80), rewarded self-confidence regardless of
// accuracy, and let the AI rate the *written explanation*. None of that
// measures depth — a polished Feynman block can be written without
// understanding, and self-confidence isn't a depth signal.
//
// This module replaces the formula with a five-state per-solution machine
// grounded in cognitive-science research on what "depth" actually is:
//
//   NONE → DOCUMENTED → EXPLAINED → DEFENDED → OWNED
//   (0)    (25)         (50)        (75)       (100)
//
// State transitions reflect what "depth of understanding" requires:
//
//   Bloom's Taxonomy, revised by Anderson & Krathwohl (2001) — the depth
//   ladder: Remember → Understand → Apply → Analyze → Evaluate → Create.
//   Self-reported text typically caps at Understand+Apply; Analyze and
//   Evaluate require comparison, defense, and probe-passing — the layers
//   above DOCUMENTED in this state machine.
//
//   Chi, Bassok, Lewis, Reimann & Glaser (1989) "Self-Explanations: How
//   Students Study and Use Examples in Learning to Solve Problems"
//   (Cognitive Science). Generative self-explanation (inference,
//   gap-detection, prior-knowledge connection) is what produces depth —
//   restatement does not. EXPLAINED requires AI's understandingDepth ≥7,
//   which is the proxy for "this looks generative, not restatement."
//
//   Chi, Roy & Hausmann (2008) "Observing Tutorial Dialogues
//   Collaboratively" (Cognitive Science). Probe questions ("Why?",
//   "What if?", "How do you know?") differentiate surface from deep
//   understanding. The DEFENDED state requires ≥1 follow-up answer with
//   AI score ≥7 — that's the probe-passing criterion.
//
//   Karpicke & Roediger (2008) "The Critical Importance of Retrieval for
//   Learning" (Science). Retrieval practice produces ~50% better delayed-
//   test performance than restudy controls, even though restudy feels
//   easier. The schema already cites this paper for ReviewAttempt
//   (schema.prisma:955-958). The OWNED state requires a ReviewAttempt
//   with quality ≥4 AND substantial recallText — the gold-standard test
//   that the understanding survived delay.
//
//   Kruger & Dunning (1999) "Unskilled and Unaware of It" (J. Personality
//   & Social Psych.) + Dunlosky 2013 review. Accurate self-assessment
//   correlates with actual competence; severe miscalibration is itself
//   diagnostic. metacognitiveAccuracy (computed in stats.controller.js,
//   1 - mean(|self - AI|) on normalized scales) is preserved as a
//   multiplier here, clamped to [0.70, 1.00]: severe Dunning-Kruger users
//   take a 30% hit; well-calibrated users get full credit (no bonus —
//   calibration is expected, not exceptional).
//
//   Bjork & Bjork (1992) "A New Theory of Disuse" — desirable difficulties
//   (spaced retrieval, interleaving, generation) are what produce durable
//   depth. The state machine layers these in order: generation
//   (DOCUMENTED), explanation quality (EXPLAINED), probe-resistance
//   (DEFENDED), spaced retrieval survival (OWNED).
//
// SAW_APPROACH solutions cap at NONE. A user who looked at the canonical
// approach can recite the explanation from memory; that doesn't measure
// their understanding, it measures their reading. They can re-attempt
// the same problem cold later to earn credit.
//
// Pre-2026-05-26 NULL solveMethod is treated as COLD-equivalent (legacy
// permissive — same SOLVE_METHOD_REQUIRED_AFTER constant as patternMastery.js).
// ============================================================================

import { SOLVE_METHOD_REQUIRED_AFTER } from "./patternMastery.js";

export const DEPTH_STATES = Object.freeze({
  NONE:       { points: 0,   label: "None"       },
  DOCUMENTED: { points: 25,  label: "Documented" },
  EXPLAINED:  { points: 50,  label: "Explained"  },
  DEFENDED:   { points: 75,  label: "Defended"   },
  OWNED:      { points: 100, label: "Owned"      },
});

// State-transition tunables. Every threshold change shifts scores for every
// user — bake into tests if you change any. Documented rationale below.
const INSIGHT_MIN_CHARS    = 60;   // keyInsight gate (carried from legacy)
const FEYNMAN_MIN_CHARS    = 200;  // feynman gate (carried from legacy)
const UNDERSTANDING_FLOOR  = 7;    // AI dimensionScores.understandingDepth ≥ this for EXPLAINED
const FOLLOWUP_FLOOR       = 7;    // AI followUpEvaluations[].score ≥ this for DEFENDED
const RECALL_QUALITY_FLOOR = 4;    // ReviewAttempt.quality ≥ this for OWNED (3 is recalled-with-effort; 4-5 is fluent recall)
const RECALL_TEXT_FLOOR    = 80;   // recallText length floor — 20 chars is a label, not retrieval; 80 forces a sentence
const CALIBRATION_FLOOR    = 0.70; // severe Dunning-Kruger → 30% off
const CALIBRATION_CEILING  = 1.00; // calibration is expected, not a bonus

// Naive HTML strip — D2 reads HTML-rich text from RichTextEditor. Same logic
// the legacy controller uses; kept local here so the utility is self-contained.
function stripHtml(s) {
  if (typeof s !== "string") return "";
  return s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Treat solveMethod NULL on legacy rows (createdAt < deploy date) as COLD.
// Post-deploy NULL = NOT-COLD — the user must explicitly mark the solve.
// SAW_APPROACH and HINTS are explicit non-COLD; only COLD progresses past
// DOCUMENTED. Per-solution check; see usage below for the SAW_APPROACH cap.
function isQualifyingSolveMethod(solution) {
  if (solution.solveMethod === "COLD") return true;
  if (solution.solveMethod === "HINTS") return true;
  if (solution.solveMethod == null) {
    const created = solution.createdAt ? new Date(solution.createdAt) : null;
    if (created && created < SOLVE_METHOD_REQUIRED_AFTER) return true;
  }
  return false;
}

// Latest AI review attached to a solution, or null. Mirrors the convention in
// stats.controller.js — last item in aiFeedback[].
function latestAiReview(solution) {
  if (!Array.isArray(solution.aiFeedback) || solution.aiFeedback.length === 0) {
    return null;
  }
  return solution.aiFeedback[solution.aiFeedback.length - 1];
}

// Did this solution earn DOCUMENTED based on its written content?
// Decision (locked, per Plan agent push): require BOTH insight AND feynman.
// The original spec required all three reflective fields, but realWorld is
// "where this applies in industry" — Apply-level, not Understand-level. The
// two diagnostic depth signals are the insight (the "aha") and the Feynman
// explanation (can you teach a beginner). RealWorld stays in the schema as a
// UX nudge but doesn't gate state.
function meetsDocumentedTextRequirement(solution) {
  const insight = stripHtml(solution.keyInsight);
  const feynman = stripHtml(solution.feynmanExplanation);
  return insight.length >= INSIGHT_MIN_CHARS
    && feynman.length >= FEYNMAN_MIN_CHARS;
}

/**
 * Compute per-solution depth state + aggregate score.
 *
 * @param {object} input
 * @param {Array}  input.solutions       Solution rows. MUST include: id,
 *   keyInsight, feynmanExplanation, realWorldConnection, solveMethod, createdAt,
 *   aiFeedback (with dimensionScores.understandingDepth, flags.overconfidenceDetected,
 *   followUpEvaluations[].score), problem.category.
 * @param {Array}  input.reviewAttempts  ALL review attempts (NOT filtered by
 *   quality). Each MUST include: solutionId, quality, recallText.
 * @param {number|null} input.metacognitiveAccuracy  Already-computed metacog
 *   accuracy from stats.controller.js (1 - mean delta). null when n<3 reviews.
 * @returns {{
 *   matrix: Array<{ solutionId, state, hasReflective, aiUnderstanding,
 *                   defendedByFollowUp, recallSuccess, solveMethod,
 *                   hasOverconfidenceFlag }>,
 *   counts: {
 *     none, documented, explained, defended, owned,
 *     documentedOrAbove, explainedOrAbove, defendedOrAbove, ownedOrAbove,
 *     totalCoding,
 *   },
 *   baseScore: number,             // 0-100
 *   calibrationModifier: number,   // 0.70-1.00
 *   score: number,                 // round(baseScore * calibrationModifier)
 * }}
 */
export function computeSolutionDepth({ solutions, reviewAttempts, metacognitiveAccuracy }) {
  // Coding-only — parallel S2/B2/F2 dims will own non-CODING modes.
  const codingSolutions = (solutions || []).filter((s) => {
    const cat = s?.problem?.category;
    return !cat || cat === "CODING";
  });

  // Index ReviewAttempts by solutionId for O(1) per-solution OWNED lookup.
  // Requires ALL attempts (including failed) to distinguish "never tried"
  // from "tried and failed" — failure is a denial signal for OWNED.
  const attemptsBySolution = new Map();
  for (const ra of reviewAttempts || []) {
    if (!ra?.solutionId) continue;
    const arr = attemptsBySolution.get(ra.solutionId) || [];
    arr.push(ra);
    attemptsBySolution.set(ra.solutionId, arr);
  }

  // Build per-solution matrix.
  const matrix = codingSolutions.map((s) => {
    const review = latestAiReview(s);
    const aiUnderstanding = review?.dimensionScores?.understandingDepth ?? null;
    const overconfidenceFlag = review?.flags?.overconfidenceDetected === true;

    // SAW_APPROACH: hard cap at NONE. Even if reflective text is excellent,
    // we don't know if the user wrote it from memory or from the canonical
    // answer they just saw.
    if (s.solveMethod === "SAW_APPROACH") {
      return {
        solutionId: s.id,
        state: "NONE",
        hasReflective: meetsDocumentedTextRequirement(s),
        aiUnderstanding,
        defendedByFollowUp: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
        hasOverconfidenceFlag: overconfidenceFlag,
      };
    }

    // Post-deploy NULL solveMethod: NOT counted as COLD-equivalent. User
    // must specify the method going forward. Falls to NONE because no
    // qualifying solveMethod = no DOCUMENTED.
    if (!isQualifyingSolveMethod(s)) {
      return {
        solutionId: s.id,
        state: "NONE",
        hasReflective: meetsDocumentedTextRequirement(s),
        aiUnderstanding,
        defendedByFollowUp: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
        hasOverconfidenceFlag: overconfidenceFlag,
      };
    }

    // Documented gate: insight + feynman both meet length floors.
    if (!meetsDocumentedTextRequirement(s)) {
      return {
        solutionId: s.id,
        state: "NONE",
        hasReflective: false,
        aiUnderstanding,
        defendedByFollowUp: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
        hasOverconfidenceFlag: overconfidenceFlag,
      };
    }

    // EXPLAINED gate: AI understandingDepth ≥7 AND no overconfidence flag.
    const meetsExplained =
      aiUnderstanding !== null
      && aiUnderstanding >= UNDERSTANDING_FLOOR
      && !overconfidenceFlag;

    if (!meetsExplained) {
      return {
        solutionId: s.id,
        state: "DOCUMENTED",
        hasReflective: true,
        aiUnderstanding,
        defendedByFollowUp: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
        hasOverconfidenceFlag: overconfidenceFlag,
      };
    }

    // DEFENDED gate: at least one follow-up answer scored ≥7 by AI.
    const followUps = Array.isArray(review?.followUpEvaluations)
      ? review.followUpEvaluations
      : [];
    const defendedByFollowUp = followUps.some(
      (fe) => typeof fe?.score === "number" && fe.score >= FOLLOWUP_FLOOR,
    );

    if (!defendedByFollowUp) {
      return {
        solutionId: s.id,
        state: "EXPLAINED",
        hasReflective: true,
        aiUnderstanding,
        defendedByFollowUp: false,
        recallSuccess: false,
        solveMethod: s.solveMethod,
        hasOverconfidenceFlag: overconfidenceFlag,
      };
    }

    // OWNED gate: at least one ReviewAttempt with quality ≥4 AND a
    // substantive recallText (≥80 chars) — gold-standard retrieval evidence.
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
      state: recallSuccess ? "OWNED" : "DEFENDED",
      hasReflective: true,
      aiUnderstanding,
      defendedByFollowUp: true,
      recallSuccess,
      solveMethod: s.solveMethod,
      hasOverconfidenceFlag: overconfidenceFlag,
    };
  });

  // Aggregate counts. Keys are prefixed with `solutionsAt*` (or
  // `solutionsNone`, `solutionsTotal`) to disambiguate from D1's pattern
  // mastery counts in the merged masteryCounts object passed to
  // classifyReadiness — D1 has its own `owned`, `solid`, etc. for patterns.
  const counts = {
    solutionsNone: 0,
    solutionsAtDocumented: 0,
    solutionsAtExplained: 0,
    solutionsAtDefended: 0,
    solutionsAtOwned: 0,
    solutionsAtDocumentedOrAbove: 0,
    solutionsAtExplainedOrAbove: 0,
    solutionsAtDefendedOrAbove: 0,
    solutionsAtOwnedOrAbove: 0,
    totalCoding: codingSolutions.length,
  };

  for (const row of matrix) {
    if (row.state === "NONE") counts.solutionsNone += 1;
    if (row.state === "DOCUMENTED") counts.solutionsAtDocumented += 1;
    if (row.state === "EXPLAINED") counts.solutionsAtExplained += 1;
    if (row.state === "DEFENDED") counts.solutionsAtDefended += 1;
    if (row.state === "OWNED") counts.solutionsAtOwned += 1;

    if (row.state !== "NONE") counts.solutionsAtDocumentedOrAbove += 1;
    if (row.state === "EXPLAINED" || row.state === "DEFENDED" || row.state === "OWNED") {
      counts.solutionsAtExplainedOrAbove += 1;
    }
    if (row.state === "DEFENDED" || row.state === "OWNED") {
      counts.solutionsAtDefendedOrAbove += 1;
    }
    if (row.state === "OWNED") counts.solutionsAtOwnedOrAbove += 1;
  }

  // baseScore: simple mean of state.points across coding solutions.
  // Returns 0 for the empty case (no division-by-zero).
  const baseScore = codingSolutions.length === 0
    ? 0
    : matrix.reduce((a, r) => a + DEPTH_STATES[r.state].points, 0) / codingSolutions.length;

  // Calibration modifier — preserves Kruger-Dunning research intent without
  // letting calibration replace earned depth. Floor at 0.70 (severe miscal
  // takes a real hit but doesn't zero-out depth); ceiling at 1.00 (well-
  // calibrated is expected behavior, not bonus territory).
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
  INSIGHT_MIN_CHARS,
  FEYNMAN_MIN_CHARS,
  UNDERSTANDING_FLOOR,
  FOLLOWUP_FLOOR,
  RECALL_QUALITY_FLOOR,
  RECALL_TEXT_FLOOR,
  CALIBRATION_FLOOR,
  CALIBRATION_CEILING,
};

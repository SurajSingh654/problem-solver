// ============================================================================
// Behavioral Performance — D9 computation
// ============================================================================
//
// New dim covering interview process signals + calibration + HR-round
// content. Distinct from D5 Pressure Performance:
//   D5 = technical output quality under time pressure (correctness, complexity)
//   D9 = how the candidate conducts themselves (clarifying questions,
//        narration, calibration, culture-style coverage, HR STAR content)
// Same source data (mocks) but different signals extracted.
//
// Pre-D9, ALL of these signals were dark to the readiness report:
//   - InterviewSession.behavioralSignals (5 deterministic fields per mock)
//   - InterviewSession.preSessionConfidence vs debrief.verdict (calibration)
//   - InterviewSession.interviewStyle (8 distinct culture styles)
//   - Problem.category="HR" solutions (STAR-format content)
//
// Source tiers (mirror D3/D5/D7/D8):
//   - draft-only       (ceiling 30): no completed mocks; only HR text answers
//   - mock-validated   (ceiling 70): ≥3 mocks with debrief
//   - diversified      (ceiling 100): ≥5 mocks across ≥3 distinct styles
//                                     (Lievens & De Soete 2012: replication
//                                     across rater contexts improves validity)
//
// Sub-components (weights re-normalize across what's present):
//
//   0.40 × verdict_score       — Avg of mock verdicts mapped to 0-100:
//                                STRONG_HIRE=100, HIRE=80, LEAN_HIRE=60,
//                                LEAN_NO_HIRE=40, NO_HIRE=20.
//   0.25 × process_signals     — Composite of 5 behavioral fields:
//                                  clarifyingQuestions ≥ 2: +20
//                                  thoughtOutLoud true (% of mocks): 0-20
//                                  identifiedComplexityIndependently: 0-20
//                                  foundEdgeCasesIndependently: 0-20
//                                  hintsRequired ≤ 1 avg: 0-20
//                                Sum 0-100. Each field directly testable.
//   0.15 × calibration         — Kruger-Dunning 1999. Maps |preConfidence -
//                                verdict_band| to 100 - 25×delta. Delta=0
//                                (perfect calibration) = 100; delta=4 = 0.
//   0.10 × hr_practice         — min(1, hrSolutionCount/5) × 100. Caps at
//                                5 HR Problem solutions — STAR practice.
//   0.10 × style_diversity     — min(1, distinctStyles/4) × 100. Caps at 4
//                                culture styles practiced (of 8 available).
//                                Lievens & De Soete 2012 replication.
//
// CI computation (asymmetric clamp pattern):
//   - Half-width from per-mock verdict-score distribution.
//   - Recenter at capped score.
//   - Clamp [0, ceiling] on the upper side.
//
// Research:
//   Kruger & Dunning (1999) "Unskilled and Unaware of It" — self-assessment
//     accuracy as a measurable competence signal.
//   Lievens & De Soete (2012) "Simulations" — single behavioral interview
//     is a poor predictor; replication across rater/style contexts improves
//     predictive validity.
//   Schmidt & Hunter (1998) — structured behavioral interviews r=0.51
//     vs unstructured r=0.31 for predicting job performance.
// ============================================================================

import { meanCI } from "./dimensionStats.js";

// Source-tier ceilings.
export const DRAFT_ONLY_CEILING = 30;
export const MOCK_VALIDATED_CEILING = 70;
export const DIVERSIFIED_CEILING = 100;

// Source-tier thresholds.
export const MOCK_VALIDATED_MIN_MOCKS = 3;
export const DIVERSIFIED_MIN_MOCKS = 5;
export const DIVERSIFIED_MIN_STYLES = 3;

// Activation thresholds — opt-in like D7/D8.
export const ACTIVATION_MIN_MOCKS = 1;
export const ACTIVATION_MIN_HR_SOLUTIONS = 3;

// Sub-component weights.
const W_VERDICT = 0.40;
const W_PROCESS = 0.25;
const W_CALIBRATION = 0.15;
const W_HR_PRACTICE = 0.10;
const W_STYLE_DIVERSITY = 0.10;

// HR practice / style diversity saturation points.
const HR_SATURATION = 5;
const STYLE_SATURATION = 4;

// Verdict → score map (matches the canonical mapping in ai.fallbacks.js
// VERDICT_TO_SCORE but on the 0-100 D9 scale, not the 0-10 single-dim scale).
const VERDICT_TO_SCORE_100 = Object.freeze({
  STRONG_HIRE: 100,
  HIRE: 80,
  LEAN_HIRE: 60,
  LEAN_NO_HIRE: 40,
  NO_HIRE: 20,
});

// Verdict → calibration band on 1-5 confidence scale (so |preConf - band|
// is meaningful). STRONG_HIRE = 5 (deserves 5/5), HIRE = 4, etc.
const VERDICT_TO_CONFIDENCE_BAND = Object.freeze({
  STRONG_HIRE: 5,
  HIRE: 4,
  LEAN_HIRE: 3,
  LEAN_NO_HIRE: 2,
  NO_HIRE: 1,
});

/**
 * Decide source-quality tier.
 */
export function classifySourceQuality({ mockCount, distinctStyleCount }) {
  if (mockCount >= DIVERSIFIED_MIN_MOCKS && distinctStyleCount >= DIVERSIFIED_MIN_STYLES) {
    return "diversified";
  }
  if (mockCount >= MOCK_VALIDATED_MIN_MOCKS) {
    return "mock-validated";
  }
  return "draft-only";
}

export function ceilingForSourceQuality(tier) {
  if (tier === "diversified") return DIVERSIFIED_CEILING;
  if (tier === "mock-validated") return MOCK_VALIDATED_CEILING;
  return DRAFT_ONLY_CEILING;
}

/**
 * Parse behavioralSignals.clarifyingQuestions string ("2 questions asked",
 * "0 questions asked"). Returns the leading integer or null.
 */
function parseLeadingInt(str) {
  if (typeof str !== "string") return null;
  const m = str.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Composite process signal — 5 behavioral fields → 0-100.
 * Each field worth up to 20pts; sum and round.
 */
function processSignalScore(behavioralSignals, mockCount) {
  if (!Array.isArray(behavioralSignals) || behavioralSignals.length === 0) return 0;
  let totalClarifying = 0; // count of mocks with ≥2 clarifying questions
  let totalNarration = 0;
  let totalComplexity = 0;
  let totalEdgeCases = 0;
  let totalLowHints = 0; // count of mocks with ≤1 hint
  let countedClarifying = 0;
  let countedHints = 0;
  for (const sig of behavioralSignals) {
    if (!sig || typeof sig !== "object") continue;
    const cq = parseLeadingInt(sig.clarifyingQuestions);
    if (cq !== null) {
      countedClarifying += 1;
      if (cq >= 2) totalClarifying += 1;
    }
    if (sig.thoughtOutLoud === true) totalNarration += 1;
    if (sig.identifiedComplexityIndependently === true) totalComplexity += 1;
    if (sig.foundEdgeCasesIndependently === true) totalEdgeCases += 1;
    const hints = parseLeadingInt(sig.hintsRequired);
    if (hints !== null) {
      countedHints += 1;
      if (hints <= 1) totalLowHints += 1;
    }
  }
  const clarifyingScore = countedClarifying === 0
    ? 0
    : (totalClarifying / countedClarifying) * 20;
  const narrationScore = (totalNarration / mockCount) * 20;
  const complexityScore = (totalComplexity / mockCount) * 20;
  const edgeCaseScore = (totalEdgeCases / mockCount) * 20;
  const hintsScore = countedHints === 0
    ? 0
    : (totalLowHints / countedHints) * 20;
  return clarifyingScore + narrationScore + complexityScore + edgeCaseScore + hintsScore;
}

/**
 * Compute Kruger-Dunning calibration: avg |preConfidence - verdict_band|
 * for sessions where both are present. Then map delta → score:
 *   delta 0 → 100, delta 4 → 0 (linear, clamp at 0).
 * Returns { score: 0-100, avgDelta: 0-4, n: int }.
 */
function calibrationScore(sessions) {
  const deltas = [];
  for (const s of sessions) {
    const pre = s?.preSessionConfidence;
    const verdict = s?.debrief?.verdict;
    if (typeof pre !== "number" || pre < 1 || pre > 5) continue;
    const band = VERDICT_TO_CONFIDENCE_BAND[verdict];
    if (typeof band !== "number") continue;
    deltas.push(Math.abs(pre - band));
  }
  if (deltas.length === 0) return { score: 0, avgDelta: null, n: 0 };
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const score = Math.max(0, 100 - 25 * avg);
  return { score, avgDelta: avg, n: deltas.length };
}

/**
 * Compute D9 stats.
 *
 * @param {object} input
 * @param {Array<{
 *   id: string,
 *   interviewStyle: string | null,
 *   preSessionConfidence: number | null,
 *   debrief: { verdict?: string, behavioralSignals?: object } | null,
 * }>} input.mocks  Completed InterviewSession rows with debrief joined.
 * @param {number} input.hrSolutionCount  Count of completed HR Problem
 *   solutions for this user (Problem.category='HR').
 * @returns {{
 *   active: boolean,
 *   mockCount: number,
 *   hrSolutionCount: number,
 *   distinctStyleCount: number,
 *   verdictScore: number,
 *   processScore: number,
 *   calibrationScore: number,
 *   calibrationDelta: number | null,
 *   calibrationN: number,
 *   sourceQuality: "draft-only" | "mock-validated" | "diversified",
 *   ceiling: number,
 *   score: number | null,
 *   ci: [number, number] | null,
 *   basis: string[],
 * }}
 */
export function computeBehavioralPerformanceStats({ mocks, hrSolutionCount = 0 }) {
  const allMocks = Array.isArray(mocks) ? mocks : [];
  // Only count mocks with a debrief (the verdict signal is required).
  const validMocks = allMocks.filter((m) => m?.debrief?.verdict);
  const mockCount = validMocks.length;
  const hrCount = Math.max(0, hrSolutionCount);

  // Activation: ≥1 mock OR ≥3 HR solutions. Below that, dim is inactive.
  const active = mockCount >= ACTIVATION_MIN_MOCKS
    || hrCount >= ACTIVATION_MIN_HR_SOLUTIONS;

  if (!active) {
    return {
      active: false,
      mockCount,
      hrSolutionCount: hrCount,
      distinctStyleCount: 0,
      verdictScore: 0,
      processScore: 0,
      calibrationScore: 0,
      calibrationDelta: null,
      calibrationN: 0,
      sourceQuality: "draft-only",
      ceiling: DRAFT_ONLY_CEILING,
      score: null,
      ci: null,
      basis: [
        `mocks: ${mockCount}`,
        `hr_solutions: ${hrCount}`,
      ],
    };
  }

  // ── Verdict score (avg per-mock verdict mapped to 0-100) ──
  const verdictScores = validMocks
    .map((m) => VERDICT_TO_SCORE_100[m.debrief.verdict])
    .filter((v) => typeof v === "number");
  const verdictScore = verdictScores.length === 0
    ? 0
    : verdictScores.reduce((a, b) => a + b, 0) / verdictScores.length;

  // ── Process signals (5-field composite) ──
  const behavioralSignals = validMocks
    .map((m) => m?.debrief?.behavioralSignals)
    .filter((bs) => bs && typeof bs === "object");
  const processScore = mockCount === 0
    ? 0
    : processSignalScore(behavioralSignals, mockCount);

  // ── Calibration (Kruger-Dunning) ──
  const cal = calibrationScore(validMocks);

  // ── HR practice (capped) ──
  const hrPracticeScore = Math.min(1, hrCount / HR_SATURATION) * 100;

  // ── Style diversity ──
  const distinctStyles = new Set(
    validMocks
      .map((m) => m.interviewStyle)
      .filter((s) => typeof s === "string" && s.length > 0),
  );
  const distinctStyleCount = distinctStyles.size;
  const styleDiversityScore = Math.min(1, distinctStyleCount / STYLE_SATURATION) * 100;

  // ── Source-tier ──
  const sourceQuality = classifySourceQuality({ mockCount, distinctStyleCount });
  const ceiling = ceilingForSourceQuality(sourceQuality);

  // ── Sub-component blend ──
  const components = [
    { value: verdictScore, weight: W_VERDICT, present: verdictScores.length > 0 },
    { value: processScore, weight: W_PROCESS, present: behavioralSignals.length > 0 },
    { value: cal.score, weight: W_CALIBRATION, present: cal.n > 0 },
    { value: hrPracticeScore, weight: W_HR_PRACTICE, present: hrCount > 0 },
    { value: styleDiversityScore, weight: W_STYLE_DIVERSITY, present: distinctStyleCount > 0 },
  ];
  const presentComponents = components.filter((c) => c.present);
  const totalWeight = presentComponents.reduce((a, c) => a + c.weight, 0);
  const baseScore = totalWeight === 0
    ? 0
    : presentComponents.reduce((a, c) => a + c.value * c.weight, 0) / totalWeight;

  const score = Math.round(Math.min(baseScore, ceiling));

  // ── Asymmetric CI clamp ──
  let ci = null;
  if (verdictScores.length >= 2) {
    const raw = meanCI(verdictScores);
    if (raw) {
      const halfWidth = (raw.ci[1] - raw.ci[0]) / 2;
      ci = [
        Math.max(0, Math.round(score - halfWidth)),
        Math.min(ceiling, Math.round(score + halfWidth)),
      ];
    }
  } else if (verdictScores.length === 1 || hrCount > 0) {
    ci = [
      Math.max(0, score - 30),
      Math.min(ceiling, score + 30),
    ];
  }

  const basis = [
    `mocks: ${mockCount}`,
    `hr_solutions: ${hrCount}`,
    `distinct_styles: ${distinctStyleCount}`,
    `avg_verdict: ${(verdictScore / 20).toFixed(1)}/5`,
    `process_signals: ${Math.round(processScore)}/100`,
    ...(cal.n > 0
      ? [
          `calibration: ${Math.round(cal.score)}/100`,
          `calibration_delta: ${cal.avgDelta.toFixed(2)}`,
        ]
      : []),
    `source_quality: ${sourceQuality}`,
    `ceiling: ${ceiling}`,
  ];

  return {
    active: true,
    mockCount,
    hrSolutionCount: hrCount,
    distinctStyleCount,
    verdictScore,
    processScore,
    calibrationScore: cal.score,
    calibrationDelta: cal.avgDelta,
    calibrationN: cal.n,
    sourceQuality,
    ceiling,
    score,
    ci,
    basis,
  };
}

// Exported for tests + UI mapping.
export {
  W_VERDICT,
  W_PROCESS,
  W_CALIBRATION,
  W_HR_PRACTICE,
  W_STYLE_DIVERSITY,
  HR_SATURATION,
  STYLE_SATURATION,
  VERDICT_TO_SCORE_100,
  VERDICT_TO_CONFIDENCE_BAND,
};

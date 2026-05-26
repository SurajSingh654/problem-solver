// ============================================================================
// Pressure Performance Stats — D5 v2 computation
// ============================================================================
//
// The legacy D5 ("Pressure Performance") had four structural problems:
//
//   1. Construct mismatch — quizzes (self-paced, untimed, no observer)
//      activated the dim and counted as "pressure performance." Quiz
//      knowledge under no time pressure is a different construct from
//      live interview performance under time-pressured observation.
//
//   2. Inverted weighting — when both signals were present, quizzes were
//      weighted 0.6 vs mocks 0.4. The proxy outweighed the work-sample.
//      Schmidt-Hunter (1998) selection-validity meta-analysis: work
//      samples r=0.54, proxy r≤0.20 — the reverse of the legacy weights.
//
//   3. Score-outside-CI bug — same architectural defect that produced
//      "Comms 53 with CI 61-79" in D3. CI computed on raw quiz scores;
//      score was a 0.4/0.6 blend or capped at 75. Different quantities.
//
//   4. No subject filter — a user could spam quizzes on Photography,
//      Hindi, Physics and earn pressure-performance credit. The mechanism
//      to filter (mapQuizSubjectToDimensions) already existed but was
//      not used by D5.
//
// D5 v2 reframes the dim around signal source quality:
//
//   - Quiz-proxy (≥3 interview-relevant quizzes)  → ceiling 40
//   - +Live (≥1 mock with comm/perf scores)        → ceiling 80
//   - +Stable (≥3 mocks)                            → ceiling 100
//
// Mock signal weighted 0.7 vs quiz 0.3 (inverse of legacy). Quiz signal
// is filtered to interview-relevant subjects (via injected
// mapQuizSubjectToDimensions) and difficulty-weighted (HARD 1.3 / MEDIUM
// 1.0 / EASY 0.8 — same multipliers as the existing quiz cross-feed
// time-decay model). Asymmetric CI clamp preserves variance honestly.
//
// References:
//   Yerkes & Dodson (1908) "The Relation of Strength of Stimulus to
//   Rapidity of Habit-Formation" — performance has an inverted-U
//   relationship with arousal/pressure. Quizzes don't probe the
//   high-arousal end; mocks do.
//
//   Baumeister (1984) "Choking under pressure: Self-consciousness and
//   paradoxical effects of incentives on skillful performance" (J.
//   Personality & Social Psych.) — explicit attentional self-monitoring
//   degrades automatic skills under stress. Live observation is the test.
//
//   Beilock & Carr (2001) "On the fragility of skilled performance"
//   (Psych Science) — experts can fail to articulate what they know
//   under pressure. The thinking-aloud-while-solving requirement of
//   mocks IS the test.
//
//   Hardy & Parfitt (1991) catastrophe theory — performance can collapse
//   abruptly past arousal threshold. Only live observation detects the
//   threshold; written quizzes don't.
//
//   Schmidt & Hunter (1998) "The Validity and Utility of Selection
//   Methods" — work samples r=0.54, structured interviews r=0.51,
//   untimed proxy ≤0.20. Strict 40 cap on quiz-only is research-honest.
//
//   Anderson & Shackleton (1990) — interviewer rater stability requires
//   ≥3-4 sessions. Stable-mocks ceiling at ≥3 mocks reflects this.
//
//   interviewing.io 2023 published interview-data report — at L4/L5+,
//   the most predictive single signal is "completed mock count, peer-
//   rated." Quizzes specifically are not used for pressure prediction.
// ============================================================================

import { meanCI } from "./dimensionStats.js";

// Activation thresholds per source.
export const MIN_QUIZ_N_RELEVANT = 3;
export const MIN_LIVE_N = 1;
export const MIN_STABLE_N = 3;

// Score caps per source-quality ceiling (research-backed; see header).
export const CEILING_NONE = null;
export const CEILING_QUIZ = 40;
export const CEILING_LIVE = 80;
export const CEILING_STABLE = 100;

// Source weights for blending. Re-normalized across PRESENT sources only
// (mirrors combineCIs in dimensionStats.js). Inverse of legacy 0.4/0.6.
const WEIGHT_MOCK = 0.7;
const WEIGHT_QUIZ = 0.3;

// Difficulty multipliers — same scheme as the existing quiz time-decay
// model in stats.controller.js (HARD 1.3 / MEDIUM 1.0 / EASY 0.8).
const DIFFICULTY_MULTIPLIER = { HARD: 1.3, MEDIUM: 1.0, EASY: 0.8 };

// InterviewSession.scores fields used as live-pressure signal. Mirrors
// the existing D5 extraction at stats.controller.js (lines ~1595-1633) —
// kept here as the v2 source of truth.
const PRESSURE_SCALE10_FIELDS = [
  "problemDecomposition",
  "codeCorrectness",
  "codeQuality",
  "communicationWhileCoding",
  "edgeCaseHandling",
  "optimizationAbility",
  "composureUnderPressure",
  "requirementsClarification",
  "architectureClarity",
  "scaleThinking",
  "failureModeAwareness",
  "tradeOffReasoning",
  "componentDepth",
  "communicationClarity",
  "starStructure",
  "specificity",
  "quantifiedImpact",
  "growthMindset",
  "relevanceToRole",
  "conceptualAccuracy",
  "explanationDepth",
  "realWorldApplication",
  "misconceptionAwareness",
  "schemaUnderstanding",
  "queryCorrectness",
  "optimizationAwareness",
  "codeReadability",
  "authenticity",
  "companyResearch",
  "careerNarrative",
  "questionQuality",
  "cultureFit",
];
const PRESSURE_SCALE4_FIELDS = [
  "clarifyingQuestions",
  "hintUtilization",
  "personalOwnership",
];

// Compute per-mock pressure score: mean of normalized (0-100) scale10 +
// scale4 fields. Returns null if no relevant fields present.
function extractMockPressureScore(scores) {
  if (!scores || typeof scores !== "object") return null;
  const normalized = [];
  for (const f of PRESSURE_SCALE10_FIELDS) {
    if (typeof scores[f] === "number") {
      normalized.push((scores[f] / 10) * 100);
    }
  }
  for (const f of PRESSURE_SCALE4_FIELDS) {
    if (typeof scores[f] === "number") {
      normalized.push((scores[f] / 4) * 100);
    }
  }
  if (normalized.length === 0) return null;
  return normalized.reduce((a, b) => a + b, 0) / normalized.length;
}

// Difficulty-weighted mean of quiz scores. Quizzes lacking a difficulty
// label fall back to MEDIUM multiplier.
function difficultyWeightedMean(quizzes) {
  if (!quizzes || quizzes.length === 0) return null;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const q of quizzes) {
    const mult = DIFFICULTY_MULTIPLIER[q.difficulty] ?? DIFFICULTY_MULTIPLIER.MEDIUM;
    const score = typeof q.score === "number" ? q.score : 0;
    weightedSum += score * mult;
    totalWeight += mult;
  }
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

/**
 * Compute D5 v2 pressure performance score, ceiling, CI, and source breakdown.
 *
 * @param {object} input
 * @param {Array<{scores?: object}>} input.interviews                  Mock InterviewSession rows.
 * @param {Array<{subject: string, score: number, difficulty?: string}>} input.quizzes  Recent quizzes.
 * @param {(subject: string) => Array} input.mapQuizSubjectToDimensions  Injected — caller passes
 *   the existing function from stats.controller.js so we don't duplicate the keyword lists.
 *
 * @returns {{
 *   sources: { stable: boolean, live: boolean, quiz: boolean },
 *   mocksWithScores: number,
 *   relevantQuizCount: number,
 *   totalQuizzesSeen: number,
 *   ceiling: number | null,
 *   score:   number | null,
 *   ci:      [number, number] | null,
 *   sourceQuality: "stable-mocks" | "live-and-quiz" | "live-only" | "quiz-proxy" | "inactive",
 *   basis:   string[],
 * }}
 */
export function computePressurePerformanceStats({
  interviews = [],
  quizzes = [],
  mapQuizSubjectToDimensions,
} = {}) {
  if (typeof mapQuizSubjectToDimensions !== "function") {
    throw new Error(
      "computePressurePerformanceStats requires mapQuizSubjectToDimensions to be injected",
    );
  }

  // ── Subject filter on quizzes ───────────────────────────────────
  // A quiz is pressure-relevant iff its subject maps to ANY dimension
  // (D1 patterns, D2 fundamentals, D3 behavioral, D4 optimization).
  // Photography / Hindi / Physics return [] and are excluded.
  const totalQuizzesSeen = Array.isArray(quizzes) ? quizzes.length : 0;
  const relevantQuizzes = (quizzes || []).filter((q) => {
    if (!q?.subject || typeof q.subject !== "string") return false;
    return mapQuizSubjectToDimensions(q.subject).length > 0;
  });
  const relevantQuizCount = relevantQuizzes.length;

  // ── Mock pressure signal extraction ─────────────────────────────
  const mockPressureScores = [];
  for (const interview of interviews || []) {
    const score = extractMockPressureScore(interview?.scores);
    if (score !== null) mockPressureScores.push(score);
  }
  const mocksWithScores = mockPressureScores.length;

  // ── Source presence ────────────────────────────────────────────
  const sources = {
    stable: mocksWithScores >= MIN_STABLE_N,
    live: mocksWithScores >= MIN_LIVE_N,
    quiz: relevantQuizCount >= MIN_QUIZ_N_RELEVANT,
  };

  // ── Ceiling: highest source-quality tier present ───────────────
  const ceiling = sources.stable
    ? CEILING_STABLE
    : sources.live
      ? CEILING_LIVE
      : sources.quiz
        ? CEILING_QUIZ
        : CEILING_NONE;

  const sourceQuality = sources.stable
    ? "stable-mocks"
    : sources.live && sources.quiz
      ? "live-and-quiz"
      : sources.live
        ? "live-only"
        : sources.quiz
          ? "quiz-proxy"
          : "inactive";

  // Inactive-dim early return.
  if (ceiling === null) {
    return {
      sources,
      mocksWithScores,
      relevantQuizCount,
      totalQuizzesSeen,
      ceiling: null,
      score: null,
      ci: null,
      sourceQuality,
      basis: [
        `mocks_with_scores: ${mocksWithScores}`,
        `relevant_quizzes: ${relevantQuizCount}`,
        `total_quizzes_seen: ${totalQuizzesSeen}`,
        "source_quality: inactive",
      ],
    };
  }

  // ── Per-source means on 0-100 scale ────────────────────────────
  const liveMockMean = sources.live
    ? mockPressureScores.reduce((a, b) => a + b, 0) / mockPressureScores.length
    : null;
  const quizMean = sources.quiz ? difficultyWeightedMean(relevantQuizzes) : null;

  // ── Re-normalize weights across present sources ────────────────
  let totalW = 0;
  let weightedSum = 0;
  if (sources.live || sources.stable) {
    totalW += WEIGHT_MOCK;
    weightedSum += liveMockMean * WEIGHT_MOCK;
  }
  if (sources.quiz) {
    totalW += WEIGHT_QUIZ;
    weightedSum += quizMean * WEIGHT_QUIZ;
  }
  const rawBlend = weightedSum / totalW;

  const score = Math.min(Math.round(rawBlend), ceiling);

  // ── CI: half-width from RAW distribution (preserve variance),
  //    recentered at score, clamped at ceiling on upper side only.
  //    Same asymmetric pattern that fixed D3's score-outside-CI bug.
  const allRawValues = [
    ...mockPressureScores,
    ...relevantQuizzes.map((q) => (typeof q.score === "number" ? q.score : 0)),
  ];
  const rawCi = meanCI(allRawValues);
  let ci;
  if (rawCi === null) {
    ci = [score, score];
  } else {
    const halfWidth = (rawCi.ci[1] - rawCi.ci[0]) / 2;
    ci = [
      Math.max(0, Math.round(score - halfWidth)),
      Math.min(ceiling, Math.round(score + halfWidth)),
    ];
  }

  const basis = [
    `mocks_with_scores: ${mocksWithScores}`,
    `relevant_quizzes: ${relevantQuizCount}`,
    `total_quizzes_seen: ${totalQuizzesSeen}`,
    `source_quality: ${sourceQuality}`,
    `ceiling: ${ceiling}`,
  ];

  return {
    sources,
    mocksWithScores,
    relevantQuizCount,
    totalQuizzesSeen,
    ceiling,
    score,
    ci,
    sourceQuality,
    basis,
  };
}

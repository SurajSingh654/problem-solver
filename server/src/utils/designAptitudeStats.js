// ============================================================================
// Design Aptitude — D8 computation
// ============================================================================
//
// New dim covering System Design + Low-Level Design practice via the
// DesignSession schema. The schema is fully built (10-dim AI evaluation
// per designType, scenario validation, INTERVIEW-mode pairing) but until
// now contributed nothing to the readiness report — a user could complete
// 50 design sessions and the 6D Intelligence Report would not change.
//
// D8 closes that gap with the same architecture pattern proven by D3/D5/D7:
// source-tier ceiling × research-backed sub-component blend × asymmetric
// CI clamp × opt-in (only counted when user has ≥1 completed session, like
// D7 Teaching).
//
// Source tiers:
//   - draft-only         (ceiling 30): completed ≥1 session, no AI scenarios
//                                       attempted. Scenarios are how design
//                                       practice gets pressure-tested; without
//                                       them the score is purely self-report.
//   - scenario-tested    (ceiling 70): ≥3 evaluated scenarios across all
//                                       completed sessions. Schoenfeld 1985:
//                                       design competency is established
//                                       through "scenario interrogation",
//                                       not just artifact production.
//   - interviewer-paired (ceiling 100): ≥1 INTERVIEW-mode session with a
//                                        paired completed InterviewSession.
//                                        Real-time interviewer pressure is
//                                        the strongest signal we have.
//
// Sub-components (weights re-normalize across what's present, then clamp
// at the ceiling):
//
//   0.50 × overallScore × 10                 — existing AI-rated 10-dim
//                                              weighted overall (0-10 → 0-100).
//   0.20 × scenarioResilience                 — PASS=100, PARTIAL=50, FAIL=0
//                                              averaged across evaluated.
//                                              Schoenfeld 1985 stress-test.
//   0.15 × dimensionBreadth                   — penalize lopsided scores.
//                                              std-dev of the 10 dimensions
//                                              → 100 - min(100, stddev*20).
//                                              Sweller 1988: balanced schemas
//                                              free working memory more than
//                                              one peaked one.
//   0.10 × phaseCompleteness                  — fraction of phases meeting
//                                              the 50-char threshold.
//   0.05 × interviewerSignal                  — INTERVIEW-mode debrief
//                                              presence × strength.
//
// CI computation (asymmetric clamp pattern):
//   - Compute half-width from per-session overallScore distribution
//     (0-100 scale — multiply 0-10 scores by 10).
//   - Recenter at the capped score.
//   - Clamp [0, ceiling] on the upper side only.
//
// Research:
//   Schoenfeld (1985) "Mathematical Problem Solving" — explicit scenario
//     interrogation differentiates expert design from artifact-production.
//   Sweller (1988) Cognitive Load Theory — balanced schema breadth across
//     domains frees working memory.
//   Newell & Simon (1972) "Human Problem Solving" — designers progress
//     through fluency stages; repeated practice across problem types is
//     the precondition for transferable skill.
//   Anderson & Shackleton (1990) — interviewer-rating stability emerges
//     after repeated exposure (used here as the source-tier upper bound).
// ============================================================================

import { meanCI } from "./dimensionStats.js";

// Source-tier ceilings — mirror D3/D5/D7.
export const DRAFT_ONLY_CEILING = 30;
export const SCENARIO_TESTED_CEILING = 70;
export const INTERVIEWER_PAIRED_CEILING = 100;

// Source-tier thresholds — Schoenfeld 1985 / Anderson-Shackleton 1990.
export const SCENARIO_TESTED_MIN_SCENARIOS = 3;
export const INTERVIEWER_PAIRED_MIN_INTERVIEW_SESSIONS = 1;

// Sub-component weights — sum to 1.0 across all present sources.
const W_OVERALL = 0.50;
const W_SCENARIO_RESILIENCE = 0.20;
const W_DIMENSION_BREADTH = 0.15;
const W_PHASE_COMPLETENESS = 0.10;
const W_INTERVIEWER_SIGNAL = 0.05;

// Phase content threshold — phases with <50 chars don't count as filled.
const PHASE_MIN_CHARS = 50;

// std-dev → breadth conversion. stddev * 20 → 100 ceiling. A user with
// all dims at 7 and one at 3 has stddev ~ 1.2, breadth = 100 - 24 = 76.
// All dims at 7 (uniform) → stddev 0, breadth 100.
const STDDEV_BREADTH_MULTIPLIER = 20;

// Scenario verdict → numeric.
const SCENARIO_VERDICT_TO_SCORE = Object.freeze({
  PASS: 100,
  PARTIAL: 50,
  FAIL: 0,
});

/**
 * Decide the source-quality tier from session + scenario + interview-mode counts.
 */
export function classifySourceQuality({
  sessionCount,
  evaluatedScenarioCount,
  interviewerPairedCount,
}) {
  if (interviewerPairedCount >= INTERVIEWER_PAIRED_MIN_INTERVIEW_SESSIONS) {
    return "interviewer-paired";
  }
  if (evaluatedScenarioCount >= SCENARIO_TESTED_MIN_SCENARIOS) {
    return "scenario-tested";
  }
  // sessionCount >= 1 by activation gate; below scenario-tested floor.
  if (sessionCount >= 1) return "draft-only";
  return "draft-only";
}

/**
 * Map a source-quality tier to its score ceiling.
 */
export function ceilingForSourceQuality(tier) {
  if (tier === "interviewer-paired") return INTERVIEWER_PAIRED_CEILING;
  if (tier === "scenario-tested") return SCENARIO_TESTED_CEILING;
  return DRAFT_ONLY_CEILING;
}

/**
 * Pull the dimension scores object out of an evaluation blob, regardless
 * of designType. Both SD and LLD use the same `dimensions` key shape.
 */
function dimensionScores(evaluation) {
  if (!evaluation || typeof evaluation !== "object") return null;
  const dims = evaluation.dimensions;
  if (!dims || typeof dims !== "object") return null;
  return dims;
}

/**
 * Compute std-dev across an array of numbers. Returns 0 for empty/single arrays.
 */
function stddev(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Count phases with content meeting the 50-char threshold.
 */
function countFilledPhases(phases) {
  if (!phases || typeof phases !== "object") return { filled: 0, total: 0 };
  const entries = Object.entries(phases);
  const filled = entries.filter(([, v]) =>
    typeof v === "string" && v.trim().length >= PHASE_MIN_CHARS,
  ).length;
  return { filled, total: entries.length };
}

/**
 * Compute D8 stats for a user's completed design sessions.
 *
 * @param {object} input
 * @param {Array<{
 *   id: string,
 *   designType: "SYSTEM_DESIGN" | "LOW_LEVEL_DESIGN",
 *   mode: "SELF_PACED" | "INTERVIEW",
 *   evaluation: object | null,
 *   phases: object | null,
 *   scenarios: Array<{ status: string, aiVerdict: { verdict: string } }> | null,
 *   interviewSessions: Array<{ status: string, debrief: object | null }>,
 * }>} input.sessions  Completed design sessions with evaluation joined.
 * @returns {{
 *   active: boolean,
 *   sessionCount: number,
 *   sdSessionCount: number,
 *   lldSessionCount: number,
 *   evaluatedScenarioCount: number,
 *   scenarioPassRate: number,
 *   interviewerPairedCount: number,
 *   avgOverallScore: number,           // 0-100 scale (overallScore * 10)
 *   avgDimensionBreadth: number,       // 0-100 (computed from std-dev)
 *   avgPhaseCompleteness: number,      // 0-100
 *   sourceQuality: "draft-only" | "scenario-tested" | "interviewer-paired",
 *   ceiling: number,
 *   score: number | null,
 *   ci: [number, number] | null,
 *   basis: string[],
 * }}
 */
export function computeDesignAptitudeStats({ sessions }) {
  const all = Array.isArray(sessions) ? sessions : [];
  // Activation: ≥1 COMPLETED session with non-null evaluation.
  const valid = all.filter((s) => s?.evaluation && s.evaluation.dimensions);
  const sessionCount = valid.length;

  if (sessionCount === 0) {
    return {
      active: false,
      sessionCount: 0,
      sdSessionCount: 0,
      lldSessionCount: 0,
      evaluatedScenarioCount: 0,
      scenarioPassRate: 0,
      interviewerPairedCount: 0,
      avgOverallScore: 0,
      avgDimensionBreadth: 0,
      avgPhaseCompleteness: 0,
      sourceQuality: "draft-only",
      ceiling: DRAFT_ONLY_CEILING,
      score: null,
      ci: null,
      basis: ["sessions: 0"],
    };
  }

  const sdSessionCount = valid.filter((s) => s.designType === "SYSTEM_DESIGN").length;
  const lldSessionCount = valid.filter((s) => s.designType === "LOW_LEVEL_DESIGN").length;

  // ── Overall score (per-session 0-10 → 0-100), avg across sessions ──
  const overallScores100 = valid
    .map((s) => {
      const o = s.evaluation?.overallScore;
      return typeof o === "number" ? o * 10 : null;
    })
    .filter((v) => v !== null);
  const avgOverallScore = overallScores100.length === 0
    ? 0
    : overallScores100.reduce((a, b) => a + b, 0) / overallScores100.length;

  // ── Scenario resilience ──
  const allScenarios = valid.flatMap((s) =>
    Array.isArray(s.scenarios) ? s.scenarios : [],
  );
  const evaluatedScenarios = allScenarios.filter((sc) => sc?.status === "evaluated");
  const evaluatedScenarioCount = evaluatedScenarios.length;
  const scenarioVerdictScores = evaluatedScenarios
    .map((sc) => SCENARIO_VERDICT_TO_SCORE[sc?.aiVerdict?.verdict])
    .filter((v) => typeof v === "number");
  const scenarioResilience = scenarioVerdictScores.length === 0
    ? 0
    : scenarioVerdictScores.reduce((a, b) => a + b, 0) / scenarioVerdictScores.length;
  // PASS rate as a separate diagnostic (not part of score, surfaced in basis).
  const scenarioPassCount = evaluatedScenarios.filter(
    (sc) => sc?.aiVerdict?.verdict === "PASS",
  ).length;
  const scenarioPassRate = evaluatedScenarioCount === 0
    ? 0
    : scenarioPassCount / evaluatedScenarioCount;

  // ── Dimension breadth (low std-dev across the 10 dims = balanced) ──
  const breadthValues = valid
    .map((s) => {
      const dims = dimensionScores(s.evaluation);
      if (!dims) return null;
      const vals = Object.values(dims).filter((v) => typeof v === "number");
      if (vals.length < 2) return null;
      const sd = stddev(vals);
      return Math.max(0, 100 - Math.min(100, sd * STDDEV_BREADTH_MULTIPLIER));
    })
    .filter((v) => v !== null);
  const avgDimensionBreadth = breadthValues.length === 0
    ? 0
    : breadthValues.reduce((a, b) => a + b, 0) / breadthValues.length;

  // ── Phase completeness (fraction with ≥50 chars) ──
  const completenessValues = valid.map((s) => {
    const { filled, total } = countFilledPhases(s.phases);
    return total === 0 ? 0 : (filled / total) * 100;
  });
  const avgPhaseCompleteness = completenessValues.length === 0
    ? 0
    : completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length;

  // ── Interviewer signal: count INTERVIEW-mode sessions with paired
  // completed interview sessions that have non-null debrief. ──
  const interviewerPairedSessions = valid.filter((s) => {
    if (s.mode !== "INTERVIEW") return false;
    const ivs = Array.isArray(s.interviewSessions) ? s.interviewSessions : [];
    return ivs.some((iv) => iv?.debrief);
  });
  const interviewerPairedCount = interviewerPairedSessions.length;
  // Interviewer signal value: 100 when present, 0 when absent. Weighted at 5%.
  const interviewerSignal = interviewerPairedCount > 0 ? 100 : 0;

  // ── Source-tier classification ──
  const sourceQuality = classifySourceQuality({
    sessionCount,
    evaluatedScenarioCount,
    interviewerPairedCount,
  });
  const ceiling = ceilingForSourceQuality(sourceQuality);

  // ── Sub-component blend ──
  const components = [
    { value: avgOverallScore, weight: W_OVERALL, present: true },
    {
      value: scenarioResilience,
      weight: W_SCENARIO_RESILIENCE,
      present: evaluatedScenarioCount > 0,
    },
    {
      value: avgDimensionBreadth,
      weight: W_DIMENSION_BREADTH,
      present: breadthValues.length > 0,
    },
    {
      value: avgPhaseCompleteness,
      weight: W_PHASE_COMPLETENESS,
      present: completenessValues.length > 0,
    },
    {
      value: interviewerSignal,
      weight: W_INTERVIEWER_SIGNAL,
      present: interviewerPairedCount > 0,
    },
  ];
  const presentComponents = components.filter((c) => c.present);
  const totalWeight = presentComponents.reduce((a, c) => a + c.weight, 0);
  const baseScore = totalWeight === 0
    ? 0
    : presentComponents.reduce((a, c) => a + c.value * c.weight, 0) / totalWeight;

  // ── Ceiling clamp ──
  const score = Math.round(Math.min(baseScore, ceiling));

  // ── Asymmetric CI clamp (D1/D3/D5/D6/D7 pattern) ──
  let ci = null;
  if (overallScores100.length >= 2) {
    const raw = meanCI(overallScores100);
    if (raw) {
      const halfWidth = (raw.ci[1] - raw.ci[0]) / 2;
      ci = [
        Math.max(0, Math.round(score - halfWidth)),
        Math.min(ceiling, Math.round(score + halfWidth)),
      ];
    }
  } else if (overallScores100.length === 1) {
    ci = [
      Math.max(0, score - 30),
      Math.min(ceiling, score + 30),
    ];
  }

  const basis = [
    `sessions: ${sessionCount}`,
    `system_design: ${sdSessionCount}`,
    `low_level_design: ${lldSessionCount}`,
    `evaluated_scenarios: ${evaluatedScenarioCount}`,
    ...(evaluatedScenarioCount > 0
      ? [`scenario_pass_rate: ${scenarioPassRate.toFixed(2)}`]
      : []),
    `avg_overall_score: ${(avgOverallScore / 10).toFixed(1)}/10`,
    `dim_breadth: ${Math.round(avgDimensionBreadth)}/100`,
    `phase_completeness: ${Math.round(avgPhaseCompleteness)}/100`,
    `source_quality: ${sourceQuality}`,
    `ceiling: ${ceiling}`,
    ...(interviewerPairedCount > 0
      ? [`interviewer_paired: ${interviewerPairedCount}`]
      : []),
  ];

  return {
    active: true,
    sessionCount,
    sdSessionCount,
    lldSessionCount,
    evaluatedScenarioCount,
    scenarioPassRate,
    interviewerPairedCount,
    avgOverallScore,
    avgDimensionBreadth,
    avgPhaseCompleteness,
    sourceQuality,
    ceiling,
    score,
    ci,
    basis,
  };
}

// Exported for tests.
export {
  W_OVERALL,
  W_SCENARIO_RESILIENCE,
  W_DIMENSION_BREADTH,
  W_PHASE_COMPLETENESS,
  W_INTERVIEWER_SIGNAL,
  PHASE_MIN_CHARS,
  STDDEV_BREADTH_MULTIPLIER,
  SCENARIO_VERDICT_TO_SCORE,
};

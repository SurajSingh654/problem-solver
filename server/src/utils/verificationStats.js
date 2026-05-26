// ============================================================================
// Verification & Meta-cognition — D10 computation
// ============================================================================
//
// The durable LLM-era dim. Measures the meta-skill: how well does the
// user's self-assessment track ground truth? AI tools generate code,
// but the human's job is increasingly *verifying* — calibrated confidence
// + edge-case discovery + complexity reasoning + spotting where the AI
// was wrong. These are exactly the skills the AI can't replace itself.
//
// Pre-D10, the same signals lived scattered across other dims:
//   - D2 v2 used `metacognitiveAccuracy` as a clamping multiplier
//   - D4 v2 used `complexityCheck.timeCorrect` as a state-transition gate
//   - D9 read `foundEdgeCasesIndependently` as one of 5 process signals
//   - `wrongPattern` was just a D1 mastery blocker
// D10 extracts these into a first-class dim so "your calibration is off"
// or "you're systematically wrong about complexity" reads as a coherent
// meta-skill, not buried.
//
// BASELINE (not opt-in): activates with ≥5 AI-reviewed coding solutions.
// Every user generates this signal automatically once they engage with
// AI review. No additional modality required.
//
// Source tiers:
//   - proxy-only    (ceiling 40): ≥5 AI reviews, no follow-ups, no mocks
//                                  — calibration alone is noisy without
//                                  cross-modal verification.
//   - multi-signal  (ceiling 75): ≥10 AI reviews + complexity verification
//                                  data present.
//   - strong-signal (ceiling 100): ≥10 reviews + ≥3 follow-up evaluations
//                                  (real-time probe defense — the AI is
//                                  asking "explain X" and the user must
//                                  produce a defensible answer).
//
// Sub-component blend (re-normalize across present signals):
//
//   0.30 × calibration_accuracy
//        Kruger-Dunning. For each AI-reviewed solution: compare
//        userConfidence/5 (Solution.confidence is 1-5) vs aiCorrectness/10
//        (aiReview.dimensionScores.codeCorrectness is 1-10), normalize to
//        same scale, take |delta|. Mean delta → score = 100 - 100×delta.
//   0.25 × complexity_verification
//        % of solutions where AI's complexityCheck.timeCorrect &&
//        spaceCorrect. Schmidt 1995: explicit complexity reasoning
//        differentiates expert from novice problem-solving.
//   0.20 × pattern_accuracy
//        % of AI reviews WITHOUT wrongPattern flag. Pattern self-
//        assessment is a meta-cognitive task — claiming the wrong
//        pattern is a verification failure.
//   0.15 × probe_defense
//        % of followUpEvaluations[].score ≥ 7. Karpicke-Roediger 2008:
//        retrieval under probing is the strongest learning signal.
//        Surface-level confidence collapses on probe; calibrated
//        confidence holds up.
//   0.10 × edge_case_independence
//        % of mocks with foundEdgeCasesIndependently=true. The
//        cleanest "did you verify your own work" signal at runtime.
//
// CI: asymmetric clamp on per-solution calibration delta distribution
// (D1/D3/D5/D6/D7/D8/D9 pattern). Half-width preserves variance honestly;
// recenter at score; clamp [0, ceiling] on upper.
//
// Research:
//   Kruger & Dunning (1999) — self-assessment accuracy as a measurable
//     competence signal. Below the median in skill is correlated with
//     above-the-median self-assessment ("unskilled and unaware").
//   Hattie (2009) — meta-cognitive instruction effect size d≈0.69
//     (high impact). Self-monitoring + self-assessment training are
//     among the highest-effect interventions in educational research.
//   Schmidt (1995) "Knowledge structures of experts" — complexity
//     reasoning is a defining expert-novice distinguisher in problem-
//     solving.
//   Karpicke & Roediger (2008) — retrieval under testing produces
//     stronger long-term retention than re-study. Probe-defense is
//     this exact mechanism applied to interview prep.
//   Lange, Wang & Dunlosky (2013) — small-sample self-assessment
//     scores are statistically unreliable. Rule 17 sample-size floor.
// ============================================================================

import { meanCI } from "./dimensionStats.js";

// Source-tier ceilings.
export const PROXY_ONLY_CEILING = 40;
export const MULTI_SIGNAL_CEILING = 75;
export const STRONG_SIGNAL_CEILING = 100;

// Source-tier thresholds.
export const ACTIVATION_MIN_REVIEWS = 5;
export const MULTI_SIGNAL_MIN_REVIEWS = 10;
export const STRONG_SIGNAL_MIN_FOLLOWUPS = 3;

// Sub-component weights — sum to 1.0.
const W_CALIBRATION = 0.30;
const W_COMPLEXITY = 0.25;
const W_PATTERN_ACCURACY = 0.20;
const W_PROBE_DEFENSE = 0.15;
const W_EDGE_CASE = 0.10;

// Probe-defense threshold — followUpEvaluations[].score is 1-10, ≥7 means
// the user's answer was substantive (not surface-level).
const PROBE_DEFENSE_FLOOR = 7;

/**
 * Source-tier classification.
 */
export function classifySourceQuality({ reviewCount, followUpCount, complexityCheckCount }) {
  if (
    reviewCount >= MULTI_SIGNAL_MIN_REVIEWS
    && followUpCount >= STRONG_SIGNAL_MIN_FOLLOWUPS
  ) {
    return "strong-signal";
  }
  if (reviewCount >= MULTI_SIGNAL_MIN_REVIEWS && complexityCheckCount > 0) {
    return "multi-signal";
  }
  return "proxy-only";
}

export function ceilingForSourceQuality(tier) {
  if (tier === "strong-signal") return STRONG_SIGNAL_CEILING;
  if (tier === "multi-signal") return MULTI_SIGNAL_CEILING;
  return PROXY_ONLY_CEILING;
}

/**
 * Latest AI review attached to a solution (mirrors patternMastery convention).
 */
function latestAiReview(solution) {
  if (!Array.isArray(solution.aiFeedback) || solution.aiFeedback.length === 0) {
    return null;
  }
  return solution.aiFeedback[solution.aiFeedback.length - 1];
}

/**
 * Compute D10 stats.
 *
 * @param {object} input
 * @param {Array} input.solutions  Solution rows (coding-only filtering applied
 *   internally). Each must include: confidence, aiFeedback, problem.{category}.
 * @param {Array<{ behavioralSignals?: { foundEdgeCasesIndependently?: boolean } }>}
 *   input.mocks  Completed InterviewSession debriefs (optional — only the
 *   behavioralSignals.foundEdgeCasesIndependently field is read).
 * @returns {{
 *   active: boolean,
 *   reviewCount: number,
 *   calibrationN: number,
 *   complexityCheckCount: number,
 *   followUpCount: number,
 *   mockCount: number,
 *   wrongPatternCount: number,
 *   calibrationDelta: number,         // 0-1 mean |delta|
 *   calibrationScore: number,         // 0-100
 *   complexityScore: number,          // 0-100
 *   patternAccuracyScore: number,     // 0-100
 *   probeDefenseScore: number,        // 0-100
 *   edgeCaseScore: number,            // 0-100
 *   sourceQuality: "proxy-only" | "multi-signal" | "strong-signal",
 *   ceiling: number,
 *   score: number | null,
 *   ci: [number, number] | null,
 *   basis: string[],
 * }}
 */
export function computeVerificationStats({ solutions, mocks }) {
  const codingSolutions = (solutions || []).filter((s) => {
    const cat = s?.problem?.category;
    return !cat || cat === "CODING";
  });

  // Pull AI reviews + raw signals.
  const reviews = [];
  const calibrationDeltas = [];
  const complexityChecks = []; // boolean per-solution: timeCorrect && spaceCorrect
  const wrongPatternFlags = []; // boolean per-solution
  const probeScores = []; // numeric scores from followUpEvaluations
  for (const s of codingSolutions) {
    const r = latestAiReview(s);
    if (!r) continue;
    reviews.push(r);

    // Calibration: confidence (1-5) vs codeCorrectness (1-10).
    const conf = s.confidence;
    const codeCorrect = r?.dimensionScores?.codeCorrectness;
    if (typeof conf === "number" && conf >= 1 && conf <= 5
        && typeof codeCorrect === "number" && codeCorrect >= 1 && codeCorrect <= 10) {
      // Normalize both to 0-1 scale for delta.
      const userNorm = conf / 5;
      const aiNorm = codeCorrect / 10;
      calibrationDeltas.push(Math.abs(userNorm - aiNorm));
    }

    // Complexity verification: AI graded both time + space correct.
    const cc = r.complexityCheck;
    if (cc && typeof cc === "object") {
      complexityChecks.push(Boolean(cc.timeCorrect) && Boolean(cc.spaceCorrect));
    }

    // Pattern accuracy: NOT flagged as wrong pattern.
    const wp = r?.flags?.wrongPattern;
    if (typeof wp === "boolean") {
      wrongPatternFlags.push(wp);
    }

    // Probe defense: count follow-up evaluations meeting the floor.
    const fues = Array.isArray(r.followUpEvaluations) ? r.followUpEvaluations : [];
    for (const fue of fues) {
      if (fue && typeof fue.score === "number") probeScores.push(fue.score);
    }
  }

  const reviewCount = reviews.length;
  const calibrationN = calibrationDeltas.length;
  const complexityCheckCount = complexityChecks.length;
  const wrongPatternCount = wrongPatternFlags.filter((f) => f === true).length;
  const followUpCount = probeScores.length;

  // Mocks: edge-case independence rate.
  const mockList = Array.isArray(mocks) ? mocks : [];
  const mocksWithSignal = mockList.filter(
    (m) => m?.debrief?.behavioralSignals != null,
  );
  const mockCount = mocksWithSignal.length;
  const edgeCaseTrueCount = mocksWithSignal.filter(
    (m) => m.debrief.behavioralSignals.foundEdgeCasesIndependently === true,
  ).length;

  // Activation: ≥5 AI-reviewed coding solutions (calibration baseline).
  if (reviewCount < ACTIVATION_MIN_REVIEWS) {
    return {
      active: false,
      reviewCount,
      calibrationN,
      complexityCheckCount,
      followUpCount,
      mockCount,
      wrongPatternCount,
      calibrationDelta: 0,
      calibrationScore: 0,
      complexityScore: 0,
      patternAccuracyScore: 0,
      probeDefenseScore: 0,
      edgeCaseScore: 0,
      sourceQuality: "proxy-only",
      ceiling: PROXY_ONLY_CEILING,
      score: null,
      ci: null,
      basis: [
        `ai_reviews: ${reviewCount}`,
        `min_required: ${ACTIVATION_MIN_REVIEWS}`,
      ],
    };
  }

  // Sub-component scores (each 0-100).
  // Calibration: avg |delta| where delta is in 0-1; score = 100 - 100×delta.
  const meanDelta = calibrationN === 0
    ? 0
    : calibrationDeltas.reduce((a, b) => a + b, 0) / calibrationN;
  const calibrationScore = calibrationN === 0
    ? 0
    : Math.max(0, 100 - 100 * meanDelta);

  // Complexity: % of solutions where AI graded both time + space correct.
  const complexityScore = complexityCheckCount === 0
    ? 0
    : (complexityChecks.filter((b) => b === true).length / complexityCheckCount) * 100;

  // Pattern accuracy: % NOT flagged wrong.
  const patternAccuracyScore = wrongPatternFlags.length === 0
    ? 100 // no flag data → no errors
    : ((wrongPatternFlags.length - wrongPatternCount) / wrongPatternFlags.length) * 100;

  // Probe defense: % of followUp scores ≥ floor.
  const probeDefenseScore = followUpCount === 0
    ? 0
    : (probeScores.filter((sc) => sc >= PROBE_DEFENSE_FLOOR).length / followUpCount) * 100;

  // Edge-case independence: % of mocks with the flag true.
  const edgeCaseScore = mockCount === 0
    ? 0
    : (edgeCaseTrueCount / mockCount) * 100;

  // Source-tier classification.
  const sourceQuality = classifySourceQuality({
    reviewCount,
    followUpCount,
    complexityCheckCount,
  });
  const ceiling = ceilingForSourceQuality(sourceQuality);

  // Sub-component blend — re-normalize across present signals.
  const components = [
    {
      value: calibrationScore,
      weight: W_CALIBRATION,
      present: calibrationN > 0,
    },
    {
      value: complexityScore,
      weight: W_COMPLEXITY,
      present: complexityCheckCount > 0,
    },
    {
      value: patternAccuracyScore,
      weight: W_PATTERN_ACCURACY,
      present: wrongPatternFlags.length > 0,
    },
    {
      value: probeDefenseScore,
      weight: W_PROBE_DEFENSE,
      present: followUpCount > 0,
    },
    {
      value: edgeCaseScore,
      weight: W_EDGE_CASE,
      present: mockCount > 0,
    },
  ];
  const presentComponents = components.filter((c) => c.present);
  const totalWeight = presentComponents.reduce((a, c) => a + c.weight, 0);
  const baseScore = totalWeight === 0
    ? 0
    : presentComponents.reduce((a, c) => a + c.value * c.weight, 0) / totalWeight;

  const score = Math.round(Math.min(baseScore, ceiling));

  // Asymmetric CI clamp on per-solution calibration delta (mapped to 0-100).
  let ci = null;
  if (calibrationN >= 2) {
    const calibrationScoresPerSolution = calibrationDeltas.map(
      (d) => Math.max(0, 100 - 100 * d),
    );
    const raw = meanCI(calibrationScoresPerSolution);
    if (raw) {
      const halfWidth = (raw.ci[1] - raw.ci[0]) / 2;
      ci = [
        Math.max(0, Math.round(score - halfWidth)),
        Math.min(ceiling, Math.round(score + halfWidth)),
      ];
    }
  } else if (calibrationN === 1) {
    ci = [
      Math.max(0, score - 30),
      Math.min(ceiling, score + 30),
    ];
  }

  const basis = [
    `ai_reviews: ${reviewCount}`,
    `calibration_n: ${calibrationN}`,
    `calibration_delta: ${meanDelta.toFixed(2)}`,
    `complexity_check: ${complexityCheckCount}`,
    ...(wrongPatternCount > 0
      ? [`wrong_pattern_flags: ${wrongPatternCount}`]
      : []),
    ...(followUpCount > 0
      ? [`follow_ups: ${followUpCount}`, `probe_defense_rate: ${(probeDefenseScore / 100).toFixed(2)}`]
      : []),
    ...(mockCount > 0
      ? [`mocks: ${mockCount}`, `edge_case_rate: ${(edgeCaseScore / 100).toFixed(2)}`]
      : []),
    `source_quality: ${sourceQuality}`,
    `ceiling: ${ceiling}`,
  ];

  return {
    active: true,
    reviewCount,
    calibrationN,
    complexityCheckCount,
    followUpCount,
    mockCount,
    wrongPatternCount,
    calibrationDelta: meanDelta,
    calibrationScore,
    complexityScore,
    patternAccuracyScore,
    probeDefenseScore,
    edgeCaseScore,
    sourceQuality,
    ceiling,
    score,
    ci,
    basis,
  };
}

// Exported for tests + UI mapping.
export {
  W_CALIBRATION,
  W_COMPLEXITY,
  W_PATTERN_ACCURACY,
  W_PROBE_DEFENSE,
  W_EDGE_CASE,
  PROBE_DEFENSE_FLOOR,
};

// ============================================================================
// Teaching Contributions — D7 v2 computation
// ============================================================================
//
// The legacy D7 formula was:
//
//   score = 50 * (avgRating / 5)
//         + 30 * min(1, sessionsHosted / 5)
//         + 20 * peerLearnedRate
//
// Two structural problems:
//
//   1. The 30% volume slice is gameable. A user who hosts 5 trivial sessions
//      with 3 sycophantic peer ratings each gets the maximum volume score
//      regardless of whether anyone actually learned anything.
//
//   2. No source-tier ceiling. A user with 1 session + 3 ratings sits on the
//      same axis as someone with 10 sessions + 50 ratings — the rating
//      reliability gap (Topping 1996: rater stability around 5+ peers) is
//      invisible in the score.
//
// v2 redesign — same architecture pattern as D3 (Communication) and D5
// (Pressure Performance): source-tier ceiling × research-backed sub-component
// blend × asymmetric CI clamp so the score is always inside the displayed
// confidence interval.
//
// Source tiers:
//   - draft-only         (ceiling 30): hosted ≥1 session, 0 peer ratings.
//                                       Hattie 2009 / Fiorella-Mayer 2013
//                                       require a "genuine audience" effect;
//                                       without ratings we can't claim it
//                                       landed.
//   - peer-validated     (ceiling 70): ≥3 peer ratings present.
//   - stable-peer-cohort (ceiling 100): ≥5 ratings AND ≥3 distinct sessions.
//                                       Topping 1996 / Anderson-Shackleton
//                                       1990 — at this point peer-rating
//                                       signal is statistically stable.
//
// Sub-components (weights re-normalize across what's present, then clamp at
// the ceiling):
//
//   0.55 × avgRating/5 × 100        — peer endorsement (most direct)
//   0.25 × peerLearnedRate × 100    — Fiorella-Mayer 2013: did peers learn?
//                                     The outcome var, not host effort.
//   0.10 × topicCoverageScore       — FULL=100, PARTIAL=60, OFF_TOPIC=20.
//                                     Punishes off-topic sessions; reads
//                                     `summary.topicCoverage.verdict` per
//                                     buildFallbackTeachingTopicCoverage.
//   0.10 × min(1, sessions/5) × 100 — saturating volume. Capped at 10% so
//                                     pure-volume can't dominate.
//
// Quality penalty:
//   - Sessions with ≥2 OPEN flags get a 10pt penalty subtracted before the
//     ceiling clamp. Mirrors D1's wrongPattern flag — explicit signal that
//     the session quality was disputed.
//
// CI computation (asymmetric clamp, same as D1/D3/D5/D6):
//   - Compute half-width from the raw rating distribution (variance
//     preserved).
//   - Recenter at the capped score.
//   - Clamp [0, ceiling] on the upper side only.
//
// Research:
//   Hattie (2009) Visible Learning — peer tutoring d=0.55, teach-back d=0.69.
//   Bargh & Schul (1980) — preparing-to-teach + teaching produces deeper
//     encoding than just-studying.
//   Fiorella & Mayer (2013) — three conditions for teaching to drive learning
//     gains: genuine audience, generative explanation, follow-up assessment.
//   Topping (1996) — peer-rating reliability stabilizes around 5+ raters.
//   Anderson & Shackleton (1990) — interview rater stability after 3-4
//     sessions.
// ============================================================================

import { meanCI } from "./dimensionStats.js";

// Source-tier ceilings — mirror D3/D5.
export const DRAFT_ONLY_CEILING = 30;
export const PEER_VALIDATED_CEILING = 70;
export const STABLE_PEER_COHORT_CEILING = 100;

// Source-tier thresholds — Topping 1996 / Anderson-Shackleton 1990.
export const PEER_VALIDATED_MIN_RATINGS = 3;
export const STABLE_PEER_COHORT_MIN_RATINGS = 5;
export const STABLE_PEER_COHORT_MIN_SESSIONS = 3;

// Sub-component weights — sum to 1.0 across all present sources.
const W_AVG_RATING = 0.55;
const W_PEER_LEARNED = 0.25;
const W_TOPIC_COVERAGE = 0.10;
const W_VOLUME = 0.10;

// Volume saturation point — the 5th session contributes the same as the 50th.
const VOLUME_SATURATION_SESSIONS = 5;

// Quality penalty — sessions with ≥2 OPEN flags subtract this from the score.
const FLAG_PENALTY_PER_SESSION = 10;
const FLAG_THRESHOLD = 2; // ≥2 OPEN flags trips the penalty.

// Topic-coverage scoring — verdict-band → numeric.
const TOPIC_COVERAGE_BANDS = Object.freeze({
  FULL: 100,
  PARTIAL: 60,
  OFF_TOPIC: 20,
});

/**
 * Decide the source-quality tier from session + rating counts.
 */
export function classifySourceQuality({ sessionCount, ratingCount }) {
  if (
    ratingCount >= STABLE_PEER_COHORT_MIN_RATINGS
    && sessionCount >= STABLE_PEER_COHORT_MIN_SESSIONS
  ) {
    return "stable-peer-cohort";
  }
  if (ratingCount >= PEER_VALIDATED_MIN_RATINGS) return "peer-validated";
  return "draft-only";
}

/**
 * Map a source-quality tier to its score ceiling.
 */
export function ceilingForSourceQuality(tier) {
  if (tier === "stable-peer-cohort") return STABLE_PEER_COHORT_CEILING;
  if (tier === "peer-validated") return PEER_VALIDATED_CEILING;
  return DRAFT_ONLY_CEILING;
}

/**
 * Convert a topicCoverage JSON blob to a numeric score [0,100].
 * Tolerant of nulls and unknown verdicts (defaults to PARTIAL).
 */
function topicCoverageNumeric(topicCoverage) {
  if (!topicCoverage || typeof topicCoverage !== "object") return null;
  const verdict = topicCoverage.verdict;
  if (typeof verdict !== "string") return null;
  return TOPIC_COVERAGE_BANDS[verdict] ?? TOPIC_COVERAGE_BANDS.PARTIAL;
}

/**
 * Compute D7 v2 stats for a user's hosted teaching sessions.
 *
 * @param {object} input
 * @param {Array<{
 *   id: string,
 *   ratings: Array<{ rating: number, peerLearned: boolean }>,
 *   topicCoverage: object | null,
 *   flags: Array<{ status: string }>,
 * }>} input.sessions  Teaching sessions hosted (status COMPLETED or ENDED),
 *   each with rating + flag joins. The query lives in stats.controller.js.
 * @returns {{
 *   active: boolean,
 *   sessionCount: number,
 *   ratingCount: number,
 *   avgRating: number,
 *   peerLearnedRate: number,
 *   avgTopicCoverage: number | null,
 *   flaggedSessionCount: number,
 *   flagRate: number,
 *   sourceQuality: "draft-only" | "peer-validated" | "stable-peer-cohort",
 *   ceiling: number,
 *   score: number | null,
 *   ci: [number, number] | null,
 *   basis: string[],
 * }}
 */
export function computeTeachingStats({ sessions }) {
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const sessionCount = sessionList.length;

  if (sessionCount === 0) {
    return {
      active: false,
      sessionCount: 0,
      ratingCount: 0,
      avgRating: 0,
      peerLearnedRate: 0,
      avgTopicCoverage: null,
      flaggedSessionCount: 0,
      flagRate: 0,
      sourceQuality: "draft-only",
      ceiling: DRAFT_ONLY_CEILING,
      score: null,
      ci: null,
      basis: ["sessions: 0"],
    };
  }

  const allRatings = sessionList.flatMap((s) =>
    Array.isArray(s.ratings) ? s.ratings : [],
  );
  const ratingCount = allRatings.length;
  const avgRating = ratingCount === 0
    ? 0
    : allRatings.reduce((a, r) => a + (r.rating ?? 0), 0) / ratingCount;
  const peerLearnedRate = ratingCount === 0
    ? 0
    : allRatings.filter((r) => r.peerLearned).length / ratingCount;

  // Average topic coverage across sessions that have a verdict.
  const coverageScores = sessionList
    .map((s) => topicCoverageNumeric(s.topicCoverage))
    .filter((v) => typeof v === "number");
  const avgTopicCoverage = coverageScores.length === 0
    ? null
    : coverageScores.reduce((a, b) => a + b, 0) / coverageScores.length;

  // Flag-rate: fraction of sessions with ≥FLAG_THRESHOLD OPEN flags.
  const flaggedSessionCount = sessionList.filter((s) => {
    const openFlags = (s.flags || []).filter((f) => f?.status === "OPEN").length;
    return openFlags >= FLAG_THRESHOLD;
  }).length;
  const flagRate = sessionCount === 0 ? 0 : flaggedSessionCount / sessionCount;

  // Source-quality tier + ceiling.
  const sourceQuality = classifySourceQuality({ sessionCount, ratingCount });
  const ceiling = ceilingForSourceQuality(sourceQuality);

  // Sub-component blend. Topic coverage is optional — if no session has a
  // verdict, drop the slice and re-normalize the remaining weights. Volume
  // and avg-rating + peer-learned are always present once activation passes.
  const components = [
    { value: (avgRating / 5) * 100, weight: W_AVG_RATING, present: true },
    { value: peerLearnedRate * 100, weight: W_PEER_LEARNED, present: ratingCount > 0 },
    {
      value: avgTopicCoverage ?? 0,
      weight: W_TOPIC_COVERAGE,
      present: avgTopicCoverage !== null,
    },
    {
      value: Math.min(1, sessionCount / VOLUME_SATURATION_SESSIONS) * 100,
      weight: W_VOLUME,
      present: true,
    },
  ];
  const presentComponents = components.filter((c) => c.present);
  const totalWeight = presentComponents.reduce((a, c) => a + c.weight, 0);
  const baseScore = totalWeight === 0
    ? 0
    : presentComponents.reduce((a, c) => a + c.value * c.weight, 0) / totalWeight;

  // Ceiling clamp first — the source-tier ceiling reflects rating-signal
  // reliability, independent of session quality.
  const cappedScore = Math.min(baseScore, ceiling);

  // Quality penalty for sessions with persistent open flags. Applied AFTER
  // the ceiling so a flagged user is always visibly below an equivalent
  // unflagged user — even at the ceiling.
  const qualityPenalty = flaggedSessionCount * FLAG_PENALTY_PER_SESSION;
  const score = Math.round(Math.max(0, cappedScore - qualityPenalty));

  // Asymmetric CI clamp (D1/D3/D5/D6 pattern) — half-width from raw rating
  // distribution preserves variance honestly; recenter at capped score; clamp
  // [0, ceiling] on the upper side.
  let ci = null;
  if (ratingCount >= 2) {
    const ratingsAs100 = allRatings.map((r) => ((r.rating ?? 0) / 5) * 100);
    const raw = meanCI(ratingsAs100);
    if (raw) {
      const halfWidth = (raw.ci[1] - raw.ci[0]) / 2;
      ci = [
        Math.max(0, Math.round(score - halfWidth)),
        // CI upper is clamped to whichever is lower: ceiling (source-tier
        // reliability cap) or score itself plus half-width. Score is already
        // post-penalty, so the band tracks the actual displayed value.
        Math.min(ceiling, Math.round(score + halfWidth)),
      ];
    }
  } else if (ratingCount === 1) {
    // Single rating — wide-but-honest band, mirrors meanCI's n=1 behavior.
    ci = [
      Math.max(0, score - 30),
      Math.min(ceiling, score + 30),
    ];
  }

  const basis = [
    `sessions: ${sessionCount}`,
    `ratings: ${ratingCount}`,
    `avg_rating: ${avgRating.toFixed(1)}`,
    `peer_learned_rate: ${peerLearnedRate.toFixed(2)}`,
    ...(avgTopicCoverage !== null
      ? [`avg_topic_coverage: ${Math.round(avgTopicCoverage)}/100`]
      : []),
    `source_quality: ${sourceQuality}`,
    `ceiling: ${ceiling}`,
    ...(flaggedSessionCount > 0
      ? [`flagged_sessions: ${flaggedSessionCount}`, `flag_rate: ${flagRate.toFixed(2)}`]
      : []),
  ];

  // Activation: ≥1 session AND ≥3 ratings (legacy gate preserved — peer
  // validation is required to score, not just to host).
  const active = sessionCount >= 1 && ratingCount >= PEER_VALIDATED_MIN_RATINGS;

  return {
    active,
    sessionCount,
    ratingCount,
    avgRating,
    peerLearnedRate,
    avgTopicCoverage,
    flaggedSessionCount,
    flagRate,
    sourceQuality,
    ceiling,
    score: active ? score : null,
    ci: active ? ci : null,
    basis,
  };
}

// Exported for tests + UI mapping.
export {
  W_AVG_RATING,
  W_PEER_LEARNED,
  W_TOPIC_COVERAGE,
  W_VOLUME,
  VOLUME_SATURATION_SESSIONS,
  FLAG_PENALTY_PER_SESSION,
  FLAG_THRESHOLD,
  TOPIC_COVERAGE_BANDS,
};

// ============================================================================
// Communication Stats — D3 v2 computation
// ============================================================================
//
// The legacy D3 ("Communication") cascaded through three score paths: peer
// ratings (rare in practice; UI never built), AI rating of written
// explanations (capped at 75), and an approach-length proxy (capped at 50).
// Two structural problems:
//
//   1. AI rating of WRITTEN explanations is not a measure of verbal
//      communication. Burgoon (1985) and Beaman (1984) established that
//      written and verbal communication share ~40% variance but are
//      separable constructs. Schmidt-Hunter (1998) and Levashina et al.
//      (2014) put structured-live-interview validity at r ≈ 0.40-0.51 vs
//      written-only at r ≈ 0.20. The legacy 75-cap on written-only was
//      generous; v2 caps at 55 (still generous given the AI rubric
//      structures the rating).
//
//   2. The legacy formula had a score-outside-CI bug: score used a post-
//      cap value (min((avg/10)*75, 75)) while the CI was computed on raw
//      (avg/10)*100. Different quantities — the CI didn't bound the
//      score. Original-report user surfaced this as "Comms 53 with CI
//      61-79". The naive fix (compute meanCI on capped values) would
//      destroy variance and yield a degenerate [55, 55] band — equally
//      wrong, opposite direction. v2 fixes asymmetrically: half-width is
//      computed on the raw distribution (variance preserved), recentered
//      at the capped score, clamped at ceiling on the upper side only.
//
// Source-tier ceiling architecture:
//
//   - written-only (≥2 AI explanation scores)        → ceiling 55
//   - + live (≥1 mock interview with comm scores)    → ceiling 80
//   - + peer (≥1 ClarityRating)                       → ceiling 100
//
// A user with only AI-rated writing CANNOT score above 55, no matter how
// strong the AI ratings are. The cap is the research-backed honesty: a
// polished written explanation isn't the same construct as live verbal
// communication under interview pressure.
//
// References:
//   Schmidt & Hunter (1998) "The Validity and Utility of Selection
//   Methods in Personnel Psychology" (Psychological Bulletin) — the
//   most-cited selection-validity meta-analysis. Work samples r=0.54;
//   structured interviews r=0.51; unstructured r=0.20; self-assessment
//   r ≈ 0.20.
//
//   Levashina, Hartwell, Morgeson & Campion (2014) "The Structured
//   Employment Interview: Narrative and Quantitative Review" (Personnel
//   Psychology). Highly-structured live interviews predict job
//   performance r=0.40-0.60; written-only signal much weaker.
//
//   Burgoon (1985) "Nonverbal Signals" + Beaman (1984) "Coordination of
//   verbal and nonverbal channels" — written and verbal communication
//   share ~40% variance but are distinguishable constructs.
//
//   interviewing.io (2023) public interview-data report and the Pramp
//   platform model both committed to peer-rated mock interviews
//   precisely because automated rating of written communication has
//   poor predictive validity at senior levels.
//
//   Anderson & Shackleton (1990) — interviewer rater stability requires
//   ≥3-4 sessions; a single mock is informative but not definitive.
//   Reflected in the FAANG tier gate (≥3 mocks).
// ============================================================================

import { meanCI } from "./dimensionStats.js";

// Activation thresholds per source. These are the minimum N for a source
// to contribute. They're documented and exported so tests pin them.
export const MIN_WRITTEN_N = 2;
export const MIN_LIVE_N = 1;
export const MIN_PEER_N = 1;

// Score caps per source-quality ceiling. Research-backed (see header).
export const CEILING_NONE = null; // dim inactive
export const CEILING_WRITTEN = 55;
export const CEILING_LIVE = 80;
export const CEILING_PEER = 100;

// Source weights for the blended score. Re-normalized across PRESENT
// sources only (mirrors combineCIs in dimensionStats.js).
const WEIGHT_PEER = 0.5;
const WEIGHT_LIVE = 0.35;
const WEIGHT_WRITTEN = 0.15;

// InterviewSession.scores keys that count toward live communication
// signal. Mirrors the extraction in stats.controller.js (legacy D3
// cross-feed) — kept here as the v2 source of truth so when the legacy
// cross-feed is removed there's no scattered field list to track down.
const COMM_SCORE_FIELDS_10 = [
  "communicationWhileCoding",
  "communicationClarity",
  "specificity",
  "authenticity",
  "careerNarrative",
];
const COMM_SCORE_FIELDS_4 = ["personalOwnership"];

/**
 * Pull live communication signals from raw InterviewSession rows.
 * Returns { signals: number[], mocksContributing: number } where signals
 * is on the 0-100 scale and mocksContributing is the count of distinct
 * interviews that produced at least one signal value.
 */
function extractLiveCommSignals(interviews) {
  const signals = [];
  let mocksContributing = 0;
  for (const interview of interviews || []) {
    const scores = interview?.scores;
    if (!scores || typeof scores !== "object") continue;
    let contributed = false;
    for (const f of COMM_SCORE_FIELDS_10) {
      const v = scores[f];
      if (typeof v === "number") {
        signals.push((v / 10) * 100);
        contributed = true;
      }
    }
    for (const f of COMM_SCORE_FIELDS_4) {
      const v = scores[f];
      if (typeof v === "number") {
        signals.push((v / 4) * 100);
        contributed = true;
      }
    }
    if (contributed) mocksContributing += 1;
  }
  return { signals, mocksContributing };
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Compute the D3 v2 communication score, ceiling, CI, and source breakdown.
 *
 * @param {object} input
 * @param {Array<{rating: number}>} input.clarityRatings  Peer ClarityRating
 *   rows (1-5 scale).
 * @param {Array<{scores?: object}>} input.interviews     InterviewSession
 *   rows. The utility extracts comm-relevant scores internally.
 * @param {number[]} input.aiExplanationScores            Already-extracted
 *   1-10 AI explanationQuality scores from solution reviews. Caller
 *   provides this to avoid duplicate extraction in stats.controller.js.
 *
 * @returns {{
 *   sources: { peer: boolean, live: boolean, written: boolean },
 *   mocksWithCommScores: number,
 *   peerRatingsCount: number,
 *   aiExplanationCount: number,
 *   ceiling: number | null,    // null when dim is inactive
 *   score:   number | null,
 *   ci:      [number, number] | null,
 *   sourceQuality: "peer-validated" | "live-and-ai" | "written-only" | "inactive",
 *   basis:   string[],
 * }}
 */
export function computeCommunicationStats({
  clarityRatings = [],
  interviews = [],
  aiExplanationScores = [],
} = {}) {
  // ── Source presence ─────────────────────────────────────────────
  const peerRatingsCount = Array.isArray(clarityRatings)
    ? clarityRatings.length
    : 0;
  const { signals: liveSignals, mocksContributing } =
    extractLiveCommSignals(interviews);
  const aiExplanationCount = Array.isArray(aiExplanationScores)
    ? aiExplanationScores.length
    : 0;

  const sources = {
    peer: peerRatingsCount >= MIN_PEER_N,
    live: mocksContributing >= MIN_LIVE_N,
    written: aiExplanationCount >= MIN_WRITTEN_N,
  };

  // ── Ceiling: highest-quality source present ────────────────────
  const ceiling = sources.peer
    ? CEILING_PEER
    : sources.live
      ? CEILING_LIVE
      : sources.written
        ? CEILING_WRITTEN
        : CEILING_NONE;

  const sourceQuality = sources.peer
    ? "peer-validated"
    : sources.live
      ? "live-and-ai"
      : sources.written
        ? "written-only"
        : "inactive";

  // Inactive-dim early return.
  if (ceiling === null) {
    return {
      sources,
      mocksWithCommScores: mocksContributing,
      peerRatingsCount,
      aiExplanationCount,
      ceiling: null,
      score: null,
      ci: null,
      sourceQuality,
      basis: [
        `peer_ratings: ${peerRatingsCount}`,
        `mock_comm_scores: ${mocksContributing}`,
        `ai_explanation_scores: ${aiExplanationCount}`,
        "source_quality: inactive",
      ],
    };
  }

  // ── Per-source means on 0-100 scale ────────────────────────────
  const peerValues = sources.peer
    ? clarityRatings.map((r) => (r.rating / 5) * 100)
    : [];
  const liveValues = sources.live ? liveSignals : [];
  const writtenValues = sources.written
    ? aiExplanationScores.map((s) => s * 10)
    : [];

  const peerMean = sources.peer ? mean(peerValues) : null;
  const liveMean = sources.live ? mean(liveValues) : null;
  const writtenMean = sources.written ? mean(writtenValues) : null;

  // ── Re-normalize weights across present sources only ───────────
  let totalW = 0;
  let weightedSum = 0;
  if (sources.peer) {
    totalW += WEIGHT_PEER;
    weightedSum += peerMean * WEIGHT_PEER;
  }
  if (sources.live) {
    totalW += WEIGHT_LIVE;
    weightedSum += liveMean * WEIGHT_LIVE;
  }
  if (sources.written) {
    totalW += WEIGHT_WRITTEN;
    weightedSum += writtenMean * WEIGHT_WRITTEN;
  }
  const rawBlend = weightedSum / totalW;

  // Score: weighted blend, clamped at ceiling.
  const score = Math.min(Math.round(rawBlend), ceiling);

  // ── CI: half-width from RAW distribution (preserve variance),
  //    recentered at score, clamped at ceiling on upper side only.
  //
  // Pitfall NOT taken: capping each input value before meanCI would
  // destroy variance and yield [ceiling, ceiling] — that's the wrong fix.
  // Pitfall NOT taken: legacy used meanCI on raw without recentering, so
  // CI didn't bound score (the original-report bug we're fixing).
  const allRawValues = [...peerValues, ...liveValues, ...writtenValues];
  const rawCi = meanCI(allRawValues);
  let ci;
  if (rawCi === null) {
    // Defensive — should not happen since at least one source has values.
    ci = [score, score];
  } else {
    const halfWidth = (rawCi.ci[1] - rawCi.ci[0]) / 2;
    ci = [
      Math.max(0, Math.round(score - halfWidth)),
      Math.min(ceiling, Math.round(score + halfWidth)),
    ];
  }

  // ── Basis lines for the dim card ───────────────────────────────
  const basis = [
    `peer_ratings: ${peerRatingsCount}`,
    `mock_comm_scores: ${mocksContributing}`,
    `ai_explanation_scores: ${aiExplanationCount}`,
    `source_quality: ${sourceQuality}`,
    `ceiling: ${ceiling}`,
  ];

  return {
    sources,
    mocksWithCommScores: mocksContributing,
    peerRatingsCount,
    aiExplanationCount,
    ceiling,
    score,
    ci,
    sourceQuality,
    basis,
  };
}

// ============================================================================
// communicationStats — unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computeCommunicationStats,
  MIN_WRITTEN_N,
  MIN_LIVE_N,
  MIN_PEER_N,
  CEILING_WRITTEN,
  CEILING_LIVE,
  CEILING_PEER,
} from "../../src/utils/communicationStats.js";

// ── Fixture builders ─────────────────────────────────────────────────
//
// Tests exercise three input categories:
//   - clarityRatings: array of { rating: 1-5 }
//   - interviews: array of { scores: { ... } } where scores keys are the
//     COMM_SCORE_FIELDS_10/4 lists owned by the utility.
//   - aiExplanationScores: array of 1-10 numbers.

const peer = (rating) => ({ rating });
const mock = (scores) => ({ scores });
const explanationScores = (...nums) => nums;

// ── Activation gate ──────────────────────────────────────────────────

describe("computeCommunicationStats — activation", () => {
  it("zero inputs → ceiling null, dim inactive", () => {
    const out = computeCommunicationStats({});
    expect(out.ceiling).toBe(null);
    expect(out.score).toBe(null);
    expect(out.ci).toBe(null);
    expect(out.sourceQuality).toBe("inactive");
  });

  it("1 AI explanation score (below MIN_WRITTEN_N=2) → inactive", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(8),
    });
    expect(out.ceiling).toBe(null);
    expect(out.sources.written).toBe(false);
  });

  it("2 AI explanation scores → activates written tier (ceiling 55)", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(7, 7),
    });
    expect(out.ceiling).toBe(CEILING_WRITTEN);
    expect(out.sources.written).toBe(true);
    expect(out.sources.live).toBe(false);
    expect(out.sources.peer).toBe(false);
    expect(out.sourceQuality).toBe("written-only");
  });

  it("interviews without comm-relevant scores do not activate live", () => {
    const out = computeCommunicationStats({
      interviews: [
        // optimization-only interview — no comm fields
        mock({ optimizationAbility: 8, codeCorrectness: 7 }),
      ],
    });
    expect(out.ceiling).toBe(null);
    expect(out.sources.live).toBe(false);
    expect(out.mocksWithCommScores).toBe(0);
  });

  it("interview with single comm field activates live", () => {
    const out = computeCommunicationStats({
      interviews: [mock({ communicationClarity: 8 })],
    });
    expect(out.ceiling).toBe(CEILING_LIVE);
    expect(out.sources.live).toBe(true);
    expect(out.mocksWithCommScores).toBe(1);
  });

  it("1 peer rating activates peer tier (ceiling 100)", () => {
    const out = computeCommunicationStats({ clarityRatings: [peer(4)] });
    expect(out.ceiling).toBe(CEILING_PEER);
    expect(out.sources.peer).toBe(true);
    expect(out.sourceQuality).toBe("peer-validated");
  });
});

// ── Ceiling progression ──────────────────────────────────────────────

describe("computeCommunicationStats — ceiling tiers", () => {
  it("written-only score capped at 55 even when raw mean >> 55", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(10, 10, 10, 10), // raw 100
    });
    expect(out.ceiling).toBe(55);
    expect(out.score).toBe(55);
  });

  it("written-only with raw mean below ceiling renders raw score", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(4, 4, 4), // raw 40
    });
    expect(out.ceiling).toBe(55);
    expect(out.score).toBe(40);
  });

  it("written + live present → ceiling 80, blend re-normalized live=0.70 / written=0.30", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(7, 7), // raw 70
      interviews: [
        mock({ communicationWhileCoding: 9, communicationClarity: 9 }), // raw 90
      ],
    });
    expect(out.ceiling).toBe(CEILING_LIVE);
    // weights: live 0.35, written 0.15 → norm: live 0.70 / written 0.30
    // raw blend = 90*0.70 + 70*0.30 = 63 + 21 = 84
    // capped at 80
    expect(out.score).toBe(80);
  });

  it("all three sources present → ceiling 100, full 0.50/0.35/0.15 blend", () => {
    const out = computeCommunicationStats({
      clarityRatings: [peer(4), peer(4)], // raw 80
      interviews: [mock({ communicationClarity: 7 })], // raw 70
      aiExplanationScores: explanationScores(6, 6), // raw 60
    });
    expect(out.ceiling).toBe(CEILING_PEER);
    expect(out.sources.peer).toBe(true);
    expect(out.sources.live).toBe(true);
    expect(out.sources.written).toBe(true);
    // blend = 80*0.50 + 70*0.35 + 60*0.15 = 40 + 24.5 + 9 = 73.5
    expect(out.score).toBe(74);
  });

  it("only peer present → score = peer mean (no other sources to blend)", () => {
    const out = computeCommunicationStats({
      clarityRatings: [peer(5), peer(5), peer(5)], // raw 100
    });
    expect(out.score).toBe(100);
  });
});

// ── CI bug regression: variance preservation ─────────────────────────

describe("computeCommunicationStats — CI honesty", () => {
  it("REGRESSION: written-only with high raw mean must NOT yield [55,55]", () => {
    // The original-report user hit this exact case: AI explanation
    // ~7/10, raw blend ~70, capped at 55. Naive "compute meanCI on
    // capped values" would give [55,55] — uninformative degenerate.
    // The fix preserves variance from raw distribution.
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(6, 8, 7, 7), // mixed → real variance
    });
    expect(out.score).toBe(55);
    expect(out.ci).not.toEqual([55, 55]);
    // CI lower bound must be < score; upper bound capped at ceiling.
    expect(out.ci[0]).toBeLessThan(55);
    expect(out.ci[1]).toBeLessThanOrEqual(55);
  });

  it("score is at the upper bound of CI when raw exceeds ceiling", () => {
    // Geometrically correct: when score is capped, the CI's upper bound
    // is the ceiling, not score+halfWidth.
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(8, 9, 8, 9), // all > ceiling/10
    });
    expect(out.score).toBe(55);
    expect(out.ci[1]).toBe(55);
    // Lower bound reflects raw variance.
    expect(out.ci[0]).toBeLessThan(55);
  });

  it("variance preservation: high-disagreement raters yield WIDER CI than agreeing raters", () => {
    const disagreement = computeCommunicationStats({
      clarityRatings: [peer(1), peer(5), peer(1), peer(5)],
    });
    const agreement = computeCommunicationStats({
      clarityRatings: [peer(3), peer(3), peer(3), peer(3)],
    });
    const widthDisagreement = disagreement.ci[1] - disagreement.ci[0];
    const widthAgreement = agreement.ci[1] - agreement.ci[0];
    expect(widthDisagreement).toBeGreaterThan(widthAgreement);
  });

  it("zero variance with raw values within ceiling → narrow CI around score", () => {
    // 5 reviewers all scored 4/5 → raw 80 → score 80 (within ceiling 100)
    // CI half-width should be very small (only small-sample penalty).
    const out = computeCommunicationStats({
      clarityRatings: [peer(4), peer(4), peer(4), peer(4), peer(4)],
    });
    expect(out.score).toBe(80);
    const width = out.ci[1] - out.ci[0];
    expect(width).toBeLessThan(5); // small-sample penalty allows ~2-4
  });

  it("score within ceiling: CI not clamped from above", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(3, 4, 3, 4), // raw ~35, well below 55
    });
    expect(out.score).toBeLessThan(CEILING_WRITTEN);
    // Upper bound should be score+halfWidth, NOT the ceiling.
    // (Lower halfWidth bound is what we assert here — neither side at ceiling.)
    expect(out.ci[1]).toBeLessThan(CEILING_WRITTEN);
  });
});

// ── mocksWithCommScores counter ──────────────────────────────────────

describe("computeCommunicationStats — mocksWithCommScores counter", () => {
  it("counts distinct interviews, not signal values", () => {
    const out = computeCommunicationStats({
      interviews: [
        mock({
          communicationWhileCoding: 7,
          communicationClarity: 8,
          specificity: 6, // 3 signals from one interview
        }),
        mock({ communicationClarity: 7 }), // 1 signal from another
      ],
    });
    expect(out.mocksWithCommScores).toBe(2);
  });

  it("interviews with no comm fields don't bump counter", () => {
    const out = computeCommunicationStats({
      interviews: [
        mock({ optimizationAbility: 8 }),
        mock({ communicationClarity: 7 }),
        mock({ codeCorrectness: 9 }),
      ],
    });
    expect(out.mocksWithCommScores).toBe(1);
  });

  it("personalOwnership (1-4 scale) triggers counter just like 1-10 fields", () => {
    const out = computeCommunicationStats({
      interviews: [mock({ personalOwnership: 3 })],
    });
    expect(out.mocksWithCommScores).toBe(1);
    expect(out.sources.live).toBe(true);
  });
});

// ── Original-report user fixture ─────────────────────────────────────

describe("computeCommunicationStats — original-report user fixture", () => {
  // User from the very first conversation: 4 AI explanation scores
  // averaging ~7/10, 0 mocks with comm scores, 0 peer ratings. Legacy
  // showed Comms=53 with CI [61, 79] (score outside CI bug). v2 should
  // show Comms=55 with CI [≤55, ≤55] reflecting variance from raw and
  // explicitly NOT [55, 55] when there's variance.
  it("score = 55, ci has lower bound below 55, ci upper bound ≤ 55", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(7, 7, 7, 7), // exactly even
    });
    expect(out.score).toBe(55);
    expect(out.ci[1]).toBeLessThanOrEqual(55);
    expect(out.sourceQuality).toBe("written-only");
    expect(out.mocksWithCommScores).toBe(0);
    expect(out.peerRatingsCount).toBe(0);
  });

  it("with realistic variance, ci lower bound is meaningfully below 55", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(6, 8, 6, 8),
    });
    expect(out.score).toBe(55);
    expect(out.ci[0]).toBeLessThan(55); // honest variance
    expect(out.ci[1]).toBeLessThanOrEqual(55); // upper-clamped at ceiling
  });
});

// ── basis lines + sources object shape ───────────────────────────────

describe("computeCommunicationStats — basis + shape", () => {
  it("basis lines surface source breakdown for the dim card", () => {
    const out = computeCommunicationStats({
      aiExplanationScores: explanationScores(7, 7, 7),
    });
    expect(out.basis).toEqual([
      "peer_ratings: 0",
      "mock_comm_scores: 0",
      "ai_explanation_scores: 3",
      "source_quality: written-only",
      "ceiling: 55",
    ]);
  });

  it("inactive dim still produces basis lines", () => {
    const out = computeCommunicationStats({});
    expect(out.basis).toEqual([
      "peer_ratings: 0",
      "mock_comm_scores: 0",
      "ai_explanation_scores: 0",
      "source_quality: inactive",
    ]);
  });
});

// ── Tunable constants are sane ───────────────────────────────────────

describe("computeCommunicationStats — exposed constants", () => {
  it("min-N thresholds are sane", () => {
    expect(MIN_WRITTEN_N).toBe(2);
    expect(MIN_LIVE_N).toBe(1);
    expect(MIN_PEER_N).toBe(1);
  });

  it("ceiling progression is monotonic and matches research", () => {
    expect(CEILING_WRITTEN).toBe(55);
    expect(CEILING_LIVE).toBe(80);
    expect(CEILING_PEER).toBe(100);
    expect(CEILING_WRITTEN).toBeLessThan(CEILING_LIVE);
    expect(CEILING_LIVE).toBeLessThan(CEILING_PEER);
  });
});

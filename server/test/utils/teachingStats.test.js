// ============================================================================
// teachingStats — D7 v2 unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computeTeachingStats,
  classifySourceQuality,
  ceilingForSourceQuality,
  DRAFT_ONLY_CEILING,
  PEER_VALIDATED_CEILING,
  STABLE_PEER_COHORT_CEILING,
  PEER_VALIDATED_MIN_RATINGS,
  STABLE_PEER_COHORT_MIN_RATINGS,
  STABLE_PEER_COHORT_MIN_SESSIONS,
  TOPIC_COVERAGE_BANDS,
  FLAG_PENALTY_PER_SESSION,
  FLAG_THRESHOLD,
} from "../../src/utils/teachingStats.js";

// ── Tiny fixture builders ────────────────────────────────────────────

function rating(score, peerLearned = false) {
  return { rating: score, peerLearned };
}

function session({
  ratings = [],
  topicCoverageVerdict = null,
  openFlagCount = 0,
} = {}) {
  return {
    id: `sess-${Math.random().toString(36).slice(2, 8)}`,
    ratings,
    topicCoverage: topicCoverageVerdict ? { verdict: topicCoverageVerdict } : null,
    flags: Array(openFlagCount).fill({ status: "OPEN" }),
  };
}

// ── Source-quality tier classification ──────────────────────────────

describe("classifySourceQuality", () => {
  it("returns 'draft-only' when ratings < 3", () => {
    expect(classifySourceQuality({ sessionCount: 5, ratingCount: 0 })).toBe("draft-only");
    expect(classifySourceQuality({ sessionCount: 5, ratingCount: 2 })).toBe("draft-only");
  });

  it("returns 'peer-validated' at ≥3 ratings, < stable-peer-cohort floor", () => {
    expect(classifySourceQuality({ sessionCount: 1, ratingCount: 3 })).toBe("peer-validated");
    expect(classifySourceQuality({ sessionCount: 2, ratingCount: 6 })).toBe("peer-validated");
    expect(classifySourceQuality({ sessionCount: 5, ratingCount: 4 })).toBe("peer-validated");
  });

  it("returns 'stable-peer-cohort' at ≥5 ratings AND ≥3 sessions", () => {
    expect(classifySourceQuality({ sessionCount: 3, ratingCount: 5 })).toBe("stable-peer-cohort");
    expect(classifySourceQuality({ sessionCount: 5, ratingCount: 10 })).toBe("stable-peer-cohort");
  });
});

describe("ceilingForSourceQuality", () => {
  it("maps each tier to its ceiling", () => {
    expect(ceilingForSourceQuality("draft-only")).toBe(DRAFT_ONLY_CEILING);
    expect(ceilingForSourceQuality("peer-validated")).toBe(PEER_VALIDATED_CEILING);
    expect(ceilingForSourceQuality("stable-peer-cohort")).toBe(STABLE_PEER_COHORT_CEILING);
  });

  it("ceilings are monotonically increasing", () => {
    expect(DRAFT_ONLY_CEILING).toBeLessThan(PEER_VALIDATED_CEILING);
    expect(PEER_VALIDATED_CEILING).toBeLessThan(STABLE_PEER_COHORT_CEILING);
  });
});

// ── Activation ──────────────────────────────────────────────────────

describe("computeTeachingStats — activation", () => {
  it("inactive when no sessions", () => {
    const r = computeTeachingStats({ sessions: [] });
    expect(r.active).toBe(false);
    expect(r.score).toBeNull();
    expect(r.ci).toBeNull();
  });

  it("inactive when sessions but 0 ratings", () => {
    const r = computeTeachingStats({
      sessions: [session({ ratings: [] }), session({ ratings: [] })],
    });
    expect(r.active).toBe(false);
    expect(r.score).toBeNull();
    expect(r.sourceQuality).toBe("draft-only");
    expect(r.ceiling).toBe(DRAFT_ONLY_CEILING);
  });

  it("inactive when ratings < PEER_VALIDATED_MIN_RATINGS", () => {
    const r = computeTeachingStats({
      sessions: [session({ ratings: [rating(5), rating(5)] })],
    });
    expect(r.active).toBe(false);
    expect(r.score).toBeNull();
  });

  it("active at exactly PEER_VALIDATED_MIN_RATINGS", () => {
    const r = computeTeachingStats({
      sessions: [
        session({ ratings: [rating(4, true), rating(4, true), rating(4, true)] }),
      ],
    });
    expect(r.active).toBe(true);
    expect(r.score).not.toBeNull();
    expect(r.sourceQuality).toBe("peer-validated");
  });
});

// ── Source-tier ceiling enforcement ─────────────────────────────────

describe("computeTeachingStats — source-tier ceiling", () => {
  it("peer-validated tier caps score at PEER_VALIDATED_CEILING (70)", () => {
    // 1 session, 3 ratings of 5/5 with peerLearned=true. Without ceiling
    // would score ≈ 55*1 + 25*1 + 0 + 10*0.2 = 82. With ceiling 70, capped.
    const r = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(5, true), rating(5, true), rating(5, true)],
          topicCoverageVerdict: "FULL",
        }),
      ],
    });
    expect(r.sourceQuality).toBe("peer-validated");
    expect(r.score).toBeLessThanOrEqual(PEER_VALIDATED_CEILING);
    expect(r.score).toBe(PEER_VALIDATED_CEILING);
  });

  it("stable-peer-cohort tier allows score up to 100", () => {
    const ratings = Array(10).fill(0).map(() => rating(5, true));
    const sessions = Array(5).fill(0).map(() =>
      session({ ratings: ratings.slice(0, 2), topicCoverageVerdict: "FULL" }),
    );
    const r = computeTeachingStats({ sessions });
    expect(r.sourceQuality).toBe("stable-peer-cohort");
    expect(r.score).toBeGreaterThan(PEER_VALIDATED_CEILING);
    expect(r.score).toBeLessThanOrEqual(STABLE_PEER_COHORT_CEILING);
  });

  it("score sits inside CI band (asymmetric clamp)", () => {
    // Exactly the screenshot-style failure pattern from D3 — score outside
    // CI is the bug we engineered against. Mixed-rating user.
    const r = computeTeachingStats({
      sessions: [
        session({ ratings: [rating(5, true), rating(3, false), rating(4, true)] }),
        session({ ratings: [rating(5, true), rating(2, false)] }),
      ],
    });
    expect(r.active).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(r.ci[0]);
    expect(r.score).toBeLessThanOrEqual(r.ci[1]);
    // CI upper never above ceiling.
    expect(r.ci[1]).toBeLessThanOrEqual(r.ceiling);
  });
});

// ── Sub-component blend ──────────────────────────────────────────────

describe("computeTeachingStats — sub-component blend", () => {
  it("perfect ratings without peer-learned do NOT max the score (Fiorella-Mayer)", () => {
    // 5/5 rating but no one says "I learned something" — Fiorella-Mayer's
    // outcome variable is missing, so peer_learned_rate=0 caps the second
    // sub-component to 0. Without that contribution, score ≪ ceiling.
    const r = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(5, false), rating(5, false), rating(5, false)],
          topicCoverageVerdict: "FULL",
        }),
      ],
    });
    expect(r.active).toBe(true);
    // 0.55 × 100 + 0.25 × 0 + 0.10 × 100 + 0.10 × 20 = 67 (before ceiling clamp at 70)
    expect(r.score).toBeLessThan(PEER_VALIDATED_CEILING);
    expect(r.peerLearnedRate).toBe(0);
  });

  it("topic coverage missing — weights re-normalize without dropping score", () => {
    const withCoverage = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(4, true), rating(4, true), rating(4, true)],
          topicCoverageVerdict: "FULL",
        }),
      ],
    });
    const withoutCoverage = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(4, true), rating(4, true), rating(4, true)],
          topicCoverageVerdict: null,
        }),
      ],
    });
    expect(withoutCoverage.score).toBeGreaterThan(0);
    // Without re-normalization, missing 0.10 weight would deflate the score.
    // With re-normalization, both should be in the same neighbourhood.
    expect(Math.abs(withCoverage.score - withoutCoverage.score)).toBeLessThan(15);
  });

  it("OFF_TOPIC verdict drags the score down (vs FULL)", () => {
    // Use 3/5 ratings + mixed peerLearned so the score sits below the
    // peer-validated ceiling (70) for both scenarios — only then is the
    // topic-coverage delta visible. With a 4/5 perfect-peer-learn fixture
    // both clamp at 70 and OFF_TOPIC vs FULL becomes invisible.
    const offTopic = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(3, true), rating(3, false), rating(3, false)],
          topicCoverageVerdict: "OFF_TOPIC",
        }),
      ],
    });
    const fullCoverage = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(3, true), rating(3, false), rating(3, false)],
          topicCoverageVerdict: "FULL",
        }),
      ],
    });
    expect(offTopic.score).toBeLessThan(fullCoverage.score);
  });
});

// ── Quality penalty ──────────────────────────────────────────────────

describe("computeTeachingStats — flag penalty", () => {
  it("≥FLAG_THRESHOLD OPEN flags trips the penalty", () => {
    const clean = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(5, true), rating(5, true), rating(5, true)],
          topicCoverageVerdict: "FULL",
          openFlagCount: 0,
        }),
      ],
    });
    const flagged = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(5, true), rating(5, true), rating(5, true)],
          topicCoverageVerdict: "FULL",
          openFlagCount: FLAG_THRESHOLD,
        }),
      ],
    });
    expect(flagged.flaggedSessionCount).toBe(1);
    expect(flagged.score).toBeLessThanOrEqual(clean.score);
    // Even with ceiling clamp, penalty should reduce score by FLAG_PENALTY
    // when clean would have been at the ceiling.
    expect(clean.score - flagged.score).toBeGreaterThanOrEqual(FLAG_PENALTY_PER_SESSION - 1);
  });

  it("flags below threshold do NOT trigger the penalty", () => {
    const r = computeTeachingStats({
      sessions: [
        session({
          ratings: [rating(5, true), rating(5, true), rating(5, true)],
          topicCoverageVerdict: "FULL",
          openFlagCount: FLAG_THRESHOLD - 1,
        }),
      ],
    });
    expect(r.flaggedSessionCount).toBe(0);
    expect(r.flagRate).toBe(0);
  });
});

// ── Volume saturation ────────────────────────────────────────────────

describe("computeTeachingStats — volume saturation", () => {
  it("5 sessions vs 30 sessions both saturate volume — score identical", () => {
    // The volume saturation point is 5 sessions. Compare 5 vs 30 with the
    // same per-session rating distribution — both should hit the volume
    // ceiling (100% on the 0.10 sub-component slice). Compare in the same
    // source-tier (stable-peer-cohort: ≥5 ratings + ≥3 sessions) so the
    // ceiling doesn't change between scenarios.
    const five = computeTeachingStats({
      sessions: Array(5).fill(0).map(() =>
        session({ ratings: [rating(4, true)], topicCoverageVerdict: "FULL" }),
      ),
    });
    const thirty = computeTeachingStats({
      sessions: Array(30).fill(0).map(() =>
        session({ ratings: [rating(4, true)], topicCoverageVerdict: "FULL" }),
      ),
    });
    // Both in stable-peer-cohort, both at volume saturation — same ceiling,
    // same volume contribution. Score should be identical.
    expect(five.sourceQuality).toBe("stable-peer-cohort");
    expect(thirty.sourceQuality).toBe("stable-peer-cohort");
    expect(thirty.score).toBe(five.score);
  });
});

// ── Constants ────────────────────────────────────────────────────────

describe("teachingStats constants", () => {
  it("topic coverage bands are sane", () => {
    expect(TOPIC_COVERAGE_BANDS.FULL).toBe(100);
    expect(TOPIC_COVERAGE_BANDS.PARTIAL).toBeLessThan(TOPIC_COVERAGE_BANDS.FULL);
    expect(TOPIC_COVERAGE_BANDS.OFF_TOPIC).toBeLessThan(TOPIC_COVERAGE_BANDS.PARTIAL);
  });

  it("source-tier rating thresholds are monotonic", () => {
    expect(PEER_VALIDATED_MIN_RATINGS).toBeLessThan(STABLE_PEER_COHORT_MIN_RATINGS);
    expect(STABLE_PEER_COHORT_MIN_SESSIONS).toBeGreaterThan(0);
  });
});

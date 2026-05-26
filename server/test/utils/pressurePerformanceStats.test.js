// ============================================================================
// pressurePerformanceStats — unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computePressurePerformanceStats,
  MIN_QUIZ_N_RELEVANT,
  MIN_LIVE_N,
  MIN_STABLE_N,
  CEILING_QUIZ,
  CEILING_LIVE,
  CEILING_STABLE,
} from "../../src/utils/pressurePerformanceStats.js";

// ── Fixture helpers ───────────────────────────────────────────────────
//
// We inject a stub `mapQuizSubjectToDimensions` into the utility. The
// stub returns a non-empty array iff the subject contains an interview-
// relevant keyword (subset of the canonical map for testability).

const RELEVANT_SUBJECTS = new Set([
  "binary search",
  "dynamic programming",
  "system design",
  "behavioral",
  "complexity analysis",
  "optimization",
  "operating system",
]);

function mapQuizSubjectToDimensionsStub(subject) {
  const norm = (subject || "").toLowerCase();
  for (const kw of RELEVANT_SUBJECTS) {
    if (norm.includes(kw)) return [{ dimKey: "stub", maxContribution: 10 }];
  }
  return []; // Photography, Hindi, Physics, etc. → empty → excluded
}

const quiz = (subject, score, difficulty = "MEDIUM") => ({ subject, score, difficulty });
const mock = (scores) => ({ scores });

// ── Activation ────────────────────────────────────────────────────────

describe("computePressurePerformanceStats — activation", () => {
  it("zero inputs → ceiling null, dim inactive", () => {
    const out = computePressurePerformanceStats({
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.ceiling).toBe(null);
    expect(out.score).toBe(null);
    expect(out.sourceQuality).toBe("inactive");
  });

  it("2 relevant quizzes (below MIN_QUIZ_N_RELEVANT) → inactive", () => {
    const out = computePressurePerformanceStats({
      quizzes: [quiz("Binary Search", 70), quiz("Dynamic Programming", 60)],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.ceiling).toBe(null);
    expect(out.relevantQuizCount).toBe(2);
  });

  it("3 relevant quizzes → activates quiz-proxy tier (ceiling 40)", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 70),
        quiz("Dynamic Programming", 60),
        quiz("System Design", 65),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.ceiling).toBe(CEILING_QUIZ);
    expect(out.sourceQuality).toBe("quiz-proxy");
  });

  it("1 mock with comm/perf scores activates live tier (ceiling 80)", () => {
    const out = computePressurePerformanceStats({
      interviews: [mock({ communicationWhileCoding: 8, codeCorrectness: 7 })],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.ceiling).toBe(CEILING_LIVE);
    expect(out.mocksWithScores).toBe(1);
    expect(out.sourceQuality).toBe("live-only");
  });

  it("3 mocks with scores → ceiling 100 (stable tier)", () => {
    const out = computePressurePerformanceStats({
      interviews: [
        mock({ communicationWhileCoding: 8 }),
        mock({ codeCorrectness: 7, edgeCaseHandling: 8 }),
        mock({ tradeOffReasoning: 9 }),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.ceiling).toBe(CEILING_STABLE);
    expect(out.sourceQuality).toBe("stable-mocks");
  });
});

// ── Subject filter (Photography regression) ──────────────────────────

describe("computePressurePerformanceStats — subject filter", () => {
  it("REGRESSION: 5 Photography quizzes alone → relevantQuizCount=0, dim INACTIVE", () => {
    // The original-report user had Photography among their quiz subjects.
    // Under v2 those don't count toward pressure performance.
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Photography", 80),
        quiz("Photography", 75),
        quiz("Photography", 90),
        quiz("Hindi", 60),
        quiz("Physics", 70),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.relevantQuizCount).toBe(0);
    expect(out.totalQuizzesSeen).toBe(5);
    expect(out.ceiling).toBe(null);
    expect(out.sourceQuality).toBe("inactive");
  });

  it("REGRESSION: 3 relevant + 2 Photography → activates with relevantQuizCount=3", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 70),
        quiz("Dynamic Programming", 60),
        quiz("System Design", 65),
        quiz("Photography", 80), // excluded
        quiz("Hindi", 75),       // excluded
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.relevantQuizCount).toBe(3);
    expect(out.totalQuizzesSeen).toBe(5);
    expect(out.ceiling).toBe(CEILING_QUIZ);
    // Basis line shows 5 total seen, 3 relevant — surfaces the filter to user.
    expect(out.basis).toContain("relevant_quizzes: 3");
    expect(out.basis).toContain("total_quizzes_seen: 5");
  });

  it("subject filter is case-insensitive via the injected mapper", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("BINARY SEARCH", 70),
        quiz("Dynamic Programming", 60),
        quiz("system design", 65),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.relevantQuizCount).toBe(3);
  });

  it("subject with empty/null gracefully excluded (no crash)", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("", 70),
        quiz(null, 60),
        quiz("Binary Search", 80),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.relevantQuizCount).toBe(1);
  });
});

// ── Mock-vs-quiz blend (inverse of legacy weights) ───────────────────

describe("computePressurePerformanceStats — blend weights", () => {
  it("1 mock + 4 relevant quizzes: ceiling 80, mock dominates blend (0.7)", () => {
    // Mock mean from communicationClarity=9 → 90. Quiz mean 60.
    // Raw blend = 90×0.7 + 60×0.3 = 63 + 18 = 81 → clamped at 80.
    const out = computePressurePerformanceStats({
      interviews: [mock({ communicationClarity: 9, codeCorrectness: 9 })],
      quizzes: [
        quiz("Binary Search", 60),
        quiz("Dynamic Programming", 60),
        quiz("System Design", 60),
        quiz("Operating System", 60),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.ceiling).toBe(CEILING_LIVE);
    expect(out.score).toBe(80);
    expect(out.sourceQuality).toBe("live-and-quiz");
  });

  it("Schmidt-Hunter validity ratio: liveMockMean=80, quizMean=60 → blend 74", () => {
    // 0.7 × 80 + 0.3 × 60 = 56 + 18 = 74. Within ceiling 80.
    const out = computePressurePerformanceStats({
      interviews: [mock({ communicationClarity: 8, codeCorrectness: 8 })], // 80 avg
      quizzes: [
        quiz("Binary Search", 60),
        quiz("Dynamic Programming", 60),
        quiz("System Design", 60),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.score).toBe(74);
  });

  it("only mocks (no quizzes) — no quiz weight, score = mock mean (capped at ceiling)", () => {
    const out = computePressurePerformanceStats({
      interviews: [mock({ communicationClarity: 8 })],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.score).toBe(80);
  });
});

// ── Ceiling clamps + quiz-only cap ───────────────────────────────────

describe("computePressurePerformanceStats — ceiling enforcement", () => {
  it("quiz-only with raw mean 70 → score capped at 40", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 70),
        quiz("Dynamic Programming", 70),
        quiz("System Design", 70),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.score).toBe(40);
  });

  it("quiz-only with raw mean below ceiling renders raw score", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 30),
        quiz("Dynamic Programming", 30),
        quiz("System Design", 30),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.score).toBe(30);
  });

  it("quiz-only at exactly ceiling 40 renders ceiling", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 40),
        quiz("Dynamic Programming", 40),
        quiz("System Design", 40),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.score).toBe(40);
  });
});

// ── CI honesty (asymmetric clamp) ────────────────────────────────────

describe("computePressurePerformanceStats — CI honesty", () => {
  it("REGRESSION: quiz-only with high raw variance must NOT yield [ceiling, ceiling]", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 30),
        quiz("Dynamic Programming", 90),
        quiz("System Design", 40),
        quiz("Operating System", 80),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.score).toBe(40);
    expect(out.ci).not.toEqual([40, 40]);
    expect(out.ci[0]).toBeLessThan(40); // honest variance preserved
    expect(out.ci[1]).toBeLessThanOrEqual(40); // ceiling clamps upper
  });

  it("variance preservation: high-disagreement quizzes yield WIDER CI than agreeing ones", () => {
    const disagreement = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 20),
        quiz("Dynamic Programming", 80),
        quiz("System Design", 30),
        quiz("Operating System", 90),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    const agreement = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 50),
        quiz("Dynamic Programming", 50),
        quiz("System Design", 50),
        quiz("Operating System", 50),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    const widthD = disagreement.ci[1] - disagreement.ci[0];
    const widthA = agreement.ci[1] - agreement.ci[0];
    expect(widthD).toBeGreaterThan(widthA);
  });
});

// ── Difficulty-weighted quiz mean ────────────────────────────────────

describe("computePressurePerformanceStats — difficulty weighting", () => {
  it("3 HARD relevant quizzes (avg 60) → quiz mean = 60 (uniform multipliers cancel)", () => {
    // weighted_mean = sum(score × mult) / sum(mult); if all same difficulty,
    // it's just the regular mean.
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 60, "HARD"),
        quiz("Dynamic Programming", 60, "HARD"),
        quiz("System Design", 60, "HARD"),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.score).toBe(40); // capped at ceiling
  });

  it("mixed difficulties: HARD quiz contributes more weight than EASY", () => {
    // 1 HARD score=80 (×1.3 = 104), 2 EASY score=50 (×0.8×2 = 80).
    // weighted_sum = 104 + 80 = 184. total_weight = 1.3 + 1.6 = 2.9.
    // weighted_mean = 184 / 2.9 ≈ 63.45 → capped at 40.
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 80, "HARD"),
        quiz("Dynamic Programming", 50, "EASY"),
        quiz("System Design", 50, "EASY"),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.score).toBe(40);
  });

  it("missing difficulty falls back to MEDIUM multiplier (1.0)", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        { subject: "Binary Search", score: 30 },              // no difficulty
        { subject: "Dynamic Programming", score: 30 },
        { subject: "System Design", score: 30 },
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    // All MEDIUM (or fallback) → uniform → simple mean = 30, below ceiling
    expect(out.score).toBe(30);
  });
});

// ── Mock signal extraction edge cases ────────────────────────────────

describe("computePressurePerformanceStats — mock signal", () => {
  it("interviews with empty scores object don't count", () => {
    const out = computePressurePerformanceStats({
      interviews: [mock({}), mock(null), mock({ communicationClarity: 8 })],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.mocksWithScores).toBe(1);
  });

  it("interviews with non-pressure-relevant scores still don't activate live", () => {
    // If the scores object exists but contains no PRESSURE_SCALE10 or
    // SCALE4 fields, the mock contributes nothing — same as no scores.
    const out = computePressurePerformanceStats({
      interviews: [mock({ unrelatedField: 8 })],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.mocksWithScores).toBe(0);
    expect(out.ceiling).toBe(null);
  });

  it("scale4 field (clarifyingQuestions) alone activates live tier", () => {
    const out = computePressurePerformanceStats({
      interviews: [mock({ clarifyingQuestions: 3 })],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.mocksWithScores).toBe(1);
    expect(out.ceiling).toBe(CEILING_LIVE);
  });
});

// ── Original-report user fixture ─────────────────────────────────────

describe("computePressurePerformanceStats — original-report user fixture", () => {
  // The original-report user had 4 quizzes including Photography
  // (subject="Photography", "Hindi", etc.) and 0 mocks. Legacy D5 = 60
  // because quizzes dominated the blend. Under v2: subject filter
  // excludes the irrelevant ones, ceiling caps at 40 if any relevant
  // remain — and if NONE are relevant, the dim is inactive.
  it("4 mixed quizzes (some Photography), 0 mocks → score capped at 40 if 3+ relevant", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Binary Search", 70),
        quiz("Photography", 80),
        quiz("Dynamic Programming", 60),
        quiz("System Design", 65),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.relevantQuizCount).toBe(3);
    expect(out.totalQuizzesSeen).toBe(4);
    expect(out.score).toBe(40); // capped
    expect(out.sourceQuality).toBe("quiz-proxy");
  });

  it("4 ALL-Photography quizzes → dim inactive (the harshest correction)", () => {
    const out = computePressurePerformanceStats({
      quizzes: [
        quiz("Photography", 80),
        quiz("Photography", 75),
        quiz("Hindi", 90),
        quiz("Physics", 70),
      ],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.relevantQuizCount).toBe(0);
    expect(out.ceiling).toBe(null);
    expect(out.score).toBe(null);
  });
});

// ── basis lines + shape ──────────────────────────────────────────────

describe("computePressurePerformanceStats — basis + shape", () => {
  it("inactive dim still produces basis lines surfacing the filter", () => {
    const out = computePressurePerformanceStats({
      quizzes: [quiz("Photography", 80), quiz("Hindi", 75)],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.basis).toEqual([
      "mocks_with_scores: 0",
      "relevant_quizzes: 0",
      "total_quizzes_seen: 2",
      "source_quality: inactive",
    ]);
  });

  it("active dim basis includes ceiling + sourceQuality", () => {
    const out = computePressurePerformanceStats({
      interviews: [mock({ communicationClarity: 8 })],
      mapQuizSubjectToDimensions: mapQuizSubjectToDimensionsStub,
    });
    expect(out.basis).toContain("source_quality: live-only");
    expect(out.basis).toContain("ceiling: 80");
  });

  it("throws when mapQuizSubjectToDimensions is not a function", () => {
    expect(() => computePressurePerformanceStats({})).toThrow(
      /mapQuizSubjectToDimensions/,
    );
  });
});

// ── Tunable constants are sane ───────────────────────────────────────

describe("exposed constants", () => {
  it("min-N thresholds are sane", () => {
    expect(MIN_QUIZ_N_RELEVANT).toBe(3);
    expect(MIN_LIVE_N).toBe(1);
    expect(MIN_STABLE_N).toBe(3);
  });

  it("ceiling progression matches research", () => {
    expect(CEILING_QUIZ).toBe(40);
    expect(CEILING_LIVE).toBe(80);
    expect(CEILING_STABLE).toBe(100);
    expect(CEILING_QUIZ).toBeLessThan(CEILING_LIVE);
    expect(CEILING_LIVE).toBeLessThan(CEILING_STABLE);
  });
});

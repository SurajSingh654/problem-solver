// ============================================================================
// verificationStats — D10 unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computeVerificationStats,
  classifySourceQuality,
  PROXY_ONLY_CEILING,
  MULTI_SIGNAL_CEILING,
  STRONG_SIGNAL_CEILING,
  ACTIVATION_MIN_REVIEWS,
  MULTI_SIGNAL_MIN_REVIEWS,
  STRONG_SIGNAL_MIN_FOLLOWUPS,
  PROBE_DEFENSE_FLOOR,
} from "../../src/utils/verificationStats.js";

// ── Tiny fixture builders ────────────────────────────────────────────

function review({
  codeCorrectness = 7,
  timeCorrect = true,
  spaceCorrect = true,
  wrongPattern = false,
  followUpScores = [],
} = {}) {
  return {
    dimensionScores: { codeCorrectness },
    complexityCheck: { timeCorrect, spaceCorrect },
    flags: { wrongPattern },
    followUpEvaluations: followUpScores.map((score, i) => ({
      questionId: `fu-${i}`,
      score,
      feedback: "ok",
    })),
  };
}

function sol({
  category = "CODING",
  confidence = 4,
  ai = review(),
} = {}) {
  return {
    id: `sol-${Math.random().toString(36).slice(2, 8)}`,
    confidence,
    aiFeedback: ai ? [ai] : null,
    problem: { category },
  };
}

function mock({
  foundEdgeCasesIndependently = false,
} = {}) {
  return {
    debrief: {
      behavioralSignals: {
        foundEdgeCasesIndependently,
      },
    },
  };
}

// ── Source-tier classification ───────────────────────────────────────

describe("classifySourceQuality", () => {
  it("returns 'proxy-only' below multi-signal floor", () => {
    expect(classifySourceQuality({ reviewCount: 5, followUpCount: 0, complexityCheckCount: 0 })).toBe("proxy-only");
    expect(classifySourceQuality({ reviewCount: 9, followUpCount: 0, complexityCheckCount: 5 })).toBe("proxy-only");
  });

  it("returns 'multi-signal' at ≥10 reviews + complexity data", () => {
    expect(classifySourceQuality({ reviewCount: 10, followUpCount: 0, complexityCheckCount: 5 })).toBe("multi-signal");
    expect(classifySourceQuality({ reviewCount: 20, followUpCount: 2, complexityCheckCount: 10 })).toBe("multi-signal");
  });

  it("returns 'strong-signal' at ≥10 reviews + ≥3 follow-ups", () => {
    expect(classifySourceQuality({ reviewCount: 10, followUpCount: 3, complexityCheckCount: 10 })).toBe("strong-signal");
    expect(classifySourceQuality({ reviewCount: 30, followUpCount: 15, complexityCheckCount: 25 })).toBe("strong-signal");
  });
});

describe("ceilingForSourceQuality", () => {
  it("ceilings are monotonically increasing", () => {
    expect(PROXY_ONLY_CEILING).toBeLessThan(MULTI_SIGNAL_CEILING);
    expect(MULTI_SIGNAL_CEILING).toBeLessThan(STRONG_SIGNAL_CEILING);
  });
});

// ── Activation ──────────────────────────────────────────────────────

describe("computeVerificationStats — activation", () => {
  it("inactive when no solutions", () => {
    const r = computeVerificationStats({ solutions: [], mocks: [] });
    expect(r.active).toBe(false);
    expect(r.score).toBeNull();
    expect(r.ci).toBeNull();
  });

  it("inactive when below ACTIVATION_MIN_REVIEWS", () => {
    const sols = Array(ACTIVATION_MIN_REVIEWS - 1).fill(0).map(() => sol());
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.active).toBe(false);
  });

  it("active at exactly ACTIVATION_MIN_REVIEWS", () => {
    const sols = Array(ACTIVATION_MIN_REVIEWS).fill(0).map(() => sol());
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.active).toBe(true);
    expect(r.score).not.toBeNull();
  });

  it("solutions without aiFeedback are excluded from reviewCount", () => {
    const sols = [
      sol({ ai: review() }),
      sol({ ai: review() }),
      sol({ ai: null }),
      sol({ ai: null }),
      sol({ ai: null }),
    ];
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.reviewCount).toBe(2);
    expect(r.active).toBe(false); // 2 < 5
  });

  it("non-CODING solutions are excluded", () => {
    const sols = [
      sol({ category: "HR", ai: review() }),
      sol({ category: "HR", ai: review() }),
      sol({ category: "HR", ai: review() }),
      sol({ category: "HR", ai: review() }),
      sol({ category: "HR", ai: review() }),
    ];
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.reviewCount).toBe(0);
    expect(r.active).toBe(false);
  });
});

// ── Source-tier ceiling enforcement ─────────────────────────────────

describe("computeVerificationStats — source-tier ceiling", () => {
  it("proxy-only tier caps score at PROXY_ONLY_CEILING (40)", () => {
    // 5 reviews, perfect calibration + complexity but no follow-ups, no mocks.
    const sols = Array(5).fill(0).map(() => sol({
      confidence: 5,
      ai: review({ codeCorrectness: 10, timeCorrect: true, spaceCorrect: true }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.sourceQuality).toBe("proxy-only");
    expect(r.score).toBeLessThanOrEqual(PROXY_ONLY_CEILING);
  });

  it("multi-signal tier caps at MULTI_SIGNAL_CEILING (75)", () => {
    const sols = Array(10).fill(0).map(() => sol({
      confidence: 5,
      ai: review({ codeCorrectness: 10, timeCorrect: true, spaceCorrect: true }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.sourceQuality).toBe("multi-signal");
    expect(r.score).toBeLessThanOrEqual(MULTI_SIGNAL_CEILING);
    expect(r.score).toBeGreaterThan(PROXY_ONLY_CEILING);
  });

  it("strong-signal tier allows score up to 100", () => {
    const sols = Array(10).fill(0).map(() => sol({
      confidence: 5,
      ai: review({
        codeCorrectness: 10,
        timeCorrect: true,
        spaceCorrect: true,
        followUpScores: [9, 9, 9],
      }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.sourceQuality).toBe("strong-signal");
    expect(r.score).toBeLessThanOrEqual(STRONG_SIGNAL_CEILING);
    expect(r.score).toBeGreaterThan(MULTI_SIGNAL_CEILING);
  });

  it("score sits inside CI band (asymmetric clamp)", () => {
    const sols = [
      sol({ confidence: 5, ai: review({ codeCorrectness: 10 }) }),
      sol({ confidence: 5, ai: review({ codeCorrectness: 4 }) }),
      sol({ confidence: 3, ai: review({ codeCorrectness: 6 }) }),
      sol({ confidence: 4, ai: review({ codeCorrectness: 7 }) }),
      sol({ confidence: 2, ai: review({ codeCorrectness: 5 }) }),
    ];
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.active).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(r.ci[0]);
    expect(r.score).toBeLessThanOrEqual(r.ci[1]);
    expect(r.ci[1]).toBeLessThanOrEqual(r.ceiling);
  });
});

// ── Sub-component effects ──────────────────────────────────────────

describe("computeVerificationStats — calibration accuracy", () => {
  it("perfect calibration (conf/5 == aiCorrect/10) produces 100 calibration", () => {
    // confidence=5 → 1.0 normalized; codeCorrectness=10 → 1.0 normalized
    const sols = Array(5).fill(0).map(() => sol({
      confidence: 5,
      ai: review({ codeCorrectness: 10 }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.calibrationDelta).toBe(0);
    expect(r.calibrationScore).toBe(100);
  });

  it("max miscalibration produces 0 calibration", () => {
    // confidence=5 → 1.0 normalized; codeCorrectness=1 → 0.1 normalized; delta = 0.9
    const sols = Array(5).fill(0).map(() => sol({
      confidence: 5,
      ai: review({ codeCorrectness: 1 }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.calibrationDelta).toBeCloseTo(0.9, 1);
    expect(r.calibrationScore).toBeLessThan(20);
  });
});

describe("computeVerificationStats — complexity verification", () => {
  it("100% timeCorrect && spaceCorrect produces complexityScore=100", () => {
    const sols = Array(5).fill(0).map(() => sol({
      ai: review({ timeCorrect: true, spaceCorrect: true }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.complexityScore).toBe(100);
  });

  it("0% complexity correct produces complexityScore=0", () => {
    const sols = Array(5).fill(0).map(() => sol({
      ai: review({ timeCorrect: false, spaceCorrect: false }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.complexityScore).toBe(0);
  });

  it("partial correctness (time only) doesn't count as full pass", () => {
    const sols = Array(5).fill(0).map(() => sol({
      ai: review({ timeCorrect: true, spaceCorrect: false }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.complexityScore).toBe(0);
  });
});

describe("computeVerificationStats — pattern accuracy", () => {
  it("0 wrongPattern flags produces 100", () => {
    const sols = Array(5).fill(0).map(() => sol({
      ai: review({ wrongPattern: false }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.patternAccuracyScore).toBe(100);
  });

  it("all wrongPattern flags produces 0", () => {
    const sols = Array(5).fill(0).map(() => sol({
      ai: review({ wrongPattern: true }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.patternAccuracyScore).toBe(0);
    expect(r.wrongPatternCount).toBe(5);
  });
});

describe("computeVerificationStats — probe defense", () => {
  it("all follow-ups ≥ floor produces 100", () => {
    const sols = Array(5).fill(0).map(() => sol({
      ai: review({ followUpScores: [PROBE_DEFENSE_FLOOR + 1, PROBE_DEFENSE_FLOOR + 1] }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.probeDefenseScore).toBe(100);
    expect(r.followUpCount).toBe(10);
  });

  it("all follow-ups below floor produces 0", () => {
    const sols = Array(5).fill(0).map(() => sol({
      ai: review({ followUpScores: [PROBE_DEFENSE_FLOOR - 1, PROBE_DEFENSE_FLOOR - 1] }),
    }));
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.probeDefenseScore).toBe(0);
  });
});

describe("computeVerificationStats — edge case independence", () => {
  it("100% mocks with foundEdgeCasesIndependently produces edgeCaseScore=100", () => {
    const sols = Array(5).fill(0).map(() => sol());
    const mocks = [
      mock({ foundEdgeCasesIndependently: true }),
      mock({ foundEdgeCasesIndependently: true }),
    ];
    const r = computeVerificationStats({ solutions: sols, mocks });
    expect(r.edgeCaseScore).toBe(100);
    expect(r.mockCount).toBe(2);
  });

  it("0% edge-case independence produces 0", () => {
    const sols = Array(5).fill(0).map(() => sol());
    const mocks = [
      mock({ foundEdgeCasesIndependently: false }),
      mock({ foundEdgeCasesIndependently: false }),
    ];
    const r = computeVerificationStats({ solutions: sols, mocks });
    expect(r.edgeCaseScore).toBe(0);
  });

  it("no mocks → edgeCaseScore=0 and mockCount=0", () => {
    const sols = Array(5).fill(0).map(() => sol());
    const r = computeVerificationStats({ solutions: sols, mocks: [] });
    expect(r.edgeCaseScore).toBe(0);
    expect(r.mockCount).toBe(0);
  });
});

// ── Constants ────────────────────────────────────────────────────────

describe("verificationStats constants", () => {
  it("activation thresholds are sane", () => {
    expect(ACTIVATION_MIN_REVIEWS).toBeLessThan(MULTI_SIGNAL_MIN_REVIEWS);
    expect(STRONG_SIGNAL_MIN_FOLLOWUPS).toBeGreaterThanOrEqual(3);
  });

  it("PROBE_DEFENSE_FLOOR is in the 1-10 range", () => {
    expect(PROBE_DEFENSE_FLOOR).toBeGreaterThanOrEqual(1);
    expect(PROBE_DEFENSE_FLOOR).toBeLessThanOrEqual(10);
  });
});

// ============================================================================
// behavioralPerformanceStats — D9 unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computeBehavioralPerformanceStats,
  classifySourceQuality,
  ceilingForSourceQuality,
  DRAFT_ONLY_CEILING,
  MOCK_VALIDATED_CEILING,
  DIVERSIFIED_CEILING,
  MOCK_VALIDATED_MIN_MOCKS,
  DIVERSIFIED_MIN_MOCKS,
  DIVERSIFIED_MIN_STYLES,
  ACTIVATION_MIN_HR_SOLUTIONS,
  HR_SATURATION,
  STYLE_SATURATION,
  VERDICT_TO_SCORE_100,
} from "../../src/utils/behavioralPerformanceStats.js";

// ── Tiny fixture builders ────────────────────────────────────────────

function mock({
  verdict = "HIRE",
  interviewStyle = "ALGORITHM_FOCUSED",
  preSessionConfidence = null,
  clarifyingQuestions = "0 questions asked",
  hintsRequired = "0 hints",
  thoughtOutLoud = false,
  identifiedComplexityIndependently = false,
  foundEdgeCasesIndependently = false,
} = {}) {
  return {
    id: `mock-${Math.random().toString(36).slice(2, 8)}`,
    interviewStyle,
    preSessionConfidence,
    debrief: {
      verdict,
      behavioralSignals: {
        clarifyingQuestions,
        hintsRequired,
        thoughtOutLoud,
        identifiedComplexityIndependently,
        foundEdgeCasesIndependently,
      },
    },
  };
}

// ── Source-tier classification ───────────────────────────────────────

describe("classifySourceQuality", () => {
  it("returns 'draft-only' below mock-validated floor", () => {
    expect(classifySourceQuality({ mockCount: 0, distinctStyleCount: 0 })).toBe("draft-only");
    expect(classifySourceQuality({ mockCount: 2, distinctStyleCount: 1 })).toBe("draft-only");
  });

  it("returns 'mock-validated' at ≥3 mocks, below diversified threshold", () => {
    expect(classifySourceQuality({ mockCount: 3, distinctStyleCount: 1 })).toBe("mock-validated");
    expect(classifySourceQuality({ mockCount: 5, distinctStyleCount: 2 })).toBe("mock-validated");
  });

  it("returns 'diversified' at ≥5 mocks AND ≥3 styles", () => {
    expect(classifySourceQuality({ mockCount: 5, distinctStyleCount: 3 })).toBe("diversified");
    expect(classifySourceQuality({ mockCount: 10, distinctStyleCount: 6 })).toBe("diversified");
  });

  it("does NOT promote to diversified if styles < 3 even with high mock count", () => {
    expect(classifySourceQuality({ mockCount: 20, distinctStyleCount: 2 })).toBe("mock-validated");
  });
});

describe("ceilingForSourceQuality", () => {
  it("maps each tier to its ceiling", () => {
    expect(ceilingForSourceQuality("draft-only")).toBe(DRAFT_ONLY_CEILING);
    expect(ceilingForSourceQuality("mock-validated")).toBe(MOCK_VALIDATED_CEILING);
    expect(ceilingForSourceQuality("diversified")).toBe(DIVERSIFIED_CEILING);
  });

  it("ceilings are monotonically increasing", () => {
    expect(DRAFT_ONLY_CEILING).toBeLessThan(MOCK_VALIDATED_CEILING);
    expect(MOCK_VALIDATED_CEILING).toBeLessThan(DIVERSIFIED_CEILING);
  });
});

// ── Activation ──────────────────────────────────────────────────────

describe("computeBehavioralPerformanceStats — activation", () => {
  it("inactive when no mocks and no HR solutions", () => {
    const r = computeBehavioralPerformanceStats({ mocks: [], hrSolutionCount: 0 });
    expect(r.active).toBe(false);
    expect(r.score).toBeNull();
    expect(r.ci).toBeNull();
  });

  it("inactive with HR solutions below ACTIVATION_MIN_HR_SOLUTIONS and no mocks", () => {
    const r = computeBehavioralPerformanceStats({ mocks: [], hrSolutionCount: 2 });
    expect(r.active).toBe(false);
  });

  it("active with ≥1 mock (regardless of HR)", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [mock({ verdict: "HIRE" })],
      hrSolutionCount: 0,
    });
    expect(r.active).toBe(true);
    expect(r.score).not.toBeNull();
  });

  it("active with no mocks but ≥3 HR solutions (HR-only path)", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [],
      hrSolutionCount: ACTIVATION_MIN_HR_SOLUTIONS,
    });
    expect(r.active).toBe(true);
    expect(r.sourceQuality).toBe("draft-only");
    expect(r.ceiling).toBe(DRAFT_ONLY_CEILING);
  });

  it("mocks without debrief are excluded from mockCount", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        { id: "x", interviewStyle: "ALGORITHM_FOCUSED", debrief: null },
        { id: "y", interviewStyle: "ALGORITHM_FOCUSED", debrief: { verdict: null } },
      ],
      hrSolutionCount: 0,
    });
    expect(r.mockCount).toBe(0);
  });
});

// ── Source-tier ceiling enforcement ─────────────────────────────────

describe("computeBehavioralPerformanceStats — source-tier ceiling", () => {
  it("draft-only tier (HR-only) caps score at DRAFT_ONLY_CEILING (30)", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [],
      hrSolutionCount: 10, // capped at saturation, still draft-only
    });
    expect(r.sourceQuality).toBe("draft-only");
    expect(r.score).toBeLessThanOrEqual(DRAFT_ONLY_CEILING);
  });

  it("mock-validated tier caps score at MOCK_VALIDATED_CEILING (70)", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        mock({ verdict: "STRONG_HIRE", thoughtOutLoud: true, foundEdgeCasesIndependently: true }),
        mock({ verdict: "STRONG_HIRE", thoughtOutLoud: true, foundEdgeCasesIndependently: true }),
        mock({ verdict: "STRONG_HIRE", thoughtOutLoud: true, foundEdgeCasesIndependently: true }),
      ],
      hrSolutionCount: 5,
    });
    expect(r.sourceQuality).toBe("mock-validated");
    expect(r.score).toBeLessThanOrEqual(MOCK_VALIDATED_CEILING);
  });

  it("diversified tier allows score up to 100", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        mock({ verdict: "STRONG_HIRE", interviewStyle: "ALGORITHM_FOCUSED", preSessionConfidence: 5, thoughtOutLoud: true, identifiedComplexityIndependently: true, foundEdgeCasesIndependently: true, clarifyingQuestions: "3 questions asked" }),
        mock({ verdict: "STRONG_HIRE", interviewStyle: "SYSTEM_FOCUSED", preSessionConfidence: 5, thoughtOutLoud: true, identifiedComplexityIndependently: true, foundEdgeCasesIndependently: true, clarifyingQuestions: "3 questions asked" }),
        mock({ verdict: "STRONG_HIRE", interviewStyle: "VALUES_DRIVEN", preSessionConfidence: 5, thoughtOutLoud: true, identifiedComplexityIndependently: true, foundEdgeCasesIndependently: true, clarifyingQuestions: "3 questions asked" }),
        mock({ verdict: "STRONG_HIRE", interviewStyle: "COLLABORATIVE", preSessionConfidence: 5, thoughtOutLoud: true, identifiedComplexityIndependently: true, foundEdgeCasesIndependently: true, clarifyingQuestions: "3 questions asked" }),
        mock({ verdict: "STRONG_HIRE", interviewStyle: "PRAGMATIC_STARTUP", preSessionConfidence: 5, thoughtOutLoud: true, identifiedComplexityIndependently: true, foundEdgeCasesIndependently: true, clarifyingQuestions: "3 questions asked" }),
      ],
      hrSolutionCount: 5,
    });
    expect(r.sourceQuality).toBe("diversified");
    expect(r.score).toBeGreaterThan(MOCK_VALIDATED_CEILING);
    expect(r.score).toBeLessThanOrEqual(DIVERSIFIED_CEILING);
  });

  it("score sits inside CI band (asymmetric clamp)", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        mock({ verdict: "STRONG_HIRE" }),
        mock({ verdict: "LEAN_NO_HIRE" }),
        mock({ verdict: "HIRE" }),
      ],
      hrSolutionCount: 0,
    });
    expect(r.active).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(r.ci[0]);
    expect(r.score).toBeLessThanOrEqual(r.ci[1]);
    expect(r.ci[1]).toBeLessThanOrEqual(r.ceiling);
  });
});

// ── Sub-component effects ──────────────────────────────────────────

describe("computeBehavioralPerformanceStats — verdict-based scoring", () => {
  it("STRONG_HIRE produces higher score than NO_HIRE", () => {
    const strong = computeBehavioralPerformanceStats({
      mocks: [mock({ verdict: "STRONG_HIRE" })],
      hrSolutionCount: 0,
    });
    const no = computeBehavioralPerformanceStats({
      mocks: [mock({ verdict: "NO_HIRE" })],
      hrSolutionCount: 0,
    });
    expect(strong.score).toBeGreaterThan(no.score);
  });

  it("verdict map is monotonic: STRONG_HIRE > HIRE > LEAN_HIRE > LEAN_NO_HIRE > NO_HIRE", () => {
    expect(VERDICT_TO_SCORE_100.STRONG_HIRE).toBeGreaterThan(VERDICT_TO_SCORE_100.HIRE);
    expect(VERDICT_TO_SCORE_100.HIRE).toBeGreaterThan(VERDICT_TO_SCORE_100.LEAN_HIRE);
    expect(VERDICT_TO_SCORE_100.LEAN_HIRE).toBeGreaterThan(VERDICT_TO_SCORE_100.LEAN_NO_HIRE);
    expect(VERDICT_TO_SCORE_100.LEAN_NO_HIRE).toBeGreaterThan(VERDICT_TO_SCORE_100.NO_HIRE);
  });
});

describe("computeBehavioralPerformanceStats — process signals", () => {
  it("all 5 behavioral fields positive produces high process score", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        mock({
          verdict: "HIRE",
          clarifyingQuestions: "3 questions asked",
          thoughtOutLoud: true,
          identifiedComplexityIndependently: true,
          foundEdgeCasesIndependently: true,
          hintsRequired: "0 hints",
        }),
      ],
      hrSolutionCount: 0,
    });
    expect(r.processScore).toBe(100);
  });

  it("all 5 behavioral fields negative produces 0 process score", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        mock({
          verdict: "HIRE",
          clarifyingQuestions: "0 questions asked",
          thoughtOutLoud: false,
          identifiedComplexityIndependently: false,
          foundEdgeCasesIndependently: false,
          hintsRequired: "5 hints",
        }),
      ],
      hrSolutionCount: 0,
    });
    expect(r.processScore).toBe(0);
  });
});

describe("computeBehavioralPerformanceStats — calibration (Kruger-Dunning)", () => {
  it("perfect calibration (preConfidence matches verdict band) produces 100 calibration", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        // STRONG_HIRE → band 5; preConfidence = 5; delta 0 → score 100
        mock({ verdict: "STRONG_HIRE", preSessionConfidence: 5 }),
      ],
      hrSolutionCount: 0,
    });
    expect(r.calibrationScore).toBe(100);
    expect(r.calibrationDelta).toBe(0);
  });

  it("max miscalibration (delta=4) produces 0 calibration", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        // NO_HIRE → band 1; preConfidence = 5; delta 4 → score 0
        mock({ verdict: "NO_HIRE", preSessionConfidence: 5 }),
      ],
      hrSolutionCount: 0,
    });
    expect(r.calibrationScore).toBe(0);
    expect(r.calibrationDelta).toBe(4);
  });

  it("calibration not computed when preSessionConfidence is null", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [mock({ verdict: "HIRE", preSessionConfidence: null })],
      hrSolutionCount: 0,
    });
    expect(r.calibrationDelta).toBeNull();
    expect(r.calibrationN).toBe(0);
  });
});

describe("computeBehavioralPerformanceStats — style diversity", () => {
  it("counts distinct interview styles", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        mock({ interviewStyle: "ALGORITHM_FOCUSED" }),
        mock({ interviewStyle: "ALGORITHM_FOCUSED" }),
        mock({ interviewStyle: "SYSTEM_FOCUSED" }),
        mock({ interviewStyle: "VALUES_DRIVEN" }),
      ],
      hrSolutionCount: 0,
    });
    expect(r.distinctStyleCount).toBe(3);
  });

  it("unknown/null styles don't count", () => {
    const r = computeBehavioralPerformanceStats({
      mocks: [
        mock({ interviewStyle: null }),
        mock({ interviewStyle: "ALGORITHM_FOCUSED" }),
      ],
      hrSolutionCount: 0,
    });
    expect(r.distinctStyleCount).toBe(1);
  });
});

describe("computeBehavioralPerformanceStats — HR practice", () => {
  it("HR practice score saturates at HR_SATURATION", () => {
    const atSaturation = computeBehavioralPerformanceStats({
      mocks: [mock()],
      hrSolutionCount: HR_SATURATION,
    });
    const beyondSaturation = computeBehavioralPerformanceStats({
      mocks: [mock()],
      hrSolutionCount: HR_SATURATION * 5,
    });
    // Once at saturation, additional HR doesn't increase score.
    expect(beyondSaturation.score).toBe(atSaturation.score);
  });
});

// ── Constants ────────────────────────────────────────────────────────

describe("behavioralPerformanceStats constants", () => {
  it("source-tier mock thresholds are monotonic", () => {
    expect(MOCK_VALIDATED_MIN_MOCKS).toBeLessThan(DIVERSIFIED_MIN_MOCKS);
    expect(DIVERSIFIED_MIN_STYLES).toBeGreaterThan(0);
  });

  it("HR + style saturation values are sane", () => {
    expect(HR_SATURATION).toBeGreaterThanOrEqual(3);
    expect(STYLE_SATURATION).toBeGreaterThanOrEqual(3);
  });
});

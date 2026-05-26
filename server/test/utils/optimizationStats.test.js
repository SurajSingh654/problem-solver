// ============================================================================
// optimizationStats — unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computeOptimizationStats,
  normalizeBigO,
  OPT_STATES,
  BRUTE_MIN_CHARS,
  OPTIMIZED_MIN_CHARS,
  CODE_CORRECTNESS_FLOOR,
  CALIBRATION_FLOOR,
  CALIBRATION_CEILING,
} from "../../src/utils/optimizationStats.js";
import { SOLVE_METHOD_REQUIRED_AFTER } from "../../src/utils/patternMastery.js";

// ── Fixture builders ─────────────────────────────────────────────────

const POST_DEPLOY = new Date(SOLVE_METHOD_REQUIRED_AFTER.getTime() + 86400000);
const PRE_DEPLOY = new Date(SOLVE_METHOD_REQUIRED_AFTER.getTime() - 86400000);

const longBrute = "x".repeat(BRUTE_MIN_CHARS);
const longOpt = "y".repeat(OPTIMIZED_MIN_CHARS);
const longRecall = "z".repeat(80);

function sol({
  id,
  solveMethod = "COLD",
  createdAt = POST_DEPLOY,
  bruteForce = longBrute,
  optimizedApproach = longOpt,
  timeComplexity = "O(n)",
  spaceComplexity = "O(1)",
  bruteForceMeta = null,
  codeCorrectness = null,
  complexityCheck = null,
  category = "CODING",
} = {}) {
  const review =
    codeCorrectness !== null || complexityCheck !== null
      ? {
          dimensionScores: { codeCorrectness },
          complexityCheck,
        }
      : null;
  return {
    id,
    solveMethod,
    createdAt,
    bruteForce,
    optimizedApproach,
    timeComplexity,
    spaceComplexity,
    bruteForceMeta,
    aiFeedback: review ? [review] : null,
    problem: { category },
  };
}

const ra = (solutionId, quality, recallText = null) => ({
  solutionId,
  quality,
  recallText,
});

const ccPass = {
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
  timeCorrect: true,
  spaceCorrect: true,
  optimizationNote: "Hashmap eliminates the inner loop's redundant work.",
};

// ── State transitions ────────────────────────────────────────────────

describe("computeOptimizationStats — state machine", () => {
  it("zero solutions → empty matrix, score 0", () => {
    const out = computeOptimizationStats({
      solutions: [],
      reviewAttempts: [],
    });
    expect(out.matrix).toHaveLength(0);
    expect(out.counts.optTotalCoding).toBe(0);
    expect(out.score).toBe(0);
  });

  it("one solution with both texts + COLD → DOCUMENTED", () => {
    const solutions = [sol({ id: "s1" })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    // No complexity declared and no codeCorrectness — stays DOCUMENTED
    // (but timeComplexity is set in default... fix:)
    // Actually default has timeComplexity O(n), spaceComplexity O(1), no AI.
    // Cold-start fallback: with complexity declared + no AI review →
    // OPTIMIZED. Update the test to match.
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });

  it("missing brute text → NONE", () => {
    const solutions = [sol({ id: "s1", bruteForce: "tiny" })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("NONE");
  });

  it("missing optimized text → NONE", () => {
    const solutions = [sol({ id: "s1", optimizedApproach: "tiny" })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("NONE");
  });

  it("DOCUMENTED + missing timeComplexity → stays DOCUMENTED", () => {
    const solutions = [sol({ id: "s1", timeComplexity: "" })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });

  it("DOCUMENTED + complexity declared + AI codeCorrectness 6 → stays DOCUMENTED (below floor)", () => {
    const solutions = [sol({ id: "s1", codeCorrectness: 6 })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });

  it("DOCUMENTED + complexity declared + AI codeCorrectness 8 → OPTIMIZED", () => {
    const solutions = [sol({ id: "s1", codeCorrectness: 8 })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });

  it("OPTIMIZED COLD-START FALLBACK: no AI review + complexity declared → OPTIMIZED", () => {
    // Highest-impact gap from Plan agent — solutions without AI review
    // (cold start, AI quota, opt-out) must not be stuck at DOCUMENTED.
    const solutions = [sol({ id: "s1" /* no codeCorrectness, no complexityCheck */ })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });

  it("OPTIMIZED + complexityCheck null → stays OPTIMIZED", () => {
    const solutions = [sol({ id: "s1", codeCorrectness: 8, complexityCheck: null })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });

  it("OPTIMIZED + complexityCheck { timeCorrect: true, spaceCorrect: false } → stays OPTIMIZED", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      complexityCheck: {
        ...ccPass,
        spaceCorrect: false,
      },
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });

  it('OPTIMIZED + complexityCheck { ..., optimizationNote: "" } → stays OPTIMIZED (empty string treated as absent)', () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      complexityCheck: { ...ccPass, optimizationNote: "" },
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });

  it('OPTIMIZED + complexityCheck { ..., optimizationNote: "   " } → stays OPTIMIZED (whitespace)', () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      complexityCheck: { ...ccPass, optimizationNote: "   " },
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });

  it("OPTIMIZED + complexityCheck Path A (full pass) → TRADE_OFF", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      complexityCheck: ccPass,
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("TRADE_OFF");
    expect(out.matrix[0].complexityCheckSignal).toBe(true);
  });

  it("OPTIMIZED + Path B: bruteForceMeta with DIFFERENT complexity → TRADE_OFF", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      timeComplexity: "O(n)",
      bruteForceMeta: { timeComplexity: "O(n²)" },
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("TRADE_OFF");
    expect(out.matrix[0].bruteMetaSignal).toBe(true);
  });

  it("TRADE_OFF + recall quality 3 → stays TRADE_OFF (need ≥4)", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      complexityCheck: ccPass,
    })];
    const reviewAttempts = [ra("s1", 3, longRecall)];
    const out = computeOptimizationStats({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("TRADE_OFF");
  });

  it("TRADE_OFF + recall quality 4 + recallText too short → stays TRADE_OFF", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      complexityCheck: ccPass,
    })];
    const reviewAttempts = [ra("s1", 4, "too short")]; // 9 chars
    const out = computeOptimizationStats({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("TRADE_OFF");
  });

  it("TRADE_OFF + recall quality 4 + recallText ≥80 → OWNED", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      complexityCheck: ccPass,
    })];
    const reviewAttempts = [ra("s1", 4, longRecall)];
    const out = computeOptimizationStats({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("OWNED");
    expect(out.counts.optAtOwned).toBe(1);
  });
});

// ── Big-O normalizer regression guards ──────────────────────────────

describe("computeOptimizationStats — big-O normalizer", () => {
  it("REGRESSION: 'O(n²)' === 'O(n^2)' (Path B does NOT promote)", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      timeComplexity: "O(n^2)",
      bruteForceMeta: { timeComplexity: "O(n²)" },
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    // Same complexity → no demonstrated improvement → stays OPTIMIZED
    expect(out.matrix[0].state).toBe("OPTIMIZED");
    expect(out.matrix[0].bruteMetaSignal).toBe(false);
  });

  it("REGRESSION: 'O(n*n)' === 'O(n^2)' (Path B does NOT promote)", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      timeComplexity: "O(n*n)",
      bruteForceMeta: { timeComplexity: "O(n^2)" },
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });

  it("REGRESSION: 'O(n*n)' vs 'O(n)' DOES promote (real improvement)", () => {
    const solutions = [sol({
      id: "s1",
      codeCorrectness: 8,
      timeComplexity: "O(n)",
      bruteForceMeta: { timeComplexity: "O(n*n)" },
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("TRADE_OFF");
  });

  it("normalizeBigO handles the canonical equivalences", () => {
    expect(normalizeBigO("O(n²)")).toBe(normalizeBigO("O(n^2)"));
    expect(normalizeBigO("O(n*n)")).toBe(normalizeBigO("O(n^2)"));
    expect(normalizeBigO("O(n log n)")).toBe(normalizeBigO("O(nlogn)"));
    expect(normalizeBigO("O(n*log(n))")).toBe(normalizeBigO("O(nlogn)"));
    // Non-equivalent
    expect(normalizeBigO("O(n)")).not.toBe(normalizeBigO("O(n^2)"));
    expect(normalizeBigO("O(log n)")).not.toBe(normalizeBigO("O(n)"));
  });

  it("normalizeBigO is robust to non-string input", () => {
    expect(normalizeBigO(null)).toBe("");
    expect(normalizeBigO(undefined)).toBe("");
    expect(normalizeBigO(42)).toBe("");
  });
});

// ── SAW_APPROACH hard cap ────────────────────────────────────────────

describe("computeOptimizationStats — SAW_APPROACH hard cap", () => {
  it("SAW_APPROACH + perfect everything → NONE (cannot earn DOCUMENTED+)", () => {
    const solutions = [sol({
      id: "s1",
      solveMethod: "SAW_APPROACH",
      codeCorrectness: 10,
      complexityCheck: ccPass,
      bruteForceMeta: { timeComplexity: "O(n²)" },
    })];
    const reviewAttempts = [ra("s1", 5, longRecall)];
    const out = computeOptimizationStats({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("NONE");
  });
});

// ── solveMethod NULL policy ──────────────────────────────────────────

describe("computeOptimizationStats — solveMethod NULL policy", () => {
  it("Pre-deploy NULL solveMethod + everything else valid → OPTIMIZED+", () => {
    const solutions = [sol({
      id: "s1",
      solveMethod: null,
      createdAt: PRE_DEPLOY,
      codeCorrectness: 8,
      complexityCheck: ccPass,
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("TRADE_OFF");
  });

  it("Post-deploy NULL solveMethod → NONE", () => {
    const solutions = [sol({
      id: "s1",
      solveMethod: null,
      createdAt: POST_DEPLOY,
      codeCorrectness: 8,
      complexityCheck: ccPass,
    })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("NONE");
  });

  it("HINTS solveMethod is qualifying", () => {
    const solutions = [sol({ id: "s1", solveMethod: "HINTS", codeCorrectness: 8 })];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("OPTIMIZED");
  });
});

// ── Coding-only filter ───────────────────────────────────────────────

describe("computeOptimizationStats — coding-only filter", () => {
  it("BEHAVIORAL solutions are excluded", () => {
    const solutions = [
      sol({ id: "s1", category: "BEHAVIORAL", codeCorrectness: 9, complexityCheck: ccPass }),
      sol({ id: "s2", category: "CODING" }),
    ];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.counts.optTotalCoding).toBe(1);
    expect(out.matrix).toHaveLength(1);
    expect(out.matrix[0].solutionId).toBe("s2");
  });
});

// ── Calibration multiplier ───────────────────────────────────────────

describe("computeOptimizationStats — calibration multiplier", () => {
  it("severe miscalibration clamps at floor 0.70", () => {
    const solutions = [sol({ id: "s1", codeCorrectness: 8 })];
    const out = computeOptimizationStats({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 0.30,
    });
    expect(out.calibrationModifier).toBe(CALIBRATION_FLOOR);
  });

  it("perfect calibration clamps at ceiling 1.00", () => {
    const solutions = [sol({ id: "s1", codeCorrectness: 8 })];
    const out = computeOptimizationStats({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 1.00,
    });
    expect(out.calibrationModifier).toBe(CALIBRATION_CEILING);
  });

  it("null metacog defaults to 1.00 (no penalty for cold-start users)", () => {
    const solutions = [sol({ id: "s1", codeCorrectness: 8 })];
    const out = computeOptimizationStats({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: null,
    });
    expect(out.calibrationModifier).toBe(1.00);
  });

  it("score = round(baseScore × calibrationModifier)", () => {
    const solutions = [
      sol({ id: "s1", codeCorrectness: 8, complexityCheck: ccPass }), // TRADE_OFF (75)
      sol({ id: "s2", codeCorrectness: 8, complexityCheck: ccPass }), // TRADE_OFF (75)
    ];
    const out = computeOptimizationStats({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 0.80,
    });
    // baseScore = 75, modifier = 0.80 → score = 60
    expect(out.score).toBe(60);
  });
});

// ── Original-report user fixture ─────────────────────────────────────

describe("computeOptimizationStats — original-report user fixture", () => {
  // 4 solutions with mixed signal: some have brute+optimized text, some
  // have AI codeCorrectness, none have complexityCheck or bruteForceMeta
  // (the v2 trade-off signals). Score should be in expected band; tier
  // gates fail.
  it("4 mixed solutions: stuck at OPTIMIZED across the board, no TRADE_OFF", () => {
    const solutions = [
      sol({ id: "s1", createdAt: PRE_DEPLOY, solveMethod: null, codeCorrectness: 7 }),
      sol({ id: "s2", createdAt: PRE_DEPLOY, solveMethod: null, codeCorrectness: 8 }),
      sol({ id: "s3", createdAt: PRE_DEPLOY, solveMethod: null, codeCorrectness: 7 }),
      sol({ id: "s4", createdAt: PRE_DEPLOY, solveMethod: null, codeCorrectness: 6 }),
    ];
    const out = computeOptimizationStats({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 0.85,
    });
    // s1, s2, s3 → OPTIMIZED (50). s4 → DOCUMENTED (codeCorrectness=6 < 7).
    // baseScore = (50 + 50 + 50 + 25) / 4 = 43.75
    expect(out.baseScore).toBe(44);
    // calibrationModifier = clamp(0.85, 0.70, 1.00) = 0.85
    // score = round(44 × 0.85) = 37
    expect(out.score).toBeLessThan(50);
    expect(out.counts.optAtTradeOffOrAbove).toBe(0);
    expect(out.counts.optAtOwned).toBe(0);
  });

  it("does not satisfy Tier 2's mastery gate (optAtTradeOffOrAbove ≥4)", () => {
    const solutions = [
      sol({ id: "s1", createdAt: PRE_DEPLOY, solveMethod: null, codeCorrectness: 8 }),
      sol({ id: "s2", createdAt: PRE_DEPLOY, solveMethod: null, codeCorrectness: 8 }),
      sol({ id: "s3", createdAt: PRE_DEPLOY, solveMethod: null, codeCorrectness: 8 }),
      sol({ id: "s4", createdAt: PRE_DEPLOY, solveMethod: null, codeCorrectness: 8 }),
    ];
    const out = computeOptimizationStats({ solutions, reviewAttempts: [] });
    expect(out.counts.optAtTradeOffOrAbove).toBeLessThan(4);
  });
});

// ── Counts + state distribution ──────────────────────────────────────

describe("computeOptimizationStats — counts + state distribution", () => {
  it("counts all 5 states correctly with mixed solutions", () => {
    const solutions = [
      sol({ id: "s1", solveMethod: "SAW_APPROACH" }),                                      // NONE
      sol({ id: "s2", bruteForce: "tiny" }),                                               // NONE
      sol({ id: "s3" /* default: optimized via cold-start */ }),                           // OPTIMIZED
      sol({ id: "s4", codeCorrectness: 8 }),                                                // OPTIMIZED
      sol({ id: "s5", codeCorrectness: 8, complexityCheck: ccPass }),                       // TRADE_OFF
      sol({ id: "s6", codeCorrectness: 8, complexityCheck: ccPass }),                       // OWNED
      sol({ id: "s7", timeComplexity: "" }),                                                // DOCUMENTED
    ];
    const reviewAttempts = [ra("s6", 4, longRecall)];
    const out = computeOptimizationStats({ solutions, reviewAttempts });

    expect(out.counts.optAtNone).toBe(2);
    expect(out.counts.optAtDocumented).toBe(1);
    expect(out.counts.optAtOptimized).toBe(2);
    expect(out.counts.optAtTradeOff).toBe(1);
    expect(out.counts.optAtOwned).toBe(1);

    expect(out.counts.optAtDocumentedOrAbove).toBe(5);
    expect(out.counts.optAtOptimizedOrAbove).toBe(4);
    expect(out.counts.optAtTradeOffOrAbove).toBe(2);
    expect(out.counts.optAtOwnedOrAbove).toBe(1);
    expect(out.counts.optTotalCoding).toBe(7);
  });
});

// ── Smoke check on exposed constants ─────────────────────────────────

describe("OPT_STATES + tunables", () => {
  it("exposes 5 states with monotonically increasing points", () => {
    expect(OPT_STATES.NONE.points).toBe(0);
    expect(OPT_STATES.DOCUMENTED.points).toBe(25);
    expect(OPT_STATES.OPTIMIZED.points).toBe(50);
    expect(OPT_STATES.TRADE_OFF.points).toBe(75);
    expect(OPT_STATES.OWNED.points).toBe(100);
  });

  it("tunables are sane", () => {
    expect(BRUTE_MIN_CHARS).toBeGreaterThanOrEqual(80);
    expect(OPTIMIZED_MIN_CHARS).toBeGreaterThanOrEqual(80);
    expect(CODE_CORRECTNESS_FLOOR).toBeGreaterThanOrEqual(7);
    expect(CALIBRATION_FLOOR).toBeLessThan(CALIBRATION_CEILING);
  });
});

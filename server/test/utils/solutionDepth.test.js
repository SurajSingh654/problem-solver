// ============================================================================
// solutionDepth — unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computeSolutionDepth,
  DEPTH_STATES,
  INSIGHT_MIN_CHARS,
  FEYNMAN_MIN_CHARS,
  UNDERSTANDING_FLOOR,
  FOLLOWUP_FLOOR,
  RECALL_QUALITY_FLOOR,
  RECALL_TEXT_FLOOR,
  CALIBRATION_FLOOR,
  CALIBRATION_CEILING,
} from "../../src/utils/solutionDepth.js";
import { SOLVE_METHOD_REQUIRED_AFTER } from "../../src/utils/patternMastery.js";

// ── Fixture builders ─────────────────────────────────────────────────
// Helpers that produce Solution-shaped objects with sensible defaults.
// Tests override only the fields they care about.

const POST_DEPLOY = new Date(SOLVE_METHOD_REQUIRED_AFTER.getTime() + 86400000);
const PRE_DEPLOY = new Date(SOLVE_METHOD_REQUIRED_AFTER.getTime() - 86400000);

const longInsight = "x".repeat(INSIGHT_MIN_CHARS);   // exactly meets threshold
const longFeynman = "y".repeat(FEYNMAN_MIN_CHARS);
const longRecall = "z".repeat(RECALL_TEXT_FLOOR);

function sol({
  id,
  solveMethod = "COLD",
  createdAt = POST_DEPLOY,
  insight = longInsight,
  feynman = longFeynman,
  realWorld = "real world note",
  understandingDepth = null,
  overconfidence = false,
  followUpScores = [],         // array of numbers (1-10)
  category = "CODING",
} = {}) {
  const review = (understandingDepth !== null || overconfidence || followUpScores.length > 0)
    ? {
        dimensionScores: { understandingDepth },
        flags: { overconfidenceDetected: overconfidence },
        followUpEvaluations: followUpScores.map((s, i) => ({
          questionId: `fu-${i}`,
          score: s,
          feedback: "stub",
        })),
      }
    : null;
  return {
    id,
    solveMethod,
    createdAt,
    keyInsight: insight,
    feynmanExplanation: feynman,
    realWorldConnection: realWorld,
    aiFeedback: review ? [review] : null,
    problem: { category },
  };
}

const ra = (solutionId, quality, recallText = null) => ({
  solutionId,
  quality,
  recallText,
});

// ── State transitions ────────────────────────────────────────────────

describe("computeSolutionDepth — state machine", () => {
  it("zero solutions → all counts 0, score 0", () => {
    const out = computeSolutionDepth({ solutions: [], reviewAttempts: [] });
    expect(out.matrix).toHaveLength(0);
    expect(out.counts.totalCoding).toBe(0);
    expect(out.counts.solutionsAtDocumentedOrAbove).toBe(0);
    expect(out.baseScore).toBe(0);
    expect(out.score).toBe(0);
  });

  it("one solution with reflective text + COLD → DOCUMENTED", () => {
    const solutions = [sol({ id: "s1" })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
    expect(out.counts.solutionsAtDocumented).toBe(1);
    expect(out.counts.solutionsAtDocumentedOrAbove).toBe(1);
  });

  it("DOCUMENTED + low understandingDepth (<7) → stays DOCUMENTED", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 6 })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });

  it("DOCUMENTED + high understandingDepth + overconfidence flag → stays DOCUMENTED", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 9, overconfidence: true })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });

  it("DOCUMENTED + high understandingDepth + no flag → EXPLAINED", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8 })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("EXPLAINED");
  });

  it("EXPLAINED + follow-up score 6 → stays EXPLAINED", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8, followUpScores: [6] })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("EXPLAINED");
  });

  it("EXPLAINED + follow-up score 7 → DEFENDED", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8, followUpScores: [7] })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DEFENDED");
    expect(out.matrix[0].defendedByFollowUp).toBe(true);
  });

  it("EXPLAINED + multiple follow-ups, ANY ≥7 → DEFENDED", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8, followUpScores: [3, 5, 8] })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DEFENDED");
  });

  it("DEFENDED + recall quality=3 → stays DEFENDED (need ≥4)", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8, followUpScores: [8] })];
    const reviewAttempts = [ra("s1", 3, longRecall)];
    const out = computeSolutionDepth({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("DEFENDED");
    expect(out.matrix[0].recallSuccess).toBe(false);
  });

  it("DEFENDED + recall quality=4 + recallText too short → stays DEFENDED", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8, followUpScores: [8] })];
    const reviewAttempts = [ra("s1", 4, "too short")];  // 9 chars < RECALL_TEXT_FLOOR=80
    const out = computeSolutionDepth({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("DEFENDED");
  });

  it("DEFENDED + recall quality=4 + recallText ≥80 chars → OWNED", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8, followUpScores: [8] })];
    const reviewAttempts = [ra("s1", 4, longRecall)];
    const out = computeSolutionDepth({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("OWNED");
    expect(out.matrix[0].recallSuccess).toBe(true);
    expect(out.counts.solutionsAtOwned).toBe(1);
    expect(out.counts.solutionsAtOwnedOrAbove).toBe(1);
  });

  it("DEFENDED + recall quality=5 + recallText ≥80 chars → OWNED (5 also passes ≥4 floor)", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8, followUpScores: [8] })];
    const reviewAttempts = [ra("s1", 5, longRecall)];
    const out = computeSolutionDepth({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("OWNED");
  });

  it("OWNED + multiple recall attempts (one failed, one passed) → OWNED (any pass)", () => {
    const solutions = [sol({ id: "s1", understandingDepth: 8, followUpScores: [8] })];
    const reviewAttempts = [
      ra("s1", 2, longRecall), // failed
      ra("s1", 4, longRecall), // passed
    ];
    const out = computeSolutionDepth({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("OWNED");
  });
});

// ── SAW_APPROACH hard cap ────────────────────────────────────────────

describe("computeSolutionDepth — SAW_APPROACH hard cap", () => {
  it("SAW_APPROACH + perfect everything → NONE (cannot earn DOCUMENTED+)", () => {
    const solutions = [sol({
      id: "s1",
      solveMethod: "SAW_APPROACH",
      understandingDepth: 10,
      followUpScores: [10, 10],
    })];
    const reviewAttempts = [ra("s1", 5, longRecall)];
    const out = computeSolutionDepth({ solutions, reviewAttempts });
    expect(out.matrix[0].state).toBe("NONE");
    expect(out.matrix[0].hasReflective).toBe(true); // text was there, just not credited
  });
});

// ── solveMethod NULL policy ──────────────────────────────────────────

describe("computeSolutionDepth — solveMethod NULL policy", () => {
  it("Pre-deploy NULL solveMethod + reflective text → DOCUMENTED-eligible", () => {
    const solutions = [sol({
      id: "s1",
      solveMethod: null,
      createdAt: PRE_DEPLOY,
    })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });

  it("Post-deploy NULL solveMethod + reflective text → NONE", () => {
    const solutions = [sol({
      id: "s1",
      solveMethod: null,
      createdAt: POST_DEPLOY,
    })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("NONE");
  });

  it("HINTS solveMethod is qualifying (DOCUMENTED-eligible)", () => {
    const solutions = [sol({ id: "s1", solveMethod: "HINTS" })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });
});

// ── Documented gate (insight + feynman, NOT all 3) ───────────────────

describe("computeSolutionDepth — DOCUMENTED gate", () => {
  it("missing keyInsight → NONE", () => {
    const solutions = [sol({ id: "s1", insight: "tiny" })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("NONE");
  });

  it("missing feynmanExplanation → NONE", () => {
    const solutions = [sol({ id: "s1", feynman: "tiny" })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("NONE");
  });

  it("missing realWorldConnection but insight + feynman present → DOCUMENTED (realWorld optional)", () => {
    const solutions = [sol({ id: "s1", realWorld: "" })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });

  it("HTML wrapping in keyInsight is stripped before length check", () => {
    // 60 chars of `x` wrapped in HTML — should still be DOCUMENTED.
    const wrapped = `<p><strong>${"x".repeat(60)}</strong></p>`;
    const solutions = [sol({ id: "s1", insight: wrapped })];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });
});

// ── Coding-only filter ───────────────────────────────────────────────

describe("computeSolutionDepth — coding-only filter", () => {
  it("BEHAVIORAL solutions are excluded (totalCoding only counts CODING)", () => {
    const solutions = [
      sol({ id: "s1", category: "BEHAVIORAL", understandingDepth: 9, followUpScores: [9] }),
      sol({ id: "s2", category: "CODING" }),
    ];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.counts.totalCoding).toBe(1);
    expect(out.matrix).toHaveLength(1);
    expect(out.matrix[0].solutionId).toBe("s2");
  });

  it("missing problem.category treated as CODING (legacy default)", () => {
    const solutions = [{
      id: "s1",
      solveMethod: "COLD",
      createdAt: POST_DEPLOY,
      keyInsight: longInsight,
      feynmanExplanation: longFeynman,
      realWorldConnection: "x",
      aiFeedback: null,
      problem: null, // no category at all
    }];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.counts.totalCoding).toBe(1);
    expect(out.matrix[0].state).toBe("DOCUMENTED");
  });
});

// ── Score formula + calibration multiplier ───────────────────────────

describe("computeSolutionDepth — score + calibration multiplier", () => {
  it("baseScore = mean of state points across all coding solutions", () => {
    const solutions = [
      sol({ id: "s1" }),                                                      // DOCUMENTED (25)
      sol({ id: "s2", understandingDepth: 8 }),                              // EXPLAINED (50)
      sol({ id: "s3", understandingDepth: 8, followUpScores: [8] }),         // DEFENDED (75)
      sol({ id: "s4", solveMethod: "SAW_APPROACH" }),                        // NONE (0)
    ];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    // (25 + 50 + 75 + 0) / 4 = 37.5
    expect(out.baseScore).toBe(38);
  });

  it("calibration multiplier clamps below CALIBRATION_FLOOR", () => {
    const solutions = [sol({ id: "s1" })];
    const out = computeSolutionDepth({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 0.40, // severe Dunning-Kruger
    });
    expect(out.calibrationModifier).toBe(CALIBRATION_FLOOR);
  });

  it("calibration multiplier clamps at CALIBRATION_CEILING for excellent calibration", () => {
    const solutions = [sol({ id: "s1" })];
    const out = computeSolutionDepth({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 1.00, // perfect calibration
    });
    expect(out.calibrationModifier).toBe(CALIBRATION_CEILING);
  });

  it("calibration multiplier passes through inside the range (0.85 → 0.85)", () => {
    const solutions = [sol({ id: "s1" })];
    const out = computeSolutionDepth({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 0.85,
    });
    expect(out.calibrationModifier).toBe(0.85);
  });

  it("null metacognitiveAccuracy defaults to 1.0 (no penalty for cold-start users)", () => {
    const solutions = [sol({ id: "s1" })];
    const out = computeSolutionDepth({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: null,
    });
    expect(out.calibrationModifier).toBe(1.0);
  });

  it("score = round(baseScore * calibrationModifier)", () => {
    const solutions = [
      sol({ id: "s1", understandingDepth: 8, followUpScores: [8] }), // DEFENDED (75)
      sol({ id: "s2", understandingDepth: 8, followUpScores: [8] }), // DEFENDED (75)
    ];
    const out = computeSolutionDepth({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 0.80,
    });
    // baseScore = 75, modifier = 0.80, score = round(75 * 0.80) = 60
    expect(out.score).toBe(60);
  });
});

// ── Original-report user regression ──────────────────────────────────

describe("computeSolutionDepth — original-report user fixture", () => {
  // Mirror the real user from the conversation: 4 solutions, all coding,
  // all DOCUMENTED at minimum (they have reflective text — current D2=71
  // implies that). AI understandingDepth probably averages 6-7 so maybe 1-2
  // EXPLAINED. Without follow-up scores we have no DEFENDED. Retention=93
  // suggests ≥1 quality-4+ review with substantive recallText, BUT only on
  // a DEFENDED solution does that promote to OWNED.
  it("4 DOCUMENTED solutions, no follow-up data → score around 25", () => {
    const solutions = [
      sol({ id: "s1", createdAt: PRE_DEPLOY, solveMethod: null, understandingDepth: 6 }),
      sol({ id: "s2", createdAt: PRE_DEPLOY, solveMethod: null, understandingDepth: 7 }),
      sol({ id: "s3", createdAt: PRE_DEPLOY, solveMethod: null, understandingDepth: 7 }),
      sol({ id: "s4", createdAt: PRE_DEPLOY, solveMethod: null, understandingDepth: 6 }),
    ];
    const out = computeSolutionDepth({
      solutions,
      reviewAttempts: [],
      metacognitiveAccuracy: 0.85,
    });
    // 2 DOCUMENTED (s1, s4) + 2 EXPLAINED (s2, s3) = (25+50+50+25)/4 = 37.5
    expect(out.baseScore).toBe(38);
    // score ≈ 38 × 0.85 = 32
    expect(out.score).toBeLessThan(50); // legacy formula gave 71
    expect(out.counts.solutionsAtDefendedOrAbove).toBe(0);
    expect(out.counts.solutionsAtOwned).toBe(0);
  });

  it("does not satisfy Tier 2's mastery gate (defendedOrAbove ≥4, owned ≥2)", () => {
    const solutions = [
      sol({ id: "s1", createdAt: PRE_DEPLOY, solveMethod: null }),
      sol({ id: "s2", createdAt: PRE_DEPLOY, solveMethod: null }),
      sol({ id: "s3", createdAt: PRE_DEPLOY, solveMethod: null }),
      sol({ id: "s4", createdAt: PRE_DEPLOY, solveMethod: null }),
    ];
    const out = computeSolutionDepth({ solutions, reviewAttempts: [] });
    expect(out.counts.solutionsAtDefendedOrAbove).toBeLessThan(4);
    expect(out.counts.solutionsAtOwned).toBeLessThan(2);
  });
});

// ── Smoke check on exposed constants ─────────────────────────────────

describe("DEPTH_STATES + tunables", () => {
  it("exposes 5 states with monotonically increasing points", () => {
    expect(DEPTH_STATES.NONE.points).toBe(0);
    expect(DEPTH_STATES.DOCUMENTED.points).toBe(25);
    expect(DEPTH_STATES.EXPLAINED.points).toBe(50);
    expect(DEPTH_STATES.DEFENDED.points).toBe(75);
    expect(DEPTH_STATES.OWNED.points).toBe(100);
  });

  it("tunables are sane", () => {
    expect(INSIGHT_MIN_CHARS).toBeGreaterThan(0);
    expect(FEYNMAN_MIN_CHARS).toBeGreaterThan(INSIGHT_MIN_CHARS); // feynman is the longer requirement
    expect(UNDERSTANDING_FLOOR).toBeGreaterThanOrEqual(7);
    expect(FOLLOWUP_FLOOR).toBeGreaterThanOrEqual(7);
    expect(RECALL_QUALITY_FLOOR).toBeGreaterThanOrEqual(3);
    expect(RECALL_TEXT_FLOOR).toBeGreaterThanOrEqual(20);
    expect(CALIBRATION_FLOOR).toBeLessThan(CALIBRATION_CEILING);
    expect(CALIBRATION_FLOOR).toBeGreaterThan(0);
    expect(CALIBRATION_CEILING).toBeLessThanOrEqual(1.0);
  });
});

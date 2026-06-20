// ============================================================================
// AI review controller — multi-tab + solveMethod caps
// ============================================================================
//
// Guards:
//   - BruteForce-only submissions are graded (Bug 1)
//   - SAW_APPROACH caps patternAccuracy ≤ 5, understandingDepth ≤ 6 (Bug 2)
//   - HINTS caps both ≤ 8
//   - COLD path unchanged
//   - <progression> block surfaces only when ≥ 2 tabs filled
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiPayload = null;
let lastUserPrompt = "";
let solutionRow = null;
let updatedFeedback = null;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    solution: {
      findFirst: vi.fn(async () => solutionRow),
      update: vi.fn(async ({ data }) => {
        if (data.aiFeedback) updatedFeedback = data.aiFeedback;
        return solutionRow;
      }),
      findMany: vi.fn(async () => []),
    },
    solutionFollowUpAnswer: { updateMany: vi.fn(async () => ({ count: 0 })) },
    $queryRawUnsafe: vi.fn(async () => []),
    $transaction: vi.fn(async (fn) => {
      const tx = {
        // H3 fix: controller now does SELECT FOR UPDATE + findUnique inside
        // the transaction. Mock both so the tx body completes.
        $queryRaw: vi.fn(async () => [{ id: solutionRow.id }]),
        solution: {
          findUnique: vi.fn(async () => ({
            aiFeedback: solutionRow.aiFeedback,
            reviewCount: solutionRow.reviewCount || 0,
          })),
          update: vi.fn(async ({ data }) => {
            if (data.aiFeedback) updatedFeedback = data.aiFeedback;
            return solutionRow;
          }),
        },
        solutionAttempt: {
          findFirst: vi.fn(async () => null),
          update: vi.fn(async () => ({})),
        },
      };
      return fn(tx);
    }),
  },
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async ({ userPrompt }) => {
    lastUserPrompt = userPrompt;
    return aiPayload;
  }),
  isAIEnabled: () => true,
  AIError: class AIError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("../../src/services/embedding.service.js", () => ({
  generateEmbedding: vi.fn(async () => null),
}));

vi.mock("../../src/services/autoNoteFromReview.service.js", () => ({
  generateAutoNoteFromReview: vi.fn(async () => undefined),
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, AI_ENABLED: true };
});

const { reviewSolution } = await import("../../src/controllers/aiReview.controller.js");

const validAiPayload = () => ({
  scores: {
    codeCorrectness: 10,
    patternAccuracy: 9,
    understandingDepth: 8,
    explanationQuality: 9,
    confidenceCalibration: 7,
  },
  flags: {
    languageMismatch: false,
    detectedLanguage: null,
    incompleteSubmission: false,
    wrongPattern: false,
    identifiedPattern: "Hashing",
    correctPattern: null,
  },
  strengths: ["Clean code"],
  gaps: [],
  improvement: "Try edge cases",
  interviewTip: "Practice variations",
  readinessVerdict: "Junior-ready on this problem.",
  complexityCheck: {
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
    timeCorrect: true,
    spaceCorrect: true,
    optimizationNote: null,
  },
  followUpEvaluations: [],
});

const baseSolution = (overrides = {}) => ({
  id: "sol_1",
  problemId: "prob_1",
  userId: "user_test",
  teamId: "team_test",
  language: "PYTHON",
  code: "def two_sum(a, t):\n    h = {}\n    for i, v in enumerate(a):\n        if t - v in h: return [h[t - v], i]\n        h[v] = i",
  approach: "Hash map",
  optimizedApproach: "One-pass hash map",
  bruteForce: null,
  bruteForceMeta: null,
  alternativeApproach: null,
  alternativeMeta: null,
  patterns: ["Hashing"],
  keyInsight: "Complement lookup in O(1)",
  feynmanExplanation: "We pair x with t-x.",
  realWorldConnection: "deduplication with sums",
  confidence: 4,
  timeTaken: 600,
  solveMethod: "COLD",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
  categorySpecificData: null,
  problemVersion: 1,
  reviewCount: 0,
  aiFeedback: null,
  aiFeedbackInputHash: null,
  followUpAnswers: [],
  problem: {
    id: "prob_1",
    title: "Two Sum",
    description: "Given an array of integers...",
    difficulty: "EASY",
    category: "CODING",
    adminNotes: null,
    tags: [],
    followUpQuestions: [],
    canonicalGeneratedAt: null,
  },
  ...overrides,
});

beforeEach(() => {
  aiPayload = validAiPayload();
  lastUserPrompt = "";
  updatedFeedback = null;
  solutionRow = baseSolution();
});

describe("reviewSolution — Bug 1: BruteForce-only submission", () => {
  it("sends the brute-force code to the AI (not 'No code provided')", async () => {
    solutionRow = baseSolution({
      code: null,
      timeComplexity: null,
      spaceComplexity: null,
      bruteForceMeta: {
        code: "def ts(a, t):\n  for i in range(len(a)):\n    for j in range(i+1, len(a)):\n      if a[i]+a[j]==t: return [i, j]",
        language: "PYTHON",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "Nested loop comparing every pair",
    });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    await invoke(reviewSolution, req);
    expect(lastUserPrompt).not.toContain("No code provided");
    expect(lastUserPrompt).toContain("for i in range");
    expect(lastUserPrompt).toContain("BRUTE_FORCE");
    expect(lastUserPrompt).toContain("T:O(n^2)");
  });

  it("does NOT include <progression> when only one tab is filled", async () => {
    solutionRow = baseSolution({
      code: null,
      timeComplexity: null,
      spaceComplexity: null,
      optimizedApproach: null,
      bruteForceMeta: {
        code: "def ts(a,t): return []",
        language: "PYTHON",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "brute",
    });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    await invoke(reviewSolution, req);
    expect(lastUserPrompt).not.toContain("<progression>");
  });
});

describe("reviewSolution — <progression> block when ≥ 2 tabs filled", () => {
  it("emits <progression> when both BruteForce and Optimized are filled", async () => {
    solutionRow = baseSolution({
      bruteForceMeta: {
        code: "def brute(): pass",
        language: "PYTHON",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "Nested loop",
    });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    await invoke(reviewSolution, req);
    expect(lastUserPrompt).toContain("<progression>");
    expect(lastUserPrompt).toContain("BRUTE_FORCE: T:O(n^2)");
    expect(lastUserPrompt).toContain("OPTIMIZED:");
  });
});

describe("reviewSolution — Bug 2: SAW_APPROACH caps", () => {
  it("caps patternAccuracy at 5 and understandingDepth at 6 in the response", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.status).toBe(200);
    expect(res.body.data.dimensionScores.patternAccuracy).toBe(5);
    expect(res.body.data.dimensionScores.understandingDepth).toBe(6);
    expect(res.body.data.dimensionScores.codeCorrectness).toBe(10);
    expect(res.body.data.dimensionScores.explanationQuality).toBe(9);
  });

  it("returns scoreAdjustments with two entries for SAW_APPROACH", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.scoreAdjustments).toHaveLength(2);
    expect(res.body.data.scoreAdjustments.map((a) => a.dimension).sort()).toEqual([
      "patternAccuracy",
      "understandingDepth",
    ]);
  });

  it("persists scoreAdjustments to aiFeedback", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    await invoke(reviewSolution, req);
    expect(Array.isArray(updatedFeedback)).toBe(true);
    const latest = updatedFeedback[updatedFeedback.length - 1];
    expect(latest.scoreAdjustments).toHaveLength(2);
  });

  it("recomputes overallScore from capped scores (not raw AI scores)", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    // Capped: 10*0.35 + 5*0.20 + 6*0.20 + 9*0.15 + 7*0.10 = 3.5 + 1.0 + 1.2 + 1.35 + 0.7 = 7.75
    // Raw would have been: 10*0.35 + 9*0.20 + 8*0.20 + 9*0.15 + 7*0.10 = 9.05
    // followUpBonus = 0; overallScore = round(7.75) = 8 (capped recomputed) vs 9 (raw)
    expect(res.body.data.overallScore).toBe(8);
  });
});

describe("reviewSolution — HINTS caps", () => {
  it("caps both at 8 for HINTS", async () => {
    solutionRow = baseSolution({ solveMethod: "HINTS" });
    aiPayload.scores.patternAccuracy = 9;
    aiPayload.scores.understandingDepth = 9;
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.dimensionScores.patternAccuracy).toBe(8);
    expect(res.body.data.dimensionScores.understandingDepth).toBe(8);
    expect(res.body.data.scoreAdjustments).toHaveLength(2);
  });
});

describe("reviewSolution — COLD path unchanged", () => {
  it("returns scores untouched and empty scoreAdjustments", async () => {
    solutionRow = baseSolution({ solveMethod: "COLD" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.dimensionScores).toEqual(aiPayload.scores);
    expect(res.body.data.scoreAdjustments).toEqual([]);
  });

  it("returns empty scoreAdjustments for legacy null solveMethod", async () => {
    solutionRow = baseSolution({ solveMethod: null });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.scoreAdjustments).toEqual([]);
  });
});

describe("reviewSolution — fallback path (Issue 1)", () => {
  it("does not apply caps on the fallback path (LLM error → buildFallbackReview placeholder scores)", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    // Force the AI call to throw so the controller takes the buildFallbackReview path.
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockImplementationOnce(async () => {
      throw new Error("AI timed out");
    });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.status).toBe(200);
    expect(res.body.data.scoreAdjustments).toEqual([]);
    // Fallback scores are deterministic 5s; they should pass through unchanged.
    // (We don't assert exact values — just that no cap-driven mutation occurred.)
    // The point of this test: caps must not silently fire on placeholder scores
    // if the cap values are ever tightened in the future.
  });
});

describe("reviewSolution — solveMethod normalization (Issue 3)", () => {
  it("normalizes solveMethod (uppercase + trim) before cap lookup", async () => {
    solutionRow = baseSolution({ solveMethod: "saw_approach " });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.dimensionScores.patternAccuracy).toBe(5);
    expect(res.body.data.dimensionScores.understandingDepth).toBe(6);
  });
});

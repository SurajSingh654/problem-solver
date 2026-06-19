// ============================================================================
// AI review-grade controller — multi-approach (matchedApproach) tests
// ============================================================================
//
// Guards the third grader path introduced for canonical alternatives:
//   - When FEATURE_CANONICAL_ALTERNATIVES=true AND the canonical has at least
//     one alternative, the grader emits a <canonical_alternatives> block in
//     the prompt and returns matchedApproach in the response.
//   - matchedApproach must be coerced to "primary" if the model emits an
//     unknown value.
//   - When alternatives are empty (or flag is off), the v1 hybrid prompt is
//     used (no <canonical_alternatives> block).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiPayload = {};
let lastUserPrompt = "";
let solutionRow = null;
let originalFlag;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    solution: {
      findFirst: vi.fn(async () => solutionRow),
    },
    problem: {
      findFirst: vi.fn(async () => solutionRow?.problem ?? null),
    },
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

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, AI_ENABLED: true };
});

const { gradeReviewRecall } = await import(
  "../../src/controllers/ai.controller.js"
);

const baseProblem = () => ({
  id: "prob_1",
  title: "Climbing Stairs",
  difficulty: "EASY",
  category: "CODING",
  description: "Climb n stairs taking 1 or 2 steps...",
  canonicalGeneratedAt: new Date(),
  canonicalPattern: "Dynamic Programming",
  canonicalKeyInsight: "ways(n) = ways(n-1) + ways(n-2). Iterative two-variable.",
  canonicalTimeComplexity: "O(n)",
  canonicalSpaceComplexity: "O(1)",
  canonicalAlternatives: [
    {
      name: "Memoized recursion",
      pattern: "Dynamic Programming",
      keyInsight: "Cache subproblem results.",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    },
  ],
  canonicalAltGeneratedAt: new Date(),
});

const baseSolution = () => ({
  id: "sol_1",
  problemId: "prob_1",
  patterns: ["Dynamic Programming"],
  keyInsight: "use memoization",
  feynmanExplanation: null,
  optimizedApproach: null,
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
  problem: baseProblem(),
});

describe("gradeReviewRecall — matchedApproach (FEATURE_CANONICAL_ALTERNATIVES=true)", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    solutionRow = baseSolution();
    aiPayload = {
      matchedApproach: "Memoized recursion",
      pattern: { match: "YES", feedback: "DP confirmed." },
      keyInsight: { match: "YES", feedback: "Memoization captured." },
      complexity: { match: "YES", feedback: "Your O(n) memoized space matches." },
      overall: "pass",
      suggestedConfidence: 5,
    };
    lastUserPrompt = "";
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("includes <canonical_alternatives> block in the user prompt", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: {
          pattern: "DP, Memoization",
          keyInsight: "use a cache",
          complexity: "O(n) / O(n)",
        },
      },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).toContain("<canonical_alternatives>");
    expect(lastUserPrompt).toContain("Memoized recursion");
  });

  it("returns matchedApproach in the response", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: {
          pattern: "DP",
          keyInsight: "memoize",
          complexity: "O(n) / O(n)",
        },
      },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.status).toBe(200);
    expect(res.body.data.matchedApproach).toBe("Memoized recursion");
  });

  it("coerces invalid matchedApproach to 'primary'", async () => {
    aiPayload.matchedApproach = "Some approach AI made up";
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: {
          pattern: "DP",
          keyInsight: "memoize",
          complexity: "O(n) / O(n)",
        },
      },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("primary");
  });

  it("uses v1 hybrid prompt when canonical has no alternatives", async () => {
    solutionRow.problem.canonicalAlternatives = [];
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: {
          pattern: "DP",
          keyInsight: "memoize",
          complexity: "O(n) / O(n)",
        },
      },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).not.toContain("<canonical_alternatives>");
  });
});

describe("gradeReviewRecall with FEATURE_CANONICAL_ALTERNATIVES=false", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "false";
    solutionRow = baseSolution();
    aiPayload = {
      pattern: { match: "YES", feedback: "ok" },
      keyInsight: { match: "PARTIAL", feedback: "ok" },
      complexity: { match: "PARTIAL", feedback: "ok" },
      overall: "partial",
      suggestedConfidence: 3,
    };
    lastUserPrompt = "";
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("does NOT include <canonical_alternatives> block (uses v1 hybrid prompt)", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: {
          pattern: "DP",
          keyInsight: "x",
          complexity: "O(n) / O(n)",
        },
      },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).not.toContain("<canonical_alternatives>");
  });
});

// ============================================================================
// AI review-grade controller — matchedApproach + discrepancy (trust pipeline)
// ============================================================================
//
// Guards the deterministic-matcher pipeline:
//   - matchedApproach is server-computed (not LLM-emitted).
//   - discrepancy is server-rendered with deterministic summary.
//   - <grade_against> block (single approach) replaces <canonical_alternatives>.
//   - aiFeedback flags override structural match (solve_time_flagged).
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

const climbingProblem = () => ({
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

const baseSolution = (overrides = {}) => ({
  id: "sol_1",
  problemId: "prob_1",
  patterns: ["Dynamic Programming"],
  keyInsight: "use memoization",
  feynmanExplanation: null,
  optimizedApproach: null,
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
  aiFeedback: null,
  problem: climbingProblem(),
  ...overrides,
});

describe("gradeReviewRecall — happy path (notes match an alternative)", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    solutionRow = baseSolution();
    aiPayload = {
      pattern: { match: "YES", feedback: "DP confirmed." },
      keyInsight: { match: "YES", feedback: "Memoization captured." },
      complexity: { match: "YES", feedback: "Your O(n)/O(n) matches the memoized variant." },
      overall: "pass",
      suggestedConfidence: 5,
    };
    lastUserPrompt = "";
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("returns matchedApproach computed by the server (alt name)", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.status).toBe(200);
    expect(res.body.data.matchedApproach).toBe("Memoized recursion");
    expect(res.body.data.discrepancy).toBeNull();
  });

  it("includes <grade_against> block in the prompt with the matched approach only", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).toContain("<grade_against>");
    expect(lastUserPrompt).toContain("Memoized recursion");
    // The full alternatives list should NOT be passed (server already chose).
    expect(lastUserPrompt).not.toContain("<canonical_alternatives>");
  });

  it("ignores LLM-emitted matchedApproach (server is authoritative)", async () => {
    aiPayload.matchedApproach = "Some approach AI made up";
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("Memoized recursion");
  });
});

describe("gradeReviewRecall — discrepancy: off_canonical", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    solutionRow = baseSolution({ timeComplexity: "O(n^2)", spaceComplexity: "O(n)" });
    aiPayload = {
      pattern: { match: "YES", feedback: "ok" },
      keyInsight: { match: "PARTIAL", feedback: "ok" },
      complexity: { match: "PARTIAL", feedback: "ok" },
      overall: "partial",
      suggestedConfidence: 3,
    };
  });
  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("falls back to primary and surfaces off_canonical discrepancy", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n^2) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("primary");
    expect(res.body.data.discrepancy.type).toBe("off_canonical");
    expect(res.body.data.discrepancy.source).toBe("structural");
  });
});

describe("gradeReviewRecall — discrepancy: pattern_mislabel", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    // Notes match primary by complexity but pattern is mislabeled.
    solutionRow = baseSolution({
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      patterns: ["Array"],
    });
    aiPayload = {
      pattern: { match: "PARTIAL", feedback: "ok" },
      keyInsight: { match: "YES", feedback: "ok" },
      complexity: { match: "YES", feedback: "ok" },
      overall: "partial",
      suggestedConfidence: 4,
    };
  });
  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("matches primary by complexity but flags pattern_mislabel", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "iter", complexity: "O(n) / O(1)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("primary");
    expect(res.body.data.discrepancy.type).toBe("pattern_mislabel");
  });
});

describe("gradeReviewRecall — discrepancy: solve_time_flagged", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    solutionRow = baseSolution({
      // Structurally would match the memoized alt — but solve-time flagged.
      aiFeedback: {
        flags: { wrongPattern: false },
        complexityCheck: {
          timeCorrect: false,
          spaceCorrect: true,
          timeComplexity: "O(n^2)",
          spaceComplexity: "O(n)",
        },
      },
    });
    aiPayload = {
      pattern: { match: "PARTIAL", feedback: "ok" },
      keyInsight: { match: "PARTIAL", feedback: "ok" },
      complexity: { match: "PARTIAL", feedback: "ok" },
      overall: "partial",
      suggestedConfidence: 2,
    };
  });
  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("forces primary when AI flagged complexity at solve time", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("primary");
    expect(res.body.data.discrepancy.type).toBe("solve_time_flagged");
    expect(res.body.data.discrepancy.source).toBe("ai_solve_time");
  });
});

describe("gradeReviewRecall — flag off (v1 hybrid path)", () => {
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

  it("does not include <grade_against> block (uses v1 hybrid prompt)", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "x", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).not.toContain("<grade_against>");
    expect(lastUserPrompt).toContain("<canonical_pattern>");
  });

  it("returns null discrepancy on flag-off path", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "x", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.discrepancy ?? null).toBeNull();
  });
});

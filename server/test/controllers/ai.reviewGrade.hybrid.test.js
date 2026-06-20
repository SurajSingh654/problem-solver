// ============================================================================
// AI review-grade controller — hybrid canonical-anchor tests
// ============================================================================
//
// Guards the canonical-anchor grader path introduced in the review-page-fixes
// feature (Task 7):
//   1. When canonical fields are present, <canonical_*> XML tags appear in the
//      prompt so the grader compares recall against ground truth, not old notes.
//   2. When the user peeked (saw the answer), suggestedConfidence is clamped to
//      ≤ 3 even if the model returns 5.
//   3. When canonical is absent (canonicalGeneratedAt null / fields null), the
//      grader falls back to the legacy notes-anchor path.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiPayload = {};
let lastUserPrompt = "";
let solutionRow = null;

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
  "../../src/controllers/aiRecallGrade.controller.js"
);

describe("gradeReviewRecall (hybrid anchor)", () => {
  beforeEach(() => {
    solutionRow = {
      id: "sol_1",
      problemId: "prob_1",
      patterns: ["Array / Hashing"],
      keyInsight: "old user note",
      feynmanExplanation: null,
      optimizedApproach: null,
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      problem: {
        id: "prob_1",
        title: "Two Sum",
        difficulty: "EASY",
        category: "CODING",
        description: "...",
        canonicalGeneratedAt: new Date(),
        canonicalPattern: "Array / Hashing",
        canonicalKeyInsight: "Map values to indices for O(1) complement lookup.",
        canonicalTimeComplexity: "O(n)",
        canonicalSpaceComplexity: "O(n)",
      },
    };
    aiPayload = {
      pattern: { match: "YES", feedback: "ok" },
      keyInsight: { match: "YES", feedback: "ok" },
      complexity: { match: "YES", feedback: "ok" },
      overall: "pass",
      suggestedConfidence: 5,
    };
    lastUserPrompt = "";
  });

  it("includes <canonical_*> tags in the prompt when canonical present", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: {
          pattern: "HashMap",
          keyInsight: "use a map",
          complexity: "O(n) / O(n)",
        },
      },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).toContain("<canonical_pattern>");
    expect(lastUserPrompt).toContain("<canonical_key_insight>");
    expect(lastUserPrompt).toContain("Map values to indices");
  });

  it("clamps suggestedConfidence to 3 when peeked and model returns 5", async () => {
    aiPayload.suggestedConfidence = 5;
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: {
          pattern: "HashMap",
          keyInsight: "use a map",
          complexity: "O(n) / O(n)",
        },
        peeked: true,
      },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.status).toBe(200);
    expect(res.body.data.suggestedConfidence).toBe(3);
  });

  it("falls back to user notes when canonical is missing", async () => {
    solutionRow.problem.canonicalGeneratedAt = null;
    solutionRow.problem.canonicalKeyInsight = null;
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: {
          pattern: "HashMap",
          keyInsight: "use a map",
          complexity: "O(n) / O(n)",
        },
      },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).toContain(
      "<user_notes_key_insight>old user note</user_notes_key_insight>",
    );
    expect(lastUserPrompt).not.toContain(
      "<canonical_key_insight>Map values",
    );
  });
});

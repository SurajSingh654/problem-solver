// ============================================================================
// H3 — concurrent reviewSolution calls must both persist (no lost update)
// ============================================================================
//
// Today (pre-fix): reviewSolution reads `solution.aiFeedback` BEFORE the
// transaction, then writes [...existing, newReview] inside the transaction.
// Two concurrent calls both read the same `existing`, both compute the same
// updated array (with their own `newReview` appended), both write — second
// write wins, first review is lost.
//
// After H3 fix: the read happens INSIDE the transaction with SELECT FOR
// UPDATE. The second transaction blocks until the first commits, then
// re-reads the now-updated array, and appends to it.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiCompleteCallCount = 0;
let solutionRow = null;
let txQueue = [];

// Snapshot clone — emulates Postgres returning a value-copy at read time, so
// later mutations to the canonical `solutionRow` don't retroactively appear
// in an earlier caller's local `solution` variable. Without this the shared
// mutable JS reference hides the real-world race.
const snapshot = (row) => JSON.parse(JSON.stringify(row));

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    solution: {
      findFirst: vi.fn(async () => snapshot(solutionRow)),
      findMany: vi.fn(async () => []),
    },
    solutionFollowUpAnswer: { updateMany: vi.fn(async () => ({ count: 0 })) },
    $queryRawUnsafe: vi.fn(async () => []),
    $transaction: vi.fn(async (fn) => {
      // Serialize transactions: each $transaction call waits for the previous
      // to complete before running. Models real Postgres SELECT FOR UPDATE.
      const enqueue = new Promise((resolve) => txQueue.push(resolve));
      if (txQueue.length === 1) txQueue[0]();
      await enqueue;

      const tx = {
        $queryRaw: vi.fn(async () => [{ id: solutionRow.id }]),
        solution: {
          findUnique: vi.fn(async () => snapshot({
            aiFeedback: solutionRow.aiFeedback,
            reviewCount: solutionRow.reviewCount || 0,
          })),
          update: vi.fn(async ({ data }) => {
            if (data.aiFeedback) solutionRow.aiFeedback = data.aiFeedback;
            if (
              data.reviewCount &&
              typeof data.reviewCount === "object" &&
              data.reviewCount.increment
            ) {
              solutionRow.reviewCount =
                (solutionRow.reviewCount || 0) + data.reviewCount.increment;
            }
            return solutionRow;
          }),
        },
        solutionAttempt: {
          findFirst: vi.fn(async () => null),
          update: vi.fn(async () => ({})),
        },
      };

      try {
        return await fn(tx);
      } finally {
        // Release the queue: next transaction unblocks
        txQueue.shift();
        if (txQueue.length > 0) txQueue[0]();
      }
    }),
  },
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async () => {
    aiCompleteCallCount += 1;
    return {
      scores: {
        codeCorrectness: 8,
        patternAccuracy: 7,
        understandingDepth: 7,
        explanationQuality: 7,
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
      strengths: ["Clean"],
      gaps: [],
      improvement: "x",
      interviewTip: "x",
      readinessVerdict: "Junior-ready",
      complexityCheck: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        timeCorrect: true,
        spaceCorrect: true,
        optimizationNote: null,
      },
      followUpEvaluations: [],
    };
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

const { reviewSolution } = await import(
  "../../src/controllers/aiReview.controller.js"
);

const makeBaseSolution = () => ({
  id: "sol_h3",
  problemId: "prob_1",
  userId: "user_test",
  teamId: "team_test",
  language: "PYTHON",
  code: "def solve(): pass",
  approach: "hash",
  optimizedApproach: null,
  bruteForce: null,
  bruteForceMeta: null,
  alternativeApproach: null,
  alternativeMeta: null,
  patterns: ["Hashing"],
  keyInsight: "use a map",
  feynmanExplanation: "explain like im 5",
  realWorldConnection: "real-world",
  confidence: 4,
  timeTaken: 600,
  solveMethod: "COLD",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
  categorySpecificData: null,
  problemVersion: 1,
  aiFeedback: null,
  aiFeedbackInputHash: null,
  reviewCount: 0,
  followUpAnswers: [],
  problem: {
    id: "prob_1",
    title: "Test",
    description: "Test problem",
    difficulty: "EASY",
    category: "CODING",
    adminNotes: null,
    tags: [],
    followUpQuestions: [],
    canonicalGeneratedAt: null,
  },
});

beforeEach(() => {
  aiCompleteCallCount = 0;
  solutionRow = makeBaseSolution();
  txQueue = [];
});

describe("H3: concurrent reviewSolution calls preserve both reviews", () => {
  it("persists both reviews when fired concurrently (no lost update)", async () => {
    const req1 = makeReq({ params: { solutionId: "sol_h3" } });
    const req2 = makeReq({ params: { solutionId: "sol_h3" } });
    await Promise.all([
      invoke(reviewSolution, req1),
      invoke(reviewSolution, req2),
    ]);

    // Both AI calls fired
    expect(aiCompleteCallCount).toBe(2);
    // Final aiFeedback array contains BOTH reviews
    expect(Array.isArray(solutionRow.aiFeedback)).toBe(true);
    expect(solutionRow.aiFeedback.length).toBe(2);
    // Sequential reviewNumbers
    const numbers = solutionRow.aiFeedback.map((r) => r.reviewNumber).sort();
    expect(numbers).toEqual([1, 2]);
  });
});

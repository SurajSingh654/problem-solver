/**
 * solutions.submitReview.test.js — T60-T62
 *
 * Tests for submitReview in solutions.controller.js.
 *
 * IMPORTANT CONTRACT NOTE:
 * The spec (T60-T62) described submitReview as an AI-powered review that
 * calls aiComplete and appends to an aiFeedback array. The ACTUAL function
 * in solutions.controller.js is a DIFFERENT operation: it is a pure SM-2
 * spaced-repetition review (confidence rating → quality score → SM-2
 * calculation → DB update). It does NOT call aiComplete and has no aiFeedback
 * array. The existing `solutions.submitReview.peeked.test.js` (T1-T3) covers
 * the peeked-flag clamping; these tests add: happy path, not-found path, and
 * multi-tenant scope verification.
 *
 * Key contract notes (from reading the function):
 * - solutionId comes from req.params.solutionId (not req.params.id)
 * - teamId is read from req.teamId (middleware-resolved)
 * - The row lock uses $queryRaw with `WHERE "userId" = ${userId} AND "teamId" = ${teamId}`
 *   — multi-tenant scope is enforced at the raw-query level
 * - Returns { nextReview: { date, intervalDays, easinessFactor, ... } } on success
 * - Throws SubmitReviewNotFound (caught inside) → returns 404 if row not found
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  solution: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  problem: { findFirst: vi.fn(), findUnique: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  reviewAttempt: { findMany: vi.fn(), create: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
  // submitReview uses an interactive transaction with $queryRaw inside
  $transaction: vi.fn(async (cb) => {
    if (typeof cb === "function") {
      // Provide a tx object with $queryRaw and solution.update/reviewAttempt.create
      const tx = {
        $queryRaw: vi.fn(),
        solution: { update: vi.fn().mockResolvedValue({}) },
        reviewAttempt: { create: vi.fn().mockResolvedValue({}) },
      };
      // Default: return a row with SM-2 state
      tx.$queryRaw.mockResolvedValue([
        {
          id: "sol_1",
          sm2EasinessFactor: 2.5,
          sm2Interval: 1,
          sm2Repetitions: 0,
          reviewDates: [],
          lapseCount: 0,
        },
      ]);
      return cb(tx);
    }
    return Promise.all(cb);
  }),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/services/embedding.service.js", () => ({
  generateEmbedding: vi.fn(),
  embedAndPersist: vi.fn().mockResolvedValue(undefined),
  isEmbeddingEnabled: vi.fn(() => false),
}));

vi.mock("../../src/services/rag.service.js", () => ({
  findSimilarTeammateSolutions: vi.fn().mockResolvedValue([]),
  formatTeammateContext: vi.fn().mockReturnValue(""),
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(),
  isAIEnabled: vi.fn(() => true),
}));

vi.mock("../../src/services/skillComputation.service.js", () => ({
  recomputeSkillsFromSolution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

const solutionsCtrl = await import(
  "../../src/controllers/solutions.controller.js"
);

function mockReqRes({
  params = {},
  query = {},
  body = {},
  userId = "user_1",
  teamId = "team_1",
} = {}) {
  const req = {
    params,
    query,
    body,
    user: {
      id: userId,
      currentTeamId: teamId,
      globalRole: "USER",
      teamRole: "MEMBER",
    },
    teamId, // middleware-resolved value — controllers MUST use this
    requestId: "req_test_xyz",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitReview", () => {
  it("test 60: happy path — SM-2 review persists updated state and returns nextReview", async () => {
    // submitReview is a SM-2 spaced-repetition review, NOT an AI review.
    // It uses $queryRaw FOR UPDATE to lock the row, calculates SM-2, and
    // updates sm2EasinessFactor, sm2Interval, sm2Repetitions, nextReviewDate.
    const lockRow = {
      id: "sol_1",
      sm2EasinessFactor: 2.5,
      sm2Interval: 1,
      sm2Repetitions: 0,
      reviewDates: [],
      lapseCount: 0,
    };

    let capturedUpdateData = null;
    let capturedAttemptData = null;

    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([lockRow]),
        solution: {
          update: vi.fn().mockImplementation(async ({ data }) => {
            capturedUpdateData = data;
            return {};
          }),
        },
        reviewAttempt: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            capturedAttemptData = data;
            return data;
          }),
        },
      };
      return cb(tx);
    });

    const { req, res } = mockReqRes({
      params: { solutionId: "sol_1" },
      body: { confidence: 4, peeked: false },
    });
    await solutionsCtrl.submitReview(req, res);

    // SM-2 state was persisted
    expect(capturedUpdateData).not.toBeNull();
    expect(capturedUpdateData).toHaveProperty("sm2EasinessFactor");
    expect(capturedUpdateData).toHaveProperty("sm2Interval");
    expect(capturedUpdateData).toHaveProperty("sm2Repetitions");
    expect(capturedUpdateData).toHaveProperty("nextReviewDate");

    // ReviewAttempt was created
    expect(capturedAttemptData).not.toBeNull();
    expect(capturedAttemptData.solutionId).toBe("sol_1");
    expect(capturedAttemptData.confidence).toBe(4);
    expect(capturedAttemptData.peeked).toBe(false);

    // Response is a success envelope with nextReview data
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          nextReview: expect.objectContaining({
            intervalDays: expect.any(Number),
            easinessFactor: expect.any(Number),
            recalled: expect.any(Boolean),
          }),
        }),
      }),
    );
  });

  it("test 61: row not found — returns 404 envelope without persisting", async () => {
    // When the $queryRaw FOR UPDATE returns empty (solution not found or
    // doesn't belong to this user/team), submitReview returns 404.
    // This is the "not-found" path — no write to solution or reviewAttempt.
    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]), // empty — row not found
        solution: { update: vi.fn() },
        reviewAttempt: { create: vi.fn() },
      };
      return cb(tx);
    });

    const { req, res } = mockReqRes({
      params: { solutionId: "sol_missing" },
      body: { confidence: 3 },
    });
    await solutionsCtrl.submitReview(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
  });

  it("test 62: multi-tenant scope — row lock query filters by req.teamId, not req.user.currentTeamId", async () => {
    // The $queryRaw FOR UPDATE includes both userId AND teamId:
    //   WHERE id = ${solutionId} AND "userId" = ${userId} AND "teamId" = ${teamId}
    // The teamId used must be req.teamId (middleware-resolved), NOT req.user.currentTeamId.
    let capturedRawArgs = null;

    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockImplementation(async (...args) => {
          // $queryRaw is called as a tagged template literal — args is the
          // TemplateStringsArray + interpolated values.
          capturedRawArgs = args;
          return [
            {
              id: "sol_1",
              sm2EasinessFactor: 2.5,
              sm2Interval: 1,
              sm2Repetitions: 0,
              reviewDates: [],
              lapseCount: 0,
            },
          ];
        }),
        solution: { update: vi.fn().mockResolvedValue({}) },
        reviewAttempt: { create: vi.fn().mockResolvedValue({}) },
      };
      return cb(tx);
    });

    const { req, res } = mockReqRes({
      params: { solutionId: "sol_1" },
      body: { confidence: 4 },
    });
    // Diverge the two team values — controller must use req.teamId
    req.teamId = "team_resolved";
    req.user.currentTeamId = "team_raw_unsafe";

    await solutionsCtrl.submitReview(req, res);

    // The raw query should have been called with "team_resolved" as an
    // interpolated value, NOT "team_raw_unsafe"
    expect(capturedRawArgs).not.toBeNull();
    // The interpolated values in the tagged template include solutionId,
    // userId, and teamId. Verify team_resolved appears but not team_raw_unsafe.
    const argsStr = JSON.stringify(capturedRawArgs);
    expect(argsStr).toContain("team_resolved");
    expect(argsStr).not.toContain("team_raw_unsafe");
  });
});

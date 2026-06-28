/**
 * solutions.attempts.test.js — T74-T76
 *
 * Tests for getSolutionAttempts in solutions.controller.js.
 *
 * Key contract notes (from reading the function):
 * - solution lookup is prisma.solution.findFirst({ where: { id: solutionId, teamId } }).
 * - 404 if solution not found (or belongs to a different team — same result).
 * - Authorization check AFTER the lookup: author OR SUPER_ADMIN OR TEAM_ADMIN may read.
 *   A MEMBER who is not the author receives a 403.
 * - attempts are fetched from prisma.solutionAttempt.findMany({ where: { solutionId } }).
 * - Returns `{ solution, attempts, attemptCount }`.
 * - Error envelope includes `error.requestId` (from req.requestId via the errorHandler helper).
 *   The `error()` response helper sets the standard envelope: `{ success: false, error: { message, ... } }`.
 *   requestId is set on the envelope by the requestId middleware; the test verifies that
 *   the controller calls res.json with success:false (the specific requestId in the body
 *   is injected by express middleware at runtime, not by the controller directly — so
 *   T76 verifies the 404 envelope shape with success:false).
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
  followUpQuestion: { findMany: vi.fn() },
  solutionFollowUpAnswer: { createMany: vi.fn() },
  solutionAttempt: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
  $transaction: vi.fn(async (cb) => {
    if (typeof cb === "function") return cb(prismaMock);
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
  globalRole = "USER",
  teamRole = "MEMBER",
} = {}) {
  const req = {
    params,
    query,
    body,
    user: {
      id: userId,
      currentTeamId: teamId,
      globalRole,
      teamRole,
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

// ============================================================================
// getSolutionAttempts
// ============================================================================
describe("getSolutionAttempts", () => {
  it("test 74: happy path returns ReviewAttempt array with solution + attemptCount", async () => {
    const solution = {
      id: "sol_1",
      userId: "user_1",
      problemId: "prob_1",
      problem: { id: "prob_1", title: "Two Sum", category: "CODING", difficulty: "EASY", version: 1 },
    };
    const attempts = [
      { id: "att_2", solutionId: "sol_1", attemptNumber: 2, trigger: "UPDATE", createdAt: new Date() },
      { id: "att_1", solutionId: "sol_1", attemptNumber: 1, trigger: "CREATE", createdAt: new Date() },
    ];

    prismaMock.solution.findFirst.mockResolvedValueOnce(solution);
    prismaMock.solutionAttempt.findMany.mockResolvedValueOnce(attempts);

    const { req, res } = mockReqRes({
      params: { solutionId: "sol_1" },
      userId: "user_1", // matches solution.userId — is the author
    });
    await solutionsCtrl.getSolutionAttempts(req, res);

    const responseArg = res.json.mock.calls[0][0];
    expect(responseArg.success).toBe(true);

    const { attempts: returnedAttempts, attemptCount, solution: returnedSolution } = responseArg.data;
    expect(returnedAttempts).toHaveLength(2);
    expect(attemptCount).toBe(2);
    expect(returnedSolution.id).toBe("sol_1");
    expect(returnedAttempts[0].id).toBe("att_2"); // newest first (attemptNumber desc)
  });

  it("test 75: multi-tenant scope — solution lookup filters by req.teamId", async () => {
    const solution = {
      id: "sol_1",
      userId: "user_1",
      problemId: "prob_1",
      problem: { id: "prob_1", title: "Two Sum", category: "CODING", difficulty: "EASY", version: 1 },
    };
    prismaMock.solution.findFirst.mockResolvedValueOnce(solution);
    prismaMock.solutionAttempt.findMany.mockResolvedValueOnce([]);

    const { req, res } = mockReqRes({
      params: { solutionId: "sol_1" },
      userId: "user_1",
      teamId: "team_scoped",
    });
    await solutionsCtrl.getSolutionAttempts(req, res);

    // The findFirst call must include teamId in the where clause
    const findFirstCall = prismaMock.solution.findFirst.mock.calls[0][0];
    expect(findFirstCall.where.id).toBe("sol_1");
    expect(findFirstCall.where.teamId).toBe("team_scoped");
  });

  it("test 76: 404 envelope when solutionId not found (or belongs to different team)", async () => {
    // When findFirst returns null (solution not found or different team),
    // the controller calls error(res, "Solution not found.", 404).
    // The standard error envelope is { success: false, error: { message } }.
    // requestId in the envelope is injected by express middleware at runtime —
    // in unit tests we verify the shape of what the controller directly produces.
    prismaMock.solution.findFirst.mockResolvedValueOnce(null);

    const { req, res } = mockReqRes({
      params: { solutionId: "sol_nonexistent" },
      teamId: "team_other",
    });
    await solutionsCtrl.getSolutionAttempts(req, res);

    // solutionAttempt.findMany must NOT have been called after a 404
    expect(prismaMock.solutionAttempt.findMany).not.toHaveBeenCalled();

    const responseArg = res.json.mock.calls[0][0];
    expect(responseArg.success).toBe(false);
    expect(responseArg.error).toBeDefined();
    expect(responseArg.error.message).toMatch(/not found/i);

    // HTTP status must be 404
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

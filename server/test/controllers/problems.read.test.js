/**
 * problems.read.test.js — T86-T89
 *
 * Tests for getProblem in problems.controller.js.
 *
 * Key contract notes (from reading the function):
 *
 * getProblem:
 * - Route param is `req.params.problemId` (NOT `req.params.id`).
 *   SPEC DIVERGENCE: the plan's test sketch used `params: { id: "prob_1" }`.
 *   Actual controller reads `const { problemId } = req.params`.
 * - teamId from req.teamId (never req.user.currentTeamId).
 * - Three DB calls in sequence (not parallel for the first one):
 *   1. prisma.problem.findFirst({ where: { id: problemId, teamId }, include: { followUpQuestions, createdBy, _count } })
 *   2. Two parallel: prisma.solution.findFirst (user's solution) + prisma.solution.count (team solutions)
 * - 404 (no requestId in body) when problem not found — the `error()` helper
 *   builds { success: false, error: { message } }. The requestId travels via
 *   the X-Request-Id header injected at runtime, not inside the JSON body.
 *   T88 verifies success:false + status 404 — does NOT assert error.requestId.
 * - Response shape: { success: true, data: { problem: { ...problem, isSolved, userSolutionId,
 *   userSolvedVersion, userAttemptCount, problemUpdatedSinceSolved, teamSolutionCount } } }
 * - followUpQuestions ordered by { order: "asc" } in the include.
 *
 * Spec divergence #1 (T86/T87/T88/T89):
 *   Controller uses `req.params.problemId`, not `req.params.id`.
 *   All test fixtures use `params: { problemId: "..." }`.
 *
 * Spec divergence #2 (T88):
 *   Plan said "includes requestId" in the 404 envelope. The `error()` response
 *   helper returns `{ success: false, error: { message } }`. The requestId is
 *   NOT in the JSON body from the controller — it's a runtime header. T88 does
 *   not assert error.requestId in the JSON envelope.
 *
 * Spec divergence #3 (T86):
 *   Response wraps as `{ data: { problem: {...} } }` — not `{ data: { ...fields } }`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  problem: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  followUpQuestion: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  solution: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(async (cb) => {
    if (typeof cb === "function") return cb(prismaMock);
    return Promise.all(cb);
  }),
  $queryRawUnsafe: vi.fn(),
  $queryRaw: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/services/embedding.service.js", () => ({
  generateEmbedding: vi.fn(),
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => false),
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(),
  isAIEnabled: vi.fn(() => true),
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true, FEATURE_CANONICAL_ALTERNATIVES: "false" };
});

vi.mock("../../src/controllers/aiCanonical.controller.js", () => ({
  generateCanonicalAnswer: vi.fn(),
  augmentCanonicalAlternatives: vi.fn(),
}));

const problemsCtrl = await import(
  "../../src/controllers/problems.controller.js"
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
    user: { id: userId, currentTeamId: teamId, globalRole, teamRole },
    teamId,
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
// getProblem
// ============================================================================
describe("getProblem", () => {
  it("test 86: happy path returns problem with relations and enriched fields", async () => {
    // SPEC DIVERGENCE: req.params key is `problemId` (not `id`)
    // SPEC DIVERGENCE: response wraps as { data: { problem: {...} } }, not bare object
    const sample = {
      id: "prob_1",
      title: "Two Sum",
      teamId: "team_1",
      version: 1,
      followUpQuestions: [
        { id: "fq1", question: "What about duplicates?", order: 0 },
      ],
      createdBy: { id: "user_1", name: "Alice" },
      _count: { solutions: 5 },
    };
    prismaMock.problem.findFirst.mockResolvedValueOnce(sample);
    // userSolution (findFirst) + team count (count) run in Promise.all
    prismaMock.solution.findFirst.mockResolvedValueOnce({
      id: "sol_1",
      confidence: 4,
      createdAt: new Date(),
      problemVersion: 1,
      _count: { attempts: 2 },
    });
    prismaMock.solution.count.mockResolvedValueOnce(5);

    const { req, res } = mockReqRes({ params: { problemId: "prob_1" } });
    await problemsCtrl.getProblem(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.problem).toBeDefined();
    expect(jsonArg.data.problem.followUpQuestions).toHaveLength(1);
    expect(jsonArg.data.problem.isSolved).toBe(true);
    expect(jsonArg.data.problem.teamSolutionCount).toBe(5);
    expect(jsonArg.data.problem.userAttemptCount).toBe(2);
  });

  it("test 87: multi-tenant scope — problem findFirst filters by req.teamId", async () => {
    // SPEC DIVERGENCE: req.params key is `problemId` (not `id`)
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "X",
      teamId: "team_scoped",
      version: 1,
      followUpQuestions: [],
      createdBy: null,
      _count: { solutions: 0 },
    });
    prismaMock.solution.findFirst.mockResolvedValueOnce(null);
    prismaMock.solution.count.mockResolvedValueOnce(0);

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      teamId: "team_scoped",
    });
    req.user.currentTeamId = "team_raw_unsafe";
    req.teamId = "team_scoped";

    await problemsCtrl.getProblem(req, res);

    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_scoped");
    expect(findArg.where.teamId).not.toBe("team_raw_unsafe");
  });

  it("test 88: 404 envelope when problem not found", async () => {
    // SPEC DIVERGENCE: error.requestId is NOT in the JSON body — it's a runtime header.
    // The controller calls error(res, "Problem not found.", 404).
    // error() builds { success: false, error: { message } } directly.
    prismaMock.problem.findFirst.mockResolvedValueOnce(null);

    const { req, res } = mockReqRes({ params: { problemId: "missing" } });
    await problemsCtrl.getProblem(req, res);

    expect(prismaMock.solution.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.solution.count).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    expect(jsonArg.error).toBeDefined();
    expect(jsonArg.error.message).toMatch(/not found/i);
  });

  it("test 89: follow-up questions ordered by order field (asc) in include", async () => {
    // SPEC DIVERGENCE: req.params key is `problemId` (not `id`)
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "X",
      version: 1,
      followUpQuestions: [],
      createdBy: null,
      _count: { solutions: 0 },
    });
    prismaMock.solution.findFirst.mockResolvedValueOnce(null);
    prismaMock.solution.count.mockResolvedValueOnce(0);

    const { req, res } = mockReqRes({ params: { problemId: "prob_1" } });
    await problemsCtrl.getProblem(req, res);

    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    // Controller uses `include: { followUpQuestions: { orderBy: { order: "asc" } } }`
    expect(findArg.include?.followUpQuestions?.orderBy).toEqual({ order: "asc" });
  });
});

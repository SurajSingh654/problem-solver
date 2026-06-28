/**
 * problems.list.test.js — T82-T85
 *
 * Tests for listProblems in problems.controller.js.
 *
 * Key contract notes (from reading the function):
 *
 * listProblems:
 * - teamId from req.teamId (never req.user.currentTeamId)
 * - Pagination via `page` + `limit` query params (NOT `limit` + `offset`).
 *   skip = (page - 1) * limit; take = limit. Both parsed as integers.
 * - Non-admin users get implicit `isPublished: true, isHidden: false` filter.
 *   Admin users (SUPER_ADMIN or TEAM_ADMIN) can pass `isPublished` explicitly.
 * - Filters: category, difficulty, source, sourceList, isPinned, search (OR over title/tags).
 * - Runs two parallel queries: findMany + count.
 * - Response shape: { success: true, data: { problems: [...], pagination: { total, page, limit, pages } } }
 *   NOT `{ data: [] }` — response is wrapped inside `data` object with a `problems` key.
 * - Enriches each problem with: isSolved, userConfidence, userSolvedVersion,
 *   problemUpdatedSinceSolved, solutionCount, followUpCount.
 * - solutions array stripped from output (replaced by derived fields).
 * - orderBy: always [ { isPinned: "desc" }, { [sortBy]: sortOrder } ].
 *
 * Spec divergence #1 (T82):
 *   Spec says "returns problems array." Actual response wraps under
 *   { data: { problems: [...], pagination: {...} } } — not a bare array.
 *   T82 verifies the actual shape.
 *
 * Spec divergence #2 (T82):
 *   listProblems makes TWO prisma calls in Promise.all (findMany + count).
 *   The prismaMock.$transaction is never called by this function.
 *   Both findMany and count must be mocked.
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
// listProblems
// ============================================================================
describe("listProblems", () => {
  it("test 82: happy path returns problems array with pagination envelope", async () => {
    // SPEC DIVERGENCE: response wraps under { data: { problems: [...], pagination: {...} } }
    // not a bare array. The 'problems' key is inside data, alongside 'pagination'.
    const samples = [
      {
        id: "p1",
        title: "P1",
        teamId: "team_1",
        difficulty: "EASY",
        version: 1,
        solutions: [{ id: "sol_1", confidence: 4, problemVersion: 1 }],
        _count: { solutions: 3, followUpQuestions: 2 },
      },
      {
        id: "p2",
        title: "P2",
        teamId: "team_1",
        difficulty: "MEDIUM",
        version: 1,
        solutions: [],
        _count: { solutions: 0, followUpQuestions: 0 },
      },
    ];
    prismaMock.problem.findMany.mockResolvedValueOnce(samples);
    prismaMock.problem.count.mockResolvedValueOnce(2);

    const { req, res } = mockReqRes();
    await problemsCtrl.listProblems(req, res);

    expect(prismaMock.problem.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.problem.count).toHaveBeenCalledTimes(1);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(Array.isArray(jsonArg.data.problems)).toBe(true);
    expect(jsonArg.data.problems).toHaveLength(2);
    expect(jsonArg.data.pagination).toBeDefined();
    expect(jsonArg.data.pagination.total).toBe(2);
    // Enrichment: first problem is solved (had a solution)
    expect(jsonArg.data.problems[0].isSolved).toBe(true);
    // Second problem is not solved
    expect(jsonArg.data.problems[1].isSolved).toBe(false);
    // solutions array stripped from output
    expect(jsonArg.data.problems[0].solutions).toBeUndefined();
  });

  it("test 83: multi-tenant scope — findMany and count both filter by req.teamId", async () => {
    prismaMock.problem.findMany.mockResolvedValueOnce([]);
    prismaMock.problem.count.mockResolvedValueOnce(0);

    const { req, res } = mockReqRes({ teamId: "team_scoped" });
    req.user.currentTeamId = "team_raw_unsafe";
    req.teamId = "team_scoped";

    await problemsCtrl.listProblems(req, res);

    const findArg = prismaMock.problem.findMany.mock.calls[0][0];
    const countArg = prismaMock.problem.count.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_scoped");
    expect(countArg.where.teamId).toBe("team_scoped");
    expect(findArg.where.teamId).not.toBe("team_raw_unsafe");
  });

  it("test 84: filter params respected — difficulty and category added to where clause", async () => {
    prismaMock.problem.findMany.mockResolvedValueOnce([]);
    prismaMock.problem.count.mockResolvedValueOnce(0);

    const { req, res } = mockReqRes({
      query: { difficulty: "HARD", category: "CODING" },
    });
    await problemsCtrl.listProblems(req, res);

    const findArg = prismaMock.problem.findMany.mock.calls[0][0];
    expect(findArg.where.difficulty).toBe("HARD");
    expect(findArg.where.category).toBe("CODING");
  });

  it("test 85: pagination params (page + limit) translate to correct skip + take", async () => {
    // Controller uses page-based pagination: skip = (page - 1) * limit; take = limit.
    // page=2, limit=5 → skip=5, take=5.
    prismaMock.problem.findMany.mockResolvedValueOnce([]);
    prismaMock.problem.count.mockResolvedValueOnce(50);

    const { req, res } = mockReqRes({
      query: { page: "2", limit: "5" },
    });
    await problemsCtrl.listProblems(req, res);

    const findArg = prismaMock.problem.findMany.mock.calls[0][0];
    expect(findArg.skip).toBe(5);   // (2 - 1) * 5
    expect(findArg.take).toBe(5);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.pagination.page).toBe(2);
    expect(jsonArg.data.pagination.limit).toBe(5);
    expect(jsonArg.data.pagination.pages).toBe(10); // ceil(50 / 5)
  });
});

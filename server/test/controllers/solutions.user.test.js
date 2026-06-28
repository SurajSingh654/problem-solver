/**
 * solutions.user.test.js — T69-T73
 *
 * Tests for getUserSolutions and getRecallAnalytics in solutions.controller.js.
 *
 * Key contract notes (from reading the functions):
 *
 * getUserSolutions:
 * - targetUserId comes from req.params.userId OR falls back to req.user.id.
 * - Pagination uses `page` and `limit` query params (not `limit`/`offset` as the spec said).
 *   SPEC DIVERGENCE: spec called the params `limit/offset` but the controller
 *   reads `page` (1-indexed) and `limit`. Skip is computed as (page-1)*limit.
 * - Returns `{ solutions, pagination: { total, page, limit, pages } }`.
 * - Runs two parallel queries: findMany + count via Promise.all.
 *
 * getRecallAnalytics:
 * - All aggregation runs via prisma.$queryRaw (tagged template literal) — 3 parallel queries.
 * - Returns `{ overall: { totalAttempts, recallRate, avgConfidence }, trend: [...], byPattern: [...] }`.
 * - Empty (no attempts) → overallRows[0] defaults to { total_attempts:0, recall_rate:0, avg_confidence:0 }.
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
  solutionAttempt: { create: vi.fn(), findFirst: vi.fn() },
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
// getUserSolutions
// ============================================================================
describe("getUserSolutions", () => {
  it("test 69: happy path returns solutions filtered by req.user.id when no params.userId", async () => {
    const sol1 = {
      id: "sol_1",
      userId: "user_1",
      teamId: "team_1",
      problem: { id: "prob_1", title: "Two Sum", description: "", difficulty: "EASY", category: "CODING", version: 1 },
    };
    prismaMock.solution.findMany.mockResolvedValueOnce([sol1]);
    prismaMock.solution.count.mockResolvedValueOnce(1);

    const { req, res } = mockReqRes({ userId: "user_1" });
    await solutionsCtrl.getUserSolutions(req, res);

    const responseArg = res.json.mock.calls[0][0];
    expect(responseArg.success).toBe(true);
    expect(responseArg.data.solutions).toHaveLength(1);
    expect(responseArg.data.solutions[0].id).toBe("sol_1");

    // findMany must filter by the user's own id
    const findManyCall = prismaMock.solution.findMany.mock.calls[0][0];
    expect(findManyCall.where.userId).toBe("user_1");
  });

  it("test 70: multi-tenant scope — where clause contains both userId and req.teamId", async () => {
    prismaMock.solution.findMany.mockResolvedValueOnce([]);
    prismaMock.solution.count.mockResolvedValueOnce(0);

    const { req, res } = mockReqRes({
      userId: "user_1",
      teamId: "team_scoped",
    });
    await solutionsCtrl.getUserSolutions(req, res);

    const findManyCall = prismaMock.solution.findMany.mock.calls[0][0];
    expect(findManyCall.where.userId).toBe("user_1");
    expect(findManyCall.where.teamId).toBe("team_scoped");

    const countCall = prismaMock.solution.count.mock.calls[0][0];
    expect(countCall.where.teamId).toBe("team_scoped");
  });

  it("test 71: pagination — page/limit query params are respected (not limit/offset)", async () => {
    // SPEC DIVERGENCE: spec described `limit` and `offset` query params, but
    // the controller reads `page` (1-indexed) and `limit`. Skip is (page-1)*limit.
    // Default is page=1, limit=20. This test verifies custom page=2, limit=5.
    prismaMock.solution.findMany.mockResolvedValueOnce([]);
    prismaMock.solution.count.mockResolvedValueOnce(12); // 12 total for pagination math

    const { req, res } = mockReqRes({
      query: { page: "2", limit: "5" },
    });
    await solutionsCtrl.getUserSolutions(req, res);

    const findManyCall = prismaMock.solution.findMany.mock.calls[0][0];
    expect(findManyCall.skip).toBe(5); // (2-1)*5 = 5
    expect(findManyCall.take).toBe(5);

    const responseArg = res.json.mock.calls[0][0];
    expect(responseArg.data.pagination.page).toBe(2);
    expect(responseArg.data.pagination.limit).toBe(5);
    expect(responseArg.data.pagination.total).toBe(12);
    expect(responseArg.data.pagination.pages).toBe(3); // ceil(12/5) = 3
  });
});

// ============================================================================
// getRecallAnalytics
// ============================================================================
describe("getRecallAnalytics", () => {
  it("test 72: happy path returns analytics shape with overall, trend, byPattern", async () => {
    // getRecallAnalytics runs 3 $queryRaw calls in Promise.all.
    const overallRow = { total_attempts: 25, recall_rate: 0.72, avg_confidence: 3.8 };
    const trendRow = { week_start: "2026-06-01", attempts: 10, recall_rate: 0.70, avg_confidence: 3.5 };
    const patternRow = { pattern: "Hash Map", attempts: 8, recall_rate: 0.75, avg_confidence: 4.0 };

    prismaMock.$queryRaw
      .mockResolvedValueOnce([overallRow])     // overall query
      .mockResolvedValueOnce([trendRow])        // trend query
      .mockResolvedValueOnce([patternRow]);     // byPattern query

    const { req, res } = mockReqRes();
    await solutionsCtrl.getRecallAnalytics(req, res);

    const responseArg = res.json.mock.calls[0][0];
    expect(responseArg.success).toBe(true);

    const { overall, trend, byPattern } = responseArg.data;

    // Overall shape
    expect(overall.totalAttempts).toBe(25);
    expect(overall.recallRate).toBe(0.72);
    expect(overall.avgConfidence).toBe(3.8);

    // Trend array — camelCase keys
    expect(trend).toHaveLength(1);
    expect(trend[0].weekStart).toBe("2026-06-01");
    expect(trend[0].attempts).toBe(10);
    expect(trend[0].recallRate).toBe(0.70);
    expect(trend[0].avgConfidence).toBe(3.5);

    // byPattern array — camelCase keys
    expect(byPattern).toHaveLength(1);
    expect(byPattern[0].pattern).toBe("Hash Map");
    expect(byPattern[0].attempts).toBe(8);
    expect(byPattern[0].recallRate).toBe(0.75);
    expect(byPattern[0].avgConfidence).toBe(4.0);
  });

  it("test 73: empty (no solutions) returns zeroed analytics", async () => {
    // When overallRows[0] is undefined (no attempts), the controller falls back
    // to { total_attempts: 0, recall_rate: 0, avg_confidence: 0 }.
    prismaMock.$queryRaw
      .mockResolvedValueOnce([])  // overall — empty array → fallback kicks in
      .mockResolvedValueOnce([])  // trend
      .mockResolvedValueOnce([]); // byPattern

    const { req, res } = mockReqRes();
    await solutionsCtrl.getRecallAnalytics(req, res);

    const responseArg = res.json.mock.calls[0][0];
    expect(responseArg.success).toBe(true);

    const { overall, trend, byPattern } = responseArg.data;
    expect(overall.totalAttempts).toBe(0);
    expect(overall.recallRate).toBe(0);
    expect(overall.avgConfidence).toBe(0);
    expect(trend).toEqual([]);
    expect(byPattern).toEqual([]);
  });
});

/**
 * solutions.rateClarity.test.js — T80-T81
 *
 * Tests for rateSolutionClarity in solutions.controller.js.
 *
 * Key contract notes (from reading the function):
 * - solutionId comes from req.params.solutionId
 * - teamId is read from req.teamId (middleware-resolved)
 * - Solution lookup: prisma.solution.findFirst({ where: { id: solutionId, teamId } })
 *   — multi-tenant scope enforced here
 * - Self-rating guard: if (solution.userId === raterId) → 400 error
 * - Persistence: prisma.clarityRating.upsert with { where: { raterId_solutionId } }
 *   — the create payload includes teamId
 * - Response: success envelope with { message, rating: clarityRating }
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
  clarityRating: {
    upsert: vi.fn(),
  },
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

describe("rateSolutionClarity", () => {
  it("test 80: happy path — persists rating via clarityRating.upsert, returns success envelope", async () => {
    // Solution exists and belongs to a DIFFERENT user (self-rating is blocked)
    prismaMock.solution.findFirst.mockResolvedValueOnce({
      id: "sol_1",
      userId: "solution_owner", // different from the rater
      teamId: "team_1",
    });

    const storedRating = {
      id: "rating_1",
      solutionId: "sol_1",
      raterId: "user_1",
      teamId: "team_1",
      rating: 4,
    };
    prismaMock.clarityRating.upsert.mockResolvedValueOnce(storedRating);

    const { req, res } = mockReqRes({
      params: { solutionId: "sol_1" },
      body: { rating: 4 },
      userId: "user_1", // the rater
    });
    await solutionsCtrl.rateSolutionClarity(req, res);

    // clarityRating.upsert was called with the rating value
    expect(prismaMock.clarityRating.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = prismaMock.clarityRating.upsert.mock.calls[0][0];
    expect(upsertArg.create.rating).toBe(4);
    expect(upsertArg.update.rating).toBe(4);
    expect(upsertArg.create.raterId).toBe("user_1");
    expect(upsertArg.create.solutionId).toBe("sol_1");

    // Response is success envelope with the stored rating
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          rating: storedRating,
        }),
      }),
    );
  });

  it("test 81: multi-tenant scope — solution lookup filters by req.teamId, upsert includes req.teamId", async () => {
    // The controller reads teamId = req.teamId and uses it in:
    //   1. solution.findFirst({ where: { id: solutionId, teamId } })
    //   2. clarityRating.upsert create: { ..., teamId }
    // Verify BOTH use req.teamId (middleware-resolved), not req.user.currentTeamId.
    prismaMock.solution.findFirst.mockResolvedValueOnce({
      id: "sol_1",
      userId: "solution_owner",
      teamId: "team_resolved",
    });
    prismaMock.clarityRating.upsert.mockResolvedValueOnce({
      id: "rating_1",
      solutionId: "sol_1",
      raterId: "user_1",
      teamId: "team_resolved",
      rating: 3,
    });

    const { req, res } = mockReqRes({
      params: { solutionId: "sol_1" },
      body: { rating: 3 },
    });
    // Diverge the two values
    req.teamId = "team_resolved";
    req.user.currentTeamId = "team_raw_unsafe";

    await solutionsCtrl.rateSolutionClarity(req, res);

    // findFirst uses req.teamId
    const findArg = prismaMock.solution.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_resolved");
    expect(findArg.where.teamId).not.toBe("team_raw_unsafe");

    // upsert create payload includes req.teamId
    const upsertArg = prismaMock.clarityRating.upsert.mock.calls[0][0];
    expect(upsertArg.create.teamId).toBe("team_resolved");
    expect(upsertArg.create.teamId).not.toBe("team_raw_unsafe");
  });
});

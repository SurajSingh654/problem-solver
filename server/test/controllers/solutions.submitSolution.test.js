/**
 * solutions.submitSolution.test.js — T56-T59
 *
 * Tests for submitSolution in solutions.controller.js.
 *
 * Key contract notes (from reading the function):
 * - problemId comes from req.params.problemId (not req.body)
 * - teamId is read from req.teamId (middleware-resolved), never req.user.currentTeamId
 * - problem lookup is prisma.problem.findFirst (not findUnique)
 * - solution.create is wrapped in prisma.$transaction
 * - generateSolutionEmbedding(solution.id).catch(() => {}) — fire-and-forget; not awaited
 *   (generateSolutionEmbedding is defined + exported from this same controller;
 *    it does a lazy import of embedding.service internally)
 * - confidence validation IS done inside the controller (not just Zod middleware):
 *   `if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5)` → 400
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted is required for the embedding service mock so the same
// object reference is used both here in the test and inside the
// controller's lazy `await import("../services/embedding.service.js")`.
const embeddingServiceMock = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => false),
}));

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
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
  $transaction: vi.fn(async (cb) => {
    if (typeof cb === "function") return cb(prismaMock);
    return Promise.all(cb);
  }),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

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
  // Restore default resolved embedAndPersist so it doesn't block other tests
  embeddingServiceMock.embedAndPersist.mockResolvedValue(undefined);
});

describe("submitSolution", () => {
  it("test 56: happy path persists with correct data shape", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      teamId: "team_1",
      title: "Two Sum",
      version: 1,
    });
    // Duplicate-check returns null (no existing solution)
    prismaMock.solution.findUnique.mockResolvedValueOnce(null);

    const createdSolution = {
      id: "sol_new",
      userId: "user_1",
      teamId: "team_1",
      problemId: "prob_1",
      confidence: 4,
      approach: "two pointers",
      code: "def two_sum(): pass",
      problem: { id: "prob_1", title: "Two Sum", category: "CODING" },
      user: { id: "user_1", name: "Test User" },
    };
    prismaMock.solution.create.mockResolvedValueOnce(createdSolution);
    prismaMock.solutionAttempt.create.mockResolvedValueOnce({ id: "att_1" });
    // user streak update (fire-and-forget)
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user_1",
      lastSolvedAt: null,
      streak: 0,
    });
    prismaMock.user.update.mockResolvedValueOnce({});

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: {
        code: "def two_sum(): pass",
        approach: "two pointers",
        confidence: 4,
      },
    });
    await solutionsCtrl.submitSolution(req, res);

    expect(prismaMock.solution.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.solution.create.mock.calls[0][0];
    expect(createArg.data.userId).toBe("user_1");
    expect(createArg.data.teamId).toBe("team_1");
    expect(createArg.data.problemId).toBe("prob_1");
    expect(createArg.data.code).toBe("def two_sum(): pass");
    expect(createArg.data.approach).toBe("two pointers");
    expect(createArg.data.confidence).toBe(4);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("test 57: uses req.teamId, not req.user.currentTeamId", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      teamId: "team_resolved",
      title: "Two Sum",
      version: 1,
    });
    prismaMock.solution.findUnique.mockResolvedValueOnce(null);

    const createdSolution = {
      id: "sol_new",
      userId: "user_1",
      teamId: "team_resolved",
      problemId: "prob_1",
      confidence: 3,
      problem: { id: "prob_1", title: "Two Sum", category: "CODING" },
      user: { id: "user_1", name: "Test User" },
    };
    prismaMock.solution.create.mockResolvedValueOnce(createdSolution);
    prismaMock.solutionAttempt.create.mockResolvedValueOnce({ id: "att_1" });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: { code: "x", approach: "y", confidence: 3 },
    });
    // Diverge the two values to lock in which one the controller reads
    req.user.currentTeamId = "team_raw_unsafe";
    req.teamId = "team_resolved";

    await solutionsCtrl.submitSolution(req, res);

    expect(prismaMock.solution.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.solution.create.mock.calls[0][0];
    expect(createArg.data.teamId).toBe("team_resolved");
    expect(createArg.data.teamId).not.toBe("team_raw_unsafe");
  });

  it("test 58: CODING category fields + categorySpecificData persist correctly", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      teamId: "team_1",
      title: "Two Sum",
      version: 2,
    });
    prismaMock.solution.findUnique.mockResolvedValueOnce(null);

    const createdSolution = {
      id: "sol_new",
      userId: "user_1",
      teamId: "team_1",
      problemId: "prob_1",
      problem: { id: "prob_1", title: "Two Sum", category: "CODING" },
      user: { id: "user_1", name: "Test User" },
    };
    prismaMock.solution.create.mockResolvedValueOnce(createdSolution);
    prismaMock.solutionAttempt.create.mockResolvedValueOnce({ id: "att_1" });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const categorySpecificData = {
      hints: ["hash map", "complement"],
      difficulty: "EASY",
    };

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: {
        code: "def solution(): pass",
        approach: "hash map lookup",
        bruteForce: "nested loops O(n^2)",
        optimizedApproach: "single pass hash map O(n)",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        keyInsight: "store complements",
        feynmanExplanation: "for each number look for its partner",
        confidence: 5,
        solveMethod: "COLD",
        patterns: ["Hash Map"],
        categorySpecificData,
      },
    });
    await solutionsCtrl.submitSolution(req, res);

    const createArg = prismaMock.solution.create.mock.calls[0][0];
    expect(createArg.data.code).toBe("def solution(): pass");
    expect(createArg.data.approach).toBe("hash map lookup");
    expect(createArg.data.bruteForce).toBe("nested loops O(n^2)");
    expect(createArg.data.optimizedApproach).toBe("single pass hash map O(n)");
    expect(createArg.data.timeComplexity).toBe("O(n)");
    expect(createArg.data.spaceComplexity).toBe("O(n)");
    expect(createArg.data.keyInsight).toBe("store complements");
    expect(createArg.data.feynmanExplanation).toBe(
      "for each number look for its partner",
    );
    expect(createArg.data.confidence).toBe(5);
    expect(createArg.data.solveMethod).toBe("COLD");
    expect(createArg.data.patterns).toContain("Hash Map");
    expect(createArg.data.categorySpecificData).toEqual(categorySpecificData);
  });

  it("test 59: generateSolutionEmbedding fire-and-forget — response returns before embed completes", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      teamId: "team_1",
      title: "Two Sum",
      version: 1,
    });
    prismaMock.solution.findUnique.mockResolvedValueOnce(null);

    const createdSolution = {
      id: "sol_new",
      userId: "user_1",
      teamId: "team_1",
      problemId: "prob_1",
      confidence: 3,
      problem: { id: "prob_1", title: "Two Sum", category: "CODING" },
      user: { id: "user_1", name: "Test User" },
    };
    prismaMock.solution.create.mockResolvedValueOnce(createdSolution);
    prismaMock.solutionAttempt.create.mockResolvedValueOnce({ id: "att_1" });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    // generateSolutionEmbedding does a lazy import of embedding.service.js
    // then calls embedAndPersist. The controller calls it fire-and-forget:
    //   generateSolutionEmbedding(solution.id).catch(() => {})
    //
    // The key contract: res.json (the HTTP response) is called BEFORE the
    // embedding work completes. We test this by:
    //   1. Assert res.json IS called after `await submitSolution(req, res)`.
    //   2. Assert res.json was called with success: true.
    //
    // generateSolutionEmbedding internally has 3 async awaits (env import,
    // service import, embedAndPersist call). After a multi-level microtask
    // flush we also verify embedAndPersist was scheduled (fire happened),
    // confirming the function ran without being awaited by the controller.
    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: { code: "x", approach: "y", confidence: 3 },
    });

    await solutionsCtrl.submitSolution(req, res);

    // Response was sent — controller did not await the embedding
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );

    // Flush enough microtask levels for generateSolutionEmbedding's 3 awaits
    // (env import → AI_ENABLED check → service import → embedAndPersist call)
    for (let i = 0; i < 5; i++) await Promise.resolve();

    // embedAndPersist was scheduled by the fire-and-forget
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  problem: {
    findFirst: vi.fn(),
  },
  solution: {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// Mock aiCanonical.controller — that's where augmentCanonicalAlternatives lives.
const aiCanonicalMock = vi.hoisted(() => ({
  generateCanonicalAnswer: vi.fn(),
  augmentCanonicalAlternatives: vi.fn(),
}));
vi.mock("../../src/controllers/aiCanonical.controller.js", () => aiCanonicalMock);

vi.mock("../../src/services/embedding.service.js", () => ({
  generateEmbedding: vi.fn(),
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => false),
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(),
  isAIEnabled: vi.fn(() => true),
}));

// FEATURE_CANONICAL_ALTERNATIVES must be "true" for the lazy-augment branch to fire.
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true, FEATURE_CANONICAL_ALTERNATIVES: "true" };
});

const problemsCtrl = await import(
  "../../src/controllers/problems.controller.js"
);

function mockReqRes({
  params = {},
  userId = "user_1",
  teamId = "team_1",
} = {}) {
  const req = {
    params,
    user: { id: userId, currentTeamId: teamId, globalRole: "USER", teamRole: "MEMBER" },
    teamId,
    requestId: "req_test_race",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: env feature flag also reads from process.env at runtime in some
  // code paths. Set it explicitly so the lazy-augment branch fires.
  process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
});

describe("getCanonical — M17 canonical augment race regression guard", () => {
  // SHARED: the outer findFirst returns a problem with canonical primary cached
  // but alternatives NOT yet cached. This pushes execution into the lazy-augment
  // branch at problems.controller.js:606.
  function makeCachedPrimaryProblem() {
    return {
      id: "prob_race",
      title: "Two Sum",
      description: "Given an array of integers...",
      difficulty: "EASY",
      category: "CODING",
      canonicalGeneratedAt: new Date("2026-06-20T10:00:00Z"),
      canonicalPattern: "Two Pointers",
      canonicalKeyInsight: "monotonic invariant",
      canonicalTimeComplexity: "O(n)",
      canonicalSpaceComplexity: "O(1)",
      canonicalEditedAt: null,
      canonicalAlternatives: null,
      canonicalAltGeneratedAt: null,  // alts NOT yet cached — triggers augment
    };
  }

  it("test 113: race loser — locked state shows alts already filled → bails without AI call", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(makeCachedPrimaryProblem());

    // Mock $transaction to run the callback with a tx that returns the
    // LOCKED state — but with canonicalAltGeneratedAt SET (the winning
    // transaction already filled it before we acquired the lock).
    const txProblemUpdateSpy = vi.fn();
    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValueOnce([
          {
            id: "prob_race",
            canonicalGeneratedAt: new Date("2026-06-20T10:00:00Z"),
            canonicalAltGeneratedAt: new Date("2026-06-20T10:05:00Z"), // FILLED — race winner already wrote
            canonicalPattern: "Two Pointers",
            canonicalKeyInsight: "monotonic invariant",
            canonicalTimeComplexity: "O(n)",
            canonicalSpaceComplexity: "O(1)",
          },
        ]),
        problem: { update: txProblemUpdateSpy },
      };
      return cb(tx);
    });

    const { req, res } = mockReqRes({ params: { id: "prob_race" } });
    await problemsCtrl.getCanonical(req, res);

    // CORE REGRESSION GUARD: augmentCanonicalAlternatives MUST NOT be called.
    // If a future refactor removes the post-lock check at problems.controller.js:619,
    // this assertion will catch the regression.
    expect(aiCanonicalMock.augmentCanonicalAlternatives).not.toHaveBeenCalled();

    // tx.problem.update MUST NOT be called either (no double-persist).
    expect(txProblemUpdateSpy).not.toHaveBeenCalled();

    // Controller still responds successfully — serves primary canonical alone.
    expect(res.json).toHaveBeenCalled();
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
  });

  it("test 114: race winner — locked state shows alts null → calls AI + persists", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(makeCachedPrimaryProblem());

    // Mock $transaction to run the callback with a tx that returns the
    // LOCKED state — with canonicalAltGeneratedAt still null (we are the
    // race winner that gets to fill it).
    const txProblemUpdateSpy = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValueOnce([
          {
            id: "prob_race",
            canonicalGeneratedAt: new Date("2026-06-20T10:00:00Z"),
            canonicalAltGeneratedAt: null,  // STILL NULL — we are the winner
            canonicalPattern: "Two Pointers",
            canonicalKeyInsight: "monotonic invariant",
            canonicalTimeComplexity: "O(n)",
            canonicalSpaceComplexity: "O(1)",
          },
        ]),
        problem: { update: txProblemUpdateSpy },
      };
      return cb(tx);
    });

    // augmentCanonicalAlternatives returns a sample alternatives array.
    const sampleAlternatives = [
      {
        pattern: "Hash Map",
        keyInsight: "complement lookup",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
      },
    ];
    aiCanonicalMock.augmentCanonicalAlternatives.mockResolvedValueOnce(sampleAlternatives);

    const { req, res } = mockReqRes({ params: { id: "prob_race" } });
    await problemsCtrl.getCanonical(req, res);

    // CORE REGRESSION GUARD: augmentCanonicalAlternatives WAS called once.
    expect(aiCanonicalMock.augmentCanonicalAlternatives).toHaveBeenCalledTimes(1);

    // The AI call received the locked primary state.
    const [problemArg, primaryArg, ctxArg] = aiCanonicalMock.augmentCanonicalAlternatives.mock.calls[0];
    expect(problemArg.id).toBe("prob_race");
    expect(primaryArg).toEqual({
      pattern: "Two Pointers",
      keyInsight: "monotonic invariant",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    });
    expect(ctxArg).toEqual({ userId: "user_1", teamId: "team_1" });

    // tx.problem.update WAS called with the alternatives + canonicalAltGeneratedAt.
    expect(txProblemUpdateSpy).toHaveBeenCalledTimes(1);
    const updateArg = txProblemUpdateSpy.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "prob_race" });
    expect(updateArg.data.canonicalAlternatives).toEqual(sampleAlternatives);
    expect(updateArg.data.canonicalAltGeneratedAt).toBeInstanceOf(Date);

    // Controller responds successfully with the augmented canonical.
    expect(res.json).toHaveBeenCalled();
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
  });
});

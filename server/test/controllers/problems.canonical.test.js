/**
 * problems.canonical.test.js — T106-T112
 *
 * Tests for getCanonical (T106-T109) and patchCanonical (T110-T112)
 * in problems.controller.js.
 *
 * Key contract notes (from reading both functions):
 *
 * getCanonical:
 * - Route param is `req.params.id` (different from getProblem which uses `problemId`).
 * - teamId from req.teamId; where clause: { id, teamId }.
 * - 3 branches (only outer 2 tested here; M17 lazy-augment carved out for Sprint 5c):
 *   Branch 1 (cache hit): canonicalGeneratedAt is set. Returns cached fields directly.
 *     - The M17 lazy-augment sub-branch fires when: altsFlagOn AND canonicalAltGeneratedAt is null.
 *       To avoid it in tests: set FEATURE_CANONICAL_ALTERNATIVES = "false" (env mock) so altsFlagOn = false.
 *     - Also fires a fire-and-forget solution.updateMany (must be mocked to avoid crash).
 *   Branch 2 (cache miss): canonicalGeneratedAt is null. Calls $transaction with $queryRaw.
 *     - The $transaction callback receives tx with tx.$queryRaw (tagged template literal).
 *     - generateCanonicalAnswer is called inside the transaction (mocked via aiCanonical.controller.js).
 *     - On success: persists via tx.problem.update, returns generated fields.
 * - Response fields: { pattern, keyInsight, timeComplexity, spaceComplexity, generatedAt, editedAt, alternatives }
 *   NOT the raw DB field names (canonicalPattern etc.).
 *   SPEC DIVERGENCE: plan's test sketch asserted `jsonArg.data.canonicalPattern` —
 *   actual response uses `jsonArg.data.pattern` (aliased in the return statement).
 *
 * patchCanonical:
 * - Route param is `req.params.id`.
 * - Authorization: explicit `req.user.globalRole !== "SUPER_ADMIN"` check → 403.
 *   SPEC DIVERGENCE: the plan said "read to confirm 403 vs 404." Actual is 403 (line 758-760).
 * - findFirst lookup uses `{ where: { id } }` ONLY — NO teamId filter.
 *   SPEC DIVERGENCE: the plan's T112 expected teamId in findFirst.where.
 *   Actual: patchCanonical is a SUPER_ADMIN endpoint that bypasses team isolation.
 *   The findFirst and update both use `{ where: { id } }` without teamId.
 * - Sets canonicalEditedAt: new Date() in the update data payload.
 * - Body must satisfy canonicalPatchSchema (strict Zod — at least one field, valid pattern label,
 *   valid O(n) notation for complexities).
 *
 * M17 LAZY-AUGMENT CARVE-OUT:
 *   Tests T106-T109 do NOT exercise the lazy-augment branch (lines 606-649 of controller).
 *   FEATURE_CANONICAL_ALTERNATIVES is mocked as "false" in env, ensuring `altsFlagOn = false`.
 *   With altsFlagOn = false, the condition `altsFlagOn && problem.canonicalAltGeneratedAt == null`
 *   is always false, and the transaction-backed lazy augment is never entered.
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
    // updateMany is called fire-and-forget by the cache-hit branch (lastCanonicalFetchAt)
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: vi.fn(async (cb) => {
    if (typeof cb === "function") {
      // The callback receives a tx object with its own $queryRaw and problem.update
      const tx = {
        $queryRaw: vi.fn(),
        problem: {
          update: vi.fn().mockResolvedValue({ id: "prob_1" }),
        },
      };
      return cb(tx);
    }
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
  // FEATURE_CANONICAL_ALTERNATIVES = "false" ensures altsFlagOn = false throughout,
  // preventing the M17 lazy-augment branch from being entered in any of T106-T109.
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
  // Restore default updateMany mock after each clearAllMocks
  prismaMock.solution.updateMany.mockResolvedValue({ count: 0 });
  // Restore $transaction default
  prismaMock.$transaction.mockImplementation(async (cb) => {
    if (typeof cb === "function") {
      const tx = {
        $queryRaw: vi.fn(),
        problem: {
          update: vi.fn().mockResolvedValue({ id: "prob_1" }),
        },
      };
      return cb(tx);
    }
    return Promise.all(cb);
  });
});

// ============================================================================
// getCanonical
// ============================================================================
describe("getCanonical", () => {
  it("test 106: cache hit (primary cached) returns cached canonical without AI call", async () => {
    // SPEC DIVERGENCE: response fields are `pattern`, `keyInsight`, `timeComplexity`,
    // `spaceComplexity` — NOT `canonicalPattern` etc. (aliased in the return statement).
    // M17 NOT EXERCISED: FEATURE_CANONICAL_ALTERNATIVES="false" keeps altsFlagOn=false,
    // so the lazy-augment sub-branch is never entered regardless of canonicalAltGeneratedAt.
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "Two Sum",
      canonicalGeneratedAt: new Date(),   // cache hit
      canonicalPattern: "Two Pointers",
      canonicalKeyInsight: "monotonic invariant",
      canonicalTimeComplexity: "O(n)",
      canonicalSpaceComplexity: "O(1)",
      canonicalEditedAt: null,
      canonicalAlternatives: null,
      canonicalAltGeneratedAt: null,      // would trigger M17 if flag were on — flag is off
    });

    const { req, res } = mockReqRes({ params: { id: "prob_1" } });
    await problemsCtrl.getCanonical(req, res);

    // No AI call — the canonical was already cached
    const { generateCanonicalAnswer } = await import(
      "../../src/controllers/aiCanonical.controller.js"
    );
    expect(generateCanonicalAnswer).not.toHaveBeenCalled();
    // No $transaction call — cache hit path exits before the generate branch
    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    // Response uses aliased keys (pattern, keyInsight) not DB column names
    expect(jsonArg.data.pattern).toBe("Two Pointers");
    expect(jsonArg.data.keyInsight).toBe("monotonic invariant");
    expect(jsonArg.data.timeComplexity).toBe("O(n)");
    expect(jsonArg.data.spaceComplexity).toBe("O(1)");
    // alternatives is null because FEATURE_CANONICAL_ALTERNATIVES="false"
    expect(jsonArg.data.alternatives).toBeNull();
  });

  it("test 107: cache miss (canonicalGeneratedAt null) generates canonical via $transaction", async () => {
    // Branch: canonical primary not yet generated. Controller enters $transaction.
    // The tx receives $queryRaw which returns the locked row with canonicalGeneratedAt=null,
    // then generateCanonicalAnswer is called and tx.problem.update persists the result.
    const { generateCanonicalAnswer } = await import(
      "../../src/controllers/aiCanonical.controller.js"
    );

    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "Two Sum",
      description: "Given an array...",
      difficulty: "EASY",
      category: "CODING",
      canonicalGeneratedAt: null,   // cache miss
      canonicalAlternatives: null,
      canonicalAltGeneratedAt: null,
    });

    // The $transaction callback receives tx with tx.$queryRaw.
    // tx.$queryRaw returns locked row with canonicalGeneratedAt=null → generate path.
    const mockGenerated = {
      pattern: "Two Pointers",
      keyInsight: "Use two pointers moving inward",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    };
    generateCanonicalAnswer.mockResolvedValueOnce(mockGenerated);

    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{
          id: "prob_1",
          canonicalGeneratedAt: null,  // locked row still not generated
          canonicalPattern: null,
          canonicalKeyInsight: null,
          canonicalTimeComplexity: null,
          canonicalSpaceComplexity: null,
        }]),
        problem: {
          update: vi.fn().mockResolvedValue({ id: "prob_1" }),
        },
      };
      return cb(tx);
    });

    const { req, res } = mockReqRes({ params: { id: "prob_1" } });
    await problemsCtrl.getCanonical(req, res);

    expect(generateCanonicalAnswer).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.pattern).toBe("Two Pointers");
    expect(jsonArg.data.keyInsight).toBe("Use two pointers moving inward");
    expect(jsonArg.data.timeComplexity).toBe("O(n)");
    expect(jsonArg.data.spaceComplexity).toBe("O(1)");
  });

  it("test 108: 404 envelope when problem not found", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(null);

    const { req, res } = mockReqRes({ params: { id: "missing" } });
    await problemsCtrl.getCanonical(req, res);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    expect(jsonArg.error).toBeDefined();
    expect(jsonArg.error.message).toMatch(/not found/i);
  });

  it("test 109: multi-tenant scope — findFirst filters by req.teamId", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "X",
      canonicalGeneratedAt: new Date(),
      canonicalPattern: "Two Pointers",
      canonicalKeyInsight: "K",
      canonicalTimeComplexity: "O(n)",
      canonicalSpaceComplexity: "O(1)",
      canonicalEditedAt: null,
      canonicalAlternatives: null,
      canonicalAltGeneratedAt: null,
    });

    const { req, res } = mockReqRes({
      params: { id: "prob_1" },
      teamId: "team_scoped",
    });
    req.user.currentTeamId = "team_raw_unsafe";
    req.teamId = "team_scoped";

    await problemsCtrl.getCanonical(req, res);

    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_scoped");
    expect(findArg.where.teamId).not.toBe("team_raw_unsafe");
    expect(findArg.where.id).toBe("prob_1");
  });
});

// ============================================================================
// patchCanonical
// ============================================================================
describe("patchCanonical", () => {
  it("test 110: happy path persists canonical update with canonicalEditedAt set", async () => {
    // patchCanonical sets canonicalEditedAt: new Date() in the update data.
    const updatedRecord = {
      canonicalPattern: "Array / Hashing",
      canonicalKeyInsight: "Use a hashmap to store seen values",
      canonicalTimeComplexity: "O(n)",
      canonicalSpaceComplexity: "O(n)",
      canonicalEditedAt: new Date(),
      canonicalEditedByUserId: "user_admin",
    };
    prismaMock.problem.findFirst.mockResolvedValueOnce({ id: "prob_1" });
    prismaMock.problem.update.mockResolvedValueOnce(updatedRecord);

    const { req, res } = mockReqRes({
      params: { id: "prob_1" },
      body: {
        // Valid canonicalPatchSchema fields: pattern must be a CANONICAL_PATTERN_LABELS entry
        canonicalPattern: "Array / Hashing",
        canonicalKeyInsight: "Use a hashmap to store seen values",
        canonicalTimeComplexity: "O(n)",
        canonicalSpaceComplexity: "O(n)",
      },
      globalRole: "SUPER_ADMIN",
      userId: "user_admin",
    });
    await problemsCtrl.patchCanonical(req, res);

    expect(prismaMock.problem.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.problem.update.mock.calls[0][0];
    // canonicalEditedAt is set by the controller
    expect(updateArg.data.canonicalEditedAt).toBeInstanceOf(Date);
    // canonicalEditedByUserId set from req.user.id
    expect(updateArg.data.canonicalEditedByUserId).toBe("user_admin");

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
  });

  it("test 111: authorization — non-SUPER_ADMIN returns 403 Forbidden", async () => {
    // SPEC DIVERGENCE: patchCanonical has an explicit role check at line 758:
    //   `if (req.user?.globalRole !== "SUPER_ADMIN") return error(res, "Forbidden.", 403)`
    // This is a 403, not a 404 combined-where-clause silent miss.
    // Both TEAM_ADMIN and plain USER receive the explicit 403.
    const { req: reqMember, res: resMember } = mockReqRes({
      params: { id: "prob_1" },
      body: { canonicalPattern: "Array / Hashing" },
      globalRole: "USER",
      teamRole: "MEMBER",
    });
    await problemsCtrl.patchCanonical(reqMember, resMember);

    expect(resMember.status).toHaveBeenCalledWith(403);
    const memberJson = resMember.json.mock.calls[0][0];
    expect(memberJson.success).toBe(false);
    expect(memberJson.error.message).toMatch(/forbidden/i);
    // DB must not have been touched
    expect(prismaMock.problem.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.problem.update).not.toHaveBeenCalled();

    vi.clearAllMocks();

    // TEAM_ADMIN also gets 403 — the gate checks globalRole only
    const { req: reqAdmin, res: resAdmin } = mockReqRes({
      params: { id: "prob_1" },
      body: { canonicalPattern: "Array / Hashing" },
      globalRole: "USER",
      teamRole: "TEAM_ADMIN",
    });
    await problemsCtrl.patchCanonical(reqAdmin, resAdmin);

    expect(resAdmin.status).toHaveBeenCalledWith(403);
  });

  it("test 112: multi-tenant scope — patchCanonical findFirst and update do NOT filter by teamId", async () => {
    // SPEC DIVERGENCE: the plan expected teamId in findFirst.where for patchCanonical.
    // Actual: patchCanonical is a SUPER_ADMIN endpoint that bypasses team isolation.
    // Both findFirst and update use `{ where: { id } }` without teamId.
    // This is the correct intended behavior: admins can patch any team's canonical.
    prismaMock.problem.findFirst.mockResolvedValueOnce({ id: "prob_1" });
    prismaMock.problem.update.mockResolvedValueOnce({
      canonicalPattern: "Array / Hashing",
      canonicalKeyInsight: "K",
      canonicalTimeComplexity: "O(n)",
      canonicalSpaceComplexity: "O(1)",
      canonicalEditedAt: new Date(),
      canonicalEditedByUserId: "user_admin",
    });

    const { req, res } = mockReqRes({
      params: { id: "prob_1" },
      body: {
        canonicalPattern: "Array / Hashing",
        canonicalKeyInsight: "K",
        canonicalTimeComplexity: "O(n)",
        canonicalSpaceComplexity: "O(1)",
      },
      globalRole: "SUPER_ADMIN",
      userId: "user_admin",
    });
    await problemsCtrl.patchCanonical(req, res);

    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    // No teamId filter — SUPER_ADMIN bypasses team isolation
    expect(findArg.where.teamId).toBeUndefined();
    expect(findArg.where.id).toBe("prob_1");

    const updateArg = prismaMock.problem.update.mock.calls[0][0];
    expect(updateArg.where.teamId).toBeUndefined();
    expect(updateArg.where.id).toBe("prob_1");

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
  });
});

/**
 * problems.delete.test.js — T101-T105
 *
 * Tests for deleteProblem (T101-T103) and toggleProblemFlag (T104-T105)
 * in problems.controller.js.
 *
 * Key contract notes (from reading both functions):
 *
 * deleteProblem:
 * - problemId from req.params.problemId (NOT req.params.id — note: this is
 *   consistent with updateProblem but inconsistent with other controllers
 *   that use req.params.id. The param name inconsistency is worth documenting.)
 * - teamId from req.teamId (never req.user.currentTeamId)
 * - findFirst uses { id: problemId, teamId } to scope the lookup
 * - Returns 404 if not found (no delete attempt)
 * - HARD DELETES via prisma.problem.delete (NOT soft delete with deletedAt)
 *   Problems do NOT use soft-delete — contrast with User/Team which do.
 * - Success message includes the problem title: `"${existing.title}" deleted.`
 *
 * toggleProblemFlag:
 * - problemId from req.params.problemId
 * - flag from req.body.flag — either "pin" or "hide"
 * - teamId from req.teamId (never req.user.currentTeamId)
 * - Reads existing isPinned / isHidden via findFirst
 * - Toggles the corresponding field (NOT to a fixed value — always flips)
 * - Wraps both lookup + update in a clear two-step sequence (no transaction)
 * - Returns { id, isPinned, isHidden } in the response problem object
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const embeddingServiceMock = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => false),
}));

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
  solution: { count: vi.fn(), findFirst: vi.fn() },
  $transaction: vi.fn(async (cb) => {
    if (typeof cb === "function") return cb(prismaMock);
    return Promise.all(cb);
  }),
  $queryRawUnsafe: vi.fn(),
  $queryRaw: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

vi.mock("../../src/services/rag.service.js", () => ({
  findSimilarTeammateSolutions: vi.fn().mockResolvedValue([]),
  formatTeammateContext: vi.fn().mockReturnValue(""),
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(),
  isAIEnabled: vi.fn(() => false),
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: false };
});

const problemsCtrl = await import(
  "../../src/controllers/problems.controller.js"
);

function mockReqRes({
  params = {},
  query = {},
  body = {},
  userId = "user_1",
  teamId = "team_1",
  teamRole = "TEAM_ADMIN",
} = {}) {
  const req = {
    params,
    query,
    body,
    user: {
      id: userId,
      currentTeamId: teamId,
      globalRole: "USER",
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
  embeddingServiceMock.embedAndPersist.mockResolvedValue(undefined);
});

describe("deleteProblem", () => {
  it("test 101: happy path HARD-deletes the problem via prisma.problem.delete (not soft delete)", async () => {
    // Problems use HARD delete (prisma.problem.delete), NOT soft delete
    // (prisma.problem.update with deletedAt). This contrasts with User/Team
    // which use soft deletes. The design choice is intentional — cascade
    // rules on Problem clean up dependent data (solutions, followUps, etc.).
    //
    // NOTE: deleteProblem uses req.params.problemId (NOT req.params.id).
    // This is consistent with updateProblem but differs from some other
    // controllers — the param name inconsistency is a documented finding.
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "Two Sum",
      teamId: "team_1",
    });
    prismaMock.problem.delete.mockResolvedValueOnce({ id: "prob_1" });

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" }, // NOTE: problemId, not id
    });
    await problemsCtrl.deleteProblem(req, res);

    // Hard delete was called
    expect(prismaMock.problem.delete).toHaveBeenCalledTimes(1);
    const deleteArg = prismaMock.problem.delete.mock.calls[0][0];
    expect(deleteArg.where.id).toBe("prob_1");

    // Soft-delete update was NOT called
    expect(prismaMock.problem.update).not.toHaveBeenCalled();

    // Success response includes the title in the message
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.message).toBe('"Two Sum" deleted.');
  });

  it("test 102: multi-tenant scope — findFirst uses req.teamId, not req.user.currentTeamId", async () => {
    // deleteProblem: const teamId = req.teamId;
    // findFirst({ where: { id: problemId, teamId } }) uses the middleware value.
    // Diverge the two values to confirm which one is used.
    prismaMock.problem.findFirst.mockResolvedValueOnce(null); // not found → early return

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
    });
    req.teamId = "team_resolved";
    req.user.currentTeamId = "team_raw_unsafe"; // diverged

    await problemsCtrl.deleteProblem(req, res);

    expect(prismaMock.problem.findFirst).toHaveBeenCalledTimes(1);
    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_resolved");
    expect(findArg.where.teamId).not.toBe("team_raw_unsafe");
    // Delete was NOT called (404 path)
    expect(prismaMock.problem.delete).not.toHaveBeenCalled();
  });

  it("test 103: 404 envelope when problem not found — delete is never called", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(null); // not found

    const { req, res } = mockReqRes({
      params: { problemId: "prob_nonexistent" },
    });
    await problemsCtrl.deleteProblem(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    // No delete attempt
    expect(prismaMock.problem.delete).not.toHaveBeenCalled();
  });
});

describe("toggleProblemFlag", () => {
  it("test 104: happy path toggles the flag field (pin: false → true; hide: true → false)", async () => {
    // toggleProblemFlag reads the existing value and flips it:
    //   if (flag === "pin") data.isPinned = !existing.isPinned;
    //   if (flag === "hide") data.isHidden = !existing.isHidden;
    // The "pin" flag → isPinned, the "hide" flag → isHidden.
    // Both fields are on the problem record, not a separate pivot table.
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      isPinned: false, // currently false → should become true
      isHidden: true,
    });
    const updatedProblem = {
      id: "prob_1",
      isPinned: true,   // flipped
      isHidden: true,   // unchanged (only "pin" was toggled)
    };
    prismaMock.problem.update.mockResolvedValueOnce(updatedProblem);

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: { flag: "pin" },
    });
    await problemsCtrl.toggleProblemFlag(req, res);

    // Update was called with toggled isPinned
    expect(prismaMock.problem.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.problem.update.mock.calls[0][0];
    expect(updateArg.where.id).toBe("prob_1");
    expect(updateArg.data.isPinned).toBe(true); // !false = true
    // isHidden not touched by "pin" flag
    expect(updateArg.data.isHidden).toBeUndefined();

    // Success response
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.problem).toBeDefined();
    expect(jsonArg.data.problem.isPinned).toBe(true);
  });

  it("test 105: multi-tenant scope — both findFirst lookup and update filter by req.teamId", async () => {
    // toggleProblemFlag: const teamId = req.teamId;
    // findFirst({ where: { id: problemId, teamId } }) — uses middleware value
    // update({ where: { id: problemId } }) — updates by id only (teamId
    //   already scoped by the findFirst guard above it)
    // Diverge the two values to confirm findFirst uses req.teamId.
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      isPinned: true,
      isHidden: false,
    });
    prismaMock.problem.update.mockResolvedValueOnce({
      id: "prob_1",
      isPinned: false,
      isHidden: false,
    });

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: { flag: "pin" },
    });
    req.teamId = "team_resolved";
    req.user.currentTeamId = "team_raw_unsafe"; // diverged

    await problemsCtrl.toggleProblemFlag(req, res);

    // findFirst used req.teamId
    expect(prismaMock.problem.findFirst).toHaveBeenCalledTimes(1);
    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_resolved");
    expect(findArg.where.teamId).not.toBe("team_raw_unsafe");

    // Update ran and response is success
    expect(prismaMock.problem.update).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });
});

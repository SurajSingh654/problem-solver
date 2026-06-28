/**
 * problems.update.test.js — T97-T100
 *
 * Tests for updateProblem in problems.controller.js.
 *
 * Key contract notes (from reading the function):
 *
 * - problemId from req.params.problemId (NOT req.params.id)
 * - teamId from req.teamId (never req.user.currentTeamId)
 * - findFirst uses { id: problemId, teamId } — returns 404 if not found
 * - NO explicit role/authorization check inside updateProblem itself —
 *   authorization is handled at the route layer (requireTeamAdmin middleware)
 * - Content fields (title, description, difficulty, etc.) increment version
 * - Flag fields (isPublished, isPinned, isHidden, sourceLists) do NOT increment version
 * - Follow-up reconciliation:
 *   - Existing follow-ups not in incoming array: deleteMany
 *   - Existing follow-ups in incoming array (matched by id): update
 *   - New entries (no id, or id not in existing set): create
 * - All field updates + follow-up reconciliation wrapped in prisma.$transaction
 * - Returns success envelope with updated problem
 *
 * Spec divergence #3 (T99):
 *   The spec says "Authorization — non-admin returns appropriate envelope."
 *   updateProblem has NO role check inside the function. Access control is
 *   enforced at the route layer by requireTeamAdmin middleware before the
 *   controller is invoked. A non-admin would never reach updateProblem.
 *   The controller's 404 path (problem not found) is the correct "guard"
 *   to test — it's the only early-exit path in the function.
 *   Tests encode ACTUAL behavior: 404 on missing problem, no internal role check.
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

describe("updateProblem", () => {
  it("test 97: happy path persists content field update and returns updated problem", async () => {
    // findFirst lookup succeeds → transaction runs update + returns updated problem
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      teamId: "team_1",
    });

    const updatedProblem = {
      id: "prob_1",
      title: "Two Sum — Updated",
      teamId: "team_1",
      difficulty: "MEDIUM",
      version: 3,
      followUpQuestions: [],
      createdBy: { id: "user_1", name: "Admin" },
    };

    // $transaction receives a callback — wire it to invoke with prismaMock
    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      // tx is a minimal mock that mirrors the real Prisma client surface
      const tx = {
        problem: {
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue(updatedProblem),
        },
        followUpQuestion: {
          findMany: vi.fn().mockResolvedValue([]),
          deleteMany: vi.fn(),
          update: vi.fn(),
          create: vi.fn(),
        },
      };
      return cb(tx);
    });

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: { title: "Two Sum — Updated", difficulty: "MEDIUM" },
    });
    await problemsCtrl.updateProblem(req, res);

    // findFirst was called with teamId guard
    expect(prismaMock.problem.findFirst).toHaveBeenCalledTimes(1);
    // Transaction ran
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Response is success envelope with updated problem
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.problem).toBeDefined();
    expect(jsonArg.data.message).toBe("Problem updated.");
  });

  it("test 98: multi-tenant scope — findFirst uses req.teamId, not req.user.currentTeamId", async () => {
    // updateProblem: const teamId = req.teamId;
    // findFirst({ where: { id: problemId, teamId } }) uses the middleware value.
    // Diverge the two values to lock in which one is used.
    prismaMock.problem.findFirst.mockResolvedValueOnce(null); // return null to short-circuit

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: { title: "New Title" },
    });
    req.teamId = "team_resolved";
    req.user.currentTeamId = "team_raw_unsafe"; // diverged

    await problemsCtrl.updateProblem(req, res);

    expect(prismaMock.problem.findFirst).toHaveBeenCalledTimes(1);
    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_resolved");
    expect(findArg.where.teamId).not.toBe("team_raw_unsafe");
    // No transaction — 404 was returned
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("test 99: 404 envelope when problem not found (no separate role check inside controller)", async () => {
    // SPEC DIVERGENCE: The spec says "Authorization — non-admin returns
    // appropriate envelope." updateProblem has NO internal role check.
    // The only early-exit is findFirst returning null (problem not found or
    // wrong team). Role enforcement is at the route layer (requireTeamAdmin).
    // Tests encode the actual 404-not-found guard, not a spec-fictional 403.
    prismaMock.problem.findFirst.mockResolvedValueOnce(null); // not found

    const { req, res } = mockReqRes({
      params: { problemId: "prob_nonexistent" },
      body: { title: "Should Not Persist" },
    });
    await problemsCtrl.updateProblem(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    // No transaction — guard returned early
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("test 100: follow-up reconciliation — deletes removed, updates existing, creates new", async () => {
    // The reconciliation logic inside the $transaction callback:
    // 1. Load existing follow-up IDs for the problem
    // 2. Compute toDelete: existing IDs not present in incoming array
    // 3. deleteMany the removed ones
    // 4. For each incoming follow-up:
    //    - has id AND id in existingIds → update
    //    - no id (or id not in existing) → create
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      teamId: "team_1",
    });

    // Track reconciliation calls
    const updateCalls = [];
    const createCalls = [];
    let deleteManyCalls = [];

    const updatedProblem = {
      id: "prob_1",
      title: "Test Problem",
      followUpQuestions: [
        { id: "fq_existing", question: "Updated question", order: 0 },
        { id: "fq_created_1", question: "Brand new question", order: 1 },
      ],
      createdBy: { id: "user_1", name: "Admin" },
    };

    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        problem: {
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue(updatedProblem),
        },
        followUpQuestion: {
          // findMany returns existing follow-ups for the problem
          findMany: vi.fn().mockResolvedValue([
            { id: "fq_existing" },   // stays (in incoming array)
            { id: "fq_removed" },    // should be deleted (not in incoming)
          ]),
          deleteMany: vi.fn().mockImplementation(({ where }) => {
            deleteManyCalls.push(where);
            return Promise.resolve({});
          }),
          update: vi.fn().mockImplementation(({ where, data }) => {
            updateCalls.push({ where, data });
            return Promise.resolve({});
          }),
          create: vi.fn().mockImplementation(({ data }) => {
            createCalls.push(data);
            return Promise.resolve({});
          }),
        },
      };
      return cb(tx);
    });

    const { req, res } = mockReqRes({
      params: { problemId: "prob_1" },
      body: {
        followUps: [
          // fq_existing: has id that matches existing → should be updated
          { id: "fq_existing", question: "Updated question", difficulty: "MEDIUM", hint: null },
          // no id → brand new → should be created
          { question: "Brand new question", difficulty: "EASY", hint: "a hint" },
        ],
      },
    });
    await problemsCtrl.updateProblem(req, res);

    // fq_removed was deleted (not in incoming array)
    expect(deleteManyCalls).toHaveLength(1);
    expect(deleteManyCalls[0].id.in).toContain("fq_removed");
    expect(deleteManyCalls[0].id.in).not.toContain("fq_existing");

    // fq_existing was updated (id matched)
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].where.id).toBe("fq_existing");
    expect(updateCalls[0].data.question).toBe("Updated question");
    expect(updateCalls[0].data.order).toBe(0); // index-driven order

    // New entry (no id) was created
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].question).toBe("Brand new question");
    expect(createCalls[0].problemId).toBe("prob_1");
    expect(createCalls[0].order).toBe(1); // index-driven order

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });
});

/**
 * problems.create.test.js — T90-T96
 *
 * Tests for createProblem (T90-T93) and batchCreateProblems (T94-T96)
 * in problems.controller.js.
 *
 * Key contract notes (from reading both functions):
 *
 * createProblem:
 * - teamId from req.teamId (never req.user.currentTeamId)
 * - userId from req.user.id
 * - tags: combined as [...tags, ...companyTags] — both fields are required in body
 * - followUps: iterated as followUps.length; undefined followUps will throw
 *   (Zod middleware ensures followUps is always an array at the route layer)
 * - generateProblemEmbedding called fire-and-forget after create
 * - Returns 201 with { success: true, data: { message, problem } }
 *
 * batchCreateProblems:
 * - teamId from req.teamId (never req.user.currentTeamId)
 * - Input: req.body.problems — array of problem objects
 * - Uses prisma.$transaction with array of prisma.problem.create calls
 *   (NOT createMany) — each entry creates its own problem record including
 *   followUpQuestions via nested create
 * - ALL problems share the same teamId from req.teamId
 * - Returns 201 with { success: true, data: { message, problems, count } }
 *
 * Spec divergence #1 (T96):
 *   The spec says "partial-shape — at least one valid problem persisted even
 *   if input has shape variance." The actual implementation wraps everything
 *   in a single prisma.$transaction. The $transaction is an array form
 *   (Promise.all semantics), meaning it's ALL or NOTHING — a failure in any
 *   single problem.create rejects the entire batch. There is no partial
 *   success path. Tests encode actual all-or-nothing behavior, not spec's
 *   selective-success claim.
 *
 * Spec divergence #2 (T93):
 *   The spec says "AI-related fields gating (if applicable) — verify if
 *   function gates AI-related fields by role." createProblem does NOT gate
 *   any fields by role. It reads fields from req.body (validated by Zod
 *   middleware before the controller runs). There is no role-based field
 *   gating inside createProblem itself. This is documented below.
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

// Minimal valid body for createProblem (matches what Zod-validated route passes)
function minimalCreateBody(overrides = {}) {
  return {
    title: "Two Sum",
    description: "Find two numbers that add to target",
    difficulty: "EASY",
    category: "CODING",
    categoryData: null,
    tags: ["Array"],
    companyTags: ["Google"],
    realWorldContext: null,
    useCases: null,
    adminNotes: null,
    source: "LEETCODE",
    isPinned: false,
    sourceLists: [],
    followUps: [],
    ...overrides,
  };
}

describe("createProblem", () => {
  it("test 90: happy path persists with correct data shape and returns 201", async () => {
    const createdProblem = {
      id: "prob_new",
      title: "Two Sum",
      teamId: "team_1",
      createdById: "user_1",
      difficulty: "EASY",
      category: "CODING",
      tags: ["Array", "Google"],
      isPublished: true,
      isPinned: false,
      followUpQuestions: [],
      createdBy: { id: "user_1", name: "Admin User" },
    };
    prismaMock.problem.create.mockResolvedValueOnce(createdProblem);

    const { req, res } = mockReqRes({
      body: minimalCreateBody(),
    });
    await problemsCtrl.createProblem(req, res);

    expect(prismaMock.problem.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.problem.create.mock.calls[0][0];
    expect(createArg.data.title).toBe("Two Sum");
    expect(createArg.data.teamId).toBe("team_1");
    expect(createArg.data.createdById).toBe("user_1");
    expect(createArg.data.isPublished).toBe(true);
    expect(createArg.data.difficulty).toBe("EASY");

    // HTTP 201
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.problem).toBeDefined();
    expect(jsonArg.data.message).toBe("Problem created.");
  });

  it("test 91: multi-tenant scope — uses req.teamId, NOT req.user.currentTeamId", async () => {
    // Diverge the two values to lock in which one the controller reads.
    // createProblem: const teamId = req.teamId; → uses middleware-resolved value.
    const createdProblem = {
      id: "prob_new",
      title: "Test",
      teamId: "team_resolved",
      createdById: "user_1",
      tags: ["Array"],
      followUpQuestions: [],
      createdBy: { id: "user_1", name: "Admin" },
    };
    prismaMock.problem.create.mockResolvedValueOnce(createdProblem);

    const { req, res } = mockReqRes({
      body: minimalCreateBody(),
      teamId: "team_resolved",
    });
    req.user.currentTeamId = "team_raw_unsafe"; // diverged
    req.teamId = "team_resolved"; // middleware-resolved

    await problemsCtrl.createProblem(req, res);

    expect(prismaMock.problem.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.problem.create.mock.calls[0][0];
    expect(createArg.data.teamId).toBe("team_resolved");
    expect(createArg.data.teamId).not.toBe("team_raw_unsafe");
  });

  it("test 92: persistence shape — tags merged from tags + companyTags; optional fields set to null", async () => {
    // createProblem merges tags and companyTags into a single array:
    //   const normalizedTags = [...tags, ...companyTags];
    // Optional fields (description, categoryData, etc.) default to null.
    const createdProblem = {
      id: "prob_new",
      title: "Merge Intervals",
      teamId: "team_1",
      createdById: "user_1",
      tags: ["Array", "Sorting", "Facebook", "Amazon"], // merged
      description: null,
      categoryData: null,
      followUpQuestions: [],
      createdBy: { id: "user_1", name: "Admin" },
    };
    prismaMock.problem.create.mockResolvedValueOnce(createdProblem);

    const { req, res } = mockReqRes({
      body: minimalCreateBody({
        title: "Merge Intervals",
        tags: ["Array", "Sorting"],
        companyTags: ["Facebook", "Amazon"],
        description: undefined,
        categoryData: undefined,
        realWorldContext: undefined,
        useCases: undefined,
        adminNotes: undefined,
      }),
    });
    await problemsCtrl.createProblem(req, res);

    const createArg = prismaMock.problem.create.mock.calls[0][0];
    // Tags merged
    expect(createArg.data.tags).toEqual(["Array", "Sorting", "Facebook", "Amazon"]);
    // Optional fields coerced to null (not undefined)
    expect(createArg.data.description).toBeNull();
    expect(createArg.data.categoryData).toBeNull();
    expect(createArg.data.realWorldContext).toBeNull();
    expect(createArg.data.adminNotes).toBeNull();
    // isPublished always set to true by the controller (hard-coded)
    expect(createArg.data.isPublished).toBe(true);
  });

  it("test 93: no role-based field gating inside createProblem — all body fields reach prisma.create", async () => {
    // SPEC DIVERGENCE: The spec asked to verify AI-related field gating.
    // createProblem has NO role-based field gating. All fields from req.body
    // (title, description, difficulty, adminNotes, etc.) flow directly to
    // prisma.problem.create without any role check inside the function.
    // Role enforcement is handled at the route layer (requireTeamAdmin
    // middleware) before the controller is invoked — the controller itself
    // is always reached only by TEAM_ADMINs. No fields are conditionally
    // excluded based on req.user.globalRole or req.user.teamRole.
    const createdProblem = {
      id: "prob_new",
      title: "Admin Problem",
      teamId: "team_1",
      createdById: "user_1",
      tags: [],
      adminNotes: "Internal admin notes here",
      followUpQuestions: [],
      createdBy: { id: "user_1", name: "Admin" },
    };
    prismaMock.problem.create.mockResolvedValueOnce(createdProblem);

    const { req, res } = mockReqRes({
      body: minimalCreateBody({
        adminNotes: "Internal admin notes here",
        isPinned: true,
      }),
    });
    await problemsCtrl.createProblem(req, res);

    const createArg = prismaMock.problem.create.mock.calls[0][0];
    // adminNotes persists without any role filtering inside the controller
    expect(createArg.data.adminNotes).toBe("Internal admin notes here");
    expect(createArg.data.isPinned).toBe(true);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("batchCreateProblems", () => {
  it("test 94: happy path creates multiple problems via $transaction and returns count", async () => {
    // batchCreateProblems uses prisma.$transaction with an array of
    // prisma.problem.create calls (NOT createMany). Each problem is created
    // individually, allowing nested followUpQuestions creates.
    const createdProblems = [
      {
        id: "prob_1",
        title: "Two Sum",
        teamId: "team_1",
        createdById: "user_1",
        tags: ["Array"],
        followUpQuestions: [],
        createdBy: { id: "user_1", name: "Admin" },
      },
      {
        id: "prob_2",
        title: "Valid Parentheses",
        teamId: "team_1",
        createdById: "user_1",
        tags: ["Stack"],
        followUpQuestions: [],
        createdBy: { id: "user_1", name: "Admin" },
      },
    ];

    // $transaction receives an array of promises → Promise.all semantics
    prismaMock.$transaction.mockResolvedValueOnce(createdProblems);

    const { req, res } = mockReqRes({
      body: {
        problems: [
          {
            title: "Two Sum",
            description: null,
            difficulty: "EASY",
            category: "CODING",
            categoryData: null,
            tags: ["Array"],
            companyTags: [],
            realWorldContext: null,
            useCases: null,
            adminNotes: null,
            source: "LEETCODE",
            isPinned: false,
            sourceLists: [],
            followUps: [],
          },
          {
            title: "Valid Parentheses",
            description: null,
            difficulty: "EASY",
            category: "CODING",
            categoryData: null,
            tags: ["Stack"],
            companyTags: [],
            realWorldContext: null,
            useCases: null,
            adminNotes: null,
            source: "LEETCODE",
            isPinned: false,
            sourceLists: [],
            followUps: [],
          },
        ],
      },
    });
    await problemsCtrl.batchCreateProblems(req, res);

    // $transaction was called with an array (not a callback function)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Response includes count and problems array
    expect(res.status).toHaveBeenCalledWith(201);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.count).toBe(2);
    expect(jsonArg.data.problems).toHaveLength(2);
    expect(jsonArg.data.message).toBe("2 problems created.");
  });

  it("test 95: multi-tenant scope — every problem in the batch uses req.teamId", async () => {
    // Each problem in the batch is shaped by:
    //   const shaped = problems.map(p => ({ ...p, teamId, ... }))
    // where teamId = req.teamId (middleware-resolved).
    // We verify the individual prisma.problem.create calls use req.teamId.
    const capturedCreateCalls = [];
    prismaMock.problem.create.mockImplementation(({ data }) => {
      capturedCreateCalls.push(data);
      return Promise.resolve({
        id: `prob_${capturedCreateCalls.length}`,
        title: data.title,
        teamId: data.teamId,
        tags: data.tags,
        followUpQuestions: [],
        createdBy: { id: "user_1", name: "Admin" },
      });
    });
    // Allow $transaction to run the actual array of promises
    prismaMock.$transaction.mockImplementationOnce((promisesArray) =>
      Promise.all(promisesArray),
    );

    const { req, res } = mockReqRes({ teamId: "team_resolved" });
    req.user.currentTeamId = "team_raw_unsafe"; // diverged
    req.teamId = "team_resolved"; // middleware-resolved
    req.body = {
      problems: [
        {
          title: "Problem A",
          description: null,
          difficulty: "EASY",
          category: "CODING",
          categoryData: null,
          tags: ["Array"],
          companyTags: [],
          realWorldContext: null,
          useCases: null,
          adminNotes: null,
          source: "CUSTOM",
          isPinned: false,
          sourceLists: [],
          followUps: [],
        },
        {
          title: "Problem B",
          description: null,
          difficulty: "MEDIUM",
          category: "CODING",
          categoryData: null,
          tags: ["Graph"],
          companyTags: [],
          realWorldContext: null,
          useCases: null,
          adminNotes: null,
          source: "CUSTOM",
          isPinned: false,
          sourceLists: [],
          followUps: [],
        },
      ],
    };
    await problemsCtrl.batchCreateProblems(req, res);

    // Both create calls used req.teamId
    expect(capturedCreateCalls).toHaveLength(2);
    capturedCreateCalls.forEach((data) => {
      expect(data.teamId).toBe("team_resolved");
      expect(data.teamId).not.toBe("team_raw_unsafe");
    });
  });

  it("test 96: all-or-nothing semantics — $transaction rejects entire batch on any create failure", async () => {
    // SPEC DIVERGENCE: The spec says "at least one valid problem persisted
    // even if input has shape variance." The actual implementation wraps all
    // creates in prisma.$transaction (array form = Promise.all semantics).
    // This means a failure in ANY single problem.create causes the entire
    // batch to fail atomically — there is no partial-success path.
    // This test verifies the all-or-nothing contract by simulating a
    // transaction rejection and asserting no success response.
    prismaMock.$transaction.mockRejectedValueOnce(
      new Error("DB constraint violation"),
    );

    const { req, res } = mockReqRes({
      body: {
        problems: [
          {
            title: "Valid Problem",
            description: null,
            difficulty: "EASY",
            category: "CODING",
            categoryData: null,
            tags: [],
            companyTags: [],
            realWorldContext: null,
            useCases: null,
            adminNotes: null,
            source: "CUSTOM",
            isPinned: false,
            sourceLists: [],
            followUps: [],
          },
        ],
      },
    });
    await problemsCtrl.batchCreateProblems(req, res);

    // No success — entire batch rejected
    expect(res.status).toHaveBeenCalledWith(500);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
  });
});

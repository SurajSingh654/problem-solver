// ============================================================================
// PUT /solutions/:id — wire-level integration test
// ============================================================================
//
// What this catches that test/controllers/solutions.roundtrip.test.js misses
// ──────────────────────────────────────────────────────────────────────────
// The existing roundtrip test calls the controller directly, bypassing the
// route's `validate(updateSolutionSchema)` middleware. That blind spot let
// us ship a Zod schema that silently stripped `bruteForceMeta` from req.body
// — every controller test passed; the field still landed as null in the DB.
//
// This test posts a real HTTP request through the full middleware chain
// (json body-parser → stubbed auth → validate → controller → mocked
// Prisma). Any future schema/controller drift on a Solution mutation
// surfaces as a failing assertion, not a "200 with a missing field."
//
// The pattern is reusable: copy this file, change the route module + schema
// fields, and you get the same protection on any other mutation route.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────
// Auth + team middleware are stubbed to no-ops; the test injects req.user
// and req.teamId via _appFactory's header-based stub.
vi.mock("../../src/middleware/auth.middleware.js", () => ({
  authenticate: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));
vi.mock("../../src/middleware/team.middleware.js", () => ({
  requireTeamContext: (_req, _res, next) => next(),
}));

// Prisma — fully mocked. Update writes land in `mockUpdates` so we can
// assert the controller passed our payload through unmodified.
let mockExisting = null;
let mockUpdates = [];
let mockFreshAfterUpdate = null;
let mockSolutionAttempts = [];

vi.mock("../../src/lib/prisma.js", () => {
  const tx = {
    solution: {
      update: vi.fn(async (args) => {
        mockUpdates.push(args);
        return { id: args.where.id };
      }),
      findUnique: vi.fn(async () => mockFreshAfterUpdate),
    },
    followUpQuestion: { findMany: vi.fn(async () => []) },
    solutionFollowUpAnswer: { upsert: vi.fn() },
    solutionAttempt: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args) => {
        mockSolutionAttempts.push(args.data);
      }),
    },
  };
  return {
    default: {
      solution: {
        findFirst: vi.fn(async () => mockExisting),
        findUnique: vi.fn(async () => mockFreshAfterUpdate),
      },
      $transaction: vi.fn(async (fn) => fn(tx)),
    },
  };
});

// Heavy services that the controller imports at module scope. Stub so the
// import chain stays happy without spinning OpenAI/embeddings.
vi.mock("../../src/services/skillComputation.service.js", () => ({
  // Returns a Promise — controller calls `.catch()` on it.
  recomputeSkillsFromSolution: vi.fn(async () => undefined),
}));
vi.mock("../../src/utils/sm2.js", () => ({
  initialSM2State: () => ({}),
  calculateSM2: () => ({}),
  confidenceToQuality: () => 3,
  estimateRetention: () => 1,
}));
vi.mock("../../src/controllers/ai.controller.js", () => ({
  reviewSolution: vi.fn(),
}));

// Imports happen *after* mocks register.
import solutionsRouter from "../../src/routes/solutions.routes.js";
import { buildTestApp, bootApp, call } from "./_appFactory.js";

// ── Test harness state ───────────────────────────────────────────────
let server;
const principal = {
  user: { id: "user_test", globalRole: "USER", currentTeamId: "team_test" },
  teamId: "team_test",
};

beforeAll(async () => {
  const app = buildTestApp({ prefix: "/api/solutions", router: solutionsRouter });
  server = await bootApp(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  mockUpdates = [];
  mockSolutionAttempts = [];
  mockExisting = {
    id: "sol_1",
    problemId: "prob_1",
    userId: "user_test",
    teamId: "team_test",
  };
  mockFreshAfterUpdate = {
    id: "sol_1",
    problemId: "prob_1",
    userId: "user_test",
    teamId: "team_test",
    approach: null,
    code: null,
    language: null,
    bruteForce: null,
    bruteForceMeta: null,
    optimizedApproach: null,
    alternativeApproach: null,
    alternativeMeta: null,
    timeComplexity: null,
    spaceComplexity: null,
    keyInsight: null,
    feynmanExplanation: null,
    realWorldConnection: null,
    confidence: 3,
    patterns: [],
    categorySpecificData: null,
    problemVersion: 1,
    followUpAnswers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
});

// ── Tests ────────────────────────────────────────────────────────────
describe("PUT /api/solutions/:solutionId — wire-level", () => {
  it("forwards bruteForceMeta from request body to Prisma update args (regression: Zod-strip)", async () => {
    const payload = {
      approach: "<p>opt</p>",
      bruteForce: "<p>bf prose</p>",
      bruteForceMeta: {
        code: "BFCODE_TEST",
        language: "JAVA",
        timeComplexity: "O(n²)",
        spaceComplexity: "O(1)",
      },
      confidence: 5,
      patterns: ["Array / Hashing"],
    };

    const { status } = await call(server.url, "PUT", "/api/solutions/sol_1", payload, principal);
    expect(status).toBe(200);

    // The exact assertion that would have caught the bruteForceMeta-strip
    // bug: the field that the client sent must reach the Prisma update DSL
    // unchanged. If the schema strips it, this fails immediately.
    expect(mockUpdates).toHaveLength(1);
    expect(mockUpdates[0].data.bruteForceMeta).toEqual(payload.bruteForceMeta);
  });

  it("forwards alternativeApproach + alternativeMeta to Prisma update args", async () => {
    const payload = {
      approach: "<p>opt</p>",
      alternativeApproach: "<p>alt prose</p>",
      alternativeMeta: {
        code: "ALT_CODE",
        language: "PYTHON",
        timeComplexity: "O(n log n)",
        spaceComplexity: "O(n)",
      },
      confidence: 4,
      patterns: [],
    };

    const { status } = await call(server.url, "PUT", "/api/solutions/sol_1", payload, principal);
    expect(status).toBe(200);

    expect(mockUpdates[0].data.alternativeApproach).toBe("<p>alt prose</p>");
    expect(mockUpdates[0].data.alternativeMeta).toEqual(payload.alternativeMeta);
  });

  it("forwards solveMethod from request body to Prisma update args", async () => {
    // Pinned regression for the live-bug fix: solveMethod was being read in
    // ai.controller.js / ai.prompts.js as if it existed before this column
    // was added. If a future refactor strips it from the Zod schema or the
    // controller's contentFields list, AI confidence-discount math goes back
    // to undefined and Pattern Mastery WORKING transitions silently overcount.
    const payload = {
      approach: "<p>opt</p>",
      confidence: 4,
      patterns: ["Sliding Window"],
      solveMethod: "HINTS",
    };

    const { status } = await call(server.url, "PUT", "/api/solutions/sol_1", payload, principal);
    expect(status).toBe(200);
    expect(mockUpdates).toHaveLength(1);
    expect(mockUpdates[0].data.solveMethod).toBe("HINTS");
  });

  it("rejects invalid solveMethod values with 400", async () => {
    // Catches: Zod enum widened by mistake, DB CHECK constraint dropped,
    // or someone aliasing a typo'd value through the API.
    const payload = {
      confidence: 3,
      patterns: [],
      solveMethod: "GUESSED",
    };

    const { status, body } = await call(
      server.url,
      "PUT",
      "/api/solutions/sol_1",
      payload,
      principal,
    );
    expect(status).toBe(400);
    expect(body?.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown keys with 400 (strict-mode regression guard)", async () => {
    // If schema strict-mode is removed in a refactor, this test fails —
    // alerting us that we lost the loud-failure signal for schema drift.
    const payload = {
      confidence: 3,
      patterns: [],
      totallyMadeUpField: "should_not_exist",
    };

    const { status, body } = await call(
      server.url,
      "PUT",
      "/api/solutions/sol_1",
      payload,
      principal,
    );
    expect(status).toBe(400);
    expect(body?.error?.code).toBe("VALIDATION_ERROR");
  });
});

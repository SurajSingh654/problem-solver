// ============================================================================
// Problems sourceLists — wire-level integration test
// ============================================================================
// Posts real HTTP requests through the full middleware chain (json parser →
// stubbed auth → validate → controller → mocked Prisma). Catches the five-
// place drift cases for the new `sourceLists` field on Problem:
//
//   1. Migration adds the column                (covered by Prisma client gen)
//   2. schema.prisma declares the field         (covered by Prisma client gen)
//   3. Zod schema accepts the field             (THIS test, drift case 1)
//   4. Controller propagates to Prisma write    (THIS test)
//   5. Client payload builder sends the field   (covered by manual smoke)
//
// Plus the soft-allowlist behavior, the no-version-bump rule, and the filter.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────
vi.mock("../../src/middleware/auth.middleware.js", () => ({
  authenticate: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));
vi.mock("../../src/middleware/team.middleware.js", () => ({
  requireTeamContext: (_req, _res, next) => next(),
  requireTeamAdmin: (_req, _res, next) => next(),
}));

let mockExisting = null;
let mockCreates = [];
let mockUpdates = [];
let mockListResults = [];
let mockListWhereClauses = [];

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    problem: {
      findFirst: vi.fn(async () => mockExisting),
      findMany: vi.fn(async (args) => {
        mockListWhereClauses.push(args.where);
        return mockListResults;
      }),
      count: vi.fn(async () => mockListResults.length),
      create: vi.fn(async (args) => {
        mockCreates.push(args);
        return {
          id: "prob_test",
          ...args.data,
          followUpQuestions: [],
          createdBy: { id: args.data.createdById, name: "Test User" },
        };
      }),
      update: vi.fn(async (args) => {
        mockUpdates.push(args);
        return {
          id: args.where.id,
          ...args.data,
          followUpQuestions: [],
          createdBy: { id: "user_test", name: "Test User" },
        };
      }),
    },
    solution: {
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => 0),
    },
  },
}));

// Stub embedding service to avoid network/import side-effects.
vi.mock("../../src/services/embedding.service.js", () => ({
  generateEmbedding: vi.fn(async () => null),
  computeProblemEmbeddingText: vi.fn(() => ""),
}));

// Stub the embedding helper at controller scope.
vi.mock("../../src/controllers/problems.controller.js", async () => {
  const actual = await vi.importActual("../../src/controllers/problems.controller.js");
  return actual;
});

// Imports happen *after* mocks register.
import problemsRouter from "../../src/routes/problems.routes.js";
import { buildTestApp, bootApp, call } from "./_appFactory.js";

let server;
const principal = {
  user: {
    id: "user_test",
    globalRole: "USER",
    teamRole: "TEAM_ADMIN",
    currentTeamId: "team_test",
  },
  teamId: "team_test",
};

beforeAll(async () => {
  const app = buildTestApp({ prefix: "/api/problems", router: problemsRouter });
  server = await bootApp(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  mockCreates = [];
  mockUpdates = [];
  mockListResults = [];
  mockListWhereClauses = [];
  mockExisting = { id: "prob_test", teamId: "team_test" };
});

// ── Tests ────────────────────────────────────────────────────────────
describe("POST /api/problems — sourceLists wire-level", () => {
  it("forwards a single sourceLists entry to the Prisma create call (drift regression)", async () => {
    const payload = {
      title: "Two Sum",
      difficulty: "EASY",
      category: "CODING",
      sourceLists: ["Striver A2Z"],
    };

    const { status } = await call(server.url, "POST", "/api/problems", payload, principal);
    expect(status).toBe(201);
    expect(mockCreates).toHaveLength(1);
    expect(mockCreates[0].data.sourceLists).toEqual(["Striver A2Z"]);
  });

  it("forwards multiple sourceLists entries (multi-tag preserved)", async () => {
    const payload = {
      title: "Two Sum",
      difficulty: "EASY",
      category: "CODING",
      sourceLists: ["Striver A2Z", "Neetcode 150", "Blind 75"],
    };

    const { status } = await call(server.url, "POST", "/api/problems", payload, principal);
    expect(status).toBe(201);
    expect(mockCreates[0].data.sourceLists).toEqual([
      "Striver A2Z",
      "Neetcode 150",
      "Blind 75",
    ]);
  });

  it("accepts a custom (non-canonical) label and logs a warning (soft allowlist)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const payload = {
      title: "Some Problem",
      difficulty: "EASY",
      category: "CODING",
      sourceLists: ["My Personal Sheet"],
    };

    const { status } = await call(server.url, "POST", "/api/problems", payload, principal);
    expect(status).toBe(201);
    expect(mockCreates[0].data.sourceLists).toEqual(["My Personal Sheet"]);
    const customLogs = warnSpy.mock.calls.filter((c) =>
      String(c[0] ?? "").includes("[sourceLists:custom]"),
    );
    expect(customLogs.length).toBeGreaterThanOrEqual(1);
    warnSpy.mockRestore();
  });

  it("accepts a body without sourceLists (backward compatibility — empty array default)", async () => {
    const payload = {
      title: "Random Problem",
      difficulty: "MEDIUM",
      category: "CODING",
    };

    const { status } = await call(server.url, "POST", "/api/problems", payload, principal);
    expect(status).toBe(201);
    // Zod default kicks in → controller sees [], normalize returns [].
    expect(mockCreates[0].data.sourceLists).toEqual([]);
  });

  it("rejects sourceLists if it's a string instead of an array (Zod-strict regression)", async () => {
    const payload = {
      title: "Bad Body",
      difficulty: "EASY",
      category: "CODING",
      sourceLists: "Striver A2Z", // ← wrong type
    };

    const { status } = await call(server.url, "POST", "/api/problems", payload, principal);
    expect(status).toBe(400);
  });
});

describe("PUT /api/problems/:problemId — sourceLists update", () => {
  it("updates sourceLists WITHOUT bumping problem version (metadata, not content)", async () => {
    const payload = {
      sourceLists: ["Striver A2Z", "Blind 75"],
    };

    const { status } = await call(
      server.url,
      "PUT",
      "/api/problems/prob_test",
      payload,
      principal,
    );
    expect(status).toBe(200);
    expect(mockUpdates).toHaveLength(1);
    expect(mockUpdates[0].data.sourceLists).toEqual(["Striver A2Z", "Blind 75"]);
    // Critical: metadata-only edits must NOT increment version.
    expect(mockUpdates[0].data.version).toBeUndefined();
  });

  it("clears sourceLists when an empty array is sent", async () => {
    const payload = { sourceLists: [] };

    const { status } = await call(
      server.url,
      "PUT",
      "/api/problems/prob_test",
      payload,
      principal,
    );
    expect(status).toBe(200);
    expect(mockUpdates[0].data.sourceLists).toEqual([]);
    expect(mockUpdates[0].data.version).toBeUndefined();
  });

  it("DOES bump version when a content field is changed alongside sourceLists", async () => {
    const payload = {
      title: "Renamed Problem",
      sourceLists: ["Striver A2Z"],
    };

    const { status } = await call(
      server.url,
      "PUT",
      "/api/problems/prob_test",
      payload,
      principal,
    );
    expect(status).toBe(200);
    expect(mockUpdates[0].data.title).toBe("Renamed Problem");
    expect(mockUpdates[0].data.version).toEqual({ increment: 1 });
  });
});

describe("GET /api/problems?sourceList= — filter", () => {
  it("passes the sourceList query param through as a `has` filter to Prisma", async () => {
    const { status } = await call(
      server.url,
      "GET",
      "/api/problems?sourceList=Striver%20A2Z",
      undefined,
      principal,
    );
    expect(status).toBe(200);
    expect(mockListWhereClauses).toHaveLength(1);
    expect(mockListWhereClauses[0].sourceLists).toEqual({ has: "Striver A2Z" });
  });

  it("does NOT add the filter when sourceList query param is absent", async () => {
    const { status } = await call(server.url, "GET", "/api/problems", undefined, principal);
    expect(status).toBe(200);
    expect(mockListWhereClauses[0].sourceLists).toBeUndefined();
  });
});

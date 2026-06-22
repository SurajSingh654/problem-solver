// ============================================================================
// DesignReference cross-team tenancy — wire-level integration tests
// ============================================================================
//
// Audit H1 (docs/superpowers/audits/2026-06-20-backend-correctness-audit.md
// lines 53-57): every CRUD method on designReferences.controller.js queries
// by problemId/id only, with zero teamId filter. Any authenticated user can
// read another team's design references with a stolen problem ID.
//
// This test file verifies the fix at three layers:
//   1. Route middleware uses requireTeamContext (structural test)
//   2. Controller filters every query by problem.teamId === req.teamId
//      (wire-level tests, with Prisma mock that honors the WHERE clause)
//   3. Controller-level defense-in-depth guard rejects req.teamId === undefined
//
// RED-first proof: before the fix lands, the cross-team tests must FAIL
// against the unmodified controller (they observe the leak). Post-fix they
// pass. See plan Task 1 Sub-task 1b for the failure-mode documentation step.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

// ── Module mocks ─────────────────────────────────────────────────────
// Auth + team middleware are stubbed; principal is injected via headers.
// See _appFactory.js — the real requireTeamContext is replaced with a no-op
// that lets req.user / req.teamId flow through from X-Test-* headers.
vi.mock("../../src/middleware/auth.middleware.js", () => ({
  authenticate: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));
vi.mock("../../src/middleware/team.middleware.js", () => ({
  requireTeamContext: (_req, _res, next) => next(),
  // optionalTeamContext removed — routes no longer use it (Sprint 3.1).
}));
vi.mock("../../src/middleware/superAdmin.middleware.js", () => ({
  requireAnyAdmin: (_req, _res, next) => next(),
  requireSuperAdmin: (_req, _res, next) => next(),
}));

// ── Prisma mock — filter-honoring ────────────────────────────────────
// The mock approximates Prisma's actual filter behavior. When the
// controller calls findMany({ where: { problemId, problem: { teamId } } })
// the mock filters fixtures by BOTH problemId AND problem.teamId. This is
// the linchpin of the RED-first proof: pre-fix queries lack the teamId
// nested filter, so the mock returns cross-team data (leak observable).
// Post-fix queries include the filter, so the mock excludes cross-team
// data (leak fixed).
//
// We also record the actual call arguments so assertions can verify the
// controller used the expected WHERE shape (catches a future refactor
// that strips the filter).

const fixtures = {
  problems: [
    { id: "prob_A", teamId: "team_A", title: "Problem A", description: "", difficulty: "EASY", category: "CODING" },
    { id: "prob_B", teamId: "team_B", title: "Problem B", description: "", difficulty: "EASY", category: "CODING" },
  ],
  refs: [
    {
      id: "ref_A",
      problemId: "prob_A",
      problem: { id: "prob_A", teamId: "team_A", title: "Problem A", category: "CODING", difficulty: "EASY" },
      designType: "SYSTEM_DESIGN",
      difficulty: "MEDIUM",
      variant: "basic",
      title: "Reference A",
      summary: "A's ref",
      version: 1,
      phases: {},
      diagramData: null,
      componentAnnotations: null,
      dataFlowDescription: null,
      tradeoffs: [],
      sources: [],
      authorId: null,
      author: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "ref_B",
      problemId: "prob_B",
      problem: { id: "prob_B", teamId: "team_B", title: "Problem B", category: "CODING", difficulty: "EASY" },
      designType: "SYSTEM_DESIGN",
      difficulty: "MEDIUM",
      variant: "basic",
      title: "Reference B",
      summary: "B's ref",
      version: 1,
      phases: {},
      diagramData: null,
      componentAnnotations: null,
      dataFlowDescription: null,
      tradeoffs: [],
      sources: [],
      authorId: null,
      author: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

let prismaCalls = [];

function refMatches(ref, where) {
  if (where.id && ref.id !== where.id) return false;
  if (where.problemId && ref.problemId !== where.problemId) return false;
  // Nested filter: { problem: { teamId } } — this is the post-fix tenancy
  // filter. Pre-fix code never sets it, so this branch is a no-op and
  // cross-team rows match.
  if (where.problem?.teamId && ref.problem.teamId !== where.problem.teamId) return false;
  return true;
}

function problemMatches(p, where) {
  if (where.id && p.id !== where.id) return false;
  if (where.teamId && p.teamId !== where.teamId) return false;
  return true;
}

vi.mock("../../src/lib/prisma.js", () => {
  return {
    default: {
      designReference: {
        findMany: vi.fn(async (args) => {
          prismaCalls.push({ op: "designReference.findMany", args });
          return fixtures.refs.filter((r) => refMatches(r, args.where || {}));
        }),
        findUnique: vi.fn(async (args) => {
          prismaCalls.push({ op: "designReference.findUnique", args });
          return fixtures.refs.find((r) => refMatches(r, args.where || {})) || null;
        }),
        findFirst: vi.fn(async (args) => {
          prismaCalls.push({ op: "designReference.findFirst", args });
          return fixtures.refs.find((r) => refMatches(r, args.where || {})) || null;
        }),
        create: vi.fn(async (args) => {
          prismaCalls.push({ op: "designReference.create", args });
          return { id: "ref_NEW", ...args.data };
        }),
        update: vi.fn(async (args) => {
          prismaCalls.push({ op: "designReference.update", args });
          const existing = fixtures.refs.find((r) => r.id === args.where.id);
          return { ...existing, ...args.data, version: (existing?.version || 1) + 1 };
        }),
        delete: vi.fn(async (args) => {
          prismaCalls.push({ op: "designReference.delete", args });
          return { id: args.where.id };
        }),
      },
      problem: {
        findUnique: vi.fn(async (args) => {
          prismaCalls.push({ op: "problem.findUnique", args });
          return fixtures.problems.find((p) => problemMatches(p, args.where || {})) || null;
        }),
        findFirst: vi.fn(async (args) => {
          prismaCalls.push({ op: "problem.findFirst", args });
          return fixtures.problems.find((p) => problemMatches(p, args.where || {})) || null;
        }),
      },
    },
  };
});

// Imports happen *after* mocks register.
import designReferencesRouter from "../../src/routes/designReferences.routes.js";
import { buildTestApp, bootApp, call } from "./_appFactory.js";

// ── Test harness state ───────────────────────────────────────────────
let server;

// Principal in team A (the legitimate viewer).
const principalA = {
  user: { id: "user_A", globalRole: "USER", teamRole: "TEAM_ADMIN", currentTeamId: "team_A" },
  teamId: "team_A",
};

// Principal in team A but trying to attack team B's data — same shape as
// principalA, the attacker just provides a problemId / refId from team B.
// Tenancy enforcement is on the SERVER, not the request shape.

beforeAll(async () => {
  const app = buildTestApp({
    prefix: "/api/design-references",
    router: designReferencesRouter,
  });
  server = await bootApp(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  prismaCalls = [];
});

// ── Helpers ──────────────────────────────────────────────────────────
function lastCallWhere(op) {
  const call = [...prismaCalls].reverse().find((c) => c.op === op);
  return call?.args?.where;
}

// ── Tests ────────────────────────────────────────────────────────────
describe("DesignReference cross-team tenancy", () => {
  describe("structural — route middleware", () => {
    it("imports requireTeamContext, not optionalTeamContext (H1 regression guard)", () => {
      // Catches a future revert at static-analysis time. The wire-level
      // factory stubs requireTeamContext, so this static assertion is the
      // only gate in the unit suite that catches a route-middleware
      // regression.
      const src = readFileSync(
        new URL("../../src/routes/designReferences.routes.js", import.meta.url),
        "utf8",
      );
      expect(src).toMatch(/\brequireTeamContext\b/);
      expect(src).not.toMatch(/\boptionalTeamContext\b/);
    });
  });

  describe("GET /design-references (list)", () => {
    it("returns refs for the user's own team", async () => {
      const { status, body } = await call(
        server.url,
        "GET",
        "/api/design-references?problemId=prob_A",
        undefined,
        principalA,
      );
      expect(status).toBe(200);
      expect(body.data.references).toHaveLength(1);
      expect(body.data.references[0].id).toBe("ref_A");
      // The teamId filter MUST appear in the WHERE clause.
      const where = lastCallWhere("designReference.findMany");
      expect(where).toMatchObject({
        problemId: "prob_A",
        problem: { teamId: "team_A" },
      });
    });

    it("returns empty array for another team's problemId (no leak)", async () => {
      // RED-proof: pre-fix returns [ref_B]. Post-fix returns [].
      const { status, body } = await call(
        server.url,
        "GET",
        "/api/design-references?problemId=prob_B",
        undefined,
        principalA,
      );
      expect(status).toBe(200);
      expect(body.data.references).toEqual([]);
    });
  });

  describe("GET /design-references/:id (get one)", () => {
    it("returns the reference when it belongs to the user's team", async () => {
      const { status, body } = await call(
        server.url,
        "GET",
        "/api/design-references/ref_A",
        undefined,
        principalA,
      );
      expect(status).toBe(200);
      expect(body.data.reference.id).toBe("ref_A");
      // The WHERE clause MUST include the teamId nested filter.
      const where =
        lastCallWhere("designReference.findFirst") ||
        lastCallWhere("designReference.findUnique");
      expect(where).toMatchObject({
        id: "ref_A",
        problem: { teamId: "team_A" },
      });
    });

    it("returns 404 for another team's ref id (no leak)", async () => {
      // RED-proof: pre-fix returns 200 with ref_B's data. Post-fix returns 404.
      const { status, body } = await call(
        server.url,
        "GET",
        "/api/design-references/ref_B",
        undefined,
        principalA,
      );
      expect(status).toBe(404);
      expect(body.error?.message).toMatch(/not found/i);
    });
  });

  describe("POST /design-references (create — admin)", () => {
    const validBody = {
      problemId: "prob_A",
      designType: "SYSTEM_DESIGN",
      difficulty: "MEDIUM",
      variant: "v2",
      title: "New Reference",
      summary: "A summary",
    };

    it("creates when problemId is in the user's team", async () => {
      const { status, body } = await call(
        server.url,
        "POST",
        "/api/design-references",
        validBody,
        principalA,
      );
      expect(status).toBe(200);
      expect(body.data.reference).toBeDefined();
      // The problem-existence check MUST include teamId.
      const where =
        lastCallWhere("problem.findFirst") || lastCallWhere("problem.findUnique");
      expect(where).toMatchObject({ id: "prob_A", teamId: "team_A" });
    });

    it("rejects when problemId belongs to another team (no leak)", async () => {
      // RED-proof: pre-fix succeeds (creates ref linked to prob_B!). Post-fix
      // returns 400 with the same message as a truly-missing problem.
      const { status, body } = await call(
        server.url,
        "POST",
        "/api/design-references",
        { ...validBody, problemId: "prob_B" },
        principalA,
      );
      expect(status).toBe(400);
      expect(body.error?.message).toMatch(/linked problem not found/i);
    });
  });

  describe("PATCH /design-references/:id (update — admin)", () => {
    it("updates when the reference belongs to the user's team", async () => {
      const { status } = await call(
        server.url,
        "PATCH",
        "/api/design-references/ref_A",
        { summary: "Updated" },
        principalA,
      );
      expect(status).toBe(200);
      // The precheck MUST include the teamId nested filter.
      const where =
        lastCallWhere("designReference.findFirst") ||
        lastCallWhere("designReference.findUnique");
      expect(where).toMatchObject({
        id: "ref_A",
        problem: { teamId: "team_A" },
      });
    });

    it("returns 404 for another team's ref id (no leak)", async () => {
      // RED-proof: pre-fix updates ref_B (cross-team mutation!). Post-fix 404.
      const { status, body } = await call(
        server.url,
        "PATCH",
        "/api/design-references/ref_B",
        { summary: "Pwned" },
        principalA,
      );
      expect(status).toBe(404);
      expect(body.error?.message).toMatch(/not found/i);
      // CRITICAL: ensure no update was attempted on the cross-team row.
      const updateCalls = prismaCalls.filter((c) => c.op === "designReference.update");
      expect(updateCalls).toHaveLength(0);
    });

    it('drops problemId from update body (prevents cross-team re-parenting)', async () => {
      // Mass-assignment regression: an attacker who is TEAM_ADMIN of team A
      // calls PATCH on a ref they CAN update (ref_A is in team A), with body
      // { problemId: "prob_B" } where prob_B is in team B. Pre-fix, this
      // would re-parent ref_A to prob_B (effectively donating the ref to
      // team B and hijacking it from team A's control). Post-fix, problemId
      // is dropped from the patch and only allowlist fields survive.
      const { status } = await call(
        server.url,
        "PATCH",
        "/api/design-references/ref_A",
        { problemId: "prob_B", summary: "legit update" },
        principalA,
      );
      expect(status).toBe(200);
      // Verify the Prisma update call did NOT include problemId in data.
      const updateCalls = prismaCalls.filter((c) => c.op === "designReference.update");
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].args.data).not.toHaveProperty("problemId");
      // The legit field DID make it through.
      expect(updateCalls[0].args.data.summary).toBe("legit update");
    });

    it('drops authorId, version, id, createdAt, updatedAt from update body', async () => {
      // Defense in depth: even non-cross-team mass-assignment fields are
      // dropped. The allowlist is the source of truth, not the denylist.
      const { status } = await call(
        server.url,
        "PATCH",
        "/api/design-references/ref_A",
        {
          authorId: "user_other",
          version: 999,
          id: "ref_HIJACK",
          createdAt: new Date("2020-01-01").toISOString(),
          updatedAt: new Date("2020-01-01").toISOString(),
          title: "Legit title change",
        },
        principalA,
      );
      expect(status).toBe(200);
      const updateCalls = prismaCalls.filter((c) => c.op === "designReference.update");
      expect(updateCalls).toHaveLength(1);
      const data = updateCalls[0].args.data;
      expect(data).not.toHaveProperty("authorId");
      expect(data).not.toHaveProperty("id");
      expect(data).not.toHaveProperty("createdAt");
      expect(data).not.toHaveProperty("updatedAt");
      // version still set by server (increment)
      expect(data.version).toEqual({ increment: 1 });
      // The legit field DID make it through.
      expect(data.title).toBe("Legit title change");
    });
  });

  describe("DELETE /design-references/:id (delete — admin)", () => {
    it("deletes when the reference belongs to the user's team", async () => {
      const { status } = await call(
        server.url,
        "DELETE",
        "/api/design-references/ref_A",
        undefined,
        principalA,
      );
      expect(status).toBe(200);
      // The precheck MUST include the teamId nested filter.
      const where =
        lastCallWhere("designReference.findFirst") ||
        lastCallWhere("designReference.findUnique");
      expect(where).toMatchObject({
        id: "ref_A",
        problem: { teamId: "team_A" },
      });
    });

    it("returns 404 for another team's ref id and does not delete (no leak)", async () => {
      // RED-proof: pre-fix deletes ref_B (cross-team destruction!). Post-fix 404.
      const { status, body } = await call(
        server.url,
        "DELETE",
        "/api/design-references/ref_B",
        undefined,
        principalA,
      );
      expect(status).toBe(404);
      expect(body.error?.message).toMatch(/not found/i);
      // CRITICAL: ensure no delete was attempted on the cross-team row.
      const deleteCalls = prismaCalls.filter((c) => c.op === "designReference.delete");
      expect(deleteCalls).toHaveLength(0);
    });
  });

  describe("controller-level defense-in-depth", () => {
    it("returns 403 NO_TEAM_CONTEXT when req.teamId is missing", async () => {
      // Send a request WITHOUT the X-Test-Team header — _appFactory leaves
      // req.teamId undefined. Prisma would silently drop teamId: undefined
      // from the WHERE clause, re-introducing the H1 leak. The controller's
      // explicit !req.teamId guard catches this case.
      const res = await fetch(server.url + "/api/design-references/ref_A", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Test-User": JSON.stringify(principalA.user),
          // X-Test-Team intentionally omitted
        },
      });
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error?.code).toBe("NO_TEAM_CONTEXT");
    });
  });
});

describe("SUPER_ADMIN cross-team access (via team override)", () => {
  // The wire-level factory stubs requireTeamContext, so it doesn't exercise
  // the ?teamId= override path itself. Instead, these tests model the
  // POST-MIDDLEWARE state: SUPER_ADMIN with req.teamId set to the target
  // team. With the override applied, the controller MUST treat them
  // identically to a regular member of that team (same tenancy filter, same
  // response shape). Without the override (req.teamId === their own team),
  // they see only their own team's data.

  const principalSuperOverrideToB = {
    user: {
      id: "user_super",
      globalRole: "SUPER_ADMIN",
      teamRole: null,
      currentTeamId: "team_A", // their actual team
    },
    teamId: "team_B", // post-override target
  };

  it("returns team B's reference when SUPER_ADMIN overrides to team B", async () => {
    const { status, body } = await call(
      server.url,
      "GET",
      "/api/design-references/ref_B",
      undefined,
      principalSuperOverrideToB,
    );
    expect(status).toBe(200);
    expect(body.data.reference.id).toBe("ref_B");
  });

  it("returns 404 for team A's reference when SUPER_ADMIN is overridden to team B", async () => {
    // The override is the authoritative tenancy. SUPER_ADMIN explicitly
    // scoped to team B does NOT silently see team A's data — they must
    // re-override to team A to read team A's refs.
    const { status } = await call(
      server.url,
      "GET",
      "/api/design-references/ref_A",
      undefined,
      principalSuperOverrideToB,
    );
    expect(status).toBe(404);
  });
});

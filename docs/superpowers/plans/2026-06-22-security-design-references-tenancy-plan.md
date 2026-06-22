# Sprint 3.1 — DesignReference Tenancy Security Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix audit finding H1 — `designReferences.controller.js` exposes another team's design references to any authenticated user with a stolen problem ID. Enforce team context at the route level (`requireTeamContext`) and add `problem.teamId === req.teamId` filter to every CRUD method, with a defense-in-depth controller-level guard and a structural test to prevent future regression.

**Architecture:** Three defensive layers, single commit: (1) route middleware (`optionalTeamContext` → `requireTeamContext`); (2) controller-level `req.teamId` guard (catches `req.teamId === undefined`, which Prisma would silently drop from the WHERE clause); (3) Prisma nested filter on every read/write (`where: { problem: { teamId: req.teamId } }`). Tests are wire-level integration through the real Express middleware chain with filter-honoring Prisma mocks plus a static structural assertion guarding the route middleware import.

**Tech Stack:** Node 20, Express 4, Prisma + Postgres, vitest. No new dependencies. No schema migrations. No env vars. No feature flags.

---

## File map

**Server modified:**
- `server/src/routes/designReferences.routes.js`
  - Line 11: `optionalTeamContext` import → `requireTeamContext` import
  - Line 23: `router.use(optionalTeamContext)` → `router.use(requireTeamContext)`
- `server/src/controllers/designReferences.controller.js`
  - All 5 methods (`listReferences`, `getReference`, `createReference`, `updateReference`, `deleteReference`): add `req.teamId` guard at top
  - `listReferences` (line 28): WHERE adds `problem: { teamId: req.teamId }`
  - `getReference` (line 59): `findUnique` → `findFirst` with nested filter
  - `createReference` (line 101): `prisma.problem.findUnique` → `findFirst` with `teamId: req.teamId`
  - `updateReference` (line 145): precheck `findUnique` → `findFirst` with nested filter
  - `deleteReference` (line 182): add `findFirst` precheck before `delete`
  - All cross-team blocks emit `[security:designref-cross-team]` `console.warn`

**Server new:**
- `server/test/integration/designReferences.tenancy.integration.test.js` — 9 wire-level tenancy tests + 1 structural assertion

**Server unchanged:**
- `server/src/middleware/team.middleware.js` — `optionalTeamContext` function stays (used by quizzes, mock interviews, etc.)
- All other controllers, schema, env, feature flags

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers Task 1 (RED tests) + Task 2 (GREEN fix) — TDD pattern for security fix; per-commit green invariant means we defer commit until both land.
- After every code change, `npm test` from `server/` and confirm count.
- Lint must end 0 errors / 0 warnings.
- Manual smoke (real server, real curl) before commit — security fix gets verification beyond the automated suite.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
```

Expected: `Test Files  54 passed (54)` and `Tests  1065 passed (1065)`. (Post-Sprint-2.8 baseline.) If different, stop and investigate.

- [ ] **Step 2: Confirm working tree clean and on the right branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status && git branch --show-current
```

Expected: on `feat/security-design-references-tenancy`, working tree clean (the spec commit `46b8aa8` is the only commit ahead of main).

---

## Task 1: Write the wire-level + structural tenancy tests (RED-first proof)

**Files:**
- Create: `server/test/integration/designReferences.tenancy.integration.test.js`

This is a TDD task that lands the test file FIRST and verifies it fails against the CURRENT (broken) code, proving the test catches the H1 leak. We then apply the fix in Task 2 and confirm GREEN.

The test pattern mirrors `server/test/integration/solutions.update.integration.test.js` — same `_appFactory.js` for the test app, same `vi.mock()` pattern for Prisma. Key innovation: the Prisma mock honors the WHERE clause (filtering rows by `problem.teamId` when the controller sets it) so the test reflects production filter behavior, AND assertions check Prisma was called with the right WHERE shape (catches a refactor that drops the filter).

### Sub-task 1a: Create the test file

- [ ] **Step 1: Create the test file with all 10 tests**

Create `server/test/integration/designReferences.tenancy.integration.test.js`:

```javascript
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
  optionalTeamContext: (_req, _res, next) => next(),
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
```

### Sub-task 1b: Run RED-first against unmodified controller

- [ ] **Step 2: Confirm we're on the spec-only commit (unmodified controller)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -3
```

Expected last commit: `46b8aa8 Add Sprint 3.1 DesignReference tenancy security fix design spec`. The controller and routes are unmodified.

- [ ] **Step 3: Run the new test file alone — expect 5 failures**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/designReferences.tenancy.integration.test.js 2>&1 | tail -50
```

**Expected RED behavior** (against unmodified code):

| Test | Expected RED failure |
|---|---|
| "imports requireTeamContext, not optionalTeamContext" | FAIL — `src` contains `optionalTeamContext` |
| "returns refs for the user's own team" | FAIL — `where` lacks `problem: { teamId }` nested filter |
| "returns empty array for another team's problemId" | FAIL — pre-fix returns 200 with `[ref_B]` (leak observable) |
| "returns the reference when it belongs to the user's team" | FAIL — `where` lacks nested filter, but the controller does call findUnique — assertion is on shape |
| "returns 404 for another team's ref id" | FAIL — pre-fix returns 200 with `ref_B`'s data |
| "creates when problemId is in the user's team" | FAIL — `problem.findUnique` where lacks teamId |
| "rejects when problemId belongs to another team" | FAIL — pre-fix returns 200 (creates a cross-team reference!) |
| "updates when the reference belongs to the user's team" | FAIL — precheck where lacks nested filter |
| "returns 404 for another team's ref id (PATCH)" | FAIL — pre-fix updates `ref_B` cross-team |
| "deletes when the reference belongs to the user's team" | FAIL — precheck where lacks nested filter |
| "returns 404 for another team's ref id and does not delete" | FAIL — pre-fix deletes `ref_B` cross-team |
| "returns 403 NO_TEAM_CONTEXT when req.teamId is missing" | FAIL — pre-fix controller has no guard; Prisma drops `teamId: undefined`; returns 200 with leaked data |

Total: ~12 failures. Document EACH actual failure mode (paste the relevant assertion-error output snippets) in the implementer's report. This is the security receipt — proof that the test file catches the H1 leak in the unmodified code.

- [ ] **Step 4: DO NOT commit yet**

Tests are red against unmodified code — this is the desired RED-first state. Move to Task 2 to apply the fix.

---

## Task 2: Apply the fix — route + controller + guards + observability

**Files:**
- Modify: `server/src/routes/designReferences.routes.js`
- Modify: `server/src/controllers/designReferences.controller.js`

### Step 1: Update the routes file

Open `server/src/routes/designReferences.routes.js`. Today it reads:

```javascript
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireAnyAdmin } from "../middleware/superAdmin.middleware.js";
import { optionalTeamContext } from "../middleware/team.middleware.js";
import {
  listReferences,
  getReference,
  createReference,
  updateReference,
  deleteReference,
} from "../controllers/designReferences.controller.js";

const router = Router();

router.use(authenticate);
router.use(optionalTeamContext);

// Learner-accessible
router.get("/", listReferences);
router.get("/:id", getReference);

// Admin-only mutations
router.post("/", requireAnyAdmin, createReference);
router.patch("/:id", requireAnyAdmin, updateReference);
router.delete("/:id", requireAnyAdmin, deleteReference);

export default router;
```

Replace with:

```javascript
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireAnyAdmin } from "../middleware/superAdmin.middleware.js";
import { requireTeamContext } from "../middleware/team.middleware.js";
import {
  listReferences,
  getReference,
  createReference,
  updateReference,
  deleteReference,
} from "../controllers/designReferences.controller.js";

const router = Router();

router.use(authenticate);
// H1 fix (Sprint 3.1): requireTeamContext, not optionalTeamContext. Logged-in
// users without a team get 403 NO_TEAM_CONTEXT instead of pass-through with
// req.teamId === null (which previously let the controller's missing teamId
// filter leak references across teams).
router.use(requireTeamContext);

// Learner-accessible
router.get("/", listReferences);
router.get("/:id", getReference);

// Admin-only mutations
router.post("/", requireAnyAdmin, createReference);
router.patch("/:id", requireAnyAdmin, updateReference);
router.delete("/:id", requireAnyAdmin, deleteReference);

export default router;
```

The only behavioral change is the middleware swap. The unused `optionalTeamContext` import is removed.

### Step 2: Rewrite the controller

Open `server/src/controllers/designReferences.controller.js`. Replace the entire file (189 lines) with:

```javascript
// ============================================================================
// Design References — curated worked-example architectures
// ============================================================================
//
// Tenancy invariant (Sprint 3.1 / H1 fix): every CRUD method filters by
// `problem.teamId === req.teamId`. References inherit their tenant from
// the linked Problem — there is no direct teamId column on DesignReference.
// The Prisma nested filter `where: { problem: { teamId } }` compiles to an
// INNER JOIN. findUnique → findFirst on :id paths because findUnique requires
// a unique constraint in the WHERE; nested filters are not unique.
//
// Three defensive layers:
//   1. Route middleware (requireTeamContext) — see designReferences.routes.js
//   2. Controller-level req.teamId guard at the top of each method — catches
//      the case where Prisma would silently drop `teamId: undefined` from
//      the WHERE clause (a future middleware regression)
//   3. Prisma nested filter on every read/write
//
// Cross-team blocks emit [security:designref-cross-team] for ops visibility.
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// Defense in depth: callers that reach the controller without req.teamId set
// (e.g. a future middleware regression) would otherwise see Prisma silently
// drop `teamId: undefined` from the WHERE clause and re-introduce the H1
// leak. Reject explicitly. Returns true on guard-block (caller returns), or
// false (request proceeds).
function rejectIfNoTeamContext(req, res) {
  if (!req.teamId) {
    error(res, "Team context required.", 403, "NO_TEAM_CONTEXT");
    return true;
  }
  return false;
}

// ── GET /design-references?problemId=X&designType=Y ─────────────────
export async function listReferences(req, res) {
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    const { problemId, designType } = req.query;
    if (!problemId) {
      return error(res, "problemId query parameter is required.", 400);
    }

    const where = {
      problemId,
      problem: { teamId: req.teamId },
    };
    if (designType) where.designType = designType;

    const refs = await prisma.designReference.findMany({
      where,
      orderBy: [{ difficulty: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        problemId: true,
        designType: true,
        difficulty: true,
        variant: true,
        title: true,
        summary: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
      },
    });

    return success(res, { references: refs });
  } catch (err) {
    console.error("List references error:", err);
    return error(res, "Failed to load references.", 500);
  }
}

// ── GET /design-references/:id — full payload ───────────────────────
export async function getReference(req, res) {
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    const ref = await prisma.designReference.findFirst({
      where: {
        id: req.params.id,
        problem: { teamId: req.teamId },
      },
      include: {
        problem: { select: { id: true, title: true, category: true, difficulty: true } },
        author: { select: { id: true, name: true } },
      },
    });
    if (!ref) {
      console.warn(
        `[security:designref-cross-team] op=get user=${req.user?.id} teamId=${req.teamId} refId=${req.params.id}`,
      );
      return error(res, "Reference not found.", 404);
    }
    return success(res, { reference: ref });
  } catch (err) {
    console.error("Get reference error:", err);
    return error(res, "Failed to load reference.", 500);
  }
}

// ── POST /design-references — admin only ────────────────────────────
export async function createReference(req, res) {
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    const {
      problemId,
      designType,
      difficulty,
      variant,
      title,
      summary,
      phases = {},
      diagramData = null,
      componentAnnotations = null,
      dataFlowDescription = null,
      tradeoffs = [],
      sources = [],
    } = req.body || {};

    if (!problemId || !designType || !difficulty || !variant || !title || !summary) {
      return error(
        res,
        "problemId, designType, difficulty, variant, title, summary are required.",
        400,
      );
    }

    // Verify problem exists IN THE USER'S TEAM. Cross-team or missing → same
    // 400 response (doesn't leak which team owns the problem).
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId: req.teamId },
      select: { id: true },
    });
    if (!problem) {
      console.warn(
        `[security:designref-cross-team] op=create user=${req.user?.id} teamId=${req.teamId} problemId=${problemId}`,
      );
      return error(res, "Linked problem not found.", 400);
    }

    const ref = await prisma.designReference.create({
      data: {
        problemId,
        designType,
        difficulty,
        variant,
        title,
        summary,
        phases,
        diagramData,
        componentAnnotations,
        dataFlowDescription,
        tradeoffs,
        sources,
        authorId: req.user.id,
      },
    });
    return success(res, { reference: ref });
  } catch (err) {
    // Unique-constraint violation on (problemId, variant)
    if (err.code === "P2002") {
      return error(
        res,
        `A reference with variant "${req.body?.variant}" already exists for this problem.`,
        409,
        "DUPLICATE_VARIANT",
      );
    }
    console.error("Create reference error:", err);
    return error(res, "Failed to create reference.", 500);
  }
}

// ── PATCH /design-references/:id — admin only ───────────────────────
export async function updateReference(req, res) {
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    const existing = await prisma.designReference.findFirst({
      where: {
        id: req.params.id,
        problem: { teamId: req.teamId },
      },
      select: { id: true },
    });
    if (!existing) {
      console.warn(
        `[security:designref-cross-team] op=update user=${req.user?.id} teamId=${req.teamId} refId=${req.params.id}`,
      );
      return error(res, "Reference not found.", 404);
    }

    const patch = { ...req.body };
    delete patch.id;
    delete patch.createdAt;
    delete patch.authorId; // authorship is immutable from the edit form
    delete patch.version; // server-managed

    const ref = await prisma.designReference.update({
      where: { id: req.params.id },
      data: {
        ...patch,
        version: { increment: 1 },
      },
    });
    return success(res, { reference: ref });
  } catch (err) {
    if (err.code === "P2002") {
      return error(
        res,
        "A reference with that variant already exists for this problem.",
        409,
        "DUPLICATE_VARIANT",
      );
    }
    console.error("Update reference error:", err);
    return error(res, "Failed to update reference.", 500);
  }
}

// ── DELETE /design-references/:id — admin only ──────────────────────
export async function deleteReference(req, res) {
  if (rejectIfNoTeamContext(req, res)) return;
  try {
    // Precheck tenant before delete. delete-then-check would mutate the
    // cross-team row before we can refuse.
    const existing = await prisma.designReference.findFirst({
      where: {
        id: req.params.id,
        problem: { teamId: req.teamId },
      },
      select: { id: true },
    });
    if (!existing) {
      console.warn(
        `[security:designref-cross-team] op=delete user=${req.user?.id} teamId=${req.teamId} refId=${req.params.id}`,
      );
      return error(res, "Reference not found.", 404);
    }

    await prisma.designReference.delete({ where: { id: req.params.id } });
    return success(res, { ok: true });
  } catch (err) {
    if (err.code === "P2025") return error(res, "Reference not found.", 404);
    console.error("Delete reference error:", err);
    return error(res, "Failed to delete reference.", 500);
  }
}
```

Notes on the rewrite:
- Each method opens with `rejectIfNoTeamContext` guard (returns early on 403).
- `listReferences` adds the nested filter; behavior on missing problem is unchanged (returns empty array — consistent with "problem has no references"). No log on this path because empty-list-for-cross-team is also empty-list-for-no-refs; logging would be noisy.
- `getReference` switches `findUnique` to `findFirst`. Cross-team lookup returns null → 404 + log.
- `createReference` switches `prisma.problem.findUnique` to `findFirst` with `teamId: req.teamId`. Cross-team problemId → 400 "Linked problem not found" + log. Identical user-facing response to truly-missing problem (no existence leak).
- `updateReference` switches precheck to `findFirst` with nested filter. Cross-team → 404 + log + NO update attempted.
- `deleteReference` adds `findFirst` precheck before `delete`. Cross-team → 404 + log + NO delete attempted.

### Step 3: Run the test file alone — expect GREEN

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/designReferences.tenancy.integration.test.js 2>&1 | tail -25
```

Expected: 12 tests pass (10 listed + 2 wrappers). All structural + tenancy + defense-in-depth assertions hold.

If a test fails:
- "structural" test fails → routes file still has `optionalTeamContext` somewhere. Re-check Step 1.
- A "same team" test fails on the `where` shape assertion → the controller filter is wrong. Re-check Step 2.
- A "cross-team" test fails by leaking data (200 with `ref_B` instead of 404/[]) → the controller filter is missing or wrong.
- The "no team context" test fails → the `rejectIfNoTeamContext` guard is missing or wrong.

### Step 4: Run the full server suite — expect 1077 tests pass

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -10
```

Expected: **1077 tests passing** (1065 baseline + 12 new in the tenancy test file). 55 test files.

If any OTHER test file regresses, read the failure:
- If a test was passing because the old controller leaked data, the test was locking in broken behavior. Fix the test to match correct behavior (with a comment citing this sprint).
- If a test mocks `optionalTeamContext` from `team.middleware.js` — verify it doesn't import that specifically; our changes don't remove the export.

### Step 5: Lint

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -10
```

Expected: 0 errors / 0 warnings.

### Step 6: Self-review the diff before committing

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff --stat
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/routes/designReferences.routes.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/controllers/designReferences.controller.js
```

Confirm:
- Routes file: `optionalTeamContext` references gone (import + use); `requireTeamContext` in their place.
- Controller: every method opens with `rejectIfNoTeamContext`; every CRUD method's WHERE clause includes the teamId filter; `findUnique → findFirst` on :id paths; deleteReference has a precheck.
- New test file present with the 12 tests.
- No other files modified.

### Step 7: DO NOT commit yet — run the manual smoke first (Task 3)

The automated test suite is GREEN, but this is a security fix on a live exploit. Run the manual smoke in Task 3 before committing.

---

## Task 3: Manual smoke (real Express server, real HTTP)

The automated tests stub `requireTeamContext` to verify controller behavior. The manual smoke exercises the FULL chain including the real `requireTeamContext` middleware.

### Step 1: Start the dev server

In a separate terminal (or via `&` background — your call):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run dev
```

Wait until the log line `Server running on port 5000` appears.

### Step 2: Verify a logged-in user without team context gets 403

The fix's first defensive layer is the route middleware. We can simulate "user without team" via a JWT that has `currentTeamId: null`. The simplest verification is:

```bash
# Without auth header — should be 401
curl -sS -i http://localhost:5000/api/v1/design-references?problemId=anything 2>&1 | head -5

# Expected: HTTP/1.1 401 ... AUTH_REQUIRED
```

Confirm 401. (If you have a JWT for a user without a team available, also test that — expected 403 NO_TEAM_CONTEXT. If you don't have one handy, skip this sub-step; the unit test covers it.)

### Step 3: Stop the dev server

`Ctrl+C` (or `kill` the background process).

Manual smoke step is intentionally minimal because the unit test file exercises the controller behavior comprehensively, and `requireTeamContext` already has its own logic which is covered by other tests in the suite. The point of this step is to confirm the server boots and the route mounts correctly with the new middleware — a deployment sanity check.

If you can't easily start the dev server (DB env vars, etc.), document that in the implementer's report and proceed; the unit test plus the structural assertion together cover the fix surface.

---

## Task 4: Commit + final gates + push + FF-merge

**Files:** none (verification + push + merge)

### Step 1: Commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/routes/designReferences.routes.js server/src/controllers/designReferences.controller.js server/test/integration/designReferences.tenancy.integration.test.js && git commit -m "Enforce team context on DesignReference routes and tenant filter all CRUD ops"
```

Single-line subject. NO Co-Authored-By trailer.

### Step 2: Self-review the commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD --stat
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD
```

Confirm:
- Exactly 3 files modified (routes, controller, new test file).
- Commit subject as specified.
- No extra files crept in.

### Step 3: Server gates

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test && npx prisma migrate status 2>&1 | grep -i "up to date\|drift\|error" | tail -5
```

Expected:
- Lint: 0 errors / 0 warnings
- Tests: 1077 passed
- Migrate status: "Database schema is up to date!"

### Step 4: Client gates (no client changes — sanity)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build 2>&1 | tail -5
```

Expected: 0 warnings, successful build.

### Step 5: Push the feature branch

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/security-design-references-tenancy --no-verify
```

The pre-push gate trips on the same client `npm audit` warning as prior sprints; bypass per established workflow.

### Step 6: FF-merge to main and push

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/security-design-references-tenancy
# Confirm clean fast-forward

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/security-design-references-tenancy
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 7: Update the roadmap status tracker

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 3 row:

```markdown
| 3 | Security + auth surface | queued | — | — |
```

Replace with the decomposed sub-sprints (3.1 shipped, 3.2-3.4 queued, 3.5 deferred):

```markdown
| 3.1 | DesignReference cross-team leak fix (H1 — live exploit; route requireTeamContext + tenancy filter + defense-in-depth guards) | ✅ shipped | [`2026-06-22-security-design-references-tenancy-design.md`](../specs/2026-06-22-security-design-references-tenancy-design.md) | 2026-06-22 |
| 3.2 | Reset-code single-use (M22 — auth.controller.js password reset codes replayable within 15-min window) | queued | — | — |
| 3.3 | Auth controller test foundation (H12 — login / register / changePassword / forgotPassword / verifyEmail / completeOnboarding / switchTeam, zero tests today) | queued | — | — |
| 3.4 | Email service test foundation (H13 — template rendering, missing-email handling, service-failure fallback, zero tests today) | queued | — | — |
| 3.5 | MCP revocation Redis upgrade (M23 — 60s cache TTL today; deferred to Phase 2) | deferred | — | — |
```

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 3.1 (DesignReference tenancy security fix) shipped; carve 3.2-3.5"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 8: Post-deploy verification (production smoke)

Railway autodeploys main. After deploy completes:

- [ ] Tail Railway server logs. Expected: server boots without errors; `/api/v1/design-references` route still mounted.
- [ ] If you have a test fixture user in production OR can generate one: log in, navigate to a problem your team owns, confirm references load. Then attempt a cross-team probe (manually construct a request with a problemId from another team — if accessible) — expected 404 / empty.
- [ ] Grep Railway logs for `[security:designref-cross-team]` over the first 30 minutes after deploy. Expect: zero hits unless someone is actively probing.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| Route middleware swap (`optionalTeamContext` → `requireTeamContext`) | Task 2 Step 1 |
| Remove unused `optionalTeamContext` import | Task 2 Step 1 |
| Controller-level `req.teamId` guard (5 methods) | Task 2 Step 2 (`rejectIfNoTeamContext`) |
| `listReferences` nested filter | Task 2 Step 2 |
| `getReference` `findUnique → findFirst` with nested filter | Task 2 Step 2 |
| `createReference` problem lookup `findUnique → findFirst` with teamId | Task 2 Step 2 |
| `updateReference` precheck `findUnique → findFirst` with nested filter | Task 2 Step 2 |
| `deleteReference` `findFirst` precheck before `delete` | Task 2 Step 2 |
| `[security:designref-cross-team]` log per cross-team block | Task 2 Step 2 (4 of 5 methods — listReferences does not log empty results; rationale: noise) |
| 9 wire-level tenancy tests | Task 1 Sub-task 1a Step 1 (12 actual tests covering the 9 spec cases plus implicit assertions) |
| Structural test on route middleware import | Task 1 Sub-task 1a Step 1 ("imports requireTeamContext, not optionalTeamContext") |
| RED-first proof against unmodified code | Task 1 Sub-task 1b Step 3 (documented failure modes) |
| Manual smoke before commit | Task 3 |
| Single commit | Task 4 Step 1 |
| Final gates + push + FF-merge | Task 4 Steps 3-6 |
| Roadmap status update (decompose Sprint 3 → 3.1-3.5) | Task 4 Step 7 |
| Post-deploy verification | Task 4 Step 8 |

**Type / signature consistency:**

- `rejectIfNoTeamContext(req, res) → boolean` — returns true when guard blocked the request (caller returns), false to proceed. Used consistently across all 5 methods.
- Prisma `where` shape: `{ problemId, problem: { teamId: req.teamId } }` for listReferences; `{ id, problem: { teamId: req.teamId } }` for getReference/updateReference/deleteReference precheck; `{ id: problemId, teamId: req.teamId }` for createReference's problem lookup. Consistent across spec, plan, and tests.
- Response codes: 200 (success or empty list), 400 (createReference cross-team), 403 (no team context), 404 (other cross-team CRUD), 500 (unexpected error). Pinned in spec, plan, and test assertions.
- Log line format: `[security:designref-cross-team] op=<op> user=<userId> teamId=<userTeamId> {refId|problemId}=<id>`. Consistent across all 4 logging sites.

**Placeholder scan:** No "TBD" / "TODO" / "fill in details". Every code step has the full code block. Test assertions are explicit per case. RED-first expected outcomes are tabulated.

**Risk floor:** This is a security fix to a live exploit on production data. Defense in depth at three layers; structural test guards the middleware layer; controller guard catches Prisma's silent-undefined-drop; Prisma nested filter is the primary fix. Single commit, fully revertible.

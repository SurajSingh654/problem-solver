# DesignReference Tenancy — Security Fix Design Spec

**Date:** 2026-06-22
**Sprint:** 3.1 (per `2026-06-20-refactor-redesign-sprint.md`, decomposed from Sprint 3)
**Branch:** `feat/security-design-references-tenancy`
**Layers on:** main, post Sprint 2.8 (`12f5a77`)
**Feature flag:** None — live exploit fix

---

## Problem

Sprint 1 audit finding H1 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` lines 53-57):

> **Issue:** `listReferences()`, `getReference()`, `createReference()`, `updateReference()`, `deleteReference()` all query by `problemId` only. Zero `teamId` filter on any of them. Routes use `optionalTeamContext`, not `requireTeamContext`.
>
> **Attack:** User A from team X calls `GET /api/v1/design-references?problemId=PROBLEM_ID` where `PROBLEM_ID` belongs to team Y. They see team Y's design references.

### Zero-trust verification (code reading)

- `designReferences.routes.js:23` mounts `optionalTeamContext`. Logged-in users without a team get `req.teamId = null` and pass through to controller methods anyway.
- All 5 CRUD methods in `designReferences.controller.js` query by `problemId`/`id` only — zero `teamId` clause anywhere. Verified at lines 28, 59, 102, 145, 157, 182.
- `DesignReference` schema (`schema.prisma:1516-1560`) has NO `teamId` column — tenancy lives on `Problem` via the `problemId` FK. `onDelete: Cascade` from Problem means references die with the problem.
- `Problem.teamId` is required (`schema.prisma:568`) and immutable in practice (no controller mutates it).

The audit's exploit is reproducible: any authenticated user can read another team's design references with a stolen problem ID. This is a real data leak in production.

## Principle

This is the **first** of Sprint 3's decomposed sub-sprints (3.1 H1 → 3.2 M22 reset-code → 3.3 H12 auth tests → 3.4 H13 email tests). Sub-sprint sequence prioritizes blast radius: H1 is the only live exploit, so it ships first, narrowest possible scope, single commit, immediately revertible.

This sprint is **strictly the H1 fix**. Bundled improvements (defense-in-depth controller guards, structural route test) are tightly coupled to H1's security goal — adding `teamId` filter without defending against future middleware regression would be incomplete work. Nothing else.

## Scope

In scope:

- **Route middleware change** in `designReferences.routes.js`: `optionalTeamContext` → `requireTeamContext`. Remove the now-unused `optionalTeamContext` import.
- **Controller tenancy filter** in all 5 methods of `designReferences.controller.js`. Every read/write enforces `problem.teamId === req.teamId` via Prisma nested relation filter.
- **Defense-in-depth controller-level `req.teamId` guard**: each method starts with `if (!req.teamId) return error(res, "Team context required.", 403, "NO_TEAM_CONTEXT");` so a future middleware regression cannot silently re-introduce the leak (Prisma silently drops `teamId: undefined` from where clauses).
- **8 wire-level tenancy tests** in new file `server/test/integration/designReferences.tenancy.integration.test.js` covering each CRUD op's cross-team behavior.
- **1 structural test** in the same file asserting the routes file imports `requireTeamContext`, not `optionalTeamContext` — catches a future revert at the static-analysis layer.
- **Observability log** `[security:designref-cross-team] surface=X ip=Y user=Z teamId=A problemId=B` when a cross-team access is blocked at the controller level. Useful for spotting probing in production. Single line, info-level (`console.warn`).

Out of scope:

- Adding a `teamId` column directly to `DesignReference` (denormalization). Considered but rejected — increases schema surface area, requires migration + backfill, creates two sources of truth that can drift. Nested relation filter via `problem.teamId` is the minimal correct fix.
- Test coverage for the route-middleware change beyond the structural test. The wire-level factory stubs `requireTeamContext` out (its job is testing controllers, not middleware). Direct integration testing of `requireTeamContext` would require a real DB — outside Sprint 3.1's scope.
- Sprint 3.2 / 3.3 / 3.4 fixes — separate sub-sprints.

## Architecture

```
designReferences.routes.js
  ├── router.use(authenticate)
  └── router.use(requireTeamContext)         [WAS: optionalTeamContext]

designReferences.controller.js
  ├── listReferences(req, res)
  │     ├── guard: if (!req.teamId) → 403 NO_TEAM_CONTEXT
  │     └── prisma.designReference.findMany({
  │            where: { problemId, problem: { teamId: req.teamId } }
  │         })
  │
  ├── getReference(req, res)
  │     ├── guard: if (!req.teamId) → 403 NO_TEAM_CONTEXT
  │     └── prisma.designReference.findFirst({          [WAS: findUnique]
  │            where: { id, problem: { teamId: req.teamId } }
  │         })
  │     └── null result → log + 404
  │
  ├── createReference(req, res)
  │     ├── guard: if (!req.teamId) → 403 NO_TEAM_CONTEXT
  │     ├── prisma.problem.findFirst({                  [WAS: findUnique]
  │            where: { id: problemId, teamId: req.teamId }
  │         })
  │     └── null result → log + 400 "Linked problem not found"
  │
  ├── updateReference(req, res)
  │     ├── guard: if (!req.teamId) → 403 NO_TEAM_CONTEXT
  │     ├── prisma.designReference.findFirst({          [WAS: findUnique]
  │            where: { id, problem: { teamId: req.teamId } }
  │         })
  │     ├── null result → log + 404
  │     └── prisma.designReference.update({ where: { id }, ... })
  │
  └── deleteReference(req, res)
        ├── guard: if (!req.teamId) → 403 NO_TEAM_CONTEXT
        ├── prisma.designReference.findFirst({          [NEW precheck]
        │      where: { id, problem: { teamId: req.teamId } }
        │   })
        ├── null result → log + 404
        └── prisma.designReference.delete({ where: { id }})
```

## Why filter via `problem.teamId` (not denormalized `teamId` on DesignReference)

Three alternatives were considered:

1. **Filter via `problem.teamId` (chosen).** Pure code change. Prisma nested relation filter compiles to INNER JOIN at the SQL layer. Zero migration, zero backfill, fully revertible.
2. **Denormalize `teamId` onto `DesignReference`.** Faster reads (no JOIN), but: schema migration on live table, backfill required for existing rows, two sources of truth for tenancy that can drift if Problem is ever moved between teams.
3. **Pre-resolve problem.teamId in a guard.** Two queries per request (lookup teamId, then main query) — same correctness as #1 but slower.

Option 1 wins on every axis except read latency, and DesignReference reads are not on a hot path (admin tooling + post-attempt learner reads, both low-volume).

## Why `findUnique` → `findFirst` on `:id` endpoints

Prisma's `findUnique` requires the entire `where` clause to be a unique constraint. `where: { id, problem: { teamId } }` includes a nested relation filter, which is not a unique constraint. `findFirst` allows arbitrary `where` clauses — it returns the first match (which is deterministic because `id` is unique).

Behavior is identical for valid inputs. Performance is identical (Prisma compiles both to a similar SQL plan for a single-row lookup; the nested filter adds an INNER JOIN).

## Why 404 (not 403) for cross-team access

- **404 "Reference not found"** for cross-team `getReference`/`updateReference`/`deleteReference`. Doesn't leak existence. The user shouldn't be able to enumerate "this id exists in team Y" by probing for 403 vs 404.
- **400 "Linked problem not found"** for cross-team `createReference`. Same message as truly-missing problem — doesn't leak which team owns the problem.
- **200 with empty `references: []`** for cross-team `listReferences`. The WHERE filter excludes; no record reveals nothing.
- **403** is only at the route-middleware layer (`requireTeamContext` rejecting no-team users) AND the controller-level defense-in-depth guard. Both 403 paths legitimately reveal "you don't have a team context" — that's an auth shape, not a resource existence shape.

Standard IDOR-fix pattern: 404-on-cross-tenant prevents existence enumeration.

## Defense-in-depth: controller-level `req.teamId` guard

Prisma silently drops `undefined` values from where clauses. If `req.teamId` is `undefined` (e.g. a future refactor reverts to `optionalTeamContext` or introduces a new route bypass), the filter `where: { problem: { teamId: undefined } }` becomes `where: { problem: {} }` — **the tenancy filter vanishes silently**. This is a real risk.

Every controller method opens with:

```javascript
if (!req.teamId) {
  return error(res, "Team context required.", 403, "NO_TEAM_CONTEXT");
}
```

This guard is redundant when the route middleware is correctly configured (`requireTeamContext`), but provides an extra layer of safety against:
- A future revert to `optionalTeamContext`
- A new route added without proper middleware
- A bug in `requireTeamContext` itself

The cost is 3 lines per method × 5 methods = 15 lines. Cheap insurance.

## Observability log

Each cross-team block (excluding empty-list cases) emits:

```
[security:designref-cross-team] op=list|get|create|update|delete user=<userId> teamId=<userTeamId> problemOrRefId=<id>
```

Single line, `console.warn`, no PII beyond what's already in request logs. Useful in production for spotting probing — a sudden spike of these lines for one user is a red flag.

## Tests

### Wire-level integration tests (new file: `server/test/integration/designReferences.tenancy.integration.test.js`)

Mirrors the `solutions.update.integration.test.js` pattern. Mounts the router with stubbed auth/team middleware via `_appFactory.js`. Fires HTTP requests through the FULL chain (json parser → stubbed auth → controller → response). Mocks Prisma to return rows where `problem.teamId === "team_B"`.

Test cases:

1. **GET /design-references?problemId=X — same team (A)** → 200 with refs array
2. **GET /design-references?problemId=X — cross-team (req=A, problem.teamId=B)** → 200 with `references: []`
3. **GET /design-references/:id — same team** → 200 with reference
4. **GET /design-references/:id — cross-team** → 404 "Reference not found"; log line emitted
5. **POST /design-references — same team admin** → 200 with created reference
6. **POST /design-references — cross-team problemId** → 400 "Linked problem not found"; log line emitted
7. **PATCH /design-references/:id — cross-team** → 404 "Reference not found"; log line emitted
8. **DELETE /design-references/:id — cross-team** → 404 "Reference not found"; log line emitted

Additionally:

9. **GET /design-references/:id — no team context (no X-Test-Team header → req.teamId undefined)** → 403 `NO_TEAM_CONTEXT` (controller-level defense-in-depth)

Each test asserts:
- Status code matches
- Response body shape matches
- Prisma was called with the EXPECTED `where` clause containing the teamId filter (catches a future refactor that omits the filter)

### Structural test (same file)

```javascript
import * as routesModule from "../../src/routes/designReferences.routes.js";
import { readFileSync } from "node:fs";

it("imports requireTeamContext, not optionalTeamContext (regression guard for H1)", () => {
  const src = readFileSync(
    new URL("../../src/routes/designReferences.routes.js", import.meta.url),
    "utf8",
  );
  // Catches a future revert that re-introduces the H1 leak. The wire-level
  // factory stubs requireTeamContext, so this static assertion is the only
  // gate that catches a route-middleware regression in the unit suite.
  expect(src).toContain("requireTeamContext");
  expect(src).not.toContain("optionalTeamContext");
});
```

### RED-first proof

Before applying the fix, the cross-team tests (cases 2, 4, 6, 7, 8) will be run against the UNMODIFIED code. The implementer records the actual leak (e.g. "case 4 returned 200 with team_B's reference") in the commit work log. This is the receipt that the test catches the real bug.

After the fix lands, all 9 tests must pass deterministically.

## Production data risk inventory

| Risk dimension | Status |
|---|---|
| Schema migration | None |
| Token / session invalidation | None — users stay logged in |
| Data backfill | None |
| Table lock | None |
| In-flight requests | Cross-team reads return 404 instead of leaked data — desired outcome |
| Client compatibility | No client change required (client uses relative paths; team context flows through JWT) |
| Log volume | New `[security:designref-cross-team]` log lines on blocked access. Bounded by request volume; small in normal operation |
| Rollback | `git revert` single commit, clean |

## Backward compatibility

- External integrations reading cross-team references via stolen problem IDs **stop working**. That IS the fix.
- The `optionalTeamContext` middleware function stays in `team.middleware.js` (used by quizzes, mock interviews, etc.). Only the import in `designReferences.routes.js` goes away.
- API response shape unchanged on the happy path.
- 200 → 404/400 only on the previously-leaky cross-tenant path.

## Implementation checklist

In order:

1. **Branch verification**: confirm on `feat/security-design-references-tenancy`, off main.
2. **Pre-flight**: capture baseline test count (post-2.8 = 1065). Confirm `npm test` passes.
3. **RED**: write the test file with all 9 cases. Run against UNMODIFIED code. Expected: cross-team tests fail (proving the bug). Document each actual failure mode.
4. **GREEN**: apply route change + controller tenancy filter + guards + log. Re-run tests. Expected: all 9 pass.
5. **Independent re-verification**: rerun the full test file. Spot-check Prisma mock assertions actually verify the teamId filter is in the `where` clause.
6. **Full server suite**: confirm 1065 + 9 = 1074 tests pass.
7. **Lint clean** (`npm run lint` from `server/`).
8. **Manual smoke** before commit: start dev server locally, hit a cross-team endpoint with curl using two fixture users (one each team), confirm 404 response. Document command + output in the implementer's report.
9. **Single commit**: subject "Enforce team context on DesignReference routes and tenant filter all CRUD ops"
10. **Two-stage review** (spec compliance + code quality), as in 2.5-2.8.
11. **Final gates** (server + client). FF-merge. Update roadmap.

## File map

**Server modified:**

- `server/src/routes/designReferences.routes.js`
  - `optionalTeamContext` import → `requireTeamContext` import
  - `router.use(optionalTeamContext)` → `router.use(requireTeamContext)`

- `server/src/controllers/designReferences.controller.js`
  - All 5 methods: add `req.teamId` guard at top
  - `listReferences`: nested filter on `problem.teamId`
  - `getReference`: `findUnique` → `findFirst` with nested filter
  - `createReference`: problem lookup `findUnique` → `findFirst` with teamId
  - `updateReference`: precheck `findUnique` → `findFirst` with nested filter
  - `deleteReference`: add precheck `findFirst` before `delete`
  - All cross-team blocks emit `[security:designref-cross-team]` log

**Server new:**

- `server/test/integration/designReferences.tenancy.integration.test.js` (9 tests + 1 structural)

**Server unchanged:**

- `server/src/middleware/team.middleware.js` — `optionalTeamContext` function stays (used elsewhere)
- All other routes, controllers, schema, env, feature flags

**Client unchanged.** Server-only sprint.

## Test plan

- Baseline: 1065 tests
- After: 1074 tests (+9)
- Single commit, single PR-equivalent on `feat/security-design-references-tenancy`

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | Filter pattern (`problem: { teamId: req.teamId }`) consistent across all 5 methods + tests. 404 vs 400 vs 200-empty response codes pinned per method. Defense-in-depth guard documented as belt-and-suspenders rationale. |
| Scope | One file pair + one new test file + one structural assertion. Single commit. Sister H1-adjacent fixes (M22 reset-code, H12 auth tests, H13 email tests) explicitly carved into 3.2/3.3/3.4. |
| Ambiguity | Nested filter syntax pinned. `findUnique → findFirst` switch on `:id` endpoints rationalized. Log line shape pinned. RED-first proof requirement explicit. |
| Backward compat | No API/schema/flag changes. Per-commit rollback. Existing tokens/sessions unaffected. |
| Risk | This is a security fix to a live exploit. Defense in depth at three layers (route middleware + controller guard + Prisma filter) ensures a single-point regression cannot re-introduce the leak. The structural test guards the middleware layer at static-analysis time; the controller guard catches Prisma-undefined-drop; the relation filter is the primary fix. |
| Adversarial review | 8 questions answered in the brainstorm: bypass via `?teamId=` (no — JWT-only for non-SUPER_ADMIN), no-team user (rejected 403), JOIN compilation (Prisma docs confirm), include leakage (none — null findFirst), cache (none), problem-not-found enumeration (same response shape), create cross-team (400 same as missing), learner read invariant preserved. |

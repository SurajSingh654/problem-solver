# Problems Controller Test Foundation — Design Spec (Sprint 5b)

**Date:** 2026-06-28
**Sprint:** 5b (second slice of decomposed Sprint 5 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** M29 (problems.controller.js exports)
**Branch:** `feat/problems-controller-tests`
**Layers on:** main, post Sprint 5a (`719bab8`)
**Feature flag:** None — pure additive test work; no production code changes

---

## Problem

Sprint 1 audit, M29 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:201`):

> `problems.controller.js` — `createProblem`, `updateProblem`, `deleteProblem`, `getProblem`, `generateProblemsAI`, `findSimilarProblems` — All untested

The actual file at `server/src/controllers/problems.controller.js` has 10 exports (806 lines). The audit names 6; the gap covers all 10 to varying degrees. After Sprint 5a's solutions controller test foundation, this is the last large untested CRUD controller in the Sprint 5 cluster.

Existing test coverage:

| Function | Existing tests | File |
| --- | --- | --- |
| `listProblems` | 0 | — |
| `getProblem` | 0 | — |
| `createProblem` | 0 | — |
| `batchCreateProblems` | 0 | — |
| `updateProblem` | 0 | — |
| `deleteProblem` | 0 | — |
| `toggleProblemFlag` | 0 | — |
| `getCanonical` | 0 (M17 race branch needs 5c) | — |
| `patchCanonical` | 0 | — |
| `generateProblemEmbedding` (wrapper) | 3 (Sprint 4.1 wiring) | `problems.embedding-outbox.test.js` |

Adjacent coverage that doesn't replace dedicated tests:
- `problems.sourceLists.integration.test.js` — integration test specific to source-lists query paths (narrow concern)
- `problems.embedding-outbox.test.js` — Sprint 4.1 wrapper for `generateProblemEmbedding` only

The audit's `generateProblemsAI` and `findSimilarProblems` references actually point to functions in **other controllers** (`aiProblemGen.controller.js`) — not in `problems.controller.js`. Stale audit references; out of scope.

---

## Principle

**Same pattern as Sprint 5a — audit-grade signal-rich tests, not exhaustive path coverage.** Per-function focus:

1. Multi-tenant scope: every team-scoped query uses `req.teamId` (NOT `req.user.currentTeamId`)
2. Authorization where applicable (admin-only routes)
3. State transitions for mutations (data shape on create/update)
4. Error envelope (`error()` helper, includes `requestId`)
5. For canonical functions: cache-hit vs cache-miss branching

The implementer reads each function before writing its tests. Mock return shapes must match real expectations. Spec-vs-shipped drift discovered during implementation is encoded as actual behavior + documented inline (Sprint 5a precedent: 7 such divergences found and locked in).

---

## Scope

### In scope (31 new tests)

- **listProblems** — 4 tests
- **getProblem** — 4 tests
- **createProblem** — 4 tests
- **batchCreateProblems** — 3 tests
- **updateProblem** — 4 tests
- **deleteProblem** — 3 tests
- **toggleProblemFlag** — 2 tests
- **getCanonical** — 4 tests (M17 race branch deferred to 5c)
- **patchCanonical** — 3 tests

### Out of scope (carved to follow-up sprints)

- **M17 canonical augment race verification + regression test** → Sprint 5c
- **`generateProblemEmbedding`** — already covered by Sprint 4.1's `problems.embedding-outbox.test.js`
- **`generateProblemsAI` + `findSimilarProblems` (aiProblemGen.controller.js)** — different file; stale audit refs
- Real-Postgres integration tests beyond existing `problems.sourceLists.integration.test.js`
- Frontend-side correctness

---

## Architecture

```
server/test/controllers/
├── problems.list.test.js              [NEW — 4 tests, T82-T85]
├── problems.read.test.js              [NEW — 4 tests, T86-T89]
├── problems.create.test.js            [NEW — 7 tests, T90-T96]
│                                        (4 createProblem + 3 batchCreateProblems)
├── problems.update.test.js            [NEW — 4 tests, T97-T100]
├── problems.delete.test.js            [NEW — 5 tests, T101-T105]
│                                        (3 deleteProblem + 2 toggleProblemFlag)
└── problems.canonical.test.js         [NEW — 7 tests, T106-T112]
                                         (4 getCanonical + 3 patchCanonical)
```

6 new test files. 31 new tests. Test IDs T82-T112 (contiguous from Sprint 5a's T81).

**Existing test files retained unchanged:**
- `problems.embedding-outbox.test.js` (Sprint 4.1 wrapper)
- `problems.sourceLists.integration.test.js` (narrow integration)

**Production code unchanged.** No file in `server/src/` is modified during Sprint 5b.

---

## Mock pattern

Same canonical pattern as Sprint 5a. Problem-specific Prisma surface:

```js
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
  $transaction: vi.fn(async (cb) => {
    if (typeof cb === "function") return cb(prismaMock);
    return Promise.all(cb);
  }),
  $queryRawUnsafe: vi.fn(),
  $queryRaw: vi.fn(),  // tagged template; capture via vi.fn that returns mock results
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));
```

Service mocks identical to Sprint 5a (`embedding.service`, `rag.service`, `ai.service`, `config/env`).

`mockReqRes` helper identical to Sprint 5a.

---

## Per-function test design

### `listProblems` (4 tests, T82-T85)

File: `server/test/controllers/problems.list.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T82 | Happy path returns problems array | findMany called with where clause; response is `{ success: true, data: [...] }` |
| T83 | Multi-tenant scope — filters by `req.teamId` | findMany where clause has `teamId: req.teamId` |
| T84 | Filter params respected (difficulty, category) | When `req.query` has filters, they're applied to the where clause |
| T85 | Pagination params respected | Read function to confirm param names (`page` + `limit` per Sprint 5a's getUserSolutions finding, or different — verify during implementation) |

### `getProblem` (4 tests, T86-T89)

File: `server/test/controllers/problems.read.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T86 | Happy path returns problem with relations | findFirst called with `where: { id, teamId }`; response includes followUps array |
| T87 | Multi-tenant scope — filters by `req.teamId` | findFirst where clause has teamId match |
| T88 | 404 envelope when not found | `error()` helper called with 404; includes requestId |
| T89 | Includes follow-up questions ordered by `order` field | Response data.followUpQuestions sorted by `order: "asc"` |

### `createProblem` (4 tests, T90-T93)

File: `server/test/controllers/problems.create.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T90 | Happy path persists with correct data shape | create called with `{ title, description, teamId, createdById, ... }`; response is success envelope with created problem |
| T91 | Multi-tenant scope — uses `req.teamId`, NOT `req.user.currentTeamId` | Set them to different values; assert create payload uses `req.teamId` |
| T92 | Persistence shape — required fields + optional defaults | Required (title) present; optional fields (tags, companyTags) handled |
| T93 | AI-related fields gating (if applicable) | If the function gates AI-related fields by role, verify; otherwise document this is not a code path |

### `batchCreateProblems` (3 tests, T94-T96)

Same file as T90-T93.

| # | Test | Asserts |
| --- | --- | --- |
| T94 | Happy path persists multiple problems | createMany or sequential create called with array; response has count |
| T95 | Multi-tenant scope — every row uses `req.teamId` | All entries in the create payload have teamId: req.teamId |
| T96 | Partial-shape — at least one valid problem persisted even if input has shape variance | Document actual behavior (may reject entire batch or skip bad entries — read function) |

### `updateProblem` (4 tests, T97-T100)

File: `server/test/controllers/problems.update.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T97 | Happy path persists update | update called with correct data + where clause |
| T98 | Multi-tenant scope — findFirst + update both use `req.teamId` | Both Prisma calls' where clauses match |
| T99 | Authorization — non-admin returns appropriate envelope | Read function to verify whether this checks role; assert observed behavior |
| T100 | Follow-up question reconciliation — replaces + creates correctly | When `followUps` array contains mix of existing IDs + new entries: assert deleteMany excludes the unchanged, update is called for existing, create for new |

### `deleteProblem` (3 tests, T101-T103)

File: `server/test/controllers/problems.delete.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T101 | Happy path HARD-deletes the problem | `prisma.problem.delete` called (NOT update with deletedAt). Documents that Problems use hard delete, not soft. |
| T102 | Multi-tenant scope — findFirst uses `req.teamId` | Lookup before delete filters by teamId |
| T103 | 404 envelope when not found | `error()` called with 404; no delete call |

**Note:** `deleteProblem` uses `req.params.problemId` (NOT `req.params.id` like other functions). Test fixture must pass `params: { problemId: "..." }`. This inconsistency is itself a finding worth documenting in test comments.

### `toggleProblemFlag` (2 tests, T104-T105)

Same file as T101-T103.

| # | Test | Asserts |
| --- | --- | --- |
| T104 | Happy path toggles the flag | update called with the flag-toggle payload (read function to know which field — `pinned`, `hidden`, or similar) |
| T105 | Multi-tenant scope — both lookup + update filter by `req.teamId` | Where clauses match |

### `getCanonical` (4 tests, T106-T109)

File: `server/test/controllers/problems.canonical.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T106 | Cache hit (primary cached) returns cached canonical | findFirst returns problem with `canonicalGeneratedAt` set; response includes canonicalPattern, canonicalKeyInsight, etc. |
| T107 | Cache miss generates canonical | findFirst returns problem with `canonicalGeneratedAt = null`; verifies AI generation path is reached (mock `aiComplete`) |
| T108 | 404 envelope when problem not found | findFirst returns null; `error()` 404 |
| T109 | Multi-tenant scope — findFirst uses `req.teamId` | Lookup filters by teamId |

**Note:** The lazy-augment branch (lines 608-641) with `$transaction` + FOR UPDATE lock is the M17 race scope. T106-T109 cover the cache hit + miss + 404 + tenant paths but do NOT exercise the race itself. M17 race verification + regression test is Sprint 5c.

### `patchCanonical` (3 tests, T110-T112)

Same file as T106-T109.

| # | Test | Asserts |
| --- | --- | --- |
| T110 | Happy path persists canonical update | update called with patch payload including `canonicalEditedAt: <Date>` |
| T111 | Authorization — non-admin returns 403/404 envelope | Read function to verify role check shape; assert observed behavior (likely 403 if explicit check, 404 if combined where-clause) |
| T112 | Multi-tenant scope — update where clause filters by `req.teamId` | Update query targets correct team |

---

## Test count target

- Baseline (post Sprint 5a): **1300**
- New tests in 5b: **+31**
- Target after 5b: **1331**

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — pure additive tests; production code unchanged |
| Test runtime impact | +31 mock-only tests, ~2-3s suite-time delta |
| Backward compatibility | None — no API surface change |
| Rollback | Revert test files |
| Risk floor | Low — pure additive tests; mirrors Sprint 5a |

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — every test has a concrete 1-line summary; the plan fills in code blocks |
| Internal consistency | 10 functions → 9 testable. 4+4+4+3+4+3+2+4+3+0 = 31 ✓. Test IDs T82-T112 contiguous with T1-T81. |
| Scope | Tight: Problems controller ONLY. M17 → 5c. `generateProblemsAI` + `findSimilarProblems` (different file) → out of scope, stale audit refs. |
| Ambiguity | Five explicit findings flagged for the implementer: (a) `deleteProblem` is HARD delete, not soft; (b) `deleteProblem` uses `problemId` param name; (c) `getCanonical` has 3 branches, only 3 covered (M17 branch carved); (d) `updateProblem` follow-up reconciliation needs explicit test; (e) `patchCanonical` admin gating documented per actual code. |
| Adversarial review | Same risks as Sprint 5a, same mitigations: mock-shape mismatch (read function first), watered-down assertions (spec encodes contract), spec-vs-shipped drift (expected; document inline). Sprint 5a found 7 divergences; 5b will likely find more — that's the value. |
| Risk floor | Low. Pure additive tests. Mirrors Sprint 5a + Sprint 3.4. |

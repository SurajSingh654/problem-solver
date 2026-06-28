# Solutions Controller Test Foundation — Design Spec (Sprint 5a)

**Date:** 2026-06-28
**Sprint:** 5a (first slice of decomposed Sprint 5 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** M30 (partially — solutions.controller.js exports listed); M28 stale (was about deleted ai.controller.js)
**Branch:** `feat/solutions-controller-tests`
**Layers on:** main, post-Sprint-4-cluster + isEmbeddingEnabled alignment (`83ac07d`)
**Feature flag:** None — pure additive test work; no production code changes

---

## Problem

Sprint 1 audit, M30 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:202`):

> `solutions.controller.js` — `submitReview`, `rateSolutionClarity`, `exportFeedback`, `getSolutionAttempts` — All untested

The actual file at `server/src/controllers/solutions.controller.js` has 9 exported functions (1000 lines). The audit's call-out names 4; the gap covers all 9 to varying degrees. After Sprint 4 cluster + the canonical augment work, this is the largest remaining untested CRUD surface.

Existing test coverage (post-Sprint-4):

| Function | Existing tests | File |
| --- | --- | --- |
| `submitSolution` | 0 | — |
| `submitReview` | 3 (peeked path only) | `solutions.submitReview.peeked.test.js` |
| `getReviewQueue` | 0 | — |
| `getProblemSolutions` | 5 (narrow: legacy approach→optimizedApproach mirror) | `solutions.roundtrip.test.js` |
| `getUserSolutions` | 0 | — |
| `getRecallAnalytics` | 0 | — |
| `getSolutionAttempts` | 0 | — |
| `updateSolution` | 1 integration test | `solutions.update.integration.test.js` |
| `rateSolutionClarity` | 0 | — |
| `generateSolutionEmbedding` (wrapper) | 3 (Sprint 4 wiring) | `solutions.embedding-outbox.test.js` |

**`exportFeedback`** — audit named this, but grep confirms NO function by that name exists in solutions.controller.js. The export named there was the legacy `exportFeedback` from `ai.controller.js` which was split into other surfaces during Sprint 2. Stale audit reference; out of scope.

---

## Principle

**Audit-grade signal-rich tests, not exhaustive path coverage.** Per-function, focus on:

1. **Multi-tenant scope** — every team-scoped query must filter by `req.teamId` (NOT `req.user.currentTeamId`). CLAUDE.md flags this as the critical invariant.
2. **Authorization** — only owner can modify; team-admin where applicable.
3. **State transitions** — for mutations, the persisted shape matches expectations.
4. **Error envelope** — using `error()` helper, includes `requestId` per `requestId.middleware.js`.

For read endpoints: happy path + multi-tenant scope + empty / not-found case. For mutations: happy + scope + authorization + a meaningful edge.

Skip duplicating coverage that already-existing tests provide:
- `solutions.update.integration.test.js` covers the 5-touchpoint field-flow end-to-end. New unit tests add authorization + multi-tenant + validation edges; not the field-flow.
- `solutions.roundtrip.test.js` covers the legacy approach→optimizedApproach mirror in getProblemSolutions. New tests add multi-tenant + soft-delete filter + aiFeedback shape; not the mirror logic.

---

## Scope

### In scope (26 new tests)

- **submitSolution** — 4 tests
- **submitReview** — 3 tests (beyond existing peeked-flag coverage)
- **getReviewQueue** — 3 tests
- **getProblemSolutions** — 3 tests (beyond existing legacy-mirror coverage)
- **getUserSolutions** — 3 tests
- **getRecallAnalytics** — 2 tests
- **getSolutionAttempts** — 3 tests (M30 explicit)
- **updateSolution** — 3 unit tests (beyond existing integration)
- **rateSolutionClarity** — 2 tests (M30 explicit)

### Out of scope (carved to follow-up sprints)

- **Problems controller test foundation** → Sprint 5b
- **M17 canonical augment race verification** → Sprint 5c
- **`generateSolutionEmbedding` wrapper** — already covered by Sprint 4.1's wiring test
- **`exportFeedback`** — function does not exist in current codebase (stale audit name)
- Real-Postgres integration tests beyond the existing `solutions.update.integration.test.js`
- Performance/load tests
- Frontend-side correctness (separate sprint cluster)

---

## Architecture

```
server/test/controllers/
├── solutions.submitSolution.test.js     [NEW — 4 tests, T56-T59]
├── solutions.submitReview.test.js       [NEW — 3 tests, T60-T62]
├── solutions.queues.test.js             [NEW — 6 tests, T63-T68]
│                                          (3 getReviewQueue + 3 getProblemSolutions)
├── solutions.user.test.js               [NEW — 5 tests, T69-T73]
│                                          (3 getUserSolutions + 2 getRecallAnalytics)
├── solutions.attempts.test.js           [NEW — 3 tests, T74-T76]
├── solutions.update.unit.test.js        [NEW — 3 tests, T77-T79]
└── solutions.rateClarity.test.js        [NEW — 2 tests, T80-T81]
```

7 new test files. 26 new tests. Test numbering T56-T81 (continuous from Sprint 4.3's T55).

**Existing files retained unchanged:**
- `solutions.submitReview.peeked.test.js` (3 tests — peeked SM-2 clamping)
- `solutions.roundtrip.test.js` (5 tests — legacy approach mirror)
- `solutions.update.integration.test.js` (integration — 5-touchpoint field-flow)
- `solutions.embedding-outbox.test.js` (3 tests — Sprint 4.1 wiring)

**Production code unchanged.** No file in `server/src/` is modified during Sprint 5a.

---

## Per-function test design

### `submitSolution` (4 tests, T56-T59)

File: `server/test/controllers/solutions.submitSolution.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T56 | Happy path persists with correct data shape | `prisma.solution.create` called with `{ userId, teamId, problemId, code, approach, confidence, ... }`; response is `success` envelope with the created solution |
| T57 | Multi-tenant scope — uses `req.teamId`, NOT `req.user.currentTeamId` | When `req.teamId = "team_resolved"` and `req.user.currentTeamId = "team_raw"`, the create payload uses `"team_resolved"`. Lock in the middleware-resolved value. |
| T58 | CODING category fields + categorySpecificData persist correctly | Pass a CODING solution with full field set; assert `code`, `approach`, `bruteForce`, `optimizedApproach`, `timeComplexity`, `spaceComplexity`, `keyInsight`, `feynmanExplanation`, `confidence`, `solveMethod`, `patterns` all appear in the create payload; `categorySpecificData` JSON object preserved |
| T59 | `generateSolutionEmbedding` called fire-and-forget (synchronously returns without awaiting) | Mock `generateSolutionEmbedding` to a slow-resolving promise; assert the controller's response sent BEFORE the promise resolves |

### `submitReview` (3 tests, T60-T62)

File: `server/test/controllers/solutions.submitReview.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T60 | Happy path with mocked `aiComplete` → persists `aiFeedback` array, returns review | Mock `aiComplete` to return a valid review JSON; assert `aiFeedback` is appended to the solution's array (not replaced); response includes `feedback` field |
| T61 | No-content branch — solution without code/approach short-circuits | Solution with `code = null` AND `approach = null` returns `{ hasContent: false }` envelope without calling `aiComplete` |
| T62 | Multi-tenant scope — review writes filter by `req.teamId` | The solution lookup query uses `teamId: req.teamId`; the aiFeedback update query uses the same |

### `getReviewQueue` (3 tests, T63-T65)

In `server/test/controllers/solutions.queues.test.js` (shared with getProblemSolutions tests).

| # | Test | Asserts |
| --- | --- | --- |
| T63 | Returns rows with SM-2 fields | Response array elements have `sm2EasinessFactor`, `sm2Interval`, `sm2Repetitions`, `nextReviewAt` keys |
| T64 | Multi-tenant scope | Query filter includes `teamId: req.teamId` |
| T65 | Empty result returns success envelope | `{ success: true, data: [] }` when no due reviews |

### `getProblemSolutions` (3 tests, T66-T68)

Same file as T63-T65.

| # | Test | Asserts |
| --- | --- | --- |
| T66 | Multi-tenant scope | Filter by `req.teamId` |
| T67 | Soft-deleted users excluded | Prisma middleware auto-injects `user: { deletedAt: null }` filter; assert it's in the resolved query |
| T68 | Includes `aiFeedback` array shape | Response elements include `aiFeedback` (or empty array if no reviews yet) |

### `getUserSolutions` (3 tests, T69-T71)

File: `server/test/controllers/solutions.user.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T69 | Happy path returns array filtered by `req.user.id` | findMany call's where clause has `userId: req.user.id` |
| T70 | Multi-tenant scope — also filters by `req.teamId` | findMany where clause also has `teamId: req.teamId` |
| T71 | Pagination params (limit/offset) respected if present | `req.query.limit = "20"` and `req.query.offset = "10"` produce `take: 20, skip: 10` |

### `getRecallAnalytics` (2 tests, T72-T73)

Same file as T69-T71.

| # | Test | Asserts |
| --- | --- | --- |
| T72 | Happy path returns analytics shape | Response has expected aggregate fields (counts by SM-2 state, retention rate, etc.) |
| T73 | Empty (no solutions) → zeroed analytics | Response has `total: 0`, no NaN/null in derived fields |

### `getSolutionAttempts` (3 tests, T74-T76)

File: `server/test/controllers/solutions.attempts.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T74 | Happy path returns ReviewAttempt array for the solution | findMany call filters by `solutionId: req.params.id`; response is the array |
| T75 | Multi-tenant scope — solution lookup filters by `req.teamId` | Pre-fetch solution check includes `teamId: req.teamId` |
| T76 | 404 envelope when solutionId not found OR belongs to different team | `error()` helper called with `404`, includes `requestId` |

### `updateSolution` (3 unit tests, T77-T79)

File: `server/test/controllers/solutions.update.unit.test.js`

These are UNIT-level tests of edges the integration test doesn't cover.

| # | Test | Asserts |
| --- | --- | --- |
| T77 | Authorization — non-owner returns 403 envelope | When `req.user.id !== solution.userId` (and not team admin), return `error(403)` |
| T78 | Multi-tenant scope — query filters by `req.teamId` | The findUnique + update both use `req.teamId` |
| T79 | Validation edge — invalid field type rejected before DB call | Pass an invalid field type (e.g. confidence as string instead of int); assert Zod rejection → 400 envelope, no DB call |

### `rateSolutionClarity` (2 tests, T80-T81)

File: `server/test/controllers/solutions.rateClarity.test.js`

| # | Test | Asserts |
| --- | --- | --- |
| T80 | Happy path persists rating | Some persistence mechanism (likely `solutionRating.upsert` or similar) called with the rating value |
| T81 | Multi-tenant scope | The persistence call includes `teamId: req.teamId` filter |

---

## Mock pattern

Reuses Sprint 4.x test infrastructure. Each test file follows:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  solution: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  problem: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  reviewAttempt: { findMany: vi.fn(), create: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $transaction: vi.fn(async (cb) => cb(prismaMock)),
  // ... per-file needs
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/services/embedding.service.js", () => ({
  generateEmbedding: vi.fn(),
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => false),
}));

vi.mock("../../src/services/rag.service.js", () => ({
  findSimilarTeammateSolutions: vi.fn().mockResolvedValue([]),
  formatTeammateContext: vi.fn().mockReturnValue(""),
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(),
  isAIEnabled: vi.fn(() => true),
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

// Import the controller AFTER mocks
const solutionsCtrl = await import("../../src/controllers/solutions.controller.js");

function mockReqRes({ params = {}, query = {}, body = {}, userId = "user_1", teamId = "team_1" } = {}) {
  const req = {
    params,
    query,
    body,
    user: { id: userId, currentTeamId: teamId },
    teamId,  // middleware-resolved value
    requestId: "req_test",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

beforeEach(() => { vi.clearAllMocks(); });
```

No `_appFactory.js` Express harness needed — direct controller invocation. Same pattern as Sprint 3.3a/b/c.

The `req.teamId` vs `req.user.currentTeamId` distinction is intentional in the helper: tests can set them to different values to verify the controller uses the middleware-resolved `req.teamId` (the multi-tenant invariant).

---

## Test count target

- Baseline (post Sprint 4.3 + isEmbeddingEnabled fix): **1274**
- New tests in 5a: **+26**
- Target after 5a: **1300**

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — pure additive tests; production code unchanged |
| Test runtime impact | +26 mock-only tests, ~1-2s suite-time delta |
| Backward compatibility | None — no API surface change |
| Rollback | Revert test files |
| Risk floor | Low — pure additive tests |

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — every test has a concrete 1-line assertion summary; full code blocks live in the plan |
| Internal consistency | 9 functions × varied counts = 26 tests. Add up: 4+3+3+3+3+2+3+3+2 = 26 ✓. Test numbering T56-T81 contiguous; no collision with existing T1-T55. |
| Scope | Tight: Solutions controller ONLY. Problems → 5b. M17 → 5c. `exportFeedback` explicitly noted as stale (function doesn't exist). |
| Ambiguity | Two explicit calls: (a) `updateSolution` already has integration test for field-flow; new unit tests add auth + scope + validation edges (not duplicative); (b) `submitReview` peeked-flag already covered by `solutions.submitReview.peeked.test.js`; new tests add other paths (no-content, multi-tenant). |
| Adversarial review | Risk: mock-based tests asserting on internal call shapes rather than user-visible behavior. Mitigation: the multi-tenant scope assertion (`teamId: req.teamId` in query) is exactly the CLAUDE.md-documented critical invariant — testing the call shape IS testing the invariant. Same pattern Sprint 3.3a/b/c used to lock in auth invariants. |
| Risk floor | Low. Pure additive tests. Mirrors Sprint 3.4 (email service test foundation) in shape. |

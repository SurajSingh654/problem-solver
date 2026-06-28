# Sprint 5a — Solutions Controller Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 26 isolation tests covering 9 exports in `server/src/controllers/solutions.controller.js`. Closes audit M30 (partially — solutions-named functions) and the broader test gap.

**Architecture:** Pure additive test work. 7 new test files organized by function group. No production code changes. Mock pattern reuses Sprint 4.x infrastructure (vi.hoisted prisma + service mocks + direct controller invocation, no Express harness).

**Tech Stack:** Vitest with mocked Prisma + mocked services + mocked env. Existing controller-level patterns from Sprint 3.3a/b/c.

**Spec:** [`docs/superpowers/specs/2026-06-28-solutions-controller-tests-design.md`](../specs/2026-06-28-solutions-controller-tests-design.md)

**Branch:** `feat/solutions-controller-tests`

**Baseline test count:** 1274 (post Sprint 4.3 + isEmbeddingEnabled alignment, commit `83ac07d`). Capture exact in Task 0. Target after sprint: **1300** (+26).

---

## File map

**Create (7 new test files):**

| File | Tests | Functions |
| --- | --- | --- |
| `server/test/controllers/solutions.submitSolution.test.js` | 4 (T56-T59) | submitSolution |
| `server/test/controllers/solutions.submitReview.test.js` | 3 (T60-T62) | submitReview |
| `server/test/controllers/solutions.queues.test.js` | 6 (T63-T68) | getReviewQueue + getProblemSolutions |
| `server/test/controllers/solutions.user.test.js` | 5 (T69-T73) | getUserSolutions + getRecallAnalytics |
| `server/test/controllers/solutions.attempts.test.js` | 3 (T74-T76) | getSolutionAttempts |
| `server/test/controllers/solutions.update.unit.test.js` | 3 (T77-T79) | updateSolution |
| `server/test/controllers/solutions.rateClarity.test.js` | 2 (T80-T81) | rateSolutionClarity |

**Modify (Task 3 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 5a shipped.

**Unchanged (explicit):**
- `server/src/controllers/solutions.controller.js` — read-only this sprint.
- All other production code.
- All existing test files (`solutions.roundtrip.test.js`, `solutions.submitReview.peeked.test.js`, `solutions.update.integration.test.js`, `solutions.embedding-outbox.test.js`) — retained as-is.

---

## Canonical mock pattern (used in all 7 test files)

This is the shared boilerplate. Each test file adapts it to its specific needs.

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  solution: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  problem: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  reviewAttempt: { findMany: vi.fn(), create: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
  $transaction: vi.fn(async (cb) => {
    if (typeof cb === "function") return cb(prismaMock);
    return Promise.all(cb);
  }),
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

const solutionsCtrl = await import(
  "../../src/controllers/solutions.controller.js"
);

function mockReqRes({
  params = {},
  query = {},
  body = {},
  userId = "user_1",
  teamId = "team_1",
} = {}) {
  const req = {
    params,
    query,
    body,
    user: { id: userId, currentTeamId: teamId, globalRole: "USER", teamRole: "MEMBER" },
    teamId,  // middleware-resolved value — controllers MUST use this
    requestId: "req_test_xyz",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

beforeEach(() => { vi.clearAllMocks(); });
```

**Key invariant tested across all files:** controllers MUST read `req.teamId` (middleware-resolved), NOT `req.user.currentTeamId` (raw). To verify, the `mockReqRes` helper sets them to the SAME value by default, but multi-tenant-scope tests override one and assert the controller used the other.

The implementer **must read each function's source** in `server/src/controllers/solutions.controller.js` BEFORE writing the tests for it. Mock return shapes must match the function's real expectations (e.g. what shape `prisma.solution.findUnique` returns — Solution object with which fields).

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on `main`**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `main`, last commit `0558f55` (Sprint 5a spec).

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/solutions-controller-tests
```

- [ ] **Step 3: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1274 passed`. Record exact count.

- [ ] **Step 4: Pre-push gate sanity**

Each exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

If any fails STOP and report BLOCKED.

NO commits in this task.

---

## Task 1: Mutation test files (~12 tests across 4 files)

Goal: cover the 4 mutation functions (submitSolution, submitReview, updateSolution, rateSolutionClarity). Each gets its own file. 12 tests total.

**Files to create:**
- `server/test/controllers/solutions.submitSolution.test.js`
- `server/test/controllers/solutions.submitReview.test.js`
- `server/test/controllers/solutions.update.unit.test.js`
- `server/test/controllers/solutions.rateClarity.test.js`

### Steps

- [ ] **Step 1: Read the 4 mutation functions before writing tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '88,275p' server/src/controllers/solutions.controller.js   # submitSolution
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '275,399p' server/src/controllers/solutions.controller.js  # submitReview
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '748,930p' server/src/controllers/solutions.controller.js  # updateSolution
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '930,995p' server/src/controllers/solutions.controller.js  # rateSolutionClarity
```

Note for each function:
- Required `req.body` fields
- Required `req.user` / `req.teamId` access
- Which prisma methods are called and with what shapes
- Which services are called (`generateEmbedding`, `aiComplete`, etc.)
- What `res.json(...)` is called with on success vs error

You'll use these notes to set up correct mocks.

- [ ] **Step 2: Create `solutions.submitSolution.test.js` (T56-T59)**

Use the canonical mock pattern from the "Canonical mock pattern" section above. Tests:

**T56: Happy path persists with correct data shape**

```js
it("test 56: happy path persists with correct data shape", async () => {
  // Set up mocks
  prismaMock.problem.findUnique.mockResolvedValueOnce({
    id: "prob_1",
    teamId: "team_1",
    isPublished: true,
    // ... other fields needed by submitSolution's problem check
  });
  prismaMock.solution.create.mockResolvedValueOnce({
    id: "sol_new",
    userId: "user_1",
    teamId: "team_1",
    problemId: "prob_1",
    confidence: 4,
    // ... other fields
  });

  const { req, res } = mockReqRes({
    body: {
      problemId: "prob_1",
      code: "def two_sum(): pass",
      approach: "two pointers",
      confidence: 4,
      // ... any other required fields per submitSolution's contract
    },
  });
  await solutionsCtrl.submitSolution(req, res);

  expect(prismaMock.solution.create).toHaveBeenCalledTimes(1);
  const createArg = prismaMock.solution.create.mock.calls[0][0];
  expect(createArg.data.userId).toBe("user_1");
  expect(createArg.data.teamId).toBe("team_1");
  expect(createArg.data.problemId).toBe("prob_1");
  expect(createArg.data.code).toBe("def two_sum(): pass");
  expect(createArg.data.approach).toBe("two pointers");
  expect(createArg.data.confidence).toBe(4);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ success: true }),
  );
});
```

**T57: Multi-tenant scope — uses `req.teamId`, NOT `req.user.currentTeamId`**

```js
it("test 57: uses req.teamId, not req.user.currentTeamId", async () => {
  // Set them to DIFFERENT values to lock in which one the controller reads
  prismaMock.problem.findUnique.mockResolvedValueOnce({
    id: "prob_1",
    teamId: "team_resolved",
    isPublished: true,
  });
  prismaMock.solution.create.mockResolvedValueOnce({ id: "sol_new" });

  const { req, res } = mockReqRes({
    body: { problemId: "prob_1", code: "x", approach: "y", confidence: 3 },
  });
  // Manually diverge:
  req.user.currentTeamId = "team_raw_unsafe";
  req.teamId = "team_resolved";

  await solutionsCtrl.submitSolution(req, res);

  const createArg = prismaMock.solution.create.mock.calls[0][0];
  expect(createArg.data.teamId).toBe("team_resolved");
  expect(createArg.data.teamId).not.toBe("team_raw_unsafe");
});
```

**T58: CODING category fields + categorySpecificData persist correctly**

Pass a CODING solution body with the full field set (code, approach, bruteForce, optimizedApproach, timeComplexity, spaceComplexity, keyInsight, feynmanExplanation, confidence, solveMethod, patterns, categorySpecificData). Assert all appear in the create payload with the right values. categorySpecificData should be preserved as a JSON object.

**T59: `generateSolutionEmbedding` called fire-and-forget**

Mock the embedding service helper to a never-resolving promise. Assert that `res.json` is called BEFORE the promise would have resolved. The pattern: capture the `res.json` call timing relative to the embedding mock invocation count.

```js
it("test 59: generateSolutionEmbedding fire-and-forget — response returns before embed completes", async () => {
  prismaMock.problem.findUnique.mockResolvedValueOnce({
    id: "prob_1", teamId: "team_1", isPublished: true,
  });
  prismaMock.solution.create.mockResolvedValueOnce({ id: "sol_new", userId: "user_1" });

  // Embedding is called from a re-import inside the controller — mock it via the module
  const embeddingMock = await import("../../src/services/embedding.service.js");
  let resolveEmbed;
  embeddingMock.embedAndPersist.mockImplementationOnce(
    () => new Promise((r) => { resolveEmbed = r; }),
  );

  const { req, res } = mockReqRes({
    body: { problemId: "prob_1", code: "x", approach: "y", confidence: 3 },
  });

  await solutionsCtrl.submitSolution(req, res);

  // res.json was called even though the embed promise hasn't resolved
  expect(res.json).toHaveBeenCalled();
  expect(resolveEmbed).toBeDefined();  // mock was invoked, just not awaited

  // Cleanup
  resolveEmbed?.(null);
});
```

Run after creation:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/solutions.submitSolution.test.js
```
Expected: 4 tests pass.

If a test fails due to mock-shape mismatch, read the controller code more carefully and adjust the mock return shape. Do NOT change the assertion — the assertion encodes the spec's contract.

- [ ] **Step 3: Create `solutions.submitReview.test.js` (T60-T62)**

Same mock pattern. Tests:

**T60: Happy path with mocked `aiComplete` → persists aiFeedback array**

```js
it("test 60: happy path persists aiFeedback to the array", async () => {
  prismaMock.solution.findUnique.mockResolvedValueOnce({
    id: "sol_1",
    teamId: "team_1",
    userId: "user_1",
    code: "code here",
    approach: "approach",
    aiFeedback: [],  // existing array, empty
    problem: { /* shape needed by submitReview */ },
  });

  const aiMock = await import("../../src/services/ai.service.js");
  aiMock.aiComplete.mockResolvedValueOnce({
    correctness: 8,
    feedback: "good",
    // ... full validateReview-compatible shape
  });

  prismaMock.solution.update.mockResolvedValueOnce({ id: "sol_1" });

  const { req, res } = mockReqRes({
    params: { id: "sol_1" },
    body: { /* request body shape */ },
  });
  await solutionsCtrl.submitReview(req, res);

  // aiFeedback persisted as ARRAY-APPENDED (not replaced)
  const updateArg = prismaMock.solution.update.mock.calls[0][0];
  expect(Array.isArray(updateArg.data.aiFeedback)).toBe(true);
  expect(updateArg.data.aiFeedback.length).toBeGreaterThan(0);

  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ success: true }),
  );
});
```

**T61: No-content branch — solution without code/approach short-circuits**

```js
it("test 61: solution with no code AND no approach returns hasContent=false", async () => {
  prismaMock.solution.findUnique.mockResolvedValueOnce({
    id: "sol_1",
    teamId: "team_1",
    userId: "user_1",
    code: null,
    approach: null,
    aiFeedback: [],
    problem: { /* ... */ },
  });

  const aiMock = await import("../../src/services/ai.service.js");

  const { req, res } = mockReqRes({ params: { id: "sol_1" }, body: {} });
  await solutionsCtrl.submitReview(req, res);

  expect(aiMock.aiComplete).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ hasContent: false }),
  );
});
```

**T62: Multi-tenant scope — review writes filter by `req.teamId`**

```js
it("test 62: solution lookup + update both filter by req.teamId", async () => {
  prismaMock.solution.findUnique.mockResolvedValueOnce({
    id: "sol_1", teamId: "team_resolved", userId: "user_1",
    code: "x", approach: "y", aiFeedback: [],
    problem: { /* ... */ },
  });
  prismaMock.solution.update.mockResolvedValueOnce({ id: "sol_1" });

  const aiMock = await import("../../src/services/ai.service.js");
  aiMock.aiComplete.mockResolvedValueOnce({ correctness: 8, /* ... */ });

  const { req, res } = mockReqRes({ params: { id: "sol_1" }, body: {} });
  req.teamId = "team_resolved";
  req.user.currentTeamId = "team_raw_unsafe";

  await solutionsCtrl.submitReview(req, res);

  // findUnique should have filtered by req.teamId, not req.user.currentTeamId
  // (The exact assertion shape depends on whether the controller uses
  // findUnique with a where clause that includes teamId, OR a separate
  // post-fetch teamId check. Read the function to choose the right assertion.)
});
```

Note: T62's exact assertion shape depends on the controller's implementation pattern. The implementer must READ the function before deciding whether the teamId scoping happens via:
- `prisma.solution.findUnique({ where: { id, teamId } })` — assert on the where clause's teamId
- Post-fetch check: `if (solution.teamId !== req.teamId) return 404` — assert that the controller compared `req.teamId`, not `req.user.currentTeamId`

The implementer must verify behavior matches the spec's intent (CLAUDE.md critical invariant): the controller MUST use `req.teamId`.

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/solutions.submitReview.test.js
```
Expected: 3 tests pass.

- [ ] **Step 4: Create `solutions.update.unit.test.js` (T77-T79)**

Same mock pattern. Tests:

**T77: Authorization — non-owner returns 403 envelope**

```js
it("test 77: non-owner returns 403 envelope", async () => {
  prismaMock.solution.findUnique.mockResolvedValueOnce({
    id: "sol_1",
    userId: "different_user",  // not req.user.id
    teamId: "team_1",
  });

  const { req, res } = mockReqRes({
    params: { id: "sol_1" },
    body: { code: "new code" },
    userId: "user_1",  // tries to update someone else's solution
  });
  await solutionsCtrl.updateSolution(req, res);

  expect(res.status).toHaveBeenCalledWith(403);
  // OR if error() helper is used, assert on res.json with the envelope shape
  const jsonArg = res.json.mock.calls[0][0];
  expect(jsonArg.success).toBe(false);
});
```

**T78: Multi-tenant scope — query filters by `req.teamId`**

Similar to T62 — read the function to determine the right assertion shape.

**T79: Validation edge — invalid field type rejected before DB call**

```js
it("test 79: invalid field type rejected before DB call", async () => {
  const { req, res } = mockReqRes({
    params: { id: "sol_1" },
    body: { confidence: "not a number" },  // invalid type
  });
  await solutionsCtrl.updateSolution(req, res);

  expect(prismaMock.solution.update).not.toHaveBeenCalled();
  // Some 400 / validation error response
  const jsonArg = res.json.mock.calls[0][0];
  expect(jsonArg.success).toBe(false);
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/solutions.update.unit.test.js
```
Expected: 3 tests pass.

- [ ] **Step 5: Create `solutions.rateClarity.test.js` (T80-T81)**

Same mock pattern. Tests:

**T80: Happy path persists rating**

```js
it("test 80: happy path persists rating", async () => {
  prismaMock.solution.findUnique.mockResolvedValueOnce({
    id: "sol_1", userId: "different_user", teamId: "team_1",
  });
  // Some persistence mechanism — read the function to know which
  // table/method handles the rating. Likely something like:
  //   prismaMock.solutionRating.upsert.mockResolvedValueOnce(...)
  // or an update to the solution itself.

  const { req, res } = mockReqRes({
    params: { id: "sol_1" },
    body: { rating: 4, comment: "clear" },
    userId: "user_rater",
  });
  await solutionsCtrl.rateSolutionClarity(req, res);

  // Assert the persistence call happened with the rating value
  // Assert response is success
});
```

**T81: Multi-tenant scope**

```js
it("test 81: rating write filters by req.teamId", async () => {
  // Similar pattern — verify the lookup/write uses req.teamId
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/solutions.rateClarity.test.js
```
Expected: 2 tests pass.

- [ ] **Step 6: Full server suite + lint after Task 1 completes all 4 files**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1286 (1274 + 12 from Task 1).

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 7: Commit Task 1**

```bash
git add server/test/controllers/solutions.submitSolution.test.js \
        server/test/controllers/solutions.submitReview.test.js \
        server/test/controllers/solutions.update.unit.test.js \
        server/test/controllers/solutions.rateClarity.test.js
git commit -m "Add Solutions mutation tests (submitSolution, submitReview, update, rateClarity) for M30"
```

---

## Task 2: Read-endpoint test files (~14 tests across 3 files)

Goal: cover 5 read functions across 3 logical groups. 14 tests total.

**Files to create:**
- `server/test/controllers/solutions.queues.test.js` — getReviewQueue (3) + getProblemSolutions (3)
- `server/test/controllers/solutions.user.test.js` — getUserSolutions (3) + getRecallAnalytics (2)
- `server/test/controllers/solutions.attempts.test.js` — getSolutionAttempts (3)

### Steps

- [ ] **Step 1: Read the 5 read functions**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '399,501p' server/src/controllers/solutions.controller.js   # getReviewQueue
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '501,563p' server/src/controllers/solutions.controller.js   # getProblemSolutions
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '563,616p' server/src/controllers/solutions.controller.js   # getUserSolutions
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '616,702p' server/src/controllers/solutions.controller.js   # getRecallAnalytics
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '702,748p' server/src/controllers/solutions.controller.js   # getSolutionAttempts
```

Note for each: where clause shape, returned shape, edge cases.

- [ ] **Step 2: Create `solutions.queues.test.js` (T63-T68)**

Same mock pattern. 6 tests total.

**T63-T65 (getReviewQueue):**
- T63: Returns rows with SM-2 fields (`sm2EasinessFactor`, `sm2Interval`, `sm2Repetitions`, `nextReviewAt`)
- T64: Multi-tenant scope — findMany where clause has `teamId: req.teamId`
- T65: Empty result returns `{ success: true, data: [] }`

**T66-T68 (getProblemSolutions):**
- T66: Multi-tenant scope
- T67: Soft-deleted users excluded (Prisma middleware auto-injects `deletedAt: null` — assert this is in the resolved query)
- T68: Includes `aiFeedback` array shape

Sample T63 skeleton:

```js
it("test 63: getReviewQueue returns rows with SM-2 fields", async () => {
  const sampleQueue = [
    {
      id: "sol_1",
      sm2EasinessFactor: 2.5,
      sm2Interval: 7,
      sm2Repetitions: 2,
      nextReviewAt: new Date(),
      // ... rest of the shape
    },
  ];
  prismaMock.solution.findMany.mockResolvedValueOnce(sampleQueue);

  const { req, res } = mockReqRes();
  await solutionsCtrl.getReviewQueue(req, res);

  expect(prismaMock.solution.findMany).toHaveBeenCalled();
  const jsonArg = res.json.mock.calls[0][0];
  expect(jsonArg.success).toBe(true);
  expect(jsonArg.data[0]).toHaveProperty("sm2EasinessFactor");
  expect(jsonArg.data[0]).toHaveProperty("sm2Interval");
  expect(jsonArg.data[0]).toHaveProperty("sm2Repetitions");
  expect(jsonArg.data[0]).toHaveProperty("nextReviewAt");
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/solutions.queues.test.js
```
Expected: 6 tests pass.

- [ ] **Step 3: Create `solutions.user.test.js` (T69-T73)**

5 tests total.

**T69-T71 (getUserSolutions):**
- T69: Happy path returns array filtered by `req.user.id`
- T70: Multi-tenant scope (`teamId: req.teamId`)
- T71: Pagination params (`limit`/`offset`) respected

**T72-T73 (getRecallAnalytics):**
- T72: Happy path returns analytics shape
- T73: Empty (no solutions) → zeroed analytics

Read the function bodies to understand what the analytics shape actually looks like — the spec describes it as "expected aggregate fields (counts by SM-2 state, retention rate, etc.)" but the exact fields come from the controller code.

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/solutions.user.test.js
```
Expected: 5 tests pass.

- [ ] **Step 4: Create `solutions.attempts.test.js` (T74-T76)**

3 tests for getSolutionAttempts.

**T74: Happy path returns ReviewAttempt array**

```js
it("test 74: happy path returns review attempts array", async () => {
  prismaMock.solution.findFirst.mockResolvedValueOnce({
    id: "sol_1", teamId: "team_1", userId: "user_1",
  });
  prismaMock.reviewAttempt.findMany.mockResolvedValueOnce([
    { id: "att_1", solutionId: "sol_1", quality: 4, /* ... */ },
    { id: "att_2", solutionId: "sol_1", quality: 5, /* ... */ },
  ]);

  const { req, res } = mockReqRes({ params: { id: "sol_1" } });
  await solutionsCtrl.getSolutionAttempts(req, res);

  expect(prismaMock.reviewAttempt.findMany).toHaveBeenCalled();
  const findArg = prismaMock.reviewAttempt.findMany.mock.calls[0][0];
  expect(findArg.where.solutionId).toBe("sol_1");

  const jsonArg = res.json.mock.calls[0][0];
  expect(jsonArg.success).toBe(true);
  expect(jsonArg.data).toHaveLength(2);
});
```

**T75: Multi-tenant scope — solution lookup filters by `req.teamId`**

**T76: 404 envelope when solutionId not found OR belongs to different team**

```js
it("test 76: 404 envelope when solution not found", async () => {
  prismaMock.solution.findFirst.mockResolvedValueOnce(null);

  const { req, res } = mockReqRes({ params: { id: "sol_missing" } });
  await solutionsCtrl.getSolutionAttempts(req, res);

  expect(res.status).toHaveBeenCalledWith(404);
  const jsonArg = res.json.mock.calls[0][0];
  expect(jsonArg.success).toBe(false);
  expect(jsonArg.error?.requestId).toBe("req_test_xyz");
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/solutions.attempts.test.js
```
Expected: 3 tests pass.

- [ ] **Step 5: Full server suite + lint after Task 2 completes all 3 files**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1300 (1286 + 14 from Task 2).

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add server/test/controllers/solutions.queues.test.js \
        server/test/controllers/solutions.user.test.js \
        server/test/controllers/solutions.attempts.test.js
git commit -m "Add Solutions read-endpoint tests (queues, user, attempts) for M30"
```

---

## Task 3: Final gates + push + FF-merge + roadmap

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Pre-push gate sanity**

Each exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: 1300 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/solutions-controller-tests
```

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/solutions-controller-tests && git push origin main
```

- [ ] **Step 4: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find the existing Sprint 5 queue row:

```markdown
| 5 | Problems + solutions controllers surface | queued | — | — |
```

Replace with three sub-rows (5a shipped, 5b + 5c queued):

```markdown
| 5a | Solutions controller test foundation (M30 partial — 26 tests across 9 exports covering multi-tenant scope, authorization, state transitions, error envelope) | ✅ shipped | [`2026-06-28-solutions-controller-tests-design.md`](../specs/2026-06-28-solutions-controller-tests-design.md) | 2026-06-28 |
| 5b | Problems controller test foundation (M29 — ~35 tests across 10 exports) | queued | — | — |
| 5c | M17 canonical augment race verification + regression test | queued | — | — |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 5a (Solutions controller tests) shipped; queue 5b + 5c"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main
```

- [ ] **Step 6: Verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -10
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```

Verify local HEAD == origin/main.

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ **submitSolution** (4 tests T56-T59) → Task 1 Step 2
- ✅ **submitReview** (3 tests T60-T62) → Task 1 Step 3
- ✅ **getReviewQueue** (3 tests T63-T65) → Task 2 Step 2
- ✅ **getProblemSolutions** (3 tests T66-T68) → Task 2 Step 2
- ✅ **getUserSolutions** (3 tests T69-T71) → Task 2 Step 3
- ✅ **getRecallAnalytics** (2 tests T72-T73) → Task 2 Step 3
- ✅ **getSolutionAttempts** (3 tests T74-T76) → Task 2 Step 4
- ✅ **updateSolution** (3 unit tests T77-T79) → Task 1 Step 4
- ✅ **rateSolutionClarity** (2 tests T80-T81) → Task 1 Step 5
- ✅ **Mock pattern** → top of plan, "Canonical mock pattern" section
- ✅ **Roadmap update** → Task 3 Step 4

### Placeholder scan

The per-test code blocks have some scaffolding (e.g. "the exact assertion shape depends on the controller's implementation pattern" in T62) — this is INTENTIONAL: the implementer MUST read the function source before writing the assertion. The plan is explicit about this in the canonical mock pattern section and per-test guidance.

This is NOT a "fill in the details" placeholder — it's directional guidance with a stated requirement ("read the function first").

### Type consistency

- Test IDs T56-T81 contiguous, non-overlapping with existing T1-T55.
- `mockReqRes` helper signature consistent across all 7 files.
- The `req.teamId` vs `req.user.currentTeamId` distinction used identically in T57, T62, T64, T66, T70, T75, T78, T81.

### Adversarial check on the plan itself

- **Mock-vs-real shape mismatch**: the plan repeatedly instructs the implementer to read each function before writing tests. If the implementer skips this step and writes tests with wrong mock shapes, tests will fail with confusing errors. Mitigation: each task starts with "Step 1: Read the N functions" before any test writing.
- **`req.teamId` vs `req.user.currentTeamId` distinction in tests**: the `mockReqRes` helper sets them to the same value by default. Multi-tenant scope tests (T57, T62, etc.) explicitly override one. This pattern is documented in the canonical mock section.
- **`solutions.update.integration.test.js` doesn't conflict**: it tests the 5-touchpoint field-flow via the full Express harness; the new unit tests in `solutions.update.unit.test.js` test auth + scope + validation edges. Separate concerns.

---

## Done criteria

- All 26 new tests pass; full suite at 1300.
- `npm run lint` (server + client) + audits exit 0.
- `prisma migrate status` up to date.
- Feature branch FF-merged to main; both pushed to origin.
- Roadmap shows Sprint 5a shipped; 5b + 5c queued.

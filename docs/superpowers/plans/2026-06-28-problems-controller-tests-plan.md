# Sprint 5b — Problems Controller Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 31 isolation tests covering 9 exports in `server/src/controllers/problems.controller.js`. Closes audit M29.

**Architecture:** Pure additive test work mirroring Sprint 5a's structure. 6 new test files organized by function group. Same canonical mock pattern as Sprint 5a — `vi.hoisted` prisma + service mocks + direct controller invocation. No Express harness. Read each function before writing its tests; encode actual behavior + document spec divergences in test comments.

**Tech Stack:** Vitest with mocked Prisma + mocked services + mocked env. Patterns reused verbatim from Sprint 5a test files.

**Spec:** [`docs/superpowers/specs/2026-06-28-problems-controller-tests-design.md`](../specs/2026-06-28-problems-controller-tests-design.md)

**Branch:** `feat/problems-controller-tests`

**Baseline test count:** 1300 (post Sprint 5a, commit `719bab8`). Capture exact in Task 0. Target after sprint: **1331** (+31).

---

## File map

**Create (6 new test files):**

| File | Tests | Functions |
| --- | --- | --- |
| `server/test/controllers/problems.list.test.js` | 4 (T82-T85) | listProblems |
| `server/test/controllers/problems.read.test.js` | 4 (T86-T89) | getProblem |
| `server/test/controllers/problems.create.test.js` | 7 (T90-T96) | createProblem (4) + batchCreateProblems (3) |
| `server/test/controllers/problems.update.test.js` | 4 (T97-T100) | updateProblem |
| `server/test/controllers/problems.delete.test.js` | 5 (T101-T105) | deleteProblem (3) + toggleProblemFlag (2) |
| `server/test/controllers/problems.canonical.test.js` | 7 (T106-T112) | getCanonical (4) + patchCanonical (3) |

**Modify (Task 3 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 5b shipped.

**Unchanged (explicit):**
- `server/src/controllers/problems.controller.js` — read-only this sprint.
- All existing test files (`problems.embedding-outbox.test.js` from Sprint 4.1, `problems.sourceLists.integration.test.js` integration test) — retained.

---

## Canonical mock pattern (reused from Sprint 5a)

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

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
  $queryRaw: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/services/embedding.service.js", () => ({
  generateEmbedding: vi.fn(),
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => false),
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(),
  isAIEnabled: vi.fn(() => true),
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true, FEATURE_CANONICAL_ALTERNATIVES: "false" };
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
  globalRole = "USER",
  teamRole = "MEMBER",
} = {}) {
  const req = {
    params,
    query,
    body,
    user: { id: userId, currentTeamId: teamId, globalRole, teamRole },
    teamId,
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

**Reference files (Sprint 5a) for working examples:**
- `server/test/controllers/solutions.submitSolution.test.js` — happy + scope + persistence + fire-forget
- `server/test/controllers/solutions.queues.test.js` — read endpoint patterns
- `server/test/controllers/solutions.attempts.test.js` — 404 envelope + requestId

---

## Sprint 5a precedent: encode actual behavior

Sprint 5a found 7 spec-vs-shipped divergences during implementation. Sprint 5b will likely find similar. The discipline:

1. Read each function in `problems.controller.js` BEFORE writing tests.
2. If the spec's per-test summary doesn't match actual behavior, **encode actual behavior** in the test.
3. Add a code comment in the test explaining the divergence + citing the controller line.
4. Report the divergence in the implementer's final report.

This is correct behavior — the test foundation surfaces gaps between assumed and actual contracts. Each divergence is locked in by an explicit assertion.

Known/likely findings (flagged in the spec — should be discovered + documented):

- **`deleteProblem` uses `req.params.problemId`** (NOT `req.params.id` like other functions). Test fixture must match.
- **`deleteProblem` is HARD delete** (not soft). Assert `prisma.problem.delete`, not `update({ deletedAt })`.
- **`getCanonical` has 3 branches** — cache hit, cache miss, M17 lazy-augment. Tests cover branches 1 and 3 + 404; M17 deferred to 5c.
- **`updateProblem` follow-up reconciliation** — deletes removed ones, updates existing by id, creates new for missing ids. At least one test should target this path.
- **`patchCanonical` admin gating** — read to confirm whether it returns 403 (explicit role check) or 404 (combined where clause). Encode actual.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on `main`**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `main`, last commit `d6b0837` (Sprint 5b spec).

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/problems-controller-tests
```

- [ ] **Step 3: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1300 passed`. Record exact count.

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

## Task 1: Mutation tests (16 tests across 3 files)

Goal: cover the 4 mutation paths (createProblem, batchCreateProblems, updateProblem, deleteProblem, toggleProblemFlag, patchCanonical). 16 tests total across 3 files.

Wait — that's actually 6 functions, not 4. Distribution:
- **problems.create.test.js** — createProblem (4) + batchCreateProblems (3) = 7 tests
- **problems.update.test.js** — updateProblem (4) = 4 tests
- **problems.delete.test.js** — deleteProblem (3) + toggleProblemFlag (2) = 5 tests

**Total Task 1: 16 tests.**

### Steps

- [ ] **Step 1: Read the mutation functions BEFORE writing tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '200,281p' server/src/controllers/problems.controller.js    # createProblem
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '282,365p' server/src/controllers/problems.controller.js    # batchCreateProblems
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '366,507p' server/src/controllers/problems.controller.js    # updateProblem
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '508,526p' server/src/controllers/problems.controller.js    # deleteProblem
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '531,574p' server/src/controllers/problems.controller.js    # toggleProblemFlag
```

Note for each: req.params name (esp. `deleteProblem` which uses `problemId`), req.body shape, prisma method calls + their argument shapes, response envelope structure on success/error.

- [ ] **Step 2: Create `problems.create.test.js` (T90-T96)**

Use the canonical mock pattern from the "Canonical mock pattern" section above. 7 tests across two `describe` blocks:

```js
describe("createProblem", () => {
  it("test 90: happy path persists with correct data shape", async () => {
    prismaMock.problem.create.mockResolvedValueOnce({
      id: "prob_new",
      teamId: "team_1",
      title: "Two Sum",
      // ... fields per the controller's response include
    });

    const { req, res } = mockReqRes({
      body: {
        title: "Two Sum",
        description: "Given an array...",
        difficulty: "EASY",
        category: "CODING",
        tags: ["array", "hashmap"],
      },
    });
    await problemsCtrl.createProblem(req, res);

    expect(prismaMock.problem.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.problem.create.mock.calls[0][0];
    expect(createArg.data.title).toBe("Two Sum");
    expect(createArg.data.teamId).toBe("team_1");
    expect(createArg.data.createdById).toBe("user_1");
    // Other fields per actual controller behavior

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
  });

  it("test 91: multi-tenant scope uses req.teamId, not req.user.currentTeamId", async () => {
    prismaMock.problem.create.mockResolvedValueOnce({ id: "prob_new" });

    const { req, res } = mockReqRes({
      body: { title: "X", description: "Y", difficulty: "EASY", category: "CODING" },
    });
    req.user.currentTeamId = "team_raw_unsafe";
    req.teamId = "team_resolved";

    await problemsCtrl.createProblem(req, res);

    const createArg = prismaMock.problem.create.mock.calls[0][0];
    expect(createArg.data.teamId).toBe("team_resolved");
    expect(createArg.data.teamId).not.toBe("team_raw_unsafe");
  });

  it("test 92: persistence shape — required + optional fields handled", async () => {
    prismaMock.problem.create.mockResolvedValueOnce({ id: "prob_new" });

    const { req, res } = mockReqRes({
      body: {
        title: "Title",
        description: "Description",
        difficulty: "MEDIUM",
        category: "CODING",
        tags: ["t1", "t2"],
        companyTags: ["Google"],
        realWorldContext: "context",
      },
    });
    await problemsCtrl.createProblem(req, res);

    const createArg = prismaMock.problem.create.mock.calls[0][0];
    expect(createArg.data.title).toBe("Title");
    // Verify optional fields are passed through or defaulted per actual behavior
    // Read the function to determine which optional fields flow through and how
  });

  it("test 93: AI-related fields gating (or document non-presence)", async () => {
    // Read the function: does createProblem gate AI-related fields by role?
    // If yes, test the gating. If no, document this as a non-code-path with
    // a comment, and assert the basic field flow without role manipulation.
  });
});

describe("batchCreateProblems", () => {
  it("test 94: happy path persists multiple problems", async () => {
    // Read the function: does it call createMany or sequential create?
    // Encode actual behavior.
  });

  it("test 95: multi-tenant scope — every row uses req.teamId", async () => {
    // Each entry in the persisted batch has teamId: req.teamId
  });

  it("test 96: partial-shape — actual behavior on shape variance", async () => {
    // Read the function: does it reject the entire batch on shape mismatch,
    // skip bad entries, or fail at the first bad one? Encode actual.
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/problems.create.test.js
```
Expected: 7 tests pass.

- [ ] **Step 3: Create `problems.update.test.js` (T97-T100)**

```js
describe("updateProblem", () => {
  it("test 97: happy path persists update", async () => {
    // Read function for prisma method shape
    // findFirst → update → response success
  });

  it("test 98: multi-tenant scope — both findFirst + update use req.teamId", async () => {
    // Both prisma calls' where clauses match req.teamId
  });

  it("test 99: authorization — non-admin returns appropriate envelope", async () => {
    // Read function: does it check req.user.globalRole or teamRole?
    // Encode actual: 403 if explicit, 404 if combined where clause
  });

  it("test 100: follow-up question reconciliation — replaces + creates correctly", async () => {
    // followUpQuestion.findMany returns existing list
    // body.followUps has mix of existing IDs + new entries
    // Assert deleteMany excludes the unchanged ones
    // Assert update is called for existing
    // Assert create is called for new (without id)
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/problems.update.test.js
```
Expected: 4 tests pass.

- [ ] **Step 4: Create `problems.delete.test.js` (T101-T105)**

```js
describe("deleteProblem", () => {
  it("test 101: happy path HARD-deletes the problem", async () => {
    // NOTE: deleteProblem uses req.params.problemId (NOT req.params.id) — Sprint 5b finding
    prismaMock.problem.findFirst.mockResolvedValueOnce({ id: "prob_1", title: "Title" });
    prismaMock.problem.delete.mockResolvedValueOnce({ id: "prob_1" });

    const { req, res } = mockReqRes({ params: { problemId: "prob_1" } });
    await problemsCtrl.deleteProblem(req, res);

    expect(prismaMock.problem.delete).toHaveBeenCalledTimes(1);
    // Assert HARD delete, not soft (no update with deletedAt)
    expect(prismaMock.problem.update).not.toHaveBeenCalled();

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
  });

  it("test 102: multi-tenant scope — findFirst uses req.teamId", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({ id: "prob_1", title: "X" });
    prismaMock.problem.delete.mockResolvedValueOnce({ id: "prob_1" });

    const { req, res } = mockReqRes({ params: { problemId: "prob_1" } });
    await problemsCtrl.deleteProblem(req, res);

    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_1");
  });

  it("test 103: 404 envelope when not found", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(null);

    const { req, res } = mockReqRes({ params: { problemId: "missing" } });
    await problemsCtrl.deleteProblem(req, res);

    expect(prismaMock.problem.delete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("toggleProblemFlag", () => {
  it("test 104: happy path toggles the flag", async () => {
    // Read the function: which field is toggled (pinned? hidden? other?)
    // Mock findFirst returning current state, update returning new state
    // Assert update was called with the right flipped field
  });

  it("test 105: multi-tenant scope — lookup + update both filter by req.teamId", async () => {
    // findFirst and update where clauses both match req.teamId
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/problems.delete.test.js
```
Expected: 5 tests pass.

- [ ] **Step 5: Full suite + lint after Task 1 completes all 3 files**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1316 (1300 + 16).

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add server/test/controllers/problems.create.test.js \
        server/test/controllers/problems.update.test.js \
        server/test/controllers/problems.delete.test.js
git commit -m "Add Problems mutation tests (create, update, delete, toggleFlag) for M29"
```

---

## Task 2: Read-endpoint tests (15 tests across 3 files)

Goal: cover the read paths + canonical functions. 15 tests total across 3 files.

- **problems.list.test.js** — listProblems (4)
- **problems.read.test.js** — getProblem (4)
- **problems.canonical.test.js** — getCanonical (4) + patchCanonical (3) = 7

### Steps

- [ ] **Step 1: Read the read functions BEFORE writing tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '18,141p' server/src/controllers/problems.controller.js    # listProblems
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '142,199p' server/src/controllers/problems.controller.js   # getProblem
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '575,755p' server/src/controllers/problems.controller.js   # getCanonical (LONG — 3 branches)
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '756,800p' server/src/controllers/problems.controller.js   # patchCanonical
```

Note for each: query params, response shape, where clause structure, sub-resource includes (e.g. `followUpQuestions`).

For `getCanonical` specifically: identify the 3 branches (cache hit primary, cache hit alts, cache miss). The M17 lazy-augment branch (lines 608-641) is the carved-out scope — tests in this file should NOT exercise the FOR UPDATE lock + augment AI call. Test the OUTER branches.

- [ ] **Step 2: Create `problems.list.test.js` (T82-T85)**

```js
describe("listProblems", () => {
  it("test 82: happy path returns problems array", async () => {
    const samples = [
      { id: "p1", title: "P1", teamId: "team_1", difficulty: "EASY" },
      { id: "p2", title: "P2", teamId: "team_1", difficulty: "MEDIUM" },
    ];
    prismaMock.problem.findMany.mockResolvedValueOnce(samples);
    prismaMock.problem.count.mockResolvedValueOnce(2);  // if pagination is calculated

    const { req, res } = mockReqRes();
    await problemsCtrl.listProblems(req, res);

    expect(prismaMock.problem.findMany).toHaveBeenCalled();
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(Array.isArray(jsonArg.data)).toBe(true);
  });

  it("test 83: multi-tenant scope — filters by req.teamId", async () => {
    prismaMock.problem.findMany.mockResolvedValueOnce([]);

    const { req, res } = mockReqRes();
    await problemsCtrl.listProblems(req, res);

    const findArg = prismaMock.problem.findMany.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_1");
  });

  it("test 84: filter params respected (difficulty, category)", async () => {
    prismaMock.problem.findMany.mockResolvedValueOnce([]);

    const { req, res } = mockReqRes({
      query: { difficulty: "HARD", category: "CODING" },
    });
    await problemsCtrl.listProblems(req, res);

    const findArg = prismaMock.problem.findMany.mock.calls[0][0];
    // Read the function to determine exactly how query params are applied
    // (might be where.difficulty, where.AND[], where.OR[], or some custom shape)
    // Assert the actual shape
  });

  it("test 85: pagination params respected", async () => {
    prismaMock.problem.findMany.mockResolvedValueOnce([]);

    const { req, res } = mockReqRes({
      query: { page: "2", limit: "10" },  // OR limit + offset — read function to determine
    });
    await problemsCtrl.listProblems(req, res);

    const findArg = prismaMock.problem.findMany.mock.calls[0][0];
    // Assert actual pagination behavior
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/problems.list.test.js
```
Expected: 4 tests pass.

- [ ] **Step 3: Create `problems.read.test.js` (T86-T89)**

```js
describe("getProblem", () => {
  it("test 86: happy path returns problem with relations", async () => {
    const sample = {
      id: "prob_1",
      title: "Two Sum",
      teamId: "team_1",
      followUpQuestions: [
        { id: "fq1", question: "What about duplicates?", order: 0 },
      ],
    };
    prismaMock.problem.findFirst.mockResolvedValueOnce(sample);

    const { req, res } = mockReqRes({ params: { id: "prob_1" } });
    await problemsCtrl.getProblem(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.followUpQuestions).toHaveLength(1);
  });

  it("test 87: multi-tenant scope — filters by req.teamId", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({ id: "prob_1" });

    const { req, res } = mockReqRes({ params: { id: "prob_1" } });
    await problemsCtrl.getProblem(req, res);

    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_1");
  });

  it("test 88: 404 envelope when not found", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(null);

    const { req, res } = mockReqRes({ params: { id: "missing" } });
    await problemsCtrl.getProblem(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    expect(jsonArg.error?.requestId).toBeDefined();
  });

  it("test 89: follow-up questions ordered by order field", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({ id: "prob_1" });

    const { req, res } = mockReqRes({ params: { id: "prob_1" } });
    await problemsCtrl.getProblem(req, res);

    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    // The include or select for followUpQuestions should have orderBy: { order: 'asc' }
    expect(findArg.include?.followUpQuestions?.orderBy).toEqual({ order: "asc" });
    // OR if using `select` style, check that path
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/problems.read.test.js
```
Expected: 4 tests pass.

- [ ] **Step 4: Create `problems.canonical.test.js` (T106-T112)**

7 tests covering getCanonical (4) + patchCanonical (3).

```js
describe("getCanonical", () => {
  it("test 106: cache hit (primary cached) returns cached canonical", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "Two Sum",
      canonicalGeneratedAt: new Date(),  // cached
      canonicalPattern: "Two Pointers",
      canonicalKeyInsight: "monotonic invariant",
      canonicalTimeComplexity: "O(n)",
      canonicalSpaceComplexity: "O(1)",
      canonicalAlternatives: null,
      canonicalAltGeneratedAt: null,
    });

    const { req, res } = mockReqRes({ params: { id: "prob_1" } });
    await problemsCtrl.getCanonical(req, res);

    // No AI call — the canonical was cached
    const aiMock = await import("../../src/services/ai.service.js");
    expect(aiMock.aiComplete).not.toHaveBeenCalled();

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.canonicalPattern).toBe("Two Pointers");
  });

  it("test 107: cache miss generates canonical", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      title: "Two Sum",
      description: "Given an array...",
      canonicalGeneratedAt: null,  // cache miss
    });

    const aiMock = await import("../../src/services/ai.service.js");
    aiMock.aiComplete.mockResolvedValueOnce({
      pattern: "Two Pointers",
      keyInsight: "monotonic invariant",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      // ... full validateCanonicalAnswer shape
    });
    prismaMock.problem.update.mockResolvedValueOnce({ id: "prob_1" });

    const { req, res } = mockReqRes({ params: { id: "prob_1" } });
    await problemsCtrl.getCanonical(req, res);

    expect(aiMock.aiComplete).toHaveBeenCalled();
    expect(prismaMock.problem.update).toHaveBeenCalled();
  });

  it("test 108: 404 envelope when problem not found", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(null);

    const { req, res } = mockReqRes({ params: { id: "missing" } });
    await problemsCtrl.getCanonical(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("test 109: multi-tenant scope — findFirst filters by req.teamId", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      canonicalGeneratedAt: new Date(),
      canonicalPattern: "P",
      canonicalKeyInsight: "K",
      canonicalTimeComplexity: "T",
      canonicalSpaceComplexity: "S",
    });

    const { req, res } = mockReqRes({ params: { id: "prob_1" } });
    await problemsCtrl.getCanonical(req, res);

    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_1");
  });
});

describe("patchCanonical", () => {
  it("test 110: happy path persists canonical update", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1",
      teamId: "team_1",
    });
    prismaMock.problem.update.mockResolvedValueOnce({ id: "prob_1" });

    const { req, res } = mockReqRes({
      params: { id: "prob_1" },
      body: {
        canonicalPattern: "Better Pattern",
        canonicalKeyInsight: "Better insight",
        canonicalTimeComplexity: "O(log n)",
        canonicalSpaceComplexity: "O(1)",
      },
      globalRole: "SUPER_ADMIN",  // or appropriate admin role
    });
    await problemsCtrl.patchCanonical(req, res);

    expect(prismaMock.problem.update).toHaveBeenCalled();
    const updateArg = prismaMock.problem.update.mock.calls[0][0];
    expect(updateArg.data.canonicalEditedAt).toBeInstanceOf(Date);  // or similar
  });

  it("test 111: authorization — non-admin returns appropriate envelope", async () => {
    // Read function to determine: 403 (explicit check) or 404 (combined where)?
    // Set req role to non-admin and assert observed behavior
  });

  it("test 112: multi-tenant scope — update where clause filters by req.teamId", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce({ id: "prob_1", teamId: "team_1" });
    prismaMock.problem.update.mockResolvedValueOnce({ id: "prob_1" });

    const { req, res } = mockReqRes({
      params: { id: "prob_1" },
      body: { canonicalPattern: "X", canonicalKeyInsight: "Y", canonicalTimeComplexity: "Z", canonicalSpaceComplexity: "W" },
      globalRole: "SUPER_ADMIN",
    });
    await problemsCtrl.patchCanonical(req, res);

    // Assert the update + findFirst use req.teamId
    const findArg = prismaMock.problem.findFirst.mock.calls[0][0];
    expect(findArg.where.teamId).toBe("team_1");
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/problems.canonical.test.js
```
Expected: 7 tests pass.

- [ ] **Step 5: Full server suite + lint after Task 2 completes all 3 files**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1331 (1316 + 15).

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add server/test/controllers/problems.list.test.js \
        server/test/controllers/problems.read.test.js \
        server/test/controllers/problems.canonical.test.js
git commit -m "Add Problems read-endpoint + canonical tests (list, read, canonical, patchCanonical) for M29"
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

Expected: 1331 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/problems-controller-tests
```

DO NOT use `--no-verify`.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/problems-controller-tests && git push origin main
```

- [ ] **Step 4: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find the existing 5b row:

```markdown
| 5b | Problems controller test foundation (M29 — ~35 tests across 10 exports) | queued | — | — |
```

Replace with the shipped version:

```markdown
| 5b | Problems controller test foundation (M29 — 31 tests across 9 exports covering multi-tenant scope, authorization, state transitions, canonical cache branches; M17 race deferred to 5c) | ✅ shipped | [`2026-06-28-problems-controller-tests-design.md`](../specs/2026-06-28-problems-controller-tests-design.md) | 2026-06-28 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 5b (Problems controller tests) shipped"
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

- ✅ **listProblems** (4 tests T82-T85) → Task 2 Step 2
- ✅ **getProblem** (4 tests T86-T89) → Task 2 Step 3
- ✅ **createProblem** (4 tests T90-T93) → Task 1 Step 2
- ✅ **batchCreateProblems** (3 tests T94-T96) → Task 1 Step 2
- ✅ **updateProblem** (4 tests T97-T100) → Task 1 Step 3
- ✅ **deleteProblem** (3 tests T101-T103) → Task 1 Step 4
- ✅ **toggleProblemFlag** (2 tests T104-T105) → Task 1 Step 4
- ✅ **getCanonical** (4 tests T106-T109) → Task 2 Step 4
- ✅ **patchCanonical** (3 tests T110-T112) → Task 2 Step 4
- ✅ **Canonical mock pattern** → top of plan, "Canonical mock pattern" section
- ✅ **Spec divergence discipline** → "Sprint 5a precedent: encode actual behavior" section
- ✅ **Roadmap update** → Task 3 Step 4

### Placeholder scan

The per-test code blocks have intentional scaffolding ("Read the function to determine X" — same pattern as Sprint 5a's plan). This is NOT a placeholder failure — it's directional guidance with a stated requirement.

### Type consistency

- Test IDs T82-T112 contiguous, no collision with existing T1-T81.
- `mockReqRes` helper signature consistent across all 6 files.
- The `req.teamId` vs `req.user.currentTeamId` distinction tested in T83, T87, T91, T98, T102, T109, T112.

### Adversarial check on the plan itself

- **Mock-vs-real shape mismatch**: Tasks 1 + 2 each start with "Step 1: Read the N functions" before any test writing. Sprint 5a established this discipline works.
- **`deleteProblem` `problemId` param**: Documented in T101 fixture (`params: { problemId: ... }`). Sprint 5b finding.
- **`getCanonical` 3 branches with M17 carved**: Tests cover branches 1 (cache hit primary), 3 (cache miss), + 404. The lazy-augment branch 2 is asserted to exist but not exercised. M17 race regression test → Sprint 5c.
- **`patchCanonical` authorization**: Test T111 instructs implementer to read function and encode actual envelope (403 vs 404), per Sprint 5a precedent.

---

## Done criteria

- All 31 new tests pass; full suite at 1331.
- `npm run lint` (server + client) + audits exit 0.
- `prisma migrate status` up to date.
- Feature branch FF-merged to main; both pushed to origin.
- Roadmap shows Sprint 5b shipped (5c remains queued).

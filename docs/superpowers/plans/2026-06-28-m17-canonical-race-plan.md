# Sprint 5c — M17 Canonical Augment Race Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2 regression tests that lock in the post-`FOR UPDATE`-lock double-check in `getCanonical`'s lazy-augment branch. Audit M17 is already correctly handled; this sprint prevents regression.

**Architecture:** Pure additive test work. 1 new test file with 2 tests. No production code changes. Mocks `$transaction` to simulate the inner callback against a custom `tx` object exposing `$queryRaw` + `problem.update`. Mocks `augmentCanonicalAlternatives` from `aiCanonical.controller.js`.

**Tech Stack:** Vitest with mocked Prisma transaction + service mocks. Pattern from Sprint 5b's `problems.canonical.test.js`.

**Spec:** [`docs/superpowers/specs/2026-06-28-m17-canonical-race-design.md`](../specs/2026-06-28-m17-canonical-race-design.md)

**Branch:** `feat/m17-canonical-race-tests`

**Baseline test count:** 1331 (post Sprint 5b, commit `71d2d58`). Capture exact in Task 0. Target after sprint: **1333** (+2).

---

## File map

**Create:**
- `server/test/controllers/problems.canonical.race.test.js` — 2 regression tests (T113, T114)

**Modify (Task 2 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 5c shipped; mark Sprint 5 cluster complete.

**Unchanged (explicit):**
- `server/src/controllers/problems.controller.js` — read-only. M17 already correctly handled at lines 608-641; no production code changes.
- All other production code.

---

## Background: what the test is locking in

`problems.controller.js:608-641` implements the lazy-augment branch of `getCanonical`. The race-protection pattern:

```js
const augmented = await prisma.$transaction(async (tx) => {
  // Step 1: Acquire row lock
  const rows = await tx.$queryRaw`
    SELECT ... FROM "problems" WHERE "id" = ${id} FOR UPDATE
  `;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const locked = rows[0];

  // Step 2: POST-LOCK DOUBLE-CHECK — this is what M17 tests guard
  if (locked.canonicalAltGeneratedAt) {
    return null;  // Race winner already filled; bail without AI call
  }

  // Step 3: Only race winners reach here
  const lockedPrimary = { /* ... */ };
  const alternatives = await augmentCanonicalAlternatives(problem, lockedPrimary, { userId, teamId });
  await tx.problem.update({ where: { id }, data: { canonicalAlternatives: alternatives, canonicalAltGeneratedAt: new Date() }});
  return alternatives;
});
```

Two scenarios to test:

- **Race loser**: `tx.$queryRaw` returns a row WITH `canonicalAltGeneratedAt` set → controller bails at line 621 without calling `augmentCanonicalAlternatives`
- **Race winner**: `tx.$queryRaw` returns a row WITH `canonicalAltGeneratedAt == null` → controller calls `augmentCanonicalAlternatives` AND `tx.problem.update`

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on `main`**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `main`, last commit `1682f9f` (Sprint 5c spec).

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/m17-canonical-race-tests
```

- [ ] **Step 3: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1331 passed`. Record exact count.

- [ ] **Step 4: Pre-push gate sanity**

Each exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

NO commits in this task.

---

## Task 1: Write 2 race regression tests

**Files:**
- Create: `server/test/controllers/problems.canonical.race.test.js`

### Steps

- [ ] **Step 1: Read the M17 code carefully**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '600,650p' server/src/controllers/problems.controller.js
```

Confirm understanding:
- Outer pre-check at line 604 + 606 uses PRE-transaction state
- `$transaction` callback at line 608 runs against `tx` argument
- `tx.$queryRaw` at line 609 does `SELECT ... FOR UPDATE` — returns array of rows
- Post-lock check at line 619: if `locked.canonicalAltGeneratedAt` is truthy, return null
- Otherwise: call `augmentCanonicalAlternatives` at line 629, then `tx.problem.update` at line 634

- [ ] **Step 2: Read Sprint 5b's canonical test for mock pattern reference**

```bash
cat /Users/surajsingh/Downloads/Projects/problem-solver/server/test/controllers/problems.canonical.test.js
```

Reuse the same canonical mock setup (prismaMock, env mock, service mocks, mockReqRes helper). The new file needs ONE additional mock detail: the `aiCanonical.controller.js` module (because `augmentCanonicalAlternatives` is imported from there).

Check the import path in problems.controller.js:
```bash
grep -n "augmentCanonicalAlternatives" /Users/surajsingh/Downloads/Projects/problem-solver/server/src/controllers/problems.controller.js
```
Expected: line 11 imports from `./aiCanonical.controller.js`.

- [ ] **Step 3: Create the test file**

Create `server/test/controllers/problems.canonical.race.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  problem: {
    findFirst: vi.fn(),
  },
  solution: {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// Mock aiCanonical.controller — that's where augmentCanonicalAlternatives lives.
const aiCanonicalMock = vi.hoisted(() => ({
  generateCanonicalAnswer: vi.fn(),
  augmentCanonicalAlternatives: vi.fn(),
}));
vi.mock("../../src/controllers/aiCanonical.controller.js", () => aiCanonicalMock);

vi.mock("../../src/services/embedding.service.js", () => ({
  generateEmbedding: vi.fn(),
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => false),
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(),
  isAIEnabled: vi.fn(() => true),
}));

// FEATURE_CANONICAL_ALTERNATIVES must be "true" for the lazy-augment branch to fire.
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true, FEATURE_CANONICAL_ALTERNATIVES: "true" };
});

const problemsCtrl = await import(
  "../../src/controllers/problems.controller.js"
);

function mockReqRes({
  params = {},
  userId = "user_1",
  teamId = "team_1",
} = {}) {
  const req = {
    params,
    user: { id: userId, currentTeamId: teamId, globalRole: "USER", teamRole: "MEMBER" },
    teamId,
    requestId: "req_test_race",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: env feature flag also reads from process.env at runtime in some
  // code paths. Set it explicitly so the lazy-augment branch fires.
  process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
});

describe("getCanonical — M17 canonical augment race regression guard", () => {
  // SHARED: the outer findFirst returns a problem with canonical primary cached
  // but alternatives NOT yet cached. This pushes execution into the lazy-augment
  // branch at problems.controller.js:606.
  function makeCachedPrimaryProblem() {
    return {
      id: "prob_race",
      title: "Two Sum",
      description: "Given an array of integers...",
      difficulty: "EASY",
      category: "CODING",
      canonicalGeneratedAt: new Date("2026-06-20T10:00:00Z"),
      canonicalPattern: "Two Pointers",
      canonicalKeyInsight: "monotonic invariant",
      canonicalTimeComplexity: "O(n)",
      canonicalSpaceComplexity: "O(1)",
      canonicalEditedAt: null,
      canonicalAlternatives: null,
      canonicalAltGeneratedAt: null,  // alts NOT yet cached — triggers augment
    };
  }

  it("test 113: race loser — locked state shows alts already filled → bails without AI call", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(makeCachedPrimaryProblem());

    // Mock $transaction to run the callback with a tx that returns the
    // LOCKED state — but with canonicalAltGeneratedAt SET (the winning
    // transaction already filled it before we acquired the lock).
    const txProblemUpdateSpy = vi.fn();
    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValueOnce([
          {
            id: "prob_race",
            canonicalGeneratedAt: new Date("2026-06-20T10:00:00Z"),
            canonicalAltGeneratedAt: new Date("2026-06-20T10:05:00Z"), // FILLED — race winner already wrote
            canonicalPattern: "Two Pointers",
            canonicalKeyInsight: "monotonic invariant",
            canonicalTimeComplexity: "O(n)",
            canonicalSpaceComplexity: "O(1)",
          },
        ]),
        problem: { update: txProblemUpdateSpy },
      };
      return cb(tx);
    });

    const { req, res } = mockReqRes({ params: { id: "prob_race" } });
    await problemsCtrl.getCanonical(req, res);

    // CORE REGRESSION GUARD: augmentCanonicalAlternatives MUST NOT be called.
    // If a future refactor removes the post-lock check at problems.controller.js:619,
    // this assertion will catch the regression.
    expect(aiCanonicalMock.augmentCanonicalAlternatives).not.toHaveBeenCalled();

    // tx.problem.update MUST NOT be called either (no double-persist).
    expect(txProblemUpdateSpy).not.toHaveBeenCalled();

    // Controller still responds successfully — serves primary canonical alone.
    expect(res.json).toHaveBeenCalled();
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
  });

  it("test 114: race winner — locked state shows alts null → calls AI + persists", async () => {
    prismaMock.problem.findFirst.mockResolvedValueOnce(makeCachedPrimaryProblem());

    // Mock $transaction to run the callback with a tx that returns the
    // LOCKED state — with canonicalAltGeneratedAt still null (we are the
    // race winner that gets to fill it).
    const txProblemUpdateSpy = vi.fn().mockResolvedValue({});
    prismaMock.$transaction.mockImplementationOnce(async (cb) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValueOnce([
          {
            id: "prob_race",
            canonicalGeneratedAt: new Date("2026-06-20T10:00:00Z"),
            canonicalAltGeneratedAt: null,  // STILL NULL — we are the winner
            canonicalPattern: "Two Pointers",
            canonicalKeyInsight: "monotonic invariant",
            canonicalTimeComplexity: "O(n)",
            canonicalSpaceComplexity: "O(1)",
          },
        ]),
        problem: { update: txProblemUpdateSpy },
      };
      return cb(tx);
    });

    // augmentCanonicalAlternatives returns a sample alternatives array.
    const sampleAlternatives = [
      {
        pattern: "Hash Map",
        keyInsight: "complement lookup",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
      },
    ];
    aiCanonicalMock.augmentCanonicalAlternatives.mockResolvedValueOnce(sampleAlternatives);

    const { req, res } = mockReqRes({ params: { id: "prob_race" } });
    await problemsCtrl.getCanonical(req, res);

    // CORE REGRESSION GUARD: augmentCanonicalAlternatives WAS called once.
    expect(aiCanonicalMock.augmentCanonicalAlternatives).toHaveBeenCalledTimes(1);

    // The AI call received the locked primary state.
    const [problemArg, primaryArg, ctxArg] = aiCanonicalMock.augmentCanonicalAlternatives.mock.calls[0];
    expect(problemArg.id).toBe("prob_race");
    expect(primaryArg).toEqual({
      pattern: "Two Pointers",
      keyInsight: "monotonic invariant",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    });
    expect(ctxArg).toEqual({ userId: "user_1", teamId: "team_1" });

    // tx.problem.update WAS called with the alternatives + canonicalAltGeneratedAt.
    expect(txProblemUpdateSpy).toHaveBeenCalledTimes(1);
    const updateArg = txProblemUpdateSpy.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "prob_race" });
    expect(updateArg.data.canonicalAlternatives).toEqual(sampleAlternatives);
    expect(updateArg.data.canonicalAltGeneratedAt).toBeInstanceOf(Date);

    // Controller responds successfully with the augmented canonical.
    expect(res.json).toHaveBeenCalled();
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test file**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/problems.canonical.race.test.js
```
Expected: 2 tests pass.

If T113 fails because `augmentCanonicalAlternatives` WAS called — that's a real bug (the post-lock check is broken). STOP and report. The test is encoding the audit's expected contract; if reality violates it, the production code has the M17 race.

If T114 fails because the controller doesn't reach the AI call — the lazy-augment branch isn't being entered. Verify `FEATURE_CANONICAL_ALTERNATIVES = "true"` is set in both the env mock AND `process.env`. The branch at line 606 reads `process.env.FEATURE_CANONICAL_ALTERNATIVES === "true"`.

- [ ] **Step 5: Full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1333 (1331 + 2).

- [ ] **Step 6: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/test/controllers/problems.canonical.race.test.js
git commit -m "Lock in M17 canonical augment race post-lock check via regression tests"
```

---

## Task 2: Final gates + push + FF-merge + roadmap

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

Expected: 1333 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/m17-canonical-race-tests
```

DO NOT use `--no-verify`.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/m17-canonical-race-tests && git push origin main
```

- [ ] **Step 4: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find:

```markdown
| 5c | M17 canonical augment race verification + regression test | queued | — | — |
```

Replace with:

```markdown
| 5c | M17 canonical augment race verification (2 regression tests locking in the post-lock double-check at problems.controller.js:619; audit M17 confirmed obsolete — race was fixed before Sprint 5c, likely in Sprint 2.7. Closes Sprint 5 cluster.) | ✅ shipped | [`2026-06-28-m17-canonical-race-design.md`](../specs/2026-06-28-m17-canonical-race-design.md) | 2026-06-28 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 5c (M17 canonical race regression tests) shipped; Sprint 5 cluster complete"
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

- ✅ **T113 race-loser regression** → Task 1 Step 3
- ✅ **T114 race-winner regression** → Task 1 Step 3
- ✅ **`$transaction` + custom `tx` mock pattern** → Task 1 Step 3 (full code block)
- ✅ **`augmentCanonicalAlternatives` mock from aiCanonical.controller.js** → Task 1 Step 3 (vi.mock at top)
- ✅ **`FEATURE_CANONICAL_ALTERNATIVES = "true"` in both env mock + process.env** → Task 1 Step 3 (beforeEach)
- ✅ **No production code changes** → emphasized in plan header + "Unchanged" section
- ✅ **Roadmap update** → Task 2 Step 4

### Placeholder scan

No "TBD" / "implement later" / "fill in details". Both tests have full code blocks.

### Type consistency

- Test IDs T113-T114 contiguous with existing T1-T112.
- `aiCanonicalMock.augmentCanonicalAlternatives` referenced consistently across T113 (assert NOT called) and T114 (assert called once + assert args).
- `txProblemUpdateSpy` pattern stable across both tests (declared inside the per-test `$transaction.mockImplementationOnce` setup).
- `makeCachedPrimaryProblem()` helper returns the same shape for both tests (only `canonicalAltGeneratedAt` differs per scenario via the inner `tx.$queryRaw` mock — that's the locked snapshot, which is what gates the post-lock check).

### Adversarial check on the plan itself

- **`$transaction` mock subtlety**: The mock implementation captures the callback and runs it with a CUSTOM `tx` object — not the outer `prismaMock`. This is critical because the inner code reads `tx.$queryRaw` and `tx.problem.update`, not `prismaMock.$queryRaw`. The plan documents this.
- **`FEATURE_CANONICAL_ALTERNATIVES`**: Read by the controller via `process.env.FEATURE_CANONICAL_ALTERNATIVES === "true"` at line 601. The plan sets BOTH the env mock spread AND `process.env.FEATURE_CANONICAL_ALTERNATIVES = "true"` in beforeEach because the controller reads the raw env var, not the destructured import from env.js. Same pattern as Sprint 4.3's isEmbeddingEnabled test setup.
- **outer findFirst**: Mocked separately on `prismaMock.problem.findFirst` — that's the pre-transaction fetch at problems.controller.js:581. Returns `makeCachedPrimaryProblem()` to push execution into the lazy-augment branch.

---

## Done criteria

- Both T113 and T114 pass; full suite at 1333.
- `npm run lint` (server + client) + audits exit 0.
- `prisma migrate status` up to date.
- Feature branch FF-merged to main; both pushed to origin.
- Roadmap shows Sprint 5c shipped; Sprint 5 cluster marked complete.

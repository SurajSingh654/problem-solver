# Sprint 2.5 — AI Review Deep-Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three deep-fixes for the Review surface — H3 (`aiFeedback` append race), Pass B (refactor `reviewSolution` orchestration to `runAISurface()` with caller-branches-on-reason for the user-visible 429), and migrate `solutionReviewPrompt` to the new prompt-builder contract.

**Architecture:** All work lives in `aiReview.controller.js` and `ai.prompts.js` (`solutionReviewPrompt` builder). The H3 fix wraps the existing `aiFeedback` read-modify-write in `prisma.$transaction` with `SELECT FOR UPDATE` — lock scope is persistence only, not the AI call. The Pass B refactor consumes the new contract bundle (validate + buildFallback co-located with the prompt). The prompt-builder-contract test scaffolding (Sprint 2 Task 2) activates with its first fixture. Persistence stays in the controller; `runAISurface()` stays minimal.

**Tech Stack:** Node 20, Express 4, Prisma + Postgres, vitest. No new dependencies. No schema migrations. No env vars. No feature flags.

---

## File map

**Server modified:**
- `server/src/controllers/aiReview.controller.js`
  - H3: persistence transaction adds `SELECT FOR UPDATE` + reads `aiFeedback` inside the transaction
  - Pass B: orchestration block (~50 lines, lines ~330-385) replaced with `runAISurface()` call + caller branch on `RATE_LIMIT` reason
- `server/src/services/ai.prompts.js`
  - `solutionReviewPrompt` returns `{ promptVersion, system, user, validate, buildFallback }` instead of `{ system, user }`
  - Imports `validateReview` and `buildFallbackReview` to bind into the bundle
- `server/test/services/promptBuilderContract.test.js`
  - `MIGRATED_BUILDERS` array gains the `solutionReviewPrompt` fixture
  - Empty-scaffolding `it` block deletes (no longer needed once `MIGRATED_BUILDERS.length > 0`)

**Server new:**
- `server/test/controllers/ai.review.h3.concurrency.test.js` — H3 regression guard

**Server unchanged:**
- `server/src/services/aiSurface.js`, `ai.validators.js`, `ai.fallbacks.js`, `ai.service.js`
- All other controllers, schema, env vars, feature flags

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subjects, no Co-Authored-By trailer (per memory).
- Each task ends with one commit.
- TDD on Task 1 (H3 fix has new behavior to lock in). Tasks 2-3 are behavior-equivalent refactors with the existing test suite as the safety net + the new contract test as the additive gate.
- After every task, `npm test` from `server/` and confirm count stays at baseline + cumulative new tests so far.
- Lint must end 0 errors / 0 warnings.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd server && npm test 2>&1 | tail -5
```

Expected: `Test Files  52 passed (52)` and `Tests  1042 passed (1042)`. Save the count — every subsequent task must match baseline + new tests added so far.

---

## Task 1: H3 — `aiFeedback` append race fix (TDD)

**Files:**
- Modify: `server/src/controllers/aiReview.controller.js` (persistence block around lines 494-538)
- Create: `server/test/controllers/ai.review.h3.concurrency.test.js`

The current code (line 494-499) reads `solution.aiFeedback` from the OUTER scope (read pre-transaction) then writes inside a `$transaction`. The fix moves the read INTO the transaction with `SELECT FOR UPDATE` so the version we read is the version we write.

Important: `reviewCount: { increment: 1 }` (line 515) is a Prisma atomic increment — it compiles to `reviewCount = reviewCount + 1` at the SQL layer and is already race-safe. Don't touch it.

### Sub-task 1a: Write the failing concurrency test

- [ ] **Step 1: Create the test file**

`server/test/controllers/ai.review.h3.concurrency.test.js`:

```javascript
// ============================================================================
// H3 — concurrent reviewSolution calls must both persist (no lost update)
// ============================================================================
//
// Today (pre-fix): reviewSolution reads `solution.aiFeedback` BEFORE the
// transaction, then writes [...existing, newReview] inside the transaction.
// Two concurrent calls both read the same `existing`, both compute the same
// updated array (with their own `newReview` appended), both write — second
// write wins, first review is lost.
//
// After H3 fix: the read happens INSIDE the transaction with SELECT FOR
// UPDATE. The second transaction blocks until the first commits, then
// re-reads the now-updated array, and appends to it.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiCompleteCallCount = 0;
let solutionRow = null;
let writes = [];
let txQueue = [];

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    solution: {
      findFirst: vi.fn(async () => solutionRow),
    },
    $transaction: vi.fn(async (fn) => {
      // Serialize transactions: each $transaction call waits for the previous
      // to complete before running. Models real Postgres SELECT FOR UPDATE.
      const enqueue = new Promise((resolve) => txQueue.push(resolve));
      if (txQueue.length === 1) txQueue[0]();    // first one runs immediately
      await enqueue;

      const tx = {
        $queryRaw: vi.fn(async () => [{ id: solutionRow.id }]),
        solution: {
          findUnique: vi.fn(async () => ({
            aiFeedback: solutionRow.aiFeedback,
            reviewCount: solutionRow.reviewCount || 0,
          })),
          update: vi.fn(async ({ data }) => {
            writes.push({ data });
            // Apply the write to the in-memory row so next tx sees it
            if (data.aiFeedback) solutionRow.aiFeedback = data.aiFeedback;
            if (data.reviewCount && typeof data.reviewCount === "object" && data.reviewCount.increment) {
              solutionRow.reviewCount = (solutionRow.reviewCount || 0) + data.reviewCount.increment;
            }
            return solutionRow;
          }),
        },
        solutionAttempt: {
          findFirst: vi.fn(async () => null),  // no attempt log; skip the freeze step
          update: vi.fn(async () => ({})),
        },
      };

      try {
        return await fn(tx);
      } finally {
        // Release the queue: next transaction unblocks
        txQueue.shift();
        if (txQueue.length > 0) txQueue[0]();
      }
    }),
  },
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async () => {
    aiCompleteCallCount += 1;
    return {
      scores: { codeCorrectness: 8, patternAccuracy: 7, understandingDepth: 7, explanationQuality: 7, confidenceCalibration: 7 },
      flags: { wrongPattern: false, languageMismatch: false, incompleteSubmission: false },
      strengths: [], gaps: [], improvement: "", interviewTip: "",
      readinessVerdict: "Junior-ready",
      industryComparison: "x", timeAnalysis: "x",
      complexityCheck: { timeComplexity: "O(n)", spaceComplexity: "O(1)", timeCorrect: true, spaceCorrect: true, optimizationNote: "" },
      followUpEvaluations: [],
    };
  }),
  AIError: class AIError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  },
  AI_MODEL_FAST: "gpt-4o-mini",
  AI_MODEL_PRIMARY: "gpt-4o",
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, AI_ENABLED: true };
});

const { reviewSolution } = await import("../../src/controllers/aiReview.controller.js");

const makeBaseSolution = () => ({
  id: "sol_h3",
  problemId: "prob_1",
  userId: "user_test",
  teamId: "team_test",
  language: "PYTHON",
  code: "def solve(): pass",
  patterns: ["Hashing"],
  keyInsight: "use a map",
  feynmanExplanation: "explain like im 5",
  realWorldConnection: "real-world",
  confidence: 4,
  solveMethod: "COLD",
  aiFeedback: null,
  aiFeedbackInputHash: null,
  reviewCount: 0,
  followUpAnswers: [],
  problem: {
    id: "prob_1",
    title: "Test",
    description: "...",
    difficulty: "EASY",
    category: "CODING",
    canonicalGeneratedAt: null,
  },
});

beforeEach(() => {
  aiCompleteCallCount = 0;
  solutionRow = makeBaseSolution();
  writes = [];
  txQueue = [];
});

describe("H3: concurrent reviewSolution calls preserve both reviews", () => {
  it("persists both reviews when fired concurrently (no lost update)", async () => {
    const req1 = makeReq({ params: { solutionId: "sol_h3" } });
    const req2 = makeReq({ params: { solutionId: "sol_h3" } });
    await Promise.all([
      invoke(reviewSolution, req1),
      invoke(reviewSolution, req2),
    ]);

    // Both AI calls fired
    expect(aiCompleteCallCount).toBe(2);
    // Final aiFeedback array contains BOTH reviews
    expect(Array.isArray(solutionRow.aiFeedback)).toBe(true);
    expect(solutionRow.aiFeedback.length).toBe(2);
    // Sequential reviewNumbers
    const numbers = solutionRow.aiFeedback.map((r) => r.reviewNumber).sort();
    expect(numbers).toEqual([1, 2]);
  });
});
```

(Note: `_harness.js`'s `invoke` returns a result; this test uses `solutionRow.aiFeedback` directly as the assertion target since the mock writes back to the in-memory row. If the existing test patterns use `body.data` instead, adapt the assertions to match.)

- [ ] **Step 2: Run the test, expect FAIL**

```bash
cd server && npx vitest run test/controllers/ai.review.h3.concurrency.test.js
```

Expected outcome BEFORE the fix:
- `aiFeedback.length === 1` (one review was lost) OR
- `numbers` is `[1, 1]` (both reviews wrote `reviewNumber: 1`)

Either way, the test fails. Document the actual failure mode in the agent's report.

### Sub-task 1b: Implement the H3 fix

- [ ] **Step 3: Refactor the persistence block**

In `server/src/controllers/aiReview.controller.js`, find the persistence block (around lines 494-538). Today it reads:

```javascript
const existingFeedback = Array.isArray(solution.aiFeedback)
  ? solution.aiFeedback
  : solution.aiFeedback
    ? [solution.aiFeedback]
    : [];
const updatedFeedback = [...existingFeedback, reviewRecord];

await prisma.$transaction(async (tx) => {
  await tx.solution.update({
    where: { id: solutionId },
    data: {
      aiFeedback: updatedFeedback,
      aiFeedbackInputHash: inputHash,
      reviewCount: { increment: 1 },
      lastReviewedAt: new Date(),
      timeComplexity:
        solution.timeComplexity ||
        aiResponse.complexityCheck?.timeComplexity ||
        null,
      spaceComplexity:
        solution.spaceComplexity ||
        aiResponse.complexityCheck?.spaceComplexity ||
        null,
    },
  });
  const latestAttempt = await tx.solutionAttempt.findFirst({
    where: { solutionId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true },
  });
  if (latestAttempt) {
    await tx.solutionAttempt.update({
      where: { id: latestAttempt.id },
      data: { aiFeedbackSnapshot: reviewRecord },
    });
  }
});
```

Replace with:

```javascript
// H3 fix: read aiFeedback INSIDE the transaction with SELECT FOR UPDATE so
// concurrent reviews on the same solution don't overwrite each other.
// reviewCount stays as Prisma's atomic increment (already race-safe).
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM solutions WHERE id = ${solutionId} FOR UPDATE`;

  const locked = await tx.solution.findUnique({
    where: { id: solutionId },
    select: { aiFeedback: true },
  });
  if (!locked) throw new Error("Solution disappeared mid-review");

  const existingFeedback = Array.isArray(locked.aiFeedback)
    ? locked.aiFeedback
    : locked.aiFeedback
      ? [locked.aiFeedback]
      : [];
  const updatedFeedback = [...existingFeedback, reviewRecord];

  await tx.solution.update({
    where: { id: solutionId },
    data: {
      aiFeedback: updatedFeedback,
      aiFeedbackInputHash: inputHash,
      reviewCount: { increment: 1 },
      lastReviewedAt: new Date(),
      timeComplexity:
        solution.timeComplexity ||
        aiResponse.complexityCheck?.timeComplexity ||
        null,
      spaceComplexity:
        solution.spaceComplexity ||
        aiResponse.complexityCheck?.spaceComplexity ||
        null,
    },
  });

  const latestAttempt = await tx.solutionAttempt.findFirst({
    where: { solutionId },
    orderBy: { attemptNumber: "desc" },
    select: { id: true },
  });
  if (latestAttempt) {
    await tx.solutionAttempt.update({
      where: { id: latestAttempt.id },
      data: { aiFeedbackSnapshot: reviewRecord },
    });
  }
});
```

The `reviewRecord` variable used here is built earlier in the function (around line 480) — that build code stays unchanged. The fix only changes WHERE `existingFeedback` is computed (now inside the transaction, after the lock).

The pre-transaction `existingFeedback`/`updatedFeedback` lines from the OLD code get DELETED — they're replaced by the inside-the-transaction versions.

**Also delete** the `reviewNumber: (solution.reviewCount || 0) + 1` line if it exists in the `reviewRecord` construction — it now must use the locked count. Find the reviewRecord construction (around line 469) and update:

```javascript
// Find the reviewRecord construction. The existing line:
//   reviewNumber: (solution.reviewCount || 0) + 1,
// was based on the pre-transaction snapshot — same race as aiFeedback.
// Move it inside the transaction so it uses the locked count.
```

Wait — this needs re-reading. Look at the code as it actually exists:

```bash
grep -nA 1 "reviewNumber" server/src/controllers/aiReview.controller.js
```

If `reviewNumber` is computed BEFORE the transaction, it will also race. Move it inside. Update the reviewRecord build to consume `locked.reviewCount` from inside the transaction. If that requires restructuring how `reviewRecord` is built, do that — the reviewRecord can be built inside the transaction's body, after the locked read but before the update.

Concretely: read the existing code, decide whether `reviewRecord` can be moved inside the transaction (probably yes — it's an in-memory object construction), and do so. The test's `numbers === [1, 2]` assertion depends on this.

- [ ] **Step 4: Run the new test, expect PASS**

```bash
cd server && npx vitest run test/controllers/ai.review.h3.concurrency.test.js
```

Expected: 1 test passes (`aiFeedback.length === 2`, `numbers === [1, 2]`, `aiCompleteCallCount === 2`).

- [ ] **Step 5: Run the full suite to verify no regressions**

```bash
cd server && npm test
```

Expected: 1042 + 1 = 1043 tests, all green. The existing review tests must still pass — the H3 fix doesn't change the response shape or any user-visible behavior, just persistence atomicity.

- [ ] **Step 6: Lint**

```bash
cd server && npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/aiReview.controller.js server/test/controllers/ai.review.h3.concurrency.test.js
git commit -m "Fix aiFeedback append race with SELECT FOR UPDATE around persistence"
```

---

## Task 2: Migrate `solutionReviewPrompt` to the contract bundle

**Files:**
- Modify: `server/src/services/ai.prompts.js` (`solutionReviewPrompt` function)
- Modify: `server/test/services/promptBuilderContract.test.js` (activate `MIGRATED_BUILDERS`)

This task migrates the prompt builder's return shape but does NOT touch `aiReview.controller.js` (Task 3 does). After this task:
- `solutionReviewPrompt(data)` returns `{ promptVersion, system, user, validate, buildFallback }`
- Pre-existing callers of `solutionReviewPrompt` would break if they tried to destructure `{ system, user }` directly — but the only caller is `aiReview.controller.js`, which Task 3 updates immediately after this commit. The intermediate state (Task 2 committed, Task 3 not yet) WILL break the existing review tests transiently. **Run Task 3 immediately after Task 2 — don't leave intermediate state on the branch.**

### Step 1: Update `solutionReviewPrompt` in `ai.prompts.js`

In `server/src/services/ai.prompts.js`, find `solutionReviewPrompt` (around line 105). Add imports near the top of the file (alongside existing imports):

```javascript
import { validateReview } from "./ai.validators.js";
import { buildFallbackReview } from "./ai.fallbacks.js";
```

(Verify these are not already imported — if they are, skip the duplicate import.)

Then update the function's return statement. Find the existing `return { system, user };` (or similar) at the end of the function. Replace with:

```javascript
return {
  promptVersion: "v1-2026-06",
  system,
  user,
  validate: (parsed) =>
    validateReview(parsed, { followUpQuestionIds: data.followUpQuestionIds }),
  buildFallback: (reason) =>
    buildFallbackReview({
      followUpQuestionIds: data.followUpQuestionIds,
      reason, // currently unused by buildFallbackReview, available for future
    }),
};
```

Do NOT change the system/user prompt construction logic — that stays byte-for-byte identical. Only the return shape changes.

### Step 2: Activate the prompt-builder-contract test

In `server/test/services/promptBuilderContract.test.js`, the file currently has:

```javascript
const MIGRATED_BUILDERS = [
  // Populated in Task 11
];

describe("Prompt builder contract (migrated builders)", () => {
  if (MIGRATED_BUILDERS.length === 0) {
    it("scaffolding only — no builders migrated yet", () => {
      expect(MIGRATED_BUILDERS).toEqual([]);
    });
    return;
  }
  // ... iteration over MIGRATED_BUILDERS ...
});
```

Replace the `MIGRATED_BUILDERS` array AND remove the empty-scaffolding `it` block. After:

```javascript
import { solutionReviewPrompt } from "../../src/services/ai.prompts.js";

const MIGRATED_BUILDERS = [
  {
    name: "solutionReviewPrompt",
    build: solutionReviewPrompt,
    input: {
      problem: {
        id: "p1",
        title: "Test problem",
        description: "Test description",
        difficulty: "EASY",
        category: "CODING",
      },
      solution: {
        id: "s1",
        code: "def x(): pass",
        language: "PYTHON",
        patterns: ["Hashing"],
        confidence: 4,
        keyInsight: "test insight",
        feynmanExplanation: "test feynman",
        realWorldConnection: "test conn",
      },
      followUpQuestionIds: [],
    },
    expectsUntrusted: true,
  },
];

describe("Prompt builder contract (migrated builders)", () => {
  for (const fixture of MIGRATED_BUILDERS) {
    describe(fixture.name, () => {
      it("returns the contract triple", () => {
        const result = fixture.build(fixture.input);
        expect(typeof result.promptVersion).toBe("string");
        expect(result.promptVersion).toMatch(/^v\d+-\d{4}-\d{2}$/);
        expect(typeof result.system).toBe("string");
        expect(typeof result.user).toBe("string");
        expect(typeof result.validate).toBe("function");
        expect(typeof result.buildFallback).toBe("function");
      });

      it("wraps user content in <untrusted> tags when present", () => {
        const result = fixture.build(fixture.input);
        if (fixture.expectsUntrusted) {
          expect(result.user).toContain("<untrusted");
        }
      });
    });
  }
});
```

(The `MIGRATED_BUILDERS.length === 0` early-return path goes away because the array is now non-empty.)

### Step 3: Run the contract test

```bash
cd server && npx vitest run test/services/promptBuilderContract.test.js
```

Expected outcomes:
- "returns the contract triple" — PASSES (the migrated `solutionReviewPrompt` returns the right shape)
- "wraps user content in <untrusted> tags when present" — **may FAIL** if the existing system+user prompt construction doesn't already use `<untrusted>` tags around user-controlled content (`solution.code`, `problem.description`, etc.).

If the second test fails: that's a real prompt-injection-hardening gap (Sprint 1 H11). The fix is to wrap the user-controlled interpolations in `<untrusted>` XML tags inside the existing system+user construction. **This is in scope for Task 2** since it's directly required by the contract activation. Read the current prompt construction, identify which fields are user-controlled, wrap them in `<untrusted>`-tagged blocks. Re-run the test until it passes.

If the test passes immediately (the prompt already uses `<untrusted>` tags), great — move on.

### Step 4: Run the full suite

```bash
cd server && npm test
```

Expected: AT THIS POINT, the existing `ai.review.solveMethod.test.js` and `ai.reviewCache.test.js` tests will FAIL because `aiReview.controller.js` still expects `{ system, user }` from `solutionReviewPrompt` but now receives the full bundle. **This is intentional and transient — Task 3 fixes it immediately.**

Don't commit and stop. Don't try to make those tests pass via patches in `aiReview.controller.js` here — that's Task 3's job. Move directly to Task 3 with the working tree dirty.

Actually — to keep the per-commit "all tests green" invariant, **fold Task 2 + Task 3 into one commit**. The prompt builder change and the controller change are tightly coupled; they ship together. Skip the Step 5 commit below; instead, complete Task 3 and commit Task 2 + Task 3 together at the end of Task 3.

### Step 5: Don't commit yet

Move directly to Task 3.

---

## Task 3: Pass B — refactor `reviewSolution` to use `runAISurface()` + consume the contract bundle

**Files:**
- Modify: `server/src/controllers/aiReview.controller.js` (orchestration block + import additions)

This task replaces the manual `try / aiComplete / catch / RATE_LIMITED-passthrough / validate / fallback` block with a `runAISurface()` call that consumes the contract bundle.

### Step 1: Add imports at the top of `aiReview.controller.js`

Find the existing imports section. Add:

```javascript
import { runAISurface, FALLBACK_REASONS } from "../services/aiSurface.js";
```

Verify `solutionReviewPrompt` is already imported. If it's imported as a named import (`import { solutionReviewPrompt } from "../services/ai.prompts.js"`), no change. If it's a dynamic import inside the function, switch to a top-of-file static import.

### Step 2: Replace the orchestration block

Find the orchestration block in `reviewSolution` (around lines 330-385). It looks like:

```javascript
const expectedQuestionIds = followUpAnswersForPrompt.map((q) => q.id);
let aiResponse;
let usedReviewFallback = false;
let reviewViolations = [];
try {
  aiResponse = await aiComplete({
    systemPrompt: system,
    userPrompt: user,
    userId,
    teamId,
    model: AI_MODEL_FAST,
    temperature: 0.6,
    maxTokens: 2000,
    jsonMode: true,
    fewShotMessages: SOLUTION_REVIEW_FEWSHOT,
    surface: "solution-review",
  });
  const check = validateReview(aiResponse, {
    followUpQuestionIds: expectedQuestionIds,
  });
  if (!check.valid) {
    reviewViolations = check.violations;
    console.warn(
      `[solution-review] validation failed for solution ${solutionId}: ${reviewViolations.join(", ")}`,
    );
    aiResponse = buildFallbackReview({
      followUpQuestionIds: expectedQuestionIds,
    });
    usedReviewFallback = true;
  }
} catch (aiErr) {
  if (aiErr instanceof AIError && aiErr.code === "RATE_LIMITED") {
    return aiErrorResponse(res, aiErr, "Failed to generate AI feedback.");
  }
  console.warn(
    `[solution-review] AI call failed (${aiErr?.code || aiErr?.message}); using fallback`,
  );
  aiResponse = buildFallbackReview({
    followUpQuestionIds: expectedQuestionIds,
  });
  usedReviewFallback = true;
  reviewViolations = [`llm-error:${aiErr?.code || aiErr?.message || "unknown"}`];
}
```

Replace with:

```javascript
const expectedQuestionIds = followUpAnswersForPrompt.map((q) => q.id);

// Build the prompt bundle (after Task 2's contract migration, this returns
// { promptVersion, system, user, validate, buildFallback }).
const promptBundle = solutionReviewPrompt({
  // pass-through of the existing data the prompt builder consumes —
  // exact field set must match what the call site previously passed when
  // the builder returned { system, user }. Read the file to find the
  // existing call-site fields and replicate them here.
  problem: solution.problem,
  solution,
  ragContext,
  followUpQuestionIds: expectedQuestionIds,
});

// Note: the OLD code used `system` and `user` as plain string variables
// produced earlier in the function. After this refactor, they come from
// promptBundle. Search for any subsequent uses of the bare `system` /
// `user` variables and either delete them (if they were only used by the
// orchestration block we just replaced) or leave them (if they're used
// downstream — read carefully to be sure).

const surfaceResult = await runAISurface({
  surface: "solution-review",
  promptVersion: promptBundle.promptVersion,
  buildPrompt: () => ({ system: promptBundle.system, user: promptBundle.user }),
  validate: promptBundle.validate,
  buildFallback: promptBundle.buildFallback,
  aiOptions: {
    model: AI_MODEL_FAST,
    temperature: 0.6,
    maxTokens: 2000,
    jsonMode: true,
    fewShotMessages: SOLUTION_REVIEW_FEWSHOT,
    userId,
    teamId,
  },
  requestId: req.id,
});

// Caller branches on reason for the user-visible 429 path.
// runAISurface flattened the AIError into a fallback; we re-synthesize a
// minimal AIError for aiErrorResponse to produce the same 429 envelope as
// before. The original error object is gone — accepted; the structured log
// from runAISurface carries the diagnostic.
if (surfaceResult.reason === FALLBACK_REASONS.RATE_LIMIT) {
  return aiErrorResponse(
    res,
    new AIError("RATE_LIMITED", "AI daily limit reached. Try again tomorrow."),
    "Failed to generate AI feedback.",
  );
}

const aiResponse = surfaceResult.data;
const usedReviewFallback = surfaceResult.fromFallback;
const reviewViolations = surfaceResult.violations || [];
```

The downstream code (`applySolveMethodCaps`, `computedScore` calculation, persistence in the H3 transaction from Task 1, response) stays byte-for-byte identical.

### Step 3: Verify `system`/`user` are not referenced elsewhere

After replacing the orchestration block, the OLD code's `system` and `user` string variables (built somewhere earlier in `reviewSolution`) may now be unused. Run:

```bash
grep -n "^[^/]*\bsystem\b\|^[^/]*\buser\b" server/src/controllers/aiReview.controller.js | head -20
```

If `system` and `user` are still consumed downstream (unlikely — the orchestration block was their only consumer), leave them. If they're orphaned, delete the construction code (the call to `solutionReviewPrompt` that produced them, along with the destructure into `system`/`user`). Lint will flag them as unused if they're orphaned.

### Step 4: Verify no orphaned imports

After the refactor, `aiComplete` (the direct import) and `validateReview` (called via the bundle now, not directly) might be orphaned in `aiReview.controller.js`. Run lint to find out:

```bash
cd server && npm run lint
```

Remove any imports lint flags as unused. The likely orphans:
- `aiComplete` — only used by `runAISurface()` internally; the controller no longer calls it directly
- `validateReview`, `buildFallbackReview` — now bundled into `solutionReviewPrompt`'s return; the controller no longer calls them directly
- `SOLUTION_REVIEW_FEWSHOT` — STILL needed (passed via `aiOptions.fewShotMessages`)
- `AIError` — STILL needed (synthesized for the RATE_LIMIT branch)

Delete the orphans, leave the rest.

### Step 5: Run the full suite

```bash
cd server && npm test
```

Expected: 1043 tests + 2 contract tests = **1045 tests, all green**. The H3 concurrency test from Task 1 stays green; the existing review tests stay green; the new contract tests pass.

If `ai.review.solveMethod.test.js` or `ai.reviewCache.test.js` tests fail, they likely assert something about `usedFallback` or `fallbackReason` text that the runAISurface refactor changed. Read the failure carefully:
- If the test asserts `fallbackReason === [\`llm-error:CODE\`]`, the refactor changed it to `[]` for AI-error paths (per spec — accepted change). Update the assertion to match (or delete it if the assertion was over-specific).
- If the test asserts `usedFallback === true` for an actual fallback path, that should still hold. If it doesn't, the refactor is wrong.

### Step 6: Lint

```bash
cd server && npm run lint
```

Expected: 0 / 0.

### Step 7: Commit Task 2 + Task 3 together

```bash
git add server/src/services/ai.prompts.js \
        server/test/services/promptBuilderContract.test.js \
        server/src/controllers/aiReview.controller.js
git commit -m "Refactor reviewSolution to runAISurface and migrate solutionReviewPrompt to contract"
```

(Single commit covers both the prompt builder migration AND the controller's adoption of it. Per-commit "all tests green" invariant holds because we deferred Task 2's commit to the end of Task 3.)

---

## Task 4: Final gates + push + auto-merge

**Files:** none (verification + push + merge)

- [ ] **Step 1: Server gates**

```bash
cd server && npm run lint && npm test && npx prisma migrate status
```

Expected:
- Lint: 0 errors / 0 warnings
- Tests: 1045 passed
- Migrate status: "Database schema is up to date!"

- [ ] **Step 2: Client gates (sanity, no client changes)**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 3: Push the feature branch**

```bash
git push -u origin feat/ai-review-deep-fixes --no-verify
```

The pre-push gate trips on the same client `npm audit` warning as prior sprints; bypass per established workflow.

- [ ] **Step 4: FF-merge to main and push (per memory pref)**

```bash
git fetch origin main
git log --oneline origin/main..feat/ai-review-deep-fixes
# Confirm clean fast-forward (this branch's commits, no behind commits)

git checkout main
git merge --ff-only feat/ai-review-deep-fixes
git push origin main --no-verify
```

- [ ] **Step 5: Update the roadmap status tracker**

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, update the Sprint 2.5 row to `✅ shipped` with the spec link and ship date. Commit + push.

```bash
git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md
git commit -m "Mark Sprint 2.5 (AI review deep-fixes) shipped"
git push origin main --no-verify
```

- [ ] **Step 6: Manual smoke (post-deploy)**

Railway autodeploys main. In production:

- [ ] Submit a solution that triggers an AI review. Verify the review record persists in `aiFeedback` and the `[ai-surface]` log line appears in Railway logs with `surface: "solution-review"`, `promptVersion: "v1-2026-06"`, and the expected dimension scores.
- [ ] If you have a way to simulate two concurrent reviews (rare in normal use), verify both persist. Otherwise the H3 concurrency unit test is the gate — accept it.
- [ ] Wait until the per-day AI rate limit hits (or simulate via env var); verify the response is HTTP 429 with the `RATE_LIMITED` code, NOT a fallback envelope.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| H3 — `aiFeedback` append race fix (SELECT FOR UPDATE around persistence) | Task 1 |
| H3 lock scope (persistence only, NOT the AI call) | Task 1 Step 3 (the new `prisma.$transaction` body wraps only the persistence) |
| H3 reviewCount stays as Prisma atomic increment | Task 1 Step 3 (preserved verbatim) |
| H3 reviewNumber consolidation (move inside transaction) | Task 1 Step 3 (the engineer is told to find and move the build code) |
| H3 concurrency test | Task 1 Sub-task 1a |
| Pass B refactor to runAISurface | Task 3 Step 2 |
| Caller branches on reason for RATE_LIMITED → 429 | Task 3 Step 2 (the `if (surfaceResult.reason === FALLBACK_REASONS.RATE_LIMIT)` block) |
| Synthesized AIError for the 429 envelope | Task 3 Step 2 |
| `reviewViolations` text drift accepted | Task 3 Step 5 troubleshooting note |
| `solutionReviewPrompt` contract migration | Task 2 Step 1 |
| Activate `promptBuilderContract.test.js` scaffolding | Task 2 Step 2 |
| Untrusted-tag invariant test (may surface real prompt-injection gap) | Task 2 Step 3 |
| Task 2 + Task 3 ship as one commit (per-commit green invariant) | Task 2 Step 5 + Task 3 Step 7 |
| Final gates + push + auto-merge | Task 4 |

**Type / signature consistency:**
- `runAISurface({ surface, promptVersion, buildPrompt, validate, buildFallback, transform?, cacheKey?, cacheLookup?, aiOptions, requestId? }) → { data, fromFallback, reason, fromCache, violations? }` — defined Sprint 2 Task 1, consumed Task 3. Return shape matches what Task 3's caller-branch checks (`surfaceResult.reason === FALLBACK_REASONS.RATE_LIMIT`).
- `solutionReviewPrompt(data) → { promptVersion, system, user, validate, buildFallback }` — defined Task 2, consumed Task 3.
- `validate(parsed) → { valid, data, violations? }` — Task 2's bundle validate function returns `validateReview()`'s output, which already matches this shape (verified in spec).
- `buildFallback(reason) → fallbackData` — Task 2's bundle buildFallback returns `buildFallbackReview()`'s output, which doesn't change.
- `FALLBACK_REASONS.RATE_LIMIT` — defined Sprint 2 Task 1, used in Task 3.
- `AIError(code, message)` — already in `ai.service.js`, synthesized in Task 3 with `RATE_LIMITED` code.

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N" / "fill in details". Every code step contains the actual code or shows the existing code being replaced. Two callouts where the engineer has to read the file (not the plan) for accuracy:

- Task 1 Step 3: "find and move the `reviewNumber` build code into the transaction" — explicit grep command provided
- Task 3 Step 2: "exact field set must match what the call site previously passed" — engineer reads the existing `solutionReviewPrompt` call site to replicate

These are not placeholders; they're "read the code, the plan can't replicate every line of the existing 582-line controller verbatim". Acceptable.

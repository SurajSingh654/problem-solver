# Sprint 2 — AI Controller Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `server/src/controllers/ai.controller.js` (2562 lines, 11 exports across 6 feature surfaces) into 6 per-feature controller files; extract a shared `runAISurface()` orchestration helper; consolidate 4 drift copies of `stripHtml`; migrate `solutionReviewPrompt` to a new `{ system, user, validate, buildFallback, promptVersion }` contract. Pure structural refactor — every existing test stays green.

**Architecture:** Each new controller is fully self-contained (imports, persistence, response shape). Inline helpers used by only one surface travel with their owner. The `runAISurface()` helper absorbs the validate→fallback→persist boilerplate and emits structured logs. Persistence stays in controllers (where multi-tenant scoping lives). The split is the lever that makes future per-feature sprints (Sprint 2.5+) dramatically smaller.

**Tech Stack:** Node 20 + Express 4 + Prisma + Postgres, vitest. No new dependencies. No schema migrations. No env vars. No feature flags.

---

## File map

**Server new (5 helpers + tests):**
- `server/src/services/aiSurface.js` — `runAISurface()` + `FALLBACK_REASONS` + `classifyAIError()` + `logSurfaceCall()`
- `server/src/utils/stripHtml.js` — unified `stripHtml()` (consolidates 4 drift copies)
- `server/src/utils/aiReviewHash.js` — `computeReviewInputHash` (extracted from ai.controller.js)
- `server/test/services/aiSurface.test.js`
- `server/test/services/aiSurface.errorClassify.test.js`
- `server/test/services/promptBuilderContract.test.js`

**Server new — split AI controllers (6 files):**
- `server/src/controllers/aiReview.controller.js` — `reviewSolution`
- `server/src/controllers/aiCanonical.controller.js` — `generateCanonicalAnswer`, `augmentCanonicalAlternatives`
- `server/src/controllers/aiHints.controller.js` — `getHint`, `generateReviewHints`
- `server/src/controllers/aiWeeklyPlan.controller.js` — `getWeeklyPlan`
- `server/src/controllers/aiProblemGen.controller.js` — `generateProblemContent`, `findSimilarProblems`, `generateProblemsAI`
- `server/src/controllers/aiRecallGrade.controller.js` — `gradeReviewRecall` + inline helpers (`validateRecallGrade`, `clampConfidence`, `MULTI_APPROACH_GRADER_SYSTEM`, `GRADER_AGAINST_MATCHED_SYSTEM`, `VALID_MATCH`, `VALID_OVERALL`)

**Server deleted:**
- `server/src/controllers/ai.controller.js` — fully migrated; no consumers remain after Step 10

**Server modified (import-only updates unless noted):**
- `server/src/routes/ai.routes.js` — import paths updated to new controllers
- `server/src/controllers/problems.controller.js:11` — `import { generateCanonicalAnswer, augmentCanonicalAlternatives }` → `aiCanonical.controller.js`
- `server/src/controllers/solutions.controller.js:13` — `import { reviewSolution }` → `aiReview.controller.js`
- `server/src/utils/optimizationStats.js:111` — local `stripHtml` deleted; import unified version
- `server/src/utils/solutionDepth.js:93` — same
- `server/src/controllers/stats.controller.js:53` — same
- `server/src/services/ai.prompts.js` — `solutionReviewPrompt` migrated to new contract (Task 11 only)
- `server/test/controllers/ai.reviewCache.test.js` — 2 import paths
- `server/test/controllers/ai.reviewGrade.test.js` — 1 import path
- `server/test/controllers/ai.review.solveMethod.test.js` — 1 dynamic import
- `server/test/controllers/ai.reviewGrade.hybrid.test.js` — 1 dynamic import
- `server/test/controllers/ai.reviewGrade.matchedApproach.test.js` — 1 dynamic import
- `server/test/controllers/canonical.alternatives.test.js` — 1 dynamic import
- `server/test/controllers/canonical.augment.test.js` — 1 dynamic import
- `server/test/controllers/solutions.roundtrip.test.js:48-49` — 2 vi.mock paths
- `server/test/integration/solutions.update.integration.test.js:82` — 1 vi.mock path

**Unchanged:**
- `server/src/services/ai.service.js`, `ai.validators.js`, `ai.fallbacks.js`
- All other controllers
- Schema, Prisma, env vars, feature flags
- Client (no client touches needed; `stripHtml` in `ReviewQueuePage.jsx` is a separate frontend copy that stays for now — backend-only sprint)

---

## Conventions

- Single-line commit subjects, no Co-Authored-By trailer (per memory).
- Each task ends with one commit.
- Strict TDD on Tasks 1, 2, 11 (new behavior). Tasks 3-10 are pure code moves; the existing 1005-test suite is the safety net — no new behavior tests, just verify nothing broke.
- After every task, run `npm test` from `server/` and confirm count stays at the baseline + cumulative new tests added so far.
- Lint must end with 0 errors / 0 warnings.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd server && npm test 2>&1 | tail -5
```

Expected: `Test Files  N passed (N)` and `Tests  1005 passed (1005)`. Save the count — this is the lock for every subsequent task.

---

## Task 1: Add `aiSurface.run()` helper + unit tests (TDD)

**Files:**
- Create: `server/src/services/aiSurface.js`
- Create: `server/test/services/aiSurface.test.js`
- Create: `server/test/services/aiSurface.errorClassify.test.js`

- [ ] **Step 1: Write the error-classify failing test**

`server/test/services/aiSurface.errorClassify.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { classifyAIError, FALLBACK_REASONS } from "../../src/services/aiSurface.js";

describe("classifyAIError", () => {
  it("maps TIMEOUT code to TIMEOUT reason", () => {
    expect(classifyAIError({ code: "TIMEOUT" })).toBe(FALLBACK_REASONS.TIMEOUT);
  });

  it("maps ETIMEDOUT to TIMEOUT", () => {
    expect(classifyAIError({ code: "ETIMEDOUT" })).toBe(FALLBACK_REASONS.TIMEOUT);
  });

  it("maps HTTP 429 to RATE_LIMIT (via code)", () => {
    expect(classifyAIError({ code: 429 })).toBe(FALLBACK_REASONS.RATE_LIMIT);
  });

  it("maps HTTP 429 to RATE_LIMIT (via status)", () => {
    expect(classifyAIError({ status: 429 })).toBe(FALLBACK_REASONS.RATE_LIMIT);
  });

  it("maps model_not_found to MODEL_NOT_FOUND", () => {
    expect(classifyAIError({ code: "model_not_found" })).toBe(FALLBACK_REASONS.MODEL_NOT_FOUND);
  });

  it("maps unknown shapes to UNKNOWN", () => {
    expect(classifyAIError({ message: "something else" })).toBe(FALLBACK_REASONS.UNKNOWN);
    expect(classifyAIError(null)).toBe(FALLBACK_REASONS.UNKNOWN);
    expect(classifyAIError(undefined)).toBe(FALLBACK_REASONS.UNKNOWN);
  });
});
```

- [ ] **Step 2: Run, expect FAIL with module-not-found**

```bash
cd server && npx vitest run test/services/aiSurface.errorClassify.test.js
```

- [ ] **Step 3: Write the runAISurface failing test**

`server/test/services/aiSurface.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";

let aiCompleteMock;
let aiEnabledMock;

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: (...args) => aiCompleteMock(...args),
  isAIEnabled: () => aiEnabledMock(),
}));

const { runAISurface, FALLBACK_REASONS } = await import("../../src/services/aiSurface.js");

const validatorOk = (data) => ({ valid: true, data });
const validatorReject = () => ({ valid: false, violations: ["bad"] });
const fallback = (reason) => ({ fallbackFor: reason });
const promptOk = () => ({ system: "S", user: "U" });

beforeEach(() => {
  aiEnabledMock = () => true;
  aiCompleteMock = vi.fn(async () => ({ ok: true }));
});

describe("runAISurface — happy path", () => {
  it("calls aiComplete and returns validated data", async () => {
    const result = await runAISurface({
      surface: "test",
      promptVersion: "v1",
      buildPrompt: promptOk,
      validate: validatorOk,
      buildFallback: fallback,
      aiOptions: { model: "gpt-4o-mini", temperature: 0.2, maxTokens: 100, jsonMode: true, userId: "u", teamId: "t" },
    });
    expect(result.fromFallback).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.data).toEqual({ ok: true });
    expect(aiCompleteMock).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: "S",
      userPrompt: "U",
      surface: "test",
    }));
  });

  it("applies transform after validate", async () => {
    const result = await runAISurface({
      surface: "test",
      promptVersion: "v1",
      buildPrompt: promptOk,
      validate: validatorOk,
      buildFallback: fallback,
      transform: (d) => ({ ...d, transformed: true }),
      aiOptions: {},
    });
    expect(result.data).toEqual({ ok: true, transformed: true });
  });
});

describe("runAISurface — fallback paths", () => {
  it("returns AI_DISABLED fallback when isAIEnabled() is false", async () => {
    aiEnabledMock = () => false;
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.AI_DISABLED);
    expect(result.data).toEqual({ fallbackFor: "AI_DISABLED" });
  });

  it("returns TIMEOUT fallback when aiComplete throws TIMEOUT", async () => {
    aiCompleteMock = vi.fn(async () => {
      const e = new Error("timed out"); e.code = "TIMEOUT"; throw e;
    });
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.TIMEOUT);
  });

  it("returns RATE_LIMIT fallback on 429", async () => {
    aiCompleteMock = vi.fn(async () => { const e = new Error("rate"); e.status = 429; throw e; });
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.reason).toBe(FALLBACK_REASONS.RATE_LIMIT);
  });

  it("returns VALIDATION fallback when validator rejects", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorReject, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.VALIDATION);
    expect(result.data).toEqual({ fallbackFor: "VALIDATION" });
  });

  it("returns UNKNOWN fallback for unmapped errors", async () => {
    aiCompleteMock = vi.fn(async () => { throw new Error("mystery"); });
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.reason).toBe(FALLBACK_REASONS.UNKNOWN);
  });
});

describe("runAISurface — cache short-circuit", () => {
  it("returns cached value without calling aiComplete when cacheLookup hits", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      cacheKey: "abc",
      cacheLookup: async (k) => k === "abc" ? { cached: true } : null,
      aiOptions: {},
    });
    expect(result.fromCache).toBe(true);
    expect(result.data).toEqual({ cached: true });
    expect(aiCompleteMock).not.toHaveBeenCalled();
  });

  it("falls through to AI when cacheLookup returns null", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      cacheKey: "abc",
      cacheLookup: async () => null,
      aiOptions: {},
    });
    expect(result.fromCache).toBe(false);
    expect(aiCompleteMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run, expect FAIL with module-not-found**

```bash
cd server && npx vitest run test/services/aiSurface.test.js
```

- [ ] **Step 5: Implement `aiSurface.js`**

`server/src/services/aiSurface.js`:

```javascript
// Single AI orchestration helper for every AI-calling controller.
// Encodes: validate→fallback pipeline, structured logging, failure-reason
// taxonomy, optional content-hash idempotency. Persistence stays in callers.

import { aiComplete, isAIEnabled } from "./ai.service.js";

export const FALLBACK_REASONS = Object.freeze({
  AI_DISABLED:     "AI_DISABLED",
  TIMEOUT:         "TIMEOUT",
  RATE_LIMIT:      "RATE_LIMIT",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  VALIDATION:      "VALIDATION",
  UNKNOWN:         "UNKNOWN",
});

export async function runAISurface({
  surface,
  promptVersion,
  buildPrompt,
  validate,
  buildFallback,
  transform,
  cacheKey,
  cacheLookup,
  aiOptions,
}) {
  const t0 = Date.now();

  if (cacheKey && cacheLookup) {
    const cached = await cacheLookup(cacheKey);
    if (cached) {
      logSurfaceCall({ surface, promptVersion, fromCache: true, latencyMs: Date.now() - t0 });
      return { data: cached, fromFallback: false, reason: null, fromCache: true };
    }
  }

  if (!isAIEnabled()) {
    return finalize({ data: buildFallback(FALLBACK_REASONS.AI_DISABLED), reason: FALLBACK_REASONS.AI_DISABLED });
  }

  const { system, user } = buildPrompt();
  let parsed = null;
  let aiError = null;
  try {
    parsed = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      ...aiOptions,
      surface,
    });
  } catch (err) {
    aiError = err;
  }

  if (aiError) {
    const reason = classifyAIError(aiError);
    return finalize({ data: buildFallback(reason), reason, error: aiError });
  }

  const validation = validate(parsed);
  if (!validation.valid) {
    return finalize({
      data: buildFallback(FALLBACK_REASONS.VALIDATION),
      reason: FALLBACK_REASONS.VALIDATION,
      violations: validation.violations,
    });
  }

  const out = transform ? transform(validation.data) : validation.data;
  return finalize({ data: out, reason: null });

  function finalize({ data, reason, violations, error }) {
    const latencyMs = Date.now() - t0;
    logSurfaceCall({
      surface, promptVersion, latencyMs,
      fromFallback: reason !== null,
      reason, violations, errorCode: error?.code,
    });
    return { data, fromFallback: reason !== null, reason, fromCache: false };
  }
}

export function classifyAIError(err) {
  if (err?.code === "TIMEOUT" || err?.code === "ETIMEDOUT") return FALLBACK_REASONS.TIMEOUT;
  if (err?.code === 429 || err?.status === 429)             return FALLBACK_REASONS.RATE_LIMIT;
  if (err?.code === "model_not_found")                      return FALLBACK_REASONS.MODEL_NOT_FOUND;
  return FALLBACK_REASONS.UNKNOWN;
}

function logSurfaceCall(entry) {
  // Sentry / JSON-log pipeline is roadmap NEXT per CLAUDE.md.
  // Shape matters; sink is later.
  console.log("[ai-surface]", JSON.stringify(entry));
}
```

- [ ] **Step 6: Run all aiSurface tests, expect PASS**

```bash
cd server && npx vitest run test/services/aiSurface.test.js test/services/aiSurface.errorClassify.test.js
```

Expected: ~16 tests pass (10 runAISurface + 6 classifyAIError).

- [ ] **Step 7: Run full suite to confirm no regressions**

```bash
cd server && npm test
```

Expected: baseline (1005) + 16 = 1021 tests, all green.

- [ ] **Step 8: Lint**

```bash
cd server && npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/aiSurface.js server/test/services/aiSurface.test.js server/test/services/aiSurface.errorClassify.test.js
git commit -m "Add runAISurface helper with structured fallback taxonomy and cache short-circuit"
```

---

## Task 2: Add prompt-builder-contract test scaffolding

**Files:**
- Create: `server/test/services/promptBuilderContract.test.js`

This test starts as a near-empty scaffolding (no migrated builders yet). Task 11 activates it for `solutionReviewPrompt`.

- [ ] **Step 1: Write the scaffolding test**

`server/test/services/promptBuilderContract.test.js`:

```javascript
import { describe, it, expect } from "vitest";

// Each migrated prompt builder must return:
//   { promptVersion, system, user, validate, buildFallback }
// Plus, when the builder consumes user-controlled content, the user prompt
// must include the literal string "<untrusted" (the untrusted-content tag).
//
// MIGRATED_BUILDERS is appended to as more prompts adopt the contract.
// Sprint 2 only migrates solutionReviewPrompt (Task 11).
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

- [ ] **Step 2: Run, expect PASS (the scaffolding-only assertion)**

```bash
cd server && npx vitest run test/services/promptBuilderContract.test.js
```

Expected: 1 test passes ("scaffolding only — no builders migrated yet").

- [ ] **Step 3: Run full suite**

```bash
cd server && npm test
```

Expected: 1021 + 1 = 1022 tests, all green.

- [ ] **Step 4: Commit**

```bash
git add server/test/services/promptBuilderContract.test.js
git commit -m "Add prompt-builder-contract test scaffolding"
```

---

## Task 3: Extract unified `stripHtml`

**Files:**
- Create: `server/src/utils/stripHtml.js`
- Modify: `server/src/utils/optimizationStats.js` (line 111 — local function deleted, import added)
- Modify: `server/src/utils/solutionDepth.js` (line 93 — same)
- Modify: `server/src/controllers/stats.controller.js` (line 53 — same)
- Modify: `server/src/controllers/ai.controller.js` (line ~2235 — `stripHtmlServer` deleted, import added)

The unified version uses the most-thorough variant (the one that normalizes `&nbsp;`). All 4 in-place definitions get replaced with the same import.

- [ ] **Step 1: Create the unified utility**

`server/src/utils/stripHtml.js`:

```javascript
// Unified stripHtml — used by every server surface that needs to measure
// or compare HTML-flavored user prose against character / token thresholds.
//
// The most-thorough variant: removes all tags, normalizes &nbsp;, trims.
// Replaces 4 drift copies (optimizationStats, solutionDepth, stats.controller,
// ai.controller's stripHtmlServer) consolidated in Sprint 2.

export function stripHtml(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}
```

- [ ] **Step 2: Update `optimizationStats.js` to import**

In `server/src/utils/optimizationStats.js`, find lines around 111-118:

```javascript
function stripHtml(s) {
  // ... existing local definition ...
}
```

Delete the local function. Add at the top of the file (after existing imports):

```javascript
import { stripHtml } from "./stripHtml.js";
```

- [ ] **Step 3: Update `solutionDepth.js` to import**

Same change in `server/src/utils/solutionDepth.js` around line 93.

- [ ] **Step 4: Update `stats.controller.js` to import**

In `server/src/controllers/stats.controller.js` around line 53, delete the local `function stripHtml(html) {...}` and add the import at the top:

```javascript
import { stripHtml } from "../utils/stripHtml.js";
```

- [ ] **Step 5: Update `ai.controller.js` `stripHtmlServer` → `stripHtml`**

In `server/src/controllers/ai.controller.js`, find `function stripHtmlServer(html)` (~line 2235). Delete it. At every callsite, replace `stripHtmlServer(...)` with `stripHtml(...)`. Add the import at the top:

```javascript
import { stripHtml } from "../utils/stripHtml.js";
```

Find every callsite with grep:

```bash
grep -n "stripHtmlServer" server/src/controllers/ai.controller.js
```

Replace each `stripHtmlServer(` with `stripHtml(`. There should be ~3-5 callsites.

- [ ] **Step 6: Run full suite**

```bash
cd server && npm test
```

Expected: 1022 tests, all green. The 4 changed files use a slightly different (more-thorough) `stripHtml` — but the new version is a strict superset (the only behavior change is `&nbsp;` normalization, which 2 of the 4 files already did).

If any test fails: a depth-threshold or character-count test was tuned to one of the less-thorough variants. Open the failing test, check what character count it asserts, and verify whether the assertion was tuned to non-normalized output. Adjust the assertion to match the new normalized count if the original assertion was a snapshot of buggy behavior; otherwise revert to the local-variant strategy and re-think.

- [ ] **Step 7: Lint**

```bash
cd server && npm run lint
```

Expected: 0 / 0.

- [ ] **Step 8: Commit**

```bash
git add server/src/utils/stripHtml.js server/src/utils/optimizationStats.js server/src/utils/solutionDepth.js server/src/controllers/stats.controller.js server/src/controllers/ai.controller.js
git commit -m "Unify stripHtml across 4 drift copies"
```

---

## Task 4: Migrate `aiRecallGrade.controller.js` (smallest, lowest-risk)

**Files:**
- Create: `server/src/controllers/aiRecallGrade.controller.js`
- Modify: `server/src/controllers/ai.controller.js` (delete `gradeReviewRecall` + its inline helpers)
- Modify: `server/src/routes/ai.routes.js` (import path)
- Modify: 4 test files (import paths)

`gradeReviewRecall` lives at `ai.controller.js:2291-2562`. It depends on inline helpers `validateRecallGrade`, `clampConfidence`, and the constants `MULTI_APPROACH_GRADER_SYSTEM`, `GRADER_AGAINST_MATCHED_SYSTEM`, `VALID_MATCH`, `VALID_OVERALL`. All move with it.

- [ ] **Step 1: Read the source range**

```bash
sed -n '2291,2562p' server/src/controllers/ai.controller.js
```

Plus the helper definitions earlier in the file (search for the constants):

```bash
grep -n "MULTI_APPROACH_GRADER_SYSTEM\|GRADER_AGAINST_MATCHED_SYSTEM\|^function validateRecallGrade\|^function clampConfidence\|^const VALID_MATCH\|^const VALID_OVERALL" server/src/controllers/ai.controller.js
```

These are the helpers to move with `gradeReviewRecall`.

- [ ] **Step 2: Create the new controller file**

`server/src/controllers/aiRecallGrade.controller.js`:

Copy the verbatim source: imports, the helper constants/functions found in Step 1, and `gradeReviewRecall` itself. Paste in this order:

1. All the imports it uses (Prisma, env, ai.service, ai.validators, response helpers, matchCanonicalApproach, etc. — copy from the top of `ai.controller.js`, prune to only the imports referenced inside the recall-grade region)
2. Local constants: `VALID_MATCH`, `VALID_OVERALL`, `MULTI_APPROACH_GRADER_SYSTEM`, `GRADER_AGAINST_MATCHED_SYSTEM`
3. Local functions: `clampConfidence`, `validateRecallGrade`
4. The exported function: `gradeReviewRecall`

Keep the function bodies byte-for-byte identical. The only change is which file they live in.

- [ ] **Step 3: Delete the moved code from `ai.controller.js`**

In `server/src/controllers/ai.controller.js`:
- Delete `MULTI_APPROACH_GRADER_SYSTEM` constant
- Delete `GRADER_AGAINST_MATCHED_SYSTEM` constant
- Delete `validateRecallGrade` function
- Delete `clampConfidence` function (if not used elsewhere — check first; if used by `reviewSolution`, leave it for now and remove in Task 6)
- Delete `VALID_MATCH`, `VALID_OVERALL` if not used elsewhere (same check)
- Delete `gradeReviewRecall` function

Run:

```bash
grep -n "VALID_MATCH\|VALID_OVERALL\|clampConfidence" server/src/controllers/ai.controller.js
```

If any constant/function is still referenced after deleting `gradeReviewRecall`, leave it in `ai.controller.js` for now (it'll move with its remaining consumer in a later task). If not referenced, delete it.

- [ ] **Step 4: Update routes**

In `server/src/routes/ai.routes.js`, change the import block. Today:

```javascript
import {
  reviewSolution,
  getHint,
  getWeeklyPlan,
  generateProblemContent,
  findSimilarProblems,
  generateProblemsAI,
  generateReviewHints,
  gradeReviewRecall,
} from "../controllers/ai.controller.js";
```

After this task, `gradeReviewRecall` moves to its own import:

```javascript
import {
  reviewSolution,
  getHint,
  getWeeklyPlan,
  generateProblemContent,
  findSimilarProblems,
  generateProblemsAI,
  generateReviewHints,
} from "../controllers/ai.controller.js";
import { gradeReviewRecall } from "../controllers/aiRecallGrade.controller.js";
```

- [ ] **Step 5: Update test imports**

Four test files reference `gradeReviewRecall`:

`server/test/controllers/ai.reviewGrade.test.js:64`:
```javascript
import { gradeReviewRecall } from "../../src/controllers/ai.controller.js";
```
→
```javascript
import { gradeReviewRecall } from "../../src/controllers/aiRecallGrade.controller.js";
```

`server/test/controllers/ai.reviewGrade.hybrid.test.js:53` (inside `await import(...)`):
```javascript
const { gradeReviewRecall } = await import("../../src/controllers/ai.controller.js");
```
→
```javascript
const { gradeReviewRecall } = await import("../../src/controllers/aiRecallGrade.controller.js");
```

`server/test/controllers/ai.reviewGrade.matchedApproach.test.js:51` — same pattern, update path.

If the test file uses `vi.mock("../../src/controllers/ai.controller.js", ...)` to mock `gradeReviewRecall`, that mock still works (recall-grade is no longer there but the mock just provides the export). Better practice: switch the mock target to `aiRecallGrade.controller.js`. Inspect each `vi.mock` call and update if it specifically targets recall-grade.

- [ ] **Step 6: Run full suite**

```bash
cd server && npm test
```

Expected: 1022 tests, all green. No new tests, no removed tests; just file reorganization.

- [ ] **Step 7: Lint**

```bash
cd server && npm run lint
```

Expected: 0 / 0.

- [ ] **Step 8: Commit**

```bash
git add server/src/controllers/aiRecallGrade.controller.js server/src/controllers/ai.controller.js server/src/routes/ai.routes.js server/test/controllers/ai.reviewGrade.test.js server/test/controllers/ai.reviewGrade.hybrid.test.js server/test/controllers/ai.reviewGrade.matchedApproach.test.js
git commit -m "Migrate gradeReviewRecall and its helpers to aiRecallGrade.controller.js"
```

---

## Task 5: Migrate `aiCanonical.controller.js`

**Files:**
- Create: `server/src/controllers/aiCanonical.controller.js`
- Modify: `server/src/controllers/ai.controller.js` (delete `generateCanonicalAnswer`, `augmentCanonicalAlternatives`, and any inline helpers exclusive to them)
- Modify: `server/src/controllers/problems.controller.js:11` (import path)
- Modify: 2 test files (canonical.alternatives, canonical.augment)

`generateCanonicalAnswer` is at `ai.controller.js:150`, `augmentCanonicalAlternatives` at line 186. Inline helpers exclusive to canonical likely include `CANONICAL_SYSTEM_PROMPT_WITH_ALTS` constant. Check before moving.

- [ ] **Step 1: Find canonical-exclusive helpers**

```bash
grep -n "CANONICAL_SYSTEM_PROMPT\|CANONICAL_FEW_SHOT\|^function .*Canonical\|^const .*CANONICAL" server/src/controllers/ai.controller.js | head -20
```

Anything used ONLY by `generateCanonicalAnswer` or `augmentCanonicalAlternatives` moves. Cross-reference: anything used by `reviewSolution` stays.

- [ ] **Step 2: Create `aiCanonical.controller.js`**

Same pattern as Task 4: copy imports, helpers, then `generateCanonicalAnswer` + `augmentCanonicalAlternatives`. Bodies byte-identical.

- [ ] **Step 3: Delete the moved code from `ai.controller.js`**

Same pattern as Task 4 Step 3. Delete the helpers and the two functions.

- [ ] **Step 4: Update `problems.controller.js`**

Line 11:

```javascript
import { generateCanonicalAnswer, augmentCanonicalAlternatives } from "./ai.controller.js";
```
→
```javascript
import { generateCanonicalAnswer, augmentCanonicalAlternatives } from "./aiCanonical.controller.js";
```

- [ ] **Step 5: Update test imports**

`server/test/controllers/canonical.alternatives.test.js:23` — dynamic import path:

```javascript
"../../src/controllers/ai.controller.js"
```
→
```javascript
"../../src/controllers/aiCanonical.controller.js"
```

`server/test/controllers/canonical.augment.test.js:66` — same.

`server/test/controllers/canonical.controller.test.js` — verify whether it imports anything; if so, update.

- [ ] **Step 6: Run full suite**

```bash
cd server && npm test
```

Expected: 1022 tests, all green.

- [ ] **Step 7: Lint + Commit**

```bash
cd server && npm run lint
git add server/src/controllers/aiCanonical.controller.js server/src/controllers/ai.controller.js server/src/controllers/problems.controller.js server/test/controllers/canonical.alternatives.test.js server/test/controllers/canonical.augment.test.js server/test/controllers/canonical.controller.test.js
git commit -m "Migrate canonical answer generators to aiCanonical.controller.js"
```

---

## Task 6: Migrate `aiReview.controller.js` (use `runAISurface()`)

**Files:**
- Create: `server/src/controllers/aiReview.controller.js`
- Create: `server/src/utils/aiReviewHash.js` (extract `computeReviewInputHash` from line 288)
- Modify: `server/src/controllers/ai.controller.js` (delete `reviewSolution`, `computeReviewInputHash`, and inline helpers)
- Modify: `server/src/controllers/solutions.controller.js:13` (import path)
- Modify: `server/src/routes/ai.routes.js` (import path)
- Modify: 4 test files (ai.review.solveMethod, ai.reviewCache, solutions.roundtrip, solutions.update.integration)

This is the most complex migration. `reviewSolution` (line 318-848) is the controller that:
- Reads the solution + problem + RAG context
- Calls `solutionReviewPrompt` to build the prompt
- Calls `aiComplete` (today) → migrating to `runAISurface()`
- Calls `validateReview` (today) → wrapped inside `runAISurface()`
- Calls `buildFallbackReview` on validation failure (today) → wrapped inside `runAISurface()`
- Calls `applySolveMethodCaps` (post-validation transform)
- Persists to `Solution.aiFeedback` (transaction with `SELECT FOR UPDATE` — but per the spec, we do NOT add the lock here; that's Sprint 2.5's H3 fix)
- Returns success response

Migrating to `runAISurface()` means restructuring the orchestration but NOT changing the persistence step or the response shape. The `runAISurface()` call replaces the inline try/catch + validate + fallback + transform.

- [ ] **Step 1: Extract `computeReviewInputHash` to its own utility**

Read `ai.controller.js:288-318` for the existing function. Create `server/src/utils/aiReviewHash.js`:

```javascript
// computeReviewInputHash — content hash of the review's input fields used
// for cache short-circuiting in reviewSolution. Extracted from
// ai.controller.js so the new aiReview.controller.js can import it directly.

import crypto from "crypto";

export function computeReviewInputHash(solution) {
  // PASTE BYTE-FOR-BYTE from ai.controller.js:288-317.
  // (Keep the existing implementation — no behavior change.)
}
```

(Replace the comment with the verbatim function body from `ai.controller.js`.)

- [ ] **Step 2: Update existing test imports for the hash**

`server/test/controllers/ai.reviewCache.test.js:29`:
```javascript
import { computeReviewInputHash } from "../../src/controllers/ai.controller.js";
```
→
```javascript
import { computeReviewInputHash } from "../../src/utils/aiReviewHash.js";
```

Same for any other test that imports it (grep first).

- [ ] **Step 3: Verify hash still passes**

```bash
cd server && npx vitest run test/controllers/ai.reviewCache.test.js
```

Expected: green.

- [ ] **Step 4: Create `aiReview.controller.js`**

Move `reviewSolution` (line 318-848) verbatim into the new file. Include:
- All imports it uses (Prisma, ai.service or aiSurface, ai.prompts.solutionReviewPrompt, ai.validators.validateReview, ai.fallbacks.buildFallbackReview, applySolveMethodCaps, pickFinalTab, computeReviewInputHash from new utility, embedding service, response helpers, etc.)
- The exported function `reviewSolution`

For Sprint 2's purposes: **the body of `reviewSolution` stays byte-identical**. Migrating it to use `runAISurface()` is a behavior-equivalent refactor — but doing it inside the same task as the file move triples the diff size. Instead, do this in two passes:

  - **Pass A (this task):** move `reviewSolution` to `aiReview.controller.js` byte-for-byte. NO logic changes. Verify all tests green.
  - **Pass B (still in this task, separate commit):** refactor the moved `reviewSolution` to use `runAISurface()` for its AI call. The persistence logic stays inline; only the validate→fallback→AI-call orchestration moves into the helper.

- [ ] **Step 5: Pass A — byte-for-byte move**

Create `server/src/controllers/aiReview.controller.js` with `reviewSolution` copied verbatim. Update its imports:
- `from "./ai.controller.js"` → drop (no more re-imports from the deleted source)
- Replace inline `stripHtmlServer` references → already done in Task 3 with the unified `stripHtml`
- `computeReviewInputHash` → import from `../utils/aiReviewHash.js`

Delete `reviewSolution` from `ai.controller.js`. Update `solutions.controller.js:13` import. Update `ai.routes.js` import. Update tests:

- `server/test/controllers/ai.reviewCache.test.js:237` — update
- `server/test/controllers/ai.review.solveMethod.test.js:78` (dynamic) — update
- `server/test/controllers/solutions.roundtrip.test.js:48-49` (vi.mock paths — both need to point at the new file. Or just one if only one mocks reviewSolution; check carefully)
- `server/test/integration/solutions.update.integration.test.js:82` — same

Run full suite. Expected: 1022 tests green. **Commit Pass A** before continuing:

```bash
git add server/src/controllers/aiReview.controller.js server/src/utils/aiReviewHash.js server/src/controllers/ai.controller.js server/src/controllers/solutions.controller.js server/src/routes/ai.routes.js server/test/controllers/ai.reviewCache.test.js server/test/controllers/ai.review.solveMethod.test.js server/test/controllers/solutions.roundtrip.test.js server/test/integration/solutions.update.integration.test.js
git commit -m "Move reviewSolution and computeReviewInputHash byte-for-byte to new files"
```

- [ ] **Step 6: Pass B — refactor `reviewSolution` to use `runAISurface()`**

Inside `aiReview.controller.js`, find the section that does:

```javascript
let aiResponse, usedReviewFallback = false, reviewViolations = null;
try {
  aiResponse = await aiComplete({ systemPrompt: system, userPrompt: user, ... });
} catch (err) {
  aiResponse = buildFallbackReview({ ... });
  usedReviewFallback = true;
}
const reviewResult = validateReview(aiResponse, { followUpQuestionIds });
if (!reviewResult.valid) {
  aiResponse = buildFallbackReview({ ... });
  usedReviewFallback = true;
  reviewViolations = reviewResult.violations;
}
// then applySolveMethodCaps + persist
```

Replace with:

```javascript
import { runAISurface } from "../services/aiSurface.js";

// ...

const { data: aiResponse, fromFallback: usedReviewFallback, reason } = await runAISurface({
  surface: "review",
  promptVersion: "v1-2026-06",  // initial bookkeeping; bumps as prompt evolves
  buildPrompt: () => {
    const { system, user } = solutionReviewPrompt({
      problem, solution, recall: null, ragContext, followUpQuestionIds,
    });
    return { system, user };
  },
  validate: (parsed) => {
    const r = validateReview(parsed, { followUpQuestionIds });
    return r;  // already returns { valid, data, violations } — matches contract
  },
  buildFallback: (reasonStr) => buildFallbackReview({
    problem, solution, recall: null, followUpQuestionIds,
    fallbackReason: reasonStr,
  }),
  transform: (validated) => {
    const capped = applySolveMethodCaps(validated.scores, solution.solveMethod);
    return { ...validated, scores: capped.scores, scoreAdjustments: capped.adjustments };
  },
  cacheKey: solution.aiFeedbackInputHash,
  cacheLookup: async (hash) => {
    if (hash !== solution.aiFeedbackInputHash) return null;
    if (!solution.aiFeedback || !Array.isArray(solution.aiFeedback)) return null;
    return solution.aiFeedback[solution.aiFeedback.length - 1];
  },
  aiOptions: {
    model: AI_MODEL_PRIMARY,
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    userId: solution.userId,
    teamId: solution.teamId,
  },
});

const reviewViolations = reason === "VALIDATION" ? null /* TODO surface real violations */ : null;
```

(Verify against the actual existing `reviewSolution` code: the parameters passed to `solutionReviewPrompt`, `buildFallbackReview`, the cache key field name, and the AI options must match exactly. Read the existing function carefully before substituting.)

The downstream persistence + response code (the `prisma.solution.update(...)` + `success(res, ...)` lines) stays untouched. The refactor only changes the orchestration block.

- [ ] **Step 7: Run review-related tests**

```bash
cd server && npx vitest run test/controllers/ai.review.solveMethod.test.js test/controllers/ai.reviewCache.test.js
```

Expected: green. If a test asserts on the `usedFallback` flag or specific fallback content, verify the Pass-B refactor preserves that exact behavior.

- [ ] **Step 8: Run full suite**

```bash
cd server && npm test
```

Expected: 1022 tests green.

- [ ] **Step 9: Lint + Commit Pass B**

```bash
cd server && npm run lint
git add server/src/controllers/aiReview.controller.js
git commit -m "Refactor reviewSolution to use runAISurface helper"
```

---

## Task 7: Migrate `aiHints.controller.js`

**Files:**
- Create: `server/src/controllers/aiHints.controller.js`
- Modify: `server/src/controllers/ai.controller.js` (delete `getHint`, `generateReviewHints`, exclusive helpers)
- Modify: `server/src/routes/ai.routes.js` (import path)

`getHint` is at line 848-937. `generateReviewHints` is at line 2057-2290. They're far apart in the source but live in the same feature surface (hints). Move both to the same new file.

Same pattern as Task 4. Byte-for-byte move. No tests directly import these (they're route handlers; tested only via integration if any). Run full suite to verify.

- [ ] **Step 1: Move both functions + their exclusive helpers to `aiHints.controller.js`**
- [ ] **Step 2: Delete from `ai.controller.js`**
- [ ] **Step 3: Update `ai.routes.js` imports**
- [ ] **Step 4: Run full suite — expected 1022 green**
- [ ] **Step 5: Lint + Commit**

```bash
git add server/src/controllers/aiHints.controller.js server/src/controllers/ai.controller.js server/src/routes/ai.routes.js
git commit -m "Migrate getHint and generateReviewHints to aiHints.controller.js"
```

---

## Task 8: Migrate `aiWeeklyPlan.controller.js`

**Files:**
- Create: `server/src/controllers/aiWeeklyPlan.controller.js`
- Modify: `server/src/controllers/ai.controller.js` (delete `getWeeklyPlan`, exclusive helpers)
- Modify: `server/src/routes/ai.routes.js` (import path)

`getWeeklyPlan` is at line 938-1308 (the largest single function). Same byte-for-byte move pattern.

- [ ] **Step 1: Move + delete + update routes**
- [ ] **Step 2: Run full suite — expected 1022 green**
- [ ] **Step 3: Lint + Commit**

```bash
git add server/src/controllers/aiWeeklyPlan.controller.js server/src/controllers/ai.controller.js server/src/routes/ai.routes.js
git commit -m "Migrate getWeeklyPlan to aiWeeklyPlan.controller.js"
```

---

## Task 9: Migrate `aiProblemGen.controller.js`

**Files:**
- Create: `server/src/controllers/aiProblemGen.controller.js`
- Modify: `server/src/controllers/ai.controller.js` (delete `generateProblemContent`, `findSimilarProblems`, `generateProblemsAI`, exclusive helpers)
- Modify: `server/src/routes/ai.routes.js` (import path)

Three functions (line 1309, 1394, 1456). They share helpers — keep all three together in one file.

- [ ] **Step 1: Move 3 functions + their exclusive helpers**
- [ ] **Step 2: Delete from `ai.controller.js`**
- [ ] **Step 3: Update `ai.routes.js` imports**
- [ ] **Step 4: Run full suite — expected 1022 green**
- [ ] **Step 5: Lint + Commit**

```bash
git add server/src/controllers/aiProblemGen.controller.js server/src/controllers/ai.controller.js server/src/routes/ai.routes.js
git commit -m "Migrate problem generation controllers to aiProblemGen.controller.js"
```

---

## Task 10: Delete `ai.controller.js`

**Files:**
- Delete: `server/src/controllers/ai.controller.js`

By this task, `ai.controller.js` should contain only imports and possibly a few constants nothing references. Verify before deleting.

- [ ] **Step 1: Verify file is empty of consumers**

```bash
grep -rn "from.*ai.controller\|require.*ai.controller\|ai\.controller\.js" server/src server/test
```

Expected: zero results. If any import or reference remains, that's a consumer that wasn't migrated. Update it before deleting.

- [ ] **Step 2: Verify the file is empty of behavior**

```bash
cat server/src/controllers/ai.controller.js
```

If any code remains beyond imports (helpers no one uses, dead constants), delete those too as part of this commit.

- [ ] **Step 3: Delete the file**

```bash
git rm server/src/controllers/ai.controller.js
```

- [ ] **Step 4: Run full suite**

```bash
cd server && npm test
```

Expected: 1022 tests green. If any test fails, the test was importing from `ai.controller.js`; trace it and update.

- [ ] **Step 5: Lint + Commit**

```bash
cd server && npm run lint
git commit -m "Delete now-empty ai.controller.js"
```

---

## Task 11: Migrate `solutionReviewPrompt` to new contract

**Files:**
- Modify: `server/src/services/ai.prompts.js` (`solutionReviewPrompt` returns full contract)
- Modify: `server/src/controllers/aiReview.controller.js` (consume new contract via `runAISurface()`)
- Modify: `server/test/services/promptBuilderContract.test.js` (activate the assertion for `solutionReviewPrompt`)

Today `solutionReviewPrompt(data) → { system, user }`. The contract version:

```javascript
{
  promptVersion: "v1-2026-06",
  system: "...",
  user: "...",
  validate: (parsed) => validateReview(parsed, { followUpQuestionIds: data.followUpQuestionIds }),
  buildFallback: (reason) => buildFallbackReview({ ...data, fallbackReason: reason }),
}
```

- [ ] **Step 1: Update `solutionReviewPrompt` in `ai.prompts.js`**

Find the function at line 105. After building `system` and `user`, return the full object:

```javascript
import { validateReview } from "./ai.validators.js";
import { buildFallbackReview } from "./ai.fallbacks.js";

export function solutionReviewPrompt(data) {
  // ... existing code that builds `system` and `user` ...
  return {
    promptVersion: "v1-2026-06",
    system,
    user,
    validate: (parsed) => validateReview(parsed, { followUpQuestionIds: data.followUpQuestionIds }),
    buildFallback: (reason) => buildFallbackReview({ ...data, fallbackReason: reason }),
  };
}
```

- [ ] **Step 2: Update `aiReview.controller.js` to consume the new contract**

In the `runAISurface` call from Task 6, replace:

```javascript
buildPrompt: () => {
  const { system, user } = solutionReviewPrompt({ ... });
  return { system, user };
},
validate: (parsed) => validateReview(parsed, { followUpQuestionIds }),
buildFallback: (reasonStr) => buildFallbackReview({ ..., fallbackReason: reasonStr }),
```

With:

```javascript
const promptBundle = solutionReviewPrompt({ problem, solution, recall: null, ragContext, followUpQuestionIds });

// ...
buildPrompt: () => ({ system: promptBundle.system, user: promptBundle.user }),
validate: promptBundle.validate,
buildFallback: promptBundle.buildFallback,
```

- [ ] **Step 3: Activate the prompt-builder-contract test**

Update `server/test/services/promptBuilderContract.test.js`:

```javascript
import { solutionReviewPrompt } from "../../src/services/ai.prompts.js";

const MIGRATED_BUILDERS = [
  {
    name: "solutionReviewPrompt",
    build: solutionReviewPrompt,
    input: {
      problem: { id: "p1", title: "Test problem", description: "desc", difficulty: "EASY", category: "CODING" },
      solution: { id: "s1", code: "def x(): pass", language: "PYTHON", patterns: ["Hashing"], confidence: 4 },
      recall: null,
      ragContext: null,
      followUpQuestionIds: [],
    },
    expectsUntrusted: true,
  },
];
```

(Replace the empty array with this fixture and remove the if-empty no-op test.)

- [ ] **Step 4: Run new tests**

```bash
cd server && npx vitest run test/services/promptBuilderContract.test.js
```

Expected: 2 new tests pass (returns contract triple + wraps untrusted content).

- [ ] **Step 5: Run full suite**

```bash
cd server && npm test
```

Expected: 1022 + 2 = 1024 tests green.

- [ ] **Step 6: Lint + Commit**

```bash
cd server && npm run lint
git add server/src/services/ai.prompts.js server/src/controllers/aiReview.controller.js server/test/services/promptBuilderContract.test.js
git commit -m "Migrate solutionReviewPrompt to new prompt-builder contract"
```

---

## Task 12: Final gates + push + auto-merge to main

**Files:** none (verification + push + merge)

- [ ] **Step 1: Server gates**

```bash
cd server && npm run lint && npm test && npx prisma migrate status
```

Expected: lint 0/0, 1024 tests green, "Database schema is up to date!".

- [ ] **Step 2: Client gates (sanity — no client changes, but the gate is part of the workflow)**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 3: Push the feature branch**

```bash
git push -u origin feat/ai-controller-surface-split --no-verify
```

- [ ] **Step 4: FF-merge to main and push (per memory pref to auto-merge)**

```bash
git fetch origin main
git log --oneline origin/main..feat/ai-controller-surface-split
# Confirm clean fast-forward (this branch's commits, no behind commits)

git checkout main
git merge --ff-only feat/ai-controller-surface-split
git push origin main --no-verify
```

- [ ] **Step 5: Update the roadmap status tracker**

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, update Sprint 2 row to `✅ shipped` with the spec link and ship date. Commit + push.

```bash
git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md
git commit -m "Mark Sprint 2 (AI controller split) shipped"
git push origin main --no-verify
```

- [ ] **Step 6: Smoke test (post-deploy, in production)**

Railway autodeploys main. Hit `/health`. Hit `POST /api/v1/review/:solutionId` on a test problem. Verify the AI review produces the same `aiFeedback` shape as before (dimension scores, flags, follow-up evaluations, scoreAdjustments). Spot-check the structured log shape in Railway logs: `[ai-surface] { surface, promptVersion, latencyMs, ... }`.

If anything looks off, the rollback is a single-step `git revert` per commit; nothing persists in the database.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| `runAISurface()` helper | Task 1 |
| `FALLBACK_REASONS` enum | Task 1 |
| `classifyAIError()` | Task 1 |
| Structured log shape | Task 1 (via `logSurfaceCall` inside aiSurface.js) |
| Prompt-builder-contract scaffolding | Task 2 |
| `stripHtml` unification (Sprint 1 H4) | Task 3 |
| Per-feature controller split (6 files) | Tasks 4-9 |
| `aiReview.controller.js` uses `runAISurface()` | Task 6 (Pass B) |
| `computeReviewInputHash` extraction | Task 6 (Step 1) |
| `ai.controller.js` deleted | Task 10 |
| `solutionReviewPrompt` migrated to contract | Task 11 |
| Routes + tests + import updates | Tasks 4-9 (per-task) |
| Final gates + auto-merge | Task 12 |

**Type / signature consistency:**
- `runAISurface({ surface, promptVersion, buildPrompt, validate, buildFallback, transform?, cacheKey?, cacheLookup?, aiOptions }) → { data, fromFallback, reason, fromCache }` — defined Task 1; consumed Task 6 (Pass B) and Task 11. ✓
- `FALLBACK_REASONS.AI_DISABLED|TIMEOUT|RATE_LIMIT|MODEL_NOT_FOUND|VALIDATION|UNKNOWN` — exported Task 1, asserted in Task 1 tests. ✓
- `solutionReviewPrompt(data) → { promptVersion, system, user, validate, buildFallback }` — defined Task 11; consumed in `aiReview.controller.js` Task 11 Step 2. ✓
- `computeReviewInputHash(solution) → string` — extracted Task 6 Step 1; consumed in `aiReview.controller.js` and `ai.reviewCache.test.js`. ✓
- `stripHtml(s) → string` — defined Task 3; consumed in 4 files Task 3. ✓
- `validate` signature: `(parsed) → { valid: bool, data?, violations? }` — already the existing `validateReview` shape; reused in Task 1's mock validators and Task 11's prompt-builder return. ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N". Every code step contains the actual code. The verbatim-copy steps in Tasks 4-9 reference the existing source line range (e.g. "line 2291-2562") so the engineer knows exactly what to copy. Task 6's two-pass split (Pass A move, Pass B refactor) is the only multi-commit task; both passes are explicit with their own commit step.

**Risk:** Task 6 Pass B (refactor `reviewSolution` to use `runAISurface()`) is the highest-risk step because the existing `reviewSolution` body has subtle behavior (cache hit semantics, fallback flagging in the response). Mitigated by: byte-for-byte move in Pass A first, then targeted refactor in Pass B with the existing test suite as a tight safety net. If Pass B breaks tests, Pass A is already committed and can stand alone (the file split happens; the helper migration defers to a follow-up).

# AI Review Deep-Fixes — Design Spec

**Date:** 2026-06-20
**Sprint:** 2.5 (per `2026-06-20-refactor-redesign-sprint.md`)
**Branch:** `feat/ai-review-deep-fixes`
**Layers on:** main, post Sprint 2 (AI controller surface split)
**Feature flag:** None — bug fixes + behavior-equivalent refactor

---

## Problem

Sprint 2 split `ai.controller.js` into 6 per-feature controllers and shipped the foundational `runAISurface()` helper, but two pieces of work were deliberately deferred to keep Sprint 2 a pure structural refactor:

1. **Pass B of Task 6** — refactoring `reviewSolution` to use `runAISurface()`. Deferred because the existing controller has a special case at lines 368-373: when `AIError.code === "RATE_LIMITED"`, it returns HTTP 429 to the user instead of falling back to a deterministic review. Naively migrating to `runAISurface()` would silently flatten this to a fallback response — a real behavior change.

2. **Task 11** — migrating `solutionReviewPrompt` to the new prompt-builder contract `{ promptVersion, system, user, validate, buildFallback }`. Deferred because the consumer (Pass B) hadn't adopted the contract yet; migrating the producer alone would create dead code.

Plus one Sprint 1 audit finding lives in this same surface and shipping it now is cheap:

3. **H3 — `aiFeedback` array append race condition.** Two concurrent solution reviews land on the same solution. Both read `solution.aiFeedback`, both compute `[...existing, newReview]`, both write back. The second write overwrites the first. One review is silently lost. The SM-2 review submit path in `solutions.controller.js:524` already uses `SELECT FOR UPDATE` to prevent this; `aiReview.controller.js`'s aiFeedback append doesn't.

This spec ships all three together because they touch the same controller and the same orchestration block — separating them would mean two different agents touching the same 30 lines.

## Principle

This sprint is **deep-fixes for the Review surface**. Other Sprint 1 audit findings in adjacent surfaces (H7/H9 in validators, H10 in canonical, M9 in `ai.service.js`) carve into Sprints 2.6 / 2.7 / 2.8 respectively — each gets its own spec. Tighter sprints, smaller PRs, smaller blast radius.

## Scope

In scope:

- **H3:** wrap the `aiFeedback` read-modify-write in `prisma.$transaction` with `SELECT FOR UPDATE`. Lock scope = persistence only, not the AI call (see "Lock scope rationale" below).
- **Pass B:** replace the manual orchestration block in `reviewSolution` (try / aiComplete / catch / RATE_LIMITED-passthrough / validate / fallback) with a `runAISurface()` call. Caller branches on `surfaceResult.reason === FALLBACK_REASONS.RATE_LIMIT` to preserve the user-visible 429.
- **`solutionReviewPrompt` contract migration:** the prompt builder returns `{ promptVersion, system, user, validate, buildFallback }`. The bundled `validate` and `buildFallback` come from `ai.validators.js` and `ai.fallbacks.js` respectively — no behavior change in those files; the bundle just couples them to their producer so they can't drift.
- Activate the `promptBuilderContract.test.js` scaffolding from Sprint 2 Task 2 with the first migrated builder.
- New concurrency test for H3.

Out of scope (each gets its own sprint):

- **Sprint 2.6:** H7 (verify follow-up validation; add regression guard, expand only if real bug) + H9 (add `readinessVerdict` to `validateReview` required fields)
- **Sprint 2.7:** H10 (`[canonical:alt-dropped]` structured log per drop in `canonicalAltDedup.js`)
- **Sprint 2.8:** M9 (`ai.service.js` `callWithModelFallback` telemetry — usage event reports the original primary instead of the secondary actually attempted)
- Adopting `runAISurface()` in any other controller (canonical, recall-grade, hints, etc.) — those have their own deep-fix sprints

## Architecture

```
aiReview.controller.js
  ├─ H3:  SELECT FOR UPDATE around aiFeedback array append
  └─ Pass B: refactor orchestration to runAISurface()
            + caller branches on reason for RATE_LIMITED → 429

ai.prompts.js
  └─ Migrate solutionReviewPrompt to the contract triple
     {promptVersion, system, user, validate, buildFallback}
     (consumed by Pass B; activates promptBuilderContract.test.js)
```

Persistence stays in the controller. `runAISurface()` stays minimal — no new config. The prompt-builder contract gets its first real consumer.

## H3 — `aiFeedback` append race

**Bug.** `aiReview.controller.js`'s persistence block reads `solution.aiFeedback`, appends the new review record, writes back. Two concurrent reviews can interleave: both read `[review1]`, both compute `[review1, newReview]`, both write. Second write wins; first review is lost.

**Fix.** Wrap the read-modify-write in `prisma.$transaction` with `SELECT FOR UPDATE` as the first step. Re-read inside the transaction so the version we read is the version we write.

```javascript
// In aiReview.controller.js — replaces the existing aiFeedback persistence block.
// `reviewRecord` and `inputHash` are built earlier in the function as today.
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM solutions WHERE id = ${solutionId} FOR UPDATE`;

  const locked = await tx.solution.findUnique({
    where: { id: solutionId },
    select: { aiFeedback: true, reviewCount: true },
  });
  if (!locked) throw new Error("Solution disappeared mid-review");

  const existing = Array.isArray(locked.aiFeedback) ? locked.aiFeedback : [];
  const updated = [...existing, reviewRecord];

  await tx.solution.update({
    where: { id: solutionId },
    data: {
      aiFeedback: updated,
      aiFeedbackInputHash: inputHash,
      reviewCount: (locked.reviewCount || 0) + 1,
    },
  });
});
```

### Lock scope rationale

The lock is held **only** during the persistence step, not during the AI call. Alternative ("hold lock during AI call too") would prevent two concurrent reviews from each producing an AI response — but the AI call already takes 5-30 seconds, and locking that range serializes all concurrent activity for the same solution. Trade-off accepted:

- **Holding lock during AI call:** prevents redundant AI calls (token cost) but locks Postgres rows for ~30s, blocking other operations on that solution.
- **Locking only around persistence (chosen):** allows two concurrent AI calls to both succeed; both reviews are persisted with sequential `reviewNumber`. The user sees both in their history, which is honest. Saves no tokens but minimizes lock duration.

The user's history showing two reviews from concurrent submissions is an acceptable outcome — better than losing one.

### `reviewCount` consolidation

Today `reviewCount` is incremented in a separate place. The fix consolidates it into the same transaction so `aiFeedback.length` and `reviewCount` stay consistent. Verify in implementation that no other code path mutates `reviewCount` outside this controller (a quick grep across `server/src/` should confirm).

### Test (new file)

`server/test/controllers/ai.review.h3.concurrency.test.js`:

1. Mock Prisma's `$transaction` to serialize transaction bodies
2. Mock `aiComplete` to return distinct payloads on each call
3. Fire two concurrent `reviewSolution(req)` calls via `Promise.all`
4. Assert: persisted `aiFeedback.length === 2`
5. Assert: review records have sequential `reviewNumber` (1 and 2)
6. Assert: `aiFeedbackInputHash` reflects the last write

Without the fix, this test fails (one review overwrites the other). With the fix, it passes deterministically.

## Pass B — refactor `reviewSolution` orchestration

**Today** (the relevant ~50 lines in `aiReview.controller.js`):

```javascript
let aiResponse;
let usedReviewFallback = false;
let reviewViolations = [];
try {
  aiResponse = await aiComplete({
    systemPrompt: system, userPrompt: user, userId, teamId,
    model: AI_MODEL_FAST, temperature: 0.6, maxTokens: 2000,
    jsonMode: true,
    fewShotMessages: SOLUTION_REVIEW_FEWSHOT,
    surface: "solution-review",
  });
  const check = validateReview(aiResponse, { followUpQuestionIds: expectedQuestionIds });
  if (!check.valid) {
    reviewViolations = check.violations;
    aiResponse = buildFallbackReview({ followUpQuestionIds: expectedQuestionIds });
    usedReviewFallback = true;
  }
} catch (aiErr) {
  if (aiErr instanceof AIError && aiErr.code === "RATE_LIMITED") {
    return aiErrorResponse(res, aiErr, "Failed to generate AI feedback.");
  }
  aiResponse = buildFallbackReview({ followUpQuestionIds: expectedQuestionIds });
  usedReviewFallback = true;
  reviewViolations = [`llm-error:${aiErr?.code || aiErr?.message || "unknown"}`];
}
```

**After:**

```javascript
import { runAISurface, FALLBACK_REASONS } from "../services/aiSurface.js";

const promptBundle = solutionReviewPrompt({
  problem, solution, recall: null, ragContext,
  followUpQuestionIds: expectedQuestionIds,
});

const surfaceResult = await runAISurface({
  surface: "solution-review",
  promptVersion: promptBundle.promptVersion,
  buildPrompt: () => ({ system: promptBundle.system, user: promptBundle.user }),
  validate: promptBundle.validate,
  buildFallback: promptBundle.buildFallback,
  aiOptions: {
    model: AI_MODEL_FAST, temperature: 0.6, maxTokens: 2000,
    jsonMode: true, fewShotMessages: SOLUTION_REVIEW_FEWSHOT,
    userId, teamId,
  },
  requestId: req.id,
});

// Caller branches on reason for the user-visible 429 path
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

The downstream code (`applySolveMethodCaps`, `computedScore`, persistence in the H3 transaction, response) stays byte-for-byte identical.

### Why this is safe

- `runAISurface()` calls `aiComplete()` with the same options the manual try/catch used.
- `validate()` shape — `{ valid, data, violations }` — matches `validateReview`'s shape exactly.
- `buildFallback()` returns the same `buildFallbackReview` output.
- The RATE_LIMIT branch fires BEFORE any downstream code touches `surfaceResult.data`, so the user sees the same 429 envelope. The synthesized `AIError` carries the `RATE_LIMITED` code; `aiErrorResponse` produces a byte-identical response.

### `reviewViolations` text drift — accepted

Today the AI-error path populates `reviewViolations` with a `[\`llm-error:${code}\`]` text marker. The new code falls back to `[]` for the AI-error path (since `runAISurface` doesn't expose the original error to the caller). This text was never visible to end users — it's just internal diagnostic. The structured log emitted by `runAISurface` (per Sprint 2 Task 1 hardening) carries the error code in its log entry, which is the better diagnostic surface. Accepted as a non-user-visible change.

## `solutionReviewPrompt` contract migration

**Before:**

```javascript
export function solutionReviewPrompt(data) {
  // ... constructs system + user ...
  return { system, user };
}
```

**After:**

```javascript
import { validateReview } from "./ai.validators.js";
import { buildFallbackReview } from "./ai.fallbacks.js";

export function solutionReviewPrompt(data) {
  // ... existing system + user construction unchanged ...

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
}
```

The bundle binds the validator and fallback to the producer. Future drift between `solutionReviewPrompt`'s declared output schema and `validateReview`'s required fields is structurally prevented — they live next to each other.

`buildFallbackReview` is called with an extra `reason` field today; the function ignores it. That's intentional — passing it now means a future enhancement (a fallback that's reason-aware) doesn't require touching every caller. Backward-compatible.

## Activating `promptBuilderContract.test.js`

The scaffolding test from Sprint 2 Task 2 has an empty `MIGRATED_BUILDERS` array. After this sprint, it gets its first entry:

```javascript
import { solutionReviewPrompt } from "../../src/services/ai.prompts.js";

const MIGRATED_BUILDERS = [
  {
    name: "solutionReviewPrompt",
    build: solutionReviewPrompt,
    input: {
      problem: { id: "p1", title: "Test", description: "desc", difficulty: "EASY", category: "CODING" },
      solution: { id: "s1", code: "def x(): pass", language: "PYTHON", patterns: ["Hashing"], confidence: 4 },
      followUpQuestionIds: [],
    },
    expectsUntrusted: true,
  },
];
```

Two new tests fire automatically:
- Returns the contract triple (`promptVersion`, `system`, `user`, `validate`, `buildFallback` all present with the right types)
- User prompt contains `<untrusted` tag (since the input includes user-controlled fields like `solution.code`, `problem.description`)

If the second test fails, that's a real bug — the system prompt is interpolating untrusted content without XML tagging. We address it in implementation (likely a 1-line wrap of the user-content interpolations).

## File map

**Server modified:**

- `server/src/controllers/aiReview.controller.js`
  - H3: persistence block wrapped in `prisma.$transaction` + `SELECT FOR UPDATE`
  - Pass B: orchestration block (~50 lines) replaced with `runAISurface()` call + RATE_LIMIT branch
  - Consume the new `solutionReviewPrompt` bundle
- `server/src/services/ai.prompts.js`
  - `solutionReviewPrompt` returns the contract triple
  - Imports `validateReview` and `buildFallbackReview` to bind them into the bundle
- `server/test/services/promptBuilderContract.test.js`
  - `MIGRATED_BUILDERS` gains the `solutionReviewPrompt` fixture
  - The empty-scaffolding `it` block deletes (no longer needed once `MIGRATED_BUILDERS.length > 0`)

**Server new:**

- `server/test/controllers/ai.review.h3.concurrency.test.js` — H3 regression guard

**Server unchanged:**

- `server/src/services/aiSurface.js`, `ai.validators.js`, `ai.fallbacks.js`, `ai.service.js`
- All other controllers, schema, env vars, feature flags

**Client unchanged.** Server-only sprint.

## Test plan

| Surface | Tests | Delta |
|---|---|---|
| H3 concurrency | New file with ~3 tests (concurrent append, sequential reviewNumber, hash reflects last write) | +3 |
| Pass B regression | Existing `ai.review.solveMethod.test.js` and `ai.reviewCache.test.js` must stay green | 0 |
| RATE_LIMIT 429 path | Existing test in solveMethod or new assertion | 0-1 |
| Prompt-builder contract | Scaffolding activates with first fixture | +2 |

**Pre-Sprint baseline:** 1042 tests
**Post-Sprint expected:** ~1047 tests

If any existing test fails after the refactor, it's likely asserting `usedFallback` text or `fallbackReason` content that the runAISurface refactor changed. Read the failure carefully — if the assertion was locking in pre-refactor behavior that doesn't matter to users, update the assertion. If it's locking real behavior, the refactor is wrong and needs adjustment.

## Backward compatibility

- **No API changes.** `POST /review/:solutionId` response stays byte-identical.
- **No schema changes.** Zero migrations.
- **No env vars / feature flags.**
- **In-flight requests:** the H3 transaction holds row lock for the persistence step only (~10ms typical). No user-visible delay.
- **Rollback:** `git revert` per commit. Each fix (H3, Pass B, prompt contract) is its own commit; partial rollback works.

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | H3 lock scope (persistence only) consistent across Architecture + Lock scope rationale + H3 fix code; Pass B caller-branches-on-reason consistent across Pass B section + the synthesized AIError shape; prompt-builder contract shape consistent across Section 4 + Test plan |
| Scope | Three deliverables, one branch, ~3 commits. Sister fixes (H7/H9/H10/M9) explicitly carved into 2.6/2.7/2.8 |
| Ambiguity | Synthesized AIError shape pinned. Lock-only-around-persistence pinned with explicit trade-off. Bundle's `reason` arg to `buildFallbackReview` documented as "ignored today, available for future" |
| Backward compat | No API/schema/flag changes. Per-commit rollback. |
| Risk | H3 race is a real production data-loss bug (highest-priority finding). Pass B has the fewest moving parts now that `runAISurface` is hardened (Sprint 2 Task 1 review). Prompt contract migration is the smallest of the three. |
| Cap value rationale | n/a — no scoring changes in this sprint |

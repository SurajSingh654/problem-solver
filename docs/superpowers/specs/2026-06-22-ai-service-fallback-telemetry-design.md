# AI Service Fallback Telemetry — Design Spec

**Date:** 2026-06-22
**Sprint:** 2.8 (per `2026-06-20-refactor-redesign-sprint.md`)
**Branch:** `feat/ai-service-fallback-telemetry`
**Layers on:** main, post Sprint 2.7 (`0577224`)
**Feature flag:** None — bug fix

---

## Problem

Sprint 1 audit finding M9 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` line 156):

> `ai.service.js:161-176, 341, 349` — When secondary model also fails, telemetry still shows `modelUsed: model` (primary), not `AI_MODEL_FAST` (secondary). Telemetry inaccurate.

### Concrete failure scenario

A caller invokes `aiComplete({ model: "gpt-4o", ... })`. `callWithModelFallback` (lines 153-178) is the helper that wraps the OpenAI call and retries with `AI_MODEL_FAST` if the requested model returns 404 / `model_not_found`. Two timelines:

1. **Primary succeeds** → `aiComplete` emits a usage event with `modelUsed: "gpt-4o"`, `usedFallback: false`. Correct.
2. **Primary 404s + fast-fallback succeeds** → `aiComplete` emits `modelUsed: "gpt-4o-mini"`, `usedFallback: true`. Correct (uses the value returned from `callWithModelFallback`).
3. **Primary 404s + fast-fallback also fails** (e.g. fast-fallback hits OpenAI 5xx, network error, timeout) → the thrown error propagates to `aiComplete`'s outer catch at lines 341-356, which emits `modelUsed: model` (line 349 — the originally-requested `"gpt-4o"`) and `usedFallback: false` (line 354 — hardcoded). **This is the bug.** The actual last-attempted model was `"gpt-4o-mini"`, and a fallback WAS used.

A monitoring dashboard built on usage events would mis-attribute the failure: it would say "`gpt-4o` is unhealthy, error rate spike" when actually `gpt-4o` was unavailable (a different problem entirely — model-not-found is a config/eval issue), the fast-fallback was attempted, and the fast-fallback is the one that errored.

A symmetric problem exists on the **primary-fails-with-non-model-missing-error** path (lines 161, 176): the error is re-thrown as-is. The outer catch emits `modelUsed: model` — accidentally correct here (primary IS what was attempted), but only because both the outer catch's "always use `model`" assumption and reality agree. If `callWithModelFallback` ever grew a third fallback rung (e.g. retry with a different primary), this branch would silently break too.

The fix should annotate the thrown error with the actual last-attempted model, so the outer catch can read it without making implicit assumptions.

## Principle

This is the last carve-out of the Sprint 2.5-2.8 series (`AI feature surface deep-fixes`). After this, Sprint 3 picks up the Security + auth surface (`auth.controller.js` + `email.service.js` + `mcp/middleware/mcpAuth.js` + `designReferences.controller.js`).

This sprint is a **3-line correctness fix** plus regression tests. Pure backend, server-only, no schema/env/flag changes.

## Scope

In scope:

- Modify `callWithModelFallback` to annotate thrown errors with `err.modelUsed`. Two annotation sites:
  - Inner `try/catch` around the fast-fallback call: `fallbackErr.modelUsed = AI_MODEL_FAST` before re-throw.
  - Outer re-throw (when primary failed with a non-model-missing error): `err.modelUsed = primaryModel`.
- Modify `aiComplete`'s outer catch to read `err.modelUsed ?? model` and derive `usedFallback: modelUsed !== model`.
- Two new regression tests in the existing `aiComplete — usage emission` describe block in `server/test/ai/service.test.js`:
  1. Primary fails with non-model-missing error (e.g. 401 `INVALID_API_KEY` from `AI_MODEL_FAST` so no fallback fires) → emitted usage has `modelUsed: AI_MODEL_FAST`, `usedFallback: false`.
  2. Primary 404s with `model_not_found`, fast-fallback throws (e.g. 500) → emitted usage has `modelUsed: AI_MODEL_FAST`, `usedFallback: true`, `errorCode` set (likely `OPENAI_DOWN` for 500).

Out of scope:

- Changing `callWithModelFallback`'s signature beyond the error annotation (no new return shape, no new param, no new wrapper class).
- A custom `AIError` subclass for "fallback-also-failed". The existing `AIError` plus the `.modelUsed` annotation carries the same information without expanding the type system.
- Persistence of usage events. `ai.usageWriter.js` already subscribes to `onUsageEvent` and writes to `UsageTracking`; once telemetry is accurate, persistence follows automatically. No schema change.
- Sprint 3 — different surface.

## Architecture

```
ai.service.js
  ├── callWithModelFallback(buildRequest, primaryModel, label)
  │     ├── try primaryModel → return { response, modelUsed: primaryModel }
  │     └── catch:
  │           ├── if isModelMissing && primaryModel !== AI_MODEL_FAST:
  │           │     try AI_MODEL_FAST
  │           │       ├── success → return { response, modelUsed: AI_MODEL_FAST }
  │           │       └── catch fallbackErr:
  │           │             ├── fallbackErr.modelUsed = AI_MODEL_FAST   [NEW]
  │           │             └── throw fallbackErr
  │           └── else (re-throw primary):
  │                 ├── err.modelUsed = primaryModel                     [NEW]
  │                 └── throw err
  │
  └── aiComplete(...)
        └── outer catch:
              ├── modelUsed = err?.modelUsed ?? model                    [CHANGED]
              ├── emitUsage({
              │     ...
              │     modelUsed,                                            [was: model]
              │     usedFallback: modelUsed !== model,                    [was: false]
              │     errorCode: mapErrorToCode(err),
              │   })
              └── throw (unchanged)
```

## `callWithModelFallback` — diff sketch

**Before** (`ai.service.js:153-178`):

```javascript
async function callWithModelFallback(buildRequest, primaryModel, label = "ai") {
  const client = getClient();
  try {
    const response = await callWithRetry(
      () => client.chat.completions.create(buildRequest(primaryModel)),
      `${label}:${primaryModel}`,
    );
    return { response, modelUsed: primaryModel };
  } catch (err) {
    const code = err?.code ?? err?.error?.code ?? "";
    const status = err?.status ?? err?.response?.status;
    const isModelMissing =
      status === 404 || code === "model_not_found" || code === "model_not_available";
    if (isModelMissing && primaryModel !== AI_MODEL_FAST) {
      console.warn(
        `[AI] ${label} primary model "${primaryModel}" unavailable (${code || status}); falling back to "${AI_MODEL_FAST}"`,
      );
      const response = await callWithRetry(
        () => client.chat.completions.create(buildRequest(AI_MODEL_FAST)),
        `${label}:${AI_MODEL_FAST}-fallback`,
      );
      return { response, modelUsed: AI_MODEL_FAST };
    }
    throw err;
  }
}
```

**After**:

```javascript
async function callWithModelFallback(buildRequest, primaryModel, label = "ai") {
  const client = getClient();
  try {
    const response = await callWithRetry(
      () => client.chat.completions.create(buildRequest(primaryModel)),
      `${label}:${primaryModel}`,
    );
    return { response, modelUsed: primaryModel };
  } catch (err) {
    const code = err?.code ?? err?.error?.code ?? "";
    const status = err?.status ?? err?.response?.status;
    const isModelMissing =
      status === 404 || code === "model_not_found" || code === "model_not_available";
    if (isModelMissing && primaryModel !== AI_MODEL_FAST) {
      console.warn(
        `[AI] ${label} primary model "${primaryModel}" unavailable (${code || status}); falling back to "${AI_MODEL_FAST}"`,
      );
      try {
        const response = await callWithRetry(
          () => client.chat.completions.create(buildRequest(AI_MODEL_FAST)),
          `${label}:${AI_MODEL_FAST}-fallback`,
        );
        return { response, modelUsed: AI_MODEL_FAST };
      } catch (fallbackErr) {
        // Annotate so the outer catch in aiComplete can attribute the
        // failure to the secondary, not the primary. Without this,
        // telemetry mis-blames the primary for an outage on the fast
        // fallback rung.
        fallbackErr.modelUsed = AI_MODEL_FAST;
        throw fallbackErr;
      }
    }
    // Primary failed with a non-model-missing error — fast fallback was
    // never attempted. Annotate with primary for symmetric telemetry.
    err.modelUsed = primaryModel;
    throw err;
  }
}
```

Change set:
- Wrap fast-fallback `callWithRetry` in `try/catch`.
- On fallback failure: set `fallbackErr.modelUsed = AI_MODEL_FAST` then re-throw.
- On non-model-missing primary failure: set `err.modelUsed = primaryModel` then re-throw.

## `aiComplete` outer catch — diff sketch

**Before** (`ai.service.js:341-359`):

```javascript
} catch (err) {
  const latencyMs = Date.now() - t0;
  const code = mapErrorToCode(err);
  emitUsage({
    surface,
    userId,
    teamId,
    modelRequested: model,
    modelUsed: model,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencyMs,
    usedFallback: false,
    errorCode: code,
  });
  if (err instanceof AIError) throw err;
  throw new AIError(code, err.message || "AI request failed");
}
```

**After**:

```javascript
} catch (err) {
  const latencyMs = Date.now() - t0;
  const code = mapErrorToCode(err);
  // callWithModelFallback annotates err.modelUsed with the model that was
  // actually last-attempted (primary on direct failure, AI_MODEL_FAST on
  // fast-fallback failure). Fall back to `model` defensively in case the
  // error came from a path that doesn't go through callWithModelFallback
  // (e.g. checkRateLimit throwing RATE_LIMITED before any HTTP call).
  const modelUsed = err?.modelUsed ?? model;
  emitUsage({
    surface,
    userId,
    teamId,
    modelRequested: model,
    modelUsed,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencyMs,
    usedFallback: modelUsed !== model,
    errorCode: code,
  });
  if (err instanceof AIError) throw err;
  throw new AIError(code, err.message || "AI request failed");
}
```

Change set:
- Read `err.modelUsed` (fallback to `model`).
- Use that as `modelUsed` in emitted usage.
- Derive `usedFallback` from `modelUsed !== model` (was hardcoded `false`).

### Defensive `?? model` fallback rationale

Not every code path that throws into the outer catch comes through `callWithModelFallback`. Examples:

- `checkRateLimit` throws `RATE_LIMITED` BEFORE any HTTP call (line ~245).
- `cappedMaxTokens` clamp or `buildRequest` could (theoretically) throw before `callWithModelFallback` is reached.
- An `EMPTY_RESPONSE` / `PARSE_ERROR` thrown by the try-block AFTER `callWithModelFallback` succeeded — those errors don't have `.modelUsed` annotation since they didn't come from the helper. (`EMPTY_RESPONSE` and `PARSE_ERROR` only fire AFTER the success path, so the `modelUsed` is already known via the destructure at line 294 — but the destructured `modelUsed` is out of scope in the catch, so we can't read it there. Defensive fallback to the requested `model` is the right behavior — these errors are attribution-agnostic from the caller's perspective.)

The `?? model` fallback covers all these. Worst-case effect: `usedFallback: false` for a `RATE_LIMITED` event that legitimately had no fallback attempt — accurate.

**Note on `EMPTY_RESPONSE` / `PARSE_ERROR` post-success attribution drift**: when the helper succeeded with `AI_MODEL_FAST` (after fallback) and then the response had empty content or invalid JSON, the outer catch emits `modelUsed: model` (the requested primary), not `AI_MODEL_FAST` (the actually-served model). This is a residual inaccuracy. Fixing it would require hoisting `modelUsed` out of the try-block scope. Out of scope for this sprint — the audit's stated failure mode is the fast-fallback-also-fails case, not the empty-response-after-fast-fallback-success case. If the residual matters later, it's a one-line `let modelUsed = model` outside the try.

## Tests

### Two new tests in `server/test/ai/service.test.js` `aiComplete — usage emission` describe

Location: after the existing "emits usage with errorCode on failure" test (line 285-301).

```javascript
it('emits usage with modelUsed=AI_MODEL_FAST when primary 404s and fast-fallback also fails', async () => {
  const create = vi.fn((args) => {
    if (args.model === 'gpt-imaginary') throw new FakeApiError(404, 'model_not_found');
    // Fast-fallback (AI_MODEL_FAST) also fails — 500 from OpenAI.
    throw new FakeApiError(500, 'server_error');
  });
  _setClientForTests(mockClient(create));
  const seen = [];
  const off = onUsageEvent((e) => seen.push(e));
  try {
    await aiComplete({
      systemPrompt: 's',
      userPrompt: 'u',
      userId: nextUserId(),
      model: 'gpt-imaginary',
      surface: 'fallback-double-fail',
    }).catch(() => {});
  } finally {
    off();
  }
  expect(seen).toHaveLength(1);
  expect(seen[0].modelRequested).toBe('gpt-imaginary');
  expect(seen[0].modelUsed).toBe('gpt-4o-mini'); // AI_MODEL_FAST
  expect(seen[0].usedFallback).toBe(true);
  expect(seen[0].errorCode).toBe('OPENAI_DOWN'); // mapErrorToCode(500) → OPENAI_DOWN
});

it('emits usage with modelUsed=primary (no fallback) when primary fails with non-model-missing error', async () => {
  // 401 INVALID_API_KEY on the requested model — fast-fallback never fires.
  _setClientForTests(mockClient(() => { throw new FakeApiError(401); }));
  const seen = [];
  const off = onUsageEvent((e) => seen.push(e));
  try {
    await aiComplete({
      systemPrompt: 's',
      userPrompt: 'u',
      userId: nextUserId(),
      model: 'gpt-4o',
      surface: 'primary-non-model-missing-fail',
    }).catch(() => {});
  } finally {
    off();
  }
  expect(seen).toHaveLength(1);
  expect(seen[0].modelRequested).toBe('gpt-4o');
  expect(seen[0].modelUsed).toBe('gpt-4o');
  expect(seen[0].usedFallback).toBe(false);
  expect(seen[0].errorCode).toBe('INVALID_API_KEY');
});
```

The existing "emits usage with errorCode on failure" test at line 285 happens to default `model` (no `model` field passed, so the default `AI_MODEL_FAST` is used) — under the new code, `modelUsed` defaults to `model` which equals `AI_MODEL_FAST`. The existing test still passes (it only asserts `errorCode`, doesn't read `modelUsed`).

### Defensive existing-test verification

Verify these existing tests still pass:

- "emits usage with surface, model, tokens, latency on success" (line 231) — success path, unaffected
- "emits usage with usedFallback=true when model fallback fired" (line 260) — success path after fallback, unaffected (returns `modelUsed: AI_MODEL_FAST` from helper as before)
- "emits usage with errorCode on failure" (line 285) — error path with `AI_MODEL_FAST` as requested model → annotated err.modelUsed === AI_MODEL_FAST === model → `usedFallback: false`. Still asserts `errorCode: INVALID_API_KEY`. Passes.

## File map

**Server modified:**

- `server/src/services/ai.service.js`
  - `callWithModelFallback`: wrap fast-fallback in inner try/catch; annotate `fallbackErr.modelUsed = AI_MODEL_FAST`; annotate `err.modelUsed = primaryModel` on the outer re-throw.
  - `aiComplete` outer catch: derive `modelUsed` from `err.modelUsed ?? model`; derive `usedFallback` from `modelUsed !== model`.

**Server modified (tests):**

- `server/test/ai/service.test.js`
  - Add two tests to the existing `aiComplete — usage emission` describe block.

**Server unchanged:**

- All other ai.service.js code paths (streaming, retry, embedder, etc.)
- Validators, fallbacks, prompts, controllers
- Schema, env, feature flags

**Client unchanged.** Server-only sprint.

## Test plan

| Surface | Tests | Delta |
|---|---|---|
| Primary + fast-fallback both fail | 1 new (modelUsed=AI_MODEL_FAST, usedFallback=true, errorCode=OPENAI_DOWN) | +1 |
| Primary fails non-model-missing | 1 new (modelUsed=primary, usedFallback=false, errorCode=INVALID_API_KEY) | +1 |
| Existing success / fallback-success / error-AI_MODEL_FAST | unchanged behavior | 0 |

**Pre-Sprint baseline:** 1063 tests
**Post-Sprint expected:** 1065 tests

If any existing test fails, it's likely asserting `modelUsed === model` on a path where the annotation now disagrees. Read the failure carefully — if the assertion is right (the test was about that specific code path), update only if the new behavior is correct. The two existing fallback-success / errorCode-on-failure tests should pass unchanged because they don't read `modelUsed` and `usedFallback` in incompatible ways.

## Backward compatibility

- **No API changes.** Caller-facing behavior unchanged. AIError thrown shape unchanged.
- **No schema changes.** UsageTracking schema already has `modelUsed` (string) and `usedFallback` (boolean) columns; values are now more accurate.
- **No env vars / feature flags.**
- **`ai.usageWriter.js` subscriber:** continues to receive events of the same shape; field VALUES are now more accurate. Historical UsageTracking rows from before this fix carry the old incorrect attribution — that's a one-time backfill question for the team if dashboards span the boundary. Not part of this sprint.
- **Mutated thrown errors:** standard Node.js / JS pattern (e.g. Node core's `code` / `errno` / `syscall` mutations). Downstream consumers that read `err.code` / `err.message` are unaffected.
- **Rollback:** `git revert` the single commit.

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | The `.modelUsed` annotation is set in two places in `callWithModelFallback` and read in one place in `aiComplete`'s outer catch. The defensive `?? model` fallback handles non-helper code paths (rate limit, post-success errors) — explicitly documented under "Defensive `?? model` fallback rationale". |
| Scope | One file, one helper + one catch block, two new tests, single commit. Sister fixes already shipped (H3 / Pass B / H7 / H9 / H10 in Sprints 2.5-2.7). |
| Ambiguity | The annotation mutates the thrown error in-place (standard JS pattern, not a wrapper class). The test fixture uses `'gpt-4o-mini'` as the expected `modelUsed` because that's `AI_MODEL_FAST`'s default value from env. If `AI_MODEL_FAST` is overridden via env in CI, the test will fail correctly — that's the right signal. |
| Backward compat | No API/schema/flag changes. Per-commit rollback. UsageTracking historical attribution noted as a separate concern. |
| Risk | Lowest of the 2.5/2.6/2.7/2.8 series. Pure 6-line correctness fix in two adjacent functions. The only surprise risk is the residual `EMPTY_RESPONSE` / `PARSE_ERROR` post-success-fallback attribution drift (documented as out of scope; one-line `let modelUsed = model` hoist would fix it if it ever matters). |
| Cap value rationale | n/a — no scoring changes |

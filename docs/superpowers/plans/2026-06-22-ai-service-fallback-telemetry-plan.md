# Sprint 2.8 — AI Service Fallback Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix telemetry misattribution in `aiComplete`'s error path — when `callWithModelFallback` retries with `AI_MODEL_FAST` and that retry also fails, the emitted usage event now reports `modelUsed: AI_MODEL_FAST` and `usedFallback: true` (was: `modelUsed: model`, `usedFallback: false`).

**Architecture:** `callWithModelFallback` annotates thrown errors with `err.modelUsed` so the outer catch in `aiComplete` can read the actual last-attempted model. Standard JS pattern (mutating thrown errors with diagnostic properties — matches Node core's `err.code` / `err.errno` style). Defensive `?? model` fallback in the outer catch handles non-helper code paths (rate limit, post-success errors).

**Tech Stack:** Node 20, Express 4, vitest. No new dependencies. No schema migrations. No env vars. No feature flags. Single source file + single test file.

---

## File map

**Server modified:**
- `server/src/services/ai.service.js`
  - `callWithModelFallback` (lines 153-178): wrap fast-fallback `callWithRetry` in inner try/catch; annotate `fallbackErr.modelUsed = AI_MODEL_FAST`; annotate `err.modelUsed = primaryModel` on the outer re-throw of primary errors
  - `aiComplete` outer catch (lines 341-359): derive `modelUsed = err?.modelUsed ?? model`; derive `usedFallback: modelUsed !== model`

**Server modified (tests):**
- `server/test/ai/service.test.js`
  - Add 2 tests to the existing `aiComplete — usage emission` describe block (after line 301)

**Server unchanged:**
- All other code paths (streaming `aiStream`, retry `callWithRetry`, rate-limiter, embedder, etc.)
- Validators, fallbacks, prompts, controllers
- Schema, env, feature flags

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers both helper change + outer catch change + 2 new tests (cohesive fix; splitting leaves intermediate state mid-correct).
- TDD: write tests first (RED), apply fix (GREEN), confirm full suite.
- Lint must end 0 errors / 0 warnings.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
```

Expected: `Test Files  54 passed (54)` and `Tests  1063 passed (1063)`. (Post-Sprint-2.7 baseline.) If different, stop and investigate.

---

## Task 1: M9 — Annotate thrown errors with `modelUsed` (TDD)

**Files:**
- Modify: `server/src/services/ai.service.js` (lines ~153-178 and ~341-359)
- Modify: `server/test/ai/service.test.js` (add 2 tests after line 301)

### Sub-task 1a: Write the failing tests (RED)

- [ ] **Step 1: Add the two new tests**

Open `server/test/ai/service.test.js`. Find the existing test "emits usage with errorCode on failure" (around line 285). The describe block `aiComplete — usage emission` closes at around line 302 with `})`. Add the two new tests IMMEDIATELY BEFORE the closing `})` of the describe block:

```javascript
    it('emits usage with modelUsed=AI_MODEL_FAST when primary 404s and fast-fallback also fails', async () => {
        // Primary "gpt-imaginary" returns 404 model_not_found → fast-fallback
        // attempts AI_MODEL_FAST ("gpt-4o-mini"), which also fails (500). The
        // emitted usage event must attribute the failure to AI_MODEL_FAST,
        // not the originally-requested primary. Pre-fix: modelUsed === "gpt-imaginary",
        // usedFallback === false (telemetry incorrectly blames the primary).
        const create = vi.fn((args) => {
            if (args.model === 'gpt-imaginary') throw new FakeApiError(404, 'model_not_found')
            // Fast-fallback (AI_MODEL_FAST) also fails — 500 from OpenAI.
            throw new FakeApiError(500, 'server_error')
        })
        _setClientForTests(mockClient(create))
        const seen = []
        const off = onUsageEvent((e) => seen.push(e))
        try {
            await aiComplete({
                systemPrompt: 's',
                userPrompt: 'u',
                userId: nextUserId(),
                model: 'gpt-imaginary',
                surface: 'fallback-double-fail',
            }).catch(() => {})
        } finally {
            off()
        }
        expect(seen).toHaveLength(1)
        expect(seen[0].modelRequested).toBe('gpt-imaginary')
        expect(seen[0].modelUsed).toBe('gpt-4o-mini')
        expect(seen[0].usedFallback).toBe(true)
        expect(seen[0].errorCode).toBe('OPENAI_DOWN')
    })

    it('emits usage with modelUsed=primary (no fallback) when primary fails with non-model-missing error', async () => {
        // Requesting "gpt-4o" with a 401 INVALID_API_KEY response — fast-fallback
        // never fires (401 is not "model not found"). Annotated err.modelUsed must
        // be "gpt-4o" so telemetry correctly attributes the failure to the primary.
        _setClientForTests(mockClient(() => { throw new FakeApiError(401) }))
        const seen = []
        const off = onUsageEvent((e) => seen.push(e))
        try {
            await aiComplete({
                systemPrompt: 's',
                userPrompt: 'u',
                userId: nextUserId(),
                model: 'gpt-4o',
                surface: 'primary-non-model-missing-fail',
            }).catch(() => {})
        } finally {
            off()
        }
        expect(seen).toHaveLength(1)
        expect(seen[0].modelRequested).toBe('gpt-4o')
        expect(seen[0].modelUsed).toBe('gpt-4o')
        expect(seen[0].usedFallback).toBe(false)
        expect(seen[0].errorCode).toBe('INVALID_API_KEY')
    })
```

Both tests use the existing helpers from the file (`FakeApiError`, `mockClient`, `_setClientForTests`, `onUsageEvent`, `nextUserId`) — no new test infrastructure needed.

- [ ] **Step 2: Run only the new tests, expect FAIL**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/service.test.js -t "fallback-double-fail\|primary-non-model-missing-fail" 2>&1 | tail -40
```

Expected: 2 tests fail.

For the FIRST test (double-fail), the failure should be:
- `expected seen[0].modelUsed to be "gpt-4o-mini" but received "gpt-imaginary"`
- AND `expected seen[0].usedFallback to be true but received false`

For the SECOND test (primary non-model-missing), it should ACTUALLY PASS already today because the pre-existing code emits `modelUsed: model` which equals `"gpt-4o"` — accidentally correct. We add this test anyway as a regression guard so a future refactor of the outer catch can't silently break the primary-attribution path. If it passes immediately, that's fine — it's still a valuable lock-in.

Document the actual failure modes you observe.

### Sub-task 1b: Apply the fix (GREEN)

- [ ] **Step 3: Modify `callWithModelFallback` to annotate errors**

Open `server/src/services/ai.service.js`. Find `callWithModelFallback` (around line 153). Today it reads:

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

Replace the entire function with:

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
                // Annotate so aiComplete's outer catch can attribute the
                // failure to the secondary (AI_MODEL_FAST), not the primary.
                // Standard JS pattern — mirrors Node core's err.code / errno.
                fallbackErr.modelUsed = AI_MODEL_FAST;
                throw fallbackErr;
            }
        }
        // Primary failed with a non-model-missing error — fast fallback was
        // never attempted. Annotate symmetrically so telemetry is consistent.
        err.modelUsed = primaryModel;
        throw err;
    }
}
```

Change summary:
- Inner `try/catch` wraps the fast-fallback `callWithRetry` call
- `fallbackErr.modelUsed = AI_MODEL_FAST` before re-throwing
- `err.modelUsed = primaryModel` on the outer re-throw path

- [ ] **Step 4: Modify `aiComplete`'s outer catch to read the annotation**

In the same file, find `aiComplete`'s outer catch (around line 341). Today it reads:

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

Replace with:

```javascript
    } catch (err) {
        const latencyMs = Date.now() - t0;
        const code = mapErrorToCode(err);
        // callWithModelFallback annotates err.modelUsed with the model that
        // was actually last-attempted (primary on direct failure, AI_MODEL_FAST
        // on fast-fallback failure). Defensive ?? model fallback handles paths
        // that don't go through the helper (e.g. checkRateLimit throwing
        // RATE_LIMITED before any HTTP call).
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

Change summary:
- New `const modelUsed = err?.modelUsed ?? model;` line
- `modelUsed: model` → `modelUsed,` (use the derived variable)
- `usedFallback: false` → `usedFallback: modelUsed !== model,` (derive)

- [ ] **Step 5: Run the two new tests, expect PASS**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/service.test.js -t "fallback-double-fail\|primary-non-model-missing-fail" 2>&1 | tail -20
```

Expected: 2/2 pass.

- [ ] **Step 6: Run the full `service.test.js` to confirm no existing-test regressions**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/service.test.js 2>&1 | tail -10
```

Expected: all existing tests + 2 new pass.

Three existing tests in the `aiComplete — usage emission` describe block to spot-check:

1. **"emits usage with surface, model, tokens, latency on success"** (line 231) — success path. Unaffected by error-catch changes. Stays green.
2. **"emits usage with usedFallback=true when model fallback fired"** (line 260) — success path AFTER successful fallback (primary 404 → fast-fallback succeeds). The destructure `{ response, modelUsed }` at line 294 still produces `modelUsed: AI_MODEL_FAST`. Stays green.
3. **"emits usage with errorCode on failure"** (line 285) — error path with `model` defaulted to `AI_MODEL_FAST` (no `model` field in the test call). Annotated `err.modelUsed === AI_MODEL_FAST === model` → `usedFallback: false`. The test only asserts `errorCode === 'INVALID_API_KEY'`. Stays green.

If any of these fail, read the failure carefully — the fix should be byte-compatible with success paths and the third test's assertions.

- [ ] **Step 7: Run the full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -10
```

Expected: **1065 tests** passing (1063 baseline + 2 new).

If any other test file fails, it's likely asserting on `modelUsed` / `usedFallback` from an error path that the fix now correctly attributes. Read the failure:
- If the test was locking in the OLD (incorrect) behavior, update the assertion to match the new (correct) behavior.
- If the test asserts on `modelUsed === model` on a path that legitimately uses primary, the fix should preserve that — the annotation is set to `primaryModel` for primary-fail paths.

- [ ] **Step 8: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -10
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 9: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/services/ai.service.js server/test/ai/service.test.js && git commit -m "Attribute AI usage events to the model actually last-attempted on fallback failure"
```

Single-line subject. NO Co-Authored-By trailer.

- [ ] **Step 10: Self-review the diff**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD
```

Confirm:
- `ai.service.js`: `callWithModelFallback` has the inner try/catch around the fast-fallback call; both error paths annotate `.modelUsed`. `aiComplete` outer catch derives `modelUsed` from `err.modelUsed ?? model` and `usedFallback` from `modelUsed !== model`.
- `service.test.js`: 2 new `it` blocks immediately before the closing `})` of the `aiComplete — usage emission` describe.
- No other files modified.

---

## Task 2: Final gates + push + auto-merge

**Files:** none (verification + push + merge)

- [ ] **Step 1: Server gates**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test && npx prisma migrate status 2>&1 | grep -i "up to date\|drift\|error" | tail -5
```

Expected:
- Lint: 0 errors / 0 warnings
- Tests: 1065 passed
- Migrate status: "Database schema is up to date!"

- [ ] **Step 2: Client gates (sanity, no client changes)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build 2>&1 | tail -5
```

Expected: 0 warnings, successful build.

- [ ] **Step 3: Push the feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/ai-service-fallback-telemetry --no-verify
```

The pre-push gate trips on the same client `npm audit` warning as prior sprints; bypass per established workflow.

- [ ] **Step 4: FF-merge to main and push**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/ai-service-fallback-telemetry
# Confirm clean fast-forward (this branch's commits, no behind commits)

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/ai-service-fallback-telemetry
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

- [ ] **Step 5: Update the roadmap status tracker**

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 2.8 row:

```markdown
| 2.8 | ai.service.js M9 (callWithModelFallback usage event reports actual attempted model) | queued | — | — |
```

Change to:

```markdown
| 2.8 | ai.service.js M9 (callWithModelFallback annotates errors with modelUsed; aiComplete outer catch reports actual attempted model) | ✅ shipped | [`2026-06-22-ai-service-fallback-telemetry-design.md`](../specs/2026-06-22-ai-service-fallback-telemetry-design.md) | 2026-06-22 |
```

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 2.8 (AI service fallback telemetry) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

- [ ] **Step 6: Manual smoke (post-deploy)**

Railway autodeploys main. In production:

- [ ] Tail Railway server logs and confirm `[AI] usage surface=... model=... ...` lines continue to appear on normal AI calls (existing behavior preserved).
- [ ] If `UsageTracking` rows are queryable (super-admin tool or DB shell), verify recent rows show `modelUsed` reflecting actual attempted models, not always-primary.
- [ ] No 500 / 429 / latency regressions on any AI surface.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| `callWithModelFallback` annotates `fallbackErr.modelUsed = AI_MODEL_FAST` | Task 1 Sub-task 1b Step 3 |
| `callWithModelFallback` annotates `err.modelUsed = primaryModel` on outer re-throw | Task 1 Sub-task 1b Step 3 |
| `aiComplete` outer catch derives `modelUsed` from `err.modelUsed ?? model` | Task 1 Sub-task 1b Step 4 |
| `aiComplete` outer catch derives `usedFallback` from `modelUsed !== model` | Task 1 Sub-task 1b Step 4 |
| Defensive `?? model` fallback for non-helper paths | Task 1 Sub-task 1b Step 4 (`err?.modelUsed ?? model`) |
| Test: primary + fast-fallback both fail → `modelUsed === AI_MODEL_FAST`, `usedFallback === true`, `errorCode === OPENAI_DOWN` | Task 1 Sub-task 1a Step 1 (test 1) |
| Test: primary fails non-model-missing → `modelUsed === primary`, `usedFallback === false` | Task 1 Sub-task 1a Step 1 (test 2) |
| Existing tests stay green | Task 1 Sub-task 1b Step 6 (spot-check three) |
| Single commit | Task 1 Sub-task 1b Step 9 |
| No prompt / fallback / schema / env / flag changes | Task 1 only modifies `ai.service.js` + `service.test.js` |
| Final gates + push + auto-merge | Task 2 |

**Type / signature consistency:**

- `callWithModelFallback(buildRequest, primaryModel, label) → { response, modelUsed }` on success, throws Error with `.modelUsed` annotation on failure. Signature unchanged; new behavior is the annotation.
- `err.modelUsed` annotation is a string equal to either `primaryModel` (when primary fails directly) or `AI_MODEL_FAST` (when fast-fallback fails). Read as `err?.modelUsed ?? model` in `aiComplete`'s outer catch.
- `emitUsage(payload)` shape unchanged; `modelUsed` and `usedFallback` fields now have accurate values on the error path.

**Placeholder scan:** No "TBD" / "TODO" / "fill in details". Every code step contains the full code block to write or replace. Each test step shows the exact assertions.

**Risk floor:** Lowest of the 2.5/2.6/2.7/2.8 series. Single file, ~6-line correctness fix in two adjacent functions, 2 new regression tests. The defensive `?? model` fallback explicitly handles all non-helper code paths, so no existing behavior changes outside the targeted error path.

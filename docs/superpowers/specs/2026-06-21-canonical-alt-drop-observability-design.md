# Canonical Alternatives Drop Observability — Design Spec

**Date:** 2026-06-21
**Sprint:** 2.7 (per `2026-06-20-refactor-redesign-sprint.md`)
**Branch:** `feat/canonical-alt-drop-observability`
**Layers on:** main, post Sprint 2.6 (`c4b816f`)
**Feature flag:** None — observability fix + DRY refactor

---

## Problem

Sprint 1 audit finding H10 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` lines 112-114):

> **Issue:** `validateCanonicalAnswer` calls `dedupAndCapAlternatives` which removes invalid/duplicate items. The function returns success without signaling that items were dropped. Admin sees fewer alternatives than AI generated, no warning.

The drop pipeline runs in two places that duplicate the logic verbatim:

1. **`validateCanonicalAnswer`** (`server/src/services/ai.validators.js:1559-1572`) — used by `generateCanonicalAnswer` (initial canonical generation, surface `canonical-generate`).
2. **`augmentCanonicalAlternatives`** (`server/src/controllers/aiCanonical.controller.js:192-204`) — used as the legacy backfill path that augments an existing canonical with alternatives, surface `canonical-augment`.

Both run:

```javascript
const validatedAlts = rawAlts
  .map((alt) => alt?.pattern === primary.pattern
    ? validateAlternativeAllowingPrimaryPattern(alt)  // Zod (relaxed)
    : validateCanonicalAlternative(alt))               // Zod (strict)
  .filter((a) => a !== null);                          // Drop A: Zod-invalid

return dedupAndCapAlternatives(validatedAlts, primary); // Drops B-E
```

`dedupAndCapAlternatives` (`server/src/utils/canonicalAltDedup.js`) drops items in four categories:

- **B — equals-primary**: same `(pattern, timeComplexity, spaceComplexity)` tuple as primary
- **C — dup-name**: duplicate of an earlier alt's `name` (keeps first)
- **D — dup-tuple**: duplicate of an earlier alt's tuple
- **E — over-cap**: beyond `MAX_ALTERNATIVES = 3`

Admin sees the survivors. AI generated N items; admin sees ≤3. No log line distinguishes "AI generated 5 valid items, capped at 3" from "AI generated 5, two were Zod-invalid, capped at 3" from "AI generated 3, two were dup-name". Debugging "why is this canonical missing the alternative I expected?" requires re-running the prompt against the AI — no historical record.

The audit's prescription: "structured log per drop" — a `[canonical:alt-dropped]` log line with `surface`, `problemId`, `reason`, and identifying info per dropped item.

## Principle

This is a **deep-fix on the canonical-alternatives validation surface** that bundles the H10 observability fix with a DRY refactor. The two callers duplicate ~12 lines verbatim; centralising the pipeline removes the duplication and gives us a single place to land the drop logging. Sprint principle is "audit + refine + fix + remove + add" — refactor is in scope.

Sister findings carved into separate sprints (per user's "break it down, focus individually"):

- **Sprint 2.8:** M9 (`ai.service.js` `callWithModelFallback` telemetry — separate file)

## Scope

In scope:

- **Refactor:** extract a single `processAlternatives(rawAlts, primary, { problemId, surface })` helper exported from `ai.validators.js`. Runs the full pipeline (Zod-validate each item → dedup → cap), emits a `[canonical:alt-dropped]` `console.warn` log line per drop with reason and identifying info, returns the survivor array.
- **Helper signature change:** `dedupAndCapAlternatives(input, primary)` returns `{ kept, dropped }` instead of `kept[]`. Each `dropped` entry is `{ item, reason }`. The new orchestrator adds `{ item, reason: "zod-invalid" }` entries from its own per-item Zod step.
- **Caller updates:**
  - `validateCanonicalAnswer(parsed, { problemId, surface } = {})` — adds optional ctx arg, threads to `processAlternatives`. The default `surface` when ctx is omitted is `"canonical-generate"` (the only production caller).
  - `augmentCanonicalAlternatives` — calls `processAlternatives(rawAlts, primary, { problemId: problem.id, surface: "canonical-augment" })` instead of the inline pipeline.
- **Tests:**
  - New `server/test/services/processAlternatives.test.js` — ~6 tests covering each drop reason + happy path + log-line shape (vitest `vi.spyOn(console, "warn")`).
  - Update `server/test/utils/canonicalAltDedup.test.js` — destructure `{ kept }` from return (5 existing tests).

Out of scope:

- **Aggregated end-of-call summary log** instead of per-drop. The audit asked for "structured log per drop" verbatim — per-drop matches.
- **Persisting drop history to a `CanonicalAltDrop` Prisma table** for admin tooling / dashboards. YAGNI; logs flow to Railway logs and are queryable there. If admins later need a UI, that's a separate sprint.
- **Modifying `validateCanonicalAlternative` / `validateAlternativeAllowingPrimaryPattern`** themselves. They stay pure Zod.
- **Sprint 2.8** (M9) — different file.

## Architecture

```
ai.validators.js
  ├── validateCanonicalAlternative(parsed)             [unchanged]
  ├── validateAlternativeAllowingPrimaryPattern(parsed) [unchanged]
  ├── processAlternatives(rawAlts, primary, ctx)       [NEW — orchestrator]
  │     ├── per-item Zod (drops collected as zod-invalid)
  │     ├── calls dedupAndCapAlternatives → {kept, dropped}
  │     ├── emits console.warn("[canonical:alt-dropped] ...") per drop
  │     └── returns kept[]
  └── validateCanonicalAnswer(parsed, ctx)             [calls processAlternatives]

canonicalAltDedup.js
  └── dedupAndCapAlternatives(input, primary)          [returns {kept, dropped}]

aiCanonical.controller.js
  ├── generateCanonicalAnswer(problem, ...)            [calls validateCanonicalAnswer with ctx]
  └── augmentCanonicalAlternatives(problem, primary, ...) [calls processAlternatives directly]
```

## Helper signatures

### `dedupAndCapAlternatives` (signature change)

```javascript
/**
 * @param {Array} input  — array of pre-Zod-validated alternative objects
 * @param {Object} primary — the canonical primary, used for equals-primary check
 * @returns {{ kept: Array, dropped: Array<{ item, reason }> }}
 *   reason ∈ "equals-primary" | "dup-name" | "dup-tuple" | "over-cap"
 */
export function dedupAndCapAlternatives(input, primary)
```

Behavior preserved:
- Non-array `input` → `{ kept: [], dropped: [] }` (was `[]`)
- Drops items identical to primary in tuple → `reason: "equals-primary"`
- Drops items with duplicate `name` (keeps first) → `reason: "dup-name"`
- Drops items with duplicate tuple (keeps first) → `reason: "dup-tuple"`
- Drops anything past index 2 (cap = 3) → `reason: "over-cap"`

### `processAlternatives` (new export from `ai.validators.js`)

```javascript
/**
 * Validate, dedup, and cap canonical alternatives, emitting a structured
 * log line per drop so admin/debug tooling can trace why an alternative
 * was rejected.
 *
 * @param {Array} rawAlts  — raw alternatives array from AI output
 * @param {Object} primary — canonical primary (validated upstream)
 * @param {Object} ctx
 * @param {string|null} [ctx.problemId] — for log correlation; omit when unknown
 * @param {string} ctx.surface — "canonical-generate" | "canonical-augment"
 * @returns {Array} survivor alternatives (validated, deduped, capped at 3)
 */
export function processAlternatives(rawAlts, primary, { problemId = null, surface })
```

### `validateCanonicalAnswer` (signature change — backward-compatible)

```javascript
export function validateCanonicalAnswer(parsed, { problemId = null, surface = "canonical-generate" } = {})
```

The default `surface` value preserves existing call-site compatibility. Test fixtures that call `validateCanonicalAnswer(parsed)` without ctx continue to work; logs default to `surface=canonical-generate`.

## Log line shape

```
[canonical:alt-dropped] surface=canonical-generate problemId=cm123abc reason=zod-invalid name="Memoized" pattern="Dynamic Programming"
```

Format details:
- Single line per drop. No JSON — matches existing `[patterns:custom]` / `[sourceLists:custom]` style.
- `surface=...` always present.
- `problemId=...` omitted entirely (not even `problemId=null`) when context didn't include it.
- `reason=...` always present, one of five values.
- `name="..."` and `pattern="..."` always present; fall back to `"?"` when the dropped item is non-object or missing those keys (so the line is grep-uniform).
- Quotes around `name` and `pattern` so values containing whitespace are visually delimited; values themselves don't escape — `xmlEscape` is overkill for log lines, and any `"` in them will be visually awkward but not malformed (no parser consumes this format).

Rationale for `console.warn` over `console.log`: drops are a degraded outcome (we expected N alternatives, got fewer); they should ride the same severity tier as other validate-or-fallback warnings (`[notes.related] LLM output rejected: ...`).

## Tests

### `server/test/services/processAlternatives.test.js` (new)

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processAlternatives } from "../../src/services/ai.validators.js";

const primary = {
  pattern: "Dynamic Programming",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

const VALID_ALT = {
  name: "Memoized",
  pattern: "Recursion",
  keyInsight: "trade space for time",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
};

describe("processAlternatives", () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns valid alternatives unchanged when no drops", () => {
    const result = processAlternatives([VALID_ALT], primary, { surface: "canonical-generate" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Memoized");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs zod-invalid drop with reason", () => {
    processAlternatives([{ name: "bad", pattern: "x" /* missing fields */ }], primary, {
      surface: "canonical-generate",
      problemId: "p1",
    });
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0];
    expect(msg).toContain("[canonical:alt-dropped]");
    expect(msg).toContain("surface=canonical-generate");
    expect(msg).toContain("problemId=p1");
    expect(msg).toContain("reason=zod-invalid");
  });

  it("logs equals-primary drop with reason", () => {
    const altSameAsPrimary = {
      name: "Twin",
      pattern: "Dynamic Programming",
      keyInsight: "x",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    };
    processAlternatives([altSameAsPrimary], primary, { surface: "canonical-augment" });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("reason=equals-primary");
  });

  it("logs dup-name drop", () => {
    processAlternatives([VALID_ALT, { ...VALID_ALT, pattern: "Greedy" }], primary, {
      surface: "canonical-generate",
    });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("reason=dup-name");
  });

  it("logs over-cap drops when more than 3 valid alts", () => {
    const alts = [
      { ...VALID_ALT, name: "A", spaceComplexity: "O(1)" },
      { ...VALID_ALT, name: "B", spaceComplexity: "O(n)" },
      { ...VALID_ALT, name: "C", spaceComplexity: "O(log n)" },
      { ...VALID_ALT, name: "D", spaceComplexity: "O(n^2)" },
    ];
    const result = processAlternatives(alts, primary, { surface: "canonical-augment" });
    expect(result).toHaveLength(3);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("reason=over-cap");
  });

  it("emits one log line per drop (not aggregated)", () => {
    const alts = [
      { name: "bad1" /* zod-invalid */ },
      { name: "bad2" /* zod-invalid */ },
    ];
    processAlternatives(alts, primary, { surface: "canonical-generate" });
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("omits problemId from log when context didn't include it", () => {
    processAlternatives([{ name: "bad" }], primary, { surface: "canonical-generate" });
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0];
    expect(msg).not.toContain("problemId=");
  });
});
```

### `server/test/utils/canonicalAltDedup.test.js` (signature update)

Existing 5 tests destructure `{ kept }` from the return. New test added confirming `dropped` entries carry the right reason:

```javascript
it("returns dropped entries tagged with reason", () => {
  const alts = [
    { name: "Same", pattern: "Dynamic Programming", keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(1)" }, // equals-primary
    { name: "First", pattern: "Greedy", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    { name: "First", pattern: "BFS", keyInsight: "z", timeComplexity: "O(V+E)", spaceComplexity: "O(V)" }, // dup-name
  ];
  const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
  expect(kept).toHaveLength(1);
  expect(dropped).toHaveLength(2);
  expect(dropped.map((d) => d.reason).sort()).toEqual(["dup-name", "equals-primary"]);
});
```

## File map

**Server modified:**

- `server/src/utils/canonicalAltDedup.js` — return `{ kept, dropped }`, where each `dropped` is `{ item, reason }`
- `server/src/services/ai.validators.js` — add `processAlternatives` export; `validateCanonicalAnswer` accepts and forwards ctx
- `server/src/controllers/aiCanonical.controller.js` — `augmentCanonicalAlternatives` calls `processAlternatives` instead of the inline pipeline; `generateCanonicalAnswer` passes `{ problemId: problem.id, surface: "canonical-generate" }` to `validateCanonicalAnswer`

**Server new:**

- `server/test/services/processAlternatives.test.js` — ~7 tests

**Server modified (tests):**

- `server/test/utils/canonicalAltDedup.test.js` — 5 existing tests destructure `{ kept }`, plus 1 new test for `dropped` tagging

**Server unchanged:**

- `ai.prompts.js`, `ai.fallbacks.js`, `ai.service.js`, `aiSurface.js`
- All other controllers, schema, env, feature flags
- `validateCanonicalAlternative`, `validateAlternativeAllowingPrimaryPattern` — pure Zod, no change

**Client unchanged.** Server-only sprint.

## Test plan

| Surface | Tests | Delta |
|---|---|---|
| `processAlternatives` (new file) | 7 new (each drop reason + happy path + multi-drop + omit-problemId) | +7 |
| `canonicalAltDedup` existing | 5 updated to destructure `{ kept }`; 1 new for `dropped` tagging | +1 |
| `validateCanonicalAnswer` existing | unchanged behavior; if any test asserted dropped-alt count, it stays green (the helper still drops them) | 0 |
| `augmentCanonicalAlternatives` controller tests | unchanged — same return type (array of survivors) | 0 |

**Pre-Sprint baseline:** 1052 tests
**Post-Sprint expected:** 1060 tests

If existing controller tests fail because they assert on stdout/console output, those tests were tightly coupled to the old un-instrumented behavior. Update them to use `vi.spyOn(console, "warn")` if they need to assert on the new log lines, or leave the spy untouched if the test is about return values.

## Backward compatibility

- **No API changes.** Generate-canonical and augment-canonical endpoints return the same survivor-array shape.
- **No schema changes.** Zero migrations.
- **No env vars / feature flags.**
- **In-flight requests:** the new logging path is synchronous `console.warn`. Negligible latency impact.
- **Log volume:** in steady state, drops are rare (Zod-valid AI output usually deduped to ≤3). Worst case: AI returns 5 invalid items → 5 log lines. Bounded by AI output size + cap = small.
- **Rollback:** `git revert` per commit. Single commit covers the refactor + observability.

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | The drop-reason vocabulary (`zod-invalid` / `equals-primary` / `dup-name` / `dup-tuple` / `over-cap`) is consistent across the spec, log shape, and tests. `dedupAndCapAlternatives` return signature change is consistent across architecture, helper signatures, and tests. |
| Scope | One refactor + one observability fix in one commit. Sister fix M9 carved into 2.8. |
| Ambiguity | Log line shape is fully pinned (what fields appear, what `?` fallback looks like, when `problemId=` is omitted). `processAlternatives` ctx arg is required in scope; callers MUST pass `surface`. The default `surface="canonical-generate"` on `validateCanonicalAnswer` exists ONLY to keep test fixtures backward-compatible — production callers always pass it explicitly. |
| Backward compat | No API/schema/flag changes. Per-commit rollback. |
| Risk | Low. Pure refactor + log emission. The signature change on `dedupAndCapAlternatives` could theoretically surprise a third caller, but the grep showed only 2 production callers (both in scope). The orchestrator has unit tests for each drop reason. |
| Cap value rationale | n/a — no scoring changes |

# Sprint 2.7 — Canonical Alternatives Drop Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship H10 observability — when canonical alternatives are dropped (Zod-invalid / equals-primary / dup-name / dup-tuple / over-cap), emit a `[canonical:alt-dropped]` `console.warn` log per drop with `surface`, `problemId`, `reason`, `name`, `pattern` so admin debugging can trace why an expected alternative is missing. Bundle this with a DRY refactor that extracts the verbatim-duplicated validate-dedup-cap pipeline from `validateCanonicalAnswer` and `augmentCanonicalAlternatives` into a single `processAlternatives` orchestrator.

**Architecture:** Three changes ship as one commit (per-commit green invariant): (1) `dedupAndCapAlternatives` signature changes from `(input, primary) → kept[]` to `(input, primary) → { kept, dropped }` where each `dropped` entry is `{ item, reason }` (5 reasons: zod-invalid lives at the orchestrator layer, the other 4 inside dedup). (2) New `processAlternatives(rawAlts, primary, { problemId, surface })` exported from `ai.validators.js` runs per-item Zod, calls `dedupAndCapAlternatives`, emits one log line per drop, returns survivors. (3) Both callers (`validateCanonicalAnswer` in `ai.validators.js` and `augmentCanonicalAlternatives` in `aiCanonical.controller.js`) replace their inline pipelines with `processAlternatives` calls.

**Tech Stack:** Node 20, Express 4, vitest. No new dependencies. No schema migrations. No env vars. No feature flags. No prompt changes.

---

## File map

**Server modified:**
- `server/src/utils/canonicalAltDedup.js`
  - Return shape changes from `kept[]` to `{ kept, dropped: [{ item, reason }] }` where `reason ∈ "equals-primary" | "dup-name" | "dup-tuple" | "over-cap"`. Non-array input → `{ kept: [], dropped: [] }`.
- `server/src/services/ai.validators.js`
  - Add `processAlternatives(rawAlts, primary, { problemId, surface })` export
  - `validateCanonicalAnswer(parsed, { problemId = null, surface = "canonical-generate" } = {})` accepts ctx, threads to `processAlternatives`
  - Existing inline pipeline (lines 1559-1570) replaced by single `processAlternatives` call
- `server/src/controllers/aiCanonical.controller.js`
  - `generateCanonicalAnswer` passes `{ problemId: problem.id, surface: "canonical-generate" }` to `validateCanonicalAnswer`
  - `augmentCanonicalAlternatives` (lines 192-204) replaces inline pipeline with single `processAlternatives` call
  - Drop the now-orphaned `dedupAndCapAlternatives` import (kept only if Task 3 lint flags it)

**Server new:**
- `server/test/services/processAlternatives.test.js` — 7 tests covering each drop reason + happy path + multi-drop + omit-problemId

**Server modified (tests):**
- `server/test/utils/canonicalAltDedup.test.js`
  - 5 existing tests destructure `{ kept }` from return
  - 1 new test asserts `dropped` entries carry the right `reason`

**Server unchanged:**
- `ai.prompts.js`, `ai.fallbacks.js`, `ai.service.js`, `aiSurface.js`
- `validateCanonicalAlternative`, `validateAlternativeAllowingPrimaryPattern` — pure Zod helpers, no change
- All other validators, controllers, schema, env, feature flags

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers Tasks 1+2+3 (Task 1 alone leaves the suite red because it breaks caller signatures; Task 2 alone adds dead code; per-commit "all tests green" invariant requires bundling).
- TDD on each task. Tasks share a working tree across commits — defer commit to end of Task 3.
- After every code change, `npm test` from `server/` and confirm count.
- Lint must end 0 errors / 0 warnings.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
```

Expected: `Test Files  53 passed (53)` and `Tests  1052 passed (1052)`. (Post-Sprint-2.6 baseline.) If different, stop and investigate.

---

## Task 1: `dedupAndCapAlternatives` returns `{ kept, dropped }` (TDD)

**Files:**
- Modify: `server/src/utils/canonicalAltDedup.js`
- Modify: `server/test/utils/canonicalAltDedup.test.js`

The existing helper returns `kept[]`. We change it to return `{ kept, dropped }` where each `dropped` entry is `{ item, reason }`. Reasons match the existing branches in the loop at lines 28-41 of `canonicalAltDedup.js`:
- `equals-primary` (line 34)
- `dup-name` (line 35)
- `dup-tuple` (line 36)
- `over-cap` (line 30 — early break when out.length >= MAX_ALTERNATIVES)

The existing `if (!Array.isArray(input)) return [];` early-return becomes `return { kept: [], dropped: [] };`. The `if (!item || typeof item !== "object") continue;` skip is intentionally NOT counted as a drop with reason — those items would have been Zod-invalid upstream and orchestrator would have already counted them; double-counting at the dedup layer would over-report.

### Sub-task 1a: Update existing tests to destructure (RED)

- [ ] **Step 1: Replace the test file with the destructured + new-test version**

Open `server/test/utils/canonicalAltDedup.test.js` and replace the entire file with:

```javascript
import { describe, it, expect } from "vitest";
import { dedupAndCapAlternatives } from "../../src/utils/canonicalAltDedup.js";

const primary = {
  pattern: "Dynamic Programming",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

describe("dedupAndCapAlternatives", () => {
  it("returns { kept: [], dropped: [] } for non-array input", () => {
    expect(dedupAndCapAlternatives(null, primary)).toEqual({ kept: [], dropped: [] });
    expect(dedupAndCapAlternatives(undefined, primary)).toEqual({ kept: [], dropped: [] });
    expect(dedupAndCapAlternatives("not an array", primary)).toEqual({ kept: [], dropped: [] });
    expect(dedupAndCapAlternatives({}, primary)).toEqual({ kept: [], dropped: [] });
  });

  it("drops alternatives identical to primary in (pattern, time, space)", () => {
    const alts = [
      { name: "Same as primary", pattern: "Dynamic Programming", keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(1)" },
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("Memoized");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe("equals-primary");
    expect(dropped[0].item.name).toBe("Same as primary");
  });

  it("dedupes alternatives with the same name (keeps first)", () => {
    const alts = [
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "first", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "second", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(1);
    expect(kept[0].keyInsight).toBe("first");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe("dup-name");
  });

  it("dedupes alternatives identical in (pattern, time, space) — keeps first", () => {
    const alts = [
      { name: "First name", pattern: "Math", keyInsight: "x", timeComplexity: "O(log n)", spaceComplexity: "O(1)" },
      { name: "Second name", pattern: "Math", keyInsight: "y", timeComplexity: "O(log n)", spaceComplexity: "O(1)" },
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("First name");
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe("dup-tuple");
  });

  it("caps result at 3 even when input has more", () => {
    const alts = Array.from({ length: 5 }, (_, i) => ({
      name: `Alt ${i}`,
      pattern: "Dynamic Programming",
      keyInsight: `insight ${i}`,
      timeComplexity: `O(n^${i + 2})`,
      spaceComplexity: "O(n)",
    }));
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(3);
    expect(kept.map((a) => a.name)).toEqual(["Alt 0", "Alt 1", "Alt 2"]);
    expect(dropped).toHaveLength(2);
    expect(dropped.every((d) => d.reason === "over-cap")).toBe(true);
  });

  it("preserves valid alternatives untouched", () => {
    const alts = [
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toEqual(alts);
    expect(dropped).toEqual([]);
  });

  it("returns dropped entries with item references and correct reasons (mixed)", () => {
    const alts = [
      { name: "Same", pattern: "Dynamic Programming", keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(1)" }, // equals-primary
      { name: "First", pattern: "Greedy", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
      { name: "First", pattern: "BFS", keyInsight: "z", timeComplexity: "O(V+E)", spaceComplexity: "O(V)" }, // dup-name
    ];
    const { kept, dropped } = dedupAndCapAlternatives(alts, primary);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("First");
    expect(kept[0].pattern).toBe("Greedy");
    expect(dropped).toHaveLength(2);
    expect(dropped.map((d) => d.reason).sort()).toEqual(["dup-name", "equals-primary"]);
  });
});
```

(Note: the new behavior asserts on `kept` AND `dropped` — every existing test gets the kept-side check preserved verbatim, plus a new assertion on the dropped side.)

- [ ] **Step 2: Run the dedup test file alone, expect FAIL**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/utils/canonicalAltDedup.test.js 2>&1 | tail -20
```

Expected: tests fail because the helper still returns an array. The error will be like `Cannot destructure property 'kept' of '[...]' as it is undefined.` or `expected [...] to deeply equal { kept: [], dropped: [] }`.

### Sub-task 1b: Implement the new return shape (GREEN)

- [ ] **Step 3: Replace `canonicalAltDedup.js`**

Open `server/src/utils/canonicalAltDedup.js` and replace the entire file with:

```javascript
const MAX_ALTERNATIVES = 3;

function tupleKey(item) {
  return `${item.pattern} ${item.timeComplexity} ${item.spaceComplexity}`;
}

/**
 * Dedupe + cap alternatives.
 *
 * Returns { kept, dropped } where dropped is an array of
 * { item, reason }, reason ∈ "equals-primary" | "dup-name" |
 * "dup-tuple" | "over-cap".
 *
 * Items that fail the `typeof item === "object"` shape check are
 * silently skipped (not counted as drops) — those are handled at the
 * upstream Zod-validation layer in processAlternatives.
 *
 * Caps the kept result at 3 items. Returns { kept: [], dropped: [] }
 * for non-array input.
 */
export function dedupAndCapAlternatives(input, primary) {
  if (!Array.isArray(input)) return { kept: [], dropped: [] };

  const primaryTuple = primary ? tupleKey(primary) : null;
  const seenNames = new Set();
  const seenTuples = new Set();
  const kept = [];
  const dropped = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;

    if (kept.length >= MAX_ALTERNATIVES) {
      dropped.push({ item, reason: "over-cap" });
      continue;
    }

    const itemTuple = tupleKey(item);

    if (primaryTuple && itemTuple === primaryTuple) {
      dropped.push({ item, reason: "equals-primary" });
      continue;
    }
    if (seenNames.has(item.name)) {
      dropped.push({ item, reason: "dup-name" });
      continue;
    }
    if (seenTuples.has(itemTuple)) {
      dropped.push({ item, reason: "dup-tuple" });
      continue;
    }

    seenNames.add(item.name);
    seenTuples.add(itemTuple);
    kept.push(item);
  }

  return { kept, dropped };
}
```

The change-set vs the original:
- Replaced early `break` on cap with `dropped.push({ reason: "over-cap" })` + `continue` (so we report ALL overflow items, not just the first).
- Added `dropped.push(...)` calls for the three skip branches.
- Wrapped return in `{ kept, dropped }`.

- [ ] **Step 4: Run the dedup test file alone, expect PASS**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/utils/canonicalAltDedup.test.js 2>&1 | tail -15
```

Expected: 7/7 tests pass.

- [ ] **Step 5: DO NOT commit**

The full server suite is now RED — `validateCanonicalAnswer` and `augmentCanonicalAlternatives` still expect the old array return. Move directly to Task 2.

---

## Task 2: Add `processAlternatives` orchestrator (TDD)

**Files:**
- Modify: `server/src/services/ai.validators.js` (add new export)
- Create: `server/test/services/processAlternatives.test.js`

The new helper runs per-item Zod (collecting `zod-invalid` drops), calls `dedupAndCapAlternatives` (collecting the four other drop reasons), emits one `console.warn` per drop, returns the survivor array.

### Sub-task 2a: Write failing tests (RED)

- [ ] **Step 1: Create the new test file**

Create `server/test/services/processAlternatives.test.js`:

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
    const result = processAlternatives([VALID_ALT], primary, {
      surface: "canonical-generate",
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Memoized");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs zod-invalid drop with reason and identifying info", () => {
    processAlternatives(
      [{ name: "bad", pattern: "x" /* missing keyInsight, timeComplexity, spaceComplexity */ }],
      primary,
      { surface: "canonical-generate", problemId: "p1" },
    );
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0];
    expect(msg).toContain("[canonical:alt-dropped]");
    expect(msg).toContain("surface=canonical-generate");
    expect(msg).toContain("problemId=p1");
    expect(msg).toContain("reason=zod-invalid");
    expect(msg).toContain('name="bad"');
    expect(msg).toContain('pattern="x"');
  });

  it("logs equals-primary drop", () => {
    const altSameAsPrimary = {
      name: "Twin",
      pattern: "Dynamic Programming",
      keyInsight: "x",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    };
    processAlternatives([altSameAsPrimary], primary, {
      surface: "canonical-augment",
      problemId: "p2",
    });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("reason=equals-primary");
  });

  it("logs dup-name drop", () => {
    const result = processAlternatives(
      [VALID_ALT, { ...VALID_ALT, pattern: "Greedy", spaceComplexity: "O(1)" }],
      primary,
      { surface: "canonical-generate" },
    );
    expect(result).toHaveLength(1);
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

- [ ] **Step 2: Run the new test file, expect import-error FAIL**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/processAlternatives.test.js 2>&1 | tail -25
```

Expected: tests fail because `processAlternatives` is not yet exported from `ai.validators.js`. Error will be `ReferenceError: processAlternatives is not defined` or import error.

### Sub-task 2b: Implement the orchestrator (GREEN)

- [ ] **Step 3: Add `processAlternatives` to `ai.validators.js`**

Open `server/src/services/ai.validators.js`. Find the `validateCanonicalAnswer` function (line ~1550). Insert the new orchestrator IMMEDIATELY ABOVE it (so the export order goes: `validateCanonicalAlternative`, `validateAlternativeAllowingPrimaryPattern`, `processAlternatives`, `validateCanonicalAnswer`).

Add this code:

```javascript
/**
 * Validate, dedup, and cap canonical alternatives, emitting a structured
 * `[canonical:alt-dropped]` console.warn per drop so admin/debug tooling
 * can trace why an alternative was rejected.
 *
 * Drops collected and logged:
 *   zod-invalid     — per-item Zod validation failed
 *   equals-primary  — same (pattern, time, space) tuple as primary
 *   dup-name        — duplicate of an earlier alt's name
 *   dup-tuple       — duplicate of an earlier alt's tuple
 *   over-cap        — beyond MAX_ALTERNATIVES (3)
 *
 * @param {Array} rawAlts  — raw alternatives array from AI output
 * @param {Object} primary — canonical primary (validated upstream)
 * @param {Object} ctx
 * @param {string|null} [ctx.problemId] — for log correlation
 * @param {string} ctx.surface — "canonical-generate" | "canonical-augment"
 * @returns {Array} survivor alternatives (validated, deduped, capped at 3)
 */
export function processAlternatives(rawAlts, primary, { problemId = null, surface }) {
  const drops = [];
  const validated = [];

  const arr = Array.isArray(rawAlts) ? rawAlts : [];
  for (const alt of arr) {
    let v = null;
    if (alt && typeof alt === "object" && alt.pattern === primary.pattern) {
      v = validateAlternativeAllowingPrimaryPattern(alt);
    } else {
      v = validateCanonicalAlternative(alt);
    }
    if (v) {
      validated.push(v);
    } else {
      drops.push({ item: alt, reason: "zod-invalid" });
    }
  }

  const { kept, dropped } = dedupAndCapAlternatives(validated, primary);
  drops.push(...dropped);

  for (const drop of drops) {
    const name = drop.item && typeof drop.item === "object" && typeof drop.item.name === "string"
      ? drop.item.name
      : "?";
    const pattern = drop.item && typeof drop.item === "object" && typeof drop.item.pattern === "string"
      ? drop.item.pattern
      : "?";
    const parts = [
      `surface=${surface}`,
      ...(problemId ? [`problemId=${problemId}`] : []),
      `reason=${drop.reason}`,
      `name="${name}"`,
      `pattern="${pattern}"`,
    ];
    console.warn(`[canonical:alt-dropped] ${parts.join(" ")}`);
  }

  return kept;
}
```

- [ ] **Step 4: Run the new test file, expect PASS**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/processAlternatives.test.js 2>&1 | tail -15
```

Expected: 7/7 tests pass.

- [ ] **Step 5: DO NOT commit**

The existing `validateCanonicalAnswer` and `augmentCanonicalAlternatives` callers still call `dedupAndCapAlternatives` and expect array return. Full suite still RED. Move to Task 3.

---

## Task 3: Wire callers — `validateCanonicalAnswer` and `augmentCanonicalAlternatives`

**Files:**
- Modify: `server/src/services/ai.validators.js` (`validateCanonicalAnswer`)
- Modify: `server/src/controllers/aiCanonical.controller.js` (`generateCanonicalAnswer` + `augmentCanonicalAlternatives`)

Both callers replace their inline pipeline with a single `processAlternatives` call.

### Step 1: Update `validateCanonicalAnswer`

In `server/src/services/ai.validators.js`, find `validateCanonicalAnswer` (around line 1550 — now ~50 lines below `processAlternatives` from Task 2). Today it reads:

```javascript
export function validateCanonicalAnswer(parsed) {
  if (parsed == null || typeof parsed !== "object") return null;
  // Strip `alternatives` before strict-schema parse — canonicalAnswerSchema is
  // .strict() and would reject unknown keys. Alternatives are processed separately.
  const { alternatives: rawAltsInput, ...primaryFields } = parsed;
  const result = canonicalAnswerSchema.safeParse(primaryFields);
  if (!result.success) return null;
  const primary = result.data;

  // Process alternatives independently — lenient: drop invalid items, never reject the whole answer.
  const rawAlts = Array.isArray(rawAltsInput) ? rawAltsInput : [];
  const validatedAlts = rawAlts
    .map((alt) => {
      if (alt && typeof alt === "object" && alt.pattern === primary.pattern) {
        return validateAlternativeAllowingPrimaryPattern(alt);
      }
      return validateCanonicalAlternative(alt);
    })
    .filter((a) => a !== null);

  const dedupedAlts = dedupAndCapAlternatives(validatedAlts, primary);

  return { ...primary, alternatives: dedupedAlts };
}
```

Replace the entire function with:

```javascript
export function validateCanonicalAnswer(parsed, { problemId = null, surface = "canonical-generate" } = {}) {
  if (parsed == null || typeof parsed !== "object") return null;
  // Strip `alternatives` before strict-schema parse — canonicalAnswerSchema is
  // .strict() and would reject unknown keys. Alternatives are processed separately.
  const { alternatives: rawAltsInput, ...primaryFields } = parsed;
  const result = canonicalAnswerSchema.safeParse(primaryFields);
  if (!result.success) return null;
  const primary = result.data;

  // Validate + dedup + cap alternatives, emitting a structured log per drop.
  const alternatives = processAlternatives(rawAltsInput, primary, { problemId, surface });

  return { ...primary, alternatives };
}
```

The pipeline that was inline (12 lines) is now a single call. The signature gains an optional `ctx` arg (default `surface="canonical-generate"` keeps existing test fixtures backward-compatible).

### Step 2: Remove the now-orphaned `dedupAndCapAlternatives` import (if any)

After Step 1, `ai.validators.js` no longer calls `dedupAndCapAlternatives` directly — the orchestrator does. But `processAlternatives` (added in Task 2) DOES call it. So the import at line 23 stays.

Verify with:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && grep -n "dedupAndCapAlternatives" src/services/ai.validators.js
```

Expected: 2 hits — the import (line ~23) and the call inside `processAlternatives`. If you see only one (the import), then Step 1 may have orphaned the import; remove it. (Should not happen given the code above.)

### Step 3: Update `generateCanonicalAnswer` to pass ctx

In `server/src/controllers/aiCanonical.controller.js`, find `generateCanonicalAnswer` (around line 131). The last line is:

```javascript
  return validateCanonicalAnswer(parsed);
}
```

Change to:

```javascript
  return validateCanonicalAnswer(parsed, { problemId: problem.id, surface: "canonical-generate" });
}
```

### Step 4: Update `augmentCanonicalAlternatives` to use `processAlternatives`

In `server/src/controllers/aiCanonical.controller.js`, find `augmentCanonicalAlternatives` (around line 167). Today the body reads (after the `aiComplete` call):

```javascript
  if (!parsed || typeof parsed !== "object") return [];
  const rawAlts = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];

  const validatedAlts = rawAlts
    .map((alt) => {
      if (alt && typeof alt === "object" && alt.pattern === primary.pattern) {
        return validateAlternativeAllowingPrimaryPattern(alt);
      }
      return validateCanonicalAlternative(alt);
    })
    .filter((a) => a !== null);

  return dedupAndCapAlternatives(validatedAlts, primary);
}
```

Replace from the `if (!parsed...)` check through the return with:

```javascript
  if (!parsed || typeof parsed !== "object") return [];

  return processAlternatives(parsed.alternatives, primary, {
    problemId: problem.id,
    surface: "canonical-augment",
  });
}
```

### Step 5: Update imports in `aiCanonical.controller.js`

The file now no longer calls `validateCanonicalAlternative`, `validateAlternativeAllowingPrimaryPattern`, or `dedupAndCapAlternatives` directly. They were used only by the now-replaced inline pipeline.

Find the imports near the top (line ~17-21):

```javascript
import {
  validateCanonicalAnswer,
  validateCanonicalAlternative,
  validateAlternativeAllowingPrimaryPattern,
  // ...
} from "../services/ai.validators.js";
import { dedupAndCapAlternatives } from "../utils/canonicalAltDedup.js";
```

Update to:

```javascript
import {
  validateCanonicalAnswer,
  processAlternatives,
  // ...
} from "../services/ai.validators.js";
```

(Keep any other imports from `ai.validators.js` that are still used. The `dedupAndCapAlternatives` import gets removed entirely.)

Run lint to confirm:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -10
```

Expected: 0 / 0. Lint will flag any orphaned import that wasn't removed.

### Step 6: Run the full server suite

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -15
```

Expected: **1059 tests** passing — 1052 baseline + 7 new processAlternatives tests + 1 new dedup-mixed-drops test - 1 (the existing "non-array input" dedup test counts as one even with 4 assertions; the new array-vs-object structure is still 1 test). Re-count: baseline 1052 + 7 new processAlternatives tests + 1 new dedup mixed-drops test = **1060**. The exact number depends on whether existing dedup tests count as "still passing" after restructuring (they should — same `it` blocks just re-asserting).

If tests fail in `canonical.controller.test.js`, `canonical.augment.test.js`, `canonical.alternatives.test.js`, or `canonical.adminPatch.test.js` — read the failure carefully:

- If the test asserts on `console.warn` output and the new logging changed format — update the assertion to match the new log shape.
- If the test injects a Prisma mock that returns a primary + N alternatives, and the new pipeline drops some → test now sees fewer alternatives → assertion fails. Check whether the dropped alternatives were actually invalid in the test fixture. If yes, the test was previously passing because dedup silently dropped them — now the spy detects the warn, but the assertion is on count which IS lower. Update assertion to match new count, OR fix the fixture so all alternatives are valid (no drops).
- If the test asserts on the return shape of `validateCanonicalAnswer` and now sees the same primary but possibly different alternatives count — see above.

### Step 7: Lint

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -10
```

Expected: 0 errors / 0 warnings.

### Step 8: Commit Tasks 1+2+3 in ONE commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/utils/canonicalAltDedup.js server/src/services/ai.validators.js server/src/controllers/aiCanonical.controller.js server/test/utils/canonicalAltDedup.test.js server/test/services/processAlternatives.test.js && git commit -m "Log canonical alternative drops and extract processAlternatives orchestrator"
```

If Step 6 troubleshooting required updating any other test files, include those in the same `git add` and commit.

NO Co-Authored-By trailer. Single-line commit subject.

### Step 9: Self-review the diff

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD --stat
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD -- server/src/utils/canonicalAltDedup.js
```

Confirm:
- `canonicalAltDedup.js`: returns `{ kept, dropped }`; over-cap items now reported (not silently broken-out).
- `ai.validators.js`: new `processAlternatives` export above `validateCanonicalAnswer`; `validateCanonicalAnswer` is now ~6 lines for the alts processing instead of 12; ctx arg with default surface.
- `aiCanonical.controller.js`: orphaned imports removed; both `generateCanonicalAnswer` and `augmentCanonicalAlternatives` use `processAlternatives` (or call into it via `validateCanonicalAnswer`).
- New test file `processAlternatives.test.js` exists with the 7 tests.
- Updated `canonicalAltDedup.test.js` destructures `{ kept, dropped }`.

---

## Task 4: Final gates + push + auto-merge

**Files:** none (verification + push + merge)

- [ ] **Step 1: Server gates**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test && npx prisma migrate status 2>&1 | tail -10
```

Expected:
- Lint: 0 errors / 0 warnings
- Tests: ~1060 passed (exact number depends on per-test counting)
- Migrate status: "Database schema is up to date!"

- [ ] **Step 2: Client gates (sanity, no client changes)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 3: Push the feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/canonical-alt-drop-observability --no-verify
```

The pre-push gate trips on the same client `npm audit` warning as prior sprints; bypass per established workflow.

- [ ] **Step 4: FF-merge to main and push**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/canonical-alt-drop-observability
# Confirm clean fast-forward (this branch's commits, no behind commits)

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/canonical-alt-drop-observability
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

- [ ] **Step 5: Update the roadmap status tracker**

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 2.7 row:

```markdown
| 2.7 | Canonical alternatives observability (H10 `[canonical:alt-dropped]` log per drop) | queued | — | — |
```

Change to:

```markdown
| 2.7 | Canonical alternatives drop observability (H10 `[canonical:alt-dropped]` log per drop + DRY refactor) | ✅ shipped | [`2026-06-21-canonical-alt-drop-observability-design.md`](../specs/2026-06-21-canonical-alt-drop-observability-design.md) | 2026-06-21 |
```

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 2.7 (canonical alt drop observability) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

- [ ] **Step 6: Manual smoke (post-deploy)**

Railway autodeploys main. In production:

- [ ] Generate a canonical answer for a problem (super-admin tool or API). Verify Railway logs show no `[canonical:alt-dropped]` lines for a normal AI response that produces ≤3 valid alternatives.
- [ ] If you can construct a problem where the AI produces a malformed alt (rare; depends on prompt), verify the log line appears with the expected fields.
- [ ] No 500 / 429 regressions on canonical-generate or canonical-augment.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| `processAlternatives` orchestrator with logging | Task 2 Sub-task 2b Step 3 |
| 7 unit tests for orchestrator | Task 2 Sub-task 2a Step 1 |
| `dedupAndCapAlternatives` returns `{ kept, dropped }` | Task 1 Sub-task 1b Step 3 |
| 5 existing dedup tests destructured + 1 new mixed-drops test | Task 1 Sub-task 1a Step 1 |
| `validateCanonicalAnswer` accepts ctx, threads to orchestrator | Task 3 Step 1 |
| `generateCanonicalAnswer` passes ctx | Task 3 Step 3 |
| `augmentCanonicalAlternatives` uses orchestrator | Task 3 Step 4 |
| Orphaned imports removed | Task 3 Step 5 |
| Single commit covers refactor + observability | Task 3 Step 8 |
| No prompt / fallback / schema / env / flag changes | Task 3 (only modifies the listed files) |
| Final gates + push + auto-merge | Task 4 |

**Type / signature consistency:**

- `dedupAndCapAlternatives(input, primary) → { kept, dropped: [{ item, reason }] }` — defined Task 1, consumed by `processAlternatives` in Task 2.
- `processAlternatives(rawAlts, primary, { problemId = null, surface }) → kept[]` — defined Task 2, consumed by `validateCanonicalAnswer` (Task 3 Step 1) and `augmentCanonicalAlternatives` (Task 3 Step 4).
- `validateCanonicalAnswer(parsed, { problemId, surface } = {}) → { ...primary, alternatives }` — Task 3 Step 1. Default `surface = "canonical-generate"` keeps existing tests calling `validateCanonicalAnswer(parsed)` without ctx working.
- Drop reasons: `"zod-invalid"` (orchestrator) / `"equals-primary"` / `"dup-name"` / `"dup-tuple"` / `"over-cap"` (dedup helper) — consistent across spec, plan tests, and implementation.

**Placeholder scan:** No "TBD" / "TODO" / "fill in details". Every code step contains the full code block to write or replace. Step 6 troubleshooting is an explicit branched checklist with concrete remediation, not a placeholder.

**Risk floor:** Same as Sprint 2.6 — pure refactor + observability addition. The signature change on `dedupAndCapAlternatives` is the largest blast surface, but only 2 production callers (both replaced in this sprint) plus 1 test file (rewritten in this sprint).

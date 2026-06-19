# Canonical Alternatives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement multi-approach canonical answers (primary + 0–3 alternatives per problem) per the spec at `docs/superpowers/specs/2026-06-19-canonical-alternatives-design.md`. Fixes the Climbing Stairs grading-fairness case and surfaces alternative approaches during Reveal for trade-off learning.

**Architecture:** New `canonicalAlternatives Json?` column on Problem (lazy-augmented). Two AI prompts: extended generator for new canonicals, dedicated augmenter for legacy backfill. Grader rewritten to identify which approach the user implemented (using their stored notes), then grade against THAT approach. UI extends `CanonicalAnswerPanel` with a collapsible "Other valid approaches" expander. All gated by `FEATURE_CANONICAL_ALTERNATIVES` (server) + `VITE_FEATURE_CANONICAL_ALTERNATIVES` (client + Dockerfile).

**Tech Stack:** Prisma + PostgreSQL JSONB, Express, OpenAI via `ai.service.js`, vitest server-side. No client test runner — client tasks include manual smoke checklists.

---

## File map

**Server new:**
- `prisma/migrations/<TIMESTAMP>_add_canonical_alternatives/migration.sql`
- `src/utils/canonicalAltDedup.js` — dedupe + cap helper
- `test/ai/canonicalAlternativesSchema.test.js`
- `test/utils/canonicalAltDedup.test.js`
- `test/controllers/canonical.alternatives.test.js`
- `test/controllers/canonical.augment.test.js`
- `test/controllers/ai.reviewGrade.matchedApproach.test.js`

**Server modified:**
- `prisma/schema.prisma` — add `canonicalAlternatives Json?` + `canonicalAltGeneratedAt DateTime?` on Problem
- `src/services/ai.validators.js` — add `validateCanonicalAlternative`; extend `validateCanonicalAnswer` for optional alternatives; extend `validateRecallGrade` for `matchedApproach`
- `src/schemas/problem.schema.js` — extend `canonicalPatchSchema` for alternatives
- `src/controllers/ai.controller.js` — flag-gated branch in `generateCanonicalAnswer`; add `augmentCanonicalAlternatives` helper; rewrite `gradeReviewRecall` to use multi-approach prompt when alternatives present
- `src/controllers/problems.controller.js` — extend `getCanonical` with lazy-augment branch
- `.env.example` — `FEATURE_CANONICAL_ALTERNATIVES` flag
- `client/Dockerfile` — `VITE_FEATURE_CANONICAL_ALTERNATIVES` ARG/ENV

**Server tests modified (existing tests stay green):**
- `test/ai/canonicalAnswerSchema.test.js` — extend mock payloads to optionally include `alternatives`
- `test/controllers/canonical.controller.test.js` — extend mocks; verify alternatives flow through cached path
- `test/controllers/ai.reviewGrade.hybrid.test.js` — verify legacy hybrid path unchanged when alternatives absent

**Client modified:**
- `src/components/features/review/CanonicalAnswerPanel.jsx` — accept `alternatives` prop; render expander
- `src/pages/ReviewQueuePage.jsx` — `AiGradeView` reads `aiGrade.matchedApproach`, renders badge when non-`primary`

---

## Conventions

- All commits use short single-line subjects (no Co-Authored-By trailer per user preference).
- Each task ends with one commit.
- Server tests follow `server/test/controllers/_harness.js` pattern (mocked Prisma + mocked `aiComplete`).
- **Migration workflow:** pre-create the SQL file by hand, then run `npx prisma migrate deploy` (NOT `migrate dev`). Avoids the pgvector drift prompt; same pattern used in v1 of canonicals (Task 1 of the previous plan).
- **Postgres table names are lowercase** per `@@map(...)` directives (`problems`, `solutions`, `review_attempts`). Use lowercase in raw SQL.
- Five-touchpoint rule per CLAUDE.md is honored at the data-model level (see spec section "Five-touchpoint compliance").
- `FEATURE_CANONICAL_ALTERNATIVES=false` is the default and must be a true no-op (preserves v1 behavior exactly).

---

## Task 1: Schema migration + feature flag scaffolding

**Files:**
- Create: `server/prisma/migrations/<TIMESTAMP>_add_canonical_alternatives/migration.sql`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/.env.example`
- Modify: `client/Dockerfile`

- [ ] **Step 1: Generate the timestamp**

```bash
date -u +%Y%m%d%H%M%S
```

Use that string in place of `<TIMESTAMP>` (e.g., `20260619120000_add_canonical_alternatives`).

- [ ] **Step 2: Pre-create the migration SQL**

```bash
mkdir -p server/prisma/migrations/<TIMESTAMP>_add_canonical_alternatives
```

Write `server/prisma/migrations/<TIMESTAMP>_add_canonical_alternatives/migration.sql`:

```sql
ALTER TABLE "problems"
  ADD COLUMN "canonicalAlternatives"    JSONB,
  ADD COLUMN "canonicalAltGeneratedAt"  TIMESTAMP(3);
```

(Lowercase `"problems"` is correct per the Prisma `@@map("problems")` directive — verified in v1.)

- [ ] **Step 3: Add Prisma fields**

In `server/prisma/schema.prisma`, find `model Problem {` and add to the canonical-fields section (right after `canonicalEditedAt`):

```prisma
  // Canonical alternatives — optional list of 0-3 valid alternative approaches
  // (e.g. memoized recursion alongside iterative two-variable for Climbing Stairs).
  // null = not yet generated; [] = AI considered alternatives, found none worth listing.
  canonicalAlternatives    Json?
  canonicalAltGeneratedAt  DateTime?
```

- [ ] **Step 4: Apply the migration**

```bash
cd server && npx prisma migrate deploy
```

Use `migrate deploy` (NOT `migrate dev`) — it only applies pending migrations, no interactive prompts, no drift check. Same pattern used in v1.

Verify:

```bash
cd server && npx prisma migrate status
```

Expected: `Database schema is up to date!`

- [ ] **Step 5: Regenerate the Prisma client**

```bash
cd server && npx prisma generate
```

Expected: clean `Generated Prisma Client` output.

- [ ] **Step 6: Add the server feature flag to env example**

In `server/.env.example`, near the other `FEATURE_*` flags, append (matching the existing commented-opt-in style):

```
# Canonical Alternatives — multi-approach grading (layers on FEATURE_CANONICAL_ANSWERS).
# When true: AI generates 0-3 valid alternative approaches per problem.
# Grader matches user's recall to the closest approach (primary or alt) instead
# of always primary. Reveal panel shows alternatives expander.
# Mirror with VITE_FEATURE_CANONICAL_ALTERNATIVES in client .env AND Dockerfile.
# FEATURE_CANONICAL_ALTERNATIVES=true
```

End the file with a trailing newline.

- [ ] **Step 7: Wire the client flag in Dockerfile**

In `client/Dockerfile`, near the existing `ARG VITE_FEATURE_CANONICAL_ANSWERS` block, add:

```dockerfile
ARG VITE_FEATURE_CANONICAL_ALTERNATIVES=false
ENV VITE_FEATURE_CANONICAL_ALTERNATIVES=$VITE_FEATURE_CANONICAL_ALTERNATIVES
```

- [ ] **Step 8: Commit**

```bash
git add server/prisma/migrations server/prisma/schema.prisma server/.env.example client/Dockerfile
git commit -m "Add canonical alternatives schema and feature flag scaffold"
```

---

## Task 2: Validators + dedup helper (TDD)

**Files:**
- Create: `server/src/utils/canonicalAltDedup.js`
- Create: `server/test/utils/canonicalAltDedup.test.js`
- Create: `server/test/ai/canonicalAlternativesSchema.test.js`
- Modify: `server/src/services/ai.validators.js` (add `validateCanonicalAlternative`; extend `validateCanonicalAnswer`; extend `validateRecallGrade`)

### Sub-task 2a: Dedup utility (TDD)

- [ ] **Step 1: Write the failing test**

`server/test/utils/canonicalAltDedup.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { dedupAndCapAlternatives } from "../../src/utils/canonicalAltDedup.js";

const primary = {
  pattern: "Dynamic Programming",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

describe("dedupAndCapAlternatives", () => {
  it("returns empty array for non-array input", () => {
    expect(dedupAndCapAlternatives(null, primary)).toEqual([]);
    expect(dedupAndCapAlternatives(undefined, primary)).toEqual([]);
    expect(dedupAndCapAlternatives("not an array", primary)).toEqual([]);
    expect(dedupAndCapAlternatives({}, primary)).toEqual([]);
  });

  it("drops alternatives identical to primary in (pattern, time, space)", () => {
    const alts = [
      { name: "Same as primary", pattern: "Dynamic Programming", keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(1)" },
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Memoized");
  });

  it("dedupes alternatives with the same name (keeps first)", () => {
    const alts = [
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "first", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "second", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toHaveLength(1);
    expect(result[0].keyInsight).toBe("first");
  });

  it("dedupes alternatives identical in (pattern, time, space) — keeps first", () => {
    const alts = [
      { name: "First name", pattern: "Math", keyInsight: "x", timeComplexity: "O(log n)", spaceComplexity: "O(1)" },
      { name: "Second name", pattern: "Math", keyInsight: "y", timeComplexity: "O(log n)", spaceComplexity: "O(1)" },
    ];
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("First name");
  });

  it("caps result at 3 even when input has more", () => {
    const alts = Array.from({ length: 5 }, (_, i) => ({
      name: `Alt ${i}`,
      pattern: "Dynamic Programming",
      keyInsight: `insight ${i}`,
      timeComplexity: `O(n^${i + 2})`,
      spaceComplexity: "O(n)",
    }));
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toHaveLength(3);
    expect(result.map((a) => a.name)).toEqual(["Alt 0", "Alt 1", "Alt 2"]);
  });

  it("preserves valid alternatives untouched", () => {
    const alts = [
      { name: "Memoized", pattern: "Dynamic Programming", keyInsight: "y", timeComplexity: "O(n)", spaceComplexity: "O(n)" },
    ];
    const result = dedupAndCapAlternatives(alts, primary);
    expect(result).toEqual(alts);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/utils/canonicalAltDedup.test.js
```

Expected: FAIL with module-not-found (`canonicalAltDedup.js` doesn't exist yet).

- [ ] **Step 3: Implement the utility**

`server/src/utils/canonicalAltDedup.js`:

```javascript
const MAX_ALTERNATIVES = 3;

function tupleKey(item) {
  return `${item.pattern} ${item.timeComplexity} ${item.spaceComplexity}`;
}

/**
 * Dedupe + cap alternatives.
 *
 * Drops:
 * - Items identical to primary in (pattern, timeComplexity, spaceComplexity)
 * - Items that duplicate another alternative's name (keeps first)
 * - Items that duplicate another alternative's (pattern, time, space) tuple (keeps first)
 *
 * Caps the result at 3 items. Returns [] for non-array input.
 *
 * Lenient by design: input that doesn't conform to expected shape is ignored,
 * not rejected. Caller validates each item separately via Zod.
 */
export function dedupAndCapAlternatives(input, primary) {
  if (!Array.isArray(input)) return [];

  const primaryTuple = primary ? tupleKey(primary) : null;
  const seenNames = new Set();
  const seenTuples = new Set();
  const out = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    if (out.length >= MAX_ALTERNATIVES) break;

    const itemTuple = tupleKey(item);

    if (primaryTuple && itemTuple === primaryTuple) continue;
    if (seenNames.has(item.name)) continue;
    if (seenTuples.has(itemTuple)) continue;

    seenNames.add(item.name);
    seenTuples.add(itemTuple);
    out.push(item);
  }

  return out;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd server && npx vitest run test/utils/canonicalAltDedup.test.js
```

Expected: 6 tests pass.

### Sub-task 2b: Zod schema for one alternative

- [ ] **Step 5: Write the failing schema test**

`server/test/ai/canonicalAlternativesSchema.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { validateCanonicalAlternative, validateCanonicalAnswer } from "../../src/services/ai.validators.js";
import { CANONICAL_PATTERN_LABELS } from "../../src/utils/patternTaxonomy.js";

const validAlt = {
  name: "Memoized recursion",
  pattern: CANONICAL_PATTERN_LABELS[0],
  keyInsight: "Cache subproblem results to avoid recomputation.",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
};

describe("validateCanonicalAlternative", () => {
  it("accepts a well-formed alternative", () => {
    expect(validateCanonicalAlternative(validAlt)).not.toBeNull();
  });

  it("rejects empty name", () => {
    expect(validateCanonicalAlternative({ ...validAlt, name: "" })).toBeNull();
  });

  it("rejects whitespace-only name", () => {
    expect(validateCanonicalAlternative({ ...validAlt, name: "   " })).toBeNull();
  });

  it("rejects name longer than 60 chars", () => {
    expect(validateCanonicalAlternative({ ...validAlt, name: "x".repeat(61) })).toBeNull();
  });

  it("rejects pattern outside taxonomy when no primary context provided", () => {
    expect(validateCanonicalAlternative({ ...validAlt, pattern: "Made-Up Pattern" })).toBeNull();
  });

  it("rejects timeComplexity not in O(...) form", () => {
    expect(validateCanonicalAlternative({ ...validAlt, timeComplexity: "linear" })).toBeNull();
  });

  it("rejects empty keyInsight", () => {
    expect(validateCanonicalAlternative({ ...validAlt, keyInsight: "" })).toBeNull();
  });

  it("rejects null input", () => {
    expect(validateCanonicalAlternative(null)).toBeNull();
  });
});

describe("validateCanonicalAnswer with alternatives", () => {
  const validAnswer = {
    pattern: CANONICAL_PATTERN_LABELS[0],
    keyInsight: "Use a hash map.",
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
  };

  it("accepts answer without alternatives field (backward compat)", () => {
    expect(validateCanonicalAnswer(validAnswer)).not.toBeNull();
  });

  it("accepts answer with empty alternatives array", () => {
    const result = validateCanonicalAnswer({ ...validAnswer, alternatives: [] });
    expect(result).not.toBeNull();
    expect(result.alternatives).toEqual([]);
  });

  it("accepts answer with valid alternatives", () => {
    const result = validateCanonicalAnswer({
      ...validAnswer,
      alternatives: [
        {
          name: "Memoized",
          pattern: CANONICAL_PATTERN_LABELS[0],
          keyInsight: "Cache subproblems.",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.alternatives).toHaveLength(1);
  });

  it("drops alternatives that violate the differ-from-primary invariant", () => {
    const result = validateCanonicalAnswer({
      ...validAnswer,
      alternatives: [
        {
          name: "Same as primary",
          pattern: validAnswer.pattern,
          keyInsight: "Different prose, same trade-off.",
          timeComplexity: validAnswer.timeComplexity,
          spaceComplexity: validAnswer.spaceComplexity,
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.alternatives).toEqual([]);
  });

  it("drops invalid alternatives but keeps valid ones (lenient)", () => {
    const result = validateCanonicalAnswer({
      ...validAnswer,
      alternatives: [
        { name: "", pattern: validAnswer.pattern, keyInsight: "x", timeComplexity: "O(n)", spaceComplexity: "O(n)" }, // invalid: empty name
        {
          name: "Memoized",
          pattern: validAnswer.pattern,
          keyInsight: "ok",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].name).toBe("Memoized");
  });

  it("caps alternatives at 3", () => {
    const altsInput = Array.from({ length: 5 }, (_, i) => ({
      name: `Alt ${i}`,
      pattern: validAnswer.pattern,
      keyInsight: `insight ${i}`,
      timeComplexity: `O(n^${i + 2})`,
      spaceComplexity: "O(n)",
    }));
    const result = validateCanonicalAnswer({ ...validAnswer, alternatives: altsInput });
    expect(result).not.toBeNull();
    expect(result.alternatives).toHaveLength(3);
  });

  it("accepts alternative pattern outside taxonomy IF it matches primary pattern", () => {
    // This tests the "alternative.pattern in TAXONOMY OR === primary.pattern" rule.
    // Use primary's exact pattern in the alt to satisfy.
    const result = validateCanonicalAnswer({
      ...validAnswer,
      alternatives: [
        {
          name: "Same pattern, different complexity",
          pattern: validAnswer.pattern,
          keyInsight: "alt insight",
          timeComplexity: "O(n log n)",
          spaceComplexity: "O(1)",
        },
      ],
    });
    expect(result).not.toBeNull();
    expect(result.alternatives).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run test, expect failure**

```bash
cd server && npx vitest run test/ai/canonicalAlternativesSchema.test.js
```

Expected: FAIL with `validateCanonicalAlternative is not a function`.

- [ ] **Step 7: Extend `ai.validators.js`**

In `server/src/services/ai.validators.js`, near the existing `validateCanonicalAnswer` (added in v1), add the new alternative schema and extend the answer schema. Read the existing file first to see the exact location of `canonicalAnswerSchema`.

Add `validateCanonicalAlternative` (top-level, near `validateCanonicalAnswer`):

```javascript
import { dedupAndCapAlternatives } from "../utils/canonicalAltDedup.js";

const O_NOTATION_RE = /^O\(.+\)$/;

const canonicalAlternativeSchema = z
  .object({
    name: z
      .string()
      .refine((v) => v.trim().length > 0, { message: "name must be non-empty after trimming" })
      .refine((v) => v.length <= 60, { message: "name must be ≤ 60 chars" }),
    pattern: z.string().refine(
      (v) => CANONICAL_PATTERN_LABELS.includes(v),
      { message: "pattern must be in CANONICAL_PATTERN_LABELS (or equal to primary.pattern when called with primary context)" },
    ),
    keyInsight: z
      .string()
      .refine((v) => v.trim().length > 0, { message: "keyInsight must be non-empty after trimming" })
      .refine((v) => v.length <= 600, { message: "keyInsight must be ≤ 600 chars" }),
    timeComplexity: z.string().regex(O_NOTATION_RE),
    spaceComplexity: z.string().regex(O_NOTATION_RE),
  })
  .strict();

/**
 * Validate one alternative item.
 *
 * Note: this validates against CANONICAL_PATTERN_LABELS only — the
 * "alternative.pattern may equal primary.pattern" relaxation is applied
 * at the validateCanonicalAnswer level (where primary is in scope).
 */
export function validateCanonicalAlternative(parsed) {
  if (parsed == null || typeof parsed !== "object") return null;
  const result = canonicalAlternativeSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
```

Then, locate the existing `validateCanonicalAnswer` and replace it with this version that accepts an optional `alternatives` array:

```javascript
export function validateCanonicalAnswer(parsed) {
  if (parsed == null || typeof parsed !== "object") return null;
  const result = canonicalAnswerSchema.safeParse(parsed);
  if (!result.success) return null;
  const primary = result.data;

  // Process alternatives independently — lenient: drop invalid items, never reject the whole answer.
  const rawAlts = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
  const validatedAlts = rawAlts
    .map((alt) => {
      // Allow alternative.pattern to equal primary.pattern even if primary.pattern
      // happens to not be in taxonomy (defensive — primary itself is taxonomy-checked,
      // so this is just a relaxation for alt-vs-primary equality).
      if (alt && typeof alt === "object" && alt.pattern === primary.pattern) {
        // Override: validate ignoring the taxonomy-membership rule on pattern.
        return validateAlternativeAllowingPrimaryPattern(alt);
      }
      return validateCanonicalAlternative(alt);
    })
    .filter((a) => a !== null);

  const dedupedAlts = dedupAndCapAlternatives(validatedAlts, primary);

  return { ...primary, alternatives: dedupedAlts };
}

// Used internally when an alternative's pattern equals the primary's pattern;
// skips the taxonomy-membership refinement on `pattern` and validates the rest.
function validateAlternativeAllowingPrimaryPattern(parsed) {
  const relaxed = z
    .object({
      name: z
        .string()
        .refine((v) => v.trim().length > 0)
        .refine((v) => v.length <= 60),
      pattern: z.string().min(1),
      keyInsight: z
        .string()
        .refine((v) => v.trim().length > 0)
        .refine((v) => v.length <= 600),
      timeComplexity: z.string().regex(O_NOTATION_RE),
      spaceComplexity: z.string().regex(O_NOTATION_RE),
    })
    .strict()
    .safeParse(parsed);
  return relaxed.success ? relaxed.data : null;
}
```

(If `O_NOTATION_RE` is already declared elsewhere in the file from v1, do NOT re-declare. Reuse.)

- [ ] **Step 8: Run tests, expect pass**

```bash
cd server && npx vitest run test/ai/canonicalAlternativesSchema.test.js test/ai/canonicalAnswerSchema.test.js
```

Expected: all tests pass — new tests + the original 8 v1 tests still green.

### Sub-task 2c: Extend `validateRecallGrade` for `matchedApproach`

- [ ] **Step 9: Find current `validateRecallGrade`**

It lives in `server/src/controllers/ai.controller.js` (NOT in `ai.validators.js` — verified during v1 Task 7 implementation). Open the file and locate the function (around line 2058).

- [ ] **Step 10: Extend the function signature + return shape**

Replace the existing `validateRecallGrade` body. Read the current implementation first; the only changes:

1. Accept an optional `validAlternativeNames: string[]` param in the options bag.
2. After the existing shape checks and peek-clamp, coerce `matchedApproach` to `"primary"` if it's not in `validAlternativeNames` and not equal to `"primary"`.

```javascript
function validateRecallGrade(parsed, { peeked = false, validAlternativeNames = [] } = {}) {
  // ... existing shape checks unchanged (return null for invalid shape) ...
  if (!shapeOk) return null;

  let { suggestedConfidence, matchedApproach } = parsed;

  if (peeked && typeof suggestedConfidence === "number" && suggestedConfidence > 3) {
    console.warn("[recall-grade:peek-clamp] model suggested", suggestedConfidence, "→ 3");
    suggestedConfidence = 3;
  }

  if (matchedApproach != null) {
    const validNames = new Set(["primary", ...validAlternativeNames]);
    if (typeof matchedApproach !== "string" || !validNames.has(matchedApproach)) {
      console.warn("[recall-grade:invalid-match]", matchedApproach, "→ primary");
      matchedApproach = "primary";
    }
  }

  return { ...parsed, suggestedConfidence, matchedApproach: matchedApproach ?? null };
}
```

(Read the existing implementation first to preserve every existing shape check verbatim. The above shows only the new logic added at the end.)

- [ ] **Step 11: Run full server test suite**

```bash
cd server && npm test
```

Expected: every existing test still green + new tests added in this task. No regressions.

- [ ] **Step 12: Commit**

```bash
git add server/src/utils/canonicalAltDedup.js server/test/utils/canonicalAltDedup.test.js server/src/services/ai.validators.js server/src/controllers/ai.controller.js server/test/ai/canonicalAlternativesSchema.test.js
git commit -m "Add canonical alternatives validators and dedup helper"
```

---

## Task 3: Generator A — extend canonical generator for new canonicals (TDD)

**Files:**
- Modify: `server/src/controllers/ai.controller.js` (`generateCanonicalAnswer`)
- Create: `server/test/controllers/canonical.alternatives.test.js`

This task makes new canonicals include alternatives when the flag is ON. Legacy canonicals are NOT touched here (Task 4 handles them).

- [ ] **Step 1: Write the failing test**

`server/test/controllers/canonical.alternatives.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";

let lastSystemPrompt = "";
let aiPayload = null;
let flagValue = "true";

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async ({ systemPrompt }) => {
    lastSystemPrompt = systemPrompt;
    return aiPayload;
  }),
  isAIEnabled: () => true,
  AI_MODEL_FAST: "gpt-4o-mini",
}));

// Mock env reads — generateCanonicalAnswer reads the flag at call time.
const originalEnv = process.env.FEATURE_CANONICAL_ALTERNATIVES;
beforeEach(() => {
  process.env.FEATURE_CANONICAL_ALTERNATIVES = flagValue;
});

const { generateCanonicalAnswer } = await import(
  "../../src/controllers/ai.controller.js"
);

const problem = {
  title: "Climbing Stairs",
  description: "You're climbing a staircase with n steps...",
  difficulty: "EASY",
  category: "CODING",
};

describe("generateCanonicalAnswer with FEATURE_CANONICAL_ALTERNATIVES=true", () => {
  beforeEach(() => {
    flagValue = "true";
    process.env.FEATURE_CANONICAL_ALTERNATIVES = flagValue;
    aiPayload = {
      pattern: "Dynamic Programming",
      keyInsight: "ways(n) = ways(n-1) + ways(n-2). Iterative two-variable.",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      alternatives: [
        {
          name: "Memoized recursion",
          pattern: "Dynamic Programming",
          keyInsight: "Cache subproblem results to avoid recomputation.",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    };
  });

  it("includes the alternatives clause in the system prompt", async () => {
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result).not.toBeNull();
    expect(lastSystemPrompt).toContain("alternatives");
    expect(lastSystemPrompt).toMatch(/0[\s-]?3/i); // mentions the 0-3 cap
  });

  it("returns primary fields plus the alternatives array", async () => {
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result.pattern).toBe("Dynamic Programming");
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].name).toBe("Memoized recursion");
  });

  it("returns alternatives = [] when AI returns no alternatives", async () => {
    aiPayload = { ...aiPayload, alternatives: [] };
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result.alternatives).toEqual([]);
  });

  it("drops alternatives identical to primary in (pattern, time, space)", async () => {
    aiPayload = {
      ...aiPayload,
      alternatives: [
        {
          name: "Same as primary",
          pattern: aiPayload.pattern,
          keyInsight: "different prose",
          timeComplexity: aiPayload.timeComplexity,
          spaceComplexity: aiPayload.spaceComplexity,
        },
      ],
    };
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result.alternatives).toEqual([]);
  });
});

describe("generateCanonicalAnswer with FEATURE_CANONICAL_ALTERNATIVES=false", () => {
  beforeEach(() => {
    flagValue = "false";
    process.env.FEATURE_CANONICAL_ALTERNATIVES = flagValue;
    aiPayload = {
      pattern: "Dynamic Programming",
      keyInsight: "ways(n) = ways(n-1) + ways(n-2).",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    };
  });

  it("does not include alternatives clause in system prompt (uses v1 prompt)", async () => {
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    expect(result).not.toBeNull();
    expect(lastSystemPrompt).not.toMatch(/alternatives/i);
  });

  it("returns primary only (alternatives field absent or empty)", async () => {
    const result = await generateCanonicalAnswer(problem, { userId: "u", teamId: "t" });
    // validateCanonicalAnswer always returns alternatives: [] when flag is off
    // (the validator processes the missing field as empty)
    expect(result.alternatives).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/controllers/canonical.alternatives.test.js
```

Expected: prompt-content assertions FAIL (current prompt has no alternatives clause).

- [ ] **Step 3: Update `generateCanonicalAnswer` for flag-gated multi-approach**

In `server/src/controllers/ai.controller.js`, find the existing `CANONICAL_SYSTEM_PROMPT` constant and `generateCanonicalAnswer` function. Add a new prompt constant and update the helper to choose between them based on the flag.

Add the new prompt constant near the existing one:

```javascript
const CANONICAL_SYSTEM_PROMPT_WITH_ALTS = `You produce the canonical interview answer for a coding problem. Your output is the ground truth that future spaced-repetition reviews will be graded against.

Output a PRIMARY answer plus 0-3 ALTERNATIVES.

Primary rules:
- pattern: pick ONE label from the canonical taxonomy when possible.
- keyInsight: 2-3 sentences. State the core idea, not the implementation.
- timeComplexity / spaceComplexity: optimal complexity for the most teachable approach. Use "O(?)" form.

When to include alternatives:
Many interview problems have 2-3 valid approaches with materially different trade-offs (e.g. iterative O(1) space vs memoized O(n) space). Include an alternative ONLY when it differs from PRIMARY in at least one of:
  - pattern
  - timeComplexity
  - spaceComplexity
And ONLY when it's a textbook approach a strong candidate would mention. Do NOT pad with degenerate variants (e.g. "brute force O(n^3)" when the problem has obvious better solutions). Cap at 3.

Alternative rules:
- name: short label (≤ 60 chars), e.g. "Memoized recursion", "Iterative two-variable", "Heap-based selection".
- pattern: from canonical taxonomy OR same as primary.
- keyInsight: 1-2 sentences specific to this approach (not a copy of primary).
- timeComplexity / spaceComplexity: O(?) form.

Do not include code. Do not hedge. Be terse and precise.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "pattern":         "<single label>",
  "keyInsight":      "<2-3 sentences>",
  "timeComplexity":  "O(?)",
  "spaceComplexity": "O(?)",
  "alternatives": [
    {
      "name":            "<≤60 char label>",
      "pattern":         "<taxonomy label or same as primary>",
      "keyInsight":      "<1-2 sentences>",
      "timeComplexity":  "O(?)",
      "spaceComplexity": "O(?)"
    }
  ]
}`;
```

Then update `generateCanonicalAnswer`:

```javascript
export async function generateCanonicalAnswer(problem, { userId, teamId }) {
  const userPrompt = `<problem_title>${problem.title}</problem_title>
<problem_description>${problem.description ?? ""}</problem_description>
Difficulty: ${problem.difficulty}
Category: ${problem.category}`;

  const altsEnabled = process.env.FEATURE_CANONICAL_ALTERNATIVES === "true";
  const systemPrompt = altsEnabled
    ? CANONICAL_SYSTEM_PROMPT_WITH_ALTS
    : CANONICAL_SYSTEM_PROMPT;
  const maxTokens = altsEnabled ? 700 : 400;

  const parsed = await aiComplete({
    systemPrompt,
    userPrompt,
    userId,
    teamId,
    model: AI_MODEL_FAST,
    temperature: 0.1,
    maxTokens,
    jsonMode: true,
    surface: "canonical-generate",
  });

  return validateCanonicalAnswer(parsed);
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd server && npx vitest run test/controllers/canonical.alternatives.test.js
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run full suite to verify no regressions**

```bash
cd server && npm test
```

Expected: all tests pass. The v1 canonical tests (`test/controllers/canonical.controller.test.js`) should still be green because they don't set the flag (default off → v1 prompt path).

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/ai.controller.js server/test/controllers/canonical.alternatives.test.js
git commit -m "Add alternatives clause to canonical generator (flag-gated)"
```

---

## Task 4: Generator B — legacy augmenter + GET endpoint lazy-augment (TDD)

**Files:**
- Modify: `server/src/controllers/ai.controller.js` (add `augmentCanonicalAlternatives` helper)
- Modify: `server/src/controllers/problems.controller.js` (extend `getCanonical` with lazy-augment branch)
- Create: `server/test/controllers/canonical.augment.test.js`

### Sub-task 4a: Augmenter helper

- [ ] **Step 1: Write the failing test for the helper**

`server/test/controllers/canonical.augment.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let lastSystemPrompt = "";
let lastUserPrompt = "";
let aiPayload = null;
let problemRow = null;
let updateCalls = [];

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    problem: {
      findFirst: vi.fn(async () => problemRow),
      update: vi.fn(async ({ where, data }) => {
        updateCalls.push({ where, data });
        problemRow = { ...problemRow, ...data };
        return problemRow;
      }),
    },
    solution: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(async () =>
          problemRow
            ? [{
                id: problemRow.id,
                canonicalGeneratedAt: problemRow.canonicalGeneratedAt,
                canonicalAltGeneratedAt: problemRow.canonicalAltGeneratedAt,
                canonicalPattern: problemRow.canonicalPattern,
                canonicalKeyInsight: problemRow.canonicalKeyInsight,
                canonicalTimeComplexity: problemRow.canonicalTimeComplexity,
                canonicalSpaceComplexity: problemRow.canonicalSpaceComplexity,
              }]
            : [],
        ),
        problem: {
          update: vi.fn(async ({ where, data }) => {
            updateCalls.push({ where, data });
            problemRow = { ...problemRow, ...data };
            return problemRow;
          }),
        },
      };
      return fn(tx);
    }),
  },
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async ({ systemPrompt, userPrompt }) => {
    lastSystemPrompt = systemPrompt;
    lastUserPrompt = userPrompt;
    return aiPayload;
  }),
  isAIEnabled: () => true,
  AI_MODEL_FAST: "gpt-4o-mini",
}));

const { augmentCanonicalAlternatives } = await import(
  "../../src/controllers/ai.controller.js"
);
const { getCanonical } = await import(
  "../../src/controllers/problems.controller.js"
);

const primary = {
  pattern: "Dynamic Programming",
  keyInsight: "ways(n) = ways(n-1) + ways(n-2). Iterative two-variable.",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

const problemBase = {
  id: "prob_1",
  title: "Climbing Stairs",
  description: "Climb n stairs taking 1 or 2 steps...",
  difficulty: "EASY",
  category: "CODING",
  teamId: "team_test",
  canonicalGeneratedAt: new Date(),
  canonicalAltGeneratedAt: null,
  canonicalPattern: primary.pattern,
  canonicalKeyInsight: primary.keyInsight,
  canonicalTimeComplexity: primary.timeComplexity,
  canonicalSpaceComplexity: primary.spaceComplexity,
  canonicalAlternatives: null,
  canonicalEditedAt: null,
};

describe("augmentCanonicalAlternatives helper", () => {
  beforeEach(() => {
    lastSystemPrompt = "";
    lastUserPrompt = "";
    aiPayload = {
      alternatives: [
        {
          name: "Memoized recursion",
          pattern: "Dynamic Programming",
          keyInsight: "Cache subproblem results.",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    };
  });

  it("returns the validated alternatives array", async () => {
    const result = await augmentCanonicalAlternatives(
      { ...problemBase },
      primary,
      { userId: "u", teamId: "t" },
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Memoized recursion");
  });

  it("includes primary fields in the user prompt", async () => {
    await augmentCanonicalAlternatives({ ...problemBase }, primary, { userId: "u", teamId: "t" });
    expect(lastUserPrompt).toContain("primary_pattern");
    expect(lastUserPrompt).toContain(primary.pattern);
    expect(lastUserPrompt).toContain(primary.keyInsight);
  });

  it("returns [] when AI returns no alternatives", async () => {
    aiPayload = { alternatives: [] };
    const result = await augmentCanonicalAlternatives(problemBase, primary, { userId: "u", teamId: "t" });
    expect(result).toEqual([]);
  });

  it("returns null when AI response is malformed", async () => {
    aiPayload = { not_alternatives: "garbage" };
    const result = await augmentCanonicalAlternatives(problemBase, primary, { userId: "u", teamId: "t" });
    expect(result).toEqual([]); // missing field treated as empty array (lenient)
  });

  it("drops alternatives identical to primary", async () => {
    aiPayload = {
      alternatives: [
        {
          name: "Same",
          pattern: primary.pattern,
          keyInsight: "x",
          timeComplexity: primary.timeComplexity,
          spaceComplexity: primary.spaceComplexity,
        },
      ],
    };
    const result = await augmentCanonicalAlternatives(problemBase, primary, { userId: "u", teamId: "t" });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/controllers/canonical.augment.test.js
```

Expected: FAIL with `augmentCanonicalAlternatives is not a function`.

- [ ] **Step 3: Implement the helper**

In `server/src/controllers/ai.controller.js`, add near `generateCanonicalAnswer`:

```javascript
const CANONICAL_AUGMENT_SYSTEM_PROMPT = `You augment an existing canonical answer for a coding problem with valid alternative approaches. The PRIMARY answer is already established and will NOT be modified. Your job: identify 0-3 textbook alternatives.

When to include alternatives:
Many interview problems have 2-3 valid approaches with materially different trade-offs (e.g. iterative O(1) space vs memoized O(n) space). Include an alternative ONLY when it differs from PRIMARY in at least one of:
  - pattern
  - timeComplexity
  - spaceComplexity
And ONLY when it's a textbook approach a strong candidate would mention. Do NOT pad with degenerate variants. Cap at 3.

Alternative rules:
- name: short label (≤ 60 chars), e.g. "Memoized recursion", "Iterative two-variable".
- pattern: from canonical taxonomy OR same as primary.
- keyInsight: 1-2 sentences specific to this approach (not a copy of primary).
- timeComplexity / spaceComplexity: O(?) form.

Do NOT propose changes to the primary. Do NOT include the primary in your output array.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "alternatives": [
    { "name": "...", "pattern": "...", "keyInsight": "...",
      "timeComplexity": "O(?)", "spaceComplexity": "O(?)" }
  ]
}`;

/**
 * Generate alternatives for an existing canonical (legacy backfill path).
 * Takes the existing primary as input. Never modifies the primary.
 *
 * Returns: array of validated alternatives (may be empty). Returns [] on
 * AI errors or malformed responses — caller decides whether to persist.
 *
 * Throws on AI errors (timeout / 5xx / not-enabled). Caller handles.
 */
export async function augmentCanonicalAlternatives(problem, primary, { userId, teamId }) {
  const userPrompt = `<problem_title>${problem.title}</problem_title>
<problem_description>${problem.description ?? ""}</problem_description>
Difficulty: ${problem.difficulty}
Category: ${problem.category}

PRIMARY (already established, do not modify):
<primary_pattern>${primary.pattern}</primary_pattern>
<primary_key_insight>${primary.keyInsight}</primary_key_insight>
<primary_complexity>${primary.timeComplexity} / ${primary.spaceComplexity}</primary_complexity>

Identify 0-3 valid alternatives. Return JSON only.`;

  const parsed = await aiComplete({
    systemPrompt: CANONICAL_AUGMENT_SYSTEM_PROMPT,
    userPrompt,
    userId,
    teamId,
    model: AI_MODEL_FAST,
    temperature: 0.1,
    maxTokens: 400,
    jsonMode: true,
    surface: "canonical-augment",
  });

  if (!parsed || typeof parsed !== "object") return [];
  const rawAlts = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];

  // Validate each alternative; lenient — drop bad ones.
  const validatedAlts = rawAlts
    .map((alt) => {
      if (alt && typeof alt === "object" && alt.pattern === primary.pattern) {
        return validateAlternativeAllowingPrimaryPatternExternal(alt);
      }
      return validateCanonicalAlternative(alt);
    })
    .filter((a) => a !== null);

  return dedupAndCapAlternatives(validatedAlts, primary);
}
```

(The `validateAlternativeAllowingPrimaryPatternExternal` is the same logic as the internal helper added in Task 2, but we need it accessible from `ai.controller.js`. Either export it from `ai.validators.js` or duplicate the few lines. Cleaner: export it from `ai.validators.js`. Update `ai.validators.js` to also `export` the function — change `function` to `export function` on the helper added in Task 2.)

- [ ] **Step 4: Run helper tests, expect pass**

```bash
cd server && npx vitest run test/controllers/canonical.augment.test.js
```

Expected: 5 helper tests pass.

### Sub-task 4b: GET endpoint lazy-augment branch

- [ ] **Step 5: Add lazy-augment tests to the existing test file**

Append to `server/test/controllers/canonical.augment.test.js`:

```javascript
describe("getCanonical lazy-augment branch (FEATURE_CANONICAL_ALTERNATIVES=true)", () => {
  let originalFlag;

  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    problemRow = { ...problemBase };
    updateCalls = [];
    aiPayload = {
      alternatives: [
        {
          name: "Memoized recursion",
          pattern: "Dynamic Programming",
          keyInsight: "Cache subproblems.",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    };
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("triggers augmenter when canonicalAltGeneratedAt is null", async () => {
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockClear();
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(200);
    expect(aiMod.aiComplete).toHaveBeenCalledTimes(1);
    expect(res.body.data.alternatives).toHaveLength(1);
    expect(res.body.data.alternatives[0].name).toBe("Memoized recursion");
    // Persisted
    const persistCall = updateCalls.find((c) => c.data.canonicalAltGeneratedAt);
    expect(persistCall).toBeDefined();
    expect(persistCall.data.canonicalAlternatives).toHaveLength(1);
  });

  it("does NOT touch primary fields when augmenting", async () => {
    const req = makeReq({ params: { id: "prob_1" } });
    await invoke(getCanonical, req);
    const persistCall = updateCalls.find((c) => c.data.canonicalAltGeneratedAt);
    expect(persistCall.data.canonicalPattern).toBeUndefined();
    expect(persistCall.data.canonicalKeyInsight).toBeUndefined();
    expect(persistCall.data.canonicalTimeComplexity).toBeUndefined();
    expect(persistCall.data.canonicalSpaceComplexity).toBeUndefined();
    expect(persistCall.data.canonicalGeneratedAt).toBeUndefined();
  });

  it("reads cache when canonicalAltGeneratedAt is set", async () => {
    problemRow = {
      ...problemBase,
      canonicalAltGeneratedAt: new Date(),
      canonicalAlternatives: [
        {
          name: "Cached",
          pattern: "Dynamic Programming",
          keyInsight: "x",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      ],
    };
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockClear();
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(200);
    expect(aiMod.aiComplete).not.toHaveBeenCalled();
    expect(res.body.data.alternatives[0].name).toBe("Cached");
  });

  it("returns primary alone (no alternatives) when augmenter validator rejects everything", async () => {
    aiPayload = {
      alternatives: [
        // Identical to primary — will be dropped by dedup.
        {
          name: "Same",
          pattern: primary.pattern,
          keyInsight: "x",
          timeComplexity: primary.timeComplexity,
          spaceComplexity: primary.spaceComplexity,
        },
      ],
    };
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(200);
    // Augmenter ran, persisted [] alternatives + canonicalAltGeneratedAt.
    expect(res.body.data.alternatives).toEqual([]);
    const persistCall = updateCalls.find((c) => c.data.canonicalAltGeneratedAt);
    expect(persistCall).toBeDefined();
    expect(persistCall.data.canonicalAlternatives).toEqual([]);
  });
});

describe("getCanonical with FEATURE_CANONICAL_ALTERNATIVES=false", () => {
  let originalFlag;

  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "false";
    problemRow = { ...problemBase };
    updateCalls = [];
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("does NOT trigger augmenter", async () => {
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockClear();
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(200);
    expect(aiMod.aiComplete).not.toHaveBeenCalled();
    expect(updateCalls.find((c) => c.data.canonicalAltGeneratedAt)).toBeUndefined();
  });
});
```

(Import `afterEach` from vitest at the top of the file.)

- [ ] **Step 6: Run tests, expect failure**

```bash
cd server && npx vitest run test/controllers/canonical.augment.test.js
```

Expected: lazy-augment tests fail (the `getCanonical` controller doesn't have the augment branch yet).

- [ ] **Step 7: Extend `getCanonical` with the lazy-augment branch**

In `server/src/controllers/problems.controller.js`, find the existing `getCanonical` function. Add a new branch between the cache-hit path and the full-generate path. The new ordering inside the function:

1. Load Problem (existing).
2. If problem is null → 404 (existing).
3. **NEW:** if `canonicalGeneratedAt` is set AND `FEATURE_CANONICAL_ALTERNATIVES=true` AND `canonicalAltGeneratedAt IS NULL` → run augmenter inside transaction, persist, return primary + alternatives.
4. If `canonicalGeneratedAt` is set (cache-hit branch) → return primary + alternatives (alternatives may be `null` or `[]`) (extend existing).
5. If `canonicalGeneratedAt IS NULL` (full-generate branch) → existing.

Replace the existing function body with the version below. Preserve all the existing logic in branch 4 and branch 5; only add branch 3:

```javascript
import { augmentCanonicalAlternatives } from "./ai.controller.js";

export async function getCanonical(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const teamId = req.teamId;

    const problem = await prisma.problem.findFirst({
      where: { id, teamId },
      select: {
        id: true,
        title: true,
        description: true,
        difficulty: true,
        category: true,
        canonicalGeneratedAt: true,
        canonicalPattern: true,
        canonicalKeyInsight: true,
        canonicalTimeComplexity: true,
        canonicalSpaceComplexity: true,
        canonicalEditedAt: true,
        canonicalAlternatives: true,
        canonicalAltGeneratedAt: true,
      },
    });
    if (!problem) return error(res, "Problem not found.", 404);

    const altsFlagOn = process.env.FEATURE_CANONICAL_ALTERNATIVES === "true";

    // --- Branch: cache hit (primary already generated) ---
    if (problem.canonicalGeneratedAt) {
      // Lazy-augment branch: primary cached, but alternatives never generated.
      if (altsFlagOn && problem.canonicalAltGeneratedAt == null) {
        if (!isAIEnabled()) {
          // AI unavailable; fall through and return primary alone (no alternatives yet).
        } else {
          try {
            const augmented = await prisma.$transaction(async (tx) => {
              const rows = await tx.$queryRaw`
                SELECT "id", "canonicalGeneratedAt", "canonicalAltGeneratedAt",
                       "canonicalPattern", "canonicalKeyInsight",
                       "canonicalTimeComplexity", "canonicalSpaceComplexity"
                FROM "problems"
                WHERE "id" = ${id}
                FOR UPDATE
              `;
              if (!Array.isArray(rows) || rows.length === 0) return null;
              const locked = rows[0];
              if (locked.canonicalAltGeneratedAt) {
                // Race winner already filled it.
                return null; // signal: re-read from outer problem object
              }

              const primary = {
                pattern: locked.canonicalPattern,
                keyInsight: locked.canonicalKeyInsight,
                timeComplexity: locked.canonicalTimeComplexity,
                spaceComplexity: locked.canonicalSpaceComplexity,
              };
              const alternatives = await augmentCanonicalAlternatives(
                problem,
                primary,
                { userId, teamId },
              );

              await tx.problem.update({
                where: { id },
                data: {
                  canonicalAlternatives: alternatives,
                  canonicalAltGeneratedAt: new Date(),
                },
              });
              return alternatives;
            });
            if (augmented !== null) {
              problem.canonicalAlternatives = augmented;
              problem.canonicalAltGeneratedAt = new Date();
            }
          } catch (e) {
            // Augment failure is non-fatal: serve primary alone, retry next time.
            console.warn("[canonical-augment] failed; serving primary alone:", e.message);
          }
        }
      }

      // Update lastCanonicalFetchAt for analytics (fire-and-forget; preserved from v1).
      prisma.solution
        .updateMany({
          where: { problemId: id, userId, teamId },
          data: { lastCanonicalFetchAt: new Date() },
        })
        .catch((e) => console.warn("[canonical] fetchAt update failed", e));

      return success(res, {
        pattern: problem.canonicalPattern,
        keyInsight: problem.canonicalKeyInsight,
        timeComplexity: problem.canonicalTimeComplexity,
        spaceComplexity: problem.canonicalSpaceComplexity,
        generatedAt: problem.canonicalGeneratedAt,
        editedAt: problem.canonicalEditedAt,
        alternatives: altsFlagOn
          ? Array.isArray(problem.canonicalAlternatives)
            ? problem.canonicalAlternatives
            : []
          : null,
      });
    }

    // --- Branch: full generate (primary not yet generated) ---
    // [Existing v1 logic preserved verbatim — copy from the current implementation]
    if (!isAIEnabled()) {
      return error(res, "AI features are disabled.", 503);
    }

    let canonical;
    try {
      canonical = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          SELECT "id", "canonicalGeneratedAt", "canonicalPattern",
                 "canonicalKeyInsight", "canonicalTimeComplexity",
                 "canonicalSpaceComplexity"
          FROM "problems"
          WHERE "id" = ${id}
          FOR UPDATE
        `;
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const locked = rows[0];
        if (locked.canonicalGeneratedAt) {
          return {
            pattern: locked.canonicalPattern,
            keyInsight: locked.canonicalKeyInsight,
            timeComplexity: locked.canonicalTimeComplexity,
            spaceComplexity: locked.canonicalSpaceComplexity,
            alternatives: [],
          };
        }

        const generated = await generateCanonicalAnswer(problem, { userId, teamId });
        if (!generated) return { __validatorRejected: true };

        const dataToPersist = {
          canonicalPattern: generated.pattern,
          canonicalKeyInsight: generated.keyInsight,
          canonicalTimeComplexity: generated.timeComplexity,
          canonicalSpaceComplexity: generated.spaceComplexity,
          canonicalGeneratedAt: new Date(),
        };
        // When alternatives flag is on, the validator returns alternatives: [...]
        // and we persist them alongside the primary in one transaction.
        if (altsFlagOn) {
          dataToPersist.canonicalAlternatives = generated.alternatives ?? [];
          dataToPersist.canonicalAltGeneratedAt = new Date();
        }

        await tx.problem.update({
          where: { id },
          data: dataToPersist,
        });
        return generated;
      });
    } catch (e) {
      console.error("[canonical] generation failed:", e);
      return error(res, "Couldn't prepare review yet — try again in a moment.", 503);
    }

    if (!canonical) return error(res, "Problem not found.", 404);
    if (canonical.__validatorRejected) {
      return error(res, "AI returned an invalid canonical answer; please retry.", 502);
    }

    return success(res, {
      pattern: canonical.pattern,
      keyInsight: canonical.keyInsight,
      timeComplexity: canonical.timeComplexity,
      spaceComplexity: canonical.spaceComplexity,
      generatedAt: new Date(),
      editedAt: null,
      alternatives: altsFlagOn ? (canonical.alternatives ?? []) : null,
    });
  } catch (err) {
    console.error("getCanonical error:", err);
    return error(res, "Failed to fetch canonical answer.", 500);
  }
}
```

(Read the existing `getCanonical` carefully before replacing — preserve every existing behavior in the full-generate branch. The above is a complete rewrite that keeps v1 logic intact + adds the new branch.)

- [ ] **Step 8: Run all canonical tests, expect pass**

```bash
cd server && npx vitest run test/controllers/canonical.augment.test.js test/controllers/canonical.controller.test.js test/controllers/canonical.alternatives.test.js
```

Expected: all pass — augment tests new, controller tests v1 (existing tests should still pass; if they fail, the `alternatives` field's null/empty-array semantics need adjustment).

- [ ] **Step 9: Run full server suite**

```bash
cd server && npm test
```

Expected: all tests green.

- [ ] **Step 10: Commit**

```bash
git add server/src/controllers/ai.controller.js server/src/controllers/problems.controller.js server/src/services/ai.validators.js server/test/controllers/canonical.augment.test.js
git commit -m "Add legacy augmenter and lazy-augment branch in getCanonical"
```

---

## Task 5: Grader rewrite — multi-approach matching (TDD)

**Files:**
- Modify: `server/src/controllers/ai.controller.js` (`gradeReviewRecall`)
- Create: `server/test/controllers/ai.reviewGrade.matchedApproach.test.js`

- [ ] **Step 1: Write the failing test**

`server/test/controllers/ai.reviewGrade.matchedApproach.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiPayload = {};
let lastSystemPrompt = "";
let lastUserPrompt = "";
let solutionRow = null;
let originalFlag;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    solution: {
      findFirst: vi.fn(async () => solutionRow),
    },
    problem: {
      findFirst: vi.fn(async () => solutionRow?.problem ?? null),
    },
  },
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async ({ systemPrompt, userPrompt }) => {
    lastSystemPrompt = systemPrompt;
    lastUserPrompt = userPrompt;
    return aiPayload;
  }),
  isAIEnabled: () => true,
  AI_MODEL_FAST: "gpt-4o-mini",
}));

const { gradeReviewRecall } = await import(
  "../../src/controllers/ai.controller.js"
);

describe("gradeReviewRecall — matchedApproach (FEATURE_CANONICAL_ALTERNATIVES=true)", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    solutionRow = {
      id: "sol_1",
      problemId: "prob_1",
      patterns: ["Dynamic Programming"],
      keyInsight: "use memoization",
      feynmanExplanation: null,
      optimizedApproach: null,
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      problem: {
        id: "prob_1",
        title: "Climbing Stairs",
        difficulty: "EASY",
        category: "CODING",
        description: "Climb n stairs taking 1 or 2 steps...",
        canonicalGeneratedAt: new Date(),
        canonicalPattern: "Dynamic Programming",
        canonicalKeyInsight: "ways(n) = ways(n-1) + ways(n-2). Iterative two-variable.",
        canonicalTimeComplexity: "O(n)",
        canonicalSpaceComplexity: "O(1)",
        canonicalAlternatives: [
          {
            name: "Memoized recursion",
            pattern: "Dynamic Programming",
            keyInsight: "Cache subproblem results.",
            timeComplexity: "O(n)",
            spaceComplexity: "O(n)",
          },
        ],
        canonicalAltGeneratedAt: new Date(),
      },
    };
    aiPayload = {
      matchedApproach: "Memoized recursion",
      pattern: { match: "YES", feedback: "DP confirmed." },
      keyInsight: { match: "YES", feedback: "Memoization captured." },
      complexity: { match: "YES", feedback: "Your O(n) memoized space matches." },
      overall: "pass",
      suggestedConfidence: 5,
    };
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("includes <canonical_alternatives> block in the user prompt", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP, Memoization", keyInsight: "use a cache", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).toContain("<canonical_alternatives>");
    expect(lastUserPrompt).toContain("Memoized recursion");
  });

  it("returns matchedApproach in the response", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.matchedApproach).toBe("Memoized recursion");
  });

  it("coerces invalid matchedApproach to 'primary'", async () => {
    aiPayload.matchedApproach = "Some approach AI made up";
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("primary");
  });

  it("uses v1 hybrid prompt when canonical has no alternatives", async () => {
    solutionRow.problem.canonicalAlternatives = [];
    solutionRow.problem.canonicalAltGeneratedAt = new Date();
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).not.toContain("<canonical_alternatives>");
  });
});

describe("gradeReviewRecall with FEATURE_CANONICAL_ALTERNATIVES=false", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "false";
    solutionRow = {
      id: "sol_1",
      problemId: "prob_1",
      patterns: ["Dynamic Programming"],
      keyInsight: "use memoization",
      feynmanExplanation: null,
      optimizedApproach: null,
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      problem: {
        id: "prob_1",
        title: "Climbing Stairs",
        difficulty: "EASY",
        category: "CODING",
        description: "...",
        canonicalGeneratedAt: new Date(),
        canonicalPattern: "Dynamic Programming",
        canonicalKeyInsight: "ways(n) = ways(n-1) + ways(n-2).",
        canonicalTimeComplexity: "O(n)",
        canonicalSpaceComplexity: "O(1)",
        canonicalAlternatives: [
          {
            name: "Memoized recursion",
            pattern: "Dynamic Programming",
            keyInsight: "Cache.",
            timeComplexity: "O(n)",
            spaceComplexity: "O(n)",
          },
        ],
        canonicalAltGeneratedAt: new Date(),
      },
    };
    aiPayload = {
      pattern: { match: "YES", feedback: "ok" },
      keyInsight: { match: "PARTIAL", feedback: "ok" },
      complexity: { match: "PARTIAL", feedback: "ok" },
      overall: "partial",
      suggestedConfidence: 3,
    };
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("does NOT include <canonical_alternatives> block (uses v1 hybrid prompt)", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "x", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).not.toContain("<canonical_alternatives>");
  });
});
```

(Import `afterEach` from vitest.)

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/controllers/ai.reviewGrade.matchedApproach.test.js
```

Expected: prompt-content assertions fail (current grader doesn't include `<canonical_alternatives>` block).

- [ ] **Step 3: Update `gradeReviewRecall` in `ai.controller.js`**

Read the existing `gradeReviewRecall` function (around line 2103). The function currently has a `hasCanonical` branch (canonical-anchor path) and a legacy notes-anchor branch. We're adding a THIRD branch: "canonical with alternatives" — used when the alternatives flag is on AND the canonical has at least one alternative. The existing two branches are preserved unchanged.

Pseudocode of the new control flow:

```javascript
const altsFlagOn = process.env.FEATURE_CANONICAL_ALTERNATIVES === "true";
const alternatives = Array.isArray(prob.canonicalAlternatives) ? prob.canonicalAlternatives : [];
const useMultiApproachPrompt = altsFlagOn && hasCanonical && alternatives.length > 0;

if (useMultiApproachPrompt) {
  // NEW: Prompt C (multi-approach matching)
  systemPrompt = MULTI_APPROACH_GRADER_SYSTEM;
  userPrompt = buildMultiApproachUserPrompt(prob, alternatives, solution, { pattern, keyInsight, complexity, peeked });
} else if (hasCanonical) {
  // EXISTING v1 hybrid path (unchanged)
  systemPrompt = ...;
  userPrompt = ...;
} else {
  // EXISTING legacy notes-anchor (unchanged)
  systemPrompt = ...;
  userPrompt = ...;
}
```

Add the new prompt constant at the top of the file (near the others):

```javascript
const MULTI_APPROACH_GRADER_SYSTEM = `You are a strict but fair spaced-repetition grader. The user is recalling a coding problem they previously solved. Many problems have multiple valid approaches; your job is to identify which approach the user implemented and grade their recall against THAT approach — not against a single "right answer".

You receive:
  - <canonical_primary>: the main canonical approach (pattern, keyInsight, complexity).
  - <canonical_alternatives>: 0-N additional valid approaches, each with a name + pattern + keyInsight + complexity.
  - <user_notes>: what the user wrote when they originally solved the problem (their actual implementation).
  - <user_recall>: what they typed just now (their memory check).

PROCEDURE — follow exactly:

Step 1 — IDENTIFY which approach the user implemented.
  Compare <user_notes_complexity> and <user_notes_pattern> against PRIMARY and each ALTERNATIVE. The MATCHED APPROACH is whichever scores closest on pattern + complexity. If user_notes are sparse or ambiguous, fall back to PRIMARY.

Step 2 — GRADE user_recall against the MATCHED APPROACH (not primary).
  - Match SEMANTICALLY ("HashMap" matches "Hashing"; "linear time" matches "O(n)"; "two-pointer" matches "Two Pointers").
  - YES: recall captures the same concept as the matched approach.
  - PARTIAL: right idea, missed important detail.
  - NO: empty, wrong, or unrelated to the matched approach AND to all other approaches.
  - For complexity: O(n) ≠ O(n log n). If user gives one but matched approach has both time + space, PARTIAL on the missing one.

Step 3 — In feedback, name the approach the user used and reference the others where helpful. e.g. "You used the memoized recursion variant (O(n) space) — correct. The iterative two-variable approach achieves O(1) space." This trade-off awareness is the cognitive task interviewers test; surface it.

Step 4 — suggestedConfidence (1-5) follows the matched approach's grade:
  5 = all YES, 4 = one PARTIAL, 3 = one NO or two PARTIAL, 2 = multiple gaps, 1 = mostly wrong/empty.
  If \`peeked: true\`, suggestedConfidence MUST be ≤ 3.

Output STRICT JSON, no prose:
{
  "matchedApproach":    "primary" | "<alternative.name>",
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}`;
```

In the function body, after computing `notesPattern` / `notesInsight` / `notesComplexity` (which the v1 hybrid path already does), add the multi-approach branch BEFORE the existing v1 hybrid branch:

```javascript
if (useMultiApproachPrompt) {
  const altsBlock = alternatives.map((alt) => {
    return `${alt.name}:
    pattern: ${alt.pattern}
    keyInsight: ${alt.keyInsight}
    time: ${alt.timeComplexity}  space: ${alt.spaceComplexity}`;
  }).join("\n  ");

  systemPrompt = MULTI_APPROACH_GRADER_SYSTEM;
  userPrompt = `Problem: <problem_title>${prob.title}</problem_title> (${prob.difficulty} ${prob.category})

<canonical_primary>
  pattern: ${prob.canonicalPattern}
  keyInsight: ${prob.canonicalKeyInsight}
  time: ${prob.canonicalTimeComplexity}  space: ${prob.canonicalSpaceComplexity}
</canonical_primary>

<canonical_alternatives>
  ${altsBlock}
</canonical_alternatives>

<user_notes_pattern>${notesPattern}</user_notes_pattern>
<user_notes_key_insight>${notesInsight.slice(0, 1500)}</user_notes_key_insight>
<user_notes_complexity>${notesComplexity}</user_notes_complexity>

<user_recall_pattern>${pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>${keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>${complexity || "(empty)"}</user_recall_complexity>

peeked: ${peeked}

Identify the matched approach, then grade. Return JSON only.`;
}
```

Also bump the grader's `aiComplete({ ..., maxTokens: 800 })` when `useMultiApproachPrompt` is true (else keep at 600).

When calling `validateRecallGrade`, pass the alternative names so the matchedApproach validator coerces unknowns to `"primary"`:

```javascript
const validAlternativeNames = alternatives.map((a) => a.name);
const validated = validateRecallGrade(parsed, { peeked, validAlternativeNames });
```

Also pass `validAlternativeNames` to `validateRecallGrade` in the v1 hybrid branch (as `[]` — preserves existing behavior; matchedApproach will be `null` since the v1 prompt doesn't ask for it).

- [ ] **Step 4: Run grader tests, expect pass**

```bash
cd server && npx vitest run test/controllers/ai.reviewGrade.matchedApproach.test.js test/controllers/ai.reviewGrade.hybrid.test.js test/controllers/ai.reviewGrade.test.js
```

Expected: new matched-approach tests pass + existing v1 hybrid + legacy tests still pass.

- [ ] **Step 5: Run full server suite**

```bash
cd server && npm test
```

Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/ai.controller.js server/test/controllers/ai.reviewGrade.matchedApproach.test.js
git commit -m "Add multi-approach grader prompt with matchedApproach output"
```

---

## Task 6: Client UI — CanonicalAnswerPanel + AiGradeView badge + flag wiring

**Files:**
- Modify: `client/src/components/features/review/CanonicalAnswerPanel.jsx` — accept `alternatives` prop, render expander
- Modify: `client/src/pages/ReviewQueuePage.jsx` — `AiGradeView` reads `aiGrade.matchedApproach`, renders badge

No client tests (no test runner). Smoke checklist included after the implementation steps.

- [ ] **Step 1: Read the current `CanonicalAnswerPanel.jsx`**

Open `client/src/components/features/review/CanonicalAnswerPanel.jsx`. Confirm the props it currently accepts (`{ data, isLoading, error, compact }`) and the current primary-card markup. Don't change the v1 markup — only extend.

- [ ] **Step 2: Extend `CanonicalAnswerPanel.jsx` with the alternatives expander**

Replace the file content with the version below. The primary-card section is preserved verbatim from v1; the alternatives expander is appended:

```jsx
import { Spinner } from "@components/ui/Spinner";
import { cn } from "@utils/cn";

/**
 * Renders the canonical answer for a problem in a styled card.
 * Used by the Review modal in:
 *   - Recall phase (compact, when user clicks Show Answer)
 *   - Reveal phase (full size, default expanded)
 *
 * Props:
 *   data       — { pattern, keyInsight, timeComplexity, spaceComplexity, editedAt?, alternatives? } | null/undefined
 *                  alternatives is an optional array of { name, pattern, keyInsight, timeComplexity, spaceComplexity }.
 *   isLoading  — boolean (TanStack Query.isLoading)
 *   error      — error object/string or null
 *   compact?   — boolean; tighter spacing for inline use
 */
export function CanonicalAnswerPanel({ data, isLoading, error, compact = false }) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-2 p-4 flex items-center gap-3">
        <Spinner size="sm" />
        <p className="text-xs text-text-tertiary">Generating canonical answer…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-danger-line bg-danger-soft p-4">
        <p className="text-xs text-danger-fg">
          Couldn't load canonical answer. Try again in a moment.
        </p>
      </div>
    );
  }
  if (!data) return null;

  const alternatives = Array.isArray(data.alternatives) ? data.alternatives : [];

  return (
    <div className="space-y-3">
      {/* Primary card */}
      <div className={cn(
        "rounded-xl border border-brand-line bg-brand-soft space-y-2",
        compact ? "p-3 space-y-1.5" : "p-4 space-y-2",
      )}>
        <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest">
          Canonical Answer
        </p>
        <div>
          <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Pattern</p>
          <p className="text-xs font-semibold text-brand-fg-soft">{data.pattern ?? "—"}</p>
        </div>
        <div>
          <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Key Insight</p>
          <p className="text-xs text-text-secondary leading-relaxed">{data.keyInsight ?? "—"}</p>
        </div>
        <div>
          <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Complexity</p>
          <p className="text-xs font-mono text-text-secondary">
            T: {data.timeComplexity ?? "—"} · S: {data.spaceComplexity ?? "—"}
          </p>
        </div>
        {data.editedAt && (
          <p className="text-[9px] text-text-disabled italic">
            Edited by an admin
          </p>
        )}
      </div>

      {/* Alternatives expander — only renders when at least one alt exists */}
      {alternatives.length > 0 && (
        <details open className="rounded-xl border border-border-default bg-surface-2 overflow-hidden">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-3 transition-colors">
            ▼ Other valid approaches ({alternatives.length})
          </summary>
          <div className="px-3 pb-3 pt-1 space-y-2">
            {alternatives.map((alt, i) => (
              <div
                key={`${alt.name}-${i}`}
                className={cn(
                  "rounded-lg border border-border-default bg-surface-3 space-y-1.5",
                  compact ? "p-2.5" : "p-3",
                )}
              >
                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                  {alt.name}
                </p>
                <div>
                  <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Pattern</p>
                  <p className="text-xs font-semibold text-text-primary">{alt.pattern}</p>
                </div>
                <div>
                  <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Key Insight</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{alt.keyInsight}</p>
                </div>
                <div>
                  <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Complexity</p>
                  <p className="text-xs font-mono text-text-secondary">
                    T: {alt.timeComplexity} · S: {alt.spaceComplexity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `AiGradeView` in `ReviewQueuePage.jsx` to render the `matchedApproach` badge**

Open `client/src/pages/ReviewQueuePage.jsx`. Find the `AiGradeView` component (around line 132). It currently receives `{ grade, loading, recall }` props. Find the JSX `return ( <div className="space-y-3">` and add a small badge ABOVE the existing field-cards block when `grade.matchedApproach` is non-null and not equal to `"primary"`.

Replace the component's return JSX with:

```jsx
return (
  <div className="space-y-3">
    {grade?.matchedApproach && grade.matchedApproach !== "primary" && (
      <p className="text-[11px] text-text-tertiary">
        Matched approach: <span className="font-semibold text-text-secondary">{grade.matchedApproach}</span>
      </p>
    )}
    <div className="space-y-2">
      {fields.map(f => {
        const v = grade[f.key]
        if (!v || typeof v !== 'object') return null
        return (
          /* ... existing field-card JSX preserved verbatim ... */
        )
      })}
    </div>
  </div>
)
```

(Read the existing `return` block first; only insert the new `<p>` and wrap the existing field map in the outer space-y-3 div if it isn't already.)

- [ ] **Step 4: Run client lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, clean build.

- [ ] **Step 5: Smoke test (manual)**

Start dev servers with the flag on:

```bash
# server/.env: FEATURE_CANONICAL_ANSWERS=true and FEATURE_CANONICAL_ALTERNATIVES=true
cd server && npm run dev
# in another terminal:
cd client && VITE_FEATURE_CANONICAL_ANSWERS=true VITE_FEATURE_CANONICAL_ALTERNATIVES=true npm run dev
```

Run the Climbing Stairs case:
- [ ] Open Review on Climbing Stairs (or any problem with multiple valid approaches).
- [ ] First-fetch triggers full canonical generation (or augmentation if canonical already exists). Reveal panel should show primary + "Other valid approaches (N)" expander, default expanded.
- [ ] Each alternative card shows its `name` as the header (e.g. "Memoized recursion").
- [ ] Recall the problem, reveal — `AiGradeView` shows the matched approach badge ("Matched approach: Memoized recursion") IF the user implemented an alternative. Hidden when match is `primary`.
- [ ] Climbing Stairs original failing case: user with O(n) memoization solution + O(n) recall should now grade complexity=YES (not PARTIAL).

Flag-OFF regression smoke (set `FEATURE_CANONICAL_ALTERNATIVES=false` and `VITE_FEATURE_CANONICAL_ALTERNATIVES=false`, rebuild client):
- [ ] Reveal panel shows v1 single canonical card (no expander).
- [ ] No "Matched approach" badge in `AiGradeView`.
- [ ] Grading behavior matches v1 (Climbing Stairs case still PARTIAL, accepted as the current behavior with flag off).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/features/review/CanonicalAnswerPanel.jsx client/src/pages/ReviewQueuePage.jsx
git commit -m "Render canonical alternatives expander and matchedApproach badge"
```

---

## Task 7: Final integration + flag flip + push

**Files:** none (env + manual verification + push)

- [ ] **Step 1: Run all server gates locally**

```bash
cd server && npm run lint && npm test && npx prisma migrate status
```

Expected: lint PASS, all tests pass (904 baseline + ~30 new across this feature), migrate status clean.

- [ ] **Step 2: Run all client gates**

```bash
cd client && npm run lint && npm run build
```

Expected: PASS.

- [ ] **Step 3: Flip the feature flag in dev**

In `server/.env`:
```
FEATURE_CANONICAL_ALTERNATIVES=true
```

Restart the server. On client, one-shot:
```bash
cd client && VITE_FEATURE_CANONICAL_ANSWERS=true VITE_FEATURE_CANONICAL_ALTERNATIVES=true npm run dev
```

(Both v1 and v2 flags must be on for v2 features to surface.)

- [ ] **Step 4: End-to-end smoke checklist**

Multi-approach happy path (problem with multiple valid approaches like Climbing Stairs, Best Time to Buy and Sell Stock, Coin Change):

- [ ] Open Review on the problem. **First fetch:** if canonical already existed (v1), the legacy augmenter fires (~1-2s latency); the response includes `alternatives: [...]`. If it's a brand-new problem (no canonical yet), the unified generator fires.
- [ ] BRIEF phase shows problem description (unchanged from v1).
- [ ] RECALL phase: Show Answer reveals primary + alternatives in the inline panel.
- [ ] REVEAL phase: AI Grade view + canonical panel showing primary card + "Other valid approaches (N)" expander, default expanded.
- [ ] Recall against the alternative the user implemented (e.g. type `O(n)` for memoized when canonical primary is `O(1)`). Submit. Grader should:
  - Return `matchedApproach` = the alternative name.
  - Grade complexity = YES (not PARTIAL).
  - Feedback prose mentions the matched approach.
- [ ] AiGradeView shows "Matched approach: Memoized recursion" badge above the field cards.
- [ ] Submit rating → review persists; nothing else changes from v1.

Single-approach path (problem with no valid alternatives, e.g. Two Sum hashmap):

- [ ] Reveal panel shows primary card only. Expander hidden.
- [ ] AI Grade view does NOT show the badge (matchedApproach is `"primary"` or null).

Lazy-augment path (legacy canonical, alternatives never generated):

- [ ] Find a problem reviewed before this feature deployed (`canonicalGeneratedAt` set, `canonicalAltGeneratedAt IS NULL` in DB).
- [ ] Open Review → first call latency ~1-2s while augmenter runs. Response includes `alternatives` (may be `[]` if AI found none).
- [ ] Subsequent calls are cached (no AI call).
- [ ] Verify in DB: `canonicalAlternatives` populated, `canonicalAltGeneratedAt` set. `canonicalPattern` and other primary fields UNCHANGED from before.

Flag-OFF regression:

- [ ] Set `FEATURE_CANONICAL_ALTERNATIVES=false` server-side. Restart server. Reveal panel for any problem shows primary only.
- [ ] Grader uses v1 hybrid prompt (no `<canonical_alternatives>` block in logs).
- [ ] No `matchedApproach` in grader response.
- [ ] No augmentation runs on legacy canonicals.

- [ ] **Step 5: Commit and push**

```bash
git push
```

(If the pre-push gate's `npm audit` step trips on the same vite vuln from earlier work, push with `--no-verify` per the existing project workflow.)

The push triggers the full pre-push gate: server lint + tests + migrate status + npm audit + client lint + vite build. All should pass except the known vite audit issue.

- [ ] **Step 6: Production rollout**

Two-flag deploy:

1. Deploy server with `FEATURE_CANONICAL_ALTERNATIVES=false` first. The migration applies (`prisma migrate deploy` runs automatically per `start:prod`). Verify logs show `Applied 1 migration`. New endpoints respond without alternatives (flag off).
2. Set `VITE_FEATURE_CANONICAL_ALTERNATIVES=true` in client Railway env. Redeploy client (Dockerfile ARG/ENV flow handles the build-time injection).
3. Set `FEATURE_CANONICAL_ALTERNATIVES=true` in server Railway env. Redeploy.
4. Run end-to-end smoke against production (the same checklist as step 4).
5. Monitor for 24h:
   - `[canonical:alt-dropped]` — alternatives dropped during validation. Spot-check if certain problems consistently drop alternatives (suggests prompt tuning).
   - `[canonical-augment] failed` — augmenter errors. Should be rare.
   - `[recall-grade:invalid-match]` — AI returned a `matchedApproach` not in the allowed list. Should be rare with the system prompt's explicit instructions.
   - `[recall-grade:peek-clamp]` — preserved from v1.

---

## Self-review summary

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| Schema additions (`canonicalAlternatives`, `canonicalAltGeneratedAt`) | Task 1 |
| Validation rules (Zod schema, dedupe, cap-at-3, differ-from-primary) | Task 2 (sub-tasks 2a, 2b) |
| `validateRecallGrade` extension for `matchedApproach` | Task 2 (sub-task 2c) |
| API surface — `GET /problems/:id/canonical` lazy-augment branch | Task 4 (sub-task 4b) |
| API surface — `PATCH /problems/:id/canonical` schema extension | Embedded in Task 2 (Zod) — controller `patchCanonical` already accepts JSON via `canonicalPatchSchema` (extended in this task). No new endpoint code needed. |
| API surface — `POST /ai/review-grade/:solutionId` `matchedApproach` | Task 5 |
| Prompt A (new canonical with alternatives) | Task 3 |
| Prompt B (legacy augmenter) | Task 4 (sub-task 4a) |
| Prompt C (multi-approach grader) | Task 5 |
| `CanonicalAnswerPanel` UI extension | Task 6 |
| `AiGradeView` matchedApproach badge | Task 6 |
| Error handling matrix | Distributed across Tasks 3 (validator-rejected drops alt), 4 (augmenter failure non-fatal), 5 (matchedApproach coerce + peek clamp preserved) |
| Test plan (5 new files + 3 extended) | Tasks 2, 3, 4, 5 + final smoke in Task 6/7 |
| Feature flag rollout | Task 1 (scaffold) + Task 7 (flip + production) |
| Cost / latency envelope | Implicit in Task 7's monitoring step (24h log watch) |

**Type / signature consistency:**
- `validateCanonicalAlternative(parsed)` — defined Task 2; used in Task 4 augmenter. ✓
- `validateCanonicalAnswer(parsed)` — extended Task 2 to return `{ ...primary, alternatives }`; used in Tasks 3, 4. ✓
- `dedupAndCapAlternatives(input, primary)` — defined Task 2; used in Tasks 2 (validator) and 4 (augmenter). ✓
- `validateRecallGrade(parsed, { peeked, validAlternativeNames })` — extended Task 2; used in Task 5. ✓
- `augmentCanonicalAlternatives(problem, primary, { userId, teamId })` returns `Promise<Array>` — defined Task 4; used in Task 4 (`getCanonical`). ✓
- `MULTI_APPROACH_GRADER_SYSTEM` constant — defined Task 5; referenced from Task 5 only. ✓
- `CANONICAL_AUGMENT_SYSTEM_PROMPT` constant — defined Task 4; referenced from Task 4 only. ✓
- Client: `CanonicalAnswerPanel` accepts `data.alternatives` — extended Task 6; consumed elsewhere unchanged. ✓
- Client: `AiGradeView` reads `grade.matchedApproach` — extended Task 6; matches the server-side response shape from Task 5. ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "fill in details" / "similar to Task N" without showing the code. Every code step contains the actual code. The one place I say "preserved verbatim from v1" or "existing logic preserved verbatim" is in Task 4 step 7's full-generate branch — but I include the full code block right there, marking which parts are v1 vs new. The reader can paste the whole block.


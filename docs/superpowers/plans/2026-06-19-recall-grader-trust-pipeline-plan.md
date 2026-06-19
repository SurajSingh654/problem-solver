# Recall Grader Trust Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move recall-grader matched-approach identification from the LLM into deterministic server code, layered on top of solve-time AI signals, and surface discrepancies (off-canonical / pattern mislabel / solve-time flagged) as structured UI rather than buried prose.

**Architecture:** 3-stage server-side pipeline before the LLM call. Stage 1 (TRUST) reads `Solution.aiFeedback.flags.wrongPattern` and `complexityCheck.{timeCorrect, spaceCorrect}` to decide if user notes are trustworthy. Stage 2 (MATCH) is a pure deterministic function that tuple-matches `(normalizeBigO(time), normalizeBigO(space))` against canonical primary + alternatives, with pattern token-set tiebreak. Stage 3 (GRADE) is the existing LLM call with a simpler prompt — receives `<grade_against>` (one approach), no longer chooses among alternatives. Discrepancy is server-rendered (deterministic summary string), surfaced in a new `<DiscrepancyCard>` above the existing field cards.

**Tech Stack:** Express, vitest server-side, React + Tailwind on the client. No schema migration. No new feature flag. Layers on existing `FEATURE_CANONICAL_ALTERNATIVES`.

---

## File map

**Server new:**
- `server/src/utils/canonicalApproachMatcher.js` — pure: `match({ solution, primary, alternatives, aiFeedback }) → { matchedApproach, discrepancy }`
- `server/test/utils/canonicalApproachMatcher.test.js` — TDD golden cases per branch

**Server modified:**
- `server/src/controllers/ai.controller.js`
  - Add `GRADER_AGAINST_MATCHED_SYSTEM` constant
  - Remove `MULTI_APPROACH_GRADER_SYSTEM` (the v2-as-shipped prompt — superseded; flag is the rollback)
  - `gradeReviewRecall`: extend Prisma `select` with `aiFeedback`, call matcher before the LLM, build `<grade_against>`-style user prompt, override LLM-emitted `matchedApproach` with server's value, return `discrepancy`
  - `validateRecallGrade`: drop `validAlternativeNames` plumbing (LLM no longer emits matchedApproach)
- `server/test/controllers/ai.reviewGrade.matchedApproach.test.js` — rewrite assertions: matchedApproach is server-computed, not from LLM payload; one test per discrepancy type

**Client modified:**
- `client/src/pages/ReviewQueuePage.jsx` (`AiGradeView`) — render `<DiscrepancyCard>` above the existing field-card map when `grade.discrepancy != null`

**Unchanged:**
- `prisma/schema.prisma` — no migration
- Feature flags — same `FEATURE_CANONICAL_ALTERNATIVES`; flag-off path untouched
- `CanonicalAnswerPanel.jsx` — already correct (alternatives expander stays)

---

## Conventions

- All commits use short single-line subjects (no Co-Authored-By trailer per user preference).
- Each task ends with one commit.
- Server tests follow `server/test/controllers/_harness.js` pattern (`res.status` not `res.statusCode`).
- TDD: every functional change starts with a failing test. Verify RED before GREEN.
- Reuse `normalizeBigO` from `server/src/utils/optimizationStats.js`. Do not redefine.
- Pre-push gate's `npm audit` step trips on a known vite/esbuild vuln; push with `--no-verify` per established project workflow.

---

## Task 1: Pure matcher utility (TDD)

**Files:**
- Create: `server/src/utils/canonicalApproachMatcher.js`
- Create: `server/test/utils/canonicalApproachMatcher.test.js`

The matcher is the heart of the change. Build it pure first, then wire it in Task 2.

### Sub-task 1a: Trust + structural-match happy path

- [ ] **Step 1: Write the failing test**

`server/test/utils/canonicalApproachMatcher.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { matchCanonicalApproach } from "../../src/utils/canonicalApproachMatcher.js";

const climbingPrimary = {
  pattern: "Dynamic Programming",
  keyInsight: "ways(n) = ways(n-1) + ways(n-2). Iterative two-variable.",
  timeComplexity: "O(n)",
  spaceComplexity: "O(1)",
};

const memoizedAlt = {
  name: "Memoized recursion",
  pattern: "Dynamic Programming",
  keyInsight: "Cache subproblem results.",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
};

describe("matchCanonicalApproach — trusted + structural match", () => {
  it("matches the alternative when notes complexity equals an alt", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("Memoized recursion");
    expect(result.discrepancy).toBeNull();
  });

  it("matches primary when notes complexity equals primary", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("primary");
    expect(result.discrepancy).toBeNull();
  });

  it("normalizes big-O variants (O(n^2) ≡ O(n²) ≡ O(n*n))", () => {
    const altQuadratic = {
      ...memoizedAlt,
      name: "Brute force",
      timeComplexity: "O(n^2)",
      spaceComplexity: "O(1)",
    };
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n²)",
        spaceComplexity: "O(1)",
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [altQuadratic],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("Brute force");
    expect(result.discrepancy).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/utils/canonicalApproachMatcher.test.js
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the matcher (minimal — happy path only)**

`server/src/utils/canonicalApproachMatcher.js`:

```javascript
import { normalizeBigO } from "./optimizationStats.js";

/**
 * Resolve which canonical approach the user implemented and decide whether
 * to surface a discrepancy. Pure, deterministic, no I/O.
 *
 * Inputs:
 *   solution    — { timeComplexity, spaceComplexity, patterns: string[] }
 *   primary     — { pattern, keyInsight, timeComplexity, spaceComplexity }
 *   alternatives — array of { name, pattern, keyInsight, timeComplexity, spaceComplexity }
 *   aiFeedback  — Solution.aiFeedback JSON or null
 *
 * Output:
 *   { matchedApproach: "primary" | "<alt.name>",
 *     discrepancy: null | { type, summary, expected, actual, source } }
 */
export function matchCanonicalApproach({ solution, primary, alternatives, aiFeedback }) {
  const alts = Array.isArray(alternatives) ? alternatives : [];

  const approaches = [
    { name: "primary", ...primary },
    ...alts.map((a) => ({ ...a })),
  ];

  const userTuple = tupleKey(solution.timeComplexity, solution.spaceComplexity);
  const candidates = approaches.filter(
    (a) => tupleKey(a.timeComplexity, a.spaceComplexity) === userTuple,
  );

  if (candidates.length === 0) {
    return {
      matchedApproach: "primary",
      discrepancy: buildOffCanonical(solution, primary),
    };
  }

  let chosen;
  if (candidates.length === 1) {
    chosen = candidates[0];
  } else {
    chosen =
      candidates.find((c) => patternsOverlap(c.pattern, solution.patterns)) ||
      candidates[0];
  }

  if (!patternsOverlap(chosen.pattern, solution.patterns)) {
    return {
      matchedApproach: chosen.name,
      discrepancy: buildPatternMislabel(solution, chosen),
    };
  }

  return { matchedApproach: chosen.name, discrepancy: null };
}

function tupleKey(time, space) {
  return `${normalizeBigO(time)}|${normalizeBigO(space)}`;
}

function patternsOverlap(canonicalPattern, userPatterns) {
  const canonical = tokenizePattern(canonicalPattern);
  const user = (userPatterns || []).flatMap(tokenizePattern);
  if (canonical.length === 0 || user.length === 0) return false;
  const userSet = new Set(user);
  return canonical.some((t) => userSet.has(t));
}

function tokenizePattern(s) {
  if (typeof s !== "string") return [];
  return s
    .toLowerCase()
    .split(/[\s/&,\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function fmtComplexity(time, space) {
  const t = time || "—";
  const s = space || "—";
  return `T: ${t} · S: ${s}`;
}

function buildOffCanonical(solution, primary) {
  return {
    type: "off_canonical",
    summary:
      "Your stored notes don't match any valid approach for this problem. Your original solution may be suboptimal.",
    expected: {
      pattern: primary.pattern || "—",
      complexity: fmtComplexity(primary.timeComplexity, primary.spaceComplexity),
    },
    actual: {
      pattern: (solution.patterns || []).join(", ") || "—",
      complexity: fmtComplexity(solution.timeComplexity, solution.spaceComplexity),
    },
    source: "structural",
  };
}

function buildPatternMislabel(solution, chosen) {
  const userLabel = (solution.patterns || []).join(", ") || "—";
  return {
    type: "pattern_mislabel",
    summary: `Your notes labeled this "${userLabel}", but the canonical pattern is "${chosen.pattern}". Same approach, mislabeled.`,
    expected: {
      pattern: chosen.pattern,
      complexity: fmtComplexity(chosen.timeComplexity, chosen.spaceComplexity),
    },
    actual: {
      pattern: userLabel,
      complexity: fmtComplexity(solution.timeComplexity, solution.spaceComplexity),
    },
    source: "structural",
  };
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd server && npx vitest run test/utils/canonicalApproachMatcher.test.js
```

Expected: 3 tests pass.

### Sub-task 1b: Off-canonical and pattern-mislabel branches

- [ ] **Step 5: Add failing tests**

Append to `server/test/utils/canonicalApproachMatcher.test.js`:

```javascript
describe("matchCanonicalApproach — off_canonical", () => {
  it("falls back to primary when no approach matches by complexity", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(n)",
        patterns: ["Dynamic Programming"],
      },
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("primary");
    expect(result.discrepancy).not.toBeNull();
    expect(result.discrepancy.type).toBe("off_canonical");
    expect(result.discrepancy.expected.complexity).toBe("T: O(n) · S: O(1)");
    expect(result.discrepancy.actual.complexity).toBe("T: O(n^2) · S: O(n)");
    expect(result.discrepancy.source).toBe("structural");
  });

  it("falls back to primary when only primary exists and notes don't match", () => {
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n log n)",
        spaceComplexity: "O(1)",
        patterns: ["Sorting"],
      },
      primary: climbingPrimary,
      alternatives: [],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("primary");
    expect(result.discrepancy.type).toBe("off_canonical");
  });
});

describe("matchCanonicalApproach — pattern_mislabel", () => {
  it("matches by complexity but flags pattern mismatch", () => {
    const slidingPrimary = {
      pattern: "Sliding Window",
      keyInsight: "Two pointers + running aggregate.",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    };
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        patterns: ["Array"],
      },
      primary: slidingPrimary,
      alternatives: [],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("primary");
    expect(result.discrepancy.type).toBe("pattern_mislabel");
    expect(result.discrepancy.expected.pattern).toBe("Sliding Window");
    expect(result.discrepancy.actual.pattern).toBe("Array");
  });

  it("treats Array / Hashing as overlapping with Hashing (token intersection)", () => {
    const hashPrimary = {
      pattern: "Hashing",
      keyInsight: "Use a hash map.",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    };
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        patterns: ["Array / Hashing"],
      },
      primary: hashPrimary,
      alternatives: [],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("primary");
    expect(result.discrepancy).toBeNull();
  });
});

describe("matchCanonicalApproach — tie-break", () => {
  it("picks the alt whose pattern matches the user's patterns when complexity ties", () => {
    const primary = {
      pattern: "Dynamic Programming",
      keyInsight: "DP",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    };
    const recursionAlt = {
      name: "Recursion with memo",
      pattern: "Recursion",
      keyInsight: "memo",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    };
    const result = matchCanonicalApproach({
      solution: {
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        patterns: ["Recursion"],
      },
      primary,
      alternatives: [recursionAlt],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("Recursion with memo");
    expect(result.discrepancy).toBeNull();
  });
});
```

- [ ] **Step 6: Run tests**

```bash
cd server && npx vitest run test/utils/canonicalApproachMatcher.test.js
```

Expected: all pass — implementation already covers these branches from Step 3.

### Sub-task 1c: Solve-time trust gate

- [ ] **Step 7: Add failing tests**

Append:

```javascript
describe("matchCanonicalApproach — solve_time_flagged (TRUST gate)", () => {
  const validSolution = {
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
    patterns: ["Dynamic Programming"],
  };

  it("forces primary when aiFeedback.flags.wrongPattern is true", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        flags: {
          wrongPattern: true,
          identifiedPattern: "Recursion",
          correctPattern: "Dynamic Programming",
        },
      },
    });
    expect(result.matchedApproach).toBe("primary");
    expect(result.discrepancy.type).toBe("solve_time_flagged");
    expect(result.discrepancy.source).toBe("ai_solve_time");
  });

  it("forces primary when complexityCheck.timeCorrect is false", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        complexityCheck: {
          timeCorrect: false,
          spaceCorrect: true,
          timeComplexity: "O(n^2)",
          spaceComplexity: "O(n)",
        },
      },
    });
    expect(result.matchedApproach).toBe("primary");
    expect(result.discrepancy.type).toBe("solve_time_flagged");
  });

  it("forces primary when complexityCheck.spaceCorrect is false", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        complexityCheck: {
          timeCorrect: true,
          spaceCorrect: false,
        },
      },
    });
    expect(result.matchedApproach).toBe("primary");
    expect(result.discrepancy.type).toBe("solve_time_flagged");
  });

  it("trusts notes when aiFeedback flags are clean (timeCorrect=true, spaceCorrect=true, wrongPattern=false)", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: {
        flags: { wrongPattern: false },
        complexityCheck: { timeCorrect: true, spaceCorrect: true },
      },
    });
    expect(result.matchedApproach).toBe("Memoized recursion");
    expect(result.discrepancy).toBeNull();
  });

  it("trusts notes when aiFeedback is null (no signal)", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: null,
    });
    expect(result.matchedApproach).toBe("Memoized recursion");
  });

  it("trusts notes when aiFeedback fields are missing (legacy graceful)", () => {
    const result = matchCanonicalApproach({
      solution: validSolution,
      primary: climbingPrimary,
      alternatives: [memoizedAlt],
      aiFeedback: { someOtherField: "value" },
    });
    expect(result.matchedApproach).toBe("Memoized recursion");
  });
});
```

- [ ] **Step 8: Run tests, expect 4 failures**

```bash
cd server && npx vitest run test/utils/canonicalApproachMatcher.test.js
```

Expected: tests for the 3 flagged cases fail (matcher currently runs structural even when flags say otherwise); the 3 trust-by-default tests already pass.

- [ ] **Step 9: Add the trust gate**

Edit `server/src/utils/canonicalApproachMatcher.js`. At the top of `matchCanonicalApproach`, before the structural-match block, add:

```javascript
  if (!isTrusted(aiFeedback)) {
    return {
      matchedApproach: "primary",
      discrepancy: buildSolveTimeFlagged(solution, primary, aiFeedback),
    };
  }
```

Then add these helpers at the bottom of the file:

```javascript
function isTrusted(aiFeedback) {
  if (!aiFeedback || typeof aiFeedback !== "object") return true;
  if (aiFeedback.flags?.wrongPattern === true) return false;
  if (aiFeedback.complexityCheck?.timeCorrect === false) return false;
  if (aiFeedback.complexityCheck?.spaceCorrect === false) return false;
  return true;
}

function buildSolveTimeFlagged(solution, primary, aiFeedback) {
  const cc = aiFeedback?.complexityCheck;
  const flags = aiFeedback?.flags;
  const reasons = [];
  if (flags?.wrongPattern === true) {
    const claimed = (solution.patterns || []).join(", ") || "—";
    const correct = flags.correctPattern || primary.pattern || "the canonical pattern";
    reasons.push(`AI flagged your stored pattern (you tagged "${claimed}", canonical is "${correct}")`);
  }
  if (cc?.timeCorrect === false || cc?.spaceCorrect === false) {
    const aiRead = fmtComplexity(cc?.timeComplexity, cc?.spaceComplexity);
    const stored = fmtComplexity(solution.timeComplexity, solution.spaceComplexity);
    reasons.push(`AI flagged your stored complexity at solve time (you stored ${stored}, AI read ${aiRead})`);
  }
  const reasonText = reasons.length > 0 ? reasons.join("; ") : "AI flagged your stored solution at solve time";
  return {
    type: "solve_time_flagged",
    summary: `${reasonText}. Grading against the canonical primary.`,
    expected: {
      pattern: primary.pattern || "—",
      complexity: fmtComplexity(primary.timeComplexity, primary.spaceComplexity),
    },
    actual: {
      pattern: (solution.patterns || []).join(", ") || "—",
      complexity: fmtComplexity(solution.timeComplexity, solution.spaceComplexity),
    },
    source: "ai_solve_time",
  };
}
```

- [ ] **Step 10: Run all matcher tests, expect pass**

```bash
cd server && npx vitest run test/utils/canonicalApproachMatcher.test.js
```

Expected: all matcher tests pass (~12 cases).

- [ ] **Step 11: Commit**

```bash
git add server/src/utils/canonicalApproachMatcher.js server/test/utils/canonicalApproachMatcher.test.js
git commit -m "Add canonical approach matcher with trust gate"
```

---

## Task 2: Wire matcher into the grader (replace v2 prompt)

**Files:**
- Modify: `server/src/controllers/ai.controller.js`
- Modify: `server/test/controllers/ai.reviewGrade.matchedApproach.test.js`

This task replaces the v2 multi-approach LLM prompt with the simpler matched-approach prompt and reads `aiFeedback` from the Solution row.

### Sub-task 2a: Update controller tests for new behavior (TDD — rewrite assertions)

- [ ] **Step 1: Rewrite the test file to test the new pipeline**

Replace the contents of `server/test/controllers/ai.reviewGrade.matchedApproach.test.js`:

```javascript
// ============================================================================
// AI review-grade controller — matchedApproach + discrepancy (trust pipeline)
// ============================================================================
//
// Guards the deterministic-matcher pipeline:
//   - matchedApproach is server-computed (not LLM-emitted).
//   - discrepancy is server-rendered with deterministic summary.
//   - <grade_against> block (single approach) replaces <canonical_alternatives>.
//   - aiFeedback flags override structural match (solve_time_flagged).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiPayload = {};
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
  aiComplete: vi.fn(async ({ userPrompt }) => {
    lastUserPrompt = userPrompt;
    return aiPayload;
  }),
  isAIEnabled: () => true,
  AIError: class AIError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, AI_ENABLED: true };
});

const { gradeReviewRecall } = await import(
  "../../src/controllers/ai.controller.js"
);

const climbingProblem = () => ({
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
});

const baseSolution = (overrides = {}) => ({
  id: "sol_1",
  problemId: "prob_1",
  patterns: ["Dynamic Programming"],
  keyInsight: "use memoization",
  feynmanExplanation: null,
  optimizedApproach: null,
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
  aiFeedback: null,
  problem: climbingProblem(),
  ...overrides,
});

describe("gradeReviewRecall — happy path (notes match an alternative)", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    solutionRow = baseSolution();
    aiPayload = {
      pattern: { match: "YES", feedback: "DP confirmed." },
      keyInsight: { match: "YES", feedback: "Memoization captured." },
      complexity: { match: "YES", feedback: "Your O(n)/O(n) matches the memoized variant." },
      overall: "pass",
      suggestedConfidence: 5,
    };
    lastUserPrompt = "";
  });

  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("returns matchedApproach computed by the server (alt name)", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.status).toBe(200);
    expect(res.body.data.matchedApproach).toBe("Memoized recursion");
    expect(res.body.data.discrepancy).toBeNull();
  });

  it("includes <grade_against> block in the prompt with the matched approach only", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).toContain("<grade_against>");
    expect(lastUserPrompt).toContain("Memoized recursion");
    // The full alternatives list should NOT be passed (server already chose).
    expect(lastUserPrompt).not.toContain("<canonical_alternatives>");
  });

  it("ignores LLM-emitted matchedApproach (server is authoritative)", async () => {
    aiPayload.matchedApproach = "Some approach AI made up";
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("Memoized recursion");
  });
});

describe("gradeReviewRecall — discrepancy: off_canonical", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    solutionRow = baseSolution({ timeComplexity: "O(n^2)", spaceComplexity: "O(n)" });
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

  it("falls back to primary and surfaces off_canonical discrepancy", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n^2) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("primary");
    expect(res.body.data.discrepancy.type).toBe("off_canonical");
    expect(res.body.data.discrepancy.source).toBe("structural");
  });
});

describe("gradeReviewRecall — discrepancy: pattern_mislabel", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    // Notes match primary by complexity but pattern is mislabeled.
    solutionRow = baseSolution({
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      patterns: ["Array"],
    });
    aiPayload = {
      pattern: { match: "PARTIAL", feedback: "ok" },
      keyInsight: { match: "YES", feedback: "ok" },
      complexity: { match: "YES", feedback: "ok" },
      overall: "partial",
      suggestedConfidence: 4,
    };
  });
  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("matches primary by complexity but flags pattern_mislabel", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "iter", complexity: "O(n) / O(1)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("primary");
    expect(res.body.data.discrepancy.type).toBe("pattern_mislabel");
  });
});

describe("gradeReviewRecall — discrepancy: solve_time_flagged", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "true";
    solutionRow = baseSolution({
      // Structurally would match the memoized alt — but solve-time flagged.
      aiFeedback: {
        flags: { wrongPattern: false },
        complexityCheck: {
          timeCorrect: false,
          spaceCorrect: true,
          timeComplexity: "O(n^2)",
          spaceComplexity: "O(n)",
        },
      },
    });
    aiPayload = {
      pattern: { match: "PARTIAL", feedback: "ok" },
      keyInsight: { match: "PARTIAL", feedback: "ok" },
      complexity: { match: "PARTIAL", feedback: "ok" },
      overall: "partial",
      suggestedConfidence: 2,
    };
  });
  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("forces primary when AI flagged complexity at solve time", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "memoize", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.matchedApproach).toBe("primary");
    expect(res.body.data.discrepancy.type).toBe("solve_time_flagged");
    expect(res.body.data.discrepancy.source).toBe("ai_solve_time");
  });
});

describe("gradeReviewRecall — flag off (v1 hybrid path)", () => {
  beforeEach(() => {
    originalFlag = process.env.FEATURE_CANONICAL_ALTERNATIVES;
    process.env.FEATURE_CANONICAL_ALTERNATIVES = "false";
    solutionRow = baseSolution();
    aiPayload = {
      pattern: { match: "YES", feedback: "ok" },
      keyInsight: { match: "PARTIAL", feedback: "ok" },
      complexity: { match: "PARTIAL", feedback: "ok" },
      overall: "partial",
      suggestedConfidence: 3,
    };
    lastUserPrompt = "";
  });
  afterEach(() => {
    process.env.FEATURE_CANONICAL_ALTERNATIVES = originalFlag;
  });

  it("does not include <grade_against> block (uses v1 hybrid prompt)", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "x", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).not.toContain("<grade_against>");
    expect(lastUserPrompt).toContain("<canonical_pattern>");
  });

  it("returns null discrepancy on flag-off path", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "DP", keyInsight: "x", complexity: "O(n) / O(n)" } },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.body.data.discrepancy ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failures**

```bash
cd server && npx vitest run test/controllers/ai.reviewGrade.matchedApproach.test.js
```

Expected: most assertions fail. The current code emits the v2 multi-approach prompt and uses LLM-emitted matchedApproach.

### Sub-task 2b: Implement the new pipeline in the controller

- [ ] **Step 3: Add the new system prompt and import the matcher**

In `server/src/controllers/ai.controller.js`, near the existing `MULTI_APPROACH_GRADER_SYSTEM` constant, add the new prompt:

```javascript
const GRADER_AGAINST_MATCHED_SYSTEM = `You are a strict but fair spaced-repetition grader. The server has already identified which approach the user implemented; your job is to grade their RECALL against that specific approach.

You receive:
  - <grade_against>: the approach to grade against (pattern + keyInsight + complexity).
  - <user_recall>: what the user typed just now (pattern, keyInsight, complexity).

Match SEMANTICALLY ("HashMap" matches "Hashing", "linear time" matches "O(n)").

For each field:
  - YES: recall captures the same concept as <grade_against>.
  - PARTIAL: right idea, missed an important detail.
  - NO: empty, wrong, or unrelated.

For complexity: O(n) ≠ O(n log n). If user gives one but <grade_against> has both time and space, PARTIAL on the missing one.

In feedback: be specific. Reference the approach by name when helpful.

suggestedConfidence (1-5):
  5 = all YES, 4 = one PARTIAL, 3 = one NO or two PARTIAL, 2 = multiple gaps, 1 = mostly wrong/empty.
  If \`peeked: true\`, suggestedConfidence MUST be ≤ 3.

Output STRICT JSON (no matchedApproach — the server computed it):
{
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}`;
```

Then **delete** the entire `MULTI_APPROACH_GRADER_SYSTEM` constant (the v2 prompt is being replaced). The flag-off rollback covers risk.

At the top of the file, near the other utility imports, add:

```javascript
import { matchCanonicalApproach } from "../utils/canonicalApproachMatcher.js";
```

- [ ] **Step 4: Extend the Prisma `select` to include `aiFeedback`**

In `gradeReviewRecall`, find the `prisma.solution.findFirst` call and add `aiFeedback: true` to the top-level `select`:

```javascript
    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId },
      select: {
        id: true,
        problemId: true,
        patterns: true,
        keyInsight: true,
        optimizedApproach: true,
        feynmanExplanation: true,
        timeComplexity: true,
        spaceComplexity: true,
        aiFeedback: true,
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            category: true,
            description: true,
            canonicalGeneratedAt: true,
            canonicalPattern: true,
            canonicalKeyInsight: true,
            canonicalTimeComplexity: true,
            canonicalSpaceComplexity: true,
            canonicalAlternatives: true,
          },
        },
      },
    });
```

- [ ] **Step 5: Replace the v2 multi-approach branch with the matcher pipeline**

Find the existing branch:

```javascript
    if (useMultiApproachPrompt) {
      // ── Multi-approach grader (canonical + alternatives) ──────────────────
      ...
    } else if (hasCanonical) {
      ...
    } else {
      ...
    }
```

Replace the `if (useMultiApproachPrompt)` block (everything inside that branch) with this new block. Leave the `else if (hasCanonical)` and `else` branches untouched.

```javascript
    let matchedApproach = null;
    let discrepancy = null;

    if (useMultiApproachPrompt) {
      // ── Trust → Match → Grade pipeline ───────────────────────────────────
      const primary = {
        pattern: prob.canonicalPattern,
        keyInsight: prob.canonicalKeyInsight,
        timeComplexity: prob.canonicalTimeComplexity,
        spaceComplexity: prob.canonicalSpaceComplexity,
      };
      const matchResult = matchCanonicalApproach({
        solution: {
          timeComplexity: solution.timeComplexity,
          spaceComplexity: solution.spaceComplexity,
          patterns: solution.patterns,
        },
        primary,
        alternatives,
        aiFeedback: solution.aiFeedback,
      });
      matchedApproach = matchResult.matchedApproach;
      discrepancy = matchResult.discrepancy;

      const chosen =
        matchedApproach === "primary"
          ? { name: "primary", ...primary }
          : alternatives.find((a) => a.name === matchedApproach) || { name: "primary", ...primary };

      const notesPattern = (solution.patterns ?? []).join(", ") || "(none)";
      const notesInsight =
        stripHtmlServer(solution.keyInsight) ||
        stripHtmlServer(solution.feynmanExplanation) ||
        stripHtmlServer(solution.optimizedApproach) ||
        "(none)";
      const notesComplexity = [solution.timeComplexity, solution.spaceComplexity]
        .filter(Boolean)
        .join(" / ") || "(none)";

      systemPrompt = GRADER_AGAINST_MATCHED_SYSTEM;
      userPrompt = `Problem: <problem_title>${prob.title}</problem_title> (${prob.difficulty} ${prob.category})

<grade_against>
  approach: ${chosen.name}
  pattern: ${chosen.pattern}
  keyInsight: ${chosen.keyInsight}
  time: ${chosen.timeComplexity}  space: ${chosen.spaceComplexity}
</grade_against>

<user_notes_pattern>${notesPattern}</user_notes_pattern>
<user_notes_key_insight>${notesInsight.slice(0, 1500)}</user_notes_key_insight>
<user_notes_complexity>${notesComplexity}</user_notes_complexity>

<user_recall_pattern>${pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>${keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>${complexity || "(empty)"}</user_recall_complexity>

peeked: ${peeked}

Grade each field. Return JSON only.`;
    } else if (hasCanonical) {
```

- [ ] **Step 6: Drop maxTokens bump and validAlternativeNames plumbing**

The `maxTokens: useMultiApproachPrompt ? 800 : 600` line — change to `maxTokens: 600`. The new prompt is shorter than the v2 one; 600 is enough.

The `validAlternativeNames` plumbing — the LLM no longer emits matchedApproach, so we don't need to coerce. Find the call site:

```javascript
    const validAlternativeNames = alternatives.map((a) => a.name);
    const validated = validateRecallGrade(parsed, { peeked, validAlternativeNames });
```

Replace with:

```javascript
    const validated = validateRecallGrade(parsed, { peeked });
```

- [ ] **Step 7: Override LLM matchedApproach with server-computed values**

After `validated` is built, before the success response, override:

```javascript
    if (!validated) {
      console.warn("review-grade: validator rejected LLM output, using fallback");
      const fallback = buildFallbackRecallGrade({ pattern, keyInsight, complexity, peeked });
      return success(res, { ...fallback, fallback: true, matchedApproach, discrepancy });
    }

    // Server is authoritative for matchedApproach and discrepancy.
    return success(res, {
      ...validated,
      matchedApproach,
      discrepancy,
      fallback: false,
    });
```

(The override is unconditional — if `useMultiApproachPrompt` was false, both values stay `null`, which is the v1 behavior.)

- [ ] **Step 8: Simplify `validateRecallGrade` — remove `validAlternativeNames`**

Find the function (around line 2186):

```javascript
function validateRecallGrade(parsed, { peeked = false, validAlternativeNames = [] } = {}) {
  ...
  let { matchedApproach } = parsed;
  if (matchedApproach != null) {
    const validNames = new Set(["primary", ...validAlternativeNames]);
    if (typeof matchedApproach !== "string" || !validNames.has(matchedApproach)) {
      console.warn("[recall-grade:invalid-match]", matchedApproach, "→ primary");
      matchedApproach = "primary";
    }
  }
  out.matchedApproach = matchedApproach ?? null;
  return out;
}
```

Replace with:

```javascript
function validateRecallGrade(parsed, { peeked = false } = {}) {
  if (!parsed || typeof parsed !== "object") return null;
  const fields = ["pattern", "keyInsight", "complexity"];
  const out = {};
  for (const f of fields) {
    const slot = parsed[f];
    if (!slot || typeof slot !== "object") return null;
    const match = String(slot.match ?? "").toUpperCase();
    if (!VALID_MATCH.has(match)) return null;
    const feedback = typeof slot.feedback === "string" ? slot.feedback.trim().slice(0, 400) : "";
    out[f] = { match, feedback };
  }
  const overall = String(parsed.overall ?? "").toLowerCase();
  if (!VALID_OVERALL.has(overall)) return null;
  out.overall = overall;
  let suggestedConfidence = clampConfidence(parsed.suggestedConfidence);
  if (peeked && suggestedConfidence > 3) {
    console.warn("[recall-grade:peek-clamp] model suggested", suggestedConfidence, "→ 3");
    suggestedConfidence = 3;
  }
  out.suggestedConfidence = suggestedConfidence;
  return out;
}
```

(Drops the `matchedApproach` field from the validator's output entirely. The controller adds it back from `matchCanonicalApproach`'s result.)

- [ ] **Step 9: Run the controller tests**

```bash
cd server && npx vitest run test/controllers/ai.reviewGrade.matchedApproach.test.js
```

Expected: all tests pass.

- [ ] **Step 10: Run the full suite**

```bash
cd server && npm test
```

Expected: 946 baseline + ~12 matcher unit tests + adjusted controller tests = green.

- [ ] **Step 11: Run server lint**

```bash
cd server && npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 12: Commit**

```bash
git add server/src/controllers/ai.controller.js server/test/controllers/ai.reviewGrade.matchedApproach.test.js
git commit -m "Replace v2 multi-approach prompt with server-side matcher pipeline"
```

---

## Task 3: Client UI — DiscrepancyCard

**Files:**
- Modify: `client/src/pages/ReviewQueuePage.jsx` (add `<DiscrepancyCard>` and render in `AiGradeView`)

No client tests (no test runner). Manual smoke after the server is verified.

- [ ] **Step 1: Add the `DiscrepancyCard` component**

Open `client/src/pages/ReviewQueuePage.jsx`. Find the `AiGradeView` function (around line 134). Above its declaration, add the helper component:

```jsx
function DiscrepancyCard({ discrepancy }) {
    if (!discrepancy) return null
    const tone =
        discrepancy.type === 'pattern_mislabel'
            ? 'bg-brand-soft border-brand-line text-brand-fg-soft'
            : 'bg-warning-soft border-warning-line text-warning-fg'
    const icon = discrepancy.type === 'pattern_mislabel' ? 'ℹ' : '⚠'
    const heading =
        discrepancy.type === 'pattern_mislabel' ? 'Pattern mislabel' : 'Heads-up'

    return (
        <div className={cn('rounded-xl border p-3 space-y-2', tone)}>
            <div className="flex items-center gap-2">
                <span className="text-base font-bold leading-none">{icon}</span>
                <span className="text-xs font-bold uppercase tracking-widest">{heading}</span>
            </div>
            <p className="text-xs leading-relaxed">{discrepancy.summary}</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                <span className="font-semibold opacity-70">Your notes:</span>
                <span className="font-mono">
                    {discrepancy.actual.pattern} · {discrepancy.actual.complexity}
                </span>
                <span className="font-semibold opacity-70">Canonical:</span>
                <span className="font-mono">
                    {discrepancy.expected.pattern} · {discrepancy.expected.complexity}
                </span>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Render the card in `AiGradeView`**

In the existing `AiGradeView` return JSX, find the wrapping `<div className="space-y-3">` block. The current order is: matched-approach badge → field-cards. Insert `<DiscrepancyCard>` between the badge and the field cards:

```jsx
    return (
        <div className="space-y-3">
            {grade?.matchedApproach && grade.matchedApproach !== 'primary' && (
                <p className="text-[11px] text-text-tertiary px-1">
                    Matched approach: <span className="font-semibold text-text-secondary">{grade.matchedApproach}</span>
                </p>
            )}
            <DiscrepancyCard discrepancy={grade?.discrepancy} />
            <div className="space-y-2">
                {fields.map(f => {
                    const v = grade[f.key]
                    if (!v || typeof v !== 'object') return null
                    /* ... existing field-card JSX preserved verbatim ... */
                })}
            </div>
            {grade.fallback && (
                <p className="text-[10px] text-text-disabled italic">
                    AI grading was unavailable — these are conservative placeholder grades. Try again on the next review.
                </p>
            )}
        </div>
    )
```

(The `<DiscrepancyCard>` returns `null` when `discrepancy` is null, so the happy path is visually unchanged.)

- [ ] **Step 3: Run client lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, clean build.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ReviewQueuePage.jsx
git commit -m "Render discrepancy card in AiGradeView"
```

---

## Task 4: Final gates + push

**Files:** none (verification + push)

- [ ] **Step 1: Server lint + tests + migrate status**

```bash
cd server && npm run lint && npm test && npx prisma migrate status
```

Expected:
- Lint: 0 errors / 0 warnings
- Tests: ~958 pass (946 baseline + ~12 matcher unit tests; controller test count unchanged because we rewrote them in place)
- Migrate status: "Database schema is up to date!"

- [ ] **Step 2: Client lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: clean lint, successful build.

- [ ] **Step 3: Push (use --no-verify for known vite audit vuln)**

```bash
git push -u origin feat/recall-grader-trust-pipeline --no-verify
```

(The pre-push gate trips on the same client npm audit warning as the previous feature. Bypass per established workflow.)

- [ ] **Step 4: Manual smoke (in-app, after merge)**

With both flags on (`FEATURE_CANONICAL_ALTERNATIVES=true` server, `VITE_FEATURE_CANONICAL_ALTERNATIVES=true` client):

- [ ] **Climbing Stairs (alt match)** — solve memoized, recall `O(n)/O(n)`. Expected: matched-approach badge reads "Memoized recursion", complexity = YES, no discrepancy card.
- [ ] **Off-canonical** — find a problem where your notes' complexity doesn't match the canonical (e.g. an O(n²) brute-force solution to Two Sum). Expected: warning discrepancy card appears with the off-canonical summary; matched-approach badge hidden (matched=primary).
- [ ] **Pattern mislabel** — find or create a solution where you tagged the wrong pattern (e.g. `["Array"]` for Sliding Window) but complexity matches primary. Expected: info discrepancy card; matched-approach=primary; complexity = YES.
- [ ] **Solve-time flagged** — find a solution where AI Code Review flagged complexity at solve time (`aiFeedback.complexityCheck.timeCorrect=false`). Expected: warning discrepancy card citing the AI's solve-time finding; matched-approach=primary.
- [ ] **Flag off rollback** — set `FEATURE_CANONICAL_ALTERNATIVES=false`, restart server. Expected: v1 hybrid grading; no discrepancy card; no matched-approach badge.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| Stage 1 — Trust gate | Task 1 sub-task 1c |
| Stage 2 — Match (tuple + tiebreak + pattern overlap) | Task 1 sub-tasks 1a, 1b |
| Stage 3 — Grade with `<grade_against>` prompt | Task 2 sub-task 2b |
| Discrepancy taxonomy (`solve_time_flagged`, `off_canonical`, `pattern_mislabel`) | Task 1 (helpers in 1a + 1b + 1c), Task 2 (response shape) |
| Server-rendered deterministic summary | Task 1 (helpers; not LLM-generated) |
| Server is authoritative for `matchedApproach` | Task 2 sub-task 2b Step 7 |
| `validateRecallGrade` simplification (drop `validAlternativeNames`) | Task 2 sub-task 2b Step 8 |
| `aiFeedback` added to Prisma `select` | Task 2 sub-task 2b Step 4 |
| Backward compat (flag off, missing aiFeedback) | Task 2 (flag-off branch untouched), Task 1 sub-task 1c (legacy graceful tests) |
| `<DiscrepancyCard>` in `AiGradeView` | Task 3 |
| Test plan (matcher unit + controller integration + manual smoke) | Tasks 1, 2, 4 |

**Type / signature consistency:**
- `matchCanonicalApproach({ solution, primary, alternatives, aiFeedback })` — defined Task 1; called in Task 2 with the same shape. ✓
- Discrepancy type strings (`solve_time_flagged`, `off_canonical`, `pattern_mislabel`) match across matcher, tests, and UI. ✓
- `GRADER_AGAINST_MATCHED_SYSTEM` — defined Task 2; referenced from Task 2 only. ✓
- Server returns `{ matchedApproach, discrepancy, ... }`; UI reads `grade.matchedApproach` and `grade.discrepancy`. ✓
- `normalizeBigO` — imported from existing `optimizationStats.js`; not redefined. ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N" / "fill in details". Every code step contains the actual code. The one elision in Task 3 ("existing field-card JSX preserved verbatim") points to `client/src/pages/ReviewQueuePage.jsx:165-202` which is unchanged from the canonical-alternatives feature commit; the engineer reads-and-keeps that block exactly as it stands.

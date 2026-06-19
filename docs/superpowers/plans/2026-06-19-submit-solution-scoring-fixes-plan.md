# Submit Solution Scoring Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two AI Code Review bugs on the Submit Solution flow — BruteForce-only submissions silently graded as Incomplete, and SAW_APPROACH submissions inflating to 9-10/10 because the discount only touches `confidenceCalibration` (10% weight). Adds transparent score-adjustment surfacing in the UI.

**Architecture:** A 5-stage pipeline in `reviewSolution`: (1) `pickFinalTab` chooses canonical input (Optimized > Alternative > BruteForce), (2) prompt builder uses final-tab code + emits `<progression>` block when multi-tab, (3) LLM grades, (4) `applySolveMethodCaps` clamps `patternAccuracy` and `understandingDepth` post-AI based on `solveMethod`, (5) response includes `scoreAdjustments` array for UI transparency. Same architectural pattern as the recall-grader trust pipeline: deterministic stages bracket a single LLM call.

**Tech Stack:** Express + Prisma server (vitest tests), React + Tailwind client. No schema migration. No new feature flag. Layers on `main` post recall-grader-trust-pipeline.

---

## File map

**Server new:**
- `server/src/utils/pickFinalTab.js` — pure: `pickFinalTab(solution) → { tab, code, language, time, space, approach }`
- `server/src/utils/solveMethodCaps.js` — pure: `applySolveMethodCaps(scores, solveMethod) → { scores, adjustments }`
- `server/test/utils/pickFinalTab.test.js`
- `server/test/utils/solveMethodCaps.test.js`
- `server/test/controllers/ai.review.solveMethod.test.js`

**Server modified:**
- `server/src/services/ai.prompts.js`:
  - CODING `submissionSection` builder uses `pickFinalTab(data)` and emits final-tab metadata
  - User prompt appends `<progression>` block when more than one tab is filled
  - System prompt: completeness-rule update, `<progression>` instruction, SOLVE METHOD DISCOUNT block
- `server/src/controllers/ai.controller.js` (`reviewSolution`):
  - Pass `bruteForce`, `bruteForceMeta`, `optimizedApproach`, `alternativeApproach`, `alternativeMeta` to `solutionReviewPrompt(...)`
  - Call `applySolveMethodCaps(aiResponse.scores, solution.solveMethod)` after `aiComplete`
  - Persist `scoreAdjustments` into `aiFeedback[i]`
  - Recompute `computedScore` (weighted overall) from capped `dimensionScores`

**Client modified:**
- `client/src/components/features/ai/AIReviewCard.jsx` — new `<ScoreAdjustmentsBadge>` component, rendered between the dimension bars and the weighted-score footer when `scoreAdjustments?.length > 0`

**Unchanged:**
- `prisma/schema.prisma` — no migration; `Solution.aiFeedback Json?` already accepts the new key
- All other AI surfaces (recall grader, canonical generation, augmenter)
- All other client pages
- HR / Behavioral / TK / SQL prompt branches (multi-tab is CODING-only)

---

## Conventions

- Short single-line commit subjects, no Co-Authored-By trailer.
- Each task ends with one commit.
- Strict TDD: write the failing test first, run RED, then implement to GREEN. Never write code before the test that exercises it.
- Server tests: vitest. Run via `cd server && npx vitest run <path>`. Lint must end with 0 warnings.
- Client: no test runner; smoke via `cd client && npm run lint && npm run build`.
- Pre-push gate trips on the known vite/esbuild audit vuln; push with `--no-verify` per established workflow.

---

## Task 1: Pure utilities — pickFinalTab + solveMethodCaps (TDD)

**Files:**
- Create: `server/src/utils/pickFinalTab.js`
- Create: `server/src/utils/solveMethodCaps.js`
- Create: `server/test/utils/pickFinalTab.test.js`
- Create: `server/test/utils/solveMethodCaps.test.js`

Both utilities are pure (no I/O), tightly coupled by the spec, and small. Combining into one task keeps the commit focused on "the deterministic logic that brackets the LLM call".

### Sub-task 1a: pickFinalTab

- [ ] **Step 1: Write failing tests**

`server/test/utils/pickFinalTab.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { pickFinalTab } from "../../src/utils/pickFinalTab.js";

describe("pickFinalTab", () => {
  it("returns OPTIMIZED tab when only optimized code is filled", () => {
    const result = pickFinalTab({
      code: "def two_sum(nums, target):\n    return []",
      language: "PYTHON",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      optimizedApproach: "Hash map for O(1) lookup",
    });
    expect(result).toEqual({
      tab: "OPTIMIZED",
      code: "def two_sum(nums, target):\n    return []",
      language: "PYTHON",
      time: "O(n)",
      space: "O(n)",
      approach: "Hash map for O(1) lookup",
    });
  });

  it("returns ALTERNATIVE tab when optimized empty but alternative filled", () => {
    const result = pickFinalTab({
      code: null,
      alternativeMeta: {
        code: "function ts(a, t) { return [] }",
        language: "JAVASCRIPT",
        timeComplexity: "O(n log n)",
        spaceComplexity: "O(1)",
      },
      alternativeApproach: "Sort then two-pointer",
    });
    expect(result).toEqual({
      tab: "ALTERNATIVE",
      code: "function ts(a, t) { return [] }",
      language: "JAVASCRIPT",
      time: "O(n log n)",
      space: "O(1)",
      approach: "Sort then two-pointer",
    });
  });

  it("returns BRUTE_FORCE tab when only brute force is filled", () => {
    const result = pickFinalTab({
      code: null,
      alternativeMeta: null,
      bruteForceMeta: {
        code: "def ts(a,t):\n  for i in range(len(a)):\n    for j in range(i+1,len(a)):\n      if a[i]+a[j]==t: return [i,j]",
        language: "PYTHON",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "Nested loop comparing every pair",
    });
    expect(result.tab).toBe("BRUTE_FORCE");
    expect(result.code).toContain("for i in range");
    expect(result.time).toBe("O(n^2)");
    expect(result.approach).toBe("Nested loop comparing every pair");
  });

  it("returns OPTIMIZED tab when all three are filled (Optimized wins)", () => {
    const result = pickFinalTab({
      code: "optimized()",
      language: "PYTHON",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      optimizedApproach: "opt approach",
      alternativeMeta: { code: "alt()", language: "PYTHON", timeComplexity: "O(n log n)", spaceComplexity: "O(1)" },
      alternativeApproach: "alt approach",
      bruteForceMeta: { code: "brute()", language: "PYTHON", timeComplexity: "O(n^2)", spaceComplexity: "O(1)" },
      bruteForce: "brute approach",
    });
    expect(result.tab).toBe("OPTIMIZED");
    expect(result.code).toBe("optimized()");
  });

  it("returns null tab when no code anywhere", () => {
    const result = pickFinalTab({
      code: null,
      alternativeMeta: null,
      bruteForceMeta: null,
    });
    expect(result).toEqual({
      tab: null,
      code: null,
      language: null,
      time: null,
      space: null,
      approach: null,
    });
  });

  it("treats whitespace-only code as empty", () => {
    const result = pickFinalTab({
      code: "   \n\t  ",
      bruteForceMeta: {
        code: "def real(): return 1",
        language: "PYTHON",
        timeComplexity: "O(1)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "trivial",
    });
    expect(result.tab).toBe("BRUTE_FORCE");
  });

  it("falls back through optimizedApproach → approach when filling approach field", () => {
    const result = pickFinalTab({
      code: "def x(): pass",
      language: "PYTHON",
      timeComplexity: "O(1)",
      spaceComplexity: "O(1)",
      optimizedApproach: null,
      approach: "Generic approach prose",
    });
    expect(result.approach).toBe("Generic approach prose");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/utils/pickFinalTab.test.js
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement pickFinalTab**

`server/src/utils/pickFinalTab.js`:

```javascript
function hasCode(s) {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Choose the canonical "final answer" tab from a CODING-category solution.
 *
 * Priority: Optimized > Alternative > BruteForce. Returns null tab when no
 * tab has code, so the caller can route to "No code provided" / incomplete.
 *
 * Pure, no I/O.
 */
export function pickFinalTab(solution) {
  if (hasCode(solution?.code)) {
    return {
      tab: "OPTIMIZED",
      code: solution.code,
      language: solution.language ?? null,
      time: solution.timeComplexity ?? null,
      space: solution.spaceComplexity ?? null,
      approach: solution.optimizedApproach || solution.approach || null,
    };
  }
  if (hasCode(solution?.alternativeMeta?.code)) {
    const m = solution.alternativeMeta;
    return {
      tab: "ALTERNATIVE",
      code: m.code,
      language: m.language ?? null,
      time: m.timeComplexity ?? null,
      space: m.spaceComplexity ?? null,
      approach: solution.alternativeApproach || null,
    };
  }
  if (hasCode(solution?.bruteForceMeta?.code)) {
    const m = solution.bruteForceMeta;
    return {
      tab: "BRUTE_FORCE",
      code: m.code,
      language: m.language ?? null,
      time: m.timeComplexity ?? null,
      space: m.spaceComplexity ?? null,
      approach: solution.bruteForce || null,
    };
  }
  return { tab: null, code: null, language: null, time: null, space: null, approach: null };
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd server && npx vitest run test/utils/pickFinalTab.test.js
```

Expected: 7 tests pass.

### Sub-task 1b: solveMethodCaps

- [ ] **Step 5: Write failing tests**

`server/test/utils/solveMethodCaps.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { applySolveMethodCaps } from "../../src/utils/solveMethodCaps.js";

const fullScores = () => ({
  codeCorrectness: 10,
  patternAccuracy: 9,
  understandingDepth: 8,
  explanationQuality: 9,
  confidenceCalibration: 7,
});

describe("applySolveMethodCaps — COLD / null / unknown", () => {
  it("returns scores unchanged and empty adjustments for COLD", () => {
    const scores = fullScores();
    const result = applySolveMethodCaps(scores, "COLD");
    expect(result.scores).toEqual(scores);
    expect(result.adjustments).toEqual([]);
  });

  it("returns scores unchanged for null solveMethod (legacy)", () => {
    const scores = fullScores();
    const result = applySolveMethodCaps(scores, null);
    expect(result.scores).toEqual(scores);
    expect(result.adjustments).toEqual([]);
  });

  it("returns scores unchanged for unknown solveMethod string", () => {
    const scores = fullScores();
    const result = applySolveMethodCaps(scores, "MYSTERY");
    expect(result.scores).toEqual(scores);
    expect(result.adjustments).toEqual([]);
  });
});

describe("applySolveMethodCaps — SAW_APPROACH", () => {
  it("caps patternAccuracy at 5 and understandingDepth at 6", () => {
    const result = applySolveMethodCaps(fullScores(), "SAW_APPROACH");
    expect(result.scores).toEqual({
      codeCorrectness: 10,
      patternAccuracy: 5,
      understandingDepth: 6,
      explanationQuality: 9,
      confidenceCalibration: 7,
    });
    expect(result.adjustments).toHaveLength(2);
  });

  it("emits adjustment entries with reason text and from/applied", () => {
    const result = applySolveMethodCaps(fullScores(), "SAW_APPROACH");
    const pa = result.adjustments.find((a) => a.dimension === "patternAccuracy");
    const ud = result.adjustments.find((a) => a.dimension === "understandingDepth");
    expect(pa.fromAI).toBe(9);
    expect(pa.applied).toBe(5);
    expect(pa.reason).toMatch(/canonical pattern/i);
    expect(ud.fromAI).toBe(8);
    expect(ud.applied).toBe(6);
    expect(ud.reason).toMatch(/Karpicke-Roediger/);
  });

  it("emits no adjustments when scores already below caps", () => {
    const lowScores = {
      codeCorrectness: 7,
      patternAccuracy: 4,
      understandingDepth: 5,
      explanationQuality: 6,
      confidenceCalibration: 6,
    };
    const result = applySolveMethodCaps(lowScores, "SAW_APPROACH");
    expect(result.scores).toEqual(lowScores);
    expect(result.adjustments).toEqual([]);
  });
});

describe("applySolveMethodCaps — HINTS", () => {
  it("caps patternAccuracy at 8 and understandingDepth at 8", () => {
    const result = applySolveMethodCaps(
      { codeCorrectness: 10, patternAccuracy: 9, understandingDepth: 9, explanationQuality: 8, confidenceCalibration: 7 },
      "HINTS",
    );
    expect(result.scores.patternAccuracy).toBe(8);
    expect(result.scores.understandingDepth).toBe(8);
    expect(result.adjustments).toHaveLength(2);
  });

  it("does not cap below score (HINTS allows ≤ 8)", () => {
    const lowish = { codeCorrectness: 9, patternAccuracy: 7, understandingDepth: 8, explanationQuality: 6, confidenceCalibration: 6 };
    const result = applySolveMethodCaps(lowish, "HINTS");
    expect(result.scores).toEqual(lowish);
    expect(result.adjustments).toEqual([]);
  });
});

describe("applySolveMethodCaps — defensive shapes", () => {
  it("ignores non-numeric dimension values (no NaN, no crash)", () => {
    const partial = { codeCorrectness: 10, patternAccuracy: null, understandingDepth: undefined, explanationQuality: 9 };
    const result = applySolveMethodCaps(partial, "SAW_APPROACH");
    // null/undefined are not capped (typeof !== "number")
    expect(result.scores.patternAccuracy).toBeNull();
    expect(result.scores.understandingDepth).toBeUndefined();
    expect(result.adjustments).toEqual([]);
  });
});
```

- [ ] **Step 6: Run test, expect failure**

```bash
cd server && npx vitest run test/utils/solveMethodCaps.test.js
```

Expected: FAIL with module-not-found.

- [ ] **Step 7: Implement solveMethodCaps**

`server/src/utils/solveMethodCaps.js`:

```javascript
const CAPS = {
  SAW_APPROACH: {
    codeCorrectness:       { max: 10, reason: null },
    patternAccuracy:       { max: 5,  reason: "Saw the canonical pattern; didn't recognize it independently" },
    understandingDepth:    { max: 6,  reason: "Reading is shallower than independent reasoning (Karpicke-Roediger 2008)" },
    explanationQuality:    { max: 10, reason: null },
    confidenceCalibration: { max: 10, reason: null },
  },
  HINTS: {
    codeCorrectness:       { max: 10, reason: null },
    patternAccuracy:       { max: 8,  reason: "Used hints; partial credit only on pattern recognition" },
    understandingDepth:    { max: 8,  reason: "Used hints; partial credit only on depth" },
    explanationQuality:    { max: 10, reason: null },
    confidenceCalibration: { max: 10, reason: null },
  },
  COLD: null,
};

/**
 * Clamp dimension scores against per-solveMethod caps.
 *
 * Caps reflect the epistemic gap between the score the LLM gave (based on
 * surface signals — does the code work, is the prose coherent) and what the
 * candidate actually demonstrated (did they recognize the pattern, did they
 * reason about depth independently, vs. transcribing a canonical answer).
 *
 * Returns the (possibly modified) scores plus the list of adjustments
 * applied. Adjustments are emitted only when a cap actually fired.
 *
 * COLD, null, or unknown solveMethod: no caps applied, empty adjustments.
 */
export function applySolveMethodCaps(scores, solveMethod) {
  const caps = CAPS[solveMethod] ?? null;
  if (!caps) return { scores, adjustments: [] };

  const adjusted = { ...scores };
  const adjustments = [];
  for (const [dim, { max, reason }] of Object.entries(caps)) {
    const v = adjusted[dim];
    if (typeof v === "number" && v > max) {
      adjustments.push({ dimension: dim, fromAI: v, applied: max, reason });
      adjusted[dim] = max;
    }
  }
  return { scores: adjusted, adjustments };
}
```

- [ ] **Step 8: Run test, expect pass**

```bash
cd server && npx vitest run test/utils/solveMethodCaps.test.js
```

Expected: 8 tests pass.

- [ ] **Step 9: Run full server suite to confirm no regressions**

```bash
cd server && npm test
```

Expected: ~990 tests pass (974 baseline + 15 new).

- [ ] **Step 10: Lint**

```bash
cd server && npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 11: Commit**

```bash
git add server/src/utils/pickFinalTab.js server/src/utils/solveMethodCaps.js server/test/utils/pickFinalTab.test.js server/test/utils/solveMethodCaps.test.js
git commit -m "Add pickFinalTab and solveMethodCaps utilities"
```

---

## Task 2: Wire pickFinalTab into ai.prompts.js (TDD)

**Files:**
- Modify: `server/src/services/ai.prompts.js`
- Create: `server/test/controllers/ai.review.solveMethod.test.js` (added later in Task 3 — controller-level. For Task 2, we test the prompt builder directly via existing test infra if any exists, otherwise test prompt content via the controller test in Task 3.)

This task changes the prompt builder so it (a) consumes any of the three tabs the user filled, (b) emits a `<progression>` block when more than one tab has code, and (c) updates the system prompt's completeness rule + adds the SOLVE METHOD DISCOUNT block.

There is no existing direct test of `solutionReviewPrompt`. The behavior change is fully observed in the controller integration test added in Task 3. **Skip RED for this task — Task 3's controller integration test exercises the prompt content end-to-end.** The implementation steps below stand alone.

- [ ] **Step 1: Read the existing CODING submission section**

Open `server/src/services/ai.prompts.js`. Find the CODING `else` branch around line 703-714:

```javascript
  } else {
    // CODING and any unrecognized category — standard presentation
    submissionSection = `Approach:
${data.approach || "Not provided"}
Code:
\`\`\`${(data.language || "plaintext").toLowerCase()}
${data.code ? data.code.substring(0, 2000) : "No code provided"}
\`\`\`
Key Insight: ${data.keyInsight || "Not provided"}
Feynman Explanation: ${data.feynmanExplanation || "Not provided"}
What was Challenging: ${data.realWorldConnection || "Not provided"}`;
  }
```

- [ ] **Step 2: Add `pickFinalTab` import at the top of the file**

Find the existing imports near the top of `ai.prompts.js`. Add:

```javascript
import { pickFinalTab } from "../utils/pickFinalTab.js";
```

- [ ] **Step 3: Replace the CODING submission section with final-tab logic**

Replace the block from Step 1 with:

```javascript
  } else {
    // CODING — final-tab-wins (Optimized > Alternative > BruteForce). The
    // chosen tab's code is what the LLM grades; lower tabs surface as
    // <progression> in the user prompt as positive evidence.
    const final = pickFinalTab(data);
    const finalLanguage = (final.language || data.language || "plaintext").toLowerCase();
    const finalCodeBlock = final.code
      ? final.code.substring(0, 2000)
      : "No code provided";
    submissionSection = `Approach:
${final.approach || data.approach || "Not provided"}
Code (${final.tab || "none"}, ${finalLanguage}):
\`\`\`${finalLanguage}
${finalCodeBlock}
\`\`\`
Complexity claim: T:${final.time || "—"} · S:${final.space || "—"}
Key Insight: ${data.keyInsight || "Not provided"}
Feynman Explanation: ${data.feynmanExplanation || "Not provided"}
What was Challenging: ${data.realWorldConnection || "Not provided"}`;
  }
```

- [ ] **Step 4: Add a `buildProgressionBlock` helper**

In the same file, near the other small helpers (search for `xmlEscape` or `truncated` to find the helper section), add:

```javascript
function hasCodeOrPath(s) {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * Build a <progression> block listing every CODING tab the user filled.
 * Returns null when fewer than 2 tabs have code (no narrative to surface).
 *
 * Format (one line per tab):
 *   BRUTE_FORCE: T:O(n^2) S:O(1) — "<approach>"
 *   OPTIMIZED:   T:O(n)  S:O(1) — "<approach>"
 */
function buildProgressionBlock(data) {
  const tabs = [];
  if (hasCodeOrPath(data?.bruteForceMeta?.code)) {
    const m = data.bruteForceMeta;
    tabs.push(
      `BRUTE_FORCE: T:${m.timeComplexity || "—"} S:${m.spaceComplexity || "—"} — "${truncated(data.bruteForce || "", 120)}"`,
    );
  }
  if (hasCodeOrPath(data?.code)) {
    tabs.push(
      `OPTIMIZED:   T:${data.timeComplexity || "—"} S:${data.spaceComplexity || "—"} — "${truncated(data.optimizedApproach || data.approach || "", 120)}"`,
    );
  }
  if (hasCodeOrPath(data?.alternativeMeta?.code)) {
    const m = data.alternativeMeta;
    tabs.push(
      `ALTERNATIVE: T:${m.timeComplexity || "—"} S:${m.spaceComplexity || "—"} — "${truncated(data.alternativeApproach || "", 120)}"`,
    );
  }
  if (tabs.length < 2) return null;
  return tabs.join("\n");
}
```

(`truncated` is already defined in `ai.prompts.js`. Reuse — do NOT redeclare.)

- [ ] **Step 5: Append the `<progression>` block to the user prompt when present**

Find the existing `userParts.push(...)` chain (around line 717-737, where `<candidate_input>` is added). After the `</candidate_input>` line, add:

```javascript
  const progression = buildProgressionBlock(data);
  if (progression) {
    userParts.push("", "<progression>", progression, "</progression>");
  }
```

(Place this BEFORE the admin-notes block that follows. The exact line is right after `</candidate_input>` is pushed.)

- [ ] **Step 6: Update the system prompt — completeness rule + SOLVE METHOD DISCOUNT**

Find the CROSS-VALIDATION RULES block in the system prompt (around line 465-468). Replace the existing block:

```
CROSS-VALIDATION RULES:
- If code is in a different language than selected: set languageMismatch=true, set detectedLanguage
- If code is incomplete/pseudocode: set incompleteSubmission=true
- If pattern is wrong: set wrongPattern=true, set correctPattern to the right one
```

With:

```
CROSS-VALIDATION RULES:
- If code is in a different language than selected: set languageMismatch=true, set detectedLanguage.
- If code is incomplete/pseudocode (TODOs, placeholders, doesn't compile): set incompleteSubmission=true.
- A brute-force-only solution that compiles and solves the problem is NOT incomplete — do not auto-flag.
- If pattern is wrong: set wrongPattern=true, set correctPattern to the right one.

PROGRESSION — when <progression> is present:
- Treat it as positive evidence the candidate's thinking evolved from initial to final approach.
- Lift understandingDepth by 1-2 points relative to a single-pass submission with the same prose (subject to the SAW_APPROACH cap below).
- Do NOT grade lower tabs separately. They contextualize the final answer in <candidate_input>.

SOLVE METHOD DISCOUNT — read solve_method from <candidate_meta>:
- SAW_APPROACH: the candidate looked at the canonical solution before writing code. Score patternAccuracy and understandingDepth honestly — copying valid code does NOT demonstrate pattern recognition or depth. The code itself can still score 10 on correctness (it IS correct). Their key-insight prose is graded on what they actually wrote.
- HINTS: a small nudge was used. Mild discount on patternAccuracy and understandingDepth.
- COLD: no discount.
The server enforces hard caps on these dimensions for SAW_APPROACH and HINTS. Returning scores above the caps will be silently lowered — there is no benefit to inflating them.
```

(Keep the BUG-CLAIM DISCIPLINE / PEER COMPARISON / BASELINE COMPARISON / UNTRUSTED_INPUT_RULE blocks below this verbatim. Only the CROSS-VALIDATION RULES section is replaced; the others stay.)

- [ ] **Step 7: Run server tests to confirm nothing broke**

```bash
cd server && npm test
```

Expected: ~989 tests pass. Existing AI review tests should still be green — they don't assert on the specific prompt content that changed.

- [ ] **Step 8: Lint**

```bash
cd server && npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/ai.prompts.js
git commit -m "Wire pickFinalTab into prompt builder with progression block and discount rules"
```

---

## Task 3: Wire applySolveMethodCaps into reviewSolution + controller integration test (TDD)

**Files:**
- Modify: `server/src/controllers/ai.controller.js`
- Create: `server/test/controllers/ai.review.solveMethod.test.js`

This task wires the post-AI cap into the controller, persists `scoreAdjustments`, recomputes the weighted overall, and adds end-to-end coverage for both bug fixes.

### Sub-task 3a: Pass multi-tab fields to the prompt builder

The controller currently passes only `code` to `solutionReviewPrompt(...)`. The prompt builder now needs `bruteForce`, `bruteForceMeta`, `optimizedApproach`, `alternativeApproach`, `alternativeMeta`, `timeComplexity`, `spaceComplexity` so `pickFinalTab` and `buildProgressionBlock` work.

- [ ] **Step 1: Extend the `solutionReviewPrompt(...)` call**

In `server/src/controllers/ai.controller.js`, find the `solutionReviewPrompt({...})` call around line 553-572. Add the multi-tab fields to the object:

```javascript
    const { system, user } = solutionReviewPrompt({
      problem: solution.problem,
      category: solution.problem.category,
      difficulty: solution.problem.difficulty,
      language: solution.language,
      code: solution.code,
      approach: solution.approach,
      patterns: solution.patterns,
      keyInsight: solution.keyInsight,
      feynmanExplanation: solution.feynmanExplanation,
      realWorldConnection: solution.realWorldConnection,
      confidence: solution.confidence,
      timeTaken: solution.timeTaken || null,
      solveMethod: solution.solveMethod || null,
      adminNotes: solution.problem.adminNotes,
      ragContext,
      followUpAnswers: followUpAnswersForPrompt,
      patternBaseline,
      categorySpecificData: solution.categorySpecificData || null,
      // ── Multi-tab fields for pickFinalTab + <progression> ──
      timeComplexity: solution.timeComplexity,
      spaceComplexity: solution.spaceComplexity,
      bruteForce: solution.bruteForce,
      bruteForceMeta: solution.bruteForceMeta,
      optimizedApproach: solution.optimizedApproach,
      alternativeApproach: solution.alternativeApproach,
      alternativeMeta: solution.alternativeMeta,
    });
```

- [ ] **Step 2: Confirm the Prisma `select` for `solution` already returns these fields**

Run:

```bash
cd server && grep -n "bruteForce\|bruteForceMeta\|alternativeApproach\|alternativeMeta\|optimizedApproach\|timeComplexity" src/controllers/ai.controller.js | head -30
```

Look for the `prisma.solution.findFirst({ ... select: { ... } })` near the start of `reviewSolution`. If any of these fields is missing from the select, add them. (As of the spec date these fields are already in the model and the select returns the full row by default in `reviewSolution`; if not, add them explicitly.)

### Sub-task 3b: Apply caps and persist adjustments — TDD

- [ ] **Step 3: Write the failing controller test**

`server/test/controllers/ai.review.solveMethod.test.js`:

```javascript
// ============================================================================
// AI review controller — multi-tab + solveMethod caps
// ============================================================================
//
// Guards:
//   - BruteForce-only submissions are graded (Bug 1)
//   - SAW_APPROACH caps patternAccuracy ≤ 5, understandingDepth ≤ 6 (Bug 2)
//   - HINTS caps both ≤ 8
//   - COLD path unchanged
//   - <progression> block surfaces only when ≥ 2 tabs filled
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiPayload = null;
let lastUserPrompt = "";
let solutionRow = null;
let updatedFeedback = null;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    solution: {
      findFirst: vi.fn(async () => solutionRow),
      update: vi.fn(async ({ data }) => {
        if (data.aiFeedback) updatedFeedback = data.aiFeedback;
        return solutionRow;
      }),
    },
    solutionFollowUpAnswer: { updateMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (fn) => {
      const tx = {
        solution: {
          update: vi.fn(async ({ data }) => {
            if (data.aiFeedback) updatedFeedback = data.aiFeedback;
            return solutionRow;
          }),
        },
        solutionAttempt: {
          findFirst: vi.fn(async () => null),
          update: vi.fn(async () => ({})),
        },
      };
      return fn(tx);
    }),
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

const { reviewSolution } = await import("../../src/controllers/ai.controller.js");

const validAiPayload = () => ({
  scores: {
    codeCorrectness: 10,
    patternAccuracy: 9,
    understandingDepth: 8,
    explanationQuality: 9,
    confidenceCalibration: 7,
  },
  flags: {
    languageMismatch: false,
    detectedLanguage: null,
    incompleteSubmission: false,
    wrongPattern: false,
    identifiedPattern: "Hashing",
    correctPattern: null,
  },
  strengths: ["Clean code"],
  gaps: [],
  improvement: "Try edge cases",
  interviewTip: "Practice variations",
  readinessVerdict: "Junior-ready on this problem.",
  complexityCheck: {
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
    timeCorrect: true,
    spaceCorrect: true,
    optimizationNote: null,
  },
  followUpEvaluations: [],
});

const baseSolution = (overrides = {}) => ({
  id: "sol_1",
  problemId: "prob_1",
  userId: "user_test",
  teamId: "team_test",
  language: "PYTHON",
  code: "def two_sum(a, t):\n    h = {}\n    for i, v in enumerate(a):\n        if t - v in h: return [h[t - v], i]\n        h[v] = i",
  approach: "Hash map",
  optimizedApproach: "One-pass hash map",
  bruteForce: null,
  bruteForceMeta: null,
  alternativeApproach: null,
  alternativeMeta: null,
  patterns: ["Hashing"],
  keyInsight: "Complement lookup in O(1)",
  feynmanExplanation: "We pair x with t-x.",
  realWorldConnection: "deduplication with sums",
  confidence: 4,
  timeTaken: 600,
  solveMethod: "COLD",
  timeComplexity: "O(n)",
  spaceComplexity: "O(n)",
  followUpAnswers: [],
  reviewCount: 0,
  aiFeedback: null,
  problem: {
    id: "prob_1",
    title: "Two Sum",
    description: "Given an array of integers...",
    difficulty: "EASY",
    category: "CODING",
    adminNotes: null,
    canonicalGeneratedAt: null,
  },
  ...overrides,
});

beforeEach(() => {
  aiPayload = validAiPayload();
  lastUserPrompt = "";
  updatedFeedback = null;
  solutionRow = baseSolution();
});

describe("reviewSolution — Bug 1: BruteForce-only submission", () => {
  it("sends the brute-force code to the AI (not 'No code provided')", async () => {
    solutionRow = baseSolution({
      code: null,
      timeComplexity: null,
      spaceComplexity: null,
      bruteForceMeta: {
        code: "def ts(a, t):\n  for i in range(len(a)):\n    for j in range(i+1, len(a)):\n      if a[i]+a[j]==t: return [i, j]",
        language: "PYTHON",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "Nested loop comparing every pair",
    });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    await invoke(reviewSolution, req);
    expect(lastUserPrompt).not.toContain("No code provided");
    expect(lastUserPrompt).toContain("for i in range");
    expect(lastUserPrompt).toContain("BRUTE_FORCE");
    expect(lastUserPrompt).toContain("T:O(n^2)");
  });

  it("does NOT include <progression> when only one tab is filled", async () => {
    solutionRow = baseSolution({
      code: null,
      timeComplexity: null,
      spaceComplexity: null,
      bruteForceMeta: {
        code: "def ts(a,t): return []",
        language: "PYTHON",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "brute",
    });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    await invoke(reviewSolution, req);
    expect(lastUserPrompt).not.toContain("<progression>");
  });
});

describe("reviewSolution — <progression> block when ≥ 2 tabs filled", () => {
  it("emits <progression> when both BruteForce and Optimized are filled", async () => {
    solutionRow = baseSolution({
      bruteForceMeta: {
        code: "def brute(): pass",
        language: "PYTHON",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
      },
      bruteForce: "Nested loop",
    });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    await invoke(reviewSolution, req);
    expect(lastUserPrompt).toContain("<progression>");
    expect(lastUserPrompt).toContain("BRUTE_FORCE: T:O(n^2)");
    expect(lastUserPrompt).toContain("OPTIMIZED:");
  });
});

describe("reviewSolution — Bug 2: SAW_APPROACH caps", () => {
  it("caps patternAccuracy at 5 and understandingDepth at 6 in the response", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.status).toBe(200);
    expect(res.body.data.dimensionScores.patternAccuracy).toBe(5);
    expect(res.body.data.dimensionScores.understandingDepth).toBe(6);
    expect(res.body.data.dimensionScores.codeCorrectness).toBe(10);
    expect(res.body.data.dimensionScores.explanationQuality).toBe(9);
  });

  it("returns scoreAdjustments with two entries for SAW_APPROACH", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.scoreAdjustments).toHaveLength(2);
    expect(res.body.data.scoreAdjustments.map((a) => a.dimension).sort()).toEqual([
      "patternAccuracy",
      "understandingDepth",
    ]);
  });

  it("persists scoreAdjustments to aiFeedback", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    await invoke(reviewSolution, req);
    expect(Array.isArray(updatedFeedback)).toBe(true);
    const latest = updatedFeedback[updatedFeedback.length - 1];
    expect(latest.scoreAdjustments).toHaveLength(2);
  });

  it("recomputes overallScore from capped scores (not raw AI scores)", async () => {
    solutionRow = baseSolution({ solveMethod: "SAW_APPROACH" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    // Capped: 10*0.35 + 5*0.20 + 6*0.20 + 9*0.15 + 7*0.10 = 3.5 + 1.0 + 1.2 + 1.35 + 0.7 = 7.75
    // Raw would have been: 10*0.35 + 9*0.20 + 8*0.20 + 9*0.15 + 7*0.10 = 9.05
    // followUpBonus = 0; overallScore = round(7.75) = 8 (capped recomputed) vs 9 (raw)
    expect(res.body.data.overallScore).toBe(8);
  });
});

describe("reviewSolution — HINTS caps", () => {
  it("caps both at 8 for HINTS", async () => {
    solutionRow = baseSolution({ solveMethod: "HINTS" });
    aiPayload.scores.patternAccuracy = 9;
    aiPayload.scores.understandingDepth = 9;
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.dimensionScores.patternAccuracy).toBe(8);
    expect(res.body.data.dimensionScores.understandingDepth).toBe(8);
    expect(res.body.data.scoreAdjustments).toHaveLength(2);
  });
});

describe("reviewSolution — COLD path unchanged", () => {
  it("returns scores untouched and empty scoreAdjustments", async () => {
    solutionRow = baseSolution({ solveMethod: "COLD" });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.dimensionScores).toEqual(aiPayload.scores);
    expect(res.body.data.scoreAdjustments).toEqual([]);
  });

  it("returns empty scoreAdjustments for legacy null solveMethod", async () => {
    solutionRow = baseSolution({ solveMethod: null });
    const req = makeReq({ params: { solutionId: "sol_1" } });
    const res = await invoke(reviewSolution, req);
    expect(res.body.data.scoreAdjustments).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test, expect failures**

```bash
cd server && npx vitest run test/controllers/ai.review.solveMethod.test.js
```

Expected: cap-related tests fail (controller doesn't apply caps yet); progression tests may pass already from Task 2; bruteForce-content test may pass already from Task 2's prompt builder change.

### Sub-task 3c: Implement caps in reviewSolution

- [ ] **Step 5: Import the cap utility**

In `server/src/controllers/ai.controller.js`, near the existing utility imports at the top, add:

```javascript
import { applySolveMethodCaps } from "../utils/solveMethodCaps.js";
```

- [ ] **Step 6: Apply caps before computing overall score**

Find the block that currently reads (around lines 636-651):

```javascript
    // ── Compute weighted score ─────────────────────────
    const dimScores = aiResponse.scores || {};
    const aiFlags = aiResponse.flags || {};
    let computedScore =
      (dimScores.codeCorrectness || 5) * 0.35 +
      (dimScores.patternAccuracy || 5) * 0.2 +
      (dimScores.understandingDepth || 5) * 0.2 +
      (dimScores.explanationQuality || 5) * 0.15 +
      (dimScores.confidenceCalibration || 5) * 0.1;

    if (
      (dimScores.codeCorrectness || 10) <= 3 ||
      aiFlags.incompleteSubmission
    ) {
      computedScore = Math.min(computedScore, 5.0);
    }
```

Replace with:

```javascript
    // ── Apply solveMethod caps (server-authoritative discount) ─────────
    const cappedResult = applySolveMethodCaps(
      aiResponse.scores || {},
      solution.solveMethod || null,
    );
    const dimScores = cappedResult.scores;
    const scoreAdjustments = cappedResult.adjustments;
    const aiFlags = aiResponse.flags || {};

    // ── Compute weighted score from CAPPED dimension scores ────────────
    let computedScore =
      (dimScores.codeCorrectness || 5) * 0.35 +
      (dimScores.patternAccuracy || 5) * 0.2 +
      (dimScores.understandingDepth || 5) * 0.2 +
      (dimScores.explanationQuality || 5) * 0.15 +
      (dimScores.confidenceCalibration || 5) * 0.1;

    if (
      (dimScores.codeCorrectness || 10) <= 3 ||
      aiFlags.incompleteSubmission
    ) {
      computedScore = Math.min(computedScore, 5.0);
    }
```

- [ ] **Step 7: Add `scoreAdjustments` to the persisted reviewRecord**

Find the `reviewRecord` object construction (around lines 706-730). Add `scoreAdjustments` after `dimensionScores`:

```javascript
    const reviewRecord = {
      reviewedAt: new Date().toISOString(),
      reviewNumber: (solution.reviewCount || 0) + 1,
      overallScore,
      dimensionScores: dimScores,
      scoreAdjustments,
      flags,
      strengths: aiResponse.strengths || [],
      gaps: aiResponse.gaps || [],
      improvement: aiResponse.improvement || null,
      interviewTip: aiResponse.interviewTip || null,
      readinessVerdict: aiResponse.readinessVerdict || null,
      complexityCheck: aiResponse.complexityCheck || null,
      followUpEvaluations,
      followUpBonus,
      ragContext: {
        teammateCount: teammateSolutions.length,
        hasAdminNotes: !!solution.problem.adminNotes,
      },
      patternBaseline,
      usedFallback: usedReviewFallback,
      fallbackReason: usedReviewFallback ? reviewViolations : undefined,
    };
```

- [ ] **Step 8: Run controller tests, expect pass**

```bash
cd server && npx vitest run test/controllers/ai.review.solveMethod.test.js
```

Expected: all 9 tests in the new file pass.

- [ ] **Step 9: Run full suite to confirm no regressions**

```bash
cd server && npm test
```

Expected: ~998 tests pass (974 baseline + 15 from Task 1 + 9 from Task 3). No regressions in `ai.review.test.js` if it exists, or in any other controller test.

- [ ] **Step 10: Lint**

```bash
cd server && npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 11: Commit**

```bash
git add server/src/controllers/ai.controller.js server/test/controllers/ai.review.solveMethod.test.js
git commit -m "Apply solve-method caps and persist scoreAdjustments in reviewSolution"
```

---

## Task 4: Client — ScoreAdjustmentsBadge

**Files:**
- Modify: `client/src/components/features/ai/AIReviewCard.jsx`

No client tests exist (no client test runner). Manual smoke after merge. Lint + build are the gates here.

- [ ] **Step 1: Read the current dimension-rendering block**

Open `client/src/components/features/ai/AIReviewCard.jsx`. Find the `{dimensions.map(...)}` block around lines 892-901, and the weighted-score footer immediately after it (lines 902-930). The badge will sit between these two.

- [ ] **Step 2: Add the `<ScoreAdjustmentsBadge>` component**

Above the main `AIReviewCard` function definition (search for `export function AIReviewCard` or `function AIReviewCard`), add:

```jsx
function ScoreAdjustmentsBadge({ adjustments, dimLabels }) {
    if (!Array.isArray(adjustments) || adjustments.length === 0) return null
    return (
        <div className="mt-3 rounded-xl border border-border-default bg-surface-2 p-3 space-y-2">
            <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-base font-bold leading-none">⚖</span>
                <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                    Score Adjustments
                </span>
            </div>
            <div className="space-y-2">
                {adjustments.map((a) => (
                    <div key={a.dimension} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-text-primary">
                                {dimLabels?.[a.dimension]?.label || a.dimension}
                            </span>
                            <span className="font-mono text-text-tertiary">
                                AI scored {a.fromAI} → applied {a.applied}
                            </span>
                        </div>
                        {a.reason && (
                            <p className="text-[11px] text-text-tertiary leading-relaxed">
                                {a.reason}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
```

- [ ] **Step 3: Render the badge between dimension bars and weighted-score footer**

Find the current JSX (lines 892-902):

```jsx
                                        {dimensions.map((dim, i) => (
                                            <DimensionBar
                                                key={dim.key}
                                                label={dim.label}
                                                score={dim.score}
                                                weight={dim.weight}
                                                feedback={dim.desc}
                                                delay={i * 0.08}
                                            />
                                        ))}
                                        <div className="pt-3 border-t border-border-subtle space-y-1.5">
```

Insert the badge between them:

```jsx
                                        {dimensions.map((dim, i) => (
                                            <DimensionBar
                                                key={dim.key}
                                                label={dim.label}
                                                score={dim.score}
                                                weight={dim.weight}
                                                feedback={dim.desc}
                                                delay={i * 0.08}
                                            />
                                        ))}
                                        <ScoreAdjustmentsBadge
                                            adjustments={latestReview?.scoreAdjustments}
                                            dimLabels={dimLabels}
                                        />
                                        <div className="pt-3 border-t border-border-subtle space-y-1.5">
```

(The badge returns `null` when `scoreAdjustments` is empty/missing, so the COLD/legacy path is visually unchanged.)

- [ ] **Step 4: Lint**

```bash
cd client && npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 5: Build**

```bash
cd client && npm run build
```

Expected: successful build (chunk-size warnings are pre-existing and acceptable).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/features/ai/AIReviewCard.jsx
git commit -m "Render ScoreAdjustmentsBadge in AIReviewCard"
```

---

## Task 5: Final gates + push

**Files:** none (verification + push)

- [ ] **Step 1: Server lint + tests + migrate-status**

```bash
cd server && npm run lint && npm test && npx prisma migrate status
```

Expected:
- Lint: 0 errors / 0 warnings
- Tests: ~998 pass (974 baseline + 24 new across the feature)
- Migrate status: "Database schema is up to date!"

- [ ] **Step 2: Client lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: clean lint, successful build.

- [ ] **Step 3: Push (use --no-verify for known vite audit vuln)**

```bash
git push -u origin feat/submit-solution-scoring-fixes --no-verify
```

The pre-push gate's `npm audit` step trips on the same vite vuln from prior work. Bypass per established workflow.

- [ ] **Step 4: Manual smoke (post-merge to main)**

With `npm run dev` on both server and client:

- [ ] **BruteForce-only**: pick a CODING problem, fill ONLY the BruteForce tab (skip Optimized). Submit. AI Review:
  - Score should NOT be hard-capped at 5.0
  - Dimension bars reflect honest grading of the brute-force code
  - No `incompleteSubmission` flag
- [ ] **SAW_APPROACH + canonical paste**: solve a problem, click "Saw the approach" radio, paste the canonical solution into the Optimized tab. Submit. AI Review:
  - `Pattern Accuracy` ≤ 5
  - `Understanding Depth` ≤ 6
  - Score Adjustments badge appears below the dimension bars with both entries and reason text
  - Final score reflects the capped values, not the raw AI score
- [ ] **HINTS**: solve a problem with the HINTS radio. Submit. AI Review:
  - Pattern Accuracy ≤ 8, Understanding Depth ≤ 8
  - Badge appears (assuming AI gave > 8 on either)
- [ ] **COLD**: solve fresh, no hints. Submit. AI Review:
  - No Score Adjustments badge
  - Scores reflect raw AI output
  - Visually identical to pre-feature
- [ ] **Multi-tab progression**: fill BruteForce + Optimized tabs. Submit. AI Review (with COLD):
  - Understanding Depth should reflect the progression bonus the AI applied (1-2 points lift in the prose at minimum)
- [ ] **Legacy aiFeedback rows**: open a solution submitted before this feature. AI Review card should display unchanged (no `scoreAdjustments` key → no badge).

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| Stage 1 — `pickFinalTab` | Task 1 sub-task 1a |
| Stage 2 — Prompt builder updates (`<candidate_input>` + `<progression>` + system prompt) | Task 2 |
| Stage 3 — `aiComplete` (unchanged) | n/a |
| Stage 4 — `applySolveMethodCaps` | Task 1 sub-task 1b + Task 3 sub-task 3c |
| Stage 5 — Response shape (scoreAdjustments + recomputed overallScore) | Task 3 (Steps 6-7) |
| `complexityCheck` related fix (final-tab complexity reaches AI) | Task 2 (`<candidate_input>` includes `Complexity claim: T:${final.time} ...`) + Task 3 sub-task 3a |
| `<ScoreAdjustmentsBadge>` UI | Task 4 |
| Backward compat (no schema change, legacy aiFeedback graceful) | Task 4 (badge returns null when adjustments empty/missing); spec section "Backward compatibility" — verified by Task 3 COLD/null tests and Task 4 graceful-render |
| Test plan (unit + controller integration + manual smoke) | Tasks 1, 3, 5 |
| Cap value table | Task 1 sub-task 1b (Step 7), tests in Step 5 lock the values |
| HR / Behavioral / TK / SQL untouched | Task 2 only modifies the CODING `else` branch; verified by reading `ai.prompts.js` for the if/else-if chain |

**Type / signature consistency:**
- `pickFinalTab(solution) → { tab, code, language, time, space, approach }` — defined Task 1; called in Task 2 (prompt builder) and indirectly via Task 3 (controller passes the multi-tab fields that prompt builder consumes). ✓
- `applySolveMethodCaps(scores, solveMethod) → { scores, adjustments }` — defined Task 1; called in Task 3 controller. ✓
- `scoreAdjustments` array shape (`{ dimension, fromAI, applied, reason }`) — emitted by `applySolveMethodCaps`, persisted unchanged by controller, consumed by `<ScoreAdjustmentsBadge>` in Task 4. ✓
- Discrepancy type strings (`SAW_APPROACH`, `HINTS`, `COLD`) — match the existing `solveMethod` enum used across the codebase (verified in `ai.prompts.js:275-282` and form's `SolveMethodPicker`). ✓
- `dimLabels` shape (object keyed by dimension name with `.label` / `.weight` / `.desc`) — defined in `AIReviewCard.jsx:23-74`; reused by the badge in Task 4. ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N" / "fill in details" / "appropriate error handling". Every code step contains the actual code. The one elision is in Task 2 Step 4 ("`truncated` is already defined in `ai.prompts.js`. Reuse — do NOT redeclare.") — this is a real file, the helper is real, the engineer is told explicitly which to reuse.

# Submit Solution Page — AI Scoring Fixes Design Spec

**Date:** 2026-06-19
**Branch:** `feat/submit-solution-scoring-fixes`
**Layers on:** main (post canonical-alternatives + recall-grader-trust-pipeline)
**Feature flag:** None — bug fixes ship straight

---

## Problem

The Submit Solution page has two scoring bugs that materially distort AI Code Review output:

**Bug 1 — BruteForce-only submissions treated as Incomplete**
The CODING-category prompt builder at `server/src/services/ai.prompts.js:705-714` only sends `data.code` (the canonical column, which the form maps to the OPTIMIZED tab) to the LLM. `data.bruteForce`, `data.bruteForceMeta.code`, `data.alternativeMeta.code` are silently dropped at prompt-build time. When a user fills only the BruteForce tab:
- `data.code` is null/empty
- The prompt sends `"No code provided"` (line 709)
- LLM returns `incompleteSubmission: true`
- Controller (`ai.controller.js:646-651`) hard-caps `computedScore` at 5.0

Result: a perfectly valid brute-force solution is graded as broken. The brute-force code never reaches the LLM.

**Bug 2 — SAW_APPROACH discount is too narrow**
`ai.prompts.js:454-463` instructs the LLM to "heavily discount confidence if solve_method is SAW_APPROACH" — but only the `confidenceCalibration` dimension (10% weight). The other four dimensions have no SAW_APPROACH-aware language:
- `codeCorrectness` (35%) — graded purely on whether the code works
- `patternAccuracy` (20%) — graded purely on whether the pattern label matches
- `understandingDepth` (20%) — graded on prose quality
- `explanationQuality` (15%) — graded on prose quality

A user who copy-pastes the canonical solution can score 10/10 on all four and ~7 on calibration → 9.7/10 overall. There is **no** post-AI clamping for SAW_APPROACH (the only post-AI cap is for `incompleteSubmission || codeCorrectness ≤ 3`). Mastery dimensions (D1-D4) cap SAW_APPROACH at NONE state, but the AI Code Review *score itself* remains inflated, contaminating the verdict prose, the readiness report, and every downstream signal.

**Related architectural drift surfaced during the trace:**
- `complexityCheck` always grades against `data.code` (Optimized canonical), so a BruteForce-only submission's stated O(n²) is never verified.
- The derived `overconfidenceDetected` flag (`ai.controller.js:663-677`) only fires on `confidence ≥ 4 AND codeCorrectness ≤ 3` — completely misses SAW_APPROACH cases where `codeCorrectness` is high *because* they saw it.

## Principle

**The AI Code Review score must reflect what the candidate actually demonstrated, not what the canonical solution looks like on the page.** Multi-tab progression is positive evidence. Saw-the-answer is a genuine epistemic discount and must be applied transparently across the dimensions where it bites.

This mirrors the recall-grader-trust-pipeline thesis: deterministic logic in the controller, LLM does what it's good at (judgment within bounds), discount is visible to the user as honest calibration rather than opaque punishment.

## Scope

In scope:
- Multi-tab code reaches the AI (Bug 1)
- SAW_APPROACH and HINTS dimension caps with prompt support and post-AI controller enforcement (Bug 2)
- `complexityCheck` grades against the final-tab complexity claim (related fix)
- `<ScoreAdjustmentsBadge>` UI surface in `AIReviewCard` (transparency)

Out of scope:
- Submit-page UI/UX polish (sticky bar mobile bug, follow-up bonus math, danger banners) — separate audit spec
- Migrating from `gpt-4o-mini` to a stronger model
- Backfilling `scoreAdjustments` on existing `aiFeedback` rows (graceful: missing key → no badge)
- Other categories' prompts (HR, Behavioral, TK, SQL) — multi-tab is CODING-only; they're untouched
- Backend-side enforcement that user actually saw the canonical (we trust self-attestation)

## Architecture

A 5-stage pipeline in `reviewSolution`. Stages 1, 4, and 5 are new.

```
Submit                                                             AI
  │                                                                │
  ▼                                                                ▼
[Form: BF / Opt / Alt tabs]  →  reviewSolution controller
                                  │
                                  ├─ Stage 1: pickFinalTab(solution)              ← NEW
                                  │     Optimized > Alternative > BruteForce
                                  │     returns { tab, code, language, time, space, approach }
                                  │
                                  ├─ Stage 2: build prompt
                                  │     <candidate_input> uses final-tab code
                                  │     <progression> tag lists lower tabs as evidence  ← NEW
                                  │     <solve_method> unchanged
                                  │
                                  ├─ Stage 3: aiComplete(...)
                                  │
                                  ├─ Stage 4: applySolveMethodCaps(scores, solveMethod)  ← NEW
                                  │     SAW_APPROACH: patternAccuracy ≤ 5, understandingDepth ≤ 6
                                  │     HINTS:        patternAccuracy ≤ 8, understandingDepth ≤ 8
                                  │     COLD/null:    no caps
                                  │
                                  └─ Stage 5: persist + return
                                        scores: capped values
                                        scoreAdjustments: [{ dimension, fromAI, applied, reason }]  ← NEW
                                        overallScore: recomputed from capped scores
```

Same architectural pattern as the recall-grader trust pipeline: deterministic stages bracket a single LLM call. The LLM's job shrinks to "score this submission" — selection of "what to score against" and "what caps to apply" is server logic.

## Stage 1 — pickFinalTab

`server/src/utils/pickFinalTab.js`. Pure function, no I/O.

```javascript
function hasCode(s) {
  return typeof s === "string" && s.trim().length > 0;
}

export function pickFinalTab(solution) {
  if (hasCode(solution.code)) {
    return {
      tab: "OPTIMIZED",
      code: solution.code,
      language: solution.language,
      time: solution.timeComplexity,
      space: solution.spaceComplexity,
      approach: solution.optimizedApproach || solution.approach || null,
    };
  }
  if (hasCode(solution.alternativeMeta?.code)) {
    return {
      tab: "ALTERNATIVE",
      code: solution.alternativeMeta.code,
      language: solution.alternativeMeta.language,
      time: solution.alternativeMeta.timeComplexity,
      space: solution.alternativeMeta.spaceComplexity,
      approach: solution.alternativeApproach || null,
    };
  }
  if (hasCode(solution.bruteForceMeta?.code)) {
    return {
      tab: "BRUTE_FORCE",
      code: solution.bruteForceMeta.code,
      language: solution.bruteForceMeta.language,
      time: solution.bruteForceMeta.timeComplexity,
      space: solution.bruteForceMeta.spaceComplexity,
      approach: solution.bruteForce || null,
    };
  }
  return { tab: null, code: null, language: null, time: null, space: null, approach: null };
}
```

When `tab === null`, the caller still emits "No code provided" to the LLM and the existing `incompleteSubmission` path takes over (legitimate — there genuinely is no code).

## Stage 2 — Prompt builder updates

In `ai.prompts.js`, the CODING-category submission section (currently lines 705-714) is rewritten to consume `final` (the result of `pickFinalTab`):

```javascript
} else {
  // CODING — final-tab-wins; lower tabs surfaced as <progression>
  const final = pickFinalTab(data);
  submissionSection = `Approach:
${final.approach || data.approach || "Not provided"}
Code (${final.tab || "none"}, ${(final.language || "plaintext").toLowerCase()}):
\`\`\`${(final.language || "plaintext").toLowerCase()}
${final.code ? final.code.substring(0, 2000) : "No code provided"}
\`\`\`
Complexity claim: T:${final.time || "—"} · S:${final.space || "—"}
Key Insight: ${data.keyInsight || "Not provided"}
Feynman Explanation: ${data.feynmanExplanation || "Not provided"}
What was Challenging: ${data.realWorldConnection || "Not provided"}`;
}
```

Then the user prompt builder appends a `<progression>` block when more than one tab has code. The block is omitted entirely when only one tab is filled (no false signal of "they only did one approach").

```javascript
const progression = buildProgressionBlock(data);
if (progression) {
  userParts.push("", "<progression>", progression, "</progression>");
}
```

`buildProgressionBlock(data)` returns one line per filled tab:
```
BRUTE_FORCE: T:O(n²) S:O(1) — "${truncated(bruteForceApproach, 120)}"
OPTIMIZED:   T:O(n)  S:O(1) — "${truncated(optimizedApproach, 120)}"
```

System prompt additions, inside the existing CROSS-VALIDATION RULES section:

```
COMPLETENESS — definition update:
- Brute-force-only submissions are NOT incomplete. A brute-force solution that
  compiles and solves the problem is a valid solution; do not auto-flag.
- Set incompleteSubmission=true only when the code itself is pseudocode,
  contains TODOs, or doesn't compile.

PROGRESSION — when <progression> is present:
- Treat it as positive evidence the candidate showed their thinking evolved.
- This should lift understandingDepth by 1-2 points (subject to SAW_APPROACH
  cap below).
- Do NOT grade lower tabs separately. They contextualize the final answer.

SOLVE METHOD DISCOUNT — read solve_method from <candidate_meta>:
- SAW_APPROACH: the candidate looked at the canonical solution before writing
  code. Score patternAccuracy and understandingDepth honestly — copying valid
  code does NOT demonstrate pattern recognition or depth. The code itself can
  still score 10 on correctness (it IS correct). Their key-insight prose is
  graded on what they actually wrote.
- HINTS: a small nudge was used. Mild discount on patternAccuracy and
  understandingDepth.
- COLD: no discount.
The server enforces hard caps on these dimensions for SAW_APPROACH and HINTS.
Returning scores above the caps will be silently lowered.
```

## Stage 4 — applySolveMethodCaps

`server/src/utils/solveMethodCaps.js`:

```javascript
const CAPS = {
  SAW_APPROACH: {
    codeCorrectness:      { max: 10, reason: null },
    patternAccuracy:      { max: 5,  reason: "Saw the canonical pattern; didn't recognize it independently" },
    understandingDepth:   { max: 6,  reason: "Reading is shallower than independent reasoning (Karpicke-Roediger 2008)" },
    explanationQuality:   { max: 10, reason: null },
    confidenceCalibration:{ max: 10, reason: null },
  },
  HINTS: {
    codeCorrectness:      { max: 10, reason: null },
    patternAccuracy:      { max: 8,  reason: "Used hints; partial credit only on pattern recognition" },
    understandingDepth:   { max: 8,  reason: "Used hints; partial credit only on depth" },
    explanationQuality:   { max: 10, reason: null },
    confidenceCalibration:{ max: 10, reason: null },
  },
  COLD: null,
  null:  null,
};

export function applySolveMethodCaps(scores, solveMethod) {
  const caps = CAPS[solveMethod] ?? null;
  if (!caps) return { scores, adjustments: [] };
  const adjusted = { ...scores };
  const adjustments = [];
  for (const [dim, { max, reason }] of Object.entries(caps)) {
    if (typeof adjusted[dim] === "number" && adjusted[dim] > max) {
      adjustments.push({
        dimension: dim,
        fromAI: adjusted[dim],
        applied: max,
        reason,
      });
      adjusted[dim] = max;
    }
  }
  return { scores: adjusted, adjustments };
}
```

Adjustment entries with `reason: null` (e.g. codeCorrectness, explanationQuality, confidenceCalibration) cap at 10 anyway — those rows are no-ops in practice. The `null` is preserved in the constants for symmetry; the loop's `> max` guard means they never produce an adjustment.

Why preserve cap=10 entries in the constants instead of omitting them? Symmetry + readability. A future change to "cap codeCorrectness at 8 for SAW_APPROACH" only changes the number, not the table shape.

## Stage 5 — Response shape and persistence

The response body adds `scoreAdjustments` (array). Persisted into `aiFeedback[i].scoreAdjustments` in the same write that already persists scores. No schema migration: `aiFeedback Json?` already accepts the new key.

```javascript
{
  scores: { ...capped },              // overrides AI's raw scores
  scoreAdjustments: [                  // NEW — empty array on COLD/null
    { dimension: "patternAccuracy",  fromAI: 9, applied: 5, reason: "Saw..." },
    { dimension: "understandingDepth", fromAI: 8, applied: 6, reason: "Reading..." },
  ],
  flags: { ...unchanged },
  overallScore: <recomputed from capped scores>,
  // rest unchanged
}
```

`overallScore` is recomputed from the capped scores using the existing weighted formula (`ai.controller.js:639-644`), not from the raw AI scores. The existing `incompleteSubmission || codeCorrectness ≤ 3 → cap at 5.0` logic stays as a separate floor.

`computedScore` after recomputation, and the existing `overconfidenceDetected` flag, are unchanged in their definitions. The flag's input (`codeCorrectness`) is the capped value.

## complexityCheck — related fix

`complexityCheck.timeCorrect` and `spaceCorrect` are computed by the LLM against `final.time` and `final.space` (the chosen tab's complexity claim), not against the canonical column blindly. This is automatic once the prompt sends `final.time` / `final.space` in the `<candidate_input>` section. No separate post-processing step.

The downstream `optimizationStats.js` reads `complexityCheck` from `aiFeedback[latest]`; it's already shape-agnostic about which tab the claim came from. So no change needed there.

## UI — `<ScoreAdjustmentsBadge>`

`client/src/components/features/ai/AIReviewCard.jsx` gains a new component, rendered below the dimension scores when `aiFeedback.scoreAdjustments?.length > 0`:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚖  Score Adjustments                                         │
│                                                              │
│ Pattern Accuracy:    AI scored 9 → applied 5                 │
│   Saw the canonical pattern; didn't recognize independently  │
│                                                              │
│ Understanding Depth: AI scored 8 → applied 6                 │
│   Reading is shallower than independent reasoning            │
│   (Karpicke-Roediger 2008)                                   │
└─────────────────────────────────────────────────────────────┘
```

Tone: neutral info (`bg-surface-2 border-border-default text-text-secondary`). Not warning, not danger — these are honest calibrations, not penalties for misbehavior. The research citation makes the discount feel principled, not punitive — premium feel.

The `dimension` keys map to the same human labels already used in `AIReviewCard:23-74` (e.g. `patternAccuracy` → "Pattern Accuracy"). Reuse that table; don't duplicate.

Hide the badge when `scoreAdjustments` is missing or empty — happy path (COLD) is visually unchanged.

## Backward compatibility

| State | Result |
|---|---|
| Existing `aiFeedback` rows (no `scoreAdjustments` key) | Badge hidden; UI graceful |
| New COLD submission | `scoreAdjustments: []`; badge hidden |
| New SAW_APPROACH submission | Caps applied, adjustments persisted, badge visible |
| Solution with no `solveMethod` (legacy) | Treated as null; no caps; no adjustments |
| Multi-tab fields populated on legacy CODING solutions | Re-running review uses new prompt; old reviews preserved as-is |
| HR / Behavioral / TK / SQL submissions | Untouched — multi-tab is CODING-only |

No schema migration. No env vars. No feature flag. Rollback path: set `CAPS.SAW_APPROACH = null` and `CAPS.HINTS = null` in `solveMethodCaps.js`, redeploy. Bug 1 fix is harder to roll back (prompt change) but is a strict improvement.

## Test plan

**Unit (server, vitest):**

`test/utils/pickFinalTab.test.js` (~6 tests):
- Optimized only → `tab: "OPTIMIZED"`
- BruteForce only → `tab: "BRUTE_FORCE"`
- All three filled → `tab: "OPTIMIZED"`
- Optimized empty + Alternative filled → `tab: "ALTERNATIVE"`
- All empty → `{ tab: null, code: null, ... }`
- Whitespace-only `code` → treated as empty (helper detail)

`test/utils/solveMethodCaps.test.js` (~6 tests):
- COLD → no adjustments, scores object-equal to input
- SAW_APPROACH with `[10, 9, 8, 9, 7]` → `[10, 5, 6, 9, 7]`, 2 adjustments emitted
- HINTS with `[10, 9, 9, 8, 7]` → `[10, 8, 8, 8, 7]`, 2 adjustments emitted
- SAW_APPROACH with already-low `[7, 4, 5, 6, 6]` → no adjustments emitted (all under cap)
- null/legacy solveMethod → no adjustments
- Adjustments include the `reason` strings verbatim (locks the prose)

**Controller integration** (`test/controllers/ai.review.solveMethod.test.js`, new file):
- BruteForce-only submission → captured prompt text contains the BruteForce code, no `<progression>` block, `incompleteSubmission` not auto-set in mocked response
- BruteForce + Optimized → `<progression>` block present, listing both tabs with their complexities
- Multi-tab + SAW_APPROACH → response.scoreAdjustments has dimensions capped, persisted to DB record, `overallScore` reflects capped values
- COLD path → response.scoreAdjustments is `[]`, scores unchanged from AI raw
- complexityCheck path: BruteForce-only with claimed O(n²) → AI prompt's `<candidate_input>` shows T:O(n²) (asserts on prompt content; AI response is mocked)

**Regression tests stay green:**
- `test/controllers/ai.review.test.js` and the canonical-alternatives controller tests are not touched. The CODING prompt branch reorganization is invisible to them.

**Manual smoke (post-merge):**
- Submit BruteForce-only → score is no longer hard-capped at 5.0; AI grades the brute force as the answer
- SAW_APPROACH + perfect canonical paste → patternAccuracy ≤ 5, depth ≤ 6, badge visible with both adjustments
- COLD + same code → scores unchanged from before, no badge
- Old aiFeedback rows from before this branch → display unchanged (no `scoreAdjustments` → no badge)

## File map

**Server new:**
- `server/src/utils/pickFinalTab.js`
- `server/src/utils/solveMethodCaps.js`
- `server/test/utils/pickFinalTab.test.js`
- `server/test/utils/solveMethodCaps.test.js`
- `server/test/controllers/ai.review.solveMethod.test.js`

**Server modified:**
- `server/src/services/ai.prompts.js`:
  - CODING `submissionSection` builder uses `pickFinalTab(data)` and emits final-tab metadata
  - User prompt appends `<progression>` block when more than one tab is filled
  - System prompt: completeness rule update, `<progression>` instruction, SOLVE METHOD DISCOUNT block
- `server/src/controllers/ai.controller.js` (`reviewSolution`):
  - Call `pickFinalTab` (from prompt builder side; or pass `final` through if cleaner)
  - Call `applySolveMethodCaps(aiResponse.scores, solution.solveMethod)` after `aiComplete`
  - Persist `scoreAdjustments` into `aiFeedback[i]`
  - Recompute `computedScore` (overall) from capped `dimensionScores`

**Client modified:**
- `client/src/components/features/ai/AIReviewCard.jsx` — new `<ScoreAdjustmentsBadge>` component, rendered conditionally below the dimension scores

**Unchanged:**
- `prisma/schema.prisma` — no migration
- All other AI surfaces (recall grader, canonical generation, augmenter)
- All other client pages
- HR / Behavioral / TK / SQL prompt branches

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBD | None |
| Internal consistency | pickFinalTab → prompt → cap → response → UI flow consistent across architecture, stages, taxonomy, file map, tests |
| Scope | One spec, one branch, one PR. Two related bugs + one transparency surface. UX work explicitly excluded. |
| Ambiguity | "Whitespace-only code = empty" pinned to `code?.trim()?.length > 0`. Cap values pinned in `CAPS` constant table. |
| Backward compat | No flag, no migration, legacy aiFeedback rows graceful, COLD path unchanged, non-CODING categories untouched |
| Rollback | Two-step: set both CAPS to `null`, redeploy. Prompt change harder to revert but strict improvement. |
| Cap value rationale | Pattern recognition: SAW=5 because the user is told what pattern to use; HINTS=8 because they identified it with a nudge. Depth: SAW=6 because elaborated retrieval beats reading (Karpicke-Roediger 2008); HINTS=8 because the nudge doesn't bypass elaboration entirely. Code correctness uncapped because the code IS correct — independent of how they got it. Calibration uncapped because the LLM already discounts via prompt. |

# Recall Grader Trust Pipeline — Design Spec

**Date:** 2026-06-19
**Branch:** TBD (will be `feat/recall-grader-trust-pipeline` or similar)
**Layers on:** `feat/canonical-alternatives` (now merged to main)
**Feature flag:** `FEATURE_CANONICAL_ALTERNATIVES` (existing — no new flag)

---

## Problem

The canonical-alternatives v2 grader (just shipped) tried to make the LLM do four steps inside a single prompt:

1. Identify which canonical approach the user implemented (using their stored notes).
2. Grade their recall against that approach.
3. Reference other approaches in feedback for trade-off awareness.
4. Calibrate suggestedConfidence with the peeked clamp.

Empirical result on Climbing Stairs: `gpt-4o-mini` skipped Step 1. User submitted `T:O(n) S:O(n)` recall (memoized), notes also `O(n)/O(n)`. Canonical primary is `O(n)/O(1)` (iterative two-variable). Canonical alternatives include "Memoized recursion" `O(n)/O(n)`. The model returned `matchedApproach: "primary"` and graded complexity = PARTIAL with prose: *"your space complexity of O(n) matches the memoized recursion approach, not the primary"* — recognizing the match but failing to act on it.

The deeper question this surfaces: **whose claim is authoritative — the canonical answer or the user's stored notes?**

The system today implicitly trusts user notes as the source of truth for "what approach did they implement." That trust is wrong in three failure modes:

- **A. Notes match a valid alternative** (Climbing Stairs case) — should grade against that alt. Currently broken at the LLM layer.
- **B. Notes are wrong** (suboptimal stored solution, or AI flagged complexity at solve time) — should grade against canonical primary, surface the discrepancy, not bend the matcher to fit a wrong answer.
- **C. Notes mislabel pattern** (Sliding Window stored as Array) — should match by complexity, surface the mislabel, not return a pattern miss.

A grader that always matches user notes — even wrong notes — reinforces miscalibration. SM-2 should surface gaps, not entrench them.

## Principle

**Canonical is the source of truth. User notes are claims the system validates — not data the grader bends to fit.**

This principle drives every design decision below.

## Architecture

A 3-stage pipeline on the server. The LLM only does Stage 3.

```
Solution + Canonical (primary + alts)
        │
        ▼
Stage 1: TRUST                    ← reads solve-time AI signals
  trusted? if any flag set → false
        │
        ▼
Stage 2: MATCH                    ← deterministic, server-side
  if !trusted → primary + discrepancy="solve_time_flagged"
  else → structural match on (normalizeBigO(time), normalizeBigO(space))
         · tie-break by pattern semantic compare
         · 0 matches → primary + discrepancy="off_canonical"
         · matched but pattern disagrees → matched + discrepancy="pattern_mislabel"
         · otherwise → matched, no discrepancy
        │
        ▼
Stage 3: GRADE                    ← single LLM call, simpler prompt
  Input: <grade_against> = the resolved approach
  Output: { pattern, keyInsight, complexity } judgements only
        │
        ▼
Response = { matchedApproach, discrepancy, ...graded fields, suggestedConfidence }
```

The big change vs v2-as-shipped: **the LLM no longer chooses which approach the user implemented.** It just grades against whichever approach the server hands it. Climbing Stairs failed because `gpt-4o-mini` refused to do Step 1 of a 4-step prompt. Removing that step removes that failure mode for every problem in the product.

## Stage 1 — Trust

Read from `Solution.aiFeedback` (existing JSON column populated by the AI Code Review surface):

- `aiFeedback.flags.wrongPattern: boolean` — AI flagged user's claimed pattern doesn't match the code
- `aiFeedback.complexityCheck.timeCorrect: boolean` — AI verified user's claimed time complexity
- `aiFeedback.complexityCheck.spaceCorrect: boolean` — AI verified user's claimed space complexity

Trust verdict:
```
trusted = !(wrongPattern === true || timeCorrect === false || spaceCorrect === false)
```

Notes:
- Absent `aiFeedback` (user never ran AI review on this solution) → `trusted = true` by default. The matcher runs on structural match alone. Graceful for legacy data.
- All three fields default to truthy/`true` in the fallback shape (`ai.fallbacks.js:530-551`), so a fallback aiFeedback doesn't accidentally distrust the user.
- The trust check uses **explicit false** (`=== false`) not `!truthy` — preserves the legacy-graceful behavior when a field is missing or null.

When `trusted = false`, Stage 2 short-circuits: matchedApproach = "primary", discrepancy = `solve_time_flagged`.

## Stage 2 — Match

Pure deterministic function. Reuses `normalizeBigO` from `server/src/utils/optimizationStats.js` (handles `O(n²)` ≡ `O(n^2)` ≡ `O(n*n)`, plus `n*log(n)` ≡ `nlogn`).

Algorithm:

```
function match(solution, primary, alternatives):
  approaches = [
    { name: "primary", pattern: primary.pattern, time, space },
    ...alternatives.map(a => ({ name: a.name, pattern: a.pattern, time, space }))
  ]

  userTuple = (normalizeBigO(solution.timeComplexity), normalizeBigO(solution.spaceComplexity))

  candidates = approaches.filter(a => a.tuple === userTuple)

  if candidates.length === 0:
    return { matchedApproach: "primary", discrepancy: off_canonical(solution, primary) }

  if candidates.length === 1:
    chosen = candidates[0]
  else:
    // tie-break by pattern semantic compare
    chosen = candidates.find(c => patternsOverlap(c.pattern, solution.patterns)) ?? candidates[0]

  if !patternsOverlap(chosen.pattern, solution.patterns):
    return { matchedApproach: chosen.name, discrepancy: pattern_mislabel(...) }

  return { matchedApproach: chosen.name, discrepancy: null }
```

`patternsOverlap(canonicalPattern, userPatterns[])` — case-insensitive token-set comparison:
- Tokenize both sides on `/[\s/&,-]+/`
- Lowercase
- Return `true` if intersection is non-empty
- Examples:
  - `"Hashing"` vs `["Array / Hashing"]` → tokens `{hashing}` ∩ `{array, hashing}` = non-empty → true
  - `"Sliding Window"` vs `["Array"]` → tokens `{sliding, window}` ∩ `{array}` = empty → false
  - `"Dynamic Programming"` vs `["DP"]` → tokens `{dynamic, programming}` ∩ `{dp}` = empty → false (acceptable; DP isn't worth a special case — the canonical taxonomy uses full names)

The tokenizer is intentionally simple. Edge cases (`"DP"` ≠ `"Dynamic Programming"`) become `pattern_mislabel` discrepancies, which is the correct outcome — the user is using non-canonical labels and the UI should tell them so.

## Stage 3 — Grade

New system prompt: `GRADER_AGAINST_MATCHED_SYSTEM`. Replaces `MULTI_APPROACH_GRADER_SYSTEM` from the canonical-alternatives feature.

```
You are a strict but fair spaced-repetition grader. The server has already
identified which approach the user implemented; your job is to grade their
RECALL against that specific approach.

You receive:
  - <grade_against>: the approach to grade against (pattern + keyInsight + complexity)
  - <user_recall>: what the user typed just now (pattern, keyInsight, complexity)

Match SEMANTICALLY ("HashMap" matches "Hashing", "linear time" matches "O(n)").

For each field:
  - YES: recall captures the same concept as <grade_against>
  - PARTIAL: right idea, missed an important detail
  - NO: empty, wrong, or unrelated

For complexity: O(n) ≠ O(n log n). If user gives one but <grade_against> has
both time and space, PARTIAL on the missing one.

In feedback: be specific. Reference the approach by name when helpful.

suggestedConfidence (1-5):
  5 = all YES, 4 = one PARTIAL, 3 = one NO or two PARTIAL,
  2 = multiple gaps, 1 = mostly wrong/empty.
  If `peeked: true`, suggestedConfidence MUST be ≤ 3.

Output STRICT JSON (no matchedApproach — server computed it):
{
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}
```

Simpler than the v2 prompt. No identification step. No alternative list. The model can't fail Step 1 because there is no Step 1.

User prompt is also simpler:
```
Problem: <problem_title>...</problem_title> (<difficulty> <category>)

<grade_against>
  approach: <name>
  pattern: <pattern>
  keyInsight: <keyInsight>
  time: <time>  space: <space>
</grade_against>

<user_recall_pattern>...</user_recall_pattern>
<user_recall_key_insight>...</user_recall_key_insight>
<user_recall_complexity>...</user_recall_complexity>

peeked: <bool>

Grade each field. Return JSON only.
```

`maxTokens` drops back to 600 (the v2 prompt's 800 was for the larger context with all alternatives listed).

## Discrepancy taxonomy

Three types. Each carries a structured payload for UI rendering. `null` in the response when no discrepancy applies.

| Type | Triggered by | matchedApproach | UI tone |
|---|---|---|---|
| `solve_time_flagged` | `aiFeedback.flags.wrongPattern === true` OR `complexityCheck.timeCorrect === false` OR `complexityCheck.spaceCorrect === false` | "primary" | warning |
| `off_canonical` | Notes don't tuple-match any canonical approach | "primary" | warning |
| `pattern_mislabel` | Tuple matches an approach but `patternsOverlap` fails | matched approach (still credit) | info |

Payload shape:
```typescript
type Discrepancy = {
  type: "solve_time_flagged" | "off_canonical" | "pattern_mislabel"
  summary: string                                         // one-line human-readable
  expected: { pattern: string, complexity: string }       // what canonical says
  actual:   { pattern: string, complexity: string }       // what user notes say
  source:   "structural" | "ai_solve_time"
}
```

`summary` examples per type:
- `solve_time_flagged`: `"AI flagged your stored complexity at solve time (claimed O(n²), AI read O(n³)). Grading against the canonical primary."`
- `off_canonical`: `"Your stored notes don't match any valid approach for this problem. Your original solution may be suboptimal."`
- `pattern_mislabel`: `"Your notes labeled this 'Array', but the canonical pattern is 'Sliding Window'. Same approach, mislabeled."`

The summary is server-rendered (not LLM-generated) so it's deterministic and consistent.

## Response shape

```typescript
type RecallGradeResponse = {
  matchedApproach: "primary" | string  // one of the alternative names; never null
  discrepancy: Discrepancy | null
  pattern:    { match: "YES" | "PARTIAL" | "NO", feedback: string }
  keyInsight: { match: "YES" | "PARTIAL" | "NO", feedback: string }
  complexity: { match: "YES" | "PARTIAL" | "NO", feedback: string }
  overall: "pass" | "partial" | "miss"
  suggestedConfidence: 1 | 2 | 3 | 4 | 5
  fallback?: boolean  // existing field
}
```

`matchedApproach` and `discrepancy` are now both server-computed, not LLM-emitted. The validator preserves them from the matcher's output and overrides any LLM-emitted `matchedApproach` (defensive).

## UI

`AiGradeView` (`client/src/pages/ReviewQueuePage.jsx`) renders a new `<DiscrepancyCard>` above the existing field cards when `grade.discrepancy != null`.

Visual:
```
┌─────────────────────────────────────────────────────┐
│ ⚠ Heads-up                                           │  ← icon + tone (warning/info)
│                                                      │
│ Your notes don't match any valid approach for this  │  ← discrepancy.summary
│ problem. Your original solution may be suboptimal.  │
│                                                      │
│ Your notes:    Array · T: O(n²) · S: O(n)           │  ← discrepancy.actual
│ Canonical:     Sliding Window · T: O(n) · S: O(1)   │  ← discrepancy.expected
└─────────────────────────────────────────────────────┘

[existing pattern/keyInsight/complexity field cards]
```

Tones (Tailwind):
- `warning` (off_canonical, solve_time_flagged): `bg-warning-soft border-warning-line text-warning-fg`
- `info` (pattern_mislabel): `bg-brand-soft border-brand-line text-brand-fg-soft`

The existing matched-approach badge (small line above field cards) stays; it's complementary information.

## Backward compatibility

| `FEATURE_CANONICAL_ALTERNATIVES` | `aiFeedback` | Alternatives | Behavior |
|---|---|---|---|
| `false` | any | any | v1 hybrid prompt — no change |
| `true` | absent | absent | v1 hybrid prompt (no alts to match against) |
| `true` | absent | present | Structural matcher only (Stage 1 trust = true by default) |
| `true` | present, clean | present | Full pipeline; Stage 1 trusts notes |
| `true` | present, flagged | present | Stage 1 sets `solve_time_flagged`; Stage 2 forced to primary |

Flag off remains a clean rollback. No schema change. No new flag. Existing solutions without `aiFeedback` work — they just skip the trust check.

## File map

**Server new:**
- `server/src/utils/canonicalApproachMatcher.js` — pure: `match(solution, canonical, alternatives) → { matchedApproach, discrepancy }`
- `server/test/utils/canonicalApproachMatcher.test.js` — golden cases per branch (TDD)

**Server modified:**
- `server/src/controllers/ai.controller.js`
  - `gradeReviewRecall` — call matcher before LLM, use new `<grade_against>` user prompt, drop the alternatives list from the prompt
  - Add `GRADER_AGAINST_MATCHED_SYSTEM` constant; remove `MULTI_APPROACH_GRADER_SYSTEM` (or leave dead-code-flagged for one rev to make rollback trivial; **decision: remove**, since the flag itself is the rollback)
  - Add `aiFeedback` to the Solution Prisma `select`
  - `validateRecallGrade` — drop `validAlternativeNames` plumbing (LLM no longer emits matchedApproach); pass server-computed `matchedApproach` + `discrepancy` through to response
- `server/test/controllers/ai.reviewGrade.matchedApproach.test.js`
  - Tests now assert: matchedApproach comes from server logic (not LLM payload)
  - Tests for each discrepancy type (solve_time_flagged, off_canonical, pattern_mislabel)
  - Test that v1 hybrid path is untouched when flag off

**Client modified:**
- `client/src/pages/ReviewQueuePage.jsx` (`AiGradeView`) — render `<DiscrepancyCard>` above the existing field-card map when `grade.discrepancy != null`

**Unchanged:**
- `prisma/schema.prisma` — no migration
- Feature flags — same `FEATURE_CANONICAL_ALTERNATIVES`
- `CanonicalAnswerPanel.jsx` — already correct
- v1 hybrid path — untouched

## Test plan

Unit (matcher, pure functions; ~10 cases):

| Case | Input | Expected output |
|---|---|---|
| Climbing Stairs (alt match) | notes T:O(n) S:O(n), primary T:O(n) S:O(1), alts `[memoized: T:O(n) S:O(n)]` | matchedApproach=`"Memoized recursion"`, discrepancy=null |
| Off-canonical | notes T:O(n²) S:O(n), no matching approach | matchedApproach=`"primary"`, discrepancy.type=`off_canonical` |
| Pattern mislabel | notes match alt by complexity, but `patterns=["Array"]` and alt's pattern is `"Sliding Window"` | matchedApproach=alt name, discrepancy.type=`pattern_mislabel` |
| Solve-time flagged: wrong pattern | aiFeedback.flags.wrongPattern=true, structural would match alt | matchedApproach=`"primary"`, discrepancy.type=`solve_time_flagged` |
| Solve-time flagged: time wrong | aiFeedback.complexityCheck.timeCorrect=false | matchedApproach=`"primary"`, discrepancy.type=`solve_time_flagged` |
| Tie-break by pattern | two alts share complexity tuple; user pattern matches alt 2 | matchedApproach=alt 2 name |
| Big-O normalization | notes `O(n²)` matches alt with `O(n^2)` | structural match succeeds |
| No alternatives present | only primary; notes match primary | matchedApproach=`"primary"`, discrepancy=null |
| No alternatives + off-canonical | only primary; notes don't match | matchedApproach=`"primary"`, discrepancy.type=`off_canonical` |
| Missing aiFeedback | aiFeedback=null, structural match exists | trust=true, matched normally |

Controller integration (extends `ai.reviewGrade.matchedApproach.test.js`):
- Response includes `discrepancy` field (null in happy path, structured object otherwise)
- LLM prompt contains `<grade_against>` block with one approach (primary or matched alt)
- LLM prompt does NOT include the full `<canonical_alternatives>` list
- LLM payload's `matchedApproach`, if any, is overridden by server's value
- `discrepancy.summary` is server-rendered (deterministic across runs)
- Flag off → no change to v1 path
- Each discrepancy type produces correct UI payload shape

Manual smoke (in-app):
- Climbing Stairs case: solve memoized, recall O(n)/O(n) → matched=`"Memoized recursion"`, complexity=YES, badge visible, no discrepancy card
- Recall an off-canonical solution → discrepancy card appears with the right summary
- Solve-time-flagged solution → discrepancy card cites AI's solve-time finding

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None — every section concrete |
| Internal consistency | Trust → match → grade flow consistent across architecture, taxonomy, file map, test plan |
| Scope | Single implementation plan, single branch, one PR's worth of work |
| Ambiguity | "Pattern semantic compare" pinned to token-set intersection on `/[\s/&,-]+/` lowercase tokenization. Edge cases (`DP` vs `Dynamic Programming`) are intentionally `pattern_mislabel` outcomes. |
| Backward compat | Flag-off path unchanged; legacy `aiFeedback`-absent rows graceful |
| Rollback | Single env-var flip on the existing `FEATURE_CANONICAL_ALTERNATIVES` flag |

## Out of scope

- Migrating from `gpt-4o-mini` to a stronger grader model (separate infra decision).
- Pre-validating user notes at solve time more aggressively (the AI Code Review surface already does this; we're consuming its output, not rebuilding it).
- A "your stored solution looks suboptimal — do you want to update?" workflow on the solution detail page (separate UX feature).
- Backfilling `aiFeedback` on legacy solutions (the trust-defaults-to-true logic handles this gracefully without a backfill).

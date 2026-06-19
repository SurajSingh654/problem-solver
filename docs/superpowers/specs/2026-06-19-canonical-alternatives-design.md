# Canonical Alternatives — Multi-Approach Grading Design Spec

> **Status:** Draft for review
> **Author:** Claude (brainstorming session with Suraj Singh)
> **Date:** 2026-06-19
> **Source:** Climbing Stairs review case — user implemented memoized recursion (O(n) space), graded PARTIAL because canonical stored only the iterative two-variable approach (O(1) space). Symptom of a deeper architectural assumption that interview problems have a single optimal answer.
> **Feature flag:** `FEATURE_CANONICAL_ALTERNATIVES` (server) + `VITE_FEATURE_CANONICAL_ALTERNATIVES` (client + Dockerfile ARG)
> **Layers on top of:** `FEATURE_CANONICAL_ANSWERS` (must be on; v1 of canonicals shipped 2026-06-18)

## Goals

Address the grader-fairness gap surfaced by the Climbing Stairs case as one coordinated change to the canonical-answer model:

1. Many interview problems have 2–3 valid optimal solutions with materially different time/space trade-offs (Climbing Stairs, Best Time to Buy and Sell Stock, Coin Change, House Robber, Two Sum O(n²) brute vs O(n) hashmap, etc.). The current single-canonical model assumes one right answer and grades users unfairly when they implement a different valid approach.
2. The grader receives the user's stored notes but underuses them. When `user.notes` match `user.recall` and both differ from `canonical`, the user has implemented a valid alternative — the grader should recognize this rather than mark them PARTIAL.
3. Surfacing alternatives during Reveal teaches the trade-off thinking that real interviewers test ("what's the trade-off between this approach and the iterative version?"). The current Reveal panel only shows one approach, training users toward memorization rather than calibrated comparison.

## Non-goals

- Grading the user's recall against ALL approaches and showing per-approach verdicts (over-engineered; one match per field is the cognitive task).
- Catalog-wide backfill script for existing canonicals (strictly lazy on next access).
- Admin UI for editing alternatives in v1 (admins use Prisma Studio; UI is a tracked follow-up).
- Allowing more than 3 alternatives per problem (cognitive-load cap; ≥4 starts dominating the Reveal panel).
- A user-facing "I implemented approach X" picker before grading (the grader infers; that's the whole point).
- Streaming verdict updates as the grader runs.
- A/B testing harness for grader prompt variants.

## Architecture overview

The change ships in three coordinated layers behind one feature flag:

- **Layer 1 — Data:** New `canonicalAlternatives Json?` column on `Problem` storing 0–3 alternative-approach objects. Plus `canonicalAltGeneratedAt DateTime?` for auditing the augmentation timestamp separately from primary generation.
- **Layer 2 — AI generation, two prompts:**
  - **New-canonical generator** (Prompt A) — extends today's prompt to ask for primary + 0–3 valid alternatives in one call. Used when `canonicalGeneratedAt IS NULL`.
  - **Legacy augmenter** (Prompt B) — takes the existing primary as input, asks AI to identify alternatives that meaningfully differ. Used when `canonicalGeneratedAt` is set but `canonicalAltGeneratedAt IS NULL`. Never modifies the primary → zero drift risk on existing canonicals.
- **Layer 3 — Consumers:**
  - **Grader rewrite** (Prompt C) — sees `<canonical_primary>` + `<canonical_alternatives>` in the prompt. New deterministic IDENTIFY → GRADE procedure: identify which approach the user implemented (using user_notes as the primary signal, falling back to primary), then grade the recall against THAT approach. Returns new `matchedApproach` field.
  - **GET /problems/:id/canonical** lazy-augment path — when row has `canonicalGeneratedAt` set but `canonicalAltGeneratedAt IS NULL`, fire the augmenter call inside a row-level lock, persist alternatives + timestamp, return.
  - **`CanonicalAnswerPanel.jsx`** — primary card (unchanged style) + collapsible "Other valid approaches (N)" expander showing one card per alternative, expanded by default.
  - **`ReviewQueuePage.jsx::AiGradeView`** — informational badge "Matched approach: <name>" above the per-field cards when grader returns a `matchedApproach`. Hidden when match is `primary` (less noise; only surfaced when the user implemented an alternative).

**Why this shape:**
- Reflects reality. Climbing Stairs / Best Time to Buy-Sell / Coin Change all have legitimately distinct optimal solutions; pretending otherwise undermines the cognitive task.
- Aligns with the **D10 Verification & Meta-cognition** dimension: calibrated grading IS the meta-skill being measured. Telling users their correct work is "PARTIAL" miscalibrates them.
- Aligns with industry interviewing — interviewers explicitly test trade-off awareness ("what's the difference between memoization and the iterative version?"). Surfacing alternatives during Reveal makes users practice that exact cognitive task.
- Research base: worked-examples effect (Sweller 1988), transfer-appropriate processing (Morris, Bransford & Franks 1977), elaborative encoding (Craik & Lockhart 1972). Comparing approaches deepens encoding more than memorizing one.
- Layered design preserves backward compat: flag-OFF restores exact pre-feature behavior; flag-ON adds capability without breaking the single-canonical schema.

## Data model

### Schema additions on `Problem`

```prisma
model Problem {
  // ...existing canonical fields unchanged from v1...
  canonicalPattern         String?
  canonicalKeyInsight      String?
  canonicalTimeComplexity  String?
  canonicalSpaceComplexity String?
  canonicalGeneratedAt     DateTime?
  canonicalEditedByUserId  String?
  canonicalEditedAt        DateTime?

  // NEW
  canonicalAlternatives    Json?      // null = not yet generated; [] = none exist; [{...}] = list of 0-3
  canonicalAltGeneratedAt  DateTime?  // separate timestamp from primary; supports legacy backfill auditing
}
```

`canonicalAltGeneratedAt` is intentionally separate from `canonicalGeneratedAt`. The primary's timestamp records when the primary was generated; the alternatives' timestamp records when alternatives were added (which can be much later for legacy rows). Lets ops + admin tooling distinguish "this canonical was generated whole on date X" from "this canonical was augmented later on date Y."

### `canonicalAlternatives` JSON shape

Each item:

```ts
{
  name: string,              // short label, ≤ 60 chars (UI chip title)
  pattern: string,           // must be in CANONICAL_PATTERN_LABELS OR equal to primary.pattern
  keyInsight: string,        // 1-3 sentences, plain text, trim-non-empty, ≤ 600 chars
  timeComplexity: string,    // "O(?)" form
  spaceComplexity: string,   // "O(?)" form
}
```

### Validation rules (Zod-enforced)

- `name`: trim-non-empty, max 60 chars.
- `pattern`: must satisfy `CANONICAL_PATTERN_LABELS.includes(p) || p === primary.pattern`. Alternatives can share a pattern with primary or use a different canonical pattern, but never a non-taxonomy free-form value.
- `keyInsight`: trim-non-empty, max 600 chars.
- `timeComplexity` / `spaceComplexity`: match `/^O\(.+\)$/`.
- Array length: 0–3 (cap enforced post-parse; LLM may want to over-generate).
- **Differ-from-primary invariant:** every alternative MUST differ from the primary in at least one of `pattern`, `timeComplexity`, `spaceComplexity`. Otherwise it's not actually alternative.
- **Inter-alternative invariant:** two alternatives must differ in at least one of those same three fields. Server dedupes by `name` first, then by (pattern, timeComplexity, spaceComplexity) tuple.
- **Lenient validation:** if an alternative violates any rule above, drop it and keep the rest of the response. Don't reject the whole response. Errs on "ship something" over "perfect or nothing."

### Migration SQL (pre-created by hand per CLAUDE.md workflow)

```sql
ALTER TABLE "problems"
  ADD COLUMN "canonicalAlternatives"    JSONB,
  ADD COLUMN "canonicalAltGeneratedAt"  TIMESTAMP(3);
```

`JSONB` (not `JSON`) — matches `categoryData JSONB` and other JSON columns elsewhere in the schema.

Apply via `npx prisma migrate deploy` (avoids the pgvector drift prompt; same workflow used in v1 of canonicals).

### Five-touchpoint compliance

| Field | Migration | schema.prisma | Zod | Controller allow-list | Client payload |
|---|---|---|---|---|---|
| `canonicalAlternatives` | ✅ | ✅ Problem model | ✅ extend `canonicalAnswerSchema` + `canonicalPatchSchema` | ✅ `patchCanonical` accepts (admin-only edit, deferred UI) | n/a in v1 (Prisma Studio for admin override) |
| `canonicalAltGeneratedAt` | ✅ | ✅ Problem model | n/a (server-internal) | written by canonical GET / augmenter | n/a |

## API surface

### `GET /api/v1/problems/:id/canonical` (existing endpoint, lazy-augment branch added)

Existing behavior preserved. New branch added between cache-hit and full-generate:

```
1. Load Problem.
2. If canonicalGeneratedAt IS NULL → run Prompt A (new-canonical generator). Persist primary + alternatives in one transaction. Return.
3. Else if FEATURE_CANONICAL_ALTERNATIVES is ON AND canonicalAltGeneratedAt IS NULL → open transaction with SELECT ... FOR UPDATE on Problem. Re-check; if still null, run Prompt B (augmenter). Persist canonicalAlternatives + canonicalAltGeneratedAt. If race already filled, read cached. Return primary + alternatives.
4. Else → return cached primary + alternatives (alternatives may be `[]`).
```

The branch is flag-gated server-side. With the flag OFF, step 3 is skipped entirely — existing canonicals stay single-approach until the flag flips ON, which preserves exact pre-feature behavior.

Response shape now includes `alternatives`:

```ts
{
  pattern, keyInsight, timeComplexity, spaceComplexity, generatedAt, editedAt,
  alternatives: Array<{ name, pattern, keyInsight, timeComplexity, spaceComplexity }> | null,
}
```

`alternatives` is `null` when the flag is OFF, when augmentation hasn't run yet on a legacy row, or when augmentation failed. Empty array `[]` is a positive signal "no valid alternatives exist for this problem."

### `PATCH /api/v1/problems/:id/canonical` (existing admin endpoint, schema extended)

Body now also accepts `canonicalAlternatives` as an array conforming to the JSON shape above. Validated by `canonicalPatchSchema`. SUPER_ADMIN-only (existing guard preserved).

In v1, the admin form UI does not expose alternative editing — admins use Prisma Studio or curl. UI is a tracked follow-up. The endpoint accepts the field so curl/Studio overrides flow through the standard validate path.

### `POST /api/v1/ai/review-grade/:solutionId` (existing endpoint, prompt rewritten)

Same request shape (no client changes). Response gains a new `matchedApproach: string | null` field — `"primary"`, the matched alternative's `name`, or `null` when grader didn't return one (legacy fallback path). Existing fields preserved.

## AI prompts

### Prompt A — New canonical (primary + alternatives, single call)

Replaces today's `CANONICAL_SYSTEM_PROMPT`. System:

```
You produce the canonical interview answer for a coding problem. Your output
is the ground truth that future spaced-repetition reviews will be graded
against.

Output a PRIMARY answer plus 0-3 ALTERNATIVES.

Primary rules:
- pattern: pick ONE label from the canonical taxonomy when possible.
- keyInsight: 2-3 sentences. State the core idea, not the implementation.
- timeComplexity / spaceComplexity: optimal complexity for the most teachable
  approach. Use "O(?)" form.

When to include alternatives:
Many interview problems have 2-3 valid approaches with materially different
trade-offs (e.g. iterative O(1) space vs memoized O(n) space). Include an
alternative ONLY when it differs from PRIMARY in at least one of:
  - pattern
  - timeComplexity
  - spaceComplexity
And ONLY when it's a textbook approach a strong candidate would mention. Do
NOT pad with degenerate variants (e.g. "brute force O(n³)" when the problem
has obvious better solutions). Cap at 3.

Alternative rules:
- name: short label (≤ 60 chars), e.g. "Memoized recursion", "Iterative two-
  variable", "Heap-based selection".
- pattern: from canonical taxonomy OR same as primary.
- keyInsight: 1-2 sentences specific to this approach (not a copy of primary).
- timeComplexity / spaceComplexity: O(?) form.

Do not include code. Do not hedge. Be terse and precise.

Canonical taxonomy: <CANONICAL_TAXONOMY_LIST>

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
}
```

User prompt unchanged from v1: title + description + difficulty + category, XML-tagged.

Settings: `AI_MODEL_FAST`, temp 0.1, jsonMode, surface `canonical-generate`. Bump `maxTokens` from 400 → 700 to accommodate alternatives.

When `FEATURE_CANONICAL_ALTERNATIVES=false`, the controller falls back to the v1 prompt (no alternatives clause). Single source of truth: a flag check inside `generateCanonicalAnswer()`.

### Prompt B — Legacy augmenter (alternatives only, given existing primary)

New helper `augmentCanonicalAlternatives(problem, primary, { userId, teamId })` in `ai.controller.js`. System:

```
You augment an existing canonical answer for a coding problem with valid
alternative approaches. The PRIMARY answer is already established and will
NOT be modified. Your job: identify 0-3 textbook alternatives.

When to include alternatives:
[same rules as Prompt A's alternative section, copied verbatim]

Alternative rules:
[same as Prompt A]

Do NOT propose changes to the primary. Do NOT include the primary in your
output array.

Output STRICT JSON:
{
  "alternatives": [
    { "name": "...", "pattern": "...", "keyInsight": "...",
      "timeComplexity": "O(?)", "spaceComplexity": "O(?)" }
  ]
}
```

User prompt:

```
<problem_title>{title}</problem_title>
<problem_description>{description}</problem_description>
Difficulty: {difficulty}
Category: {category}

PRIMARY (already established, do not modify):
<primary_pattern>{canonicalPattern}</primary_pattern>
<primary_key_insight>{canonicalKeyInsight}</primary_key_insight>
<primary_complexity>{canonicalTimeComplexity} / {canonicalSpaceComplexity}</primary_complexity>

Identify 0-3 valid alternatives. Return JSON only.
```

Settings: `AI_MODEL_FAST`, temp 0.1, jsonMode, maxTokens 400, surface `canonical-augment`.

### Prompt C — Grader rewrite (multi-approach matching)

Replaces today's grader system prompt when the canonical has alternatives loaded. System:

```
You are a strict but fair spaced-repetition grader. The user is recalling a
coding problem they previously solved. Many problems have multiple valid
approaches; your job is to identify which approach the user implemented and
grade their recall against THAT approach — not against a single "right answer".

You receive:
  - <canonical_primary>: the main canonical approach (pattern, keyInsight,
    complexity).
  - <canonical_alternatives>: 0-N additional valid approaches, each with a
    name + pattern + keyInsight + complexity.
  - <user_notes>: what the user wrote when they originally solved the problem
    (their actual implementation).
  - <user_recall>: what they typed just now (their memory check).

PROCEDURE — follow exactly:

Step 1 — IDENTIFY which approach the user implemented.
  Compare <user_notes_complexity> and <user_notes_pattern> against PRIMARY
  and each ALTERNATIVE. The MATCHED APPROACH is whichever scores closest on
  pattern + complexity. If user_notes are sparse or ambiguous, fall back to
  PRIMARY.

Step 2 — GRADE user_recall against the MATCHED APPROACH (not primary).
  - Match SEMANTICALLY ("HashMap" matches "Hashing"; "linear time" matches
    "O(n)"; "two-pointer" matches "Two Pointers").
  - YES: recall captures the same concept as the matched approach.
  - PARTIAL: right idea, missed important detail.
  - NO: empty, wrong, or unrelated to the matched approach AND to all other
    approaches.
  - For complexity: O(n) ≠ O(n log n). If user gives one but matched approach
    has both time + space, PARTIAL on the missing one.

Step 3 — In feedback, name the approach the user used and reference the
others where helpful. e.g. "You used the memoized recursion variant (O(n)
space) — correct. The iterative two-variable approach achieves O(1) space."
This trade-off awareness is the cognitive task interviewers test; surface it.

Step 4 — suggestedConfidence (1-5) follows the matched approach's grade:
  5 = all YES, 4 = one PARTIAL, 3 = one NO or two PARTIAL, 2 = multiple gaps,
  1 = mostly wrong/empty.
  If `peeked: true`, suggestedConfidence MUST be ≤ 3.

Output STRICT JSON, no prose:
{
  "matchedApproach":    "primary" | "<alternative.name>",
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}
```

User prompt:

```
Problem: <problem_title>{title}</problem_title> ({difficulty} {category})

<canonical_primary>
  pattern: {canonicalPattern}
  keyInsight: {canonicalKeyInsight}
  time: {canonicalTimeComplexity}  space: {canonicalSpaceComplexity}
</canonical_primary>

<canonical_alternatives>
  [for each alt:]
  {alt.name}:
    pattern: {alt.pattern}
    keyInsight: {alt.keyInsight}
    time: {alt.timeComplexity}  space: {alt.spaceComplexity}
</canonical_alternatives>

<user_notes_pattern>{joinedUserPatterns}</user_notes_pattern>
<user_notes_key_insight>{stripHtml(solution.keyInsight)}</user_notes_key_insight>
<user_notes_complexity>{userTime} / {userSpace}</user_notes_complexity>

<user_recall_pattern>{recall.pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>{recall.keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>{recall.complexity || "(empty)"}</user_recall_complexity>

peeked: {true|false}

Identify the matched approach, then grade. Return JSON only.
```

Settings: same as today (`AI_MODEL_FAST`, temp 0.2, jsonMode, surface `review-grade`). Bump `maxTokens` from 600 → 800 to accommodate the alternatives block + matched-approach output.

When `FEATURE_CANONICAL_ALTERNATIVES=false` OR canonical has no alternatives, the controller routes to the v1 grader prompt (no `<canonical_alternatives>` block, no `matchedApproach` output).

### Validators (`ai.validators.js`)

Three updates:

- `validateCanonicalAlternative(parsed)` — Zod schema for one alternative item per the constraints in "Validation rules" above.
- `validateCanonicalAnswer(parsed)` — extend the existing schema to accept an optional `alternatives` array (length 0–3). Post-parse: drop alternatives violating the differ-from-primary invariant. Drop alternatives that duplicate another alternative's `name` or (pattern, time, space) tuple.
- `validateRecallGrade(parsed, { peeked })` — extend to accept the new `matchedApproach` field (string, optional). When AI returns a `matchedApproach` value that's neither `"primary"` nor a known alternative `name`, coerce to `"primary"` and log `[recall-grade:invalid-match]`. Existing peeked clamp preserved.

## UI components

### `CanonicalAnswerPanel.jsx`

Today: shows `{ pattern, keyInsight, timeComplexity, spaceComplexity, editedAt }`.

Extends to accept optional `alternatives: Array<{ name, pattern, keyInsight, timeComplexity, spaceComplexity }>`. When non-empty:

```
┌─ Canonical Answer ─────────────────────┐
│ Pattern:  Dynamic Programming           │
│ Key Insight:  ways(n) = ways(n-1) +     │
│   ways(n-2). Optimal iterative two-     │
│   variable approach.                    │
│ Complexity:  T: O(n) · S: O(1)          │
└─────────────────────────────────────────┘

▼ Other valid approaches (1)               ← <details>, expanded by default

  ┌─ Memoized recursion ──────────────────┐
  │ Pattern:  Dynamic Programming          │
  │ Key Insight:  Same recurrence; cache   │
  │   subproblem results to avoid re-      │
  │   computation.                         │
  │ Complexity:  T: O(n) · S: O(n)         │
  └─────────────────────────────────────────┘
```

- Primary card unchanged from v1 (`border-brand-line bg-brand-soft text-brand-fg-soft`).
- Alternative cards use muted styling (`border-border-default bg-surface-2 text-text-secondary`) to signal "alternative, not primary."
- Each alternative card includes its `name` as the card title in place of the primary's "Canonical Answer" header.
- Expander uses native `<details>` with `open` attribute by default. Same convention as the existing "Your original notes" expander elsewhere in the modal.
- When `alternatives` is absent, null, or empty, the expander section doesn't render. Primary card stands alone (matches v1 behavior).
- The `compact` prop reduces padding consistently across primary and alternative cards.

Stays under ~120 LOC. No new dependencies.

### `ReviewQueuePage.jsx :: AiGradeView`

Today: three field cards (Pattern / Key Insight / Complexity) with YES/PARTIAL/NO chips.

Extension: when `aiGrade.matchedApproach` is non-null **and not equal to `"primary"`**, render a small badge above the cards: `Matched approach: Memoized recursion`. Hidden when match is `primary` (less noise; only surfaced when it adds information — i.e., when the user implemented an alternative).

Styling: `text-[11px] text-text-tertiary` with a `· ` separator. Informational, not a verdict.

If `matchedApproach` is absent (legacy grader response, fallback path), no badge renders. Backward-safe.

### `ProblemForm.jsx` (admin)

Per the "non-goals" — no UI changes in v1. Admins edit `canonicalAlternatives` via Prisma Studio or curl against the PATCH endpoint.

## Error handling

| Scenario | Behavior | User experience |
|---|---|---|
| New canonical: AI timeout / 5xx | Don't persist `canonicalGeneratedAt`. Return 503. | Toast: "Couldn't prepare review yet — try again." (Preserved.) |
| New canonical: validator rejects primary | Don't persist anything. Return 502. | `[canonical:invalid]` log; next request retries. |
| New canonical: validator rejects an alternative | Drop the bad alternative; persist primary + remaining valid alternatives. Log `[canonical:alt-dropped]` with the rejection reason. | User sees fewer alternatives than the AI suggested. No visible failure. |
| New canonical: AI returns 0 alternatives | Persist `canonicalAlternatives = []`. UI doesn't render the expander. | Indistinguishable from "no valid alternatives exist." Correct outcome. |
| Legacy augmenter: AI timeout / 5xx | Don't persist anything. Return primary-only as today. | Primary visible; alternatives expander hidden. Next call retries augmentation. |
| Legacy augmenter: validator rejects entire response | Don't persist. Same retry semantics. | Primary visible. Logged. |
| Legacy augmenter: race (two users hit GET, both see `canonicalAltGeneratedAt IS NULL`) | `SELECT ... FOR UPDATE` on Problem inside the transaction. Second caller reads cached value. | One AI call total. |
| Admin clears `canonicalAlternatives` in Prisma Studio | `canonicalAltGeneratedAt = NULL` re-triggers augmentation on next review. | Small first-call latency. |
| Grader AI timeout / 5xx | Existing fallback path. Conservative all-PARTIAL with `fallback: true`. No `matchedApproach`. | Banner: "AI grader offline." (Preserved.) |
| Grader returns invalid `matchedApproach` value | Coerce to `"primary"`. Log `[recall-grade:invalid-match]`. | Badge labeled "Primary" instead of bogus name. Recall still graded. |
| Grader violates `peeked → confidence ≤ 3` | Server-side clamp (existing). Log `[recall-grade:peek-clamp]`. | Clamped value. |
| Canonical missing entirely (legacy fallback) | Today's notes-anchor grader path (preserved). No alternatives, no `matchedApproach`. | Indistinguishable from pre-feature behavior. |
| User implemented a third approach AI didn't list (e.g. matrix exponentiation O(log n) for Climbing Stairs) | Step 1 picks the closest of the listed approaches; Step 2 grades against THAT, which marks the third approach's complexity as wrong. | Edge case; feedback prose says "your O(log n) doesn't match either listed approach — please verify." |
| Two alternatives with same `name` | Server dedupes by `name` before persist. Keep first. | Logged. |
| Alternative with pattern outside taxonomy and not matching primary | Validator drops this alternative. | Logged. |
| `canonicalAlternatives` parses to non-array (DB tampering) | Treat as `null` on read; force regeneration. | Logged. |

## Testing

### Server tests (vitest, ~5 new files)

| File | Targets |
|---|---|
| `test/ai/canonicalAlternativesSchema.test.js` | Zod schema accepts well-formed alternatives; rejects: empty name, name > 60 chars, pattern outside taxonomy, non-O() complexity, alternative identical to primary, > 3 array length, whitespace-only keyInsight. |
| `test/controllers/canonical.alternatives.test.js` | New canonical generates primary + alternatives in one call (mock returns 2 alts → both persisted); validator-rejected alternative dropped silently; AI returns 0 alts → array `[]` persisted; race lock prevents double generation; flag-OFF path uses v1 prompt without alternatives. |
| `test/controllers/canonical.augment.test.js` | Legacy row (canonicalGeneratedAt set, canonicalAltGeneratedAt null) triggers augmenter call; primary fields untouched after augmentation; canonicalAltGeneratedAt set; second call reads cache; augmenter validator rejection doesn't persist `canonicalAltGeneratedAt`; flag-OFF skips augmentation. |
| `test/controllers/ai.reviewGrade.matchedApproach.test.js` | Grader prompt includes `<canonical_alternatives>` block when present; `matchedApproach` field returned in response; `matchedApproach` coerced to "primary" when AI returns garbage; missing canonical falls back to legacy notes-anchor (existing test still green); flag-OFF skips multi-approach prompt entirely. |
| `test/utils/canonicalAltDedup.test.js` | Duplicate `name` items deduped; alternative identical to primary in (pattern, time, space) tuple dropped; non-array input treated as null; cap-at-3 enforced when AI over-generates. |

Existing tests stay green:
- `test/ai/canonicalAnswerSchema.test.js` (v1 Task 2) — extend to cover the new optional `alternatives` field; existing 8 cases preserved.
- `test/controllers/canonical.controller.test.js` (v1 Task 4) — extend mock payloads to include `alternatives: []`; existing 5 cases preserved.
- `test/controllers/ai.reviewGrade.hybrid.test.js` (v1 Task 7) — existing 3 cases preserved.

### Client smoke checklist

- [ ] `CanonicalAnswerPanel` with `alternatives: []` renders only primary card (matches v1 behavior).
- [ ] `CanonicalAnswerPanel` with 2 alternatives shows expander labeled "Other valid approaches (2)", expanded by default, with two muted-style cards.
- [ ] Each alternative card shows its `name` as the card header.
- [ ] Reveal-phase `AiGradeView` shows "Matched approach: Memoized recursion" badge when grader returns that name.
- [ ] Badge is hidden when `matchedApproach === "primary"`.
- [ ] Badge is hidden when grader didn't return `matchedApproach` (legacy path, fallback).
- [ ] Climbing Stairs review (the original failing case) — user with O(n) memoization solution + O(n) recall now grades complexity=YES (not PARTIAL).
- [ ] Flag-OFF regression: setting `VITE_FEATURE_CANONICAL_ALTERNATIVES=false` and rebuilding restores the exact v1 single-canonical UI.

## Rollout sequence

1. **Migration + schema + flag scaffolding** (server-only, flag OFF). Validates the migration applies cleanly to the Railway dev DB.
2. **Validators + Zod extensions + dedup utility + tests** (flag still OFF; surface dormant). Includes `validateCanonicalAlternative` + extension to `validateCanonicalAnswer` + `canonicalAltDedup` helper.
3. **Generator A (new canonical with alternatives)** (flag-gated; v1 prompt used when flag OFF). Generator function rewritten to branch on the flag.
4. **Generator B (legacy augmenter) + GET endpoint lazy-augment path + tests** (flag-gated). New `augmentCanonicalAlternatives` helper + the `canonicalAltGeneratedAt IS NULL` branch in the GET handler.
5. **Grader rewrite + tests** (flag-gated). Branches between v1 hybrid prompt and Prompt C based on flag + alternatives presence.
6. **Client: `CanonicalAnswerPanel` extension + `AiGradeView` badge + flag wiring** (flag-gated). Single commit covers both UI surfaces.
7. **Flip flag in dev → smoke checklist → flip in prod.**

Estimated commit count: ~7–8 (one per layer + a final smoke commit).

## Cost / latency envelope

- **One-time augmentation** of all existing canonicals (driven by user activity, not batch): ~$0.0001 per problem in AI tokens. Catalog has ~500 problems → ~$0.05 lifetime cost across the whole catalog. Negligible.
- **Per-grade overhead:** ~30% more input tokens for the alternatives block (~750 in / 250 out vs current ~600 in / 250 out). Per-call cost still under $0.001. Negligible.
- **First-fetch latency on a legacy problem:** +1–1.5s on the call that triggers augmentation (one-time per problem). Subsequent fetches read cache.

## Research grounding

- **Worked-examples effect (Sweller 1988):** showing examples of multiple valid solutions improves transfer more than studying one. Surfacing alternatives during Reveal puts this into practice.
- **Transfer-appropriate processing (Morris, Bransford & Franks 1977):** practice the way you'll be tested. Real interviewers ask trade-off questions; the grader and Reveal panel should make users practice trade-off thinking.
- **Elaborative encoding (Craik & Lockhart 1972):** comparing approaches deepens encoding more than memorizing one.
- **Calibrated feedback (Kruger & Dunning 1999, cited in D10):** correct grading is the meta-signal that builds calibrated confidence. Marking a correct alternative as PARTIAL miscalibrates the user.
- **Anki / SM-2 convention (Wozniak 1990):** peek → quality cap at 3. Preserved unchanged.

## Open questions / future work

- **Admin alternatives editing UI** — deferred to a follow-up. Probably a small additive change inside the existing canonical admin section in `ProblemForm.jsx`.
- **A/B harness for grader prompt variants** — defer until we have enough usage data to detect prompt-quality drift.
- **`matchedApproach` analytics** — once we have enough user data, look at the distribution of which approaches users actually implement. May surface cases where the AI's "primary" choice doesn't match what most users do; could inform future generator prompt tuning.
- **Streaming verdicts** — was on the v1 roadmap; deferred again. Latency is acceptable.
- **Per-alternative grading visualization** — e.g. show "Pattern: YES against memoized; PARTIAL against iterative" in the AiGradeView. Over-engineered for v1; revisit if users ask.
- **Catalog backfill script** — strictly lazy in v1. If user data shows the lazy fill creates noticeable cold-start latency, a one-shot script across high-traffic problems is a small follow-up.

# Review Page Fixes — Design Spec

> **Status:** Draft for review
> **Author:** Claude (brainstorming session with Suraj Singh)
> **Date:** 2026-06-18
> **Source:** Feedback bug `cmqiuoqk900rld8zxm72sssli` (CRITICAL · ACKNOWLEDGED)
> **Feature flag:** `FEATURE_CANONICAL_ANSWERS` (server) + `VITE_FEATURE_CANONICAL_ANSWERS` (client + Dockerfile ARG)

## Goals

Address six user-reported issues with the Review Queue flow as one coordinated change:

1. User cannot recall a problem from the title alone — needs problem context before recalling.
2. Pattern recall input is single-text-field; user wants the multi-select picker that already exists elsewhere in the app.
3. Time/Space complexity input is free-text; user wants templated `O()` form so the cursor lands inside the parens.
4. AI grader compares user's recall against their own old notes, not against what's correct for the problem. User can be marked wrong for paraphrasing.
5. AI Recall check should "reveal answers when user wants to see" — currently no way to peek at the canonical answer.
6. Word-level Diff tab is misleading because grading is semantic, not textual.

## Non-goals

- Streaming per-field verdicts as they arrive (latency optimisation deferred).
- "I had it right" dispute/override button (deferred — needs separate calibration model).
- Backfill canonical answers for existing Problems (lazy fill is the design).
- Flashcard review flow changes (out of scope; Solution review only).
- Mobile-specific overhaul beyond stacking vertically.
- Telemetry on `[patterns:custom]` logs to promote new patterns into the taxonomy (separate roadmap entry).

## Architecture overview

The change ships in three coordinated layers behind one feature flag:

- **Layer A — Recall flow (UI):** Recall modal becomes a four-phase state machine: `BRIEF → RECALL → REVEAL → RATE`. Brief is new, no timer. Recall starts the timer only when user clicks Start. Show Answer button in Recall lets user peek (capped SM-2 quality 3). Reveal drops the three-tab toggle and shows AI Grade + canonical answer panel side-by-side with a collapsible "Your original notes" panel. Word-level Diff tab is deleted.
- **Layer B — Canonical answer (data + AI):** New `canonical*` slice on `Problem` (pattern, keyInsight, time/space complexity, generation/edit metadata). Lazy-filled by AI on first review of a problem; cached forever; admin-editable via SUPER_ADMIN-only PATCH endpoint and a UI surface in the existing admin Problem form. Grader is rewired to read canonical as primary truth anchor, with user notes as secondary context (never override canonical).
- **Layer C — Input ergonomics (UI):** Recall input replaces single-text Pattern field with the existing multi-select PatternSelector (extracted to a shared component). Complexity inputs become templated `O(_)` inputs where the cursor lands inside the parens automatically.

## Data model

### `Problem` — new fields

```prisma
model Problem {
  // ...existing fields...

  canonicalPattern         String?
  canonicalKeyInsight      String?
  canonicalTimeComplexity  String?
  canonicalSpaceComplexity String?
  canonicalGeneratedAt     DateTime?
  canonicalEditedByUserId  String?
  canonicalEditedAt        DateTime?
}
```

`canonicalGeneratedAt IS NULL` is the lazy-fill signal. Admin override clears `canonicalGeneratedAt` (or sets it to the edit time and stamps `canonicalEditedAt` + `canonicalEditedByUserId`). All fields nullable; no new index needed (lookup is always by `Problem.id`).

### `Solution` — new field

```prisma
model Solution {
  // ...existing fields...

  lastCanonicalFetchAt DateTime?
}
```

Updated on every `GET /problems/:id/canonical` call. Recorded for future analytics (peek-vs-retention correlation). Not used for server-side peek enforcement in v1 — see "Peeked-flag trust model" below.

### `ReviewAttempt` — new field

```prisma
model ReviewAttempt {
  // ...existing fields...

  peeked Boolean @default(false)
}
```

Set by the client when the user clicked Show Answer during the recall phase. Server trusts the client value (this is a personal-practice tool; anti-gaming is overengineering for v1). `lastCanonicalFetchAt` is recorded for future analytics but does not force `peeked = true`.

### Migration SQL

Per CLAUDE.md migration workflow (pre-create the file by hand to avoid the pgvector drift prompt):

```
prisma/migrations/<YYYYMMDDHHMMSS>_add_canonical_to_problem/migration.sql

ALTER TABLE "Problem"
  ADD COLUMN "canonicalPattern"          TEXT,
  ADD COLUMN "canonicalKeyInsight"       TEXT,
  ADD COLUMN "canonicalTimeComplexity"   TEXT,
  ADD COLUMN "canonicalSpaceComplexity"  TEXT,
  ADD COLUMN "canonicalGeneratedAt"      TIMESTAMP(3),
  ADD COLUMN "canonicalEditedByUserId"   TEXT,
  ADD COLUMN "canonicalEditedAt"         TIMESTAMP(3);

ALTER TABLE "Solution"
  ADD COLUMN "lastCanonicalFetchAt"      TIMESTAMP(3);

ALTER TABLE "ReviewAttempt"
  ADD COLUMN "peeked"                    BOOLEAN NOT NULL DEFAULT false;
```

Apply via `npm run db:migrate`; **Ctrl+C** the drift-fix prompt that follows.

## API surface

### `GET /api/v1/problems/:id/canonical` (new)

- **Auth:** authenticated user (any role); `requireTeamContext`.
- **Behavior:**
  1. Load `Problem` by id.
  2. If `canonicalGeneratedAt` is non-null → return cached fields.
  3. Else: open interactive transaction with `SELECT … FOR UPDATE` on the row; re-check; if still null, call `aiCompleteCanonical(problem)`, validate, persist, return. If race already filled → return cached.
  4. Update `Solution.lastCanonicalFetchAt = now()` for any Solution rows owned by `userId` for this problem (recorded for analytics; not used for peek enforcement in v1).
- **Errors:**
  - 404 if Problem not found / not team-scoped.
  - 503 if `!AI_ENABLED` or generator throws AND row was never generated. Generated-but-stale rows still serve cached values.
  - 502 if validator rejects generator output (`canonicalGeneratedAt` not persisted; subsequent calls retry).
- **Response:** `{ pattern, keyInsight, timeComplexity, spaceComplexity, generatedAt, editedAt }`.

### `PATCH /api/v1/admin/problems/:id/canonical` (new)

- **Auth:** SUPER_ADMIN only.
- **Body (Zod-validated):**
  ```ts
  {
    canonicalPattern?:         string,        // must be in CANONICAL_PATTERN_LABELS
    canonicalKeyInsight?:      string,
    canonicalTimeComplexity?:  string,        // must match O(...) shape
    canonicalSpaceComplexity?: string,
  }
  ```
- **Behavior:** updates whichever fields are present, sets `canonicalEditedByUserId = req.user.id`, `canonicalEditedAt = now()`. Does NOT touch `canonicalGeneratedAt` (so admin edits are durable, not regenerated on next review).
- **Errors:** 403 (non-admin), 400 (Zod), 404 (problem missing).

### `POST /api/v1/ai/review-grade/:solutionId` (existing, rewired)

- New request field: `peeked: boolean` (optional, default false). Server overrides to `true` if `lastCanonicalFetchAt > reviewStartedAt`.
- Reads `Problem.canonical*` first; falls back to `solution.{patterns,keyInsight,...}` only when canonical is missing AND lazy-fill failed.
- Existing 503 / 400 / 404 paths preserved.

### `POST /api/v1/solutions/:id/review` (existing, rewired)

- New request field: `peeked: boolean` (optional, default false). Server trusts client value (see "Peeked-flag trust model").
- If `peeked === true`, SM-2 quality is capped at 3 (Anki-equivalent "lapse"). Implemented as a clamp before `calculateSM2()` is called (keeps `confidenceToQuality()` pure).
- `peeked` flag persisted on the new `ReviewAttempt.peeked` column.

### Peeked-flag trust model

For v1, the server trusts the client-sent `peeked` boolean. Rationale:
- ProbSolver is a personal-practice tool — users gaming their own SM-2 schedule hurts only themselves.
- True server-side enforcement requires distinguishing legitimate Reveal-phase canonical fetches from mid-Recall peeks. The cleanest way (an `intent=peek|reveal` query param) is non-trivial and easy to bypass anyway.
- `lastCanonicalFetchAt` is still recorded so future analytics can correlate peeking with retention outcomes.

If, post-launch, abuse becomes visible in usage data, upgrade to server-side enforcement is a separate, scoped change.

## AI prompts

### Canonical generator (new handler `ai.controller.js::generateCanonicalAnswer`, uses `aiComplete()` from `ai.service.js`)

```
SYSTEM:
You produce the canonical interview answer for a coding problem. Your output
is the ground truth that future spaced-repetition reviews will be graded
against. Be precise, terse, and pick the most teachable approach when several
are valid.

Rules:
- pattern: pick ONE label from the canonical taxonomy when possible. If the
  problem is a clear hybrid, pick the more dominant pattern.
- keyInsight: 2-3 sentences. State the core idea, not the implementation. A
  candidate who reads this should be able to derive the algorithm.
- timeComplexity / spaceComplexity: optimal complexity. Use "O(?)" form.
- Do not include code.
- Do not hedge. This is the canonical answer; admins can override later.

Canonical taxonomy: <CANONICAL_PATTERN_LABELS list, comma-separated>

Output STRICT JSON:
{
  "pattern":         "<single label>",
  "keyInsight":      "<2-3 sentences>",
  "timeComplexity":  "O(?)",
  "spaceComplexity": "O(?)"
}

USER:
<problem_title>{problem.title}</problem_title>
<problem_description>{problem.description}</problem_description>
Difficulty: {difficulty}
Category: {category}
```

Settings: `AI_MODEL_FAST`, temperature 0.1, max tokens 400, `jsonMode: true`, surface `canonical-generate`. User content wrapped in XML tags per CLAUDE.md prompt-injection rule.

### Grader rewrite (modifies `ai.controller.js::gradeReviewRecall`)

```
SYSTEM:
You are a strict but fair spaced-repetition grader. The user is recalling a
coding problem they previously solved. Judge whether their recall is correct
FOR THE PROBLEM, not whether it matches their old notes.

The CANONICAL block is the ground truth. The USER_NOTES block is what the
user wrote when they originally solved it — useful as context (they may have
discovered a different valid angle), but never override CANONICAL with
USER_NOTES if they conflict. If the user's recall matches a valid alternative
not captured in CANONICAL, grade YES and note the alternative in feedback.

Grading rules:
- Match SEMANTICALLY. "HashMap" matches "Hashing"; "two-pointer" matches "Two
  Pointers"; "linear time" matches "O(n)".
- A field is YES if the recall captures the same concept (or a valid
  alternative for the problem).
- A field is PARTIAL if right idea but missed important detail.
- A field is NO if empty, wrong, or unrelated to the problem.
- For complexity: O(n) ≠ O(n log n). If user gives one but reference has both,
  PARTIAL on the missing one.
- suggestedConfidence (1-5): 5 = all YES, 4 = one PARTIAL, 3 = one NO or two
  PARTIAL, 2 = multiple gaps, 1 = mostly wrong/empty. Be honest.
- If `peeked: true` is set, suggestedConfidence MUST be ≤ 3 (the user saw the
  answer; this is a re-learning moment, not a successful recall).

Feedback strings are shown to the user — be specific and constructive.
On PARTIAL/NO, name the gap and the next step ("You said hashmap; the
canonical is two-pointers — they're different time/space tradeoffs").

Output STRICT JSON, no prose:
{
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}

USER:
Problem: {problem.title} ({difficulty} {category})

<canonical_pattern>{canonical.pattern}</canonical_pattern>
<canonical_key_insight>{canonical.keyInsight}</canonical_key_insight>
<canonical_complexity>{canonical.timeComplexity} / {canonical.spaceComplexity}</canonical_complexity>

<user_notes_pattern>{solution.patterns.join(", ") || "(none)"}</user_notes_pattern>
<user_notes_key_insight>{solution.keyInsight || "(none)"}</user_notes_key_insight>
<user_notes_complexity>{solution.timeComplexity} / {solution.spaceComplexity}</user_notes_complexity>

<user_recall_pattern>{recall.pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>{recall.keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>{recall.complexity || "(empty)"}</user_recall_complexity>

peeked: {true|false}

Grade each field. Return JSON only.
```

### Validators (`ai.validators.js`)

- New `validateCanonicalAnswer(parsed)` — Zod schema requires non-empty pattern (in `CANONICAL_PATTERN_LABELS`), non-empty keyInsight, both complexity fields matching `/^O\(.+\)$/`. Validation failure → fallback path skips persistence.
- Update `validateRecallGrade(parsed, { peeked })` — existing shape check + new invariant: if `peeked === true` and `parsed.suggestedConfidence > 3`, clamp to 3 server-side and log `[recall-grade:peek-clamp]`. Don't reject (clamp cheaper than retry).
- Update `buildFallbackRecallGrade({ peeked, ... })` — return `suggestedConfidence: peeked ? 2 : 3`.

## UI components

### `ReviewQueuePage.jsx` — phase state machine

```
phase: 'brief' | 'recall' | 'reveal' | 'rate'

brief
  ├─ no timer
  ├─ shows: title, difficulty/category, full description (truncated 400ch + expander)
  ├─ footer: [View Full Problem ↗] [Start Recall →]
  └─ Start Recall → setPhase('recall'), setRecallStartedAt(Date.now())

recall
  ├─ timer starts on phase entry (90s soft, no auto-submit)
  ├─ inputs: PatternSelector, KeyInsight textarea, OComplexityInput × 2
  ├─ Show Answer button (lazy-loads canonical, sets peeked=true on click)
  ├─ canonical inline panel renders below recall fields when peeked
  └─ footer: [Show Answer 👁] [Reveal My Notes →]

reveal
  ├─ AI Grade view (only — no tabs)
  ├─ Canonical Answer panel (expanded by default)
  ├─ Your Original Notes panel (collapsed by default)
  ├─ peeked badge if peeked === true
  └─ footer: [← Back] [Rate My Memory →]

rate
  ├─ ConfidencePicker (1-5)
  ├─ if peeked, buttons 4 and 5 disabled with tooltip
  ├─ SM-2 next-review preview
  └─ footer: [Submit Rating]
```

### New components

- **`PatternSelector.jsx`** — extracted from `SubmitSolutionPage.jsx:108-200`. No behavior change; just relocated to `client/src/components/features/solutions/PatternSelector.jsx` and imported by both consumers. Compact-mode prop for the modal context (smaller chip grid).
- **`OComplexityInput.jsx`** — new in `client/src/components/features/solutions/OComplexityInput.jsx`. Renders `O(` + inline input + `)`. On focus, places cursor inside the input. Suggestion chips below: `1`, `log n`, `n`, `n log n`, `n²`, `2ⁿ`. Empty input → stored value `""` (not `"O()"`).
- **`CanonicalAnswerPanel.jsx`** — new in `client/src/components/features/review/CanonicalAnswerPanel.jsx`. Receives canonical fields; renders pattern + keyInsight + complexity in a card. Loading state while `useCanonicalAnswer(problemId)` resolves. Used in both Recall (Show Answer expansion) and Reveal phase.

### Removed components / code paths

- `RecallDiff.jsx` — deleted. Diff library import (`diff` package) removed from this file. `package.json` left alone unless audit shows the package is unused elsewhere (separate cleanup commit if so).
- Three-tab toggle in Reveal phase (lines ~459-522 of current `ReviewQueuePage.jsx`) — deleted. AI Grade is the only Reveal view.

### Hooks

- **`useCanonicalAnswer(problemId)`** — TanStack Query wrapper around `GET /problems/:id/canonical`. `staleTime: Infinity` (canonical doesn't change unless admin edits; cache buster is the new `editedAt` field). Invalidate on admin patch from same browser.
- **`useUpdateCanonicalAnswer(problemId)`** — admin-only mutation calling the PATCH endpoint. Invalidates the get key on success.
- **`useSubmitReview`** (existing) — payload extended with `peeked: boolean` from local recall-modal state.

### Admin Problem form

`ProblemForm.jsx` gains a collapsed "Canonical Answer (admin)" section with the four fields, validation matching the Zod schema, and a "Regenerate from AI" button that calls the GET endpoint with a `?force=true` query param (server clears `canonicalGeneratedAt` then re-runs). Only visible to SUPER_ADMIN.

## Five-touchpoint compliance (per CLAUDE.md)

For each new mutation field, all five layers must update together:

| Field | Migration | schema.prisma | Zod schema | Controller allow-list | Client payload |
|---|---|---|---|---|---|
| `Problem.canonical*` (7 fields) | `add_canonical_to_problem` | `Problem` model | `canonicalAnswerPatchSchema` (admin PATCH) | admin canonical PATCH controller | `useUpdateCanonicalAnswer` |
| `Solution.lastCanonicalFetchAt` | same | `Solution` model | n/a (server-internal) | written by canonical GET controller | n/a |
| `ReviewAttempt.peeked` | same | `ReviewAttempt` model | `submitReviewSchema` adds `peeked` | `submitReview` controller `contentFields` | `useSubmitReview` payload |

A wire-level integration test per the CLAUDE.md mutation-field rule guards each field.

## Error handling

| Failure | Behavior | User experience |
|---|---|---|
| Canonical AI generation timeout / 5xx | Don't persist `canonicalGeneratedAt`; return 503 with retry-able envelope. | Toast: "Couldn't prepare review yet — try again in a moment." Retry on next click. |
| Canonical validator rejects | Don't persist; log `[canonical:invalid]`; return one-shot ungrounded values for this request only. | User sees values; next opener regenerates. SuperAdmin diagnostics surfaces these counts. |
| Canonical race (two users, same problem) | `SELECT … FOR UPDATE` inside `prisma.$transaction` — second call reads cached. | Both succeed; one AI call total. |
| Admin clears canonical | `canonicalGeneratedAt = NULL` re-triggers lazy fill on next review. | Small first-call latency. |
| Grader AI offline | Existing `buildFallbackRecallGrade` extended with `peeked` — returns conservative grade with `fallback: true`. | Banner: "AI grader offline — using conservative defaults." |
| Grader returns canonical-missing canonical (legacy fallback path) | Falls back to old notes-anchor grader; logged. | Indistinguishable to user; logged for ops. |
| Model violates `peeked ≤ 3` | Validator clamps server-side; logs warning. | User sees clamped value. |
| Show Answer click before canonical generated | Frontend awaits the GET promise inside the panel; spinner. | "Generating canonical answer…" for 1-2s, then content. |
| Client tampers `peeked: false` | Server trusts client value in v1 (see Peeked-flag trust model). `lastCanonicalFetchAt` recorded for future analytics. | User can technically game SM-2 — accepted risk for a personal-practice tool. |

## Testing

### Server (vitest, ~6 new files)

| File | Targets |
|---|---|
| `test/controllers/canonical.controller.test.js` | First-fetch generates + caches; second-fetch reads cache (0 AI calls); concurrent first-fetch → 1 AI call (race lock); validator rejection doesn't persist `canonicalGeneratedAt`; admin override resets `canonicalEditedAt`. |
| `test/controllers/canonical.adminPatch.test.js` | SUPER_ADMIN can PATCH; regular user → 403; pattern outside taxonomy → 400; missing problem → 404. |
| `test/ai/canonicalAnswerSchema.test.js` | Zod schema accepts well-formed; rejects empty fields, non-taxonomy pattern, missing `O()` form. |
| `test/controllers/ai.reviewGrade.hybrid.test.js` | Grader prompt includes `<canonical_*>` tags when canonical present; falls back to legacy notes-anchor when canonical missing; `peeked: true` clamps `suggestedConfidence` to ≤ 3 when model returns 5. |
| `test/controllers/solutions.submitReview.peeked.test.js` | `peeked = true` clamps SM-2 quality at 3 (input quality 5 → stored quality 3); `peeked = false` leaves quality unchanged; `peeked` value persisted on `ReviewAttempt`. |
| `test/utils/oComplexityNormalizer.test.js` | Helper that strips `O(` and `)` from stored values, rejects non-O complexity strings. |

### Client

No test runner yet (per CLAUDE.md `client-test-foundation` LATER). Manual smoke checklist included in this spec:

- [ ] Brief phase renders problem description; Start Recall transitions to Recall with timer running.
- [ ] Multi-select pattern picker accepts canonical labels and custom-via-Enter.
- [ ] O() input cursor lands inside parens on focus; suggestion chips fill the input.
- [ ] Show Answer in Recall phase loads canonical inline, sets peeked badge.
- [ ] Reveal phase renders AI Grade + canonical panel; original notes collapsed.
- [ ] Peeked badge persists through Rate phase; quality 4 and 5 disabled with tooltip.
- [ ] Diff tab no longer present anywhere.
- [ ] Admin Problem form shows canonical fields; "Regenerate from AI" works.

## Rollout sequence

1. **Migration + schema + flag wiring** (server-only, flag OFF). Push, verify migration in dev.
2. **Canonical generator + GET endpoint + admin PATCH + tests** (flag still OFF; feature dormant).
3. **Grader rewrite + validator updates + tests** (still OFF). Backend feature-complete behind flag.
4. **Client UI: Brief phase, multi-select picker, O() input, Show Answer, canonical reveal panel, Diff removal, admin form fields** (flag-gated; visible only when both `FEATURE_CANONICAL_ANSWERS` is true server-side AND `VITE_FEATURE_CANONICAL_ANSWERS` is true at build time).
5. **Flip flag ON in dev → manual smoke → flip in prod.**

## Cost envelope

- Generator: ~300-500 input tokens + ~150 output tokens, on `AI_MODEL_FAST`. Per-problem cost ≈ $0.0001. With ~500 problems in catalog, lifetime cost upper bound ≈ $0.05.
- Grader: same as today (~600 tokens, gpt-4o-mini, ~1-2s p50). Cost-neutral after generator amortizes (≈ 5 reviews per problem).

## Open questions / future work

- Streaming verdicts for grader response (deferred from issue #5).
- "I had it right" dispute button (deferred from issue #5).
- Backfill canonical for high-traffic problems (one-shot script) if lazy fill creates noticeable cold-start latency in practice.
- Promote frequently-typed `[patterns:custom]` log entries to canonical taxonomy (separate roadmap entry).
- Extend canonical answer to include "common pitfalls" / "test cases to think about" once the basic four-field version proves stable.

## Research grounding

- **Roediger & Butler (2011)** — retrieval practice produces stronger long-term retention than re-reading. Two-stage Brief→Recall preserves this by separating "reading the problem" from "recalling the solution."
- **Anki / SM-2 convention (Wozniak 1990)** — peeked attempts are not successful recalls; SM-2 quality is capped at 3 (the "almost forgot but recovered" tier). Implemented as the `peeked → quality ≤ 3` clamp.
- **Existing prompt research** — canonical taxonomy of 25 patterns with FAANG-core 15 subset (per CLAUDE.md `patternTaxonomy.js`). New canonical-generator prompt restricts pattern output to this taxonomy.

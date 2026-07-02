# Sprint 8b — Fallback Assertion Test Foundation (M33) — Design Spec

**Date:** 2026-07-02
**Sprint:** 8b (second slice of decomposed Sprint 8 per roadmap)
**Audit finding closed:** M33 (final portion — the 9 untested fallbacks). M32 is already CLOSED (see exploration below)
**Branch:** `feat/fallback-assertion-tests`
**Layers on:** main, post Sprint 8a (`b0beb62`)
**Feature flag:** None — pure additive test work
**Review history (spec v2):** Full 4-role panel completed pre-implementation:
- **PO** — APPROVED (no notes): 9-of-9 scope defensible; zero tautologies; escalation criterion complete
- **Security Manager** — APPROVED (no notes): no info-leak surface; escalation criterion unambiguous
- **Lead Engineer** — APPROVED (no notes): style matches existing patterns; auto-discovery confirmed; 18 fallback exports verified
- **Business Analyst** — CHANGES REQUESTED → folded (3 spec bugs corrected in v2):
  - **T228 reframed**: `buildFallbackNoteAutoTag` returns `{tags: [], _fallback: true}` INTENTIONALLY (per Sprint 6c "honest failure" design — empty is the signal, not garbage tags). The fallback deliberately FAILS `validateNoteAutoTag`'s 3-min-tags requirement. This isn't a bug — it's design. T228 reframed to LOCK IN this intentional-failure design: assert `validateNoteAutoTag(fb).valid === false` and `violations.some(v => v.startsWith("tags-count"))` — captures the intent.
  - **T233 field-shape fix**: `buildFallbackNoteFromSolution` returns `{title, tags, whatYouGotRight, weakAreas, mistakes, howToOvercome, topicsExplained, betterApproachNextTime, _fallback}` — NOT `contentMarkdown`. Assertion targets corrected to `title, topicsExplained, tags, _fallback: true`.
  - **T241 field-name fix**: `buildFallbackTeachingTopicCoverage` field is `coverageScore` not `score`. Assertion updated to `fb.coverageScore` in `[35, 74]`.

---

## Problem

Sprint 1 audit, M32 + M33 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:204-205`):

> **M32**: `ai.validators.js` — `validateProblemSelection`, `validateProblemContent`, `validateCoaching`, `validateScenarioGen`, `validateScenarioEval`, `validateQuizQuestions`, `validateNoteSummary`, `validateNoteAutoTag` — All have only happy-path coverage; rejection cases untested
>
> **M33**: `ai.fallbacks.js` — `buildFallbackReview`, `buildFallbackProblemContent`, `buildFallbackCoaching`, scenario/quiz fallbacks — All scaffolded but never asserted in tests

### Zero-trust verification

**M32 (validator rejection coverage)**: verified in `server/test/ai/validators.test.js` (4443 lines). Every named M32 validator has an explicit rejection describe block:

| Validator | Rejection tests present | File location |
| --- | --- | --- |
| `validateProblemSelection` | ✓ | L3186 |
| `validateProblemContent` | ✓ | L3304 |
| `validateCoaching` (validate/guide/teach modes) | ✓ | L3437+ |
| `validateScenarioGen` | ✓ | L3550 |
| `validateScenarioEval` | ✓ | L3613 |
| `validateQuizQuestions` | ✓ | L3725 |
| `validateNoteSummary` | ✓ (6 rejection cases) | L4196 |
| `validateNoteAutoTag` | ✓ (5 rejection cases) | L4249 |
| `validateNoteRelated` | ✓ (5 rejection cases) | L4300 |
| `validateNoteFlashcards` | ✓ (7 rejection cases) | L4386 |

**M32 status: OBSOLETE** — audit claim ("only happy-path coverage") predates subsequent sprints that added rejection tests. Nothing to do.

**M33 (fallback assertion coverage)**: verified via grep — 18 fallback functions exist; only 9 have assertion tests:

| Fallback | Has test? | Sprint 8b action |
| --- | --- | --- |
| buildFallbackVerdict, Review, FinalEval, InterviewDebrief, ProblemSelection, ProblemContent, Coaching, ScenarioGen, ScenarioEval | ✓ (9 tested) | Skip |
| **buildFallbackQuiz** | ✗ (only smoke-type-check at `test/ai/smoke.test.js:55`) | **Add tests** |
| **buildFallbackNoteSummary** | ✗ | **Add tests** |
| **buildFallbackNoteAutoTag** | ✗ | **Add tests** |
| **buildFallbackNoteFlashcards** | ✗ | **Add tests** |
| **buildFallbackNoteRelated** | ✗ | **Add tests** |
| **buildFallbackNoteFromSolution** | ✗ | **Add tests** |
| **buildFallbackTeachingSummary** | ✗ | **Add tests** |
| **buildFallbackTeachingQuiz** | ✗ | **Add tests** |
| **buildFallbackTeachingTopicCoverage** | ✗ | **Add tests** |

**9 fallbacks are genuinely un-asserted.** Same failure class the audit named — fallback silently produces invalid shape → controller crashes or serves garbage.

### Failure model these tests guard

A fallback function's contract: when the AI call fails or its output is rejected by the validator, return a canned "valid shape but degraded content" object so the controller's downstream code keeps working. If the fallback itself returns an invalid shape:
- Downstream validator rejects it → controller re-fires the fallback → infinite loop OR
- Validator accepts it but the shape mismatches persistence expectations → Prisma throws OR
- Client receives malformed JSON → UI crashes

The tests guard against silent shape drift on the fallback path — the "last line of defense" when AI is offline. Sprint 6c already established some of these patterns (e.g., the "no pseudo-tags" regression); Sprint 8b consolidates the pattern across all 9 remaining fallbacks.

---

## Principle

**Pure additive test work.** One new file `server/test/ai/fallbacks.test.js` (~300 lines, 19 tests). No production code changes expected. Same discipline as Sprint 8a: pure functions, no mocks, no async, no `beforeEach`.

Assertion patterns:
- **Passes its own validator** — `expect(validate<Surface>(fb).valid).toBe(true)` for surfaces with a validator
- **Structural shape** — `expect(fb).toHaveProperty(...)`, `expect(fb.foo).toBeInstanceOf(Array)`
- **Fallback marker** — `expect(fb._fallback).toBe(true)` where present
- **Semantic invariants** — regression guards for known bug classes (e.g., empty tags on AutoTag per Sprint 6c honest-failure pattern; anti-all-DEFINITION on Flashcards per validator rule)

---

## Scope

### In scope

**19 tests T224-T242 in one new file** `server/test/ai/fallbacks.test.js`.

| Fallback | Tests | Test IDs | Focus |
| --- | --- | --- | --- |
| `buildFallbackQuiz` | 1 | T224 | Contract: returns `null` (deliberate — no valid deterministic quiz fallback exists) |
| `buildFallbackNoteSummary` | 2 | T225-T226 | Validator pass + `_fallback` marker + honest-failure message |
| `buildFallbackNoteAutoTag` | 2 | T227-T228 | Empty tags array + `_fallback` marker (no-pseudo-tags regression) + validator pass |
| `buildFallbackNoteFlashcards` | 2 | T229-T230 | Validator pass + NOT all-DEFINITION (anti-laziness) |
| `buildFallbackNoteRelated` | 2 | T231-T232 | Empty-input passthrough + populated-input rationale coverage |
| `buildFallbackNoteFromSolution` | 2 | T233-T234 | Note-shape validity + pattern→kebab-tag sanitization |
| `buildFallbackTeachingSummary` | 3 | T235-T237 | Validator pass + heading extraction + empty-input filler |
| `buildFallbackTeachingQuiz` | 2 | T238-T239 | Validator pass + topic interpolation |
| `buildFallbackTeachingTopicCoverage` | 3 | T240-T242 | Validator pass + PARTIAL verdict + score in [35,74] range + token-based coverage scoring |

Total: **19 tests** (T224-T242). Suite: 1451 → **1470**.

### Out of scope (carved)

- **M32 validator rejection cases** — already covered (verified in exploration)
- **buildFallbackVerdict / Review / FinalEval / InterviewDebrief / ProblemSelection / ProblemContent / Coaching / ScenarioGen / ScenarioEval** — already asserted in `validators.test.js`
- **Production code changes** — none. If a fallback surfaces a real bug (validator-failing output), document divergence and escalate — do NOT auto-adapt the test to accept the broken shape.
- **Sprint 8c (M35 concurrency races)** — separate follow-up

---

## Architecture

```
server/test/ai/
└── fallbacks.test.js                       [NEW — 19 tests T224-T242]
```

**Unchanged:**
- `server/src/services/ai.fallbacks.js` (read-only)
- `server/src/services/ai.validators.js` (read-only)
- Existing `server/test/ai/validators.test.js` — no additions there; too crowded already at 4443 lines
- All other production code and tests

**Rationale for new file (not extending validators.test.js):** the existing file is already 4443 lines. Adding 20+ tests + fixtures would push it toward 4700+. A dedicated `fallbacks.test.js` (~300 lines) keeps concerns clean and matches the file-per-surface pattern used elsewhere (`solutions.review.test.js`, `notes.reads.test.js`, etc.).

---

## Test archetypes + full patterns

### Archetype A — Validator-pass

Most fallbacks have a paired `validate<Surface>` function. Testing "fallback passes its own validator" is the load-bearing assertion: if the fallback shape drifts from what the validator expects, this catches it immediately.

```js
describe("buildFallbackNoteSummary", () => {
  it("test 225: passes validateNoteSummary with hasContent: false", () => {
    const fb = buildFallbackNoteSummary();
    const result = validateNoteSummary(fb, { hasContent: false });
    expect(result.valid).toBe(true);
  });
});
```

### Archetype B — Structural shape + `_fallback` marker

For fallbacks where the caller needs to distinguish "AI output" from "fallback output" for UX purposes, the `_fallback: true` marker is load-bearing. UI shows "AI unavailable — retry" when it sees this flag.

```js
it("test 226: has _fallback marker and honest-failure tldr", () => {
  const fb = buildFallbackNoteSummary();
  expect(fb._fallback).toBe(true);
  expect(fb.tldr).toMatch(/unavailable|retry|couldn't/i);
});
```

### Archetype C — Semantic invariant / regression guard

Specific bug-class guards. Sprint 6c established the "no pseudo-tags" and "anti-all-DEFINITION" invariants — Sprint 8b consolidates them at the fallback layer.

```js
it("test 227: returns empty tags with _fallback marker (no-pseudo-tags regression)", () => {
  const fb = buildFallbackNoteAutoTag();
  expect(fb).toEqual({ tags: [], _fallback: true });
});

it("test 230: at least one draft has type !== DEFINITION (anti-laziness rule)", () => {
  const fb = buildFallbackNoteFlashcards();
  expect(fb.drafts.length).toBeGreaterThanOrEqual(3);
  const nonDefinition = fb.drafts.some((d) => d.type !== "DEFINITION");
  expect(nonDefinition).toBe(true);
});
```

### Archetype D — Input-dependent behavior

For fallbacks that take arguments (topic, notesMarkdown, rawNotes/rawProblems), verify the arguments actually influence the output.

```js
it("test 232: with rawNotes populated, produces relatedNotes with matching ids", () => {
  const fb = buildFallbackNoteRelated({
    rawNotes: [
      { id: "note_a", title: "A" },
      { id: "note_b", title: "B" },
    ],
    rawProblems: [],
  });
  expect(fb.relatedNotes).toHaveLength(2);
  expect(fb.relatedNotes[0].id).toBe("note_a");
  expect(fb.relatedNotes[0].rationale).toEqual(expect.any(String));
});

it("test 239: quiz question interpolates topic string", () => {
  const fb = buildFallbackTeachingQuiz({ topic: "Rate limiting patterns" });
  const firstQuestion = fb.questions[0].question;
  expect(firstQuestion).toContain("Rate limiting patterns");
});
```

---

## Per-test detail

### T224 — buildFallbackQuiz contract
```js
it("test 224: returns null (deliberate — no valid deterministic quiz fallback exists)", () => {
  expect(buildFallbackQuiz()).toBeNull();
});
```
Panel note: this is a CONTRACT test, not a shape test. The function documents "return null so callers handling AI-off gracefully still resolve." A future refactor that returns `{}` or a placeholder object would break the caller contract.

### T225-T226 — buildFallbackNoteSummary
- **T225**: passes `validateNoteSummary(fb, {hasContent: false}).valid === true`
- **T226**: `fb._fallback === true` AND `fb.tldr` matches `/unavailable|retry|couldn't/i` (honest-failure regression)

### T227-T228 — buildFallbackNoteAutoTag
- **T227**: exact match `{tags: [], _fallback: true}` — the no-pseudo-tags contract from Sprint 6c
- **T228 (BA fold-in — reframed)**: The fallback intentionally FAILS its own validator. Empty tags array is the honest-failure signal (per source comment: "empty list with `_fallback` flag lets the UI render honest 'AI unavailable, retry' instead of polluting the tag set with garbage"). Assert `validateNoteAutoTag(fb).valid === false` AND `violations.some(v => v.startsWith("tags-count"))`. Locks in the intentional-design decision.

```js
it("test 228: validator INTENTIONALLY rejects (empty is honest-failure signal by design)", () => {
  const fb = buildFallbackNoteAutoTag();
  const result = validateNoteAutoTag(fb);
  // The fallback deliberately fails its validator — empty array is the
  // "AI unavailable, retry" signal, NOT a valid tag suggestion. If this
  // test flips to .valid === true, someone has 'fixed' the fallback by
  // adding placeholder tags — that reverts the Sprint 6c honest-failure
  // decision. Lock in the intent.
  expect(result.valid).toBe(false);
  expect(result.violations.some((v) => v.startsWith("tags-count"))).toBe(true);
});
```

### T229-T230 — buildFallbackNoteFlashcards
- **T229**: passes `validateNoteFlashcards(fb).valid === true`
- **T230**: `fb.drafts.length >= 3` AND at least one draft has `type !== "DEFINITION"` (anti-laziness — validator's `all-definitions-laziness-signal` rule fires if all are DEFINITION)

### T231-T232 — buildFallbackNoteRelated
- **T231**: input `{rawNotes: [], rawProblems: []}` → output `{relatedNotes: [], relatedProblems: []}` (empty-passthrough contract)
- **T232**: input with 2 rawNotes → output has 2 `relatedNotes` entries, each with matching `id` from input and non-empty `rationale`

### T233-T234 — buildFallbackNoteFromSolution
- **T233 (BA fold-in — corrected shape)**: with `{problem, solution, aiReview}` inputs → produces valid output shape `{title, tags, whatYouGotRight, weakAreas, mistakes, howToOvercome, topicsExplained, betterApproachNextTime, _fallback: true}`. Note: NO `contentMarkdown` field — BA-verified against source. Assertion targets: `expect(fb.title).toBeTruthy()`, `expect(fb.topicsExplained).toBeInstanceOf(Array)`, `expect(fb._fallback).toBe(true)`.
- **T234**: `solution.patterns: ["Sliding Window", "Two Pointers"]` → `fb.tags` includes `"sliding-window"` and `"two-pointers"` (kebab-case sanitization regression guard)

### T235-T237 — buildFallbackTeachingSummary
- **T235**: with `{topic: "X", notesMarkdown: "Some notes"}` → passes `validateTeachingSummary(fb).valid === true`
- **T236**: with `notesMarkdown` containing `## Heading 1\n## Heading 2\n## Heading 3` → `fb.keyTakeaways` includes the extracted headings
- **T237**: with `{topic: "X", notesMarkdown: ""}` (empty notes) → falls back to filler text; still passes validator

### T238-T239 — buildFallbackTeachingQuiz
- **T238**: `{topic: "Rate limiting"}` → passes `validateTeachingQuiz(fb).valid === true`
- **T239**: same input → at least one question interpolates `"Rate limiting"` into its `question` string

### T240-T242 — buildFallbackTeachingTopicCoverage
- **T240**: passes `validateTeachingTopicCoverage(fb).valid === true`
- **T241 (BA fold-in — corrected field name)**: `fb.verdict === "PARTIAL"` AND `fb.coverageScore` (NOT `fb.score` — BA-verified) in `[35, 74]` range (validator constraint for PARTIAL)
- **T242**: input `{topic: "redis caching", notesMarkdown: "We discussed redis at length"}` → token-based scoring reflects at least one hit (score > 0)

---

## Divergence discipline

Consistent with prior test-foundation sprints:

- **If a fallback returns a shape that FAILS its own validator** — that's a real production bug the fallback layer was supposed to guard. **ESCALATE**, do not adapt the test.
- **If the fallback's return shape differs from spec's assumed structure** (e.g., marker named `_isFallback` instead of `_fallback`) — adapt in place and record divergence in commit body.
- **If a specific assertion (e.g., "one draft with type !== DEFINITION") doesn't hold on the actual fallback output** — that's the anti-laziness rule not being enforced at the fallback layer. **ESCALATE** — this is a genuine anti-regression gap.

Expected divergence rate: **~10%** (2 tests may need adaptation). Panel-verified peek at source suggests most assertions will hold.

---

## Test count target

- Baseline (post Sprint 8a): **1451**
- New in Sprint 8b: **+19**
- Target: **1470**

---

## Done criteria

- All 19 tests pass; full suite at **1470**
- `npm run lint` (server + client) + audits exit 0
- `prisma migrate status` up to date (no schema change)
- Client `npm run build` clean
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 8 row → 8b marked ✅ shipped 2026-07-02; 8c still queued
- Divergences (if any) captured in commit body with `T<id>: <expected> vs <actual> — <decision>`
- Security/correctness escalation on: T225/T229/T235/T238/T240 (validator-pass tests — a failure here is a real bug); T227 (no-pseudo-tags regression); T230 (anti-laziness rule)
- 4-role panel review completed pre-implementation; CHANGES_REQUESTED fold-ins applied

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — pure additive tests |
| Client impact | None |
| Test runtime | +19 sync tests, sub-30ms total (pure function calls) |
| Backward compatibility | None |
| Rollback | Revert the single new test file |
| Risk floor | Lowest (matches Sprint 8a / 6b / 6c) |

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — 19 tests specified with concrete assertion targets |
| Internal consistency | 9 fallbacks × per-fallback count sums to 19. Test IDs T224-T242 contiguous with prior T1-T223 |
| Scope | Tight: M33 fallback assertion gaps only. M32 already closed (exploration verified). Concurrency (M35) → Sprint 8c |
| Ambiguity | Explicit calls: (a) T224 tests the null-return contract for buildFallbackQuiz (deliberate design; not a bug); (b) divergence escalation criterion on validator-pass tests documented |
| Adversarial review | Highest-signal tests are the validator-pass class (T225/T229/T235/T238/T240) — a fallback that fails its own validator is the exact failure mode the audit calls out. Panel peek at source suggests these will pass, but if any fail, that's a real bug not a test-writing error |
| Risk floor | Effectively zero. Pure additive; no production code change |

# AI Review Validator Hardening — Design Spec

**Date:** 2026-06-21
**Sprint:** 2.6 (per `2026-06-20-refactor-redesign-sprint.md`)
**Branch:** `feat/ai-review-validator-hardening`
**Layers on:** main, post Sprint 2.5 (`a3d05dd`)
**Feature flag:** None — bug fix + regression guard

---

## Problem

Sprint 1's wholesale backend correctness audit flagged two findings against `validateReview` in `server/src/services/ai.validators.js`:

1. **H7 — Follow-up validation allows silent omission** (audit `2026-06-20-backend-correctness-audit.md` lines 97-101). Audit claim: `validateReview` does not fail when `followUpEvaluations` is empty despite `followUpQuestionIds` being non-empty. Validator passes; per-question score data silently missing.

2. **H9 — `readinessVerdict` declared in schema but not validated** (audit lines 107-110). The system prompt declares output includes `readinessVerdict: <string>` (`ai.prompts.js:553`). `validateReview` never checks it. AI can omit; validation passes; downstream UI / verdict-log feed gets undefined or relies on the fallback's hardcoded string.

This sprint ships the regression guard for H7 (the audit finding turned out to be wrong on close reading — the validator already catches the case) and the real fix for H9 (one-line schema gap).

## Principle

This is a **deep-fix on the AI Review surface validator**, scoped to those two findings only. Adjacent audit findings carve into separate sprints:

- **Sprint 2.7:** H10 (canonical alternatives silently dropped, structured log per drop in `ai.validators.js::validateCanonicalAnswer` / `canonicalAltDedup.js`)
- **Sprint 2.8:** M9 (`ai.service.js` `callWithModelFallback` telemetry — usage event reports the original primary instead of the secondary actually attempted)

Same file (`ai.validators.js`) appears in 2.6 and 2.7 but different exported functions (`validateReview` vs `validateCanonicalAnswer`). Per user's standing rule "Break it down, focus individually" — sprints stay separate.

## Scope

In scope:

- **H7:** add a regression test that locks in the existing correct behavior — `validateReview` rejects `{ followUpEvaluations: [] }` when `followUpQuestionIds.length > 0`. No code change to the validator.
- **H9:** add `readinessVerdict` non-empty-string check to `validateReview`. New violation key: `readinessVerdict-empty`. Three regression tests (present + valid passes; missing key fails; empty string fails).
- Note in the H7 test comment that the audit's finding `2026-06-20-backend-correctness-audit.md:97-101` was verified-and-disconfirmed; the test exists to prevent silent regression.

Out of scope:

- `complexityCheck.timeComplexity` / `.spaceComplexity` STRING validation. Today only the booleans (`timeCorrect` / `spaceCorrect`) are checked. The complexity strings drive D4 Optimization state-transition gates (per CLAUDE.md) — a regression there would be felt downstream. Leaving it alone in this sprint to avoid scope creep; if it surfaces with a real failure mode I'll spec it separately.
- `readinessVerdict` content quality (minimum length, must contain "ready" / "not ready" keywords). YAGNI — non-empty-string matches the existing `improvement` / `interviewTip` patterns.
- `flags.identifiedPattern` validation when `flags.wrongPattern === true`. Today the validator only requires `correctPattern`; `identifiedPattern` (the AI's read of what the user typed) is declared in the prompt but unchecked. Listed in the audit as adjacent — out of scope here; will resurface if it produces a real bug.
- Sprints 2.7 / 2.8 (separate file or separate function — see "Principle").

## Architecture

```
ai.validators.js::validateReview
  ├── existing checks (scores / flags / strengths / gaps / improvement / interviewTip / complexityCheck shape / followUpEvaluations matching)
  └── + readinessVerdict-empty check (NEW)

test/ai/validators.test.js
  ├── existing validateReview tests
  ├── + H9 tests (3): present-and-valid / missing-key / empty-string
  └── + H7 regression test (1): followUpQuestionIds non-empty + followUpEvaluations: [] → fails

ai.fallbacks.js::buildFallbackReview
  └── unchanged. Already returns a deterministic non-empty `readinessVerdict` string ("Submission incomplete..."), so the fallback path produced by the new violation produces a valid output.
```

## H9 — `readinessVerdict-empty` validation

**Bug.** AI can return a review that omits or empties `readinessVerdict`. The validator passes. Downstream consumers:

- `aiReview.controller.js:469-499` persists `aiResponse.readinessVerdict` into the `reviewRecord.readinessVerdict` field.
- The Review UI reads `feedback.readinessVerdict` and renders it as the prominent "Ready for X" line.
- The 6D verdict log feed (`stats.controller.js`'s `get6DReport`) consumes review history's `readinessVerdict` strings as evidence.

When `readinessVerdict` is null / undefined / empty, the user sees a card with a missing line; the verdict log gets a degraded evidence point.

**Fix.** Add to `validateReview`, next to the existing `improvement` / `interviewTip` checks:

```javascript
// ── prose fields ──
if (!isNonEmptyString(review.improvement)) violations.push("improvement-empty");
if (!isNonEmptyString(review.interviewTip)) violations.push("interviewTip-empty");
if (!isNonEmptyString(review.readinessVerdict)) violations.push("readinessVerdict-empty");
```

The existing `isNonEmptyString` helper handles both undefined (returns false) and `""` / whitespace-only (returns false) — single line, single helper.

When the violation fires:

1. `validateReview` returns `{ valid: false, violations: ["readinessVerdict-empty", ...] }`
2. `runAISurface()`'s validate-or-fallback flow (Sprint 2 Task 1 / Sprint 2.5 wiring) calls `buildFallback("VALIDATION", violations)` → `buildFallbackReview` returns its deterministic shape with a valid `readinessVerdict` string.
3. Controller persists the fallback record. User sees the fallback "review unavailable, please retry" UX (the existing `usedFallback` rendering path).

This matches the existing pattern for any other validation gap — no new code path.

### Tests (new in `validators.test.js`)

```javascript
describe("validateReview - readinessVerdict (H9)", () => {
  it("passes with a non-empty readinessVerdict", () => {
    const review = { ...VALID_REVIEW, readinessVerdict: "Junior-ready on hashing problems." };
    const result = validateReview(review, {});
    expect(result.valid).toBe(true);
  });

  it("fails when readinessVerdict is missing", () => {
    const { readinessVerdict, ...withoutVerdict } = VALID_REVIEW;
    const result = validateReview(withoutVerdict, {});
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("readinessVerdict-empty");
  });

  it("fails when readinessVerdict is an empty string", () => {
    const review = { ...VALID_REVIEW, readinessVerdict: "" };
    const result = validateReview(review, {});
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("readinessVerdict-empty");
  });
});
```

`VALID_REVIEW` is the existing fixture in `validators.test.js` — extend its definition if `readinessVerdict` is missing today (likely missing, since the field was unvalidated).

## H7 — followUpEvaluations regression test

**Audit finding (lines 97-101):**

> `validateReview` enforces bidirectional ID matching ... but does NOT fail when `followUpEvaluations` is empty despite `followUpQuestionIds` being non-empty. Validator passes; user-visible review appears complete; per-question score data is silently missing.

**Reading the code (`ai.validators.js:1652-1669`):**

```javascript
if (!Array.isArray(review.followUpEvaluations)) {
  violations.push("followUpEvaluations-not-array");
} else if (followUpQuestionIds.length > 0) {
  const echoed = new Set(
    review.followUpEvaluations
      .map((e) => (e && typeof e.questionId === "string" ? e.questionId : null))
      .filter(Boolean),
  );
  for (const qid of followUpQuestionIds) {
    if (!echoed.has(qid)) violations.push(`followUp-missing-questionId:${qid}`);
  }
  ...
}
```

When `followUpEvaluations: []` and `followUpQuestionIds: ["q1", "q2"]`:
- `Array.isArray(review.followUpEvaluations)` → true (empty array is still an array).
- `followUpQuestionIds.length > 0` → true.
- `echoed` is an empty Set.
- The per-qid loop pushes `followUp-missing-questionId:q1` and `followUp-missing-questionId:q2`.
- Returns `valid: false`.

The audit finding is **a false positive**. The validator already catches it.

**Action.** Add a regression test that pins this behavior so a future refactor of the followUpEvaluations block can't silently regress it. Annotate the test comment with the audit-cited line numbers.

```javascript
describe("validateReview - followUpEvaluations empty (H7 audit-verified)", () => {
  // The Sprint 1 backend audit (lines 97-101 of
  // 2026-06-20-backend-correctness-audit.md) flagged this as a HIGH bug.
  // Reading the validator on close inspection shows it already catches the
  // case via the per-qid missing-id loop. This test locks in that behavior
  // so a future refactor of followUpEvaluations validation can't silently
  // regress it.
  it("fails when followUpEvaluations is empty but followUpQuestionIds is non-empty", () => {
    const review = { ...VALID_REVIEW, followUpEvaluations: [] };
    const result = validateReview(review, { followUpQuestionIds: ["q1", "q2"] });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain("followUp-missing-questionId:q1");
    expect(result.violations).toContain("followUp-missing-questionId:q2");
  });
});
```

## File map

**Server modified:**

- `server/src/services/ai.validators.js`
  - One new line in `validateReview` — `readinessVerdict-empty` violation push next to existing prose-field checks
- `server/test/ai/validators.test.js`
  - Add `VALID_REVIEW` fixture's `readinessVerdict` field if missing
  - Add 3 H9 tests (present + valid / missing / empty-string)
  - Add 1 H7 regression test (audit-verified false positive lock)

**Server unchanged:**

- `server/src/services/ai.fallbacks.js` (existing `buildFallbackReview` already produces a deterministic non-empty `readinessVerdict`)
- `server/src/services/ai.prompts.js` (no prompt change)
- `server/src/controllers/aiReview.controller.js` (no controller change — fallback path triggers automatically)
- All other validators, controllers, schema, env, feature flags

**Client unchanged.** Server-only sprint.

## Test plan

| Surface | Tests | Delta |
|---|---|---|
| H9 readinessVerdict | 3 new (passes / missing / empty) | +3 |
| H7 followUpEmpty | 1 new (audit-verified regression guard) | +1 |
| `validateReview` existing | unchanged; existing fixtures may need `readinessVerdict` field added so they don't suddenly fail | 0 (or non-test fixture updates) |

**Pre-Sprint baseline:** 1047 tests
**Post-Sprint expected:** 1051 tests

If existing `validateReview` tests fail because `VALID_REVIEW` (or whatever fixture they use) was missing `readinessVerdict`, that's a real validator-tightening side effect — update the fixture once and confirm green. Don't weaken the new check.

## Backward compatibility

- **No API changes.** `POST /review/:solutionId` response shape unchanged. The fallback path was already wired to handle validation failures.
- **No schema changes.** Zero migrations.
- **No env vars / feature flags.**
- **In-flight reviews:** AI responses currently in flight that omit `readinessVerdict` will now route to the fallback. Pre-fix they'd persist a degraded record with empty / undefined verdict. Either way the user gets a result; the new behavior is the better outcome (fallback is more honest than blank prose).
- **Rollback:** `git revert` per commit.

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | Both findings reference the same function (`validateReview`); H9 fix is one-line addition next to existing prose-field checks; H7 has no code change. Test names map to violation strings cleanly. |
| Scope | Two findings, one branch, one commit. Sister fixes (H10, M9) explicitly carved into 2.7 / 2.8. |
| Ambiguity | `readinessVerdict-empty` is precisely defined: `!isNonEmptyString(review.readinessVerdict)`. The H7 regression test is precisely defined: `followUpEvaluations: []` + `followUpQuestionIds: ["q1", "q2"]` → expect `valid: false` and the two `followUp-missing-questionId:*` violations. |
| Backward compat | No API/schema/flag changes. Per-commit rollback. |
| Risk | Lowest of the 2.5/2.6/2.7/2.8 series. Pure validator + tests. No new code paths; uses existing fallback wiring. The only surprise risk is that an existing `VALID_REVIEW` fixture was missing `readinessVerdict` and now its tests fail — fixture update is a one-line add. |
| Cap value rationale | n/a — no scoring changes |

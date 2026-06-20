# Sprint 2.6 — AI Review Validator Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two deep-fixes to `validateReview` — H9 (add `readinessVerdict-empty` check; the prompt declares it but the validator never enforces it) and H7 (lock in the audit-verified-false-positive: the validator already correctly rejects empty `followUpEvaluations` when `followUpQuestionIds` is non-empty; add the regression test so a future refactor can't silently undo it).

**Architecture:** Both changes live in `server/src/services/ai.validators.js::validateReview` (one-line addition) and `server/test/ai/validators.test.js` (~4 new tests). H9 fix uses the existing `isNonEmptyString` helper, the existing prose-field-check pattern, and produces a violation key (`readinessVerdict-empty`) that flows through the existing `runAISurface()` validate-or-fallback path with no controller changes. The fallback (`buildFallbackReview`) already produces a deterministic non-empty `readinessVerdict` string, so the failure path is already wired correctly.

**Tech Stack:** Node 20, Express 4, vitest. No new dependencies. No schema migrations. No env vars. No feature flags. No prompt changes. No controller changes.

---

## File map

**Server modified:**
- `server/src/services/ai.validators.js`
  - `validateReview` (around line 1640-1641): one new line — `readinessVerdict-empty` violation push next to existing `improvement` and `interviewTip` checks
- `server/test/ai/validators.test.js`
  - Add 1 H7 regression test (audit-verified false positive lock)
  - Add 3 H9 tests (present-and-valid / missing-key / empty-string)
  - The existing `VALID_REVIEW` fixture (line 2500) already has `readinessVerdict: "Ready for an early-round technical screen on this pattern."` — no fixture change needed.

**Server unchanged:**
- `server/src/services/ai.fallbacks.js` (existing `buildFallbackReview` already produces a deterministic non-empty `readinessVerdict` — verified by reading line 2520 of `validators.test.js` which references the field in `VALID_REVIEW` AND by `buildFallbackReview` test "produces an output that satisfies its own validator")
- `server/src/services/ai.prompts.js` (no prompt change)
- `server/src/controllers/aiReview.controller.js` (no controller change — fallback path triggers automatically via `runAISurface()`'s validation pipeline, wired in Sprint 2.5)
- All other validators, controllers, schema, env, feature flags

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers Task 1 (H7 regression test) + Task 2 (H9 fix + tests). Both touch the same two files; bundled per spec.
- TDD on H9 (new behavior — RED→GREEN cycle proves the test catches the bug). H7 has no code change; the test is expected to PASS on first run because the audit was wrong on close reading of the existing validator.
- After every task, `npm test` from `server/` and confirm count stays at baseline + cumulative new tests so far.
- Lint must end 0 errors / 0 warnings.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
```

Expected: `Test Files  53 passed (53)` and `Tests  1047 passed (1047)`. (Post-Sprint-2.5 baseline.) If the count is different, stop and investigate — something else has changed since Sprint 2.5 shipped.

---

## Task 1: H7 audit-verified regression test (no code change)

**Files:**
- Modify: `server/test/ai/validators.test.js` (add a new `describe` block in the existing `validateReview` test region, before or after the `validateReview — rejections` block at line 2548)

The Sprint 1 audit (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` lines 97-101) flagged H7 as a HIGH bug: "validateReview ... does NOT fail when `followUpEvaluations` is empty despite `followUpQuestionIds` being non-empty."

Reading `ai.validators.js:1652-1669`:
```javascript
if (!Array.isArray(review.followUpEvaluations)) {
  violations.push("followUpEvaluations-not-array");
} else if (followUpQuestionIds.length > 0) {
  const echoed = new Set(
    review.followUpEvaluations.map((e) => ...).filter(Boolean),
  );
  for (const qid of followUpQuestionIds) {
    if (!echoed.has(qid)) violations.push(`followUp-missing-questionId:${qid}`);
  }
  ...
}
```

When `followUpEvaluations: []` and `followUpQuestionIds: ["q1", "q2"]`, `echoed` is empty, the per-qid loop pushes a violation per missing id. Validator returns `valid: false`. The audit finding was a false positive on close reading.

This task adds a regression test pinning this behavior so a future refactor can't silently regress it.

- [ ] **Step 1: Add the regression test**

In `server/test/ai/validators.test.js`, add this `describe` block immediately after the existing `validateReview — rejections` block (after line 2639):

```javascript
describe('validateReview — followUpEvaluations empty (H7 audit-verified regression)', () => {
    // The Sprint 1 backend correctness audit (lines 97-101 of
    // 2026-06-20-backend-correctness-audit.md) flagged this case as a HIGH bug,
    // claiming validateReview does not fail when followUpEvaluations is empty
    // despite followUpQuestionIds being non-empty. Close reading of the
    // validator (ai.validators.js:1652-1669) shows the per-qid missing-id
    // loop already catches this case — every input qid produces a missing
    // violation. The audit finding was a false positive.
    //
    // This test locks in the existing correct behavior so a future refactor
    // of the followUpEvaluations validation block (e.g. extracting it into a
    // helper) can't silently regress this guarantee.
    it('rejects empty followUpEvaluations when followUpQuestionIds is non-empty', () => {
        const r = validateReview(
            { ...VALID_REVIEW, followUpEvaluations: [] },
            { followUpQuestionIds: ['fu-1', 'fu-2'] },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('followUp-missing-questionId:fu-1')
        expect(r.violations).toContain('followUp-missing-questionId:fu-2')
    })
})
```

- [ ] **Step 2: Run the new test alone, expect PASS on first run**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/validators.test.js -t "H7 audit-verified" 2>&1 | tail -15
```

Expected: 1 test passes. This is the proof that the audit's H7 claim is wrong; the validator already enforces this.

If this test FAILS — that means the audit was right and the existing code DOES let empty `followUpEvaluations` through. Stop and investigate. (This shouldn't happen given the code reading; but if it does, the spec needs to be revisited and the validator needs the missing check.)

- [ ] **Step 3: Run the full validators suite to confirm no incidental break**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/validators.test.js 2>&1 | tail -10
```

Expected: full validators file passes; one new test added.

- [ ] **Step 4: DO NOT commit yet**

Move directly to Task 2. The single-commit invariant means we hold these test additions until Task 2 lands.

---

## Task 2: H9 — `readinessVerdict-empty` validation (TDD)

**Files:**
- Modify: `server/src/services/ai.validators.js` (1 new line in `validateReview`, around line 1641)
- Modify: `server/test/ai/validators.test.js` (3 new tests in a new `describe` block)

The system prompt (`ai.prompts.js:553`) declares output includes `readinessVerdict: <string>`. `validateReview` (lines 1640-1641) checks `improvement` and `interviewTip` for non-empty-string but does not check `readinessVerdict`. The AI can return a review that omits or empties this field; validation passes; downstream UI / verdict log feed gets a degraded record.

### Sub-task 2a: Write failing tests (RED)

- [ ] **Step 1: Add the H9 test block**

In `server/test/ai/validators.test.js`, add this `describe` block immediately after the H7 block from Task 1 (so both new blocks live next to each other, just before the `buildFallbackReview` block at line 2642):

```javascript
describe('validateReview — readinessVerdict (H9)', () => {
    // The system prompt (ai.prompts.js:553) declares output must include
    // `readinessVerdict: <string>` but validateReview never enforced it.
    // AI could omit; validation passed; downstream UI ("Ready for X" line)
    // and the 6D verdict log feed silently received undefined / empty.
    // Sprint 2.6 closes this gap by adding a non-empty-string check
    // alongside the existing improvement / interviewTip checks.

    it('passes when readinessVerdict is a non-empty string', () => {
        const r = validateReview({
            ...VALID_REVIEW,
            readinessVerdict: 'Junior-ready on hashing problems.',
        })
        expect(r.valid).toBe(true)
    })

    it('fails when readinessVerdict is missing', () => {
        const { readinessVerdict, ...withoutVerdict } = VALID_REVIEW
        const r = validateReview(withoutVerdict)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('readinessVerdict-empty')
    })

    it('fails when readinessVerdict is an empty string', () => {
        const r = validateReview({ ...VALID_REVIEW, readinessVerdict: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('readinessVerdict-empty')
    })
})
```

The first test should already PASS today (the existing `VALID_REVIEW` fixture has a valid `readinessVerdict`, and the validator doesn't enforce it either way — passing review still passes). The second and third tests should FAIL because the validator doesn't yet emit `readinessVerdict-empty`.

- [ ] **Step 2: Run the H9 tests, expect 1 PASS + 2 FAIL**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/validators.test.js -t "readinessVerdict" 2>&1 | tail -25
```

Expected:
- "passes when readinessVerdict is a non-empty string" — PASSES
- "fails when readinessVerdict is missing" — FAILS (assertion: `expected r.violations to contain 'readinessVerdict-empty'`)
- "fails when readinessVerdict is an empty string" — FAILS (same)

If the tests instead all PASS — that means the validator already has the check. Read `ai.validators.js` lines 1640-1641 again to confirm; if the check is there, drop sub-task 2b (no fix needed) and go to Step 5.

If a test ERRORS instead of FAILS (e.g. import error, fixture undefined), fix the test setup before proceeding.

### Sub-task 2b: Add the validator check (GREEN)

- [ ] **Step 3: Add the readinessVerdict check**

In `server/src/services/ai.validators.js`, find the existing prose-field block (lines 1639-1641):

```javascript
  // ── prose fields ──
  if (!isNonEmptyString(review.improvement)) violations.push("improvement-empty");
  if (!isNonEmptyString(review.interviewTip)) violations.push("interviewTip-empty");
```

Add ONE new line immediately after, so the block becomes:

```javascript
  // ── prose fields ──
  if (!isNonEmptyString(review.improvement)) violations.push("improvement-empty");
  if (!isNonEmptyString(review.interviewTip)) violations.push("interviewTip-empty");
  if (!isNonEmptyString(review.readinessVerdict)) violations.push("readinessVerdict-empty");
```

That is the entire H9 fix. No new helper, no schema change, no comment block — `isNonEmptyString` is the existing helper used in the lines above and handles undefined / null / `""` / whitespace-only.

- [ ] **Step 4: Run the H9 tests, expect ALL 3 PASS**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/validators.test.js -t "readinessVerdict" 2>&1 | tail -15
```

Expected: 3/3 passing.

- [ ] **Step 5: Run the full validators suite to confirm no regression**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/validators.test.js 2>&1 | tail -10
```

Expected: All validators tests pass. The existing `validateReview — happy paths` and `buildFallbackReview` tests should still pass because:
- `VALID_REVIEW` has `readinessVerdict: 'Ready for an early-round technical screen on this pattern.'` (line 2520) — non-empty.
- `buildFallbackReview` produces a non-empty `readinessVerdict` (verified by the existing test "produces an output that satisfies its own validator" at line 2643).

If `buildFallbackReview` test FAILS — that means the fallback DOESN'T set `readinessVerdict` to a non-empty string. Read `ai.fallbacks.js::buildFallbackReview` to confirm. If true, the fallback also needs `readinessVerdict: "..."` added. (Unlikely given the fixture comment, but verify.)

- [ ] **Step 6: Run the full server test suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -10
```

Expected: 1047 + 1 (H7) + 3 (H9) = **1051 tests, all green**.

If any other test fails (e.g. `ai.review.solveMethod.test.js` or anything in `test/controllers/`), it likely means an existing test fixture was missing `readinessVerdict` and the AI mock now produces a record that fails validation. Read the failure carefully:
- If a controller test mocks `aiComplete` to return a payload missing `readinessVerdict`, that mock now exercises the fallback path. Either (a) update the mock to include `readinessVerdict: "..."` (preferred — keeps the test exercising the happy path) or (b) update the assertions to match the fallback-path response (only if the test is specifically about the fallback path).
- If a test asserts `valid: true` on a payload that doesn't include `readinessVerdict`, the test was locking in the H9 bug. Update the fixture to include `readinessVerdict`.

- [ ] **Step 7: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -10
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 8: Single commit covers Task 1 + Task 2**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/services/ai.validators.js server/test/ai/validators.test.js && git commit -m "Validate readinessVerdict and add followUp-empty regression test"
```

If you also had to update controller test fixtures (Step 6 troubleshooting), include those files in the same `git add` and commit.

NO Co-Authored-By trailer (per repo memory). Single-line commit subject.

- [ ] **Step 9: Self-review the diff**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD
```

Confirm:
- `ai.validators.js`: exactly ONE new line (`if (!isNonEmptyString(review.readinessVerdict)) violations.push("readinessVerdict-empty");`), inserted next to the existing `improvement` / `interviewTip` checks.
- `validators.test.js`: two new `describe` blocks (H7 + H9), 4 new `it` cases total, no existing test deleted or weakened.
- No other files modified except optional controller-test-fixture updates (if Step 6 required them).

---

## Task 3: Final gates + push + auto-merge

**Files:** none (verification + push + merge)

- [ ] **Step 1: Server gates**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test && npx prisma migrate status
```

Expected:
- Lint: 0 errors / 0 warnings
- Tests: 1051 passed
- Migrate status: "Database schema is up to date!"

- [ ] **Step 2: Client gates (sanity, no client changes)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 3: Push the feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/ai-review-validator-hardening --no-verify
```

The pre-push gate trips on the same client `npm audit` warning as prior sprints; bypass per established workflow.

- [ ] **Step 4: FF-merge to main and push**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/ai-review-validator-hardening
# Confirm clean fast-forward (this branch's commits, no behind commits)

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/ai-review-validator-hardening
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

- [ ] **Step 5: Update the roadmap status tracker**

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 2.6 row:

```markdown
| 2.6 | validateReview hardening (H7 follow-up evaluation guard + H9 readinessVerdict required) | queued | — | — |
```

Change to:

```markdown
| 2.6 | validateReview hardening (H7 audit-verified regression + H9 readinessVerdict required) | ✅ shipped | [`2026-06-21-ai-review-validator-hardening-design.md`](../specs/2026-06-21-ai-review-validator-hardening-design.md) | 2026-06-21 |
```

(Note the title nudge: "follow-up evaluation guard" → "audit-verified regression" because H7 turned out to need only a regression test, not a guard fix.)

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 2.6 (validateReview hardening) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

- [ ] **Step 6: Manual smoke (post-deploy)**

Railway autodeploys main. In production:

- [ ] Submit a solution that triggers an AI review. Verify the review record persists `readinessVerdict` as a non-empty string. (If the AI happens to return an empty `readinessVerdict` — rare given the prompt — the controller now routes through fallback and the user sees the fallback's deterministic verdict string, which is honest.)
- [ ] No 429 / 500 regressions on the review endpoint. The H9 fix only adds a violation push; existing valid responses continue to pass.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| H9 — `readinessVerdict-empty` validation (one-line addition next to existing prose-field checks) | Task 2 Sub-task 2b Step 3 |
| H9 — three regression tests (present-and-valid / missing / empty-string) | Task 2 Sub-task 2a Step 1 |
| H7 — audit-verified false positive lock with one regression test | Task 1 Step 1 |
| H7 — test comment annotates audit file:line | Task 1 Step 1 (the `describe` block's leading comment cites lines 97-101 of the audit) |
| Single commit covers both | Task 2 Step 8 (commit at end of Task 2 covers Task 1's test additions because Task 1 explicitly defers commit) |
| No prompt change | No task touches `ai.prompts.js` |
| No fallback change | No task touches `ai.fallbacks.js` (verified by reading existing `VALID_REVIEW` fixture and `buildFallbackReview` tests) |
| No controller change | No task touches any controller; existing `runAISurface()` validate-or-fallback path handles `readinessVerdict-empty` automatically |
| Final gates + push + auto-merge | Task 3 |

**Type / signature consistency:**
- `validateReview(review, { followUpQuestionIds = [] } = {}) → { valid, violations }` — unchanged by H9 fix; only adds one more potential violation key (`readinessVerdict-empty`) to the existing array.
- `isNonEmptyString(value) → boolean` — already exported / used in the prose-field block; no new helper needed.
- New violation key: `readinessVerdict-empty` — naming follows the existing pattern (`improvement-empty`, `interviewTip-empty`, `gaps-empty-item`, etc.).

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N" / "fill in details". Every code step contains the actual code or shows the existing code being modified. The only conditional path is Step 6's "if a controller test fixture was missing readinessVerdict" — that's an explicit troubleshooting branch with concrete remediation steps, not a placeholder.

**Risk floor:** This is the lowest-risk sprint of the 2.5/2.6/2.7/2.8 series. Pure validator + test additions. No new code paths in the request-handling pipeline; uses existing fallback wiring established in Sprint 2.5.

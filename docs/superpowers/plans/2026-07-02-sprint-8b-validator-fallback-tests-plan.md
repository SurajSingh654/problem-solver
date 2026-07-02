# Sprint 8b — Fallback Assertion Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 19 dedicated assertion tests (T224-T242) for the 9 untested fallback functions in `ai.fallbacks.js`. Closes M33 audit finding.

**Architecture:** One new file `server/test/ai/fallbacks.test.js`. Zero mocks, zero async, zero production code changes. Each test imports the fallback + optionally its validator + asserts on the returned shape.

**Tech Stack:** Vitest 4.1.6 (as-is).

**Spec:** [`docs/superpowers/specs/2026-07-02-sprint-8b-validator-fallback-tests-design.md`](../specs/2026-07-02-sprint-8b-validator-fallback-tests-design.md)

**Branch:** `feat/fallback-assertion-tests` (already created; spec committed at `49d409d`)

**Baseline test count:** 1451 (post Sprint 8a, main commit `b0beb62`). Capture exact in Task 0. Target after sprint: **1470** (+19).

**Review history:** Pre-implementation 4-role panel review runs on this plan BEFORE implementer dispatch, per `feedback_multi_agent_review_before_code.md`. All CHANGES_REQUESTED fold-ins must land before Task 0.

---

## File map

**Create:**
- `server/test/ai/fallbacks.test.js` — 19 tests T224-T242

**Modify (Task 2 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 8b shipped

**Unchanged (explicit):**
- `server/src/services/ai.fallbacks.js` (read-only)
- `server/src/services/ai.validators.js` (read-only)
- All other production code
- Existing test files (no modifications)

---

## Task 0: Pre-flight

- [ ] **Step 1: Confirm state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `feat/fallback-assertion-tests`, latest commit `49d409d`. Clean tree.

- [ ] **Step 2: Baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1451 passed`.

- [ ] **Step 3: Pre-push gate sanity** (each exit 0)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

NO commits.

---

## Task 1: Read the 9 fallback function bodies + write tests

**Files:**
- Create: `server/test/ai/fallbacks.test.js`

### Steps

- [ ] **Step 1: Read the 9 target fallback function bodies**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -A 30 "^export function buildFallbackQuiz\b" server/src/services/ai.fallbacks.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -A 25 "^export function buildFallbackNoteSummary\|^export function buildFallbackNoteAutoTag\|^export function buildFallbackNoteFlashcards\|^export function buildFallbackNoteRelated\|^export function buildFallbackNoteFromSolution" server/src/services/ai.fallbacks.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -A 30 "^export function buildFallbackTeaching" server/src/services/ai.fallbacks.js
```

For each fallback, note:
- Exact return shape (fields, types, marker naming)
- Argument signature (does it take input parameters that influence output?)
- Any obvious anti-patterns the fallback guards against (comments in the source typically call these out — e.g., "no pseudo-tags", "anti-laziness")

- [ ] **Step 2: Read the paired validator function signatures**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -B 1 -A 5 "^export function validateNoteSummary\|^export function validateNoteAutoTag\|^export function validateNoteFlashcards\|^export function validateNoteRelated\|^export function validateTeachingSummary\|^export function validateTeachingQuiz\|^export function validateTeachingTopicCoverage" server/src/services/ai.validators.js
```

Confirm the validator signatures (some take options like `{hasContent}` or `{candidateNoteIds}`).

- [ ] **Step 3: Create the test file**

Build `server/test/ai/fallbacks.test.js` from the spec's "Per-test detail" section verbatim. Structure:

```js
import { describe, it, expect } from "vitest";
import {
  buildFallbackQuiz,
  buildFallbackNoteSummary,
  buildFallbackNoteAutoTag,
  buildFallbackNoteFlashcards,
  buildFallbackNoteRelated,
  buildFallbackNoteFromSolution,
  buildFallbackTeachingSummary,
  buildFallbackTeachingQuiz,
  buildFallbackTeachingTopicCoverage,
} from "../../src/services/ai.fallbacks.js";
import {
  validateNoteSummary,
  validateNoteAutoTag,
  validateNoteFlashcards,
  validateNoteRelated,
  validateTeachingSummary,
  validateTeachingQuiz,
  validateTeachingTopicCoverage,
} from "../../src/services/ai.validators.js";

describe("buildFallbackQuiz", () => {
  it("test 224: returns null (deliberate — no valid deterministic quiz fallback exists)", () => {
    expect(buildFallbackQuiz()).toBeNull();
  });
});

describe("buildFallbackNoteSummary", () => {
  it("test 225: passes validateNoteSummary with hasContent: false", () => { /* ... */ });
  it("test 226: has _fallback marker and honest-failure tldr", () => { /* ... */ });
});

// ... 7 more describe blocks per spec
```

Fill in each test body from the spec's "Per-test detail" section (T224-T242). Use assertion archetypes A/B/C/D from the spec's "Test archetypes" section.

**No mocks, no async, no `beforeEach`.** Pure function tests.

- [ ] **Step 4: Run the test file**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/ai/fallbacks.test.js
```

Expected: 19/19 pass.

**Decision tree on failure:**
- **Validator-pass test fails** (T225/T229/T235/T238/T240) — the fallback returns a shape that FAILS its own validator. This is a real production bug — the audit-flagged gap. **ESCALATE** to user, do NOT adapt the test.
- **Semantic invariant test fails** (T227 no-pseudo-tags, T230 anti-laziness) — the invariant isn't being enforced at the fallback layer. **ESCALATE**.
- **Shape assertion mismatch** (e.g., marker named differently) — non-security divergence. Adapt in place; record in commit body with `T<id>: <expected shape> vs <actual shape> — <decision>`.
- **Input-behavior test fails** (T232/T239) — the fallback isn't respecting its input parameters. Verify against source; may be a real bug (escalate) or spec assumption drift (adapt).

- [ ] **Step 5: Full suite regression check**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1470 passed` (1451 + 19).

- [ ] **Step 6: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

Standing rules: NO Co-Authored-By, single-line subject.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/test/ai/fallbacks.test.js && git commit -m "Add 19 fallback assertion regression tests (T224-T242)"
```

If divergences surfaced and non-security ones were adapted in-place, use HEREDOC body:

```bash
git commit -m "$(cat <<'EOF'
Add 19 fallback assertion regression tests (T224-T242)

Divergences:
- T<id>: <expected> vs <actual> — <decision>
EOF
)"
```

---

## Task 2: Final gates + push + FF-merge + roadmap

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Pre-push gate** (sequential):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: 1470 passing, 0 vulns, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/fallback-assertion-tests
```

DO NOT use `--no-verify`.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/fallback-assertion-tests && git push origin main
```

- [ ] **Step 4: Update roadmap**

Find the existing 8b row:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "^| 8b " docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md
```

Replace with (match file's actual column format):

```markdown
| 8b | M33 fallback assertion test foundation (19 tests T224-T242 in server/test/ai/fallbacks.test.js for the 9 untested fallbacks: Quiz + 4 Note + NoteFromSolution + 3 Teaching; validator-pass + `_fallback` marker + semantic invariant guards; M32 audit obsolete — validator rejection tests already existed pre-Sprint-8b; 4-role panel reviewed pre-implementation) | ✅ shipped | [`2026-07-02-sprint-8b-validator-fallback-tests-design.md`](../specs/2026-07-02-sprint-8b-validator-fallback-tests-design.md) | 2026-07-02 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 8b (fallback assertion tests) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main
```

- [ ] **Step 6: Verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -10
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```

Verify local HEAD == origin/main.

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ 9 fallback describe blocks × 19 tests → Task 1
- ✅ Source-first read pass (verify assumptions vs reality) → Task 1 Step 1
- ✅ Security/correctness escalation criterion → Task 1 Step 4
- ✅ Roadmap update → Task 2 Step 4

### Placeholder scan

No "TBD" / "implement later". Plan is mechanical: read → write → run → commit.

### Type consistency

- Test IDs T224-T242 contiguous with prior T1-T223 (Sprint 8a shipped through T223).
- 9 fallbacks × per-fallback test count (1+2+2+2+2+2+3+2+3) sums to 19 ✓

### Adversarial check

- **Validator-pass failures** = real bugs, not test-writing errors. Task 1 Step 4 makes the escalation criterion explicit.
- **Source-first read pass** — Task 1 Step 1 asks implementer to read the actual fallback source before writing assertions. Some spec assumptions (e.g., marker naming, exact tldr text pattern) may need adaptation.
- **No new file dependencies** — tests only import existing `ai.fallbacks.js` + `ai.validators.js`; no test helpers, no mocks.

---

## Done criteria

- 19 new tests pass; full suite at **1470**
- `npm run lint` (server + client) + audits exit 0
- `prisma migrate status` up to date
- Client `npm run build` clean
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 8b → ✅ shipped 2026-07-02
- Divergences captured in commit body
- Security/correctness escalations (T225/T229/T235/T238/T240 validator-pass; T227 no-pseudo-tags; T230 anti-laziness) surfaced to user for decision, not auto-updated
- 4-role panel review completed pre-implementation with fold-ins applied

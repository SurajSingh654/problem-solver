# Sprint 8a — Zod Schema Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 35 dedicated Zod schema tests (T189-T223) across 7 new files, one per `server/src/schemas/*.schema.js`. Closes M34. Guards the 5-touchpoint silent-strip regression class via explicit `.strict()`-mode enforcement tests.

**Architecture:** Pure additive test work. Zero mocks, zero async, zero production code changes. Each file imports schemas + calls `.safeParse()` + asserts on the result.

**Tech Stack:** Vitest 4.1.6 + Zod (as-is in the project).

**Spec:** [`docs/superpowers/specs/2026-07-02-sprint-8a-zod-schema-tests-design.md`](../specs/2026-07-02-sprint-8a-zod-schema-tests-design.md)

**Branch:** `feat/zod-schema-tests` (already created; spec committed at `d2914ed`)

**Baseline test count:** 1411 (post Sprint 7b, main commit `8265286`). Capture exact in Task 0. Target after sprint: **1446** (+35).

**Review history:** Pre-implementation 4-role panel review (PO + BA + Security Manager + Lead Engineer) runs on this plan BEFORE the implementer subagent is dispatched, per `feedback_multi_agent_review_before_code.md`. All CHANGES_REQUESTED fold-ins must land in spec/plan before Task 0.

---

## File map

**Create (7 test files):**
- `server/test/schemas/auth.schema.test.js` — T189-T198 (10 tests)
- `server/test/schemas/designStudio.schema.test.js` — T199-T203 (5 tests)
- `server/test/schemas/feedback.schema.test.js` — T204-T206 (3 tests)
- `server/test/schemas/problem.schema.test.js` — T207-T211 (5 tests)
- `server/test/schemas/quiz.schema.test.js` — T212-T213 (2 tests)
- `server/test/schemas/solution.schema.test.js` — T214-T218 (5 tests)
- `server/test/schemas/team.schema.test.js` — T219-T223 (5 tests)

**Modify (Task 3 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — decompose Sprint 8 row into 8a (shipped) + 8b (queued) + 8c (queued)

**Unchanged (explicit):**
- All schema files (read-only)
- All production code
- All existing tests

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm current state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `feat/zod-schema-tests`, latest commit `d2914ed` (spec). Working tree clean (or has panel fold-ins).

- [ ] **Step 2: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1411 passed`. If different, STOP and reconcile.

- [ ] **Step 3: Verify `server/test/schemas/` doesn't already exist**

```bash
[ -d /Users/surajsingh/Downloads/Projects/problem-solver/server/test/schemas ] && echo "EXISTS" || echo "OK (will be created)"
```

- [ ] **Step 4: Pre-push gate sanity** (each exit 0)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

NO commits in this task.

---

## Task 1: Verify schema shapes + write all 7 test files

**Files created**: all 7 test files listed above.

Single task because each file is small (2-10 tests, ~40-200 lines). Read → verify → write → run → commit.

### Steps

- [ ] **Step 1: Read all 7 schema files first**

The spec makes assumptions about schema shapes that MUST be verified against reality before writing tests. Read each schema file end-to-end:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat server/src/schemas/auth.schema.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat server/src/schemas/designStudio.schema.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat server/src/schemas/feedback.schema.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat server/src/schemas/problem.schema.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat server/src/schemas/quiz.schema.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat server/src/schemas/solution.schema.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat server/src/schemas/team.schema.js
```

For each schema referenced by a test, note:
- Actual field shape (required/optional; types; nested objects)
- Whether `.strict()` is applied
- Whether `.refine()` blocks exist and their exact conditions
- Enum values (for tests that assert enum enforcement)

**Divergence-vs-spec inventory**: if any assumption in the spec doesn't match reality, record a note. Two decision tiers:

**Security-critical divergences MUST escalate (do not auto-adapt the test):**
- T190 (registerSchema strict), T197 (switchTeamSchema strict), T198 (updateProfileSchema strict)
- T201 (aiCoachingSchema strict), T208 (createProblemSchema strict), T211 (canonicalPatchSchema strict)
- T213 (generateQuizSchema strict), T215 (updateSolutionSchema strict — audit-mentioned drift catcher)
- T222 (changeMemberRoleSchema role enum), T223 (approveTeamSchema strict)

Missing `.strict()` on any of these means the 5-touchpoint silent-strip protection is genuinely absent — a real audit gap. STOP and report BLOCKED for user decision.

**Non-security divergences adapt-in-place:**
- Missing refinements (T195 onboarding joinCode, T196 changePassword cross-field) → adapt test to what the schema actually does; record in commit body
- Enum values that don't match spec's assumption → use the actual enum values
- Nested object shapes that differ from assumption → use actual shape

- [ ] **Step 2: Create `server/test/schemas/` directory** (implicit via first Write; `mkdir -p` if needed)

```bash
mkdir -p /Users/surajsingh/Downloads/Projects/problem-solver/server/test/schemas
```

- [ ] **Step 3: Write each of the 7 test files** (in this order for isolation)

For each file, use the spec's "Per-test details" section as the source of truth. Test archetype patterns from spec's "Test archetypes" section.

**Common file header** (all 7 files):
```js
import { describe, it, expect } from "vitest";
import {
  // ... only the schemas THIS file tests ...
} from "../../src/schemas/<name>.schema.js";
```

Then per-schema `describe(...)` block with `it(...)` blocks for each test ID. Test names follow the pattern `it("test 189: <descriptor>", () => { ... })`.

Example structure for `auth.schema.test.js` (T189-T198):

```js
import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  onboardingSchema,
  changePasswordSchema,
  switchTeamSchema,
  updateProfileSchema,
} from "../../src/schemas/auth.schema.js";

describe("registerSchema", () => {
  it("test 189: accepts a canonical register payload", () => { /* ... */ });
  it("test 190: rejects unknown keys (strict-mode drift catcher)", () => { /* ... */ });
  it("test 191: rejects invalid email format", () => { /* ... */ });
});

describe("loginSchema", () => {
  it("test 192: accepts canonical login payload", () => { /* ... */ });
  it("test 193: rejects missing password", () => { /* ... */ });
});

describe("onboardingSchema", () => {
  it("test 194: accepts individual mode", () => { /* ... */ });
  it("test 195: refinement — join mode requires joinCode", () => { /* ... */ });
});

describe("changePasswordSchema", () => {
  it("test 196: refinement — newPassword must differ from currentPassword", () => { /* ... */ });
});

describe("switchTeamSchema", () => {
  it("test 197: rejects unknown keys (strict)", () => { /* ... */ });
});

describe("updateProfileSchema", () => {
  it("test 198: rejects unknown keys (strict)", () => { /* ... */ });
});
```

Fill in each test body from the spec's per-test description. Use `.safeParse()`, assert `result.success` first, then narrow.

Repeat for the other 6 files. Sizes:
- `designStudio.schema.test.js` — 5 tests
- `feedback.schema.test.js` — 3 tests
- `problem.schema.test.js` — 5 tests
- `quiz.schema.test.js` — 2 tests
- `solution.schema.test.js` — 5 tests (T215 has the audit-mentioned drift-catcher comment)
- `team.schema.test.js` — 5 tests

- [ ] **Step 4: Run each new file individually as it's written** (fast feedback loop)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/schemas/auth.schema.test.js
```

Repeat for each of the 7 files. Expected per file: all tests pass, or divergences surfaced with clear decisions.

- [ ] **Step 5: Full suite regression check**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1446 passed` (1411 + 35). If divergences dropped a test count, adjust and record.

- [ ] **Step 6: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

Standing rules: NO Co-Authored-By, single-line subject.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/test/schemas && git commit -m "Add 35 Zod schema regression tests (T189-T223) across 7 new files"
```

If divergences were surfaced and non-security ones adapted in-place, use HEREDOC body:

```bash
git commit -m "$(cat <<'EOF'
Add 35 Zod schema regression tests (T189-T223) across 7 new files

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

Expected: 1446 passing, 0 vulns, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/zod-schema-tests
```

DO NOT use `--no-verify`.

- [ ] **Step 3: FF-merge to main + push**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/zod-schema-tests && git push origin main
```

- [ ] **Step 4: Update roadmap — decompose Sprint 8 row**

Read:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "^| 8 " docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md
```

Find the existing Sprint 8 row and replace with THREE rows (8a shipped + 8b queued + 8c queued):

```markdown
| 8a | M34 Zod schema test foundation (35 tests T189-T223 across 7 files: auth/designStudio/feedback/problem/quiz/solution/team; strict-mode drift catchers guard the 5-touchpoint silent-strip regression class; 4-role panel reviewed pre-implementation) | ✅ shipped | [`2026-07-02-sprint-8a-zod-schema-tests-design.md`](../specs/2026-07-02-sprint-8a-zod-schema-tests-design.md) | 2026-07-02 |
| 8b | M32 + M33 validator-rejection + fallback-assertion test foundation (non-Verdict validators — Problem/Coaching/Scenario/Quiz/Note*; ~25 tests) | queued | — | — |
| 8c | M35 concurrency race guards (auth.controller completeOnboarding joinCode race; solutions.controller archive/restore race; ai.controller force-review cache race — verify obsolescence first; ~4-6 tests) | queued | — | — |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 8a shipped; queue 8b + 8c"
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

- ✅ 7 test files × 35 tests → Task 1
- ✅ Schema-first read pass (verify assumptions vs reality) → Task 1 Step 1
- ✅ Security-critical divergence escalation criterion → Task 1 Step 1
- ✅ Roadmap decomposition (8a shipped + 8b + 8c queued) → Task 2 Step 4

### Placeholder scan

No "TBD" / "implement later" / "fill in details". The plan is mechanical: read schema → write test file → run → repeat.

### Type consistency

- Test IDs T189-T223 contiguous with prior T1-T188.
- 7 files × per-file counts sum to 35: 10 + 5 + 3 + 5 + 2 + 5 + 5 = 35 ✓

### Adversarial check

- **Assumed refinements not existing** — Task 1 Step 1 requires reading each schema first. Divergence discipline documents the decision path.
- **`.strict()` silently absent on any audit-critical schema** — that's the security-critical escalation branch. Missing strict on T215 (updateSolutionSchema) would mean the 5-touchpoint contract is silently broken. Escalate.
- **New schema directory** — `server/test/schemas/` doesn't currently exist. Task 1 Step 2 creates it via `mkdir -p`. Vitest auto-discovers `test/**/*.test.js`, so no config change needed.
- **Test isolation** — no mocks, no async, no shared state. Each test is a pure `.safeParse()` call. No isolation risk.

---

## Done criteria

- 35 new tests pass; full suite at **1446**
- `npm run lint` (server + client) + audits exit 0
- `prisma migrate status` up to date
- Client `npm run build` clean
- Feature branch FF-merged to main; both pushed to origin
- Roadmap Sprint 8 decomposed: 8a ✅ shipped 2026-07-02, 8b + 8c queued
- Any divergences captured in commit body
- Security-critical divergences (missing `.strict()` on T190/T197/T198/T201/T208/T211/T213/T215/T223 target schemas) escalated to user for decision, not auto-updated
- 4-role panel review completed pre-implementation with all CHANGES_REQUESTED fold-ins applied

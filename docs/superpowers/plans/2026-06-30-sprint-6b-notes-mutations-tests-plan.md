# Sprint 6b — Notes Mutations Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 22 regression tests (T121-T142) for the 7 mutations in `notes.controller.js` — locks in ownership gates, conditional re-embed optimization, link-reset semantics, auto-unpin invariant, archived-pin rejection, and cancel-before-delete ordering. Locks in Sprint 6a's `requestId` envelope contract for the entire notes mutation surface.

**Architecture:** Pure additive test work. 1 new test file with 22 tests across 7 `describe()` blocks, all sharing one mock surface. No production code changes expected.

**Tech Stack:** Vitest with mocked Prisma + mocked notes.embedding. Same pattern as Sprint 6a's `notesAiTemplate.test.js`.

**Spec:** [`docs/superpowers/specs/2026-06-30-sprint-6b-notes-mutations-tests-design.md`](../specs/2026-06-30-sprint-6b-notes-mutations-tests-design.md)

**Branch:** `feat/notes-mutations-tests` (already created; spec committed at `f60532d`)

**Baseline test count:** 1339 (post Sprint 6a, commit `7c302df`). Capture exact in Task 0. Target after sprint: **1361** (+22).

**Review history:** Full 4-role panel completed pre-implementation:
- Project Owner — APPROVED WITH NOTES → security-divergence escalation tightened in Task 1 Step 3 below
- Business Analyst — CHANGES REQUESTED → `vi.hoisted` mock binding fix + `notesEmbeddingMock.X` assertion refs + `toHaveBeenCalledTimes(1)` folded into spec v3
- Security Manager — CHANGES REQUESTED → 7 `where.userId` ownership-clause assertions added to spec v3
- Lead Engineer — CHANGES REQUESTED → mock binding fix corroborated; createNote `include` clause note corrected

---

## File map

**Create:**
- `server/test/controllers/notes.mutations.test.js` — 22 tests (T121-T142)

**Modify (Task 2 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 6b shipped.

**Unchanged (explicit):**
- `server/src/controllers/notes.controller.js` — read-only. No production changes expected. If a test surfaces a divergence, document it per the spec's Done criteria and decide per-case (fix code | accept and update test | defer).
- All other production code.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm current state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `feat/notes-mutations-tests`, latest commit `f60532d` (spec v2 with fold-ins). Working tree clean.

- [ ] **Step 2: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1339 passed`. Record exact count. If lower or higher, STOP and reconcile.

- [ ] **Step 3: Pre-push gate sanity (each MUST exit 0)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

If any fails STOP and report BLOCKED.

NO commits in this task.

---

## Task 1: Write 22 mutation tests in a single file

**Files:**
- Create: `server/test/controllers/notes.mutations.test.js`

### Steps

- [ ] **Step 1: Read the controller end-to-end before writing tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '1,210p' server/src/controllers/notes.controller.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '205,565p' server/src/controllers/notes.controller.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '1100,1122p' server/src/controllers/notes.controller.js
```

Verify the line references in the spec match reality:
- `createNote` start at 205 with title-required check at 211
- `updateNote` start at 353, conditional re-embed at 426-431, link-detach at 378-381
- `duplicateNote` start at 459, select clause at 464-469 (excludes linkedEntity*)
- `archiveNote` start at 502, auto-unpin at line 510 (`data: { archivedAt: ..., pinned: false }`)
- `deleteNotePermanent` start at 530, cancelNoteEmbedding before delete at 542
- `restoreNote` start at 552
- `togglePin` start at 1100, archived check at 1108-1110

If any line reference is off by more than 5 lines, the spec is stale — note the actual line in the test comments but proceed; the assertions are line-agnostic.

- [ ] **Step 2: Create the test file**

Create `server/test/controllers/notes.mutations.test.js` with the full content from the spec's "Per-test design" section. The file must contain:

(a) Imports + hoisted mocks (Prisma surface, notes.embedding) — exact code from spec's "Mock pattern" section.
(b) Controller imports via `await import(...)`.
(c) `mockReqRes` helper — exact code from spec, including `res.req = req` wire-up.
(d) `beforeEach` — `vi.clearAllMocks()` + `mockReset()` per mock + re-establish `teamMembership.findMany([])` default. EXACT code from spec.
(e) 7 `describe()` blocks, one per mutation, with the tests laid out in T121-T142 order. Each test's content is the verbatim code block from the spec's "Per-test design" section.

The full file is ~280 lines. Write it as one Write tool call.

- [ ] **Step 3: Run the new tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/notes.mutations.test.js
```

Expected: 22/22 pass.

If any test fails:
1. Read the failure carefully. Is the controller's actual behavior different from the spec's expectation? (Sprint 5a/5b surfaced 15 such divergences.)
2. If a real divergence: record it in a divergence log (append to commit message body) with format `T<id>: <expected> vs <actual> — <decision>`.
3. Decision tree:
   - Spec assumption was wrong → update test (record divergence) — but see **security-critical override** below
   - Controller has a bug → STOP, escalate to user before fixing (out of 6b scope is "no production changes")
   - Mock pattern is off → fix the mock (not a divergence, just test correctness)
4. **Security-critical override (PO fold-in)** — these tests assert authorization invariants. If ANY of T124, T128, T129, T130, T132, T133, T134, T135, T136, T137, T138, T139, T140 fail because the controller's actual behavior diverges from the spec, the implementer MUST stop and escalate — NOT auto-update the test under the "spec assumption wrong" branch. The set:
   - T124, T130, T137, T139 — ownership-404 gates (the only authz vector for user-scoped notes)
   - T129 — folder ownership filter (prevents cross-user folder attachment)
   - T133, T134, T135, T136 — `updateMany` `where.userId` filter (sole authz gate for archive/restore)
   - T138 — cancel-before-delete ordering (data-integrity invariant for the debounced embed pre-empt)
   - T128, T132 — link state semantics (detach clears; duplicate resets)
   - T140 — archived-pin rejection (prevents incoherent state)
5. Re-run until 22/22 pass OR all failures are documented divergences with user-approved decisions.

- [ ] **Step 4: Full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1361 passed` (1339 + 22). No collateral breakage in any other test file.

- [ ] **Step 5: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/test/controllers/notes.mutations.test.js && git commit -m "Add 22 notes mutation regression tests (T121-T142)"
```

Standing project rules:
- NO `Co-Authored-By:` trailer
- Single-line commit subject

If divergences were surfaced, add them in the commit message body via a HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
Add 22 notes mutation regression tests (T121-T142)

Divergences surfaced:
- T<id>: <expected> vs <actual> — <decision>
- ...
EOF
)"
```

---

## Task 2: Final gates + push + FF-merge + roadmap

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Pre-push gate sanity**

Each exit 0 (run sequentially — prisma migrate status shares DB connection, client build is heavy):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: 1361 passing, 0 vulnerabilities, schema up to date, client build clean. (Note: `prisma migrate status` can transiently fail on DB connection blip; retry once before declaring BLOCKED.)

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/notes-mutations-tests
```

DO NOT use `--no-verify`.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/notes-mutations-tests && git push origin main
```

- [ ] **Step 4: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find the existing 6b row:

```markdown
| 6b | notes.controller mutations test foundation (M31 partial — createNote, updateNote, archiveNote, deleteNotePermanent, restoreNote, duplicateNote, togglePin + admin endpoints; ~20 tests) | queued | — | — |
```

Replace with:

```markdown
| 6b | notes.controller mutations test foundation (22 regression tests T121-T142 covering 7 mutations: createNote/updateNote/duplicateNote/archiveNote/restoreNote/deleteNotePermanent/togglePin; locks in conditional re-embed, link-reset, auto-unpin, archived-pin rejection, and cancel-before-delete invariants; requestId envelope assertion on every error path) | ✅ shipped | [`2026-06-30-sprint-6b-notes-mutations-tests-design.md`](../specs/2026-06-30-sprint-6b-notes-mutations-tests-design.md) | 2026-06-30 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 6b (notes mutations test foundation) shipped"
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

- ✅ T121-T123 createNote → Task 1 Step 2 (file content from spec)
- ✅ T124-T129 updateNote (incl. content-re-embed T126, link-detach T128 fold-ins) → Task 1 Step 2
- ✅ T130-T132 duplicateNote → Task 1 Step 2
- ✅ T133-T134 archiveNote → Task 1 Step 2
- ✅ T135-T136 restoreNote → Task 1 Step 2
- ✅ T137-T138 deleteNotePermanent → Task 1 Step 2
- ✅ T139-T142 togglePin (incl. true→false fold-in T142) → Task 1 Step 2
- ✅ requestId on all error-path tests → spec mandates and plan inherits
- ✅ Mock surface includes interviewSession/designSession/teachingSession (BA fold-in) → spec's Mock pattern is verbatim
- ✅ Roadmap update → Task 2 Step 4
- ✅ Divergence-logging in commit message → Task 1 Step 6
- ✅ Baseline pre-flight assertion (1339 ± 0) → Task 0 Step 2

### Placeholder scan

No "TBD" / "implement later" / "fill in details". Plan steps are mechanical (write the test file from the spec's verbatim code blocks → run → commit).

### Type consistency

- Test IDs T121-T142 contiguous with prior T1-T120 (last shipped: T115-T120 in Sprint 6a).
- `mockReqRes` helper signature stable.
- `req.requestId = "req_test_6b"` value used identically across all error-path assertions.

### Adversarial check

- **Mock-bleed regression** — `beforeEach` does `mockReset()` per mock + re-establishes `teamMembership.findMany([])` (lesson from Sprint 6a code review).
- **`res.req` wire-up forgotten** — every error test asserts `error.requestId === "req_test_6b"`; missing wire-up makes ALL of them fail with a clear signal.
- **NDJSON / streaming paths** — not in `notes.controller.js`; only `notesAiTemplate.controller.js` has them. Out of scope explicitly.
- **Production divergences** — Task 1 Step 3 documents the decision tree. Default is "STOP and escalate" if a real bug is suspected, since "no production changes" is the spec's principle.

---

## Done criteria

- Pre-flight baseline 1339 confirmed.
- 22 new tests pass; full suite at **1361**.
- `npm run lint` (server + client) + audits exit 0.
- `prisma migrate status` up to date.
- Client `npm run build` clean.
- Feature branch FF-merged to main; both pushed to origin.
- Roadmap row updated: 6b ✅ shipped 2026-06-30.
- Any divergences captured in the Task 1 commit message body OR (if too many for the message) a divergences row in the roadmap, with `T<id>: <expected> vs <actual> — <decision>` format.

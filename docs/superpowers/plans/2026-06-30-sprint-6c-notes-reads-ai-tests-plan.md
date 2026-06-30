# Sprint 6c — Notes Reads + AI Features Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 25 regression tests (T143-T167) across 3 new files — `notes.reads.test.js`, `notes.ai.test.js`, `notes.stream.test.js` — closing M31 completely. Locks in mixed-authz on `searchLinkableEntities`, graceful LLM fallback on `getRelatedForNote`, persist invariants on `generateNoteSummary`, quality-gate boundaries on `generateNoteFlashcards` + `suggestNoteTags`, and the full streaming success-path of `generateNoteFromTemplates`.

**Architecture:** Pure additive test work. 3 new files with non-uniform mock surfaces (reads / AI / streaming). No production code changes expected.

**Tech Stack:** Vitest 4.1.6 with hoisted Prisma + service mocks (Sprint 6b discipline). Streaming uses an async-generator stream simulator + write-capturing res mock.

**Spec:** [`docs/superpowers/specs/2026-06-30-sprint-6c-notes-reads-ai-tests-design.md`](../specs/2026-06-30-sprint-6c-notes-reads-ai-tests-design.md)

**Branch:** `feat/notes-reads-ai-tests` (already created; spec committed at `1e05a98`)

**Baseline test count:** 1361 (post Sprint 6b, commit `8665b60`). Capture exact in Task 0. Target after sprint: **1386** (+25).

**Review history (plan v2):** Full 4-role panel reviewed pre-implementation; all 4 verdicts returned with fold-ins (PO APPROVED_WITH_NOTES, BA/Security/Lead all CHANGES_REQUESTED). Folded into spec v2 (commit pending) and this plan v2:
- T143 `res.status` assertion inverted (Lead C1)
- T153 expanded to 4 sub-cases for full authz coverage (Security C2)
- T155 + T156 embedding mocks wired + team-scope passthrough asserted (BA + Lead + Security C1)
- T149 ordering + `where.userId` (PO + Security I1)
- T154/T157/T159/T163 explicit `where.userId` (Security I2)
- T161 anti-all-DEFINITION footgun documented (BA)
- T165 team-scope re-fetch via `problemId` (Security I3)
- T166 declaration reorder + `await Promise.resolve()` for deterministic disconnect timing (Lead I1)
- Pattern B `beforeEach` block added (Lead I2)
- Validator path fixed to `server/src/services/ai.validators.js` (BA)
- AI-payload divergence rule added (BA)
- T156 added to security-override list (PO)

---

## File map

**Create:**
- `server/test/controllers/notes.reads.test.js` — 10 tests T143-T152
- `server/test/controllers/notes.ai.test.js` — 12 tests T153-T164
- `server/test/controllers/notes.stream.test.js` — 3 tests T165-T167

**Modify (Task 4 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 6c shipped + Sprint 6 cluster complete.

**Unchanged (explicit):**
- `server/src/controllers/notes.controller.js`, `notesAiTemplate.controller.js` — read-only. No production changes expected.
- All other production code.
- All existing tests (`notes.controller.test.js`, `notes.delete-cancel.test.js`, `notesAiTemplate.test.js`, `notes.mutations.test.js`).

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm current state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `feat/notes-reads-ai-tests`, latest commit `1e05a98` (spec). Working tree clean (or has 4-role panel fold-ins if applied).

- [ ] **Step 2: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1361 passed`. If lower or higher, STOP and reconcile.

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

## Task 1: Write `notes.reads.test.js` (T143-T152, 10 tests)

**Files:**
- Create: `server/test/controllers/notes.reads.test.js`

### Steps

- [ ] **Step 1: Verify controller line refs**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '262,348p' server/src/controllers/notes.controller.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '940,998p' server/src/controllers/notes.controller.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '999,1098p' server/src/controllers/notes.controller.js
```

Verify: listNotes 262, getNote 332, listTags 940, listNotesByEntity 967, searchLinkableEntities 999.

- [ ] **Step 2: Create the test file**

Build from the spec's "Mock pattern A" + the 10 per-test code blocks (T143-T152) verbatim. Structure:

```js
// ── Imports + hoisted mocks (Pattern A from spec) ──
// ── Controller imports via `await import(...)` ──
// ── mockReqRes helper + beforeEach ──

describe("listNotes", () => {
  it("test 143: happy default", async () => { /* ... */ });
  it("test 144: filter shape", async () => { /* ... */ });
  it("test 145: cursor pagination", async () => { /* ... */ });
});

describe("getNote", () => {
  it("test 146: ownership 404", async () => { /* ... */ });
  it("test 147: happy", async () => { /* ... */ });
});

describe("listTags", () => {
  it("test 148: aggregation + excludes archived", async () => { /* ... */ });
  it("test 149: top-50 cap", async () => { /* ... */ });
});

describe("listNotesByEntity", () => {
  it("test 150: invalid type 400", async () => { /* ... */ });
  it("test 151: happy", async () => { /* ... */ });
});

describe("searchLinkableEntities", () => {
  it("test 152: invalid type 400", async () => { /* ... */ });
});
```

- [ ] **Step 3: Run the new tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/notes.reads.test.js
```

Expected: 10/10 pass.

**Decision tree on failure** (inherits the 6b plan's discipline + security override):
- T146, T150, T152 are authz/validation gates — divergences MUST escalate, NOT auto-update.
- Other failures: spec assumption wrong → update test + record divergence; controller bug → STOP and escalate; mock pattern off → fix mock.

- [ ] **Step 4: Full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1371 passed` (1361 + 10).

- [ ] **Step 5: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/test/controllers/notes.reads.test.js && git commit -m "Add 10 notes read-endpoint regression tests (T143-T152)"
```

Standing rules: NO `Co-Authored-By:` trailer; single-line subject.

---

## Task 2: Write `notes.ai.test.js` (T153-T164, 12 tests)

**Files:**
- Create: `server/test/controllers/notes.ai.test.js`

### Steps

- [ ] **Step 1: Verify controller line refs + AI prompts/validators**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '585,690p' server/src/controllers/notes.controller.js   # getRelatedForNote
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '695,779p' server/src/controllers/notes.controller.js   # generateNoteSummary
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '789,855p' server/src/controllers/notes.controller.js   # generateNoteFlashcards
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '859,930p' server/src/controllers/notes.controller.js   # suggestNoteTags
```

Confirm valid payloads to use in T155/T156/T158/T161/T162 happy and validator-reject cases — read the validator file (correct path is `server/src/services/ai.validators.js`, BA fold-in: the v1 plan said `server/src/ai/validators.js` which doesn't exist):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -nE "validateNoteSummary|validateNoteFlashcards|validateNoteAutoTag|validateNoteRelated" server/src/services/ai.validators.js
```

**T161 anti-laziness footgun** (BA fold-in): the flashcards validator rejects an "all same type" drafts array as anti-laziness. `VALID_DRAFTS_PAYLOAD` for T161 MUST use a mix of `type` values (e.g., 3 `CONCEPT` + 2 `DEFINITION` + 1 `CONTRAST`), NOT 5 `DEFINITION` entries.

**AI-payload divergence rule** (BA fold-in): if a test fails because the validator's required shape has shifted (e.g., a new required field, or a different `type` enum), update the test payload + record the divergence. If a test fails because the controller's BRANCH behavior changed (e.g., happy path now persists a fallback summary, or fallback branch now 500s), STOP and escalate — that's a real bug, not a validator-shape drift.

- [ ] **Step 2: Create the test file**

Build from the spec's "Mock pattern B" + the 12 per-test code blocks (T153-T164). Structure:

```js
// ── Imports + hoisted mocks (Pattern B from spec) ──
// ── Controller imports ──
// ── mockReqRes helper + beforeEach ──
// ── Constants: VALID_RELATED_PAYLOAD, INVALID_RELATED_PAYLOAD, VALID_SUMMARY_PAYLOAD, VALID_DRAFTS_PAYLOAD, INVALID_DRAFTS_PAYLOAD, LONG_NOTE_CONTENT, etc. ──

describe("searchLinkableEntities (team-scope authz)", () => {
  it("test 153: PROBLEM team-scoped", async () => { /* ... */ });
});

describe("getRelatedForNote", () => {
  it("test 154: ownership 404", async () => { /* ... */ });
  it("test 155: LLM-rank happy", async () => { /* ... */ });
  it("test 156: graceful fallback on LLM reject", async () => { /* ... */ });
});

describe("generateNoteSummary (extends existing AI-behavior tests)", () => {
  it("test 157: ownership 404", async () => { /* ... */ });
  it("test 158: persists summary + summaryGeneratedAt", async () => { /* ... */ });
});

describe("generateNoteFlashcards", () => {
  it("test 159: ownership 404", async () => { /* ... */ });
  it("test 160: quality-gate 400 (chars < 200)", async () => { /* ... */ });
  it("test 161: happy + fallback=false", async () => { /* ... */ });
  it("test 162: validator-reject fallback", async () => { /* ... */ });
});

describe("suggestNoteTags", () => {
  it("test 163: ownership 404", async () => { /* ... */ });
  it("test 164: quality-gate 400 (chars < 60)", async () => { /* ... */ });
});
```

For each test, use the assertion patterns from the spec's "Per-test design" section. Helper constants like `LONG_NOTE_CONTENT` (must clear the quality gate for the AI surface under test) and `VALID_*_PAYLOAD` (must satisfy the respective validator) should be defined at the top of the file. Cross-reference `server/src/ai/validators.js` for the exact shapes.

- [ ] **Step 3: Run the new tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/notes.ai.test.js
```

Expected: 12/12 pass.

**Security-divergence escalation (PO override)** — T153 (team-scoped authz), T154/T157/T159/T163 (ownership 404), T156 (fallback resilience) MUST escalate any divergence, not auto-update.

- [ ] **Step 4: Full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1383 passed` (1371 + 12).

- [ ] **Step 5: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/test/controllers/notes.ai.test.js && git commit -m "Add 12 notes AI-feature regression tests (T153-T164)"
```

---

## Task 3: Write `notes.stream.test.js` (T165-T167, 3 tests)

**Files:**
- Create: `server/test/controllers/notes.stream.test.js`

### Steps

- [ ] **Step 1: Verify streaming controller line refs**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '175,295p' server/src/controllers/notesAiTemplate.controller.js
```

Confirm: stream start ~L197, chunk loop L217-231, client-disconnect bail L240-243, too-short check L245-252, persist L259-285, scheduleNoteEmbedding L287, final done line L289.

- [ ] **Step 2: Create the test file**

Build from the spec's "Mock pattern C" + the 3 per-test code blocks (T165-T167). Key bits to copy verbatim:

- `prismaMock` (note.findMany + note.create + problem.findFirst + noteFolder.findFirst + teamMembership.findMany)
- `aiMock` with `aiStream` hoisted
- `notesEmbeddingMock` with `scheduleNoteEmbedding` hoisted
- env mock with `AI_ENABLED: true` and `AI_MODEL_PRIMARY: "gpt-4o"`
- `makeStreamingReqRes` helper with `write` capture + `emitClose`
- `chunkStream` async-generator helper
- `beforeEach` with mockReset on all of the above

Tests:
```js
describe("generateNoteFromTemplates — streaming success path", () => {
  it("test 165: streams chunks → persists → emits done", async () => { /* ... */ });
  it("test 166: client-disconnect bails persist", async () => { /* ... */ });
  it("test 167: too-short output → EMPTY_OUTPUT line + no persist", async () => { /* ... */ });
});
```

T165: assert chunk lines + create called once + scheduleNoteEmbedding called + final `{done, noteId, title}` line + `res.end()` called.

T166: yield 1 chunk → `emitClose()` → yield 2nd chunk; assert NO create, NO scheduleNoteEmbedding, `res.end()` still called.

T167: yield `"hi"` (< MIN_OUTPUT_CHARS=60); assert `{code: "EMPTY_OUTPUT", error: /empty or too-short/i}` line, NO create, NO scheduleNoteEmbedding, `res.end()` called.

- [ ] **Step 3: Run the new tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/notes.stream.test.js
```

Expected: 3/3 pass.

**Note**: streaming tests can be flaky if the async generator + close handler ordering isn't exactly right. If T166 (disconnect) fails on first run, verify the close handler is fired BEFORE the next `yield` resolves — the controller's `for await` loop checks `clientGone` at the top of each iteration.

- [ ] **Step 4: Full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1386 passed` (1383 + 3).

- [ ] **Step 5: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/test/controllers/notes.stream.test.js && git commit -m "Add 3 notes streaming success-path regression tests (T165-T167)"
```

---

## Task 4: Final gates + push + FF-merge + roadmap

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Pre-push gate sanity** (sequential — share DB connection / heavy client build):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: 1386 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/notes-reads-ai-tests
```

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/notes-reads-ai-tests && git push origin main
```

- [ ] **Step 4: Update roadmap**

Find the existing 6c row:

```markdown
| 6c | notes.controller reads + AI features test foundation (M31 remaining — listNotes, getNote, getRelatedForNote, generateNoteSummary extend, generateNoteFlashcards, suggestNoteTags extend, listTags, listNotesByEntity, searchLinkableEntities, generateNoteFromTemplates streaming success path; ~25 tests) | queued | — | — |
```

Replace with:

```markdown
| 6c | notes.controller reads + AI features test foundation (25 regression tests T143-T167 across 3 files: notes.reads/ai/stream; closes M31 completely — listNotes/getNote/listTags/listNotesByEntity/searchLinkableEntities + getRelatedForNote LLM-fallback + generateNoteSummary persist + generateNoteFlashcards full surface + suggestNoteTags gates + generateNoteFromTemplates streaming happy/disconnect/too-short; 4-role panel reviewed pre-implementation; Sprint 6 cluster complete) | ✅ shipped | [`2026-06-30-sprint-6c-notes-reads-ai-tests-design.md`](../specs/2026-06-30-sprint-6c-notes-reads-ai-tests-design.md) | 2026-06-30 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 6c shipped; Sprint 6 cluster complete"
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

- ✅ T143-T152 reads → Task 1
- ✅ T153-T164 AI features → Task 2
- ✅ T165-T167 streaming → Task 3
- ✅ Mixed-authz searchLinkableEntities (T153) — Sprint 6b security-pattern guard
- ✅ Graceful LLM fallback (T156) — load-bearing resilience invariant
- ✅ Persist invariants (T158) — drift-with-DB guard
- ✅ Streaming client-disconnect (T166) — resource-leak guard
- ✅ Roadmap update + Sprint 6 cluster mark-complete → Task 4

### Placeholder scan

No "TBD" / "implement later" / "fill in details". Plan is mechanical (write file from verbatim code blocks → run → commit).

### Type consistency

- Test IDs T143-T167 contiguous with prior T1-T142 (last shipped: 6b's T121-T142).
- `mockReqRes` helper signature stable across files (params/query/userId).
- `req.requestId = "req_test_6c"` value used identically across error-path assertions.
- `prismaMock` shape differs intentionally per file — only the surfaces each test uses.

### Adversarial check

- **Streaming async-generator complexity** — T166 disconnect-mid-stream timing is the riskiest test. Plan flags this in Task 3 Step 3.
- **Validator coupling** — T155, T161 require payloads that pass the relevant validator. Plan asks the implementer to read `validators.js` for the exact shapes before writing happy-path tests. If validators drift, those tests fail loudly (good — surfaces the drift).
- **Existing tests in `notes.controller.test.js`** — T157/T158 extend the existing 5 generateNoteSummary tests. The existing file uses `_harness.js` + in-memory Map; new tests use hoisted mocks. No conflict (separate files, separate mocks).
- **Mock-bleed** — every file's `beforeEach` does explicit `mockReset()` per mock + re-establishes the single `teamMembership.findMany([...])` default. Inherits 6b's lesson.
- **`res.req` wire-up forgotten** — every error-path test asserts `error.requestId === "req_test_6c"`; missing the wire-up makes them all fail with a clear signal.

---

## Done criteria

- Pre-flight baseline 1361 confirmed.
- 25 new tests pass; full suite at **1386**.
- `npm run lint` (server + client) + audits exit 0.
- `prisma migrate status` up to date.
- Client `npm run build` clean.
- Feature branch FF-merged to main; both pushed to origin.
- Roadmap row 6c → ✅ shipped 2026-06-30, Sprint 6 cluster complete.
- Any divergences captured per Task 1/2/3 Step 3 with security-escalation override on T146/T150/T152/T153/T154/T156/T157/T159/T163/T165 (PO + Security fold-ins: T156 graceful fallback and T165 team-scope re-fetch are also security/reliability-critical — divergences MUST escalate, not auto-update).
- 4-role panel CHANGES_REQUESTED items (if any) folded in before Task 0.

# Sprint 6a — H6 NotesAiTemplate Envelope Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 9 envelope-bypass sites in `notesAiTemplate.controller.js` to use the canonical `error()` helper (adds `requestId` to each error response). Lock in the fix with 6 regression tests asserting `error.requestId` is present.

**Architecture:** Single production import + 9 identical-pattern conversions. 1 new test file with 6 tests (T115-T120) covering all 9 sites via sub-cases. Mock pattern reuses Sprint 5.x infrastructure with one critical addition: `res.req = req` wire-up so the `error()` helper can find `requestId`.

**Tech Stack:** Vitest with mocked Prisma + mocked aiStream + mocked notes.embedding. Existing controller-level patterns from Sprint 3.3 / Sprint 5.

**Spec:** [`docs/superpowers/specs/2026-06-29-h6-notes-ai-template-envelope-design.md`](../specs/2026-06-29-h6-notes-ai-template-envelope-design.md)

**Branch:** `feat/h6-notes-ai-template-envelope`

**Baseline test count:** 1333 (post Sprint 5c, commit `c85a108`). Capture exact in Task 0. Target after sprint: **1339** (+6).

---

## File map

**Modify:**
- `server/src/controllers/notesAiTemplate.controller.js` — add `import { error } from "../utils/response.js";` + convert 9 sites (lines 66, 80, 95, 110, 121, 136, 157, 182, 192) from raw `res.status(N).json({...})` to `error(res, message, N)`

**Create:**
- `server/test/controllers/notesAiTemplate.test.js` — 6 tests (T115-T120) covering all 9 envelope sites

**Modify (Task 2 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 6a shipped; queue 6b + 6c

**Unchanged (explicit):**
- The 3 NDJSON streaming-side `sendLine(res, { error, code })` paths at lines 240, 266, 280 — different protocol from envelope; out of scope.
- All other production code.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on `main`**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `main`, last commit `327f491` (Sprint 6a spec).

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/h6-notes-ai-template-envelope
```

- [ ] **Step 3: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1333 passed`. Record exact count.

- [ ] **Step 4: Pre-push gate sanity**

Each exit 0:
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

## Task 1: TDD — 6 RED tests + GREEN production fix (single commit)

This task follows TDD discipline: write the 6 tests first (they fail because the current envelope lacks `requestId`), then apply the production fix (envelope helper auto-adds `requestId`, tests turn GREEN). Single commit at the end since the production change + tests form one coherent contract.

**Files:**
- Create: `server/test/controllers/notesAiTemplate.test.js`
- Modify: `server/src/controllers/notesAiTemplate.controller.js`

### Steps

- [ ] **Step 1: Read the existing notesAiTemplate.controller.js**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '1,200p' server/src/controllers/notesAiTemplate.controller.js
```

Confirm:
- 9 envelope-bypass sites at the exact lines named in the audit (66, 80, 95, 110, 121, 136, 157, 182, 192)
- Each site uses pattern: `return res.status(N).json({ success: false, error: { message: "..." }});`
- Current imports (line 22-26): `prisma`, `aiStream`, `AIError`, `AI_MODEL_PRIMARY`, `noteFromTemplatesPrompt`, `scheduleNoteEmbedding`

- [ ] **Step 2: Create the test file (RED state — tests fail)**

Create `server/test/controllers/notesAiTemplate.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  note: { findMany: vi.fn(), create: vi.fn() },
  problem: { findFirst: vi.fn() },
  solution: { findFirst: vi.fn() },
  noteFolder: { findFirst: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/services/ai.service.js", () => ({
  aiStream: vi.fn(),
  AIError: class AIError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true, AI_MODEL_PRIMARY: "gpt-4o" };
});

vi.mock("../../src/services/notes.embedding.js", () => ({
  scheduleNoteEmbedding: vi.fn(),
}));

const { generateNoteFromTemplates } = await import(
  "../../src/controllers/notesAiTemplate.controller.js"
);

function mockReqRes({ body = {}, userId = "user_1" } = {}) {
  const req = {
    body,
    user: { id: userId },
    requestId: "req_test_h6",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  // CRITICAL: error() helper reads requestId from res.req?.requestId — wire the back-reference.
  res.req = req;
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: teamMembership returns empty (no team access)
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
});

describe("generateNoteFromTemplates — H6 envelope fix regression guards", () => {
  it("test 115: rejects invalid templateNoteIds with 400 + envelope + requestId", async () => {
    const { req, res } = mockReqRes({ body: { templateNoteIds: [] } });
    await generateNoteFromTemplates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    expect(jsonArg.error.message).toMatch(/templateNoteIds must be 1.{1,3}3/);
    expect(jsonArg.error.requestId).toBe("req_test_h6");
  });

  it("test 116: 404 when templates not found (user doesn't own one)", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_owned", title: "T1", contentMarkdown: "..." },
      // Only 1 of the 2 requested — user doesn't own note_other_user
    ]);

    const { req, res } = mockReqRes({
      body: { templateNoteIds: ["note_owned", "note_other_user"] },
    });
    await generateNoteFromTemplates(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.error.message).toMatch(/templates not found/i);
    expect(jsonArg.error.requestId).toBe("req_test_h6");
  });

  it("test 117: rejects non-string topicFocus with 400 + envelope", async () => {
    prismaMock.note.findMany.mockResolvedValueOnce([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);

    const { req, res } = mockReqRes({
      body: { templateNoteIds: ["note_1"], topicFocus: 123 },
    });
    await generateNoteFromTemplates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.message).toMatch(/topicFocus.*string/i);
    expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
  });

  it("test 118: rejects invalid problemId (type 400 + accessibility 404)", async () => {
    prismaMock.note.findMany.mockResolvedValue([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);

    // Sub-case A: problemId is not a string (line 110 in the source)
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], problemId: 42 },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/Invalid problemId/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }

    // Sub-case B: problemId is a string but not accessible (line 121 in source)
    prismaMock.problem.findFirst.mockResolvedValueOnce(null);
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], problemId: "prob_other_team" },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/Problem not found/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }
  });

  it("test 119: includeSubmission rejects when no problem OR no submission exists", async () => {
    prismaMock.note.findMany.mockResolvedValue([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);

    // Sub-case A: includeSubmission without problemId (line 136)
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], includeSubmission: true },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/Pick a Problem first/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }

    // Sub-case B: includeSubmission with problem but no submission (line 157)
    prismaMock.problem.findFirst.mockResolvedValueOnce({
      id: "prob_1", title: "Two Sum", difficulty: "EASY", description: "...",
    });
    prismaMock.solution.findFirst.mockResolvedValueOnce(null);
    {
      const { req, res } = mockReqRes({
        body: {
          templateNoteIds: ["note_1"],
          problemId: "prob_1",
          includeSubmission: true,
        },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/haven't submitted/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }
  });

  it("test 120: rejects invalid targetFolderId (type 400 + accessibility 404)", async () => {
    prismaMock.note.findMany.mockResolvedValue([
      { id: "note_1", title: "T", contentMarkdown: "..." },
    ]);

    // Sub-case A: targetFolderId is not a string (line 182)
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], targetFolderId: 99 },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/Invalid targetFolderId/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }

    // Sub-case B: targetFolderId is a string but not owned (line 192)
    prismaMock.noteFolder.findFirst.mockResolvedValueOnce(null);
    {
      const { req, res } = mockReqRes({
        body: { templateNoteIds: ["note_1"], targetFolderId: "folder_other_user" },
      });
      await generateNoteFromTemplates(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error.message).toMatch(/folder not found/i);
      expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
    }
  });
});
```

- [ ] **Step 3: Verify the 6 tests are RED**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/notesAiTemplate.test.js
```
Expected: ALL 6 tests FAIL on the `expect(jsonArg.error.requestId).toBe("req_test_h6")` assertion. The current production code's raw `res.status().json()` doesn't include `requestId` in the envelope.

The message/status assertions should still pass (those are unchanged); only the `requestId` assertion should fail.

If any test passes unexpectedly: there's a mock setup issue. Investigate before proceeding.

- [ ] **Step 4: Apply the production fix (turn tests GREEN)**

Edit `server/src/controllers/notesAiTemplate.controller.js`:

**(a) Add the `error` import.** After the existing imports at lines 22-26, add:

```js
import { error } from "../utils/response.js";
```

**(b) Convert all 9 envelope-bypass sites.** Each conversion is identical pattern:

```js
// BEFORE (line 66 — templateNoteIds validation)
return res.status(400).json({
  success: false,
  error: {
    message: `templateNoteIds must be 1–${MAX_TEMPLATES} note IDs`,
  },
});

// AFTER
return error(
  res,
  `templateNoteIds must be 1–${MAX_TEMPLATES} note IDs`,
  400,
);
```

Apply the same shape to ALL 9 sites:

| Original line | Status | Message preserved verbatim |
| --- | --- | --- |
| 66 | 400 | `` `templateNoteIds must be 1–${MAX_TEMPLATES} note IDs` `` |
| 80 | 404 | `"One or more templates not found"` |
| 95 | 400 | `"topicFocus must be a string"` |
| 110 | 400 | `"Invalid problemId"` |
| 121 | 404 | `"Problem not found or not accessible"` |
| 136 | 400 | `"Pick a Problem first — your submission is tied to a problem."` |
| 157 | 400 | `"You haven't submitted a solution for this problem yet — uncheck \\"Include my submission\\" to generate without it, or submit a solution first."` (preserve the embedded quotes exactly) |
| 182 | 400 | `"Invalid targetFolderId"` |
| 192 | 404 | `"Target folder not found"` |

Use Edit tool calls — one per site — with enough surrounding context to make each `old_string` unique. Do NOT change:
- The conditional logic that leads to each return
- The control flow (still `return ...`)
- Message text (preserve verbatim)
- Status codes (preserve verbatim per the table above)

Do NOT touch:
- The NDJSON `sendLine(res, { error, code })` calls at lines 240, 266, 280 (different protocol)
- The success path (note creation, persistence, terminator events)

- [ ] **Step 5: Verify the 6 tests are GREEN**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/notesAiTemplate.test.js
```
Expected: ALL 6 tests PASS. The `error()` helper auto-fills `requestId` from `res.req?.requestId`, satisfying the regression assertions.

- [ ] **Step 6: Verify the 9 sites are all converted**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "res\.status(.*)\.json" server/src/controllers/notesAiTemplate.controller.js
```
Expected: ZERO matches. All 9 sites should now use `error(res, ...)` instead.

If there are remaining matches, identify the line and convert it.

- [ ] **Step 7: Full server suite (no regression)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1339 passed (1333 + 6). No collateral breakage.

- [ ] **Step 8: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 9: Commit Task 1**

```bash
git add server/src/controllers/notesAiTemplate.controller.js \
        server/test/controllers/notesAiTemplate.test.js
git commit -m "Fix H6 notesAiTemplate envelope bypass + 6 regression tests"
```

---

## Task 2: Final gates + push + FF-merge + roadmap

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Pre-push gate sanity**

Each exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: 1339 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/h6-notes-ai-template-envelope
```

DO NOT use `--no-verify`.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/h6-notes-ai-template-envelope && git push origin main
```

- [ ] **Step 4: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find the existing Sprint 6 queue row:

```markdown
| 6 | Notes surface | queued | — | — |
```

Replace with three sub-rows (6a shipped, 6b + 6c queued):

```markdown
| 6a | H6 notesAiTemplate envelope fix (converted 9 raw res.status().json() sites to error() helper; adds requestId to error responses; +6 regression tests T115-T120) | ✅ shipped | [`2026-06-29-h6-notes-ai-template-envelope-design.md`](../specs/2026-06-29-h6-notes-ai-template-envelope-design.md) | 2026-06-29 |
| 6b | notes.controller mutations test foundation (M31 partial — createNote, updateNote, archiveNote, deleteNotePermanent, restoreNote, duplicateNote, togglePin + admin endpoints; ~20 tests) | queued | — | — |
| 6c | notes.controller reads + AI features test foundation (M31 remaining — listNotes, getNote, getRelatedForNote, generateNoteSummary extend, generateNoteFlashcards, suggestNoteTags extend, listTags, listNotesByEntity, searchLinkableEntities, generateNoteFromTemplates streaming success path; ~25 tests) | queued | — | — |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 6a (H6 notesAiTemplate envelope fix) shipped; queue 6b + 6c"
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

- ✅ **H6 envelope fix** (9 site conversions + import) → Task 1 Step 4 with explicit table
- ✅ **T115-T120 regression tests** (6 tests covering 9 sites) → Task 1 Step 2
- ✅ **`res.req = req` wire-up** in test fixture → Task 1 Step 2 mockReqRes helper
- ✅ **NDJSON streaming paths unchanged** → explicitly carved in Task 1 Step 4 "Do NOT touch"
- ✅ **`requestId` regression guard** → assertion present in every test
- ✅ **Roadmap update** with 6b + 6c queue rows → Task 2 Step 4
- ✅ **TDD discipline** (tests RED first, then production fix) → Task 1 Steps 2-5

### Placeholder scan

No "TBD" / "implement later" / "fill in details". The production change table at Task 1 Step 4 lists all 9 site messages verbatim with their status codes. Each test has full code blocks with concrete assertions.

### Type consistency

- Test IDs T115-T120 contiguous with prior T1-T114.
- `mockReqRes` helper signature stable across all 6 tests.
- The `req.requestId = "req_test_h6"` value used identically across all 6 assertions.
- Status codes consistent between spec, plan table, and tests.

### Adversarial check on the plan itself

- **Mock missing `res.req` wire-up**: the plan emphasizes this in the fixture comment AND repeats the assertion `error.requestId === "req_test_h6"` as the canonical regression guard. If a reader forgets the wire-up, all 6 tests fail with a clear signal.
- **Subtle escape characters in message at line 157**: the embedded quotes `\"Include my submission\"` are preserved in the conversion table — the implementer must keep the JS-source escape exactly. Plan flags this.
- **NDJSON path confusion**: explicitly listed in "Do NOT touch" with line numbers (240, 266, 280) to prevent accidental conversion.

---

## Done criteria

- All 6 new tests pass; full suite at 1339.
- 0 `res.status(.).json` matches in `notesAiTemplate.controller.js` (verified by grep in Task 1 Step 6).
- `npm run lint` (server + client) + audits exit 0.
- `prisma migrate status` up to date.
- Feature branch FF-merged to main; both pushed to origin.
- Roadmap shows Sprint 6a shipped; 6b + 6c queued.

# Sprint 6b — Notes Mutations Test Foundation — Design Spec

**Date:** 2026-06-30
**Sprint:** 6b (second slice of decomposed Sprint 6 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** M31 partial (`notes.controller.js` mutations portion)
**Branch:** `feat/notes-mutations-tests`
**Layers on:** main, post Sprint 6a (`7c302df`)
**Feature flag:** None — pure additive test work
**Review history (spec v3, plan v2):** Full 4-role panel reviewed the plan pre-implementation per the standing rule (`feedback_multi_agent_review_before_code.md`):
- Project Owner — APPROVED WITH NOTES (security-divergence escalation tightened in plan)
- Business Analyst — CHANGES REQUESTED → folded in (mock binding via `vi.hoisted` + `notesEmbeddingMock.X` refs; `toHaveBeenCalledTimes(1)` for embed assertions)
- Security Manager — CHANGES REQUESTED → folded in (7 `where.userId` assertions added to ownership tests; userId-of-create payload asserted on createNote/duplicateNote happy paths)
- Lead Engineer — CHANGES REQUESTED → folded in (mock binding fix corroborates BA's; createNote `include` clause note corrected — createNote has no include, duplicateNote does)

---

## Problem

Sprint 1 audit, M31 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md`):

> `notes.controller.js` — 16 exports, zero direct controller-level tests on the mutation paths. The 6 existing tests in `notes.controller.test.js` cover AI features only (`generateNoteSummary`, `suggestNoteTags`). The 1 test in `notes.delete-cancel.test.js` covers the cancel-wiring in `deleteNotePermanent` but not the surrounding ownership/happy-path behavior.

### Zero-trust verification

`grep -nE "^export (const|async function|function)" server/src/controllers/notes.controller.js` confirms 16 exports across 1122 lines. Of those, **7 are mutations** with no direct test coverage:

| # | Export | Line | Subtle behavior worth a regression guard |
| --- | --- | --- | --- |
| 1 | `createNote` | 205 | Title required (400); optional entity link via `resolveEntitySnapshot`; schedules embed; returns 201 |
| 2 | `updateNote` | 353 | Ownership 404; conditional field merge; folder ownership check; **only re-embeds if title or content changed** (cheap-call optimization at lines 426-431); **link-detach branch** at lines 378-381 clears all three linkedEntity* fields when `linkedEntityType: null` is sent |
| 3 | `duplicateNote` | 459 | `"Copy of …"` prefix; **resets pinned/archivedAt/linkedEntity*** (the "copy starts fresh" semantic at lines 449-453); returns 201 |
| 4 | `archiveNote` | 502 | `updateMany` with `archivedAt: null` idempotency filter → count=0 ⇒ 404; **auto-unpins on archive** (line 510) |
| 5 | `deleteNotePermanent` | 530 | Cancel-then-delete order matters (cancel pre-empts the 5s debounced embed) |
| 6 | `restoreNote` | 552 | `updateMany` with `archivedAt: { not: null }` filter → count=0 ⇒ 404 |
| 7 | `togglePin` | 1100 | Ownership 404; **rejects archived notes with 400** (line 1108-1110); flips boolean both directions (false→true and true→false) |

The boldfaced behaviors are the highest-signal regression guards — silent breakages that wouldn't show up in any existing test if a future refactor removed them.

`notes.controller.js` is the largest untested mutation surface in the codebase. Sprint 6a closed H6 (envelope bypass for `generateNoteFromTemplates`). Sprint 6b builds the regression floor for the mutations. Sprint 6c (queued) extends to reads + AI features.

---

## Principle

**Pure additive test work.** Mirror the proven Sprint 5a/5b pattern: per endpoint, lock in (a) the ownership-404 gate, (b) the happy path, (c) the endpoint-specific subtle behavior that would silently break under refactor.

The bug-prone-first strategy yields signal-rich tests; exhaustive validation-branch coverage is deferred (mostly already enforced by `trimTitle` / `clampContent` / `normalizeTags` inside the controller — see "Zod absence note" below).

---

## Scope

### In scope

22 new tests (T121-T142) in a single new file:

| Endpoint | Tests | Coverage |
| --- | --- | --- |
| `createNote` | T121-T123 (3) | happy · empty-title 400 · invalid entity link 400 |
| `updateNote` | T124-T129 (6) | ownership 404 · **title-change re-embed** · **content-change re-embed** · **tags-only does NOT re-embed** · **link-detach** (`linkedEntityType: null` clears all three fields) · folder-not-owned 404 |
| `duplicateNote` | T130-T132 (3) | ownership 404 · happy (`"Copy of …"` + content + tags + folder) · **link-reset regression** (source linkedEntity* cleared on copy) |
| `archiveNote` | T133-T134 (2) | ownership 404 · **auto-unpin regression** (pinned note → `pinned: false` in update payload) |
| `restoreNote` | T135-T136 (2) | ownership 404 (already-active) · happy (archivedAt cleared) |
| `deleteNotePermanent` | T137-T138 (2) | ownership 404 · happy round-trip (cancel + delete) — complements existing T26 cancel-wiring |
| `togglePin` | T139-T142 (4) | ownership 404 · **archived-pin rejection** (400) · happy false→true flip · happy true→false flip |

Total: **22 tests** (1339 → 1361).

**`requestId` envelope assertion**: EVERY error-path test (T122, T123, T124, T127 in update, T129 in update, T130 in dup, T133 in archive, T135 in restore, T137 in delete, T139 in pin, T140 in pin — and others) MUST assert `error.requestId === "req_test_6b"`. Sprint 6a's H6 fix made `requestId` automatic via the `error()` helper; this test foundation locks that contract for the notes mutation surface as a regression guard.

### Out of scope (carved)

- **All read endpoints** in `notes.controller.js` (`listNotes`, `getNote`, `getRelatedForNote`, `listTags`, `listNotesByEntity`, `searchLinkableEntities`) → Sprint 6c
- **All AI features** in `notes.controller.js` (`generateNoteSummary` extend, `generateNoteFlashcards`, `suggestNoteTags` extend) + the streaming success path of `generateNoteFromTemplates` → Sprint 6c
- **`notesFolders.controller.js`** (listFolders/createFolder/updateFolder/deleteFolder, ~50 lines) → **deferred indefinitely**. Audit M31 scope was `notes.controller.js` only. Folders is a separate controller with simpler CRUD (no AI, no embeddings, no entity-link semantics). Re-evaluate only if a future audit re-pass surfaces a finding; the ~80-line spec/plan/test cycle does not earn its cycles preemptively.
- **Happy-path entity-link resolution** (linking a new note to a real Problem / InterviewSession / DesignSession / TeachingSession) → Sprint 6c. T123 exercises only the bogus-type short-circuit (`resolveEntitySnapshot` returns the error before any prisma call). Mocks for `interviewSession`/`designSession`/`teachingSession` are provided as defense-in-depth so future tests don't crash; happy-path link tests are 6c material.
- **`normalizeTags` 6-guard logic** at lines 77-98 (pure util) → Sprint 6c if needed. No existing unit tests; out of M31 scope.
- **Production code changes** — none. If a test fails on production code that violates the spec, document the divergence and decide per case whether to fix or accept (Sprint 5a/5b surfaced 15 such divergences this way).

---

## Architecture

```
server/test/controllers/
└── notes.mutations.test.js   [NEW — 22 tests, T121-T142, 7 describe blocks]
```

**One consolidated test file** — all 7 mutations share the same mock surface (`prismaMock.note.{findFirst,create,update,updateMany,delete}` + `prismaMock.noteFolder.findFirst` + `scheduleNoteEmbedding` + `cancelNoteEmbedding`). Splitting into 4-5 files would duplicate ~40 lines of mock boilerplate without gaining test isolation. Sprint 6a's `notesAiTemplate.test.js` set this precedent and was approved by the code-quality reviewer.

**Unchanged:**
- `notes.controller.js` and all other production code
- Existing test files (`notes.controller.test.js`, `notes.delete-cancel.test.js`, `notesAiTemplate.test.js`)

---

## Zod absence note (BA review fold-in)

The notes routes (`server/src/routes/notes.routes.js`) intentionally have **no Zod schema**. Verified via inspection — no `validate()` middleware in the route chain, no `notes.schema.js` in `server/src/schemas/`. Input shaping is done inline in the controller via `trimTitle` (lines 63-66), `clampContent` (68-71), `normalizeTags` (77-98), and `resolveEntitySnapshot` (119-174).

**Implication for these tests**: Sprint 6b's tests call the controller directly via `await import(...)`, bypassing the route's middleware chain (auth, rate-limit). That's correct — the tests target the controller's own input handling, which IS the canonical validation layer for notes. CLAUDE.md's five-touchpoint rule (which assumes a Zod schema in `schemas/*.schema.js`) is silently absent across the entire notes surface — that's a **Sprint 6c follow-up flag**, not a Sprint 6b coverage gap.

---

## Mock pattern

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  note: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  noteFolder: { findFirst: vi.fn() },
  // Entity-link resolution surfaces — defense-in-depth.
  // T123 short-circuits before reaching these, but a future test that
  // exercises a happy-path link would otherwise crash on undefined.findFirst.
  problem: { findFirst: vi.fn() },
  interviewSession: { findFirst: vi.fn() },
  designSession: { findFirst: vi.fn() },
  teachingSession: { findFirst: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// CRITICAL: hoist the embedding mock symbols so test assertions can reference
// them. Plain `vi.mock(factory)` creates the mock fns inside the module registry
// but doesn't expose them as bare identifiers — assertions like
// `expect(scheduleNoteEmbedding).toHaveBeenCalled()` would throw ReferenceError.
// Pattern matches existing `notes.delete-cancel.test.js`.
const notesEmbeddingMock = vi.hoisted(() => ({
  scheduleNoteEmbedding: vi.fn(),
  cancelNoteEmbedding: vi.fn(),
}));
vi.mock("../../src/services/notes.embedding.js", () => notesEmbeddingMock);

const {
  createNote,
  updateNote,
  duplicateNote,
  archiveNote,
  restoreNote,
  deleteNotePermanent,
  togglePin,
} = await import("../../src/controllers/notes.controller.js");

function mockReqRes({ body = {}, params = {}, userId = "user_1" } = {}) {
  const req = {
    body,
    params,
    user: { id: userId },
    requestId: "req_test_6b",
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  res.req = req;  // error() helper reads res.req?.requestId
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset implementations to prevent permanent-mock bleed across tests
  // (lesson from Sprint 6a code-quality review).
  prismaMock.note.findFirst.mockReset();
  prismaMock.note.create.mockReset();
  prismaMock.note.update.mockReset();
  prismaMock.note.updateMany.mockReset();
  prismaMock.note.delete.mockReset();
  prismaMock.noteFolder.findFirst.mockReset();
  prismaMock.problem.findFirst.mockReset();
  prismaMock.interviewSession.findFirst.mockReset();
  prismaMock.designSession.findFirst.mockReset();
  prismaMock.teachingSession.findFirst.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
  notesEmbeddingMock.scheduleNoteEmbedding.mockReset();
  notesEmbeddingMock.cancelNoteEmbedding.mockReset();
});
```

---

## Per-test design

### T121-T123 — `createNote`

**T121 happy**:
```js
prismaMock.note.create.mockResolvedValueOnce({
  id: "note_new",
  userId: "user_1",
  title: "T",
  contentMarkdown: "",
  tags: [],
});
const { req, res } = mockReqRes({ body: { title: "T" } });
await createNote(req, res);
expect(res.status).toHaveBeenCalledWith(201);
expect(res.json.mock.calls[0][0].success).toBe(true);
// Authz: create payload carries the caller's userId — no anonymous-note path.
expect(prismaMock.note.create.mock.calls[0][0].data.userId).toBe("user_1");
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_new");
```

**T122 empty title 400**:
```js
const { req, res } = mockReqRes({ body: { title: "   " } });
await createNote(req, res);
expect(res.status).toHaveBeenCalledWith(400);
const json = res.json.mock.calls[0][0];
expect(json.error.message).toBe("Title is required");
expect(json.error.requestId).toBe("req_test_6b");
```

**T123 invalid entity link 400**:
```js
const { req, res } = mockReqRes({
  body: { title: "T", linkedEntityType: "BOGUS", linkedEntityId: "x" },
});
await createNote(req, res);
expect(res.status).toHaveBeenCalledWith(400);
const json = res.json.mock.calls[0][0];
expect(json.error.message).toBe("Invalid entity type");
expect(json.error.requestId).toBe("req_test_6b");
```

### T124-T129 — `updateNote`

**T124 ownership 404** (Security Manager fold-in: assert `where.userId` filter, not just the 404 response):
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" }, body: { title: "X" } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
const json = res.json.mock.calls[0][0];
expect(json.error.message).toBe("Note not found");
expect(json.error.requestId).toBe("req_test_6b");
// AUTHZ INVARIANT: ownership filter must be in the where clause.
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other",
  userId: "user_1",
});
```

**T125 title change re-embeds**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", title: "X" });
const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { title: "X" } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(200);
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_1");
```

**T126 contentMarkdown change re-embeds (BA fold-in — covers the `||` branch at L427-428)**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", contentMarkdown: "new body" });
const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { contentMarkdown: "new body" } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(200);
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_1");
```

**T127 tags-only does NOT re-embed (conditional re-embed negative arm)**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", tags: ["foo"] });
const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { tags: ["foo"] } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(200);
expect(notesEmbeddingMock.scheduleNoteEmbedding).not.toHaveBeenCalled();
```

**T128 link-detach regression (BA fold-in — covers L378-381)**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.note.update.mockResolvedValueOnce({
  id: "note_1", linkedEntityType: null, linkedEntityId: null, linkedEntityTitle: null,
});
const { req, res } = mockReqRes({
  params: { id: "note_1" },
  body: { linkedEntityType: null },  // detach
});
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(200);
const updateArg = prismaMock.note.update.mock.calls[0][0];
expect(updateArg.data.linkedEntityType).toBeNull();
expect(updateArg.data.linkedEntityId).toBeNull();
expect(updateArg.data.linkedEntityTitle).toBeNull();
// Detach is metadata-only → must NOT re-embed
expect(notesEmbeddingMock.scheduleNoteEmbedding).not.toHaveBeenCalled();
```

**T129 folder reassignment ownership 404** (Security Manager fold-in: assert `where.userId` on BOTH the note and folder ownership lookups):
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.noteFolder.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { folderId: "fold_other" } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
const json = res.json.mock.calls[0][0];
expect(json.error.message).toBe("Folder not found");
expect(json.error.requestId).toBe("req_test_6b");
// AUTHZ INVARIANT: note ownership filter
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_1",
  userId: "user_1",
});
// AUTHZ INVARIANT: folder ownership filter — preventing cross-user folder attachment
expect(prismaMock.noteFolder.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "fold_other",
  userId: "user_1",
});
```

### T130-T132 — `duplicateNote`

**T130 ownership 404** (Security Manager fold-in):
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await duplicateNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
// AUTHZ INVARIANT
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other",
  userId: "user_1",
});
```

**T131 happy**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  title: "Original",
  contentMarkdown: "body",
  tags: ["a", "b"],
  folderId: "fold_1",
});
prismaMock.note.create.mockResolvedValueOnce({
  id: "note_copy",
  title: "Copy of Original",
  contentMarkdown: "body",
  tags: ["a", "b"],
  folderId: "fold_1",
});
const { req, res } = mockReqRes({ params: { id: "note_src" } });
await duplicateNote(req, res);
expect(res.status).toHaveBeenCalledWith(201);
const createArg = prismaMock.note.create.mock.calls[0][0];
expect(createArg.data.title).toBe("Copy of Original");
expect(createArg.data.contentMarkdown).toBe("body");
expect(createArg.data.tags).toEqual(["a", "b"]);
expect(createArg.data.folderId).toBe("fold_1");
// Authz: copy belongs to the caller, not the source-note owner
expect(createArg.data.userId).toBe("user_1");
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_copy");
```

**T132 link-reset regression**:
The controller's `select` clause at lines 464-469 explicitly omits `linkedEntityType` / `linkedEntityId` / `linkedEntityTitle` / `pinned` / `archivedAt`. Even if the source note had a Problem link, the duplicate must start fresh.

```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  title: "Templated",
  contentMarkdown: "body",
  tags: [],
  folderId: null,
  linkedEntityType: "PROBLEM",  // present on source — must NOT leak to copy
  linkedEntityId: "prob_1",
});
prismaMock.note.create.mockResolvedValueOnce({ id: "note_copy", title: "Copy of Templated" });
const { req, res } = mockReqRes({ params: { id: "note_src" } });
await duplicateNote(req, res);
const createArg = prismaMock.note.create.mock.calls[0][0];
expect(createArg.data.linkedEntityType).toBeUndefined();
expect(createArg.data.linkedEntityId).toBeUndefined();
expect(createArg.data.linkedEntityTitle).toBeUndefined();
expect(createArg.data.pinned).toBeUndefined();
expect(createArg.data.archivedAt).toBeUndefined();
```

### T133-T134 — `archiveNote`

**T133 ownership 404** (Security Manager fold-in: assert `where.userId` even though `updateMany` returns count=0):
```js
prismaMock.note.updateMany.mockResolvedValueOnce({ count: 0 });
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await archiveNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
// AUTHZ INVARIANT: updateMany must filter by userId — the where clause is the
// only authz gate (no separate findFirst step).
expect(prismaMock.note.updateMany.mock.calls[0][0].where).toMatchObject({
  id: "note_other",
  userId: "user_1",
});
```

**T134 auto-unpin regression** (already asserts `where.userId` per Sprint 5b precedent):
```js
prismaMock.note.updateMany.mockResolvedValueOnce({ count: 1 });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await archiveNote(req, res);
expect(res.status).toHaveBeenCalledWith(200);
const arg = prismaMock.note.updateMany.mock.calls[0][0];
expect(arg.where).toMatchObject({ id: "note_1", userId: "user_1", archivedAt: null });
expect(arg.data.archivedAt).toBeInstanceOf(Date);
expect(arg.data.pinned).toBe(false);  // auto-unpin invariant
```

### T135-T136 — `restoreNote`

**T135 ownership 404 (already-active)** (Security Manager fold-in: assert `where.userId`):
```js
prismaMock.note.updateMany.mockResolvedValueOnce({ count: 0 });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await restoreNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
expect(prismaMock.note.updateMany.mock.calls[0][0].where).toMatchObject({
  id: "note_1",
  userId: "user_1",
  archivedAt: { not: null },
});
```

**T136 happy** (Security Manager fold-in: assert `where.userId`):
```js
prismaMock.note.updateMany.mockResolvedValueOnce({ count: 1 });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await restoreNote(req, res);
const arg = prismaMock.note.updateMany.mock.calls[0][0];
expect(arg.where).toMatchObject({
  id: "note_1",
  userId: "user_1",
  archivedAt: { not: null },
});
expect(arg.data.archivedAt).toBeNull();
expect(res.json.mock.calls[0][0].data.archived).toBe(false);
```

### T137-T138 — `deleteNotePermanent` (complements existing T26 cancel-wiring)

**T137 ownership 404** (Security Manager fold-in):
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await deleteNotePermanent(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(notesEmbeddingMock.cancelNoteEmbedding).not.toHaveBeenCalled();
expect(prismaMock.note.delete).not.toHaveBeenCalled();
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other",
  userId: "user_1",
});
```

**T138 happy round-trip**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.note.delete.mockResolvedValueOnce({ id: "note_1" });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await deleteNotePermanent(req, res);
expect(res.status).toHaveBeenCalledWith(200);
expect(res.json.mock.calls[0][0].data.deleted).toBe(true);
expect(notesEmbeddingMock.cancelNoteEmbedding).toHaveBeenCalledTimes(1);
expect(notesEmbeddingMock.cancelNoteEmbedding).toHaveBeenCalledWith("note_1");
expect(prismaMock.note.delete).toHaveBeenCalledWith({ where: { id: "note_1" } });
// Cancel BEFORE delete invariant (cancel pre-empts the debounced embed):
const cancelOrder = notesEmbeddingMock.cancelNoteEmbedding.mock.invocationCallOrder[0];
const deleteOrder = prismaMock.note.delete.mock.invocationCallOrder[0];
expect(cancelOrder).toBeLessThan(deleteOrder);
```

### T139-T142 — `togglePin`

**T139 ownership 404** (Security Manager fold-in):
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await togglePin(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other",
  userId: "user_1",
});
```

**T140 archived-pin rejection regression**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1",
  pinned: false,
  archivedAt: new Date(),
});
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await togglePin(req, res);
expect(res.status).toHaveBeenCalledWith(400);
const json = res.json.mock.calls[0][0];
expect(json.error.message).toBe("Restore the note before pinning it");
expect(json.error.requestId).toBe("req_test_6b");
expect(prismaMock.note.update).not.toHaveBeenCalled();
```

**T141 happy false → true**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1",
  pinned: false,
  archivedAt: null,
});
prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", pinned: true });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await togglePin(req, res);
expect(res.status).toHaveBeenCalledWith(200);
const updateArg = prismaMock.note.update.mock.calls[0][0];
expect(updateArg.where).toEqual({ id: "note_1" });
expect(updateArg.data).toEqual({ pinned: true });
```

**T142 happy true → false (BA fold-in — symmetric coverage)**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1",
  pinned: true,
  archivedAt: null,
});
prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", pinned: false });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await togglePin(req, res);
expect(res.status).toHaveBeenCalledWith(200);
const updateArg = prismaMock.note.update.mock.calls[0][0];
expect(updateArg.data).toEqual({ pinned: false });
```

---

## Test count target

- Baseline (post Sprint 6a): **1339**
- New tests in 6b: **+22**
- Target after 6b: **1361**

---

## Done criteria (tightened per BA fold-in)

- **Pre-flight baseline assertion**: `cd server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3` reports exactly `Tests 1339 passed` BEFORE any test changes
- All 22 new tests pass; full suite at **1361**
- `npm run lint` (server + client) + audits exit 0
- `prisma migrate status` returns "Database schema is up to date!"
- `npm run build` (client) completes without error
- Feature branch FF-merged to main; both pushed to origin
- **Divergences captured**: any test that fails on the first run because the controller's actual behavior differs from the spec's expectation must be recorded in the feature branch's commit message body OR a dedicated row in the roadmap file (see below), one line per divergence with `T<id>: <expected> vs <actual> — <decision: fix code | accept and update test | defer>`
- **Roadmap update**: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — locate the existing `| 6b | notes.controller mutations test foundation ... | queued | — | — |` row and replace its status with `✅ shipped`, spec link with the absolute path to `2026-06-30-sprint-6b-notes-mutations-tests-design.md`, ship date with `2026-06-30`

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — pure additive tests |
| Client impact | None |
| Test runtime impact | +22 mock-only tests, sub-200ms |
| Backward compatibility | None |
| Rollback | Revert the test file |
| Risk floor | Lowest of any sprint |

---

## Backward compatibility

Production code untouched. All existing tests continue passing. No callers, APIs, or schemas affected. The new test file is independent of existing notes test files (`notes.controller.test.js`, `notes.delete-cancel.test.js`, `notesAiTemplate.test.js`).

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — each test has full mock setup + concrete assertions |
| Internal consistency | 7 endpoints listed with exact line numbers + 22 tests with exact IDs T121-T142. Mock pattern + assertions uniform across tests. The boldfaced regression guards (T126 content re-embed, T127 tags negative arm, T128 link-detach, T132 link-reset, T134 auto-unpin, T140 archived-pin rejection) are the highest-signal coverage |
| Scope | Tight: mutations only. Reads + AI features → 6c. NotesFolders → deferred indefinitely with reason. Admin → verified absent. Happy-path entity-link → 6c (with mocks pre-stubbed defensively) |
| Ambiguity | Explicit calls: (a) consolidated single file vs multi-file decided in favor of single file with rationale; (b) `mockReset()` in beforeEach inherited from 6a code-review lesson; (c) cancel-before-delete invariant captured via `invocationCallOrder`; (d) Zod absence explicitly documented as a 6c follow-up surface, not a 6b coverage gap |
| Adversarial review | The 6 regression guards test behaviors a future refactor could silently remove. Every error-path test asserts `error.requestId === "req_test_6b"` — locks in 6a's envelope contract for the mutation surface. Ownership-404 gates ensure every mutation enforces userId filtering (multi-tenant invariant, even though notes are user-scoped). Cancel-before-delete ordering in T138 captures a load-bearing invariant the existing T26 doesn't quite assert |
| Risk floor | Effectively zero. Pure additive regression tests; no production code change unless a test surfaces a divergence |
| Review panel | Pre-implementation Project Owner + Business Analyst review run; both APPROVED WITH NOTES; all notes folded into this revision |

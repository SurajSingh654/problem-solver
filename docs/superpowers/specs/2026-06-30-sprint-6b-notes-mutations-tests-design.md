# Sprint 6b — Notes Mutations Test Foundation — Design Spec

**Date:** 2026-06-30
**Sprint:** 6b (second slice of decomposed Sprint 6 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** M31 partial (`notes.controller.js` mutations portion)
**Branch:** `feat/notes-mutations-tests`
**Layers on:** main, post Sprint 6a (`7c302df`)
**Feature flag:** None — pure additive test work

---

## Problem

Sprint 1 audit, M31 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md`):

> `notes.controller.js` — 16 exports, zero direct controller-level tests on the mutation paths. The 6 existing tests in `notes.controller.test.js` cover AI features only (`generateNoteSummary`, `suggestNoteTags`). The 1 test in `notes.delete-cancel.test.js` covers the cancel-wiring in `deleteNotePermanent` but not the surrounding ownership/happy-path behavior.

### Zero-trust verification

`grep -nE "^export (const|async function|function)" server/src/controllers/notes.controller.js` confirms 16 exports across 1122 lines. Of those, **7 are mutations** with no direct test coverage:

| # | Export | Line | Subtle behavior worth a regression guard |
| --- | --- | --- | --- |
| 1 | `createNote` | 205 | Title required (400); optional entity link via `resolveEntitySnapshot`; schedules embed; returns 201 |
| 2 | `updateNote` | 353 | Ownership 404; conditional field merge; folder ownership check; **only re-embeds if title or content changed** (cheap-call optimization at lines 426-431) |
| 3 | `duplicateNote` | 459 | `"Copy of …"` prefix; **resets pinned/archivedAt/linkedEntity*** (the "copy starts fresh" semantic at lines 449-453); returns 201 |
| 4 | `archiveNote` | 502 | `updateMany` with `archivedAt: null` idempotency filter → count=0 ⇒ 404; **auto-unpins on archive** (line 510) |
| 5 | `deleteNotePermanent` | 530 | Cancel-then-delete order matters (cancel pre-empts the 5s debounced embed) |
| 6 | `restoreNote` | 552 | `updateMany` with `archivedAt: { not: null }` filter → count=0 ⇒ 404 |
| 7 | `togglePin` | 1100 | Ownership 404; **rejects archived notes with 400** (line 1108-1110) |

The 4 boldfaced behaviors are the highest-signal regression guards — silent breakages that wouldn't show up in any existing test if a future refactor removed them.

`notes.controller.js` is the largest untested mutation surface in the codebase. Sprint 6a closed H6 (envelope bypass for `generateNoteFromTemplates`). Sprint 6b builds the regression floor for the mutations. Sprint 6c (queued) extends to reads + AI features.

---

## Principle

**Pure additive test work.** Mirror the proven Sprint 5a/5b pattern: per endpoint, lock in (a) the ownership-404 gate, (b) the happy path, (c) the endpoint-specific subtle behavior that would silently break under refactor.

The bug-prone-first strategy yields signal-rich tests; exhaustive validation-branch coverage is deferred (mostly already enforced by Zod at the route boundary).

---

## Scope

### In scope

19 new tests (T121-T139) in a single new file:

| Endpoint | Tests | Coverage |
| --- | --- | --- |
| `createNote` | T121-T123 (3) | happy · empty-title 400 · invalid entity link 400 |
| `updateNote` | T124-T127 (4) | ownership 404 · title-change re-embed · **conditional re-embed** (tags-only does NOT re-embed) · folder-not-owned 404 |
| `duplicateNote` | T128-T130 (3) | ownership 404 · happy (`"Copy of …"` + content + tags + folder) · **link-reset regression** (source linkedEntity* cleared on copy) |
| `archiveNote` | T131-T132 (2) | ownership 404 · **auto-unpin regression** (pinned note → `pinned: false` in update payload) |
| `restoreNote` | T133-T134 (2) | ownership 404 (already-active) · happy (archivedAt cleared) |
| `deleteNotePermanent` | T135-T136 (2) | ownership 404 · happy round-trip (cancel + delete) — complements existing T26 cancel-wiring |
| `togglePin` | T137-T139 (3) | ownership 404 · **archived-pin rejection** (400) · happy flip |

Total: **19 tests** (1339 → 1358).

### Out of scope (carved)

- **All read endpoints** in `notes.controller.js` (`listNotes`, `getNote`, `getRelatedForNote`, `listTags`, `listNotesByEntity`, `searchLinkableEntities`) → Sprint 6c
- **All AI features** in `notes.controller.js` (`generateNoteSummary` extend, `generateNoteFlashcards`, `suggestNoteTags` extend) + the streaming success path of `generateNoteFromTemplates` → Sprint 6c
- **`notesFolders.controller.js`** (separate controller — listFolders/createFolder/updateFolder/deleteFolder) — not part of M31; would be its own sprint if needed
- **Admin endpoints** — none exist in `notes.controller.js` (notes are user-scoped, no SUPER_ADMIN paths). The original Sprint 6 scope mentioned "+ admin endpoints" aspirationally; verified empty
- **Validation branches already enforced by Zod** at the route boundary — covering them here would double-cover middleware that has its own tests
- **Production code changes** — none. If a test fails on production code that violates the spec, document the divergence and decide per case whether to fix or accept (Sprint 5a/5b surfaced 23 such divergences this way)

---

## Architecture

```
server/test/controllers/
└── notes.mutations.test.js   [NEW — 19 tests, T121-T139, 7 describe blocks]
```

**One consolidated test file** — all 7 mutations share the same mock surface (`prismaMock.note.{findFirst,create,update,updateMany,delete}` + `prismaMock.noteFolder.findFirst` + `scheduleNoteEmbedding` + `cancelNoteEmbedding`). Splitting into 4-5 files would duplicate ~40 lines of mock boilerplate without gaining test isolation. Sprint 6a's `notesAiTemplate.test.js` set this precedent and was approved by the code-quality reviewer.

**Unchanged:**
- `notes.controller.js` and all other production code
- Existing test files (`notes.controller.test.js`, `notes.delete-cancel.test.js`, `notesAiTemplate.test.js`)

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
  problem: { findFirst: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/services/notes.embedding.js", () => ({
  scheduleNoteEmbedding: vi.fn(),
  cancelNoteEmbedding: vi.fn(),
}));

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
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
});
```

### Why each mock is needed

- **`prismaMock.note.*`** — all 7 mutations write to or read from the `note` table
- **`prismaMock.noteFolder.findFirst`** — `updateNote`'s folder-reassignment branch validates folder ownership
- **`prismaMock.problem.findFirst`** — `createNote` and `updateNote` link-validation can resolve a Problem entity link. The 19 tests don't exercise the happy entity-link path (T123 fails before any prisma call via `resolveEntitySnapshot` rejecting the bogus type), but the mock is present so any incidental call doesn't throw on `undefined.findFirst`
- **`prismaMock.teamMembership.findMany.mockResolvedValue([])`** — `userTeamIds()` is called by `resolveEntitySnapshot` for team-scoped entity types; returning `[]` makes any team-scoped link resolve as "not accessible". The 19 tests don't exercise this path, but the default prevents incidental call failures
- **`scheduleNoteEmbedding` + `cancelNoteEmbedding`** — fire-and-forget side effects in create/update/duplicate/delete; tests assert on call presence/absence

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
  // ... other fields dtoNote needs
});
const { req, res } = mockReqRes({ body: { title: "T" } });
await createNote(req, res);
expect(res.status).toHaveBeenCalledWith(201);
expect(res.json.mock.calls[0][0].success).toBe(true);
expect(scheduleNoteEmbedding).toHaveBeenCalledWith("note_new");
```

**T122 empty title 400**:
```js
const { req, res } = mockReqRes({ body: { title: "   " } });  // whitespace
await createNote(req, res);
expect(res.status).toHaveBeenCalledWith(400);
expect(res.json.mock.calls[0][0].error.message).toBe("Title is required");
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6b");
```

**T123 invalid entity link 400**:
```js
const { req, res } = mockReqRes({
  body: { title: "T", linkedEntityType: "BOGUS", linkedEntityId: "x" },
});
await createNote(req, res);
expect(res.status).toHaveBeenCalledWith(400);
expect(res.json.mock.calls[0][0].error.message).toBe("Invalid entity type");
```

### T124-T127 — `updateNote`

**T124 ownership 404**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" }, body: { title: "X" } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(res.json.mock.calls[0][0].error.message).toBe("Note not found");
```

**T125 title change re-embeds**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", title: "X" });
const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { title: "X" } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(200);
expect(scheduleNoteEmbedding).toHaveBeenCalledWith("note_1");
```

**T126 conditional re-embed regression — tags-only does NOT re-embed**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.note.update.mockResolvedValueOnce({ id: "note_1", tags: ["foo"] });
const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { tags: ["foo"] } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(200);
expect(scheduleNoteEmbedding).not.toHaveBeenCalled();
```

This locks in the cheap-call optimization at lines 426-431 — re-embed only if `data.title` or `data.contentMarkdown` was set.

**T127 folder reassignment ownership 404**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.noteFolder.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_1" }, body: { folderId: "fold_other" } });
await updateNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(res.json.mock.calls[0][0].error.message).toBe("Folder not found");
```

### T128-T130 — `duplicateNote`

**T128 ownership 404**: `findFirst → null`, assert 404.

**T129 happy**:
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
expect(scheduleNoteEmbedding).toHaveBeenCalledWith("note_copy");
```

**T130 link-reset regression**:
The controller's `select` clause at lines 464-469 explicitly omits `linkedEntityType` / `linkedEntityId` / `linkedEntityTitle` / `pinned` / `archivedAt`. Even if the source note had a Problem link, the duplicate must start fresh.

```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  title: "Templated",
  contentMarkdown: "body",
  tags: [],
  folderId: null,
  // NOTE: linkedEntityType etc are NOT in the controller's select; even
  // if we return them here they should not leak into create's data.
  linkedEntityType: "PROBLEM",
  linkedEntityId: "prob_1",
});
prismaMock.note.create.mockResolvedValueOnce({ id: "note_copy", title: "Copy of Templated" });
const { req, res } = mockReqRes({ params: { id: "note_src" } });
await duplicateNote(req, res);
const createArg = prismaMock.note.create.mock.calls[0][0];
expect(createArg.data.linkedEntityType).toBeUndefined();
expect(createArg.data.linkedEntityId).toBeUndefined();
expect(createArg.data.linkedEntityTitle).toBeUndefined();
expect(createArg.data.pinned).toBeUndefined();    // defaults to false at DB level
expect(createArg.data.archivedAt).toBeUndefined(); // defaults to null at DB level
```

### T131-T132 — `archiveNote`

**T131 ownership 404**:
```js
prismaMock.note.updateMany.mockResolvedValueOnce({ count: 0 });
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await archiveNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
```

**T132 auto-unpin regression**:
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

### T133-T134 — `restoreNote`

**T133 ownership 404 (already-active)**:
```js
prismaMock.note.updateMany.mockResolvedValueOnce({ count: 0 });
await restoreNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
```

**T134 happy**:
```js
prismaMock.note.updateMany.mockResolvedValueOnce({ count: 1 });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await restoreNote(req, res);
const arg = prismaMock.note.updateMany.mock.calls[0][0];
expect(arg.where.archivedAt).toEqual({ not: null });
expect(arg.data.archivedAt).toBeNull();
expect(res.json.mock.calls[0][0].data.archived).toBe(false);
```

### T135-T136 — `deleteNotePermanent`

**T135 ownership 404**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await deleteNotePermanent(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(cancelNoteEmbedding).not.toHaveBeenCalled();
expect(prismaMock.note.delete).not.toHaveBeenCalled();
```

**T136 happy round-trip**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_1" });
prismaMock.note.delete.mockResolvedValueOnce({ id: "note_1" });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await deleteNotePermanent(req, res);
expect(res.status).toHaveBeenCalledWith(200);
expect(res.json.mock.calls[0][0].data.deleted).toBe(true);
expect(cancelNoteEmbedding).toHaveBeenCalledWith("note_1");
expect(prismaMock.note.delete).toHaveBeenCalledWith({ where: { id: "note_1" } });
// Cancel BEFORE delete invariant (cancel pre-empts the debounced embed):
const cancelOrder = cancelNoteEmbedding.mock.invocationCallOrder[0];
const deleteOrder = prismaMock.note.delete.mock.invocationCallOrder[0];
expect(cancelOrder).toBeLessThan(deleteOrder);
```

The cancel-before-delete ordering complements the existing T26 in `notes.delete-cancel.test.js` by asserting the full round-trip.

### T137-T139 — `togglePin`

**T137 ownership 404**: `findFirst → null`, assert 404.

**T138 archived-pin rejection regression**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1",
  pinned: false,
  archivedAt: new Date(),
});
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await togglePin(req, res);
expect(res.status).toHaveBeenCalledWith(400);
expect(res.json.mock.calls[0][0].error.message).toBe("Restore the note before pinning it");
expect(prismaMock.note.update).not.toHaveBeenCalled();
```

**T139 happy flip (false → true)**:
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
expect(prismaMock.note.update).toHaveBeenCalledWith({
  where: { id: "note_1" },
  data: { pinned: true },
  include: expect.any(Object),
});
```

---

## Test count target

- Baseline (post Sprint 6a): **1339**
- New tests in 6b: **+19**
- Target after 6b: **1358**

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — pure additive tests |
| Client impact | None |
| Test runtime impact | +19 mock-only tests, sub-200ms |
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
| Internal consistency | 7 endpoints listed with exact line numbers + 19 tests with exact IDs T121-T139. Mock pattern + assertions are uniform across tests; the 4 italicized "regression" guards are the highest-signal coverage |
| Scope | Tight: mutations only. Reads + AI features → 6c. NotesFolders → out. Admin → verified absent. Production code → unchanged unless tests surface a divergence |
| Ambiguity | Three explicit calls: (a) consolidated single file vs multi-file decided in favor of single file with rationale (uniform mock surface, matches 6a precedent); (b) `mockReset()` in beforeEach inherited from 6a code-review lesson; (c) cancel-before-delete invariant captured via `invocationCallOrder` ordering check |
| Adversarial review | The 4 regression guards (T126 conditional re-embed, T130 link reset, T132 auto-unpin, T138 archived-pin rejection) test behaviors a future refactor could silently remove. The ownership-404 gates ensure every endpoint enforces userId filtering. The cancel-before-delete ordering in T136 captures a load-bearing invariant the existing T26 doesn't quite assert |
| Risk floor | Effectively zero. Pure additive regression tests; no production code change unless a test surfaces a divergence |

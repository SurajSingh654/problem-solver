# Sprint 6c — Notes Reads + AI Features Test Foundation — Design Spec

**Date:** 2026-06-30
**Sprint:** 6c (third slice of decomposed Sprint 6 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** M31 (final portion — completes the notes surface)
**Branch:** `feat/notes-reads-ai-tests`
**Layers on:** main, post Sprint 6b (`8665b60`)
**Feature flag:** None — pure additive test work
**Review history (spec v2, plan v2):** Full 4-role panel completed pre-implementation:
- Project Owner — APPROVED WITH NOTES → folded (T149 ordering, T156 AIError code pin, T156 in security override)
- Business Analyst — CHANGES REQUESTED → folded (validator path fix, embedding-mock wiring for T155/T156, anti-all-DEFINITION rule for T161, AI-payload divergence rule)
- Security Manager — CHANGES REQUESTED → folded (T153 expanded to 4 sub-cases covering all branches with positive+negative authz, T155 `findProblemsByNoteEmbedding` teamIds passthrough assertion, T145/T149 `where.userId`, explicit `where.userId` on T154/T157/T159/T163, T165 team-scope re-fetch via problemId)
- Lead Engineer — CHANGES REQUESTED → folded (T143 `res.status` inversion, T155/T156 embedding-mock override corroborates BA, T166 declaration reordering for disconnect timing, Pattern B `beforeEach` block)

---

## Problem

Sprint 1 audit, M31 (final portion):

> `notes.controller.js` — 16 exports. Sprint 6a closed the envelope-bypass on `generateNoteFromTemplates` (H6); Sprint 6b covered the 7 mutations. The remaining 9 surface — 6 reads (`listNotes`, `getNote`, `getRelatedForNote`, `listTags`, `listNotesByEntity`, `searchLinkableEntities`) + 3 AI features (`generateNoteSummary`, `generateNoteFlashcards`, `suggestNoteTags`) — plus the **streaming success path** of `generateNoteFromTemplates` (only error envelopes were covered in 6a) are still untested or only partially tested at the controller level.

### Zero-trust verification

`grep -nE "^export async function" server/src/controllers/notes.controller.js` confirms 16 exports. Of those:

- 7 mutations — **fully tested** (Sprint 6b, T121-T142)
- 9 remaining — **target of 6c**
- 1 streaming controller in `notesAiTemplate.controller.js` — error envelopes tested (6a), **happy stream untested**

Existing partial coverage in `notes.controller.test.js`:
- `generateNoteSummary` — 5 tests (extractJSON contract, hasContent ReferenceError, validator/AI fallback paths)
- `suggestNoteTags` — 1 test (empty fallback regression — pseudo-tags guard)

What's still missing for those two: **ownership 404, quality-gate boundaries, persist invariants**.

### High-signal behaviors worth a regression guard

| Behavior | Why it matters |
| --- | --- |
| `getRelatedForNote` graceful fallback to embedding-only when LLM rejected | Critical: a future validator change could 500 the endpoint instead of falling back. Users see "Related" panel collapse. |
| `searchLinkableEntities` mixed authz (PROBLEM/TEACHING_SESSION team-scoped via `teamId: { in: teamIds }` vs INTERVIEW_SESSION/DESIGN_SESSION user-scoped via `userId`) | Cross-team leak surface if a future refactor uses one filter for all 4 types. |
| `generateNoteSummary` / `suggestNoteTags` persist invariants — `summary` + `summaryGeneratedAt` / `suggestedTags` must be written to DB on happy path | Drift between "AI returned this" and "what's actually in the row" is silent and breaks the UI's "regenerate" flow. |
| `generateNoteFlashcards` quality-gate boundary (chars < 200) + validator-reject fallback | New AI surface; no existing test. Quality gate change would silently produce empty drafts. |
| `generateNoteFromTemplates` streaming happy path: chunks → trimmed → `prisma.note.create` → `scheduleNoteEmbedding` → final `{done, noteId, title}` | The full state machine; 6a only tested early-validation rejections. |
| Streaming **client-disconnect bails persist** | Resource-leak regression — a disconnected client shouldn't trigger a DB write + embedding job. |
| Streaming **too-short output** → `EMPTY_OUTPUT` line, no persist | AI degradation regression. |
| `listTags` excludes archived + top-50 cap | Output-size regression. |

---

## Principle

**Pure additive test work.** Per export, lock in the bug-prone behaviors first. Three distinct mock surfaces (reads / AI / streaming) justify three files — splitting follows the 5a/5b precedent for non-uniform mock surfaces.

---

## Scope

### In scope — 25 tests T143-T167

#### File 1 — `notes.reads.test.js` (10 tests)

| # | Endpoint | Coverage |
| --- | --- | --- |
| T143 | `listNotes` | happy default (ordered, no filters, no cursor) |
| T144 | `listNotes` | filter shape (archived/pinned/tag in `where`) |
| T145 | `listNotes` | cursor pagination (`hasMore=true` ⇒ `nextCursor` set) |
| T146 | `getNote` | ownership 404 (asserts `where.userId`) |
| T147 | `getNote` | happy (dtoNote shape, `_count` + `folder` includes) |
| T148 | `listTags` | aggregation: counts + ordering desc + excludes archived |
| T149 | `listTags` | top-50 cap |
| T150 | `listNotesByEntity` | invalid entity type 400 + requestId |
| T151 | `listNotesByEntity` | happy (`where` includes type/id/userId/archivedAt) |
| T152 | `searchLinkableEntities` | invalid entity type 400 + requestId |

#### File 2 — `notes.ai.test.js` (12 tests)

| # | Endpoint | Coverage |
| --- | --- | --- |
| T153 | `searchLinkableEntities` | PROBLEM team-scoped authz (`teamId: { in: teamIds }`) |
| T154 | `getRelatedForNote` | ownership 404 (asserts `where.userId`) |
| T155 | `getRelatedForNote` | LLM-rank happy (`aiGenerated: true`) |
| T156 | `getRelatedForNote` | **graceful fallback to embedding-only** when LLM rejected (`aiGenerated: false`) |
| T157 | `generateNoteSummary` | ownership 404 |
| T158 | `generateNoteSummary` | persists `summary` + `summaryGeneratedAt` to DB |
| T159 | `generateNoteFlashcards` | ownership 404 |
| T160 | `generateNoteFlashcards` | quality-gate 400 (chars < 200) |
| T161 | `generateNoteFlashcards` | happy + `fallback: false` |
| T162 | `generateNoteFlashcards` | validator-reject fallback |
| T163 | `suggestNoteTags` | ownership 404 |
| T164 | `suggestNoteTags` | quality-gate 400 (chars < 60) |

#### File 3 — `notes.stream.test.js` (3 tests)

| # | Endpoint | Coverage |
| --- | --- | --- |
| T165 | `generateNoteFromTemplates` happy stream | chunks → trimmed → `prisma.note.create` → `scheduleNoteEmbedding` → final `{done, noteId, title}` |
| T166 | streaming **client-disconnect** bails persist | `req.close` emitted mid-stream ⇒ no create, no embed |
| T167 | streaming **too-short output** | trimmed < `MIN_OUTPUT_CHARS` ⇒ `EMPTY_OUTPUT` line, no persist |

Total: **25 tests** (1361 → 1386).

### Out of scope (carved)

- **`suggestNoteTags` happy + persist** — existing test covers the empty-fallback honest-failure case; T163/T164 add ownership + quality-gate. A happy+persist test would mostly duplicate the structure of `generateNoteSummary`'s T158. **Defer** to drift discovery.
- **3 NDJSON streaming-side error sends** (`STREAM_ERROR`, `PERSIST_FAILED`, `AI_ERROR` start-stream failure) — `EMPTY_OUTPUT` is covered (T167); the others are downstream-dependency failures with no controller branch logic to guard.
- **AI rate-limit / per-day-cap exhaustion** — service-level (`ai.service.js`); already covered there. Out of M31.
- **`notesFolders.controller.js`** — already explicitly deferred indefinitely (per 6b's spec).
- **Frontend changes** — Sprint 6c is server tests only. The Zod-absence finding from 6b's BA review is still a Sprint 6+ follow-up surface; not in 6c either.
- **Production code changes** — none. If a test fails on a real divergence, document and decide per case (Sprint 5a/5b/6b precedent).

---

## Architecture

```
server/test/controllers/
├── notes.reads.test.js     [NEW — 10 tests, T143-T152]
├── notes.ai.test.js        [NEW — 12 tests, T153-T164]
└── notes.stream.test.js    [NEW — 3 tests, T165-T167]
```

**Three files, three mock surfaces.** A consolidated file would either re-declare prisma mocks per describe block (drift surface) or hoist a super-set never fully used in any single test. The 5a/5b precedent splits read vs mutation vs AI for exactly this reason. The 6b consolidation only worked because the mock surface was uniform across all 7 mutations.

**Unchanged:** `notes.controller.js`, `notesAiTemplate.controller.js`, all other production code. All existing test files (`notes.controller.test.js`, `notes.delete-cancel.test.js`, `notesAiTemplate.test.js`, `notes.mutations.test.js`).

---

## Mock patterns

### Pattern A — `notes.reads.test.js` (simple Prisma + team-scope surface)

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  note: { findFirst: vi.fn(), findMany: vi.fn() },
  problem: { findMany: vi.fn() },
  interviewSession: { findMany: vi.fn() },
  designSession: { findMany: vi.fn() },
  teachingSession: { findMany: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([{ teamId: "team_1" }]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const {
  listNotes, getNote, listTags, listNotesByEntity, searchLinkableEntities,
} = await import("../../src/controllers/notes.controller.js");

function mockReqRes({ params = {}, query = {}, userId = "user_1" } = {}) {
  const req = { params, query, user: { id: userId }, requestId: "req_test_6c" };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  res.req = req;
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.note.findFirst.mockReset();
  prismaMock.note.findMany.mockReset();
  prismaMock.problem.findMany.mockReset();
  prismaMock.interviewSession.findMany.mockReset();
  prismaMock.designSession.findMany.mockReset();
  prismaMock.teachingSession.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([{ teamId: "team_1" }]);
});
```

### Pattern B — `notes.ai.test.js` (adds `aiComplete` + embedding-search + env override + the 4 entity prismas needed by T153 all-branches sub-cases)

```js
const prismaMock = vi.hoisted(() => ({
  note: { findFirst: vi.fn(), update: vi.fn() },
  problem: { findMany: vi.fn() },
  interviewSession: { findMany: vi.fn() },
  designSession: { findMany: vi.fn() },
  teachingSession: { findMany: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const aiMock = vi.hoisted(() => ({
  aiComplete: vi.fn(),
  AIError: class AIError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  },
}));
vi.mock("../../src/services/ai.service.js", () => aiMock);

const embeddingMock = vi.hoisted(() => ({
  findSimilarNotes: vi.fn().mockResolvedValue([]),
  findProblemsByNoteEmbedding: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingMock);

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

const {
  getRelatedForNote, generateNoteSummary, generateNoteFlashcards,
  suggestNoteTags, searchLinkableEntities,
} = await import("../../src/controllers/notes.controller.js");

// Pattern B beforeEach (Lead Engineer fold-in: was missing in v1)
beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.note.findFirst.mockReset();
  prismaMock.note.update.mockReset();
  prismaMock.problem.findMany.mockReset();
  prismaMock.interviewSession.findMany.mockReset();
  prismaMock.designSession.findMany.mockReset();
  prismaMock.teachingSession.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
  aiMock.aiComplete.mockReset();
  embeddingMock.findSimilarNotes.mockReset();
  embeddingMock.findSimilarNotes.mockResolvedValue([]);
  embeddingMock.findProblemsByNoteEmbedding.mockReset();
  embeddingMock.findProblemsByNoteEmbedding.mockResolvedValue([]);
});
```

### Pattern C — `notes.stream.test.js` (streaming `aiStream` async-iterable + write-capturing `res`)

```js
const prismaMock = vi.hoisted(() => ({
  note: { findMany: vi.fn(), create: vi.fn() },
  problem: { findFirst: vi.fn() },
  noteFolder: { findFirst: vi.fn() },
  teamMembership: { findMany: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const aiMock = vi.hoisted(() => ({
  aiStream: vi.fn(),
  AIError: class AIError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  },
}));
vi.mock("../../src/services/ai.service.js", () => aiMock);

const notesEmbeddingMock = vi.hoisted(() => ({
  scheduleNoteEmbedding: vi.fn(),
}));
vi.mock("../../src/services/notes.embedding.js", () => notesEmbeddingMock);

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true, AI_MODEL_PRIMARY: "gpt-4o" };
});

const { generateNoteFromTemplates } = await import(
  "../../src/controllers/notesAiTemplate.controller.js"
);

// Streaming-capable res mock: captures every res.write() call as a parsed
// NDJSON line, plus exposes `emitClose()` to simulate client-disconnect.
function makeStreamingReqRes({ body = {}, userId = "user_1" } = {}) {
  const writes = [];
  const closeHandlers = [];
  const req = {
    body,
    user: { id: userId },
    requestId: "req_test_6c",
    on(event, handler) {
      if (event === "close") closeHandlers.push(handler);
    },
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn((line) => {
      writes.push(JSON.parse(line.trim()));
      return true;
    }),
    end: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  res.req = req;
  return {
    req,
    res,
    writes,
    emitClose: () => closeHandlers.forEach((h) => h()),
  };
}

// Helper: build an async-iterable that yields fake OpenAI chunks.
async function* chunkStream(chunks) {
  for (const c of chunks) {
    yield { choices: [{ delta: { content: c } }] };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.note.findMany.mockReset();
  prismaMock.note.create.mockReset();
  prismaMock.problem.findFirst.mockReset();
  prismaMock.noteFolder.findFirst.mockReset();
  prismaMock.teamMembership.findMany.mockReset();
  prismaMock.teamMembership.findMany.mockResolvedValue([]);
  aiMock.aiStream.mockReset();
  notesEmbeddingMock.scheduleNoteEmbedding.mockReset();
});
```

---

## Per-test design

### File 1 — `notes.reads.test.js` (T143-T152)

**T143 listNotes happy default** (Lead Engineer fold-in: `success()` DOES call `status(200)`):
```js
prismaMock.note.findMany.mockResolvedValueOnce([]);
const { req, res } = mockReqRes({});
await listNotes(req, res);
expect(res.status).toHaveBeenCalledWith(200);
const json = res.json.mock.calls[0][0];
expect(json.success).toBe(true);
expect(json.data.notes).toEqual([]);
expect(json.data.nextCursor).toBeNull();
const arg = prismaMock.note.findMany.mock.calls[0][0];
expect(arg.where).toMatchObject({ userId: "user_1", archivedAt: null });
expect(arg.where.userId).toBe("user_1");  // explicit authz pin
expect(arg.orderBy).toEqual([{ pinned: "desc" }, { updatedAt: "desc" }]);
```

**T144 listNotes filter shape:**
```js
prismaMock.note.findMany.mockResolvedValueOnce([]);
const { req, res } = mockReqRes({
  query: { archived: "true", pinned: "true", tag: "react" },
});
await listNotes(req, res);
const arg = prismaMock.note.findMany.mock.calls[0][0];
expect(arg.where).toMatchObject({
  userId: "user_1",
  archivedAt: { not: null },
  pinned: true,
  tags: { has: "react" },
});
```

**T145 listNotes cursor pagination** (Security Manager fold-in: explicit `where.userId` assertion):
```js
// Mock returns limit+1 rows so hasMore=true.
const rows = Array.from({ length: 11 }, (_, i) => ({
  id: `note_${i}`, title: `T${i}`, _count: { flashcards: 0 }, folder: null,
}));
prismaMock.note.findMany.mockResolvedValueOnce(rows);
const { req, res } = mockReqRes({ query: { limit: "10", cursor: "note_seed" } });
await listNotes(req, res);
const json = res.json.mock.calls[0][0];
expect(json.data.notes.length).toBe(10);
expect(json.data.nextCursor).toBe("note_9");
const arg = prismaMock.note.findMany.mock.calls[0][0];
expect(arg.where.userId).toBe("user_1");  // authz invariant
expect(arg.take).toBe(11);  // limit + 1
expect(arg.skip).toBe(1);
expect(arg.cursor).toEqual({ id: "note_seed" });
```

**T146 getNote ownership 404:**
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await getNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
const json = res.json.mock.calls[0][0];
expect(json.error.message).toBe("Note not found");
expect(json.error.requestId).toBe("req_test_6c");
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other", userId: "user_1",
});
```

**T147 getNote happy:**
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1", title: "T",
  _count: { flashcards: 3 },
  folder: { id: "fold_1", name: "F", parentId: null },
});
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await getNote(req, res);
const json = res.json.mock.calls[0][0];
expect(json.success).toBe(true);
expect(json.data.note.id).toBe("note_1");
expect(json.data.note.flashcardCount).toBe(3);
expect(json.data.note.folder).toMatchObject({ id: "fold_1", name: "F" });
const arg = prismaMock.note.findFirst.mock.calls[0][0];
expect(arg.include._count.select.flashcards).toBe(true);
expect(arg.include.folder.select).toEqual({ id: true, name: true, parentId: true });
```

**T148 listTags aggregation + ordering + excludes archived** (controller L948-951 does NOT dedupe within a row — "a" appears 2× in row 1 + 1× in row 2 = 3):
```js
prismaMock.note.findMany.mockResolvedValueOnce([
  { tags: ["a", "a", "b"] },  // dupe-within-row possible
  { tags: ["a", "c"] },
  { tags: ["b"] },
]);
const { req, res } = mockReqRes({});
await listTags(req, res);
const json = res.json.mock.calls[0][0];
// "a" total = 3 (2 from row1 + 1 from row2), "b" 2, "c" 1
expect(json.data.tags).toEqual([
  { tag: "a", count: 3 },
  { tag: "b", count: 2 },
  { tag: "c", count: 1 },
]);
expect(prismaMock.note.findMany.mock.calls[0][0].where).toMatchObject({
  userId: "user_1",
  archivedAt: null,
});
```

**T149 listTags top-50 cap + ordering by count desc** (PO + Security fold-in: explicit count-desc + `where.userId`):
```js
// 60 distinct tags, varying counts so ordering is testable.
// tag0 appears 60×, tag1 appears 59×, ..., tag59 appears 1×.
const rows = [];
for (let i = 0; i < 60; i++) {
  for (let j = 0; j <= 60 - i - 1; j++) {
    rows.push({ tags: [`tag${i}`] });
  }
}
prismaMock.note.findMany.mockResolvedValueOnce(rows);
const { req, res } = mockReqRes({});
await listTags(req, res);
const tags = res.json.mock.calls[0][0].data.tags;
expect(tags.length).toBe(50);
// Top-50 by count means the highest-frequency tag is first AND
// the array is sorted strictly descending by count.
expect(tags[0].tag).toBe("tag0");
expect(tags[0].count).toBe(60);
expect(tags[49].count).toBeGreaterThanOrEqual(tags[0].count - 49);
for (let i = 1; i < tags.length; i++) {
  expect(tags[i].count).toBeLessThanOrEqual(tags[i - 1].count);  // monotonically non-increasing
}
expect(prismaMock.note.findMany.mock.calls[0][0].where.userId).toBe("user_1");
```

**T150 listNotesByEntity invalid type:**
```js
const { req, res } = mockReqRes({ params: { type: "BOGUS", id: "x" } });
await listNotesByEntity(req, res);
expect(res.status).toHaveBeenCalledWith(400);
const json = res.json.mock.calls[0][0];
expect(json.error.message).toBe("Invalid entity type");
expect(json.error.requestId).toBe("req_test_6c");
```

**T151 listNotesByEntity happy:**
```js
prismaMock.note.findMany.mockResolvedValueOnce([
  { id: "note_1", title: "T", _count: { flashcards: 0 } },
]);
const { req, res } = mockReqRes({ params: { type: "PROBLEM", id: "prob_1" } });
await listNotesByEntity(req, res);
const arg = prismaMock.note.findMany.mock.calls[0][0];
expect(arg.where).toMatchObject({
  userId: "user_1",
  archivedAt: null,
  linkedEntityType: "PROBLEM",
  linkedEntityId: "prob_1",
});
```

**T152 searchLinkableEntities invalid type:**
```js
const { req, res } = mockReqRes({ query: { type: "BOGUS" } });
await searchLinkableEntities(req, res);
expect(res.status).toHaveBeenCalledWith(400);
expect(res.json.mock.calls[0][0].error.message).toBe("Invalid entity type");
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6c");
```

### File 2 — `notes.ai.test.js` (T153-T164)

**T153 searchLinkableEntities — ALL FOUR branches mixed-authz** (Security Manager C2 fold-in: covers PROBLEM team-scoped, INTERVIEW_SESSION user-scoped, DESIGN_SESSION user-scoped, TEACHING_SESSION team-scoped — each with positive `where.X === ...` AND negative `where.Y === undefined` assertions):

```js
// Pattern B's prismaMock must include problem/interviewSession/designSession/teachingSession
// — for this AI-file location, add them to the Pattern B hoisted mock surface.
// (Or use the reads-file mock and call this test from there; either works,
// but keeping it in notes.ai.test.js means Pattern B must include all 4 entity prismas.)

// Sub-case A: PROBLEM — team-scoped via teamId IN userTeamIds
{
  prismaMock.teamMembership.findMany.mockResolvedValueOnce([
    { teamId: "team_1" }, { teamId: "team_2" },
  ]);
  prismaMock.problem.findMany.mockResolvedValueOnce([
    { id: "prob_1", title: "Two Sum", difficulty: "EASY", category: "CODING" },
  ]);
  const { req, res } = mockReqRes({ query: { type: "PROBLEM", q: "two" } });
  await searchLinkableEntities(req, res);
  const arg = prismaMock.problem.findMany.mock.calls[0][0];
  expect(arg.where.teamId).toEqual({ in: ["team_1", "team_2"] });
  expect(arg.where.userId).toBeUndefined();  // POSITIVE+NEGATIVE authz pin
}

// Sub-case B: INTERVIEW_SESSION — user-scoped via userId
{
  prismaMock.teamMembership.findMany.mockResolvedValueOnce([{ teamId: "team_1" }]);
  prismaMock.interviewSession.findMany.mockResolvedValueOnce([
    { id: "iv_1", createdAt: new Date(), status: "COMPLETED", problem: { title: "Two Sum" } },
  ]);
  const { req, res } = mockReqRes({ query: { type: "INTERVIEW_SESSION" } });
  await searchLinkableEntities(req, res);
  const arg = prismaMock.interviewSession.findMany.mock.calls[0][0];
  expect(arg.where.userId).toBe("user_1");
  expect(arg.where.teamId).toBeUndefined();  // private to the user, NOT team-shared
}

// Sub-case C: DESIGN_SESSION — user-scoped via userId
{
  prismaMock.teamMembership.findMany.mockResolvedValueOnce([{ teamId: "team_1" }]);
  prismaMock.designSession.findMany.mockResolvedValueOnce([
    { id: "ds_1", title: "Url Shortener", designType: "SYSTEM_DESIGN", difficulty: "MEDIUM" },
  ]);
  const { req, res } = mockReqRes({ query: { type: "DESIGN_SESSION" } });
  await searchLinkableEntities(req, res);
  const arg = prismaMock.designSession.findMany.mock.calls[0][0];
  expect(arg.where.userId).toBe("user_1");
  expect(arg.where.teamId).toBeUndefined();
}

// Sub-case D: TEACHING_SESSION — team-scoped via teamId IN userTeamIds
{
  prismaMock.teamMembership.findMany.mockResolvedValueOnce([
    { teamId: "team_1" }, { teamId: "team_2" },
  ]);
  prismaMock.teachingSession.findMany.mockResolvedValueOnce([
    { id: "ts_1", title: "Hashing 101", topic: "Algorithms", status: "SCHEDULED" },
  ]);
  const { req, res } = mockReqRes({ query: { type: "TEACHING_SESSION" } });
  await searchLinkableEntities(req, res);
  const arg = prismaMock.teachingSession.findMany.mock.calls[0][0];
  expect(arg.where.teamId).toEqual({ in: ["team_1", "team_2"] });
  expect(arg.where.userId).toBeUndefined();
}
```

This single test (4 sub-cases) covers 75% of the authz attack surface that a single PROBLEM-only test would leave ungated. Future refactor swapping any branch's filter (e.g., DESIGN_SESSION to `teamId`) immediately fails the corresponding sub-case.

**T154 getRelatedForNote ownership 404** (Security I2 fold-in: explicit `where.userId`):
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await getRelatedForNote(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6c");
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other",
  userId: "user_1",
});
```

**T155 getRelatedForNote LLM-rank happy** (BA + Lead + Security C1 fold-in: override embedding mocks so candidate IDs match payload; assert team-scope passthrough on the embedding query):
```js
prismaMock.teamMembership.findMany.mockResolvedValueOnce([
  { teamId: "team_1" }, { teamId: "team_2" },
]);
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_src", title: "Two Sum", summary: { tldr: "Hash lookup pattern.", keyTakeaways: [] },
});
// Embedding mocks must return rows whose IDs the validator can find as
// candidates — without this T155 silently routes to the fallback branch
// (BA + Lead fold-in).
embeddingMock.findSimilarNotes.mockResolvedValueOnce([
  { id: "note_sim1", title: "3Sum", tags: [], updatedAt: new Date(), distance: 0.2 },
]);
embeddingMock.findProblemsByNoteEmbedding.mockResolvedValueOnce([
  { id: "prob_1", title: "Two Sum II", difficulty: "EASY", category: "CODING", tags: [], distance: 0.3 },
]);
aiMock.aiComplete.mockResolvedValueOnce({
  relatedNotes: [{ id: "note_sim1", rationale: "Both use hash complement." }],
  relatedProblems: [{ id: "prob_1", rationale: "Similar pattern, ascending input." }],
});

const { req, res } = mockReqRes({ params: { id: "note_src" } });
await getRelatedForNote(req, res);

expect(res.status).toHaveBeenCalledWith(200);
const json = res.json.mock.calls[0][0];
expect(json.data.aiGenerated).toBe(true);
expect(json.data.relatedNotes[0]).toMatchObject({
  id: "note_sim1", rationale: "Both use hash complement.",
});

// SECURITY C1 fold-in: team-scope passthrough on the embedding query is the
// load-bearing authz invariant for getRelatedForNote. A future refactor that
// drops teamIds (or passes userId/null) cross-team-leaks problems.
expect(embeddingMock.findSimilarNotes).toHaveBeenCalledWith("note_src", "user_1", 10);
expect(embeddingMock.findProblemsByNoteEmbedding).toHaveBeenCalledWith(
  "note_src",
  ["team_1", "team_2"],  // teamIds from userTeamIds(userId)
  10,
);
```

**T156 getRelatedForNote graceful fallback** (PO fold-in: pin specific AIError code; Security override-list addition):
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_src", title: "Two Sum", summary: null,
});
embeddingMock.findSimilarNotes.mockResolvedValueOnce([
  { id: "note_sim1", title: "3Sum", tags: ["array"], updatedAt: new Date(), distance: 0.2 },
]);
embeddingMock.findProblemsByNoteEmbedding.mockResolvedValueOnce([
  { id: "prob_1", title: "Two Sum II", difficulty: "EASY", category: "CODING", tags: [], distance: 0.3 },
]);
// Specific AIError path (PO fold-in: pin the fallback trigger so the test
// isn't ambiguous about which branch fired). AIError with code TIMEOUT.
aiMock.aiComplete.mockRejectedValueOnce(new aiMock.AIError("openai timeout", "TIMEOUT"));

const { req, res } = mockReqRes({ params: { id: "note_src" } });
await getRelatedForNote(req, res);

expect(res.status).toHaveBeenCalledWith(200);
const json = res.json.mock.calls[0][0];
expect(json.data.aiGenerated).toBe(false);
// Fallback ranking hydrates from the embedding-only candidates.
expect(json.data.relatedNotes).toHaveLength(1);
expect(json.data.relatedNotes[0].id).toBe("note_sim1");
expect(json.data.relatedProblems).toHaveLength(1);
expect(json.data.relatedProblems[0].id).toBe("prob_1");
```

**T157 generateNoteSummary ownership 404** (Security I2 fold-in: explicit `where.userId`):
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await generateNoteSummary(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_6c");
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other", userId: "user_1",
});
```

**T158 generateNoteSummary persist invariant**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1", title: "Two Sum", contentMarkdown: LONG_NOTE_CONTENT, tags: [],
});
aiMock.aiComplete.mockResolvedValueOnce(VALID_SUMMARY_PAYLOAD);
prismaMock.note.update.mockResolvedValueOnce({});
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await generateNoteSummary(req, res);
expect(prismaMock.note.update).toHaveBeenCalledTimes(1);
const arg = prismaMock.note.update.mock.calls[0][0];
expect(arg.where).toEqual({ id: "note_1" });
expect(arg.data.summary).toEqual(VALID_SUMMARY_PAYLOAD);
expect(arg.data.summaryGeneratedAt).toBeInstanceOf(Date);
```

**T159 generateNoteFlashcards ownership 404** (Security I2 fold-in: explicit `where.userId`):
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await generateNoteFlashcards(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other", userId: "user_1",
});
expect(aiMock.aiComplete).not.toHaveBeenCalled();
```

**T160 generateNoteFlashcards quality gate 400** — content < 200 chars (real `assessNoteContentQuality`, not mocked):
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1", title: "T", contentMarkdown: "Short body content.", tags: [],
});
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await generateNoteFlashcards(req, res);
expect(res.status).toHaveBeenCalledWith(400);
expect(res.json.mock.calls[0][0].error.message).toMatch(/too thin for flashcards/i);
expect(aiMock.aiComplete).not.toHaveBeenCalled();
```

**T161 generateNoteFlashcards happy** (BA fold-in: avoid the all-DEFINITION anti-laziness trap at `services/ai.validators.js` ~L1870 — payload must have varied `type` values across drafts):
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1", title: "T", contentMarkdown: LONG_NOTE_CONTENT, tags: [],
});
// VALID_DRAFTS_PAYLOAD has 3-7 drafts with MIXED types (not all DEFINITION) —
// the validator at services/ai.validators.js rejects "all same type" as
// anti-laziness. Use a mix of CONCEPT, DEFINITION, CONTRAST.
aiMock.aiComplete.mockResolvedValueOnce(VALID_DRAFTS_PAYLOAD);
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await generateNoteFlashcards(req, res);
expect(res.status).toHaveBeenCalledWith(200);
const json = res.json.mock.calls[0][0];
expect(json.data.drafts.length).toBeGreaterThanOrEqual(3);
expect(json.data.fallback).toBe(false);
```

**T162 generateNoteFlashcards validator fallback**:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1", title: "T", contentMarkdown: LONG_NOTE_CONTENT, tags: [],
});
// Invalid: only 1 draft (validator requires 3-7) — triggers fallback
aiMock.aiComplete.mockResolvedValueOnce({ drafts: [{ type: "CONCEPT", front: "x", back: "y" }] });
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await generateNoteFlashcards(req, res);
expect(res.status).toHaveBeenCalledWith(200);
const json = res.json.mock.calls[0][0];
expect(json.data.fallback).toBe(true);
expect(json.data.fallbackReason).toMatch(/^validator:/);
```

**T163 suggestNoteTags ownership 404** (Security I2 fold-in):
```js
prismaMock.note.findFirst.mockResolvedValueOnce(null);
const { req, res } = mockReqRes({ params: { id: "note_other" } });
await suggestNoteTags(req, res);
expect(res.status).toHaveBeenCalledWith(404);
expect(prismaMock.note.findFirst.mock.calls[0][0].where).toMatchObject({
  id: "note_other", userId: "user_1",
});
```

**T164 suggestNoteTags quality gate 400** — content < 60 chars:
```js
prismaMock.note.findFirst.mockResolvedValueOnce({
  id: "note_1", title: "T", contentMarkdown: "Short.", tags: [],
});
const { req, res } = mockReqRes({ params: { id: "note_1" } });
await suggestNoteTags(req, res);
expect(res.status).toHaveBeenCalledWith(400);
expect(res.json.mock.calls[0][0].error.message).toMatch(/too thin for tag suggestions/i);
```

### File 3 — `notes.stream.test.js` (T165-T167)

**T165 streaming happy + team-scope re-fetch on linked-entity** (Security I3 fold-in: pass `problemId` to exercise the `problem.findFirst` team-scope authz re-fetch):
```js
prismaMock.note.findMany.mockResolvedValueOnce([
  { id: "note_t1", title: "Template", contentMarkdown: "Body content here." },
]);
prismaMock.teamMembership.findMany.mockResolvedValueOnce([
  { teamId: "team_1" }, { teamId: "team_2" },
]);
// Team-scope re-fetch — controller MUST re-authorize the problemId against
// the caller's teamIds. A future refactor reading req.body.problemId raw
// without this re-fetch would let a user attach their note to a problem
// they can't access. This test pins the re-fetch.
prismaMock.problem.findFirst.mockResolvedValueOnce({
  id: "prob_1", title: "Two Sum", difficulty: "EASY", description: "...",
});
aiMock.aiStream.mockResolvedValueOnce(chunkStream([
  "# Hello\n\n",
  "This is the generated note body. ".repeat(5),  // total > MIN_OUTPUT_CHARS (60)
]));
prismaMock.note.create.mockResolvedValueOnce({ id: "note_new", title: "Hello" });

const { req, res, writes } = makeStreamingReqRes({
  body: { templateNoteIds: ["note_t1"], problemId: "prob_1" },
});
await generateNoteFromTemplates(req, res);

const chunkLines = writes.filter((w) => "chunk" in w);
expect(chunkLines.length).toBeGreaterThanOrEqual(2);

// AUTHZ INVARIANT: the problem lookup must be team-scoped, not raw-by-id.
expect(prismaMock.problem.findFirst).toHaveBeenCalledTimes(1);
const probArg = prismaMock.problem.findFirst.mock.calls[0][0];
expect(probArg.where.id).toBe("prob_1");
expect(probArg.where.teamId).toEqual({ in: ["team_1", "team_2"] });

expect(prismaMock.note.create).toHaveBeenCalledTimes(1);
const createArg = prismaMock.note.create.mock.calls[0][0];
expect(createArg.data.userId).toBe("user_1");
expect(createArg.data.contentMarkdown).toMatch(/Hello[\s\S]*generated note body/);
// Linked-entity snapshot inherits from the team-scope-validated row, NOT from req.body raw
expect(createArg.data.linkedEntityType).toBe("PROBLEM");
expect(createArg.data.linkedEntityId).toBe("prob_1");
expect(createArg.data.linkedEntityTitle).toBe("Two Sum");

expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_new");

const lastLine = writes[writes.length - 1];
expect(lastLine).toMatchObject({ done: true, noteId: "note_new" });
expect(res.end).toHaveBeenCalled();
```

**T166 client-disconnect bails persist** (Lead Engineer I1 fold-in: reorder declarations so the generator can reference `closeFn` correctly; add `await Promise.resolve()` for deterministic ordering):
```js
prismaMock.note.findMany.mockResolvedValueOnce([
  { id: "note_t1", title: "Template", contentMarkdown: "Body" },
]);

// Declare closeFn FIRST so the generator can capture it by reference at
// definition time (Lead Engineer fold-in: avoids TDZ/hoisting fragility).
let closeFn;
let emittedClose = false;
async function* disconnectStream() {
  yield { choices: [{ delta: { content: "# Partial\n" } }] };
  // Microtask flush makes the close-handler timing deterministic — the
  // controller's `for await` loop checks `clientGone` at the top of each
  // iteration; we need the handler to fire AFTER yield 1 returns control
  // and BEFORE yield 2 is consumed.
  await Promise.resolve();
  if (!emittedClose) {
    closeFn();
    emittedClose = true;
  }
  yield { choices: [{ delta: { content: "more content" } }] };
}
aiMock.aiStream.mockResolvedValueOnce(disconnectStream());

const refs = makeStreamingReqRes({ body: { templateNoteIds: ["note_t1"] } });
closeFn = refs.emitClose;  // wire after refs exists
await generateNoteFromTemplates(refs.req, refs.res);

// Note: chunk 1 IS written (controller's sendLine fires before the next
// iteration's clientGone check). Only persist + scheduleNoteEmbedding bail.
expect(prismaMock.note.create).not.toHaveBeenCalled();
expect(notesEmbeddingMock.scheduleNoteEmbedding).not.toHaveBeenCalled();
expect(refs.res.end).toHaveBeenCalled();
```

**T167 too-short output:**
```js
prismaMock.note.findMany.mockResolvedValueOnce([
  { id: "note_t1", title: "Template", contentMarkdown: "Body" },
]);
aiMock.aiStream.mockResolvedValueOnce(chunkStream(["hi"]));  // < MIN_OUTPUT_CHARS

const { req, res, writes } = makeStreamingReqRes({
  body: { templateNoteIds: ["note_t1"] },
});
await generateNoteFromTemplates(req, res);

const errLine = writes.find((w) => w.code === "EMPTY_OUTPUT");
expect(errLine).toBeDefined();
expect(errLine.error).toMatch(/empty or too-short/i);
expect(prismaMock.note.create).not.toHaveBeenCalled();
expect(notesEmbeddingMock.scheduleNoteEmbedding).not.toHaveBeenCalled();
expect(res.end).toHaveBeenCalled();
```

---

## Test count target

- Baseline (post Sprint 6b): **1361**
- New tests in 6c: **+25**
- Target after 6c: **1386**

---

## Done criteria

- Pre-flight baseline 1361 confirmed
- All 25 new tests pass; full suite at **1386**
- `npm run lint` (server + client) + audits exit 0
- `prisma migrate status` returns "Database schema is up to date!"
- Client `npm run build` clean
- Feature branch FF-merged to main; both pushed
- Roadmap row 6c → ✅ shipped 2026-06-30 (and Sprint 6 cluster marked complete)
- Divergences (if any) captured in commit body with `T<id>: <expected> vs <actual> — <decision>`
- **4-role panel review** completed pre-implementation; CHANGES_REQUESTED items folded in (standing rule per `feedback_multi_agent_review_before_code.md`)
- Security-divergence escalation override (Sprint 6b lesson): T146, T150, T152, T154, T157, T159, T163 (ownership/authz gates) MUST escalate any divergence — never auto-update under "spec assumption wrong" branch

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — pure additive tests |
| Client impact | None |
| Test runtime impact | +25 mock-only tests, sub-300ms (slightly higher than 6b's 200ms due to streaming async generator overhead) |
| Backward compatibility | None |
| Rollback | Revert the three test files |
| Risk floor | Lowest of any sprint (matches 6b) |

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — all 25 tests have concrete code blocks or assertion lists |
| Internal consistency | 9 remaining exports + 1 streaming path = 25 tests across 3 files. Mock patterns A/B/C have distinct, justified concerns. Sprint 6a precedent inherited (hoisted mock + `mockReset()` + `requestId` envelope) |
| Scope | Tight: closes M31 completely (final notes-controller portion). Reads, AI features, streaming happy path. Mutations already done in 6b. notesFolders deferred indefinitely. Zod absence stays a 6+ follow-up |
| Ambiguity | Three explicit calls: (a) three files justified by mock-surface non-uniformity; (b) streaming `res` mock pattern documented with `write` capture + `emitClose` simulator; (c) `chunkStream` async-iterable helper documented |
| Adversarial review | Highest-signal regressions guarded: graceful LLM fallback (T156), mixed-authz searchLinkableEntities (T153), streaming client-disconnect (T166), too-short output (T167), quality-gate boundaries (T160, T164), persist invariants (T158). The 7 ownership-404 tests all assert `where.userId` per Sprint 6b's Security Manager lesson |
| Risk floor | Effectively zero. Pure additive tests; no production code change unless a divergence is surfaced. Security-relevant tests inherit Sprint 6b's escalation-not-auto-update override |
| Review panel | Will run 4-role panel on the plan before implementer dispatch |

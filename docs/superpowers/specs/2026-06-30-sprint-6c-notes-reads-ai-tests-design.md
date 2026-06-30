# Sprint 6c — Notes Reads + AI Features Test Foundation — Design Spec

**Date:** 2026-06-30
**Sprint:** 6c (third slice of decomposed Sprint 6 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** M31 (final portion — completes the notes surface)
**Branch:** `feat/notes-reads-ai-tests`
**Layers on:** main, post Sprint 6b (`8665b60`)
**Feature flag:** None — pure additive test work
**Review history:** Will require the standing 4-role panel review (PO + BA + Security Manager + Lead Engineer) on the implementation plan BEFORE implementer dispatch, per `feedback_multi_agent_review_before_code.md`.

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

### Pattern B — `notes.ai.test.js` (adds `aiComplete` + embedding-search + env override)

```js
const prismaMock = vi.hoisted(() => ({
  note: { findFirst: vi.fn(), update: vi.fn() },
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
  getRelatedForNote, generateNoteSummary, generateNoteFlashcards, suggestNoteTags,
} = await import("../../src/controllers/notes.controller.js");
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

**T143 listNotes happy default:**
```js
prismaMock.note.findMany.mockResolvedValueOnce([]);
const { req, res } = mockReqRes({});
await listNotes(req, res);
expect(res.status).not.toHaveBeenCalled();  // success() doesn't call status()
const json = res.json.mock.calls[0][0];
expect(json.success).toBe(true);
expect(json.data.notes).toEqual([]);
expect(json.data.nextCursor).toBeNull();
const arg = prismaMock.note.findMany.mock.calls[0][0];
expect(arg.where).toMatchObject({ userId: "user_1", archivedAt: null });
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

**T145 listNotes cursor pagination:**
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

**T148 listTags ordering + excludes archived:**
```js
prismaMock.note.findMany.mockResolvedValueOnce([
  { tags: ["a", "a", "b"] },  // dupe-within-row possible
  { tags: ["a", "c"] },
  { tags: ["b"] },
]);
const { req, res } = mockReqRes({});
await listTags(req, res);
const json = res.json.mock.calls[0][0];
// "a" appears 3 times (across rows + within), "b" 2, "c" 1
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

**T149 listTags top-50 cap:**
```js
// Generate 60 distinct tags across 60 notes (one tag per note).
const rows = Array.from({ length: 60 }, (_, i) => ({ tags: [`tag${i}`] }));
prismaMock.note.findMany.mockResolvedValueOnce(rows);
const { req, res } = mockReqRes({});
await listTags(req, res);
expect(res.json.mock.calls[0][0].data.tags.length).toBe(50);
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

**T153 searchLinkableEntities PROBLEM team-scoped authz:**
```js
prismaMock.teamMembership.findMany.mockResolvedValueOnce([
  { teamId: "team_1" }, { teamId: "team_2" },
]);
prismaMock.problem.findMany.mockResolvedValueOnce([
  { id: "prob_1", title: "Two Sum", difficulty: "EASY", category: "CODING" },
]);
const { req, res } = mockReqRes({ query: { type: "PROBLEM", q: "two" } });
await searchLinkableEntities(req, res);
const arg = prismaMock.problem.findMany.mock.calls[0][0];
// AUTHZ INVARIANT: PROBLEM is team-scoped via teamId IN userTeamIds, NOT user-scoped
expect(arg.where.teamId).toEqual({ in: ["team_1", "team_2"] });
expect(arg.where.userId).toBeUndefined();
```

**T154-T156 getRelatedForNote** — full code blocks structured per the Section 3 plan. Each independently configures `aiMock.aiComplete` to return: valid (T155), invalid (T156), or — for T154 ownership 404 — never reached. Assertions:
- T155: `data.aiGenerated === true`, `relatedNotes[0].rationale` from the LLM payload, `relatedProblems` ordered by LLM rank
- T156: `data.aiGenerated === false`, ranking is `buildFallbackNoteRelated` output (raw similarity, no LLM rationale), endpoint still returns 200

**T157-T158 generateNoteSummary**:
- T157 ownership 404 with `where.userId` assertion
- T158 happy: assert `prisma.note.update` called with `data: {summary: <payload>, summaryGeneratedAt: <Date>}`, `where: { id: "note_1" }`

**T159-T162 generateNoteFlashcards** — 4 tests covering full surface:
- T159 ownership 404
- T160 quality gate: content "Short content" → 400, `aiComplete` NOT called
- T161 happy: valid drafts payload → response `data.drafts.length > 0`, `data.fallback === false`
- T162 validator fallback: invalid drafts payload → `data.fallback === true`, `data.fallbackReason` starts with `"validator:"`

**T163-T164 suggestNoteTags**:
- T163 ownership 404
- T164 quality gate (chars < 60): 400, message matches `/too thin for tag suggestions/i`

### File 3 — `notes.stream.test.js` (T165-T167)

**T165 streaming happy:**
```js
prismaMock.note.findMany.mockResolvedValueOnce([
  { id: "note_t1", title: "Template", contentMarkdown: "Body content here." },
]);
aiMock.aiStream.mockResolvedValueOnce(chunkStream([
  "# Hello\n\n",
  "This is the generated note body. ".repeat(5),  // total > MIN_OUTPUT_CHARS (60)
]));
prismaMock.note.create.mockResolvedValueOnce({ id: "note_new", title: "Hello" });

const { req, res, writes } = makeStreamingReqRes({
  body: { templateNoteIds: ["note_t1"] },
});
await generateNoteFromTemplates(req, res);

const chunkLines = writes.filter((w) => "chunk" in w);
expect(chunkLines.length).toBeGreaterThanOrEqual(2);

expect(prismaMock.note.create).toHaveBeenCalledTimes(1);
const createArg = prismaMock.note.create.mock.calls[0][0];
expect(createArg.data.userId).toBe("user_1");
expect(createArg.data.contentMarkdown).toMatch(/Hello[\s\S]*generated note body/);

expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledTimes(1);
expect(notesEmbeddingMock.scheduleNoteEmbedding).toHaveBeenCalledWith("note_new");

const lastLine = writes[writes.length - 1];
expect(lastLine).toMatchObject({ done: true, noteId: "note_new" });
expect(res.end).toHaveBeenCalled();
```

**T166 client-disconnect bails persist:**
```js
prismaMock.note.findMany.mockResolvedValueOnce([
  { id: "note_t1", title: "Template", contentMarkdown: "Body" },
]);
// Yield 1 chunk, then test code emits close before next iteration
let emittedClose = false;
async function* disconnectStream() {
  yield { choices: [{ delta: { content: "# Partial\n" } }] };
  if (!emittedClose) {
    refs.emitClose();
    emittedClose = true;
  }
  yield { choices: [{ delta: { content: "more content" } }] };
}
aiMock.aiStream.mockResolvedValueOnce(disconnectStream());

const refs = makeStreamingReqRes({ body: { templateNoteIds: ["note_t1"] } });
await generateNoteFromTemplates(refs.req, refs.res);

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

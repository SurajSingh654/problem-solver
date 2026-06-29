# H6 NotesAiTemplate Envelope Fix + Tests — Design Spec (Sprint 6a)

**Date:** 2026-06-29
**Sprint:** 6a (first slice of decomposed Sprint 6 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** H6 (HIGH); M31 partial (`generateNoteFromTemplates` portion)
**Branch:** `feat/h6-notes-ai-template-envelope`
**Layers on:** main, post Sprint 5c (`c85a108`)
**Feature flag:** None — production change is a narrow envelope refactor; tests are additive

---

## Problem

Sprint 1 audit, HIGH finding H6 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:90-93`):

> `notesAiTemplate.controller.js:66, 80, 95, 110, 121, 136, 157, 182, 192` — 9 call sites use `res.status(...).json({...})` directly. No `requestId`. Inconsistent shape vs `error()` helper.
>
> Failure scenario: Client error-extraction utilities (`extractErrorMessage`, `extractErrorCode`) silently fail on these responses; ops can't correlate user-reported errors with server logs.

### Zero-trust verification

`grep -n "res\.status(.*)\.json" notesAiTemplate.controller.js` confirms 9 sites at the exact line numbers the audit named. Each follows the same pattern:

```js
return res.status(N).json({
  success: false,
  error: { message: "..." },
});
```

Missing from each: the `requestId` field that `error()` (from `utils/response.js`) automatically includes from `res.req?.requestId`. The CLAUDE.md envelope contract states error responses should include `error.requestId` for end-to-end tracing (client toast → server logs).

The `error()` helper at `utils/response.js:44-71` does exactly this auto-inclusion. The fix is to import it + replace each manual envelope with a call.

### Why this matters (per audit)

- `requestId` enables ops to grep server logs for the specific request that produced a user-reported error.
- Client-side `extractErrorMessage()` / `extractErrorCode()` / `extractRequestId()` utilities (in `client/src/services/api.js`) expect the canonical envelope shape. The manual shapes work by accident for `extractErrorMessage` (because `error.message` matches) but silently miss `extractRequestId`.

---

## Principle

**Pure structural fix.** Convert 9 raw envelopes to use the canonical `error()` helper. No behavior change beyond adding `requestId` to each error response. Add 6 tests that lock in the `requestId` field as a regression guard.

The NDJSON streaming-side error sends at lines 240, 266, 280 are NOT envelope responses — they use `sendLine(res, { error: "...", code: "..." })` which writes a single NDJSON line over the already-streaming chunked response. Different protocol. Out of scope.

---

## Scope

### In scope

**Production fix:**
- Add `import { error } from "../utils/response.js";` to `notesAiTemplate.controller.js`
- Convert 9 sites from `res.status(N).json({ success: false, error: { message } })` to `error(res, message, N)`

**Test additions (6 new tests, T115-T120):**

| # | Site(s) covered | Test |
| --- | --- | --- |
| T115 | Line 66 | `templateNoteIds` not array / too short / too long → 400 + envelope + requestId |
| T116 | Line 80 | Templates not found (user doesn't own one) → 404 + envelope + requestId |
| T117 | Line 95 | `topicFocus` not a string → 400 + envelope + requestId |
| T118 | Lines 110, 121 | `problemId` not a string OR problem not accessible → 400/404 + envelope + requestId |
| T119 | Lines 136, 157 | `includeSubmission` without problem OR no submission exists → 400 + envelope + requestId |
| T120 | Lines 182, 192 | `targetFolderId` invalid OR folder not found → 400/404 + envelope + requestId |

All 9 sites covered (some sites grouped per test).

### Out of scope (carved)

- **The 16 `notes.controller.js` exports** → Sprint 6b (mutations) + 6c (reads + AI features)
- **Streaming success path** for `generateNoteFromTemplates` (NDJSON write + persist) → Sprint 6c
- **NDJSON-side error sends** (lines 240, 266, 280) — different protocol, already correct
- **`extractErrorMessage` / `extractRequestId` client utilities** — those test the receiving end; server-side fix is the source of truth
- **Schema migration / API surface change** — none

---

## Architecture

```
server/src/controllers/notesAiTemplate.controller.js   [MODIFIED]
  - Import { error } from "../utils/response.js"
  - 9 sites: res.status(N).json({...}) → error(res, msg, N)

server/test/controllers/notesAiTemplate.test.js        [NEW — 6 tests T115-T120]
```

**Unchanged:**
- `notes.controller.js`, `notes.embedding.js`, all other production code
- All existing test files (`notes.controller.test.js`, `notes.delete-cancel.test.js`, `notes.embedding.test.js`, `solutions.*` etc.)
- The 3 NDJSON streaming-side `sendLine(res, { error })` paths in `notesAiTemplate.controller.js` (lines 240, 266, 280)

---

## Production change detail

### Single import addition

```js
// Top of notesAiTemplate.controller.js, after existing imports:
import { error } from "../utils/response.js";
```

### Site conversions (all 9 identical pattern)

```js
// BEFORE — line 66 example
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

Each conversion:
- Preserves the existing message string verbatim
- Preserves the existing status code (400 or 404)
- Drops the manual `success: false` + `error: { message }` envelope (the helper handles it)
- Auto-adds `requestId` to the response envelope

### What does NOT change

- The 3 NDJSON streaming-error sends at lines 240, 266, 280 use `sendLine(res, { error: "...", code: "..." })` — different protocol (NDJSON line over chunked response), not the JSON envelope shape. These already-correct sends stay untouched.
- All success paths unchanged.
- All status codes unchanged (each 400 stays 400, each 404 stays 404).

---

## Test design

### File: `server/test/controllers/notesAiTemplate.test.js` (NEW)

Mock pattern:

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

beforeEach(() => { vi.clearAllMocks(); });
```

### Per-test design

**T115 — templateNoteIds validation (line 66):**

```js
it("test 115: rejects invalid templateNoteIds with 400 + envelope + requestId", async () => {
  const { req, res } = mockReqRes({ body: { templateNoteIds: [] } });  // empty array
  await generateNoteFromTemplates(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  const jsonArg = res.json.mock.calls[0][0];
  expect(jsonArg.success).toBe(false);
  expect(jsonArg.error.message).toMatch(/templateNoteIds must be 1.{1,3}3/);
  expect(jsonArg.error.requestId).toBe("req_test_h6");  // H6 regression guard
});
```

**T116 — templates not found (line 80):**

```js
it("test 116: 404 when templates not found (user doesn't own one)", async () => {
  prismaMock.note.findMany.mockResolvedValueOnce([
    { id: "note_owned", title: "T1", contentMarkdown: "..." },
    // Missing note_other_user — user doesn't own all of them
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
```

**T117 — topicFocus type validation (line 95):**

```js
it("test 117: rejects non-string topicFocus with 400 + envelope", async () => {
  prismaMock.note.findMany.mockResolvedValueOnce([
    { id: "note_1", title: "T", contentMarkdown: "..." },
  ]);

  const { req, res } = mockReqRes({
    body: { templateNoteIds: ["note_1"], topicFocus: 123 },  // not a string
  });
  await generateNoteFromTemplates(req, res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].error.message).toMatch(/topicFocus.*string/i);
  expect(res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
});
```

**T118 — problemId type / accessibility (lines 110, 121):**

Two sub-cases — covered together by parameterizing the body:

```js
it("test 118: rejects invalid problemId (type 400 + accessibility 404)", async () => {
  prismaMock.note.findMany.mockResolvedValue([
    { id: "note_1", title: "T", contentMarkdown: "..." },
  ]);

  // Sub-case A: problemId is not a string
  const A = mockReqRes({ body: { templateNoteIds: ["note_1"], problemId: 42 } });
  await generateNoteFromTemplates(A.req, A.res);
  expect(A.res.status).toHaveBeenCalledWith(400);
  expect(A.res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");

  // Sub-case B: problemId is a string but not accessible
  prismaMock.problem.findFirst.mockResolvedValueOnce(null);
  const B = mockReqRes({ body: { templateNoteIds: ["note_1"], problemId: "prob_other_team" } });
  await generateNoteFromTemplates(B.req, B.res);
  expect(B.res.status).toHaveBeenCalledWith(404);
  expect(B.res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
});
```

**T119 — includeSubmission preconditions (lines 136, 157):**

```js
it("test 119: includeSubmission rejects when no problem OR no submission exists", async () => {
  prismaMock.note.findMany.mockResolvedValue([
    { id: "note_1", title: "T", contentMarkdown: "..." },
  ]);

  // Sub-case A: includeSubmission without problemId
  const A = mockReqRes({
    body: { templateNoteIds: ["note_1"], includeSubmission: true },
  });
  await generateNoteFromTemplates(A.req, A.res);
  expect(A.res.status).toHaveBeenCalledWith(400);
  expect(A.res.json.mock.calls[0][0].error.message).toMatch(/Pick a Problem first/i);
  expect(A.res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");

  // Sub-case B: includeSubmission with problem but no submission
  prismaMock.problem.findFirst.mockResolvedValueOnce({
    id: "prob_1", title: "Two Sum", difficulty: "EASY", description: "...",
  });
  prismaMock.solution.findFirst.mockResolvedValueOnce(null);
  const B = mockReqRes({
    body: { templateNoteIds: ["note_1"], problemId: "prob_1", includeSubmission: true },
  });
  await generateNoteFromTemplates(B.req, B.res);
  expect(B.res.status).toHaveBeenCalledWith(400);
  expect(B.res.json.mock.calls[0][0].error.message).toMatch(/haven't submitted/i);
  expect(B.res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
});
```

**T120 — targetFolderId validation (lines 182, 192):**

```js
it("test 120: rejects invalid targetFolderId (type 400 + accessibility 404)", async () => {
  prismaMock.note.findMany.mockResolvedValue([
    { id: "note_1", title: "T", contentMarkdown: "..." },
  ]);

  // Sub-case A: targetFolderId is not a string
  const A = mockReqRes({
    body: { templateNoteIds: ["note_1"], targetFolderId: 99 },
  });
  await generateNoteFromTemplates(A.req, A.res);
  expect(A.res.status).toHaveBeenCalledWith(400);
  expect(A.res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");

  // Sub-case B: targetFolderId is a string but not owned
  prismaMock.noteFolder.findFirst.mockResolvedValueOnce(null);
  const B = mockReqRes({
    body: { templateNoteIds: ["note_1"], targetFolderId: "folder_other_user" },
  });
  await generateNoteFromTemplates(B.req, B.res);
  expect(B.res.status).toHaveBeenCalledWith(404);
  expect(B.res.json.mock.calls[0][0].error.requestId).toBe("req_test_h6");
});
```

### Why `requestId` is THE regression guard

All 6 tests assert `error.requestId === "req_test_h6"`. This field is **missing** in the pre-H6-fix envelope. If a future refactor reverts a site to raw `res.status().json({...})`, that test fails. The `requestId` assertion encodes the H6 contract.

---

## Test count target

- Baseline (post Sprint 5c): **1333**
- New tests in 6a: **+6**
- Target after 6a: **1339**

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | Error responses now include `requestId` field. Status codes unchanged. Message text unchanged. Client error-extraction utilities (`extractMessage`) work as before; `extractRequestId` now returns actual values. |
| Streaming protocol | Unaffected. NDJSON sends at lines 240, 266, 280 stay as `sendLine(res, { error, code })` — different protocol from envelope. |
| Backward compatibility | Existing clients parse `error.message` — unchanged. `error.requestId` is additive (optional in CLAUDE.md envelope contract). |
| Rollback | Single PR. Revert if needed. No DB migration. |
| Risk floor | Low — narrow production change (9 sites, identical pattern) + additive tests. |

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — production change is one-line per site, tests have concrete assertions |
| Internal consistency | 9 sites listed with exact line numbers + status codes. 6 tests cover all 9 sites (some grouped via sub-cases). Test IDs T115-T120 contiguous with prior T1-T114. |
| Scope | Tight: H6 fix + `generateNoteFromTemplates` test foundation. `notes.controller.js` 16 exports → 6b + 6c. Streaming success path → 6c. NDJSON streaming-side error sends NOT touched. |
| Ambiguity | Two explicit calls: (a) NDJSON streaming-side error sends at lines 240, 266, 280 are NOT envelope responses — different protocol, already correct; (b) `res.req = req` wire-up in test fixture is required for the `error()` helper to find requestId. |
| Adversarial review | The `error()` helper reads `res.req?.requestId`. If a test forgets to wire `res.req`, the assertion `error.requestId === "req_test_h6"` fails — surfacing the wire-up mistake. The `requestId` assertion is the regression guard; without it, the tests would still pass on the pre-H6 broken code (the messages are identical). |
| Risk floor | Low. Single PR, single import, 9 identical-pattern conversions, 6 additive tests. |

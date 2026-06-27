# Embedding Service Test Foundation — Design Spec (Sprint 4.3)

**Date:** 2026-06-27
**Sprint:** 4.3 (final slice of Sprint 4 cluster per `2026-06-20-refactor-redesign-sprint.md`)
**Audit finding closed:** H14
**Branch:** `feat/embedding-service-tests`
**Layers on:** main, post Sprint 4.2c (`abb9b84`)
**Feature flag:** None — pure additive test work; no production code changes

---

## Problem

Sprint 1 audit, HIGH finding H14 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` lines 131-133):

> `server/src/services/embedding.service.js` — `generateEmbedding()` only ever mocked in ai.review tests. No isolation tests: dimension correctness, null/empty text handling, rate-limit/fallback behavior.

After Sprints 4.1 / 4.2a / 4.2b / 4.2c, partial coverage exists:

- `embedAndPersist` — 7 tests (Sprint 4.2a)
- `findProblemsByNoteEmbedding` — 2 M16 tests (Sprint 4.2a)
- `generateEmbedding` — 1 M15 env-var test (Sprint 4.2a)

Gap inventory of what's still uncovered as standalone unit tests:

| Function | Standalone tests today | Audit-relevant gap |
| --- | --- | --- |
| `generateEmbedding` | 1 (env var lock-in) | null/empty input, error path, 8000-char truncation |
| `buildSolutionText` | 0 | All — pure function with 10+ conditional fields |
| `buildProblemText` | 0 | All — defensive `tags`/`companyTags` parsing |
| `buildNoteText` | 0 | All — null-field skipping |
| `findSimilarNotes` | 0 | All — DB throw handling, custom limit |
| `isEmbeddingEnabled` | 0 | All — env-var combinations |

---

## Principle

**Pure additive test work.** No production code changes. Close the audit's letter (generateEmbedding edge cases) AND spirit (cover the still-untouched exports) without bloating into duplicative tests of things already covered elsewhere.

The text builders are the most valuable lock-in: they have non-trivial conditional logic (especially `buildSolutionText`'s 10+ fields + categorySpecificData flattening + code truncation, and `buildProblemText`'s defensive parsing of `tags` as JSON-string or array). Regressions in these would silently corrupt every embedding's text without any other test catching it.

---

## Scope

### In scope

19 new tests across 4 files:

- **`embedding.generateEmbedding.test.js`** (EXTEND from 1 → 5 tests): null/empty/whitespace input, OpenAI throw, 8000-char truncation.
- **`embedding.textBuilders.test.js`** (NEW — 9 tests): pure-function unit tests for `buildSolutionText`, `buildProblemText`, `buildNoteText`.
- **`embedding.findSimilarNotes.test.js`** (NEW — 3 tests): happy path, DB throw, custom limit.
- **`embedding.isEmbeddingEnabled.test.js`** (NEW — 3 tests): env-var combinations.

### Out of scope (carved deliberately)

- **`embedAndPersist`** — 7 tests in `embedding.embedAndPersist.test.js` from Sprint 4.2a. Fully covered.
- **`KNOWN_ENTITY_TYPES`** — derived from `Object.keys(ENTITY_CONFIG)`. Tested implicitly via outbox dispatch tests in Sprint 4.1.
- **`embedAllExisting`** — manual batch recovery tool. Iteration + dispatch logic already covered by embedAndPersist tests; standalone tests would re-verify the same code path.
- **Additional `findProblemsByNoteEmbedding` cases** beyond the 2 M16 tests. The M16 pre-check is the audit-relevant behavior. Trivial defensive checks (empty `teamIds`, custom limit) don't add signal.
- **Real OpenAI integration tests** — mocked everywhere. Dimension assertions on a mocked embedding would verify our own mock.
- **Real Postgres integration tests** — pgvector behavior is built-in; mocked Prisma is sufficient.

---

## Per-file test design

### 1. `embedding.generateEmbedding.test.js` (EXTEND)

The file currently has `T36` (M15 env-var lock-in). Add 4 tests below the existing one.

```js
// Existing test fixture (recap)
const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: "sk-test-key",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("../../src/config/env.js", () => envMock);

const oaiCalls = vi.hoisted(() => ({ embeddings: [], shouldThrow: false }));
vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor() {
      this.embeddings = {
        create: vi.fn(async (args) => {
          oaiCalls.embeddings.push(args);
          if (oaiCalls.shouldThrow) throw new Error("OpenAI down");
          return { data: [{ embedding: [0.1, 0.2, 0.3] }] };
        }),
      };
    }
  },
}));

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));

const { generateEmbedding } = await import(
  "../../src/services/embedding.service.js"
);
```

New tests:

| # | Test | Assertion |
| --- | --- | --- |
| T37 | Empty string `""` → `null` without OpenAI call | `oaiCalls.embeddings` stays empty |
| T38 | Whitespace-only `"   "` → `null` without OpenAI call | Same |
| T39 | OpenAI throws → returns `null` + logs `[Embedding] Generation failed:` | `console.error` spy captures the prefix |
| T40 | Input >8000 chars → truncated to 8000 before send | Pass 10000-char input of non-whitespace chars; assert `oaiCalls.embeddings[0].input.length === 8000` |

### 2. `embedding.textBuilders.test.js` (NEW — 9 tests)

Pure-function tests. No DB or OpenAI activity. Module-load-time mocks for prisma + env + openai to make the import succeed.

```js
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));
vi.mock("../../src/config/env.js", () => ({
  OPENAI_API_KEY: "sk-test",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.embeddings = { create: vi.fn() };
    }
  },
}));

const { buildSolutionText, buildProblemText, buildNoteText } = await import(
  "../../src/services/embedding.service.js"
);
```

`buildSolutionText` — 4 tests:

| # | Test | Assertion |
| --- | --- | --- |
| T41 | Minimal solution (no problem context, only `approach`) | Output is non-empty; no crashes on missing problem fields |
| T42 | Full solution + problem populated | Output contains every field line (Problem, Difficulty, Category, Patterns, Brute Force, Optimized, Time, Space, Key Insight, Explanation, Code); joined with `\n` |
| T43 | `categorySpecificData` flattening + 2000-char cap | CSD object with string + non-string fields; assert only strings flattened, capped at 2000 chars |
| T44 | `code` > 1000 chars truncated | `Code:` line contains exactly the first 1000 chars |

`buildProblemText` — 3 tests:

| # | Test | Assertion |
| --- | --- | --- |
| T45 | Minimal problem (only `title`) | Output is `Title: ...`; no crash on missing fields |
| T46 | `tags` as JSON-encoded string (legacy data shape) | Parses + emits `Tags: tag1, tag2` |
| T47 | `tags` as array + `companyTags` populated | Emits both `Tags: ...` and `Companies: ...` |

`buildNoteText` — 2 tests:

| # | Test | Assertion |
| --- | --- | --- |
| T48 | Minimal note (only `title`) | Output is `Title: ...` |
| T49 | Null fields skipped (everything except `title` is null/empty) | Output is just `Title: ...` with no empty sections |

### 3. `embedding.findSimilarNotes.test.js` (NEW — 3 tests)

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/config/env.js", () => ({
  OPENAI_API_KEY: "sk-test",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));

vi.mock("openai", () => ({
  default: class { constructor() { this.embeddings = { create: vi.fn() }; } },
}));

const { findSimilarNotes } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});
```

| # | Test | Assertion |
| --- | --- | --- |
| T50 | Happy path → returns rows from the cross-note query | Mock prisma resolves with 3 rows; `findSimilarNotes("note_1", "user_1", 5)` returns those rows |
| T51 | DB throws → returns `[]`, logs `[Embedding] Similar notes search failed:` | Mock prisma rejects; assert empty array + captured log |
| T52 | Custom `limit` parameter passed as 3rd positional arg | `findSimilarNotes("note_1", "user_1", 10)`; assert `prismaMock.$queryRawUnsafe.mock.calls[0][3] === 10` |

### 4. `embedding.isEmbeddingEnabled.test.js` (NEW — 3 tests)

`isEmbeddingEnabled` reads `process.env.AI_ENABLED` and `process.env.OPENAI_API_KEY` directly (NOT through env.js). Tests manipulate `process.env` with restore.

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));
vi.mock("../../src/config/env.js", () => ({
  OPENAI_API_KEY: "sk-test",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("openai", () => ({
  default: class { constructor() { this.embeddings = { create: vi.fn() }; } },
}));

const { isEmbeddingEnabled } = await import(
  "../../src/services/embedding.service.js"
);

const ORIGINAL_AI_ENABLED = process.env.AI_ENABLED;
const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  process.env.AI_ENABLED = ORIGINAL_AI_ENABLED;
  process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
});
```

| # | Test | Assertion |
| --- | --- | --- |
| T53 | Both set → `true` | `process.env.AI_ENABLED = "true"; process.env.OPENAI_API_KEY = "sk-test"`; `isEmbeddingEnabled() === true` |
| T54 | `AI_ENABLED=false` → `false` | Even with `OPENAI_API_KEY` set |
| T55 | `OPENAI_API_KEY` missing → `false` | Even with `AI_ENABLED=true`. Use `delete process.env.OPENAI_API_KEY` |

---

## Test count target

- Baseline (post Sprint 4.2c): **1256**
- New tests: +19
- Target after Sprint 4.3: **1275**

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — pure additive tests |
| Production code | Untouched. `embedding.service.js` is read-only for this sprint. |
| Latency | None |
| Test runtime impact | +19 mock-only tests, <1s suite-time delta |
| Backward compatibility | None — no API surface change |
| Rollback | Revert the test files. Trivial. |
| Risk floor | Lowest in the Sprint 4 cluster. |

---

## Backward compatibility

- Production code unchanged. All existing tests continue passing.
- No new dependencies. Mock patterns match existing Sprint 4.x test files.

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None. Every test has concrete assertions + concrete fixtures. |
| Internal consistency | Test counts: 4 + 9 + 3 + 3 = 19. Numbering T37-T55 contiguous; doesn't collide with existing T1-T36. |
| Scope | Tight: 4 files, 19 tests. `embedAndPersist` + `KNOWN_ENTITY_TYPES` + `embedAllExisting` + additional `findProblemsByNoteEmbedding` cases explicitly carved out with reasoning. |
| Ambiguity | Two explicit calls: (a) `isEmbeddingEnabled` reads `process.env` directly (not env.js), so tests manipulate `process.env` with beforeEach restore — NOT the env.js mock pattern; (b) text-builder tests use module-load-time mocks for prisma/env/openai because the import pulls them in even though the pure functions don't use them. |
| Adversarial review | T40 (8000-char truncation): the assertion `input.length === 8000` requires the test fixture to NOT have leading/trailing whitespace (since `text.trim().slice(0, 8000)` trims first). Test uses 10000 non-whitespace chars to keep the assertion clean. T55 (`OPENAI_API_KEY` missing): uses `delete process.env.OPENAI_API_KEY` rather than `=""` because `isEmbeddingEnabled` uses `!!process.env.OPENAI_API_KEY` which `""` would also falsify, but `delete` is the more accurate "missing" signal. |
| Risk floor | Lowest of any Sprint 4 sprint. Pure additive tests. Single PR. Revertable. |

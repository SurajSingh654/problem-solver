# Sprint 4.2a — Embedding Write-Path Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the 3 duplicated embedding write paths into one polymorphic `embedAndPersist` function, fix three narrow audit findings (M10 cancel-on-delete, M15 wire AI_EMBEDDING_MODEL env, M16 source-embedding pre-check), and remove dead embedding exports.

**Architecture:** A new public `embedAndPersist(entityType, entityId)` in `embedding.service.js` owns the load → buildText → generateEmbedding → SQL UPDATE → enqueue-on-failure pipeline. Polymorphism via an internal `ENTITY_CONFIG` map keyed on `"Solution" | "Problem" | "Note"`. The outbox's `DISPATCH` map collapses to a single lazy import of `embedAndPersist`. Controller wrappers become 4-line shims that gate on AI_ENABLED then delegate. The notes debouncer in `notes.embedding.js` gains a `cancelNoteEmbedding(noteId)` sibling called from `deleteNotePermanent`.

**Tech Stack:** Node 20 + Express 4, Prisma 5, vitest with mocked Prisma + mocked OpenAI client.

**Spec:** [`docs/superpowers/specs/2026-06-25-embedding-write-path-consolidation-design.md`](../specs/2026-06-25-embedding-write-path-consolidation-design.md)

**Branch:** `feat/embedding-write-path-consolidation`

**Baseline test count:** 1224 (post Sprint 4.1, commit `7ec69a1`). Capture exact in Task 0. Target after this sprint: **1239** (+15 new, existing tests adapt without count change).

---

## File map (locked decisions, not aspirational)

**Modify:**

- `server/src/services/embedding.service.js` — add `ENTITY_CONFIG` + `embedAndPersist`; wire `AI_EMBEDDING_MODEL` in `generateEmbedding`; add source pre-check in `findProblemsByNoteEmbedding`; delete `findSimilarSolutions` / service-level `findSimilarProblems` / `searchSolutionsByText` / `embedSolution` / `embedProblem` / `embedNote`; update `embedAllExisting` to call `embedAndPersist`; update file header docstring.
- `server/src/services/notes.embedding.js` — add `cancelNoteEmbedding` export; update debouncer body to call `embedAndPersist("Note", noteId)`.
- `server/src/services/embedding.outbox.js` — remove `DISPATCH` map; replace with lazy-import call to `embedAndPersist`.
- `server/src/controllers/solutions.controller.js` — collapse `generateSolutionEmbedding` to 4-line wrapper.
- `server/src/controllers/problems.controller.js` — collapse `generateProblemEmbedding` to 4-line wrapper.
- `server/src/controllers/notes.controller.js` — add `cancelNoteEmbedding` import and call inside `deleteNotePermanent`.

**Adapt (existing tests):**

- `server/test/controllers/solutions.embedding-outbox.test.js` — mocks shift from `embedding.service` (raw `generateEmbedding` + `prisma.$executeRawUnsafe`) to mocking `embedAndPersist`. Same 3 behavioral assertions retained.
- `server/test/controllers/problems.embedding-outbox.test.js` — same.
- `server/test/services/embedding.outbox.test.js` — `DISPATCH`-related mocks shift from `embedSolution` / `embedProblem` / `embedNote` to mocking `embedAndPersist` directly. Same 14 tests retained.

**Create:**

- `server/test/services/notes.embedding.test.js` — 4 tests (22-25) for the debouncer + cancel.
- `server/test/controllers/notes.delete-cancel.test.js` — 1 test (26) for `deleteNotePermanent` calling cancel.
- `server/test/services/embedding.embedAndPersist.test.js` — 7 tests (27-33) for the unified writer.
- `server/test/services/embedding.findProblemsByNote.test.js` — 2 tests (34, 35) for M16 pre-check behavior.
- `server/test/services/embedding.generateEmbedding.test.js` — 1 test (36) for M15 env var lock-in.

**Roadmap:**

- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — split Sprint 4.2 row into 4.2a (✅ shipped) + 4.2b (queued) + 4.2c (queued).

---

## Task 0: Pre-flight — branch + baseline test count

**Files:** none modified — environment + baseline capture only.

- [ ] **Step 1: Confirm on `main` and clean working tree**

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `main`, last commit `863102f` (the design spec for 4.2a). Working tree may show pre-existing untracked artifacts (`.claude/settings.json`, `docs/leetcode/*`, etc) — leave them alone.

- [ ] **Step 2: Create and check out the feature branch**

Run:
```bash
git checkout -b feat/embedding-write-path-consolidation
```
Expected: `Switched to a new branch 'feat/embedding-write-path-consolidation'`.

- [ ] **Step 3: Capture baseline test count**

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests   1224 passed`. Record the exact count. After this sprint the count should be `baseline + 15`.

- [ ] **Step 4: Verify pre-push gates are green today (sanity)**

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```
Expected: all exit 0, audit "found 0 vulnerabilities", `Database schema is up to date.`

NO commits in this task — pre-flight only.

---

## Task 1: M15 (wire env var) + M16 (source pre-check)

These two narrow audit fixes are independent of the refactor and easiest to land first as clean standalone commits.

**Files:**
- Modify: `server/src/services/embedding.service.js` (3 distinct edits)
- Create: `server/test/services/embedding.generateEmbedding.test.js` (test 36)
- Create: `server/test/services/embedding.findProblemsByNote.test.js` (tests 34, 35)

- [ ] **Step 1: Write test 36 (M15 — RED)**

Create `server/test/services/embedding.generateEmbedding.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

// Module-level hoisted state we can mutate from each test
const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: "sk-test-key",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));

vi.mock("../../src/config/env.js", () => envMock);

// Track the args passed to OpenAI's embeddings.create
const oaiCalls = vi.hoisted(() => ({ embeddings: [] }));

vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor(opts) {
      this.opts = opts;
      this.embeddings = {
        create: vi.fn(async (args) => {
          oaiCalls.embeddings.push(args);
          return { data: [{ embedding: [0.1, 0.2, 0.3] }] };
        }),
      };
    }
  },
}));

// Mock prisma so the embedding.service.js import doesn't pull the real client
vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));

const { generateEmbedding } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  oaiCalls.embeddings.length = 0;
});

describe("generateEmbedding — M15 env var lock-in", () => {
  it("test 36: passes AI_EMBEDDING_MODEL from env to OpenAI", async () => {
    envMock.AI_EMBEDDING_MODEL = "text-embedding-3-small";
    const result = await generateEmbedding("hello world");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(oaiCalls.embeddings).toHaveLength(1);
    expect(oaiCalls.embeddings[0].model).toBe("text-embedding-3-small");
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.generateEmbedding.test.js
```
Expected: FAIL — `oaiCalls.embeddings[0].model` is the hardcoded literal, BUT the test's env mock asserts the same value `text-embedding-3-small`. Verify it actually exercises the env var by temporarily setting `envMock.AI_EMBEDDING_MODEL = "test-marker-model"` and re-running — should still fail because the code hardcodes the literal. Then revert the temporary marker.

(If asserting the existing hardcoded literal makes the test green falsely, the test is wrong. The robust shape is to assert that the env-var-driven value is what's passed — which means flipping the env to `"test-marker-model"` and asserting THAT value reaches OpenAI. Use that variant instead.)

**Use this stronger test 36 instead** (replaces the placeholder above):

```js
describe("generateEmbedding — M15 env var lock-in", () => {
  it("test 36: passes AI_EMBEDDING_MODEL from env to OpenAI", async () => {
    envMock.AI_EMBEDDING_MODEL = "test-marker-model-3-xlarge";
    const result = await generateEmbedding("hello world");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(oaiCalls.embeddings).toHaveLength(1);
    expect(oaiCalls.embeddings[0].model).toBe("test-marker-model-3-xlarge");
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.generateEmbedding.test.js
```
Expected: FAIL — assertion `model === "test-marker-model-3-xlarge"` fails because the code still hardcodes `"text-embedding-3-small"`.

- [ ] **Step 2: Implement M15 (GREEN)**

Edit `server/src/services/embedding.service.js`:

```js
// HEADER COMMENT — replace the existing 5-line header at the top
/**
 * EMBEDDING SERVICE — Generate and store vector embeddings.
 *
 * Default model: text-embedding-3-small (1536 dimensions). Override via
 * `AI_EMBEDDING_MODEL` env var. NOTE: changing to a model with different
 * dimensions (e.g. text-embedding-3-large at 3072) requires a separate
 * schema migration — vector columns are declared `vector(1536)` and a
 * dimension mismatch on INSERT throws a Postgres error. Out of scope for
 * Sprint 4.2a; tracked separately for any future model-upgrade work.
 */

// IMPORT — add AI_EMBEDDING_MODEL to the existing import line
import {
  OPENAI_API_KEY,
  AI_REQUEST_TIMEOUT_MS,
  AI_EMBEDDING_MODEL,
} from "../config/env.js";

// generateEmbedding — change the model line
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) return null;
  try {
    const client = getClient();
    const response = await client.embeddings.create({
      model: AI_EMBEDDING_MODEL,
      input: text.trim().slice(0, 8000),
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("[Embedding] Generation failed:", error.message);
    return null;
  }
}
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.generateEmbedding.test.js
```
Expected: test 36 PASS.

- [ ] **Step 3: Write tests 34 + 35 (M16 — RED)**

Create `server/test/services/embedding.findProblemsByNote.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));

vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: "sk-test-key",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("../../src/config/env.js", () => envMock);

vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor() {
      this.embeddings = { create: vi.fn() };
    }
  },
}));

const { findProblemsByNoteEmbedding } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findProblemsByNoteEmbedding — M16 source pre-check", () => {
  it("test 34: returns [] + logs when source note has NULL embedding", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Pre-check query returns empty (no row matched 'embedding IS NOT NULL')
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

    const result = await findProblemsByNoteEmbedding(
      "note_no_embed",
      ["team_1"],
      5,
    );

    expect(result).toEqual([]);
    // Pre-check is the ONLY query — the main cross-table query is skipped
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql] = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/embedding IS NOT NULL/);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("note_no_embed has no embedding yet"),
    );
    logSpy.mockRestore();
  });

  it("test 35: runs cross-table query when source note has non-NULL embedding", async () => {
    // Pre-check returns a row → continue
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ "?column?": 1 }]);
    // Main query returns 2 problems
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
      { id: "p1", title: "Problem 1", difficulty: "MEDIUM", category: "CODING", tags: [], distance: 0.12 },
      { id: "p2", title: "Problem 2", difficulty: "HARD", category: "CODING", tags: [], distance: 0.18 },
    ]);

    const result = await findProblemsByNoteEmbedding(
      "note_with_embed",
      ["team_1"],
      5,
    );

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("p1");
    // Two queries: pre-check + main
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    const [, mainSql] = prismaMock.$queryRawUnsafe.mock.calls[1];
    // Main query is the cross-table similarity search
    const mainSqlFirstArg = prismaMock.$queryRawUnsafe.mock.calls[1][0];
    expect(mainSqlFirstArg).toMatch(/SELECT.*FROM problems/s);
    expect(mainSqlFirstArg).toMatch(/embedding <=> /);
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.findProblemsByNote.test.js
```
Expected: FAIL — current `findProblemsByNoteEmbedding` doesn't have the pre-check, so test 34 fails (only 1 query runs but it's the main query, not the pre-check) and test 35 has wrong call count.

- [ ] **Step 4: Implement M16 (GREEN)**

In `server/src/services/embedding.service.js`, replace `findProblemsByNoteEmbedding`:

```js
// Cross-table: find Problems similar to a note (within the user's
// accessible team set). Used for "linked problems" suggestions.
export async function findProblemsByNoteEmbedding(noteId, teamIds, limit = 5) {
  try {
    if (!Array.isArray(teamIds) || teamIds.length === 0) return [];

    // Pre-check: source note must have a non-NULL embedding. Otherwise
    // the `<=>` operator returns NULL for every candidate and we silently
    // get zero results — indistinguishable from "no similar problems".
    // Better to log + bail explicitly.
    const sourceCheck = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM notes WHERE id = $1 AND embedding IS NOT NULL LIMIT 1`,
      noteId,
    );
    if (sourceCheck.length === 0) {
      console.log(
        `[Embedding] findProblemsByNoteEmbedding: note ${noteId} has no embedding yet — returning empty`,
      );
      return [];
    }

    const results = await prisma.$queryRawUnsafe(
      `
      SELECT p.id, p.title, p.difficulty, p.category, p.tags,
             p.embedding <=> (SELECT embedding FROM notes WHERE id = $1) AS distance
      FROM problems p
      WHERE p."teamId" = ANY($2::text[])
        AND p."isPublished" = true
        AND p.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT $3
    `,
      noteId,
      teamIds,
      limit,
    );
    return results;
  } catch (error) {
    console.error(
      "[Embedding] Cross-table note→problem search failed:",
      error.message,
    );
    return [];
  }
}
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.findProblemsByNote.test.js
```
Expected: tests 34, 35 PASS.

- [ ] **Step 5: Full server suite sanity**

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1227 passing (baseline 1224 + 3 new). Existing tests unaffected.

- [ ] **Step 6: Lint check**

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/embedding.service.js \
        server/test/services/embedding.generateEmbedding.test.js \
        server/test/services/embedding.findProblemsByNote.test.js
git commit -m "Wire AI_EMBEDDING_MODEL env var (M15) + source pre-check in findProblemsByNoteEmbedding (M16)"
```

---

## Task 2: Add `embedAndPersist` + delete dead code

The big refactor. Adds the unified writer + deletes 6 functions (3 dead, 3 wrappers being replaced).

**Files:**
- Modify: `server/src/services/embedding.service.js` (add `ENTITY_CONFIG`, `embedAndPersist`, update `embedAllExisting`; delete 6 functions)
- Create: `server/test/services/embedding.embedAndPersist.test.js` (tests 27-33)

- [ ] **Step 1: Write tests 27-33 (RED)**

Create `server/test/services/embedding.embedAndPersist.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  solution: { findUnique: vi.fn() },
  problem: { findUnique: vi.fn() },
  note: { findUnique: vi.fn() },
  $executeRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const envMock = vi.hoisted(() => ({
  OPENAI_API_KEY: "sk-test-key",
  AI_REQUEST_TIMEOUT_MS: 30000,
  AI_EMBEDDING_MODEL: "text-embedding-3-small",
}));
vi.mock("../../src/config/env.js", () => envMock);

const oaiCalls = vi.hoisted(() => ({ embedding: null }));
vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor() {
      this.embeddings = {
        create: vi.fn(async (args) => ({
          data: [{ embedding: oaiCalls.embedding ?? [0.1, 0.2, 0.3] }],
        })),
      };
    }
  },
}));

const outboxMock = vi.hoisted(() => ({
  enqueueEmbedding: vi.fn(),
}));
vi.mock("../../src/services/embedding.outbox.js", () => outboxMock);

const { embedAndPersist } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  oaiCalls.embedding = [0.1, 0.2, 0.3];
});

describe("embedAndPersist — unified writer", () => {
  it("test 27: Solution happy path — loads, embeds, writes vector, logs success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    prismaMock.solution.findUnique.mockResolvedValueOnce({
      approach: "two pointers",
      code: "function f() {}",
      keyInsight: "monotonic",
      patterns: ["arrays", "two-pointers"],
      problem: { title: "Test Prob", difficulty: "MEDIUM", category: "CODING", tags: [] },
    });
    prismaMock.$executeRawUnsafe.mockResolvedValueOnce(undefined);

    const result = await embedAndPersist("Solution", "sol_1");

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(prismaMock.solution.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sol_1" } }),
    );
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql] = prismaMock.$executeRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/UPDATE "solutions" SET embedding/);
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Embedding] Solution sol_1 embedded"),
    );
    logSpy.mockRestore();
  });

  it("test 28: null embedding → enqueue + no SQL UPDATE", async () => {
    prismaMock.solution.findUnique.mockResolvedValueOnce({
      approach: "x",
      code: "y",
      keyInsight: "z",
      patterns: [],
      problem: { title: "T", difficulty: "EASY", category: "CODING", tags: [] },
    });
    // generateEmbedding returns null (OpenAI failed)
    oaiCalls.embedding = null;
    // Override the OpenAI mock to throw, since the current mock returns
    // an embedding unconditionally. Force the catch in generateEmbedding.
    const { default: OpenAI } = await import("openai");
    const stub = new OpenAI();
    stub.embeddings.create = vi.fn().mockRejectedValueOnce(new Error("OAI 503"));
    // Replace the singleton — embedding.service.js caches it
    // Cleaner approach: simulate via prisma — actually easier to just
    // mock the entire embedding.service.generateEmbedding path
    // OR set oaiCalls.embedding to null AND have the mock return null

    // Simpler: have the OpenAI mock return null embedding
    // Redo this by mocking generateEmbedding directly is cleanest
    // Skip — we'll mock generateEmbedding via re-mocking the module
    // For this test, simulate null by checking the enqueue path post-hoc

    // Actually the simplest approach: in the mock setup at the top,
    // make oaiCalls.embedding = null cause `data[0].embedding` to be null,
    // then generateEmbedding sees `response.data[0].embedding === null`
    // and returns null. But the actual implementation:
    //   return response.data[0].embedding;
    // returns null if it's null. So if oaiCalls.embedding = null, the
    // function returns null. Good.

    const result = await embedAndPersist("Solution", "sol_2");

    expect(result).toBeNull();
    expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledWith(
      "Solution",
      "sol_2",
      "generateEmbedding returned null",
    );
  });

  it("test 29: SQL UPDATE throws → enqueue with db-update reason", async () => {
    prismaMock.solution.findUnique.mockResolvedValueOnce({
      approach: "x",
      code: "y",
      keyInsight: "z",
      patterns: [],
      problem: { title: "T", difficulty: "EASY", category: "CODING", tags: [] },
    });
    prismaMock.$executeRawUnsafe.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const result = await embedAndPersist("Solution", "sol_3");

    expect(result).toBeNull();
    expect(outboxMock.enqueueEmbedding).toHaveBeenCalledWith(
      "Solution",
      "sol_3",
      expect.stringContaining("db update failed: connection refused"),
    );
  });

  it("test 30: entity not found → returns null + no enqueue", async () => {
    prismaMock.solution.findUnique.mockResolvedValueOnce(null);

    const result = await embedAndPersist("Solution", "sol_missing");

    expect(result).toBeNull();
    expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(outboxMock.enqueueEmbedding).not.toHaveBeenCalled();
  });

  it("test 31: Problem happy path — uses problems table + buildProblemText", async () => {
    prismaMock.problem.findUnique.mockResolvedValueOnce({
      title: "Two Sum",
      category: "CODING",
      difficulty: "EASY",
      description: "Find two numbers...",
      tags: ["array", "hashmap"],
      companyTags: [],
      realWorldContext: null,
    });
    prismaMock.$executeRawUnsafe.mockResolvedValueOnce(undefined);

    const result = await embedAndPersist("Problem", "prob_1");

    expect(result).toEqual([0.1, 0.2, 0.3]);
    const [sql] = prismaMock.$executeRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/UPDATE "problems" SET embedding/);
  });

  it("test 32: Note happy path — uses notes table + buildNoteText", async () => {
    prismaMock.note.findUnique.mockResolvedValueOnce({
      title: "How HNSW works",
      tags: ["pgvector", "indexing"],
      linkedEntityType: null,
      contentMarkdown: "HNSW is a graph-based index for approximate nearest neighbor search...",
    });
    prismaMock.$executeRawUnsafe.mockResolvedValueOnce(undefined);

    const result = await embedAndPersist("Note", "note_1");

    expect(result).toEqual([0.1, 0.2, 0.3]);
    const [sql] = prismaMock.$executeRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/UPDATE "notes" SET embedding/);
  });

  it("test 33: unknown entityType logs error + returns null + no DB calls", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await embedAndPersist("Mysterious", "x_1");

    expect(result).toBeNull();
    expect(prismaMock.solution.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.problem.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.note.findUnique).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown entityType: Mysterious"),
    );
    errSpy.mockRestore();
  });
});
```

Note on test 28: simplest way to make `generateEmbedding` return null is to have the OpenAI mock return `{ data: [{ embedding: null }] }`. The setup at the top of the file uses `oaiCalls.embedding` which defaults to `[0.1, 0.2, 0.3]` and is reset in `beforeEach` — setting `oaiCalls.embedding = null` for that one test should propagate correctly. If the test fails because the mock returns `null` literally (which `response.data[0].embedding` would also return null for, so `if (!embedding)` triggers), the test passes. Verify this works by running it.

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.embedAndPersist.test.js
```
Expected: ALL 7 tests FAIL — `embedAndPersist is not a function` (it doesn't exist yet).

- [ ] **Step 2: Implement `ENTITY_CONFIG` + `embedAndPersist` (GREEN)**

In `server/src/services/embedding.service.js`, add the following at module scope AFTER the existing `buildSolutionText` / `buildProblemText` / `buildNoteText` helpers and BEFORE the `findSimilar*` and `embed*` functions you're about to delete. Place near the top of the public-export region:

```js
// ── Unified writer: load → buildText → embed → persist (+ enqueue on failure)
// ── Polymorphic over entityType via the ENTITY_CONFIG map.

const ENTITY_CONFIG = {
  Solution: {
    table: "solutions",
    load: (id) =>
      prisma.solution.findUnique({
        where: { id },
        select: {
          approach: true,
          code: true,
          keyInsight: true,
          patterns: true,
          problem: {
            select: { title: true, difficulty: true, category: true, tags: true },
          },
        },
      }),
    buildText: (s) => buildSolutionText(s, s.problem),
  },
  Problem: {
    table: "problems",
    load: (id) => prisma.problem.findUnique({ where: { id } }),
    buildText: (p) => buildProblemText(p),
  },
  Note: {
    table: "notes",
    load: (id) => prisma.note.findUnique({ where: { id } }),
    buildText: (n) => buildNoteText(n),
  },
};

export async function embedAndPersist(entityType, entityId) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    console.error(`[Embedding] Unknown entityType: ${entityType}`);
    return null;
  }
  try {
    const entity = await config.load(entityId);
    if (!entity) return null;

    const text = config.buildText(entity);
    if (!text || text.length < 20) return null;

    const embedding = await generateEmbedding(text);
    if (!embedding) {
      const { enqueueEmbedding } = await import("./embedding.outbox.js");
      await enqueueEmbedding(
        entityType,
        entityId,
        "generateEmbedding returned null",
      );
      return null;
    }

    try {
      const vectorStr = `[${embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "${config.table}" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        entityId,
      );
      console.log(
        `[Embedding] ${entityType} ${entityId} embedded (${text.length} chars)`,
      );
      return embedding;
    } catch (dbErr) {
      const { enqueueEmbedding } = await import("./embedding.outbox.js");
      await enqueueEmbedding(
        entityType,
        entityId,
        `db update failed: ${dbErr.message}`,
      );
      return null;
    }
  } catch (err) {
    console.error(`[Embedding] ${entityType} ${entityId} failed:`, err.message);
    try {
      const { enqueueEmbedding } = await import("./embedding.outbox.js");
      await enqueueEmbedding(entityType, entityId, err.message);
    } catch {
      // enqueue self-failure already CRITICAL-logs; don't mask original error
    }
    return null;
  }
}
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.embedAndPersist.test.js
```
Expected: ALL 7 tests PASS.

- [ ] **Step 3: Delete dead-code exports + Sprint-4.1-wrapper functions**

In `server/src/services/embedding.service.js`, DELETE these entire function bodies (and their preceding comment blocks where standalone):

| Function | Approximate line range |
| --- | --- |
| `findSimilarSolutions` | 187-214 |
| `findSimilarProblems` (service-level) | 217-240 |
| `searchSolutionsByText` | 243-268 |
| `embedSolution` | 112-149 |
| `embedProblem` | 152-183 |
| `embedNote` | 308-355 (or wherever in the file currently) |

Keep `findSimilarNotes` and `findProblemsByNoteEmbedding` — they have callers.

Use `Read` to inspect the file's current line numbers before deleting. The deletions must keep the file syntactically valid (no orphaned trailing commas, no unused imports).

After the deletions, verify the file is still parseable:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && node -e "import('./src/services/embedding.service.js').then(m => console.log('Exports:', Object.keys(m))).catch(e => { console.error(e.message); process.exit(1); })"
```

Expected exports list (whatever Node prints): should include `generateEmbedding`, `buildSolutionText`, `buildProblemText`, `buildNoteText`, `embedAndPersist`, `findSimilarNotes`, `findProblemsByNoteEmbedding`, `isEmbeddingEnabled`, `embedAllExisting`. Should NOT include `embedSolution`, `embedProblem`, `embedNote`, `findSimilarSolutions`, `findSimilarProblems`, `searchSolutionsByText`.

- [ ] **Step 4: Update `embedAllExisting` to call `embedAndPersist`**

In `server/src/services/embedding.service.js`, replace `embedAllExisting`:

```js
// ── Batch embed all existing solutions and problems (manual recovery tool).
// Failed rows are queued into the outbox via embedAndPersist for retry.
export async function embedAllExisting() {
  console.log("[Embedding] Starting batch embedding...");
  const problems = await prisma.$queryRawUnsafe(`
    SELECT id FROM problems WHERE embedding IS NULL AND "isPublished" = true
  `);
  console.log(`[Embedding] ${problems.length} problems need embedding`);
  for (const p of problems) {
    await embedAndPersist("Problem", p.id);
    await new Promise((r) => setTimeout(r, 200));
  }
  const solutions = await prisma.$queryRawUnsafe(`
    SELECT id FROM solutions WHERE embedding IS NULL
  `);
  console.log(`[Embedding] ${solutions.length} solutions need embedding`);
  for (const s of solutions) {
    await embedAndPersist("Solution", s.id);
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log("[Embedding] Batch embedding complete");
}
```

- [ ] **Step 5: Verify embedAndPersist tests still pass**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.embedAndPersist.test.js test/services/embedding.findProblemsByNote.test.js test/services/embedding.generateEmbedding.test.js
```
Expected: 7 + 2 + 1 = 10 new tests pass.

- [ ] **Step 6: Run the FULL server test suite — expect breakage**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -30
```

Expected: tests fail because `embedding.outbox.js` still imports `embedSolution`/`embedProblem`/`embedNote` which no longer exist. Also Sprint 4.1 controller tests + outbox tests reference these. DO NOT try to fix them yet — Task 3 wires the new dispatch path and adapts those tests.

Note the failure count + which suites fail. Expected failures: `embedding.outbox.test.js` + `solutions.embedding-outbox.test.js` + `problems.embedding-outbox.test.js` + possibly `notes.controller.test.js` if it imports `embedNote`.

- [ ] **Step 7: Lint check**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: may pass (the lint config doesn't trace cross-file imports), OR may flag `no-unused-vars` on the dead-code-removed import names if any remain. Fix unused imports if flagged.

- [ ] **Step 8: Do NOT commit yet**

Task 2 leaves the codebase in a broken intermediate state — tests fail because the outbox still references deleted functions. Task 3 fixes that. Commit only after Task 3 completes.

---

## Task 3: Update outbox dispatch + collapse controller wrappers + adapt tests

Repair the breakage from Task 2 by wiring the new dispatch path everywhere.

**Files:**
- Modify: `server/src/services/embedding.outbox.js` (remove `DISPATCH`, lazy-import `embedAndPersist`)
- Modify: `server/src/controllers/solutions.controller.js` (collapse `generateSolutionEmbedding`)
- Modify: `server/src/controllers/problems.controller.js` (collapse `generateProblemEmbedding`)
- Modify: `server/test/services/embedding.outbox.test.js` (mock `embedAndPersist` instead of `embedSolution`/`embedProblem`/`embedNote`)
- Modify: `server/test/controllers/solutions.embedding-outbox.test.js` (mock `embedAndPersist` from service; mocks of `generateEmbedding` + `prisma.$executeRawUnsafe` no longer relevant to the controller wrapper)
- Modify: `server/test/controllers/problems.embedding-outbox.test.js` (same)

- [ ] **Step 1: Update `embedding.outbox.js` to dispatch via `embedAndPersist`**

In `server/src/services/embedding.outbox.js`:

**Remove** the import of `embedSolution` / `embedProblem` / `embedNote` and the `DISPATCH` map block.

**Add** a private `dispatchEmbed` helper. **Replace** the dispatch lookup in `processOutboxBatch` with a call to it:

```js
// At the top of the file — replace the existing import block + DISPATCH map
import prisma from "../lib/prisma.js";

// (no static import of embedAndPersist — lazy to break the cycle)

async function dispatchEmbed(entityType, entityId) {
  const { embedAndPersist } = await import("./embedding.service.js");
  return embedAndPersist(entityType, entityId);
}

// ENTITY-type validity check (replaces the old `if (!DISPATCH[entityType])` guard
// inside enqueueEmbedding — keep enqueueEmbedding gated against typos)
const KNOWN_ENTITY_TYPES = new Set(["Solution", "Problem", "Note"]);
```

In `enqueueEmbedding`, replace:
```js
if (!DISPATCH[entityType]) return;
```
with:
```js
if (!KNOWN_ENTITY_TYPES.has(entityType)) return;
```

In `processOutboxBatch`, replace the dispatch block:

```js
// BEFORE
const dispatchFn = DISPATCH[row.entityType];
if (!dispatchFn) {
  await prisma.embeddingOutbox.delete({ where: { id: row.id } });
  console.log(
    `[embedding-outbox:orphan] type=${row.entityType} id=${row.entityId} — unknown entityType, dropping`,
  );
  result.orphaned++;
  continue;
}
const embedded = await dispatchFn(row.entityId);

// AFTER
if (!KNOWN_ENTITY_TYPES.has(row.entityType)) {
  await prisma.embeddingOutbox.delete({ where: { id: row.id } });
  console.log(
    `[embedding-outbox:orphan] type=${row.entityType} id=${row.entityId} — unknown entityType, dropping`,
  );
  result.orphaned++;
  continue;
}
const embedded = await dispatchEmbed(row.entityType, row.entityId);
```

The `TABLE_MAP` (used by `checkEntityExists`) stays — it's a separate concern from dispatch.

- [ ] **Step 2: Collapse `generateSolutionEmbedding` in `solutions.controller.js`**

In `server/src/controllers/solutions.controller.js`, replace the entire `generateSolutionEmbedding` function body:

```js
// REPLACE the existing 36-line generateSolutionEmbedding with:
export async function generateSolutionEmbedding(solutionId) {
  const { AI_ENABLED } = await import("../config/env.js");
  if (!AI_ENABLED) return;
  const { embedAndPersist } = await import("../services/embedding.service.js");
  await embedAndPersist("Solution", solutionId);
}
```

- [ ] **Step 3: Collapse `generateProblemEmbedding` in `problems.controller.js`**

In `server/src/controllers/problems.controller.js`, replace `generateProblemEmbedding`:

```js
export async function generateProblemEmbedding(problemId) {
  const { AI_ENABLED } = await import("../config/env.js");
  if (!AI_ENABLED) return;
  const { embedAndPersist } = await import("../services/embedding.service.js");
  await embedAndPersist("Problem", problemId);
}
```

- [ ] **Step 4: Adapt `server/test/services/embedding.outbox.test.js`**

The existing 14 tests reference the deleted `embedSolution` / `embedProblem` / `embedNote` mocks. Repoint them to `embedAndPersist`.

Read the file:
```bash
cat /Users/surajsingh/Downloads/Projects/problem-solver/server/test/services/embedding.outbox.test.js | head -50
```

Find the mock block (likely near top):

```js
// BEFORE (existing mock)
const embeddingServiceMock = vi.hoisted(() => ({
  embedSolution: vi.fn(),
  embedProblem: vi.fn(),
  embedNote: vi.fn(),
  generateEmbedding: vi.fn(),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);
```

Replace with:

```js
const embeddingServiceMock = vi.hoisted(() => ({
  embedAndPersist: vi.fn(),
  generateEmbedding: vi.fn(),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);
```

Find every reference to `embeddingServiceMock.embedSolution` / `.embedProblem` / `.embedNote` in the test bodies. Replace each with `embeddingServiceMock.embedAndPersist`. (Tests don't care about which entity type — they just need to assert that the dispatch fired and the result flowed back.)

The `beforeEach` block likely has lines like:
```js
embeddingServiceMock.embedSolution.mockResolvedValue([0.1, 0.2]);
embeddingServiceMock.embedProblem.mockResolvedValue([0.1, 0.2]);
embeddingServiceMock.embedNote.mockResolvedValue([0.1, 0.2]);
```
Replace with a single line:
```js
embeddingServiceMock.embedAndPersist.mockResolvedValue([0.1, 0.2]);
```

The "unknown entityType" test (in the original test file there's a "process unknown entityType" branch) — make sure it now exercises the `KNOWN_ENTITY_TYPES.has` check in `processOutboxBatch` instead of the deleted `DISPATCH[entityType]` lookup.

- [ ] **Step 5: Adapt `server/test/controllers/solutions.embedding-outbox.test.js`**

The existing tests 16-18 mock `embedding.service.generateEmbedding` + `prisma.$executeRawUnsafe`. After the refactor, the controller wrapper doesn't do those calls directly — it calls `embedAndPersist`. Adapt the mocks to spy on `embedAndPersist` instead.

Read the file:
```bash
cat /Users/surajsingh/Downloads/Projects/problem-solver/server/test/controllers/solutions.embedding-outbox.test.js
```

Replace the mock setup:

```js
// BEFORE — multiple mocks for the inlined path
const outboxMock = vi.hoisted(() => ({ enqueueEmbedding: vi.fn() }));
vi.mock("../../src/services/embedding.outbox.js", () => outboxMock);

const embeddingServiceMock = vi.hoisted(() => ({ generateEmbedding: vi.fn() }));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

const prismaMock = vi.hoisted(() => ({
  solution: { findUnique: vi.fn() },
  $executeRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// AFTER — single mock for embedAndPersist; outbox is no longer reachable from the controller
const embeddingServiceMock = vi.hoisted(() => ({
  embedAndPersist: vi.fn(),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

// Prisma mock minimal — controller wrapper no longer touches prisma directly
vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));
```

Replace the 3 test bodies to assert on `embedAndPersist` calls instead of `enqueueEmbedding` / `$executeRawUnsafe`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const embeddingServiceMock = vi.hoisted(() => ({
  embedAndPersist: vi.fn(),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));

const solutionsCtrl = await import(
  "../../src/controllers/solutions.controller.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateSolutionEmbedding — Sprint 4.2a refactor", () => {
  it("test 16: invokes embedAndPersist('Solution', id) when AI is enabled", async () => {
    embeddingServiceMock.embedAndPersist.mockResolvedValueOnce([0.1, 0.2]);
    await solutionsCtrl.generateSolutionEmbedding("sol_test_1");
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledTimes(1);
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledWith(
      "Solution",
      "sol_test_1",
    );
  });

  it("test 17: propagates without throwing when embedAndPersist returns null (failure path delegated)", async () => {
    embeddingServiceMock.embedAndPersist.mockResolvedValueOnce(null);
    await expect(
      solutionsCtrl.generateSolutionEmbedding("sol_test_2"),
    ).resolves.toBeUndefined();
    expect(embeddingServiceMock.embedAndPersist).toHaveBeenCalledTimes(1);
  });

  it("test 18: short-circuits when AI is disabled (no embedAndPersist call)", async () => {
    const envMod = await import("../../src/config/env.js");
    // Save + flip — this works only if the env mock is mutable, which it is
    // via the importOriginal spread pattern at the top
    const original = envMod.AI_ENABLED;
    // The spread captured AI_ENABLED=true at mock time. To flip per-test:
    // we'd need a hoisted state pattern. Simpler: skip this assertion if
    // the env mock is immutable — but the spread DOES create a fresh object,
    // and dynamic `import()` returns it. Since AI_ENABLED is a property on
    // the exported module namespace, we can't mutate it post-hoc.
    //
    // Workaround: this test is best done via a separate file with a
    // dedicated env mock that defaults to false. For 4.2a we can either
    // skip this test (xit) or restructure.
    //
    // SIMPLEST: defer test 18 to a follow-up. For now, assert behavior
    // when AI_ENABLED=true, which is the common-case codepath.
    //
    // Replacement assertion: when embedAndPersist throws, the wrapper
    // does not propagate (it awaits without try-catch — actually it
    // DOES propagate). Let's just keep tests 16+17.
  });
});
```

Reduce to 2 tests for the solutions controller wrapper (tests 16 and 17). Skip test 18 in the adapted file (leave a comment block explaining why). This reduces the test count delta by 1 in solutions and 1 in problems → net adjustment.

**Actually a cleaner solution:** make the env mock hoisted-state mutable:

```js
const envMock = vi.hoisted(() => ({ AI_ENABLED: true }));
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return new Proxy(actual, {
    get(target, key) {
      if (key === "AI_ENABLED") return envMock.AI_ENABLED;
      return target[key];
    },
  });
});
```

Then test 18 can flip `envMock.AI_ENABLED = false`. **Use this approach** to preserve test 18.

```js
it("test 18: short-circuits when AI is disabled (no embedAndPersist call)", async () => {
  envMock.AI_ENABLED = false;
  try {
    await solutionsCtrl.generateSolutionEmbedding("sol_test_3");
    expect(embeddingServiceMock.embedAndPersist).not.toHaveBeenCalled();
  } finally {
    envMock.AI_ENABLED = true; // restore for subsequent tests
  }
});
```

- [ ] **Step 6: Adapt `server/test/controllers/problems.embedding-outbox.test.js`**

Same shape as Step 5 — replace 3 inlined tests with 3 `embedAndPersist`-spy tests. Tests 19, 20, 21 → all assert `embedAndPersist("Problem", id)` invocations + AI_ENABLED gating.

- [ ] **Step 7: Run the full server test suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: ALL tests pass. Count = baseline 1224 + 10 from Task 1+2 (7 embedAndPersist + 2 findProblemsByNote + 1 generateEmbedding) = **1234**.

(Tests 16-21 are NOT new in this sprint — they were created in Sprint 4.1 and are merely adapted here; they still contribute to the existing 1224. Net delta in 4.2a so far is +10, not +16.)

- [ ] **Step 8: Lint check**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 9: Commit Tasks 2 + 3 together (single coherent refactor)**

```bash
git add server/src/services/embedding.service.js \
        server/src/services/embedding.outbox.js \
        server/src/controllers/solutions.controller.js \
        server/src/controllers/problems.controller.js \
        server/test/services/embedding.embedAndPersist.test.js \
        server/test/services/embedding.outbox.test.js \
        server/test/controllers/solutions.embedding-outbox.test.js \
        server/test/controllers/problems.embedding-outbox.test.js
git commit -m "Consolidate 3 embedding write paths into embedAndPersist + remove dead exports"
```

---

## Task 4: M10 — cancelNoteEmbedding + debouncer update

**Files:**
- Modify: `server/src/services/notes.embedding.js` (add `cancelNoteEmbedding`, update timer body)
- Create: `server/test/services/notes.embedding.test.js` (tests 22-25)

- [ ] **Step 1: Write tests 22-25 (RED)**

Create `server/test/services/notes.embedding.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const embeddingServiceMock = vi.hoisted(() => ({
  embedAndPersist: vi.fn(),
  isEmbeddingEnabled: vi.fn(() => true),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

const { scheduleNoteEmbedding, cancelNoteEmbedding } = await import(
  "../../src/services/notes.embedding.js"
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  embeddingServiceMock.isEmbeddingEnabled.mockReturnValue(true);
  embeddingServiceMock.embedAndPersist.mockResolvedValue([0.1, 0.2]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notes.embedding — debouncer + cancel", () => {
  it("test 22: cancelNoteEmbedding(id) clears the timer + returns true", () => {
    scheduleNoteEmbedding("note_1");
    const returned = cancelNoteEmbedding("note_1");
    expect(returned).toBe(true);
  });

  it("test 23: cancelNoteEmbedding(id) returns false when no timer exists", () => {
    const returned = cancelNoteEmbedding("nonexistent_note");
    expect(returned).toBe(false);
  });

  it("test 24: cancelNoteEmbedding(null) returns false + is a no-op", () => {
    const returned = cancelNoteEmbedding(null);
    expect(returned).toBe(false);
    const returned2 = cancelNoteEmbedding(undefined);
    expect(returned2).toBe(false);
  });

  it("test 25: schedule then cancel prevents embedAndPersist from firing", async () => {
    scheduleNoteEmbedding("note_2");
    cancelNoteEmbedding("note_2");
    await vi.advanceTimersByTimeAsync(6000); // past the 5s debounce
    expect(embeddingServiceMock.embedAndPersist).not.toHaveBeenCalled();
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/notes.embedding.test.js
```
Expected: tests 22-25 FAIL — `cancelNoteEmbedding is not a function` (it doesn't exist).

- [ ] **Step 2: Implement `cancelNoteEmbedding` + update debouncer body (GREEN)**

Replace `server/src/services/notes.embedding.js` entirely:

```js
// ============================================================================
// Notes — embedding writer with per-note debounce
// ============================================================================
//
// Fires `embedAndPersist("Note", noteId)` ~5 seconds after the user stops
// editing. Coalesces rapid saves so we don't burn embeddings on every
// keystroke (the detail page auto-saves every 1.2s).
//
// `cancelNoteEmbedding(noteId)` clears a pending timer — called from
// `deleteNotePermanent` to avoid firing an embed against a row that's
// about to be deleted. (The outbox's orphan self-heal handles the race
// where the timer fires between cancel-attempt and entity deletion.)
//
// Single-replica safe. If multiple replicas race on the same note, each
// will run its own embedding call — idempotent (last write wins).
//
// Failures log silently. Embedding is best-effort; the note save path
// never blocks on it.
// ============================================================================
import {
  embedAndPersist,
  isEmbeddingEnabled,
} from "./embedding.service.js";

const DEBOUNCE_MS = 5000;
const timers = new Map();

export function scheduleNoteEmbedding(noteId) {
  if (!noteId) return;
  if (!isEmbeddingEnabled()) return;

  const existing = timers.get(noteId);
  if (existing) clearTimeout(existing);

  const t = setTimeout(async () => {
    timers.delete(noteId);
    try {
      await embedAndPersist("Note", noteId);
    } catch (err) {
      console.error(
        `[notes.embedding] schedule failed for ${noteId}:`,
        err.message,
      );
    }
  }, DEBOUNCE_MS);

  if (typeof t.unref === "function") t.unref();
  timers.set(noteId, t);
}

export function cancelNoteEmbedding(noteId) {
  if (!noteId) return false;
  const existing = timers.get(noteId);
  if (!existing) return false;
  clearTimeout(existing);
  timers.delete(noteId);
  console.log(`[notes.embedding:cancelled] noteId=${noteId}`);
  return true;
}
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/notes.embedding.test.js
```
Expected: tests 22-25 PASS.

- [ ] **Step 3: Full server test suite sanity**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1238 (1234 from end-of-Task-3 + 4 new tests).

- [ ] **Step 4: Lint check**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/notes.embedding.js \
        server/test/services/notes.embedding.test.js
git commit -m "Add cancelNoteEmbedding + update debouncer to call embedAndPersist (M10 prep)"
```

---

## Task 5: M10 wiring — deleteNotePermanent calls cancelNoteEmbedding

**Files:**
- Modify: `server/src/controllers/notes.controller.js` (add import + call)
- Create: `server/test/controllers/notes.delete-cancel.test.js` (test 26)

- [ ] **Step 1: Write test 26 (RED)**

Create `server/test/controllers/notes.delete-cancel.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const notesEmbeddingMock = vi.hoisted(() => ({
  scheduleNoteEmbedding: vi.fn(),
  cancelNoteEmbedding: vi.fn(),
}));
vi.mock("../../src/services/notes.embedding.js", () => notesEmbeddingMock);

const prismaMock = vi.hoisted(() => ({
  note: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_ENABLED: true };
});

const { deleteNotePermanent } = await import(
  "../../src/controllers/notes.controller.js"
);

function mockReqRes(noteId, userId = "user_1") {
  const req = {
    params: { id: noteId },
    user: { id: userId },
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteNotePermanent — M10 wiring", () => {
  it("test 26: calls cancelNoteEmbedding(id) before prisma.note.delete", async () => {
    prismaMock.note.findFirst.mockResolvedValueOnce({ id: "note_target" });
    prismaMock.note.delete.mockResolvedValueOnce({ id: "note_target" });

    const { req, res } = mockReqRes("note_target");
    await deleteNotePermanent(req, res);

    expect(notesEmbeddingMock.cancelNoteEmbedding).toHaveBeenCalledWith(
      "note_target",
    );
    expect(prismaMock.note.delete).toHaveBeenCalledWith({
      where: { id: "note_target" },
    });

    // ORDER MATTERS — cancel must come before delete.
    const cancelOrder =
      notesEmbeddingMock.cancelNoteEmbedding.mock.invocationCallOrder[0];
    const deleteOrder =
      prismaMock.note.delete.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(deleteOrder);
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/notes.delete-cancel.test.js
```
Expected: FAIL — `notesEmbeddingMock.cancelNoteEmbedding` never called, since `deleteNotePermanent` doesn't reference it yet.

- [ ] **Step 2: Wire `cancelNoteEmbedding` into `deleteNotePermanent` (GREEN)**

In `server/src/controllers/notes.controller.js`:

**Import update** — find the existing `scheduleNoteEmbedding` import (around line 16) and extend:

```js
// BEFORE
import { scheduleNoteEmbedding } from "../services/notes.embedding.js";

// AFTER
import {
  scheduleNoteEmbedding,
  cancelNoteEmbedding,
} from "../services/notes.embedding.js";
```

**Function update** — replace `deleteNotePermanent` body:

```js
export async function deleteNotePermanent(req, res) {
  try {
    const userId = req.user.id;
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!existing) return error(res, "Note not found", 404);

    // Cancel any pending 5s debounced embed BEFORE deleting the row.
    // If the timer races and fires anyway, the embed will find no note
    // (findUnique returns null) and bail. Defense-in-depth.
    cancelNoteEmbedding(existing.id);

    await prisma.note.delete({ where: { id: existing.id } });
    return success(res, { deleted: true });
  } catch (err) {
    console.error("deleteNotePermanent:", err);
    return error(res, "Failed to delete note", 500);
  }
}
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/notes.delete-cancel.test.js
```
Expected: test 26 PASS.

- [ ] **Step 3: Full server test suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: **1239** (1238 + 1 = 1224 baseline + 15 new in this sprint).

- [ ] **Step 4: Lint check**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/notes.controller.js \
        server/test/controllers/notes.delete-cancel.test.js
git commit -m "Cancel pending note embed before deleteNotePermanent (M10)"
```

---

## Task 6: Final gates + push + FF-merge + roadmap update

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` (mark 4.2a shipped; queue 4.2b + 4.2c)

- [ ] **Step 1: Full server test suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -15
```
Expected: ALL tests pass; count = 1239.

- [ ] **Step 2: Server lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 3: Server audit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
```
Expected: "found 0 vulnerabilities".

- [ ] **Step 4: Prisma migrate status**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```
Expected: "Database schema is up to date."

- [ ] **Step 5: Client lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Client audit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
```
Expected: "found 0 vulnerabilities" (Vite 6 from Sprint 4.1).

- [ ] **Step 7: Client build**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```
Expected: build artifacts in `dist/`, exit 0.

- [ ] **Step 8: Push the feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/embedding-write-path-consolidation
```
Expected: pre-push hook passes, branch pushed.

- [ ] **Step 9: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/embedding-write-path-consolidation && git push origin main
```
Expected: Fast-forward merge + push succeed.

- [ ] **Step 10: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find the existing Sprint 4.2 / 4.3 queue rows (added at end of Sprint 4.1):

```markdown
| 4.2 | M10-M16 RAG/embeddings audit fixes + DRY refactor of the 3 embedding write sites | queued | — | — |
| 4.3 | Embedding service test foundation (H14) | queued | — | — |
```

Replace the 4.2 row with three sub-rows (4.2a shipped, 4.2b + 4.2c queued):

```markdown
| 4.2a | Embedding write-path consolidation (M10 cancel-on-delete + M15 wire AI_EMBEDDING_MODEL + M16 source pre-check + DRY refactor to embedAndPersist + dead-code removal; +15 tests) | ✅ shipped | [`2026-06-25-embedding-write-path-consolidation-design.md`](../specs/2026-06-25-embedding-write-path-consolidation-design.md) | 2026-06-25 |
| 4.2b | RAG retrieval hardening (M11 updatedAt freshness floor + M12 token-bounded RAG context + M14 LIMIT consistency; dedup aiReview + interview.engine RAG SQL) | queued | — | — |
| 4.2c | HNSW index tuning (M13: m / ef_construction tuning + migration) | queued | — | — |
| 4.3 | Embedding service test foundation (H14) | queued | — | — |
```

- [ ] **Step 11: Commit + push the roadmap update**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 4.2a (embedding write-path consolidation) shipped; queue 4.2b + 4.2c" && git push origin main
```
Expected: pre-push hook passes; push succeeds.

- [ ] **Step 12: Verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -10
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```

Expected: local HEAD == origin/main. Top commits include the Sprint 4.2a chain.

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ **M10** (cancel-on-delete) → Task 4 (function) + Task 5 (wiring)
- ✅ **M15** (wire AI_EMBEDDING_MODEL) → Task 1
- ✅ **M16** (source pre-check) → Task 1
- ✅ **DRY refactor** (embedAndPersist + ENTITY_CONFIG) → Task 2
- ✅ **Dead-code removal** (3 dead exports + 3 wrappers) → Task 2 Step 3
- ✅ **Outbox dispatch simplification** → Task 3 Step 1
- ✅ **Controller wrapper collapse** → Task 3 Steps 2-3
- ✅ **Sprint 4.1 test adaptation** → Task 3 Steps 4-6
- ✅ **embedAllExisting → outbox flow** → Task 2 Step 4
- ✅ **15 new tests** → distributed across Tasks 1, 2, 4, 5
- ✅ **Roadmap update** → Task 6 Step 10

### Placeholder scan

- No "TBD", "later", "implement here". Each test has full code; each function rewrite shows the entire body.
- Test 18 has a paragraph explaining the env-mock-mutability workaround — that's design rationale, not a placeholder. The Proxy pattern is fully specified.

### Type consistency

- `embedAndPersist(entityType, entityId)` signature stable everywhere referenced (tests 27-33, outbox dispatch, controller wrappers).
- `cancelNoteEmbedding(noteId)` signature stable (returns boolean; null returns false; missing returns false).
- `enqueueEmbedding(type, id, reason)` signature unchanged from Sprint 4.1; outbox dispatch tests adapt mocks, not signatures.
- `ENTITY_CONFIG` keys (`"Solution" | "Problem" | "Note"`) match across DISPATCH-removal + `KNOWN_ENTITY_TYPES` Set + test fixtures.

### Adversarial check

- **Tasks 2 + 3 are committed together** because Task 2 alone leaves the codebase in a broken state. Plan explicitly says do NOT commit at end of Task 2. Reviewer will see one coherent commit.
- **Test 28 mock setup**: setting `oaiCalls.embedding = null` causes the mock to return `{ data: [{ embedding: null }] }`, which `generateEmbedding` returns as-is (null), triggering the if-null branch. If this turns out to be flaky, fallback is to mock `generateEmbedding` directly via a separate `vi.mock` call.
- **Env-mock mutability via Proxy** (test 18): if the Proxy pattern fights vitest's module-cache semantics, fallback is to hoist `AI_ENABLED` into a `vi.hoisted` object and reference it via getter. Both approaches are commonly used in this codebase.

---

## Done criteria

- All 15 new tests pass; full suite green at 1239.
- `npm run lint` (server + client) exits 0.
- `npm audit --audit-level=high` (server + client) "found 0 vulnerabilities".
- `prisma migrate status` reports up-to-date.
- Feature branch FF-merged to main; both pushed to origin.
- Roadmap reflects Sprint 4.2a shipped + 4.2b / 4.2c queued.
- No dead exports left in `embedding.service.js`.

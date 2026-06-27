# Sprint 4.3 — Embedding Service Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 19 isolation tests covering the gaps in `embedding.service.js` (generateEmbedding edge cases, the 3 text builders, findSimilarNotes, isEmbeddingEnabled). Closes audit H14.

**Architecture:** Pure additive test work. Extends 1 existing test file (`embedding.generateEmbedding.test.js`) with 4 new tests; creates 3 new test files (`embedding.textBuilders.test.js`, `embedding.findSimilarNotes.test.js`, `embedding.isEmbeddingEnabled.test.js`). No production code changes.

**Tech Stack:** Vitest with mocked Prisma + mocked OpenAI + env mocks. Existing patterns from Sprint 4.x test files.

**Spec:** [`docs/superpowers/specs/2026-06-27-embedding-service-tests-design.md`](../specs/2026-06-27-embedding-service-tests-design.md)

**Branch:** `feat/embedding-service-tests`

**Baseline test count:** 1256 (post Sprint 4.2c, commit `abb9b84`). Capture exact in Task 0. Target after sprint: **1275** (+19).

---

## File map

**Modify:**
- `server/test/services/embedding.generateEmbedding.test.js` — append 4 tests (T37-T40) to the existing 1-test file.

**Create:**
- `server/test/services/embedding.textBuilders.test.js` — 9 tests (T41-T49).
- `server/test/services/embedding.findSimilarNotes.test.js` — 3 tests (T50-T52).
- `server/test/services/embedding.isEmbeddingEnabled.test.js` — 3 tests (T53-T55).

**Modify (Task 4):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 4.3 shipped.

**Unchanged (explicit):**
- `server/src/services/embedding.service.js` — read-only this sprint.
- All other production code.

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on `main`**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `main`, last commit `47330f3` (Sprint 4.3 spec). Pre-existing untracked files OK.

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/embedding-service-tests
```

- [ ] **Step 3: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests   1256 passed`. Record exact count.

- [ ] **Step 4: Pre-push gate sanity**

Each exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

No commits in this task.

---

## Task 1: Extend `embedding.generateEmbedding.test.js` (+4 tests T37-T40)

**Files:**
- Modify: `server/test/services/embedding.generateEmbedding.test.js`

The file currently has 1 test (T36 — M15 env-var lock-in). The mock setup uses a `vi.hoisted` `oaiCalls` state that tracks each call, plus an OpenAI class stub. Extend the file by:

1. Adding a `shouldThrow` flag to the hoisted `oaiCalls` state so T39 can drive the OpenAI mock to throw.
2. Appending 4 new tests inside a new `describe("generateEmbedding edge cases", ...)` block.

- [ ] **Step 1: Read existing test file**

```bash
cat /Users/surajsingh/Downloads/Projects/problem-solver/server/test/services/embedding.generateEmbedding.test.js
```

Confirm the file's structure: hoisted `envMock` + hoisted `oaiCalls`, `vi.mock` for openai + env + prisma, single `describe("generateEmbedding — M15 env var lock-in", ...)` with 1 `it("test 36: ...")`.

- [ ] **Step 2: Modify the OpenAI mock to support throwing**

Update the `vi.mock("openai", ...)` block to read a `shouldThrow` flag from the hoisted state:

```js
const oaiCalls = vi.hoisted(() => ({ embeddings: [], shouldThrow: false }));

vi.mock("openai", () => ({
  default: class StubOpenAI {
    constructor(opts) {
      this.opts = opts;
      this.embeddings = {
        create: vi.fn(async (args) => {
          oaiCalls.embeddings.push(args);
          if (oaiCalls.shouldThrow) {
            throw new Error("OpenAI down");
          }
          return { data: [{ embedding: [0.1, 0.2, 0.3] }] };
        }),
      };
    }
  },
}));
```

The `shouldThrow` defaults to `false` — existing T36 unaffected.

- [ ] **Step 3: Add `beforeEach` cleanup for `shouldThrow`**

If the file already has a `beforeEach` that resets `oaiCalls.embeddings`, extend it. Otherwise add:

```js
beforeEach(() => {
  oaiCalls.embeddings.length = 0;
  oaiCalls.shouldThrow = false;
});
```

Make sure `beforeEach` is imported from vitest at the top.

- [ ] **Step 4: Append 4 new tests at the end of the file**

```js
describe("generateEmbedding — edge cases", () => {
  it("test 37: empty string input returns null without OpenAI call", async () => {
    const result = await generateEmbedding("");
    expect(result).toBeNull();
    expect(oaiCalls.embeddings).toHaveLength(0);
  });

  it("test 38: whitespace-only input returns null without OpenAI call", async () => {
    const result = await generateEmbedding("   \n\t  ");
    expect(result).toBeNull();
    expect(oaiCalls.embeddings).toHaveLength(0);
  });

  it("test 39: OpenAI throws → returns null + logs [Embedding] Generation failed:", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    oaiCalls.shouldThrow = true;
    const result = await generateEmbedding("hello world");
    expect(result).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Embedding] Generation failed:"),
      expect.stringContaining("OpenAI down"),
    );
    errSpy.mockRestore();
  });

  it("test 40: input > 8000 chars is truncated to exactly 8000 before send", async () => {
    const longInput = "x".repeat(10000); // non-whitespace so trim() doesn't reduce length
    await generateEmbedding(longInput);
    expect(oaiCalls.embeddings).toHaveLength(1);
    expect(oaiCalls.embeddings[0].input.length).toBe(8000);
    expect(oaiCalls.embeddings[0].input).toBe("x".repeat(8000));
  });
});
```

- [ ] **Step 5: Run the test file**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.generateEmbedding.test.js
```
Expected: 5 tests pass (T36 unchanged + 4 new).

- [ ] **Step 6: Full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1260 (1256 + 4).

- [ ] **Step 7: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add server/test/services/embedding.generateEmbedding.test.js
git commit -m "Cover generateEmbedding edge cases (T37-T40) for H14"
```

---

## Task 2: Create 3 new test files (15 tests T41-T55)

**Files:**
- Create: `server/test/services/embedding.textBuilders.test.js` (T41-T49, 9 tests)
- Create: `server/test/services/embedding.findSimilarNotes.test.js` (T50-T52, 3 tests)
- Create: `server/test/services/embedding.isEmbeddingEnabled.test.js` (T53-T55, 3 tests)

- [ ] **Step 1: Create `embedding.textBuilders.test.js`**

Full file content:

```js
import { describe, it, expect, vi } from "vitest";

// Module-load-time mocks — the import of embedding.service.js pulls these in
// even though the pure text-builder functions don't use them.
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

describe("buildSolutionText", () => {
  it("test 41: minimal solution (no problem context) returns non-empty without crashing", () => {
    const solution = {
      approach: "two pointers",
      patterns: [],
    };
    // problem is null/undefined
    const out = buildSolutionText(solution, null);
    expect(typeof out).toBe("string");
    // No problem fields should appear
    expect(out).not.toContain("Problem:");
    expect(out).not.toContain("Difficulty:");
  });

  it("test 42: all fields populated → every expected line appears", () => {
    const solution = {
      patterns: ["arrays", "two-pointers"],
      bruteForce: "nested loop",
      optimizedApproach: "two pointers",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      keyInsight: "monotonic invariant",
      feynmanExplanation: "walk pointers inward",
      code: "function f() { return 0; }",
    };
    const problem = {
      title: "Two Sum",
      difficulty: "EASY",
      category: "CODING",
    };
    const out = buildSolutionText(solution, problem);
    expect(out).toContain("Problem: Two Sum");
    expect(out).toContain("Difficulty: EASY");
    expect(out).toContain("Category: CODING");
    expect(out).toContain("Patterns: arrays, two-pointers");
    expect(out).toContain("Brute Force: nested loop");
    expect(out).toContain("Optimized: two pointers");
    expect(out).toContain("Time: O(n)");
    expect(out).toContain("Space: O(1)");
    expect(out).toContain("Key Insight: monotonic invariant");
    expect(out).toContain("Explanation: walk pointers inward");
    expect(out).toContain("Code: function f() { return 0; }");
  });

  it("test 43: categorySpecificData flattening — only strings included, capped at 2000 chars", () => {
    const longString = "y".repeat(3000);
    const solution = {
      approach: "x",
      patterns: [],
      categorySpecificData: {
        starMethod: "situation text",
        learnings: longString,
        skipMe: 42, // non-string, should be filtered
        nullField: null, // non-string, filtered
      },
    };
    const out = buildSolutionText(solution, null);
    expect(out).toContain("situation text");
    // The total CSD-flattened section is sliced to 2000 chars
    // Find the CSD section by searching for "situation text" and checking the chunk after it
    expect(out).not.toContain("42"); // numeric field filtered
    // The long y-string is truncated by the 2000-char total cap
    const ys = (out.match(/y+/g) || []).join("");
    expect(ys.length).toBeLessThanOrEqual(2000);
  });

  it("test 44: code > 1000 chars truncated to first 1000 in output", () => {
    const longCode = "a".repeat(2000);
    const solution = {
      approach: "x",
      patterns: [],
      code: longCode,
    };
    const out = buildSolutionText(solution, null);
    const codeLine = out.split("\n").find((line) => line.startsWith("Code: "));
    expect(codeLine).toBeDefined();
    const codeContent = codeLine.replace(/^Code: /, "");
    expect(codeContent.length).toBe(1000);
    expect(codeContent).toBe("a".repeat(1000));
  });
});

describe("buildProblemText", () => {
  it("test 45: minimal problem (only title) returns Title: line without crashing", () => {
    const out = buildProblemText({ title: "Two Sum" });
    expect(out).toBe("Title: Two Sum");
  });

  it("test 46: tags as JSON-encoded string is parsed", () => {
    const out = buildProblemText({
      title: "Two Sum",
      tags: '["array","hashmap"]',
    });
    expect(out).toContain("Tags: array, hashmap");
  });

  it("test 47: tags as array + companyTags both render", () => {
    const out = buildProblemText({
      title: "Two Sum",
      tags: ["array", "hashmap"],
      companyTags: ["Google", "Amazon"],
    });
    expect(out).toContain("Tags: array, hashmap");
    expect(out).toContain("Companies: Google, Amazon");
  });
});

describe("buildNoteText", () => {
  it("test 48: minimal note (only title) returns Title: line", () => {
    const out = buildNoteText({ title: "Notes on HNSW" });
    expect(out).toBe("Title: Notes on HNSW");
  });

  it("test 49: null/empty fields are skipped — output is just Title section", () => {
    const out = buildNoteText({
      title: "Notes on HNSW",
      tags: null,
      linkedEntityType: null,
      contentMarkdown: null,
    });
    expect(out).toBe("Title: Notes on HNSW");
  });
});
```

- [ ] **Step 2: Run textBuilders tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.textBuilders.test.js
```
Expected: 9 tests pass.

- [ ] **Step 3: Create `embedding.findSimilarNotes.test.js`**

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
  default: class {
    constructor() {
      this.embeddings = { create: vi.fn() };
    }
  },
}));

const { findSimilarNotes } = await import(
  "../../src/services/embedding.service.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findSimilarNotes", () => {
  it("test 50: happy path returns the rows from the vector query", async () => {
    const sampleRows = [
      { id: "note_b", title: "Other note 1", tags: ["a"], updatedAt: new Date(), distance: 0.1 },
      { id: "note_c", title: "Other note 2", tags: ["b"], updatedAt: new Date(), distance: 0.15 },
      { id: "note_d", title: "Other note 3", tags: ["c"], updatedAt: new Date(), distance: 0.2 },
    ];
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce(sampleRows);

    const result = await findSimilarNotes("note_a", "user_1", 5);

    expect(result).toEqual(sampleRows);
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[1]).toBe("note_a");   // $1 positional
    expect(args[2]).toBe("user_1");   // $2
    expect(args[3]).toBe(5);          // $3 (limit)
  });

  it("test 51: DB throws → returns [] + logs [Embedding] Similar notes search failed:", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.$queryRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));

    const result = await findSimilarNotes("note_a", "user_1", 5);

    expect(result).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Embedding] Similar notes search failed:"),
      expect.stringContaining("connection refused"),
    );
    errSpy.mockRestore();
  });

  it("test 52: custom limit parameter is the 4th positional arg in $queryRawUnsafe", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarNotes("note_a", "user_1", 10);
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[3]).toBe(10);
  });
});
```

- [ ] **Step 4: Run findSimilarNotes tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.findSimilarNotes.test.js
```
Expected: 3 tests pass.

- [ ] **Step 5: Create `embedding.isEmbeddingEnabled.test.js`**

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

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

const { isEmbeddingEnabled } = await import(
  "../../src/services/embedding.service.js"
);

// isEmbeddingEnabled reads process.env directly (NOT env.js).
// Snapshot + restore the original values around each test.
const ORIGINAL_AI_ENABLED = process.env.AI_ENABLED;
const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  if (ORIGINAL_AI_ENABLED === undefined) delete process.env.AI_ENABLED;
  else process.env.AI_ENABLED = ORIGINAL_AI_ENABLED;
  if (ORIGINAL_OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
});

describe("isEmbeddingEnabled", () => {
  it("test 53: both AI_ENABLED=true AND OPENAI_API_KEY set → true", () => {
    process.env.AI_ENABLED = "true";
    process.env.OPENAI_API_KEY = "sk-real-key";
    expect(isEmbeddingEnabled()).toBe(true);
  });

  it("test 54: AI_ENABLED=false → false even with OPENAI_API_KEY set", () => {
    process.env.AI_ENABLED = "false";
    process.env.OPENAI_API_KEY = "sk-real-key";
    expect(isEmbeddingEnabled()).toBe(false);
  });

  it("test 55: OPENAI_API_KEY missing → false even with AI_ENABLED=true", () => {
    process.env.AI_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    expect(isEmbeddingEnabled()).toBe(false);
  });
});
```

- [ ] **Step 6: Run isEmbeddingEnabled tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/embedding.isEmbeddingEnabled.test.js
```
Expected: 3 tests pass.

- [ ] **Step 7: Full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1275 (1260 + 9 + 3 + 3 = 1275). NO collateral test breakage from existing tests (process.env mutation in test 53-55 is scoped + restored per beforeEach).

- [ ] **Step 8: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add server/test/services/embedding.textBuilders.test.js \
        server/test/services/embedding.findSimilarNotes.test.js \
        server/test/services/embedding.isEmbeddingEnabled.test.js
git commit -m "Add text-builder, findSimilarNotes, isEmbeddingEnabled tests (T41-T55) for H14"
```

---

## Task 3: Final gates + push + FF-merge + roadmap update

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: All pre-push gates**

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
Expected: 1275 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/embedding-service-tests
```
Expected: pre-push hook (~30-60s), passes.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/embedding-service-tests && git push origin main
```

- [ ] **Step 4: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find:

```markdown
| 4.3 | Embedding service test foundation (H14) | queued | — | — |
```

Replace with:

```markdown
| 4.3 | Embedding service test foundation (H14 — 19 tests covering generateEmbedding edge cases + 3 text builders + findSimilarNotes + isEmbeddingEnabled; closes the Sprint 4 cluster) | ✅ shipped | [`2026-06-27-embedding-service-tests-design.md`](../specs/2026-06-27-embedding-service-tests-design.md) | 2026-06-27 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 4.3 (embedding service tests) shipped; Sprint 4 cluster complete"
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

- ✅ **T37-T40 generateEmbedding edge cases** → Task 1 Step 4
- ✅ **T41-T44 buildSolutionText (4 tests)** → Task 2 Step 1
- ✅ **T45-T47 buildProblemText (3 tests)** → Task 2 Step 1
- ✅ **T48-T49 buildNoteText (2 tests)** → Task 2 Step 1
- ✅ **T50-T52 findSimilarNotes (3 tests)** → Task 2 Step 3
- ✅ **T53-T55 isEmbeddingEnabled (3 tests)** → Task 2 Step 5
- ✅ **Roadmap update** → Task 3 Step 4
- ✅ **Test count target 1275** → Task 2 Step 7 expected
- ✅ **Mock pattern for process.env vs env.js** → Task 2 Step 5 (snapshot + per-test restore in beforeEach)
- ✅ **Module-load mocks for pure-function imports** → Task 2 Step 1 (prisma/env/openai stubs at top of textBuilders file)

### Placeholder scan

No "TBD" / "implement later" / "fill in details". Every test has concrete assertions + concrete fixtures.

### Type consistency

- Test IDs T37-T55 contiguous, non-overlapping with existing T1-T36.
- Mock patterns consistent across the 4 files: `vi.hoisted` for shared state, `vi.mock` ordering before `await import(...)`, `beforeEach` resets.
- The `oaiCalls.shouldThrow` flag is consistently used in T39 only; other tests rely on the default `false`.

### Adversarial check on the plan itself

- **T40 fixture choice**: `"x".repeat(10000)` is non-whitespace, so `text.trim()` doesn't reduce length, and `.slice(0, 8000)` produces exactly 8000 chars. Plan documents this.
- **T55 (`OPENAI_API_KEY` missing)**: uses `delete process.env.OPENAI_API_KEY` (not `""`) so `!!process.env.OPENAI_API_KEY` evaluates to `false` for the "missing" semantic.
- **isEmbeddingEnabled beforeEach restore**: handles the case where `ORIGINAL_AI_ENABLED` was `undefined` (env var never set at process start). Uses `delete` rather than `= undefined` (which would set it to the string `"undefined"`).
- **textBuilders module-load mocks**: prisma/env/openai are mocked at module-load time. The pure functions don't use them at call time, but the import statement triggers module initialization which DOES use them. Plan's mocks return objects/classes with the right shape to keep initialization clean.

---

## Done criteria

- All 19 new tests pass; full suite at 1275.
- `npm run lint` (server + client) + audits exit 0.
- `prisma migrate status` up to date.
- Feature branch FF-merged to main; both pushed.
- Roadmap shows Sprint 4.3 shipped, marking the Sprint 4 cluster complete.

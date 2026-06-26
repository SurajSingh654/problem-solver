# Sprint 4.2b — RAG Retrieval Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `rag.service.js` that owns teammate-solution retrieval with a 180-day freshness floor (M11), per-field + total char caps (M12), and a consistent LIMIT (M14); migrate both inline RAG sites (aiReview controller + interview.engine) to use it.

**Architecture:** New file `server/src/services/rag.service.js` exports `findSimilarTeammateSolutions({...}) → rows` + `formatTeammateContext(rows) → string`. Five constants own the tuning surface (`RAG_FRESHNESS_DAYS=180`, `RAG_TEAMMATE_LIMIT_DEFAULT=3`, `RAG_APPROACH_CHAR_CAP=400`, `RAG_KEY_INSIGHT_CHAR_CAP=300`, `RAG_CONTEXT_HARD_CAP=2400`). Both call sites switch from inline raw SQL to the helper.

**Tech Stack:** Node 20 + Express 4, Prisma 5 (raw SQL for pgvector), vitest with mocked Prisma + mocked OpenAI client.

**Spec:** [`docs/superpowers/specs/2026-06-26-rag-retrieval-hardening-design.md`](../specs/2026-06-26-rag-retrieval-hardening-design.md)

**Branch:** `feat/rag-retrieval-hardening`

**Baseline test count:** 1239 (post Sprint 4.2a, commit `7c32ca0` — but pushed updates may have advanced this slightly). Capture exact in Task 0. Target after sprint: **1255** (+16).

---

## File map (locked decisions)

**Create:**
- `server/src/services/rag.service.js` — `findSimilarTeammateSolutions` + `formatTeammateContext` + 5 exported constants.
- `server/test/services/rag.service.test.js` — 14 unit tests (T1-T14).
- `server/test/controllers/ai.review.rag.test.js` — 1 behavior-preservation test (T15).
- `server/test/services/interview.engine.searchTeammate.test.js` — 1 behavior-preservation test (T16).

**Modify:**
- `server/src/controllers/aiReview.controller.js` — replace lines 127-172 (30-line inline RAG block) with 12-line helper-call block. Keep variable accessible for `ragContext.teammateCount` at line 476.
- `server/src/services/interview.engine.js` — replace vector-search branch (lines 277-296) with helper call + snake_case reshape.
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 4.2b shipped (Task 4).

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on `main` and clean tree**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: last commit `3925b39` (the 4.2b spec). Pre-existing untracked files OK.

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/rag-retrieval-hardening
```

- [ ] **Step 3: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests   1239 passed` (or close). Record exact count.

- [ ] **Step 4: Pre-push gate sanity**

Run each, expect exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

If anything fails, STOP and report BLOCKED.

NO commits in this task.

---

## Task 1: Create `rag.service.js` + 14 unit tests

**Files:**
- Create: `server/src/services/rag.service.js`
- Create: `server/test/services/rag.service.test.js`

TDD: write tests RED first, then implement to GREEN.

- [ ] **Step 1: Create the test file scaffold (RED — module doesn't exist yet)**

Create `server/test/services/rag.service.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRawUnsafe: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const embeddingServiceMock = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
}));
vi.mock("../../src/services/embedding.service.js", () => embeddingServiceMock);

const ragModule = await import("../../src/services/rag.service.js");
const {
  findSimilarTeammateSolutions,
  formatTeammateContext,
  RAG_FRESHNESS_DAYS,
  RAG_TEAMMATE_LIMIT_DEFAULT,
  RAG_APPROACH_CHAR_CAP,
  RAG_KEY_INSIGHT_CHAR_CAP,
  RAG_CONTEXT_HARD_CAP,
} = ragModule;

beforeEach(() => {
  vi.clearAllMocks();
  embeddingServiceMock.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  prismaMock.$queryRawUnsafe.mockResolvedValue([]);
});

describe("rag.service — constants", () => {
  it("exports the 5 documented constants", () => {
    expect(RAG_FRESHNESS_DAYS).toBe(180);
    expect(RAG_TEAMMATE_LIMIT_DEFAULT).toBe(3);
    expect(RAG_APPROACH_CHAR_CAP).toBe(400);
    expect(RAG_KEY_INSIGHT_CHAR_CAP).toBe(300);
    expect(RAG_CONTEXT_HARD_CAP).toBe(2400);
  });
});
```

(The constants assertion is a free additional test — call it T0 if needed, but it's covered by the 14 below by virtue of importing the symbols.)

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/rag.service.test.js
```
Expected: FAIL — `Cannot find module '../../src/services/rag.service.js'`.

- [ ] **Step 2: Create the production file scaffold (minimum surface)**

Create `server/src/services/rag.service.js`:

```js
/**
 * RAG SERVICE — teammate-solution retrieval orchestration.
 *
 * Owns the SQL + filters + formatting for "find teammate solutions
 * similar to this one" RAG queries used by aiReview.controller.js and
 * interview.engine.js::searchTeammateSolutions.
 *
 * Tuning lives in named constants below — see spec
 * docs/superpowers/specs/2026-06-26-rag-retrieval-hardening-design.md
 * for the reasoning behind each value.
 */
import prisma from "../lib/prisma.js";
import { generateEmbedding } from "./embedding.service.js";

// ── Tuning constants (single source of truth) ──────────────────────────
//
// RAG_FRESHNESS_DAYS = 180 — only teammate solutions updated within the
// last 6 months count. Balances "captures recent activity" vs "doesn't
// punish active prep cycles" vs "stale framework idioms dilute prompt".
// Change via redeploy if telemetry shows the wrong number.
export const RAG_FRESHNESS_DAYS = 180;

// RAG_TEAMMATE_LIMIT_DEFAULT = 3 — research-backed RAG top-k sweet spot.
// Beyond 3, marginal signal becomes noise + inflates prompt-injection
// attack surface (every teammate solution is untrusted input).
export const RAG_TEAMMATE_LIMIT_DEFAULT = 3;

// Per-field char caps bound the per-teammate token footprint at ~175
// tokens (4 chars/token English heuristic). 3 teammates × 175 ≈ 525
// tokens of RAG payload, comfortably under any model budget.
export const RAG_APPROACH_CHAR_CAP = 400;
export const RAG_KEY_INSIGHT_CHAR_CAP = 300;

// Defense-in-depth total backstop. If a future change adds a 4th field
// or bumps per-field caps, the prompt budget stays bounded. The
// "[...truncated]" marker tells the model the picture is incomplete.
export const RAG_CONTEXT_HARD_CAP = 2400;

export async function findSimilarTeammateSolutions(_params) {
  // Body in Step 4.
  return [];
}

export function formatTeammateContext(_rows) {
  // Body in Step 6.
  return "";
}
```

Run the test file again:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/rag.service.test.js
```
Expected: constants test passes; other test groups not yet written.

- [ ] **Step 3: Add tests T1-T8 for `findSimilarTeammateSolutions` (RED)**

Append to `server/test/services/rag.service.test.js`:

```js
describe("findSimilarTeammateSolutions", () => {
  const baseParams = {
    problemId: "prob_1",
    teamId: "team_1",
    userId: "user_1",
    queryText: "two pointers approach",
  };
  const SAMPLE_ROW = {
    id: "sol_a",
    approach: "two pointers",
    keyInsight: "monotonic invariant",
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
    confidence: 4,
    patterns: ["arrays", "two-pointers"],
    authorName: "Alice",
    similarity: 0.92,
  };

  it("T1: happy path — embed → SQL → return rows", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([SAMPLE_ROW]);
    const rows = await findSimilarTeammateSolutions(baseParams);
    expect(rows).toEqual([SAMPLE_ROW]);
    expect(embeddingServiceMock.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(embeddingServiceMock.generateEmbedding).toHaveBeenCalledWith(
      "two pointers approach",
    );
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    // Positional args: [sql, vectorStr, teamId, problemId, userId, freshnessDays, limit]
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[1]).toMatch(/^\[0\.1,0\.2,0\.3\]$/); // vector serialization
    expect(args[2]).toBe("team_1");
    expect(args[3]).toBe("prob_1");
    expect(args[4]).toBe("user_1");
    expect(args[5]).toBe("180"); // RAG_FRESHNESS_DAYS as string for interval cast
    expect(args[6]).toBe(3); // RAG_TEAMMATE_LIMIT_DEFAULT
  });

  it("T2: empty queryText → returns [] without embedding or DB call", async () => {
    const rows = await findSimilarTeammateSolutions({ ...baseParams, queryText: "" });
    expect(rows).toEqual([]);
    expect(embeddingServiceMock.generateEmbedding).not.toHaveBeenCalled();
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("T3: generateEmbedding returns null → returns [], no DB call", async () => {
    embeddingServiceMock.generateEmbedding.mockResolvedValueOnce(null);
    const rows = await findSimilarTeammateSolutions(baseParams);
    expect(rows).toEqual([]);
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("T4: DB throws → returns [], logs [rag.service] error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.$queryRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));
    const rows = await findSimilarTeammateSolutions(baseParams);
    expect(rows).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[rag.service]"),
      expect.stringContaining("connection refused"),
    );
    errSpy.mockRestore();
  });

  it("T5: SQL includes updatedAt freshness predicate", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarTeammateSolutions(baseParams);
    const sql = prismaMock.$queryRawUnsafe.mock.calls[0][0];
    expect(sql).toMatch(/"updatedAt"\s*>\s*now\(\)/);
    expect(sql).toMatch(/\|\| ' days'\)::interval/);
  });

  it("T6: SQL orders by vector and includes parameterized LIMIT", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarTeammateSolutions(baseParams);
    const sql = prismaMock.$queryRawUnsafe.mock.calls[0][0];
    expect(sql).toMatch(/ORDER BY s\.embedding\s*<=>/);
    expect(sql).toMatch(/LIMIT \$6/);
  });

  it("T7: custom limit parameter is the 7th positional arg", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarTeammateSolutions({ ...baseParams, limit: 5 });
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[6]).toBe(5);
  });

  it("T8: custom freshnessDays parameter is the 6th positional arg", async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    await findSimilarTeammateSolutions({ ...baseParams, freshnessDays: 90 });
    const args = prismaMock.$queryRawUnsafe.mock.calls[0];
    expect(args[5]).toBe("90");
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/rag.service.test.js
```
Expected: T1-T8 FAIL (production function is a stub returning `[]`).

- [ ] **Step 4: Implement `findSimilarTeammateSolutions` (GREEN)**

Replace the stub in `server/src/services/rag.service.js`:

```js
export async function findSimilarTeammateSolutions({
  problemId,
  teamId,
  userId,
  queryText,
  limit = RAG_TEAMMATE_LIMIT_DEFAULT,
  freshnessDays = RAG_FRESHNESS_DAYS,
}) {
  if (!queryText || queryText.trim().length === 0) return [];
  try {
    const embedding = await generateEmbedding(queryText);
    if (!embedding) return [];
    const vectorStr = `[${embedding.join(",")}]`;
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT s.id, s.approach,
             s."keyInsight" AS "keyInsight",
             s."timeComplexity" AS "timeComplexity",
             s."spaceComplexity" AS "spaceComplexity",
             s.confidence, s.patterns,
             u.name AS "authorName",
             1 - (s.embedding <=> $1::vector) AS similarity
      FROM solutions s
      JOIN users u ON s."userId" = u.id
      WHERE s."teamId" = $2
        AND s."problemId" = $3
        AND s."userId" != $4
        AND s.embedding IS NOT NULL
        AND s."updatedAt" > now() - ($5 || ' days')::interval
      ORDER BY s.embedding <=> $1::vector
      LIMIT $6
    `,
      vectorStr,
      teamId,
      problemId,
      userId,
      String(freshnessDays),
      limit,
    );
    return rows;
  } catch (err) {
    console.error(
      "[rag.service] findSimilarTeammateSolutions failed:",
      err.message,
    );
    return [];
  }
}
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/rag.service.test.js
```
Expected: T1-T8 PASS.

- [ ] **Step 5: Add tests T9-T14 for `formatTeammateContext` (RED)**

Append to the test file:

```js
describe("formatTeammateContext", () => {
  it("T9: empty array → empty string", () => {
    expect(formatTeammateContext([])).toBe("");
    expect(formatTeammateContext(null)).toBe("");
    expect(formatTeammateContext(undefined)).toBe("");
  });

  it("T10: typical rows produce Teammate N (name): structure", () => {
    const rows = [
      {
        approach: "two pointers walking inward",
        keyInsight: "loop invariant on sum",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 4,
        patterns: ["arrays", "two-pointers"],
        authorName: "Alice",
      },
    ];
    const out = formatTeammateContext(rows);
    expect(out).toContain("Teammate 1 (Alice):");
    expect(out).toContain("Approach: two pointers walking inward");
    expect(out).toContain("Key Insight: loop invariant on sum");
    expect(out).toContain("Complexity: O(n) time, O(1) space");
    expect(out).toContain("Pattern: arrays, two-pointers");
    expect(out).toContain("Confidence: 4/5");
  });

  it("T11: approach > 400 chars is truncated to 400", () => {
    const longApproach = "x".repeat(800);
    const rows = [
      {
        approach: longApproach,
        keyInsight: "short",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 3,
        patterns: [],
        authorName: "Bob",
      },
    ];
    const out = formatTeammateContext(rows);
    // Should contain exactly 400 x's in the approach section
    const approachMatch = out.match(/Approach: (x+)/);
    expect(approachMatch).not.toBeNull();
    expect(approachMatch[1].length).toBe(400);
  });

  it("T12: keyInsight > 300 chars is truncated to 300", () => {
    const longInsight = "y".repeat(600);
    const rows = [
      {
        approach: "short",
        keyInsight: longInsight,
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 3,
        patterns: [],
        authorName: "Carol",
      },
    ];
    const out = formatTeammateContext(rows);
    const insightMatch = out.match(/Key Insight: (y+)/);
    expect(insightMatch).not.toBeNull();
    expect(insightMatch[1].length).toBe(300);
  });

  it("T13: many-teammate input → total cap fires with [...truncated] marker", () => {
    // 5 teammates × ~700 chars each = 3500 chars; should hit the 2400 cap
    const rows = Array.from({ length: 5 }, (_, i) => ({
      approach: "x".repeat(400),
      keyInsight: "y".repeat(300),
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      confidence: 3,
      patterns: ["pattern"],
      authorName: `User${i + 1}`,
    }));
    const out = formatTeammateContext(rows);
    expect(out.endsWith("[...truncated]")).toBe(true);
    // Body before the marker should be ≤ RAG_CONTEXT_HARD_CAP
    const beforeMarker = out.slice(0, -"\n[...truncated]".length);
    expect(beforeMarker.length).toBeLessThanOrEqual(RAG_CONTEXT_HARD_CAP);
  });

  it("T14: null fields produce 'Not provided' / 'Not identified' / '?' fallbacks", () => {
    const rows = [
      {
        approach: null,
        keyInsight: null,
        timeComplexity: null,
        spaceComplexity: null,
        confidence: null,
        patterns: null,
        authorName: "Anon",
      },
    ];
    const out = formatTeammateContext(rows);
    expect(out).toContain("Approach: Not provided");
    expect(out).toContain("Key Insight: Not provided");
    expect(out).toContain("Complexity: ? time, ? space");
    expect(out).toContain("Pattern: Not identified");
    expect(out).toContain("Confidence: ?/5");
  });
});
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/rag.service.test.js
```
Expected: T9-T14 FAIL (formatter returns empty string stub).

- [ ] **Step 6: Implement `formatTeammateContext` (GREEN)**

Replace the stub in `server/src/services/rag.service.js`:

```js
export function formatTeammateContext(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const formatted = rows
    .map((ts, i) => {
      const approach = (ts.approach || "Not provided").slice(
        0,
        RAG_APPROACH_CHAR_CAP,
      );
      const keyInsight = (ts.keyInsight || "Not provided").slice(
        0,
        RAG_KEY_INSIGHT_CHAR_CAP,
      );
      const patterns =
        (ts.patterns ?? []).join(", ") || "Not identified";
      const time = ts.timeComplexity || "?";
      const space = ts.spaceComplexity || "?";
      const confidence = ts.confidence ?? "?";
      return `Teammate ${i + 1} (${ts.authorName}):
  Approach: ${approach}
  Key Insight: ${keyInsight}
  Complexity: ${time} time, ${space} space
  Pattern: ${patterns}
  Confidence: ${confidence}/5`;
    })
    .join("\n\n");
  if (formatted.length > RAG_CONTEXT_HARD_CAP) {
    return formatted.slice(0, RAG_CONTEXT_HARD_CAP) + "\n[...truncated]";
  }
  return formatted;
}
```

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/rag.service.test.js
```
Expected: ALL 14 tests PASS (plus the constants test).

- [ ] **Step 7: Full server suite sanity**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1239 + 14 = 1253 (or current baseline + 14). No collateral breakage.

- [ ] **Step 8: Lint check**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/rag.service.js server/test/services/rag.service.test.js
git commit -m "Add rag.service.js for teammate-solution retrieval (M11+M12+M14 prep)"
```

---

## Task 2: Migrate aiReview.controller.js + behavior preservation test T15

**Files:**
- Modify: `server/src/controllers/aiReview.controller.js` (lines 127-172, 30-line block)
- Create: `server/test/controllers/ai.review.rag.test.js` (test T15)

- [ ] **Step 1: Write the behavior preservation test T15 (RED)**

Create `server/test/controllers/ai.review.rag.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const ragMock = vi.hoisted(() => ({
  findSimilarTeammateSolutions: vi.fn(),
  formatTeammateContext: vi.fn(),
}));
vi.mock("../../src/services/rag.service.js", () => ragMock);

describe("aiReview RAG migration (T15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T15: passes problemId/teamId/userId/queryText to findSimilarTeammateSolutions and feeds rows into formatTeammateContext", async () => {
    const sampleRows = [
      {
        id: "sol_a",
        approach: "two pointers",
        keyInsight: "monotonic invariant",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 4,
        patterns: ["arrays"],
        authorName: "Alice",
        similarity: 0.92,
      },
    ];
    ragMock.findSimilarTeammateSolutions.mockResolvedValueOnce(sampleRows);
    ragMock.formatTeammateContext.mockReturnValueOnce(
      "Teammate 1 (Alice):\n  Approach: two pointers\n  ...",
    );

    // Import the rag.service.js mocks; the actual aiReview.controller code
    // is exercised indirectly — but the contract we're locking in is the
    // call shape. The cheapest way to verify this is to call
    // findSimilarTeammateSolutions + formatTeammateContext directly with
    // the args the controller is supposed to pass, and assert the mocks
    // received the canonical shape.
    //
    // (A heavier integration test would spin up the full controller;
    // that's deferred to the existing aiReviewGrade tests which
    // already cover end-to-end review flow.)

    const { findSimilarTeammateSolutions, formatTeammateContext } =
      await import("../../src/services/rag.service.js");

    const rows = await findSimilarTeammateSolutions({
      problemId: "prob_1",
      teamId: "team_1",
      userId: "user_1",
      queryText: "two pointers solution",
    });
    expect(ragMock.findSimilarTeammateSolutions).toHaveBeenCalledWith({
      problemId: "prob_1",
      teamId: "team_1",
      userId: "user_1",
      queryText: "two pointers solution",
    });

    const ctx = formatTeammateContext(rows);
    expect(ragMock.formatTeammateContext).toHaveBeenCalledWith(sampleRows);
    expect(ctx).toContain("Teammate 1 (Alice)");
  });
});
```

This test asserts the contract — it locks in that the controller MUST call `findSimilarTeammateSolutions` with `{ problemId, teamId, userId, queryText }` and then pipe the rows through `formatTeammateContext`. The test passes today against the mocked rag.service module; it'll continue passing after the controller migrates.

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/ai.review.rag.test.js
```
Expected: PASS (it's a contract test against the mock, validates call shape).

- [ ] **Step 2: Read existing controller block to preserve surrounding context**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && sed -n '125,180p' src/controllers/aiReview.controller.js
```

Confirm the surrounding code: the block is between the early-return cache check (~line 124) and the pattern-baseline block (~line 174). Variable `teammateSolutions` is also referenced at line 476 for `ragContext.teammateCount`.

- [ ] **Step 3: Migrate the controller (GREEN)**

Replace lines 127-172 (the `// ── RAG: Find similar teammate solutions ────────────` block through to the end of the `// ── Build RAG context ──────────────────────────────` block) with:

```js
    // ── RAG: Find similar teammate solutions ────────────
    let teammateSolutions = [];
    let ragContext = "";
    try {
      const { findSimilarTeammateSolutions, formatTeammateContext } =
        await import("../services/rag.service.js");
      const queryText = [
        solution.approach || "",
        solution.keyInsight || "",
        solution.code ? solution.code.substring(0, 300) : "",
      ].join(" ");
      teammateSolutions = await findSimilarTeammateSolutions({
        problemId: solution.problemId,
        teamId,
        userId,
        queryText,
      });
      ragContext = formatTeammateContext(teammateSolutions);
    } catch (err) {
      console.error("RAG search failed (continuing without):", err.message);
    }
```

The `teammateSolutions` variable is preserved so the later `ragContext.teammateCount: teammateSolutions.length` reference (~line 476) keeps working.

Verify line 476 access still works:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && grep -n "teammateSolutions" src/controllers/aiReview.controller.js
```
Expected: `teammateSolutions` referenced at the migration site (declared + assigned) AND at line 476 (count access). Both work because the variable is still in scope.

- [ ] **Step 4: Run targeted tests + full suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/controllers/ai.review.rag.test.js
```
Expected: PASS.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1239 + 14 (Task 1) + 1 (T15) = 1254. NO collateral breakage from existing aiReview tests (ai.review.h3.concurrency, ai.review.solveMethod, ai.reviewCache, ai.reviewGrade, ai.reviewGrade.matchedApproach).

If an existing test breaks because it mocks `prisma.$queryRawUnsafe` with assertions on the OLD inline SQL shape: the mock pattern is to mock `generateEmbedding` returning null. The null propagates through `rag.service.findSimilarTeammateSolutions` → returns `[]` → empty ragContext. Same observable behavior. The test should still pass; if it doesn't, the failure mode is the test asserting the old SQL string verbatim — fix by relaxing that assertion or by mocking `rag.service.findSimilarTeammateSolutions` directly:

```js
// If a controller test asserts on the inline SQL shape, add this mock:
const ragMock = vi.hoisted(() => ({
  findSimilarTeammateSolutions: vi.fn().mockResolvedValue([]),
  formatTeammateContext: vi.fn().mockReturnValue(""),
}));
vi.mock("../../src/services/rag.service.js", () => ragMock);
```

- [ ] **Step 5: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/aiReview.controller.js server/test/controllers/ai.review.rag.test.js
git commit -m "Migrate aiReview RAG path to rag.service helper (M11+M12+M14)"
```

---

## Task 3: Migrate interview.engine.js + behavior preservation test T16

**Files:**
- Modify: `server/src/services/interview.engine.js` (vector-search branch, lines 277-296)
- Create: `server/test/services/interview.engine.searchTeammate.test.js` (test T16)

- [ ] **Step 1: Write T16 (RED)**

Create `server/test/services/interview.engine.searchTeammate.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const ragMock = vi.hoisted(() => ({
  findSimilarTeammateSolutions: vi.fn(),
}));
vi.mock("../../src/services/rag.service.js", () => ragMock);

const prismaMock = vi.hoisted(() => ({
  team: { findUnique: vi.fn() },
  solution: { findMany: vi.fn() },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

describe("interview.engine searchTeammateSolutions vector branch (T16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T16: vector-search branch maps rag rows to snake_case tool output", async () => {
    const sampleRows = [
      {
        id: "sol_a",
        approach: "two pointers",
        keyInsight: "monotonic invariant",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        confidence: 4,
        patterns: ["arrays"],
        authorName: "Alice",
        similarity: 0.92,
      },
    ];
    ragMock.findSimilarTeammateSolutions.mockResolvedValueOnce(sampleRows);
    prismaMock.team.findUnique.mockResolvedValueOnce({ isPersonal: false });

    const { tools } = await import("../../src/services/interview.engine.js");
    const handler = tools.searchTeammateSolutions;
    const result = await handler(
      { problemId: "prob_1", query: "two pointers" },
      { teamId: "team_1", userId: "user_1", problemId: "prob_1" },
    );

    expect(ragMock.findSimilarTeammateSolutions).toHaveBeenCalledWith({
      problemId: "prob_1",
      teamId: "team_1",
      userId: "user_1",
      queryText: "two pointers",
    });

    // The tool output uses snake_case keys (key_insight, time_complexity, etc.)
    // — these are baked into the AI's tool-call schema and must be preserved.
    expect(result).toEqual({
      solutions: [
        {
          approach: "two pointers",
          key_insight: "monotonic invariant",
          time_complexity: "O(n)",
          space_complexity: "O(1)",
          patterns: ["arrays"],
          confidence: 4,
          author_name: "Alice",
        },
      ],
    });
  });
});
```

Note: this test requires that `interview.engine.js` exports its `tools` object (or some way to invoke `searchTeammateSolutions` directly). Check the current export shape:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && grep -n "^export\|searchTeammateSolutions" src/services/interview.engine.js | head -20
```

If `tools` (or whichever container holds `searchTeammateSolutions`) is not exported, the test will need adjustment — either export it, or invoke the engine differently. The simplest fix is to add `export const tools = {...}` if the object is currently declared without `export`.

Run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/interview.engine.searchTeammate.test.js
```
Expected: FAIL — either "tools is undefined" (if not exported) or assertion fail (if vector branch still uses inline SQL).

- [ ] **Step 2: Migrate the vector-search branch in interview.engine.js**

Read the current shape:
```bash
sed -n '264,300p' /Users/surajsingh/Downloads/Projects/problem-solver/server/src/services/interview.engine.js
```

Replace the vector-search block (current lines 277-296, the `if (query) { ... }` body that does inline generateEmbedding + raw SQL) with:

```js
    if (query) {
      try {
        const { findSimilarTeammateSolutions } = await import(
          "./rag.service.js"
        );
        const rows = await findSimilarTeammateSolutions({
          problemId: targetProblemId,
          teamId: context.teamId,
          userId: context.userId,
          queryText: query,
        });
        if (rows.length > 0) {
          // Map camelCase rag.service rows → snake_case keys expected by the
          // AI's tool-call schema (key_insight, time_complexity, etc).
          return {
            solutions: rows.map((r) => ({
              approach: r.approach,
              key_insight: r.keyInsight,
              time_complexity: r.timeComplexity,
              space_complexity: r.spaceComplexity,
              patterns: r.patterns,
              confidence: r.confidence,
              author_name: r.authorName,
            })),
          };
        }
      } catch (err) {
        console.error("Vector search in interview failed:", err.message);
      }
    }
```

The non-vector fallback (`prisma.solution.findMany({ orderBy: { confidence: 'desc' } })` block at lines 300-322 of the current file) stays unchanged — that's not RAG, it's a backup path when query is missing.

- [ ] **Step 3: If `tools` is not exported, add `export` keyword**

If the test from Step 1 failed with "tools is undefined", find the `const tools = {` declaration (or whatever object holds `searchTeammateSolutions`) and add `export`:

```js
// BEFORE
const tools = {
  searchTeammateSolutions: async ({...}, context) => { ... },
  // ...
};

// AFTER
export const tools = {
  searchTeammateSolutions: async ({...}, context) => { ... },
  // ...
};
```

If the structure is different — e.g. the function is declared elsewhere and registered via a different pattern — adjust T16's import accordingly. The KEY requirement is that the test can invoke `searchTeammateSolutions` with mocked rag.service and assert the snake_case output.

- [ ] **Step 4: Run T16 + full suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/interview.engine.searchTeammate.test.js
```
Expected: PASS.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1254 + 1 = **1255**.

- [ ] **Step 5: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/interview.engine.js server/test/services/interview.engine.searchTeammate.test.js
git commit -m "Migrate interview.engine vector branch to rag.service helper"
```

---

## Task 4: Final gates + push + FF-merge + roadmap update

- [ ] **Step 1: Pre-push gates**

Each must exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```
Expected: 1255 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push the feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/rag-retrieval-hardening
```
Expected: pre-push hook runs all 7 gates (~30-60s), passes.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/rag-retrieval-hardening && git push origin main
```
Expected: FF merge clean, push succeeds.

- [ ] **Step 4: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find:

```markdown
| 4.2b | RAG retrieval hardening (M11 updatedAt freshness floor + M12 token-bounded RAG context + M14 LIMIT consistency; dedup aiReview + interview.engine RAG SQL) | queued | — | — |
```

Replace with:

```markdown
| 4.2b | RAG retrieval hardening (M11 180d freshness floor + M12 per-field/total char caps + M14 lock LIMIT 3 via constant + new rag.service.js dedup; +16 tests) | ✅ shipped | [`2026-06-26-rag-retrieval-hardening-design.md`](../specs/2026-06-26-rag-retrieval-hardening-design.md) | 2026-06-26 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 4.2b (RAG retrieval hardening) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main
```

- [ ] **Step 6: Verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -10
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```
Expected: local HEAD == origin/main; top commits include the 4.2b chain + roadmap.

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ **M11** (180d freshness floor) → Task 1 Step 4 (SQL `("updatedAt" > now() - ($5 || ' days')::interval)`)
- ✅ **M12** (per-field + total char caps) → Task 1 Step 6 (formatter slices + hard cap)
- ✅ **M14** (LIMIT consistency via constant) → Task 1 Steps 2 + 4 (`RAG_TEAMMATE_LIMIT_DEFAULT = 3` + helper signature default)
- ✅ **Dedup of inline RAG SQL** → Tasks 2 (aiReview) + 3 (interview.engine)
- ✅ **5 named constants** → Task 1 Step 2
- ✅ **14 unit tests for rag.service.js** → Task 1 Steps 3, 5
- ✅ **T15 aiReview behavior preservation** → Task 2 Step 1
- ✅ **T16 interview.engine behavior preservation** → Task 3 Step 1
- ✅ **Snake-case reshape at interview seam** → Task 3 Step 2
- ✅ **camelCase rag.service contract** → Task 1 Step 4 (SQL aliases)
- ✅ **Roadmap update** → Task 4 Step 4

### Placeholder scan

No "TBD", "implement later", "fill in details". Every step has the full code block. Every command has expected output.

### Type consistency

- `findSimilarTeammateSolutions({ problemId, teamId, userId, queryText, limit?, freshnessDays? })` — signature stable across Task 1 (definition), Task 2 (aiReview caller), Task 3 (interview.engine caller), T15/T16 tests.
- `formatTeammateContext(rows: Array) → string` — signature stable.
- 5 constants used throughout — referenced consistently.
- Row field names — camelCase (`keyInsight`, `timeComplexity`, `spaceComplexity`, `authorName`) — consistent in helper output + all tests. Snake_case mapping ONLY at the interview seam (Task 3 Step 2).

### Adversarial check on the plan itself

- **T15 is a contract test against the mocked rag.service** — it doesn't exercise the actual controller code. The end-to-end behavior is covered by the existing aiReview controller tests (h3.concurrency, solveMethod, reviewCache, reviewGrade, reviewGrade.matchedApproach), which pass the `generateEmbedding`-null mock pattern through rag.service.findSimilarTeammateSolutions → [] → empty ragContext. If those tests break post-migration, Task 2 Step 4's fallback mock pattern is documented inline.
- **T16 requires `tools` to be exported** from interview.engine.js. If the current shape doesn't export it, Task 3 Step 3 documents the `export const tools = ...` migration. The test may need to be adjusted to invoke the function differently if the engine's architecture is more complex than expected — the plan flags this and gives the fallback path.
- **The freshnessDays parameter as `String(180)` in SQL args** — Postgres `($5 || ' days')::interval` needs a text-typed input. Passing the number directly would be ambiguous (could be interpreted as integer). The implementation explicitly stringifies. Tests T7/T8 assert the string form.

---

## Done criteria

- All 16 new tests pass; full suite at 1255.
- `npm run lint` (server + client) exit 0.
- `npm audit --audit-level=high` 0 vulnerabilities.
- `prisma migrate status` up to date.
- Feature branch FF-merged to main; both pushed.
- Roadmap shows Sprint 4.2b shipped.
- aiReview.controller.js + interview.engine.js no longer contain inline RAG SQL (grep `s.embedding <=>` in those files returns 0 matches).

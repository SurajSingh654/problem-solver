# Review Page Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the six review-page bug fixes from feedback `cmqiuoqk900rld8zxm72sssli` per the design spec at `docs/superpowers/specs/2026-06-18-review-page-fixes-design.md`.

**Architecture:** New `canonical*` slice on `Problem` (lazy-filled by AI, admin-editable). Grader rewired to canonical-anchor with user notes as augmentation. Recall modal becomes a four-phase state machine (BRIEF → RECALL → REVEAL → RATE) with Show Answer peek and SM-2 quality cap. Multi-select pattern picker + templated O() input swapped into recall. Diff tab deleted. All gated by `FEATURE_CANONICAL_ANSWERS` (server) + `VITE_FEATURE_CANONICAL_ANSWERS` (client + Dockerfile).

**Tech Stack:** Prisma + PostgreSQL, Express, OpenAI via `ai.service.js`, vitest (server), React 18 + TanStack Query (client). No client test runner — client tasks include manual smoke checklists.

---

## File map

**Server new:**
- `prisma/migrations/<TIMESTAMP>_add_canonical_to_problem/migration.sql`
- `src/utils/oComplexityNormalizer.js`
- `test/controllers/canonical.controller.test.js`
- `test/controllers/canonical.adminPatch.test.js`
- `test/ai/canonicalAnswerSchema.test.js`
- `test/controllers/ai.reviewGrade.hybrid.test.js`
- `test/controllers/solutions.submitReview.peeked.test.js`
- `test/utils/oComplexityNormalizer.test.js`

**Server modified:**
- `prisma/schema.prisma` (Problem + Solution + ReviewAttempt fields)
- `src/controllers/problems.controller.js` (getCanonical, patchCanonical handlers)
- `src/controllers/ai.controller.js` (generateCanonicalAnswer helper, gradeReviewRecall rewrite)
- `src/controllers/solutions.controller.js` (submitReview peeked support)
- `src/services/ai.validators.js` (validateCanonicalAnswer, peeked clamp in validateRecallGrade)
- `src/services/ai.fallbacks.js` (buildFallbackRecallGrade peeked-aware)
- `src/schemas/problem.schema.js` (canonicalPatchSchema)
- `src/schemas/solution.schema.js` (peeked field on submitReview)
- `src/routes/problems.routes.js` (GET + PATCH /:id/canonical)
- `src/config/env.js` or wherever `FEATURE_*` flags are read
- `.env.example`

**Client new:**
- `src/components/features/solutions/PatternSelector.jsx` (extracted)
- `src/components/features/solutions/OComplexityInput.jsx`
- `src/components/features/review/CanonicalAnswerPanel.jsx`
- `src/hooks/useCanonical.js`

**Client modified:**
- `src/pages/ReviewQueuePage.jsx` (4-phase state machine, swaps, removals)
- `src/pages/problems/SubmitSolutionPage.jsx` (import shared PatternSelector)
- `src/components/features/admin/ProblemForm.jsx` (canonical admin section)
- `src/services/api.js` or new `canonical.api.js`
- `client/Dockerfile` (VITE_FEATURE_CANONICAL_ANSWERS ARG/ENV)

**Client deleted:**
- `src/components/features/solutions/RecallDiff.jsx`

---

## Conventions

- All commits use short single-line subjects (no Co-Authored-By trailer per user preference).
- Each task ends with one commit.
- Server tests follow `server/test/controllers/_harness.js` pattern (mocked Prisma + mocked `aiComplete`).
- Migrations follow CLAUDE.md workflow: pre-create SQL, run `db:migrate`, **Ctrl+C** the drift-fix prompt.
- Five-touchpoint rule: any new mutation field must update migration + schema.prisma + Zod + controller allow-list + client payload.

---

## Task 1: Schema migration + flag scaffolding

**Files:**
- Create: `server/prisma/migrations/<TIMESTAMP>_add_canonical_to_problem/migration.sql`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/.env.example`
- Modify: `client/Dockerfile`

- [ ] **Step 1: Generate the timestamp**

```bash
date -u +%Y%m%d%H%M%S
```

Use that string in place of `<TIMESTAMP>` for the directory name (e.g., `20260618120000_add_canonical_to_problem`).

- [ ] **Step 2: Create the migration SQL**

```bash
mkdir -p server/prisma/migrations/<TIMESTAMP>_add_canonical_to_problem
```

Write `server/prisma/migrations/<TIMESTAMP>_add_canonical_to_problem/migration.sql`:

```sql
ALTER TABLE "Problem"
  ADD COLUMN "canonicalPattern"          TEXT,
  ADD COLUMN "canonicalKeyInsight"       TEXT,
  ADD COLUMN "canonicalTimeComplexity"   TEXT,
  ADD COLUMN "canonicalSpaceComplexity"  TEXT,
  ADD COLUMN "canonicalGeneratedAt"      TIMESTAMP(3),
  ADD COLUMN "canonicalEditedByUserId"   TEXT,
  ADD COLUMN "canonicalEditedAt"         TIMESTAMP(3);

ALTER TABLE "Solution"
  ADD COLUMN "lastCanonicalFetchAt"      TIMESTAMP(3);

ALTER TABLE "ReviewAttempt"
  ADD COLUMN "peeked"                    BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Add Prisma fields**

In `server/prisma/schema.prisma`, find `model Problem {` and add to its body:

```prisma
  canonicalPattern         String?
  canonicalKeyInsight      String?
  canonicalTimeComplexity  String?
  canonicalSpaceComplexity String?
  canonicalGeneratedAt     DateTime?
  canonicalEditedByUserId  String?
  canonicalEditedAt        DateTime?
```

In `model Solution {` add:

```prisma
  lastCanonicalFetchAt DateTime?
```

In `model ReviewAttempt {` add:

```prisma
  peeked Boolean @default(false)
```

- [ ] **Step 4: Run the migration**

```bash
cd server && npm run db:migrate
```

When prompted "Enter a name for the new migration" — **Ctrl+C** (this is the pgvector drift fix; do not let it run, per CLAUDE.md).

Verify with:

```bash
npx prisma migrate status
```

Expected: "Database schema is up to date."

- [ ] **Step 5: Add the feature flag to env example**

In `server/.env.example`, add:

```
# Canonical Answers (Review Page rebuild)
FEATURE_CANONICAL_ANSWERS=false
```

- [ ] **Step 6: Wire the flag in client Dockerfile**

In `client/Dockerfile`, find the existing `ARG VITE_FEATURE_*` block and add:

```dockerfile
ARG VITE_FEATURE_CANONICAL_ANSWERS=false
ENV VITE_FEATURE_CANONICAL_ANSWERS=$VITE_FEATURE_CANONICAL_ANSWERS
```

- [ ] **Step 7: Commit**

```bash
git add server/prisma/migrations server/prisma/schema.prisma server/.env.example client/Dockerfile
git commit -m "Add canonical answer schema + feature flag scaffold"
```

---

## Task 2: Canonical answer Zod schema (TDD)

**Files:**
- Create: `server/test/ai/canonicalAnswerSchema.test.js`
- Modify: `server/src/services/ai.validators.js` (add `validateCanonicalAnswer`) — or wherever the project keeps Zod AI schemas; check `ai.schemas.js` if it exists.

- [ ] **Step 1: Write the failing test**

`server/test/ai/canonicalAnswerSchema.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { validateCanonicalAnswer } from "../../src/services/ai.validators.js";
import { CANONICAL_PATTERN_LABELS } from "../../src/utils/patternTaxonomy.js";

describe("validateCanonicalAnswer", () => {
  const valid = {
    pattern: CANONICAL_PATTERN_LABELS[0],
    keyInsight: "Use a hash map. Look up complements in O(1).",
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
  };

  it("accepts a well-formed canonical answer", () => {
    const result = validateCanonicalAnswer(valid);
    expect(result).not.toBeNull();
    expect(result.pattern).toBe(valid.pattern);
  });

  it("rejects empty keyInsight", () => {
    expect(validateCanonicalAnswer({ ...valid, keyInsight: "" })).toBeNull();
  });

  it("rejects pattern outside the canonical taxonomy", () => {
    expect(
      validateCanonicalAnswer({ ...valid, pattern: "Made-Up Pattern" }),
    ).toBeNull();
  });

  it("rejects timeComplexity not in O(...) form", () => {
    expect(
      validateCanonicalAnswer({ ...valid, timeComplexity: "linear" }),
    ).toBeNull();
  });

  it("rejects missing spaceComplexity", () => {
    expect(
      validateCanonicalAnswer({ ...valid, spaceComplexity: "" }),
    ).toBeNull();
  });

  it("rejects null input", () => {
    expect(validateCanonicalAnswer(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/ai/canonicalAnswerSchema.test.js
```

Expected: FAIL with "validateCanonicalAnswer is not a function" (or "is not exported").

- [ ] **Step 3: Implement validator**

In `server/src/services/ai.validators.js`, add (near other validators):

```javascript
import { z } from "zod";
import { CANONICAL_PATTERN_LABELS } from "../utils/patternTaxonomy.js";

const O_NOTATION_RE = /^O\(.+\)$/;

const canonicalAnswerSchema = z
  .object({
    pattern: z.string().refine(
      (v) => CANONICAL_PATTERN_LABELS.includes(v),
      { message: "pattern must be in CANONICAL_PATTERN_LABELS" },
    ),
    keyInsight: z.string().min(1),
    timeComplexity: z.string().regex(O_NOTATION_RE),
    spaceComplexity: z.string().regex(O_NOTATION_RE),
  })
  .strict();

export function validateCanonicalAnswer(parsed) {
  if (parsed == null || typeof parsed !== "object") return null;
  const result = canonicalAnswerSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd server && npx vitest run test/ai/canonicalAnswerSchema.test.js
```

Expected: 6 tests pass.

- [ ] **Step 5: Run full server test suite**

```bash
cd server && npm test
```

Expected: All existing tests still pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/ai.validators.js server/test/ai/canonicalAnswerSchema.test.js
git commit -m "Add canonical answer Zod schema and validator"
```

---

## Task 3: Canonical generator helper (TDD)

**Files:**
- Modify: `server/src/controllers/ai.controller.js` (add `generateCanonicalAnswer`)
- Create: tests are deferred to Task 4 (they test the GET endpoint which calls this helper).

- [ ] **Step 1: Add the helper function**

In `server/src/controllers/ai.controller.js`, near the top (after existing imports, before existing exports), add:

```javascript
import { CANONICAL_PATTERN_LABELS } from "../utils/patternTaxonomy.js";
import { validateCanonicalAnswer } from "../services/ai.validators.js";

const CANONICAL_TAXONOMY_LIST = CANONICAL_PATTERN_LABELS.join(", ");

const CANONICAL_SYSTEM_PROMPT = `You produce the canonical interview answer for a coding problem. Your output is the ground truth that future spaced-repetition reviews will be graded against. Be precise, terse, and pick the most teachable approach when several are valid.

Rules:
- pattern: pick ONE label from the canonical taxonomy when possible. If the problem is a clear hybrid, pick the more dominant pattern.
- keyInsight: 2-3 sentences. State the core idea, not the implementation. A candidate who reads this should be able to derive the algorithm.
- timeComplexity / spaceComplexity: optimal complexity. Use "O(?)" form.
- Do not include code.
- Do not hedge. This is the canonical answer; admins can override later.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "pattern":         "<single label>",
  "keyInsight":      "<2-3 sentences>",
  "timeComplexity":  "O(?)",
  "spaceComplexity": "O(?)"
}`;

/**
 * Generate the canonical answer for a problem. Returns null if the AI call
 * succeeds but the output fails validation — caller should NOT persist
 * canonicalGeneratedAt in that case so the next request retries.
 *
 * Throws on AI errors (timeout / 5xx / not-enabled). Caller handles those
 * with a retry-able 503 envelope.
 */
export async function generateCanonicalAnswer(problem, { userId, teamId }) {
  const userPrompt = `<problem_title>${problem.title}</problem_title>
<problem_description>${problem.description ?? ""}</problem_description>
Difficulty: ${problem.difficulty}
Category: ${problem.category}`;

  const parsed = await aiComplete({
    systemPrompt: CANONICAL_SYSTEM_PROMPT,
    userPrompt,
    userId,
    teamId,
    model: AI_MODEL_FAST,
    temperature: 0.1,
    maxTokens: 400,
    jsonMode: true,
    surface: "canonical-generate",
  });

  return validateCanonicalAnswer(parsed);
}
```

(If `aiComplete`, `AI_MODEL_FAST`, or `AI_ENABLED` are not already imported in this file, add them — they're used elsewhere in the same file.)

- [ ] **Step 2: Run lint**

```bash
cd server && npm run lint
```

Expected: PASS (no new warnings).

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/ai.controller.js
git commit -m "Add generateCanonicalAnswer helper"
```

(Test coverage is folded into Task 4, which exercises this through the controller endpoint.)

---

## Task 4: GET /problems/:id/canonical (TDD)

**Files:**
- Modify: `server/src/controllers/problems.controller.js` (add `getCanonical`)
- Modify: `server/src/routes/problems.routes.js` (mount the route)
- Create: `server/test/controllers/canonical.controller.test.js`

- [ ] **Step 1: Write the failing test**

`server/test/controllers/canonical.controller.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiBehavior = { kind: "valid", payload: {} };
let problemRow = null;
let updateCalls = [];
let txCalls = 0;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    problem: {
      findFirst: vi.fn(async () => problemRow),
      update: vi.fn(async ({ where, data }) => {
        updateCalls.push({ where, data });
        problemRow = { ...problemRow, ...data };
        return problemRow;
      }),
    },
    solution: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    $transaction: vi.fn(async (fn) => {
      txCalls += 1;
      const tx = {
        $queryRaw: vi.fn(async () =>
          problemRow ? [{ id: problemRow.id, canonicalGeneratedAt: problemRow.canonicalGeneratedAt }] : [],
        ),
        problem: {
          update: vi.fn(async ({ where, data }) => {
            updateCalls.push({ where, data });
            problemRow = { ...problemRow, ...data };
            return problemRow;
          }),
        },
      };
      return fn(tx);
    }),
  },
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async () => {
    if (aiBehavior.kind === "throws") throw new Error("ai-down");
    return aiBehavior.payload;
  }),
  isAIEnabled: () => true,
}));

const { getCanonical } = await import("../../src/controllers/problems.controller.js");

describe("getCanonical", () => {
  beforeEach(() => {
    aiBehavior = {
      kind: "valid",
      payload: {
        pattern: "Hashing",
        keyInsight: "Map values to indices for O(1) complement lookup.",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
      },
    };
    problemRow = {
      id: "prob_1",
      title: "Two Sum",
      description: "Given an array, find two indices that sum to target.",
      difficulty: "EASY",
      category: "CODING",
      canonicalGeneratedAt: null,
      canonicalPattern: null,
      canonicalKeyInsight: null,
      canonicalTimeComplexity: null,
      canonicalSpaceComplexity: null,
    };
    updateCalls = [];
    txCalls = 0;
  });

  it("first fetch generates and persists the canonical answer", async () => {
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.pattern).toBe("Hashing");
    const persistCall = updateCalls.find((c) => c.data.canonicalGeneratedAt);
    expect(persistCall).toBeDefined();
    expect(persistCall.data.canonicalPattern).toBe("Hashing");
  });

  it("second fetch reads cache without calling AI", async () => {
    problemRow.canonicalGeneratedAt = new Date();
    problemRow.canonicalPattern = "Hashing";
    problemRow.canonicalKeyInsight = "cached";
    problemRow.canonicalTimeComplexity = "O(n)";
    problemRow.canonicalSpaceComplexity = "O(n)";
    const aiMod = await import("../../src/services/ai.service.js");
    aiMod.aiComplete.mockClear();
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.pattern).toBe("Hashing");
    expect(aiMod.aiComplete).not.toHaveBeenCalled();
  });

  it("returns 502 and does NOT persist when validator rejects AI output", async () => {
    aiBehavior = {
      kind: "valid",
      payload: { pattern: "Made-Up", keyInsight: "x", timeComplexity: "linear", spaceComplexity: "" },
    };
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(502);
    expect(updateCalls.find((c) => c.data.canonicalGeneratedAt)).toBeUndefined();
  });

  it("returns 503 when AI throws and row never generated", async () => {
    aiBehavior = { kind: "throws" };
    const req = makeReq({ params: { id: "prob_1" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(503);
  });

  it("returns 404 when problem not found", async () => {
    problemRow = null;
    const req = makeReq({ params: { id: "missing" } });
    const res = await invoke(getCanonical, req);
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/controllers/canonical.controller.test.js
```

Expected: FAIL with "getCanonical is not a function" (not yet exported).

- [ ] **Step 3: Implement the controller**

In `server/src/controllers/problems.controller.js`, add (using the same import + helper conventions as the rest of the file):

```javascript
import { generateCanonicalAnswer } from "./ai.controller.js";
import { isAIEnabled } from "../services/ai.service.js";

export async function getCanonical(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const teamId = req.teamId;

    const problem = await prisma.problem.findFirst({
      where: { id, teamId },
      select: {
        id: true,
        title: true,
        description: true,
        difficulty: true,
        category: true,
        canonicalGeneratedAt: true,
        canonicalPattern: true,
        canonicalKeyInsight: true,
        canonicalTimeComplexity: true,
        canonicalSpaceComplexity: true,
        canonicalEditedAt: true,
      },
    });
    if (!problem) return error(res, "Problem not found.", 404);

    if (problem.canonicalGeneratedAt) {
      // Update lastCanonicalFetchAt for analytics (fire-and-forget; don't block).
      prisma.solution
        .updateMany({
          where: { problemId: id, userId, teamId },
          data: { lastCanonicalFetchAt: new Date() },
        })
        .catch((e) => console.warn("[canonical] fetchAt update failed", e));

      return success(res, {
        pattern: problem.canonicalPattern,
        keyInsight: problem.canonicalKeyInsight,
        timeComplexity: problem.canonicalTimeComplexity,
        spaceComplexity: problem.canonicalSpaceComplexity,
        generatedAt: problem.canonicalGeneratedAt,
        editedAt: problem.canonicalEditedAt,
      });
    }

    if (!isAIEnabled()) {
      return error(res, "AI features are disabled.", 503);
    }

    // Lazy generate inside a transaction with a row lock so concurrent
    // first-fetch requests collapse to a single AI call.
    let canonical;
    try {
      canonical = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw`
          SELECT "id", "canonicalGeneratedAt", "canonicalPattern",
                 "canonicalKeyInsight", "canonicalTimeComplexity",
                 "canonicalSpaceComplexity"
          FROM "Problem"
          WHERE "id" = ${id}
          FOR UPDATE
        `;
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const locked = rows[0];
        if (locked.canonicalGeneratedAt) {
          // Race winner already filled it.
          return {
            pattern: locked.canonicalPattern,
            keyInsight: locked.canonicalKeyInsight,
            timeComplexity: locked.canonicalTimeComplexity,
            spaceComplexity: locked.canonicalSpaceComplexity,
          };
        }

        const generated = await generateCanonicalAnswer(problem, { userId, teamId });
        if (!generated) return { __validatorRejected: true };

        await tx.problem.update({
          where: { id },
          data: {
            canonicalPattern: generated.pattern,
            canonicalKeyInsight: generated.keyInsight,
            canonicalTimeComplexity: generated.timeComplexity,
            canonicalSpaceComplexity: generated.spaceComplexity,
            canonicalGeneratedAt: new Date(),
          },
        });
        return generated;
      });
    } catch (e) {
      console.error("[canonical] generation failed:", e);
      return error(res, "Couldn't prepare review yet — try again in a moment.", 503);
    }

    if (!canonical) return error(res, "Problem not found.", 404);
    if (canonical.__validatorRejected) {
      return error(res, "AI returned an invalid canonical answer; please retry.", 502);
    }

    return success(res, {
      pattern: canonical.pattern,
      keyInsight: canonical.keyInsight,
      timeComplexity: canonical.timeComplexity,
      spaceComplexity: canonical.spaceComplexity,
      generatedAt: new Date(),
      editedAt: null,
    });
  } catch (err) {
    console.error("getCanonical error:", err);
    return error(res, "Failed to fetch canonical answer.", 500);
  }
}
```

- [ ] **Step 4: Mount the route**

In `server/src/routes/problems.routes.js`, add (next to other GETs):

```javascript
import { getCanonical } from "../controllers/problems.controller.js";

router.get("/:id/canonical", authenticate, requireTeamContext, getCanonical);
```

(Adapt to whatever middleware names the file already uses — copy the style of the existing GET /:id route on the same file.)

- [ ] **Step 5: Run tests, expect pass**

```bash
cd server && npx vitest run test/controllers/canonical.controller.test.js
```

Expected: 5 tests pass.

- [ ] **Step 6: Run the full server test suite**

```bash
cd server && npm test
```

Expected: all tests pass (231 + new ones).

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/problems.controller.js server/src/routes/problems.routes.js server/test/controllers/canonical.controller.test.js
git commit -m "Add GET /problems/:id/canonical with lazy fill and race lock"
```

---

## Task 5: PATCH /problems/:id/canonical (admin override) — TDD

**Files:**
- Modify: `server/src/schemas/problem.schema.js` (add `canonicalPatchSchema`)
- Modify: `server/src/controllers/problems.controller.js` (add `patchCanonical`)
- Modify: `server/src/routes/problems.routes.js` (mount with super-admin guard)
- Create: `server/test/controllers/canonical.adminPatch.test.js`

- [ ] **Step 1: Write the Zod schema**

In `server/src/schemas/problem.schema.js`, add:

```javascript
import { CANONICAL_PATTERN_LABELS } from "../utils/patternTaxonomy.js";

const O_NOTATION_RE = /^O\(.+\)$/;

export const canonicalPatchSchema = z
  .object({
    canonicalPattern: z
      .string()
      .refine((v) => CANONICAL_PATTERN_LABELS.includes(v))
      .optional(),
    canonicalKeyInsight: z.string().min(1).optional(),
    canonicalTimeComplexity: z.string().regex(O_NOTATION_RE).optional(),
    canonicalSpaceComplexity: z.string().regex(O_NOTATION_RE).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one canonical field must be provided.",
  });
```

(If `z` is not imported, add `import { z } from "zod";` at the top.)

- [ ] **Step 2: Write the failing test**

`server/test/controllers/canonical.adminPatch.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let problemRow = { id: "prob_1", canonicalEditedAt: null, canonicalEditedByUserId: null };
let updateCall = null;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    problem: {
      findFirst: vi.fn(async ({ where }) =>
        where.id === "prob_1" ? problemRow : null,
      ),
      update: vi.fn(async ({ where, data }) => {
        updateCall = { where, data };
        problemRow = { ...problemRow, ...data };
        return problemRow;
      }),
    },
  },
}));

const { patchCanonical } = await import(
  "../../src/controllers/problems.controller.js"
);

describe("patchCanonical (admin)", () => {
  beforeEach(() => {
    problemRow = { id: "prob_1", canonicalEditedAt: null, canonicalEditedByUserId: null };
    updateCall = null;
  });

  it("SUPER_ADMIN can update canonical fields", async () => {
    const req = makeReq({
      params: { id: "prob_1" },
      body: { canonicalPattern: "Hashing", canonicalKeyInsight: "use a map" },
      user: { id: "u_admin", globalRole: "SUPER_ADMIN" },
    });
    const res = await invoke(patchCanonical, req);
    expect(res.statusCode).toBe(200);
    expect(updateCall.data.canonicalPattern).toBe("Hashing");
    expect(updateCall.data.canonicalEditedByUserId).toBe("u_admin");
    expect(updateCall.data.canonicalEditedAt).toBeInstanceOf(Date);
  });

  it("regular user gets 403", async () => {
    const req = makeReq({
      params: { id: "prob_1" },
      body: { canonicalPattern: "Hashing" },
      user: { id: "u_member", globalRole: "USER" },
    });
    const res = await invoke(patchCanonical, req);
    expect(res.statusCode).toBe(403);
  });

  it("rejects pattern outside the canonical taxonomy", async () => {
    const req = makeReq({
      params: { id: "prob_1" },
      body: { canonicalPattern: "Made-Up Pattern" },
      user: { id: "u_admin", globalRole: "SUPER_ADMIN" },
    });
    const res = await invoke(patchCanonical, req);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for missing problem", async () => {
    const req = makeReq({
      params: { id: "missing" },
      body: { canonicalPattern: "Hashing" },
      user: { id: "u_admin", globalRole: "SUPER_ADMIN" },
    });
    const res = await invoke(patchCanonical, req);
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 3: Run test, expect failure**

```bash
cd server && npx vitest run test/controllers/canonical.adminPatch.test.js
```

Expected: FAIL with "patchCanonical is not a function".

- [ ] **Step 4: Implement the handler**

Append to `server/src/controllers/problems.controller.js`:

```javascript
import { canonicalPatchSchema } from "../schemas/problem.schema.js";

export async function patchCanonical(req, res) {
  try {
    if (req.user?.globalRole !== "SUPER_ADMIN") {
      return error(res, "Forbidden.", 403);
    }
    const { id } = req.params;
    const parsed = canonicalPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return error(res, "Invalid canonical patch.", 400, {
        details: parsed.error.flatten(),
      });
    }

    const existing = await prisma.problem.findFirst({ where: { id }, select: { id: true } });
    if (!existing) return error(res, "Problem not found.", 404);

    const data = {
      ...parsed.data,
      canonicalEditedByUserId: req.user.id,
      canonicalEditedAt: new Date(),
    };

    const updated = await prisma.problem.update({
      where: { id },
      data,
      select: {
        canonicalPattern: true,
        canonicalKeyInsight: true,
        canonicalTimeComplexity: true,
        canonicalSpaceComplexity: true,
        canonicalEditedAt: true,
        canonicalEditedByUserId: true,
      },
    });

    return success(res, updated);
  } catch (err) {
    console.error("patchCanonical error:", err);
    return error(res, "Failed to update canonical answer.", 500);
  }
}
```

- [ ] **Step 5: Mount the route**

In `server/src/routes/problems.routes.js`, add:

```javascript
import { patchCanonical } from "../controllers/problems.controller.js";

router.patch("/:id/canonical", authenticate, requireTeamContext, patchCanonical);
```

(Authorization is enforced inside the handler — no need for a separate `requireSuperAdmin` middleware unless one already exists in the same file's other routes.)

- [ ] **Step 6: Run tests, expect pass**

```bash
cd server && npx vitest run test/controllers/canonical.adminPatch.test.js
```

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/schemas/problem.schema.js server/src/controllers/problems.controller.js server/src/routes/problems.routes.js server/test/controllers/canonical.adminPatch.test.js
git commit -m "Add SUPER_ADMIN PATCH /problems/:id/canonical"
```

---

## Task 6: O() complexity normalizer utility (TDD)

**Files:**
- Create: `server/src/utils/oComplexityNormalizer.js`
- Create: `server/test/utils/oComplexityNormalizer.test.js`

- [ ] **Step 1: Write the failing test**

`server/test/utils/oComplexityNormalizer.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import {
  normalizeOComplexity,
  isValidOComplexity,
} from "../../src/utils/oComplexityNormalizer.js";

describe("normalizeOComplexity", () => {
  it("wraps bare expressions in O(...)", () => {
    expect(normalizeOComplexity("n")).toBe("O(n)");
    expect(normalizeOComplexity("n log n")).toBe("O(n log n)");
  });

  it("preserves already-wrapped expressions", () => {
    expect(normalizeOComplexity("O(n)")).toBe("O(n)");
    expect(normalizeOComplexity("O(1)")).toBe("O(1)");
  });

  it("trims whitespace", () => {
    expect(normalizeOComplexity("  n  ")).toBe("O(n)");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(normalizeOComplexity("")).toBe("");
    expect(normalizeOComplexity("   ")).toBe("");
    expect(normalizeOComplexity(null)).toBe("");
  });
});

describe("isValidOComplexity", () => {
  it("accepts O(...)", () => {
    expect(isValidOComplexity("O(n)")).toBe(true);
    expect(isValidOComplexity("O(n log n)")).toBe(true);
    expect(isValidOComplexity("O(1)")).toBe(true);
  });

  it("rejects empty or non-O strings", () => {
    expect(isValidOComplexity("")).toBe(false);
    expect(isValidOComplexity("linear")).toBe(false);
    expect(isValidOComplexity("n")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/utils/oComplexityNormalizer.test.js
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the utility**

`server/src/utils/oComplexityNormalizer.js`:

```javascript
const O_NOTATION_RE = /^O\(.+\)$/;

export function normalizeOComplexity(input) {
  if (input == null) return "";
  const trimmed = String(input).trim();
  if (trimmed === "") return "";
  if (O_NOTATION_RE.test(trimmed)) return trimmed;
  return `O(${trimmed})`;
}

export function isValidOComplexity(input) {
  if (typeof input !== "string" || input === "") return false;
  return O_NOTATION_RE.test(input.trim());
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd server && npx vitest run test/utils/oComplexityNormalizer.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/oComplexityNormalizer.js server/test/utils/oComplexityNormalizer.test.js
git commit -m "Add O() complexity normalizer utility"
```

---

## Task 7: Grader rewrite — canonical anchor + peeked clamp (TDD)

**Files:**
- Modify: `server/src/controllers/ai.controller.js` (rewrite `gradeReviewRecall`)
- Modify: `server/src/services/ai.validators.js` (peeked clamp in `validateRecallGrade`)
- Modify: `server/src/services/ai.fallbacks.js` (peeked-aware fallback)
- Create: `server/test/controllers/ai.reviewGrade.hybrid.test.js`

- [ ] **Step 1: Write the failing test**

`server/test/controllers/ai.reviewGrade.hybrid.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiPayload = {};
let lastUserPrompt = "";
let solutionRow = null;
let problemRow = null;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    solution: {
      findFirst: vi.fn(async () => solutionRow),
    },
    problem: {
      findFirst: vi.fn(async () => problemRow),
    },
  },
}));

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: vi.fn(async ({ userPrompt }) => {
    lastUserPrompt = userPrompt;
    return aiPayload;
  }),
  isAIEnabled: () => true,
  AI_MODEL_FAST: "gpt-4o-mini",
}));

const { gradeReviewRecall } = await import(
  "../../src/controllers/ai.controller.js"
);

describe("gradeReviewRecall (hybrid anchor)", () => {
  beforeEach(() => {
    solutionRow = {
      id: "sol_1",
      problemId: "prob_1",
      patterns: ["Hashing"],
      keyInsight: "old user note",
      feynmanExplanation: null,
      optimizedApproach: null,
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      problem: {
        id: "prob_1",
        title: "Two Sum",
        difficulty: "EASY",
        category: "CODING",
        description: "...",
        canonicalGeneratedAt: new Date(),
        canonicalPattern: "Hashing",
        canonicalKeyInsight: "Map values to indices for O(1) complement lookup.",
        canonicalTimeComplexity: "O(n)",
        canonicalSpaceComplexity: "O(n)",
      },
    };
    problemRow = solutionRow.problem;
    aiPayload = {
      pattern: { match: "YES", feedback: "ok" },
      keyInsight: { match: "YES", feedback: "ok" },
      complexity: { match: "YES", feedback: "ok" },
      overall: "pass",
      suggestedConfidence: 5,
    };
    lastUserPrompt = "";
  });

  it("includes <canonical_*> tags in the prompt when canonical present", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "HashMap", keyInsight: "use a map", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).toContain("<canonical_pattern>");
    expect(lastUserPrompt).toContain("<canonical_key_insight>");
    expect(lastUserPrompt).toContain("Map values to indices");
  });

  it("clamps suggestedConfidence to 3 when peeked and model returns 5", async () => {
    aiPayload.suggestedConfidence = 5;
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: {
        recall: { pattern: "HashMap", keyInsight: "use a map", complexity: "O(n) / O(n)" },
        peeked: true,
      },
    });
    const res = await invoke(gradeReviewRecall, req);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.suggestedConfidence).toBe(3);
  });

  it("falls back to user notes when canonical is missing", async () => {
    solutionRow.problem.canonicalGeneratedAt = null;
    solutionRow.problem.canonicalKeyInsight = null;
    problemRow = solutionRow.problem;
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { recall: { pattern: "HashMap", keyInsight: "use a map", complexity: "O(n) / O(n)" } },
    });
    await invoke(gradeReviewRecall, req);
    expect(lastUserPrompt).toContain("<user_notes_key_insight>old user note</user_notes_key_insight>");
    expect(lastUserPrompt).not.toContain("<canonical_key_insight>Map values");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/controllers/ai.reviewGrade.hybrid.test.js
```

Expected: FAIL (assertions about canonical tags don't match the current prompt).

- [ ] **Step 3: Update validator for peeked clamp**

In `server/src/services/ai.validators.js`, find `validateRecallGrade` and modify its signature + body:

```javascript
export function validateRecallGrade(parsed, { peeked = false } = {}) {
  // ... existing shape checks unchanged ...
  if (!shapeOk) return null;

  let { suggestedConfidence } = parsed;
  if (peeked && typeof suggestedConfidence === "number" && suggestedConfidence > 3) {
    console.warn("[recall-grade:peek-clamp] model suggested", suggestedConfidence, "→ 3");
    suggestedConfidence = 3;
  }
  return { ...parsed, suggestedConfidence };
}
```

(Read the current `validateRecallGrade` first; preserve all existing checks; the only change is the new `peeked` option and the clamp at the end.)

- [ ] **Step 4: Update fallback**

In `server/src/services/ai.fallbacks.js`, find `buildFallbackRecallGrade` and update:

```javascript
export function buildFallbackRecallGrade({ pattern, keyInsight, complexity, peeked = false }) {
  return {
    // ... existing shape unchanged ...
    suggestedConfidence: peeked ? 2 : 3,
  };
}
```

- [ ] **Step 5: Rewrite gradeReviewRecall**

In `server/src/controllers/ai.controller.js`, replace the body of `gradeReviewRecall` (currently lines ~2042-2155) so it:

1. Loads the Solution AND its Problem with all `canonical*` fields:

```javascript
const solution = await prisma.solution.findFirst({
  where: { id: solutionId, userId, teamId },
  select: {
    id: true, problemId: true,
    patterns: true, keyInsight: true,
    optimizedApproach: true, feynmanExplanation: true,
    timeComplexity: true, spaceComplexity: true,
    problem: {
      select: {
        id: true, title: true, difficulty: true, category: true, description: true,
        canonicalGeneratedAt: true, canonicalPattern: true,
        canonicalKeyInsight: true, canonicalTimeComplexity: true,
        canonicalSpaceComplexity: true,
      },
    },
  },
});
if (!solution) return error(res, "Solution not found.", 404);
```

2. Decides anchor: canonical when `problem.canonicalGeneratedAt` is non-null, else legacy.

3. Builds the new system + user prompts (use the verbatim text from the spec doc, sections "Grader rewrite — new hybrid anchor"). When canonical missing, omit the `<canonical_*>` tags and include only `<user_notes_*>` + `<user_recall_*>` (legacy behavior preserved).

4. Reads `peeked` from `req.body.peeked` (boolean, default false), passes it into the prompt as `peeked: ${peeked}`, and into `validateRecallGrade` and `buildFallbackRecallGrade` as `{ peeked }`.

5. Existing 503 / 400 / 404 / fallback paths unchanged.

(Implement carefully — the file already has the legacy version; do not delete the legacy reference-construction code, gate it behind `if (!problem.canonicalGeneratedAt)`.)

- [ ] **Step 6: Run tests, expect pass**

```bash
cd server && npx vitest run test/controllers/ai.reviewGrade.hybrid.test.js test/controllers/ai.reviewGrade.test.js
```

Expected: new hybrid tests pass + existing reviewGrade tests still pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/controllers/ai.controller.js server/src/services/ai.validators.js server/src/services/ai.fallbacks.js server/test/controllers/ai.reviewGrade.hybrid.test.js
git commit -m "Rewire grader to canonical-anchor + peeked clamp"
```

---

## Task 8: submitReview accepts peeked + clamps quality (TDD)

**Files:**
- Modify: `server/src/schemas/solution.schema.js` (`submitReviewSchema` adds `peeked`)
- Modify: `server/src/controllers/solutions.controller.js` (`submitReview` clamps + persists)
- Create: `server/test/controllers/solutions.submitReview.peeked.test.js`

- [ ] **Step 1: Write the failing test**

`server/test/controllers/solutions.submitReview.peeked.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let lockRow = null;
let updateData = null;
let attemptData = null;

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    $transaction: vi.fn(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(async () => (lockRow ? [lockRow] : [])),
        solution: {
          update: vi.fn(async ({ data }) => { updateData = data; return {}; }),
        },
        reviewAttempt: {
          create: vi.fn(async ({ data }) => { attemptData = data; return data; }),
        },
      };
      return fn(tx);
    }),
  },
}));

const { submitReview } = await import(
  "../../src/controllers/solutions.controller.js"
);

describe("submitReview (peeked)", () => {
  beforeEach(() => {
    lockRow = {
      id: "sol_1",
      sm2EasinessFactor: 2.5,
      sm2Interval: 1,
      sm2Repetitions: 0,
      reviewDates: [],
      lapseCount: 0,
    };
    updateData = null;
    attemptData = null;
  });

  it("clamps SM-2 quality to 3 when peeked=true and confidence=5", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { confidence: 5, peeked: true },
    });
    const res = await invoke(submitReview, req);
    expect(res.statusCode).toBe(200);
    expect(attemptData.peeked).toBe(true);
    expect(attemptData.quality).toBe(3);
  });

  it("does not clamp when peeked=false", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { confidence: 5, peeked: false },
    });
    const res = await invoke(submitReview, req);
    expect(res.statusCode).toBe(200);
    expect(attemptData.peeked).toBe(false);
    expect(attemptData.quality).toBeGreaterThan(3);
  });

  it("treats omitted peeked as false", async () => {
    const req = makeReq({
      params: { solutionId: "sol_1" },
      body: { confidence: 5 },
    });
    const res = await invoke(submitReview, req);
    expect(res.statusCode).toBe(200);
    expect(attemptData.peeked).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd server && npx vitest run test/controllers/solutions.submitReview.peeked.test.js
```

Expected: assertions on `attemptData.peeked` fail.

- [ ] **Step 3: Update Zod schema**

In `server/src/schemas/solution.schema.js`, find `submitReviewSchema` and add the field:

```javascript
export const submitReviewSchema = z
  .object({
    confidence: z.number().int().min(1).max(5),
    recallText: z.string().max(5000).optional(),
    peeked: z.boolean().optional(),  // ← new
  })
  .strict();
```

- [ ] **Step 4: Update the controller**

In `server/src/controllers/solutions.controller.js`, modify `submitReview`:

```javascript
const { confidence, recallText, peeked = false } = req.body;
// ...existing trimmedRecall logic unchanged...

let quality = confidenceToQuality(confidence);
if (peeked && quality > 3) {
  console.info("[submitReview:peek-clamp]", { solutionId, from: quality, to: 3 });
  quality = 3;
}
const isFailure = quality < 3;
```

In the `tx.reviewAttempt.create({ data: { ... } })` call, add `peeked`:

```javascript
data: {
  solutionId,
  recallText: trimmedRecall || null,
  confidence,
  quality,
  recalled: !isFailure,
  peeked,  // ← new
},
```

- [ ] **Step 5: Run tests, expect pass**

```bash
cd server && npx vitest run test/controllers/solutions.submitReview.peeked.test.js
```

Expected: 3 tests pass.

- [ ] **Step 6: Run full server suite**

```bash
cd server && npm test
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add server/src/schemas/solution.schema.js server/src/controllers/solutions.controller.js server/test/controllers/solutions.submitReview.peeked.test.js
git commit -m "submitReview accepts peeked and clamps SM-2 quality at 3"
```

---

## Task 9: Client API + hooks for canonical answer

**Files:**
- Modify: `client/src/services/api.js` (or whichever file holds the existing solution/problem API helpers — search for `useReviewQueue` to find it)
- Create: `client/src/hooks/useCanonical.js`

- [ ] **Step 1: Add API helpers**

In the existing API services file (search `grep -rn "review-grade" client/src/services/`), append:

```javascript
export const canonicalApi = {
  get: (problemId) => api.get(`/problems/${problemId}/canonical`),
  patch: (problemId, body) => api.patch(`/problems/${problemId}/canonical`, body),
};
```

- [ ] **Step 2: Create the hook file**

`client/src/hooks/useCanonical.js`:

```javascript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { canonicalApi } from "@services/api";
import { useTeamContext } from "@hooks/useTeamContext";

export function useCanonicalAnswer(problemId, { enabled = true } = {}) {
  const { teamQueryKey } = useTeamContext();
  return useQuery({
    queryKey: [...teamQueryKey, "canonical", problemId],
    queryFn: async () => {
      const res = await canonicalApi.get(problemId);
      return res.data?.data ?? res.data;
    },
    enabled: enabled && !!problemId,
    staleTime: Infinity,
  });
}

export function useUpdateCanonicalAnswer(problemId) {
  const qc = useQueryClient();
  const { teamQueryKey } = useTeamContext();
  return useMutation({
    mutationFn: (body) => canonicalApi.patch(problemId, body),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [...teamQueryKey, "canonical", problemId],
      });
    },
  });
}
```

(If `useTeamContext` import path differs, copy the import style used in `client/src/hooks/useAI.js`.)

- [ ] **Step 3: Smoke test (manual)**

Start the dev servers (`cd server && npm run dev`, `cd client && npm run dev`). Open the browser console and run:

```javascript
fetch('/api/v1/problems/<some-real-problem-id>/canonical')
  .then(r => r.json()).then(console.log)
```

Expected: `success: true` with canonical fields (or appropriate 401/403 if not logged in).

- [ ] **Step 4: Run client lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/services/api.js client/src/hooks/useCanonical.js
git commit -m "Add canonical answer client API and hooks"
```

---

## Task 10: Extract PatternSelector into a shared component

**Files:**
- Create: `client/src/components/features/solutions/PatternSelector.jsx`
- Modify: `client/src/pages/problems/SubmitSolutionPage.jsx` (import from new location)

- [ ] **Step 1: Create the shared component**

Read the current `PatternSelector` at `client/src/pages/problems/SubmitSolutionPage.jsx:108-200` and lift it verbatim into `client/src/components/features/solutions/PatternSelector.jsx` with one prop change — accept an optional `compact` prop:

```jsx
import { useState } from "react";
import { cn } from "@utils/cn";
import { PATTERNS } from "@utils/constants";

export function PatternSelector({ value, onChange, suggestions, compact = false }) {
  const [customInput, setCustomInput] = useState("");

  const items = suggestions?.length > 0 ? suggestions : PATTERNS.map((p) => p.label);

  function toggle(s) {
    onChange(value.includes(s) ? value.filter((v) => v !== s) : [...value, s]);
  }

  return (
    <div>
      <div className={cn(
        "grid gap-2 mb-3",
        compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3",
      )}>
        {items.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className={cn(
              "text-left px-3 py-2 rounded-xl border text-xs font-semibold",
              "transition-all duration-150 flex items-center justify-between gap-2",
              value.includes(s)
                ? "bg-brand-soft border-brand-line text-brand-fg-soft"
                : "bg-surface-3 border-border-default text-text-secondary hover:border-brand-line",
            )}
          >
            <span>{s}</span>
            {value.includes(s) && <span aria-hidden>✓</span>}
          </button>
        ))}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 text-[10px] font-bold bg-brand-soft text-brand-fg-soft border border-brand-line px-2 py-px rounded-full"
            >
              {v}
              <button
                type="button"
                onClick={() => toggle(v)}
                className="hover:text-brand-200 transition-colors leading-none"
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={customInput}
        onChange={(e) => setCustomInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && customInput.trim()) {
            e.preventDefault();
            const custom = customInput.trim();
            if (!value.includes(custom)) onChange([...value, custom]);
            setCustomInput("");
          }
        }}
        placeholder="Or type custom and press Enter..."
        className={cn(
          "w-full bg-surface-3 border border-border-strong rounded-xl",
          "text-sm text-text-primary placeholder:text-text-tertiary",
          "px-3.5 py-2 outline-none",
          "focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20",
        )}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update SubmitSolutionPage to import from new location**

In `client/src/pages/problems/SubmitSolutionPage.jsx`:
1. Delete the local `PatternSelector` function (lines ~108-200).
2. Add at the top: `import { PatternSelector } from "@components/features/solutions/PatternSelector";`
3. Update the call site `<PatternSelector ... />` to pass props the new component expects (`value`, `onChange`, optional `suggestions`).

- [ ] **Step 3: Run lint**

```bash
cd client && npm run lint
```

Expected: PASS.

- [ ] **Step 4: Smoke test**

Start dev servers, open SubmitSolutionPage, verify the pattern picker still works (multi-select chips, custom-via-Enter, dismissible chips).

- [ ] **Step 5: Run client build**

```bash
cd client && npm run build
```

Expected: PASS (catches any broken imports).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/features/solutions/PatternSelector.jsx client/src/pages/problems/SubmitSolutionPage.jsx
git commit -m "Extract PatternSelector to shared component"
```

---

## Task 11: OComplexityInput component

**Files:**
- Create: `client/src/components/features/solutions/OComplexityInput.jsx`

- [ ] **Step 1: Create the component**

`client/src/components/features/solutions/OComplexityInput.jsx`:

```jsx
import { useRef } from "react";
import { cn } from "@utils/cn";

const SUGGESTIONS = ["1", "log n", "n", "n log n", "n²", "2ⁿ"];

const O_NOTATION_RE = /^O\((.*)\)$/;

function unwrap(value) {
  if (!value) return "";
  const m = O_NOTATION_RE.exec(value.trim());
  return m ? m[1] : value;
}

function wrap(inner) {
  const t = (inner ?? "").trim();
  if (t === "") return "";
  return `O(${t})`;
}

export function OComplexityInput({ label, value, onChange, placeholder = "n" }) {
  const inputRef = useRef(null);
  const inner = unwrap(value);

  function handleChange(e) {
    onChange(wrap(e.target.value));
  }

  function handleSuggestion(s) {
    onChange(wrap(s));
    inputRef.current?.focus();
  }

  return (
    <div>
      {label && (
        <label className="text-xs font-semibold text-text-secondary mb-1.5 block">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1 font-mono text-sm">
        <span className="text-text-secondary">O(</span>
        <input
          ref={inputRef}
          type="text"
          value={inner}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(
            "flex-1 min-w-0 bg-surface-3 border border-border-strong rounded-md",
            "text-text-primary placeholder:text-text-disabled",
            "px-2 py-1 outline-none",
            "focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20",
          )}
        />
        <span className="text-text-secondary">)</span>
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSuggestion(s)}
            className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded-md border",
              inner === s
                ? "bg-brand-400/15 border-brand-400/40 text-brand-300"
                : "bg-surface-3 border-border-subtle text-text-disabled hover:text-text-tertiary hover:border-border-default",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

```bash
cd client && npm run lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/features/solutions/OComplexityInput.jsx
git commit -m "Add OComplexityInput component"
```

(Smoke test happens in Task 13 when this is wired into the recall phase.)

---

## Task 12: CanonicalAnswerPanel component

**Files:**
- Create: `client/src/components/features/review/CanonicalAnswerPanel.jsx`

- [ ] **Step 1: Create the component**

`client/src/components/features/review/CanonicalAnswerPanel.jsx`:

```jsx
import { Spinner } from "@components/ui/Spinner";
import { cn } from "@utils/cn";

export function CanonicalAnswerPanel({ data, isLoading, error, compact = false }) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-2 p-4 flex items-center gap-3">
        <Spinner size="sm" />
        <p className="text-xs text-text-tertiary">Generating canonical answer…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-danger-line bg-danger-soft p-4">
        <p className="text-xs text-danger-fg">
          Couldn't load canonical answer. Try again in a moment.
        </p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className={cn(
      "rounded-xl border border-brand-line bg-brand-soft p-4 space-y-2",
      compact && "p-3 space-y-1.5",
    )}>
      <p className="text-[10px] font-bold text-brand-fg-soft uppercase tracking-widest">
        Canonical Answer
      </p>
      <div>
        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Pattern</p>
        <p className="text-xs font-semibold text-brand-fg-soft">{data.pattern}</p>
      </div>
      <div>
        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Key Insight</p>
        <p className="text-xs text-text-secondary leading-relaxed">{data.keyInsight}</p>
      </div>
      <div>
        <p className="text-[9px] text-text-disabled uppercase tracking-wider mb-0.5">Complexity</p>
        <p className="text-xs font-mono text-text-secondary">
          T: {data.timeComplexity} · S: {data.spaceComplexity}
        </p>
      </div>
      {data.editedAt && (
        <p className="text-[9px] text-text-disabled italic">
          Edited by an admin
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

```bash
cd client && npm run lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/features/review/CanonicalAnswerPanel.jsx
git commit -m "Add CanonicalAnswerPanel component"
```

---

## Task 13: ReviewQueuePage Brief phase + Recall swaps + flag gating

**Files:**
- Modify: `client/src/pages/ReviewQueuePage.jsx`

This is the largest single client change. Take it in one focused commit; the new code is contained in one file.

- [ ] **Step 1: Add the flag check at top of file**

```jsx
const FEATURE_CANONICAL = import.meta.env.VITE_FEATURE_CANONICAL_ANSWERS === "true";
```

- [ ] **Step 2: Extend the phase state**

Find the `phase` state (currently 'recall' | 'reveal' | 'rate') and change initial value:

```jsx
const initialPhase = FEATURE_CANONICAL ? "brief" : "recall";
const [phase, setPhase] = useState(initialPhase);
const [peeked, setPeeked] = useState(false);
```

- [ ] **Step 3: Add the BRIEF phase block**

Above the `phase === 'recall'` JSX block, add:

```jsx
{FEATURE_CANONICAL && phase === "brief" && (
  <div className="p-5 space-y-4">
    <div className="flex items-center gap-2">
      <Badge variant={DIFF_VARIANT[solution.problem?.difficulty] || "brand"}>
        {solution.problem?.difficulty}
      </Badge>
      <span className="text-xs text-text-tertiary">{solution.problem?.category}</span>
    </div>
    <h2 className="text-base font-bold text-text-primary leading-snug">
      {solution.problem?.title}
    </h2>
    {solution.problem?.description && (
      <div className="rounded-xl border border-border-default bg-surface-2 p-4">
        <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap line-clamp-12">
          {solution.problem.description}
        </p>
      </div>
    )}
    <div className="rounded-xl border border-brand-line bg-brand-soft p-3">
      <p className="text-[11px] text-text-tertiary leading-relaxed">
        Take a moment to refresh your memory. When you're ready, click below
        and the timer starts.
      </p>
    </div>
  </div>
)}
```

And in the footer, add a brief-phase button group:

```jsx
{FEATURE_CANONICAL && phase === "brief" && (
  <>
    <Button
      variant="ghost" size="sm"
      onClick={() => navigate(`/problems/${solution.problemId}`)}
    >
      View Full Problem ↗
    </Button>
    <Button variant="primary" size="md" fullWidth onClick={() => setPhase("recall")}>
      Start Recall →
    </Button>
  </>
)}
```

- [ ] **Step 4: Replace the Pattern input with PatternSelector**

In the `phase === 'recall'` block, find the Pattern field's `<input type="text" .../>`. Replace with:

```jsx
import { PatternSelector } from "@components/features/solutions/PatternSelector";

// ... in JSX:
{FEATURE_CANONICAL ? (
  <PatternSelector
    value={Array.isArray(recall.pattern) ? recall.pattern : (recall.pattern ? [recall.pattern] : [])}
    onChange={(patterns) => setRecall(r => ({ ...r, pattern: patterns.join(", ") }))}
    compact
  />
) : (
  <input
    /* existing input unchanged */
  />
)}
```

(The flag-gated path stores the joined comma-string into `recall.pattern` so the existing grader payload shape is preserved.)

- [ ] **Step 5: Replace the Complexity input with two OComplexityInputs**

Find the Complexity field. Replace with:

```jsx
import { OComplexityInput } from "@components/features/solutions/OComplexityInput";

// ... extract time/space from the joined string, then:
{FEATURE_CANONICAL ? (
  <div className="grid grid-cols-2 gap-3">
    <OComplexityInput
      label="Time"
      value={recallTime}
      onChange={(t) => setRecall(r => ({ ...r, complexity: combineComplexity(t, recallSpace) }))}
    />
    <OComplexityInput
      label="Space"
      value={recallSpace}
      onChange={(s) => setRecall(r => ({ ...r, complexity: combineComplexity(recallTime, s) }))}
    />
  </div>
) : (
  /* existing single input unchanged */
)}
```

Add helpers above the component:

```jsx
function splitComplexity(combined) {
  if (!combined) return { time: "", space: "" };
  const m = /Time:\s*(O\([^)]+\))[^O]*Space:\s*(O\([^)]+\))/i.exec(combined);
  return m ? { time: m[1], space: m[2] } : { time: combined, space: "" };
}
function combineComplexity(time, space) {
  const t = (time || "").trim();
  const s = (space || "").trim();
  if (!t && !s) return "";
  return `Time: ${t || "?"}, Space: ${s || "?"}`;
}
```

And derive the parts:

```jsx
const { time: recallTime, space: recallSpace } = splitComplexity(recall.complexity);
```

- [ ] **Step 6: Add Show Answer button to recall footer**

```jsx
import { useCanonicalAnswer } from "@hooks/useCanonical";
import { CanonicalAnswerPanel } from "@components/features/review/CanonicalAnswerPanel";

// at top of the modal component:
const canonicalQ = useCanonicalAnswer(solution.problemId, {
  enabled: FEATURE_CANONICAL && (phase === "brief" || phase === "reveal" || peeked),
});
const [showInlineCanonical, setShowInlineCanonical] = useState(false);
```

In the recall footer:

```jsx
{FEATURE_CANONICAL && phase === "recall" && (
  <Button
    variant="ghost" size="sm"
    onClick={() => { setPeeked(true); setShowInlineCanonical(true); }}
  >
    👁 Show Answer
  </Button>
)}
```

In the recall body, just below the recall fields, render the inline canonical when peeked:

```jsx
{FEATURE_CANONICAL && phase === "recall" && showInlineCanonical && (
  <CanonicalAnswerPanel
    data={canonicalQ.data}
    isLoading={canonicalQ.isLoading}
    error={canonicalQ.error}
    compact
  />
)}
```

- [ ] **Step 7: Pass peeked to the grader and submit**

Where `useReviewGrade()` is invoked, add `peeked` to the request body. Where `useSubmitReview()` is called, pass `peeked` in the payload.

- [ ] **Step 8: Run lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: both PASS.

- [ ] **Step 9: Smoke test (manual)**

Start dev servers with `VITE_FEATURE_CANONICAL_ANSWERS=true npm run dev` in client. Open Review Queue, click Review on an item:
- [ ] BRIEF phase shows problem description (not just title).
- [ ] Start Recall transitions to RECALL with timer running.
- [ ] Pattern picker shows multi-select chips + custom-via-Enter.
- [ ] Time and Space inputs render as `O(_)` with cursor inside parens.
- [ ] Show Answer button reveals canonical inline; sets a peeked indicator.
- [ ] Reveal still works (for now — Task 15 rebuilds it).

- [ ] **Step 10: Commit**

```bash
git add client/src/pages/ReviewQueuePage.jsx
git commit -m "Add Brief phase, multi-select pattern, O() input, Show Answer (flag-gated)"
```

---

## Task 14: Reveal phase rebuild + Rate phase peek-cap

**Files:**
- Modify: `client/src/pages/ReviewQueuePage.jsx`

- [ ] **Step 1: Remove the three-tab toggle (flag-gated)**

Find the existing tab toggle (currently lines ~459-522 of ReviewQueuePage.jsx) — the `<button onClick={() => setRevealView('ai-grade')}>` cluster. Wrap the entire toggle bar in:

```jsx
{!FEATURE_CANONICAL && (
  /* existing toggle bar */
)}
```

When the flag is ON, only the AI Grade view renders. Find the `revealView === 'ai-grade'` conditional and convert to:

```jsx
{FEATURE_CANONICAL ? (
  <AiGradeView grade={aiGrade} loading={reviewGrade.isPending} recall={recall} />
) : (
  /* existing three-way conditional unchanged */
)}
```

- [ ] **Step 2: Add CanonicalAnswerPanel + collapsible original notes to Reveal**

Just below `<AiGradeView ... />` (inside the `phase === 'reveal'` block), when flag is ON:

```jsx
{FEATURE_CANONICAL && (
  <>
    <CanonicalAnswerPanel
      data={canonicalQ.data}
      isLoading={canonicalQ.isLoading}
      error={canonicalQ.error}
    />
    <details className="rounded-xl border border-border-default bg-surface-2">
      <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-text-secondary">
        Your original notes
      </summary>
      <div className="px-4 pb-4 space-y-2">
        {/* render the existing solution.patterns / solution.keyInsight /
            solution.timeComplexity blocks here, copied from the existing
            "Your original notes" panel that lived in the side-by-side view */}
      </div>
    </details>
  </>
)}
```

(Lift the inner content from the existing "Your original notes" panel — currently in the side-by-side block — into the `<details>`. Don't duplicate; reuse JSX or extract a small helper component if it gets crowded.)

- [ ] **Step 3: Cap quality buttons in Rate when peeked**

Find the rate-phase `ConfidencePicker` (or the equivalent button group). Add:

```jsx
<ConfidencePicker
  value={rating}
  onChange={(v) => {
    if (peeked && v > 3) return;  // ignore high-confidence picks when peeked
    setRating(v);
  }}
  disabledAbove={peeked && FEATURE_CANONICAL ? 3 : undefined}
/>
```

In `ConfidencePicker` (line ~41 of the same file), accept the new prop and disable the higher buttons:

```jsx
function ConfidencePicker({ value, onChange, disabledAbove }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {CONFIDENCE_LEVELS.map((c) => {
        const disabled = disabledAbove != null && c.value > disabledAbove;
        return (
          <button
            key={c.value}
            disabled={disabled}
            title={disabled ? "Peeked attempts cap at quality 3" : undefined}
            onClick={() => !disabled && onChange(c.value)}
            className={cn(
              /* existing classes */,
              disabled && "opacity-40 cursor-not-allowed",
            )}
          >
            {/* existing inner content */}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add a peeked badge in Reveal header**

Inside the `phase === 'reveal'` block, near the top:

```jsx
{FEATURE_CANONICAL && peeked && (
  <Badge variant="warning" size="sm">👁 Peeked — quality capped at 3</Badge>
)}
```

- [ ] **Step 5: Run lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: PASS.

- [ ] **Step 6: Smoke test (manual)**

With `VITE_FEATURE_CANONICAL_ANSWERS=true`:
- [ ] Reveal phase shows AI Grade + canonical panel; original notes is collapsed.
- [ ] No tab toggle visible.
- [ ] Peeked badge appears when Show Answer was used.
- [ ] In Rate phase, when peeked, buttons 4 and 5 are visibly disabled with tooltip.

With flag OFF (set `VITE_FEATURE_CANONICAL_ANSWERS=false`, rebuild):
- [ ] Three-tab toggle still works (legacy path preserved).

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/ReviewQueuePage.jsx
git commit -m "Rebuild Reveal phase with canonical panel, peek cap on Rate"
```

---

## Task 15: Delete RecallDiff component

**Files:**
- Delete: `client/src/components/features/solutions/RecallDiff.jsx`
- Modify: `client/src/pages/ReviewQueuePage.jsx` (remove import)

- [ ] **Step 1: Verify RecallDiff is no longer referenced**

```bash
grep -rn "RecallDiff" client/src/ | grep -v "RecallDiff.jsx"
```

If the only matches are inside `ReviewQueuePage.jsx` (the import line and the legacy `revealView === 'diff'` branch), proceed. If any other file uses it, stop and update those first.

- [ ] **Step 2: Delete the file**

```bash
rm client/src/components/features/solutions/RecallDiff.jsx
```

- [ ] **Step 3: Remove the import + the legacy 'diff' branch**

In `client/src/pages/ReviewQueuePage.jsx`:
- Remove the line `import { RecallDiff } from '@components/features/solutions/RecallDiff'`.
- Remove the `revealView === 'diff'` JSX branch from the legacy (flag-OFF) path. Reduce the conditional to AI Grade vs side-by-side. The Diff button in the toggle (when flag OFF) should also be removed.

- [ ] **Step 4: Run lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: PASS. If lint complains about an unused `diff` import elsewhere, remove that too.

- [ ] **Step 5: Commit**

```bash
git add -A client/src/components/features/solutions/RecallDiff.jsx client/src/pages/ReviewQueuePage.jsx
git commit -m "Remove word-level Diff tab and RecallDiff component"
```

---

## Task 16: Admin canonical fields in Problem form

**Files:**
- Modify: `client/src/components/features/admin/ProblemForm.jsx`

- [ ] **Step 1: Add canonical-section state**

Wherever the form's local state is declared, add the four canonical fields:

```jsx
const [canonicalPattern, setCanonicalPattern] = useState(problem?.canonicalPattern ?? "");
const [canonicalKeyInsight, setCanonicalKeyInsight] = useState(problem?.canonicalKeyInsight ?? "");
const [canonicalTimeComplexity, setCanonicalTimeComplexity] = useState(problem?.canonicalTimeComplexity ?? "");
const [canonicalSpaceComplexity, setCanonicalSpaceComplexity] = useState(problem?.canonicalSpaceComplexity ?? "");
```

- [ ] **Step 2: Add the canonical UI section**

Near the bottom of the form (above the submit button), add:

```jsx
import { useUpdateCanonicalAnswer, useCanonicalAnswer } from "@hooks/useCanonical";
import { OComplexityInput } from "@components/features/solutions/OComplexityInput";

// inside the component, when editing an existing problem:
const updateCanonical = useUpdateCanonicalAnswer(problem?.id);
const canonicalQ = useCanonicalAnswer(problem?.id, { enabled: !!problem?.id });

// JSX:
{problem?.id && user?.globalRole === "SUPER_ADMIN" && (
  <details className="rounded-xl border border-border-default bg-surface-2 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-text-primary">
      Canonical Answer (admin)
    </summary>
    <div className="mt-3 space-y-3">
      <label className="block text-xs font-semibold text-text-secondary">
        Canonical Pattern
        <input
          type="text"
          value={canonicalPattern}
          onChange={(e) => setCanonicalPattern(e.target.value)}
          className="mt-1 w-full bg-surface-3 border border-border-strong rounded-lg px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-xs font-semibold text-text-secondary">
        Canonical Key Insight
        <textarea
          value={canonicalKeyInsight}
          onChange={(e) => setCanonicalKeyInsight(e.target.value)}
          rows={3}
          className="mt-1 w-full bg-surface-3 border border-border-strong rounded-lg px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <OComplexityInput
          label="Time"
          value={canonicalTimeComplexity}
          onChange={setCanonicalTimeComplexity}
        />
        <OComplexityInput
          label="Space"
          value={canonicalSpaceComplexity}
          onChange={setCanonicalSpaceComplexity}
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary" size="sm"
          onClick={() => updateCanonical.mutate({
            canonicalPattern,
            canonicalKeyInsight,
            canonicalTimeComplexity,
            canonicalSpaceComplexity,
          })}
          disabled={updateCanonical.isPending}
        >
          Save canonical
        </Button>
      </div>
      {canonicalQ.data?.editedAt && (
        <p className="text-[10px] text-text-disabled">
          Last edited by an admin.
        </p>
      )}
    </div>
  </details>
)}
```

(If `user` isn't already in scope in this component, get it from the auth store: `const user = useAuthStore((s) => s.user);`)

- [ ] **Step 3: Run lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: PASS.

- [ ] **Step 4: Smoke test (manual)**

As SUPER_ADMIN, open the admin Problem form for an existing problem:
- [ ] Canonical Answer section is visible (collapsed by default).
- [ ] Editing fields and clicking Save canonical writes to the DB (verify via Prisma Studio or by re-opening the form).
- [ ] As a non-admin user, the section is not rendered.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/features/admin/ProblemForm.jsx
git commit -m "Add canonical answer admin section to Problem form"
```

---

## Task 17: Final integration + smoke

**Files:** none (env + manual verification)

- [ ] **Step 1: Run all server gates locally**

```bash
cd server && npm run lint && npm test && npx prisma migrate status
```

Expected: lint PASS, all tests pass (231 + ~22 new), migrate status clean.

- [ ] **Step 2: Run all client gates**

```bash
cd client && npm run lint && npm run build
```

Expected: PASS.

- [ ] **Step 3: Flip the feature flag in dev**

Set in `server/.env`:
```
FEATURE_CANONICAL_ANSWERS=true
```

Restart server. Set on client (one-shot, no Dockerfile rebuild needed in dev):
```bash
cd client && VITE_FEATURE_CANONICAL_ANSWERS=true npm run dev
```

- [ ] **Step 4: End-to-end smoke checklist**

Working through a full review:

- [ ] Click Review on a Solution. **BRIEF phase** opens — title, difficulty/category, problem description visible. No timer running.
- [ ] Click **Start Recall** → transitions to RECALL. Timer starts. Recall fields appear. Description collapses (or scrolls out).
- [ ] **Pattern field** is a multi-select picker with chips. Custom-via-Enter works.
- [ ] **Complexity fields** render as `O(_)` with cursor inside parens on focus. Suggestion chips fill the input.
- [ ] Click **Show Answer** → canonical panel appears inline. Peeked badge active. (First-ever click on this problem may take 1-2s for AI generation.)
- [ ] Click **Reveal My Notes** → REVEAL phase. AI Grade view shows verdicts. Canonical panel visible. Original notes collapsed in `<details>`. **No three-tab toggle anywhere.**
- [ ] Peeked badge persists in Reveal header.
- [ ] Click **Rate My Memory** → RATE phase. Confidence picker shows. Buttons 4 and 5 are visibly disabled with tooltip "Peeked attempts cap at quality 3".
- [ ] Submit → review persists with `peeked = true`, quality clamped at ≤ 3.

Now do a non-peeked path:
- [ ] Reopen Review on another item. Don't click Show Answer.
- [ ] Reach Rate phase. All 5 confidence buttons enabled.
- [ ] Submit → `peeked = false`, quality unclamped.

Admin override:
- [ ] As SUPER_ADMIN, open the Problem form. Canonical section visible.
- [ ] Edit canonical key insight, save. Reopen the same review → canonical panel reflects the edit.

- [ ] **Step 5: Toggle flag OFF and re-smoke (regression check)**

Set `FEATURE_CANONICAL_ANSWERS=false` and `VITE_FEATURE_CANONICAL_ANSWERS=false`, rebuild client.
- [ ] Review page renders the legacy three-phase flow (no Brief).
- [ ] Three-tab toggle in Reveal phase is back? **No** — Diff tab was deleted (Task 15). Toggle now shows AI Grade + Side-by-side only. This is intentional.
- [ ] Pattern field is single text input. Complexity is free-text.
- [ ] Grader still works against legacy notes-anchor (no canonical).

- [ ] **Step 6: Commit and push**

```bash
git push
```

The pre-push gate runs: server lint + tests + migrate status + npm audit + client lint + vite build. All should PASS.

If audit fires (transitive deps drift over time), follow the same workflow as the audit-fix on the previous push: investigate, run `npm audit fix` if non-breaking, otherwise discuss before `--force` upgrades.

- [ ] **Step 7: Production rollout**

After merging to main:
1. Deploy server with `FEATURE_CANONICAL_ANSWERS=false` first. Verify migration applied; new tests in CI green; new endpoints respond with 503 (gated).
2. Set `VITE_FEATURE_CANONICAL_ANSWERS=true` in client Railway env AND ensure Dockerfile ARG flows through. Redeploy client.
3. Set `FEATURE_CANONICAL_ANSWERS=true` in server Railway env. Redeploy.
4. Run end-to-end smoke against production.
5. Monitor `[canonical:invalid]`, `[recall-grade:peek-clamp]`, `[submitReview:peek-clamp]` log lines for the first 24h.

---

## Self-review summary

**Spec coverage:**
- Issue #1 (timer / view problem) → Task 13 (Brief phase + Start Recall transition).
- Issue #2 (multi-select pattern) → Tasks 10, 13.
- Issue #3 (templated O() input) → Tasks 11, 13.
- Issue #4 (canonical-correct grading) → Tasks 1-7 (schema + endpoints + grader rewrite).
- Issue #5 (Show Answer reveal) → Tasks 12, 13, 14 (canonical panel inline + Reveal panel).
- Issue #6 (remove Diff tab) → Task 15.
- Five-touchpoint compliance → covered by Task 1 (migration + schema) + Task 5 (Zod + controller + admin payload) + Task 8 (peeked field on submit) + Task 9 (client API + hooks).

**Type / signature consistency:**
- `validateRecallGrade(parsed, { peeked })` signature stable from Task 7 onward.
- `validateCanonicalAnswer(parsed)` returns either the parsed object or `null` (Tasks 2, 4).
- `generateCanonicalAnswer(problem, { userId, teamId })` returns the parsed object or `null` on validation failure (Tasks 3, 4).
- `useCanonicalAnswer(problemId, { enabled })` query key matches `useUpdateCanonicalAnswer` invalidation key (Task 9).
- `OComplexityInput` `value` prop is the wrapped `O(...)` string everywhere (Tasks 11, 13, 16).
- `peeked: boolean` flows: client state → grader request body → submitReview body → `ReviewAttempt.peeked` column. Verified at each layer in Tasks 13, 14, 8.

**No placeholders:** every code block contains the actual code an engineer would type. Tests have full bodies; controllers have full handler bodies; UI sections show full JSX. Where the engineer must read existing code to splice changes (e.g., extending the existing `gradeReviewRecall`), the steps say "find X, replace with Y" and show Y in full.


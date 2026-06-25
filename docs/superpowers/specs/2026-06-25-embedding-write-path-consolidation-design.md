# Embedding Write-Path Consolidation — Design Spec (Sprint 4.2a)

**Date:** 2026-06-25
**Sprint:** 4.2a (first slice of decomposed Sprint 4.2 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** M10, M15, M16 (+ DRY refactor + dead-code cleanup)
**Branch:** `feat/embedding-write-path-consolidation`
**Layers on:** main, post Sprint 4.1 (`7ec69a1`)
**Feature flag:** None — refactor + narrow audit fixes; no user-visible change on success path

---

## Problem

Sprint 1 audit surfaced three medium findings on the embedding write path (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md`):

- **M10** — `notes.embedding.js` has a 5s debounced timer but no cancellation function. `deleteNotePermanent` deletes the note row without cancelling the pending embed; the timer fires 5s later, `findUnique` returns null, embed bails silently. Wasted CPU + ambiguous failure mode.
- **M15** — `AI_EMBEDDING_MODEL` env var is defined in `config/env.js:79` but never imported anywhere. `embedding.service.js:37` hardcodes `"text-embedding-3-small"`. The env var is dead documentation.
- **M16** — `findProblemsByNoteEmbedding` runs the cross-table similarity query without first checking that the source note's embedding is non-NULL. When the source is NULL, the `<=>` operator yields NULL for every row, the ORDER BY yields no winners, and the function silently returns 0 results. No log, no warning — looks identical to "no similar problems" to the caller.

In addition, the embedding write path is **duplicated across 3 files** (Sprint 4.1's spec carved this DRY refactor out to Sprint 4.2):

- `server/src/controllers/solutions.controller.js::generateSolutionEmbedding` (~lines 995-1031, post-4.1 with enqueue wiring)
- `server/src/controllers/problems.controller.js::generateProblemEmbedding` (~lines 801-834)
- `server/src/services/embedding.service.js::embedNote` (~lines 308-348)

All three follow the same shape parameterized by entity type: load → buildText → generateEmbedding → enqueue-or-SQL-UPDATE → enqueue-on-failure.

Finally, `embedding.service.js` carries dead code: `findSimilarSolutions`, the service-level `findSimilarProblems`, and `searchSolutionsByText` have **zero callers** across the codebase (confirmed via grep — see "Dead code" section).

### Zero-trust verification

Code reading on the current branch (post Sprint 4.1):

| Symbol | File:line | Caller count | Note |
| --- | --- | --- | --- |
| `findSimilarSolutions` | `embedding.service.js:187` | 0 | Dead |
| `findSimilarProblems` (service-level) | `embedding.service.js:217` | 0 | Controller-level `findSimilarProblems` in `aiProblemGen.controller.js:121` is a separate function |
| `searchSolutionsByText` | `embedding.service.js:243` | 0 | Dead |
| `findSimilarNotes` | `embedding.service.js:332` | 1 (`notes.controller.js:589`) | Keep |
| `findProblemsByNoteEmbedding` | `embedding.service.js:359` | 1 (`notes.controller.js:590`) | Keep, fix M16 |
| `embedSolution` | `embedding.service.js:112` | 1 (`embedAllExisting`) | Refactor target |
| `embedProblem` | `embedding.service.js:152` | 1 (`embedAllExisting`) | Refactor target |
| `embedNote` | `embedding.service.js:308` | 2 (`notes.embedding.js`, `embedding.outbox.js` DISPATCH) | Refactor target |

---

## Principle

This sprint is **a refactor + 3 narrow audit fixes**. The refactor (`embedAndPersist`) is the structural change that makes the audit fixes apply uniformly across all 3 entity types instead of being applied pointwise. M10, M15, M16 are surgical one-line-ish fixes. Dead-code removal is housekeeping that fits naturally inside the same diff.

No new behavior on the success path. Zero schema migrations. Zero changes to the outbox queue's behavior (only its dispatch wiring).

---

## Scope

### In scope

1. **M10** — `cancelNoteEmbedding(noteId)` added to `notes.embedding.js`. `deleteNotePermanent` calls it before deleting.
2. **M15** — `generateEmbedding` reads `AI_EMBEDDING_MODEL` from env (default `text-embedding-3-small`, unchanged).
3. **M16** — `findProblemsByNoteEmbedding` runs a `SELECT 1 ... AND embedding IS NOT NULL LIMIT 1` pre-check on the source note.
4. **DRY** — new `embedAndPersist(entityType, entityId)` in `embedding.service.js` consolidates the 3 write paths via an internal `ENTITY_CONFIG` map.
5. **Dead-code cleanup** — delete `findSimilarSolutions`, service-level `findSimilarProblems`, `searchSolutionsByText`, plus the `embedSolution`/`embedProblem`/`embedNote` wrappers (their callers move to `embedAndPersist`).
6. **Outbox DISPATCH simplification** — remove the per-type map; `embedding.outbox.js` calls `embedAndPersist(row.entityType, row.entityId)` directly.

### Out of scope (carved to 4.2b, 4.2c)

- **M11** RAG retrieval freshness floor (`updatedAt` filter) → Sprint 4.2b.
- **M12** RAG context size token bound → Sprint 4.2b.
- **M14** Vector-search LIMIT consistency (3 vs 5 across surfaces) → Sprint 4.2b.
- **M13** HNSW `m` / `ef_construction` tuning → Sprint 4.2c.
- **Full embedding service test foundation (H14)** → Sprint 4.3.
- **Multi-replica safety of the debouncer** (it's in-memory single-replica per the H5 constraint) → not in audit.
- **Model upgrade migration story** (e.g. swapping to text-embedding-3-large at 3072 dim) → out of scope; only documented as a header comment.

---

## Architecture

```
server/src/services/
├── embedding.service.js               [MAJOR REFACTOR]
│   ├── generateEmbedding              [M15 — wire AI_EMBEDDING_MODEL env]
│   ├── buildSolutionText              [unchanged]
│   ├── buildProblemText               [unchanged]
│   ├── buildNoteText                  [unchanged]
│   ├── ENTITY_CONFIG (new private)    [3-type config map]
│   ├── embedAndPersist (new public)   [the consolidated writer]
│   ├── findSimilarNotes               [unchanged]
│   ├── findProblemsByNoteEmbedding    [M16 — add source pre-check]
│   ├── embedAllExisting               [updated — calls embedAndPersist]
│   ├── isEmbeddingEnabled             [unchanged]
│   ├── [DELETED] findSimilarSolutions
│   ├── [DELETED] findSimilarProblems  (service-level only)
│   ├── [DELETED] searchSolutionsByText
│   ├── [DELETED] embedSolution
│   ├── [DELETED] embedProblem
│   └── [DELETED] embedNote
│
├── notes.embedding.js                 [MINOR]
│   ├── scheduleNoteEmbedding          [body unchanged; calls embedAndPersist]
│   └── cancelNoteEmbedding (new)      [M10 — clear pending timer]
│
└── embedding.outbox.js                [MINOR]
    └── [DISPATCH map removed; dispatch goes through embedAndPersist directly]

server/src/controllers/
├── solutions.controller.js
│   └── generateSolutionEmbedding      [4 lines — wraps embedAndPersist]
├── problems.controller.js
│   └── generateProblemEmbedding       [4 lines — wraps embedAndPersist]
└── notes.controller.js
    └── deleteNotePermanent            [M10 — call cancelNoteEmbedding before delete]
```

---

## Unified writer: `embedAndPersist`

Single public function in `embedding.service.js`. Internal `ENTITY_CONFIG` map parameterizes the 3 differences (loader, text builder, table name).

```js
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
    if (!entity) return null; // entity gone — outbox self-heal handles its own row

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

### Circular-import notes

`embedAndPersist` imports `enqueueEmbedding` from `embedding.outbox.js` lazily (`await import(...)`). `embedding.outbox.js` imports `embedAndPersist` from `embedding.service.js` lazily (in its dispatch path). Both ends lazy = cycle-safe at module-load time. The pattern matches Sprint 4.1's `embedNote` lazy-import design.

### Why `ENTITY_CONFIG` as a map (not three separate exported functions)

Three reasons:

1. **DRY at the orchestration layer.** The control flow (load → text → embed → persist → enqueue) is identical across types. Three function bodies would re-state it three times — same drift risk we just removed.
2. **Outbox dispatch simplifies.** With one function, `embedding.outbox.js`'s `DISPATCH` map collapses to a direct call: `embedAndPersist(row.entityType, row.entityId)`. No type-to-function table to maintain in lockstep.
3. **Future entity types are a one-line `ENTITY_CONFIG` addition** — not a new function + outbox map update + test scaffold. Open-closed in the small.

---

## M10: cancel-on-delete for note debouncer

`server/src/services/notes.embedding.js` adds a sibling export:

```js
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

`server/src/controllers/notes.controller.js::deleteNotePermanent` calls it BEFORE the delete:

```js
import {
  scheduleNoteEmbedding,
  cancelNoteEmbedding, // NEW
} from "../services/notes.embedding.js";

export async function deleteNotePermanent(req, res) {
  try {
    const userId = req.user.id;
    const existing = await prisma.note.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!existing) return error(res, "Note not found", 404);

    cancelNoteEmbedding(existing.id); // NEW — clear pending 5s timer

    await prisma.note.delete({ where: { id: existing.id } });
    return success(res, { deleted: true });
  } catch (err) {
    console.error("deleteNotePermanent:", err);
    return error(res, "Failed to delete note", 500);
  }
}
```

### What about `archiveNote`?

archiveNote is soft-delete (sets `archivedAt`); the note row still exists. If a debounced embed fires after archive, it re-fetches the still-existing note, embeds it, and writes the vector — harmless and arguably correct (an archived note may be un-archived and re-surfaced). **Not in 4.2a scope.**

### What about cancellation racing with the timer

The `clearTimeout` runs synchronously, but a Node.js timer that has just fired may already have its callback queued in the microtask/macrotask queue when `clearTimeout` is called. In that case the callback still runs, calls `embedAndPersist("Note", noteId)`, which then `prisma.note.findUnique({ where: { id } })` returns null (the row is being or has been deleted). `embedAndPersist` sees `!entity`, returns null without enqueueing. Defense in depth: even if M10's cancellation races and loses, the outbox doesn't accumulate a row, and the worker doesn't burn an attempt.

If the timer fires BEFORE the cancellation (cancel arrives after callback has started executing): the embed proceeds normally and writes a vector for the row about to be deleted. The deletion then nukes both the note row AND its vector (cascade — actually no cascade FK on vector column, but deleting the row removes the row including the vector). No leak.

---

## M15: wire `AI_EMBEDDING_MODEL` env var

`server/src/services/embedding.service.js`:

```js
// Header update
/**
 * EMBEDDING SERVICE — Generate and store vector embeddings
 *
 * Default model: text-embedding-3-small (1536 dimensions). Override via
 * `AI_EMBEDDING_MODEL` env var. NOTE: changing to a model with different
 * dimensions (e.g. text-embedding-3-large at 3072) requires a separate
 * schema migration — vector columns are declared `vector(1536)` and a
 * dimension mismatch on INSERT throws a Postgres error. Out of scope for
 * Sprint 4.2a; tracked separately for any future model-upgrade work.
 */
import OpenAI from "openai";
import prisma from "../lib/prisma.js";
import {
  OPENAI_API_KEY,
  AI_REQUEST_TIMEOUT_MS,
  AI_EMBEDDING_MODEL, // NEW
} from "../config/env.js";

// ...

export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) return null;
  try {
    const client = getClient();
    const response = await client.embeddings.create({
      model: AI_EMBEDDING_MODEL, // was hardcoded "text-embedding-3-small"
      input: text.trim().slice(0, 8000),
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error("[Embedding] Generation failed:", error.message);
    return null;
  }
}
```

The env var defaults to `"text-embedding-3-small"` per `config/env.js:79`, so the runtime behavior is unchanged without setting the variable. Closes M15 on the literal letter; the dimension-aware migration story is explicitly deferred via the header comment.

---

## M16: source-embedding pre-check in `findProblemsByNoteEmbedding`

```js
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
      `SELECT p.id, p.title, p.difficulty, p.category, p.tags,
              p.embedding <=> (SELECT embedding FROM notes WHERE id = $1) AS distance
       FROM problems p
       WHERE p."teamId" = ANY($2::text[])
         AND p."isPublished" = true
         AND p.embedding IS NOT NULL
       ORDER BY distance ASC
       LIMIT $3`,
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

Cost: one additional `SELECT 1 ... LIMIT 1` with an indexed lookup on `notes.id` (primary key). Sub-millisecond. The empty-result-with-log behavior is more diagnostic than the prior silent-empty, without changing the observable contract for callers (`[]` is still `[]`).

---

## Dead-code removal

Delete from `embedding.service.js`:

| Symbol | Lines (approx) |
| --- | --- |
| `findSimilarSolutions` | 187-214 |
| `findSimilarProblems` (service-level) | 217-240 |
| `searchSolutionsByText` | 243-268 |
| `embedSolution` | 112-149 |
| `embedProblem` | 152-183 |
| `embedNote` | 308-355 |

Confirmation: grep across `server/src` + `server/test` shows zero non-self callers for the first three; the embed* wrappers' callers all move to `embedAndPersist` in this sprint.

Update `embedAllExisting` to call `embedAndPersist`:

```js
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

Batch now enqueues failed rows into the outbox (via `embedAndPersist`'s built-in enqueue-on-failure). Idempotent — re-running the batch on a row already enqueued just upserts the existing outbox row, no duplicates.

---

## Outbox DISPATCH simplification

`server/src/services/embedding.outbox.js` currently has:

```js
const DISPATCH = {
  Solution: embedSolution,
  Problem: embedProblem,
  Note: embedNote,
};
```

After the refactor those three functions are deleted. Replace with:

```js
async function dispatchEmbed(entityType, entityId) {
  const { embedAndPersist } = await import("./embedding.service.js");
  return embedAndPersist(entityType, entityId);
}
```

`processOutboxBatch` changes from `const dispatchFn = DISPATCH[row.entityType]; if (!dispatchFn) { ... }` to `const result = await dispatchEmbed(row.entityType, row.entityId); if (result === null) { ... }`.

The "unknown entityType" branch moves inside `embedAndPersist` (it already logs `[Embedding] Unknown entityType: ${entityType}` and returns null). The outbox still drops orphan rows in that case via the existing return-null → checkEntityExists → false → orphan-drop path.

Lazy `await import("./embedding.service.js")` mirrors the lazy import on the other side, completing the cycle-safe pattern.

---

## Controller wrapper collapse

`server/src/controllers/solutions.controller.js`:

```js
export async function generateSolutionEmbedding(solutionId) {
  const { AI_ENABLED } = await import("../config/env.js");
  if (!AI_ENABLED) return;
  const { embedAndPersist } = await import("../services/embedding.service.js");
  await embedAndPersist("Solution", solutionId);
}
```

`server/src/controllers/problems.controller.js`:

```js
export async function generateProblemEmbedding(problemId) {
  const { AI_ENABLED } = await import("../config/env.js");
  if (!AI_ENABLED) return;
  const { embedAndPersist } = await import("../services/embedding.service.js");
  await embedAndPersist("Problem", problemId);
}
```

`server/src/services/notes.embedding.js` (the debouncer timer body):

```js
const t = setTimeout(async () => {
  timers.delete(noteId);
  try {
    const { embedAndPersist } = await import("./embedding.service.js");
    await embedAndPersist("Note", noteId);
  } catch (err) {
    console.error(
      `[notes.embedding] schedule failed for ${noteId}:`,
      err.message,
    );
  }
}, DEBOUNCE_MS);
```

---

## Test plan

15 new tests across 5 new test files. Existing Sprint 4.1 wiring tests (16-21) adapt internally — their assertions remain the same (assert on enqueue calls + SQL UPDATE side effects), but the call chain now goes through `embedAndPersist`.

### New tests

| # | Test | File |
| --- | --- | --- |
| 22 | `cancelNoteEmbedding(id)` clears the timer from the timers Map | `server/test/services/notes.embedding.test.js` (NEW) |
| 23 | `cancelNoteEmbedding(id)` returns `false` when no timer exists | same |
| 24 | `cancelNoteEmbedding(null)` is a no-op + returns false | same |
| 25 | `scheduleNoteEmbedding` then `cancelNoteEmbedding` prevents `embedAndPersist` from firing after the 5s window | same |
| 26 | `deleteNotePermanent` calls `cancelNoteEmbedding(id)` before `prisma.note.delete` | `server/test/controllers/notes.delete-cancel.test.js` (NEW) |
| 27 | `embedAndPersist("Solution", id)` happy path: load + buildText + generateEmbedding + SQL UPDATE + log | `server/test/services/embedding.embedAndPersist.test.js` (NEW) |
| 28 | `embedAndPersist("Solution", id)` null embedding → enqueue + no SQL UPDATE | same |
| 29 | `embedAndPersist("Solution", id)` SQL UPDATE throws → enqueue with db-update reason | same |
| 30 | `embedAndPersist("Solution", id)` entity not found → returns null + no enqueue | same |
| 31 | `embedAndPersist("Problem", id)` happy path (smoke for ENTITY_CONFIG["Problem"]) | same |
| 32 | `embedAndPersist("Note", id)` happy path (smoke for ENTITY_CONFIG["Note"]) | same |
| 33 | `embedAndPersist("Unknown", id)` logs error + returns null | same |
| 34 | `findProblemsByNoteEmbedding` source-NULL → returns `[]` + logs the pre-check skip | `server/test/services/embedding.findProblemsByNote.test.js` (NEW) |
| 35 | `findProblemsByNoteEmbedding` source-non-NULL runs the cross-table query | same |
| 36 | `generateEmbedding` uses `AI_EMBEDDING_MODEL` from env (M15 lock-in) | `server/test/services/embedding.generateEmbedding.test.js` (NEW) |

### Adapted tests (no count change)

| # | Test | Change |
| --- | --- | --- |
| 16-18 | `solutions.embedding-outbox.test.js` | Mock chain updates: same assertions on enqueue/SQL, but the path now goes through `embedAndPersist`. |
| 19-21 | `problems.embedding-outbox.test.js` | Same adaptation. |

### Mock strategy

- **Outbox-side tests** (in Sprint 4.1 file `embedding.outbox.test.js`) — the existing 14 tests were written against mock `embedSolution`/`embedProblem`/`embedNote`. After the refactor those don't exist; the tests adapt to mock `embedAndPersist` directly. Same 14 tests, internally re-wired.

### Final test count

- Pre-sprint baseline: 1224 (post Sprint 4.1)
- New tests in 4.2a: +15
- **Target: 1239**

### RED-first verification

- Tests 22-36 fail today (the functions/files they exercise don't exist yet).
- Adapted Sprint 4.1 tests (16-21) need their mocks updated alongside the refactor; they continue to assert the same observable behavior.

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Token / session invalidation | None |
| Behavior change for normal users | None on success path. M16 changes a silent-empty case to logged-empty case — same observable result, better diagnostics. |
| Latency | Identical on success path. M16 adds one indexed `SELECT 1` per cross-table note→problem search call — sub-ms. |
| In-flight requests | None |
| Multi-replica safety | Unchanged. Debouncer remains in-memory per process; M10 cancellation works within a single replica only (cross-replica deletions still rely on outbox orphan self-heal). |
| OpenAI quota | M15 wires env var but default model unchanged. Zero quota change. |
| Backward compatibility | Removed exports (`embedSolution`/`embedProblem`/`embedNote`/`findSimilarSolutions`/`findSimilarProblems`-service/`searchSolutionsByText`) have zero external callers — confirmed by grep. The 3 wiring callsites in solutions/problems controllers + notes debouncer are updated in lockstep. |
| Rollback | Single PR. Revert if needed. No DB migration to roll back. |
| Test runtime impact | +15 mock-only tests. <1s suite-time delta. |

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders / TBDs | None. Every code block is the full function body. |
| Internal consistency | `ENTITY_CONFIG` covers exactly the 3 types referenced everywhere else. `embedAndPersist`'s contract (returns embedding on success, null on failure, enqueues on failure) matches the outbox dispatch's expectations and the controller wrappers' assumptions. |
| Scope | Tight. M11/M12/M14 → 4.2b. M13 → 4.2c. H14 → 4.3. Carved explicitly with named follow-up sprints. |
| Ambiguity | Two explicit choices: (a) `embedSolution`/`embedProblem`/`embedNote` are deleted (not kept as wrappers); (b) `embedAllExisting` now uses the outbox via `embedAndPersist` (batch failures are queued for retry instead of being lost). |
| Adversarial review | Circular import: `embedAndPersist` ↔ `enqueueEmbedding` both use `await import()` — cycle-safe. Cancel-vs-fire race: timer fires before cancel → embed proceeds + entity deletion handles the vector; timer fires after cancel → cancelled, no embed; both safe. M16 pre-check empty result: same `[]` return as before, just logged. |
| Backward compatibility | All deleted exports are internal-only (grep-confirmed). Sprint 4.1 wiring tests adapt to the new call shape but retain their behavioral assertions. |
| Risk floor | Low. Pure refactor + 3 narrow audit fixes. No DB migration. No public API change. Single-PR revertable. |

# Embedding Outbox Retry Queue — Design Spec (Sprint 4.1)

**Date:** 2026-06-24
**Sprint:** 4.1 (per `2026-06-20-refactor-redesign-sprint.md` — Sprint 4 decomposed)
**Audit finding:** H4 (`server/src/services/embedding.service.js:31-46`)
**Branch:** `feat/embedding-outbox-retry-queue`
**Layers on:** main, post Sprint 3.4.b
**Feature flag:** None — defense-in-depth reliability fix matching the CLAUDE.md roadmap commitment

---

## Problem

Sprint 1 audit, HIGH finding H4 (lines 78-82):

> `generateEmbedding()` catches all errors and returns `null`. On 429, 5xx, or timeout, the calling controller persists the row with `embedding = NULL` and never retries.
>
> **Failure scenario:** Transient OAI outage → batch of submissions all index with NULL → vector search returns nothing for those rows forever.

CLAUDE.md already flags this as `embedding-outbox-retry-queue` in roadmap NEXT. Sprint 4.1 ships it.

### Zero-trust verification (code reading)

Three write sites that silently NULL on failure today, confirmed by grep:

| Site | File | Line | Context |
| --- | --- | --- | --- |
| 1 | `server/src/controllers/solutions.controller.js` | 1018-1029 | Inline `generateEmbedding` + raw SQL UPDATE |
| 2 | `server/src/controllers/problems.controller.js` | 820-832 | Inline `generateEmbedding` + raw SQL UPDATE |
| 3 | `server/src/services/embedding.service.js::embedNote` | 308-328 | Wrapped helper |

All three handle failure as "log and move on, embedding stays NULL". The two inline sites duplicate the logic of `embedSolution`/`embedProblem` — DRY refactor is **Sprint 4.2 scope**, not this sprint.

---

## Principle

This is a **focused reliability infrastructure addition** — Postgres-backed outbox queue + a 60s scheduler. Matches the existing roadmap commitment ("embedding-outbox-retry-queue"). The pattern is canonical (transactional outbox); the implementation is local (single new file, single new table, three single-line wiring changes in callers).

Scope is intentionally tight. M10-M16 (the rest of the RAG/embeddings audit findings) and H14 (full embedding service tests) ship as Sprint 4.2 and 4.3.

---

## Scope

### In scope

- **New Prisma model** `EmbeddingOutbox` + raw SQL migration with the table + indexes.
- **New service file** `server/src/services/embedding.outbox.js` exporting `enqueueEmbedding`, `processOutboxBatch`, `startOutboxScheduler`, `stopOutboxScheduler`.
- **3 failure-path wiring changes** at the existing embedding write sites (solutions controller, problems controller, `embedNote` in embedding service).
- **Scheduler lifecycle** wired into `server/src/index.js` post-`listen()` and SIGTERM handler.
- **~17 new tests** across `embedding.outbox.test.js` and per-site wiring tests.
- **Roadmap update** marking 4.1 shipped.

### Out of scope (carved to follow-up sprints)

- **DRY refactor of the 3 embedding write sites** → Sprint 4.2. In 4.1 the 3 sites stay duplicated; each one gets the `enqueueEmbedding` call wired in independently.
- **M10-M16 audit fixes** → Sprint 4.2.
- **Full `embedding.service.js` test foundation (H14)** → Sprint 4.3. 4.1 adds tests only for the new outbox code paths and the 3 wiring points.
- **Backfill of existing NULL embedding rows** — already handled by `embedAllExisting()` manual batch script.
- **Admin diagnostic UI for queue state** — ops queries `psql` directly until a follow-up surface sprint pulls in `/super-admin/diagnostics` augmentations.
- **Auto-purge of `FAILED` rows** — explicitly NOT auto-cleaned. FAILED rows are visible evidence of data loss that needs human investigation.
- **Metrics / Sentry / Prometheus** — no metrics infrastructure exists yet.

---

## Architecture

```
server/src/services/
├── embedding.service.js         [3 lines added to embedNote failure path]
│                                 (existing OpenAI + raw vector SQL — unchanged otherwise)
├── notes.embedding.js           [unchanged]
└── embedding.outbox.js          [NEW]
                                 enqueueEmbedding, processOutboxBatch,
                                 startOutboxScheduler, stopOutboxScheduler

server/src/controllers/
├── solutions.controller.js      [~6 lines added to embedding write path]
└── problems.controller.js       [~6 lines added to embedding write path]

server/src/index.js              [2 lines: startOutboxScheduler() after listen,
                                  stopOutboxScheduler() in SIGTERM]

server/prisma/
├── schema.prisma                [+ EmbeddingOutbox model]
└── migrations/
    └── 20260624000000_embedding_outbox_table/
        └── migration.sql        [CREATE TABLE + indexes]

server/test/services/
└── embedding.outbox.test.js     [NEW — 14 tests]

server/test/controllers/
├── solutions.embedding-outbox.test.js  [NEW — 1 wiring test]
└── problems.embedding-outbox.test.js   [NEW — 1 wiring test]
```

---

## Data model

### Prisma schema addition (`schema.prisma`)

```prisma
model EmbeddingOutbox {
  id           String   @id @default(cuid())
  entityType   String   // "Solution" | "Problem" | "Note"
  entityId     String
  status       String   @default("PENDING") // PENDING | RUNNING | FAILED
  attempts     Int      @default(0)
  lastError    String?  // truncated to 500 chars at write time
  nextRetryAt  DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([entityType, entityId])     // idempotent enqueue
  @@index([status, nextRetryAt])       // scheduler claim query
  @@map("embedding_outbox")
}
```

Three deliberate design decisions, with justifications:

1. **Polymorphic single-table** rather than three queue tables. Single retry policy, single scheduler, single set of logs. Cost: no FK integrity — but the queue is a job log, not a relational target. Orphan rows (entity deleted between enqueue and retry) are self-healed by the worker.
2. **`@@unique([entityType, entityId])`** — re-enqueueing the same row upserts. Common case: user re-submits a solution while its outbox row is still PENDING. Resetting `attempts=0, nextRetryAt=now()` fast-tracks the latest attempt instead of compounding queue depth.
3. **No FK to source tables.** Hard deletes don't cascade-clean the outbox. Worker handles orphans by detecting "entity not found" and deleting the row. Self-healing.

### Migration shape

Manually-authored raw SQL migration (consistent with the project's existing pattern for non-trivial schema changes — vector indexes, soft-delete partial indexes):

```sql
-- File: server/prisma/migrations/20260624000000_embedding_outbox_table/migration.sql

CREATE TABLE "embedding_outbox" (
  "id"          TEXT NOT NULL,
  "entityType"  TEXT NOT NULL,
  "entityId"    TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "lastError"   TEXT,
  "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "embedding_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "embedding_outbox_entityType_entityId_key"
  ON "embedding_outbox"("entityType", "entityId");

CREATE INDEX "embedding_outbox_status_nextRetryAt_idx"
  ON "embedding_outbox"("status", "nextRetryAt");
```

Migration is forward-only — no data backfill, no FK additions to existing tables.

---

## Service architecture

### File: `server/src/services/embedding.outbox.js`

```js
import prisma from "../lib/prisma.js";
import {
  embedSolution,
  embedProblem,
  embedNote,
} from "./embedding.service.js";

const SCHEDULER_INTERVAL_MS = 60_000;
const BATCH_SIZE = 10;
const BACKOFF_SCHEDULE_MS = [
  60_000,         // 1 min after attempt 1 failure
  5 * 60_000,     // 5 min after attempt 2 failure
  30 * 60_000,    // 30 min after attempt 3 failure
  2 * 60 * 60_000,    // 2 hr after attempt 4 failure
  12 * 60 * 60_000,   // 12 hr after attempt 5 failure
];
const MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length;
const STALE_RUNNING_MS = 5 * 60_000;  // RUNNING rows older than 5 min are reclaimed

const DISPATCH = {
  Solution: embedSolution,
  Problem: embedProblem,
  Note: embedNote,
};

let timer = null;
let running = false;

// ── Enqueue ──────────────────────────────────────────────
export async function enqueueEmbedding(entityType, entityId, lastError = null) {
  if (!DISPATCH[entityType]) return;
  const truncatedError = lastError ? String(lastError).slice(0, 500) : null;
  try {
    await prisma.embeddingOutbox.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: {
        entityType,
        entityId,
        status: "PENDING",
        attempts: 0,
        lastError: truncatedError,
        nextRetryAt: new Date(),
      },
      update: {
        status: "PENDING",
        attempts: 0,
        lastError: truncatedError,
        nextRetryAt: new Date(),
      },
    });
    console.log(`[embedding-outbox:enqueue] type=${entityType} id=${entityId} reason="${truncatedError ?? "n/a"}"`);
  } catch (err) {
    console.error(`[embedding-outbox:CRITICAL] enqueue failed for ${entityType} ${entityId}: ${err.message}`);
  }
}

// ── Process due batch ─────────────────────────────────────
export async function processOutboxBatch({ batchSize = BATCH_SIZE } = {}) {
  const claimed = await claimDueRows(batchSize);
  const result = { processed: 0, succeeded: 0, failed: 0, orphaned: 0 };

  for (const row of claimed) {
    result.processed++;
    const startMs = Date.now();
    try {
      const dispatchFn = DISPATCH[row.entityType];
      if (!dispatchFn) {
        // Unknown entityType — treat as orphan
        await prisma.embeddingOutbox.delete({ where: { id: row.id } });
        console.log(`[embedding-outbox:orphan] type=${row.entityType} id=${row.entityId} — unknown entityType, dropping`);
        result.orphaned++;
        continue;
      }
      const embedded = await dispatchFn(row.entityId);
      if (embedded) {
        await prisma.embeddingOutbox.delete({ where: { id: row.id } });
        console.log(`[embedding-outbox:success] type=${row.entityType} id=${row.entityId} attempts=${row.attempts + 1} elapsedMs=${Date.now() - startMs}`);
        result.succeeded++;
      } else {
        // dispatchFn returned null — either OpenAI failed OR the entity is missing.
        // We can distinguish: re-query the entity to confirm existence.
        const entityExists = await checkEntityExists(row.entityType, row.entityId);
        if (!entityExists) {
          await prisma.embeddingOutbox.delete({ where: { id: row.id } });
          console.log(`[embedding-outbox:orphan] type=${row.entityType} id=${row.entityId} — entity not found, dropping`);
          result.orphaned++;
        } else {
          await markRetryOrFail(row, "embed returned null");
          result.failed++;
        }
      }
    } catch (err) {
      // Unexpected exception — one bad job shouldn't poison the batch
      await markRetryOrFail(row, err.message);
      result.failed++;
    }
  }
  return result;
}

async function claimDueRows(batchSize) {
  // FOR UPDATE SKIP LOCKED: multi-replica workers don't fight.
  // Includes stale-RUNNING reclaim (worker crashed mid-job).
  const now = new Date();
  const staleThreshold = new Date(Date.now() - STALE_RUNNING_MS);
  const rows = await prisma.$queryRawUnsafe(`
    UPDATE embedding_outbox
    SET status = 'RUNNING', "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM embedding_outbox
      WHERE (status = 'PENDING' AND "nextRetryAt" <= $1)
         OR (status = 'RUNNING' AND "updatedAt" < $2)
      ORDER BY "nextRetryAt" ASC
      LIMIT $3
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `, now, staleThreshold, batchSize);
  return rows;
}

async function checkEntityExists(entityType, entityId) {
  const TABLE_MAP = {
    Solution: "solutions",
    Problem: "problems",
    Note: "notes",
  };
  const table = TABLE_MAP[entityType];
  if (!table) return false;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM "${table}" WHERE id = $1 LIMIT 1`,
    entityId,
  );
  return rows.length > 0;
}

async function markRetryOrFail(row, errorMessage) {
  const attempts = row.attempts + 1;
  const truncatedError = String(errorMessage).slice(0, 500);

  if (attempts >= MAX_ATTEMPTS) {
    await prisma.embeddingOutbox.update({
      where: { id: row.id },
      data: { status: "FAILED", attempts, lastError: truncatedError },
    });
    console.log(`[embedding-outbox:failed] type=${row.entityType} id=${row.entityId} attempts=${attempts} lastError="${truncatedError}"`);
    return;
  }

  const backoffMs = BACKOFF_SCHEDULE_MS[attempts - 1];
  await prisma.embeddingOutbox.update({
    where: { id: row.id },
    data: {
      status: "PENDING",
      attempts,
      lastError: truncatedError,
      nextRetryAt: new Date(Date.now() + backoffMs),
    },
  });
  console.log(`[embedding-outbox:attempt] type=${row.entityType} id=${row.entityId} attempt=${attempts}/${MAX_ATTEMPTS} nextRetryMs=${backoffMs}`);
}

// ── Scheduler lifecycle ───────────────────────────────────
export function startOutboxScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await processOutboxBatch(); }
    catch (err) { console.error("[embedding-outbox] scheduler tick failed:", err.message); }
    finally { running = false; }
  }, SCHEDULER_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  console.log("[embedding-outbox] scheduler started");
}

export function stopOutboxScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
  console.log("[embedding-outbox] scheduler stopped");
}
```

### Why a separate file (not added to `embedding.service.js`)

1. **Lifecycle.** `embedding.service.js` is pure functions called per-request. The outbox owns a long-lived scheduler with start/stop semantics. Mixing them muddles responsibilities.
2. **Test isolation.** Existing embedding tests stay mock-only; outbox tests drive `processOutboxBatch` directly. Each file has one reason to change.
3. **Mirrors existing pattern.** `notes.embedding.js` is already the "wrapper service around embedding.service.js" pattern.

### Stale-RUNNING reclaim (worker crash handling)

If the process is SIGKILL'd between claim-as-RUNNING and the embed call, the row would stay stuck in `RUNNING` forever under a naïve claim query. The fix is to reclaim rows that have been `RUNNING` for >5 minutes — those are presumed dead. 5min ceiling is much longer than any reasonable embed call (~1s) and the 60s tick interval, so it only fires when something genuinely crashed.

---

## Failure-path wiring (the 3 call sites)

### Site 1: `solutions.controller.js:1018-1029` (the inline embedding write)

```js
// BEFORE
const embedding = await generateEmbedding(text);
if (embedding) {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE solutions SET embedding = $1::vector WHERE id = $2`,
    vectorStr, solutionId,
  );
}

// AFTER
const embedding = await generateEmbedding(text);
if (!embedding) {
  await enqueueEmbedding("Solution", solutionId, "generateEmbedding returned null");
  return;
}
try {
  const vectorStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE solutions SET embedding = $1::vector WHERE id = $2`,
    vectorStr, solutionId,
  );
} catch (err) {
  await enqueueEmbedding("Solution", solutionId, `db update failed: ${err.message}`);
}
```

### Site 2: `problems.controller.js:820-832`

Same pattern with `"Problem"`.

### Site 3: `embedding.service.js::embedNote` (line 308-328)

`embedNote` already has an outer try/catch. Add `enqueueEmbedding("Note", noteId, …)` calls on the failure branches (the `if (!embedding) return null` path and the outer `catch` path). Use lazy `import("./embedding.outbox.js")` to avoid a circular import (since `embedding.outbox.js` imports `embedNote`).

### Fire-and-forget guarantee

The existing embedding-write code in problems.controller.js is explicitly `// fire and forget` per its own comments — the user's `POST` returns when the DB transaction commits, embedding happens in the background. The outbox enqueue is added inside the same background promise, so user-facing latency stays unchanged.

### What we are NOT wiring in 4.1

- **`embedSolution`/`embedProblem` exported functions** (only called by `embedAllExisting` batch script) — not wired. They're a manual recovery tool; wiring them would create a feedback loop.
- **The duplicate inline code itself** — Sprint 4.2 will refactor 3 sites to 1 helper. In 4.1 we accept the duplication.

---

## Scheduler lifecycle

### Cadence + batch size

- **Interval:** 60 seconds (matches `teaching.scheduler`).
- **Batch size:** 10 jobs/tick = 600/hr cap, well under OpenAI's embedding-tier quota.

### Retry backoff (5 attempts, then FAILED)

| Attempt | Delay | Cumulative |
| --- | --- | --- |
| 1 | 1 min | 1 min |
| 2 | 5 min | 6 min |
| 3 | 30 min | 36 min |
| 4 | 2 hours | 2.5 h |
| 5 | 12 hours | 14.5 h |
| max | — | row flipped to `FAILED`, preserved |

Reasoning: most OpenAI outages resolve within an hour. The 2h + 12h tail covers extended outages. Past 14.5h, structural problem (revoked key, billing) — admin attention warranted.

### Wiring in `server/src/index.js`

```js
// AFTER server.listen() succeeds:
import { startOutboxScheduler, stopOutboxScheduler } from "./services/embedding.outbox.js";

startOutboxScheduler();

// SIGTERM handler — already exists for closeAllWebSockets; add:
process.on("SIGTERM", async () => {
  stopOutboxScheduler();
  closeAllWebSockets("server restarting");
  server.close(...);
});
```

### Test-safety

The scheduler is started by explicit function call from `index.js`, NEVER at module import. Tests can import `embedding.outbox.js` without spawning intervals; they drive `processOutboxBatch` directly.

### Multi-replica safety

`FOR UPDATE SKIP LOCKED` makes the claim query multi-replica-safe. Single-replica today per H5 constraint; safe to scale out when H5 is fixed.

---

## Observability

| Event | Log shape |
| --- | --- |
| Enqueue | `[embedding-outbox:enqueue] type=Solution id=clxxx reason="generateEmbedding returned null"` |
| Retry attempt | `[embedding-outbox:attempt] type=Solution id=clxxx attempt=2/5 nextRetryMs=300000` |
| Success | `[embedding-outbox:success] type=Solution id=clxxx attempts=3 elapsedMs=450` |
| Final failure | `[embedding-outbox:failed] type=Solution id=clxxx attempts=5 lastError="..."` |
| Self-heal (orphan) | `[embedding-outbox:orphan] type=Note id=clxxx — entity not found, dropping row` |
| Enqueue self-failure | `[embedding-outbox:CRITICAL] enqueue failed for Solution clxxx: <err>` |

All single-line, key=value. Greppable. The `CRITICAL` tag flags the one human-attention case (DB outage during enqueue). Matches the existing project log conventions (`[canonical:alt-dropped]`, `[patterns:custom]`, `[validate:stripped]`).

### Admin queries (ops uses `psql` directly)

```sql
-- Queue state summary
SELECT status, COUNT(*), MIN("createdAt") AS oldest
FROM embedding_outbox GROUP BY status;

-- Inspect FAILED rows
SELECT id, "entityType", "entityId", attempts, "lastError", "createdAt"
FROM embedding_outbox WHERE status = 'FAILED' ORDER BY "createdAt" DESC;
```

### Auto-purge

**None.** FAILED rows persist until admin manually deletes them. They represent silent data loss and must remain visible. Table-size growth is not a practical concern (FAILED is exceptional, not steady state).

---

## Test plan

### File: `server/test/services/embedding.outbox.test.js` (NEW — 14 tests)

#### `enqueueEmbedding` — 3 tests

1. **Happy path** — `prisma.embeddingOutbox.upsert` called with `status=PENDING`, `attempts=0`, `lastError=<reason>`.
2. **Idempotent** — re-enqueue of same `(entityType, entityId)` upserts on the update branch with `attempts=0` reset, `status=PENDING`. No duplicate row.
3. **DB failure** — `prisma.embeddingOutbox.upsert` throws → `console.error` captures `[embedding-outbox:CRITICAL]`. Function resolves without re-throw.

#### `processOutboxBatch` — 8 tests

4. **Claims PENDING + due rows only** — assert claim query targets `status='PENDING' AND nextRetryAt <= now()`; rows with future `nextRetryAt` not claimed.
5. **Batch size respected** — mock returns >10 due rows; only 10 dispatched.
6. **Stale RUNNING reclaimed** — row with `status='RUNNING'` and `updatedAt < now() - 5min` claimed; row with `status='RUNNING'` and recent `updatedAt` not claimed.
7. **Success deletes the row** — `embedSolution` mock returns truthy → `prisma.embeddingOutbox.delete` called. `[embedding-outbox:success]` logged.
8. **Failure bumps attempts + reschedules** — `embedSolution` returns null + entity exists → `update` with `attempts: prev+1`, `nextRetryAt = now() + BACKOFF[prev]`, `lastError`.
9. **Max attempts → FAILED** — after 5th failed attempt, `update` with `status='FAILED'`. Row preserved.
10. **Orphan self-heal** — `embedSolution` returns null + entity not found → `delete` called. `[embedding-outbox:orphan]` logged.
11. **One bad job doesn't poison batch** — 3-job batch; 2nd throws unexpected error; 1st and 3rd still process.

#### Backoff timing (1 test)

12. **Backoff progression matches schedule** — drive a single row through 5 simulated failures; assert `nextRetryAt - now()` ≈ `[1m, 5m, 30m, 2h, 12h]` (±100ms tolerance).

#### Scheduler lifecycle (2 tests)

13. **Clean start/stop** — `vi.useFakeTimers()`; start; advance 60s → `processOutboxBatch` called; stop; advance another 60s → not called again.
14. **Re-entrancy guard** — mock `processOutboxBatch` to take 90s; advance 60s twice; assert only 1 tick fired (the 2nd skipped due to `running` flag).

### Controller wiring tests (3 tests)

15. **`server/test/controllers/solutions.embedding-outbox.test.js`** (NEW) — solution write with `generateEmbedding` returning null triggers `enqueueEmbedding("Solution", id, ...)`.
16. **`server/test/controllers/problems.embedding-outbox.test.js`** (NEW) — same for problems.
17. **`embedNote` failure enqueues** — added to `embedding.outbox.test.js`. Mock `generateEmbedding` to return null + mock prisma so `embedNote` returns null → assert `enqueueEmbedding("Note", noteId, ...)` called.

### What we are NOT testing in 4.1

- Full `embedding.service.js` coverage (H14) → Sprint 4.3.
- Real-Postgres `FOR UPDATE SKIP LOCKED` concurrency → built-in Postgres feature, unit-test confidence sufficient.
- Real OpenAI API integration → `generateEmbedding` is mocked everywhere.

### RED-first proofs

Each test should fail without the corresponding production code change. Tests 1-14 fail today with "module not found" because `embedding.outbox.js` doesn't exist. Tests 15-17 fail with "enqueueEmbedding is not a function" until the wiring is added.

### Test count

Baseline (current): ~1193 (post Sprint 3.4.b). Target after 4.1: ~1210.

### SQL assertion style

Behavioral assertions on query shape (e.g. "claim included status filter and nextRetryAt filter and SKIP LOCKED"), not literal string match. Matches Sprint 3.2's M22 CAS test pattern. Robust to whitespace changes.

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | New `embedding_outbox` table; no data backfill; no FK additions. Safe forward + reversible. |
| Token / session invalidation | None |
| Behavior change for normal users | None. `generateEmbedding` success path is untouched. Only fires on failure. |
| Latency | Unchanged on success path. Failure path adds one `upsert` (~5ms) to an already-async background promise. |
| Multi-replica safety | Future-proofed via `FOR UPDATE SKIP LOCKED`. Single-replica today (H5 constraint). |
| OpenAI quota | Outbox adds at most `BATCH_SIZE=10` retry calls per 60s tick = 600/hr max, well under quota. |
| Rollback | Single migration + single PR. Revert PR + revert migration. Existing solutions/problems/notes unaffected. |
| Test runtime impact | ~17 mock-only tests, <1s suite-time delta. |

---

## Backward compatibility

- **API**: no caller change. Public functions of `embedding.service.js` keep their signatures.
- **Existing tests**: all stay green. Tests mock `generateEmbedding` to return truthy embeddings; the new failure path doesn't fire.
- **Email / WebSocket / migration drift**: none.

---

## Five-touchpoint contract check (per CLAUDE.md)

This sprint doesn't add new fields to a mutation request body, so the five-touchpoint pattern (Prisma migration → schema.prisma → Zod → controller allow-list → client payload) doesn't apply. The migration + schema.prisma touchpoints are exercised but the request-body chain is unchanged.

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders / TBDs | None. Every retry interval, log line, and SQL shape is concrete. |
| Internal consistency | Polymorphic queue + idempotent enqueue + self-healing on orphans is a coherent contract; the test plan exercises each. The retry constants (`BACKOFF_SCHEDULE_MS`, `MAX_ATTEMPTS`, `STALE_RUNNING_MS`) are defined once in `embedding.outbox.js` and referenced everywhere. |
| Scope | 4.1 = H4 outbox only. DRY refactor → 4.2. Embedding service tests (H14) → 4.3. M10-M16 → 4.2. Carved explicitly. |
| Ambiguity | Two explicit calls: (a) `embedSolution`/`embedProblem` exported functions stay un-wired (manual batch tool), (b) `FAILED` rows preserved indefinitely. |
| Backward compatibility | All existing tests stay green. No API change. |
| Adversarial review | Worker crash mid-job: handled via stale-RUNNING reclaim (5 min ceiling). Enqueue self-failure: handled (CRITICAL log, no propagate). Successful OAI call + failed SQL UPDATE: handled (catch → enqueue). Orphan after delete: handled (worker drops the row). Circular import risk between `embedding.service.js::embedNote` and `embedding.outbox.js`: handled via lazy `import()`. |
| Risk floor | Low. Pure additive infrastructure. No behavior change on success path. Rollback is a single revert. |

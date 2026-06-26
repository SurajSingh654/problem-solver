// Sprint 4.1 — embedding outbox retry queue.
// See docs/superpowers/specs/2026-06-24-embedding-outbox-retry-queue-design.md
import prisma from "../lib/prisma.js";

// No static import of embedAndPersist — lazy to break the import cycle
// (embedding.service.js lazy-imports enqueueEmbedding symmetrically).

async function dispatchEmbed(entityType, entityId) {
  const { embedAndPersist } = await import("./embedding.service.js");
  return embedAndPersist(entityType, entityId);
}

const KNOWN_ENTITY_TYPES = new Set(["Solution", "Problem", "Note"]);

const SCHEDULER_INTERVAL_MS = 60_000;
const BATCH_SIZE = 10;
const BACKOFF_SCHEDULE_MS = [
  60_000,            // 1 min after attempt 1 failure
  5 * 60_000,        // 5 min after attempt 2 failure
  30 * 60_000,       // 30 min after attempt 3 failure
  2 * 60 * 60_000,   // 2 hr after attempt 4 failure
  12 * 60 * 60_000,  // 12 hr after attempt 5 failure
];
const MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length;
const STALE_RUNNING_MS = 5 * 60_000;

const TABLE_MAP = {
  Solution: "solutions",
  Problem: "problems",
  Note: "notes",
};

let timer = null;
let running = false;

export async function enqueueEmbedding(entityType, entityId, lastError = null) {
  if (!KNOWN_ENTITY_TYPES.has(entityType)) return;
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
    console.log(
      `[embedding-outbox:enqueue] type=${entityType} id=${entityId} reason="${truncatedError ?? "n/a"}"`,
    );
  } catch (err) {
    console.error(
      `[embedding-outbox:CRITICAL] enqueue failed for ${entityType} ${entityId}: ${err.message}`,
    );
  }
}

export async function processOutboxBatch({ batchSize = BATCH_SIZE } = {}) {
  const claimed = await claimDueRows(batchSize);
  const result = { processed: 0, succeeded: 0, failed: 0, orphaned: 0 };

  for (const row of claimed) {
    result.processed++;
    const startMs = Date.now();
    try {
      if (!KNOWN_ENTITY_TYPES.has(row.entityType)) {
        await prisma.embeddingOutbox.delete({ where: { id: row.id } });
        console.log(
          `[embedding-outbox:orphan] type=${row.entityType} id=${row.entityId} — unknown entityType, dropping`,
        );
        result.orphaned++;
        continue;
      }
      const embedded = await dispatchEmbed(row.entityType, row.entityId);
      if (embedded) {
        await prisma.embeddingOutbox.delete({ where: { id: row.id } });
        console.log(
          `[embedding-outbox:success] type=${row.entityType} id=${row.entityId} attempts=${row.attempts + 1} elapsedMs=${Date.now() - startMs}`,
        );
        result.succeeded++;
      } else {
        const entityExists = await checkEntityExists(row.entityType, row.entityId);
        if (!entityExists) {
          await prisma.embeddingOutbox.delete({ where: { id: row.id } });
          console.log(
            `[embedding-outbox:orphan] type=${row.entityType} id=${row.entityId} — entity not found, dropping`,
          );
          result.orphaned++;
        } else {
          try {
            await markRetryOrFail(row, "embed returned null");
          } catch (retryErr) {
            console.error(
              `[embedding-outbox:CRITICAL] markRetryOrFail failed for ${row.entityType} ${row.entityId}: ${retryErr.message}`,
            );
          }
          result.failed++;
        }
      }
    } catch (err) {
      try {
        await markRetryOrFail(row, err.message);
      } catch (retryErr) {
        console.error(
          `[embedding-outbox:CRITICAL] markRetryOrFail failed for ${row.entityType} ${row.entityId}: ${retryErr.message}`,
        );
      }
      result.failed++;
    }
  }
  return result;
}

export function startOutboxScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processOutboxBatch();
    } catch (err) {
      console.error("[embedding-outbox] scheduler tick failed:", err.message);
    } finally {
      running = false;
    }
  }, SCHEDULER_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  console.log("[embedding-outbox] scheduler started");
}

export function stopOutboxScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[embedding-outbox] scheduler stopped");
  }
}

async function claimDueRows(batchSize) {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const staleThreshold = new Date(nowMs - STALE_RUNNING_MS);
  const rows = await prisma.$queryRawUnsafe(
    `UPDATE embedding_outbox
     SET status = 'RUNNING', "updatedAt" = now()
     WHERE id IN (
       SELECT id FROM embedding_outbox
       WHERE (status = 'PENDING' AND "nextRetryAt" <= $1)
          OR (status = 'RUNNING' AND "updatedAt" < $2)
       ORDER BY "nextRetryAt" ASC
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    now,
    staleThreshold,
    batchSize,
  );
  return rows;
}

async function checkEntityExists(entityType, entityId) {
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

  if (attempts > MAX_ATTEMPTS) {
    await prisma.embeddingOutbox.update({
      where: { id: row.id },
      data: { status: "FAILED", attempts, lastError: truncatedError },
    });
    console.log(
      `[embedding-outbox:failed] type=${row.entityType} id=${row.entityId} attempts=${attempts} lastError="${truncatedError}"`,
    );
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
  console.log(
    `[embedding-outbox:attempt] type=${row.entityType} id=${row.entityId} attempt=${attempts}/${MAX_ATTEMPTS} nextRetryMs=${backoffMs}`,
  );
}

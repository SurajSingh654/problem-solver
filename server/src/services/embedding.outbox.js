// Sprint 4.1 — embedding outbox retry queue.
// See docs/superpowers/specs/2026-06-24-embedding-outbox-retry-queue-design.md
import prisma from "../lib/prisma.js";
import {
  embedSolution,
  embedProblem,
  embedNote,
} from "./embedding.service.js";

const SCHEDULER_INTERVAL_MS = 60_000;
const BATCH_SIZE = 10;
const BACKOFF_SCHEDULE_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
];
const MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length;
const STALE_RUNNING_MS = 5 * 60_000;

const DISPATCH = {
  Solution: embedSolution,
  Problem: embedProblem,
  Note: embedNote,
};

let timer = null;
let running = false;

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
          await markRetryOrFail(row, "embed returned null");
          result.failed++;
        }
      }
    } catch (err) {
      await markRetryOrFail(row, err.message);
      result.failed++;
    }
  }
  return result;
}

async function claimDueRows(batchSize) {
  const now = new Date();
  const staleThreshold = new Date(Date.now() - STALE_RUNNING_MS);
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

const TABLE_MAP = {
  Solution: "solutions",
  Problem: "problems",
  Note: "notes",
};

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

  if (attempts >= MAX_ATTEMPTS) {
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

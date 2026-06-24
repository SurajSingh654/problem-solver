-- Sprint 4.1: Embedding outbox retry queue.
-- Polymorphic queue for retrying failed embedding writes across Solution,
-- Problem, and Note. Workers claim rows via FOR UPDATE SKIP LOCKED for
-- multi-replica safety. Status transitions: PENDING -> RUNNING -> (deleted on success | PENDING on retry | FAILED at max attempts).

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

-- Idempotent enqueue: same (entityType, entityId) collapses to one row.
CREATE UNIQUE INDEX "embedding_outbox_entityType_entityId_key"
  ON "embedding_outbox"("entityType", "entityId");

-- Scheduler claim query: WHERE status = 'PENDING' AND nextRetryAt <= now()
-- ORDER BY nextRetryAt ASC. The composite index covers both predicates.
CREATE INDEX "embedding_outbox_status_nextRetryAt_idx"
  ON "embedding_outbox"("status", "nextRetryAt");

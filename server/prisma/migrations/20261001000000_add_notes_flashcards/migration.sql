-- Notes — personal markdown workspace + SM-2 flashcards.
-- Both tables are user-scoped (no teamId). Notes carry a pgvector(1536)
-- embedding for similarity search; the column + HNSW index are added
-- explicitly here because Prisma's Unsupported("vector(...)") doesn't
-- generate column SQL.

CREATE TYPE "NoteEntityType" AS ENUM (
  'PROBLEM',
  'INTERVIEW_SESSION',
  'DESIGN_SESSION',
  'TEACHING_SESSION'
);

-- ── notes ──────────────────────────────────────────────
CREATE TABLE "notes" (
  "id"                   TEXT             NOT NULL,
  "userId"               TEXT             NOT NULL,
  "title"                TEXT             NOT NULL,
  "contentMarkdown"      TEXT             NOT NULL,
  "tags"                 TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
  "linkedEntityType"     "NoteEntityType",
  "linkedEntityId"       TEXT,
  "linkedEntityTitle"    TEXT,
  "summary"              JSONB,
  "summaryGeneratedAt"   TIMESTAMP(3),
  "suggestedTags"        TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pinned"               BOOLEAN          NOT NULL DEFAULT false,
  "archivedAt"           TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- pgvector column added separately so it works with Prisma's
-- Unsupported("vector(1536)") placeholder.
ALTER TABLE "notes" ADD COLUMN "embedding" vector(1536);

CREATE INDEX "notes_userId_archivedAt_pinned_updatedAt_idx"
  ON "notes"("userId", "archivedAt", "pinned", "updatedAt");

CREATE INDEX "notes_userId_linkedEntityType_linkedEntityId_idx"
  ON "notes"("userId", "linkedEntityType", "linkedEntityId");

CREATE INDEX "notes_userId_archivedAt_idx"
  ON "notes"("userId", "archivedAt");

CREATE INDEX IF NOT EXISTS "idx_notes_embedding_hnsw"
  ON "notes" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── flashcards ────────────────────────────────────────
CREATE TABLE "flashcards" (
  "id"                TEXT             NOT NULL,
  "userId"            TEXT             NOT NULL,
  "noteId"            TEXT,
  "front"             TEXT             NOT NULL,
  "back"              TEXT             NOT NULL,
  "tags"              TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sm2EasinessFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  "sm2Interval"       INTEGER          NOT NULL DEFAULT 1,
  "sm2Repetitions"    INTEGER          NOT NULL DEFAULT 0,
  "lapseCount"        INTEGER          NOT NULL DEFAULT 0,
  "nextReviewDate"    TIMESTAMP(3)     NOT NULL,
  "reviewCount"       INTEGER          NOT NULL DEFAULT 0,
  "lastReviewedAt"    TIMESTAMP(3),
  "reviewDates"       JSONB            NOT NULL DEFAULT '[]'::jsonb,
  "aiGenerated"       BOOLEAN          NOT NULL DEFAULT false,
  "archivedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "flashcards_userId_archivedAt_nextReviewDate_idx"
  ON "flashcards"("userId", "archivedAt", "nextReviewDate");

CREATE INDEX "flashcards_userId_noteId_idx"
  ON "flashcards"("userId", "noteId");

ALTER TABLE "flashcards"
  ADD CONSTRAINT "flashcards_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "flashcards"
  ADD CONSTRAINT "flashcards_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "notes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

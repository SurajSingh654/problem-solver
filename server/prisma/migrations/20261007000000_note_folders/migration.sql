-- NoteFolder — user-scoped hierarchical folders for personal notes.
-- Folder delete cascades to subfolders; notes detach (folderId SetNull).
-- Sibling folders inside the same parent must have unique names per user.

-- ── note_folders ───────────────────────────────────────
CREATE TABLE "note_folders" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "parentId"  TEXT,
  "name"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "note_folders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "note_folders_userId_parentId_name_key"
  ON "note_folders"("userId", "parentId", "name");

CREATE INDEX "note_folders_userId_parentId_idx"
  ON "note_folders"("userId", "parentId");

ALTER TABLE "note_folders"
  ADD CONSTRAINT "note_folders_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_folders"
  ADD CONSTRAINT "note_folders_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "note_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── notes.folderId ─────────────────────────────────────
ALTER TABLE "notes" ADD COLUMN "folderId" TEXT;

ALTER TABLE "notes"
  ADD CONSTRAINT "notes_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "note_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "notes_userId_folderId_archivedAt_updatedAt_idx"
  ON "notes"("userId", "folderId", "archivedAt", "updatedAt");

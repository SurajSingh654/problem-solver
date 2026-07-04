-- Curriculum Phase 1: Add teamId FKs to Topic + Concept, delete unused DRAFT topics,
-- backfill existing PUBLISHED topics + concepts to a team owner, add curriculum fields,
-- add optional conceptId FK on TeachingSession + Flashcard.
-- Real-DB reality: system-design (DRAFT, no dependents) → delete. ai-engineering (PUBLISHED, 3
-- enrollments + 1 mastery) → backfill to Binary Thinkers (cmp3oirtt000bclwh5e32z6ig).

-- Step 1: preflight — verify no unexpected data lurking.
DO $$
DECLARE
  draft_with_deps INT;
BEGIN
  SELECT count(*) INTO draft_with_deps
  FROM topics t
  WHERE t.status = 'DRAFT' AND (
    EXISTS (SELECT 1 FROM topic_enrollments te WHERE te."topicId" = t.id) OR
    EXISTS (SELECT 1 FROM concepts c WHERE c."topicId" = t.id AND EXISTS (SELECT 1 FROM concept_masteries m WHERE m."conceptId" = c.id))
  );
  IF draft_with_deps > 0 THEN
    RAISE EXCEPTION 'Aborting: % DRAFT topics have enrollments/masteries. Manual reconciliation required.', draft_with_deps;
  END IF;
END $$;

-- Step 2: Delete DRAFT topics with no dependents (cascade to their concepts).
DELETE FROM topics WHERE status = 'DRAFT';

-- Step 3: Add nullable teamId to topics (transitional).
ALTER TABLE "topics" ADD COLUMN "teamId" TEXT;

-- Step 4: Backfill teamId on remaining topics.
-- ai-engineering (and any surviving topic without a specific mapping) → Binary Thinkers.
UPDATE "topics"
   SET "teamId" = 'cmp3oirtt000bclwh5e32z6ig'
 WHERE "teamId" IS NULL;

-- Step 5: Preflight — assert every topic has teamId.
DO $$
DECLARE null_count INT;
BEGIN
  SELECT count(*) INTO null_count FROM "topics" WHERE "teamId" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Aborting: % topics still have NULL teamId after backfill', null_count;
  END IF;
END $$;

-- Step 6: Set NOT NULL + FK.
ALTER TABLE "topics" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "topics"
  ADD CONSTRAINT "topics_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Swap slug unique constraint (global → per-team).
ALTER TABLE "topics" DROP CONSTRAINT IF EXISTS "topics_slug_key";
CREATE UNIQUE INDEX "topics_teamId_slug_key" ON "topics"("teamId", "slug");
CREATE INDEX "topics_teamId_status_idx" ON "topics"("teamId", "status");

-- Step 8: Add Topic curriculum Phase 1 fields (all nullable).
ALTER TABLE "topics" ADD COLUMN "cheatsheetHtml" TEXT;
ALTER TABLE "topics" ADD COLUMN "curriculumReview" JSONB;
ALTER TABLE "topics" ADD COLUMN "lastReviewedAt" TIMESTAMP(3);
ALTER TABLE "topics" ADD COLUMN "forkedFromTemplateId" TEXT;
ALTER TABLE "topics" ADD COLUMN "forkedAt" TIMESTAMP(3);
-- forkedFromTemplateId FK will be added in migration 20260704000400 when topic_templates exists.

-- Step 9: Add nullable teamId to concepts (transitional).
ALTER TABLE "concepts" ADD COLUMN "teamId" TEXT;

-- Step 10: Backfill concepts.teamId from parent Topic (invariant: Concept.teamId === Topic.teamId).
UPDATE "concepts" c
   SET "teamId" = t."teamId"
  FROM "topics" t
 WHERE t.id = c."topicId";

-- Step 11: Preflight — assert every concept has teamId.
DO $$
DECLARE null_count INT;
BEGIN
  SELECT count(*) INTO null_count FROM "concepts" WHERE "teamId" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Aborting: % concepts still have NULL teamId after backfill', null_count;
  END IF;
END $$;

-- Step 12: Set NOT NULL + FK.
ALTER TABLE "concepts" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "concepts"
  ADD CONSTRAINT "concepts_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "concepts_teamId_status_idx" ON "concepts"("teamId", "status");

-- Step 13: Add Concept curriculum Phase 1 fields.
ALTER TABLE "concepts" ADD COLUMN "richHtmlEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "concepts" ADD COLUMN "readinessRubric" JSONB;
ALTER TABLE "concepts" ADD COLUMN "cheatsheetMarkdown" TEXT;
ALTER TABLE "concepts" ADD COLUMN "primerHtml" TEXT;

-- Step 14: Optional conceptId FK on teaching_sessions.
ALTER TABLE "teaching_sessions" ADD COLUMN "conceptId" TEXT;
ALTER TABLE "teaching_sessions"
  ADD CONSTRAINT "teaching_sessions_conceptId_fkey"
  FOREIGN KEY ("conceptId") REFERENCES "concepts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "teaching_sessions_conceptId_idx" ON "teaching_sessions"("conceptId");

-- Step 15: Optional conceptId FK on flashcards.
ALTER TABLE "flashcards" ADD COLUMN "conceptId" TEXT;
ALTER TABLE "flashcards"
  ADD CONSTRAINT "flashcards_conceptId_fkey"
  FOREIGN KEY ("conceptId") REFERENCES "concepts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "flashcards_conceptId_idx" ON "flashcards"("conceptId");

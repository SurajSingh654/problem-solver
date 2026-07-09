-- Primer Phase B: structured primer sections + prerequisite hint notes
--
-- Adds:
--   concepts.primerSections    JSONB DEFAULT '[]'
--   concept_dependencies.hintNote TEXT NULL
--
-- Backfills concepts.primerSections from the existing flat fields so
-- every published concept renders under the new section-based Primer
-- surface without an authoring step. Fallback logic on the read path
-- also derives sections from flat fields if the column is empty, so
-- this backfill is a convenience, not a correctness requirement.

-- ── 1. Schema additions ─────────────────────────────────────────────

ALTER TABLE "concepts"
    ADD COLUMN "primerSections" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "concept_dependencies"
    ADD COLUMN "hintNote" TEXT;

-- ── 2. Backfill concepts.primerSections ──────────────────────────────
--
-- Convert every existing concept's flat fields into an ordered section
-- array. Order matches the reader's expected flow:
--   1. body            (primerMarkdown  — the deep-dive exposition)
--   2. workedExample   (workedExample   — walk-through)
--   3. cheatsheet      (cheatsheetMarkdown — compact reference)
--   4. checkYourself   (expectedQuestions — retrieval prompts;
--                       revealMode default = "click")
--
-- Sections with empty source content are omitted, not written as
-- empty entries. `checkYourself` doesn't carry content — it references
-- the existing `expectedQuestions` JSON array — so it's inserted iff
-- that array is non-empty.
--
-- Idempotent: WHERE guard skips concepts whose primerSections is already
-- populated (empty array is the DEFAULT — anything else means an author
-- or an earlier migration run touched it).

UPDATE "concepts" AS c
SET "primerSections" = (
    SELECT COALESCE(jsonb_agg(section ORDER BY ord), '[]'::jsonb)
    FROM (
        SELECT 1 AS ord,
               jsonb_build_object(
                   'type', 'body',
                   'markdown', c."primerMarkdown"
               ) AS section
        WHERE c."primerMarkdown" IS NOT NULL
          AND length(btrim(c."primerMarkdown")) > 0

        UNION ALL

        SELECT 2 AS ord,
               jsonb_build_object(
                   'type', 'workedExample',
                   'markdown', c."workedExample"
               ) AS section
        WHERE c."workedExample" IS NOT NULL
          AND length(btrim(c."workedExample")) > 0

        UNION ALL

        SELECT 3 AS ord,
               jsonb_build_object(
                   'type', 'cheatsheet',
                   'markdown', c."cheatsheetMarkdown"
               ) AS section
        WHERE c."cheatsheetMarkdown" IS NOT NULL
          AND length(btrim(c."cheatsheetMarkdown")) > 0

        UNION ALL

        SELECT 4 AS ord,
               jsonb_build_object(
                   'type', 'checkYourself',
                   'revealMode', 'click'
               ) AS section
        WHERE jsonb_typeof(c."expectedQuestions") = 'array'
          AND jsonb_array_length(c."expectedQuestions") > 0
    ) sub
)
WHERE c."primerSections" = '[]'::jsonb;

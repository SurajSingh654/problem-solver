-- Migrate Solution.pattern (comma-separated String?) → Solution.patterns (String[]).
-- The CSV was an accidental data format: any pattern label containing a comma
-- round-tripped wrong, and the skill taxonomy already had to split it defensively.
--
-- Backfill splits on `,` (tolerates either `, ` or `,`), trims whitespace, and
-- drops empty fragments. NULL and empty-string rows become empty arrays.

-- 1. Add the new array column with an empty-array default.
ALTER TABLE "solutions"
  ADD COLUMN "patterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 2. Backfill from the existing CSV column.
UPDATE "solutions"
SET "patterns" = CASE
  WHEN "pattern" IS NULL OR trim("pattern") = '' THEN ARRAY[]::TEXT[]
  ELSE (
    SELECT COALESCE(array_agg(trim(t)), ARRAY[]::TEXT[])
    FROM unnest(string_to_array("pattern", ',')) AS t
    WHERE trim(t) <> ''
  )
END;

-- 3. Drop the legacy CSV column.
ALTER TABLE "solutions" DROP COLUMN "pattern";

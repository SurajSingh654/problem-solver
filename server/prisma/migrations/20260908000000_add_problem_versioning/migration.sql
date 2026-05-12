-- Problem content versioning.
--
-- `problems.version` is bumped on every statement-level edit; admin-flag
-- flips (isPinned, isHidden, isPublished) are excluded so they don't churn
-- the counter.
--
-- `solutions.problemVersion` freezes the version the candidate actually
-- solved against. Legacy rows get NULL (interpreted as "pre-versioning,
-- unknown"); new submissions always capture the current version.

ALTER TABLE "problems"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "solutions"
  ADD COLUMN "problemVersion" INTEGER;

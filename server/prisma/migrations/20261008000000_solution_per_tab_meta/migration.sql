-- Per-tab metadata for Solution. The tabbed SolutionTabs editor in the
-- client exposes BruteForce / Optimized / Alternative tabs. The Optimized
-- tab maps onto the canonical metadata columns (code, language,
-- timeComplexity, spaceComplexity); these new columns store the same
-- shape for the BruteForce + Alternative tabs. All nullable so existing
-- rows stay valid; the new Submit / Edit save logic populates them.
--
-- JSON shape (both Meta columns):
--   { "code": str?, "language": str?, "timeComplexity": str?, "spaceComplexity": str? }

ALTER TABLE "solutions" ADD COLUMN "bruteForceMeta" JSONB;
ALTER TABLE "solutions" ADD COLUMN "alternativeApproach" TEXT;
ALTER TABLE "solutions" ADD COLUMN "alternativeMeta" JSONB;

-- SolutionAttempt mirrors Solution's content columns (history snapshots).
-- Add the same per-tab metadata so attempt diffs preserve round-trip data.
ALTER TABLE "solution_attempts" ADD COLUMN "bruteForceMeta" JSONB;
ALTER TABLE "solution_attempts" ADD COLUMN "alternativeApproach" TEXT;
ALTER TABLE "solution_attempts" ADD COLUMN "alternativeMeta" JSONB;

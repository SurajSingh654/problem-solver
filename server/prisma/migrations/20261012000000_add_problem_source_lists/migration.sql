-- ============================================================================
-- Add Problem.sourceLists — admin curriculum-source tagging
-- ============================================================================
-- Pure metadata column. Examples: "Striver A2Z", "Neetcode 150", "Blind 75".
-- Default empty array preserves existing rows untouched. Does NOT bump
-- Problem.version on change (see schema.prisma comment).
-- ============================================================================

ALTER TABLE "problems" ADD COLUMN "sourceLists" TEXT[] NOT NULL DEFAULT '{}';

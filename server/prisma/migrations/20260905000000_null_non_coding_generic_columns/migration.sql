-- Normalize non-CODING solutions: categorySpecificData is canonical.
--
-- For any non-CODING row (HR, BEHAVIORAL, CS_FUNDAMENTALS, SQL) that
-- already has categorySpecificData populated, the old duplication into
-- generic columns (approach, keyInsight, feynmanExplanation, ...) is
-- redundant and a latent desync risk. Null those columns out — readers
-- now use the category-aware helpers in utils/solutionSignals.js, and
-- the AI prompts read from categorySpecificData as primary.
--
-- Truly legacy rows (categorySpecificData NULL or empty) are LEFT ALONE
-- so the existing legacy-detection paths (SolutionCard::isOldHRSubmission,
-- ai.prompts.js fallback chains) continue to work.
--
-- SYSTEM_DESIGN and LOW_LEVEL_DESIGN are intentionally excluded — their
-- writer is the Design Studio bridge, which is out of scope for this pass.

UPDATE "solutions" s
SET
  "approach"            = NULL,
  "keyInsight"          = NULL,
  "feynmanExplanation"  = NULL,
  "realWorldConnection" = NULL,
  "bruteForce"          = NULL,
  "optimizedApproach"   = NULL,
  "timeComplexity"      = NULL,
  "spaceComplexity"     = NULL,
  "code"                = NULL,
  "language"            = NULL
FROM "problems" p
WHERE s."problemId" = p.id
  AND p."category" IN ('HR', 'BEHAVIORAL', 'CS_FUNDAMENTALS', 'SQL')
  AND s."categorySpecificData" IS NOT NULL
  AND jsonb_typeof(s."categorySpecificData") = 'object'
  AND s."categorySpecificData" <> '{}'::jsonb;

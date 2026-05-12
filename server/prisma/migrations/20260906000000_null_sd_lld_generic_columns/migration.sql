-- Extend the non-CODING single-source-of-truth invariant to SYSTEM_DESIGN
-- and LOW_LEVEL_DESIGN, which write through the Design Studio bridge
-- (designStudio.controller.js::buildSolutionPayloadFromSession).
--
-- Mirror of 20260905000000_null_non_coding_generic_columns, now covering
-- the two Design Studio categories. Only nulls rows that already have
-- categorySpecificData populated — truly-legacy rows keep their generic
-- columns so any remaining fallback paths continue to work.

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
  AND p."category" IN ('SYSTEM_DESIGN', 'LOW_LEVEL_DESIGN')
  AND s."categorySpecificData" IS NOT NULL
  AND jsonb_typeof(s."categorySpecificData") = 'object'
  AND s."categorySpecificData" <> '{}'::jsonb;

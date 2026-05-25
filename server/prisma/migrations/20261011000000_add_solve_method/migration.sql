-- Adds solveMethod to solutions. The column was already being read in
-- ai.controller.js, designStudio.controller.js, and ai.prompts.js as if it
-- existed; those reads silently returned undefined. This migration makes
-- it a real column so the AI prompts and downstream mastery computation
-- (Coding Pattern Mastery dim) can rely on the value.
--
-- Allowed values:
--   COLD          — solved without hints, no peeking at the answer
--   HINTS         — used hints during the solve
--   SAW_APPROACH  — looked at the canonical approach before solving
--
-- NULL is allowed and is the legacy state — every existing row gets NULL.
-- Mastery scoring treats NULL on rows older than the deploy date as
-- COLD-equivalent (permissive); rows after the deploy must specify a
-- value for them to count toward "Working" mastery transitions.

ALTER TABLE "solutions" ADD COLUMN "solveMethod" TEXT;
ALTER TABLE "solutions" ADD CONSTRAINT solutions_solve_method_check
  CHECK ("solveMethod" IS NULL OR "solveMethod" IN ('COLD', 'HINTS', 'SAW_APPROACH'));

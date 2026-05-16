-- Cache key for AI Solution Review. When the input hash matches the
-- previous run, reviewSolution returns the latest aiFeedback without
-- re-billing OpenAI. Legacy rows are NULL → first re-analysis populates
-- the hash. Bypassed when the caller passes `force: true`.

ALTER TABLE "solutions" ADD COLUMN "aiFeedbackInputHash" TEXT;

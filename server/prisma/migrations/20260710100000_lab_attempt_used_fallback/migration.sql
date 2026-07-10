-- Lab Phase A: distinguish fallback-generated verdicts from real AI verdicts.
--
-- Adds:
--   lab_attempts.usedFallback  BOOLEAN NOT NULL DEFAULT false
--
-- Motivation (2026-07-10 review): `contentReview.service.runValidator` emits
-- `usedFallback: true` when the AI call fails or the AI output fails Zod /
-- validator rules. `onReviewCompleted` in curriculum.controller.js was
-- silently dropping the flag. A learner whose STRONG attempt happened to hit
-- a transient OpenAI outage would receive the deterministic WEAK fallback
-- verdict and be PERMANENTLY blocked from the reveal-reference gate — no
-- indication that the verdict wasn't a real AI review.
--
-- This column lets the client badge the verdict as "AI unavailable — retry
-- for a real review" so the learner has a recovery path.
--
-- Idempotent: `IF NOT EXISTS` on the ADD COLUMN.

ALTER TABLE "lab_attempts"
    ADD COLUMN IF NOT EXISTS "usedFallback" BOOLEAN NOT NULL DEFAULT false;

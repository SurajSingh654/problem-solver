-- Add a 1-5 self-rated readiness field captured before each mock interview.
-- Used by the debrief to surface a calibration gap (predicted vs actual).
-- Additive nullable column — safe on prod data; no backfill needed.

ALTER TABLE "interview_sessions" ADD COLUMN "preSessionConfidence" INTEGER;

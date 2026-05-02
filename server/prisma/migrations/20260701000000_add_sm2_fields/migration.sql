-- Add SM-2 spaced repetition fields to solutions table
-- Safe to run on existing data — all columns have defaults
ALTER TABLE "solutions"
ADD COLUMN IF NOT EXISTS "sm2EasinessFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
ADD COLUMN IF NOT EXISTS "sm2Interval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "sm2Repetitions" INTEGER NOT NULL DEFAULT 0;
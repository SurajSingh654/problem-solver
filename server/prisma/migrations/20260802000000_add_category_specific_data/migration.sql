-- Add categorySpecificData column to solutions table
-- Safe to run on existing data — nullable, defaults to NULL
ALTER TABLE "solutions" ADD COLUMN IF NOT EXISTS "categorySpecificData" JSONB;
-- Add LOW_LEVEL_DESIGN to ProblemCategory enum
-- PostgreSQL requires adding enum values before using them
-- This is safe to run on existing data — no existing rows use this value

ALTER TYPE "ProblemCategory" ADD VALUE IF NOT EXISTS 'LOW_LEVEL_DESIGN';
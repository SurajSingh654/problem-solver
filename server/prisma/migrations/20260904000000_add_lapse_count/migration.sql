-- Add lapseCount to solutions: cumulative count of failed recalls
-- (SM-2 quality < 3). Distinct from sm2Repetitions, which resets on each
-- failure. Items with lapseCount >= 8 are "leeches" (Anki convention) —
-- they warrant targeted attention beyond the normal review queue.

ALTER TABLE "solutions"
  ADD COLUMN "lapseCount" INTEGER NOT NULL DEFAULT 0;

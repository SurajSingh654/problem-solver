-- ============================================================================
-- Lab Walkthrough — AI-narrated per-dimension comparison at reveal time
-- ============================================================================
--
-- Replaces the current "user Monaco DiffEditor vs single reference" reveal
-- artifact with an AI-generated prose walkthrough (`CODE_WALKTHROUGH`
-- validator). Trigger: revealReference dispatches an async task through the
-- existing per-team semaphore; writes result to LabAttempt.walkthrough on
-- completion. Idempotent per attempt.
--
-- 4-role review (2026-07-11) surfaced these design commitments encoded here:
--   - `walkthroughViewedAt`   — D10 signal (did the learner actually read it?)
--   - `walkthroughInputHash`  — SHA-256 of {taskMarkdown, referenceSolution}
--                                at generation time; on view we compare to the
--                                current lab's hash and badge "based on
--                                earlier version" if drifted (TEAM_ADMIN
--                                edited the source post-publish).
--   - `walkthroughType`       — forward-compat for Phase 2 HLD design-rubric.
--                                Adding it NOW is one migration; adding it
--                                later is a data migration + backfill.
--   - `walkthroughUsedFallback` — mirrors the Phase-A `usedFallback` boolean
--                                on the same table (see 20260710100000).
--
-- Rollback: DROP the four columns, DROP TYPE "WalkthroughStatus".
--   ALTER TABLE "lab_attempts" DROP COLUMN "walkthrough", DROP COLUMN
--     "walkthroughStatus", DROP COLUMN "walkthroughUsedFallback",
--     DROP COLUMN "walkthroughAt", DROP COLUMN "walkthroughViewedAt",
--     DROP COLUMN "walkthroughInputHash", DROP COLUMN "walkthroughType";
--   DROP TYPE "WalkthroughStatus";
-- ============================================================================

CREATE TYPE "WalkthroughStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'COMPLETED', 'ERROR');

ALTER TABLE "lab_attempts"
    ADD COLUMN IF NOT EXISTS "walkthrough"              JSONB,
    ADD COLUMN IF NOT EXISTS "walkthroughStatus"        "WalkthroughStatus" NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS "walkthroughUsedFallback"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "walkthroughAt"            TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "walkthroughViewedAt"      TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "walkthroughInputHash"     TEXT,
    ADD COLUMN IF NOT EXISTS "walkthroughType"          TEXT NOT NULL DEFAULT 'CODE';

-- Partial index for the atomic dispatch guard used by revealReference:
--   updateMany({ where: { id, walkthroughStatus: 'NOT_STARTED' }, ... })
-- Filters to rows still waiting for their first dispatch; keeps the index
-- small and the guard cheap.
CREATE INDEX IF NOT EXISTS "lab_attempts_walkthrough_not_started_idx"
    ON "lab_attempts" ("id")
    WHERE "walkthroughStatus" = 'NOT_STARTED';

-- Adds the Design Studio ↔ AI Interviewer link.
--
-- Design Studio gains a `mode` enum (SELF_PACED default, INTERVIEW for the
-- new pressured-mode). InterviewSession gains a nullable designSessionId
-- pointing back to the paired DesignSession when the interviewer is
-- running against a live design canvas.
--
-- See model comments in schema.prisma for full rationale.

CREATE TYPE "DesignSessionMode" AS ENUM ('SELF_PACED', 'INTERVIEW');

ALTER TABLE "design_sessions"
  ADD COLUMN "mode" "DesignSessionMode" NOT NULL DEFAULT 'SELF_PACED';

ALTER TABLE "interview_sessions"
  ADD COLUMN "designSessionId" TEXT;

ALTER TABLE "interview_sessions"
  ADD CONSTRAINT "interview_sessions_designSessionId_fkey"
  FOREIGN KEY ("designSessionId") REFERENCES "design_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- "Find the paired interview for this design session"
CREATE INDEX "interview_sessions_designSessionId_idx"
  ON "interview_sessions"("designSessionId");

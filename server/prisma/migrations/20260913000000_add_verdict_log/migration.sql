-- Audit log for AI-generated readiness verdicts.
--
-- Three roles:
--   1. 5-minute input-hash cache → avoids re-calling the LLM for the
--      same evidence block (cost + latency).
--   2. Validation audit — usedFallback=true when the LLM violated one
--      of the 7 hard anti-hallucination rules and we substituted the
--      deterministic template. The fallback rate is a prompt-health
--      signal we expect to monitor.
--   3. Calibration ground truth (future). Interview-outcome columns
--      stay null until the interview-pipeline-tracker feature back-fills
--      them. That enables: "of verdicts that claimed FAANG Ready, how
--      many users actually passed a FAANG loop?"

CREATE TABLE "verdict_logs" (
  "id"               TEXT         NOT NULL,
  "userId"           TEXT         NOT NULL,
  "teamId"           TEXT         NOT NULL,
  "inputHash"        TEXT         NOT NULL,
  "inputPayload"     JSONB        NOT NULL,
  "verdictJson"      JSONB        NOT NULL,
  "usedFallback"     BOOLEAN      NOT NULL DEFAULT false,
  "interviewOutcome" TEXT,
  "interviewCompany" TEXT,
  "interviewDate"    TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "verdict_logs_pkey" PRIMARY KEY ("id")
);

-- Latest-verdict-for-user lookup (dashboard badge, verdict history UI)
CREATE INDEX "verdict_logs_userId_teamId_createdAt_idx"
  ON "verdict_logs"("userId", "teamId", "createdAt" DESC);

-- Cache lookup by input hash: "is there a recent verdict for this exact
-- evidence?" Hit → reuse; miss → call the LLM.
CREATE INDEX "verdict_logs_userId_teamId_inputHash_idx"
  ON "verdict_logs"("userId", "teamId", "inputHash");

ALTER TABLE "verdict_logs"
  ADD CONSTRAINT "verdict_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "verdict_logs"
  ADD CONSTRAINT "verdict_logs_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

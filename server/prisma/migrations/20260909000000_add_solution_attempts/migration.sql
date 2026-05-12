-- Per-submission/per-edit snapshot of Solution content. The Solution row
-- holds latest state; these rows are the immutable history. Backfill creates
-- one SUBMIT attempt per existing Solution so historical rows get a #1
-- and the "attemptCount" that the client sees is never zero for a solved
-- problem.

CREATE TYPE "AttemptTrigger" AS ENUM ('SUBMIT', 'EDIT', 'DESIGN_BRIDGE');

CREATE TABLE "solution_attempts" (
  "id"                   TEXT             NOT NULL,
  "solutionId"           TEXT             NOT NULL,
  "attemptNumber"        INTEGER          NOT NULL,
  "trigger"              "AttemptTrigger" NOT NULL,
  "approach"             TEXT,
  "code"                 TEXT,
  "language"             TEXT,
  "bruteForce"           TEXT,
  "optimizedApproach"    TEXT,
  "timeComplexity"       TEXT,
  "spaceComplexity"      TEXT,
  "keyInsight"           TEXT,
  "feynmanExplanation"   TEXT,
  "realWorldConnection"  TEXT,
  "confidence"           INTEGER          NOT NULL,
  "patterns"             TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
  "categorySpecificData" JSONB,
  "problemVersion"       INTEGER,
  "aiFeedbackSnapshot"   JSONB,
  "createdAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "solution_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "solution_attempts_solutionId_attemptNumber_key"
  ON "solution_attempts"("solutionId", "attemptNumber");

CREATE INDEX "solution_attempts_solutionId_createdAt_idx"
  ON "solution_attempts"("solutionId", "createdAt" DESC);

ALTER TABLE "solution_attempts"
  ADD CONSTRAINT "solution_attempts_solutionId_fkey"
  FOREIGN KEY ("solutionId") REFERENCES "solutions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: each existing Solution becomes its own attempt #1, trigger=SUBMIT.
-- We use 's_att_' prefix + solution id for deterministic, collision-free ids
-- without needing a CUID generator in SQL.
INSERT INTO "solution_attempts" (
  "id", "solutionId", "attemptNumber", "trigger",
  "approach", "code", "language",
  "bruteForce", "optimizedApproach", "timeComplexity", "spaceComplexity",
  "keyInsight", "feynmanExplanation", "realWorldConnection",
  "confidence", "patterns", "categorySpecificData",
  "problemVersion", "aiFeedbackSnapshot", "createdAt"
)
SELECT
  's_att_' || s."id",
  s."id",
  1,
  'SUBMIT',
  s."approach", s."code", s."language",
  s."bruteForce", s."optimizedApproach", s."timeComplexity", s."spaceComplexity",
  s."keyInsight", s."feynmanExplanation", s."realWorldConnection",
  s."confidence", s."patterns", s."categorySpecificData",
  s."problemVersion", s."aiFeedback", s."createdAt"
FROM "solutions" s;

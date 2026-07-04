-- Curriculum Phase 1: Lab, LabAttempt, ConceptCheckIn team-scoped models.

CREATE TABLE "labs" (
  "id"                  TEXT NOT NULL,
  "conceptId"           TEXT NOT NULL,
  "teamId"              TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "taskMarkdown"        TEXT NOT NULL,
  "timeboxMinutes"      INTEGER,
  "language"            "LabLanguage" NOT NULL DEFAULT 'JAVA',
  "starterCode"         TEXT,
  "referenceSolution"   TEXT NOT NULL,
  "expectedArtifacts"   JSONB NOT NULL DEFAULT '[]',
  "status"              "LessonStatus" NOT NULL DEFAULT 'DRAFT',
  "sortOrder"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "labs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "labs_conceptId_key" ON "labs"("conceptId");
CREATE INDEX "labs_teamId_status_idx" ON "labs"("teamId", "status");

ALTER TABLE "labs"
  ADD CONSTRAINT "labs_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "labs"
  ADD CONSTRAINT "labs_teamId_fkey"    FOREIGN KEY ("teamId")    REFERENCES "teams"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "lab_attempts" (
  "id"                    TEXT NOT NULL,
  "labId"                 TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "attemptNumber"         INTEGER NOT NULL,
  "code"                  TEXT NOT NULL,
  "submittedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"            TIMESTAMP(3),
  "reviewStatus"          "LabAttemptReviewStatus" NOT NULL DEFAULT 'PENDING',
  "codeReviewVerdict"     "CodeReviewVerdict",
  "codeReview"            JSONB,
  "revealedReferenceAt"   TIMESTAMP(3),
  CONSTRAINT "lab_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_attempts_userId_labId_attemptNumber_key" ON "lab_attempts"("userId", "labId", "attemptNumber");
CREATE INDEX "lab_attempts_userId_labId_submittedAt_idx" ON "lab_attempts"("userId", "labId", "submittedAt");

ALTER TABLE "lab_attempts"
  ADD CONSTRAINT "lab_attempts_labId_fkey"  FOREIGN KEY ("labId")  REFERENCES "labs"("id")  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_attempts"
  ADD CONSTRAINT "lab_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "concept_check_ins" (
  "id"                TEXT NOT NULL,
  "conceptId"         TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "attemptNumber"     INTEGER NOT NULL,
  "recallAnswer"      TEXT NOT NULL,
  "applyAnswer"       TEXT NOT NULL,
  "buildAnswer"       TEXT NOT NULL,
  "preConfidence"     INTEGER NOT NULL,
  "aiVerdict"         "CheckInVerdict" NOT NULL,
  "aiFeedback"        JSONB NOT NULL,
  "calibrationDelta"  DOUBLE PRECISION NOT NULL,
  "completedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "concept_check_ins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "concept_check_ins_userId_conceptId_attemptNumber_key" ON "concept_check_ins"("userId", "conceptId", "attemptNumber");
CREATE INDEX "concept_check_ins_userId_conceptId_completedAt_idx" ON "concept_check_ins"("userId", "conceptId", "completedAt");

ALTER TABLE "concept_check_ins"
  ADD CONSTRAINT "concept_check_ins_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "concept_check_ins"
  ADD CONSTRAINT "concept_check_ins_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "users"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Migration: Add Skill Intelligence models
-- Creates skill_profiles, skill_assessments, assessment_responses tables
-- and adds isAssessmentOnly column to problems.
-- Also includes the ALTER TABLE operations that were originally in this
-- migration (DROP DEFAULT on updatedAt columns) for tables created here.
-- ============================================================================

-- CreateEnum
CREATE TYPE "SkillAssessmentStatus" AS ENUM ('IN_PROGRESS', 'PASSED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SkillProficiencyLevel" AS ENUM ('NOVICE', 'DEVELOPING', 'PROFICIENT', 'EXPERT', 'MASTERY');

-- AlterTable: Add isAssessmentOnly to problems
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "isAssessmentOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex for isAssessmentOnly
CREATE INDEX IF NOT EXISTS "problems_isAssessmentOnly_category_idx" ON "problems"("isAssessmentOnly", "category");

-- CreateTable: skill_profiles
CREATE TABLE "skill_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillCategory" TEXT NOT NULL,
    "rawScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decayedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proficiencyLevel" "SkillProficiencyLevel" NOT NULL DEFAULT 'NOVICE',
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedConfidence" TEXT,
    "lastEvidenceAt" TIMESTAMP(3),
    "trend" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "skill_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: skill_assessments
CREATE TABLE "skill_assessments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillCategory" TEXT NOT NULL,
    "status" "SkillAssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "accuracyScore" DOUBLE PRECISION,
    "accuracyPassed" BOOLEAN NOT NULL DEFAULT false,
    "timeScore" INTEGER,
    "timeBenchmark" INTEGER,
    "timePassed" BOOLEAN NOT NULL DEFAULT false,
    "explanationScore" DOUBLE PRECISION,
    "explanationPassed" BOOLEAN NOT NULL DEFAULT false,
    "overallScore" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "timeSpentSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "skill_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: assessment_responses
CREATE TABLE "assessment_responses" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "answer" TEXT,
    "isPassed" BOOLEAN NOT NULL DEFAULT false,
    "aiScore" DOUBLE PRECISION,
    "aiFeedback" TEXT,
    "timeSpentSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: skill_profiles
CREATE UNIQUE INDEX "skill_profiles_userId_skillId_key" ON "skill_profiles"("userId", "skillId");
CREATE INDEX "skill_profiles_userId_idx" ON "skill_profiles"("userId");
CREATE INDEX "skill_profiles_userId_skillCategory_idx" ON "skill_profiles"("userId", "skillCategory");
CREATE INDEX "skill_profiles_userId_isVerified_idx" ON "skill_profiles"("userId", "isVerified");
CREATE INDEX "skill_profiles_userId_decayedScore_idx" ON "skill_profiles"("userId", "decayedScore" DESC);

-- CreateIndex: skill_assessments
CREATE INDEX "skill_assessments_userId_idx" ON "skill_assessments"("userId");
CREATE INDEX "skill_assessments_userId_skillId_idx" ON "skill_assessments"("userId", "skillId");
CREATE INDEX "skill_assessments_userId_status_idx" ON "skill_assessments"("userId", "status");

-- CreateIndex: assessment_responses
CREATE INDEX "assessment_responses_assessmentId_idx" ON "assessment_responses"("assessmentId");

-- AddForeignKey: skill_profiles
ALTER TABLE "skill_profiles" ADD CONSTRAINT "skill_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: skill_assessments
ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: assessment_responses
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "skill_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
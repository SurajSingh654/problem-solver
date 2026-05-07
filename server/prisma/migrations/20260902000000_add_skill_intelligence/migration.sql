-- ============================================================================
-- Migration: Add Skill Intelligence Map + Assessment System
-- ============================================================================
--
-- New models:
--   SkillProfile       — computed skill proficiency per user, per skill
--   SkillAssessment    — tracks assessment session state and result
--   AssessmentResponse — individual responses within an assessment session
--
-- Modified models:
--   Problem — add isAssessmentOnly flag for locked assessment problem pool
--   User    — add relation to SkillProfile and SkillAssessment
--
-- Design decisions documented in schema.prisma comments.
-- ============================================================================
-- ── SkillAssessmentStatus enum ─────────────────────────────────────────────
CREATE TYPE "SkillAssessmentStatus" AS ENUM ('IN_PROGRESS', 'PASSED', 'FAILED', 'ABANDONED');

-- ── SkillProficiencyLevel enum ─────────────────────────────────────────────
-- Based on Dreyfus & Dreyfus (1980) skill acquisition model.
-- Not arbitrary tiers — each level has a specific behavioural definition.
CREATE TYPE "SkillProficiencyLevel" AS ENUM (
    'NOVICE',
    'DEVELOPING',
    'PROFICIENT',
    'EXPERT',
    'MASTERY'
);

-- ── SkillProfile table ─────────────────────────────────────────────────────
-- One row per user per skill.
-- Recomputed on: solution submission + AI review, quiz completion,
-- mock interview debrief, spaced repetition review.
CREATE TABLE
    "skill_profiles" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        -- The skill being tracked (string constant from skillTaxonomy.js)
        -- Examples: "dp", "graphs", "tcp-fundamentals", "star-behavioral"
        "skillId" TEXT NOT NULL,
        -- The skill category for grouping in the UI
        -- Examples: "Algorithms", "Computer Networking", "Behavioral"
        "skillCategory" TEXT NOT NULL,
        -- Raw evidence-weighted score before Ebbinghaus decay (0-100)
        -- Formula: (aiReviewScore × 0.50) + (sm2RetentionScore × 0.30) + (quizScore × 0.20)
        "rawScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
        -- Decayed score shown to user: rawScore × e^(-daysSinceEvidence / (stability × 10))
        "decayedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
        -- Dreyfus proficiency level derived from decayedScore thresholds:
        --   0-25: NOVICE, 26-50: DEVELOPING, 51-75: PROFICIENT,
        --   76-90: EXPERT, 91-100: MASTERY
        "proficiencyLevel" "SkillProficiencyLevel" NOT NULL DEFAULT 'NOVICE',
        -- Number of distinct evidence data points contributing to this score
        -- Low evidence count = low confidence in the score
        "evidenceCount" INT NOT NULL DEFAULT 0,
        -- Whether the user has passed a formal blind assessment for this skill
        -- This is the "definitely has this skill" claim
        "isVerified" BOOLEAN NOT NULL DEFAULT false,
        -- Confidence level of verification: HIGH (first attempt), MEDIUM (second attempt)
        "verifiedConfidence" TEXT, -- 'HIGH' | 'MEDIUM' | null
        -- Timestamp of the most recent evidence that contributed to this score
        "lastEvidenceAt" TIMESTAMP(3),
        -- Trend computed from last 5 evidence points: 'improving' | 'stable' | 'declining'
        "trend" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "skill_profiles_pkey" PRIMARY KEY ("id")
    );

-- One profile per user per skill
ALTER TABLE "skill_profiles" ADD CONSTRAINT "skill_profiles_userId_skillId_key" UNIQUE ("userId", "skillId");

ALTER TABLE "skill_profiles" ADD CONSTRAINT "skill_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "idx_skill_profiles_user" ON "skill_profiles" ("userId");

CREATE INDEX "idx_skill_profiles_user_category" ON "skill_profiles" ("userId", "skillCategory");

CREATE INDEX "idx_skill_profiles_verified" ON "skill_profiles" ("userId", "isVerified");

CREATE INDEX "idx_skill_profiles_score" ON "skill_profiles" ("userId", "decayedScore" DESC);

-- ── SkillAssessment table ──────────────────────────────────────────────────
-- One assessment session per user per skill per attempt.
-- A user can retake an assessment — each attempt is a separate row.
-- Only assessments with status PASSED contribute to isVerified on SkillProfile.
CREATE TABLE
    "skill_assessments" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        -- Which skill is being assessed
        "skillId" TEXT NOT NULL,
        "skillCategory" TEXT NOT NULL,
        -- Session state
        "status" "SkillAssessmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
        -- Attempt number for this user on this skill (1, 2, 3...)
        -- Determines confidence level on pass: attempt 1 = HIGH, 2+ = MEDIUM
        "attemptNumber" INT NOT NULL DEFAULT 1,
        -- The 3 pass gates — all must be true simultaneously for PASSED status
        -- Gate 1: accuracy >= 80% on application problems
        "accuracyScore" DOUBLE PRECISION, -- 0-100, set on completion
        "accuracyPassed" BOOLEAN NOT NULL DEFAULT false,
        -- Gate 2: time within 1.5x expert benchmark (seconds)
        "timeScore" INT, -- actual time taken in seconds
        "timeBenchmark" INT, -- expert benchmark in seconds
        "timePassed" BOOLEAN NOT NULL DEFAULT false,
        -- Gate 3: explanation quality >= 7/10 from AI review
        "explanationScore" DOUBLE PRECISION, -- 0-10, from AI review
        "explanationPassed" BOOLEAN NOT NULL DEFAULT false,
        -- Overall result — PASSED only when all three gates are true
        "overallScore" DOUBLE PRECISION, -- composite 0-100
        -- AI feedback on the assessment performance
        "aiFeedback" TEXT,
        -- Timing
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP(3),
        "timeSpentSeconds" INT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "skill_assessments_pkey" PRIMARY KEY ("id")
    );

ALTER TABLE "skill_assessments" ADD CONSTRAINT "skill_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_skill_assessments_user" ON "skill_assessments" ("userId");

CREATE INDEX "idx_skill_assessments_user_skill" ON "skill_assessments" ("userId", "skillId");

CREATE INDEX "idx_skill_assessments_status" ON "skill_assessments" ("userId", "status");

-- ── AssessmentResponse table ───────────────────────────────────────────────
-- Individual problem responses within an assessment session.
-- Separate from Solution model — assessment problems and responses
-- are isolated from the practice pool by design.
CREATE TABLE
    "assessment_responses" (
        "id" TEXT NOT NULL,
        "assessmentId" TEXT NOT NULL,
        -- The assessment problem being answered (Problem with isAssessmentOnly=true)
        "problemId" TEXT NOT NULL,
        -- Question type within the assessment
        -- 'recognition' = MCQ, 'application' = solve problem, 'explanation' = explain mechanism
        "questionType" TEXT NOT NULL,
        -- The user's answer (code, text, or selected option index)
        "answer" TEXT,
        -- Whether this response passed its individual criterion
        "isPassed" BOOLEAN NOT NULL DEFAULT false,
        -- AI evaluation of this specific response (1-10)
        "aiScore" DOUBLE PRECISION,
        "aiFeedback" TEXT,
        -- Time taken for this specific problem (seconds)
        "timeSpentSeconds" INT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id")
    );

ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "skill_assessments" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_assessment_responses_assessment" ON "assessment_responses" ("assessmentId");

-- ── Add isAssessmentOnly to Problem ───────────────────────────────────────
-- Problems with isAssessmentOnly=true are:
--   - Never shown in the regular practice pool
--   - Only shown during skill assessment sessions
--   - Created by SUPER_ADMIN only
--   - Cannot be solved via the regular SubmitSolutionPage
ALTER TABLE "problems"
ADD COLUMN "isAssessmentOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "idx_problems_assessment" ON "problems" ("isAssessmentOnly", "category");
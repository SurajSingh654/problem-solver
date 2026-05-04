-- ============================================================================
-- Migration: Add FeedbackReport model
-- Stores user-submitted bug reports, suggestions, and questions.
-- Triggers an email notification to the admin on every new submission.
-- ============================================================================
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'SUGGESTION', 'QUESTION');

CREATE TYPE "FeedbackStatus" AS ENUM (
    'OPEN',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'RESOLVED',
    'WONT_FIX'
);

CREATE TYPE "FeedbackSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE
    "feedback_reports" (
        "id" TEXT NOT NULL,
        "type" "FeedbackType" NOT NULL DEFAULT 'BUG',
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "severity" "FeedbackSeverity" NOT NULL DEFAULT 'MEDIUM',
        "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
        -- Which page/feature was affected
        "affectedArea" TEXT,
        -- Steps to reproduce (for bugs)
        "stepsToReproduce" TEXT,
        -- Admin response/notes
        "adminNote" TEXT,
        -- Who submitted
        "userId" TEXT NOT NULL,
        -- Team context at time of submission (nullable — works for personal mode too)
        "teamId" TEXT,
        -- Timestamps
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "resolvedAt" TIMESTAMP(3),
        CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
    );

-- FK constraints
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
-- Admin inbox: all open reports sorted by severity + date
CREATE INDEX "idx_feedback_status_created" ON "feedback_reports" ("status", "createdAt" DESC);

-- Per-user history
CREATE INDEX "idx_feedback_user" ON "feedback_reports" ("userId", "createdAt" DESC);

-- Per-team reports (for team admins)
CREATE INDEX "idx_feedback_team" ON "feedback_reports" ("teamId", "createdAt" DESC);
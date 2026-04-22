-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPER_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('TEAM_ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProblemSource" AS ENUM ('MANUAL', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "ProblemCategory" AS ENUM ('CODING', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'CS_FUNDAMENTALS', 'HR', 'SQL');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DORMANT');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER',
    "currentTeamId" TEXT,
    "teamRole" "TeamRole",
    "personalTeamId" TEXT,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationCode" TEXT,
    "verificationExpiry" TIMESTAMP(3),
    "resetCode" TEXT,
    "resetExpiry" TIMESTAMP(3),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "pendingEmail" TEXT,
    "emailChangeCode" TEXT,
    "emailChangeExpiry" TIMESTAMP(3),
    "targetCompany" TEXT,
    "interviewDate" TIMESTAMP(3),
    "preferredLanguage" TEXT,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastSolvedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "activityStatus" "ActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "aiProblemConfig" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "status" "TeamStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "joinCode" TEXT,
    "createdById" TEXT NOT NULL,
    "maxMembers" INTEGER NOT NULL DEFAULT 20,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "aiProblemsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiProblemConfig" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "category" "ProblemCategory" NOT NULL DEFAULT 'CODING',
    "categoryData" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "realWorldContext" TEXT,
    "useCases" TEXT,
    "adminNotes" TEXT,
    "source" "ProblemSource" NOT NULL DEFAULT 'MANUAL',
    "teamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_questions" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "hint" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_up_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solutions" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "approach" TEXT,
    "code" TEXT,
    "language" TEXT,
    "bruteForce" TEXT,
    "optimizedApproach" TEXT,
    "timeComplexity" TEXT,
    "spaceComplexity" TEXT,
    "keyInsight" TEXT,
    "feynmanExplanation" TEXT,
    "realWorldConnection" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 3,
    "pattern" TEXT,
    "patternIdentificationTime" INTEGER,
    "aiFeedback" JSONB,
    "reviewDates" JSONB,
    "nextReviewDate" TIMESTAMP(3),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarity_ratings" (
    "id" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clarity_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "score" INTEGER,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,
    "timeSpent" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "subject" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "score" INTEGER,
    "aiAnalysis" JSONB,
    "timeSpent" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "problemId" TEXT,
    "category" "ProblemCategory" NOT NULL DEFAULT 'CODING',
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "interviewStyle" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "phases" JSONB,
    "workspace" JSONB,
    "debrief" JSONB,
    "scores" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "workspaceSnapshot" JSONB,
    "phase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "problems" JSONB NOT NULL,
    "maxParticipants" INTEGER,
    "rules" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_entries" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "submissions" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_personalTeamId_key" ON "users"("personalTeamId");

-- CreateIndex
CREATE INDEX "users_currentTeamId_activityStatus_idx" ON "users"("currentTeamId", "activityStatus");

-- CreateIndex
CREATE INDEX "users_currentTeamId_streak_idx" ON "users"("currentTeamId", "streak");

-- CreateIndex
CREATE INDEX "users_activityStatus_lastActiveAt_idx" ON "users"("activityStatus", "lastActiveAt");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "users_email_deletedAt_idx" ON "users"("email", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "teams_joinCode_key" ON "teams"("joinCode");

-- CreateIndex
CREATE INDEX "teams_status_createdAt_idx" ON "teams"("status", "createdAt");

-- CreateIndex
CREATE INDEX "teams_isPersonal_status_idx" ON "teams"("isPersonal", "status");

-- CreateIndex
CREATE INDEX "teams_deletedAt_idx" ON "teams"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_token_key" ON "team_invitations"("token");

-- CreateIndex
CREATE INDEX "team_invitations_email_status_idx" ON "team_invitations"("email", "status");

-- CreateIndex
CREATE INDEX "team_invitations_teamId_status_idx" ON "team_invitations"("teamId", "status");

-- CreateIndex
CREATE INDEX "problems_teamId_category_difficulty_idx" ON "problems"("teamId", "category", "difficulty");

-- CreateIndex
CREATE INDEX "problems_teamId_isPublished_isHidden_idx" ON "problems"("teamId", "isPublished", "isHidden");

-- CreateIndex
CREATE INDEX "problems_teamId_isPinned_idx" ON "problems"("teamId", "isPinned");

-- CreateIndex
CREATE INDEX "problems_teamId_title_idx" ON "problems"("teamId", "title");

-- CreateIndex
CREATE INDEX "problems_teamId_source_isPublished_idx" ON "problems"("teamId", "source", "isPublished");

-- CreateIndex
CREATE INDEX "follow_up_questions_problemId_order_idx" ON "follow_up_questions"("problemId", "order");

-- CreateIndex
CREATE INDEX "solutions_teamId_problemId_idx" ON "solutions"("teamId", "problemId");

-- CreateIndex
CREATE INDEX "solutions_teamId_userId_idx" ON "solutions"("teamId", "userId");

-- CreateIndex
CREATE INDEX "solutions_teamId_userId_nextReviewDate_idx" ON "solutions"("teamId", "userId", "nextReviewDate");

-- CreateIndex
CREATE INDEX "solutions_teamId_userId_createdAt_idx" ON "solutions"("teamId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "solutions_userId_problemId_teamId_key" ON "solutions"("userId", "problemId", "teamId");

-- CreateIndex
CREATE INDEX "clarity_ratings_solutionId_idx" ON "clarity_ratings"("solutionId");

-- CreateIndex
CREATE INDEX "clarity_ratings_teamId_idx" ON "clarity_ratings"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "clarity_ratings_raterId_solutionId_key" ON "clarity_ratings"("raterId", "solutionId");

-- CreateIndex
CREATE INDEX "sim_sessions_teamId_userId_createdAt_idx" ON "sim_sessions"("teamId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "sim_sessions_teamId_completed_idx" ON "sim_sessions"("teamId", "completed");

-- CreateIndex
CREATE INDEX "quiz_attempts_userId_createdAt_idx" ON "quiz_attempts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "quiz_attempts_teamId_createdAt_idx" ON "quiz_attempts"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "interview_sessions_userId_createdAt_idx" ON "interview_sessions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "interview_sessions_teamId_createdAt_idx" ON "interview_sessions"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "interview_sessions_status_createdAt_idx" ON "interview_sessions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "interview_messages_sessionId_createdAt_idx" ON "interview_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "competitions_status_startTime_idx" ON "competitions"("status", "startTime");

-- CreateIndex
CREATE INDEX "competition_entries_competitionId_score_idx" ON "competition_entries"("competitionId", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "competition_entries_userId_competitionId_key" ON "competition_entries"("userId", "competitionId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_currentTeamId_fkey" FOREIGN KEY ("currentTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personalTeamId_fkey" FOREIGN KEY ("personalTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_questions" ADD CONSTRAINT "follow_up_questions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarity_ratings" ADD CONSTRAINT "clarity_ratings_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "solutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarity_ratings" ADD CONSTRAINT "clarity_ratings_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarity_ratings" ADD CONSTRAINT "clarity_ratings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_sessions" ADD CONSTRAINT "sim_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_sessions" ADD CONSTRAINT "sim_sessions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_sessions" ADD CONSTRAINT "sim_sessions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

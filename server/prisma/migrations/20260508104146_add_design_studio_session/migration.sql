-- CreateEnum
CREATE TYPE "DesignType" AS ENUM ('SYSTEM_DESIGN', 'LOW_LEVEL_DESIGN');

-- CreateEnum
CREATE TYPE "DesignSessionStatus" AS ENUM ('IN_PROGRESS', 'VALIDATING', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "design_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "problemId" TEXT,
    "designType" "DesignType" NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "status" "DesignSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentPhase" INTEGER NOT NULL DEFAULT 0,
    "phases" JSONB,
    "diagramData" TEXT,
    "componentAnnotations" JSONB,
    "dataFlowDescription" TEXT,
    "scenarios" JSONB,
    "flowSimulation" JSONB,
    "scaleAnalysis" JSONB,
    "aiInteractions" JSONB,
    "evaluation" JSONB,
    "totalTimeSpent" INTEGER NOT NULL DEFAULT 0,
    "phaseTimings" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "design_sessions_userId_createdAt_idx" ON "design_sessions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "design_sessions_userId_problemId_createdAt_idx" ON "design_sessions"("userId", "problemId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "design_sessions_teamId_createdAt_idx" ON "design_sessions"("teamId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "design_sessions_status_createdAt_idx" ON "design_sessions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "design_sessions_userId_designType_createdAt_idx" ON "design_sessions"("userId", "designType", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "design_sessions" ADD CONSTRAINT "design_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_sessions" ADD CONSTRAINT "design_sessions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_sessions" ADD CONSTRAINT "design_sessions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "interview_sessions_v2" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT,
    "company" TEXT,
    "category" TEXT NOT NULL DEFAULT 'CODING',
    "duration" INTEGER NOT NULL DEFAULT 2700,
    "phases" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "workspace" TEXT NOT NULL DEFAULT '{}',
    "debrief" TEXT,
    "overallScore" INTEGER,
    "approachScore" INTEGER,
    "communicationScore" INTEGER,
    "codeQualityScore" INTEGER,
    "timeMgmtScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_sessions_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "toolArgs" TEXT,
    "toolResult" TEXT,
    "workspaceSnapshot" TEXT,
    "phase" TEXT,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "interview_sessions_v2" ADD CONSTRAINT "interview_sessions_v2_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions_v2" ADD CONSTRAINT "interview_sessions_v2_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions_v2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "interview_sessions_v2_userId_idx" ON "interview_sessions_v2"("userId");
CREATE INDEX "interview_sessions_v2_status_idx" ON "interview_sessions_v2"("status");
CREATE INDEX "interview_messages_sessionId_idx" ON "interview_messages"("sessionId");
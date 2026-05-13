-- CreateEnum
CREATE TYPE "TeachingStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TeachingFlagStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');

-- CreateTable
CREATE TABLE "teaching_sessions" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "description" TEXT,
    "externalMeetingLink" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "status" "TeachingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "notifiedStartingSoonAt" TIMESTAMP(3),
    "notifiedLiveNowAt" TIMESTAMP(3),
    "notes" TEXT,
    "summary" JSONB,
    "quiz" JSONB,
    "topicCoverage" JSONB,
    "aiGeneratedAt" TIMESTAMP(3),
    "flagCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_attendees" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "teaching_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_ratings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "peerLearned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_flags" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TeachingFlagStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teaching_sessions_teamId_status_scheduledAt_idx" ON "teaching_sessions"("teamId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "teaching_sessions_teamId_status_endedAt_idx" ON "teaching_sessions"("teamId", "status", "endedAt" DESC);

-- CreateIndex
CREATE INDEX "teaching_sessions_status_scheduledAt_idx" ON "teaching_sessions"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "teaching_sessions_hostId_status_scheduledAt_idx" ON "teaching_sessions"("hostId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "teaching_attendees_sessionId_idx" ON "teaching_attendees"("sessionId");

-- CreateIndex
CREATE INDEX "teaching_attendees_userId_idx" ON "teaching_attendees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_attendees_sessionId_userId_key" ON "teaching_attendees"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "teaching_ratings_sessionId_idx" ON "teaching_ratings"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_ratings_sessionId_raterId_key" ON "teaching_ratings"("sessionId", "raterId");

-- CreateIndex
CREATE INDEX "teaching_flags_status_createdAt_idx" ON "teaching_flags"("status", "createdAt");

-- CreateIndex
CREATE INDEX "teaching_flags_sessionId_idx" ON "teaching_flags"("sessionId");

-- AddForeignKey
ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_attendees" ADD CONSTRAINT "teaching_attendees_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "teaching_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_attendees" ADD CONSTRAINT "teaching_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_ratings" ADD CONSTRAINT "teaching_ratings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "teaching_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_ratings" ADD CONSTRAINT "teaching_ratings_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_flags" ADD CONSTRAINT "teaching_flags_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "teaching_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_flags" ADD CONSTRAINT "teaching_flags_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

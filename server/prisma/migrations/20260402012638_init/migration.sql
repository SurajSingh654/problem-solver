-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "avatarColor" TEXT NOT NULL DEFAULT '#7c6ff7',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDate" TIMESTAMP(3),
    "targetCompanies" TEXT NOT NULL DEFAULT '[]',
    "targetRole" TEXT,
    "targetDate" TIMESTAMP(3),
    "currentLevel" TEXT NOT NULL DEFAULT 'BEGINNER',
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "aiConversations" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "problems" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "companyTags" TEXT NOT NULL DEFAULT '[]',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlindChallenge" BOOLEAN NOT NULL DEFAULT false,
    "blindRevealAt" TIMESTAMP(3),
    "realWorldContext" TEXT,
    "useCases" TEXT NOT NULL DEFAULT '[]',
    "adminNotes" TEXT,
    "relatedProblems" TEXT NOT NULL DEFAULT '[]',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT NOT NULL,
    "aiHints" TEXT NOT NULL DEFAULT '[]',
    "aiRealWorldSuggestions" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "problems_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "follow_up_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "hint" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follow_up_questions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "solutions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patternIdentified" TEXT,
    "firstInstinct" TEXT,
    "whyThisPattern" TEXT,
    "timeToPatternSecs" INTEGER,
    "bruteForceApproach" TEXT,
    "bruteForceTime" TEXT,
    "bruteForceSpace" TEXT,
    "optimizedApproach" TEXT,
    "optimizedTime" TEXT,
    "optimizedSpace" TEXT,
    "predictedTime" TEXT,
    "predictedSpace" TEXT,
    "code" TEXT,
    "language" TEXT NOT NULL DEFAULT 'PYTHON',
    "keyInsight" TEXT,
    "feynmanExplanation" TEXT,
    "realWorldConnection" TEXT,
    "followUpAnswers" TEXT NOT NULL DEFAULT '[]',
    "confidenceLevel" INTEGER NOT NULL DEFAULT 0,
    "difficultyFelt" TEXT,
    "stuckPoints" TEXT,
    "hintsUsed" BOOLEAN NOT NULL DEFAULT false,
    "isInterviewMode" BOOLEAN NOT NULL DEFAULT false,
    "timeLimitSecs" INTEGER,
    "timeUsedSecs" INTEGER,
    "reviewDates" TEXT NOT NULL DEFAULT '[]',
    "aiFeedback" TEXT,
    "aiSuggestedImprovements" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "solutions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "solutions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clarity_ratings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solutionId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clarity_ratings_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "solutions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "clarity_ratings_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sim_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "simulatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeLimitSecs" INTEGER NOT NULL DEFAULT 2700,
    "timeUsedSecs" INTEGER,
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "hintUsedAtSecs" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "approachScore" INTEGER,
    "communicationScore" INTEGER,
    "overallScore" INTEGER,
    "whatWentWell" TEXT,
    "whatToImprove" TEXT,
    "aiDebriefNotes" TEXT,
    CONSTRAINT "sim_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "solutions_problemId_userId_key" ON "solutions"("problemId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "clarity_ratings_solutionId_fromUserId_key" ON "clarity_ratings"("solutionId", "fromUserId");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

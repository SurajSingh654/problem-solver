-- Drop old quiz tables if they exist from previous migration
DROP TABLE IF EXISTS "quiz_attempts";

DROP TABLE IF EXISTS "quiz_questions";

DROP TABLE IF EXISTS "quizzes";

-- CreateTable
CREATE TABLE
    "quiz_attempts" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "difficulty" TEXT NOT NULL,
        "questionCount" INTEGER NOT NULL,
        "score" INTEGER NOT NULL,
        "total" INTEGER NOT NULL,
        "percentage" DOUBLE PRECISION NOT NULL,
        "timeUsedSecs" INTEGER,
        "questions" TEXT NOT NULL DEFAULT '[]',
        "aiAnalysis" TEXT,
        "aiSuggestions" TEXT NOT NULL DEFAULT '[]',
        "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
    );

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
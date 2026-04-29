-- CreateTable: solution_follow_up_answers
CREATE TABLE "solution_follow_up_answers" (
    "id" TEXT NOT NULL,
    "solutionId" TEXT NOT NULL,
    "followUpQuestionId" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "aiScore" INTEGER,
    "aiFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solution_follow_up_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solution_follow_up_answers_solutionId_followUpQuestionId_key"
    ON "solution_follow_up_answers"("solutionId", "followUpQuestionId");

CREATE INDEX "solution_follow_up_answers_solutionId_idx"
    ON "solution_follow_up_answers"("solutionId");

CREATE INDEX "solution_follow_up_answers_followUpQuestionId_idx"
    ON "solution_follow_up_answers"("followUpQuestionId");

-- AddForeignKey
ALTER TABLE "solution_follow_up_answers"
    ADD CONSTRAINT "solution_follow_up_answers_solutionId_fkey"
    FOREIGN KEY ("solutionId") REFERENCES "solutions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "solution_follow_up_answers"
    ADD CONSTRAINT "solution_follow_up_answers_followUpQuestionId_fkey"
    FOREIGN KEY ("followUpQuestionId") REFERENCES "follow_up_questions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
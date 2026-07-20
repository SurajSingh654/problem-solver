-- CreateTable: ConceptQuestion
CREATE TABLE "concept_questions" (
    "id" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concept_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ConceptQuestionReply
CREATE TABLE "concept_question_replies" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concept_question_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "concept_questions_teamId_conceptId_createdAt_idx" ON "concept_questions"("teamId", "conceptId", "createdAt" DESC);
CREATE INDEX "concept_questions_userId_idx" ON "concept_questions"("userId");
CREATE INDEX "concept_question_replies_teamId_questionId_createdAt_idx" ON "concept_question_replies"("teamId", "questionId", "createdAt" ASC);
CREATE INDEX "concept_question_replies_userId_idx" ON "concept_question_replies"("userId");

-- AddForeignKey
ALTER TABLE "concept_questions" ADD CONSTRAINT "concept_questions_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "concept_questions" ADD CONSTRAINT "concept_questions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "concept_questions" ADD CONSTRAINT "concept_questions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "concept_question_replies" ADD CONSTRAINT "concept_question_replies_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "concept_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "concept_question_replies" ADD CONSTRAINT "concept_question_replies_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "concept_question_replies" ADD CONSTRAINT "concept_question_replies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

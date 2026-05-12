-- Per-review-event log. Each row is one retrieval-practice attempt on a
-- solution: what the user typed from memory before revealing the stored
-- answer, plus the 1-5 confidence they rated themselves on SM-2 quality.
--
-- Unlocks:
--   * AI review-hint generator seeing the user's actual attempt text
--     (previously the recall was client-state-only and discarded on save)
--   * Over-time analytics: "recall accuracy trend per problem"
--   * Leech detection grounded in real recall failures, not just
--     self-rated confidence

CREATE TABLE "review_attempts" (
  "id"         TEXT        NOT NULL,
  "solutionId" TEXT        NOT NULL,
  "recallText" TEXT,
  "confidence" INTEGER     NOT NULL,
  "quality"    INTEGER     NOT NULL,
  "recalled"   BOOLEAN     NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "review_attempts_pkey" PRIMARY KEY ("id")
);

-- Most-recent-first lookup: "latest recall for this solution"
-- Also serves the list query for recall-history surfaces.
CREATE INDEX "review_attempts_solutionId_createdAt_idx"
  ON "review_attempts"("solutionId", "createdAt" DESC);

ALTER TABLE "review_attempts"
  ADD CONSTRAINT "review_attempts_solutionId_fkey"
  FOREIGN KEY ("solutionId") REFERENCES "solutions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

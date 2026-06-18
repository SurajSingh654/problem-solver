ALTER TABLE "problems"
  ADD COLUMN "canonicalPattern"          TEXT,
  ADD COLUMN "canonicalKeyInsight"       TEXT,
  ADD COLUMN "canonicalTimeComplexity"   TEXT,
  ADD COLUMN "canonicalSpaceComplexity"  TEXT,
  ADD COLUMN "canonicalGeneratedAt"      TIMESTAMP(3),
  ADD COLUMN "canonicalEditedByUserId"   TEXT,
  ADD COLUMN "canonicalEditedAt"         TIMESTAMP(3);

ALTER TABLE "solutions"
  ADD COLUMN "lastCanonicalFetchAt"      TIMESTAMP(3);

ALTER TABLE "review_attempts"
  ADD COLUMN "peeked"                    BOOLEAN NOT NULL DEFAULT false;

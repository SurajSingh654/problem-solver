ALTER TABLE "problems"
  ADD COLUMN "canonicalAlternatives"    JSONB,
  ADD COLUMN "canonicalAltGeneratedAt"  TIMESTAMP(3);

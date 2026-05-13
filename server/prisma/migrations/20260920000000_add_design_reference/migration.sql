-- Curated worked-example architectures for design problems.
-- See DesignReference model in schema.prisma for rationale.

CREATE TABLE "design_references" (
  "id"                   TEXT         NOT NULL,
  "problemId"            TEXT         NOT NULL,
  "designType"           "DesignType" NOT NULL,
  "difficulty"           "Difficulty" NOT NULL,
  "variant"              TEXT         NOT NULL,
  "title"                TEXT         NOT NULL,
  "summary"              TEXT         NOT NULL,
  "phases"               JSONB        NOT NULL,
  "diagramData"          TEXT,
  "componentAnnotations" JSONB,
  "dataFlowDescription"  TEXT,
  "tradeoffs"            JSONB        NOT NULL,
  "sources"              JSONB        NOT NULL,
  "authorId"             TEXT,
  "version"              INTEGER      NOT NULL DEFAULT 1,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "design_references_pkey" PRIMARY KEY ("id")
);

-- Lookup "references for this problem of this design type"
CREATE INDEX "design_references_problemId_designType_idx"
  ON "design_references"("problemId", "designType");

-- One variant per problem. Prevents accidental dupes from admin retry.
CREATE UNIQUE INDEX "design_references_problemId_variant_key"
  ON "design_references"("problemId", "variant");

ALTER TABLE "design_references"
  ADD CONSTRAINT "design_references_problemId_fkey"
  FOREIGN KEY ("problemId") REFERENCES "problems"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull on user deletion so seeded references and curator-authored
-- references survive the curator leaving the platform.
ALTER TABLE "design_references"
  ADD CONSTRAINT "design_references_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

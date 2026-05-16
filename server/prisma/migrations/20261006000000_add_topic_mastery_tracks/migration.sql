-- Topic Mastery Tracks v1 — schema scaffolding for the AI-mentor feature.
-- 4 tables (Topic, Concept, ConceptDependency, TopicEnrollment, ConceptMastery)
-- + 3 enums (ConceptStatus, TopicCategory, EnrollmentStatus). All additive.
--
-- ANTI-HALLUCINATION SAFETY GATE: status enum is the architectural defense.
-- User-facing endpoints filter to PUBLISHED. DRAFT content is admin-only
-- until reviewed and published. This is enforced at the API layer (next
-- commit) but the column lives here.

CREATE TYPE "ConceptStatus" AS ENUM ('DRAFT', 'REVIEWED', 'PUBLISHED');

CREATE TYPE "TopicCategory" AS ENUM (
  'SYSTEM_DESIGN',
  'LOW_LEVEL_DESIGN',
  'DBMS',
  'OS',
  'NETWORKS',
  'DSA',
  'BEHAVIORAL',
  'HR',
  'CS_FUNDAMENTALS'
);

CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- ── Topics ────────────────────────────────────────────────────────────
CREATE TABLE "topics" (
  "id"                      TEXT            NOT NULL PRIMARY KEY,
  "slug"                    TEXT            NOT NULL UNIQUE,
  "name"                    TEXT            NOT NULL,
  "description"             TEXT            NOT NULL,
  "category"                "TopicCategory" NOT NULL,
  "status"                  "ConceptStatus" NOT NULL DEFAULT 'DRAFT',
  "mockInterviewCategory"   TEXT,
  "estimatedHoursToMastery" INTEGER,
  "createdAt"               TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3)    NOT NULL,
  "publishedAt"             TIMESTAMP(3)
);

CREATE INDEX "topics_status_category_idx" ON "topics" ("status", "category");

-- ── Concepts ──────────────────────────────────────────────────────────
CREATE TABLE "concepts" (
  "id"                 TEXT            NOT NULL PRIMARY KEY,
  "topicId"            TEXT            NOT NULL,
  "slug"               TEXT            NOT NULL,
  "name"               TEXT            NOT NULL,
  "order"              INTEGER         NOT NULL,
  "status"             "ConceptStatus" NOT NULL DEFAULT 'DRAFT',
  "primerMarkdown"     TEXT            NOT NULL,
  "workedExample"      TEXT,
  "canonicalSources"   JSONB           NOT NULL DEFAULT '[]'::jsonb,
  "expectedQuestions"  JSONB           NOT NULL DEFAULT '[]'::jsonb,
  "assessmentCriteria" JSONB           NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)    NOT NULL,
  "reviewedAt"         TIMESTAMP(3),
  "publishedAt"        TIMESTAMP(3),

  CONSTRAINT "concepts_topicId_fkey" FOREIGN KEY ("topicId")
    REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "concepts_topicId_slug_key" ON "concepts" ("topicId", "slug");
CREATE INDEX "concepts_topicId_status_order_idx" ON "concepts" ("topicId", "status", "order");

-- ── Concept dependencies (directed graph) ─────────────────────────────
CREATE TABLE "concept_dependencies" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "conceptId" TEXT NOT NULL,
  "prereqId"  TEXT NOT NULL,

  CONSTRAINT "concept_dependencies_conceptId_fkey" FOREIGN KEY ("conceptId")
    REFERENCES "concepts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "concept_dependencies_prereqId_fkey" FOREIGN KEY ("prereqId")
    REFERENCES "concepts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "concept_dependencies_conceptId_prereqId_key"
  ON "concept_dependencies" ("conceptId", "prereqId");
CREATE INDEX "concept_dependencies_prereqId_idx"
  ON "concept_dependencies" ("prereqId");

-- ── Topic enrollments (per-user track state) ──────────────────────────
CREATE TABLE "topic_enrollments" (
  "id"           TEXT               NOT NULL PRIMARY KEY,
  "userId"       TEXT               NOT NULL,
  "topicId"      TEXT               NOT NULL,
  "preferences"  JSONB              NOT NULL,
  "calibration"  JSONB,
  "status"       "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt"    TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"  TIMESTAMP(3),
  "pausedAt"     TIMESTAMP(3),
  "lastActiveAt" TIMESTAMP(3),

  CONSTRAINT "topic_enrollments_userId_fkey"  FOREIGN KEY ("userId")
    REFERENCES "users"  ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "topic_enrollments_topicId_fkey" FOREIGN KEY ("topicId")
    REFERENCES "topics" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "topic_enrollments_userId_topicId_key"
  ON "topic_enrollments" ("userId", "topicId");
CREATE INDEX "topic_enrollments_userId_status_idx"  ON "topic_enrollments" ("userId", "status");
CREATE INDEX "topic_enrollments_topicId_status_idx" ON "topic_enrollments" ("topicId", "status");

-- ── Concept masteries (per-user, per-concept score + signal log) ──────
CREATE TABLE "concept_masteries" (
  "id"            TEXT         NOT NULL PRIMARY KEY,
  "userId"        TEXT         NOT NULL,
  "conceptId"     TEXT         NOT NULL,
  "score"         INTEGER,
  "signals"       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  "teachingReady" BOOLEAN      NOT NULL DEFAULT false,
  "nextReviewAt"  TIMESTAMP(3),
  "firstSeenAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "concept_masteries_userId_fkey"    FOREIGN KEY ("userId")
    REFERENCES "users"    ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "concept_masteries_conceptId_fkey" FOREIGN KEY ("conceptId")
    REFERENCES "concepts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "concept_masteries_userId_conceptId_key"
  ON "concept_masteries" ("userId", "conceptId");
CREATE INDEX "concept_masteries_userId_nextReviewAt_idx"
  ON "concept_masteries" ("userId", "nextReviewAt");
CREATE INDEX "concept_masteries_conceptId_idx" ON "concept_masteries" ("conceptId");

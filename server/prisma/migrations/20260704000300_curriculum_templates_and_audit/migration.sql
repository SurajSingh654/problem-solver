-- Curriculum Phase 1: template library (TopicTemplate/ConceptTemplate/LabTemplate) + audit logs +
-- team AI usage counter. Also closes the deferred forkedFromTemplateId FK from prior migration.

CREATE TABLE "topic_templates" (
  "id"                       TEXT NOT NULL,
  "slug"                     TEXT NOT NULL,
  "name"                     TEXT NOT NULL,
  "description"              TEXT NOT NULL,
  "category"                 "TopicCategory" NOT NULL,
  "estimatedHoursToMastery"  INTEGER,
  "cheatsheetHtml"           TEXT,
  "templateStatus"           "LessonStatus" NOT NULL DEFAULT 'DRAFT',
  "sourcePath"               TEXT NOT NULL,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "topic_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "topic_templates_slug_key" ON "topic_templates"("slug");

CREATE TABLE "concept_templates" (
  "id"                  TEXT NOT NULL,
  "topicTemplateId"     TEXT NOT NULL,
  "slug"                TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "order"               INTEGER NOT NULL,
  "primerMarkdown"      TEXT NOT NULL,
  "primerHtml"          TEXT,
  "workedExample"       TEXT,
  "canonicalSources"    JSONB NOT NULL DEFAULT '[]',
  "expectedQuestions"   JSONB NOT NULL DEFAULT '[]',
  "assessmentCriteria"  JSONB NOT NULL DEFAULT '{}',
  "readinessRubric"     JSONB,
  "cheatsheetMarkdown"  TEXT,
  "sourcePath"          TEXT NOT NULL,
  "templateStatus"      "LessonStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "concept_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "concept_templates_topicTemplateId_slug_key" ON "concept_templates"("topicTemplateId", "slug");
ALTER TABLE "concept_templates"
  ADD CONSTRAINT "concept_templates_topicTemplateId_fkey"
  FOREIGN KEY ("topicTemplateId") REFERENCES "topic_templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "lab_templates" (
  "id"                  TEXT NOT NULL,
  "conceptTemplateId"   TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "taskMarkdown"        TEXT NOT NULL,
  "timeboxMinutes"      INTEGER,
  "language"            "LabLanguage" NOT NULL DEFAULT 'JAVA',
  "starterCode"         TEXT,
  "referenceSolution"   TEXT NOT NULL,
  "expectedArtifacts"   JSONB NOT NULL DEFAULT '[]',
  "sourcePath"          TEXT NOT NULL,
  "templateStatus"      "LessonStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lab_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lab_templates_conceptTemplateId_key" ON "lab_templates"("conceptTemplateId");
ALTER TABLE "lab_templates"
  ADD CONSTRAINT "lab_templates_conceptTemplateId_fkey"
  FOREIGN KEY ("conceptTemplateId") REFERENCES "concept_templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Close the deferred FK from migration 20260704000100.
ALTER TABLE "topics"
  ADD CONSTRAINT "topics_forkedFromTemplateId_fkey"
  FOREIGN KEY ("forkedFromTemplateId") REFERENCES "topic_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "content_review_logs" (
  "id"             TEXT NOT NULL,
  "targetType"     "ContentReviewTargetType" NOT NULL,
  "targetId"       TEXT NOT NULL,
  "verdict"        TEXT NOT NULL,
  "body"           JSONB NOT NULL,
  "rawPrompt"      TEXT,
  "reviewerModel"  TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_review_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "content_review_logs_target_idx" ON "content_review_logs"("targetType", "targetId", "createdAt" DESC);

CREATE TABLE "curriculum_admin_audit_logs" (
  "id"            TEXT NOT NULL,
  "actorUserId"   TEXT NOT NULL,
  "actorRole"     TEXT NOT NULL,
  "targetTeamId"  TEXT NOT NULL,
  "action"        TEXT NOT NULL,
  "payload"       JSONB NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "curriculum_admin_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "curriculum_admin_audit_logs_actor_idx" ON "curriculum_admin_audit_logs"("actorUserId", "createdAt");
CREATE INDEX "curriculum_admin_audit_logs_team_idx" ON "curriculum_admin_audit_logs"("targetTeamId", "createdAt");
ALTER TABLE "curriculum_admin_audit_logs"
  ADD CONSTRAINT "curriculum_admin_audit_logs_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "team_ai_usage" (
  "id"      TEXT NOT NULL,
  "teamId"  TEXT NOT NULL,
  "date"    DATE NOT NULL,
  "count"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "team_ai_usage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "team_ai_usage_teamId_date_key" ON "team_ai_usage"("teamId", "date");
ALTER TABLE "team_ai_usage"
  ADD CONSTRAINT "team_ai_usage_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

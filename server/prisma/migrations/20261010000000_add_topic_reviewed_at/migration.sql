-- Adds reviewedAt to topics so the SuperAdmin "Mark Reviewed" transition
-- can persist an audit stamp. Concept already has this column; Topic was
-- missing it, which made updateTopicAdmin fail with an unknown-field error
-- whenever the controller's applyStatusStamps tried to write reviewedAt
-- during a DRAFT → REVIEWED transition.

ALTER TABLE "topics" ADD COLUMN "reviewedAt" TIMESTAMP(3);

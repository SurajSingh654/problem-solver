-- Curriculum · Learn+Teach — Phase 1 enums.
-- Prerequisite enums for Lab / LabAttempt / ConceptCheckIn / *Template /
-- ContentReviewLog models introduced in later Week 1 tasks. Extending
-- NoteEntityType with CONCEPT lets Notes link to a Concept target.

CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'REVIEWED', 'PUBLISHED');

CREATE TYPE "LabLanguage" AS ENUM ('JAVA');

CREATE TYPE "CodeReviewVerdict" AS ENUM ('STRONG', 'ADEQUATE', 'WEAK');

CREATE TYPE "CheckInVerdict" AS ENUM ('PASS', 'PARTIAL', 'FAIL');

CREATE TYPE "ContentReviewTargetType" AS ENUM ('TOPIC', 'CONCEPT', 'LAB');

CREATE TYPE "LabAttemptReviewStatus" AS ENUM ('PENDING', 'REVIEWING', 'COMPLETED', 'ERROR');

ALTER TYPE "NoteEntityType" ADD VALUE 'CONCEPT';

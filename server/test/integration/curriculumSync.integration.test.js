// Integration test: exercises the real Prisma client + Postgres roundtrip
// for curriculumSync. Every other test in the suite mocks Prisma; this file
// is the exception because we're specifically testing the compound-unique
// upsert + sanitize.service.js integration path, and mocking Prisma would
// hide the exact class of bugs (schema drift, unique-constraint violations)
// that this test is meant to catch.
//
// Slug prefix: `test_sync_` is used on every fixture slug (topic + concept +
// lab subdirectory) to isolate this test's writes from
// `curriculum.sync.integration.test.js` (which uses `simple-topic-endpoint`).
// Without the prefix, cleanup `startsWith: "simple-topic"` matched BOTH
// fixtures and produced intermittent parallel-worker flakes. See W3.T10.
//
// Run: cd server && npx vitest run test/integration/curriculumSync.integration.test.js
import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import prisma from "../../src/lib/prisma.js";
import { syncCurriculumTemplates } from "../../src/services/curriculumSync.service.js";

const FIXTURE_ROOT = path.resolve("test/fixtures/curriculum-sync");
const TOPIC_SLUG = "test_sync_simple-topic";
const CONCEPT_SLUG = "test_sync_01-first-concept";

// Cleanup includes both the current prefix AND the historical `simple-topic`
// prefix, so a machine with leftover rows from before this rename gets
// scrubbed on the first run after the fix.
async function cleanupTopicTemplates() {
  await prisma.topicTemplate.deleteMany({
    where: { slug: { startsWith: "test_sync_" } },
  });
  await prisma.topicTemplate.deleteMany({
    where: { slug: { in: ["simple-topic"] } },
  });
}

describe("curriculumSync.service — TopicTemplate", () => {
  beforeEach(async () => {
    await cleanupTopicTemplates();
  });

  it("upserts a TopicTemplate from topic.yml + description.md", async () => {
    const result = await syncCurriculumTemplates({ root: FIXTURE_ROOT, dryRun: false });
    expect(result.added.topics).toContain(TOPIC_SLUG);

    const row = await prisma.topicTemplate.findUnique({ where: { slug: TOPIC_SLUG } });
    expect(row).toBeTruthy();
    expect(row.name).toBe("Simple Topic (test fixture)");
    expect(row.category).toBe("LOW_LEVEL_DESIGN");
    expect(row.estimatedHoursToMastery).toBe(5);
    expect(row.description).toContain("test topic description");
    expect(row.sourcePath).toBe(TOPIC_SLUG);
  }, 15000);

  it("is idempotent — second run yields empty diff", async () => {
    await syncCurriculumTemplates({ root: FIXTURE_ROOT, dryRun: false });
    const second = await syncCurriculumTemplates({ root: FIXTURE_ROOT, dryRun: false });
    expect(second.added.topics).toHaveLength(0);
    expect(second.updated.topics).toHaveLength(0);
    expect(second.removed.topics).toHaveLength(0);
  }, 15000);

  it("dryRun does not write", async () => {
    const result = await syncCurriculumTemplates({ root: FIXTURE_ROOT, dryRun: true });
    expect(result.added.topics).toContain(TOPIC_SLUG);
    const row = await prisma.topicTemplate.findUnique({ where: { slug: TOPIC_SLUG } });
    expect(row).toBeNull();
  }, 15000);
});

describe("curriculumSync — ConceptTemplate", () => {
  beforeEach(async () => {
    await cleanupTopicTemplates();
  });

  it("syncs a ConceptTemplate from a frontmatter markdown file", async () => {
    await syncCurriculumTemplates({ root: FIXTURE_ROOT, dryRun: false });
    const topic = await prisma.topicTemplate.findUnique({ where: { slug: TOPIC_SLUG } });
    const concepts = await prisma.conceptTemplate.findMany({
      where: { topicTemplateId: topic.id },
      orderBy: { order: "asc" },
    });
    expect(concepts).toHaveLength(1);
    const c = concepts[0];
    expect(c.slug).toBe(CONCEPT_SLUG);
    expect(c.name).toBe("First Concept");
    expect(c.order).toBe(1);
    expect(c.primerMarkdown).toContain("Body content.");
    expect(c.workedExample).toContain("An example.");
    expect(c.primerHtml).toContain("<p>Body content.</p>");
    expect(c.expectedQuestions).toEqual(["What is X?"]);
    expect(c.readinessRubric.explainToJunior).toContain("60 seconds");
  }, 15000);
});

describe("curriculumSync — LabTemplate", () => {
  beforeEach(async () => {
    await cleanupTopicTemplates();
  });

  it("syncs a LabTemplate 1:1 with its Concept", async () => {
    await syncCurriculumTemplates({ root: FIXTURE_ROOT, dryRun: false });
    const concept = await prisma.conceptTemplate.findFirst({
      where: { slug: CONCEPT_SLUG },
      include: { lab: true },
    });
    expect(concept.lab).not.toBeNull();
    expect(concept.lab.title).toBe("Lab 01 — First Concept");
    expect(concept.lab.taskMarkdown).toContain("Build something small.");
    expect(concept.lab.expectedArtifacts).toEqual(["class Foo exists", "at least 1 test passes"]);
    expect(concept.lab.language).toBe("JAVA");
    expect(concept.lab.referenceSolution).toContain("// File: Main.java");
    expect(concept.lab.referenceSolution).toContain("public class Main");
    expect(concept.lab.timeboxMinutes).toBe(20);
  }, 15000);
});

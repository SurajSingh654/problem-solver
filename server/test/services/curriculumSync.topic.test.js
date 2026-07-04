import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import prisma from "../../src/lib/prisma.js";
import { syncCurriculumTemplates } from "../../src/services/curriculumSync.service.js";

const FIXTURE_ROOT = path.resolve("test/fixtures/curriculum-sync");

describe("curriculumSync.service — TopicTemplate", () => {
  beforeEach(async () => {
    await prisma.topicTemplate.deleteMany({ where: { slug: { startsWith: "simple-topic" } } });
  });

  it("upserts a TopicTemplate from topic.yml + description.md", async () => {
    const result = await syncCurriculumTemplates({ root: FIXTURE_ROOT, dryRun: false });
    expect(result.added.topics).toContain("simple-topic");

    const row = await prisma.topicTemplate.findUnique({ where: { slug: "simple-topic" } });
    expect(row).toBeTruthy();
    expect(row.name).toBe("Simple Topic (test fixture)");
    expect(row.category).toBe("LOW_LEVEL_DESIGN");
    expect(row.estimatedHoursToMastery).toBe(5);
    expect(row.description).toContain("test topic description");
    expect(row.sourcePath).toBe("simple-topic");
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
    expect(result.added.topics).toContain("simple-topic");
    const row = await prisma.topicTemplate.findUnique({ where: { slug: "simple-topic" } });
    expect(row).toBeNull();
  }, 15000);
});

describe("curriculumSync — ConceptTemplate", () => {
  beforeEach(async () => {
    await prisma.topicTemplate.deleteMany({ where: { slug: "simple-topic" } });
  });

  it("syncs a ConceptTemplate from a frontmatter markdown file", async () => {
    await syncCurriculumTemplates({ root: FIXTURE_ROOT, dryRun: false });
    const topic = await prisma.topicTemplate.findUnique({ where: { slug: "simple-topic" } });
    const concepts = await prisma.conceptTemplate.findMany({
      where: { topicTemplateId: topic.id },
      orderBy: { order: "asc" },
    });
    expect(concepts).toHaveLength(1);
    const c = concepts[0];
    expect(c.slug).toBe("01-first-concept");
    expect(c.name).toBe("First Concept");
    expect(c.order).toBe(1);
    expect(c.primerMarkdown).toContain("Body content.");
    expect(c.workedExample).toContain("An example.");
    expect(c.primerHtml).toContain("<p>Body content.</p>");
    expect(c.expectedQuestions).toEqual(["What is X?"]);
    expect(c.readinessRubric.explainToJunior).toContain("60 seconds");
  }, 15000);
});

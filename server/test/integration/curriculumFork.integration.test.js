// ============================================================================
// curriculumFork.service — end-to-end integration test (W3.T1)
// ============================================================================
//
// Exercises the real Prisma client + real Postgres roundtrip for
// forkTopicTemplate. Mocking Prisma would hide the exact class of bugs the
// service is meant to prevent — schema drift, unique-constraint violations,
// transaction atomicity across three tables.
//
// Fixtures:
//   - One test User (email prefix "test_fork_") that becomes the createdBy
//     for both test Teams. Password is a BCRYPT-shaped placeholder — it never
//     gets validated because we never sign in.
//   - Two test Teams (fixed IDs "test_fork_team_a", "test_fork_team_b") so
//     fork isolation between teams can be verified.
//   - One test TopicTemplate ("test_fork_template_1") with two ConceptTemplate
//     children and one LabTemplate grandchild (attached to the first concept
//     only — the second concept is deliberately lab-less to exercise the
//     "no lab" branch of the deep-clone loop).
//
// Cleanup:
//   Uses raw SQL DELETE for cleanup because the Prisma soft-delete middleware
//   (`src/lib/prisma.js`) rewrites `prisma.team.delete` / `prisma.user.delete`
//   to `UPDATE deletedAt = now()`. Soft-deleted rows keep unique constraints
//   occupied AND are filtered from subsequent findUnique lookups, so the next
//   run's upsert.create throws P2002. Raw DELETE bypasses both.
//
// Run: cd server && npx vitest run test/integration/curriculumFork.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../src/lib/prisma.js";
import {
  forkTopicTemplate,
  ForkDuplicateError,
  ForkTemplateNotFoundError,
} from "../../src/services/curriculum/curriculumFork.service.js";

const TEST_PREFIX = "test_fork_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const USER_ID = `${TEST_PREFIX}user_1`;
const USER_EMAIL = `${TEST_PREFIX}user@example.test`;
const TEMPLATE_SLUG = `${TEST_PREFIX}template_1`;

// Fully purge any leftover fixtures. Order matters — children first because
// FK constraints will otherwise block DELETE on the parent (Cascade only
// fires from Prisma's soft-delete UPDATE path, not from raw SQL DELETE
// unless we happen to hit the parent table with cascade rules — belt-and-
// suspenders explicit ordering here).
async function hardDeleteTestFixtures() {
  // Topic tree (Concept + Lab cascade via FK onDelete)
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  // Team memberships (in case any got created)
  await prisma.$executeRawUnsafe(
    `DELETE FROM "team_memberships" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  // Teams
  await prisma.$executeRawUnsafe(
    `DELETE FROM "teams" WHERE "id" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  // Template tree (Concept + Lab templates cascade via FK onDelete)
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_templates" WHERE "slug" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  // User last so it survives cascade from Team.createdById if a team lingered.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "id" = $1 OR "email" LIKE $2`,
    USER_ID,
    `${TEST_PREFIX}%`,
  );
}

beforeAll(async () => {
  await hardDeleteTestFixtures();

  // Seed the User (parent of Teams via createdById FK).
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: USER_EMAIL,
      // BCRYPT-shaped placeholder — never actually validated.
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "Fork Test User",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  // Seed the two teams.
  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "Fork Test Team A",
      status: "ACTIVE",
      createdById: USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "Fork Test Team B",
      status: "ACTIVE",
      createdById: USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  // Seed the TopicTemplate tree (two concepts, one lab on the first).
  await prisma.topicTemplate.create({
    data: {
      slug: TEMPLATE_SLUG,
      name: "Fork Test Template",
      description: "A test template for fork integration tests.",
      category: "LOW_LEVEL_DESIGN",
      estimatedHoursToMastery: 5,
      templateStatus: "PUBLISHED",
      sourcePath: TEMPLATE_SLUG,
      concepts: {
        create: [
          {
            slug: "01-first-concept",
            name: "First Concept",
            order: 1,
            primerMarkdown: "# First Concept\n\nBody content.",
            primerHtml: "<h1>First Concept</h1><p>Body content.</p>",
            workedExample: "An example.",
            canonicalSources: [{ title: "Ref A", type: "book" }],
            expectedQuestions: ["What is X?"],
            assessmentCriteria: {},
            readinessRubric: { explainToJunior: "60 seconds" },
            sourcePath: `${TEMPLATE_SLUG}/01-first-concept.md`,
            templateStatus: "PUBLISHED",
            lab: {
              create: {
                title: "Lab 01",
                taskMarkdown: "# Lab 01\n\nBuild something small.",
                timeboxMinutes: 20,
                language: "JAVA",
                referenceSolution: "// File: Main.java\npublic class Main {}",
                expectedArtifacts: ["class Foo exists"],
                sourcePath: `${TEMPLATE_SLUG}/labs/01-first-concept`,
                templateStatus: "PUBLISHED",
              },
            },
          },
          {
            slug: "02-second-concept",
            name: "Second Concept (no lab)",
            order: 2,
            primerMarkdown: "# Second Concept\n\nAnother body.",
            primerHtml: null,
            workedExample: null,
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            readinessRubric: null,
            sourcePath: `${TEMPLATE_SLUG}/02-second-concept.md`,
            templateStatus: "PUBLISHED",
            // No lab — exercises the "no lab" branch of the fork loop.
          },
        ],
      },
    },
  });
}, 30000);

afterAll(async () => {
  await hardDeleteTestFixtures();
}, 30000);

beforeEach(async () => {
  // Clean any Topic rows from prior test bodies — we keep the Team/User/
  // Template seed and just clean the forked output between tests.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
}, 30000);

// Per-test timeout: Railway Postgres round-trips can be slow — each test
// does 2-4 sequential queries plus a transaction with 3-5 inserts. 30s
// matches the pattern established in curriculum.rate-limit.team.integration.test.js.
const TEST_TIMEOUT_MS = 30000;

describe("forkTopicTemplate", () => {
  it("deep-clones template tree into team-scoped Topic + Concepts + Labs", async () => {
    const result = await forkTopicTemplate({ templateSlug: TEMPLATE_SLUG, teamId: TEAM_A_ID });

    expect(result.topicId).toBeTruthy();
    expect(result.conceptCount).toBe(2);
    expect(result.labCount).toBe(1);

    const topic = await prisma.topic.findUnique({
      where: { id: result.topicId },
      include: { concepts: { include: { lab: true } } },
    });
    expect(topic.slug).toBe(TEMPLATE_SLUG);
    expect(topic.teamId).toBe(TEAM_A_ID);
    expect(topic.status).toBe("DRAFT");
    expect(topic.forkedFromTemplateId).toBeTruthy();
    expect(topic.forkedAt).toBeTruthy();
    expect(topic.concepts).toHaveLength(2);

    // Team-scope invariant: Concept.teamId === Topic.teamId
    for (const c of topic.concepts) {
      expect(c.teamId).toBe(TEAM_A_ID);
      expect(c.status).toBe("DRAFT");
    }

    // Lab presence — first concept has one, second does not.
    const firstConcept = topic.concepts.find((c) => c.slug === "01-first-concept");
    expect(firstConcept.lab).toBeTruthy();
    expect(firstConcept.lab.teamId).toBe(TEAM_A_ID);
    expect(firstConcept.lab.status).toBe("DRAFT");
    expect(firstConcept.lab.language).toBe("JAVA");

    const secondConcept = topic.concepts.find((c) => c.slug === "02-second-concept");
    expect(secondConcept.lab).toBeNull();
  }, TEST_TIMEOUT_MS);

  it("assigns new IDs (not template IDs)", async () => {
    const template = await prisma.topicTemplate.findUnique({
      where: { slug: TEMPLATE_SLUG },
      include: { concepts: { include: { lab: true } } },
    });

    const result = await forkTopicTemplate({ templateSlug: TEMPLATE_SLUG, teamId: TEAM_A_ID });
    const topic = await prisma.topic.findUnique({
      where: { id: result.topicId },
      include: { concepts: { include: { lab: true } } },
    });

    expect(topic.id).not.toBe(template.id);
    for (const c of topic.concepts) {
      const tc = template.concepts.find((t) => t.slug === c.slug);
      expect(c.id).not.toBe(tc.id);
      if (c.lab && tc.lab) {
        expect(c.lab.id).not.toBe(tc.lab.id);
      }
    }
  }, TEST_TIMEOUT_MS);

  it("copies content fields deeply", async () => {
    const result = await forkTopicTemplate({ templateSlug: TEMPLATE_SLUG, teamId: TEAM_A_ID });
    const topic = await prisma.topic.findUnique({
      where: { id: result.topicId },
      include: { concepts: { include: { lab: true } } },
    });

    const firstConcept = topic.concepts.find((c) => c.slug === "01-first-concept");
    expect(firstConcept.primerMarkdown).toContain("Body content.");
    expect(firstConcept.primerHtml).toContain("<h1>First Concept</h1>");
    expect(firstConcept.workedExample).toBe("An example.");
    expect(firstConcept.expectedQuestions).toEqual(["What is X?"]);
    expect(firstConcept.readinessRubric?.explainToJunior).toBeTruthy();
    expect(firstConcept.lab.referenceSolution).toContain("public class Main");
    expect(firstConcept.lab.expectedArtifacts).toEqual(["class Foo exists"]);
  }, TEST_TIMEOUT_MS);

  it("throws ForkDuplicateError on second fork attempt", async () => {
    await forkTopicTemplate({ templateSlug: TEMPLATE_SLUG, teamId: TEAM_A_ID });
    await expect(
      forkTopicTemplate({ templateSlug: TEMPLATE_SLUG, teamId: TEAM_A_ID }),
    ).rejects.toBeInstanceOf(ForkDuplicateError);
  }, TEST_TIMEOUT_MS);

  it("allows different teams to fork the same template", async () => {
    const rA = await forkTopicTemplate({ templateSlug: TEMPLATE_SLUG, teamId: TEAM_A_ID });
    const rB = await forkTopicTemplate({ templateSlug: TEMPLATE_SLUG, teamId: TEAM_B_ID });

    expect(rA.topicId).not.toBe(rB.topicId);

    const topicA = await prisma.topic.findUnique({ where: { id: rA.topicId } });
    const topicB = await prisma.topic.findUnique({ where: { id: rB.topicId } });
    expect(topicA.teamId).toBe(TEAM_A_ID);
    expect(topicB.teamId).toBe(TEAM_B_ID);
  }, TEST_TIMEOUT_MS);

  it("throws ForkTemplateNotFoundError for unknown slug", async () => {
    await expect(
      forkTopicTemplate({
        templateSlug: `${TEST_PREFIX}nonexistent`,
        teamId: TEAM_A_ID,
      }),
    ).rejects.toBeInstanceOf(ForkTemplateNotFoundError);
  }, TEST_TIMEOUT_MS);

  it("preserves concept order", async () => {
    const result = await forkTopicTemplate({ templateSlug: TEMPLATE_SLUG, teamId: TEAM_A_ID });
    const concepts = await prisma.concept.findMany({
      where: { topicId: result.topicId },
      orderBy: { order: "asc" },
      select: { slug: true, order: true },
    });
    expect(concepts).toHaveLength(2);
    expect(concepts[0].slug).toBe("01-first-concept");
    expect(concepts[0].order).toBe(1);
    expect(concepts[1].slug).toBe("02-second-concept");
    expect(concepts[1].order).toBe(2);
  }, TEST_TIMEOUT_MS);
});

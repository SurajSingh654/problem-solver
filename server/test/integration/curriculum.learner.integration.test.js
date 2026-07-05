// ============================================================================
// curriculum learner routes — integration test (W4.T1)
// ============================================================================
//
// Exercises the full HTTP stack for the learner-facing curriculum surface:
//   authenticate → requireTeamContext → controller → real Prisma → Postgres.
//
// Fixtures (all prefixed with `test_w4t1_` for isolated cleanup):
//   - Two teams (A, B) so cross-team probes have somewhere to leak.
//   - Two users:
//       LEARNER_A_USER — regular MEMBER of Team A (the primary caller).
//       LEARNER_B_USER — regular MEMBER of Team B (cross-team probe).
//   - Per team we seed one PUBLISHED topic + one DRAFT topic + concept mix
//     so both status-gating cases fire.
//
// Cleanup uses raw SQL DELETE to bypass Prisma's soft-delete middleware and
// FK cascades — matches the pattern in curriculumAdmin.*.integration.test.js.
//
// Run: cd server && npx vitest run test/integration/curriculum.learner.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumRouter from "../../src/routes/curriculum.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

const TEST_PREFIX = "test_w4t1_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const LEARNER_A_USER_ID = `${TEST_PREFIX}learner_a`;
const LEARNER_B_USER_ID = `${TEST_PREFIX}learner_b`;

// Team A topic slugs
const A_PUB_TOPIC_SLUG = "a-published-topic";
const A_DRAFT_TOPIC_SLUG = "a-draft-topic";
// Team B topic slug (cross-team probe target)
const B_PUB_TOPIC_SLUG = "b-published-topic";

// Concept slugs
const A_PUB_CONCEPT_SLUG = "a-pub-concept";
const A_DRAFT_CONCEPT_SLUG = "a-draft-concept"; // draft under PUBLISHED topic
const A_CONCEPT_UNDER_DRAFT_TOPIC_SLUG = "a-concept-under-draft"; // published concept under DRAFT topic
const B_PUB_CONCEPT_SLUG = "b-pub-concept";

const TEST_TIMEOUT_MS = 60000;

let server;
let baseUrl;
let learnerAToken;
// Team A fixture Ids we hydrate in beforeAll for use inside tests.
let aPublishedTopicId;
let aDraftTopicId;
let aPublishedConceptId;
let aPublishedLabId;

async function hardDeleteTestFixtures() {
  // Order: labs → lab_attempts → concept_masteries → topic_enrollments →
  // concepts → topics → team_memberships → teams → users. The cascade
  // rules would handle most of this, but explicit deletes make failures
  // in one FK independent from another.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_USER_ID,
    LEARNER_B_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_USER_ID,
    LEARNER_B_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_USER_ID,
    LEARNER_B_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "team_memberships" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "teams" WHERE "id" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "email" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
}

beforeAll(async () => {
  await hardDeleteTestFixtures();

  // ── Users ──────────────────────────────────────────────────────
  await prisma.user.createMany({
    data: [
      {
        id: LEARNER_A_USER_ID,
        email: `${TEST_PREFIX}learner_a@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Learner A",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: LEARNER_B_USER_ID,
        email: `${TEST_PREFIX}learner_b@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Learner B",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  // ── Teams ──────────────────────────────────────────────────────
  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "Learner Team A",
      status: "ACTIVE",
      createdById: LEARNER_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "Learner Team B",
      status: "ACTIVE",
      createdById: LEARNER_B_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  // ── Memberships (MEMBER on both) ───────────────────────────────
  await prisma.teamMembership.createMany({
    data: [
      {
        userId: LEARNER_A_USER_ID,
        teamId: TEAM_A_ID,
        role: "MEMBER",
        isActive: true,
      },
      {
        userId: LEARNER_B_USER_ID,
        teamId: TEAM_B_ID,
        role: "MEMBER",
        isActive: true,
      },
    ],
  });

  // ── Team A: PUBLISHED topic + PUBLISHED concept + Lab + DRAFT concept ──
  const aPublishedTopic = await prisma.topic.create({
    data: {
      slug: A_PUB_TOPIC_SLUG,
      name: "A Published Topic",
      description: "Learner-visible.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_A_ID,
      concepts: {
        create: [
          {
            slug: A_PUB_CONCEPT_SLUG,
            name: "A Published Concept",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# A pub concept\nPrimer body.",
            primerHtml: "<h1>A pub concept</h1><p>Primer body.</p>",
            workedExample: "Worked example text.",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
            lab: {
              create: {
                title: "A Lab",
                taskMarkdown: "Build it.",
                language: "JAVA",
                starterCode: "// starter — MUST NOT leak to learner",
                referenceSolution:
                  "// solution — MUST NOT leak to learner",
                expectedArtifacts: [],
                status: "PUBLISHED",
                teamId: TEAM_A_ID,
              },
            },
          },
          {
            slug: A_DRAFT_CONCEPT_SLUG,
            name: "A Draft Concept",
            order: 2,
            status: "DRAFT", // hidden from learner even under published topic
            primerMarkdown: "# draft",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
          },
        ],
      },
    },
    include: { concepts: { include: { lab: true } } },
  });
  aPublishedTopicId = aPublishedTopic.id;
  const pubConcept = aPublishedTopic.concepts.find(
    (c) => c.slug === A_PUB_CONCEPT_SLUG,
  );
  aPublishedConceptId = pubConcept.id;
  aPublishedLabId = pubConcept.lab.id;

  // ── Team A: DRAFT topic with a PUBLISHED concept inside ────────
  // The concept is PUBLISHED but its parent topic is DRAFT — the learner
  // concept-detail endpoint must still 404 because we filter on the
  // parent topic's status too.
  const aDraftTopic = await prisma.topic.create({
    data: {
      slug: A_DRAFT_TOPIC_SLUG,
      name: "A Draft Topic",
      description: "Hidden.",
      category: "LOW_LEVEL_DESIGN",
      status: "DRAFT",
      teamId: TEAM_A_ID,
      concepts: {
        create: [
          {
            slug: A_CONCEPT_UNDER_DRAFT_TOPIC_SLUG,
            name: "Concept under DRAFT topic",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# hidden by parent",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
          },
        ],
      },
    },
  });
  aDraftTopicId = aDraftTopic.id;

  // ── Team B: PUBLISHED topic + concept (cross-team leakage probes) ──
  await prisma.topic.create({
    data: {
      slug: B_PUB_TOPIC_SLUG,
      name: "B Published Topic",
      description: "B-only.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_B_ID,
      concepts: {
        create: [
          {
            slug: B_PUB_CONCEPT_SLUG,
            name: "B Concept",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# b",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_B_ID,
          },
        ],
      },
    },
  });

  // ── HTTP harness ───────────────────────────────────────────────
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/curriculum", curriculumRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  learnerAToken = generateToken({
    id: LEARNER_A_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_A_ID,
    teamRole: "MEMBER",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

async function req(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, body: data };
}

describe("curriculum learner — auth gate", () => {
  it(
    "returns 401 when no token is provided",
    async () => {
      const { status } = await req("GET", "/api/v1/curriculum/topics");
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("GET /curriculum/topics", () => {
  it(
    "returns only PUBLISHED topics for the caller's team (no DRAFT, no cross-team)",
    async () => {
      const { status, body } = await req("GET", "/api/v1/curriculum/topics", {
        token: learnerAToken,
      });
      expect(status).toBe(200);
      const slugs = body.data.topics.map((t) => t.slug);
      expect(slugs).toContain(A_PUB_TOPIC_SLUG);
      expect(slugs).not.toContain(A_DRAFT_TOPIC_SLUG);
      expect(slugs).not.toContain(B_PUB_TOPIC_SLUG);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reflects the caller's enrollment state per topic",
    async () => {
      // Seed an enrollment directly so the list must surface it.
      await prisma.topicEnrollment.upsert({
        where: {
          userId_topicId: {
            userId: LEARNER_A_USER_ID,
            topicId: aPublishedTopicId,
          },
        },
        create: {
          userId: LEARNER_A_USER_ID,
          topicId: aPublishedTopicId,
          status: "ACTIVE",
          preferences: { targetOutcome: "INTERVIEW_PASS" },
        },
        update: { status: "ACTIVE" },
      });

      const { status, body } = await req("GET", "/api/v1/curriculum/topics", {
        token: learnerAToken,
      });
      expect(status).toBe(200);
      const t = body.data.topics.find((x) => x.slug === A_PUB_TOPIC_SLUG);
      expect(t.enrollment).not.toBeNull();
      expect(t.enrollment.status).toBe("ACTIVE");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("GET /curriculum/topics/:slug", () => {
  it(
    "returns PUBLISHED topic with only PUBLISHED concepts (DRAFT concept hidden)",
    async () => {
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/topics/${A_PUB_TOPIC_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(200);
      expect(body.data.topic.slug).toBe(A_PUB_TOPIC_SLUG);
      const conceptSlugs = body.data.topic.concepts.map((c) => c.slug);
      expect(conceptSlugs).toContain(A_PUB_CONCEPT_SLUG);
      expect(conceptSlugs).not.toContain(A_DRAFT_CONCEPT_SLUG);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 TOPIC_NOT_FOUND for a DRAFT topic",
    async () => {
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/topics/${A_DRAFT_TOPIC_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 TOPIC_NOT_FOUND when probing another team's topic",
    async () => {
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/topics/${B_PUB_TOPIC_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/topics/:slug/enroll", () => {
  it(
    "creates an ACTIVE enrollment on first call (201) and is idempotent on second call",
    async () => {
      // Wipe any residual enrollments from prior test cases.
      await prisma.$executeRawUnsafe(
        `DELETE FROM "topic_enrollments" WHERE "userId" = $1 AND "topicId" = $2`,
        LEARNER_A_USER_ID,
        aPublishedTopicId,
      );

      const first = await req(
        "POST",
        `/api/v1/curriculum/topics/${A_PUB_TOPIC_SLUG}/enroll`,
        {
          token: learnerAToken,
          body: { preferences: { targetOutcome: "TEACH_TO_TEAM" } },
        },
      );
      expect(first.status).toBe(201);
      expect(first.body.data.enrollment.status).toBe("ACTIVE");
      expect(first.body.data.enrollment.preferences.targetOutcome).toBe(
        "TEACH_TO_TEAM",
      );

      const firstId = first.body.data.enrollment.id;

      // Second call: same user + topic → upsert branch, same row.
      const second = await req(
        "POST",
        `/api/v1/curriculum/topics/${A_PUB_TOPIC_SLUG}/enroll`,
        {
          token: learnerAToken,
          body: { preferences: { targetOutcome: "INTERVIEW_PASS" } },
        },
      );
      expect(second.status).toBe(201);
      expect(second.body.data.enrollment.id).toBe(firstId);
      expect(second.body.data.enrollment.preferences.targetOutcome).toBe(
        "INTERVIEW_PASS",
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 when enrolling in a DRAFT topic",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/topics/${A_DRAFT_TOPIC_SLUG}/enroll`,
        { token: learnerAToken, body: {} },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 when enrolling in another team's topic",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/topics/${B_PUB_TOPIC_SLUG}/enroll`,
        { token: learnerAToken, body: {} },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("GET /curriculum/concepts/:slug", () => {
  it(
    "returns concept detail WITHOUT referenceSolution or starterCode",
    async () => {
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/concepts/${A_PUB_CONCEPT_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(200);
      expect(body.data.concept.slug).toBe(A_PUB_CONCEPT_SLUG);
      // Lab summary is present but must never carry the reference or starter.
      expect(body.data.concept.lab).toBeTruthy();
      expect(body.data.concept.lab.title).toBe("A Lab");
      expect(body.data.concept.lab.referenceSolution).toBeUndefined();
      expect(body.data.concept.lab.starterCode).toBeUndefined();

      // Full-body sweep — if any nested shape ever leaked the values, this
      // catches it even if the immediate field-name check missed a rename.
      const jsonBlob = JSON.stringify(body);
      expect(jsonBlob).not.toContain("solution — MUST NOT leak");
      expect(jsonBlob).not.toContain("starter — MUST NOT leak");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "includes latestAttempt = null when the learner has never submitted",
    async () => {
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/concepts/${A_PUB_CONCEPT_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(200);
      expect(body.data.concept.latestAttempt).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "surfaces the latest LabAttempt summary when one exists (no code body)",
    async () => {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "lab_attempts" WHERE "userId" = $1 AND "labId" = $2`,
        LEARNER_A_USER_ID,
        aPublishedLabId,
      );
      await prisma.labAttempt.create({
        data: {
          labId: aPublishedLabId,
          userId: LEARNER_A_USER_ID,
          attemptNumber: 1,
          code: "// learner code — should not appear in response",
          reviewStatus: "PENDING",
        },
      });

      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/concepts/${A_PUB_CONCEPT_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(200);
      expect(body.data.concept.latestAttempt).not.toBeNull();
      expect(body.data.concept.latestAttempt.attemptNumber).toBe(1);
      expect(body.data.concept.latestAttempt.reviewStatus).toBe("PENDING");
      // Attempt summary must not leak the submitted code body.
      expect(body.data.concept.latestAttempt.code).toBeUndefined();
      const jsonBlob = JSON.stringify(body);
      expect(jsonBlob).not.toContain("learner code — should not appear");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 CONCEPT_NOT_FOUND for a DRAFT concept",
    async () => {
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/concepts/${A_DRAFT_CONCEPT_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 for a PUBLISHED concept whose parent topic is DRAFT",
    async () => {
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/concepts/${A_CONCEPT_UNDER_DRAFT_TOPIC_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 when probing another team's concept",
    async () => {
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/concepts/${B_PUB_CONCEPT_SLUG}`,
        { token: learnerAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

// Reference to fixture IDs so eslint doesn't flag them as unused.
describe("fixture wiring", () => {
  it("hydrated all fixture IDs", () => {
    expect(aPublishedTopicId).toBeTruthy();
    expect(aDraftTopicId).toBeTruthy();
    expect(aPublishedConceptId).toBeTruthy();
    expect(aPublishedLabId).toBeTruthy();
  });
});

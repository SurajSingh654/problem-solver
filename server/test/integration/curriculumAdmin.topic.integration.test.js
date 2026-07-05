// ============================================================================
// curriculumAdmin Topic CRUD + fork — end-to-end integration test (W3.T2)
// ============================================================================
//
// Exercises the full HTTP stack: authenticate → requireTeamContext →
// requireTeamAdmin → controller → real Prisma → Postgres. Mocking any of
// this hides exactly the bug classes the test is meant to catch —
// middleware order regressions, cross-team leakage, wire-envelope drift.
//
// Fixtures:
//   - Two users:
//       ADMIN_A_USER — TEAM_ADMIN of Team A (the "us" side of tenancy tests)
//       ADMIN_B_USER — TEAM_ADMIN of Team B (the "cross-team probe" side)
//       MEMBER_USER  — regular MEMBER of Team A (should get 403 on writes)
//   - Two teams (A, B) with real team_memberships so the JWT teamRole
//     reflects the DB truth. Tests never mutate memberships mid-run.
//   - One test TopicTemplate + two ConceptTemplates + one LabTemplate
//     so the fork endpoint has something realistic to clone.
//
// Cleanup uses raw SQL DELETE (bypasses Prisma soft-delete middleware — same
// rationale as `curriculumFork.integration.test.js`).
//
// Run: cd server && npx vitest run test/integration/curriculumAdmin.topic.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

const TEST_PREFIX = "test_curradm_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const ADMIN_A_USER_ID = `${TEST_PREFIX}admin_a`;
const ADMIN_B_USER_ID = `${TEST_PREFIX}admin_b`;
const MEMBER_USER_ID = `${TEST_PREFIX}member`;
const TEMPLATE_SLUG = `${TEST_PREFIX}template_1`;

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let adminAToken;
let memberAToken;

async function hardDeleteTestFixtures() {
  // Order: children (topics + their concept/lab cascade via FK), then
  // team_memberships, then teams, then template tree, then users.
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
    `DELETE FROM "topic_templates" WHERE "slug" LIKE $1`,
    `${TEST_PREFIX}%`,
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
        id: ADMIN_A_USER_ID,
        email: `${TEST_PREFIX}admin_a@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Admin A",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: ADMIN_B_USER_ID,
        email: `${TEST_PREFIX}admin_b@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Admin B",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: MEMBER_USER_ID,
        email: `${TEST_PREFIX}member@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Member A",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  // ── Teams ──────────────────────────────────────────────────────
  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "CurrAdmin Team A",
      status: "ACTIVE",
      createdById: ADMIN_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "CurrAdmin Team B",
      status: "ACTIVE",
      createdById: ADMIN_B_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  // ── Memberships (DB truth; the JWT teamRole must match) ────────
  await prisma.teamMembership.createMany({
    data: [
      { userId: ADMIN_A_USER_ID, teamId: TEAM_A_ID, role: "TEAM_ADMIN", isActive: true },
      { userId: ADMIN_B_USER_ID, teamId: TEAM_B_ID, role: "TEAM_ADMIN", isActive: true },
      { userId: MEMBER_USER_ID, teamId: TEAM_A_ID, role: "MEMBER", isActive: true },
    ],
  });

  // ── TopicTemplate for fork tests ───────────────────────────────
  await prisma.topicTemplate.create({
    data: {
      slug: TEMPLATE_SLUG,
      name: "CurrAdmin Test Template",
      description: "Template for curriculumAdmin controller integration tests.",
      category: "LOW_LEVEL_DESIGN",
      estimatedHoursToMastery: 4,
      templateStatus: "PUBLISHED",
      sourcePath: TEMPLATE_SLUG,
      concepts: {
        create: [
          {
            slug: "01-first",
            name: "First",
            order: 1,
            primerMarkdown: "# First\nBody.",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            sourcePath: `${TEMPLATE_SLUG}/01-first.md`,
            templateStatus: "PUBLISHED",
            lab: {
              create: {
                title: "Lab 1",
                taskMarkdown: "Do the thing.",
                language: "JAVA",
                referenceSolution: "// solution",
                expectedArtifacts: [],
                sourcePath: `${TEMPLATE_SLUG}/labs/01-first`,
                templateStatus: "PUBLISHED",
              },
            },
          },
          {
            slug: "02-second",
            name: "Second",
            order: 2,
            primerMarkdown: "# Second\nBody.",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            sourcePath: `${TEMPLATE_SLUG}/02-second.md`,
            templateStatus: "PUBLISHED",
          },
        ],
      },
    },
  });

  // ── HTTP harness ───────────────────────────────────────────────
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // Mount at the same prefix production `mountRoutes()` uses so the URL
  // contract is exercised too.
  app.use("/api/v1/curriculum/admin", curriculumAdminRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  // ── Tokens (real JWTs, real signature) ─────────────────────────
  adminAToken = generateToken({
    id: ADMIN_A_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_A_ID,
    teamRole: "TEAM_ADMIN",
  });
  // adminBToken (Team B TEAM_ADMIN) is currently not needed — cross-team
  // access is exercised by having adminAToken probe Team B's seeded rows.
  // Kept the fixture user + membership so a future test wanting to prove
  // "Team B admin can see Team A's stuff → no" has the JWT to mint.
  memberAToken = generateToken({
    id: MEMBER_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_A_ID,
    teamRole: "MEMBER",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

beforeEach(async () => {
  // Clean any Topic rows between tests so create-slug collisions don't
  // bleed. Keep users/teams/templates seeded.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
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

describe("curriculumAdmin — auth gates", () => {
  it(
    "returns 401 when no token is provided",
    async () => {
      const { status } = await req("GET", "/api/v1/curriculum/admin/topics");
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 when a non-TEAM_ADMIN MEMBER attempts a write",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/topics", {
        token: memberAToken,
        body: {
          slug: "member-blocked",
          name: "Nope",
          description: "Should be blocked.",
          category: "LOW_LEVEL_DESIGN",
        },
      });
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("TEAM_ADMIN_REQUIRED");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 when a MEMBER attempts a read (requireTeamAdmin is on GET too)",
    async () => {
      const { status, body } = await req("GET", "/api/v1/curriculum/admin/topics", {
        token: memberAToken,
      });
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("TEAM_ADMIN_REQUIRED");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("GET /curriculum/admin/topics", () => {
  it(
    "returns only the requesting team's topics",
    async () => {
      // Seed a topic in each team so cross-team leakage would be visible.
      await prisma.topic.create({
        data: {
          slug: "team-a-topic",
          name: "Team A Topic",
          description: "A-only",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_A_ID,
        },
      });
      await prisma.topic.create({
        data: {
          slug: "team-b-topic",
          name: "Team B Topic",
          description: "B-only",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_B_ID,
        },
      });

      const { status, body } = await req("GET", "/api/v1/curriculum/admin/topics", {
        token: adminAToken,
      });
      expect(status).toBe(200);
      const slugs = body.data.topics.map((t) => t.slug);
      expect(slugs).toContain("team-a-topic");
      expect(slugs).not.toContain("team-b-topic");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/admin/topics", () => {
  it(
    "creates a blank Topic in DRAFT status for the caller's team",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/topics", {
        token: adminAToken,
        body: {
          slug: "blank-topic",
          name: "Blank",
          description: "Fresh draft.",
          category: "LOW_LEVEL_DESIGN",
        },
      });
      expect(status).toBe(201);
      expect(body.data.topic.slug).toBe("blank-topic");
      expect(body.data.topic.status).toBe("DRAFT");
      expect(body.data.topic.teamId).toBe(TEAM_A_ID);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 400 MISSING_FIELDS when required fields absent",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/topics", {
        token: adminAToken,
        body: { slug: "only-slug" },
      });
      expect(status).toBe(400);
      expect(body?.error?.code).toBe("MISSING_FIELDS");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 409 DUPLICATE_SLUG when the same team creates the same slug twice",
    async () => {
      await req("POST", "/api/v1/curriculum/admin/topics", {
        token: adminAToken,
        body: {
          slug: "dup-slug",
          name: "First",
          description: "First insert.",
          category: "LOW_LEVEL_DESIGN",
        },
      });
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/topics", {
        token: adminAToken,
        body: {
          slug: "dup-slug",
          name: "Second",
          description: "Second insert.",
          category: "LOW_LEVEL_DESIGN",
        },
      });
      expect(status).toBe(409);
      expect(body?.error?.code).toBe("DUPLICATE_SLUG");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("GET /curriculum/admin/topics/:id", () => {
  it(
    "returns the topic + ordered concepts + each concept's lab",
    async () => {
      const topic = await prisma.topic.create({
        data: {
          slug: "detail-topic",
          name: "Detail Topic",
          description: "For detail-view test.",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_A_ID,
        },
      });
      // Two concepts, out-of-order in insertion — response must sort by
      // `order` ascending, not by creation time.
      const conceptB = await prisma.concept.create({
        data: {
          topicId: topic.id,
          teamId: TEAM_A_ID,
          slug: "b-second",
          name: "Second",
          order: 2,
          status: "DRAFT",
          primerMarkdown: "# B",
        },
      });
      const conceptA = await prisma.concept.create({
        data: {
          topicId: topic.id,
          teamId: TEAM_A_ID,
          slug: "a-first",
          name: "First",
          order: 1,
          status: "DRAFT",
          primerMarkdown: "# A",
        },
      });
      // A lab on concept A only — B has no lab, so the include must yield
      // { lab: null } for it.
      await prisma.lab.create({
        data: {
          conceptId: conceptA.id,
          teamId: TEAM_A_ID,
          title: "Lab A",
          taskMarkdown: "Do it.",
          language: "JAVA",
          referenceSolution: "// go",
          expectedArtifacts: [],
          status: "DRAFT",
          sortOrder: 0,
        },
      });

      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/admin/topics/${topic.id}`,
        { token: adminAToken },
      );
      expect(status).toBe(200);
      expect(body.data.topic.id).toBe(topic.id);
      expect(body.data.topic.slug).toBe("detail-topic");
      const orderedSlugs = body.data.topic.concepts.map((c) => c.slug);
      expect(orderedSlugs).toEqual(["a-first", "b-second"]);
      // Lab shape passes through — non-null on A, null on B.
      const aConcept = body.data.topic.concepts.find((c) => c.slug === "a-first");
      const bConcept = body.data.topic.concepts.find((c) => c.slug === "b-second");
      expect(aConcept.lab?.title).toBe("Lab A");
      expect(bConcept.lab).toBeNull();

      // Ensure we didn't leave stale rows for the next test.
      await prisma.lab.deleteMany({ where: { conceptId: conceptA.id } });
      await prisma.concept.deleteMany({ where: { topicId: topic.id } });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 TOPIC_NOT_FOUND for a topic in another team",
    async () => {
      const teamBTopic = await prisma.topic.create({
        data: {
          slug: "b-detail",
          name: "B Detail",
          description: "B only",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_B_ID,
        },
      });
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/admin/topics/${teamBTopic.id}`,
        { token: adminAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("PATCH /curriculum/admin/topics/:id", () => {
  it(
    "returns 404 TOPIC_NOT_FOUND when a TEAM_ADMIN attempts to update another team's topic",
    async () => {
      const teamBTopic = await prisma.topic.create({
        data: {
          slug: "b-owned",
          name: "B Owned",
          description: "Owned by B.",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_B_ID,
        },
      });

      const { status, body } = await req(
        "PATCH",
        `/api/v1/curriculum/admin/topics/${teamBTopic.id}`,
        {
          token: adminAToken, // A tries to touch B's topic
          body: { name: "Hacked" },
        },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");

      // Verify the target didn't change.
      const after = await prisma.topic.findUnique({ where: { id: teamBTopic.id } });
      expect(after.name).toBe("B Owned");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "sanitizes cheatsheetHtml before persist",
    async () => {
      const own = await prisma.topic.create({
        data: {
          slug: "a-own",
          name: "A Own",
          description: "Own",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_A_ID,
        },
      });

      const { status } = await req("PATCH", `/api/v1/curriculum/admin/topics/${own.id}`, {
        token: adminAToken,
        body: {
          cheatsheetHtml: '<p>Hello</p><script>alert("xss")</script>',
        },
      });
      expect(status).toBe(200);

      const after = await prisma.topic.findUnique({ where: { id: own.id } });
      expect(after.cheatsheetHtml).toContain("<p>Hello</p>");
      expect(after.cheatsheetHtml).not.toContain("<script>");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/admin/topics/from-template/:templateSlug", () => {
  it(
    "successfully forks a TopicTemplate into the caller's team",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/from-template/${TEMPLATE_SLUG}`,
        { token: adminAToken },
      );
      expect(status).toBe(201);
      expect(body.data.topic.teamId).toBe(TEAM_A_ID);
      expect(body.data.topic.slug).toBe(TEMPLATE_SLUG);
      expect(body.data.conceptCount).toBe(2);
      expect(body.data.labCount).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 409 DUPLICATE_SLUG when the same team double-forks",
    async () => {
      await req(
        "POST",
        `/api/v1/curriculum/admin/topics/from-template/${TEMPLATE_SLUG}`,
        { token: adminAToken },
      );
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/from-template/${TEMPLATE_SLUG}`,
        { token: adminAToken },
      );
      expect(status).toBe(409);
      expect(body?.error?.code).toBe("DUPLICATE_SLUG");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 TEMPLATE_NOT_FOUND for unknown slug",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/from-template/${TEST_PREFIX}nonexistent`,
        { token: adminAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TEMPLATE_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("GET /curriculum/admin/topics/:id/template-status", () => {
  it(
    "returns hasUpdate=false immediately after fork (fresh)",
    async () => {
      const forkRes = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/from-template/${TEMPLATE_SLUG}`,
        { token: adminAToken },
      );
      expect(forkRes.status).toBe(201);
      const topicId = forkRes.body.data.topic.id;

      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/admin/topics/${topicId}/template-status`,
        { token: adminAToken },
      );
      expect(status).toBe(200);
      expect(body.data.hasUpdate).toBe(false);
      expect(body.data.templateUpdatedAt).toBeTruthy();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns hasUpdate=false with templateUpdatedAt=null for non-forked topics",
    async () => {
      const topic = await prisma.topic.create({
        data: {
          slug: "hand-crafted",
          name: "Hand-crafted",
          description: "Not a fork.",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_A_ID,
        },
      });
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/admin/topics/${topic.id}/template-status`,
        { token: adminAToken },
      );
      expect(status).toBe(200);
      expect(body.data.hasUpdate).toBe(false);
      expect(body.data.templateUpdatedAt).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 when Team A queries Team B's topic",
    async () => {
      const teamBTopic = await prisma.topic.create({
        data: {
          slug: "b-topic-status",
          name: "B",
          description: "B",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_B_ID,
        },
      });
      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/admin/topics/${teamBTopic.id}/template-status`,
        { token: adminAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

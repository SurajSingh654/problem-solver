// ============================================================================
// curriculumAdmin — SUPER_ADMIN override audit log (W3.T5)
// ============================================================================
//
// Verifies that CurriculumAdminAuditLog rows are written exactly on the
// SUPER_ADMIN cross-team override path — not on regular TEAM_ADMIN writes,
// and not on SUPER_ADMIN own-team writes. Exercises the full HTTP stack
// (authenticate → requireTeamContext → requireTeamAdmin → controller →
// audit helper → Postgres) so wire-envelope drift, middleware order, and
// helper wiring are all covered by a single test file.
//
// The audit log is best-effort — a failed insert must NEVER roll back the
// underlying write. Testing that non-fatal path cleanly is hard without
// stubbing Prisma, so we rely on the try/catch inside the helper and
// leave the fault-injection test to a future unit test if it becomes
// worth the harness cost.
//
// Fixtures use the `test_w3t5_` prefix per the W3 convention.
//
// Run: cd server && npx vitest run test/integration/curriculumAdmin.audit.integration.test.js
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

const TEST_PREFIX = "test_w3t5_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const SUPERADMIN_USER_ID = `${TEST_PREFIX}superadmin`;
const TEAMADMIN_USER_ID = `${TEST_PREFIX}teamadmin`;

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let superAdminToken;
let teamAdminToken;

async function hardDeleteTestFixtures() {
  // Order: audit rows (FK → users), then topics (cascades via FK on team),
  // team memberships, teams, users.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "curriculum_admin_audit_logs" WHERE "actorUserId" IN ($1, $2)`,
    SUPERADMIN_USER_ID,
    TEAMADMIN_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "content_review_logs" WHERE "targetId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "labs" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concepts" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
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

  await prisma.user.createMany({
    data: [
      {
        id: SUPERADMIN_USER_ID,
        email: `${TEST_PREFIX}superadmin@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Super Admin",
        globalRole: "SUPER_ADMIN",
        onboardingComplete: true,
      },
      {
        id: TEAMADMIN_USER_ID,
        email: `${TEST_PREFIX}teamadmin@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Team Admin",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  // Team A hosts the SUPER_ADMIN's own currentTeamId (so a same-team probe
  // doesn't trigger the override flag). Team B is the "other" team the
  // SUPER_ADMIN overrides into to trigger audit logging.
  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "W3T5 Team A",
      status: "ACTIVE",
      createdById: SUPERADMIN_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "W3T5 Team B",
      status: "ACTIVE",
      createdById: TEAMADMIN_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  // TEAM_ADMIN owns Team A. SUPER_ADMIN also holds an ACTIVE TeamMembership
  // on Team A — this simulates the "solo-dev owner" pattern where the same
  // account is both platform-admin and native member of their own team.
  // Without a membership row on the team they're writing to, requireTeamContext
  // treats the SUPER_ADMIN as cross-team-override (BLOCKER 5, 2026-07-09) and
  // audits every write — which would defeat Scenario 2 below (own-team writes
  // must NOT audit). Membership row makes SA a legit member for these tests.
  await prisma.teamMembership.createMany({
    data: [
      {
        userId: TEAMADMIN_USER_ID,
        teamId: TEAM_A_ID,
        role: "TEAM_ADMIN",
        isActive: true,
      },
      {
        userId: SUPERADMIN_USER_ID,
        teamId: TEAM_A_ID,
        role: "TEAM_ADMIN",
        isActive: true,
      },
    ],
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/curriculum/admin", curriculumAdminRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  superAdminToken = generateToken({
    id: SUPERADMIN_USER_ID,
    globalRole: "SUPER_ADMIN",
    currentTeamId: TEAM_A_ID,
    teamRole: null,
  });
  teamAdminToken = generateToken({
    id: TEAMADMIN_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_A_ID,
    teamRole: "TEAM_ADMIN",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

beforeEach(async () => {
  // Clean audit + topic/concept/lab rows between tests so counters don't
  // bleed. Keep users, teams, and memberships intact.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "curriculum_admin_audit_logs" WHERE "actorUserId" IN ($1, $2)`,
    SUPERADMIN_USER_ID,
    TEAMADMIN_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "content_review_logs" WHERE "targetId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "labs" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concepts" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
}, TEST_TIMEOUT_MS);

async function req(method, path, { token, body, headers: extraHeaders } = {}) {
  const headers = { "Content-Type": "application/json", ...(extraHeaders ?? {}) };
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

/**
 * Fetch every audit row for a given actor, oldest first. Callers assert on
 * the resulting list length + shape.
 */
async function auditRowsForActor(actorUserId) {
  return prisma.curriculumAdminAuditLog.findMany({
    where: { actorUserId },
    orderBy: { createdAt: "asc" },
  });
}

// Seed a WORTH_LEARNING topic-review + all-PUBLISHED concept so publishTopic
// can pass both gates without invoking the AI validator.
async function seedTopicReadyForPublish({ topicId, teamId }) {
  const topic = await prisma.topic.create({
    data: {
      id: topicId,
      slug: topicId.replace(/_/g, "-"),
      name: `W3T5 topic ${topicId}`,
      description: "Publish-gate fixture for audit test.",
      category: "LOW_LEVEL_DESIGN",
      status: "DRAFT",
      teamId,
    },
  });
  await prisma.concept.create({
    data: {
      id: `${topicId}_c1`,
      topicId: topic.id,
      teamId,
      slug: "c1",
      name: "C1",
      order: 1,
      status: "PUBLISHED",
      primerMarkdown: "# c1",
    },
  });
  await prisma.contentReviewLog.create({
    data: {
      targetType: "TOPIC",
      targetId: topic.id,
      verdict: "WORTH_LEARNING",
      body: { verdict: "WORTH_LEARNING" },
      reviewerModel: "test-model",
    },
  });
  return topic;
}

// ============================================================================
// Scenario 1: Regular TEAM_ADMIN write → no audit row.
// ============================================================================

describe("curriculumAdmin audit — regular TEAM_ADMIN writes", () => {
  it(
    "does NOT write an audit row when a TEAM_ADMIN creates a topic in their own team",
    async () => {
      const { status } = await req(
        "POST",
        "/api/v1/curriculum/admin/topics",
        {
          token: teamAdminToken,
          body: {
            slug: "teamadmin-created",
            name: "Team Admin",
            description: "Regular team admin write.",
            category: "LOW_LEVEL_DESIGN",
          },
        },
      );
      expect(status).toBe(201);

      const rows = await auditRowsForActor(TEAMADMIN_USER_ID);
      expect(rows).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Scenario 2: SUPER_ADMIN writes into their own currentTeam → no audit row.
// ============================================================================

describe("curriculumAdmin audit — SUPER_ADMIN own-team writes", () => {
  it(
    "does NOT write an audit row when SUPER_ADMIN writes to their own currentTeamId (no override)",
    async () => {
      const { status } = await req(
        "POST",
        "/api/v1/curriculum/admin/topics",
        {
          token: superAdminToken,
          body: {
            slug: "sa-own-team",
            name: "SA Own Team",
            description: "Super admin writing into their own team.",
            category: "LOW_LEVEL_DESIGN",
          },
        },
      );
      expect(status).toBe(201);

      const rows = await auditRowsForActor(SUPERADMIN_USER_ID);
      expect(rows).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "does NOT write an audit row when SUPER_ADMIN passes ?teamId= matching their own currentTeamId",
    async () => {
      // Passing the override header/query with your OWN team is a no-op —
      // shouldn't flood the audit log.
      const { status } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics?teamId=${TEAM_A_ID}`,
        {
          token: superAdminToken,
          body: {
            slug: "sa-own-override",
            name: "SA Own Override",
            description: "Same-team override should be a no-op.",
            category: "LOW_LEVEL_DESIGN",
          },
        },
      );
      expect(status).toBe(201);

      const rows = await auditRowsForActor(SUPERADMIN_USER_ID);
      expect(rows).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Scenario 3-6: SUPER_ADMIN override → audit row written.
// ============================================================================

describe("curriculumAdmin audit — SUPER_ADMIN cross-team override", () => {
  it(
    "writes a TOPIC_CREATE audit row on POST /topics?teamId=<other team>",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics?teamId=${TEAM_B_ID}`,
        {
          token: superAdminToken,
          body: {
            slug: "sa-into-b",
            name: "SA Into B",
            description: "SUPER_ADMIN overriding into Team B.",
            category: "LOW_LEVEL_DESIGN",
          },
        },
      );
      expect(status).toBe(201);
      expect(body?.data?.topic?.teamId).toBe(TEAM_B_ID);

      const rows = await auditRowsForActor(SUPERADMIN_USER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorUserId: SUPERADMIN_USER_ID,
        actorRole: "SUPER_ADMIN",
        targetTeamId: TEAM_B_ID,
        action: "TOPIC_CREATE",
      });
      expect(rows[0].payload).toMatchObject({
        topicId: body.data.topic.id,
        slug: "sa-into-b",
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "writes a TOPIC_UPDATE audit row (with changedFields keys) on PATCH override",
    async () => {
      // Seed a topic in Team B for the SUPER_ADMIN to patch.
      const topic = await prisma.topic.create({
        data: {
          slug: "b-patch-target",
          name: "B Patch Target",
          description: "To be updated by SUPER_ADMIN override.",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_B_ID,
        },
      });

      const { status } = await req(
        "PATCH",
        `/api/v1/curriculum/admin/topics/${topic.id}?teamId=${TEAM_B_ID}`,
        {
          token: superAdminToken,
          body: { name: "Renamed", description: "Updated too." },
        },
      );
      expect(status).toBe(200);

      const rows = await auditRowsForActor(SUPERADMIN_USER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0].action).toBe("TOPIC_UPDATE");
      expect(rows[0].targetTeamId).toBe(TEAM_B_ID);
      const payload = rows[0].payload;
      expect(payload.topicId).toBe(topic.id);
      expect(payload.changedFields).toEqual(
        expect.arrayContaining(["name", "description"]),
      );
      // Guard against accidentally storing full request body.
      expect(payload).not.toHaveProperty("name");
      expect(payload).not.toHaveProperty("description");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "writes a TOPIC_PUBLISH audit row on successful publish override",
    async () => {
      const topic = await seedTopicReadyForPublish({
        topicId: `${TEST_PREFIX}pub_target`,
        teamId: TEAM_B_ID,
      });

      const { status } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topic.id}/publish?teamId=${TEAM_B_ID}`,
        { token: superAdminToken },
      );
      expect(status).toBe(200);

      const rows = await auditRowsForActor(SUPERADMIN_USER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "TOPIC_PUBLISH",
        targetTeamId: TEAM_B_ID,
      });
      expect(rows[0].payload).toMatchObject({ topicId: topic.id });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "writes a TOPIC_CREATE audit row on X-Team-Id header override (same behavior as query param)",
    async () => {
      const { status, body } = await req(
        "POST",
        "/api/v1/curriculum/admin/topics",
        {
          token: superAdminToken,
          headers: { "X-Team-Id": TEAM_B_ID },
          body: {
            slug: "sa-into-b-header",
            name: "Via Header",
            description: "Header-based override should audit identically.",
            category: "LOW_LEVEL_DESIGN",
          },
        },
      );
      expect(status).toBe(201);
      expect(body?.data?.topic?.teamId).toBe(TEAM_B_ID);

      const rows = await auditRowsForActor(SUPERADMIN_USER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "TOPIC_CREATE",
        targetTeamId: TEAM_B_ID,
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "writes a CONCEPT_CREATE audit row when SUPER_ADMIN creates a concept in another team",
    async () => {
      // Seed a Team B topic to attach a concept to.
      const teamBTopic = await prisma.topic.create({
        data: {
          slug: "b-parent-for-concept",
          name: "B Parent",
          description: "Parent for concept audit test.",
          category: "LOW_LEVEL_DESIGN",
          status: "DRAFT",
          teamId: TEAM_B_ID,
        },
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts?teamId=${TEAM_B_ID}`,
        {
          token: superAdminToken,
          body: {
            topicId: teamBTopic.id,
            slug: "sa-concept",
            name: "SA Concept",
            order: 1,
            primerMarkdown: "# Primer",
          },
        },
      );
      expect(status).toBe(201);

      const rows = await auditRowsForActor(SUPERADMIN_USER_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: "CONCEPT_CREATE",
        targetTeamId: TEAM_B_ID,
      });
      expect(rows[0].payload).toMatchObject({
        conceptId: body.data.concept.id,
        topicId: teamBTopic.id,
        slug: "sa-concept",
      });
    },
    TEST_TIMEOUT_MS,
  );
});

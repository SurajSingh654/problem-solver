// ============================================================================
// curriculumAdmin Concept CRUD — end-to-end integration test (W3.T3)
// ============================================================================
//
// Exercises POST/PATCH `/curriculum/admin/concepts` through the full stack:
// authenticate → requireTeamContext → requireTeamAdmin → controller → real
// Prisma → Postgres. Mocking any layer would hide exactly the bug classes
// these tests are meant to catch — middleware order regressions, cross-team
// leakage, silent teamId-drift on Concept.
//
// Fixtures (parallel to `curriculumAdmin.topic.integration.test.js`):
//   - ADMIN_A_USER — TEAM_ADMIN of Team A
//   - ADMIN_B_USER — TEAM_ADMIN of Team B  (owns Topic B for cross-team probes)
//   - MEMBER_USER  — MEMBER of Team A       (should get 403 on writes/reads)
//   - Team A Topic + Team B Topic seeded fresh per test.
//
// Cleanup uses raw SQL DELETE to bypass the soft-delete middleware — same
// rationale as the W3.T2 topic integration test.
//
// Slug prefix `w3t3_c` chosen to avoid collision with the W3.T2 fixture
// (`01-first-concept`) and the W3.T1 fork template.
//
// Run: cd server && npx vitest run test/integration/curriculumAdmin.concept.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

const TEST_PREFIX = "test_curradm_c_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const ADMIN_A_USER_ID = `${TEST_PREFIX}admin_a`;
const ADMIN_B_USER_ID = `${TEST_PREFIX}admin_b`;
const MEMBER_USER_ID = `${TEST_PREFIX}member`;
const TOPIC_A_ID = `${TEST_PREFIX}topic_a`;
const TOPIC_B_ID = `${TEST_PREFIX}topic_b`;

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let adminAToken;
let memberAToken;

async function hardDeleteTestFixtures() {
  // Delete order: concepts (labs cascade via Concept FK), then topics,
  // then memberships, then teams, then users. `topics` cascade to concepts
  // via schema FK but we're explicit here to match the T2 pattern and be
  // robust to future cascade tweaks.
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

  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "CurrAdmin Concept Team A",
      status: "ACTIVE",
      createdById: ADMIN_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "CurrAdmin Concept Team B",
      status: "ACTIVE",
      createdById: ADMIN_B_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.createMany({
    data: [
      { userId: ADMIN_A_USER_ID, teamId: TEAM_A_ID, role: "TEAM_ADMIN", isActive: true },
      { userId: ADMIN_B_USER_ID, teamId: TEAM_B_ID, role: "TEAM_ADMIN", isActive: true },
      { userId: MEMBER_USER_ID, teamId: TEAM_A_ID, role: "MEMBER", isActive: true },
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

  adminAToken = generateToken({
    id: ADMIN_A_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_A_ID,
    teamRole: "TEAM_ADMIN",
  });
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
  // Fresh Topics per test so slug collisions on Concept.(topicId, slug)
  // stay predictable. Concepts cascade with Topics via schema FK.
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
  await prisma.topic.create({
    data: {
      id: TOPIC_A_ID,
      slug: `${TEST_PREFIX}topic_a_slug`,
      name: "Concept Test Topic A",
      description: "Topic in Team A for Concept CRUD tests.",
      category: "LOW_LEVEL_DESIGN",
      status: "DRAFT",
      teamId: TEAM_A_ID,
    },
  });
  await prisma.topic.create({
    data: {
      id: TOPIC_B_ID,
      slug: `${TEST_PREFIX}topic_b_slug`,
      name: "Concept Test Topic B",
      description: "Topic in Team B for cross-team probe tests.",
      category: "LOW_LEVEL_DESIGN",
      status: "DRAFT",
      teamId: TEAM_B_ID,
    },
  });
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

describe("POST /curriculum/admin/concepts — auth gates", () => {
  it(
    "returns 401 when no token is provided",
    async () => {
      const { status } = await req("POST", "/api/v1/curriculum/admin/concepts", {
        body: {
          topicId: TOPIC_A_ID,
          slug: "w3t3_c1",
          name: "C1",
          order: 1,
          primerMarkdown: "# C1",
        },
      });
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 when a non-TEAM_ADMIN MEMBER attempts to create",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/concepts", {
        token: memberAToken,
        body: {
          topicId: TOPIC_A_ID,
          slug: "w3t3_c1_member",
          name: "Blocked",
          order: 1,
          primerMarkdown: "# Nope",
        },
      });
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("TEAM_ADMIN_REQUIRED");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/admin/concepts — happy paths", () => {
  it(
    "creates a Concept under the caller's team topic and compiles primerHtml",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/concepts", {
        token: adminAToken,
        body: {
          topicId: TOPIC_A_ID,
          slug: "w3t3_c1",
          name: "Concept 1",
          order: 1,
          primerMarkdown: "# Hello\n\nA paragraph.",
        },
      });
      expect(status).toBe(201);
      expect(body.data.concept.slug).toBe("w3t3_c1");
      expect(body.data.concept.status).toBe("DRAFT");
      // Invariant #1: Concept.teamId inherits from Topic.teamId, not from
      // any client-supplied field.
      expect(body.data.concept.teamId).toBe(TEAM_A_ID);
      expect(body.data.concept.topicId).toBe(TOPIC_A_ID);
      // primerHtml compiled from markdown — <h1> for the '#' header.
      expect(body.data.concept.primerHtml).toContain("<h1>");
      expect(body.data.concept.primerHtml).toContain("Hello");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "preserves the Concept.teamId === Topic.teamId invariant even with client-supplied teamId noise",
    async () => {
      // Attempting to smuggle a Team B id in the request body must NOT
      // move the row to Team B. The controller reads teamId from the
      // parent Topic, not from req.body.
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/concepts", {
        token: adminAToken,
        body: {
          topicId: TOPIC_A_ID,
          teamId: TEAM_B_ID, // extraneous — should be ignored
          slug: "w3t3_c_invariant",
          name: "Invariant Check",
          order: 1,
          primerMarkdown: "# Invariant",
        },
      });
      expect(status).toBe(201);
      expect(body.data.concept.teamId).toBe(TEAM_A_ID);

      // Verify in the DB directly, not just the response.
      const row = await prisma.concept.findUnique({
        where: { id: body.data.concept.id },
      });
      expect(row.teamId).toBe(TEAM_A_ID);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/admin/concepts — validation + collision", () => {
  it(
    "returns 400 MISSING_FIELDS when required fields absent",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/concepts", {
        token: adminAToken,
        body: { topicId: TOPIC_A_ID, slug: "w3t3_c_missing" }, // no name/order/primer
      });
      expect(status).toBe(400);
      expect(body?.error?.code).toBe("MISSING_FIELDS");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 409 DUPLICATE_SLUG on second insert with the same (topicId, slug)",
    async () => {
      await req("POST", "/api/v1/curriculum/admin/concepts", {
        token: adminAToken,
        body: {
          topicId: TOPIC_A_ID,
          slug: "w3t3_c_dup",
          name: "First",
          order: 1,
          primerMarkdown: "# First",
        },
      });
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/concepts", {
        token: adminAToken,
        body: {
          topicId: TOPIC_A_ID,
          slug: "w3t3_c_dup",
          name: "Second",
          order: 2,
          primerMarkdown: "# Second",
        },
      });
      expect(status).toBe(409);
      expect(body?.error?.code).toBe("DUPLICATE_SLUG");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 TOPIC_NOT_FOUND when Team A tries to attach a Concept to Team B's Topic",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/concepts", {
        token: adminAToken,
        body: {
          topicId: TOPIC_B_ID, // cross-team probe
          slug: "w3t3_c_cross",
          name: "Cross",
          order: 1,
          primerMarkdown: "# X",
        },
      });
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");

      // Verify no leakage — Team B still has zero concepts on that Topic.
      const count = await prisma.concept.count({ where: { topicId: TOPIC_B_ID } });
      expect(count).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("PATCH /curriculum/admin/concepts/:id", () => {
  it(
    "updates own concept and recompiles primerHtml when primerMarkdown changes",
    async () => {
      const created = await prisma.concept.create({
        data: {
          topicId: TOPIC_A_ID,
          teamId: TEAM_A_ID,
          slug: "w3t3_c_patch_own",
          name: "Old",
          order: 1,
          status: "DRAFT",
          primerMarkdown: "# Old",
          primerHtml: "<h1>Old</h1>",
        },
      });

      const { status, body } = await req(
        "PATCH",
        `/api/v1/curriculum/admin/concepts/${created.id}`,
        {
          token: adminAToken,
          body: {
            name: "New",
            primerMarkdown: "# New\n\nBody.",
          },
        },
      );
      expect(status).toBe(200);
      expect(body.data.concept.name).toBe("New");
      expect(body.data.concept.primerMarkdown).toBe("# New\n\nBody.");
      expect(body.data.concept.primerHtml).toContain("<h1>");
      expect(body.data.concept.primerHtml).toContain("New");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 CONCEPT_NOT_FOUND when Team A patches Team B's concept",
    async () => {
      const teamBConcept = await prisma.concept.create({
        data: {
          topicId: TOPIC_B_ID,
          teamId: TEAM_B_ID,
          slug: "w3t3_c_patch_cross",
          name: "B Owned",
          order: 1,
          status: "DRAFT",
          primerMarkdown: "# B Owned",
        },
      });

      const { status, body } = await req(
        "PATCH",
        `/api/v1/curriculum/admin/concepts/${teamBConcept.id}`,
        {
          token: adminAToken, // Team A trying to modify Team B
          body: { name: "Hacked" },
        },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");

      // Confirm no mutation happened on the target.
      const after = await prisma.concept.findUnique({ where: { id: teamBConcept.id } });
      expect(after.name).toBe("B Owned");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "sanitizes primerMarkdown containing script tags — primerHtml has no <script>",
    async () => {
      const created = await prisma.concept.create({
        data: {
          topicId: TOPIC_A_ID,
          teamId: TEAM_A_ID,
          slug: "w3t3_c_sanitize",
          name: "Sanitize Test",
          order: 1,
          status: "DRAFT",
          primerMarkdown: "# Safe",
          primerHtml: "<h1>Safe</h1>",
        },
      });

      const { status, body } = await req(
        "PATCH",
        `/api/v1/curriculum/admin/concepts/${created.id}`,
        {
          token: adminAToken,
          body: {
            // Inline HTML in markdown source is disallowed by remark-rehype
            // + rehype-sanitize, so the <script> tag must not survive into
            // primerHtml.
            primerMarkdown: '# Title\n\n<script>alert(1)</script>\n\nAfter.',
          },
        },
      );
      expect(status).toBe(200);
      expect(body.data.concept.primerHtml).not.toContain("<script>");
      expect(body.data.concept.primerHtml).not.toContain("alert(1)");
    },
    TEST_TIMEOUT_MS,
  );
});

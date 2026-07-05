// ============================================================================
// curriculumAdmin Lab CRUD — end-to-end integration test (W3.T3)
// ============================================================================
//
// Exercises POST/PATCH `/curriculum/admin/labs` through the full stack.
// A Lab is 1:1 with a Concept (schema.prisma:2711), so this suite also
// pins the "second attach → 409 DUPLICATE_LAB" contract that the client
// will render as "This concept already has a lab" in the reviewer UI (W3.T9).
//
// Fixtures:
//   - ADMIN_A_USER — TEAM_ADMIN of Team A, owns Concept A
//   - ADMIN_B_USER — TEAM_ADMIN of Team B, owns Concept B
//   - MEMBER_USER  — MEMBER of Team A (403 on writes)
//
// Cross-team invariant tested: creating a Lab against Concept B while
// authenticated as Team A returns 404 CONCEPT_NOT_FOUND (no existence
// leakage) — same pattern as the Concept CRUD test.
//
// Run: cd server && npx vitest run test/integration/curriculumAdmin.lab.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

const TEST_PREFIX = "test_curradm_l_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const ADMIN_A_USER_ID = `${TEST_PREFIX}admin_a`;
const ADMIN_B_USER_ID = `${TEST_PREFIX}admin_b`;
const MEMBER_USER_ID = `${TEST_PREFIX}member`;
const TOPIC_A_ID = `${TEST_PREFIX}topic_a`;
const TOPIC_B_ID = `${TEST_PREFIX}topic_b`;
const CONCEPT_A_ID = `${TEST_PREFIX}concept_a`;
const CONCEPT_B_ID = `${TEST_PREFIX}concept_b`;

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let adminAToken;
let memberAToken;

async function hardDeleteTestFixtures() {
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
      name: "CurrAdmin Lab Team A",
      status: "ACTIVE",
      createdById: ADMIN_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "CurrAdmin Lab Team B",
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
  // Fresh Topic + Concept fixtures per test — labs are 1:1 with Concept,
  // so the DUPLICATE_LAB test needs a virgin Concept every run.
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

  await prisma.topic.create({
    data: {
      id: TOPIC_A_ID,
      slug: `${TEST_PREFIX}topic_a_slug`,
      name: "Lab Test Topic A",
      description: "Topic in Team A for Lab CRUD tests.",
      category: "LOW_LEVEL_DESIGN",
      status: "DRAFT",
      teamId: TEAM_A_ID,
    },
  });
  await prisma.topic.create({
    data: {
      id: TOPIC_B_ID,
      slug: `${TEST_PREFIX}topic_b_slug`,
      name: "Lab Test Topic B",
      description: "Topic in Team B for cross-team probe tests.",
      category: "LOW_LEVEL_DESIGN",
      status: "DRAFT",
      teamId: TEAM_B_ID,
    },
  });
  await prisma.concept.create({
    data: {
      id: CONCEPT_A_ID,
      topicId: TOPIC_A_ID,
      teamId: TEAM_A_ID,
      slug: `${TEST_PREFIX}concept_a_slug`,
      name: "Concept A",
      order: 1,
      status: "DRAFT",
      primerMarkdown: "# Concept A",
    },
  });
  await prisma.concept.create({
    data: {
      id: CONCEPT_B_ID,
      topicId: TOPIC_B_ID,
      teamId: TEAM_B_ID,
      slug: `${TEST_PREFIX}concept_b_slug`,
      name: "Concept B",
      order: 1,
      status: "DRAFT",
      primerMarkdown: "# Concept B",
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

describe("POST /curriculum/admin/labs — auth gates", () => {
  it(
    "returns 401 when no token is provided",
    async () => {
      const { status } = await req("POST", "/api/v1/curriculum/admin/labs", {
        body: {
          conceptId: CONCEPT_A_ID,
          title: "L1",
          taskMarkdown: "Do the thing.",
          language: "JAVA",
          referenceSolution: "// solution",
        },
      });
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 when a non-TEAM_ADMIN MEMBER attempts to create a Lab",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/labs", {
        token: memberAToken,
        body: {
          conceptId: CONCEPT_A_ID,
          title: "Blocked",
          taskMarkdown: "Nope",
          language: "JAVA",
          referenceSolution: "// nope",
        },
      });
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("TEAM_ADMIN_REQUIRED");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/admin/labs — happy paths", () => {
  it(
    "creates a Lab under the caller's team concept and inherits teamId from the Concept",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/labs", {
        token: adminAToken,
        body: {
          conceptId: CONCEPT_A_ID,
          title: "w3t3_lab1",
          taskMarkdown: "Implement a LinkedList.",
          timeboxMinutes: 45,
          language: "JAVA",
          starterCode: "class LinkedList {}",
          referenceSolution: "class LinkedList { /* ... */ }",
          expectedArtifacts: [{ type: "file", name: "LinkedList.java" }],
        },
      });
      expect(status).toBe(201);
      expect(body.data.lab.title).toBe("w3t3_lab1");
      expect(body.data.lab.status).toBe("DRAFT");
      expect(body.data.lab.conceptId).toBe(CONCEPT_A_ID);
      // Invariant: Lab.teamId === Concept.teamId (denormalized on create).
      expect(body.data.lab.teamId).toBe(TEAM_A_ID);
      expect(body.data.lab.language).toBe("JAVA");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "preserves the Lab.teamId === Concept.teamId invariant even with client-supplied teamId noise",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/labs", {
        token: adminAToken,
        body: {
          conceptId: CONCEPT_A_ID,
          teamId: TEAM_B_ID, // extraneous — controller must ignore
          title: "Invariant lab",
          taskMarkdown: "Task.",
          language: "JAVA",
          referenceSolution: "// solution",
        },
      });
      expect(status).toBe(201);
      expect(body.data.lab.teamId).toBe(TEAM_A_ID);

      const row = await prisma.lab.findUnique({ where: { id: body.data.lab.id } });
      expect(row.teamId).toBe(TEAM_A_ID);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/admin/labs — validation + collision", () => {
  it(
    "returns 400 MISSING_FIELDS when required fields absent",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/labs", {
        token: adminAToken,
        body: { conceptId: CONCEPT_A_ID, title: "Only Title" },
      });
      expect(status).toBe(400);
      expect(body?.error?.code).toBe("MISSING_FIELDS");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 409 DUPLICATE_LAB on second attach against the same Concept (1:1 uniqueness)",
    async () => {
      await req("POST", "/api/v1/curriculum/admin/labs", {
        token: adminAToken,
        body: {
          conceptId: CONCEPT_A_ID,
          title: "First Lab",
          taskMarkdown: "Task 1.",
          language: "JAVA",
          referenceSolution: "// s1",
        },
      });
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/labs", {
        token: adminAToken,
        body: {
          conceptId: CONCEPT_A_ID,
          title: "Second Lab",
          taskMarkdown: "Task 2.",
          language: "JAVA",
          referenceSolution: "// s2",
        },
      });
      expect(status).toBe(409);
      expect(body?.error?.code).toBe("DUPLICATE_LAB");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 CONCEPT_NOT_FOUND when Team A tries to attach a Lab to Team B's Concept",
    async () => {
      const { status, body } = await req("POST", "/api/v1/curriculum/admin/labs", {
        token: adminAToken,
        body: {
          conceptId: CONCEPT_B_ID, // cross-team probe
          title: "Cross Lab",
          taskMarkdown: "Nope.",
          language: "JAVA",
          referenceSolution: "// nope",
        },
      });
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");

      // Verify no leakage — Team B's Concept still has no Lab attached.
      const count = await prisma.lab.count({ where: { conceptId: CONCEPT_B_ID } });
      expect(count).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("PATCH /curriculum/admin/labs/:id", () => {
  it(
    "updates own lab with partial fields",
    async () => {
      const created = await prisma.lab.create({
        data: {
          conceptId: CONCEPT_A_ID,
          teamId: TEAM_A_ID,
          title: "Old Lab",
          taskMarkdown: "Old task.",
          language: "JAVA",
          referenceSolution: "// old",
          expectedArtifacts: [],
          status: "DRAFT",
          sortOrder: 0,
        },
      });

      const { status, body } = await req(
        "PATCH",
        `/api/v1/curriculum/admin/labs/${created.id}`,
        {
          token: adminAToken,
          body: {
            title: "New Lab",
            timeboxMinutes: 30,
            sortOrder: 5,
          },
        },
      );
      expect(status).toBe(200);
      expect(body.data.lab.title).toBe("New Lab");
      expect(body.data.lab.timeboxMinutes).toBe(30);
      expect(body.data.lab.sortOrder).toBe(5);
      // Untouched fields preserved.
      expect(body.data.lab.taskMarkdown).toBe("Old task.");
      expect(body.data.lab.teamId).toBe(TEAM_A_ID);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 LAB_NOT_FOUND when Team A patches Team B's lab",
    async () => {
      const teamBLab = await prisma.lab.create({
        data: {
          conceptId: CONCEPT_B_ID,
          teamId: TEAM_B_ID,
          title: "B Lab",
          taskMarkdown: "B task.",
          language: "JAVA",
          referenceSolution: "// b",
          expectedArtifacts: [],
          status: "DRAFT",
          sortOrder: 0,
        },
      });

      const { status, body } = await req(
        "PATCH",
        `/api/v1/curriculum/admin/labs/${teamBLab.id}`,
        {
          token: adminAToken, // Team A trying to modify Team B's lab
          body: { title: "Hacked" },
        },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("LAB_NOT_FOUND");

      const after = await prisma.lab.findUnique({ where: { id: teamBLab.id } });
      expect(after.title).toBe("B Lab");
    },
    TEST_TIMEOUT_MS,
  );
});

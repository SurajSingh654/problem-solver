// ============================================================================
// curriculumAdmin.templates — TEAM_ADMIN template listing (W3.T8)
// ============================================================================
//
// Exercises GET /curriculum/admin/templates end-to-end (auth →
// requireTeamContext → requireTeamAdmin → controller → real Prisma). The
// endpoint drives the TEAM_ADMIN TemplateBrowserPage on the client: the
// list a reviewer sees when they click "Fork from template".
//
// Contract:
//   - Non-TEAM_ADMIN MEMBERS get 403 TEAM_ADMIN_REQUIRED (same middleware
//     chain as the rest of the /curriculum/admin surface).
//   - Only templates with `templateStatus = "PUBLISHED"` are returned;
//     DRAFT + REVIEWED templates are filtered server-side so the client
//     doesn't have to (defense in depth for a future case where the flag
//     accidentally exposes them).
//   - Each row includes the `_count.concepts` so the client's card grid
//     doesn't need a follow-up N+1 fetch to render "N concepts".
//
// Fixtures are ISOLATED with a `TEST_PREFIX` slug so co-runs with
// other integration tests (curriculumSync, other curriculumAdmin files)
// don't interfere with counts.
//
// Run: cd server && npx vitest run test/integration/curriculumAdmin.templates.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

const TEST_PREFIX = "test_currtmpl_";
const TEAM_ID = `${TEST_PREFIX}team`;
const ADMIN_USER_ID = `${TEST_PREFIX}admin`;
const MEMBER_USER_ID = `${TEST_PREFIX}member`;
const PUBLISHED_SLUG = `${TEST_PREFIX}tpl_pub`;
const DRAFT_SLUG = `${TEST_PREFIX}tpl_draft`;

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let adminToken;
let memberToken;

async function hardDeleteTestFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "team_memberships" WHERE "teamId" = $1`,
    TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "teams" WHERE "id" = $1`,
    TEAM_ID,
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

  await prisma.user.createMany({
    data: [
      {
        id: ADMIN_USER_ID,
        email: `${TEST_PREFIX}admin@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Templates Admin",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: MEMBER_USER_ID,
        email: `${TEST_PREFIX}member@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Templates Member",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  await prisma.team.create({
    data: {
      id: TEAM_ID,
      name: "Templates Test Team",
      status: "ACTIVE",
      createdById: ADMIN_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.createMany({
    data: [
      {
        userId: ADMIN_USER_ID,
        teamId: TEAM_ID,
        role: "TEAM_ADMIN",
        isActive: true,
      },
      {
        userId: MEMBER_USER_ID,
        teamId: TEAM_ID,
        role: "MEMBER",
        isActive: true,
      },
    ],
  });

  // Seed one PUBLISHED template (should appear) and one DRAFT template
  // (should be filtered out).
  await prisma.topicTemplate.create({
    data: {
      slug: PUBLISHED_SLUG,
      name: "Zeta Published Template",
      description: "Published template listed to TEAM_ADMIN.",
      category: "LOW_LEVEL_DESIGN",
      estimatedHoursToMastery: 6,
      templateStatus: "PUBLISHED",
      sourcePath: PUBLISHED_SLUG,
      concepts: {
        create: [
          {
            slug: "01-intro",
            name: "Intro",
            order: 1,
            primerMarkdown: "# Intro",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            sourcePath: `${PUBLISHED_SLUG}/01-intro.md`,
            templateStatus: "PUBLISHED",
          },
        ],
      },
    },
  });
  await prisma.topicTemplate.create({
    data: {
      slug: DRAFT_SLUG,
      name: "Alpha Draft Template",
      description: "Draft template — MUST NOT be listed.",
      category: "LOW_LEVEL_DESIGN",
      templateStatus: "DRAFT",
      sourcePath: DRAFT_SLUG,
    },
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

  adminToken = generateToken({
    id: ADMIN_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_ID,
    teamRole: "TEAM_ADMIN",
  });
  memberToken = generateToken({
    id: MEMBER_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_ID,
    teamRole: "MEMBER",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

async function req(method, path, { token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + path, { method, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, body: data };
}

describe("GET /curriculum/admin/templates", () => {
  it(
    "returns 403 TEAM_ADMIN_REQUIRED when a MEMBER queries the list",
    async () => {
      const { status, body } = await req(
        "GET",
        "/api/v1/curriculum/admin/templates",
        { token: memberToken },
      );
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("TEAM_ADMIN_REQUIRED");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns the published template with concept count when queried by a TEAM_ADMIN",
    async () => {
      const { status, body } = await req(
        "GET",
        "/api/v1/curriculum/admin/templates",
        { token: adminToken },
      );
      expect(status).toBe(200);

      // Only inspect the rows this test file seeded — other integration
      // tests may seed additional PUBLISHED templates that co-run in the
      // same DB.
      const ours = body.data.templates.filter((t) =>
        t.slug.startsWith(TEST_PREFIX),
      );
      const slugs = ours.map((t) => t.slug);
      expect(slugs).toContain(PUBLISHED_SLUG);

      const pub = ours.find((t) => t.slug === PUBLISHED_SLUG);
      expect(pub.templateStatus).toBe("PUBLISHED");
      expect(pub._count.concepts).toBe(1);
      expect(pub.name).toBe("Zeta Published Template");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "filters out DRAFT templates (only PUBLISHED are forkable)",
    async () => {
      const { status, body } = await req(
        "GET",
        "/api/v1/curriculum/admin/templates",
        { token: adminToken },
      );
      expect(status).toBe(200);
      const slugs = body.data.templates.map((t) => t.slug);
      expect(slugs).not.toContain(DRAFT_SLUG);
    },
    TEST_TIMEOUT_MS,
  );
});

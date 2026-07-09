// ============================================================================
// topics.controller — tenancy regression (composite Topic.slug unique)
// ============================================================================
//
// On 2026-07-04 Topic.slug moved from `@unique` to `@@unique([teamId, slug])`
// (commit 0a01297). topics.controller.js was NOT updated: six handlers used
// `findUnique({ where: { slug }})` (Prisma runtime error) and two `findFirst`
// call sites were missing the teamId filter (cross-team leak). The existing
// controller-level test mocks Prisma so it hid the regression.
//
// This test hits real Postgres through Express with two teams sharing a
// topic slug, and proves:
//   1. Team A member sees Team A's topic on GET /topics/:slug.
//   2. Team B member with the same request sees Team B's topic.
//   3. GET /topics returns only the caller's team's topics — no leak.
//
// Run: cd server && npx vitest run test/integration/topics.tenancy.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import topicsRoutes from "../../src/routes/topics.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

const TEST_PREFIX = "test_topten_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const USER_A_ID = `${TEST_PREFIX}user_a`;
const USER_B_ID = `${TEST_PREFIX}user_b`;
const SHARED_SLUG = `${TEST_PREFIX}shared-slug`;
const A_ONLY_SLUG = `${TEST_PREFIX}a-only-slug`;

const TEST_TIMEOUT_MS = 30000;

let baseUrl;
let server;
let tokenA;
let tokenB;
let topicA_shared_id;
let topicB_shared_id;

async function hardDeleteFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" IN ($1, $2)`,
    USER_A_ID,
    USER_B_ID,
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
    `DELETE FROM "users" WHERE "id" IN ($1, $2) OR "email" LIKE $3`,
    USER_A_ID,
    USER_B_ID,
    `${TEST_PREFIX}%`,
  );
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  await hardDeleteFixtures();

  await prisma.user.createMany({
    data: [
      {
        id: USER_A_ID,
        email: `${TEST_PREFIX}a@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Topten A",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: USER_B_ID,
        email: `${TEST_PREFIX}b@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Topten B",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  await prisma.team.createMany({
    data: [
      { id: TEAM_A_ID, name: "Topten A", status: "ACTIVE", createdById: USER_A_ID, maxMembers: 20, isPersonal: false },
      { id: TEAM_B_ID, name: "Topten B", status: "ACTIVE", createdById: USER_B_ID, maxMembers: 20, isPersonal: false },
    ],
  });

  await prisma.teamMembership.createMany({
    data: [
      { userId: USER_A_ID, teamId: TEAM_A_ID, role: "MEMBER", isActive: true },
      { userId: USER_B_ID, teamId: TEAM_B_ID, role: "MEMBER", isActive: true },
    ],
  });

  // Same slug in both teams — the whole point of the composite unique.
  const topicA = await prisma.topic.create({
    data: {
      slug: SHARED_SLUG,
      name: "A version",
      description: "Team A's shared-slug topic.",
      category: "DSA",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_A_ID,
    },
  });
  const topicB = await prisma.topic.create({
    data: {
      slug: SHARED_SLUG,
      name: "B version",
      description: "Team B's shared-slug topic.",
      category: "DSA",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_B_ID,
    },
  });
  topicA_shared_id = topicA.id;
  topicB_shared_id = topicB.id;

  // Team-A-only topic — proves listTopics doesn't leak to Team B.
  await prisma.topic.create({
    data: {
      slug: A_ONLY_SLUG,
      name: "A only",
      description: "Only in Team A.",
      category: "DSA",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_A_ID,
    },
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/topics", topicsRoutes);
  app.use(errorHandler);

  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;

  tokenA = generateToken({ id: USER_A_ID, globalRole: "USER", currentTeamId: TEAM_A_ID, teamRole: "MEMBER" });
  tokenB = generateToken({ id: USER_B_ID, globalRole: "USER", currentTeamId: TEAM_B_ID, teamRole: "MEMBER" });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

describe("topics.controller — tenancy contract", () => {
  it(
    "GET /topics/:slug returns the caller's team's topic when two teams share a slug",
    async () => {
      const a = await req("GET", `/api/v1/topics/${SHARED_SLUG}`, { token: tokenA });
      const b = await req("GET", `/api/v1/topics/${SHARED_SLUG}`, { token: tokenB });

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.data.topic.id).toBe(topicA_shared_id);
      expect(b.body.data.topic.id).toBe(topicB_shared_id);
      expect(a.body.data.topic.id).not.toBe(b.body.data.topic.id);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "GET /topics lists only the caller's team's topics",
    async () => {
      const a = await req("GET", "/api/v1/topics", { token: tokenA });
      const b = await req("GET", "/api/v1/topics", { token: tokenB });

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);

      const aSlugs = a.body.data.topics.map((t) => t.slug);
      const bSlugs = b.body.data.topics.map((t) => t.slug);

      // Team A sees both its topics; Team B sees only the shared-slug one.
      expect(aSlugs).toContain(SHARED_SLUG);
      expect(aSlugs).toContain(A_ONLY_SLUG);
      expect(bSlugs).toContain(SHARED_SLUG);
      expect(bSlugs).not.toContain(A_ONLY_SLUG);
    },
    TEST_TIMEOUT_MS,
  );
});

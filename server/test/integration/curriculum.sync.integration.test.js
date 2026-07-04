// ============================================================================
// POST /super-admin/curriculum/templates/sync — wire-level integration test
// ============================================================================
//
// Task 13 of the curriculum Phase 1 plan. This file:
//   - Wires the REAL `authenticate` + `requireSuperAdmin` middleware so the
//     401 (no auth) and 403 (non-SUPER_ADMIN) checks are exercised end-to-end.
//   - Signs real JWTs via `generateToken()` so the middleware verifies them
//     the same way it does in production. No user rows are needed — the
//     middleware only reads the token payload; the DB-side `updateActivity`
//     is fire-and-forget with a swallow-all `.catch()`.
//   - Hits real Postgres (via the real Prisma client) for the dry-run and
//     write-through assertions. This mirrors the existing precedent set by
//     `curriculumSync.integration.test.js`, which is the other test in the
//     suite that intentionally roundtrips to the DB. Reason: the whole point
//     of these tests is to catch schema-drift / unique-constraint / envelope
//     bugs that a mocked Prisma would hide.
//
// The plan snippet referenced `supertest` + a `createTestApp`/`seedSuperAdmin`
// / `makeJwt` harness that don't exist in this repo. Adapted to the actual
// integration-test harness style: `express()` + `node:http` + `fetch()`.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumTemplatesRouter from "../../src/routes/curriculumTemplates.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

let server;
let baseUrl;
let superAdminToken;
let userToken;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // Mount at the same path the production `mountRoutes()` uses, so the test
  // exercises the URL contract too.
  app.use("/api/v1/super-admin", curriculumTemplatesRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  superAdminToken = generateToken({
    id: "test_curriculum_sync_superadmin",
    globalRole: "SUPER_ADMIN",
    currentTeamId: null,
    teamRole: null,
  });
  userToken = generateToken({
    id: "test_curriculum_sync_user",
    globalRole: "USER",
    currentTeamId: "test_curriculum_sync_team",
    teamRole: "MEMBER",
  });
});

afterAll(async () => {
  await prisma.topicTemplate.deleteMany({ where: { slug: { startsWith: "simple-topic-endpoint" } } });
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  // Reset DB state so dry-run and real-run assertions are deterministic.
  await prisma.topicTemplate.deleteMany({ where: { slug: { startsWith: "simple-topic-endpoint" } } });
});

async function post(pathAndQuery, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + pathAndQuery, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, body: data };
}

describe("POST /super-admin/curriculum/templates/sync", () => {
  it("returns 401 without auth", async () => {
    const { status } = await post("/api/v1/super-admin/curriculum/templates/sync");
    expect(status).toBe(401);
  });

  it("returns 403 for a non-SUPER_ADMIN user", async () => {
    const { status, body } = await post("/api/v1/super-admin/curriculum/templates/sync", {
      token: userToken,
    });
    expect(status).toBe(403);
    expect(body?.error?.code).toBe("SUPER_ADMIN_REQUIRED");
  });

  it("SUPER_ADMIN can sync with ?dryRun=true and see the diff (DB unchanged)", async () => {
    const { status, body } = await post(
      "/api/v1/super-admin/curriculum/templates/sync?dryRun=true",
      {
        token: superAdminToken,
        body: { root: "test/fixtures/curriculum-sync-endpoint" },
      },
    );
    expect(status).toBe(200);
    expect(body?.data?.added?.topics).toContain("simple-topic-endpoint");
    const row = await prisma.topicTemplate.findUnique({ where: { slug: "simple-topic-endpoint" } });
    expect(row).toBeNull();
  }, 15000);

  it("SUPER_ADMIN can sync for real (no dryRun) and DB reflects it", async () => {
    const { status } = await post(
      "/api/v1/super-admin/curriculum/templates/sync",
      {
        token: superAdminToken,
        body: { root: "test/fixtures/curriculum-sync-endpoint" },
      },
    );
    expect(status).toBe(200);
    const row = await prisma.topicTemplate.findUnique({ where: { slug: "simple-topic-endpoint" } });
    expect(row).toBeTruthy();
    expect(row.slug).toBe("simple-topic-endpoint");
  }, 15000);
});

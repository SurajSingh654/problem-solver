// ============================================================================
// aiTeamLimiter middleware — end-to-end integration test (W2.T8)
// ============================================================================
//
// Exercises the real `aiTeamLimiter` middleware from W2.T1 against a real
// Postgres (via the real Prisma client + TeamAIUsage model). Confirms
// Security B4 in the Learn+Teach Phase 1 spec §12:
//
//   1. A team hits its `AI_TEAM_DAILY_LIMIT` after N requests → subsequent
//      requests return 429 with `TEAM_AI_RATE_LIMITED` code.
//   2. Different teams' counters are independent (Team A at cap; Team B
//      unaffected).
//   3. Requests without team context (no `req.teamId`) pass through — the
//      middleware no-ops so SUPER_ADMIN / cross-team admin routes aren't
//      accidentally throttled.
//
// Test-app pattern: mirrors `curriculum.sync.integration.test.js` (W1.T13).
// An ephemeral Express app + `node:http` server; `fetch()` against it for
// requests. A tiny test-only middleware injects `req.teamId` from an
// `X-Test-Team-Id` header — this bypasses `requireTeamContext` (which
// requires a full auth pipeline + membership lookup) and isolates the test
// to the `aiTeamLimiter` behavior specifically.
//
// Seeding strategy: `TeamAIUsage.teamId` has an FK to `Team.id` (onDelete
// Cascade), so we can't fabricate a teamId string — we seed one real Team
// row per test-team, upsert `TeamAIUsage` at `AI_TEAM_DAILY_LIMIT - 1` (or
// `AI_TEAM_DAILY_LIMIT` for at-cap scenarios), then hit the endpoint.
// Cheaper than mocking env vars + re-importing the limiter module.
//
// Cleanup: `afterEach` deletes TeamAIUsage rows for the test teams;
// `afterAll` deletes the seeded Team + User rows (cascade removes any
// leftover TeamAIUsage).
//
// Run: cd server && npx vitest run test/integration/curriculum.rate-limit.team.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { aiTeamLimiter } from "../../src/middleware/aiTeamLimiter.middleware.js";
import { AI_TEAM_DAILY_LIMIT } from "../../src/config/env.js";

// Fixed test IDs (not cuid()) so cleanup / assertions can key on stable
// strings across test runs.
const TEST_USER_ID = "test_rlteam_user_1";
const TEAM_A_ID = "test_rlteam_a";
const TEAM_B_ID = "test_rlteam_b";

let server;
let baseUrl;

// UTC-midnight for today — mirrors `todayUtcDate()` inside ai.rateLimiter.team.js
// so seeded rows collide with the composite unique key the limiter reads.
function todayUtcDate() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Uses raw SQL for hard delete because the Prisma soft-delete middleware
// (lib/prisma.js) rewrites `prisma.user.delete` / `prisma.team.delete` to
// UPDATE deletedAt = now(). A soft-deleted row keeps the unique-id / email
// constraint occupied AND is filtered out of subsequent findUnique lookups
// (upsert's WHERE is rewritten too) — so the next test run's upsert.create
// would throw a P2002 unique-constraint error. Raw DELETE bypasses both.
async function hardDeleteTestFixtures() {
  // Order matters: TeamAIUsage has FK → Team; delete children first.
  // (Actually Team → TeamAIUsage cascades, but only on a real DELETE, and
  //  we're already using a real DELETE here, so cascade would fire — belt-
  //  and-suspenders explicit delete makes intent obvious.)
  await prisma.$executeRawUnsafe(
    `DELETE FROM "public"."team_ai_usage" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "public"."teams" WHERE "id" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "public"."users" WHERE "id" = $1`,
    TEST_USER_ID,
  );
}

async function ensureTestUser(id) {
  // Hard-delete any prior row (soft-deleted or not) then create fresh.
  // Simpler and more deterministic than upsert against the soft-delete
  // middleware.
  await prisma.user.create({
    data: {
      id,
      email: `${id}@example.test`,
      password: "not-a-real-hash",
      name: "Rate Limit Test User",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });
}

async function ensureTestTeam(id, createdById) {
  await prisma.team.create({
    data: {
      id,
      name: `Test Team ${id}`,
      status: "ACTIVE",
      createdById,
      maxMembers: 20,
      isPersonal: false,
    },
  });
}

async function seedTeamUsage(teamId, count) {
  const date = todayUtcDate();
  await prisma.teamAIUsage.upsert({
    where: { teamId_date: { teamId, date } },
    create: { teamId, date, count },
    update: { count },
  });
}

async function readTeamUsageCount(teamId) {
  const date = todayUtcDate();
  const row = await prisma.teamAIUsage.findUnique({
    where: { teamId_date: { teamId, date } },
    select: { count: true },
  });
  return row?.count ?? 0;
}

beforeAll(async () => {
  // Purge any leftover fixtures from prior aborted runs before seeding.
  await hardDeleteTestFixtures();
  await ensureTestUser(TEST_USER_ID);
  await ensureTestTeam(TEAM_A_ID, TEST_USER_ID);
  await ensureTestTeam(TEAM_B_ID, TEST_USER_ID);

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Test-only middleware injects req.teamId from the header. Bypasses the
  // real `requireTeamContext` (which needs full auth + membership lookup);
  // isolates this test to `aiTeamLimiter` behavior. Missing header → no
  // teamId set → middleware no-ops (Test 4 asserts this).
  app.post(
    "/stub/team-ai",
    (req, _res, next) => {
      const teamId = req.headers["x-test-team-id"];
      if (teamId) req.teamId = String(teamId);
      next();
    },
    aiTeamLimiter,
    (_req, res) => res.json({ success: true, data: { ok: true } }),
  );

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;
}, 30000);

afterAll(async () => {
  await hardDeleteTestFixtures();
  await new Promise((resolve) => server.close(resolve));
}, 30000);

beforeEach(async () => {
  await prisma.teamAIUsage.deleteMany({
    where: { teamId: { in: [TEAM_A_ID, TEAM_B_ID] } },
  });
});

afterEach(async () => {
  await prisma.teamAIUsage.deleteMany({
    where: { teamId: { in: [TEAM_A_ID, TEAM_B_ID] } },
  });
});

async function postStub({ teamId } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (teamId) headers["X-Test-Team-Id"] = teamId;
  const res = await fetch(baseUrl + "/stub/team-ai", { method: "POST", headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return { status: res.status, headers: res.headers, body };
}

describe("aiTeamLimiter middleware — end-to-end", () => {
  it("Test 1: team at cap → 429 with TEAM_AI_RATE_LIMITED code and Retry-After header", async () => {
    await seedTeamUsage(TEAM_A_ID, AI_TEAM_DAILY_LIMIT);

    const { status, headers, body } = await postStub({ teamId: TEAM_A_ID });

    expect(status).toBe(429);
    expect(body?.success).toBe(false);
    expect(body?.error?.code).toBe("TEAM_AI_RATE_LIMITED");
    expect(body?.error?.message).toMatch(/team ai rate limit reached/i);
    expect(headers.get("retry-after")).toBe("86400");
    // Quota headers surface the limit + remaining=0 so clients can render
    // "X/Y team requests used today".
    expect(headers.get("x-team-ai-limit")).toBe(String(AI_TEAM_DAILY_LIMIT));
    expect(headers.get("x-team-ai-remaining")).toBe("0");

    // 429 short-circuits BEFORE incrementTeam — counter stays at cap, not
    // cap+1 (regression guard: a naive "check-then-increment" could over-
    // shoot on the rejection path).
    const finalCount = await readTeamUsageCount(TEAM_A_ID);
    expect(finalCount).toBe(AI_TEAM_DAILY_LIMIT);
  });

  it("Test 2: team one under cap → 200 + increments to cap; next request → 429", async () => {
    await seedTeamUsage(TEAM_A_ID, AI_TEAM_DAILY_LIMIT - 1);

    // First request: under cap → allowed. Middleware increments to cap.
    const first = await postStub({ teamId: TEAM_A_ID });
    expect(first.status).toBe(200);
    expect(first.body?.data?.ok).toBe(true);
    expect(first.headers.get("x-team-ai-limit")).toBe(String(AI_TEAM_DAILY_LIMIT));
    // remaining is computed pre-increment (limit - count-at-check-time = 1).
    expect(first.headers.get("x-team-ai-remaining")).toBe("1");

    const countAfterFirst = await readTeamUsageCount(TEAM_A_ID);
    expect(countAfterFirst).toBe(AI_TEAM_DAILY_LIMIT);

    // Second request: now at cap → rejected.
    const second = await postStub({ teamId: TEAM_A_ID });
    expect(second.status).toBe(429);
    expect(second.body?.error?.code).toBe("TEAM_AI_RATE_LIMITED");
  });

  it("Test 3: counters are per-team — Team A at cap; Team B passes with its own counter", async () => {
    await seedTeamUsage(TEAM_A_ID, AI_TEAM_DAILY_LIMIT);
    // Team B has no seeded row → count defaults to 0.

    const teamA = await postStub({ teamId: TEAM_A_ID });
    expect(teamA.status).toBe(429);
    expect(teamA.body?.error?.code).toBe("TEAM_AI_RATE_LIMITED");

    const teamB = await postStub({ teamId: TEAM_B_ID });
    expect(teamB.status).toBe(200);
    expect(teamB.body?.data?.ok).toBe(true);

    // Team A's counter is unchanged; Team B's is 1 (this call's increment).
    expect(await readTeamUsageCount(TEAM_A_ID)).toBe(AI_TEAM_DAILY_LIMIT);
    expect(await readTeamUsageCount(TEAM_B_ID)).toBe(1);
  });

  it("Test 4: request without team context → middleware no-ops → 200 (no counter written)", async () => {
    // No X-Test-Team-Id header → req.teamId stays unset. This is the
    // SUPER_ADMIN / cross-team admin path — the limiter must not throttle
    // or write a counter without a teamId.
    const { status, body, headers } = await postStub({ teamId: undefined });

    expect(status).toBe(200);
    expect(body?.data?.ok).toBe(true);
    // No quota headers — the middleware short-circuited before res.set().
    expect(headers.get("x-team-ai-limit")).toBeNull();
    expect(headers.get("x-team-ai-remaining")).toBeNull();

    // Neither Team A nor Team B counter incremented.
    expect(await readTeamUsageCount(TEAM_A_ID)).toBe(0);
    expect(await readTeamUsageCount(TEAM_B_ID)).toBe(0);
  });
});

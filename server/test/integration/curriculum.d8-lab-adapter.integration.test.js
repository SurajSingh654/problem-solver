// ============================================================================
// curriculum — D8 lab-adapter wire test (W5.T7b)
// ============================================================================
//
// Locks in W5.T6's stats.controller wiring at the HTTP boundary:
//
//   `mapLabAttemptsToDesignSessions` is invoked BEFORE the D8 activation
//   guard, and its output is merged with `designSessionsCompleted` so a
//   curriculum-only user with STRONG LabAttempts on design concepts (LLD
//   or SD topic categories) activates D8 with a byte-identical shape to a
//   Design Studio user. Non-design topics (DSA/ALGORITHMS) must NOT bleed
//   into the D8 session counts.
//
// Real Postgres, real Express app carrying the stats router. Fixture prefix
// `test_w5t7b_` — verified non-colliding with W5.T7a (`test_w5t7a_`).
//
// The endpoint under test is `GET /api/v1/stats/report` (mounted via
// `stats.routes.js`). The D8 payload lives at
//   response.data.report.analytics.designAptitude
// with `lldSessionCount` / `sdSessionCount` / `sessionCount` counters, and
// the corresponding DimScore appears in
//   response.data.report.dimensions.find(d => d.key === "designAptitude")
// with `status: "active"` once ≥1 STRONG lab attempt on a design concept
// exists.
//
// Assertions:
//   1. Two STRONG LLD lab attempts → D8 active, lldSessionCount === 2,
//      sdSessionCount === 0, sessionCount === 2. Dim status is "active"
//      (not the "Complete a Design Studio session…" inactive placeholder).
//   2. Adding two STRONG attempts on a DSA (non-design) concept → D8 counts
//      are unchanged (lldSessionCount still 2, sdSessionCount still 0):
//      the topic-category filter blocks non-design attempts from the adapter.
//
// FEATURE_DESIGN_APTITUDE must be `true` in the test env for the D8 branch
// to execute. Server .env already sets it; the test fails loudly if not.
//
// Run: cd server && npx vitest run test/integration/curriculum.d8-lab-adapter.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import statsRouter from "../../src/routes/stats.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { FEATURE_DESIGN_APTITUDE } from "../../src/config/env.js";

const TEST_PREFIX = "test_w5t7b_";
const TEAM_ID = `${TEST_PREFIX}team`;
const USER_ID = `${TEST_PREFIX}user`;
const USER_EMAIL = `${TEST_PREFIX}user@example.test`;

// LLD Topic → Concept → Lab (in-scope for D8)
const LLD_TOPIC_ID = `${TEST_PREFIX}topic_lld`;
const LLD_CONCEPT_ID = `${TEST_PREFIX}concept_lld`;
const LLD_LAB_ID = `${TEST_PREFIX}lab_lld`;

// DSA Topic → Concept → Lab (out-of-scope for D8)
const DSA_TOPIC_ID = `${TEST_PREFIX}topic_dsa`;
const DSA_CONCEPT_ID = `${TEST_PREFIX}concept_dsa`;
const DSA_LAB_ID = `${TEST_PREFIX}lab_dsa`;

// Minimal Problem + Solution — the report endpoint short-circuits with
// an inactive-report envelope when the caller has zero Solutions, which
// happens BEFORE the D8 branch runs (see stats.controller.js @ ~L908 —
// "if (totalSolutions === 0) return buildInactiveReport(...)"). To exercise
// the D8 code path for a lab-only learner we still need one Solution row
// so control flow reaches the merged-sessions logic. This is a known gap
// in W5.T6 that the test file surfaces intentionally.
const PROBLEM_ID = `${TEST_PREFIX}problem`;
const SOLUTION_ID = `${TEST_PREFIX}solution`;

const TEST_TIMEOUT_MS = 60000;

let server;
let baseUrl;
let userToken;

async function hardDeleteFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "solutions" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "problems" WHERE "teamId" = $1`,
    TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "labs" WHERE "teamId" = $1`,
    TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concepts" WHERE "teamId" = $1`,
    TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" = $1`,
    TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "team_memberships" WHERE "teamId" = $1`,
    TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "teams" WHERE "id" = $1`,
    TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "email" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
}

async function seedStrongLabAttempt({ labId, attemptNumber }) {
  return prisma.labAttempt.create({
    data: {
      labId,
      userId: USER_ID,
      attemptNumber,
      code: `// attempt ${attemptNumber}`,
      reviewStatus: "COMPLETED",
      reviewedAt: new Date(),
      codeReviewVerdict: "STRONG",
      codeReview: { nextStep: "READY_FOR_REFERENCE" },
    },
  });
}

async function seedWeakLabAttempt({ labId, attemptNumber }) {
  return prisma.labAttempt.create({
    data: {
      labId,
      userId: USER_ID,
      attemptNumber,
      code: `// attempt ${attemptNumber}`,
      reviewStatus: "COMPLETED",
      reviewedAt: new Date(),
      codeReviewVerdict: "WEAK",
      codeReview: { nextStep: "TRY_AGAIN" },
    },
  });
}

beforeAll(async () => {
  // Sanity: if FEATURE_DESIGN_APTITUDE is off in the test env, the D8
  // branch short-circuits and this test is meaningless. Fail loudly.
  if (!FEATURE_DESIGN_APTITUDE) {
    throw new Error(
      "FEATURE_DESIGN_APTITUDE must be true for this integration test. Set it in server/.env before running.",
    );
  }

  await hardDeleteFixtures();

  await prisma.user.create({
    data: {
      id: USER_ID,
      email: USER_EMAIL,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "W5T7b Test User",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_ID,
      name: "W5T7b Team",
      status: "ACTIVE",
      createdById: USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.create({
    data: {
      userId: USER_ID,
      teamId: TEAM_ID,
      role: "MEMBER",
      isActive: true,
    },
  });

  // Minimal Problem + Solution — see note near the top constants for why
  // this is required (short-circuit at get6DReport @ ~L908).
  await prisma.problem.create({
    data: {
      id: PROBLEM_ID,
      title: "W5T7b Placeholder Problem",
      description: "Bypass the zero-solutions short-circuit.",
      difficulty: "EASY",
      category: "CODING",
      teamId: TEAM_ID,
      createdById: USER_ID,
    },
  });
  await prisma.solution.create({
    data: {
      id: SOLUTION_ID,
      problemId: PROBLEM_ID,
      userId: USER_ID,
      teamId: TEAM_ID,
      approach: "n/a",
      code: "// placeholder",
      language: "javascript",
      confidence: 3,
    },
  });

  // LOW_LEVEL_DESIGN Topic → Concept → Lab (in-scope for D8 adapter).
  await prisma.topic.create({
    data: {
      id: LLD_TOPIC_ID,
      slug: `${TEST_PREFIX}topic-lld`,
      name: "W5T7b LLD Topic",
      description: "LLD fixture (D8 in-scope).",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_ID,
      concepts: {
        create: [
          {
            id: LLD_CONCEPT_ID,
            slug: `${TEST_PREFIX}concept-lld`,
            name: "W5T7b LLD Concept",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# Primer\nBody.",
            canonicalSources: [],
            expectedQuestions: ["Q1", "Q2", "Q3"],
            assessmentCriteria: {},
            teamId: TEAM_ID,
            lab: {
              create: {
                id: LLD_LAB_ID,
                title: "W5T7b LLD Lab",
                taskMarkdown: "Do it.",
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: "// ref",
                expectedArtifacts: ["Solution"],
                status: "PUBLISHED",
                teamId: TEAM_ID,
              },
            },
          },
        ],
      },
    },
  });

  // DSA Topic → Concept → Lab (out-of-scope — attempts here MUST NOT count
  // toward D8 even when STRONG). Uses the "DSA" category which is not in
  // the adapter's DESIGN_CATEGORIES list.
  await prisma.topic.create({
    data: {
      id: DSA_TOPIC_ID,
      slug: `${TEST_PREFIX}topic-dsa`,
      name: "W5T7b DSA Topic",
      description: "DSA fixture (D8 out-of-scope).",
      category: "DSA",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_ID,
      concepts: {
        create: [
          {
            id: DSA_CONCEPT_ID,
            slug: `${TEST_PREFIX}concept-dsa`,
            name: "W5T7b DSA Concept",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# Primer\nBody.",
            canonicalSources: [],
            expectedQuestions: ["Q1", "Q2", "Q3"],
            assessmentCriteria: {},
            teamId: TEAM_ID,
            lab: {
              create: {
                id: DSA_LAB_ID,
                title: "W5T7b DSA Lab",
                taskMarkdown: "Do it.",
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: "// ref",
                expectedArtifacts: ["Solution"],
                status: "PUBLISHED",
                teamId: TEAM_ID,
              },
            },
          },
        ],
      },
    },
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/stats", statsRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  userToken = generateToken({
    id: USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_ID,
    teamRole: "MEMBER",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

async function fetchReport() {
  const res = await fetch(`${baseUrl}/api/v1/stats/report`, {
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return { status: res.status, body };
}

describe("stats.report — D8 curriculum-lab adapter (W5.T7b)", () => {
  it(
    "activates D8 with 2 STRONG LLD lab attempts and reports lldSessionCount=2, sdSessionCount=0",
    async () => {
      // Seed: 2 STRONG on LLD, 1 WEAK on LLD (WEAK must be filtered by the
      // adapter's PASSING_VERDICTS gate).
      await seedStrongLabAttempt({ labId: LLD_LAB_ID, attemptNumber: 1 });
      await seedStrongLabAttempt({ labId: LLD_LAB_ID, attemptNumber: 2 });
      await seedWeakLabAttempt({ labId: LLD_LAB_ID, attemptNumber: 3 });

      const { status, body } = await fetchReport();
      expect(status).toBe(200);
      expect(body?.success).toBe(true);

      const report = body?.data?.report;
      expect(report).toBeTruthy();

      // DimScore for D8 — must be active, not the inactive placeholder.
      const dimensions = Array.isArray(report.dimensions)
        ? report.dimensions
        : [];
      const d8Dim = dimensions.find((d) => d.key === "designAptitude");
      expect(d8Dim).toBeTruthy();
      expect(d8Dim.status).toBe("active");
      expect(d8Dim.n).toBe(2);
      // The active dim exposes count metadata for the client chip. Only the
      // two STRONG attempts should count — the WEAK is filtered.
      expect(d8Dim.designSessionCount).toBe(2);

      // Analytics block — the detailed D8 payload with sd/lld breakdown.
      const dp = report.analytics?.designAptitude;
      expect(dp).toBeTruthy();
      expect(dp.active).toBe(true);
      expect(dp.sessionCount).toBe(2);
      expect(dp.lldSessionCount).toBe(2);
      expect(dp.sdSessionCount).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "does NOT count STRONG attempts on non-design (DSA) topics toward D8 sessionCount",
    async () => {
      // Existing 2 STRONG + 1 WEAK on LLD remain from the previous test.
      // Add 2 STRONG attempts on the DSA concept — the topic-category filter
      // in `mapLabAttemptsToDesignSessions` must exclude these from D8.
      await seedStrongLabAttempt({ labId: DSA_LAB_ID, attemptNumber: 1 });
      await seedStrongLabAttempt({ labId: DSA_LAB_ID, attemptNumber: 2 });

      const { status, body } = await fetchReport();
      expect(status).toBe(200);

      const dp = body?.data?.report?.analytics?.designAptitude;
      expect(dp).toBeTruthy();
      expect(dp.active).toBe(true);
      // Still 2 — the DSA attempts must NOT increase sessionCount.
      expect(dp.sessionCount).toBe(2);
      expect(dp.lldSessionCount).toBe(2);
      expect(dp.sdSessionCount).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});

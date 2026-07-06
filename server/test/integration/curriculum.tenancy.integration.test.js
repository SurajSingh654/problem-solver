// ============================================================================
// curriculum — cross-team tenancy sweep (W6.T1)
// ============================================================================
//
// Broad tenancy integration coverage for the curriculum surface. Locks in that
// every read/write path that touches team-scoped mastery evidence filters by
// the caller's active teamId — Team A signals must NEVER leak into Team B
// state (or vice versa) for a user who is a member of both teams.
//
// Seven scenarios (spec §W6.T1):
//
//   1. `planNextAction` cross-team read isolation
//      User is MEMBER of Team A + Team B. Team A has a Topic+Concept with
//      mastery score 90 for the user. Team B has an equivalent Topic+Concept
//      with NO mastery. Calling `planNextAction(userId, teamBTopicId, teamBId)`
//      must return Team B's concept (not Team A's).
//
//   2. `detectStuck` cross-team read isolation
//      Team A has 2 consecutive practice failures (score < 40) logged in the
//      user's ConceptMastery signals. Calling `detectStuck(userId, teamBTopicId,
//      teamBId)` must NOT surface Team A's "concept-stuck" signals.
//
//   3. `planNextAction` teamId omission throws
//      The 2-arg legacy signature is a footgun — hard-fail at the boundary.
//
//   4. `detectStuck` teamId omission throws
//      Same as (3) for the sibling function.
//
//   5. `stats.controller` D8 aggregation cross-team isolation
//      Seed a STRONG LabAttempt on Team A's LLD Lab. Fetch `/api/v1/stats/report`
//      with a Team-B JWT. The D8 payload (analytics.designAptitude) must NOT
//      include Team A's attempt.
//
//   6. `conceptMastery.service` truth-table cross-team
//      User has primer_read + STRONG lab + PASS check-in on Team A's Concept.
//      Then `recordPrimerReadSignal({ userId, conceptId: teamBConceptId,
//      teamId: teamBId })`. Team B's ConceptMastery.teachingReady must stay
//      false — Team A's evidence must not satisfy Team B's truth-table.
//
//   7. SUPER_ADMIN cross-team write audit
//      A SUPER_ADMIN making a curriculum-admin write via `X-Team-Id` (or
//      `?teamId=`) writes a CurriculumAdminAuditLog row with the correct
//      resourceType/action.
//
// Fixture prefix `test_w6t1_` — verified non-colliding.
//
// Run: cd server && npx vitest run test/integration/curriculum.tenancy.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import statsRouter from "../../src/routes/stats.routes.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { FEATURE_DESIGN_APTITUDE } from "../../src/config/env.js";

import {
  planNextAction,
  detectStuck,
} from "../../src/services/mentor.service.js";
import { recordPrimerReadSignal } from "../../src/services/curriculum/conceptMastery.service.js";

const TEST_PREFIX = "test_w6t1_";
const USER_ID = `${TEST_PREFIX}user`;
const USER_EMAIL = `${TEST_PREFIX}user@example.test`;
const SUPERADMIN_USER_ID = `${TEST_PREFIX}superadmin`;
const SUPERADMIN_EMAIL = `${TEST_PREFIX}superadmin@example.test`;

const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;

// Team A fixtures
const TOPIC_A_ID = `${TEST_PREFIX}topic_a`;
const CONCEPT_A_ID = `${TEST_PREFIX}concept_a`;
const LAB_A_ID = `${TEST_PREFIX}lab_a`;

// Team B fixtures
const TOPIC_B_ID = `${TEST_PREFIX}topic_b`;
const CONCEPT_B_ID = `${TEST_PREFIX}concept_b`;
const LAB_B_ID = `${TEST_PREFIX}lab_b`;

const TEST_TIMEOUT_MS = 60000;

let server;
let baseUrl;
let userTokenTeamB;
let superAdminToken;

// Cleanup helper — `$executeRawUnsafe` bypasses the soft-delete middleware
// so test users/teams don't linger as tombstones across runs (per CLAUDE.md).
async function hardDeleteFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" IN ($1, $2)`,
    USER_ID,
    SUPERADMIN_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "curriculum_admin_audit_logs" WHERE "actorUserId" IN ($1, $2)`,
    USER_ID,
    SUPERADMIN_USER_ID,
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
    `DELETE FROM "concept_dependencies" WHERE "conceptId" LIKE $1 OR "prereqId" LIKE $1`,
    `${TEST_PREFIX}%`,
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
  if (!FEATURE_DESIGN_APTITUDE) {
    throw new Error(
      "FEATURE_DESIGN_APTITUDE must be true for this integration test. Set it in server/.env before running.",
    );
  }

  await hardDeleteFixtures();

  // Users
  await prisma.user.createMany({
    data: [
      {
        id: USER_ID,
        email: USER_EMAIL,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "W6T1 Test User",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: SUPERADMIN_USER_ID,
        email: SUPERADMIN_EMAIL,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "W6T1 Super Admin",
        globalRole: "SUPER_ADMIN",
        onboardingComplete: true,
      },
    ],
  });

  // Teams — user is a MEMBER of both.
  await prisma.team.createMany({
    data: [
      {
        id: TEAM_A_ID,
        name: "W6T1 Team A",
        status: "ACTIVE",
        createdById: USER_ID,
        maxMembers: 20,
        isPersonal: false,
      },
      {
        id: TEAM_B_ID,
        name: "W6T1 Team B",
        status: "ACTIVE",
        createdById: USER_ID,
        maxMembers: 20,
        isPersonal: false,
      },
    ],
  });
  await prisma.teamMembership.createMany({
    data: [
      {
        userId: USER_ID,
        teamId: TEAM_A_ID,
        role: "MEMBER",
        isActive: true,
      },
      {
        userId: USER_ID,
        teamId: TEAM_B_ID,
        role: "MEMBER",
        isActive: true,
      },
    ],
  });

  // Team A — LLD topic + published concept + lab.
  await prisma.topic.create({
    data: {
      id: TOPIC_A_ID,
      slug: `${TEST_PREFIX}topic-a`,
      name: "W6T1 Team A LLD Topic",
      description: "Team A curriculum fixture.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_A_ID,
    },
  });
  await prisma.concept.create({
    data: {
      id: CONCEPT_A_ID,
      topicId: TOPIC_A_ID,
      teamId: TEAM_A_ID,
      slug: `${TEST_PREFIX}concept-a`,
      name: "Team A Concept",
      order: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
      primerMarkdown: "# Team A primer",
      canonicalSources: [],
      expectedQuestions: [],
      assessmentCriteria: {},
      lab: {
        create: {
          id: LAB_A_ID,
          title: "W6T1 Team A Lab",
          taskMarkdown: "Do it.",
          language: "JAVA",
          referenceSolution: "// ref",
          expectedArtifacts: [],
          status: "PUBLISHED",
          teamId: TEAM_A_ID,
        },
      },
    },
  });

  // Team B — LLD topic + published concept + lab (parallel structure).
  await prisma.topic.create({
    data: {
      id: TOPIC_B_ID,
      slug: `${TEST_PREFIX}topic-b`,
      name: "W6T1 Team B LLD Topic",
      description: "Team B curriculum fixture.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_B_ID,
    },
  });
  await prisma.concept.create({
    data: {
      id: CONCEPT_B_ID,
      topicId: TOPIC_B_ID,
      teamId: TEAM_B_ID,
      slug: `${TEST_PREFIX}concept-b`,
      name: "Team B Concept",
      order: 1,
      status: "PUBLISHED",
      publishedAt: new Date(),
      primerMarkdown: "# Team B primer",
      canonicalSources: [],
      expectedQuestions: [],
      assessmentCriteria: {},
      lab: {
        create: {
          id: LAB_B_ID,
          title: "W6T1 Team B Lab",
          taskMarkdown: "Do it.",
          language: "JAVA",
          referenceSolution: "// ref",
          expectedArtifacts: [],
          status: "PUBLISHED",
          teamId: TEAM_B_ID,
        },
      },
    },
  });

  // TopicEnrollment for BOTH teams' topics — required so planNextAction
  // gets past the enrollment/calibration gate and exercises loadTopicState.
  await prisma.topicEnrollment.createMany({
    data: [
      {
        userId: USER_ID,
        topicId: TOPIC_A_ID,
        preferences: {},
        calibration: { score: 5, total: 8, takenAt: new Date().toISOString() },
        status: "ACTIVE",
        lastActiveAt: new Date(),
      },
      {
        userId: USER_ID,
        topicId: TOPIC_B_ID,
        preferences: {},
        calibration: { score: 5, total: 8, takenAt: new Date().toISOString() },
        status: "ACTIVE",
        lastActiveAt: new Date(),
      },
    ],
  });

  // Build HTTP surface — statsRouter (for D8 case 5) and curriculumAdminRouter
  // (for SA-audit case 7). Auth middleware needs `authenticate` in the chain,
  // which each router installs itself.
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/stats", statsRouter);
  app.use("/api/v1/curriculum/admin", curriculumAdminRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  // User is MEMBER of both teams; issue a Team-B-scoped JWT.
  userTokenTeamB = generateToken({
    id: USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_B_ID,
    teamRole: "MEMBER",
  });

  // SUPER_ADMIN currentTeamId is Team A (their "home"); they'll override
  // into Team B via X-Team-Id header to trigger the audit path.
  superAdminToken = generateToken({
    id: SUPERADMIN_USER_ID,
    globalRole: "SUPER_ADMIN",
    currentTeamId: TEAM_A_ID,
    teamRole: null,
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

// ============================================================================
// Case 1 — planNextAction cross-team read isolation
// ============================================================================

describe("test_w6t1_planNextAction — cross-team read isolation", () => {
  it(
    "returns Team B's concept (not Team A's) when called with Team B context",
    async () => {
      // Seed Team A mastery to score 90 for Concept A. Team B has NO mastery
      // row — expected to route to INTAKE on Concept B.
      await prisma.conceptMastery.upsert({
        where: {
          userId_conceptId: { userId: USER_ID, conceptId: CONCEPT_A_ID },
        },
        create: {
          userId: USER_ID,
          conceptId: CONCEPT_A_ID,
          score: 90,
          signals: [
            {
              source: "practice",
              value: 90,
              at: new Date().toISOString(),
              evidence: null,
            },
          ],
          teachingReady: true,
        },
        update: {
          score: 90,
          teachingReady: true,
        },
      });

      const result = await planNextAction(USER_ID, TOPIC_B_ID, TEAM_B_ID);
      expect(result).toBeTruthy();
      // Team B has NO mastery on Concept B → stage should be INTAKE, and
      // the concept must be Team B's, not Team A's.
      expect(result.stage).toBe("INTAKE");
      expect(result.concept).toBeTruthy();
      expect(result.concept.id).toBe(CONCEPT_B_ID);
      expect(result.concept.id).not.toBe(CONCEPT_A_ID);
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Case 2 — detectStuck cross-team read isolation
// ============================================================================

describe("test_w6t1_detectStuck — cross-team read isolation", () => {
  it(
    "does NOT surface Team A's stuck signals when called with Team B context",
    async () => {
      // Seed Team A with 3 consecutive practice failures — this would
      // trigger a "concept-stuck" signal for Team A.
      await prisma.conceptMastery.upsert({
        where: {
          userId_conceptId: { userId: USER_ID, conceptId: CONCEPT_A_ID },
        },
        create: {
          userId: USER_ID,
          conceptId: CONCEPT_A_ID,
          score: 20,
          signals: [
            { source: "practice", value: 20, at: new Date(Date.now() - 3000).toISOString() },
            { source: "practice", value: 30, at: new Date(Date.now() - 2000).toISOString() },
            { source: "practice", value: 25, at: new Date(Date.now() - 1000).toISOString() },
          ],
          teachingReady: false,
        },
        update: {
          score: 20,
          signals: [
            { source: "practice", value: 20, at: new Date(Date.now() - 3000).toISOString() },
            { source: "practice", value: 30, at: new Date(Date.now() - 2000).toISOString() },
            { source: "practice", value: 25, at: new Date(Date.now() - 1000).toISOString() },
          ],
        },
      });

      // Team B has NO mastery signals — should be NOT stuck.
      const result = await detectStuck(USER_ID, TOPIC_B_ID, TEAM_B_ID);
      expect(result).toBeTruthy();
      // If Team A's signals leaked in, we'd see stuck === true with a
      // concept-stuck:{CONCEPT_A_ID} signal. Filtering must exclude that.
      const leakedTeamASignals = (result.signals ?? []).filter((s) =>
        s.includes(CONCEPT_A_ID),
      );
      expect(leakedTeamASignals).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Case 3 — planNextAction teamId omission throws
// ============================================================================

describe("test_w6t1_planNextAction — teamId omission is a hard error", () => {
  it("rejects when teamId is not passed", async () => {
    await expect(planNextAction(USER_ID, TOPIC_B_ID)).rejects.toThrow(
      /teamId required/,
    );
  });
});

// ============================================================================
// Case 4 — detectStuck teamId omission throws
// ============================================================================

describe("test_w6t1_detectStuck — teamId omission is a hard error", () => {
  it("rejects when teamId is not passed", async () => {
    await expect(detectStuck(USER_ID, TOPIC_B_ID)).rejects.toThrow(
      /teamId required/,
    );
  });
});

// ============================================================================
// Case 5 — stats.controller D8 cross-team isolation (HTTP wire)
// ============================================================================

describe("test_w6t1_stats_d8 — cross-team D8 isolation on /stats/report", () => {
  it(
    "does NOT count Team A's STRONG lab attempts in Team B's D8 sessionCount",
    async () => {
      // Seed a STRONG lab attempt on Team A's lab — MUST NOT count toward
      // Team B's D8 aggregation.
      await prisma.labAttempt.create({
        data: {
          labId: LAB_A_ID,
          userId: USER_ID,
          attemptNumber: 1,
          code: "// a1",
          reviewStatus: "COMPLETED",
          codeReviewVerdict: "STRONG",
          reviewedAt: new Date(),
        },
      });

      const res = await fetch(`${baseUrl}/api/v1/stats/report`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${userTokenTeamB}`,
          "Content-Type": "application/json",
        },
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body?.success).toBe(true);

      // On Team B, the report may return the inactive envelope (no
      // solutions + no in-scope lab peek). Either way, sessionCount for
      // designAptitude MUST be zero — Team A's STRONG attempt must NOT
      // leak. Assert defensively across both envelope shapes.
      const dp = body?.data?.report?.analytics?.designAptitude;
      if (dp) {
        expect(dp.sessionCount ?? 0).toBe(0);
        expect(dp.lldSessionCount ?? 0).toBe(0);
      }
      // The dimension entry (if present) must not be active from Team A
      // evidence bleeding through.
      const dimensions = body?.data?.report?.dimensions ?? [];
      const d8Dim = dimensions.find((d) => d.key === "designAptitude");
      if (d8Dim) {
        expect(d8Dim.status).not.toBe("active");
      }
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Case 6 — conceptMastery truth-table cross-team isolation
// ============================================================================

describe("test_w6t1_teachingReady — cross-team truth-table isolation", () => {
  it(
    "does NOT flip teachingReady on Team B when Team A has full evidence",
    async () => {
      // ── Team A: satisfy the full truth-table for Concept A. ──
      // 1. primer_read + practice signals seeded via ConceptMastery.
      await prisma.conceptMastery.upsert({
        where: {
          userId_conceptId: { userId: USER_ID, conceptId: CONCEPT_A_ID },
        },
        create: {
          userId: USER_ID,
          conceptId: CONCEPT_A_ID,
          score: 80,
          signals: [
            {
              source: "primer_read",
              value: 10,
              at: new Date().toISOString(),
              evidence: null,
            },
          ],
          teachingReady: false,
        },
        update: {
          score: 80,
          signals: [
            {
              source: "primer_read",
              value: 10,
              at: new Date().toISOString(),
              evidence: null,
            },
          ],
          teachingReady: false,
        },
      });
      // 2. STRONG lab attempt on Team A's lab.
      await prisma.labAttempt.create({
        data: {
          labId: LAB_A_ID,
          userId: USER_ID,
          attemptNumber: 2,
          code: "// a2",
          reviewStatus: "COMPLETED",
          codeReviewVerdict: "STRONG",
          reviewedAt: new Date(),
        },
      });
      // 3. PASS check-in on Team A's concept.
      await prisma.conceptCheckIn.create({
        data: {
          conceptId: CONCEPT_A_ID,
          userId: USER_ID,
          attemptNumber: 1,
          recallAnswer: "r",
          applyAnswer: "a",
          buildAnswer: "b",
          preConfidence: 4,
          aiVerdict: "PASS",
          aiFeedback: {},
          calibrationDelta: 0.1,
        },
      });

      // Call recordPrimerReadSignal against TEAM B's concept, with
      // teamId=TEAM_B_ID. The auto-flip check must scope to Team B and
      // find NO evidence — teachingReady on Team B's ConceptMastery
      // stays false.
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: CONCEPT_B_ID,
        teamId: TEAM_B_ID,
      });

      const teamBMastery = await prisma.conceptMastery.findUnique({
        where: {
          userId_conceptId: { userId: USER_ID, conceptId: CONCEPT_B_ID },
        },
      });
      expect(teamBMastery).toBeTruthy();
      // The primer_read write on Team B should have created the mastery row
      // (or updated it) but teachingReady MUST remain false — Team A's
      // STRONG lab + PASS check-in must NOT satisfy Team B's truth-table.
      expect(teamBMastery.teachingReady).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Case 7 — SUPER_ADMIN cross-team write audit
// ============================================================================

describe("test_w6t1_superadmin_audit — cross-team write writes audit row", () => {
  it(
    "writes a CurriculumAdminAuditLog row on X-Team-Id override write",
    async () => {
      // Scrub any prior audit rows so the assertion is deterministic.
      await prisma.$executeRawUnsafe(
        `DELETE FROM "curriculum_admin_audit_logs" WHERE "actorUserId" = $1`,
        SUPERADMIN_USER_ID,
      );

      const res = await fetch(`${baseUrl}/api/v1/curriculum/admin/topics`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          "Content-Type": "application/json",
          "X-Team-Id": TEAM_B_ID,
        },
        body: JSON.stringify({
          slug: `${TEST_PREFIX}sa-override-topic`,
          name: "SA Override Topic",
          description: "Cross-team override audit test.",
          category: "LOW_LEVEL_DESIGN",
        }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body?.data?.topic?.teamId).toBe(TEAM_B_ID);

      const rows = await prisma.curriculumAdminAuditLog.findMany({
        where: { actorUserId: SUPERADMIN_USER_ID },
        orderBy: { createdAt: "asc" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorUserId: SUPERADMIN_USER_ID,
        actorRole: "SUPER_ADMIN",
        targetTeamId: TEAM_B_ID,
        action: "TOPIC_CREATE",
      });
      expect(rows[0].payload).toMatchObject({
        topicId: body.data.topic.id,
        slug: `${TEST_PREFIX}sa-override-topic`,
      });
    },
    TEST_TIMEOUT_MS,
  );
});

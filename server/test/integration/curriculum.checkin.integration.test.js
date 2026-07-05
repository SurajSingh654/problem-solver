// ============================================================================
// curriculum concept check-in — integration test (W4.T3)
// ============================================================================
//
// Exercises the 3-question grader gate at
//   POST /curriculum/concepts/:slug/checkin
//
// Middleware chain (per curriculum.routes.js): authenticate → requireTeamContext
// → aiLimiter → aiTeamLimiter → submitCheckIn.
//
// Unlike lab-attempt submit (W4.T2), CHECK_IN is a synchronous AI call:
// runValidator("CHECK_IN", ...) is awaited before the 201 response. We mock
// the validator via `_overrideValidatorSpec("CHECK_IN", { aiComplete: ... })`
// per test so no real OpenAI call fires and we can drive specific verdicts.
// Every test's cleanup calls `initCurriculumValidators()` to re-register the
// pristine spec (belt-and-suspenders with the per-type restore map — the
// registerValidator call is idempotent-shaped-as-a-no-op if `_initialized`
// is already true, so we also call `_resetInitForTest()` — but the
// _originalSpecs restore map is the authoritative reset path).
//
// Fixture prefix `test_w4t3chk_` — distinct from the reveal test's
// `test_w4t3rev_` so parallel runs don't collide.
//
// Run: cd server && npx vitest run test/integration/curriculum.checkin.integration.test.js
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumRouter from "../../src/routes/curriculum.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { _overrideValidatorSpec } from "../../src/services/curriculum/contentReview.service.js";
import { initCurriculumValidators } from "../../src/services/curriculum/registerValidators.js";

// Register real validator specs before any test — mocking via
// _overrideValidatorSpec requires an existing spec to patch.
initCurriculumValidators();

const TEST_PREFIX = "test_w4t3chk_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const LEARNER_A_USER_ID = `${TEST_PREFIX}learner_a`;
const LEARNER_B_USER_ID = `${TEST_PREFIX}learner_b`;

const A_TOPIC_SLUG = `${TEST_PREFIX}a-topic`;
const A_CONCEPT_SLUG = `${TEST_PREFIX}a-concept`;
const A_CONCEPT_NO_LAB_SLUG = `${TEST_PREFIX}a-concept-no-lab`;
const A_DRAFT_CONCEPT_SLUG = `${TEST_PREFIX}a-draft-concept`;
const B_TOPIC_SLUG = `${TEST_PREFIX}b-topic`;
const B_CONCEPT_SLUG = `${TEST_PREFIX}b-concept`;

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let learnerAToken;

let aPublishedLabId;
let aConceptId;

/**
 * Restore any validator specs overridden mid-test. Same pattern as
 * curriculum.attempt.integration.test.js.
 */
const _originalSpecs = new Map();
function overrideValidator(type, patch) {
  const original = _overrideValidatorSpec(type, patch);
  if (!_originalSpecs.has(type)) {
    _originalSpecs.set(type, original);
  }
}

function buildPassCheckInResponse() {
  return {
    perQuestion: {
      recall: { verdict: "PASS", feedback: "Solid recall." },
      apply: { verdict: "PASS", feedback: "Good application." },
      build: {
        verdict: "PARTIAL",
        feedback: "Structure is OK, edge cases missing.",
      },
    },
    overallVerdict: "PASS",
    calibrationDelta: 0.15,
    encouragement: "Nice work — you're calibrated well on this concept.",
  };
}

async function hardDeleteTestFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_USER_ID,
    LEARNER_B_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_USER_ID,
    LEARNER_B_USER_ID,
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
    `DELETE FROM "concept_masteries" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_USER_ID,
    LEARNER_B_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_USER_ID,
    LEARNER_B_USER_ID,
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
        id: LEARNER_A_USER_ID,
        email: `${TEST_PREFIX}learner_a@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "CheckIn Learner A",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: LEARNER_B_USER_ID,
        email: `${TEST_PREFIX}learner_b@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "CheckIn Learner B",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "CheckIn Team A",
      status: "ACTIVE",
      createdById: LEARNER_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "CheckIn Team B",
      status: "ACTIVE",
      createdById: LEARNER_B_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.createMany({
    data: [
      {
        userId: LEARNER_A_USER_ID,
        teamId: TEAM_A_ID,
        role: "MEMBER",
        isActive: true,
      },
      {
        userId: LEARNER_B_USER_ID,
        teamId: TEAM_B_ID,
        role: "MEMBER",
        isActive: true,
      },
    ],
  });

  // Team A:
  //   - PUBLISHED concept with populated expectedQuestions + a PUBLISHED lab
  //   - PUBLISHED concept with NO lab (CHECKIN_LOCKED_NO_LAB probe)
  //   - DRAFT concept (404 probe)
  const aTopic = await prisma.topic.create({
    data: {
      slug: A_TOPIC_SLUG,
      name: "CheckIn Topic A",
      description: "CheckIn target.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_A_ID,
      concepts: {
        create: [
          {
            slug: A_CONCEPT_SLUG,
            name: "CheckIn Concept A",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# CheckIn Concept A\nPrimer body with content.",
            canonicalSources: [],
            expectedQuestions: [
              "What is the core idea?",
              "How would you apply it?",
              "Build a small example.",
            ],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
            lab: {
              create: {
                title: "CheckIn Lab",
                taskMarkdown: "Solve it.",
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: "// ref",
                expectedArtifacts: ["Solution"],
                status: "PUBLISHED",
                teamId: TEAM_A_ID,
              },
            },
          },
          {
            slug: A_CONCEPT_NO_LAB_SLUG,
            name: "CheckIn Concept No Lab",
            order: 2,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# No lab here.",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
            // No lab child — CHECKIN_LOCKED_NO_LAB.
          },
          {
            slug: A_DRAFT_CONCEPT_SLUG,
            name: "CheckIn Draft Concept",
            order: 3,
            status: "DRAFT",
            primerMarkdown: "# draft",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
          },
        ],
      },
    },
    include: { concepts: { include: { lab: true } } },
  });
  const aPublishedConcept = aTopic.concepts.find(
    (c) => c.slug === A_CONCEPT_SLUG,
  );
  aConceptId = aPublishedConcept.id;
  aPublishedLabId = aPublishedConcept.lab.id;

  // Team B: cross-team concept (404 probe).
  await prisma.topic.create({
    data: {
      slug: B_TOPIC_SLUG,
      name: "CheckIn Topic B",
      description: "Cross-team.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_B_ID,
      concepts: {
        create: [
          {
            slug: B_CONCEPT_SLUG,
            name: "CheckIn Concept B",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# B",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_B_ID,
            lab: {
              create: {
                title: "B Lab",
                taskMarkdown: "B.",
                language: "JAVA",
                starterCode: "",
                referenceSolution: "// B ref",
                expectedArtifacts: [],
                status: "PUBLISHED",
                teamId: TEAM_B_ID,
              },
            },
          },
        ],
      },
    },
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/curriculum", curriculumRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  learnerAToken = generateToken({
    id: LEARNER_A_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_A_ID,
    teamRole: "MEMBER",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

afterEach(() => {
  // Restore any validator specs overridden in the test. Belt-and-suspenders:
  // per-type restore via the tracked map AND a fresh initCurriculumValidators
  // call (idempotent — no-op after first call). Without the restore map, a
  // later test file that imports this module would inherit the mock.
  for (const [type, original] of _originalSpecs.entries()) {
    _overrideValidatorSpec(type, original);
  }
  _originalSpecs.clear();
  initCurriculumValidators();
});

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

async function resetCheckInsAndAttemptsForA() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" = $1 AND "conceptId" = $2`,
    LEARNER_A_USER_ID,
    aConceptId,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1 AND "labId" = $2`,
    LEARNER_A_USER_ID,
    aPublishedLabId,
  );
}

async function seedCompletedAttempt(verdict) {
  return prisma.labAttempt.create({
    data: {
      labId: aPublishedLabId,
      userId: LEARNER_A_USER_ID,
      attemptNumber: 1,
      code: "// seeded",
      reviewStatus: "COMPLETED",
      reviewedAt: new Date(),
      codeReviewVerdict: verdict,
      codeReview: { nextStep: "READY_FOR_REFERENCE" },
    },
  });
}

function validCheckInBody() {
  return {
    recallAnswer: "The idea is X.",
    applyAnswer: "Apply it by Y.",
    buildAnswer: "Here is a snippet: ...",
    preConfidence: 4,
  };
}

// ─────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────

describe("POST /curriculum/concepts/:slug/checkin — 401 / 404 / 400 gates", () => {
  it(
    "returns 401 without a token",
    async () => {
      const { status } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        { body: validCheckInBody() },
      );
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 for a concept in another team",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${B_CONCEPT_SLUG}/checkin`,
        { token: learnerAToken, body: validCheckInBody() },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 for a DRAFT concept (not learner-visible)",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_DRAFT_CONCEPT_SLUG}/checkin`,
        { token: learnerAToken, body: validCheckInBody() },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 400 for invalid body: missing/empty/out-of-range fields",
    async () => {
      // Missing buildAnswer entirely.
      const missing = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        {
          token: learnerAToken,
          body: {
            recallAnswer: "r",
            applyAnswer: "a",
            preConfidence: 3,
          },
        },
      );
      expect(missing.status).toBe(400);
      expect(missing.body?.error?.code).toBe("INVALID_BODY");

      // Empty string buildAnswer.
      const empty = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        {
          token: learnerAToken,
          body: {
            ...validCheckInBody(),
            buildAnswer: "",
          },
        },
      );
      expect(empty.status).toBe(400);
      expect(empty.body?.error?.code).toBe("INVALID_BODY");

      // preConfidence out of range (0).
      const low = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        {
          token: learnerAToken,
          body: {
            ...validCheckInBody(),
            preConfidence: 0,
          },
        },
      );
      expect(low.status).toBe(400);
      expect(low.body?.error?.code).toBe("INVALID_BODY");

      // preConfidence out of range (6).
      const high = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        {
          token: learnerAToken,
          body: {
            ...validCheckInBody(),
            preConfidence: 6,
          },
        },
      );
      expect(high.status).toBe(400);
      expect(high.body?.error?.code).toBe("INVALID_BODY");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/concepts/:slug/checkin — 403 unlock gates", () => {
  it(
    "returns 403 CHECKIN_LOCKED_NO_LAB when the concept has no lab",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_NO_LAB_SLUG}/checkin`,
        { token: learnerAToken, body: validCheckInBody() },
      );
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("CHECKIN_LOCKED_NO_LAB");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 CHECKIN_LOCKED when user has no STRONG/ADEQUATE lab attempt",
    async () => {
      await resetCheckInsAndAttemptsForA();

      // Seed WEAK attempt only — no STRONG/ADEQUATE gate pass.
      await prisma.labAttempt.create({
        data: {
          labId: aPublishedLabId,
          userId: LEARNER_A_USER_ID,
          attemptNumber: 1,
          code: "// weak",
          reviewStatus: "COMPLETED",
          reviewedAt: new Date(),
          codeReviewVerdict: "WEAK",
          codeReview: { nextStep: "ADDRESS_AND_RESUBMIT" },
        },
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        { token: learnerAToken, body: validCheckInBody() },
      );
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("CHECKIN_LOCKED");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/concepts/:slug/checkin — happy path (201)", () => {
  it(
    "returns 201 with checkIn row + AI verdict + calibrationDelta",
    async () => {
      await resetCheckInsAndAttemptsForA();
      await seedCompletedAttempt("STRONG");

      overrideValidator("CHECK_IN", {
        aiComplete: vi
          .fn()
          .mockResolvedValue(JSON.stringify(buildPassCheckInResponse())),
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        { token: learnerAToken, body: validCheckInBody() },
      );
      expect(status).toBe(201);
      expect(body?.data?.checkIn?.attemptNumber).toBe(1);
      expect(body?.data?.checkIn?.aiVerdict).toBe("PASS");
      expect(body?.data?.checkIn?.calibrationDelta).toBe(0.15);
      expect(body?.data?.usedFallback).toBe(false);

      // DB row persisted.
      const rows = await prisma.conceptCheckIn.findMany({
        where: { userId: LEARNER_A_USER_ID, conceptId: aConceptId },
        orderBy: { attemptNumber: "asc" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].aiVerdict).toBe("PASS");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "re-check-in: a second POST allocates attemptNumber=2",
    async () => {
      await resetCheckInsAndAttemptsForA();
      await seedCompletedAttempt("ADEQUATE");

      overrideValidator("CHECK_IN", {
        aiComplete: vi
          .fn()
          .mockResolvedValue(JSON.stringify(buildPassCheckInResponse())),
      });

      const first = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        { token: learnerAToken, body: validCheckInBody() },
      );
      expect(first.status).toBe(201);
      expect(first.body?.data?.checkIn?.attemptNumber).toBe(1);

      const second = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        { token: learnerAToken, body: validCheckInBody() },
      );
      expect(second.status).toBe(201);
      expect(second.body?.data?.checkIn?.attemptNumber).toBe(2);

      // Both rows persist.
      const rows = await prisma.conceptCheckIn.findMany({
        where: { userId: LEARNER_A_USER_ID, conceptId: aConceptId },
        orderBy: { attemptNumber: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].attemptNumber).toBe(1);
      expect(rows[1].attemptNumber).toBe(2);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "fallback path: when aiComplete throws, still writes a row with usedFallback=true + PARTIAL verdict",
    async () => {
      await resetCheckInsAndAttemptsForA();
      await seedCompletedAttempt("STRONG");

      overrideValidator("CHECK_IN", {
        aiComplete: vi.fn().mockRejectedValue(new Error("openai down")),
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        { token: learnerAToken, body: validCheckInBody() },
      );
      expect(status).toBe(201);
      expect(body?.data?.usedFallback).toBe(true);
      // Fallback (`buildFallbackCheckIn`) returns overallVerdict=PARTIAL.
      expect(body?.data?.checkIn?.aiVerdict).toBe("PARTIAL");
      // Fallback calibrationDelta is 0.5 (neutral).
      expect(body?.data?.checkIn?.calibrationDelta).toBe(0.5);

      const rows = await prisma.conceptCheckIn.findMany({
        where: { userId: LEARNER_A_USER_ID, conceptId: aConceptId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].aiVerdict).toBe("PARTIAL");
    },
    TEST_TIMEOUT_MS,
  );
});

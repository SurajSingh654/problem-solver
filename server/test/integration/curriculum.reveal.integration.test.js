// ============================================================================
// curriculum reveal-reference gate — integration test (W4.T3)
// ============================================================================
//
// Exercises the struggle-first gate at
//   POST /curriculum/labs/:id/reveal-reference
//
// Middleware chain (per curriculum.routes.js): authenticate → requireTeamContext
// → revealReference (no rate limiter on this path — it's deterministic DB-only).
//
// The controller does NOT call AI or the runValidator orchestrator, so this
// test file does not mock any validator spec. LabAttempt rows are seeded
// directly via `prisma.labAttempt.create` (bypassing the async submit
// pipeline — we're testing the reveal gate, not the submit flow) with
// `reviewStatus`, `codeReviewVerdict`, and `codeReview` set explicitly.
//
// Fixture prefix `test_w4t3rev_` — distinct from the check-in test's
// `test_w4t3chk_` so parallel runs don't collide.
//
// Run: cd server && npx vitest run test/integration/curriculum.reveal.integration.test.js
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumRouter from "../../src/routes/curriculum.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { initCurriculumValidators } from "../../src/services/curriculum/registerValidators.js";

// Ensure the real validator specs are registered — reveal-reference doesn't
// use them, but importing the router transitively loads the orchestrator
// module. Idempotent init is safe.
initCurriculumValidators();

const TEST_PREFIX = "test_w4t3rev_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const LEARNER_A_USER_ID = `${TEST_PREFIX}learner_a`;
const LEARNER_B_USER_ID = `${TEST_PREFIX}learner_b`;

const A_TOPIC_SLUG = `${TEST_PREFIX}a-topic`;
const A_CONCEPT_SLUG = `${TEST_PREFIX}a-concept`;
const A_DRAFT_CONCEPT_SLUG = `${TEST_PREFIX}a-draft-concept`;
const B_TOPIC_SLUG = `${TEST_PREFIX}b-topic`;
const B_CONCEPT_SLUG = `${TEST_PREFIX}b-concept`;

const REFERENCE_SOLUTION = "// File: Main.java\npublic class Main {}";

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let learnerAToken;

let aPublishedLabId;
let aDraftLabId;
let bPublishedLabId;

async function hardDeleteTestFixtures() {
  // Order: attempts → check-ins → labs → concepts → topic_enrollments →
  // topics → team_memberships → teams → users. content_review_logs are
  // scrubbed by prefix (no FK, polymorphic target).
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_USER_ID,
    LEARNER_B_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" IN ($1, $2)`,
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
        name: "Reveal Learner A",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: LEARNER_B_USER_ID,
        email: `${TEST_PREFIX}learner_b@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Reveal Learner B",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "Reveal Team A",
      status: "ACTIVE",
      createdById: LEARNER_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "Reveal Team B",
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

  // Team A: PUBLISHED Topic + PUBLISHED Concept + PUBLISHED Lab (with
  // reference solution). Also a DRAFT concept-under-published-topic whose
  // (DRAFT) child lab we can probe for the 404 case.
  const aTopic = await prisma.topic.create({
    data: {
      slug: A_TOPIC_SLUG,
      name: "Reveal Topic A",
      description: "Reveal target.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_A_ID,
      concepts: {
        create: [
          {
            slug: A_CONCEPT_SLUG,
            name: "Reveal Concept A",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# Reveal Concept A\nPrimer.",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
            lab: {
              create: {
                title: "Reveal Lab",
                taskMarkdown: "Solve it.",
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: REFERENCE_SOLUTION,
                expectedArtifacts: ["Solution"],
                status: "PUBLISHED",
                teamId: TEAM_A_ID,
              },
            },
          },
          {
            slug: A_DRAFT_CONCEPT_SLUG,
            name: "Reveal Concept A (draft)",
            order: 2,
            status: "DRAFT",
            primerMarkdown: "# draft",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
            lab: {
              create: {
                title: "Draft Lab",
                taskMarkdown: "Draft.",
                language: "JAVA",
                starterCode: "",
                referenceSolution: "// draft ref",
                expectedArtifacts: [],
                status: "DRAFT",
                teamId: TEAM_A_ID,
              },
            },
          },
        ],
      },
    },
    include: { concepts: { include: { lab: true } } },
  });
  aPublishedLabId = aTopic.concepts.find((c) => c.slug === A_CONCEPT_SLUG).lab
    .id;
  aDraftLabId = aTopic.concepts.find((c) => c.slug === A_DRAFT_CONCEPT_SLUG)
    .lab.id;

  // Team B: cross-team lab (Team A learner should 404).
  const bTopic = await prisma.topic.create({
    data: {
      slug: B_TOPIC_SLUG,
      name: "Reveal Topic B",
      description: "Cross-team.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_B_ID,
      concepts: {
        create: [
          {
            slug: B_CONCEPT_SLUG,
            name: "Reveal Concept B",
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
    include: { concepts: { include: { lab: true } } },
  });
  bPublishedLabId = bTopic.concepts.find((c) => c.slug === B_CONCEPT_SLUG).lab
    .id;

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

/**
 * Wipe all attempts for LEARNER_A/aPublishedLabId. Called at the top of each
 * scenario so seed state doesn't leak between tests.
 */
async function resetAttemptsForA() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1 AND "labId" = $2`,
    LEARNER_A_USER_ID,
    aPublishedLabId,
  );
}

/**
 * Seed a LabAttempt row directly (bypassing the async submit pipeline). We're
 * testing the reveal gate, not the submit flow — direct seeding lets us pin
 * `reviewStatus`, `codeReviewVerdict`, and `codeReview` to specific values.
 */
async function seedAttempt({
  attemptNumber,
  reviewStatus = "COMPLETED",
  codeReviewVerdict,
  codeReview,
  submittedAt,
}) {
  return prisma.labAttempt.create({
    data: {
      labId: aPublishedLabId,
      userId: LEARNER_A_USER_ID,
      attemptNumber,
      code: "// seeded",
      reviewStatus,
      codeReviewVerdict,
      codeReview,
      submittedAt: submittedAt ?? undefined,
      reviewedAt: reviewStatus === "COMPLETED" ? new Date() : undefined,
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────

describe("POST /curriculum/labs/:id/reveal-reference — 404 / 401 gates", () => {
  it(
    "returns 401 without a token",
    async () => {
      const { status } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/reveal-reference`,
      );
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 when the lab is in another team",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${bPublishedLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("LAB_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 when the lab is DRAFT (not learner-visible)",
    async () => {
      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aDraftLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("LAB_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/labs/:id/reveal-reference — 403 struggle-first gates", () => {
  it(
    "returns 403 REVEAL_BLOCKED_NO_ATTEMPT when the user has no completed attempts",
    async () => {
      await resetAttemptsForA();

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("REVEAL_BLOCKED_NO_ATTEMPT");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 REVEAL_BLOCKED_VERDICT when the latest attempt verdict is WEAK",
    async () => {
      await resetAttemptsForA();

      await seedAttempt({
        attemptNumber: 1,
        codeReviewVerdict: "WEAK",
        codeReview: { nextStep: "ADDRESS_AND_RESUBMIT" },
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("REVEAL_BLOCKED_VERDICT");
      expect(body?.error?.details?.codeReviewVerdict).toBe("WEAK");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 403 REVEAL_BLOCKED_NEXT_STEP when verdict is STRONG but nextStep != READY_FOR_REFERENCE",
    async () => {
      await resetAttemptsForA();

      await seedAttempt({
        attemptNumber: 1,
        codeReviewVerdict: "STRONG",
        codeReview: { nextStep: "MINI_DRILL" },
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(status).toBe(403);
      expect(body?.error?.code).toBe("REVEAL_BLOCKED_NEXT_STEP");
      expect(body?.error?.details?.nextStep).toBe("MINI_DRILL");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/labs/:id/reveal-reference — happy path + latest-attempt semantics", () => {
  it(
    "returns 200 with referenceSolution when latest attempt is STRONG + READY_FOR_REFERENCE",
    async () => {
      await resetAttemptsForA();

      const seeded = await seedAttempt({
        attemptNumber: 1,
        codeReviewVerdict: "STRONG",
        codeReview: {
          nextStep: "READY_FOR_REFERENCE",
          overall: "Great job.",
        },
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(status).toBe(200);
      expect(body?.data?.referenceSolution).toBe(REFERENCE_SOLUTION);
      expect(body?.data?.attempt?.id).toBe(seeded.id);
      expect(body?.data?.attempt?.revealedReferenceAt).toBeTruthy();

      // Verify DB row stamp too.
      const persisted = await prisma.labAttempt.findUnique({
        where: { id: seeded.id },
      });
      expect(persisted?.revealedReferenceAt).toBeTruthy();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "uses the LATEST completed attempt (WEAK older, STRONG newer → 200)",
    async () => {
      await resetAttemptsForA();

      // Older WEAK attempt.
      await seedAttempt({
        attemptNumber: 1,
        codeReviewVerdict: "WEAK",
        codeReview: { nextStep: "ADDRESS_AND_RESUBMIT" },
        submittedAt: new Date(Date.now() - 60_000),
      });
      // Newer STRONG + READY attempt.
      const strong = await seedAttempt({
        attemptNumber: 2,
        codeReviewVerdict: "STRONG",
        codeReview: { nextStep: "READY_FOR_REFERENCE" },
        submittedAt: new Date(),
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(status).toBe(200);
      expect(body?.data?.referenceSolution).toBe(REFERENCE_SOLUTION);
      expect(body?.data?.attempt?.id).toBe(strong.id);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "filters out PENDING attempts when picking the latest completed one",
    async () => {
      await resetAttemptsForA();

      // Older completed STRONG attempt.
      const strong = await seedAttempt({
        attemptNumber: 1,
        reviewStatus: "COMPLETED",
        codeReviewVerdict: "STRONG",
        codeReview: { nextStep: "READY_FOR_REFERENCE" },
        submittedAt: new Date(Date.now() - 60_000),
      });
      // Newer PENDING attempt (should NOT be picked — reviewStatus filter).
      await prisma.labAttempt.create({
        data: {
          labId: aPublishedLabId,
          userId: LEARNER_A_USER_ID,
          attemptNumber: 2,
          code: "// pending",
          reviewStatus: "PENDING",
          submittedAt: new Date(),
        },
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(status).toBe(200);
      expect(body?.data?.attempt?.id).toBe(strong.id);
    },
    TEST_TIMEOUT_MS,
  );
});

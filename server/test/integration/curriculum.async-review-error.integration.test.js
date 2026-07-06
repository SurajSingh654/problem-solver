// ============================================================================
// curriculum async-review ERROR path — integration test (W6.T7, spec §10.2)
// ============================================================================
//
// Named per spec §10.2. Focus: the fire-and-forget CODE_REVIEW pipeline's
// error branch. When `runValidator("CODE_REVIEW", ...)` rejects, the
// `.catch(onReviewFailed)` handler in `curriculum.controller.js` must:
//
//   - PATCH the LabAttempt row: reviewStatus="ERROR", reviewedAt=<Date>,
//     codeReviewVerdict=null, codeReview=null (last two are never written on
//     the ERROR branch — see controller lines 483-489).
//   - NOT block subsequent attempts for the same (userId, labId) — the retry
//     path must transition to COMPLETED cleanly.
//
// Note on triggering the ERROR branch: an `aiComplete` rejection is caught
// inside `runValidator` and routed through the fallback validator (returning
// a WEAK verdict, not an error). To force the `.catch(onReviewFailed)` code
// path we override `buildPrompt` to throw — that error escapes runValidator
// and lands in the outer `.catch()`. This matches the pattern used in
// `curriculum.attempt.integration.test.js` (async-completion suite) and
// `curriculum.signals-and-ws.integration.test.js` (ERROR-WS suite).
//
// Note on WS-event coverage: `curriculum:review_ready` with
// `reviewStatus: "ERROR"` firing to the attempt-owner is exercised
// end-to-end in `curriculum.signals-and-ws.integration.test.js` (see the
// "lab attempt ERROR → WS event fires" describe block at line ~478). This
// file intentionally focuses on the LabAttempt row transition + the retry
// path — the two facets not covered by the signals-and-ws test.
//
// Fixtures (all prefixed with `test_w6t7_` for isolated cleanup):
//   - Team A + Learner A (MEMBER).
//   - PUBLISHED Topic → PUBLISHED Concept → PUBLISHED Lab (Team A).
//
// Run: cd server && npx vitest run test/integration/curriculum.async-review-error.integration.test.js
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

// Register real validator specs before any test runs — mocking via
// _overrideValidatorSpec requires a spec to already be present.
initCurriculumValidators();

const TEST_PREFIX = "test_w6t7_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const LEARNER_A_USER_ID = `${TEST_PREFIX}learner_a`;

const A_TOPIC_SLUG = `${TEST_PREFIX}a-topic`;
const A_CONCEPT_SLUG = `${TEST_PREFIX}a-concept`;

const TEST_TIMEOUT_MS = 60000;

let server;
let baseUrl;
let learnerAToken;
let aPublishedLabId;

// Match the fixture pattern of curriculum.attempt.integration.test.js: track
// the ORIGINAL spec per-type in a Map so nested overrides in the same test
// don't shadow it; restore in afterEach.
const _originalSpecs = new Map();
function overrideValidator(type, patch) {
  const original = _overrideValidatorSpec(type, patch);
  if (!_originalSpecs.has(type)) {
    _originalSpecs.set(type, original);
  }
}

/** A well-formed, Zod- + rule-passing CODE_REVIEW response body. */
function buildStrongReview() {
  return {
    overall: "Solid submission.",
    correctness: "STRONG",
    conceptApplication: "STRONG",
    designQuality: "STRONG",
    idiomaticStyle: "STRONG",
    robustness: "STRONG",
    testing: "STRONG",
    mentalModelSignal: "Author demonstrates strong grasp.",
    whatYouGotRight: [{ item: "Clean abstraction", lineRef: "line 3-7" }],
    thingsToImprove: [],
    bugs: [],
    nextStep: "READY_FOR_REFERENCE",
    codeReviewVerdict: "STRONG",
  };
}

async function hardDeleteTestFixtures() {
  // Strict FK order: lab_attempts → concept_masteries → labs → concepts →
  // topics → team_memberships → teams → users.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1`,
    LEARNER_A_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "content_review_logs" WHERE "targetId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1`,
    LEARNER_A_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "labs" WHERE "teamId" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concepts" WHERE "teamId" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" = $1`,
    LEARNER_A_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "team_memberships" WHERE "teamId" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "teams" WHERE "id" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "email" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
}

beforeAll(async () => {
  await hardDeleteTestFixtures();

  // ── User ──────────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      id: LEARNER_A_USER_ID,
      email: `${TEST_PREFIX}learner_a@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "Learner A",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  // ── Team ──────────────────────────────────────────────────────
  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "Async Error Team A",
      status: "ACTIVE",
      createdById: LEARNER_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.create({
    data: {
      userId: LEARNER_A_USER_ID,
      teamId: TEAM_A_ID,
      role: "MEMBER",
      isActive: true,
    },
  });

  // ── PUBLISHED Topic + Concept + Lab ───────────────────────────
  const aTopic = await prisma.topic.create({
    data: {
      slug: A_TOPIC_SLUG,
      name: "A Topic",
      description: "Async-review-error target.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_A_ID,
      concepts: {
        create: [
          {
            slug: A_CONCEPT_SLUG,
            name: "A Concept",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# A concept\nPrimer body.",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
            lab: {
              create: {
                title: "Iterator Lab",
                taskMarkdown: "Implement `Iterator<T>` over an array.",
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: "// reference — hidden until reveal",
                expectedArtifacts: ["Iterator implementation"],
                status: "PUBLISHED",
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

  // ── HTTP harness ──────────────────────────────────────────────
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
  // Restore any validator specs overridden in the test.
  for (const [type, original] of _originalSpecs.entries()) {
    _overrideValidatorSpec(type, original);
  }
  _originalSpecs.clear();
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

/**
 * Poll GET /attempts/:attemptId until reviewStatus advances past
 * PENDING/REVIEWING or the timeout fires. Returns the resolved attempt body.
 */
async function pollUntilResolved(labId, attemptId, token, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await req(
      "GET",
      `/api/v1/curriculum/labs/${labId}/attempts/${attemptId}`,
      { token },
    );
    const status = res.body?.data?.attempt?.reviewStatus;
    if (status && status !== "PENDING" && status !== "REVIEWING") {
      return res.body.data.attempt;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `pollUntilResolved timed out after ${timeoutMs}ms for attempt ${attemptId}`,
  );
}

// ─────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────

describe("async CODE_REVIEW ERROR path — LabAttempt row transition", () => {
  it(
    "transitions reviewStatus PENDING → ERROR when CODE_REVIEW throws; leaves verdict + payload null",
    async () => {
      // Force the .catch(onReviewFailed) branch by making buildPrompt throw
      // — an aiComplete rejection is caught inside runValidator and routed
      // through the fallback (returns a WEAK verdict, NOT the ERROR branch).
      // buildPrompt errors escape runValidator and land in .catch().
      overrideValidator("CODE_REVIEW", {
        buildPrompt: () => {
          throw new Error("simulated AI outage");
        },
      });

      const post = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Boom {}" } },
      );
      expect(post.status).toBe(202);
      expect(post.body.data.attemptId).toBeTruthy();
      expect(post.body.data.reviewStatus).toBe("PENDING");

      const attemptId = post.body.data.attemptId;

      // Poll — must reach ERROR, not COMPLETED.
      const resolved = await pollUntilResolved(
        aPublishedLabId,
        attemptId,
        learnerAToken,
      );
      expect(resolved.reviewStatus).toBe("ERROR");

      // DB-level assertions on the terminal ERROR state.
      const row = await prisma.labAttempt.findUnique({
        where: { id: attemptId },
      });
      expect(row).toBeTruthy();
      expect(row.reviewStatus).toBe("ERROR");
      expect(row.reviewedAt).toBeTruthy();
      // onReviewFailed only sets reviewStatus + reviewedAt — verdict + payload
      // remain at their default null (see controller lines 483-489).
      expect(row.codeReviewVerdict).toBeNull();
      expect(row.codeReview).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});

describe("async CODE_REVIEW ERROR path — retry unblocks", () => {
  it(
    "a second attempt after an ERROR completes STRONG and increments attemptNumber",
    async () => {
      // Case 1 left one ERROR attempt on this (userId, labId) with
      // attemptNumber=1. Now restore CODE_REVIEW to a working spec and
      // submit a second attempt.
      overrideValidator("CODE_REVIEW", {
        aiComplete: vi
          .fn()
          .mockResolvedValue(JSON.stringify(buildStrongReview())),
      });

      const post = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Retry {}" } },
      );
      expect(post.status).toBe(202);
      // attemptNumber is (MAX+1). The ERROR attempt from Case 1 sits at
      // attemptNumber=1, so this retry must be attemptNumber=2 — proving
      // ERROR rows don't block future submits.
      expect(post.body.data.attemptNumber).toBe(2);

      const resolved = await pollUntilResolved(
        aPublishedLabId,
        post.body.data.attemptId,
        learnerAToken,
      );
      expect(resolved.reviewStatus).toBe("COMPLETED");
      expect(resolved.codeReviewVerdict).toBe("STRONG");
      expect(resolved.codeReview).toBeTruthy();
      expect(resolved.codeReview.overall).toBe("Solid submission.");
    },
    TEST_TIMEOUT_MS,
  );
});

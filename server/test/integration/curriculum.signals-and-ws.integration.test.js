// ============================================================================
// curriculum signal writers + `curriculum:review_ready` WS event — integration
// tests (W4.T4).
// ============================================================================
//
// Exercises the wiring that ties three domain events to ConceptMastery signal
// writes + the WS push:
//
//   1. Async lab-attempt review COMPLETED → practice signal + WS event.
//   2. Async lab-attempt review ERROR     → WS event (no signal).
//   3. Check-in submit                     → checkin signal (calibrationDelta).
//   4. Primer-read POST                    → primer_read signal (dedup'd 24h).
//
// `sendToUser` is spied on via vi.spyOn on the websocket.service module
// export. The controller imports the function via a named ESM import — the
// spy replaces the module export in-place, which vi.spyOn supports as long
// as the caller resolves the import at call time (it does — the controller
// calls `sendToUser(...)` at each event site, not through a captured ref).
//
// Fixtures (all prefixed with `test_w4t4_` for isolated cleanup):
//   - Team A + Learner A (MEMBER of Team A).
//   - PUBLISHED Topic → PUBLISHED Concept → PUBLISHED Lab (Team A).
//
// Run: cd server && npx vitest run test/integration/curriculum.signals-and-ws.integration.test.js
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
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
import * as wsService from "../../src/services/websocket.service.js";

initCurriculumValidators();

const TEST_PREFIX = "test_w4t4_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const LEARNER_A_USER_ID = `${TEST_PREFIX}learner_a`;

const A_TOPIC_SLUG = `${TEST_PREFIX}a-topic`;
const A_CONCEPT_SLUG = `${TEST_PREFIX}a-concept`;

const TEST_TIMEOUT_MS = 60000;

let server;
let baseUrl;
let learnerAToken;

let aPublishedLabId;
let aConceptId;

let sendToUserSpy;

const _originalSpecs = new Map();
function overrideValidator(type, patch) {
  const original = _overrideValidatorSpec(type, patch);
  if (!_originalSpecs.has(type)) {
    _originalSpecs.set(type, original);
  }
}

/** A schema-valid CODE_REVIEW response body. Substitute verdict per test. */
function buildReview(verdict, nextStep = "READY_FOR_REFERENCE") {
  return {
    overall: `Verdict: ${verdict}.`,
    correctness: verdict,
    conceptApplication: verdict,
    designQuality: verdict,
    idiomaticStyle: verdict,
    robustness: verdict,
    testing: verdict,
    mentalModelSignal: "Signal.",
    whatYouGotRight: [{ item: "Something", lineRef: "line 1" }],
    thingsToImprove: [],
    bugs: [],
    nextStep,
    codeReviewVerdict: verdict,
  };
}

/** A schema-valid CHECK_IN response body — verdict configurable. */
function buildCheckInResponse(overall = "PASS", calibrationDelta = 0.2) {
  return {
    perQuestion: {
      recall: { verdict: "PASS", feedback: "Ok." },
      apply: { verdict: "PASS", feedback: "Ok." },
      build: { verdict: overall === "FAIL" ? "FAIL" : "PARTIAL", feedback: "Ok." },
    },
    overallVerdict: overall,
    calibrationDelta,
    encouragement: "Encouraged.",
  };
}

async function hardDeleteTestFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" = $1`,
    LEARNER_A_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1`,
    LEARNER_A_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "content_review_logs" WHERE "targetId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "labs" WHERE "teamId" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1`,
    LEARNER_A_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" = $1`,
    LEARNER_A_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concepts" WHERE "teamId" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "team_memberships" WHERE "teamId" = $1`,
    TEAM_A_ID,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "teams" WHERE "id" = $1`, TEAM_A_ID);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "email" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
}

beforeAll(async () => {
  await hardDeleteTestFixtures();

  await prisma.user.create({
    data: {
      id: LEARNER_A_USER_ID,
      email: `${TEST_PREFIX}learner_a@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "Signals Learner A",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "Signals Team A",
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

  const aTopic = await prisma.topic.create({
    data: {
      slug: A_TOPIC_SLUG,
      name: "Signals Topic A",
      description: "Signal-write target.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_A_ID,
      concepts: {
        create: [
          {
            slug: A_CONCEPT_SLUG,
            name: "Signals Concept A",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# Signals Concept A\nPrimer body.",
            canonicalSources: [],
            expectedQuestions: [
              "What is it?",
              "How to apply?",
              "Build an example.",
            ],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
            lab: {
              create: {
                title: "Signals Lab",
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
        ],
      },
    },
    include: { concepts: { include: { lab: true } } },
  });
  const aConcept = aTopic.concepts.find((c) => c.slug === A_CONCEPT_SLUG);
  aConceptId = aConcept.id;
  aPublishedLabId = aConcept.lab.id;

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

beforeEach(() => {
  // Spy on sendToUser. `implementation()` returns undefined so no real
  // wss lookup happens (safe — the real function is a no-op with no
  // wssRef anyway, but the spy captures every call for assertion).
  sendToUserSpy = vi.spyOn(wsService, "sendToUser").mockImplementation(() => {});
});

afterEach(() => {
  sendToUserSpy.mockRestore();
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

/** Poll until reviewStatus advances past PENDING/REVIEWING or timeout. */
async function pollUntilResolved(labId, attemptId, token, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await req(
      "GET",
      `/api/v1/curriculum/labs/${labId}/attempts/${attemptId}`,
      { token },
    );
    const status = r.body?.data?.attempt?.reviewStatus;
    if (status && status !== "PENDING" && status !== "REVIEWING") {
      return r.body.data.attempt;
    }
    await new Promise((r2) => setTimeout(r2, 50));
  }
  throw new Error(`pollUntilResolved timed out for ${attemptId}`);
}

/**
 * `onReviewCompleted` writes the labAttempt row, THEN writes the signal,
 * THEN calls sendToUser — but pollUntilResolved returns as soon as the
 * row transitions. Poll until the WS spy has captured a call for THIS
 * attempt so the signal + WS write have both drained.
 */
async function waitForWsEvent(attemptId, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = sendToUserSpy.mock.calls.find(
      (c) => c[1]?.type === "curriculum:review_ready" && c[1]?.attemptId === attemptId,
    );
    if (found) return found;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`waitForWsEvent timed out for ${attemptId}`);
}

async function resetAttemptsAndMastery() {
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
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1 AND "conceptId" = $2`,
    LEARNER_A_USER_ID,
    aConceptId,
  );
}

async function loadMastery() {
  return prisma.conceptMastery.findUnique({
    where: {
      userId_conceptId: { userId: LEARNER_A_USER_ID, conceptId: aConceptId },
    },
  });
}

async function seedCompletedStrongAttempt() {
  return prisma.labAttempt.create({
    data: {
      labId: aPublishedLabId,
      userId: LEARNER_A_USER_ID,
      attemptNumber: 1,
      code: "// seeded",
      reviewStatus: "COMPLETED",
      reviewedAt: new Date(),
      codeReviewVerdict: "STRONG",
      codeReview: { nextStep: "READY_FOR_REFERENCE" },
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────

describe("lab attempt COMPLETED → practice signal + WS event", () => {
  it(
    "writes a `practice` signal with value=100 when verdict is STRONG",
    async () => {
      await resetAttemptsAndMastery();

      overrideValidator("CODE_REVIEW", {
        aiComplete: vi.fn().mockResolvedValue(JSON.stringify(buildReview("STRONG"))),
      });

      const post = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Foo {}" } },
      );
      expect(post.status).toBe(202);
      const attemptId = post.body.data.attemptId;

      await pollUntilResolved(aPublishedLabId, attemptId, learnerAToken);
      // Signal write + WS send happen AFTER pollUntilResolved's condition
      // clears. Wait until the WS event drains so we're reading a settled
      // mastery row.
      await waitForWsEvent(attemptId);

      const mastery = await loadMastery();
      expect(mastery).toBeTruthy();
      const signals = Array.isArray(mastery.signals) ? mastery.signals : [];
      const practice = signals.filter((s) => s.source === "practice");
      expect(practice).toHaveLength(1);
      expect(practice[0].value).toBe(100);
      expect(practice[0].evidence?.attemptId).toBe(attemptId);
      expect(practice[0].evidence?.codeReviewVerdict).toBe("STRONG");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "writes a `practice` signal with value=40 when verdict is WEAK",
    async () => {
      await resetAttemptsAndMastery();

      overrideValidator("CODE_REVIEW", {
        aiComplete: vi
          .fn()
          .mockResolvedValue(
            JSON.stringify(buildReview("WEAK", "ADDRESS_AND_RESUBMIT")),
          ),
      });

      const post = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Weak {}" } },
      );
      expect(post.status).toBe(202);
      const attemptId = post.body.data.attemptId;

      await pollUntilResolved(aPublishedLabId, attemptId, learnerAToken);
      await waitForWsEvent(attemptId);

      const mastery = await loadMastery();
      const signals = Array.isArray(mastery.signals) ? mastery.signals : [];
      const practice = signals.filter((s) => s.source === "practice");
      expect(practice).toHaveLength(1);
      expect(practice[0].value).toBe(40);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "fires curriculum:review_ready WS event to the attempt owner (COMPLETED)",
    async () => {
      await resetAttemptsAndMastery();

      overrideValidator("CODE_REVIEW", {
        aiComplete: vi
          .fn()
          .mockResolvedValue(JSON.stringify(buildReview("STRONG"))),
      });

      const post = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Bar {}" } },
      );
      const attemptId = post.body.data.attemptId;
      await pollUntilResolved(aPublishedLabId, attemptId, learnerAToken);
      await waitForWsEvent(attemptId);

      // Filter for THIS attempt's WS event — the shared curriculum router
      // means a residual fire-and-forget callback from an earlier test in
      // this file could technically leak, but the fixtures reset before
      // each `resetAttemptsAndMastery` and attemptIds are unique per row.
      const calls = sendToUserSpy.mock.calls.filter(
        (c) => c[1]?.type === "curriculum:review_ready" && c[1]?.attemptId === attemptId,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe(LEARNER_A_USER_ID);
      expect(calls[0][1]).toEqual({
        type: "curriculum:review_ready",
        attemptId,
        reviewStatus: "COMPLETED",
        verdict: "STRONG",
      });
    },
    TEST_TIMEOUT_MS,
  );
});

describe("lab attempt ERROR → WS event fires, no signal written", () => {
  it(
    "fires curriculum:review_ready with reviewStatus=ERROR and writes no mastery row",
    async () => {
      await resetAttemptsAndMastery();

      // Force the .catch(onReviewFailed) branch by making buildPrompt throw
      // — that error escapes runValidator (aiComplete rejection is caught
      // internally and returns a fallback).
      overrideValidator("CODE_REVIEW", {
        buildPrompt: () => {
          throw new Error("boom");
        },
      });

      const post = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Baz {}" } },
      );
      const attemptId = post.body.data.attemptId;
      const resolved = await pollUntilResolved(
        aPublishedLabId,
        attemptId,
        learnerAToken,
      );
      expect(resolved.reviewStatus).toBe("ERROR");
      await waitForWsEvent(attemptId);

      const calls = sendToUserSpy.mock.calls.filter(
        (c) => c[1]?.type === "curriculum:review_ready" && c[1]?.attemptId === attemptId,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe(LEARNER_A_USER_ID);
      expect(calls[0][1]).toEqual({
        type: "curriculum:review_ready",
        attemptId,
        reviewStatus: "ERROR",
      });

      // No mastery signal on ERROR — either no row at all, or if there was
      // a pre-existing row, no `practice` signal was appended by this path.
      const mastery = await loadMastery();
      const signals = mastery
        ? (Array.isArray(mastery.signals) ? mastery.signals : [])
        : [];
      const practice = signals.filter((s) => s.source === "practice");
      expect(practice).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("check-in submit → checkin signal (atomic-ish with the check-in row)", () => {
  it(
    "writes a `checkin` signal with value=100 + calibrationDelta on PASS",
    async () => {
      await resetAttemptsAndMastery();
      await seedCompletedStrongAttempt(); // unlocks the check-in gate

      overrideValidator("CHECK_IN", {
        aiComplete: vi
          .fn()
          .mockResolvedValue(JSON.stringify(buildCheckInResponse("PASS", 0.25))),
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/checkin`,
        {
          token: learnerAToken,
          body: {
            recallAnswer: "r",
            applyAnswer: "a",
            buildAnswer: "b",
            preConfidence: 4,
          },
        },
      );
      expect(status).toBe(201);
      const checkInId = body.data.checkIn.id;
      expect(checkInId).toBeTruthy();

      // ConceptCheckIn row exists.
      const rows = await prisma.conceptCheckIn.findMany({
        where: { userId: LEARNER_A_USER_ID, conceptId: aConceptId },
      });
      expect(rows).toHaveLength(1);

      // Mastery signal appended with calibrationDelta preserved.
      const mastery = await loadMastery();
      const signals = Array.isArray(mastery.signals) ? mastery.signals : [];
      const checkinSignals = signals.filter((s) => s.source === "checkin");
      expect(checkinSignals).toHaveLength(1);
      expect(checkinSignals[0].value).toBe(100);
      expect(checkinSignals[0].evidence?.aiVerdict).toBe("PASS");
      expect(checkinSignals[0].evidence?.calibrationDelta).toBe(0.25);
      expect(checkinSignals[0].evidence?.checkInId).toBe(checkInId);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("primer-read → primer_read signal (dedup'd 24h)", () => {
  it(
    "writes a `primer_read` signal on first call",
    async () => {
      await resetAttemptsAndMastery();

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/mark-primer-read`,
        { token: learnerAToken, body: {} },
      );
      expect(status).toBe(200);
      expect(body.data.ok).toBe(true);

      const mastery = await loadMastery();
      expect(mastery).toBeTruthy();
      const signals = Array.isArray(mastery.signals) ? mastery.signals : [];
      const primer = signals.filter((s) => s.source === "primer_read");
      expect(primer).toHaveLength(1);
      expect(primer[0].value).toBe(10);
      // primer_read has weight 0 → doesn't move the score (may be null when
      // it's the only signal, since weightTotal === 0).
      expect(mastery.score).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "dedupes rapid repeat calls within the 24h window (only ONE signal)",
    async () => {
      await resetAttemptsAndMastery();

      await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/mark-primer-read`,
        { token: learnerAToken, body: {} },
      );
      await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/mark-primer-read`,
        { token: learnerAToken, body: {} },
      );
      await req(
        "POST",
        `/api/v1/curriculum/concepts/${A_CONCEPT_SLUG}/mark-primer-read`,
        { token: learnerAToken, body: {} },
      );

      const mastery = await loadMastery();
      const signals = Array.isArray(mastery.signals) ? mastery.signals : [];
      const primer = signals.filter((s) => s.source === "primer_read");
      expect(primer).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 CONCEPT_NOT_FOUND for a nonexistent slug (no signal write)",
    async () => {
      await resetAttemptsAndMastery();

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/concepts/${TEST_PREFIX}nonexistent/mark-primer-read`,
        { token: learnerAToken, body: {} },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");

      const mastery = await loadMastery();
      expect(mastery).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});

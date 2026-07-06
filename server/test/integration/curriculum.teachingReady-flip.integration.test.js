// ============================================================================
// curriculum — teachingReady auto-flip integration test (W5.T7a)
// ============================================================================
//
// Locks in the W5.T5 truth-table auto-flip at the HTTP boundary:
//
//   primer_read + ≥1 STRONG/ADEQUATE lab (this team) + latest PASS check-in
//   → teachingReady flips to true (monotonic) and appends exactly one audit
//     signal { source: "teachingReady", evidence: { reason: "truthTable" } }.
//
// Fixture pattern mirrors curriculum.learnerJourney.e2e.integration.test.js
// (W4.T8):
//   - real Postgres, real Express app carrying the curriculum router,
//   - fixture prefix `test_w5t7a_` — verified non-colliding via
//     `grep -rn "test_w5t7" test/` in T7's plan,
//   - AI is mocked via `_overrideValidatorSpec("CODE_REVIEW", …)` and
//     `_overrideValidatorSpec("CHECK_IN", …)`; `initCurriculumValidators()`
//     restores pristine specs in afterAll so the global registry is clean.
//
// This file exercises FOUR cases:
//
//   1. HAPPY PATH — end-to-end through primer_read + STRONG lab + PASS
//      check-in and asserts teachingReady=true + the audit signal.
//   2. NEGATIVE (a) — check-in with zero completed attempts → 403
//      CHECKIN_LOCKED (unlock gate blocks before AI runs).
//   3. NEGATIVE (b) — check-in with only WEAK lab attempts → 403
//      CHECKIN_LOCKED (WEAK does not clear the unlock predicate).
//   4. NEGATIVE (c) — reveal-reference with zero completed attempts → 403
//      REVEAL_BLOCKED_NO_ATTEMPT.
//
// Each negative case uses its own USER_ID / TEAM_ID derived from the shared
// prefix so nothing leaks between cases — cheaper than a per-test scrub.
//
// Run: cd server && npx vitest run test/integration/curriculum.teachingReady-flip.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumRouter from "../../src/routes/curriculum.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { _overrideValidatorSpec } from "../../src/services/curriculum/contentReview.service.js";
import { initCurriculumValidators } from "../../src/services/curriculum/registerValidators.js";

initCurriculumValidators();

const TEST_PREFIX = "test_w5t7a_";

// Case 1 — happy path
const HAPPY_TEAM_ID = `${TEST_PREFIX}happy_team`;
const HAPPY_USER_ID = `${TEST_PREFIX}happy_user`;
const HAPPY_TOPIC_SLUG = `${TEST_PREFIX}happy_topic`;
const HAPPY_CONCEPT_SLUG = `${TEST_PREFIX}happy_concept`;

// Case 2 — check-in without any completed attempt
const NO_ATT_TEAM_ID = `${TEST_PREFIX}noatt_team`;
const NO_ATT_USER_ID = `${TEST_PREFIX}noatt_user`;
const NO_ATT_TOPIC_SLUG = `${TEST_PREFIX}noatt_topic`;
const NO_ATT_CONCEPT_SLUG = `${TEST_PREFIX}noatt_concept`;

// Case 3 — WEAK-only attempts
const WEAK_TEAM_ID = `${TEST_PREFIX}weak_team`;
const WEAK_USER_ID = `${TEST_PREFIX}weak_user`;
const WEAK_TOPIC_SLUG = `${TEST_PREFIX}weak_topic`;
const WEAK_CONCEPT_SLUG = `${TEST_PREFIX}weak_concept`;

// Case 4 — reveal without any completed attempt
const REV_TEAM_ID = `${TEST_PREFIX}rev_team`;
const REV_USER_ID = `${TEST_PREFIX}rev_user`;
const REV_TOPIC_SLUG = `${TEST_PREFIX}rev_topic`;
const REV_CONCEPT_SLUG = `${TEST_PREFIX}rev_concept`;

const REFERENCE_SOLUTION =
  "// File: Vehicle.java\npublic class Vehicle { Engine engine; }";

const TEST_TIMEOUT_MS = 90000;

let server;
let baseUrl;

const publishedLabIds = {}; // keyed by team id
const publishedConceptIds = {}; // keyed by team id
const tokens = {}; // keyed by user id

// ─────────────────────────────────────────────────────────────────────────
// Validator override + restore bookkeeping (identical pattern to W4.T8)
// ─────────────────────────────────────────────────────────────────────────

const _originalSpecs = new Map();
function overrideValidator(type, patch) {
  const original = _overrideValidatorSpec(type, patch);
  if (!_originalSpecs.has(type)) {
    _originalSpecs.set(type, original);
  }
}
function restoreAllValidators() {
  initCurriculumValidators();
  _originalSpecs.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// AI mock builders
// ─────────────────────────────────────────────────────────────────────────

function buildStrongCodeReview() {
  return {
    overall: "Solid solution.",
    correctness: "STRONG",
    conceptApplication: "STRONG",
    designQuality: "STRONG",
    idiomaticStyle: "STRONG",
    robustness: "STRONG",
    testing: "STRONG",
    mentalModelSignal: "Clear grasp of composition-over-inheritance.",
    whatYouGotRight: [
      { item: "Clean class hierarchy", lineRef: "Main.java:1-10" },
    ],
    thingsToImprove: [],
    bugs: [],
    nextStep: "READY_FOR_REFERENCE",
    codeReviewVerdict: "STRONG",
  };
}

/**
 * W5.T7a helper — a schema-valid WEAK CODE_REVIEW response used to prove
 * that a WEAK-only attempt does NOT clear the check-in unlock predicate.
 * Matches the same shape as buildStrongCodeReview() with verdicts flipped
 * and `nextStep = TRY_AGAIN` so the reveal gate would also correctly deny.
 */
function buildWeakCodeReview() {
  return {
    overall: "Struggling.",
    correctness: "WEAK",
    conceptApplication: "WEAK",
    designQuality: "WEAK",
    idiomaticStyle: "WEAK",
    robustness: "WEAK",
    testing: "WEAK",
    mentalModelSignal: "Confused composition and inheritance.",
    whatYouGotRight: [],
    thingsToImprove: [
      { item: "Rewrite the class hierarchy", lineRef: "Main.java:1-10" },
    ],
    bugs: [],
    nextStep: "TRY_AGAIN",
    codeReviewVerdict: "WEAK",
  };
}

function buildPassCheckIn() {
  return {
    perQuestion: {
      recall: { verdict: "PASS", feedback: "Solid." },
      apply: { verdict: "PASS", feedback: "Good application." },
      build: { verdict: "PARTIAL", feedback: "OK structure." },
    },
    overallVerdict: "PASS",
    calibrationDelta: 0.1,
    encouragement: "Nice work.",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Fixture DB seed / teardown
// ─────────────────────────────────────────────────────────────────────────

async function hardDeleteFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "content_review_logs" WHERE "targetId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "labs" WHERE "teamId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concepts" WHERE "teamId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "team_memberships" WHERE "teamId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "teams" WHERE "id" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "email" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
}

async function seedFixture({ teamId, userId, topicSlug, conceptSlug, label }) {
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: `W5T7a ${label} Learner`,
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: teamId,
      name: `W5T7a ${label} Team`,
      status: "ACTIVE",
      createdById: userId,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.create({
    data: {
      userId,
      teamId,
      role: "MEMBER",
      isActive: true,
    },
  });

  const topic = await prisma.topic.create({
    data: {
      slug: topicSlug,
      name: `W5T7a ${label} Topic`,
      description: "Teaching-ready flip integration fixture.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId,
      concepts: {
        create: [
          {
            slug: conceptSlug,
            name: `W5T7a ${label} Concept`,
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown:
              "# Composition over inheritance\n\nHold a reference; don't extend.",
            primerHtml:
              "<h1>Composition over inheritance</h1><p>Hold a reference; don't extend.</p>",
            workedExample: "class Car { engine: Engine; ... }",
            canonicalSources: [{ title: "GoF Ch1", type: "book" }],
            expectedQuestions: [
              "What is the core idea?",
              "How would you apply it?",
              "Build a small example.",
            ],
            assessmentCriteria: {},
            readinessRubric: {
              explainToJunior: "Explain in 60 seconds to a junior engineer.",
              sketchArchitecture: "Sketch on a whiteboard.",
              buildFromScratch: "Build minimal working example.",
              nameFailureModes: "Name three failure modes.",
              compareAlternatives: "Compare with two alternatives.",
              estimateCost: "Estimate CPU + memory cost.",
              blastRadius: "Describe blast radius on failure.",
              debugFromSymptoms: "Debug from a stack trace.",
            },
            teamId,
            lab: {
              create: {
                title: `W5T7a ${label} Lab`,
                taskMarkdown:
                  "# Refactor\n\nTake the given Vehicle inheritance chain and refactor it to use composition. Add unit tests that show behavior parity.",
                timeboxMinutes: 30,
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: REFERENCE_SOLUTION,
                expectedArtifacts: ["Refactored classes", "Passing tests"],
                status: "PUBLISHED",
                teamId,
              },
            },
          },
        ],
      },
    },
    include: { concepts: { include: { lab: true } } },
  });

  const concept = topic.concepts.find((c) => c.slug === conceptSlug);
  publishedConceptIds[teamId] = concept.id;
  publishedLabIds[teamId] = concept.lab.id;

  tokens[userId] = generateToken({
    id: userId,
    globalRole: "USER",
    currentTeamId: teamId,
    teamRole: "MEMBER",
  });
}

beforeAll(async () => {
  await hardDeleteFixtures();

  await seedFixture({
    teamId: HAPPY_TEAM_ID,
    userId: HAPPY_USER_ID,
    topicSlug: HAPPY_TOPIC_SLUG,
    conceptSlug: HAPPY_CONCEPT_SLUG,
    label: "Happy",
  });
  await seedFixture({
    teamId: NO_ATT_TEAM_ID,
    userId: NO_ATT_USER_ID,
    topicSlug: NO_ATT_TOPIC_SLUG,
    conceptSlug: NO_ATT_CONCEPT_SLUG,
    label: "NoAttempt",
  });
  await seedFixture({
    teamId: WEAK_TEAM_ID,
    userId: WEAK_USER_ID,
    topicSlug: WEAK_TOPIC_SLUG,
    conceptSlug: WEAK_CONCEPT_SLUG,
    label: "WeakOnly",
  });
  await seedFixture({
    teamId: REV_TEAM_ID,
    userId: REV_USER_ID,
    topicSlug: REV_TOPIC_SLUG,
    conceptSlug: REV_CONCEPT_SLUG,
    label: "RevealBlocked",
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
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  restoreAllValidators();
  await hardDeleteFixtures();
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

async function pollUntilResolved(labId, attemptId, token, timeoutMs = 60000) {
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

async function loadMastery({ userId, conceptId }) {
  return prisma.conceptMastery.findUnique({
    where: {
      userId_conceptId: { userId, conceptId },
    },
  });
}

/**
 * Poll ConceptMastery.signals until a signal from `expectedSource` appears.
 * The signal writes are fire-and-forget from onReviewCompleted so they drain
 * after the attempt row transitions to COMPLETED. Fixed sleeps are brittle
 * under parallel load — poll instead. Same helper as W4.T8.
 */
async function waitForSignal(
  { userId, conceptId, expectedSource },
  timeoutMs = 15000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const mastery = await loadMastery({ userId, conceptId });
    const signals = Array.isArray(mastery?.signals) ? mastery.signals : [];
    if (signals.some((s) => s.source === expectedSource)) {
      return mastery;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `waitForSignal(${expectedSource}) timed out after ${timeoutMs}ms`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe("curriculum — teachingReady auto-flip (W5.T7a)", () => {
  it(
    "flips teachingReady=true and appends one truth-table audit signal when primer_read + STRONG lab + PASS check-in all fire",
    async () => {
      const token = tokens[HAPPY_USER_ID];
      const conceptId = publishedConceptIds[HAPPY_TEAM_ID];
      const labId = publishedLabIds[HAPPY_TEAM_ID];

      // Enroll.
      const enroll = await req(
        "POST",
        `/api/v1/curriculum/topics/${HAPPY_TOPIC_SLUG}/enroll`,
        { token },
      );
      expect(enroll.status).toBe(201);

      // Mark primer read.
      const primerRead = await req(
        "POST",
        `/api/v1/curriculum/concepts/${HAPPY_CONCEPT_SLUG}/mark-primer-read`,
        { token, body: {} },
      );
      expect(primerRead.status).toBe(200);

      // Verify primer_read signal present, teachingReady still false.
      const afterPrimer = await loadMastery({
        userId: HAPPY_USER_ID,
        conceptId,
      });
      expect(afterPrimer).toBeTruthy();
      expect(afterPrimer.teachingReady).toBe(false);
      const primerSignals = (afterPrimer.signals ?? []).filter(
        (s) => s.source === "primer_read",
      );
      expect(primerSignals).toHaveLength(1);

      // Submit STRONG lab attempt.
      const strongMock = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildStrongCodeReview()));
      overrideValidator("CODE_REVIEW", { aiComplete: strongMock });

      const submit = await req(
        "POST",
        `/api/v1/curriculum/labs/${labId}/attempts`,
        {
          token,
          body: {
            code: "public class Vehicle { private Engine engine; }",
          },
        },
      );
      expect(submit.status).toBe(202);
      const attemptId = submit.body.data.attemptId;

      // Poll until COMPLETED.
      const resolved = await pollUntilResolved(labId, attemptId, token);
      expect(resolved.reviewStatus).toBe("COMPLETED");
      expect(resolved.codeReviewVerdict).toBe("STRONG");

      // Wait for the fire-and-forget signal write + auto-flip evaluator
      // to drain (matches W4.T8's practice-signal wait).
      await waitForSignal({
        userId: HAPPY_USER_ID,
        conceptId,
        expectedSource: "practice",
      });

      // Reveal reference.
      const reveal = await req(
        "POST",
        `/api/v1/curriculum/labs/${labId}/reveal-reference`,
        { token },
      );
      expect(reveal.status).toBe(200);

      // Check-in PASS.
      const passMock = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildPassCheckIn()));
      overrideValidator("CHECK_IN", { aiComplete: passMock });

      const checkIn = await req(
        "POST",
        `/api/v1/curriculum/concepts/${HAPPY_CONCEPT_SLUG}/checkin`,
        {
          token,
          body: {
            recallAnswer:
              "Composition holds a reference; inheritance extends.",
            applyAnswer:
              "Have Car own an Engine field rather than extending Engine.",
            buildAnswer:
              "class Car { private Engine engine; public Car(Engine e) { this.engine = e; } }",
            preConfidence: 4,
          },
        },
      );
      expect(checkIn.status).toBe(201);
      expect(checkIn.body.data.checkIn.aiVerdict).toBe("PASS");

      // Verify teachingReady flipped + exactly one truth-table audit signal
      // was appended. The evaluator is monotonic — never expect >1.
      const finalMastery = await loadMastery({
        userId: HAPPY_USER_ID,
        conceptId,
      });
      expect(finalMastery.teachingReady).toBe(true);

      const signals = Array.isArray(finalMastery.signals)
        ? finalMastery.signals
        : [];
      const audit = signals.filter((s) => s.source === "teachingReady");
      expect(audit).toHaveLength(1);
      expect(audit[0].evidence?.reason).toBe("truthTable");

      // Sanity: all three source signals persisted.
      const sources = new Set(signals.map((s) => s.source));
      expect(sources.has("primer_read")).toBe(true);
      expect(sources.has("practice")).toBe(true);
      expect(sources.has("checkin")).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "(a) check-in without any completed attempt → 403 CHECKIN_LOCKED",
    async () => {
      const token = tokens[NO_ATT_USER_ID];

      const enroll = await req(
        "POST",
        `/api/v1/curriculum/topics/${NO_ATT_TOPIC_SLUG}/enroll`,
        { token },
      );
      expect(enroll.status).toBe(201);

      const primer = await req(
        "POST",
        `/api/v1/curriculum/concepts/${NO_ATT_CONCEPT_SLUG}/mark-primer-read`,
        { token, body: {} },
      );
      expect(primer.status).toBe(200);

      const checkIn = await req(
        "POST",
        `/api/v1/curriculum/concepts/${NO_ATT_CONCEPT_SLUG}/checkin`,
        {
          token,
          body: {
            recallAnswer: "r",
            applyAnswer: "a",
            buildAnswer: "b",
            preConfidence: 4,
          },
        },
      );
      expect(checkIn.status).toBe(403);
      expect(checkIn.body?.error?.code).toBe("CHECKIN_LOCKED");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "(b) check-in with only WEAK lab attempts → 403 CHECKIN_LOCKED",
    async () => {
      const token = tokens[WEAK_USER_ID];
      const labId = publishedLabIds[WEAK_TEAM_ID];

      const enroll = await req(
        "POST",
        `/api/v1/curriculum/topics/${WEAK_TOPIC_SLUG}/enroll`,
        { token },
      );
      expect(enroll.status).toBe(201);

      const primer = await req(
        "POST",
        `/api/v1/curriculum/concepts/${WEAK_CONCEPT_SLUG}/mark-primer-read`,
        { token, body: {} },
      );
      expect(primer.status).toBe(200);

      const weakMock = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildWeakCodeReview()));
      overrideValidator("CODE_REVIEW", { aiComplete: weakMock });

      const submit = await req(
        "POST",
        `/api/v1/curriculum/labs/${labId}/attempts`,
        { token, body: { code: "public class Broken {}" } },
      );
      expect(submit.status).toBe(202);
      const resolved = await pollUntilResolved(
        labId,
        submit.body.data.attemptId,
        token,
      );
      expect(resolved.reviewStatus).toBe("COMPLETED");
      expect(resolved.codeReviewVerdict).toBe("WEAK");

      const checkIn = await req(
        "POST",
        `/api/v1/curriculum/concepts/${WEAK_CONCEPT_SLUG}/checkin`,
        {
          token,
          body: {
            recallAnswer: "r",
            applyAnswer: "a",
            buildAnswer: "b",
            preConfidence: 4,
          },
        },
      );
      expect(checkIn.status).toBe(403);
      expect(checkIn.body?.error?.code).toBe("CHECKIN_LOCKED");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "(c) reveal-reference without any completed attempt → 403 REVEAL_BLOCKED_NO_ATTEMPT",
    async () => {
      const token = tokens[REV_USER_ID];
      const labId = publishedLabIds[REV_TEAM_ID];

      const enroll = await req(
        "POST",
        `/api/v1/curriculum/topics/${REV_TOPIC_SLUG}/enroll`,
        { token },
      );
      expect(enroll.status).toBe(201);

      const primer = await req(
        "POST",
        `/api/v1/curriculum/concepts/${REV_CONCEPT_SLUG}/mark-primer-read`,
        { token, body: {} },
      );
      expect(primer.status).toBe(200);

      const reveal = await req(
        "POST",
        `/api/v1/curriculum/labs/${labId}/reveal-reference`,
        { token },
      );
      expect(reveal.status).toBe(403);
      expect(reveal.body?.error?.code).toBe("REVEAL_BLOCKED_NO_ATTEMPT");
    },
    TEST_TIMEOUT_MS,
  );
});

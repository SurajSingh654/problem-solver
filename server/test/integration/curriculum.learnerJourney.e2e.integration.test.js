// ============================================================================
// curriculum — End-to-end learner-journey integration test (W4.T8)
// ============================================================================
//
// One big test that walks a learner through the full Phase-1 pipeline in
// one continuous session — parallel to W3.T10's admin-journey E2E:
//
//   1. Seed a fully-published Topic → Concept → Lab tree in team A.
//   2. Enroll in the topic.
//   3. GET topic detail (enrollment visible).
//   4. GET concept detail (mastery null, no reference leak).
//   5. POST mark-primer-read → primer_read signal in ConceptMastery.
//   6. POST reveal-reference too early → 403 REVEAL_BLOCKED_NO_ATTEMPT.
//   7. POST check-in too early → 403 CHECKIN_LOCKED.
//   8. POST lab attempt (STRONG mock) → 202 PENDING, then poll to COMPLETED.
//   9. Verify practice signal on ConceptMastery.
//  10. POST reveal-reference → 200 with referenceSolution.
//  11. POST check-in (PASS mock) → 201 with checkIn row + calibrationDelta.
//  12. Verify checkin signal on ConceptMastery.
//  13. Refetch concept detail — confirm all three source signals persist.
//      (`teachingReady` remains false — updateMastery does not flip that
//      flag in Phase 1; the truth-table wiring is Phase 2 work. See NOTE
//      block below.)
//
// The mocks live behind `_overrideValidatorSpec("CODE_REVIEW"|"CHECK_IN")`
// — same pattern as W4.T2/T3/T4. `initCurriculumValidators()` restores
// pristine specs in afterAll so the process-global validator registry is
// clean for any subsequent test file.
//
// Fixture prefix `test_w4t8_` — distinct from every other W4 test's prefix
// so parallel runs don't collide.
//
// TEST_TIMEOUT_MS = 90000 — long test with 12+ sequential HTTP round-trips
// plus a fire-and-forget CODE_REVIEW poll. Railway Postgres round-trips
// can be slow.
//
// NOTE — teachingReady flip: as of W4, `mentor.service.updateMastery` does
// NOT set `teachingReady` based on the (PASS check-in + STRONG lab attempt)
// truth table. The field is a plain default-false column and no writer
// currently flips it (grep `teachingReady` in server/src returns only reads
// + one Boolean default declaration in schema.prisma). The Week-4 truth
// table pattern is Phase-2 wiring. This test therefore verifies:
//   - all three source signals (primer_read, practice, checkin) exist,
//   - the flag remains false (its schema default),
// so the moment a Phase-2 writer starts flipping the flag on PASS+STRONG,
// this test will fail loudly at the last assertion and force a refactor
// (i.e. flip the assertion to `true`) rather than silently drift.
//
// Run: cd server && npx vitest run test/integration/curriculum.learnerJourney.e2e.integration.test.js
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

// Register real validator specs before overriding — _overrideValidatorSpec
// requires an existing spec to patch.
initCurriculumValidators();

const TEST_PREFIX = "test_w4t8_";
const TEAM_ID = `${TEST_PREFIX}team`;
const LEARNER_USER_ID = `${TEST_PREFIX}learner`;

const TOPIC_SLUG = `${TEST_PREFIX}topic`;
const CONCEPT_SLUG = `${TEST_PREFIX}concept`;

const REFERENCE_SOLUTION =
  "// File: Vehicle.java\npublic class Vehicle { Engine engine; }";

const TEST_TIMEOUT_MS = 90000;

let server;
let baseUrl;
let learnerToken;

let publishedLabId;
let publishedConceptId;

// ─────────────────────────────────────────────────────────────────────────
// Validator override + restore bookkeeping
// ─────────────────────────────────────────────────────────────────────────

const _originalSpecs = new Map();
function overrideValidator(type, patch) {
  const original = _overrideValidatorSpec(type, patch);
  if (!_originalSpecs.has(type)) {
    _originalSpecs.set(type, original);
  }
}
function restoreAllValidators() {
  // Fully reinitialize — simpler than trying to shallow-restore each patched
  // key. Same pattern as curriculumAdmin.e2e.integration.test.js.
  initCurriculumValidators();
  _originalSpecs.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// AI mock builders
// ─────────────────────────────────────────────────────────────────────────

/**
 * A schema-valid CODE_REVIEW STRONG response — passes Zod + validator
 * rules, and drives the reveal gate to pass (`nextStep: READY_FOR_REFERENCE`).
 * Shape mirrors the buildStrongReview() in W4.T2.
 */
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
 * A schema-valid CHECK_IN PASS response with a specific calibrationDelta
 * we can assert on. Shape mirrors buildPassCheckInResponse() in W4.T3.
 */
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
    `DELETE FROM "concept_check_ins" WHERE "userId" = $1`,
    LEARNER_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1`,
    LEARNER_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "content_review_logs" WHERE "targetId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "labs" WHERE "teamId" = $1`,
    TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1`,
    LEARNER_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" = $1`,
    LEARNER_USER_ID,
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

beforeAll(async () => {
  await hardDeleteFixtures();

  await prisma.user.create({
    data: {
      id: LEARNER_USER_ID,
      email: `${TEST_PREFIX}learner@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "W4T8 E2E Learner",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_ID,
      name: "W4T8 E2E Team",
      status: "ACTIVE",
      createdById: LEARNER_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.create({
    data: {
      userId: LEARNER_USER_ID,
      teamId: TEAM_ID,
      role: "MEMBER",
      isActive: true,
    },
  });

  // Fully-set-up PUBLISHED Topic → PUBLISHED Concept → PUBLISHED Lab.
  // Populate every field a learner surface actually reads so the journey
  // test exercises the real production data shape.
  const topic = await prisma.topic.create({
    data: {
      slug: TOPIC_SLUG,
      name: "W4T8 E2E Topic",
      description: "End-to-end learner journey target.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_ID,
      concepts: {
        create: [
          {
            slug: CONCEPT_SLUG,
            name: "W4T8 E2E Concept",
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
            teamId: TEAM_ID,
            lab: {
              create: {
                title: "Refactor Vehicle hierarchy",
                taskMarkdown:
                  "# Refactor\n\nTake the given Vehicle inheritance chain and refactor it to use composition. Add unit tests that show behavior parity.",
                timeboxMinutes: 30,
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: REFERENCE_SOLUTION,
                expectedArtifacts: ["Refactored classes", "Passing tests"],
                status: "PUBLISHED",
                teamId: TEAM_ID,
              },
            },
          },
        ],
      },
    },
    include: { concepts: { include: { lab: true } } },
  });
  const concept = topic.concepts.find((c) => c.slug === CONCEPT_SLUG);
  publishedConceptId = concept.id;
  publishedLabId = concept.lab.id;

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/curriculum", curriculumRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  learnerToken = generateToken({
    id: LEARNER_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_ID,
    teamRole: "MEMBER",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  restoreAllValidators();
  await hardDeleteFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

async function req(method, path, { token = learnerToken, body } = {}) {
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
 * PENDING/REVIEWING or the timeout fires. Same pattern as W4.T2's helper.
 */
async function pollUntilResolved(
  labId,
  attemptId,
  token,
  timeoutMs = 60000,
) {
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

async function loadMastery() {
  return prisma.conceptMastery.findUnique({
    where: {
      userId_conceptId: {
        userId: LEARNER_USER_ID,
        conceptId: publishedConceptId,
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// The one big end-to-end learner journey test
// ─────────────────────────────────────────────────────────────────────────

describe("curriculum — end-to-end learner journey (enroll → attempt → reveal → check-in)", () => {
  it(
    "walks a learner from enrollment through primer, attempt, reveal, and check-in — all three source signals persisted on ConceptMastery",
    async () => {
      // ── Step 1: enroll in the topic ─────────────────────────────
      const enroll = await req(
        "POST",
        `/api/v1/curriculum/topics/${TOPIC_SLUG}/enroll`,
      );
      expect(enroll.status).toBe(201);
      expect(enroll.body?.data?.enrollment?.status).toBe("ACTIVE");
      expect(enroll.body.data.enrollment.userId).toBe(LEARNER_USER_ID);

      // ── Step 2: view topic detail — enrollment visible ──────────
      const topicDetail = await req(
        "GET",
        `/api/v1/curriculum/topics/${TOPIC_SLUG}`,
      );
      expect(topicDetail.status).toBe(200);
      expect(topicDetail.body.data.topic.slug).toBe(TOPIC_SLUG);
      expect(topicDetail.body.data.topic.enrollment?.status).toBe("ACTIVE");
      expect(topicDetail.body.data.topic.concepts).toHaveLength(1);
      expect(topicDetail.body.data.topic.concepts[0].slug).toBe(CONCEPT_SLUG);
      // Fresh learner — no mastery row yet.
      expect(topicDetail.body.data.topic.concepts[0].mastery).toBeNull();

      // ── Step 3: view concept detail — mastery null, no leak ─────
      const conceptDetail = await req(
        "GET",
        `/api/v1/curriculum/concepts/${CONCEPT_SLUG}`,
      );
      expect(conceptDetail.status).toBe(200);
      expect(conceptDetail.body.data.concept.slug).toBe(CONCEPT_SLUG);
      expect(conceptDetail.body.data.concept.mastery).toBeNull();
      // Reveal gate: neither field should leak on the learner surface.
      expect(conceptDetail.body.data.concept.lab.referenceSolution).toBeUndefined();
      expect(conceptDetail.body.data.concept.lab.starterCode).toBeUndefined();

      // ── Step 4: mark primer read → primer_read signal ───────────
      const primerRead = await req(
        "POST",
        `/api/v1/curriculum/concepts/${CONCEPT_SLUG}/mark-primer-read`,
        { body: {} },
      );
      expect(primerRead.status).toBe(200);
      expect(primerRead.body.data.ok).toBe(true);

      const afterPrimer = await loadMastery();
      expect(afterPrimer).toBeTruthy();
      {
        const signals = Array.isArray(afterPrimer.signals) ? afterPrimer.signals : [];
        const primer = signals.filter((s) => s.source === "primer_read");
        expect(primer).toHaveLength(1);
        expect(primer[0].value).toBe(10);
      }

      // ── Step 5: attempt reveal too early → 403 ──────────────────
      const revealTooEarly = await req(
        "POST",
        `/api/v1/curriculum/labs/${publishedLabId}/reveal-reference`,
      );
      expect(revealTooEarly.status).toBe(403);
      expect(revealTooEarly.body?.error?.code).toBe("REVEAL_BLOCKED_NO_ATTEMPT");

      // ── Step 6: attempt check-in too early → 403 ────────────────
      const checkInTooEarly = await req(
        "POST",
        `/api/v1/curriculum/concepts/${CONCEPT_SLUG}/checkin`,
        {
          body: {
            recallAnswer: "r",
            applyAnswer: "a",
            buildAnswer: "b",
            preConfidence: 4,
          },
        },
      );
      expect(checkInTooEarly.status).toBe(403);
      expect(checkInTooEarly.body?.error?.code).toBe("CHECKIN_LOCKED");

      // ── Step 7: mock CODE_REVIEW = STRONG + submit lab attempt ──
      const strongCodeReviewMock = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildStrongCodeReview()));
      overrideValidator("CODE_REVIEW", { aiComplete: strongCodeReviewMock });

      const submit = await req(
        "POST",
        `/api/v1/curriculum/labs/${publishedLabId}/attempts`,
        {
          body: {
            code: "public class Vehicle { private Engine engine; }",
          },
        },
      );
      expect(submit.status).toBe(202);
      expect(submit.body.data.attemptId).toBeTruthy();
      expect(submit.body.data.reviewStatus).toBe("PENDING");
      expect(submit.body.data.attemptNumber).toBe(1);
      const attemptId = submit.body.data.attemptId;

      // ── Step 8: poll until COMPLETED ────────────────────────────
      const resolvedAttempt = await pollUntilResolved(
        publishedLabId,
        attemptId,
        learnerToken,
      );
      expect(resolvedAttempt.reviewStatus).toBe("COMPLETED");
      expect(resolvedAttempt.codeReviewVerdict).toBe("STRONG");
      expect(resolvedAttempt.reviewedAt).toBeTruthy();
      expect(strongCodeReviewMock).toHaveBeenCalled();

      // Signal writes happen inside onReviewCompleted AFTER the row
      // transitions to COMPLETED. Give the async signal write a beat to
      // drain — matches the W4.T4 pattern.
      await new Promise((r) => setTimeout(r, 1000));

      const afterAttempt = await loadMastery();
      {
        const signals = Array.isArray(afterAttempt.signals) ? afterAttempt.signals : [];
        const practice = signals.filter((s) => s.source === "practice");
        expect(practice).toHaveLength(1);
        expect(practice[0].value).toBe(100);
        expect(practice[0].evidence?.attemptId).toBe(attemptId);
        expect(practice[0].evidence?.codeReviewVerdict).toBe("STRONG");
      }

      // ── Step 9: reveal reference → 200 + referenceSolution ──────
      const reveal = await req(
        "POST",
        `/api/v1/curriculum/labs/${publishedLabId}/reveal-reference`,
      );
      expect(reveal.status).toBe(200);
      expect(reveal.body.data.referenceSolution).toBe(REFERENCE_SOLUTION);
      expect(reveal.body.data.attempt.id).toBe(attemptId);
      expect(reveal.body.data.attempt.revealedReferenceAt).toBeTruthy();

      // Verify DB stamp too.
      const persistedAttempt = await prisma.labAttempt.findUnique({
        where: { id: attemptId },
      });
      expect(persistedAttempt.revealedReferenceAt).toBeTruthy();

      // ── Step 10: submit check-in (PASS mock) → 201 ──────────────
      const passCheckInMock = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildPassCheckIn()));
      overrideValidator("CHECK_IN", { aiComplete: passCheckInMock });

      const checkIn = await req(
        "POST",
        `/api/v1/curriculum/concepts/${CONCEPT_SLUG}/checkin`,
        {
          body: {
            recallAnswer: "Composition holds a reference; inheritance extends.",
            applyAnswer:
              "Apply by having Car own an Engine field instead of extending Engine.",
            buildAnswer: "class Car { private Engine engine; public Car(Engine e) { this.engine = e; } }",
            preConfidence: 4,
          },
        },
      );
      expect(checkIn.status).toBe(201);
      expect(checkIn.body.data.checkIn.aiVerdict).toBe("PASS");
      expect(checkIn.body.data.checkIn.attemptNumber).toBe(1);
      expect(checkIn.body.data.checkIn.calibrationDelta).toBe(0.1);
      expect(checkIn.body.data.usedFallback).toBe(false);
      expect(passCheckInMock).toHaveBeenCalled();

      // Verify the ConceptCheckIn row persisted.
      const checkInRows = await prisma.conceptCheckIn.findMany({
        where: { userId: LEARNER_USER_ID, conceptId: publishedConceptId },
      });
      expect(checkInRows).toHaveLength(1);
      expect(checkInRows[0].aiVerdict).toBe("PASS");
      expect(checkInRows[0].attemptNumber).toBe(1);
      expect(checkInRows[0].calibrationDelta).toBe(0.1);

      // ── Step 11: verify checkin signal on ConceptMastery ────────
      const afterCheckIn = await loadMastery();
      {
        const signals = Array.isArray(afterCheckIn.signals) ? afterCheckIn.signals : [];
        const checkinSignals = signals.filter((s) => s.source === "checkin");
        expect(checkinSignals).toHaveLength(1);
        expect(checkinSignals[0].value).toBe(100);
        expect(checkinSignals[0].evidence?.aiVerdict).toBe("PASS");
        expect(checkinSignals[0].evidence?.calibrationDelta).toBe(0.1);
        expect(checkinSignals[0].evidence?.checkInId).toBe(checkInRows[0].id);
      }

      // ── Step 12: refetch concept detail — all three signals + teachingReady ──
      // Confirm the mastery row is now fully populated with primer_read +
      // practice + checkin signals. `teachingReady` remains false in Phase 1
      // (no writer flips it — see NOTE at top of file).
      const finalConceptDetail = await req(
        "GET",
        `/api/v1/curriculum/concepts/${CONCEPT_SLUG}`,
      );
      expect(finalConceptDetail.status).toBe(200);
      const finalMastery = finalConceptDetail.body.data.concept.mastery;
      expect(finalMastery).toBeTruthy();

      const finalSignals = Array.isArray(finalMastery.signals)
        ? finalMastery.signals
        : [];
      const sourcesPresent = new Set(finalSignals.map((s) => s.source));
      expect(sourcesPresent.has("primer_read")).toBe(true);
      expect(sourcesPresent.has("practice")).toBe(true);
      expect(sourcesPresent.has("checkin")).toBe(true);

      // teachingReady: Phase 1 keeps this at its schema default (false). The
      // Week-4 truth-table flip is Phase-2 work. When Phase 2 lands and a
      // writer starts flipping the flag on (PASS check-in + STRONG lab), this
      // assertion will fail and force an intentional update.
      expect(finalMastery.teachingReady).toBe(false);

      // Score sanity: with practice=100 + checkin=100 fresh signals, the
      // weighted score should be a solid non-null value (primer_read has
      // weight 0 in SIGNAL_WEIGHTS so it doesn't move the score, but
      // practice + checkin together at 100 push it to 100).
      expect(finalMastery.score).toBeTypeOf("number");
      expect(finalMastery.score).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});

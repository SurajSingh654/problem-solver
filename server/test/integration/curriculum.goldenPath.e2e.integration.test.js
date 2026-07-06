// ============================================================================
// curriculum — Consolidated golden-path E2E integration test (W6.T3)
// ============================================================================
//
// ONE big test that walks the FULL admin → learner journey in a single
// continuous session, proving the pipeline holds together end-to-end. It is
// ADDITIVE — the split W3.T10 admin E2E and W4.T8 learner E2E remain in
// place; this file does NOT replace either.
//
// Two users, ONE team:
//   • User A (TEAM_ADMIN) — forks a TopicTemplate, runs curriculum + lesson
//     reviews, publishes each concept, flips the Lab.status to PUBLISHED,
//     publishes the topic.
//   • User B (plain MEMBER of the same team) — enrolls, reads primer,
//     submits a lab attempt, polls to COMPLETED, reveals the reference,
//     runs the check-in, and lands on teachingReady=true.
//
// The MEMBER-role case is the Security-panel-flagged coverage gap: both
// split tests use TEAM_ADMIN throughout, so a plain-MEMBER learner path
// through the learner-facing routes was never asserted end-to-end.
//
// All four AI validators are mocked via `_overrideValidatorSpec`:
//   CURRICULUM_REVIEW → WORTH_LEARNING
//   LESSON_REVIEW     → READY
//   CODE_REVIEW       → STRONG (nextStep: READY_FOR_REFERENCE)
//   CHECK_IN          → PASS
// Restored via `initCurriculumValidators()` in afterAll (W4.T8 pattern).
//
// Fixture prefix `test_w6t3_`. Cleanup uses `$executeRawUnsafe` in strict
// FK order to bypass the soft-delete middleware.
//
// Deviation from plan Step 5: the plan calls `POST .../labs/:id/publish`
// (expect 200) but the curriculumAdmin router exposes no such endpoint.
// Labs come out of the fork as DRAFT and the CRUD PATCH does not accept
// `status`. This test flips `Lab.status = "PUBLISHED"` via a direct
// prisma.lab.update — faithfully simulating what a lab-publish endpoint
// would ultimately do, and preserving the learner-side invariant that
// labs must be PUBLISHED before attempts + reveal succeed.
//
// TEST_TIMEOUT_MS = 90000 — this is a long test (~25 sequential HTTP
// round-trips + a fire-and-forget CODE_REVIEW poll).
//
// Run: cd server && npx vitest run test/integration/curriculum.goldenPath.e2e.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import curriculumRouter from "../../src/routes/curriculum.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { _overrideValidatorSpec } from "../../src/services/curriculum/contentReview.service.js";
import { initCurriculumValidators } from "../../src/services/curriculum/registerValidators.js";

// Register the real validator specs before overriding — _overrideValidatorSpec
// requires an existing spec to patch.
initCurriculumValidators();

const TEST_PREFIX = "test_w6t3_";
const TEAM_ID = `${TEST_PREFIX}team`;
const ADMIN_USER_ID = `${TEST_PREFIX}admin`;
const LEARNER_USER_ID = `${TEST_PREFIX}learner`;
const TEMPLATE_SLUG = `${TEST_PREFIX}template_1`;

const REFERENCE_SOLUTION =
  "// File: Vehicle.java\npublic class Vehicle { Engine engine; }";

const TEST_TIMEOUT_MS = 90000;

let server;
let baseUrl;
let adminToken;
let learnerToken;

// ─────────────────────────────────────────────────────────────────────────
// AI mock builders — shape mirrors W3.T10 (admin) + W4.T8 (learner)
// ─────────────────────────────────────────────────────────────────────────

function buildCurriculumReviewWorthLearningBody() {
  const outcomes = [
    "Refactor an if-else chain into Strategy in under 15 minutes.",
    "Explain composition-over-inheritance to a junior in 60 seconds.",
    "Sketch a parking-lot LLD with clean SOLID adherence in 45 minutes.",
    "Name two smells that suggest SRP violation and refactor them.",
  ];
  return {
    verdict: "WORTH_LEARNING",
    oneLineSummary: "Solid LLD curriculum.",
    outcomes,
    wontTeach: ["HLD (system design)"],
    roi: {
      time: "25 hours",
      interviewValue: "5-6 rounds unblocked",
      jobValue: "Fewer code-review pushbacks",
      depthVsBreadth: "Deep enough to matter, focused on interview slice",
      verdict: "HIGH",
    },
    retention: {
      signalsFor: ["Hands-on labs each module", "Capstone reuses concepts"],
      signalsAgainst: [],
      verdict: "HIGH",
    },
    structuralSanity: {
      moduleCount: 3,
      titleSpecificity: "STRONG",
      capstoneConcreteness: "STRONG",
      dependencyChain: "CLEAN",
    },
    modulesNeedingWork: [],
    missingCoverage: [],
    redundantModules: [],
    strong: ["Hands-on lab per module"],
    finalRecommendation: `Proceed. Learners will ${outcomes[0].toLowerCase()}`,
  };
}

function buildLessonReviewReadyBody() {
  return {
    verdict: "READY",
    structuralCompleteness: [
      {
        section: "learningObjectives",
        grade: "PASS",
        justification: "Objectives listed and measurable.",
      },
      {
        section: "workedExample",
        grade: "PASS",
        justification: "Worked example is concrete and runs.",
      },
    ],
    contentQuality: {
      depthCalibration: "PASS",
      fundamentalsFirst: "PASS",
      progressiveLayering: "PASS",
      concreteOverAcademic: "PASS",
      tradeoffHonesty: "PASS",
      productionReality: "PASS",
      curation: "PASS",
      lengthCalibration: "PASS",
    },
    seniorReadiness: {
      explainToJunior: true,
      sketchArchitecture: true,
      buildFromScratch: true,
      nameFailureModes: true,
      compareAlternatives: true,
      estimateCost: true,
      blastRadius: true,
      debugFromSymptoms: true,
    },
    seniorReadinessJustifications: {},
    mustFix: [],
    niceToHave: ["Add a follow-up exercise on generics."],
    strong: ["Clear worked example.", "Honest tradeoffs section."],
    nextStep: "Publish and monitor learner feedback for 1 week.",
  };
}

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
  // FK order: check-ins → attempts → masteries → labs → concepts → topics →
  // enrollments → memberships → teams → templates → users. Also scrub
  // content-review logs by prefix (no FK cascade path).
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" IN ($1, $2)`,
    ADMIN_USER_ID,
    LEARNER_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" IN ($1, $2)`,
    ADMIN_USER_ID,
    LEARNER_USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" IN ($1, $2)`,
    ADMIN_USER_ID,
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
    `DELETE FROM "topic_enrollments" WHERE "userId" IN ($1, $2)`,
    ADMIN_USER_ID,
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
    `DELETE FROM "topic_templates" WHERE "slug" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "email" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
}

beforeAll(async () => {
  await hardDeleteFixtures();

  // Two users, one team.
  await prisma.user.create({
    data: {
      id: ADMIN_USER_ID,
      email: `${TEST_PREFIX}admin@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "W6T3 Golden-Path Admin",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });
  await prisma.user.create({
    data: {
      id: LEARNER_USER_ID,
      email: `${TEST_PREFIX}learner@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "W6T3 Golden-Path Learner",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_ID,
      name: "W6T3 Golden-Path Team",
      status: "ACTIVE",
      createdById: ADMIN_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.create({
    data: {
      userId: ADMIN_USER_ID,
      teamId: TEAM_ID,
      role: "TEAM_ADMIN",
      isActive: true,
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

  // Seed a TopicTemplate with a single ConceptTemplate + LabTemplate — the
  // full admin fork → publish flow only needs one concept for the learner
  // side to walk. Smaller tree = fewer round-trips = faster test.
  await prisma.topicTemplate.create({
    data: {
      slug: TEMPLATE_SLUG,
      name: "W6T3 Golden-Path Template",
      description: "Template used by the W6.T3 golden-path E2E test.",
      category: "LOW_LEVEL_DESIGN",
      estimatedHoursToMastery: 4,
      templateStatus: "PUBLISHED",
      sourcePath: TEMPLATE_SLUG,
      concepts: {
        create: [
          {
            slug: "01-composition-over-inheritance",
            name: "Composition over Inheritance",
            order: 1,
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
            readinessRubric: null,
            sourcePath: `${TEMPLATE_SLUG}/01-composition-over-inheritance.md`,
            templateStatus: "PUBLISHED",
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
                sourcePath: `${TEMPLATE_SLUG}/labs/01-composition-over-inheritance`,
                templateStatus: "PUBLISHED",
              },
            },
          },
        ],
      },
    },
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/curriculum/admin", curriculumAdminRouter);
  app.use("/api/v1/curriculum", curriculumRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  adminToken = generateToken({
    id: ADMIN_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_ID,
    teamRole: "TEAM_ADMIN",
  });
  learnerToken = generateToken({
    id: LEARNER_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_ID,
    teamRole: "MEMBER",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  // Restore real validator specs so subsequent test files start clean.
  initCurriculumValidators();
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

/**
 * Poll GET /attempts/:attemptId until reviewStatus advances past
 * PENDING/REVIEWING or the timeout fires. Matches W4.T8's helper.
 */
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

async function loadMastery(conceptId) {
  return prisma.conceptMastery.findUnique({
    where: {
      userId_conceptId: { userId: LEARNER_USER_ID, conceptId },
    },
  });
}

/**
 * Poll ConceptMastery.signals until a signal from `expectedSource` appears.
 * Fire-and-forget writes in onReviewCompleted drain after the attempt row
 * transitions to COMPLETED — fixed sleeps are brittle under parallel load.
 */
async function waitForSignal(conceptId, expectedSource, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const mastery = await loadMastery(conceptId);
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

/**
 * Poll ConceptMastery.teachingReady until it flips to true. The auto-flip
 * runs synchronously in the same request path as the check-in signal write,
 * so this should return nearly instantly — the poll is just insurance.
 */
async function waitForTeachingReady(conceptId, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const mastery = await loadMastery(conceptId);
    if (mastery?.teachingReady === true) return mastery;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `waitForTeachingReady timed out after ${timeoutMs}ms`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// The one big golden-path test — TEAM_ADMIN authors, MEMBER learns
// ─────────────────────────────────────────────────────────────────────────

describe("curriculum — consolidated golden-path E2E (TEAM_ADMIN author + MEMBER learner)", () => {
  it(
    "walks the full admin fork→publish and MEMBER enroll→teachingReady flow in one continuous session",
    async () => {
      // Mock all four validators up front — restored by
      // initCurriculumValidators() in afterAll.
      const stubbedCurriculumAi = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildCurriculumReviewWorthLearningBody()));
      _overrideValidatorSpec("CURRICULUM_REVIEW", { aiComplete: stubbedCurriculumAi });

      const stubbedLessonAi = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildLessonReviewReadyBody()));
      _overrideValidatorSpec("LESSON_REVIEW", { aiComplete: stubbedLessonAi });

      const stubbedCodeReviewAi = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildStrongCodeReview()));
      _overrideValidatorSpec("CODE_REVIEW", { aiComplete: stubbedCodeReviewAi });

      const stubbedCheckInAi = vi
        .fn()
        .mockResolvedValue(JSON.stringify(buildPassCheckIn()));
      _overrideValidatorSpec("CHECK_IN", { aiComplete: stubbedCheckInAi });

      // ═══════════════════════════════════════════════════════════════════
      // ADMIN SIDE — User A (TEAM_ADMIN)
      // ═══════════════════════════════════════════════════════════════════

      // ── Step 1: fork the seeded template ────────────────────────
      const fork = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/from-template/${TEMPLATE_SLUG}`,
        { token: adminToken },
      );
      expect(fork.status).toBe(201);
      expect(fork.body?.data?.topic?.id).toBeTruthy();
      const topicId = fork.body.data.topic.id;
      const topicSlug = fork.body.data.topic.slug;
      expect(fork.body.data.topic.teamId).toBe(TEAM_ID);
      expect(fork.body.data.topic.status).toBe("DRAFT");

      // Pull concept + lab IDs from the topic detail — the fork response
      // shape doesn't include children directly.
      const detail = await req(
        "GET",
        `/api/v1/curriculum/admin/topics/${topicId}`,
        { token: adminToken },
      );
      expect(detail.status).toBe(200);
      expect(detail.body.data.topic.concepts).toHaveLength(1);
      const concept = detail.body.data.topic.concepts[0];
      const conceptId = concept.id;
      const conceptSlug = concept.slug;
      const labId = concept.lab.id;

      // Add the readinessRubric required by the concept-publish gate.
      const rubric = {
        explainToJunior: "Explain in 60 seconds to a junior engineer.",
        sketchArchitecture: "Sketch on a whiteboard.",
        buildFromScratch: "Build minimal working example.",
        nameFailureModes: "Name three failure modes.",
        compareAlternatives: "Compare with two alternatives.",
        estimateCost: "Estimate CPU + memory cost.",
        blastRadius: "Describe blast radius on failure.",
        debugFromSymptoms: "Debug from a stack trace.",
      };
      const patchConcept = await req(
        "PATCH",
        `/api/v1/curriculum/admin/concepts/${conceptId}`,
        { token: adminToken, body: { readinessRubric: rubric } },
      );
      expect(patchConcept.status).toBe(200);

      // ── Step 2: topic-level curriculum review → WORTH_LEARNING ──
      const topicReview = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topicId}/review`,
        { token: adminToken },
      );
      expect(topicReview.status).toBe(200);
      expect(topicReview.body.data.verdict).toBe("WORTH_LEARNING");

      // ── Step 3: concept-level lesson review → READY ─────────────
      const conceptReview = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${conceptId}/review`,
        { token: adminToken },
      );
      expect(conceptReview.status).toBe(200);
      expect(conceptReview.body.data.verdict).toBe("READY");

      // ── Step 4: publish the concept → 200 PUBLISHED ─────────────
      const publishConcept = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${conceptId}/publish`,
        { token: adminToken },
      );
      expect(publishConcept.status).toBe(200);
      expect(publishConcept.body.data.concept.status).toBe("PUBLISHED");

      // ── Step 5: publish the lab ─────────────────────────────────
      // DEVIATION from plan: no POST /labs/:id/publish endpoint exists.
      // Labs come out of the fork as DRAFT; the CRUD PATCH does not
      // accept `status`. Simulate the missing publish endpoint with a
      // direct Prisma update — the learner routes filter labs by
      // status="PUBLISHED", so this is required for the journey to
      // proceed. See file header for the full rationale.
      const publishedLab = await prisma.lab.update({
        where: { id: labId },
        data: { status: "PUBLISHED" },
      });
      expect(publishedLab.status).toBe("PUBLISHED");

      // ── Step 6: publish the topic → 200 PUBLISHED ───────────────
      const publishTopic = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topicId}/publish`,
        { token: adminToken },
      );
      expect(publishTopic.status).toBe(200);
      expect(publishTopic.body.data.topic.status).toBe("PUBLISHED");

      // ═══════════════════════════════════════════════════════════════════
      // LEARNER SIDE — User B (MEMBER, same team)
      // ═══════════════════════════════════════════════════════════════════

      // ── Step 7: enroll in the published topic → 201 ─────────────
      const enroll = await req(
        "POST",
        `/api/v1/curriculum/topics/${topicSlug}/enroll`,
        { token: learnerToken },
      );
      expect(enroll.status).toBe(201);
      expect(enroll.body?.data?.enrollment?.status).toBe("ACTIVE");
      expect(enroll.body.data.enrollment.userId).toBe(LEARNER_USER_ID);

      // ── Step 8: GET concept detail — no reference/starter leak ──
      const conceptDetail = await req(
        "GET",
        `/api/v1/curriculum/concepts/${conceptSlug}`,
        { token: learnerToken },
      );
      expect(conceptDetail.status).toBe(200);
      expect(conceptDetail.body.data.concept.slug).toBe(conceptSlug);
      expect(conceptDetail.body.data.concept.lab.referenceSolution).toBeUndefined();
      expect(conceptDetail.body.data.concept.lab.starterCode).toBeUndefined();

      // ── Step 9: mark primer read → 200 ──────────────────────────
      const primerRead = await req(
        "POST",
        `/api/v1/curriculum/concepts/${conceptSlug}/mark-primer-read`,
        { token: learnerToken, body: {} },
      );
      expect(primerRead.status).toBe(200);
      expect(primerRead.body.data.ok).toBe(true);

      // ── Step 10: submit lab attempt → 202 PENDING ───────────────
      const submit = await req(
        "POST",
        `/api/v1/curriculum/labs/${labId}/attempts`,
        {
          token: learnerToken,
          body: {
            code: "public class Vehicle { private Engine engine; }",
          },
        },
      );
      expect(submit.status).toBe(202);
      expect(submit.body.data.attemptId).toBeTruthy();
      expect(submit.body.data.reviewStatus).toBe("PENDING");
      const attemptId = submit.body.data.attemptId;

      // ── Step 11: poll GET .../attempts/:attemptId → COMPLETED ───
      const resolvedAttempt = await pollUntilResolved(
        labId,
        attemptId,
        learnerToken,
      );
      expect(resolvedAttempt.reviewStatus).toBe("COMPLETED");
      expect(resolvedAttempt.codeReviewVerdict).toBe("STRONG");
      expect(stubbedCodeReviewAi).toHaveBeenCalled();

      // ── Step 12: poll ConceptMastery.signals for practice ───────
      // Signal writes happen inside onReviewCompleted AFTER the attempt row
      // transitions — poll rather than sleep.
      await waitForSignal(conceptId, "practice");

      // ── Step 13: reveal reference → 200 with referenceSolution ──
      const reveal = await req(
        "POST",
        `/api/v1/curriculum/labs/${labId}/reveal-reference`,
        { token: learnerToken },
      );
      expect(reveal.status).toBe(200);
      expect(reveal.body.data.referenceSolution).toBeTruthy();
      expect(reveal.body.data.attempt.revealedReferenceAt).toBeTruthy();

      // ── Step 14: submit check-in (PASS mock) → 201 ──────────────
      const checkIn = await req(
        "POST",
        `/api/v1/curriculum/concepts/${conceptSlug}/checkin`,
        {
          token: learnerToken,
          body: {
            recallAnswer: "Composition holds a reference; inheritance extends.",
            applyAnswer:
              "Apply by having Car own an Engine field instead of extending Engine.",
            buildAnswer:
              "class Car { private Engine engine; public Car(Engine e) { this.engine = e; } }",
            preConfidence: 4,
          },
        },
      );
      expect(checkIn.status).toBe(201);
      expect(checkIn.body.data.checkIn.aiVerdict).toBe("PASS");
      expect(stubbedCheckInAi).toHaveBeenCalled();

      // ── Step 15: poll ConceptMastery.teachingReady → true ───────
      await waitForTeachingReady(conceptId);

      // ═══════════════════════════════════════════════════════════════════
      // FINAL ASSERTION — full 4-signal picture
      // ═══════════════════════════════════════════════════════════════════
      const mastery = await prisma.conceptMastery.findUnique({
        where: {
          userId_conceptId: {
            userId: LEARNER_USER_ID,
            conceptId,
          },
        },
      });
      expect(mastery.teachingReady).toBe(true);
      const sources = new Set(
        (mastery.signals ?? []).map((s) => s.source),
      );
      expect(sources.has("primer_read")).toBe(true);
      expect(sources.has("practice")).toBe(true);
      expect(sources.has("checkin")).toBe(true);
      expect(sources.has("teachingReady")).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );
});

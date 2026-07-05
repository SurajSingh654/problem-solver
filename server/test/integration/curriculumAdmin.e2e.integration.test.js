// ============================================================================
// curriculumAdmin — End-to-end integration test (W3.T10 / Deliverable A)
// ============================================================================
//
// One big test that walks the reviewer authoring flow from fork all the way
// to a fully-published topic:
//
//   1. Fork a global TopicTemplate into the caller's team.
//   2. GET the topic detail (verify the tree fell in).
//   3. PATCH topic metadata.
//   4. PATCH every concept to add a readinessRubric (required for publish).
//   5. Mock CURRICULUM_REVIEW + LESSON_REVIEW AI outputs via
//      `_overrideValidatorSpec`.
//   6. Run curriculum-review at the topic level; run lesson-review at each
//      concept level.
//   7. Attempt topic publish — expect 400 PUBLISH_GATE_BLOCKED because no
//      child concepts are PUBLISHED yet.
//   8. Publish each concept.
//   9. Retry topic publish → 200; verify DB state.
//
// The AI mocks live behind `_overrideValidatorSpec` — same pattern the
// publish-gate integration test uses. Restore via `initCurriculumValidators`
// after the test to keep the process-global validator registry sane for
// subsequent test files.
//
// TEST_TIMEOUT_MS = 60000 — this is a long test (~20 sequential HTTP
// round-trips + Prisma writes). Railway Postgres round-trips can be slow.
//
// Fixture prefix `test_w3t10_` — chosen to NOT share a leading substring
// with any other integration test's TEST_PREFIX. In particular, avoiding
// `test_curradm_` (topic CRUD test) and `test_w3t4pg_` (publish-gate test)
// so their beforeAll cleanup regexes don't wipe our fixtures.
//
// Run: cd server && npx vitest run test/integration/curriculumAdmin.e2e.integration.test.js
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { _overrideValidatorSpec } from "../../src/services/curriculum/contentReview.service.js";
import { initCurriculumValidators } from "../../src/services/curriculum/registerValidators.js";

// Ensure the real validator specs are registered before we start overriding.
initCurriculumValidators();

const TEST_PREFIX = "test_w3t10_";
const TEAM_ID = `${TEST_PREFIX}team`;
const USER_ID = `${TEST_PREFIX}admin`;
const TEMPLATE_SLUG = `${TEST_PREFIX}template_1`;

const TEST_TIMEOUT_MS = 60000;

let server;
let baseUrl;
let adminToken;

// ─────────────────────────────────────────────────────────────────────────
// AI mock builders
// ─────────────────────────────────────────────────────────────────────────

/**
 * Full LESSON_REVIEW `READY` payload — passes Zod schema + Rule 19
 * (≥6/8 seniorReadiness true) + Rule 22-lesson. Shape mirrors
 * `test/services/lessonReview.test.js::buildReadySample()`.
 */
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

/**
 * Full CURRICULUM_REVIEW `WORTH_LEARNING` payload — passes Zod schema +
 * Rule 22-curriculum (≥4 outcomes) + Rule 18 (finalRecommendation must
 * cite one outcome verbatim). Shape mirrors
 * `test/services/curriculumReview.test.js`.
 */
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
    // Rule 18 — cite the first outcome verbatim (Rule 18 needs ≥40-char
    // outcome prefix substring, so the full sentence is fine).
    finalRecommendation: `Proceed. Learners will ${outcomes[0].toLowerCase()}`,
  };
}

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
  // Fully reinitialize the validator registry — simpler + safer than trying
  // to shallow-restore each patched key onto whatever specs already exist.
  initCurriculumValidators();
  _originalSpecs.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// Fixture DB seed / teardown
// ─────────────────────────────────────────────────────────────────────────

async function hardDeleteFixtures() {
  // Content review logs — no FK, scrub by prefix.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "content_review_logs" WHERE "targetId" LIKE $1`,
    `${TEST_PREFIX}%`,
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

  await prisma.user.create({
    data: {
      id: USER_ID,
      email: `${TEST_PREFIX}admin@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "W3T10 E2E Admin",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_ID,
      name: "W3T10 E2E Team",
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
      role: "TEAM_ADMIN",
      isActive: true,
    },
  });

  // Seed a TopicTemplate with 2 ConceptTemplates + 1 LabTemplate on the
  // first concept. Small tree so the fork transaction stays fast, but big
  // enough that the "publish topic before all concepts published" gate
  // has a target to complain about.
  await prisma.topicTemplate.create({
    data: {
      slug: TEMPLATE_SLUG,
      name: "W3T10 E2E Template",
      description: "Template used by the W3.T10 end-to-end integration test.",
      category: "LOW_LEVEL_DESIGN",
      estimatedHoursToMastery: 6,
      templateStatus: "PUBLISHED",
      sourcePath: TEMPLATE_SLUG,
      concepts: {
        create: [
          {
            slug: "01-composition-over-inheritance",
            name: "Composition over Inheritance",
            order: 1,
            primerMarkdown: "# Composition\n\nHold a reference; don't extend.",
            primerHtml: "<h1>Composition</h1><p>Hold a reference; don't extend.</p>",
            workedExample: "class Car { engine: Engine; ... }",
            canonicalSources: [{ title: "GoF Ch1", type: "book" }],
            expectedQuestions: ["When to prefer inheritance?"],
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
                referenceSolution:
                  "// File: Vehicle.java\npublic class Vehicle { Engine engine; }",
                expectedArtifacts: ["Refactored classes", "Passing tests"],
                sourcePath: `${TEMPLATE_SLUG}/labs/01-composition-over-inheritance`,
                templateStatus: "PUBLISHED",
              },
            },
          },
          {
            slug: "02-strategy-pattern",
            name: "Strategy Pattern",
            order: 2,
            primerMarkdown: "# Strategy\n\nSwap algorithm at runtime.",
            primerHtml: null,
            workedExample: null,
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            readinessRubric: null,
            sourcePath: `${TEMPLATE_SLUG}/02-strategy-pattern.md`,
            templateStatus: "PUBLISHED",
          },
        ],
      },
    },
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1/curriculum/admin", curriculumAdminRouter);
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;

  adminToken = generateToken({
    id: USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_ID,
    teamRole: "TEAM_ADMIN",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  restoreAllValidators();
  await hardDeleteFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

async function req(method, path, { token = adminToken, body } = {}) {
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

// ─────────────────────────────────────────────────────────────────────────
// The one big end-to-end test
// ─────────────────────────────────────────────────────────────────────────

describe("curriculumAdmin — end-to-end fork → edit → review → publish", () => {
  it(
    "walks the reviewer authoring flow from fork to fully-published topic",
    async () => {
      // ── Step 1: fork the seeded template ────────────────────────
      const fork = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/from-template/${TEMPLATE_SLUG}`,
      );
      expect(fork.status).toBe(201);
      expect(fork.body?.data?.topic?.id).toBeTruthy();
      expect(fork.body.data.conceptCount).toBe(2);
      expect(fork.body.data.labCount).toBe(1);

      const topicId = fork.body.data.topic.id;
      expect(fork.body.data.topic.teamId).toBe(TEAM_ID);
      expect(fork.body.data.topic.status).toBe("DRAFT");

      // ── Step 2: GET topic detail, verify tree ───────────────────
      const detail = await req(
        "GET",
        `/api/v1/curriculum/admin/topics/${topicId}`,
      );
      expect(detail.status).toBe(200);
      expect(detail.body.data.topic.concepts).toHaveLength(2);
      expect(detail.body.data.topic.concepts[0].slug).toBe(
        "01-composition-over-inheritance",
      );
      expect(detail.body.data.topic.concepts[0].lab).toBeTruthy();
      expect(detail.body.data.topic.concepts[1].slug).toBe("02-strategy-pattern");
      expect(detail.body.data.topic.concepts[1].lab).toBeNull();

      const [concept1, concept2] = detail.body.data.topic.concepts;

      // ── Step 3: PATCH topic metadata ────────────────────────────
      const patchTopic = await req(
        "PATCH",
        `/api/v1/curriculum/admin/topics/${topicId}`,
        { body: { name: "W3T10 E2E Team's Curriculum", estimatedHoursToMastery: 8 } },
      );
      expect(patchTopic.status).toBe(200);
      expect(patchTopic.body.data.topic.name).toBe("W3T10 E2E Team's Curriculum");
      expect(patchTopic.body.data.topic.estimatedHoursToMastery).toBe(8);

      // ── Step 4: PATCH each concept to add a readinessRubric ─────
      // Both concepts need a rubric before the publish-concept gate passes.
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
      for (const c of [concept1, concept2]) {
        const patchC = await req(
          "PATCH",
          `/api/v1/curriculum/admin/concepts/${c.id}`,
          { body: { readinessRubric: rubric } },
        );
        expect(patchC.status).toBe(200);
        expect(patchC.body.data.concept.readinessRubric).toBeTruthy();
      }

      // ── Step 5: mock the LESSON_REVIEW validator → READY ────────
      // aiComplete returns the stubbed READY payload. runValidator will
      // Zod-parse + validate + write the ContentReviewLog row.
      const lessonReviewBody = buildLessonReviewReadyBody();
      const stubbedLessonAi = vi
        .fn()
        .mockResolvedValue(JSON.stringify(lessonReviewBody));
      overrideValidator("LESSON_REVIEW", { aiComplete: stubbedLessonAi });

      // ── Step 6: run lesson-review on concept 1 → READY ──────────
      const review1 = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept1.id}/review`,
      );
      expect(review1.status).toBe(200);
      expect(review1.body.data.verdict).toBe("READY");
      expect(review1.body.data.usedFallback).toBe(false);

      // ── Step 7: publish concept 1 → 200 ─────────────────────────
      const publish1 = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept1.id}/publish`,
      );
      expect(publish1.status).toBe(200);
      expect(publish1.body.data.concept.status).toBe("PUBLISHED");
      expect(publish1.body.data.concept.publishedAt).toBeTruthy();

      // Verify DB.
      const c1Row = await prisma.concept.findUnique({
        where: { id: concept1.id },
      });
      expect(c1Row.status).toBe("PUBLISHED");
      expect(c1Row.publishedAt).toBeInstanceOf(Date);

      // ── Step 8: run curriculum-review on the topic → WORTH_LEARNING ─
      const curriculumReviewBody = buildCurriculumReviewWorthLearningBody();
      const stubbedCurriculumAi = vi
        .fn()
        .mockResolvedValue(JSON.stringify(curriculumReviewBody));
      overrideValidator("CURRICULUM_REVIEW", { aiComplete: stubbedCurriculumAi });

      const topicReview = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topicId}/review`,
      );
      expect(topicReview.status).toBe(200);
      expect(topicReview.body.data.verdict).toBe("WORTH_LEARNING");
      expect(topicReview.body.data.usedFallback).toBe(false);

      // Verify Topic.curriculumReview cache populated.
      const topicRow = await prisma.topic.findUnique({ where: { id: topicId } });
      expect(topicRow.lastReviewedAt).toBeInstanceOf(Date);
      expect(topicRow.curriculumReview?.verdict).toBe("WORTH_LEARNING");

      // ── Step 9: attempt topic publish — 400 (concept 2 still DRAFT) ──
      const publishTopicFail = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topicId}/publish`,
      );
      expect(publishTopicFail.status).toBe(400);
      expect(publishTopicFail.body?.error?.code).toBe("PUBLISH_GATE_BLOCKED");
      const gates = publishTopicFail.body?.error?.details?.gates ?? [];
      const reviewGate = gates.find((g) => g.id === "curriculum_review_verdict");
      expect(reviewGate?.status).toBe("PASS");
      const conceptsGate = gates.find((g) => g.id === "concepts_all_published");
      expect(conceptsGate?.status).toBe("FAIL");
      // The gate message should name the DRAFT concept's slug.
      expect(conceptsGate?.message).toContain("02-strategy-pattern");

      // ── Step 10: review + publish concept 2 ─────────────────────
      const review2 = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept2.id}/review`,
      );
      expect(review2.status).toBe(200);
      expect(review2.body.data.verdict).toBe("READY");

      const publish2 = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept2.id}/publish`,
      );
      expect(publish2.status).toBe(200);
      expect(publish2.body.data.concept.status).toBe("PUBLISHED");

      // ── Step 11: retry topic publish → 200 ──────────────────────
      const publishTopicOk = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topicId}/publish`,
      );
      expect(publishTopicOk.status).toBe(200);
      expect(publishTopicOk.body.data.topic.status).toBe("PUBLISHED");
      expect(publishTopicOk.body.data.topic.publishedAt).toBeTruthy();

      // ── Step 12: verify final DB state ──────────────────────────
      const finalTopic = await prisma.topic.findUnique({
        where: { id: topicId },
        include: { concepts: true },
      });
      expect(finalTopic.status).toBe("PUBLISHED");
      expect(finalTopic.publishedAt).toBeInstanceOf(Date);
      for (const c of finalTopic.concepts) {
        expect(c.status).toBe("PUBLISHED");
        expect(c.publishedAt).toBeInstanceOf(Date);
      }

      // Sanity: the AI mocks were actually invoked (guards against a
      // regression where runValidator short-circuits before hitting AI).
      expect(stubbedLessonAi).toHaveBeenCalled();
      expect(stubbedCurriculumAi).toHaveBeenCalled();
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// curriculumAdmin Review + Publish-gate — integration test (W3.T4)
// ============================================================================
//
// Exercises the five new routes end-to-end:
//   - POST /topics/:id/review   (AI-backed, mocked via _overrideValidatorSpec)
//   - POST /concepts/:id/review (AI-backed, mocked via _overrideValidatorSpec)
//   - POST /labs/:id/review     (deterministic shape check, no AI)
//   - POST /topics/:id/publish  (gate-enforced; failure → 400 with gates[])
//   - POST /concepts/:id/publish (gate-enforced; failure → 400 with gates[])
//
// The publish-gate half of the test suite doesn't exercise the AI validators
// at all — it seeds ContentReviewLog rows directly and verifies the gate's
// read path. This keeps the gate assertions decoupled from AI-response
// shape drift and keeps the test fast. The review-trigger half swaps
// `aiComplete` on the registered validator spec so runValidator sees a
// deterministic stubbed AI output (same pattern as the prompt-injection
// integration test at test/integration/curriculum.prompt-injection.integration.test.js).
//
// Fixtures use the `test_curradm_pg_` prefix to avoid collision with W3.T1-T3
// fixture rows in a shared dev database.
//
// Cleanup uses raw SQL DELETE (matches the W3.T2/T3 pattern) plus explicit
// content_review_logs cleanup — the log table isn't cascade-linked to
// Topic/Concept/Lab (polymorphic target, no FK).
//
// Run: cd server && npx vitest run test/integration/curriculumAdmin.publish-gate.integration.test.js
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import {
  _overrideValidatorSpec,
} from "../../src/services/curriculum/contentReview.service.js";
import { initCurriculumValidators } from "../../src/services/curriculum/registerValidators.js";

// Ensure the real validator specs are registered before any review-trigger
// test runs. Idempotent — safe even if another suite already initialized.
initCurriculumValidators();

// Prefix chosen to NOT share a leading substring with any other integration
// test's TEST_PREFIX (e.g. `test_curradm_` from the W3.T2 topic test — which
// scrubs `email LIKE test_curradm_%` in beforeAll and would wipe our seeded
// fixtures out from under us when vitest runs both files on parallel workers).
const TEST_PREFIX = "test_w3t4pg_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const ADMIN_A_USER_ID = `${TEST_PREFIX}admin_a`;
const ADMIN_B_USER_ID = `${TEST_PREFIX}admin_b`;

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let adminAToken;

async function hardDeleteTestFixtures() {
  // Order: content_review_logs (no FK — must be deleted by target id lookup),
  // then labs/concepts/topics (cascade via FK from topics on team delete
  // works too, but we're explicit to match the W3.T2/T3 pattern), then
  // team_memberships, then teams, then users.
  //
  // ContentReviewLog isn't team-scoped so we scrub by target-id prefix
  // instead. `w3t4_` prefix is used for every seeded log row below.
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

/**
 * Seed a ContentReviewLog row directly. Publish-gate tests use this to
 * exercise the gate's read path without invoking the AI validator.
 */
async function seedReviewLog(targetType, targetId, verdict) {
  return prisma.contentReviewLog.create({
    data: {
      targetType,
      targetId,
      verdict,
      body: { verdict, note: "seeded for W3.T4 publish-gate test" },
      reviewerModel: "test-model",
    },
  });
}

/**
 * Restore any validator specs overridden mid-test. Tracks the ORIGINAL spec
 * (per-type) so nested overrides in the same test don't shadow it.
 */
const _originalSpecs = new Map();
function overrideValidator(type, patch) {
  const original = _overrideValidatorSpec(type, patch);
  if (!_originalSpecs.has(type)) {
    _originalSpecs.set(type, original);
  }
}

beforeAll(async () => {
  await hardDeleteTestFixtures();

  await prisma.user.createMany({
    data: [
      {
        id: ADMIN_A_USER_ID,
        email: `${TEST_PREFIX}admin_a@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Admin A",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: ADMIN_B_USER_ID,
        email: `${TEST_PREFIX}admin_b@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Admin B",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "CurrAdmin PG Team A",
      status: "ACTIVE",
      createdById: ADMIN_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "CurrAdmin PG Team B",
      status: "ACTIVE",
      createdById: ADMIN_B_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.createMany({
    data: [
      {
        userId: ADMIN_A_USER_ID,
        teamId: TEAM_A_ID,
        role: "TEAM_ADMIN",
        isActive: true,
      },
      {
        userId: ADMIN_B_USER_ID,
        teamId: TEAM_B_ID,
        role: "TEAM_ADMIN",
        isActive: true,
      },
    ],
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

  adminAToken = generateToken({
    id: ADMIN_A_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_A_ID,
    teamRole: "TEAM_ADMIN",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

beforeEach(async () => {
  // Clean per-test rows (topics + concepts + labs cascade via FK; also
  // scrub the log table by prefix).
  await prisma.$executeRawUnsafe(
    `DELETE FROM "content_review_logs" WHERE "targetId" LIKE $1`,
    `${TEST_PREFIX}%`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" IN ($1, $2)`,
    TEAM_A_ID,
    TEAM_B_ID,
  );
}, TEST_TIMEOUT_MS);

afterEach(() => {
  // Restore any validator specs overridden during the test.
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

// Helper to seed a Topic with the id under our prefix so
// `content_review_logs` scrub-by-prefix catches its log rows too.
async function createTopicFixture({
  suffix,
  teamId = TEAM_A_ID,
  status = "DRAFT",
} = {}) {
  const id = `${TEST_PREFIX}topic_${suffix}`;
  return prisma.topic.create({
    data: {
      id,
      slug: `w3t4-${suffix}`,
      name: `W3T4 ${suffix}`,
      description: "Publish-gate test topic.",
      category: "LOW_LEVEL_DESIGN",
      status,
      teamId,
    },
  });
}

async function createConceptFixture({
  suffix,
  topicId,
  teamId = TEAM_A_ID,
  status = "DRAFT",
  readinessRubric = null,
} = {}) {
  const id = `${TEST_PREFIX}concept_${suffix}`;
  return prisma.concept.create({
    data: {
      id,
      topicId,
      teamId,
      slug: `w3t4-c-${suffix}`,
      name: `W3T4 Concept ${suffix}`,
      order: 1,
      status,
      primerMarkdown: "# Primer",
      readinessRubric,
    },
  });
}

async function createLabFixture({
  suffix,
  conceptId,
  teamId = TEAM_A_ID,
  taskMarkdown = "Substantive task description that easily clears the 100-char shape-check threshold set by reviewLab.",
  referenceSolution = "// reference solution",
  expectedArtifacts = [{ type: "file", name: "Main.java" }],
} = {}) {
  const id = `${TEST_PREFIX}lab_${suffix}`;
  return prisma.lab.create({
    data: {
      id,
      conceptId,
      teamId,
      title: `W3T4 Lab ${suffix}`,
      taskMarkdown,
      language: "JAVA",
      referenceSolution,
      expectedArtifacts,
    },
  });
}

// ============================================================================
// Topic publish gates
// ============================================================================

describe("POST /curriculum/admin/topics/:id/publish", () => {
  it(
    "returns 400 PUBLISH_GATE_BLOCKED with curriculum_review_verdict:FAIL when no review has been run",
    async () => {
      const topic = await createTopicFixture({ suffix: "no_review" });
      await createConceptFixture({
        suffix: "no_review",
        topicId: topic.id,
        status: "PUBLISHED",
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topic.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(400);
      expect(body?.error?.code).toBe("PUBLISH_GATE_BLOCKED");
      const gates = body?.error?.details?.gates ?? [];
      const reviewGate = gates.find((g) => g.id === "curriculum_review_verdict");
      expect(reviewGate?.status).toBe("FAIL");
      expect(reviewGate?.message).toMatch(/No curriculum review/i);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "publishes when latest verdict is WORTH_WITH_ADJUSTMENTS (loosened gate — AI is a coach, not a gatekeeper)",
    async () => {
      // Commit b3a1c9f (2026-07-07) loosened the topic gate to accept both
      // WORTH_LEARNING and WORTH_WITH_ADJUSTMENTS. Only NOT_WORTH_TIME blocks.
      const topic = await createTopicFixture({ suffix: "adj" });
      await createConceptFixture({
        suffix: "adj",
        topicId: topic.id,
        status: "PUBLISHED",
      });
      await seedReviewLog("TOPIC", topic.id, "WORTH_WITH_ADJUSTMENTS");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topic.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
      expect(body?.data?.topic?.status).toBe("PUBLISHED");
      const reviewGate = body?.data?.gates?.find(
        (g) => g.id === "curriculum_review_verdict",
      );
      expect(reviewGate?.status).toBe("PASS");
      expect(reviewGate?.message).toBe("WORTH_WITH_ADJUSTMENTS");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 400 with concepts_all_published:FAIL listing the DRAFT concept's slug",
    async () => {
      const topic = await createTopicFixture({ suffix: "draft_child" });
      await createConceptFixture({
        suffix: "draft_child_1",
        topicId: topic.id,
        status: "PUBLISHED",
      });
      const draftConcept = await createConceptFixture({
        suffix: "draft_child_2",
        topicId: topic.id,
        status: "DRAFT",
      });
      await seedReviewLog("TOPIC", topic.id, "WORTH_LEARNING");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topic.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(400);
      const gates = body?.error?.details?.gates ?? [];
      // Review gate should PASS (we seeded WORTH_LEARNING).
      const reviewGate = gates.find((g) => g.id === "curriculum_review_verdict");
      expect(reviewGate?.status).toBe("PASS");
      // Concepts gate should FAIL with the DRAFT concept's slug.
      const conceptsGate = gates.find((g) => g.id === "concepts_all_published");
      expect(conceptsGate?.status).toBe("FAIL");
      expect(conceptsGate?.message).toContain(draftConcept.slug);
      expect(conceptsGate?.message).toContain("1 of 2");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 400 with concepts_all_published:FAIL when topic has zero concepts",
    async () => {
      const topic = await createTopicFixture({ suffix: "empty" });
      await seedReviewLog("TOPIC", topic.id, "WORTH_LEARNING");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topic.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(400);
      const gates = body?.error?.details?.gates ?? [];
      const conceptsGate = gates.find((g) => g.id === "concepts_all_published");
      expect(conceptsGate?.status).toBe("FAIL");
      expect(conceptsGate?.message).toMatch(/no concepts/i);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "flips Topic.status to PUBLISHED and sets publishedAt when both gates PASS",
    async () => {
      const topic = await createTopicFixture({ suffix: "ok" });
      await createConceptFixture({
        suffix: "ok_1",
        topicId: topic.id,
        status: "PUBLISHED",
      });
      await createConceptFixture({
        suffix: "ok_2",
        topicId: topic.id,
        status: "PUBLISHED",
      });
      await seedReviewLog("TOPIC", topic.id, "WORTH_LEARNING");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topic.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
      expect(body?.data?.topic?.status).toBe("PUBLISHED");
      expect(body?.data?.topic?.publishedAt).toBeTruthy();

      const persisted = await prisma.topic.findUnique({ where: { id: topic.id } });
      expect(persisted.status).toBe("PUBLISHED");
      expect(persisted.publishedAt).toBeInstanceOf(Date);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 TOPIC_NOT_FOUND when Team A admin tries to publish Team B's topic",
    async () => {
      const teamBTopic = await createTopicFixture({
        suffix: "b_cross",
        teamId: TEAM_B_ID,
      });
      await seedReviewLog("TOPIC", teamBTopic.id, "WORTH_LEARNING");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${teamBTopic.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "uses only the LATEST verdict (chronologically) when multiple logs exist",
    async () => {
      const topic = await createTopicFixture({ suffix: "latest" });
      await createConceptFixture({
        suffix: "latest",
        topicId: topic.id,
        status: "PUBLISHED",
      });
      // Seed an older FAIL verdict, then a newer PASS. latestVerdictFor
      // orders by createdAt DESC — the newer row should win.
      await seedReviewLog("TOPIC", topic.id, "NOT_WORTH_TIME");
      // Small delay to guarantee distinct createdAt.
      await new Promise((r) => setTimeout(r, 10));
      await seedReviewLog("TOPIC", topic.id, "WORTH_LEARNING");

      const { status } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topic.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Concept publish gates
// ============================================================================

describe("POST /curriculum/admin/concepts/:id/publish", () => {
  it(
    "returns 400 with lesson_review_verdict:FAIL when no review has been run",
    async () => {
      const topic = await createTopicFixture({ suffix: "cpg_no_review" });
      const concept = await createConceptFixture({
        suffix: "no_review",
        topicId: topic.id,
        readinessRubric: { readinessThreshold: 0.8 },
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(400);
      expect(body?.error?.code).toBe("PUBLISH_GATE_BLOCKED");
      const gates = body?.error?.details?.gates ?? [];
      const reviewGate = gates.find((g) => g.id === "lesson_review_verdict");
      expect(reviewGate?.status).toBe("FAIL");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 400 with readiness_rubric_present:FAIL when rubric is null (even with READY verdict)",
    async () => {
      const topic = await createTopicFixture({ suffix: "cpg_no_rubric" });
      const concept = await createConceptFixture({
        suffix: "no_rubric",
        topicId: topic.id,
        readinessRubric: null,
      });
      await seedReviewLog("CONCEPT", concept.id, "READY");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(400);
      const gates = body?.error?.details?.gates ?? [];
      const reviewGate = gates.find((g) => g.id === "lesson_review_verdict");
      expect(reviewGate?.status).toBe("PASS");
      const rubricGate = gates.find((g) => g.id === "readiness_rubric_present");
      expect(rubricGate?.status).toBe("FAIL");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 400 with lesson_review_verdict:FAIL when latest verdict is NOT_READY",
    async () => {
      const topic = await createTopicFixture({ suffix: "cpg_notready" });
      const concept = await createConceptFixture({
        suffix: "notready",
        topicId: topic.id,
        readinessRubric: { readinessThreshold: 0.8 },
      });
      await seedReviewLog("CONCEPT", concept.id, "NOT_READY");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(400);
      const gates = body?.error?.details?.gates ?? [];
      const reviewGate = gates.find((g) => g.id === "lesson_review_verdict");
      expect(reviewGate?.status).toBe("FAIL");
      expect(reviewGate?.message).toContain("NOT_READY");
      expect(reviewGate?.message).toContain("READY");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "flips Concept.status to PUBLISHED when both gates PASS",
    async () => {
      const topic = await createTopicFixture({ suffix: "cpg_ok" });
      const concept = await createConceptFixture({
        suffix: "ok",
        topicId: topic.id,
        readinessRubric: { readinessThreshold: 0.8 },
      });
      await seedReviewLog("CONCEPT", concept.id, "READY");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
      expect(body?.data?.concept?.status).toBe("PUBLISHED");

      const persisted = await prisma.concept.findUnique({
        where: { id: concept.id },
      });
      expect(persisted.status).toBe("PUBLISHED");
      expect(persisted.publishedAt).toBeInstanceOf(Date);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 CONCEPT_NOT_FOUND on cross-team publish attempt",
    async () => {
      const teamBTopic = await createTopicFixture({
        suffix: "cpg_b",
        teamId: TEAM_B_ID,
      });
      const teamBConcept = await createConceptFixture({
        suffix: "cpg_b",
        topicId: teamBTopic.id,
        teamId: TEAM_B_ID,
        readinessRubric: { readinessThreshold: 0.8 },
      });
      await seedReviewLog("CONCEPT", teamBConcept.id, "READY");

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${teamBConcept.id}/publish`,
        { token: adminAToken },
      );

      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Lab deterministic shape-check
// ============================================================================

describe("POST /curriculum/admin/labs/:id/review", () => {
  it(
    "returns PASS when taskMarkdown, referenceSolution, and expectedArtifacts are all present",
    async () => {
      const topic = await createTopicFixture({ suffix: "lab_pass" });
      const concept = await createConceptFixture({
        suffix: "lab_pass",
        topicId: topic.id,
      });
      const lab = await createLabFixture({
        suffix: "pass",
        conceptId: concept.id,
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/labs/${lab.id}/review`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
      expect(body?.data?.verdict).toBe("PASS");
      expect(body?.data?.body?.issues).toEqual([]);
      expect(body?.data?.labShapeCheck).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns FAIL when taskMarkdown is too short",
    async () => {
      const topic = await createTopicFixture({ suffix: "lab_short" });
      const concept = await createConceptFixture({
        suffix: "lab_short",
        topicId: topic.id,
      });
      const lab = await createLabFixture({
        suffix: "short",
        conceptId: concept.id,
        taskMarkdown: "too short",
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/labs/${lab.id}/review`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
      expect(body?.data?.verdict).toBe("FAIL");
      expect(body?.data?.body?.issues.some((i) => i.includes("taskMarkdown"))).toBe(
        true,
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns FAIL when expectedArtifacts is empty",
    async () => {
      const topic = await createTopicFixture({ suffix: "lab_noart" });
      const concept = await createConceptFixture({
        suffix: "lab_noart",
        topicId: topic.id,
      });
      const lab = await createLabFixture({
        suffix: "noart",
        conceptId: concept.id,
        expectedArtifacts: [],
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/labs/${lab.id}/review`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
      expect(body?.data?.verdict).toBe("FAIL");
      expect(
        body?.data?.body?.issues.some((i) => i.includes("expectedArtifacts")),
      ).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 LAB_NOT_FOUND on cross-team probe",
    async () => {
      const teamBTopic = await createTopicFixture({
        suffix: "lab_b",
        teamId: TEAM_B_ID,
      });
      const teamBConcept = await createConceptFixture({
        suffix: "lab_b",
        topicId: teamBTopic.id,
        teamId: TEAM_B_ID,
      });
      const teamBLab = await createLabFixture({
        suffix: "b",
        conceptId: teamBConcept.id,
        teamId: TEAM_B_ID,
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/labs/${teamBLab.id}/review`,
        { token: adminAToken },
      );

      expect(status).toBe(404);
      expect(body?.error?.code).toBe("LAB_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// Review triggers (AI-backed, mocked)
// ============================================================================

describe("POST /curriculum/admin/topics/:id/review (AI-backed)", () => {
  it(
    "runs curriculum-review, writes ContentReviewLog, caches curriculumReview on Topic",
    async () => {
      const topic = await createTopicFixture({ suffix: "rev_topic" });
      await createConceptFixture({
        suffix: "rev_topic_c1",
        topicId: topic.id,
      });

      // Stub aiComplete with a full curriculum-review payload. The Zod
      // schema is `.strict()` so every required field must be present.
      // Rule 22-curriculum requires ≥4 outcomes for a WORTH_LEARNING
      // verdict; Rule 18 requires the finalRecommendation to cite (via
      // 40-char keyword substring) at least one outcome.
      const outcome1 =
        "Understand core mental model of the topic in depth";
      const stubbedAiComplete = vi.fn().mockResolvedValue(
        JSON.stringify({
          verdict: "WORTH_LEARNING",
          oneLineSummary: "Solid curriculum for senior interview prep.",
          outcomes: [
            outcome1,
            "Apply key patterns to real production problems",
            "Debug failure modes with structured reasoning",
            "Communicate design tradeoffs clearly to peers",
          ],
          wontTeach: [],
          roi: {
            time: "20-25 hours",
            interviewValue: "High signal at senior loops",
            jobValue: "Direct transfer to design reviews",
            depthVsBreadth: "Balanced with depth on cores",
            verdict: "HIGH",
          },
          retention: {
            signalsFor: ["Concrete drills"],
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
          strong: ["Fundamentals coverage"],
          // Rule 18 — must include ≥40-char prefix of some outcome verbatim.
          finalRecommendation: `Ship it: learners will ${outcome1.toLowerCase()} and be ready for senior interviews.`,
        }),
      );
      overrideValidator("CURRICULUM_REVIEW", { aiComplete: stubbedAiComplete });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${topic.id}/review`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
      expect(body?.data?.verdict).toBe("WORTH_LEARNING");
      expect(body?.data?.logId).toBeTruthy();
      expect(body?.data?.usedFallback).toBe(false);
      expect(stubbedAiComplete).toHaveBeenCalled();

      // Log row exists.
      const log = await prisma.contentReviewLog.findUnique({
        where: { id: body.data.logId },
      });
      expect(log?.targetType).toBe("TOPIC");
      expect(log?.targetId).toBe(topic.id);
      expect(log?.verdict).toBe("WORTH_LEARNING");

      // Topic.lastReviewedAt + curriculumReview populated.
      const refreshed = await prisma.topic.findUnique({
        where: { id: topic.id },
      });
      expect(refreshed.lastReviewedAt).toBeInstanceOf(Date);
      expect(refreshed.curriculumReview).toMatchObject({
        verdict: "WORTH_LEARNING",
      });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 TOPIC_NOT_FOUND on cross-team review attempt",
    async () => {
      const teamBTopic = await createTopicFixture({
        suffix: "rev_topic_b",
        teamId: TEAM_B_ID,
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/topics/${teamBTopic.id}/review`,
        { token: adminAToken },
      );

      expect(status).toBe(404);
      expect(body?.error?.code).toBe("TOPIC_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/admin/concepts/:id/review (AI-backed)", () => {
  it(
    "runs lesson-review and writes ContentReviewLog with CONCEPT target",
    async () => {
      const topic = await createTopicFixture({ suffix: "rev_concept" });
      const concept = await createConceptFixture({
        suffix: "rev_concept",
        topicId: topic.id,
      });

      // Stub aiComplete for LESSON_REVIEW. Build a payload that satisfies
      // Rule 19 (READY requires ≥6/8 seniorReadiness true). Use PARTIAL
      // so we don't have to precisely match the full seniorReadiness
      // schema — validator will treat it as non-READY without fabricating
      // more shape than needed.
      const stubbedAiComplete = vi.fn().mockResolvedValue(
        JSON.stringify({
          verdict: "PARTIAL",
          contentQuality: {
            primer: "MISSING",
            workedExample: "MISSING",
            expectedQuestions: "MISSING",
            canonicalSources: "MISSING",
            lab: "MISSING",
          },
          seniorReadiness: {
            establishesMentalModel: false,
            showsFailureModes: false,
            comparesAlternatives: false,
            probesEdgeCases: false,
            requiresJustification: false,
            teachesTradeoffs: false,
            citesAuthoritativeSources: false,
            enablesTeaching: false,
          },
          gaps: ["Needs worked example."],
          justifications: [],
        }),
      );
      overrideValidator("LESSON_REVIEW", { aiComplete: stubbedAiComplete });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${concept.id}/review`,
        { token: adminAToken },
      );

      expect(status).toBe(200);
      // Verdict may be normalized via fallback if validator rejects the
      // stubbed shape — but the log row + target linkage must be right
      // regardless.
      expect(body?.data?.logId).toBeTruthy();

      const log = await prisma.contentReviewLog.findUnique({
        where: { id: body.data.logId },
      });
      expect(log?.targetType).toBe("CONCEPT");
      expect(log?.targetId).toBe(concept.id);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 CONCEPT_NOT_FOUND on cross-team review attempt",
    async () => {
      const teamBTopic = await createTopicFixture({
        suffix: "rev_concept_b",
        teamId: TEAM_B_ID,
      });
      const teamBConcept = await createConceptFixture({
        suffix: "rev_concept_b",
        topicId: teamBTopic.id,
        teamId: TEAM_B_ID,
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/admin/concepts/${teamBConcept.id}/review`,
        { token: adminAToken },
      );

      expect(status).toBe(404);
      expect(body?.error?.code).toBe("CONCEPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

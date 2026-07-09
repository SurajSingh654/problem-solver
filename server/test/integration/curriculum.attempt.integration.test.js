// ============================================================================
// curriculum lab-attempt submit + polling — integration test (W4.T2)
// ============================================================================
//
// Exercises the full HTTP stack for the async 202 attempt pipeline:
//   authenticate → requireTeamContext → aiLimiter → aiTeamLimiter →
//   submitAttempt → real Prisma → mocked runValidator → PATCH LabAttempt.
//
// The AI is mocked via `_overrideValidatorSpec("CODE_REVIEW", { aiComplete })`
// — same pattern as curriculum.prompt-injection and curriculumAdmin.publish-gate
// tests. The 202 path returns immediately, so tests that verify async
// completion poll GET /attempts/:id until reviewStatus !== PENDING/REVIEWING.
//
// Fixtures (all prefixed with `test_w4t2_` for isolated cleanup):
//   - Team A + Learner A (MEMBER) + Learner B (MEMBER of a second team).
//   - PUBLISHED Topic → PUBLISHED Concept → PUBLISHED Lab (Team A).
//   - DRAFT Lab under a PUBLISHED Concept (should 404).
//   - Cross-team PUBLISHED Lab (Team B) — probe target for cross-team probe.
//
// Run: cd server && npx vitest run test/integration/curriculum.attempt.integration.test.js
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

const TEST_PREFIX = "test_w4t2_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const LEARNER_A_USER_ID = `${TEST_PREFIX}learner_a`;
const LEARNER_B_USER_ID = `${TEST_PREFIX}learner_b`;

const A_TOPIC_SLUG = `${TEST_PREFIX}a-topic`;
const A_CONCEPT_SLUG = `${TEST_PREFIX}a-concept`;
const A_CONCEPT_DRAFT_LAB_SLUG = `${TEST_PREFIX}a-concept-draft-lab`;
const B_TOPIC_SLUG = `${TEST_PREFIX}b-topic`;
const B_CONCEPT_SLUG = `${TEST_PREFIX}b-concept`;

const TEST_TIMEOUT_MS = 60000;

let server;
let baseUrl;
let learnerAToken;
let learnerBToken;

let aPublishedLabId;
let aDraftLabId;
let bPublishedLabId;

/**
 * Restore validator specs overridden mid-test. Tracks the ORIGINAL spec
 * (per-type) so nested overrides in the same test don't shadow it.
 */
const _originalSpecs = new Map();
function overrideValidator(type, patch) {
  const original = _overrideValidatorSpec(type, patch);
  if (!_originalSpecs.has(type)) {
    _originalSpecs.set(type, original);
  }
}

/**
 * A well-formed, Zod- + rule-passing CODE_REVIEW response body. Substitute
 * fields per test to exercise specific verdicts.
 */
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
    whatYouGotRight: [
      {
        item: "Clean iterator abstraction",
        lineRef: "line 3-7",
      },
    ],
    thingsToImprove: [],
    bugs: [],
    nextStep: "READY_FOR_REFERENCE",
    codeReviewVerdict: "STRONG",
  };
}

async function hardDeleteTestFixtures() {
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

  // ── Users ─────────────────────────────────────────────────────
  await prisma.user.createMany({
    data: [
      {
        id: LEARNER_A_USER_ID,
        email: `${TEST_PREFIX}learner_a@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Learner A",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: LEARNER_B_USER_ID,
        email: `${TEST_PREFIX}learner_b@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Learner B",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  // ── Teams ─────────────────────────────────────────────────────
  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "Attempt Team A",
      status: "ACTIVE",
      createdById: LEARNER_A_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "Attempt Team B",
      status: "ACTIVE",
      createdById: LEARNER_B_USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  // ── Memberships ───────────────────────────────────────────────
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

  // ── Team A: PUBLISHED Topic + PUBLISHED Concept + PUBLISHED Lab ──
  const aTopic = await prisma.topic.create({
    data: {
      slug: A_TOPIC_SLUG,
      name: "A Topic",
      description: "Attempt-target.",
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
          {
            slug: A_CONCEPT_DRAFT_LAB_SLUG,
            name: "A Concept (draft lab)",
            order: 2,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# other",
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
                referenceSolution: "",
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
  aDraftLabId = aTopic.concepts.find(
    (c) => c.slug === A_CONCEPT_DRAFT_LAB_SLUG,
  ).lab.id;

  // ── Team B: PUBLISHED Topic + Concept + Lab (cross-team probe target) ─
  const bTopic = await prisma.topic.create({
    data: {
      slug: B_TOPIC_SLUG,
      name: "B Topic",
      description: "Cross-team.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_B_ID,
      concepts: {
        create: [
          {
            slug: B_CONCEPT_SLUG,
            name: "B Concept",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# b",
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
                referenceSolution: "",
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
  learnerBToken = generateToken({
    id: LEARNER_B_USER_ID,
    globalRole: "USER",
    currentTeamId: TEAM_B_ID,
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
async function pollUntilResolved(
  labId,
  attemptId,
  token,
  timeoutMs = 10000,
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

// ─────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────

describe("POST /curriculum/labs/:id/attempts — auth + shape gates", () => {
  it(
    "returns 401 without a token",
    async () => {
      const { status } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { body: { code: "// hi" } },
      );
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 for a DRAFT lab (not learner-visible)",
    async () => {
      // Mock so if the check somehow lets through, we still don't hit real OpenAI.
      overrideValidator("CODE_REVIEW", {
        aiComplete: vi.fn().mockResolvedValue(JSON.stringify(buildStrongReview())),
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aDraftLabId}/attempts`,
        { token: learnerAToken, body: { code: "// hi" } },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("LAB_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 for another team's lab",
    async () => {
      overrideValidator("CODE_REVIEW", {
        aiComplete: vi.fn().mockResolvedValue(JSON.stringify(buildStrongReview())),
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${bPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "// hi" } },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("LAB_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 400 for missing code / empty code / oversized code",
    async () => {
      overrideValidator("CODE_REVIEW", {
        aiComplete: vi.fn().mockResolvedValue(JSON.stringify(buildStrongReview())),
      });

      // Missing code
      const missing = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: {} },
      );
      expect(missing.status).toBe(400);
      expect(missing.body?.error?.code).toBe("INVALID_BODY");

      // Empty string
      const empty = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "" } },
      );
      expect(empty.status).toBe(400);
      expect(empty.body?.error?.code).toBe("INVALID_BODY");

      // Oversized (>100 KB)
      const huge = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "x".repeat(100_001) } },
      );
      expect(huge.status).toBe(400);
      expect(huge.body?.error?.code).toBe("INVALID_BODY");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("POST /curriculum/labs/:id/attempts — happy path (202)", () => {
  it(
    "returns 202 with attemptId + reviewStatus=PENDING + attemptNumber=1 on first submit",
    async () => {
      // Reset any residual attempts for this lab from earlier tests.
      await prisma.$executeRawUnsafe(
        `DELETE FROM "lab_attempts" WHERE "userId" = $1 AND "labId" = $2`,
        LEARNER_A_USER_ID,
        aPublishedLabId,
      );

      // Mock AI so the async .then() chain resolves cleanly (won't hit real
      // OpenAI). We don't assert on completion here — that's the next block.
      overrideValidator("CODE_REVIEW", {
        aiComplete: vi.fn().mockResolvedValue(JSON.stringify(buildStrongReview())),
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Foo {}" } },
      );
      expect(status).toBe(202);
      expect(body.data.attemptId).toBeTruthy();
      expect(body.data.reviewStatus).toBe("PENDING");
      expect(body.data.attemptNumber).toBe(1);

      // DB row exists.
      const row = await prisma.labAttempt.findUnique({
        where: { id: body.data.attemptId },
      });
      expect(row).toBeTruthy();
      expect(row.userId).toBe(LEARNER_A_USER_ID);
      expect(row.attemptNumber).toBe(1);

      // Wait for the fire-and-forget review to resolve so it doesn't leak
      // into the next test's mock.
      await pollUntilResolved(aPublishedLabId, body.data.attemptId, learnerAToken);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "increments attemptNumber on a second submit for the same (user, lab)",
    async () => {
      overrideValidator("CODE_REVIEW", {
        aiComplete: vi.fn().mockResolvedValue(JSON.stringify(buildStrongReview())),
      });

      const { status, body } = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Foo2 {}" } },
      );
      expect(status).toBe(202);
      // First test above created attemptNumber=1. This is the second.
      expect(body.data.attemptNumber).toBe(2);

      await pollUntilResolved(aPublishedLabId, body.data.attemptId, learnerAToken);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("GET /curriculum/labs/:id/attempts/:attemptId — polling + privacy", () => {
  it(
    "returns 401 without a token",
    async () => {
      const { status } = await req(
        "GET",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts/does-not-matter`,
      );
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns the attempt to its owner",
    async () => {
      // Seed a PENDING attempt directly (no AI wired needed for GET-only test).
      const seed = await prisma.labAttempt.create({
        data: {
          labId: aPublishedLabId,
          userId: LEARNER_A_USER_ID,
          attemptNumber: 999,
          code: "// seeded",
          reviewStatus: "PENDING",
        },
      });

      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts/${seed.id}`,
        { token: learnerAToken },
      );
      expect(status).toBe(200);
      expect(body.data.attempt.id).toBe(seed.id);
      expect(body.data.attempt.attemptNumber).toBe(999);
      expect(body.data.attempt.reviewStatus).toBe("PENDING");
      expect(body.data.attempt.code).toBe("// seeded");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 when another user probes someone else's attempt (privacy)",
    async () => {
      // Learner A owns one attempt; Learner B (in Team B) tries to GET it.
      // findFirst with userId: req.user.id → null → 404.
      const seed = await prisma.labAttempt.create({
        data: {
          labId: aPublishedLabId,
          userId: LEARNER_A_USER_ID,
          attemptNumber: 1000,
          code: "// private",
          reviewStatus: "PENDING",
        },
      });

      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts/${seed.id}`,
        { token: learnerBToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("ATTEMPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 when the owner probes their own attempt from a foreign team context (tenancy)",
    async () => {
      // Defense-in-depth: even if the JWT's currentTeamId is misaligned
      // (e.g. a forged token or an in-flight team-switch race), the
      // `lab: { teamId: req.teamId }` filter must still 404 an attempt
      // on a lab in a different team. Same user, different req.teamId.
      const seed = await prisma.labAttempt.create({
        data: {
          labId: aPublishedLabId,
          userId: LEARNER_A_USER_ID,
          attemptNumber: 1001,
          code: "// mine but wrong team",
          reviewStatus: "PENDING",
        },
      });

      const forgedTeamBToken = generateToken({
        id: LEARNER_A_USER_ID,
        globalRole: "USER",
        currentTeamId: TEAM_B_ID,
        teamRole: "MEMBER",
      });

      const { status, body } = await req(
        "GET",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts/${seed.id}`,
        { token: forgedTeamBToken },
      );
      expect(status).toBe(404);
      expect(body?.error?.code).toBe("ATTEMPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("async completion — end-to-end", () => {
  it(
    "polls to COMPLETED with STRONG verdict when the AI returns a valid review",
    async () => {
      overrideValidator("CODE_REVIEW", {
        aiComplete: vi.fn().mockResolvedValue(JSON.stringify(buildStrongReview())),
      });

      const post = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Bar {}" } },
      );
      expect(post.status).toBe(202);
      const attemptId = post.body.data.attemptId;

      const resolved = await pollUntilResolved(
        aPublishedLabId,
        attemptId,
        learnerAToken,
      );

      expect(resolved.reviewStatus).toBe("COMPLETED");
      expect(resolved.codeReviewVerdict).toBe("STRONG");
      expect(resolved.reviewedAt).toBeTruthy();
      expect(resolved.codeReview).toBeTruthy();
      expect(resolved.codeReview.overall).toBe("Solid submission.");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "polls to ERROR when the AI throws",
    async () => {
      overrideValidator("CODE_REVIEW", {
        aiComplete: vi.fn().mockRejectedValue(new Error("boom")),
      });

      // The orchestrator will catch the AI throw and route through the
      // fallback path (returning WEAK verdict), NOT re-throw. To force the
      // .catch(onReviewFailed) branch we override the FULL validator with a
      // buildPrompt that throws — that error escapes runValidator and lands
      // in .catch().
      overrideValidator("CODE_REVIEW", {
        buildPrompt: () => {
          throw new Error("buildPrompt boom");
        },
      });

      const post = await req(
        "POST",
        `/api/v1/curriculum/labs/${aPublishedLabId}/attempts`,
        { token: learnerAToken, body: { code: "class Baz {}" } },
      );
      expect(post.status).toBe(202);
      const attemptId = post.body.data.attemptId;

      const resolved = await pollUntilResolved(
        aPublishedLabId,
        attemptId,
        learnerAToken,
      );

      expect(resolved.reviewStatus).toBe("ERROR");
      expect(resolved.reviewedAt).toBeTruthy();
      expect(resolved.codeReviewVerdict).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});

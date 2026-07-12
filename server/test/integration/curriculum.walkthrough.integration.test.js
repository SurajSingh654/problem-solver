// ============================================================================
// curriculum reveal walkthrough — integration test (Phase R.1 / R.3)
// ============================================================================
//
// Exercises the full HTTP stack for the CODE_WALKTHROUGH pipeline behind
// FEATURE_CURRICULUM_WALKTHROUGH=true:
//
//   POST /labs/:id/reveal-reference          → reveal + dispatch walkthrough
//   GET  /labs/:id/attempts/:id/walkthrough  → poll until COMPLETED / ERROR
//   POST /labs/:id/attempts/:id/walkthrough/retry → ERROR → PENDING
//
// The AI is mocked via `_overrideValidatorSpec("CODE_WALKTHROUGH", { aiComplete })`
// so tests can (a) return a well-formed walkthrough for the happy path,
// (b) return a Rule-23-b-violating walkthrough to force the fallback,
// (c) return contradicted content to prove the verdict-mirror guard.
//
// Fixtures (all prefixed with `test_wtR3_` for isolated cleanup):
//   - Team A + Learner A (MEMBER) + Learner B (MEMBER of a second team).
//   - PUBLISHED Topic → PUBLISHED Concept → PUBLISHED Lab (Team A).
//     Concept status is READY_FOR_REFERENCE so the reveal gate passes.
//   - Cross-team PUBLISHED Lab (Team B) — probe target for cross-team
//     tenancy tests.
//   - Pre-seeded COMPLETED LabAttempt for Learner A with codeReviewVerdict
//     = ADEQUATE and nextStep = READY_FOR_REFERENCE so the reveal endpoint
//     passes without going through the code-review pipeline.
//
// Run: cd server && npx vitest run test/integration/curriculum.walkthrough.integration.test.js
// ============================================================================

// Flip the walkthrough sub-flag BEFORE any module imports resolve. Reveal
// controller reads process.env at request time via isCurriculumWalkthroughEnabled(),
// so this env write is picked up on every fetch during the tests.
process.env.FEATURE_CURRICULUM_WALKTHROUGH = "true";

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import express from "express";
import { createServer } from "node:http";

import prisma from "../../src/lib/prisma.js";
import { generateToken } from "../../src/lib/jwt.js";
import curriculumRouter from "../../src/routes/curriculum.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";
import { _overrideValidatorSpec } from "../../src/services/curriculum/contentReview.service.js";
import { initCurriculumValidators } from "../../src/services/curriculum/registerValidators.js";
import { _resetForTest as resetSemaphore } from "../../src/services/curriculum/reviewSemaphore.js";

initCurriculumValidators();

const TEST_PREFIX = "test_wtR3_";
const TEAM_A_ID = `${TEST_PREFIX}team_a`;
const TEAM_B_ID = `${TEST_PREFIX}team_b`;
const LEARNER_A_ID = `${TEST_PREFIX}learner_a`;
const LEARNER_B_ID = `${TEST_PREFIX}learner_b`;

const A_TOPIC_SLUG = `${TEST_PREFIX}a-topic`;
const A_CONCEPT_SLUG = `${TEST_PREFIX}a-concept`;
const B_TOPIC_SLUG = `${TEST_PREFIX}b-topic`;
const B_CONCEPT_SLUG = `${TEST_PREFIX}b-concept`;

const TEST_TIMEOUT_MS = 60000;

let server;
let baseUrl;
let learnerAToken;
let learnerBToken;
let aLabId;
let bLabId;

const _originalSpecs = new Map();
function overrideValidator(type, patch) {
  const original = _overrideValidatorSpec(type, patch);
  if (!_originalSpecs.has(type)) _originalSpecs.set(type, original);
}

/**
 * A well-formed, Rule-23-a/c/d-passing walkthrough body. The `overall`
 * field is caller-provided so tests can pair it with priorVerdict OR
 * deliberately contradict it to force the Rule 23-b fallback.
 */
function buildWalkthroughBody({ overall = "ADEQUATE" } = {}) {
  return {
    overall,
    approachSummary:
      "You wrote a hashmap-first solution; the reference uses two pointers.",
    dimensions: [
      {
        dim: "correctness",
        yourApproach: "HashMap keyed by id lookup.",
        yourApproachLineRef: "lines 4-9",
        referenceApproach: "Two-pointer scan.",
        referenceApproachLineRef: "lines 6-14",
        tradeoff:
          "Both are typically O(n); one wins on memory, the other often wins on random-access lookups later.",
      },
      {
        dim: "designQuality",
        yourApproach: "Flat function.",
        yourApproachLineRef: "line 2",
        referenceApproach: "Two helper methods.",
        tradeoff:
          "Decomposition usually helps when the module grows; flat is often clearer for small helpers.",
      },
      {
        dim: "idiomaticStyle",
        yourApproach: "Explicit index counters.",
        yourApproachLineRef: "line 20",
        referenceApproach: "Enhanced-for.",
        tradeoff:
          "Enhanced-for often reads more fluently; explicit counters can be clearer if you need lock-step iteration.",
      },
    ],
    keyTakeaway: "Both approaches are valid — pick based on downstream access patterns.",
  };
}

async function hardDeleteTestFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_ID,
    LEARNER_B_ID,
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
    LEARNER_A_ID,
    LEARNER_B_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topic_enrollments" WHERE "userId" IN ($1, $2)`,
    LEARNER_A_ID,
    LEARNER_B_ID,
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
        id: LEARNER_A_ID,
        email: `${TEST_PREFIX}learner_a@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Learner A",
        globalRole: "USER",
        onboardingComplete: true,
      },
      {
        id: LEARNER_B_ID,
        email: `${TEST_PREFIX}learner_b@example.test`,
        password: "$2b$12$placeholderhashforintegrationtest",
        name: "Learner B",
        globalRole: "USER",
        onboardingComplete: true,
      },
    ],
  });

  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: "Walkthrough Team A",
      status: "ACTIVE",
      createdById: LEARNER_A_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: "Walkthrough Team B",
      status: "ACTIVE",
      createdById: LEARNER_B_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.createMany({
    data: [
      {
        userId: LEARNER_A_ID,
        teamId: TEAM_A_ID,
        role: "MEMBER",
        isActive: true,
      },
      {
        userId: LEARNER_B_ID,
        teamId: TEAM_B_ID,
        role: "MEMBER",
        isActive: true,
      },
    ],
  });

  const aTopic = await prisma.topic.create({
    data: {
      slug: A_TOPIC_SLUG,
      name: "A Topic",
      description: "Walkthrough target.",
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
            primerMarkdown: "# a concept\nPrimer body.",
            canonicalSources: [],
            expectedQuestions: [],
            assessmentCriteria: {},
            teamId: TEAM_A_ID,
            lab: {
              create: {
                title: "Iterator Lab",
                taskMarkdown: "Implement Iterator<T> over an array.",
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: "class ArrayIterator<T> { /* reference */ }",
                expectedArtifacts: ["Iterator impl"],
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
  aLabId = aTopic.concepts[0].lab.id;

  const bTopic = await prisma.topic.create({
    data: {
      slug: B_TOPIC_SLUG,
      name: "B Topic",
      description: "Cross-team probe target.",
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
                referenceSolution: "// b ref",
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
  bLabId = bTopic.concepts[0].lab.id;

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
    id: LEARNER_A_ID,
    globalRole: "USER",
    currentTeamId: TEAM_A_ID,
    teamRole: "MEMBER",
  });
  learnerBToken = generateToken({
    id: LEARNER_B_ID,
    globalRole: "USER",
    currentTeamId: TEAM_B_ID,
    teamRole: "MEMBER",
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
  await new Promise((resolve) => server.close(resolve));
  delete process.env.FEATURE_CURRICULUM_WALKTHROUGH;
}, TEST_TIMEOUT_MS);

afterEach(async () => {
  // Restore validator specs after each test so mocks don't leak.
  for (const [type, original] of _originalSpecs.entries()) {
    _overrideValidatorSpec(type, original);
  }
  _originalSpecs.clear();
  resetSemaphore();
  // Reset the attempt state so each test starts clean. Delete all attempts
  // for both learners on the lab.
  await prisma.labAttempt.deleteMany({
    where: { userId: { in: [LEARNER_A_ID, LEARNER_B_ID] } },
  });
});

// Pre-seed a COMPLETED lab attempt for Learner A that satisfies the reveal
// gate (STRONG/ADEQUATE verdict + nextStep=READY_FOR_REFERENCE). Returns
// the created attemptId.
async function seedRevealableAttempt({
  userId = LEARNER_A_ID,
  labId = aLabId,
  verdict = "ADEQUATE",
} = {}) {
  const attempt = await prisma.labAttempt.create({
    data: {
      labId,
      userId,
      attemptNumber: 1,
      code: "class MyIterator<T> { /* attempt */ }",
      submittedAt: new Date(),
      reviewedAt: new Date(),
      reviewStatus: "COMPLETED",
      codeReviewVerdict: verdict,
      codeReview: {
        overall: "Solid.",
        correctness: "STRONG",
        conceptApplication: "STRONG",
        designQuality: "ADEQUATE",
        idiomaticStyle: "STRONG",
        robustness: "ADEQUATE",
        testing: "MISSING",
        mentalModelSignal: "Grasps iterator abstraction.",
        whatYouGotRight: [{ item: "Clean interface", lineRef: "line 4" }],
        thingsToImprove: [],
        bugs: [],
        nextStep: "READY_FOR_REFERENCE",
        codeReviewVerdict: verdict,
      },
    },
  });
  return attempt.id;
}

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

async function pollWalkthroughUntilTerminal(
  labId,
  attemptId,
  token,
  timeoutMs = 8000,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await req(
      "GET",
      `/api/v1/curriculum/labs/${labId}/attempts/${attemptId}/walkthrough`,
      { token },
    );
    const status = res.body?.data?.status;
    if (status === "COMPLETED" || status === "ERROR") {
      return res.body.data;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `pollWalkthroughUntilTerminal timed out after ${timeoutMs}ms — last poll saw non-terminal state`,
  );
}

describe("Walkthrough — happy path (Rule 23 passing body)", () => {
  it(
    "reveal dispatches, walkthrough completes, GET returns body + stamps viewedAt",
    async () => {
      const attemptId = await seedRevealableAttempt();
      overrideValidator("CODE_WALKTHROUGH", {
        aiComplete: async () =>
          JSON.stringify(buildWalkthroughBody({ overall: "ADEQUATE" })),
      });

      const reveal = await req(
        "POST",
        `/api/v1/curriculum/labs/${aLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(reveal.status).toBe(200);
      expect(reveal.body.data.walkthroughEnabled).toBe(true);
      // walkthroughStatus should be at least PENDING immediately after reveal
      // (may already be COMPLETED if the semaphore ran the task synchronously
      // before the response serialized).
      expect(["PENDING", "COMPLETED"]).toContain(
        reveal.body.data.attempt.walkthroughStatus,
      );

      const walk = await pollWalkthroughUntilTerminal(
        aLabId,
        attemptId,
        learnerAToken,
      );
      expect(walk.status).toBe("COMPLETED");
      expect(walk.walkthrough.overall).toBe("ADEQUATE");
      expect(walk.walkthrough.dimensions.length).toBeGreaterThanOrEqual(3);
      expect(walk.usedFallback).toBe(false);

      // First hit stamps viewedAt. Fetch once more to verify persistence.
      const second = await req(
        "GET",
        `/api/v1/curriculum/labs/${aLabId}/attempts/${attemptId}/walkthrough`,
        { token: learnerAToken },
      );
      expect(second.body.data.viewedAt).toBeTruthy();

      // Row state: walkthroughAt stamped, walkthroughInputHash present.
      const row = await prisma.labAttempt.findUnique({
        where: { id: attemptId },
        select: {
          walkthroughStatus: true,
          walkthroughAt: true,
          walkthroughInputHash: true,
          walkthroughViewedAt: true,
        },
      });
      expect(row.walkthroughStatus).toBe("COMPLETED");
      expect(row.walkthroughAt).toBeInstanceOf(Date);
      expect(row.walkthroughInputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.walkthroughViewedAt).toBeInstanceOf(Date);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("Walkthrough — atomic dispatch guard (race)", () => {
  it(
    "two concurrent reveals produce exactly one PENDING flip → one dispatch",
    async () => {
      const attemptId = await seedRevealableAttempt();
      let dispatchCount = 0;
      overrideValidator("CODE_WALKTHROUGH", {
        aiComplete: async () => {
          dispatchCount += 1;
          return JSON.stringify(buildWalkthroughBody({ overall: "ADEQUATE" }));
        },
      });

      // Fire two reveals in parallel — the atomic updateMany({ where:
      // walkthroughStatus: "NOT_STARTED" }) guard MUST let exactly one
      // through. If both dispatch we double-charge the AI and race the
      // walkthrough write.
      const [r1, r2] = await Promise.all([
        req(
          "POST",
          `/api/v1/curriculum/labs/${aLabId}/reveal-reference`,
          { token: learnerAToken },
        ),
        req(
          "POST",
          `/api/v1/curriculum/labs/${aLabId}/reveal-reference`,
          { token: learnerAToken },
        ),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      await pollWalkthroughUntilTerminal(aLabId, attemptId, learnerAToken);
      expect(dispatchCount).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("Walkthrough — Rule 23-b enforcement (verdict mirror)", () => {
  it(
    "AI returns overall contradicting priorVerdict → fallback fires (usedFallback=true, overall mirrored)",
    async () => {
      // Seed attempt with priorVerdict = ADEQUATE. AI returns overall=STRONG
      // (a contradiction). Rule 23-b throws → orchestrator falls back →
      // fallback mirrors priorVerdict back to ADEQUATE.
      const attemptId = await seedRevealableAttempt({ verdict: "ADEQUATE" });
      overrideValidator("CODE_WALKTHROUGH", {
        aiComplete: async () =>
          JSON.stringify(buildWalkthroughBody({ overall: "STRONG" })),
      });

      const reveal = await req(
        "POST",
        `/api/v1/curriculum/labs/${aLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      expect(reveal.status).toBe(200);

      const walk = await pollWalkthroughUntilTerminal(
        aLabId,
        attemptId,
        learnerAToken,
      );
      expect(walk.status).toBe("COMPLETED");
      expect(walk.usedFallback).toBe(true);
      // Fallback's overall mirrors priorVerdict; the client will badge as
      // "walkthrough was a fallback" and offer retry.
      expect(walk.walkthrough.overall).toBe("ADEQUATE");
    },
    TEST_TIMEOUT_MS,
  );
});

describe("Walkthrough — tenancy (cross-team probe → 404)", () => {
  it(
    "Learner B GET on Learner A's walkthrough returns 404 (not 403, not 200)",
    async () => {
      const attemptId = await seedRevealableAttempt();
      overrideValidator("CODE_WALKTHROUGH", {
        aiComplete: async () =>
          JSON.stringify(buildWalkthroughBody({ overall: "ADEQUATE" })),
      });
      await req(
        "POST",
        `/api/v1/curriculum/labs/${aLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      await pollWalkthroughUntilTerminal(aLabId, attemptId, learnerAToken);

      // Learner B (Team B) probes the URL with Learner A's attemptId. Both
      // the labId and attemptId belong to Team A. Must 404 — never 403 (no
      // information leak about existence), never 200 (no data leak).
      const probe = await req(
        "GET",
        `/api/v1/curriculum/labs/${aLabId}/attempts/${attemptId}/walkthrough`,
        { token: learnerBToken },
      );
      expect(probe.status).toBe(404);
      expect(probe.body?.error?.code).toBe("ATTEMPT_NOT_FOUND");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "Learner A GET on Team-B labId returns 404 (labId tenancy join)",
    async () => {
      const attemptId = await seedRevealableAttempt();
      // Path uses Team B's lab id but Learner A's attempt id — the
      // `where: { lab: { teamId: req.teamId } }` join must reject.
      const probe = await req(
        "GET",
        `/api/v1/curriculum/labs/${bLabId}/attempts/${attemptId}/walkthrough`,
        { token: learnerAToken },
      );
      expect(probe.status).toBe(404);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("Walkthrough — retry endpoint gating", () => {
  it(
    "retry on NOT_STARTED state → 409 WALKTHROUGH_RETRY_NO_REVEAL",
    async () => {
      const attemptId = await seedRevealableAttempt();
      // No reveal fired — revealedReferenceAt is null. Retry must refuse.
      const retry = await req(
        "POST",
        `/api/v1/curriculum/labs/${aLabId}/attempts/${attemptId}/walkthrough/retry`,
        { token: learnerAToken },
      );
      expect(retry.status).toBe(409);
      expect(retry.body?.error?.code).toBe("WALKTHROUGH_RETRY_NO_REVEAL");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "retry on COMPLETED state → 409 WALKTHROUGH_RETRY_BAD_STATE",
    async () => {
      const attemptId = await seedRevealableAttempt();
      overrideValidator("CODE_WALKTHROUGH", {
        aiComplete: async () =>
          JSON.stringify(buildWalkthroughBody({ overall: "ADEQUATE" })),
      });
      await req(
        "POST",
        `/api/v1/curriculum/labs/${aLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      await pollWalkthroughUntilTerminal(aLabId, attemptId, learnerAToken);

      const retry = await req(
        "POST",
        `/api/v1/curriculum/labs/${aLabId}/attempts/${attemptId}/walkthrough/retry`,
        { token: learnerAToken },
      );
      expect(retry.status).toBe(409);
      expect(retry.body?.error?.code).toBe("WALKTHROUGH_RETRY_BAD_STATE");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "retry on ERROR state → 200 PENDING → walkthrough regenerates",
    async () => {
      const attemptId = await seedRevealableAttempt();
      // Force ERROR: first reveal's AI mock throws. Then retry with a
      // valid mock — walkthrough should complete on the second pass.
      overrideValidator("CODE_WALKTHROUGH", {
        aiComplete: async () => {
          throw new Error("simulated AI outage");
        },
      });
      await req(
        "POST",
        `/api/v1/curriculum/labs/${aLabId}/reveal-reference`,
        { token: learnerAToken },
      );
      // Wait for ERROR state (either walkthrough validator threw or its
      // fallback fell through — either way the terminal state is written).
      const errorState = await pollWalkthroughUntilTerminal(
        aLabId,
        attemptId,
        learnerAToken,
      );
      // The `runValidator` orchestrator catches validator throws and falls
      // back to the fallback body (COMPLETED, usedFallback=true). A truly
      // catastrophic path — e.g. semaphore rejects — would land us in
      // ERROR. Either terminal state is acceptable for the pre-retry
      // condition; we just need to be OUT of PENDING.
      expect(["COMPLETED", "ERROR"]).toContain(errorState.status);

      // Force the row to ERROR so the retry gate matches. (In production
      // this happens naturally on true task failure; the orchestrator's
      // fallback path — which triggered above — writes COMPLETED with
      // usedFallback=true. Real ERROR states come from semaphore-reject
      // or the outer catch in dispatchWalkthroughTask.)
      await prisma.labAttempt.update({
        where: { id: attemptId },
        data: { walkthroughStatus: "ERROR" },
      });

      // Swap in a valid mock for the retry.
      overrideValidator("CODE_WALKTHROUGH", {
        aiComplete: async () =>
          JSON.stringify(buildWalkthroughBody({ overall: "ADEQUATE" })),
      });

      const retry = await req(
        "POST",
        `/api/v1/curriculum/labs/${aLabId}/attempts/${attemptId}/walkthrough/retry`,
        { token: learnerAToken },
      );
      expect(retry.status).toBe(200);
      expect(retry.body?.data?.status).toBe("PENDING");

      const final = await pollWalkthroughUntilTerminal(
        aLabId,
        attemptId,
        learnerAToken,
      );
      expect(final.status).toBe("COMPLETED");
      expect(final.usedFallback).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("Walkthrough — feature-flag OFF path", () => {
  it("GET returns 404 WALKTHROUGH_DISABLED when flag is off", async () => {
    const attemptId = await seedRevealableAttempt();
    // Flip flag off for this test only. isCurriculumWalkthroughEnabled()
    // reads process.env at call time so this takes effect immediately.
    const prev = process.env.FEATURE_CURRICULUM_WALKTHROUGH;
    process.env.FEATURE_CURRICULUM_WALKTHROUGH = "false";
    try {
      const res = await req(
        "GET",
        `/api/v1/curriculum/labs/${aLabId}/attempts/${attemptId}/walkthrough`,
        { token: learnerAToken },
      );
      expect(res.status).toBe(404);
      expect(res.body?.error?.code).toBe("WALKTHROUGH_DISABLED");
    } finally {
      process.env.FEATURE_CURRICULUM_WALKTHROUGH = prev;
    }
  });
});

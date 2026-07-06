// ============================================================================
// conceptMastery.service — teachingReady truth-table auto-flip (W5.T5)
// ============================================================================
//
// Verifies the server-side monotonic auto-flip of `ConceptMastery.teachingReady`
// keyed off the truth table:
//
//   primer_read AND ≥1 STRONG/ADEQUATE lab (this team) AND latest PASS check-in
//
// The writer surface under test:
//   - recordPrimerReadSignal({ userId, conceptId, teamId })
//   - recordLabSignal({ userId, conceptId, teamId, codeReviewVerdict, attemptId })
//   - recordCheckInSignal({ userId, conceptId, teamId, aiVerdict, ... })
//   - setTeachingReady({ userId, conceptId }) — idempotent + audit-entry once
//
// Real Prisma against Postgres (no mocks). All fixtures prefixed with
// `test_w5t5_` for isolated cleanup via $executeRawUnsafe (soft-delete
// middleware bypass).
//
// The cross-team isolation case is the Security requirement: user is in two
// teams, records signals under Team B, but has a STRONG lab attempt on Team
// A's Lab — teachingReady must stay FALSE (Team A's evidence must NOT count
// toward Team B's truth table).
//
// Run: cd server && npx vitest run test/services/conceptMastery.teachingReady-truthtable.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../src/lib/prisma.js";
import {
  recordLabSignal,
  recordCheckInSignal,
  recordPrimerReadSignal,
  setTeachingReady,
} from "../../src/services/curriculum/conceptMastery.service.js";

const TEST_PREFIX = "test_w5t5_";
const TEAM_ID = `${TEST_PREFIX}team_a`;
const OTHER_TEAM_ID = `${TEST_PREFIX}team_b`;
const USER_ID = `${TEST_PREFIX}user_1`;
const USER_EMAIL = `${TEST_PREFIX}user@example.test`;
const TOPIC_ID = `${TEST_PREFIX}topic_1`;
const OTHER_TOPIC_ID = `${TEST_PREFIX}topic_2`;
const CONCEPT_ID = `${TEST_PREFIX}concept_1`;
const OTHER_CONCEPT_ID = `${TEST_PREFIX}concept_2`;
const LAB_ID = `${TEST_PREFIX}lab_1`;
const OTHER_LAB_ID = `${TEST_PREFIX}lab_2`;

const TEST_TIMEOUT_MS = 30000;

async function hardDeleteTestFixtures() {
  // Child rows first — FK constraints block parent DELETE otherwise, and
  // raw SQL bypasses Prisma's soft-delete middleware (Team.deletedAt).
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "labs" WHERE "teamId" IN ($1, $2)`,
    TEAM_ID,
    OTHER_TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concepts" WHERE "teamId" IN ($1, $2)`,
    TEAM_ID,
    OTHER_TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "topics" WHERE "teamId" IN ($1, $2)`,
    TEAM_ID,
    OTHER_TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "team_memberships" WHERE "teamId" IN ($1, $2)`,
    TEAM_ID,
    OTHER_TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "teams" WHERE "id" IN ($1, $2)`,
    TEAM_ID,
    OTHER_TEAM_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "users" WHERE "id" = $1 OR "email" LIKE $2`,
    USER_ID,
    `${TEST_PREFIX}%`,
  );
}

beforeAll(async () => {
  await hardDeleteTestFixtures();

  await prisma.user.create({
    data: {
      id: USER_ID,
      email: USER_EMAIL,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "W5T5 Test User",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_ID,
      name: "W5T5 Team A",
      status: "ACTIVE",
      createdById: USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: OTHER_TEAM_ID,
      name: "W5T5 Team B",
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
      role: "MEMBER",
      isActive: true,
    },
  });
  await prisma.teamMembership.create({
    data: {
      userId: USER_ID,
      teamId: OTHER_TEAM_ID,
      role: "MEMBER",
      isActive: true,
    },
  });

  // Team A: PUBLISHED Topic → PUBLISHED Concept → PUBLISHED Lab.
  await prisma.topic.create({
    data: {
      id: TOPIC_ID,
      slug: `${TEST_PREFIX}topic-a`,
      name: "W5T5 Topic A",
      description: "TT fixture.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_ID,
      concepts: {
        create: [
          {
            id: CONCEPT_ID,
            slug: `${TEST_PREFIX}concept-a`,
            name: "W5T5 Concept A",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# Primer\nBody.",
            canonicalSources: [],
            expectedQuestions: ["Q1", "Q2", "Q3"],
            assessmentCriteria: {},
            teamId: TEAM_ID,
            lab: {
              create: {
                id: LAB_ID,
                title: "W5T5 Lab A",
                taskMarkdown: "Do it.",
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: "// ref",
                expectedArtifacts: ["Solution"],
                status: "PUBLISHED",
                teamId: TEAM_ID,
              },
            },
          },
        ],
      },
    },
  });

  // Team B: separate PUBLISHED Topic → Concept → Lab so the cross-team
  // isolation test can call the writers on a concept that has NO STRONG
  // lab attempt of its own but shares the user.
  await prisma.topic.create({
    data: {
      id: OTHER_TOPIC_ID,
      slug: `${TEST_PREFIX}topic-b`,
      name: "W5T5 Topic B",
      description: "TT fixture cross-team.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: OTHER_TEAM_ID,
      concepts: {
        create: [
          {
            id: OTHER_CONCEPT_ID,
            slug: `${TEST_PREFIX}concept-b`,
            name: "W5T5 Concept B",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# Primer B\nBody.",
            canonicalSources: [],
            expectedQuestions: ["Q1", "Q2", "Q3"],
            assessmentCriteria: {},
            teamId: OTHER_TEAM_ID,
            lab: {
              create: {
                id: OTHER_LAB_ID,
                title: "W5T5 Lab B",
                taskMarkdown: "Do it too.",
                language: "JAVA",
                starterCode: "// starter",
                referenceSolution: "// ref",
                expectedArtifacts: ["Solution"],
                status: "PUBLISHED",
                teamId: OTHER_TEAM_ID,
              },
            },
          },
        ],
      },
    },
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
}, TEST_TIMEOUT_MS);

beforeEach(async () => {
  // Clear per-user state between tests so each starts from a known slate.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_check_ins" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1`,
    USER_ID,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1`,
    USER_ID,
  );
}, TEST_TIMEOUT_MS);

async function loadMastery(conceptId = CONCEPT_ID) {
  return prisma.conceptMastery.findUnique({
    where: { userId_conceptId: { userId: USER_ID, conceptId } },
  });
}

/**
 * Seed a COMPLETED LabAttempt directly (bypasses the async validator so the
 * unit test isn't coupled to the CODE_REVIEW pipeline).
 */
async function seedLabAttempt({ verdict, labId = LAB_ID, attemptNumber = 1 }) {
  return prisma.labAttempt.create({
    data: {
      labId,
      userId: USER_ID,
      attemptNumber,
      code: `// attempt ${attemptNumber}`,
      reviewStatus: "COMPLETED",
      reviewedAt: new Date(),
      codeReviewVerdict: verdict,
      codeReview: { nextStep: "READY_FOR_REFERENCE" },
    },
  });
}

/**
 * Seed a ConceptCheckIn row directly. `aiVerdict` is the truth-table input.
 */
async function seedCheckIn({
  verdict,
  conceptId = CONCEPT_ID,
  attemptNumber = 1,
}) {
  return prisma.conceptCheckIn.create({
    data: {
      conceptId,
      userId: USER_ID,
      attemptNumber,
      recallAnswer: "r",
      applyAnswer: "a",
      buildAnswer: "b",
      preConfidence: 4,
      aiVerdict: verdict,
      aiFeedback: {},
      calibrationDelta: 0.1,
    },
  });
}

describe("conceptMastery.setTeachingReady — direct writer", () => {
  it(
    "flips teachingReady from false → true and appends ONE audit signal",
    async () => {
      await setTeachingReady({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        reason: "manual",
      });
      const mastery = await loadMastery();
      expect(mastery).toBeTruthy();
      expect(mastery.teachingReady).toBe(true);
      const audit = (mastery.signals ?? []).filter(
        (s) => s.source === "teachingReady",
      );
      expect(audit).toHaveLength(1);
      expect(audit[0].value).toBe(1);
      expect(audit[0].evidence?.reason).toBe("manual");
      expect(typeof audit[0].at).toBe("string");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "is idempotent — calling twice does NOT append a duplicate audit entry",
    async () => {
      await setTeachingReady({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        reason: "truthTable",
      });
      await setTeachingReady({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        reason: "truthTable",
      });
      const mastery = await loadMastery();
      expect(mastery.teachingReady).toBe(true);
      const audit = (mastery.signals ?? []).filter(
        (s) => s.source === "teachingReady",
      );
      expect(audit).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("conceptMastery — auto-flip truth table", () => {
  it(
    "stays false when only primer_read exists",
    async () => {
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
      });
      const mastery = await loadMastery();
      expect(mastery.teachingReady).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "stays false when primer + STRONG lab arrive but NO PASS check-in exists",
    async () => {
      await seedLabAttempt({ verdict: "STRONG" });
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
      });
      await recordLabSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        codeReviewVerdict: "STRONG",
        attemptId: "seeded-1",
      });
      const mastery = await loadMastery();
      expect(mastery.teachingReady).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "stays false when primer + PASS check-in arrive but NO STRONG/ADEQUATE lab exists",
    async () => {
      await seedCheckIn({ verdict: "PASS" });
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
      });
      await recordCheckInSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        aiVerdict: "PASS",
        calibrationDelta: 0.1,
        checkInId: "seeded-1",
      });
      const mastery = await loadMastery();
      expect(mastery.teachingReady).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "flips to true when primer + STRONG lab + PASS check-in are all present (in that order)",
    async () => {
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
      });

      await seedLabAttempt({ verdict: "STRONG" });
      await recordLabSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        codeReviewVerdict: "STRONG",
        attemptId: "seeded-1",
      });

      await seedCheckIn({ verdict: "PASS" });
      await recordCheckInSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        aiVerdict: "PASS",
        calibrationDelta: 0.1,
        checkInId: "seeded-1",
      });

      const mastery = await loadMastery();
      expect(mastery.teachingReady).toBe(true);
      const audit = (mastery.signals ?? []).filter(
        (s) => s.source === "teachingReady",
      );
      expect(audit).toHaveLength(1);
      expect(audit[0].evidence?.reason).toBe("truthTable");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "flips regardless of signal-arrival order (check-in first, then lab)",
    async () => {
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
      });

      // Check-in arrives before the lab in this scenario.
      await seedCheckIn({ verdict: "PASS" });
      await recordCheckInSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        aiVerdict: "PASS",
        calibrationDelta: 0.1,
        checkInId: "seeded-1",
      });

      await seedLabAttempt({ verdict: "STRONG" });
      await recordLabSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        codeReviewVerdict: "STRONG",
        attemptId: "seeded-1",
      });

      const mastery = await loadMastery();
      expect(mastery.teachingReady).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "ADEQUATE lab also satisfies the truth table (same behavior as STRONG)",
    async () => {
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
      });

      await seedLabAttempt({ verdict: "ADEQUATE" });
      await recordLabSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        codeReviewVerdict: "ADEQUATE",
        attemptId: "seeded-1",
      });

      await seedCheckIn({ verdict: "PASS" });
      await recordCheckInSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        aiVerdict: "PASS",
        calibrationDelta: 0.1,
        checkInId: "seeded-1",
      });

      const mastery = await loadMastery();
      expect(mastery.teachingReady).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "does NOT un-flip when a later WEAK attempt arrives (monotonic)",
    async () => {
      // First reach teaching-ready.
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
      });
      await seedLabAttempt({ verdict: "STRONG", attemptNumber: 1 });
      await recordLabSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        codeReviewVerdict: "STRONG",
        attemptId: "seeded-1",
      });
      await seedCheckIn({ verdict: "PASS" });
      await recordCheckInSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        aiVerdict: "PASS",
        calibrationDelta: 0.1,
        checkInId: "seeded-1",
      });

      const beforeMastery = await loadMastery();
      expect(beforeMastery.teachingReady).toBe(true);

      // Now a WEAK follow-up. teachingReady MUST remain true.
      await seedLabAttempt({ verdict: "WEAK", attemptNumber: 2 });
      await recordLabSignal({
        userId: USER_ID,
        conceptId: CONCEPT_ID,
        teamId: TEAM_ID,
        codeReviewVerdict: "WEAK",
        attemptId: "seeded-2",
      });

      const afterMastery = await loadMastery();
      expect(afterMastery.teachingReady).toBe(true);
      const audit = (afterMastery.signals ?? []).filter(
        (s) => s.source === "teachingReady",
      );
      // Still exactly ONE audit entry — no re-flip attempted.
      expect(audit).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "cross-team isolation: Team A's STRONG lab does NOT count toward Team B's truth table",
    async () => {
      // User has a STRONG attempt on Team A's Lab (LAB_ID → CONCEPT_ID → TEAM_ID).
      await seedLabAttempt({ verdict: "STRONG", labId: LAB_ID });

      // But all signal writes for THIS test are keyed to Team B's context.
      // Route them to Team B's concept so the truth-table lookup filters
      // on { concept: { teamId: OTHER_TEAM_ID } } — Team A's lab attempt
      // must NOT count.
      await recordPrimerReadSignal({
        userId: USER_ID,
        conceptId: OTHER_CONCEPT_ID,
        teamId: OTHER_TEAM_ID,
      });
      await recordLabSignal({
        userId: USER_ID,
        conceptId: OTHER_CONCEPT_ID,
        teamId: OTHER_TEAM_ID,
        codeReviewVerdict: "STRONG",
        attemptId: "seeded-cross-team",
      });
      await seedCheckIn({
        verdict: "PASS",
        conceptId: OTHER_CONCEPT_ID,
      });
      await recordCheckInSignal({
        userId: USER_ID,
        conceptId: OTHER_CONCEPT_ID,
        teamId: OTHER_TEAM_ID,
        aiVerdict: "PASS",
        calibrationDelta: 0.1,
        checkInId: "seeded-cross-team",
      });

      // Team B's concept mastery MUST still be false — there is no
      // STRONG lab attempt on a Team B lab for this user.
      const masteryB = await loadMastery(OTHER_CONCEPT_ID);
      expect(masteryB.teachingReady).toBe(false);

      // And Team A's concept mastery (the one that owns the STRONG lab
      // attempt) also stays false — no primer_read/check-in was routed
      // to it, so its truth table is still incomplete.
      const masteryA = await loadMastery(CONCEPT_ID);
      // Depending on the writer flow the mastery row for concept A may not
      // exist yet at all. Either "no row" or "row with teachingReady=false"
      // is acceptable evidence that the flip did NOT fire.
      expect(masteryA?.teachingReady ?? false).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});

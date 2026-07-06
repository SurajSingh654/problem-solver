// ============================================================================
// designAptitude.curriculum — LabAttempt → DesignSession adapter (W5.T6)
// ============================================================================
//
// Verifies `mapLabAttemptsToDesignSessions` produces the exact shape that
// `computeDesignAptitudeStats` expects, and that tenancy + verdict + category
// filtering are correct.
//
// Real Prisma against Postgres (no mocks). All fixtures prefixed with
// `test_w5t6_`; cleanup via `$executeRawUnsafe` (bypasses soft-delete
// middleware). Delete order respects FK constraints.
//
// Run: cd server && npx vitest run test/utils/designAptitude.curriculum.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import prisma from "../../src/lib/prisma.js";
import { mapLabAttemptsToDesignSessions } from "../../src/utils/designAptitude.curriculum.js";

const TEST_PREFIX = "test_w5t6_";
const TEAM_ID = `${TEST_PREFIX}team_a`;
const OTHER_TEAM_ID = `${TEST_PREFIX}team_b`;
const USER_ID = `${TEST_PREFIX}user_1`;
const USER_EMAIL = `${TEST_PREFIX}user@example.test`;

// Team A LLD Topic → Concept → Lab
const LLD_TOPIC_ID = `${TEST_PREFIX}topic_lld`;
const LLD_CONCEPT_ID = `${TEST_PREFIX}concept_lld`;
const LLD_LAB_ID = `${TEST_PREFIX}lab_lld`;

// Team A SD Topic → Concept → Lab
const SD_TOPIC_ID = `${TEST_PREFIX}topic_sd`;
const SD_CONCEPT_ID = `${TEST_PREFIX}concept_sd`;
const SD_LAB_ID = `${TEST_PREFIX}lab_sd`;

// Team A DSA (non-design) Topic → Concept → Lab
const DSA_TOPIC_ID = `${TEST_PREFIX}topic_dsa`;
const DSA_CONCEPT_ID = `${TEST_PREFIX}concept_dsa`;
const DSA_LAB_ID = `${TEST_PREFIX}lab_dsa`;

const TEST_TIMEOUT_MS = 30000;

async function hardDeleteTestFixtures() {
  // Child rows first — FK constraints block parent DELETE otherwise.
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
      name: "W5T6 Test User",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_ID,
      name: "W5T6 Team A",
      status: "ACTIVE",
      createdById: USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });
  await prisma.team.create({
    data: {
      id: OTHER_TEAM_ID,
      name: "W5T6 Team B",
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

  // Team A: LOW_LEVEL_DESIGN Topic → Concept → Lab.
  await prisma.topic.create({
    data: {
      id: LLD_TOPIC_ID,
      slug: `${TEST_PREFIX}topic-lld`,
      name: "W5T6 LLD Topic",
      description: "LLD fixture.",
      category: "LOW_LEVEL_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_ID,
      concepts: {
        create: [
          {
            id: LLD_CONCEPT_ID,
            slug: `${TEST_PREFIX}concept-lld`,
            name: "W5T6 LLD Concept",
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
                id: LLD_LAB_ID,
                title: "W5T6 LLD Lab",
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

  // Team A: SYSTEM_DESIGN Topic → Concept → Lab.
  await prisma.topic.create({
    data: {
      id: SD_TOPIC_ID,
      slug: `${TEST_PREFIX}topic-sd`,
      name: "W5T6 SD Topic",
      description: "SD fixture.",
      category: "SYSTEM_DESIGN",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_ID,
      concepts: {
        create: [
          {
            id: SD_CONCEPT_ID,
            slug: `${TEST_PREFIX}concept-sd`,
            name: "W5T6 SD Concept",
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
                id: SD_LAB_ID,
                title: "W5T6 SD Lab",
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

  // Team A: DSA (non-design) Topic → Concept → Lab. Attempts on this lab
  // must NOT be included in the adapter output.
  await prisma.topic.create({
    data: {
      id: DSA_TOPIC_ID,
      slug: `${TEST_PREFIX}topic-dsa`,
      name: "W5T6 DSA Topic",
      description: "DSA fixture (non-design).",
      category: "DSA",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_ID,
      concepts: {
        create: [
          {
            id: DSA_CONCEPT_ID,
            slug: `${TEST_PREFIX}concept-dsa`,
            name: "W5T6 DSA Concept",
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
                id: DSA_LAB_ID,
                title: "W5T6 DSA Lab",
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
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
}, TEST_TIMEOUT_MS);

beforeEach(async () => {
  // Clear per-user LabAttempts between tests so each starts clean.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "lab_attempts" WHERE "userId" = $1`,
    USER_ID,
  );
}, TEST_TIMEOUT_MS);

/**
 * Seed a COMPLETED LabAttempt directly. Bypasses the async CODE_REVIEW
 * pipeline — the adapter only reads the columns, not the validator.
 */
async function seedLabAttempt({
  labId,
  verdict,
  reviewStatus = "COMPLETED",
  attemptNumber = 1,
}) {
  return prisma.labAttempt.create({
    data: {
      labId,
      userId: USER_ID,
      attemptNumber,
      code: `// attempt ${attemptNumber}`,
      reviewStatus,
      reviewedAt: new Date(),
      codeReviewVerdict: verdict,
      codeReview: { nextStep: "READY_FOR_REFERENCE" },
    },
  });
}

describe("mapLabAttemptsToDesignSessions — W5.T6 adapter", () => {
  it(
    "returns [] when the user has no lab attempts",
    async () => {
      const sessions = await mapLabAttemptsToDesignSessions({
        userId: USER_ID,
        teamId: TEAM_ID,
      });
      expect(sessions).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "maps a STRONG attempt on an LLD concept → curriculum_lab shape with designType=LOW_LEVEL_DESIGN and overallScore=10",
    async () => {
      await seedLabAttempt({ labId: LLD_LAB_ID, verdict: "STRONG" });
      const sessions = await mapLabAttemptsToDesignSessions({
        userId: USER_ID,
        teamId: TEAM_ID,
      });
      expect(sessions).toHaveLength(1);
      const s = sessions[0];
      expect(s.userId).toBe(USER_ID);
      expect(s.conceptId).toBe(LLD_CONCEPT_ID);
      expect(s.source).toBe("curriculum_lab");
      expect(s.verdict).toBe("STRONG");
      expect(s.designType).toBe("LOW_LEVEL_DESIGN");
      expect(s.evaluation.overallScore).toBe(10);
      // Explicit-null contract for downstream null-guards.
      expect(s.phases).toBeNull();
      expect(s.scenarios).toBeNull();
      expect(s.interviewSessions).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "does NOT map WEAK attempts",
    async () => {
      await seedLabAttempt({ labId: LLD_LAB_ID, verdict: "WEAK" });
      const sessions = await mapLabAttemptsToDesignSessions({
        userId: USER_ID,
        teamId: TEAM_ID,
      });
      expect(sessions).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "does NOT map attempts on non-design topics (e.g., DSA)",
    async () => {
      await seedLabAttempt({ labId: DSA_LAB_ID, verdict: "STRONG" });
      const sessions = await mapLabAttemptsToDesignSessions({
        userId: USER_ID,
        teamId: TEAM_ID,
      });
      expect(sessions).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "scopes strictly to the caller's team — passing a different teamId returns []",
    async () => {
      await seedLabAttempt({ labId: LLD_LAB_ID, verdict: "STRONG" });
      // The lab lives on TEAM_ID; querying under OTHER_TEAM_ID must find nothing.
      const sessions = await mapLabAttemptsToDesignSessions({
        userId: USER_ID,
        teamId: OTHER_TEAM_ID,
      });
      expect(sessions).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "maps a STRONG attempt on a SYSTEM_DESIGN topic → designType=SYSTEM_DESIGN and overallScore=10",
    async () => {
      await seedLabAttempt({ labId: SD_LAB_ID, verdict: "STRONG" });
      const sessions = await mapLabAttemptsToDesignSessions({
        userId: USER_ID,
        teamId: TEAM_ID,
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].designType).toBe("SYSTEM_DESIGN");
      expect(sessions[0].evaluation.overallScore).toBe(10);
      expect(sessions[0].conceptId).toBe(SD_CONCEPT_ID);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "maps an ADEQUATE attempt → overallScore=7",
    async () => {
      await seedLabAttempt({ labId: LLD_LAB_ID, verdict: "ADEQUATE" });
      const sessions = await mapLabAttemptsToDesignSessions({
        userId: USER_ID,
        teamId: TEAM_ID,
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].verdict).toBe("ADEQUATE");
      expect(sessions[0].evaluation.overallScore).toBe(7);
      expect(sessions[0].designType).toBe("LOW_LEVEL_DESIGN");
    },
    TEST_TIMEOUT_MS,
  );
});

// ============================================================================
// mentor.service.updateMastery — concurrent-writer race regression
// ============================================================================
//
// updateMastery does read → append-to-JSON-signals-array → write on ConceptMastery.
// At Postgres READ COMMITTED, two concurrent writers can both read the same
// `signals` array, both append, and the second write clobbers the first's
// append. Fix: `pg_advisory_xact_lock(hashtext("<userId>:<conceptId>"))` at
// the top of the transaction serializes writers on the same row without
// requiring SELECT ... FOR UPDATE (which can't lock a row that doesn't
// exist yet — a fresh ConceptMastery is created on first signal).
//
// This test fires N parallel updateMastery calls on the SAME (user, concept)
// pair. Without the lock, the final signals array has fewer than N entries.
// With the lock, all N land.
//
// Run: cd server && npx vitest run test/services/mentor.updateMastery.race.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "../../src/lib/prisma.js";
import { updateMastery } from "../../src/services/mentor.service.js";

const TEST_PREFIX = "test_updmr_";
const USER_ID = `${TEST_PREFIX}user_1`;
const USER_EMAIL = `${TEST_PREFIX}user@example.test`;
const TEAM_ID = `${TEST_PREFIX}team_1`;
const TOPIC_ID = `${TEST_PREFIX}topic_1`;
const CONCEPT_ID = `${TEST_PREFIX}concept_1`;

const TEST_TIMEOUT_MS = 30000;

async function hardDeleteTestFixtures() {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "concept_masteries" WHERE "userId" = $1`,
    USER_ID,
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
      name: "Race Test User",
      globalRole: "USER",
      onboardingComplete: true,
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_ID,
      name: "Race Test Team",
      status: "ACTIVE",
      createdById: USER_ID,
      maxMembers: 20,
      isPersonal: false,
    },
  });

  await prisma.teamMembership.create({
    data: { userId: USER_ID, teamId: TEAM_ID, role: "MEMBER", isActive: true },
  });

  await prisma.topic.create({
    data: {
      id: TOPIC_ID,
      slug: `${TEST_PREFIX}topic`,
      name: "Race Test Topic",
      description: "Fixture.",
      category: "DSA",
      status: "PUBLISHED",
      publishedAt: new Date(),
      teamId: TEAM_ID,
      concepts: {
        create: [
          {
            id: CONCEPT_ID,
            slug: `${TEST_PREFIX}concept`,
            name: "Race Test Concept",
            order: 1,
            status: "PUBLISHED",
            publishedAt: new Date(),
            primerMarkdown: "# Primer",
            canonicalSources: [],
            expectedQuestions: ["Q1", "Q2", "Q3"],
            assessmentCriteria: {},
            teamId: TEAM_ID,
          },
        ],
      },
    },
  });
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  await hardDeleteTestFixtures();
}, TEST_TIMEOUT_MS);

describe("updateMastery — concurrent-writer race", () => {
  it(
    "does not lose signal writes under parallel dispatch (advisory lock)",
    async () => {
      // Reset the row so this test is order-independent.
      await prisma.$executeRawUnsafe(
        `DELETE FROM "concept_masteries" WHERE "userId" = $1 AND "conceptId" = $2`,
        USER_ID,
        CONCEPT_ID,
      );

      const N = 8;
      const writes = Array.from({ length: N }, (_, i) =>
        updateMastery(USER_ID, CONCEPT_ID, {
          source: "practice",
          value: 60 + i, // distinct value per writer so lost updates are visible
          evidence: { i },
        }),
      );

      await Promise.all(writes);

      const row = await prisma.conceptMastery.findUnique({
        where: { userId_conceptId: { userId: USER_ID, conceptId: CONCEPT_ID } },
      });

      expect(row).toBeTruthy();
      const signals = Array.isArray(row.signals) ? row.signals : [];
      // All N writers appended their signal — none clobbered.
      expect(signals.length).toBe(N);

      // Every distinct value (60..60+N-1) is present.
      const values = new Set(signals.map((s) => s.value));
      for (let i = 0; i < N; i++) {
        expect(values.has(60 + i)).toBe(true);
      }
    },
    TEST_TIMEOUT_MS,
  );
});

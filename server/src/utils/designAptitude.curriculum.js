// ============================================================================
// D8 Design Aptitude — Curriculum Lab Adapter
// ============================================================================
//
// Bridges curriculum LabAttempts on LOW_LEVEL_DESIGN / SYSTEM_DESIGN concepts
// into the same shape that `computeDesignAptitudeStats` expects for
// DesignSession rows. This lets curriculum lab practice count toward the D8
// readiness axis alongside Design Studio interview sessions.
//
// Shape parity notes (see designAptitudeStats.js):
//   - `designType` drives the SD-vs-LLD session-count split (line ~220).
//     Missing this field → row lands in neither bucket, both counts stay 0.
//   - `evaluation.overallScore` (0-10 scale) drives the 50%-weight
//     avg-overall-score sub-component. STRONG → 10, ADEQUATE → 7.
//     Missing overallScore → 50% weight silently zeros out.
//   - `phases` and `scenarios` are explicit `null` (not undefined) so the
//     downstream null-guards handle them cleanly.
//
// Tenancy: adapter filters BOTH `lab.teamId` AND `lab.concept.teamId` by the
// caller's `teamId`. A lab in Team A must not leak into Team B's D8 axis even
// if the user is a member of both.
// ============================================================================

import prisma from "../lib/prisma.js";

// Design-relevant topic categories. Keep in sync with the `TopicCategory` enum
// in schema.prisma — new design-category members go here.
const DESIGN_CATEGORIES = ["LOW_LEVEL_DESIGN", "SYSTEM_DESIGN"];

// Only STRONG and ADEQUATE lab attempts contribute to D8. WEAK attempts are
// filtered out — a failing lab attempt is not evidence of design competency.
const PASSING_VERDICTS = ["STRONG", "ADEQUATE"];

/**
 * Map a code-review verdict onto the 0-10 overallScore scale that
 * `computeDesignAptitudeStats` reads. STRONG → 10, ADEQUATE → 7.
 * Non-passing verdicts return 0 (defensive — filter should exclude them).
 */
function overallScoreForVerdict(verdict) {
  if (verdict === "STRONG") return 10;
  if (verdict === "ADEQUATE") return 7;
  return 0;
}

/**
 * Load curriculum LabAttempts on design concepts and adapt them to the
 * DesignSession-like shape that `computeDesignAptitudeStats` consumes.
 *
 * @param {object} input
 * @param {string} input.userId
 * @param {string} input.teamId
 * @returns {Promise<Array<object>>}  Empty array when either id is missing
 *                                     or when there are no qualifying attempts.
 */
export async function mapLabAttemptsToDesignSessions({ userId, teamId }) {
  if (!userId || !teamId) return [];

  const attempts = await prisma.labAttempt.findMany({
    where: {
      userId,
      codeReviewVerdict: { in: PASSING_VERDICTS },
      reviewStatus: "COMPLETED",
      lab: {
        teamId,
        concept: {
          teamId,
          topic: { category: { in: DESIGN_CATEGORIES } },
        },
      },
    },
    include: {
      lab: {
        include: {
          concept: {
            select: {
              id: true,
              topicId: true,
              topic: { select: { category: true } },
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  return attempts.map((a) => {
    const category = a.lab.concept.topic.category;
    const designType =
      category === "SYSTEM_DESIGN" ? "SYSTEM_DESIGN" : "LOW_LEVEL_DESIGN";
    return {
      id: `lab-${a.id}`,
      userId,
      teamId,
      conceptId: a.lab.concept.id,
      topicId: a.lab.concept.topicId,
      source: "curriculum_lab",
      verdict: a.codeReviewVerdict,
      designType,
      submittedAt: a.submittedAt,
      evaluation: {
        overallScore: overallScoreForVerdict(a.codeReviewVerdict),
        dimensions: {
          systemDesign: a.codeReviewVerdict === "STRONG" ? 5 : 4,
          coding: a.codeReviewVerdict === "STRONG" ? 5 : 4,
          communication: null,
        },
      },
      phases: null,
      scenarios: null,
      interviewSessions: [],
    };
  });
}

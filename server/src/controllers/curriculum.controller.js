// ============================================================================
// curriculum.controller.js — Learner-facing curriculum routes (W4.T1)
// ============================================================================
//
// Distinct from `curriculumAdmin.controller.js` (which is TEAM_ADMIN only).
// These endpoints serve regular learners in a team:
//   - Browse the team's PUBLISHED topics + enrollment state.
//   - View a topic's PUBLISHED concept tree + per-concept mastery.
//   - Enroll (upsert TopicEnrollment).
//   - View a single concept's learning content — primer, worked example,
//     lab summary. IMPORTANT: this endpoint MUST NOT expose the lab's
//     `referenceSolution` or `starterCode`. Those are gated by the
//     reveal-reference flow in W4.T3.
//
// Middleware chain (applied once via router.use in `curriculum.routes.js`):
//   authenticate       → decodes JWT, populates req.user
//   requireTeamContext → validates team is ACTIVE, populates req.teamId
//
// Every query filters by `req.teamId`. DRAFT / REVIEWED rows return 404 for
// learners — only PUBLISHED content is visible.
// ============================================================================

import { z } from "zod";
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { runValidator } from "../services/curriculum/contentReview.service.js";

/**
 * GET /curriculum/topics
 * Lists this team's PUBLISHED topics + the caller's enrollment state on each.
 * DRAFT / REVIEWED topics are hidden from learners entirely.
 */
export async function listTopics(req, res) {
  const topics = await prisma.topic.findMany({
    where: { teamId: req.teamId, status: "PUBLISHED" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      estimatedHoursToMastery: true,
      publishedAt: true,
      _count: { select: { concepts: true } },
      enrollments: {
        where: { userId: req.user.id },
        select: {
          id: true,
          status: true,
          preferences: true,
          startedAt: true,
          lastActiveAt: true,
          completedAt: true,
        },
      },
    },
  });

  const shaped = topics.map((t) => {
    const { enrollments, ...rest } = t;
    return { ...rest, enrollment: enrollments[0] ?? null };
  });

  return success(res, { topics: shaped });
}

/**
 * GET /curriculum/topics/:slug
 * Topic detail — PUBLISHED concepts (ordered by `order` asc) + user's
 * per-concept mastery + user's enrollment state.
 *
 * Returns 404 for DRAFT/REVIEWED topics: they exist in the DB but are not
 * part of the learner surface.
 */
export async function getTopicDetail(req, res) {
  const { slug } = req.params;

  const topic = await prisma.topic.findFirst({
    where: {
      slug,
      teamId: req.teamId,
      status: "PUBLISHED",
    },
    include: {
      concepts: {
        where: { status: "PUBLISHED" },
        orderBy: { order: "asc" },
        include: {
          masteries: {
            where: { userId: req.user.id },
            select: {
              score: true,
              teachingReady: true,
              nextReviewAt: true,
              updatedAt: true,
            },
          },
          lab: {
            select: {
              id: true,
              title: true,
              timeboxMinutes: true,
              status: true,
              expectedArtifacts: true,
              language: true,
            },
          },
        },
      },
      enrollments: {
        where: { userId: req.user.id },
        select: {
          id: true,
          status: true,
          preferences: true,
          startedAt: true,
          lastActiveAt: true,
          completedAt: true,
        },
      },
    },
  });

  if (!topic) {
    return error(res, "Topic not found", 404, "TOPIC_NOT_FOUND");
  }

  const shaped = {
    ...topic,
    concepts: topic.concepts.map((c) => {
      const { masteries, ...rest } = c;
      return { ...rest, mastery: masteries[0] ?? null };
    }),
    enrollment: topic.enrollments[0] ?? null,
  };
  delete shaped.enrollments;

  return success(res, { topic: shaped });
}

/**
 * POST /curriculum/topics/:slug/enroll
 * Idempotent upsert on TopicEnrollment(userId, topicId).
 *
 * Body (all optional): { preferences?: { targetOutcome?, timelineWeeks?, ... } }
 *
 * Returns 201 on both first-time create and subsequent re-enrolls — the
 * client can treat "already enrolled" and "just enrolled" identically.
 * DRAFT/REVIEWED topics → 404 (can't enroll in unpublished content).
 */
export async function enrollInTopic(req, res) {
  const { slug } = req.params;
  const { preferences } = req.body ?? {};

  const topic = await prisma.topic.findFirst({
    where: { slug, teamId: req.teamId, status: "PUBLISHED" },
    select: { id: true },
  });

  if (!topic) {
    return error(res, "Topic not found", 404, "TOPIC_NOT_FOUND");
  }

  const enrollment = await prisma.topicEnrollment.upsert({
    where: {
      userId_topicId: { userId: req.user.id, topicId: topic.id },
    },
    create: {
      userId: req.user.id,
      topicId: topic.id,
      status: "ACTIVE",
      preferences: preferences ?? {},
      lastActiveAt: new Date(),
    },
    update: {
      status: "ACTIVE",
      // Only overwrite preferences when the caller supplies them.
      // `undefined` on a Prisma update is a no-op (leaves the value alone).
      preferences: preferences === undefined ? undefined : preferences,
      lastActiveAt: new Date(),
    },
  });

  return success(res, { enrollment }, 201);
}

/**
 * GET /curriculum/concepts/:slug
 * Full learner view of a single concept.
 *
 * Excludes the Lab's `referenceSolution` and `starterCode` — those two
 * fields are gated behind the reveal-reference flow (W4.T3) and MUST NOT
 * leak here. The integration test asserts their absence explicitly.
 *
 * Also filters `status: "PUBLISHED"` on both the Concept AND its parent
 * Topic — a PUBLISHED concept under a DRAFT topic (transient reviewer
 * state) is not learner-visible.
 */
export async function getConceptDetail(req, res) {
  const { slug } = req.params;

  const concept = await prisma.concept.findFirst({
    where: {
      slug,
      teamId: req.teamId,
      status: "PUBLISHED",
      topic: { status: "PUBLISHED" },
    },
    include: {
      topic: { select: { id: true, slug: true, name: true } },
      lab: {
        // Explicit select — NO `referenceSolution`, NO `starterCode`.
        // These are the two fields the reveal-reference gate protects.
        select: {
          id: true,
          title: true,
          taskMarkdown: true,
          timeboxMinutes: true,
          language: true,
          expectedArtifacts: true,
          status: true,
        },
      },
      masteries: {
        where: { userId: req.user.id },
        select: {
          score: true,
          teachingReady: true,
          signals: true,
          nextReviewAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!concept) {
    return error(res, "Concept not found", 404, "CONCEPT_NOT_FOUND");
  }

  // Most recent LabAttempt (summary only — no code body). Only fetched
  // when the concept has a Lab; otherwise there's nothing to attempt.
  let latestAttempt = null;
  if (concept.lab) {
    latestAttempt = await prisma.labAttempt.findFirst({
      where: { userId: req.user.id, labId: concept.lab.id },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        attemptNumber: true,
        submittedAt: true,
        reviewedAt: true,
        reviewStatus: true,
        codeReviewVerdict: true,
        revealedReferenceAt: true,
      },
    });
  }

  const shaped = {
    ...concept,
    mastery: concept.masteries[0] ?? null,
    latestAttempt,
  };
  delete shaped.masteries;

  return success(res, { concept: shaped });
}

// ============================================================================
// Lab attempts — async 202 pattern (W4.T2)
// ============================================================================
//
// POST /curriculum/labs/:id/attempts
//   1. Zod-validate body ({ code: <=100KB }).
//   2. Verify Lab is PUBLISHED under a PUBLISHED Concept + PUBLISHED Topic and
//      belongs to the caller's team — otherwise 404.
//   3. Allocate an attemptNumber via MAX+1 inside a transaction. Retry on
//      P2002 unique-constraint conflicts (concurrent submits by the same
//      user race here); uniqueness is enforced on (userId, labId,
//      attemptNumber).
//   4. Fire-and-forget `runValidator("CODE_REVIEW", ...)` — the async
//      .then() chain PATCHes the LabAttempt row on completion. Errors are
//      swallowed into reviewStatus=ERROR so the poller always converges.
//   5. Return 202 immediately with { attemptId, reviewStatus: "PENDING",
//      attemptNumber }.
//
// GET /curriculum/labs/:id/attempts/:attemptId
//   Private to the submitter (findFirst with userId filter). Team-scoped
//   defense-in-depth so a cross-team probe with a valid attemptId still 404s.
// ============================================================================

// Zod cap on submission — per Security m2 (100 KB limit).
const submitAttemptSchema = z
  .object({
    code: z.string().min(1).max(100_000),
  })
  .strict();

/**
 * POST /curriculum/labs/:id/attempts
 * Submit a code attempt. Returns 202 immediately; fires an unawaited
 * CODE_REVIEW validator that updates the LabAttempt row on completion.
 */
export async function submitAttempt(req, res) {
  const { id: labId } = req.params;

  const parsed = submitAttemptSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return error(res, "Invalid attempt body", 400, "INVALID_BODY", {
      issues: parsed.error.issues,
    });
  }
  const { code } = parsed.data;

  // Ownership check — Lab must be PUBLISHED, team-scoped, parent Concept +
  // Topic PUBLISHED. DRAFT/REVIEWED content is not attempt-submittable.
  const lab = await prisma.lab.findFirst({
    where: {
      id: labId,
      teamId: req.teamId,
      status: "PUBLISHED",
      concept: { status: "PUBLISHED", topic: { status: "PUBLISHED" } },
    },
    include: {
      concept: {
        select: { id: true, slug: true, name: true, primerMarkdown: true },
      },
    },
  });
  if (!lab) return error(res, "Lab not found", 404, "LAB_NOT_FOUND");

  // Allocate attemptNumber via MAX+1 inside a transaction. On P2002 unique
  // conflict (concurrent submit by the same user), retry up to 3 times.
  const attempt = await allocateAttempt({
    userId: req.user.id,
    labId,
    code,
  });

  // Fire-and-forget CODE_REVIEW. Async .then() chain updates the LabAttempt
  // row when the AI review completes; on throw, .catch() flips to ERROR.
  // Never awaited — the 202 must return immediately.
  runValidator("CODE_REVIEW", {
    targetId: labId,
    lab: {
      title: lab.title,
      taskMarkdown: lab.taskMarkdown,
      expectedArtifacts: lab.expectedArtifacts,
      language: lab.language,
    },
    concept: {
      name: lab.concept.name,
      primerExcerpt: (lab.concept.primerMarkdown ?? "").slice(0, 4000),
    },
    attempt: {
      code,
      attemptNumber: attempt.attemptNumber,
    },
  })
    .then((result) => onReviewCompleted(attempt.id, result))
    .catch((err) => onReviewFailed(attempt.id, err));

  return success(
    res,
    {
      attemptId: attempt.id,
      reviewStatus: attempt.reviewStatus,
      attemptNumber: attempt.attemptNumber,
    },
    202,
  );
}

/**
 * Allocate a new LabAttempt with attemptNumber = MAX+1. On P2002 race
 * (concurrent submits collide on the (userId, labId, attemptNumber) unique
 * key), retry up to MAX_RETRIES times.
 */
async function allocateAttempt({ userId, labId, code }) {
  const MAX_RETRIES = 3;
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const maxRow = await tx.labAttempt.aggregate({
          where: { userId, labId },
          _max: { attemptNumber: true },
        });
        const attemptNumber = (maxRow._max.attemptNumber ?? 0) + 1;
        return tx.labAttempt.create({
          data: {
            labId,
            userId,
            attemptNumber,
            code,
            reviewStatus: "PENDING",
          },
        });
      });
    } catch (err) {
      if (err?.code === "P2002" && retry < MAX_RETRIES - 1) {
        // Race — another attempt inserted at the same attemptNumber. Retry.
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    "Failed to allocate LabAttempt.attemptNumber after retries",
  );
}

async function onReviewCompleted(attemptId, result) {
  try {
    await prisma.labAttempt.update({
      where: { id: attemptId },
      data: {
        reviewStatus: "COMPLETED",
        reviewedAt: new Date(),
        codeReviewVerdict: result.body.codeReviewVerdict,
        codeReview: result.body,
      },
    });
    // W4.T4 will add sendToUser + mastery signal writer here.
  } catch (err) {
    console.warn(
      `[curriculum:attempt] Failed to update attempt ${attemptId} to COMPLETED:`,
      err.message,
    );
  }
}

async function onReviewFailed(attemptId, err) {
  console.warn(
    `[curriculum:attempt] Review failed for attempt ${attemptId}:`,
    err?.message ?? err,
  );
  try {
    await prisma.labAttempt.update({
      where: { id: attemptId },
      data: {
        reviewStatus: "ERROR",
        reviewedAt: new Date(),
      },
    });
    // W4.T4 will add sendToUser here.
  } catch (updateErr) {
    console.warn(
      `[curriculum:attempt] Failed to update attempt ${attemptId} to ERROR:`,
      updateErr.message,
    );
  }
}

/**
 * GET /curriculum/labs/:id/attempts/:attemptId
 * Poll for the attempt's review result. Private to the attempt owner.
 * findFirst with userId filter → cross-user probes return null → 404.
 */
export async function getAttempt(req, res) {
  const { id: labId, attemptId } = req.params;

  const attempt = await prisma.labAttempt.findFirst({
    where: {
      id: attemptId,
      labId,
      userId: req.user.id, // Private — only the submitter can poll.
      lab: { teamId: req.teamId }, // Team-scoped defense-in-depth.
    },
    select: {
      id: true,
      labId: true,
      attemptNumber: true,
      code: true,
      submittedAt: true,
      reviewedAt: true,
      reviewStatus: true,
      codeReviewVerdict: true,
      codeReview: true,
      revealedReferenceAt: true,
    },
  });

  if (!attempt) {
    return error(res, "Attempt not found", 404, "ATTEMPT_NOT_FOUND");
  }

  return success(res, { attempt });
}

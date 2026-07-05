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

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

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

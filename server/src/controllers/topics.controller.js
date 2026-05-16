// ============================================================================
// Topic Mastery Tracks — Controller (v1 scaffold)
// ============================================================================
//
// User-facing endpoints render ONLY published rows (Topic.status === PUBLISHED
// AND Concept.status === PUBLISHED). DRAFT and REVIEWED rows are admin-only.
// This is the architectural anti-hallucination defense — content cannot
// reach users until an admin has signed off.
//
// v1 scope (this file):
//   GET  /topics                     — list published topics
//   GET  /topics/:slug                — topic detail (concept graph, published only)
//   POST /topics/:slug/enroll         — enroll the user with preferences
//   GET  /topics/:slug/state          — user's enrollment + masteries
//   PATCH /topics/:slug/enrollment    — update preferences / pause / resume
//
// Admin endpoints live in admin.controller.js or platform.controller.js
// in a follow-up commit; this file is user-facing only.
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { planNextAction, detectStuck } from "../services/mentor.service.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Strip non-public fields before returning a topic to the client. */
function publicTopic(t) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    category: t.category,
    mockInterviewCategory: t.mockInterviewCategory,
    estimatedHoursToMastery: t.estimatedHoursToMastery,
    publishedAt: t.publishedAt,
  };
}

/** Strip non-public fields before returning a concept. */
function publicConcept(c) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    order: c.order,
    primerMarkdown: c.primerMarkdown,
    workedExample: c.workedExample,
    canonicalSources: c.canonicalSources,
    expectedQuestions: c.expectedQuestions,
    prerequisites: (c.prerequisites ?? []).map((d) => d.prereqId),
    publishedAt: c.publishedAt,
  };
}

/** Validate the personalization input from the enroll endpoint. */
function validatePreferences(prefs) {
  if (!prefs || typeof prefs !== "object") return "preferences object is required";

  const validOutcomes = new Set([
    "TEACH_TO_TEAM",
    "INTERVIEW_PASS",
    "BUILD_PRODUCTION",
    "RESEARCH",
  ]);
  if (!validOutcomes.has(prefs.targetOutcome)) {
    return `targetOutcome must be one of: ${[...validOutcomes].join(", ")}`;
  }

  const weeks = Number(prefs.timelineWeeks);
  if (!Number.isFinite(weeks) || weeks < 1 || weeks > 104) {
    return "timelineWeeks must be a number between 1 and 104";
  }
  const hours = Number(prefs.hoursPerWeek);
  if (!Number.isFinite(hours) || hours < 1 || hours > 80) {
    return "hoursPerWeek must be a number between 1 and 80";
  }

  if (prefs.targetCompanies != null && !Array.isArray(prefs.targetCompanies)) {
    return "targetCompanies must be an array of strings";
  }
  if (prefs.targetLevels != null && !Array.isArray(prefs.targetLevels)) {
    return "targetLevels must be an array of strings";
  }
  if (prefs.learningStyle != null && !Array.isArray(prefs.learningStyle)) {
    return "learningStyle must be an array of strings";
  }

  const validEnergies = new Set([null, undefined, "HIGH", "MEDIUM", "LOW"]);
  if (!validEnergies.has(prefs.energyBudget)) {
    return "energyBudget must be HIGH | MEDIUM | LOW";
  }
  const validFrictions = new Set([null, undefined, "HIGH", "LOW"]);
  if (!validFrictions.has(prefs.frictionTolerance)) {
    return "frictionTolerance must be HIGH | LOW";
  }
  return null;
}

// ── GET /topics — list published topics ──────────────────────────────

export async function listTopics(req, res) {
  try {
    const userId = req.user.id;
    const topics = await prisma.topic.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { concepts: { where: { status: "PUBLISHED" } } } },
      },
    });

    // Annotate with the user's enrollment status (if any) so the client can
    // render "Enrolled" / "Resume" / "Start" CTAs on the list view.
    const enrollments = await prisma.topicEnrollment.findMany({
      where: { userId, topicId: { in: topics.map((t) => t.id) } },
      select: { topicId: true, status: true, lastActiveAt: true },
    });
    const byTopicId = new Map(enrollments.map((e) => [e.topicId, e]));

    return success(res, {
      topics: topics.map((t) => ({
        ...publicTopic(t),
        publishedConceptCount: t._count.concepts,
        enrollment: byTopicId.get(t.id) ?? null,
      })),
    });
  } catch (err) {
    console.error("listTopics:", err);
    return error(res, "Failed to list topics.", 500);
  }
}

// ── GET /topics/:slug — topic detail with published concept graph ────

export async function getTopic(req, res) {
  try {
    const { slug } = req.params;
    const topic = await prisma.topic.findUnique({
      where: { slug },
      include: {
        concepts: {
          where: { status: "PUBLISHED" },
          orderBy: { order: "asc" },
          include: {
            prerequisites: { select: { prereqId: true } },
          },
        },
      },
    });
    if (!topic || topic.status !== "PUBLISHED") {
      return error(res, "Topic not found.", 404);
    }

    return success(res, {
      topic: publicTopic(topic),
      concepts: topic.concepts.map(publicConcept),
    });
  } catch (err) {
    console.error("getTopic:", err);
    return error(res, "Failed to fetch topic.", 500);
  }
}

// ── POST /topics/:slug/enroll ────────────────────────────────────────

export async function enrollInTopic(req, res) {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const { preferences } = req.body ?? {};

    const validationError = validatePreferences(preferences);
    if (validationError) return error(res, validationError, 400);

    const topic = await prisma.topic.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!topic || topic.status !== "PUBLISHED") {
      return error(res, "Topic not found.", 404);
    }

    // Upsert: re-enrolling refreshes preferences and reactivates the track.
    const enrollment = await prisma.topicEnrollment.upsert({
      where: { userId_topicId: { userId, topicId: topic.id } },
      create: {
        userId,
        topicId: topic.id,
        preferences,
        status: "ACTIVE",
        lastActiveAt: new Date(),
      },
      update: {
        preferences,
        status: "ACTIVE",
        lastActiveAt: new Date(),
        completedAt: null,
        pausedAt: null,
      },
    });

    return success(res, { enrollment }, 201);
  } catch (err) {
    console.error("enrollInTopic:", err);
    return error(res, "Failed to enroll in topic.", 500);
  }
}

// ── GET /topics/:slug/state — user's track state ─────────────────────

export async function getTopicState(req, res) {
  try {
    const userId = req.user.id;
    const { slug } = req.params;

    const topic = await prisma.topic.findUnique({
      where: { slug },
      select: { id: true, status: true },
    });
    if (!topic || topic.status !== "PUBLISHED") {
      return error(res, "Topic not found.", 404);
    }

    const enrollment = await prisma.topicEnrollment.findUnique({
      where: { userId_topicId: { userId, topicId: topic.id } },
    });
    if (!enrollment) {
      return success(res, { enrolled: false, enrollment: null, masteries: [] });
    }

    const masteries = await prisma.conceptMastery.findMany({
      where: {
        userId,
        concept: { topicId: topic.id },
      },
      select: {
        conceptId: true,
        score: true,
        teachingReady: true,
        nextReviewAt: true,
        updatedAt: true,
      },
    });

    // Mentor Orchestrator outputs — what to do next, whether the user is
    // stuck, and a small progress summary for the UI. Computed in parallel
    // because the two operations don't share state.
    const [nextAction, stuck, totalConcepts] = await Promise.all([
      planNextAction(userId, topic.id),
      detectStuck(userId, topic.id),
      prisma.concept.count({ where: { topicId: topic.id, status: "PUBLISHED" } }),
    ]);

    const progress = summarizeProgress(masteries, totalConcepts);

    return success(res, {
      enrolled: true,
      enrollment,
      masteries,
      nextAction,
      stuck,
      progress,
    });
  } catch (err) {
    console.error("getTopicState:", err);
    return error(res, "Failed to fetch topic state.", 500);
  }
}

// Summarize per-user progress on a topic. Counts "untouched" against the
// PUBLISHED concept total so users see a real fraction (not just rows in
// ConceptMastery).
function summarizeProgress(masteries, totalConcepts) {
  let mastered = 0;
  let inProgress = 0;
  let touched = 0;
  for (const m of masteries) {
    if (m.score == null) continue;
    touched++;
    if (m.score >= 80) mastered++;
    else if (m.score >= 1) inProgress++;
  }
  return {
    totalConcepts,
    mastered,
    inProgress,
    untouched: Math.max(0, totalConcepts - touched),
  };
}

// ── PATCH /topics/:slug/enrollment — update preferences / lifecycle ──

const VALID_LIFECYCLE_TRANSITIONS = {
  ACTIVE: new Set(["PAUSED", "COMPLETED", "ABANDONED"]),
  PAUSED: new Set(["ACTIVE", "ABANDONED"]),
  COMPLETED: new Set(["ACTIVE"]),
  ABANDONED: new Set(["ACTIVE"]),
};

export async function updateEnrollment(req, res) {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const { preferences, status: nextStatus } = req.body ?? {};

    const topic = await prisma.topic.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!topic) return error(res, "Topic not found.", 404);

    const enrollment = await prisma.topicEnrollment.findUnique({
      where: { userId_topicId: { userId, topicId: topic.id } },
    });
    if (!enrollment) return error(res, "Not enrolled.", 404);

    // Validate state transition if status is being changed.
    const update = { lastActiveAt: new Date() };
    if (nextStatus && nextStatus !== enrollment.status) {
      const allowed = VALID_LIFECYCLE_TRANSITIONS[enrollment.status];
      if (!allowed?.has(nextStatus)) {
        return error(
          res,
          `Cannot transition from ${enrollment.status} to ${nextStatus}.`,
          400,
        );
      }
      update.status = nextStatus;
      if (nextStatus === "PAUSED") update.pausedAt = new Date();
      if (nextStatus === "COMPLETED") update.completedAt = new Date();
      if (nextStatus === "ACTIVE") {
        update.pausedAt = null;
        update.completedAt = null;
      }
    }

    if (preferences !== undefined) {
      const validationError = validatePreferences(preferences);
      if (validationError) return error(res, validationError, 400);
      update.preferences = preferences;
    }

    const updated = await prisma.topicEnrollment.update({
      where: { id: enrollment.id },
      data: update,
    });

    return success(res, { enrollment: updated });
  } catch (err) {
    console.error("updateEnrollment:", err);
    return error(res, "Failed to update enrollment.", 500);
  }
}

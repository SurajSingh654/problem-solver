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
import { planNextAction, detectStuck, updateMastery } from "../services/mentor.service.js";
import {
  getCalibrationForTopic,
  scoreCalibration,
  CalibrationError,
} from "../services/calibration.service.js";

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

// ── Calibration ──────────────────────────────────────────────────────

/**
 * GET /topics/:slug/calibration
 *
 * Returns the wire-safe question list (no `correct`, no `rationale`) plus
 * the user's existing calibration result if they have one. Requires the
 * user to be enrolled — gating is at the controller layer because mentor
 * orchestration only makes sense for enrolled users.
 */
export async function getTopicCalibration(req, res) {
  try {
    const userId = req.user.id;
    const { slug } = req.params;

    const topic = await prisma.topic.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!topic) return error(res, "Topic not found.", 404);

    const enrollment = await prisma.topicEnrollment.findUnique({
      where: { userId_topicId: { userId, topicId: topic.id } },
      select: { calibration: true, status: true },
    });
    if (!enrollment) {
      return error(res, "You must enroll before taking the calibration.", 404);
    }

    let bank;
    try {
      bank = getCalibrationForTopic(slug);
    } catch (err) {
      if (err instanceof CalibrationError && err.code === "BANK_NOT_FOUND") {
        return error(res, "No calibration is available for this topic yet.", 404);
      }
      throw err;
    }

    return success(res, {
      questions: bank.questions,
      existing: enrollment.calibration ?? null,
    });
  } catch (err) {
    console.error("getTopicCalibration:", err);
    return error(res, "Failed to load calibration.", 500);
  }
}

/**
 * POST /topics/:slug/calibration/submit
 *
 * Body: { responses: Array<{ questionId: string, answer: 'A'|'B'|'C'|'D' }> }
 *
 * Scores server-side, persists to TopicEnrollment.calibration, returns
 * score + per-concept breakdown + per-question rationales (released only
 * AFTER submit). Also returns the recomputed nextAction so the result
 * screen can deep-link to INTAKE without an extra round-trip.
 */
export async function submitTopicCalibration(req, res) {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const { responses } = req.body ?? {};

    const topic = await prisma.topic.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!topic) return error(res, "Topic not found.", 404);

    const enrollment = await prisma.topicEnrollment.findUnique({
      where: { userId_topicId: { userId, topicId: topic.id } },
      select: { id: true },
    });
    if (!enrollment) {
      return error(res, "You must enroll before submitting calibration.", 404);
    }

    let result;
    try {
      result = scoreCalibration(slug, responses);
    } catch (err) {
      if (err instanceof CalibrationError) {
        const status = err.code === "BANK_NOT_FOUND" ? 404 : 400;
        return res.status(status).json({
          success: false,
          error: { message: err.message, code: err.code, details: err.details },
        });
      }
      throw err;
    }

    const calibrationPayload = {
      score: result.score,
      total: result.total,
      perConceptCorrectness: result.perConceptCorrectness,
      perQuestionCorrectness: result.perQuestionCorrectness,
      takenAt: new Date().toISOString(),
    };

    await prisma.topicEnrollment.update({
      where: { id: enrollment.id },
      data: {
        calibration: calibrationPayload,
        lastActiveAt: new Date(),
      },
    });

    // Recompute next action so the result screen can deep-link.
    let nextAction = null;
    try {
      nextAction = await planNextAction(userId, topic.id);
    } catch (err) {
      // Non-fatal — frontend can refetch /state if this fails.
      console.error("submitTopicCalibration: planNextAction failed:", err);
    }

    return success(res, {
      ...calibrationPayload,
      rationales: result.rationales,
      nextAction,
    });
  } catch (err) {
    console.error("submitTopicCalibration:", err);
    return error(res, "Failed to submit calibration.", 500);
  }
}

// ── Concept primer ───────────────────────────────────────────────────

/**
 * GET /topics/:slug/concepts/:conceptSlug
 *
 * Returns the concept primer — only PUBLISHED concepts are user-visible
 * (DRAFT/REVIEWED are admin-only). Includes the user's mastery state for
 * the concept and the prereq satisfaction map so the page can show
 * "you should be at developing+ on X first" advisories.
 */
export async function getTopicConcept(req, res) {
  try {
    const userId = req.user.id;
    const { slug, conceptSlug } = req.params;

    const topic = await prisma.topic.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { id: true, slug: true, name: true },
    });
    if (!topic) return error(res, "Topic not found.", 404);

    const concept = await prisma.concept.findFirst({
      where: { topicId: topic.id, slug: conceptSlug, status: "PUBLISHED" },
      include: {
        prerequisites: { select: { prereqId: true } },
      },
    });
    if (!concept) return error(res, "Concept not found.", 404);

    // Mastery row for this concept (may not exist yet).
    const mastery = await prisma.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId: concept.id } },
      select: { score: true, signals: true, teachingReady: true },
    });

    const log = Array.isArray(mastery?.signals) ? mastery.signals : [];
    const primerRead = log.some((s) => s?.source === "primer_read");

    // Prereq satisfaction — fetch each prereq concept + the user's mastery for it.
    const prereqIds = concept.prerequisites.map((p) => p.prereqId);
    const prereqs = prereqIds.length
      ? await prisma.concept.findMany({
          where: { id: { in: prereqIds } },
          select: { id: true, slug: true, name: true },
        })
      : [];
    const prereqMasteries = prereqIds.length
      ? await prisma.conceptMastery.findMany({
          where: { userId, conceptId: { in: prereqIds } },
          select: { conceptId: true, score: true },
        })
      : [];
    const masteryByConceptId = new Map(prereqMasteries.map((m) => [m.conceptId, m]));
    const prereqState = prereqs.map((p) => ({
      slug: p.slug,
      name: p.name,
      score: masteryByConceptId.get(p.id)?.score ?? null,
    }));

    return success(res, {
      topic: { slug: topic.slug, name: topic.name },
      concept: {
        id: concept.id,
        slug: concept.slug,
        name: concept.name,
        order: concept.order,
        primerMarkdown: concept.primerMarkdown,
        workedExample: concept.workedExample,
        canonicalSources: concept.canonicalSources,
        expectedQuestions: concept.expectedQuestions,
      },
      mastery: mastery
        ? {
            score: mastery.score,
            teachingReady: mastery.teachingReady,
            primerRead,
          }
        : { score: null, teachingReady: false, primerRead: false },
      prereqs: prereqState,
    });
  } catch (err) {
    console.error("getTopicConcept:", err);
    return error(res, "Failed to load concept.", 500);
  }
}

/**
 * POST /topics/:slug/concepts/:conceptSlug/mark-read
 *
 * Records that the user has read the primer. The primer_read signal has
 * weight 0 so it does NOT bump mastery score — reading isn't proof of
 * understanding. The mentor uses its presence as a "skip in INTAKE"
 * marker so the user advances through unread concepts.
 *
 * Idempotent: a second call appends a second entry; mentor only checks
 * for at-least-one. Returns the recomputed nextAction.
 */
export async function markConceptRead(req, res) {
  try {
    const userId = req.user.id;
    const { slug, conceptSlug } = req.params;

    const topic = await prisma.topic.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!topic) return error(res, "Topic not found.", 404);

    const concept = await prisma.concept.findFirst({
      where: { topicId: topic.id, slug: conceptSlug, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!concept) return error(res, "Concept not found.", 404);

    await updateMastery(userId, concept.id, { source: "primer_read", value: 0 });

    let nextAction = null;
    try {
      nextAction = await planNextAction(userId, topic.id);
    } catch (err) {
      console.error("markConceptRead: planNextAction failed:", err);
    }

    return success(res, { ok: true, nextAction });
  } catch (err) {
    console.error("markConceptRead:", err);
    return error(res, "Failed to mark concept read.", 500);
  }
}

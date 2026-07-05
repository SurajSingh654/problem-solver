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

// ============================================================================
// REVEAL-REFERENCE GATE — struggle-first policy (W4.T3)
// ============================================================================
//
// POST /curriculum/labs/:id/reveal-reference
//
// Struggle-first policy per spec §5.2: users must have wrestled with the
// problem enough to earn a STRONG or ADEQUATE code-review verdict AND
// received a READY_FOR_REFERENCE `nextStep` before the reference solution
// unlocks. Failing either gate returns 403 with a specific `code` so the
// client can render a targeted UX (retry vs iterate).
//
// On success:
//   - Sets `revealedReferenceAt` on the LATEST completed attempt.
//   - Returns the Lab's `referenceSolution`.
// Idempotent — a repeat reveal call updates `revealedReferenceAt` to now();
// no explicit reject on second call (the field is a signal, not a lock).
// ============================================================================

/**
 * POST /curriculum/labs/:id/reveal-reference
 * Enforces spec §5.2. On failure emits one of:
 *   - REVEAL_BLOCKED_NO_ATTEMPT — user has no COMPLETED attempts.
 *   - REVEAL_BLOCKED_VERDICT   — latest attempt is not STRONG/ADEQUATE.
 *   - REVEAL_BLOCKED_NEXT_STEP — verdict OK but nextStep != READY_FOR_REFERENCE.
 */
export async function revealReference(req, res) {
  const { id: labId } = req.params;

  // Team-scope + published check. DRAFT / REVEIWED content is not
  // reference-revealable even if a stale attempt row exists.
  const lab = await prisma.lab.findFirst({
    where: {
      id: labId,
      teamId: req.teamId,
      status: "PUBLISHED",
      concept: { status: "PUBLISHED", topic: { status: "PUBLISHED" } },
    },
    select: { id: true, referenceSolution: true },
  });
  if (!lab) return error(res, "Lab not found", 404, "LAB_NOT_FOUND");

  // Find the user's latest COMPLETED attempt — PENDING / ERROR attempts
  // do not gate the reveal (no verdict yet).
  const latestAttempt = await prisma.labAttempt.findFirst({
    where: {
      userId: req.user.id,
      labId,
      reviewStatus: "COMPLETED",
    },
    orderBy: { submittedAt: "desc" },
  });

  if (!latestAttempt) {
    return error(
      res,
      "No completed lab attempt found. Submit and get a review first.",
      403,
      "REVEAL_BLOCKED_NO_ATTEMPT",
    );
  }

  const { codeReviewVerdict, codeReview } = latestAttempt;
  // codeReview is JSON; nextStep is a top-level field on the CODE_REVIEW
  // schema, guaranteed present when reviewStatus === "COMPLETED".
  const nextStep = codeReview?.nextStep ?? null;

  if (!["STRONG", "ADEQUATE"].includes(codeReviewVerdict)) {
    return error(
      res,
      `Reference locked — current verdict is ${codeReviewVerdict}. Iterate on your solution and resubmit.`,
      403,
      "REVEAL_BLOCKED_VERDICT",
      { codeReviewVerdict, nextStep },
    );
  }

  if (nextStep !== "READY_FOR_REFERENCE") {
    return error(
      res,
      `Reference locked — next step is ${nextStep ?? "unknown"}. Follow the reviewer's guidance first.`,
      403,
      "REVEAL_BLOCKED_NEXT_STEP",
      { codeReviewVerdict, nextStep },
    );
  }

  // All gates pass. Stamp revealedReferenceAt + return the reference.
  const updated = await prisma.labAttempt.update({
    where: { id: latestAttempt.id },
    data: { revealedReferenceAt: new Date() },
    select: { id: true, revealedReferenceAt: true },
  });

  return success(res, {
    referenceSolution: lab.referenceSolution,
    attempt: updated,
  });
}

// ============================================================================
// CHECK-IN SUBMIT — 3-question grader (W4.T3)
// ============================================================================
//
// POST /curriculum/concepts/:slug/checkin
//
// Chained rate limiters at the route layer: aiLimiter + aiTeamLimiter.
// Runs the CHECK_IN validator synchronously (AI_MODEL_FAST, ~2s expected),
// then writes a ConceptCheckIn row with per-question verdicts + calibration
// delta. Unlike CODE_REVIEW, this validator has `targetType: null` — it does
// NOT write ContentReviewLog. Persistence is via ConceptCheckIn.
//
// Unlock rule per spec §6.4: caller must have ≥1 LabAttempt with
// STRONG/ADEQUATE verdict for THIS concept's lab. Enforces
// struggle-before-abstraction ordering (reveal → check-in).
// ============================================================================

const checkInBodySchema = z
  .object({
    recallAnswer: z.string().min(1).max(10_000),
    applyAnswer: z.string().min(1).max(10_000),
    buildAnswer: z.string().min(1).max(10_000),
    preConfidence: z.number().int().min(1).max(5),
  })
  .strict();

/**
 * POST /curriculum/concepts/:slug/checkin
 * On failure emits one of:
 *   - INVALID_BODY            — Zod shape failure.
 *   - CONCEPT_NOT_FOUND       — DRAFT / cross-team / unknown concept.
 *   - CHECKIN_LOCKED_NO_LAB   — concept has no lab attached.
 *   - CHECKIN_LOCKED          — user has no STRONG/ADEQUATE lab attempt.
 */
export async function submitCheckIn(req, res) {
  const { slug } = req.params;

  const parsed = checkInBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return error(res, "Invalid check-in body", 400, "INVALID_BODY", {
      issues: parsed.error.issues,
    });
  }
  const { recallAnswer, applyAnswer, buildAnswer, preConfidence } = parsed.data;

  // Concept lookup — team-scoped + PUBLISHED under a PUBLISHED topic.
  const concept = await prisma.concept.findFirst({
    where: {
      slug,
      teamId: req.teamId,
      status: "PUBLISHED",
      topic: { status: "PUBLISHED" },
    },
    include: {
      lab: { select: { id: true } },
      topic: { select: { id: true } },
    },
  });
  if (!concept) return error(res, "Concept not found", 404, "CONCEPT_NOT_FOUND");

  // Unlock rule: caller must have a STRONG/ADEQUATE lab attempt.
  if (!concept.lab) {
    return error(
      res,
      "Check-in locked — no lab attached to this concept yet.",
      403,
      "CHECKIN_LOCKED_NO_LAB",
    );
  }
  const eligibleAttempt = await prisma.labAttempt.findFirst({
    where: {
      userId: req.user.id,
      labId: concept.lab.id,
      codeReviewVerdict: { in: ["STRONG", "ADEQUATE"] },
      reviewStatus: "COMPLETED",
    },
    select: { id: true },
  });
  if (!eligibleAttempt) {
    return error(
      res,
      "Check-in locked — complete the lab first with a STRONG or ADEQUATE verdict.",
      403,
      "CHECKIN_LOCKED",
    );
  }

  // Run the CHECK_IN validator synchronously. No targetId — CHECK_IN
  // does NOT write ContentReviewLog (per W2.T6 registration:
  // targetType: null). Row persistence is via ConceptCheckIn below.
  const validatorInput = {
    concept: {
      name: concept.name,
      primerMarkdown: concept.primerMarkdown ?? "",
      expectedQuestions: concept.expectedQuestions ?? [],
    },
    answers: {
      recall: recallAnswer,
      apply: applyAnswer,
      build: buildAnswer,
    },
    preConfidence,
  };
  const result = await runValidator("CHECK_IN", validatorInput);
  const verdict = result.body.overallVerdict;
  const calibrationDelta = result.body.calibrationDelta;

  const checkIn = await allocateCheckIn({
    userId: req.user.id,
    conceptId: concept.id,
    recallAnswer,
    applyAnswer,
    buildAnswer,
    preConfidence,
    aiVerdict: verdict,
    aiFeedback: result.body,
    calibrationDelta,
  });

  // W4.T4 will add recordCheckInSignal here (feeds D10 calibration).

  return success(
    res,
    {
      checkIn: {
        id: checkIn.id,
        attemptNumber: checkIn.attemptNumber,
        aiVerdict: checkIn.aiVerdict,
        aiFeedback: checkIn.aiFeedback,
        calibrationDelta: checkIn.calibrationDelta,
        completedAt: checkIn.completedAt,
      },
      usedFallback: result.usedFallback,
    },
    201,
  );
}

/**
 * Allocate a ConceptCheckIn with attemptNumber = MAX+1. On P2002 race
 * (concurrent submits collide on (userId, conceptId, attemptNumber)), retry
 * up to MAX_RETRIES.
 */
async function allocateCheckIn(data) {
  const MAX_RETRIES = 3;
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const maxRow = await tx.conceptCheckIn.aggregate({
          where: { userId: data.userId, conceptId: data.conceptId },
          _max: { attemptNumber: true },
        });
        const attemptNumber = (maxRow._max.attemptNumber ?? 0) + 1;
        return tx.conceptCheckIn.create({
          data: {
            userId: data.userId,
            conceptId: data.conceptId,
            attemptNumber,
            recallAnswer: data.recallAnswer,
            applyAnswer: data.applyAnswer,
            buildAnswer: data.buildAnswer,
            preConfidence: data.preConfidence,
            aiVerdict: data.aiVerdict,
            aiFeedback: data.aiFeedback,
            calibrationDelta: data.calibrationDelta,
          },
        });
      });
    } catch (err) {
      if (err?.code === "P2002" && retry < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    "Failed to allocate ConceptCheckIn.attemptNumber after retries",
  );
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

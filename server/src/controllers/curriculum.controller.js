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
import { dispatchReview } from "../services/curriculum/reviewSemaphore.js";
import {
  recordLabSignal,
  recordCheckInSignal,
  recordPrimerReadSignal,
} from "../services/curriculum/conceptMastery.service.js";
import { sendToUser } from "../services/websocket.service.js";
import logger from "../utils/logger.js";

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

  // Explicit `select` on Concept — drops `readinessRubric`,
  // `assessmentCriteria`, `primerHtml`, `richHtmlEnabled` from the
  // learner payload (they were leaking via a bare `include`). Also
  // folds `latestAttempt` into `lab.attempts` (one query instead of two).
  const concept = await prisma.concept.findFirst({
    where: {
      slug,
      teamId: req.teamId,
      status: "PUBLISHED",
      topic: { status: "PUBLISHED" },
    },
    select: {
      id: true,
      topicId: true,
      teamId: true,
      slug: true,
      name: true,
      order: true,
      status: true,
      // Structured section-model primer (Phase B). When present the client
      // renders via PrimerSectionRenderer; when empty the client falls back
      // to the legacy flat fields below. Backfill migration seeded
      // primerSections for every existing concept.
      primerSections: true,
      // Legacy flat fields — retained for the transition release. Read
      // path falls back when primerSections is empty; authors still edit
      // these until Phase C ships the section editor.
      primerMarkdown: true,
      workedExample: true,
      cheatsheetMarkdown: true,
      canonicalSources: true,
      expectedQuestions: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
      // Prerequisites — surfaced on the Primer via the `prerequisites`
      // section type. Team-scoping is transitive via the parent concept's
      // teamId filter; the join stays cheap because ConceptDependency has
      // a composite unique index on (conceptId, prereqId).
      prerequisites: {
        select: {
          id: true,
          hintNote: true,
          prereq: {
            select: { id: true, slug: true, name: true, status: true },
          },
        },
      },
      topic: {
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          subCategory: true,
          // `_count.concepts` filtered to PUBLISHED feeds the "Concept N of M"
          // progress strip on ConceptPage.
          _count: { select: { concepts: { where: { status: "PUBLISHED" } } } },
        },
      },
      lab: {
        // NO `referenceSolution`, NO `starterCode` — the reveal-reference
        // gate protects both. Nested `attempts` folds what used to be a
        // separate `findFirst` into the same round-trip.
        select: {
          id: true,
          title: true,
          taskMarkdown: true,
          timeboxMinutes: true,
          language: true,
          expectedArtifacts: true,
          status: true,
          attempts: {
            where: { userId: req.user.id },
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: {
              id: true,
              attemptNumber: true,
              submittedAt: true,
              reviewedAt: true,
              reviewStatus: true,
              codeReviewVerdict: true,
              revealedReferenceAt: true,
            },
          },
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

  const latestAttempt = concept.lab?.attempts?.[0] ?? null;
  const shaped = {
    ...concept,
    mastery: concept.masteries[0] ?? null,
    latestAttempt,
  };
  delete shaped.masteries;
  // Response contract stays flat (`concept.lab.attempts` isn't in the
  // documented shape) — strip the internal array now that we've pulled
  // the row out.
  if (shaped.lab) {
    shaped.lab = { ...shaped.lab };
    delete shaped.lab.attempts;
  }

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

/**
 * Derive a primer excerpt for the CODE_REVIEW prompt. Prefers the legacy
 * flat `primerMarkdown` when present; otherwise stitches `mentalModel` +
 * `body` sections from the Phase-B `primerSections` array. Returns an
 * empty string when neither source has content (the AI prompt substitutes
 * "(empty)" and the review still runs, just with less context).
 */
function derivePrimerExcerpt(concept) {
  const flat = concept?.primerMarkdown ?? "";
  if (flat.trim().length > 0) return flat;
  const sections = Array.isArray(concept?.primerSections)
    ? concept.primerSections
    : [];
  const parts = [];
  for (const s of sections) {
    if (
      (s?.type === "mentalModel" || s?.type === "body") &&
      typeof s.markdown === "string" &&
      s.markdown.trim().length > 0
    ) {
      parts.push(s.markdown);
    }
  }
  return parts.join("\n\n");
}

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
        select: {
          id: true,
          slug: true,
          name: true,
          primerMarkdown: true,
          // Phase-B primer-section-model fallback: derive an excerpt from
          // `primerSections` when the legacy flat field is empty. Otherwise
          // the CODE_REVIEW prompt sends `(empty)` and grades against a
          // vacuum, dropping AI verdict quality.
          primerSections: true,
        },
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

  // Fire-and-forget CODE_REVIEW, gated by a per-team in-flight cap. Async
  // .then() chain updates the LabAttempt row when the AI review completes;
  // on throw, .catch() flips to ERROR. Never awaited — the 202 must return
  // immediately. See reviewSemaphore.js for the concurrency contract.
  dispatchReview(req.teamId, () =>
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
        primerExcerpt: derivePrimerExcerpt(lab.concept).slice(0, 4000),
      },
      attempt: {
        code,
        attemptNumber: attempt.attemptNumber,
      },
    }),
  )
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
    const updated = await prisma.labAttempt.update({
      where: { id: attemptId },
      data: {
        reviewStatus: "COMPLETED",
        reviewedAt: new Date(),
        codeReviewVerdict: result.body.codeReviewVerdict,
        codeReview: result.body,
        // Persist the fallback flag from `contentReview.service.runValidator`.
        // When true, the AI call failed and a deterministic conservative
        // WEAK verdict was substituted. Client badges the verdict so the
        // learner knows to retry rather than assuming this is the real
        // AI's judgement (which would permanently block the reveal gate).
        usedFallback: result.usedFallback ?? false,
      },
      include: {
        // Need conceptId + teamId to route the signal write to the right
        // ConceptMastery row AND to feed the teachingReady auto-flip's
        // truth-table filter. Cheaper than a follow-up findUnique on the Lab.
        // `req` isn't in scope here (this is a fire-and-forget callback from
        // the async validator dispatch) — pulling teamId off the Lab row is
        // the only way to keep tenancy correct without re-passing it through
        // the dispatcher.
        lab: { select: { conceptId: true, teamId: true } },
      },
    });

    // Best-effort mastery signal write. Failing here (e.g. concept row
    // vanished, transient DB blip) must NOT prevent the WS event from
    // firing — the client still needs to know the review resolved.
    try {
      await recordLabSignal({
        userId: updated.userId,
        conceptId: updated.lab.conceptId,
        teamId: updated.lab.teamId,
        codeReviewVerdict: result.body.codeReviewVerdict,
        attemptId,
      });
    } catch (signalErr) {
      console.warn(
        `[curriculum:attempt] Failed to record lab signal for ${attemptId}:`,
        signalErr?.message ?? signalErr,
      );
    }

    // WS event to the attempt owner — the polling fallback still works, but
    // this trims the perceived latency to sub-second.
    sendToUser(updated.userId, {
      type: "curriculum:review_ready",
      attemptId,
      reviewStatus: "COMPLETED",
      verdict: result.body.codeReviewVerdict,
    });
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
    const updated = await prisma.labAttempt.update({
      where: { id: attemptId },
      data: {
        reviewStatus: "ERROR",
        reviewedAt: new Date(),
      },
    });
    // No signal write on ERROR — verdict is null and we can't map it to a
    // mastery value. The user retries; a successful retry logs the signal.
    sendToUser(updated.userId, {
      type: "curriculum:review_ready",
      attemptId,
      reviewStatus: "ERROR",
    });
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

  // Team-scope + published check. DRAFT / REVIEWED content is not
  // reference-revealable even if a stale attempt row exists.
  const lab = await prisma.lab.findFirst({
    where: {
      id: labId,
      teamId: req.teamId,
      status: "PUBLISHED",
      concept: { status: "PUBLISHED", topic: { status: "PUBLISHED" } },
    },
    select: { id: true, referenceSolution: true, conceptId: true },
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

  logger.info(
    {
      event: "reveal_reference_verdict",
      userId: req.user.id,
      conceptId: lab.conceptId,
      teamId: req.teamId,
      labId: lab.id,
      gateVerdict: codeReviewVerdict,
      gateNextStep: nextStep,
    },
    "reveal_reference_verdict",
  );

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
    logger.info(
      {
        event: "checkin_gate_blocked",
        userId: req.user.id,
        conceptId: concept.id,
        teamId: req.teamId,
        reason: "no_completed_attempt",
      },
      "checkin_gate_blocked",
    );
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
    logger.info(
      {
        event: "checkin_gate_blocked",
        userId: req.user.id,
        conceptId: concept.id,
        teamId: req.teamId,
        reason: "no_passing_verdict",
      },
      "checkin_gate_blocked",
    );
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

  // Best-effort mastery signal write. `updateMastery` owns its own
  // $transaction so we can't atomically compose with the ConceptCheckIn
  // insert above — if the signal write fails, the check-in is still
  // persisted and the user sees their AI verdict. `calibrationDelta` is
  // preserved on the signal evidence for D10 aggregation.
  try {
    await recordCheckInSignal({
      userId: req.user.id,
      conceptId: concept.id,
      teamId: req.teamId,
      aiVerdict: verdict,
      calibrationDelta,
      checkInId: checkIn.id,
    });
  } catch (signalErr) {
    console.warn(
      `[curriculum:checkin] Failed to record checkin signal for ${checkIn.id}:`,
      signalErr?.message ?? signalErr,
    );
  }

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
      // Lab Phase A — client-side "AI unavailable" badge on the verdict.
      // Distinguishes a real WEAK from a fallback WEAK so the learner knows
      // to retry rather than treat it as authoritative.
      usedFallback: true,
    },
  });

  if (!attempt) {
    return error(res, "Attempt not found", 404, "ATTEMPT_NOT_FOUND");
  }

  return success(res, { attempt });
}

// ============================================================================
// MARK PRIMER READ — engagement signal (W4.T4)
// ============================================================================
//
// POST /curriculum/concepts/:slug/mark-primer-read
//
// Fires a low-weight `primer_read` signal into ConceptMastery so the mentor
// orchestrator knows the user has at least SEEN the primer. Weight 0 in
// SIGNAL_WEIGHTS → does NOT move the score; the mentor uses the presence
// of the signal in INTAKE routing so a re-read isn't required.
//
// Dedup: `recordPrimerReadSignal` skips the write if a primer_read signal
// exists for this (user, concept) within the last 24h. Prevents spam.
// Response is intentionally lightweight — the caller doesn't need the
// updated mastery row.
// ============================================================================

/**
 * POST /curriculum/concepts/:slug/mark-primer-read
 * Team-scoped + PUBLISHED-only. Best-effort signal write — failures are
 * logged and the endpoint still returns 200 (the signal isn't user-critical).
 */
export async function markPrimerRead(req, res) {
  const { slug } = req.params;

  const concept = await prisma.concept.findFirst({
    where: {
      slug,
      teamId: req.teamId,
      status: "PUBLISHED",
      topic: { status: "PUBLISHED" },
    },
    select: { id: true },
  });
  if (!concept) {
    return error(res, "Concept not found", 404, "CONCEPT_NOT_FOUND");
  }

  try {
    await recordPrimerReadSignal({
      userId: req.user.id,
      conceptId: concept.id,
      teamId: req.teamId,
    });
  } catch (err) {
    // Signal write failure is not user-facing — log and continue.
    console.warn(
      `[curriculum:primer-read] failed for user=${req.user.id} concept=${concept.id}:`,
      err?.message ?? err,
    );
  }

  return success(res, { ok: true });
}

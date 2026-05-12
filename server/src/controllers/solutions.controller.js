// ============================================================================
// ProbSolver v3.0 — Solutions Controller (Team-Scoped)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
  initialSM2State,
  calculateSM2,
  confidenceToQuality,
  estimateRetention,
} from "../utils/sm2.js";

// After the existing embedding generation:
import { recomputeSkillsFromSolution } from '../services/skillComputation.service.js'

// ============================================================================
// SUBMIT SOLUTION
// ============================================================================
export async function submitSolution(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { problemId } = req.params;

    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, title: true, version: true },
    });
    if (!problem) return error(res, "Problem not found in your team.", 404);

    const existing = await prisma.solution.findUnique({
      where: { userId_problemId_teamId: { userId, problemId, teamId } },
      select: { id: true },
    });
    if (existing) {
      return error(
        res,
        "You have already submitted a solution. Use the update endpoint.",
        409,
      );
    }

    const {
      approach,
      code,
      language,
      bruteForce,
      optimizedApproach,
      timeComplexity,
      spaceComplexity,
      keyInsight,
      feynmanExplanation,
      realWorldConnection,
      confidence,
      patterns,
      patternIdentificationTime,
      followUpAnswers,
    } = req.body;

    // Confidence must be an explicit 1-5 self-rating. No default coercion:
    // "unset" (null/0/undefined) is a client bug, not a valid submission.
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
      return error(res, "Confidence must be an integer between 1 and 5.", 400);
    }

    // ── SM-2 initial state ─────────────────────────────
    // Canonical SM-2: EF starts at 2.5, first review tomorrow.
    // Submission confidence is stored but does NOT seed EF — the first
    // actual review is what moves the scheduler.
    const sm2 = initialSM2State();

    const solution = await prisma.$transaction(async (tx) => {
      const created = await tx.solution.create({
        data: {
          problemId,
          userId,
          teamId,
          // Freeze the problem version at submission time — lets the client
          // later detect "problem has been updated since you solved it."
          problemVersion: problem.version,
          approach,
          code,
          language,
          bruteForce,
          optimizedApproach,
          timeComplexity,
          spaceComplexity,
          keyInsight,
          feynmanExplanation,
          realWorldConnection,
          confidence,
          patterns,
          patternIdentificationTime,
          categorySpecificData: req.body.categorySpecificData || null,
          // SM-2 initial state
          nextReviewDate: sm2.nextReviewDate,
          sm2EasinessFactor: sm2.easinessFactor,
          sm2Interval: sm2.interval,
          sm2Repetitions: sm2.repetitions,
          reviewCount: 0,
          // reviewDates kept for backward compat — stores history
          reviewDates: [],
        },
        include: {
          problem: { select: { id: true, title: true, category: true } },
          user: { select: { id: true, name: true } },
        },
      });

      if (followUpAnswers?.length > 0) {
        const validQuestionIds = await tx.followUpQuestion.findMany({
          where: {
            id: { in: followUpAnswers.map((a) => a.followUpQuestionId) },
            problemId,
          },
          select: { id: true },
        });
        const validIds = new Set(validQuestionIds.map((q) => q.id));
        const answersToCreate = followUpAnswers
          .filter(
            (a) => a.answerText?.trim() && validIds.has(a.followUpQuestionId),
          )
          .map((a) => ({
            solutionId: created.id,
            followUpQuestionId: a.followUpQuestionId,
            answerText: a.answerText.trim(),
          }));
        if (answersToCreate.length > 0) {
          await tx.solutionFollowUpAnswer.createMany({
            data: answersToCreate,
            skipDuplicates: true,
          });
        }
      }

      // First attempt — always #1 on a fresh Solution. See SolutionAttempt
      // schema comment for the full invariant.
      await tx.solutionAttempt.create({
        data: {
          solutionId: created.id,
          attemptNumber: 1,
          trigger: "SUBMIT",
          approach: created.approach,
          code: created.code,
          language: created.language,
          bruteForce: created.bruteForce,
          optimizedApproach: created.optimizedApproach,
          timeComplexity: created.timeComplexity,
          spaceComplexity: created.spaceComplexity,
          keyInsight: created.keyInsight,
          feynmanExplanation: created.feynmanExplanation,
          realWorldConnection: created.realWorldConnection,
          confidence: created.confidence,
          patterns: created.patterns,
          categorySpecificData: created.categorySpecificData ?? undefined,
          problemVersion: created.problemVersion,
        },
      });

      return created;
    });

    updateStreak(userId).catch(() => {});
    generateSolutionEmbedding(solution.id).catch(() => {});
    recomputeSkillsFromSolution(solution.id).catch(() => {})

    return success(res, { message: "Solution submitted.", solution }, 201);
  } catch (err) {
    console.error("Submit solution error:", err);
    return error(res, "Failed to submit solution.", 500);
  }
}

// ============================================================================
// SUBMIT REVIEW (dedicated endpoint — replaces review logic in updateSolution)
// ============================================================================
// Separated from updateSolution because review is a different operation:
// - Content edits change what you wrote
// - Reviews change your memory state
// These have different validation, different DB fields, and different
// downstream effects (6D report D6 vs embedding regeneration)
export async function submitReview(req, res) {
  try {
    const { solutionId } = req.params;
    const userId = req.user.id;
    const teamId = req.teamId;
    const { confidence, recallText } = req.body;
    // Bounds enforced by submitReviewSchema in solutions.routes.js.
    const trimmedRecall = typeof recallText === "string" ? recallText.trim() : null;

    // Load current SM-2 state from DB — never trust client-sent state
    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId },
      select: {
        id: true,
        sm2EasinessFactor: true,
        sm2Interval: true,
        sm2Repetitions: true,
        reviewCount: true,
        reviewDates: true,
        confidence: true,
        lapseCount: true,
      },
    });

    if (!solution) return error(res, "Solution not found.", 404);

    // Convert 1-5 confidence to SM-2 quality score
    const quality = confidenceToQuality(confidence);
    const isFailure = quality < 3;

    // Run SM-2 algorithm with current state from DB
    const sm2Result = calculateSM2(
      quality,
      solution.sm2EasinessFactor ?? 2.5,
      solution.sm2Interval ?? 1,
      solution.sm2Repetitions ?? 0,
    );

    // Append this review date to history
    const reviewHistory = Array.isArray(solution.reviewDates)
      ? solution.reviewDates
      : [];
    reviewHistory.push(new Date().toISOString());

    const LEECH_THRESHOLD = 8;
    const newLapseCount = (solution.lapseCount ?? 0) + (isFailure ? 1 : 0);
    const isLeech = newLapseCount >= LEECH_THRESHOLD;

    // Persist Solution SM-2 state + ReviewAttempt row atomically so the
    // per-attempt log can never disagree with the rolled-up scheduler state.
    await prisma.$transaction([
      prisma.solution.update({
        where: { id: solutionId },
        data: {
          // SM-2 state — always computed server-side
          sm2EasinessFactor: sm2Result.easinessFactor,
          sm2Interval: sm2Result.interval,
          sm2Repetitions: sm2Result.repetitions,
          nextReviewDate: sm2Result.nextReviewDate,
          // Review tracking
          reviewCount: { increment: 1 },
          lastReviewedAt: new Date(),
          reviewDates: reviewHistory,
          // Cumulative failure count — doesn't reset with sm2Repetitions.
          ...(isFailure ? { lapseCount: { increment: 1 } } : {}),
          // Update confidence to reflect current review rating
          confidence,
        },
      }),
      prisma.reviewAttempt.create({
        data: {
          solutionId,
          recallText: trimmedRecall || null,
          confidence,
          quality,
          recalled: !isFailure,
        },
      }),
    ]);

    return success(res, {
      message: "Review saved.",
      nextReview: {
        date: sm2Result.nextReviewDate,
        intervalDays: sm2Result.interval,
        easinessFactor: sm2Result.easinessFactor,
        repetitions: sm2Result.repetitions,
        // Tell the client whether this was a pass or reset
        // so the UI can show appropriate feedback
        recalled: quality >= 3,
        lapseCount: newLapseCount,
        isLeech,
      },
    });
  } catch (err) {
    console.error("Submit review error:", err);
    return error(res, "Failed to save review.", 500);
  }
}

// ============================================================================
// GET REVIEW QUEUE (server-side filtered — no client-side filtering needed)
// ============================================================================
export async function getReviewQueue(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const now = new Date();

    const [dueReviews, upcoming] = await Promise.all([
      // Due items: sort by most overdue first (oldest nextReviewDate first)
      // Secondary sort: lowest sm2Repetitions first (fragile memories first)
      prisma.solution.findMany({
        where: { userId, teamId, nextReviewDate: { lte: now } },
        include: {
          problem: {
            select: { id: true, title: true, difficulty: true, category: true },
          },
        },
        orderBy: [{ nextReviewDate: "asc" }, { sm2Repetitions: "asc" }],
      }),

      // Upcoming: next 14 days
      prisma.solution.findMany({
        where: {
          userId,
          teamId,
          nextReviewDate: {
            gt: now,
            lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          nextReviewDate: true,
          sm2EasinessFactor: true,
          sm2Interval: true,
          sm2Repetitions: true,
          reviewCount: true,
          confidence: true,
          patterns: true,
          problem: {
            select: { id: true, title: true, difficulty: true, category: true },
          },
        },
        orderBy: { nextReviewDate: "asc" },
        take: 20,
      }),
    ]);

    // Compute overdue days, retention estimate, and leech flag for each due item
    const LEECH_THRESHOLD = 8;
    const enrichedDue = dueReviews.map((s) => {
      const daysSince = Math.max(
        0,
        (now.getTime() - new Date(s.nextReviewDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const retentionEstimate = estimateRetention(
        daysSince,
        s.sm2EasinessFactor ?? 2.5,
        s.sm2Repetitions ?? 0,
      );
      const isLeech = (s.lapseCount ?? 0) >= LEECH_THRESHOLD;

      return {
        ...s,
        overdueDays: Math.floor(daysSince),
        retentionEstimate: Math.round(retentionEstimate * 100),
        isLeech,
      };
    });

    const leechCount = enrichedDue.filter((s) => s.isLeech).length;

    return success(res, {
      due: enrichedDue,
      dueCount: enrichedDue.length,
      leechCount,
      upcoming,
    });
  } catch (err) {
    console.error("Review queue error:", err);
    return error(res, "Failed to fetch review queue.", 500);
  }
}

// ============================================================================
// GET SOLUTIONS FOR A PROBLEM (team-scoped)
// ============================================================================
export async function getProblemSolutions(req, res) {
  try {
    const { problemId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;

    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, title: true },
    });
    if (!problem) return error(res, "Problem not found.", 404);

    const solutions = await prisma.solution.findMany({
      where: { problemId, teamId },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        clarityRatings: { select: { rating: true, raterId: true } },
        followUpAnswers: {
          select: {
            id: true,
            followUpQuestionId: true,
            answerText: true,
            aiScore: true,
            aiFeedback: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = solutions.map((s) => {
      const ratings = s.clarityRatings || [];
      const avgClarity =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
          : null;
      const userRating = ratings.find((r) => r.raterId === userId);
      return {
        ...s,
        clarityRatings: undefined,
        avgClarityRating: avgClarity ? Math.round(avgClarity * 10) / 10 : null,
        totalRatings: ratings.length,
        userClarityRating: userRating?.rating || null,
        isOwn: s.userId === userId,
      };
    });

    return success(res, {
      problem: { id: problem.id, title: problem.title },
      solutions: enriched,
      count: enriched.length,
    });
  } catch (err) {
    console.error("Get problem solutions error:", err);
    return error(res, "Failed to fetch solutions.", 500);
  }
}

// ============================================================================
// GET USER'S SOLUTIONS (within team)
// ============================================================================
export async function getUserSolutions(req, res) {
  try {
    const teamId = req.teamId;
    const targetUserId = req.params.userId || req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [solutions, total] = await Promise.all([
      prisma.solution.findMany({
        where: { userId: targetUserId, teamId },
        include: {
          problem: {
            select: { id: true, title: true, difficulty: true, category: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.solution.count({ where: { userId: targetUserId, teamId } }),
    ]);

    return success(res, {
      solutions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get user solutions error:", err);
    return error(res, "Failed to fetch solutions.", 500);
  }
}

// ============================================================================
// GET RECALL-QUALITY ANALYTICS
// ============================================================================
// Returns three rollups over the user's ReviewAttempt rows in this team:
//   overall: total count, recall rate (fraction with recalled=true),
//            average confidence.
//   trend: weekly buckets for the last 12 weeks so the client can draw a
//          time-series chart of recall rate + avg confidence.
//   byPattern: top 10 patterns the user reviews, each with attempt count,
//              recall rate, avg confidence. Patterns come from the parent
//              Solution.patterns[] column (flattened via unnest).
//
// All aggregation happens server-side in raw SQL — doing it in JS would
// require fetching every ReviewAttempt + Solution, which scales poorly.
// ============================================================================
export async function getRecallAnalytics(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

    const [overallRows, trendRows, patternRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int AS total_attempts,
          COALESCE(AVG(CASE WHEN ra.recalled THEN 1.0 ELSE 0.0 END), 0)::float AS recall_rate,
          COALESCE(AVG(ra.confidence), 0)::float AS avg_confidence
        FROM review_attempts ra
        JOIN solutions s ON ra."solutionId" = s.id
        WHERE s."userId" = ${userId} AND s."teamId" = ${teamId}
      `,
      prisma.$queryRaw`
        SELECT
          date_trunc('week', ra."createdAt")::date AS week_start,
          COUNT(*)::int AS attempts,
          COALESCE(AVG(CASE WHEN ra.recalled THEN 1.0 ELSE 0.0 END), 0)::float AS recall_rate,
          COALESCE(AVG(ra.confidence), 0)::float AS avg_confidence
        FROM review_attempts ra
        JOIN solutions s ON ra."solutionId" = s.id
        WHERE s."userId" = ${userId}
          AND s."teamId" = ${teamId}
          AND ra."createdAt" >= NOW() - INTERVAL '12 weeks'
        GROUP BY week_start
        ORDER BY week_start ASC
      `,
      prisma.$queryRaw`
        SELECT
          pattern,
          COUNT(*)::int AS attempts,
          COALESCE(AVG(CASE WHEN ra.recalled THEN 1.0 ELSE 0.0 END), 0)::float AS recall_rate,
          COALESCE(AVG(ra.confidence), 0)::float AS avg_confidence
        FROM review_attempts ra
        JOIN solutions s ON ra."solutionId" = s.id
        CROSS JOIN LATERAL unnest(s.patterns) AS pattern
        WHERE s."userId" = ${userId} AND s."teamId" = ${teamId}
        GROUP BY pattern
        ORDER BY attempts DESC
        LIMIT 10
      `,
    ]);

    const overall = overallRows[0] || {
      total_attempts: 0,
      recall_rate: 0,
      avg_confidence: 0,
    };

    return success(res, {
      overall: {
        totalAttempts: overall.total_attempts,
        recallRate: overall.recall_rate,
        avgConfidence: overall.avg_confidence,
      },
      trend: trendRows.map((r) => ({
        weekStart: r.week_start,
        attempts: r.attempts,
        recallRate: r.recall_rate,
        avgConfidence: r.avg_confidence,
      })),
      byPattern: patternRows.map((r) => ({
        pattern: r.pattern,
        attempts: r.attempts,
        recallRate: r.recall_rate,
        avgConfidence: r.avg_confidence,
      })),
    });
  } catch (err) {
    console.error("Recall analytics error:", err);
    return error(res, "Failed to fetch recall analytics.", 500);
  }
}

// ============================================================================
// GET SOLUTION ATTEMPTS (history)
// ============================================================================
// Returns every SolutionAttempt row for a solution, newest first.
// Auth: the solution's author OR a team admin in the same team can read.
//
// Response includes full content snapshots, AI feedback snapshots, and
// metadata (trigger, attemptNumber, problemVersion, createdAt) so the
// client can render a timeline and diff any two attempts without a
// follow-up round trip.
export async function getSolutionAttempts(req, res) {
  try {
    const { solutionId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;

    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, teamId },
      select: {
        id: true,
        userId: true,
        problemId: true,
        problem: {
          select: { id: true, title: true, category: true, difficulty: true, version: true },
        },
      },
    });
    if (!solution) return error(res, "Solution not found.", 404);

    const isAuthor = solution.userId === userId;
    const isAdmin =
      req.user.globalRole === "SUPER_ADMIN" ||
      req.user.teamRole === "TEAM_ADMIN";
    if (!isAuthor && !isAdmin) {
      return error(res, "Not authorized to view this history.", 403);
    }

    const attempts = await prisma.solutionAttempt.findMany({
      where: { solutionId },
      orderBy: { attemptNumber: "desc" },
    });

    return success(res, {
      solution,
      attempts,
      attemptCount: attempts.length,
    });
  } catch (err) {
    console.error("Get solution attempts error:", err);
    return error(res, "Failed to fetch attempts.", 500);
  }
}

// ============================================================================
// UPDATE SOLUTION (content edits only — no review logic here)
// ============================================================================
export async function updateSolution(req, res) {
  try {
    const { solutionId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;

    const existing = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId },
      select: { id: true, problemId: true },
    });
    if (!existing) return error(res, "Solution not found.", 404);

    const { followUpAnswers, ...restBody } = req.body;
    const data = {};

    const contentFields = [
      "approach",
      "code",
      "language",
      "bruteForce",
      "optimizedApproach",
      "timeComplexity",
      "spaceComplexity",
      "keyInsight",
      "feynmanExplanation",
      "realWorldConnection",
      "confidence",
      "patterns",
      "patternIdentificationTime",
      "categorySpecificData",
    ];
    contentFields.forEach((field) => {
      if (restBody[field] !== undefined) data[field] = restBody[field];
    });

    // SM-2 EF is intentionally NOT touched here. EF only updates on an actual
    // scheduled review via submitReview(), when recall is observed. A content
    // edit — even one that changes self-rated confidence — is not a recall
    // event, so letting it move EF would corrupt the scheduler.

    await prisma.$transaction(async (tx) => {
      await tx.solution.update({ where: { id: solutionId }, data });

      if (followUpAnswers?.length > 0) {
        const validQuestionIds = await tx.followUpQuestion.findMany({
          where: {
            id: { in: followUpAnswers.map((a) => a.followUpQuestionId) },
            problemId: existing.problemId,
          },
          select: { id: true },
        });
        const validIds = new Set(validQuestionIds.map((q) => q.id));
        for (const answer of followUpAnswers) {
          if (
            !answer.answerText?.trim() ||
            !validIds.has(answer.followUpQuestionId)
          )
            continue;
          await tx.solutionFollowUpAnswer.upsert({
            where: {
              solutionId_followUpQuestionId: {
                solutionId,
                followUpQuestionId: answer.followUpQuestionId,
              },
            },
            create: {
              solutionId,
              followUpQuestionId: answer.followUpQuestionId,
              answerText: answer.answerText.trim(),
            },
            update: {
              answerText: answer.answerText.trim(),
              aiScore: null,
              aiFeedback: null,
            },
          });
        }
      }

      // Append a new SolutionAttempt snapshot with the post-update state.
      // Use the freshly-read solution so every content column reflects
      // what's actually in the DB, not a reconstruction from req.body.
      const fresh = await tx.solution.findUnique({
        where: { id: solutionId },
        select: {
          approach: true,
          code: true,
          language: true,
          bruteForce: true,
          optimizedApproach: true,
          timeComplexity: true,
          spaceComplexity: true,
          keyInsight: true,
          feynmanExplanation: true,
          realWorldConnection: true,
          confidence: true,
          patterns: true,
          categorySpecificData: true,
          problemVersion: true,
        },
      });
      const lastAttempt = await tx.solutionAttempt.findFirst({
        where: { solutionId },
        orderBy: { attemptNumber: "desc" },
        select: { attemptNumber: true },
      });
      await tx.solutionAttempt.create({
        data: {
          solutionId,
          attemptNumber: (lastAttempt?.attemptNumber ?? 0) + 1,
          trigger: "EDIT",
          approach: fresh.approach,
          code: fresh.code,
          language: fresh.language,
          bruteForce: fresh.bruteForce,
          optimizedApproach: fresh.optimizedApproach,
          timeComplexity: fresh.timeComplexity,
          spaceComplexity: fresh.spaceComplexity,
          keyInsight: fresh.keyInsight,
          feynmanExplanation: fresh.feynmanExplanation,
          realWorldConnection: fresh.realWorldConnection,
          confidence: fresh.confidence,
          patterns: fresh.patterns,
          categorySpecificData: fresh.categorySpecificData ?? undefined,
          problemVersion: fresh.problemVersion,
        },
      });
    });

    const solution = await prisma.solution.findUnique({
      where: { id: solutionId },
      include: {
        problem: { select: { id: true, title: true } },
        followUpAnswers: true,
      },
    });

    if (data.approach || data.code || data.keyInsight) {
      generateSolutionEmbedding(solutionId).catch(() => {});
      recomputeSkillsFromSolution(solutionId).catch(() => {}) 
    }

    return success(res, { message: "Solution updated.", solution });
  } catch (err) {
    console.error("Update solution error:", err);
    return error(res, "Failed to update solution.", 500);
  }
}

// ============================================================================
// RATE SOLUTION CLARITY
// ============================================================================
export async function rateSolutionClarity(req, res) {
  try {
    const { solutionId } = req.params;
    const { rating } = req.body;
    const teamId = req.teamId;
    const raterId = req.user.id;

    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, teamId },
      select: { id: true, userId: true },
    });
    if (!solution) return error(res, "Solution not found.", 404);
    if (solution.userId === raterId)
      return error(res, "You cannot rate your own solution.", 400);

    const clarityRating = await prisma.clarityRating.upsert({
      where: { raterId_solutionId: { raterId, solutionId } },
      create: { solutionId, raterId, teamId, rating },
      update: { rating },
    });

    return success(res, { message: "Rating saved.", rating: clarityRating });
  } catch (err) {
    console.error("Rate clarity error:", err);
    return error(res, "Failed to save rating.", 500);
  }
}

// ============================================================================
// HELPERS
// ============================================================================
async function updateStreak(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSolvedAt: true, streak: true },
  });
  if (!user) return;

  // Streak counts distinct calendar days with a submission — not hours
  // and not submissions. Same-day extra submissions don't bump the streak;
  // a gap of 2+ days resets to 1.
  const now = new Date();
  const lastSolved = user.lastSolvedAt;
  let newStreak = 1;

  if (lastSolved) {
    const startOfDay = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const dayDelta = Math.round(
      (startOfDay(now) - startOfDay(lastSolved)) / (24 * 60 * 60 * 1000),
    );
    if (dayDelta === 0) newStreak = user.streak || 1;
    else if (dayDelta === 1) newStreak = (user.streak || 0) + 1;
    // dayDelta >= 2 → gap, reset to 1 (already default)
  }

  await prisma.user.update({
    where: { id: userId },
    data: { streak: newStreak, lastSolvedAt: now },
  });
}

async function generateSolutionEmbedding(solutionId) {
  try {
    const { AI_ENABLED } = await import("../config/env.js");
    if (!AI_ENABLED) return;
    const solution = await prisma.solution.findUnique({
      where: { id: solutionId },
      select: {
        approach: true,
        code: true,
        keyInsight: true,
        patterns: true,
        problem: { select: { title: true } },
      },
    });
    if (!solution) return;
    const text = [
      solution.problem?.title || "",
      solution.approach || "",
      solution.keyInsight || "",
      (solution.patterns ?? []).join(" "),
      solution.code ? solution.code.substring(0, 500) : "",
    ].join(" ");
    const { generateEmbedding } =
      await import("../services/embedding.service.js");
    const embedding = await generateEmbedding(text);
    if (embedding) {
      const vectorStr = `[${embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE solutions SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        solutionId,
      );
    }
  } catch (err) {
    console.error("Solution embedding error:", err.message);
  }
}

// ============================================================================
// ProbSolver v3.0 — Solutions Controller (Team-Scoped)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
  initialSM2State,
  calculateSM2,
  confidenceToQuality,
} from "../utils/sm2.js";

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
      select: { id: true, title: true },
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
      pattern,
      patternIdentificationTime,
      followUpAnswers,
    } = req.body;

    const submissionConfidence = confidence || 3;

    // ── SM-2 initial state ─────────────────────────────
    // Initial EF is seeded from submission confidence.
    // First review is always tomorrow — we need to observe recall
    // before trusting the initial confidence self-assessment.
    const sm2 = initialSM2State(submissionConfidence);

    const solution = await prisma.$transaction(async (tx) => {
      const created = await tx.solution.create({
        data: {
          problemId,
          userId,
          teamId,
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
          confidence: submissionConfidence,
          pattern,
          patternIdentificationTime,
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

      return created;
    });

    updateStreak(userId).catch(() => {});
    generateSolutionEmbedding(solution.id).catch(() => {});

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
    const { confidence } = req.body;

    if (!confidence || confidence < 1 || confidence > 5) {
      return error(res, "Confidence must be between 1 and 5.", 400);
    }

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
      },
    });

    if (!solution) return error(res, "Solution not found.", 404);

    // Convert 1-5 confidence to SM-2 quality score
    const quality = confidenceToQuality(confidence);

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

    await prisma.solution.update({
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
        // Update confidence to reflect current review rating
        confidence,
      },
    });

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
          pattern: true,
          problem: {
            select: { id: true, title: true, difficulty: true, category: true },
          },
        },
        orderBy: { nextReviewDate: "asc" },
        take: 20,
      }),
    ]);

    // Compute overdue days and retention estimate for each due item
    const enrichedDue = dueReviews.map((s) => {
      const daysSince = Math.max(
        0,
        (now.getTime() - new Date(s.nextReviewDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      // Import inline to avoid circular deps at module level
      const ef = s.sm2EasinessFactor ?? 2.5;
      const reps = s.sm2Repetitions ?? 0;
      const stability = Math.max(1, ef * Math.pow(reps + 1, 0.7));
      const retentionEstimate = Math.exp(-daysSince / (stability * 10));

      return {
        ...s,
        overdueDays: Math.floor(daysSince),
        retentionEstimate: Math.round(retentionEstimate * 100),
      };
    });

    return success(res, {
      due: enrichedDue,
      dueCount: enrichedDue.length,
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
      "pattern",
      "patternIdentificationTime",
    ];
    contentFields.forEach((field) => {
      if (restBody[field] !== undefined) data[field] = restBody[field];
    });

    // If confidence changed on a content edit, update EF proportionally
    // This handles the case where someone rewrites their solution and
    // their confidence changes significantly
    if (restBody.confidence !== undefined) {
      const current = await prisma.solution.findUnique({
        where: { id: solutionId },
        select: { confidence: true, sm2EasinessFactor: true },
      });
      if (current && current.confidence !== restBody.confidence) {
        const confDelta = (restBody.confidence - current.confidence) * 0.1;
        const newEF = Math.max(
          1.3,
          Math.min(3.0, (current.sm2EasinessFactor ?? 2.5) + confDelta),
        );
        data.sm2EasinessFactor = Math.round(newEF * 100) / 100;
      }
    }

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
  const now = new Date();
  const lastSolved = user.lastSolvedAt;
  let newStreak = user.streak;
  if (!lastSolved) {
    newStreak = 1;
  } else {
    const diffHours = (now - lastSolved) / (1000 * 60 * 60);
    newStreak = diffHours < 48 ? user.streak + 1 : 1;
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
        pattern: true,
        problem: { select: { title: true } },
      },
    });
    if (!solution) return;
    const text = [
      solution.problem?.title || "",
      solution.approach || "",
      solution.keyInsight || "",
      solution.pattern || "",
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

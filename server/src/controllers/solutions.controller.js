// ============================================================================
// ProbSolver v3.0 — Solutions Controller (Team-Scoped)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// ============================================================================
// SUBMIT SOLUTION
// ============================================================================
export async function submitSolution(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { problemId } = req.params;

    // ── Verify problem belongs to this team ────────────
    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: { id: true, title: true },
    });
    if (!problem) {
      return error(res, "Problem not found in your team.", 404);
    }

    // ── Check for existing solution ────────────────────
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
      followUpAnswers, // Array of { followUpQuestionId, answerText }
    } = req.body;

    // ── Calculate spaced repetition dates ──────────────
    const now = new Date();
    const reviewDays = [1, 3, 7, 14, 30];
    const reviewDates = reviewDays.map((d) => {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      return date.toISOString();
    });

    // ── Create solution + follow-up answers atomically ─
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
          confidence: confidence || 3,
          pattern,
          patternIdentificationTime,
          reviewDates,
          nextReviewDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
        include: {
          problem: { select: { id: true, title: true, category: true } },
          user: { select: { id: true, name: true } },
        },
      });

      // Save follow-up answers if provided
      if (followUpAnswers?.length > 0) {
        // Verify all referenced follow-up questions belong to this problem
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

    // ── Update user streak (fire-and-forget) ──────────
    updateStreak(userId).catch(() => {});

    // ── Generate embedding in background ──────────────
    generateSolutionEmbedding(solution.id).catch(() => {});

    return success(res, { message: "Solution submitted.", solution }, 201);
  } catch (err) {
    console.error("Submit solution error:", err);
    return error(res, "Failed to submit solution.", 500);
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
    if (!problem) {
      return error(res, "Problem not found.", 404);
    }

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
// UPDATE SOLUTION
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
    if (!existing) {
      return error(res, "Solution not found.", 404);
    }

    const {
      followUpAnswers, // Optional: update follow-up answers too
      ...restBody
    } = req.body;

    const data = {};
    const fields = [
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
    fields.forEach((field) => {
      if (restBody[field] !== undefined) data[field] = restBody[field];
    });

    await prisma.$transaction(async (tx) => {
      await tx.solution.update({
        where: { id: solutionId },
        data,
      });

      // Update follow-up answers if provided
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
              // Reset AI scores when answer is updated — needs re-review
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

    // Re-generate embedding if content changed
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
// RATE SOLUTION CLARITY (team members rate each other)
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
    if (!solution) {
      return error(res, "Solution not found.", 404);
    }
    if (solution.userId === raterId) {
      return error(res, "You cannot rate your own solution.", 400);
    }

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
// REVIEW QUEUE (spaced repetition — team-scoped)
// ============================================================================
export async function getReviewQueue(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const now = new Date();

    const dueReviews = await prisma.solution.findMany({
      where: { userId, teamId, nextReviewDate: { lte: now } },
      include: {
        problem: {
          select: { id: true, title: true, difficulty: true, category: true },
        },
      },
      orderBy: { nextReviewDate: "asc" },
    });

    const upcoming = await prisma.solution.findMany({
      where: { userId, teamId, nextReviewDate: { gt: now } },
      select: {
        id: true,
        nextReviewDate: true,
        problem: { select: { id: true, title: true, difficulty: true } },
      },
      orderBy: { nextReviewDate: "asc" },
      take: 10,
    });

    return success(res, {
      due: dueReviews,
      dueCount: dueReviews.length,
      upcoming,
    });
  } catch (err) {
    console.error("Review queue error:", err);
    return error(res, "Failed to fetch review queue.", 500);
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

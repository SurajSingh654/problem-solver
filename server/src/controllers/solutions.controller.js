import prisma from "../lib/prisma.js";
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  forbiddenResponse,
  errorResponse,
} from "../utils/response.js";
import { embedSolution } from "../services/embedding.service.js";

// ── Helpers ────────────────────────────────────────────

function parseSolution(s) {
  return {
    ...s,
    followUpAnswers: JSON.parse(s.followUpAnswers || "[]"),
    reviewDates: JSON.parse(s.reviewDates || "[]"),
  };
}

// ── GET /api/solutions  (my solutions) ────────────────
export async function getMySolutions(req, res) {
  const solutions = await prisma.solution.findMany({
    where: { userId: req.user.id },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          source: true,
          tags: true,
        },
      },
    },
    orderBy: { solvedAt: "desc" },
  });

  return successResponse(
    res,
    solutions.map((s) => ({
      ...parseSolution(s),
      problem: {
        ...s.problem,
        tags: JSON.parse(s.problem.tags || "[]"),
      },
    })),
  );
}

// ── GET /api/solutions/problem/:problemId ─────────────
export async function getSolutionsForProblem(req, res) {
  const { problemId } = req.params;

  const solutions = await prisma.solution.findMany({
    where: { problemId },
    include: {
      user: {
        select: {
          username: true,
          avatarColor: true,
          currentLevel: true,
        },
      },
      clarityRatings: {
        include: {
          fromUser: { select: { username: true, avatarColor: true } },
        },
      },
    },
    orderBy: { solvedAt: "desc" },
  });

  return successResponse(res, solutions.map(parseSolution));
}

// ── POST /api/solutions ────────────────────────────────
export async function createSolution(req, res) {
  const userId = req.user.id;
  const {
    problemId,
    patternIdentified,
    firstInstinct,
    whyThisPattern,
    timeToPatternSecs,
    bruteForceApproach,
    bruteForceTime,
    bruteForceSpace,
    optimizedApproach,
    optimizedTime,
    optimizedSpace,
    predictedTime,
    predictedSpace,
    code,
    language,
    keyInsight,
    feynmanExplanation,
    realWorldConnection,
    followUpAnswers,
    confidenceLevel,
    difficultyFelt,
    stuckPoints,
    hintsUsed,
    isInterviewMode,
    timeLimitSecs,
    timeUsedSecs,
  } = req.body;

  // Check problem exists
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
  });
  if (!problem) return notFoundResponse(res, "Problem");

  // Check for existing solution
  const existing = await prisma.solution.findUnique({
    where: { problemId_userId: { problemId, userId } },
  });
  if (existing) {
    return errorResponse(
      res,
      "You already have a solution for this problem. Use PUT to update it.",
      409,
      "ALREADY_EXISTS",
    );
  }

  // Calculate review dates using spaced repetition intervals
  const intervals = [1, 3, 7, 14, 30];
  const today = new Date();
  const reviewDates = intervals.map((days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  });

  const solution = await prisma.solution.create({
    data: {
      problemId,
      userId,
      patternIdentified: patternIdentified || null,
      firstInstinct: firstInstinct || null,
      whyThisPattern: whyThisPattern || null,
      timeToPatternSecs: timeToPatternSecs || null,
      bruteForceApproach: bruteForceApproach || null,
      bruteForceTime: bruteForceTime || null,
      bruteForceSpace: bruteForceSpace || null,
      optimizedApproach: optimizedApproach || null,
      optimizedTime: optimizedTime || null,
      optimizedSpace: optimizedSpace || null,
      predictedTime: predictedTime || null,
      predictedSpace: predictedSpace || null,
      code: code || null,
      language: language || "PYTHON",
      keyInsight: keyInsight || null,
      feynmanExplanation: feynmanExplanation || null,
      realWorldConnection: realWorldConnection || null,
      followUpAnswers: JSON.stringify(followUpAnswers || []),
      confidenceLevel: confidenceLevel || 0,
      difficultyFelt: difficultyFelt || null,
      stuckPoints: stuckPoints || null,
      hintsUsed: hintsUsed || false,
      isInterviewMode: isInterviewMode || false,
      timeLimitSecs: timeLimitSecs || null,
      timeUsedSecs: timeUsedSecs || null,
      reviewDates: JSON.stringify(reviewDates),
    },
    include: {
      user: { select: { username: true, avatarColor: true } },
      problem: { select: { title: true, difficulty: true } },
    },
  });

  // Update user streak
  await updateStreak(userId);

  // Generate embedding in background (don't block response)
  embedSolution(solution.id).catch((err) =>
    console.error("[Embedding] Background embed failed:", err.message),
  );

  return createdResponse(
    res,
    parseSolution(solution),
    "Solution saved successfully",
  );
}

// ── PUT /api/solutions/:id ─────────────────────────────
export async function updateSolution(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.solution.findUnique({ where: { id } });
  if (!existing) return notFoundResponse(res, "Solution");
  if (existing.userId !== userId)
    return forbiddenResponse(res, "You can only edit your own solutions");

  const {
    patternIdentified,
    firstInstinct,
    whyThisPattern,
    timeToPatternSecs,
    bruteForceApproach,
    bruteForceTime,
    bruteForceSpace,
    optimizedApproach,
    optimizedTime,
    optimizedSpace,
    predictedTime,
    predictedSpace,
    code,
    language,
    keyInsight,
    feynmanExplanation,
    realWorldConnection,
    followUpAnswers,
    confidenceLevel,
    difficultyFelt,
    stuckPoints,
    hintsUsed,
  } = req.body;

  const updated = await prisma.solution.update({
    where: { id },
    data: {
      ...(patternIdentified !== undefined && { patternIdentified }),
      ...(firstInstinct !== undefined && { firstInstinct }),
      ...(whyThisPattern !== undefined && { whyThisPattern }),
      ...(timeToPatternSecs !== undefined && { timeToPatternSecs }),
      ...(bruteForceApproach !== undefined && { bruteForceApproach }),
      ...(bruteForceTime !== undefined && { bruteForceTime }),
      ...(bruteForceSpace !== undefined && { bruteForceSpace }),
      ...(optimizedApproach !== undefined && { optimizedApproach }),
      ...(optimizedTime !== undefined && { optimizedTime }),
      ...(optimizedSpace !== undefined && { optimizedSpace }),
      ...(predictedTime !== undefined && { predictedTime }),
      ...(predictedSpace !== undefined && { predictedSpace }),
      ...(code !== undefined && { code }),
      ...(language !== undefined && { language }),
      ...(keyInsight !== undefined && { keyInsight }),
      ...(feynmanExplanation !== undefined && { feynmanExplanation }),
      ...(realWorldConnection !== undefined && { realWorldConnection }),
      ...(confidenceLevel !== undefined && { confidenceLevel }),
      ...(difficultyFelt !== undefined && { difficultyFelt }),
      ...(stuckPoints !== undefined && { stuckPoints }),
      ...(hintsUsed !== undefined && { hintsUsed }),
      ...(followUpAnswers !== undefined && {
        followUpAnswers: JSON.stringify(followUpAnswers),
      }),
    },
    include: {
      user: { select: { username: true, avatarColor: true } },
      problem: { select: { title: true, difficulty: true } },
    },
  });

  embedSolution(updated.id).catch(err =>
  console.error('[Embedding] Background embed failed:', err.message)
)

  return successResponse(res, parseSolution(updated), "Solution updated");
}

// ── DELETE /api/solutions/:id ──────────────────────────
export async function deleteSolution(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const existing = await prisma.solution.findUnique({ where: { id } });
  if (!existing) return notFoundResponse(res, "Solution");
  if (existing.userId !== userId && req.user.role !== "ADMIN") {
    return forbiddenResponse(res, "You can only delete your own solutions");
  }

  await prisma.solution.delete({ where: { id } });

  return successResponse(res, { id }, "Solution deleted");
}

// ── POST /api/solutions/:id/clarity ───────────────────
export async function rateSolutionClarity(req, res) {
  const { id } = req.params;
  const fromUserId = req.user.id;
  const { score, comment } = req.body;

  const solution = await prisma.solution.findUnique({ where: { id } });
  if (!solution) return notFoundResponse(res, "Solution");

  // Can't rate your own solution
  if (solution.userId === fromUserId) {
    return errorResponse(res, "You can't rate your own solution", 400);
  }

  const rating = await prisma.clarityRating.upsert({
    where: { solutionId_fromUserId: { solutionId: id, fromUserId } },
    update: { score, comment: comment || null },
    create: { solutionId: id, fromUserId, score, comment: comment || null },
  });

  return successResponse(res, rating, "Rating saved");
}

// ── Streak helper ──────────────────────────────────────
async function updateStreak(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;

  let streak = user.streak;

  if (lastActive) {
    const last = new Date(lastActive);
    last.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - last) / 86400000);
    if (diffDays === 0) {
      // same day — no change
    } else if (diffDays === 1) {
      streak++;
    } else {
      streak = 1;
    }
  } else {
    streak = 1;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      streak,
      longestStreak: Math.max(user.longestStreak, streak),
      lastActiveDate: new Date(),
    },
  });
}

// ── POST /api/solutions/:id/review ────────────────────
// Called when user completes a review — updates confidence
// and advances the spaced repetition schedule
export async function reviewSolution(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { confidenceLevel } = req.body;

  const solution = await prisma.solution.findUnique({ where: { id } });
  if (!solution) return notFoundResponse(res, "Solution");
  if (solution.userId !== userId)
    return forbiddenResponse(res, "Not your solution");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Remove all due/overdue dates, keep future ones
  const existing = JSON.parse(solution.reviewDates || "[]");
  const future = existing.filter((d) => {
    const rd = new Date(d);
    rd.setHours(0, 0, 0, 0);
    return rd > today;
  });

  // Add next review date based on confidence
  // Low confidence → review sooner, high confidence → review later
  const intervalMap = { 1: 1, 2: 2, 3: 5, 4: 10, 5: 21 };
  const days = intervalMap[confidenceLevel] || 3;
  const next = new Date(today);
  next.setDate(next.getDate() + days);

  // Only add if we don't already have a review that close
  const alreadyScheduled = future.some((d) => {
    const fd = new Date(d);
    fd.setHours(0, 0, 0, 0);
    return Math.abs((fd - next) / 86400000) < 2;
  });

  const newDates = alreadyScheduled
    ? future
    : [...future, next.toISOString()].sort();

  const updated = await prisma.solution.update({
    where: { id },
    data: {
      confidenceLevel,
      reviewDates: JSON.stringify(newDates),
    },
    include: {
      problem: {
        select: { id: true, title: true, difficulty: true, tags: true },
      },
    },
  });

  return successResponse(
    res,
    {
      ...parseSolution(updated),
      problem: {
        ...updated.problem,
        tags: JSON.parse(updated.problem.tags || "[]"),
      },
    },
    "Review saved",
  );
}

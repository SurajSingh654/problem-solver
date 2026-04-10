import prisma from "../lib/prisma.js";
import { successResponse } from "../utils/response.js";

// ── GET /api/stats/me ──────────────────────────────────
export async function getMyStats(req, res) {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      solutions: {
        include: {
          problem: { select: { difficulty: true, tags: true } },
          clarityRatings: true,
        },
      },
      simSessions: true,
    },
  });

  const solutions = user.solutions;

  // ── Difficulty breakdown ───────────────────────────
  const easy = solutions.filter((s) => s.problem.difficulty === "EASY").length;
  const medium = solutions.filter(
    (s) => s.problem.difficulty === "MEDIUM",
  ).length;
  const hard = solutions.filter((s) => s.problem.difficulty === "HARD").length;

  // ── Pattern map ────────────────────────────────────
  const patternMap = {};
  solutions.forEach((s) => {
    if (s.patternIdentified) {
      patternMap[s.patternIdentified] =
        (patternMap[s.patternIdentified] || 0) + 1;
    }
  });

  // ── Reviews ────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reviewsDue = solutions.filter((s) => {
    const dates = JSON.parse(s.reviewDates || "[]");
    return dates.some((d) => {
      const rd = new Date(d);
      rd.setHours(0, 0, 0, 0);
      return rd <= today;
    });
  }).length;

  // Solutions that have had at least one review
  // (reviewDates shorter than initial 5 means some were consumed)
  const reviewedSolutions = solutions.filter((s) => {
    const dates = JSON.parse(s.reviewDates || "[]");
    return dates.length < 5;
  });

  // ── Confidence ─────────────────────────────────────
  const avgConfidence = solutions.length
    ? solutions.reduce((sum, s) => sum + s.confidenceLevel, 0) /
      solutions.length
    : 0;

  const confidenceBreakdown = [1, 2, 3, 4, 5].map((level) => ({
    level,
    count: solutions.filter((s) => s.confidenceLevel === level).length,
  }));

  // ── Time metrics ───────────────────────────────────
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const solvedThisWeek = solutions.filter(
    (s) => new Date(s.solvedAt) >= weekAgo,
  ).length;

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const solvedThisMonth = solutions.filter(
    (s) => new Date(s.solvedAt) >= monthAgo,
  ).length;

  // ── Activity heatmap (90 days) ─────────────────────
  const activity = {};
  const ninetyAgo = new Date();
  ninetyAgo.setDate(ninetyAgo.getDate() - 90);
  solutions
    .filter((s) => new Date(s.solvedAt) >= ninetyAgo)
    .forEach((s) => {
      const day = new Date(s.solvedAt).toISOString().split("T")[0];
      activity[day] = (activity[day] || 0) + 1;
    });

  // ── Language breakdown ─────────────────────────────
  const languageMap = {};
  solutions.forEach((s) => {
    if (s.language) {
      languageMap[s.language] = (languageMap[s.language] || 0) + 1;
    }
  });

  // ── Sim stats ──────────────────────────────────────
  const completedSims = user.simSessions.filter((s) => s.completed);
  const avgSimScore = completedSims.length
    ? completedSims.reduce((sum, s) => sum + (s.overallScore || 0), 0) /
      completedSims.length
    : 0;
  const avgSimApproach = completedSims.length
    ? completedSims.reduce((sum, s) => sum + (s.approachScore || 0), 0) /
      completedSims.length
    : 0;
  const avgSimComms = completedSims.length
    ? completedSims.reduce((sum, s) => sum + (s.communicationScore || 0), 0) /
      completedSims.length
    : 0;
  const hintUsedCount = user.simSessions.filter((s) => s.hintUsed).length;

  // ── Peer clarity ratings ───────────────────────────
  const allRatings = solutions.flatMap((s) => s.clarityRatings);
  const avgClarity = allRatings.length
    ? allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length
    : 0;

  // ── Depth signals ──────────────────────────────────
  const withKeyInsight = solutions.filter((s) => s.keyInsight).length;
  const withFeynman = solutions.filter((s) => s.feynmanExplanation).length;
  const withRealWorld = solutions.filter((s) => s.realWorldConnection).length;
  const withBruteForce = solutions.filter((s) => s.bruteForceApproach).length;
  const withOptimized = solutions.filter((s) => s.optimizedApproach).length;
  const withPattern = solutions.filter((s) => s.patternIdentified).length;
  const withBothComplexity = solutions.filter(
    (s) => s.optimizedTime && s.optimizedSpace,
  ).length;
  const hintsUsedCount = solutions.filter((s) => s.hintsUsed).length;

  // ── 6D Intelligence scores (0–100) ─────────────────
  const total = solutions.length || 1; // avoid division by zero

  // 1. Pattern Recognition — did you identify patterns?
  //    + how fast (timeToPatternSecs)
  const patternScore = (() => {
    const identifiedRate = (withPattern / total) * 60;
    const diversityRate = Math.min(
      (Object.keys(patternMap).length / 16) * 40,
      40,
    );
    return Math.min(Math.round(identifiedRate + diversityRate), 100);
  })();

  // 2. Solution Depth — quality of write-ups
  const depthScore = (() => {
    const insightRate = (withKeyInsight / total) * 30;
    const feynmanRate = (withFeynman / total) * 30;
    const realRate = (withRealWorld / total) * 20;
    const confBonus = (avgConfidence / 5) * 20;
    return Math.min(
      Math.round(insightRate + feynmanRate + realRate + confBonus),
      100,
    );
  })();

  // 3. Communication — peer clarity ratings
  const commScore = (() => {
    if (!allRatings.length) return 0;
    return Math.min(Math.round((avgClarity / 5) * 100), 100);
  })();

  // 4. Optimization — brute → optimal progression
  const optimScore = (() => {
    const bruteRate = (withBruteForce / total) * 25;
    const optRate = (withOptimized / total) * 40;
    const complexRate = (withBothComplexity / total) * 35;
    return Math.min(Math.round(bruteRate + optRate + complexRate), 100);
  })();

  // 5. Pressure Performance — sim sessions
  const pressureScore = (() => {
    if (!completedSims.length) return 0;
    const simRate = Math.min((completedSims.length / 5) * 40, 40);
    const scoreRate = (avgSimScore / 5) * 40;
    const noHintBonus = completedSims.length
      ? ((completedSims.length - hintUsedCount) / completedSims.length) * 20
      : 0;
    return Math.min(Math.round(simRate + scoreRate + noHintBonus), 100);
  })();

  // 6. Retention — spaced repetition health
  const retentionScore = (() => {
    if (!solutions.length) return 0;
    const reviewedRate = (reviewedSolutions.length / total) * 50;
    const confRate = (avgConfidence / 5) * 50;
    return Math.min(Math.round(reviewedRate + confRate), 100);
  })();

  const dimensions = {
    patternRecognition: patternScore,
    solutionDepth: depthScore,
    communication: commScore,
    optimization: optimScore,
    pressurePerformance: pressureScore,
    retention: retentionScore,
  };

  const overallScore = Math.round(
    Object.values(dimensions).reduce((a, b) => a + b, 0) /
      Object.values(dimensions).length,
  );

  return successResponse(res, {
    // Core
    totalSolved: solutions.length,
    easy,
    medium,
    hard,
    streak: user.streak,
    longestStreak: user.longestStreak,
    reviewsDue,
    avgConfidence: Math.round(avgConfidence * 10) / 10,
    solvedThisWeek,
    solvedThisMonth,
    patternsCount: Object.keys(patternMap).length,
    patternMap,
    activity,
    // Extended
    languageMap,
    confidenceBreakdown,
    withKeyInsight,
    withFeynman,
    withRealWorld,
    withBruteForce,
    withOptimized,
    withPattern,
    hintsUsedCount,
    // Sim
    simCount: user.simSessions.length,
    completedSims: completedSims.length,
    avgSimScore: Math.round(avgSimScore * 10) / 10,
    avgSimApproach: Math.round(avgSimApproach * 10) / 10,
    avgSimComms: Math.round(avgSimComms * 10) / 10,
    // Peer
    avgClarity: Math.round(avgClarity * 10) / 10,
    clarityCount: allRatings.length,
    // 6D
    dimensions,
    overallScore,
    // User goals
    targetDate: user.targetDate,
    targetCompanies: JSON.parse(user.targetCompanies || "[]"),
    currentLevel: user.currentLevel,
  });
}

// ── GET /api/stats/team ────────────────────────────────
export async function getTeamStats(req, res) {
  // Total members
  const totalMembers = await prisma.user.count();

  // Total solutions
  const totalSolutions = await prisma.solution.count();

  // All solutions for breakdown
  const allSolutions = await prisma.solution.findMany({
    include: {
      problem: { select: { difficulty: true } },
      user: { select: { username: true, avatarColor: true } },
    },
    orderBy: { solvedAt: "desc" },
    take: 20, // recent activity feed
  });

  const easy = allSolutions.filter(
    (s) => s.problem.difficulty === "EASY",
  ).length;
  const medium = allSolutions.filter(
    (s) => s.problem.difficulty === "MEDIUM",
  ).length;
  const hard = allSolutions.filter(
    (s) => s.problem.difficulty === "HARD",
  ).length;

  // Problems added
  const totalProblems = await prisma.problem.count({
    where: { isActive: true },
  });

  // Unsolved problems (problems with 0 solutions from current user)
  const userSolutions = await prisma.solution.findMany({
    where: { userId: req.user.id },
    select: { problemId: true },
  });
  const solvedIds = new Set(userSolutions.map((s) => s.problemId));
  const allProblems = await prisma.problem.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const unsolvedCount = allProblems.filter((p) => !solvedIds.has(p.id)).length;

  // Recent team activity
  const recentActivity = allSolutions.slice(0, 10).map((s) => ({
    solutionId: s.id,
    username: s.user.username,
    avatarColor: s.user.avatarColor,
    problemTitle: null, // enriched below
    difficulty: s.problem.difficulty,
    solvedAt: s.solvedAt,
    language: s.language,
    confidence: s.confidenceLevel,
  }));

  // Enrich with problem titles
  const problemIds = [...new Set(allSolutions.map((s) => s.problemId))];
  const problemTitles = await prisma.problem.findMany({
    where: { id: { in: problemIds } },
    select: { id: true, title: true },
  });
  const titleMap = Object.fromEntries(
    problemTitles.map((p) => [p.id, p.title]),
  );

  const enrichedActivity = allSolutions.slice(0, 10).map((s) => ({
    username: s.user.username,
    avatarColor: s.user.avatarColor,
    problemId: s.problemId,
    problemTitle: titleMap[s.problemId] || "Unknown",
    difficulty: s.problem.difficulty,
    solvedAt: s.solvedAt,
    language: s.language,
    confidence: s.confidenceLevel,
  }));

  return successResponse(res, {
    totalMembers,
    totalSolutions,
    totalProblems,
    unsolvedCount,
    easy,
    medium,
    hard,
    recentActivity: enrichedActivity,
  });
}

// ── GET /api/stats/leaderboard ─────────────────────────
export async function getLeaderboard(req, res) {
  const users = await prisma.user.findMany({
    include: {
      solutions: {
        include: {
          problem: { select: { difficulty: true } },
        },
      },
      simSessions: { where: { completed: true } },
    },
  });

  const totalProblems = await prisma.problem.count({
    where: { isActive: true },
  });

  const ranked = users
    .map((u) => {
      const sols = u.solutions;
      const easy = sols.filter((s) => s.problem.difficulty === "EASY").length;
      const medium = sols.filter(
        (s) => s.problem.difficulty === "MEDIUM",
      ).length;
      const hard = sols.filter((s) => s.problem.difficulty === "HARD").length;
      const total = sols.length;

      const avgConf = total
        ? sols.reduce((sum, s) => sum + s.confidenceLevel, 0) / total
        : 0;

      const solvedPct = totalProblems
        ? Math.round((total / totalProblems) * 100)
        : 0;

      return {
        userId: u.id,
        username: u.username,
        avatarColor: u.avatarColor,
        role: u.role,
        totalSolved: total,
        easy,
        medium,
        hard,
        streak: u.streak,
        longestStreak: u.longestStreak,
        avgConfidence: Math.round(avgConf * 10) / 10,
        solvedPercent: solvedPct,
        simCount: u.simSessions.length,
        isYou: u.id === req.user.id,
      };
    })
    .sort((a, b) => {
      // Primary: total solved
      if (b.totalSolved !== a.totalSolved) return b.totalSolved - a.totalSolved;
      // Secondary: hard count
      if (b.hard !== a.hard) return b.hard - a.hard;
      // Tertiary: streak
      return b.streak - a.streak;
    })
    .map((u, i) => ({ ...u, rank: i + 1 }));

  return successResponse(res, {
    leaderboard: ranked,
    totalProblems,
    totalMembers: users.length,
  });
}

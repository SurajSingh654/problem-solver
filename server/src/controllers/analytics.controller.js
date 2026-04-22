/**
 * ANALYTICS CONTROLLER — Product Health Data Collector
 * Collects comprehensive platform usage metrics for AI analysis.
 * Admin-only — powers the Product Health Report.
 */
import prisma from "../lib/prisma.js";
import { aiComplete } from "../services/ai.service.js";
import { isAIEnabled } from "../services/ai.service.js";
import { success, error } from "../utils/response.js";

// ── Helper: calculate date ranges ──────────────────────
function getDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeeksData(solutions, weeks = 8) {
  const data = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = getDaysAgo((i + 1) * 7);
    const end = getDaysAgo(i * 7);
    const count = solutions.filter((s) => {
      const d = new Date(s.solvedAt);
      return d >= start && d < end;
    }).length;
    data.push(count);
  }
  return data;
}

// ── GET /api/admin/product-health ──────────────────────
export async function getProductHealth(req, res) {
  const { period = "30" } = req.query;
  const days = parseInt(period) || 30;
  const periodStart = getDaysAgo(days);
  const prevPeriodStart = getDaysAgo(days * 2);

  // ═══════════════════════════════════════════════════
  // USER METRICS
  // ═══════════════════════════════════════════════════

  const allUsers = await prisma.user.findMany({
    where: { role: "MEMBER" },
    select: {
      id: true,
      username: true,
      email: true,
      joinedAt: true,
      lastActiveDate: true,
      streak: true,
      longestStreak: true,
      currentLevel: true,
      _count: {
        select: { solutions: true, simSessions: true, quizAttempts: true },
      },
    },
  });

  const totalMembers = allUsers.length;
  const newMembers = allUsers.filter(
    (u) => new Date(u.joinedAt) >= periodStart,
  ).length;
  const prevNewMembers = allUsers.filter((u) => {
    const d = new Date(u.joinedAt);
    return d >= prevPeriodStart && d < periodStart;
  }).length;

  // Active members (logged in within period)
  const activeMembers = allUsers.filter(
    (u) => u.lastActiveDate && new Date(u.lastActiveDate) >= periodStart,
  ).length;
  const prevActiveMembers = allUsers.filter(
    (u) =>
      u.lastActiveDate &&
      new Date(u.lastActiveDate) >= prevPeriodStart &&
      new Date(u.lastActiveDate) < periodStart,
  ).length;

  // Inactive members (no activity in 7+ days)
  const inactiveMembers = allUsers.filter((u) => {
    if (!u.lastActiveDate) return true;
    return Date.now() - new Date(u.lastActiveDate).getTime() > 7 * 86400000;
  });

  // Members at risk (active before but inactive now)
  const atRiskMembers = allUsers.filter((u) => {
    if (!u.lastActiveDate) return false;
    const daysSinceActive =
      (Date.now() - new Date(u.lastActiveDate).getTime()) / 86400000;
    return (
      daysSinceActive > 7 && daysSinceActive < 30 && u._count.solutions > 0
    );
  });

  // Members with zero activity
  const zeroActivityMembers = allUsers.filter(
    (u) =>
      u._count.solutions === 0 &&
      u._count.simSessions === 0 &&
      u._count.quizAttempts === 0,
  );

  // Registration to first solution time
  const membersWithSolutions = await prisma.user.findMany({
    where: { role: "MEMBER", solutions: { some: {} } },
    select: {
      joinedAt: true,
      solutions: {
        orderBy: { solvedAt: "asc" },
        take: 1,
        select: { solvedAt: true },
      },
    },
  });

  const timeToFirstSolution = membersWithSolutions
    .map((u) => {
      const first = u.solutions[0]?.solvedAt;
      if (!first) return null;
      return Math.round((new Date(first) - new Date(u.joinedAt)) / 3600000); // hours
    })
    .filter(Boolean);

  const avgTimeToFirstSolution = timeToFirstSolution.length
    ? Math.round(
        timeToFirstSolution.reduce((a, b) => a + b, 0) /
          timeToFirstSolution.length,
      )
    : null;

  // ═══════════════════════════════════════════════════
  // SOLUTION METRICS
  // ═══════════════════════════════════════════════════

  const allSolutions = await prisma.solution.findMany({
    select: {
      id: true,
      solvedAt: true,
      confidenceLevel: true,
      patternIdentified: true,
      keyInsight: true,
      feynmanExplanation: true,
      optimizedApproach: true,
      bruteForceApproach: true,
      code: true,
      language: true,
      aiFeedback: true,
      problemId: true,
      userId: true,
    },
  });

  const periodSolutions = allSolutions.filter(
    (s) => new Date(s.solvedAt) >= periodStart,
  );
  const prevPeriodSolutions = allSolutions.filter((s) => {
    const d = new Date(s.solvedAt);
    return d >= prevPeriodStart && d < periodStart;
  });

  // Solutions per week trend (last 8 weeks)
  const solutionsPerWeek = getWeeksData(allSolutions, 8);

  // Solution quality metrics
  const withPattern = allSolutions.filter((s) => s.patternIdentified).length;
  const withInsight = allSolutions.filter((s) => s.keyInsight).length;
  const withExplanation = allSolutions.filter(
    (s) => s.feynmanExplanation,
  ).length;
  const withCode = allSolutions.filter((s) => s.code).length;
  const withBothApproaches = allSolutions.filter(
    (s) => s.bruteForceApproach && s.optimizedApproach,
  ).length;

  const avgConfidence = allSolutions.length
    ? (
        allSolutions.reduce((sum, s) => sum + s.confidenceLevel, 0) /
        allSolutions.length
      ).toFixed(1)
    : 0;

  // Language distribution
  const languageDistribution = {};
  allSolutions.forEach((s) => {
    if (s.language)
      languageDistribution[s.language] =
        (languageDistribution[s.language] || 0) + 1;
  });

  // AI review adoption
  const solutionsWithAIReview = allSolutions.filter((s) => s.aiFeedback).length;
  const aiReviewRate = allSolutions.length
    ? Math.round((solutionsWithAIReview / allSolutions.length) * 100)
    : 0;

  // ═══════════════════════════════════════════════════
  // PROBLEM METRICS
  // ═══════════════════════════════════════════════════

  const allProblems = await prisma.problem.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      difficulty: true,
      category: true,
      tags: true,
      createdAt: true,
      _count: { select: { solutions: true } },
    },
  });

  const totalProblems = allProblems.length;

  // Category distribution
  const categoryDistribution = {};
  allProblems.forEach((p) => {
    const cat = p.category || "CODING";
    categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
  });

  // Difficulty distribution
  const difficultyDistribution = { EASY: 0, MEDIUM: 0, HARD: 0 };
  allProblems.forEach((p) => {
    difficultyDistribution[p.difficulty] =
      (difficultyDistribution[p.difficulty] || 0) + 1;
  });

  // Unsolved problems (no solutions from anyone)
  const unsolvedProblems = allProblems.filter((p) => p._count.solutions === 0);

  // Most popular problems (most solutions)
  const mostSolved = [...allProblems]
    .sort((a, b) => b._count.solutions - a._count.solutions)
    .slice(0, 5)
    .map((p) => ({
      title: p.title,
      solutions: p._count.solutions,
      difficulty: p.difficulty,
    }));

  // Least popular problems (fewest solutions, excluding 0)
  const leastSolved = allProblems
    .filter((p) => p._count.solutions > 0)
    .sort((a, b) => a._count.solutions - b._count.solutions)
    .slice(0, 5)
    .map((p) => ({
      title: p.title,
      solutions: p._count.solutions,
      difficulty: p.difficulty,
    }));

  // ═══════════════════════════════════════════════════
  // QUIZ METRICS
  // ═══════════════════════════════════════════════════

  const allQuizzes = await prisma.quizAttempt.findMany({
    select: {
      id: true,
      subject: true,
      difficulty: true,
      score: true,
      total: true,
      percentage: true,
      completedAt: true,
      userId: true,
      aiAnalysis: true,
    },
  });

  const periodQuizzes = allQuizzes.filter(
    (q) => new Date(q.completedAt) >= periodStart,
  );

  const totalQuizzes = allQuizzes.length;
  const quizMembersCount = new Set(allQuizzes.map((q) => q.userId)).size;
  const quizAdoptionRate =
    totalMembers > 0 ? Math.round((quizMembersCount / totalMembers) * 100) : 0;

  // Average quiz score
  const avgQuizScore = allQuizzes.length
    ? Math.round(
        allQuizzes.reduce((sum, q) => sum + q.percentage, 0) /
          allQuizzes.length,
      )
    : 0;

  // Most popular quiz subjects
  const subjectCount = {};
  allQuizzes.forEach((q) => {
    subjectCount[q.subject] = (subjectCount[q.subject] || 0) + 1;
  });
  const topQuizSubjects = Object.entries(subjectCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([subject, count]) => ({ subject, count }));

  // Quiz difficulty distribution
  const quizDifficultyDist = { EASY: 0, MEDIUM: 0, HARD: 0 };
  allQuizzes.forEach((q) => {
    quizDifficultyDist[q.difficulty] =
      (quizDifficultyDist[q.difficulty] || 0) + 1;
  });

  // ═══════════════════════════════════════════════════
  // SIMULATION METRICS
  // ═══════════════════════════════════════════════════

  const allSims = await prisma.simSession.findMany({
    select: {
      id: true,
      userId: true,
      completed: true,
      hintUsed: true,
      overallScore: true,
      simulatedAt: true,
      timeLimitSecs: true,
      timeUsedSecs: true,
    },
  });

  const totalSims = allSims.length;
  const completedSims = allSims.filter((s) => s.completed).length;
  const simCompletionRate =
    totalSims > 0 ? Math.round((completedSims / totalSims) * 100) : 0;
  const simMembersCount = new Set(allSims.map((s) => s.userId)).size;
  const simAdoptionRate =
    totalMembers > 0 ? Math.round((simMembersCount / totalMembers) * 100) : 0;
  const avgSimScore =
    completedSims > 0
      ? (
          allSims
            .filter((s) => s.completed && s.overallScore)
            .reduce((sum, s) => sum + s.overallScore, 0) / completedSims
        ).toFixed(1)
      : 0;
  const hintUsageRate =
    totalSims > 0
      ? Math.round((allSims.filter((s) => s.hintUsed).length / totalSims) * 100)
      : 0;

  // ═══════════════════════════════════════════════════
  // REVIEW QUEUE METRICS
  // ═══════════════════════════════════════════════════

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalOverdueReviews = 0;
  let membersWithOverdueReviews = 0;

  for (const user of allUsers) {
    const solutions = await prisma.solution.findMany({
      where: { userId: user.id },
      select: { reviewDates: true },
    });

    let hasOverdue = false;
    solutions.forEach((s) => {
      const dates = JSON.parse(s.reviewDates || "[]");
      const overdue = dates.some((d) => {
        const rd = new Date(d);
        rd.setHours(0, 0, 0, 0);
        return rd <= today;
      });
      if (overdue) {
        totalOverdueReviews++;
        hasOverdue = true;
      }
    });
    if (hasOverdue) membersWithOverdueReviews++;
  }

  const reviewEngagementRate =
    totalMembers > 0
      ? Math.round(
          ((totalMembers - membersWithOverdueReviews) / totalMembers) * 100,
        )
      : 100;

  // ═══════════════════════════════════════════════════
  // AI USAGE METRICS
  // ═══════════════════════════════════════════════════

  const aiEnabled = isAIEnabled();
  const aiReviewsTotal = solutionsWithAIReview;
  const aiQuizzesTotal = allQuizzes.length; // All quizzes are AI-generated
  const aiAnalysisTotal = allQuizzes.filter((q) => q.aiAnalysis).length;

  // ═══════════════════════════════════════════════════
  // ENGAGEMENT FUNNEL
  // ═══════════════════════════════════════════════════

  const registeredCount = totalMembers;
  const solvedAtLeastOne = allUsers.filter(
    (u) => u._count.solutions > 0,
  ).length;
  const solvedThreeOrMore = allUsers.filter(
    (u) => u._count.solutions >= 3,
  ).length;
  const usedQuiz = quizMembersCount;
  const usedSim = simMembersCount;
  const activeRegular = allUsers.filter((u) => {
    if (!u.lastActiveDate) return false;
    return Date.now() - new Date(u.lastActiveDate).getTime() < 7 * 86400000;
  }).length;

  const funnel = {
    registered: registeredCount,
    solvedOne: solvedAtLeastOne,
    solvedThree: solvedThreeOrMore,
    usedQuiz,
    usedSim,
    activeWeekly: activeRegular,
  };

  // ═══════════════════════════════════════════════════
  // GROWTH INDICATORS
  // ═══════════════════════════════════════════════════

  const growthIndicators = {
    memberGrowth:
      prevNewMembers > 0
        ? Math.round(((newMembers - prevNewMembers) / prevNewMembers) * 100)
        : newMembers > 0
          ? 100
          : 0,
    solutionGrowth:
      prevPeriodSolutions.length > 0
        ? Math.round(
            ((periodSolutions.length - prevPeriodSolutions.length) /
              prevPeriodSolutions.length) *
              100,
          )
        : periodSolutions.length > 0
          ? 100
          : 0,
    activeGrowth:
      prevActiveMembers > 0
        ? Math.round(
            ((activeMembers - prevActiveMembers) / prevActiveMembers) * 100,
          )
        : activeMembers > 0
          ? 100
          : 0,
  };

  // ═══════════════════════════════════════════════════
  // COMPILE RESPONSE
  // ═══════════════════════════════════════════════════

  return success(res, {
    period: days,
    generatedAt: new Date().toISOString(),

    // Users
    users: {
      total: totalMembers,
      new: newMembers,
      active: activeMembers,
      inactive: inactiveMembers.length,
      atRisk: atRiskMembers.map((u) => ({
        username: u.username,
        lastActive: u.lastActiveDate,
        solutionCount: u._count.solutions,
      })),
      zeroActivity: zeroActivityMembers.map((u) => ({
        username: u.username,
        joinedAt: u.joinedAt,
      })),
      avgTimeToFirstSolution,
    },

    // Solutions
    solutions: {
      total: allSolutions.length,
      inPeriod: periodSolutions.length,
      prevPeriod: prevPeriodSolutions.length,
      perWeekTrend: solutionsPerWeek,
      quality: {
        withPattern: Math.round(
          (withPattern / Math.max(allSolutions.length, 1)) * 100,
        ),
        withInsight: Math.round(
          (withInsight / Math.max(allSolutions.length, 1)) * 100,
        ),
        withExplanation: Math.round(
          (withExplanation / Math.max(allSolutions.length, 1)) * 100,
        ),
        withCode: Math.round(
          (withCode / Math.max(allSolutions.length, 1)) * 100,
        ),
        withBothApproaches: Math.round(
          (withBothApproaches / Math.max(allSolutions.length, 1)) * 100,
        ),
      },
      avgConfidence: parseFloat(avgConfidence),
      languageDistribution,
      aiReviewRate,
    },

    // Problems
    problems: {
      total: totalProblems,
      categoryDistribution,
      difficultyDistribution,
      unsolved: unsolvedProblems.map((p) => ({
        title: p.title,
        category: p.category,
        difficulty: p.difficulty,
      })),
      mostSolved,
      leastSolved,
    },

    // Quizzes
    quizzes: {
      total: totalQuizzes,
      inPeriod: periodQuizzes.length,
      adoptionRate: quizAdoptionRate,
      avgScore: avgQuizScore,
      topSubjects: topQuizSubjects,
      difficultyDistribution: quizDifficultyDist,
    },

    // Simulations
    simulations: {
      total: totalSims,
      completed: completedSims,
      completionRate: simCompletionRate,
      adoptionRate: simAdoptionRate,
      avgScore: parseFloat(avgSimScore),
      hintUsageRate,
    },

    // Reviews
    reviews: {
      totalOverdue: totalOverdueReviews,
      membersWithOverdue: membersWithOverdueReviews,
      engagementRate: reviewEngagementRate,
    },

    // AI Usage
    ai: {
      enabled: aiEnabled,
      reviewsGenerated: aiReviewsTotal,
      quizzesGenerated: aiQuizzesTotal,
      analysisGenerated: aiAnalysisTotal,
    },

    // Funnel
    funnel,

    // Growth
    growth: growthIndicators,
  });
}

// ── POST /api/admin/product-health/analyze ─────────────
// AI generates insights from the raw metrics
export async function analyzeProductHealth(req, res) {
  if (!isAIEnabled()) {
    return error(res, "AI features not enabled", 503, "AI_DISABLED");
  }

  const { metrics } = req.body;
  if (!metrics) {
    return error(res, "Metrics data required", 400);
  }

  const system = `You are a product growth analyst for ProbSolver — a team interview preparation platform. You analyze platform usage metrics and generate actionable insights for the admin who manages the product.

Your job is to:
1. Identify what's working and what's not
2. Spot trends (growing, declining, stagnant)
3. Find correlations and patterns humans might miss
4. Generate specific, actionable recommendations
5. Flag risks before they become problems

Be direct, specific, and data-driven. Reference actual numbers from the metrics. Don't be generic.

ALWAYS respond in this exact JSON format:
{
  "executiveSummary": "<string — 2-3 sentences: overall health, biggest win, biggest concern>",
  "healthScore": <number 1-100 — overall platform health>,
  "insights": [
    {
      "type": "positive" | "warning" | "critical" | "opportunity",
      "title": "<string — short headline>",
      "detail": "<string — 1-2 sentence explanation with specific numbers>",
      "action": "<string — one specific action to take>"
    }
  ],
  "trends": {
    "engagement": "growing" | "stable" | "declining",
    "contentQuality": "growing" | "stable" | "declining",
    "aiAdoption": "growing" | "stable" | "declining",
    "retention": "growing" | "stable" | "declining"
  },
  "recommendations": [
    {
      "priority": 1 | 2 | 3,
      "title": "<string>",
      "reason": "<string — why this matters, with data>",
      "effort": "low" | "medium" | "high"
    }
  ],
  "risks": [
    {
      "severity": "low" | "medium" | "high",
      "title": "<string>",
      "detail": "<string — what could happen if not addressed>",
      "mitigation": "<string — how to prevent it>"
    }
  ]
}`;

  const user = `Analyze these platform metrics and generate a product health report:

${JSON.stringify(metrics, null, 2)}

Focus on:
- Is the platform growing or shrinking?
- Which features are adopted vs ignored?
- Where are members dropping off in the funnel?
- What content gaps exist?
- Are AI features adding value?
- What should the admin do THIS WEEK to improve?`;

  try {
    const raw = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId: req.user.id,
      maxTokens: 2000,
      temperature: 0.7,
    });

    return success(res, raw, "Product health analysis generated");
  } catch (error) {
    console.error("[Analytics] AI analysis failed:", error.message);
    return error(res, `Analysis failed: ${error.message}`, 500);
  }
}

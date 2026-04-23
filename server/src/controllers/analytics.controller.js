// ============================================================================
// ProbSolver v3.0 — Analytics Controller (Team-Scoped)
// ============================================================================
//
// SCOPING:
// - TEAM_ADMIN sees their team's data only (req.teamId)
// - SUPER_ADMIN sees platform-wide data (no teamId filter)
//
// ============================================================================
import prisma from "../lib/prisma.js";
import { aiComplete } from "../services/ai.service.js";
import { isAIEnabled } from "../services/ai.service.js";
import { success, error } from "../utils/response.js";

// ── Helper: date ranges ────────────────────────────────
function getDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeeksData(items, dateField, weeks = 8) {
  const data = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = getDaysAgo((i + 1) * 7);
    const end = getDaysAgo(i * 7);
    const count = items.filter((item) => {
      const d = new Date(item[dateField]);
      return d >= start && d < end;
    }).length;
    data.push(count);
  }
  return data;
}

// ============================================================================
// GET /api/admin/product-health
// ============================================================================
export async function getProductHealth(req, res) {
  try {
    const { period = "30" } = req.query;
    const days = parseInt(period) || 30;
    const periodStart = getDaysAgo(days);
    const prevPeriodStart = getDaysAgo(days * 2);

    // Determine scope: SUPER_ADMIN = platform-wide, TEAM_ADMIN = team only
    const isSuperAdmin = req.user.globalRole === "SUPER_ADMIN";
    const teamId = !isSuperAdmin ? req.teamId : null;

    // ═════════════════════════════════════════════════
    // USER METRICS
    // ═════════════════════════════════════════════════
    const userWhere = { globalRole: "USER" };
    if (teamId) userWhere.currentTeamId = teamId;

    const allUsers = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        lastActiveAt: true,
        activityStatus: true,
        streak: true,
        _count: {
          select: { solutions: true, simSessions: true, quizAttempts: true },
        },
      },
    });

    const totalMembers = allUsers.length;
    const newMembers = allUsers.filter(
      (u) => new Date(u.createdAt) >= periodStart,
    ).length;
    const prevNewMembers = allUsers.filter((u) => {
      const d = new Date(u.createdAt);
      return d >= prevPeriodStart && d < periodStart;
    }).length;

    const activeMembers = allUsers.filter(
      (u) => u.lastActiveAt && new Date(u.lastActiveAt) >= periodStart,
    ).length;
    const prevActiveMembers = allUsers.filter(
      (u) =>
        u.lastActiveAt &&
        new Date(u.lastActiveAt) >= prevPeriodStart &&
        new Date(u.lastActiveAt) < periodStart,
    ).length;

    const atRiskMembers = allUsers.filter((u) => {
      if (!u.lastActiveAt) return false;
      const daysSince =
        (Date.now() - new Date(u.lastActiveAt).getTime()) / 86400000;
      return daysSince > 7 && daysSince < 30 && u._count.solutions > 0;
    });

    const zeroActivityMembers = allUsers.filter(
      (u) =>
        u._count.solutions === 0 &&
        u._count.simSessions === 0 &&
        u._count.quizAttempts === 0,
    );

    // ═════════════════════════════════════════════════
    // SOLUTION METRICS
    // ═════════════════════════════════════════════════
    const solutionWhere = {};
    if (teamId) solutionWhere.teamId = teamId;

    const allSolutions = await prisma.solution.findMany({
      where: solutionWhere,
      select: {
        id: true,
        createdAt: true,
        confidence: true,
        pattern: true,
        keyInsight: true,
        feynmanExplanation: true,
        optimizedApproach: true,
        bruteForce: true,
        code: true,
        language: true,
        aiFeedback: true,
        timeComplexity: true,
        spaceComplexity: true,
      },
    });

    const periodSolutions = allSolutions.filter(
      (s) => new Date(s.createdAt) >= periodStart,
    );
    const prevPeriodSolutions = allSolutions.filter((s) => {
      const d = new Date(s.createdAt);
      return d >= prevPeriodStart && d < periodStart;
    });

    const solutionsPerWeek = getWeeksData(allSolutions, "createdAt", 8);

    const withPattern = allSolutions.filter((s) => s.pattern).length;
    const withInsight = allSolutions.filter((s) => s.keyInsight).length;
    const withExplanation = allSolutions.filter(
      (s) => s.feynmanExplanation,
    ).length;
    const withCode = allSolutions.filter((s) => s.code).length;
    const withBothApproaches = allSolutions.filter(
      (s) => s.bruteForce && s.optimizedApproach,
    ).length;

    const avgConfidence = allSolutions.length
      ? (
          allSolutions.reduce((sum, s) => sum + (s.confidence || 0), 0) /
          allSolutions.length
        ).toFixed(1)
      : 0;

    const languageDistribution = {};
    allSolutions.forEach((s) => {
      if (s.language)
        languageDistribution[s.language] =
          (languageDistribution[s.language] || 0) + 1;
    });

    const solutionsWithAIReview = allSolutions.filter(
      (s) => s.aiFeedback,
    ).length;
    const aiReviewRate = allSolutions.length
      ? Math.round((solutionsWithAIReview / allSolutions.length) * 100)
      : 0;

    // ═════════════════════════════════════════════════
    // PROBLEM METRICS
    // ═════════════════════════════════════════════════
    const problemWhere = { isPublished: true };
    if (teamId) problemWhere.teamId = teamId;

    const allProblems = await prisma.problem.findMany({
      where: problemWhere,
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

    const categoryDistribution = {};
    allProblems.forEach((p) => {
      const cat = p.category || "CODING";
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
    });

    const difficultyDistribution = { EASY: 0, MEDIUM: 0, HARD: 0 };
    allProblems.forEach((p) => {
      difficultyDistribution[p.difficulty] =
        (difficultyDistribution[p.difficulty] || 0) + 1;
    });

    const unsolvedProblems = allProblems.filter(
      (p) => p._count.solutions === 0,
    );
    const mostSolved = [...allProblems]
      .sort((a, b) => b._count.solutions - a._count.solutions)
      .slice(0, 5)
      .map((p) => ({
        title: p.title,
        solutions: p._count.solutions,
        difficulty: p.difficulty,
      }));

    // ═════════════════════════════════════════════════
    // QUIZ METRICS
    // ═════════════════════════════════════════════════
    const quizWhere = {};
    if (teamId) quizWhere.teamId = teamId;

    const allQuizzes = await prisma.quizAttempt.findMany({
      where: quizWhere,
      select: {
        id: true,
        subject: true,
        difficulty: true,
        score: true,
        completedAt: true,
        userId: true,
        aiAnalysis: true,
      },
    });

    const completedQuizzes = allQuizzes.filter((q) => q.completedAt);
    const quizMembersCount = new Set(allQuizzes.map((q) => q.userId)).size;
    const quizAdoptionRate =
      totalMembers > 0
        ? Math.round((quizMembersCount / totalMembers) * 100)
        : 0;

    const avgQuizScore = completedQuizzes.length
      ? Math.round(
          completedQuizzes.reduce((sum, q) => sum + (q.score || 0), 0) /
            completedQuizzes.length,
        )
      : 0;

    const subjectCount = {};
    allQuizzes.forEach((q) => {
      subjectCount[q.subject] = (subjectCount[q.subject] || 0) + 1;
    });
    const topQuizSubjects = Object.entries(subjectCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([subject, count]) => ({ subject, count }));

    // ═════════════════════════════════════════════════
    // SIMULATION METRICS
    // ═════════════════════════════════════════════════
    const simWhere = {};
    if (teamId) simWhere.teamId = teamId;

    const allSims = await prisma.simSession.findMany({
      where: simWhere,
      select: {
        id: true,
        userId: true,
        completed: true,
        hintsUsed: true,
        score: true,
        createdAt: true,
        timeSpent: true,
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
              .filter((s) => s.completed && s.score)
              .reduce((sum, s) => sum + s.score, 0) / completedSims
          ).toFixed(1)
        : 0;
    const hintUsageRate =
      totalSims > 0
        ? Math.round(
            (allSims.filter((s) => s.hintsUsed > 0).length / totalSims) * 100,
          )
        : 0;

    // ═════════════════════════════════════════════════
    // INTERVIEW METRICS
    // ═════════════════════════════════════════════════
    const interviewWhere = {};
    if (teamId) interviewWhere.teamId = teamId;

    const allInterviews = await prisma.interviewSession.findMany({
      where: interviewWhere,
      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
      },
    });

    const completedInterviews = allInterviews.filter(
      (i) => i.status === "COMPLETED",
    ).length;
    const interviewMembersCount = new Set(allInterviews.map((i) => i.userId))
      .size;

    // ═════════════════════════════════════════════════
    // REVIEW QUEUE METRICS
    // ═════════════════════════════════════════════════
    const now = new Date();
    const overdueReviews = await prisma.solution.count({
      where: {
        ...(teamId ? { teamId } : {}),
        nextReviewDate: { lte: now },
      },
    });

    // ═════════════════════════════════════════════════
    // ENGAGEMENT FUNNEL
    // ═════════════════════════════════════════════════
    const solvedAtLeastOne = allUsers.filter(
      (u) => u._count.solutions > 0,
    ).length;
    const solvedThreeOrMore = allUsers.filter(
      (u) => u._count.solutions >= 3,
    ).length;
    const activeRegular = allUsers.filter(
      (u) =>
        u.lastActiveAt &&
        Date.now() - new Date(u.lastActiveAt).getTime() < 7 * 86400000,
    ).length;

    const funnel = {
      registered: totalMembers,
      solvedOne: solvedAtLeastOne,
      solvedThree: solvedThreeOrMore,
      usedQuiz: quizMembersCount,
      usedSim: simMembersCount,
      activeWeekly: activeRegular,
    };

    // ═════════════════════════════════════════════════
    // GROWTH INDICATORS
    // ═════════════════════════════════════════════════
    const growth = {
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

    // ═════════════════════════════════════════════════
    // RESPONSE
    // ═════════════════════════════════════════════════
    return success(res, {
      period: days,
      generatedAt: new Date().toISOString(),
      scope: isSuperAdmin ? "platform" : "team",

      users: {
        total: totalMembers,
        new: newMembers,
        active: activeMembers,
        inactive: allUsers.filter((u) => u.activityStatus === "INACTIVE")
          .length,
        dormant: allUsers.filter((u) => u.activityStatus === "DORMANT").length,
        atRisk: atRiskMembers.slice(0, 10).map((u) => ({
          name: u.name,
          lastActive: u.lastActiveAt,
          solutionCount: u._count.solutions,
        })),
        zeroActivity: zeroActivityMembers.slice(0, 10).map((u) => ({
          name: u.name,
          joinedAt: u.createdAt,
        })),
      },

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

      problems: {
        total: totalProblems,
        categoryDistribution,
        difficultyDistribution,
        unsolved: unsolvedProblems.slice(0, 10).map((p) => ({
          title: p.title,
          category: p.category,
          difficulty: p.difficulty,
        })),
        mostSolved,
      },

      quizzes: {
        total: allQuizzes.length,
        completed: completedQuizzes.length,
        adoptionRate: quizAdoptionRate,
        avgScore: avgQuizScore,
        topSubjects: topQuizSubjects,
      },

      simulations: {
        total: totalSims,
        completed: completedSims,
        completionRate: simCompletionRate,
        adoptionRate: simAdoptionRate,
        avgScore: parseFloat(avgSimScore),
        hintUsageRate,
      },

      interviews: {
        total: allInterviews.length,
        completed: completedInterviews,
        uniqueMembers: interviewMembersCount,
      },

      reviews: {
        totalOverdue: overdueReviews,
        engagementRate:
          totalMembers > 0
            ? Math.round(
                ((totalMembers - zeroActivityMembers.length) / totalMembers) *
                  100,
              )
            : 100,
      },

      ai: {
        enabled: isAIEnabled(),
        reviewsGenerated: solutionsWithAIReview,
        quizzesGenerated: allQuizzes.length,
        analysisGenerated: allQuizzes.filter((q) => q.aiAnalysis).length,
      },

      funnel,
      growth,
    });
  } catch (err) {
    console.error("Product health error:", err);
    return error(res, "Failed to fetch product health metrics.", 500);
  }
}

// ============================================================================
// POST /api/admin/product-health/analyze
// ============================================================================
export async function analyzeProductHealth(req, res) {
  try {
    if (!isAIEnabled()) {
      return error(res, "AI features not enabled", 503);
    }

    const { metrics } = req.body;
    if (!metrics) {
      return error(res, "Metrics data required", 400);
    }

    const systemPrompt = `You are a product growth analyst for ProbSolver — a team interview preparation platform.
Analyze platform usage metrics and generate actionable insights.

ALWAYS respond in this exact JSON format:
{
  "executiveSummary": "2-3 sentences: overall health, biggest win, biggest concern",
  "healthScore": 1-100,
  "insights": [
    {
      "type": "positive" | "warning" | "critical" | "opportunity",
      "title": "short headline",
      "detail": "1-2 sentence explanation with specific numbers",
      "action": "one specific action to take"
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
      "title": "string",
      "reason": "why this matters, with data",
      "effort": "low" | "medium" | "high"
    }
  ],
  "risks": [
    {
      "severity": "low" | "medium" | "high",
      "title": "string",
      "detail": "what could happen if not addressed",
      "mitigation": "how to prevent it"
    }
  ]
}`;

    const userPrompt = `Analyze these platform metrics:\n${JSON.stringify(metrics, null, 2)}\n\nFocus on growth trends, feature adoption, content gaps, and actionable improvements.`;

    const analysis = await aiComplete({
      systemPrompt,
      userPrompt,
      userId: req.user.id,
      maxTokens: 2000,
      temperature: 0.7,
    });

    return success(res, analysis);
  } catch (err) {
    console.error("AI analysis failed:", err.message);
    return error(res, `Analysis failed: ${err.message}`, 500);
  }
}

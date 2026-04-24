// ============================================================================
// ProbSolver v3.0 — Platform Analytics Controller (SUPER_ADMIN only)
// ============================================================================
//
// Completely separate from the team-scoped analytics controller.
// Every query here is platform-wide — no teamId filtering.
//
// Sections:
// 1. Platform Overview (users, teams, content volume)
// 2. User Funnel (registered → verified → onboarded → active)
// 3. Engagement (active/inactive/dormant, streaks, activity trends)
// 4. Team Health (active teams, sizes, pending approvals, at-risk teams)
// 5. Feature Adoption (% of active users using each feature)
// 6. AI Usage (calls by type, cost estimate)
// 7. AI Analysis (persistent, generated on demand)
//
// ============================================================================
import prisma from "../lib/prisma.js";
import {
  aiComplete,
  isAIEnabled,
  checkRateLimit,
} from "../services/ai.service.js";
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
// GET /api/platform/health — Platform-wide metrics
// ============================================================================
export async function getPlatformHealth(req, res) {
  try {
    const { period = "30" } = req.query;
    const days = parseInt(period) || 30;
    const periodStart = getDaysAgo(days);
    const prevPeriodStart = getDaysAgo(days * 2);

    // ═══════════════════════════════════════════════
    // ALL USERS (platform-wide, exclude SUPER_ADMIN)
    // ═══════════════════════════════════════════════
    const allUsers = await prisma.user.findMany({
      where: { globalRole: "USER", deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        isVerified: true,
        onboardingComplete: true,
        currentTeamId: true,
        personalTeamId: true,
        teamRole: true,
        createdAt: true,
        lastActiveAt: true,
        activityStatus: true,
        streak: true,
        _count: {
          select: {
            solutions: true,
            simSessions: true,
            quizAttempts: true,
            interviewSessions: true,
          },
        },
      },
    });

    const totalUsers = allUsers.length;
    const newUsers = allUsers.filter(
      (u) => new Date(u.createdAt) >= periodStart,
    ).length;
    const prevNewUsers = allUsers.filter((u) => {
      const d = new Date(u.createdAt);
      return d >= prevPeriodStart && d < periodStart;
    }).length;

    // Activity breakdown
    const activeUsers = allUsers.filter(
      (u) => u.activityStatus === "ACTIVE",
    ).length;
    const inactiveUsers = allUsers.filter(
      (u) => u.activityStatus === "INACTIVE",
    ).length;
    const dormantUsers = allUsers.filter(
      (u) => u.activityStatus === "DORMANT",
    ).length;

    const activeInPeriod = allUsers.filter(
      (u) => u.lastActiveAt && new Date(u.lastActiveAt) >= periodStart,
    ).length;
    const prevActiveInPeriod = allUsers.filter(
      (u) =>
        u.lastActiveAt &&
        new Date(u.lastActiveAt) >= prevPeriodStart &&
        new Date(u.lastActiveAt) < periodStart,
    ).length;

    const avgStreak =
      totalUsers > 0
        ? parseFloat(
            (
              allUsers.reduce((sum, u) => sum + u.streak, 0) / totalUsers
            ).toFixed(1),
          )
        : 0;

    // ═══════════════════════════════════════════════
    // USER FUNNEL
    // ═══════════════════════════════════════════════
    const verified = allUsers.filter((u) => u.isVerified).length;
    const onboarded = allUsers.filter((u) => u.onboardingComplete).length;
    const solvedAtLeastOne = allUsers.filter(
      (u) => u._count.solutions > 0,
    ).length;
    const usedQuiz = allUsers.filter((u) => u._count.quizAttempts > 0).length;
    const usedInterview = allUsers.filter(
      (u) => u._count.interviewSessions > 0,
    ).length;
    const usedSim = allUsers.filter((u) => u._count.simSessions > 0).length;
    const weeklyActive = allUsers.filter(
      (u) =>
        u.lastActiveAt &&
        Date.now() - new Date(u.lastActiveAt).getTime() < 7 * 86400000,
    ).length;

    // Stuck users — registered but didn't complete onboarding (>3 days ago)
    const threeDaysAgo = getDaysAgo(3);
    const stuckInOnboarding = allUsers
      .filter(
        (u) => !u.onboardingComplete && new Date(u.createdAt) < threeDaysAgo,
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        registeredAt: u.createdAt,
      }));

    // Unverified users (>1 day ago)
    const oneDayAgo = getDaysAgo(1);
    const unverified = allUsers.filter(
      (u) => !u.isVerified && new Date(u.createdAt) < oneDayAgo,
    ).length;

    // ═══════════════════════════════════════════════
    // TEAM HEALTH
    // ═══════════════════════════════════════════════
    const allTeams = await prisma.team.findMany({
      where: { isPersonal: false, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        _count: {
          select: { currentMembers: true, problems: true, solutions: true },
        },
      },
    });

    const activeTeams = allTeams.filter((t) => t.status === "ACTIVE");
    const pendingTeams = allTeams.filter((t) => t.status === "PENDING");
    const rejectedTeams = allTeams.filter((t) => t.status === "REJECTED");

    const avgTeamSize =
      activeTeams.length > 0
        ? parseFloat(
            (
              activeTeams.reduce((sum, t) => sum + t._count.currentMembers, 0) /
              activeTeams.length
            ).toFixed(1),
          )
        : 0;

    const largestTeam =
      activeTeams.length > 0
        ? activeTeams.reduce((max, t) =>
            t._count.currentMembers > max._count.currentMembers ? t : max,
          )
        : null;

    // At-risk teams: active but zero solutions in period
    const teamSolutionCounts = await prisma.solution.groupBy({
      by: ["teamId"],
      where: { createdAt: { gte: periodStart } },
      _count: true,
    });
    const activeTeamIds = new Set(teamSolutionCounts.map((t) => t.teamId));
    const atRiskTeams = activeTeams
      .filter((t) => !activeTeamIds.has(t.id) && t._count.currentMembers > 0)
      .map((t) => ({
        id: t.id,
        name: t.name,
        members: t._count.currentMembers,
        problems: t._count.problems,
      }));

    // Pending teams with age
    const pendingWithAge = pendingTeams.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      daysPending: Math.floor(
        (Date.now() - new Date(t.createdAt).getTime()) / 86400000,
      ),
    }));

    // ═══════════════════════════════════════════════
    // CONTENT VOLUME (platform-wide, not per-team)
    // ═══════════════════════════════════════════════
    const totalProblems = await prisma.problem.count({
      where: { isPublished: true },
    });
    const totalSolutions = await prisma.solution.count();
    const totalQuizzes = await prisma.quizAttempt.count();
    const totalInterviews = await prisma.interviewSession.count();
    const totalSims = await prisma.simSession.count();

    const newProblemsInPeriod = await prisma.problem.count({
      where: { isPublished: true, createdAt: { gte: periodStart } },
    });
    const newSolutionsInPeriod = await prisma.solution.count({
      where: { createdAt: { gte: periodStart } },
    });
    const prevSolutionsInPeriod = await prisma.solution.count({
      where: { createdAt: { gte: prevPeriodStart, lt: periodStart } },
    });

    // Solutions per week trend
    const recentSolutions = await prisma.solution.findMany({
      where: { createdAt: { gte: getDaysAgo(56) } },
      select: { createdAt: true },
    });
    const solutionsPerWeek = getWeeksData(recentSolutions, "createdAt", 8);

    // Registrations per week trend
    const recentUsers = allUsers.filter(
      (u) => new Date(u.createdAt) >= getDaysAgo(56),
    );
    const registrationsPerWeek = getWeeksData(recentUsers, "createdAt", 8);

    // ═══════════════════════════════════════════════
    // AI USAGE (computed first — reused in feature adoption)
    // ═══════════════════════════════════════════════
    const [aiReviewCount, aiQuizAnalysisCount] = await Promise.all([
      prisma.solution.count({ where: { aiFeedback: { not: null } } }),
      prisma.quizAttempt.count({ where: { aiAnalysis: { not: null } } }),
    ]);

    const aiQuizCount = totalQuizzes;
    const aiInterviewCount = totalInterviews;
    const totalAICalls =
      aiReviewCount + aiQuizCount + aiInterviewCount + aiQuizAnalysisCount;

    const estimatedTokens =
      aiReviewCount * 800 +
      aiQuizCount * 1500 +
      aiInterviewCount * 3000 +
      aiQuizAnalysisCount * 600;
    const estimatedCost = parseFloat(
      ((estimatedTokens / 1000000) * 0.15).toFixed(2),
    );

    // ═══════════════════════════════════════════════
    // FEATURE ADOPTION (% of all users)
    // ═══════════════════════════════════════════════
    const featureAdoption = {
      problemSolving: {
        users: solvedAtLeastOne,
        rate: Math.round((solvedAtLeastOne / Math.max(totalUsers, 1)) * 100),
        label: "Problem Solving",
      },
      quizzes: {
        users: usedQuiz,
        rate: Math.round((usedQuiz / Math.max(totalUsers, 1)) * 100),
        label: "AI Quizzes",
      },
      mockInterviews: {
        users: usedInterview,
        rate: Math.round((usedInterview / Math.max(totalUsers, 1)) * 100),
        label: "Mock Interviews",
      },
      simulations: {
        users: usedSim,
        rate: Math.round((usedSim / Math.max(totalUsers, 1)) * 100),
        label: "Timed Simulations",
      },
      aiReviews: {
        total: aiReviewCount,
        rate:
          totalSolutions > 0
            ? Math.round((aiReviewCount / totalSolutions) * 100)
            : 0,
        label: "AI Solution Reviews",
      },
    };

    // ═══════════════════════════════════════════════
    // GROWTH INDICATORS
    // ═══════════════════════════════════════════════
    const growth = {
      users:
        prevNewUsers > 0
          ? Math.round(((newUsers - prevNewUsers) / prevNewUsers) * 100)
          : newUsers > 0
            ? 100
            : 0,
      solutions:
        prevSolutionsInPeriod > 0
          ? Math.round(
              ((newSolutionsInPeriod - prevSolutionsInPeriod) /
                prevSolutionsInPeriod) *
                100,
            )
          : newSolutionsInPeriod > 0
            ? 100
            : 0,
      activeUsers:
        prevActiveInPeriod > 0
          ? Math.round(
              ((activeInPeriod - prevActiveInPeriod) / prevActiveInPeriod) *
                100,
            )
          : activeInPeriod > 0
            ? 100
            : 0,
    };

    // ═══════════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════════
    return success(res, {
      period: days,
      generatedAt: new Date().toISOString(),

      overview: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        dormantUsers,
        totalTeams: activeTeams.length,
        totalProblems,
        totalSolutions,
        totalAICalls,
      },

      funnel: {
        registered: totalUsers,
        verified,
        onboarded,
        solvedOne: solvedAtLeastOne,
        usedQuiz,
        usedInterview,
        usedSim,
        weeklyActive,
        unverified,
        stuckInOnboarding: stuckInOnboarding.slice(0, 10),
      },

      engagement: {
        activeInPeriod,
        avgStreak,
        newUsers,
        registrationsPerWeek,
        solutionsPerWeek,
      },

      teams: {
        active: activeTeams.length,
        pending: pendingTeams.length,
        rejected: rejectedTeams.length,
        avgSize: avgTeamSize,
        largest: largestTeam
          ? {
              name: largestTeam.name,
              members: largestTeam._count.currentMembers,
            }
          : null,
        atRisk: atRiskTeams.slice(0, 10),
        pendingApprovals: pendingWithAge,
      },

      content: {
        totalProblems,
        totalSolutions,
        totalQuizzes,
        totalInterviews,
        totalSims,
        newProblemsInPeriod,
        newSolutionsInPeriod,
      },

      featureAdoption,

      aiUsage: {
        reviews: aiReviewCount,
        quizzes: aiQuizCount,
        interviews: aiInterviewCount,
        quizAnalyses: aiQuizAnalysisCount,
        totalCalls: totalAICalls,
        estimatedTokens,
        estimatedCost,
      },

      growth,
    });
  } catch (err) {
    console.error("Platform health error:", err);
    return error(res, "Failed to fetch platform health metrics.", 500);
  }
}

// ============================================================================
// POST /api/platform/health/analyze — AI Analysis (persisted)
// ============================================================================
export async function analyzePlatformHealth(req, res) {
  try {
    if (!isAIEnabled()) {
      return error(res, "AI features are not enabled.", 503);
    }

    const rateCheck = checkRateLimit(req.user.id);
    if (!rateCheck.allowed) {
      return error(
        res,
        `Daily AI limit reached (${rateCheck.limit}/day). Try again tomorrow.`,
        429,
      );
    }

    const { metrics } = req.body;
    if (!metrics) {
      return error(res, "Metrics data is required.", 400);
    }

    const systemPrompt = `You are a senior product analytics consultant reviewing a SaaS platform called ProbSolver — a team-based interview preparation platform.

You are advising the Platform Administrator (Super Admin) who manages the entire platform across all teams. They need to understand the health of the PRODUCT as a whole — not individual team performance.

YOUR JOB:
1. Look at the numbers and find what the dashboard DOESN'T make obvious
2. Connect dots across different metrics (e.g., high registration but low onboarding = friction problem)
3. Identify specific users, teams, or patterns that need immediate attention
4. Prioritize recommendations by business impact, not just ease
5. Be specific — use names, numbers, percentages. Never be vague.
6. Think like a growth PM at a top SaaS company

ANALYSIS FRAMEWORK:
- Acquisition: Are new users arriving? Is growth accelerating or decelerating?
- Activation: Are users completing onboarding and reaching their "aha moment" (first problem solved)?
- Engagement: Are activated users coming back? Which features drive retention?
- Feature adoption: Which features are underused? Which are surprisingly popular?
- Team health: Are teams active and growing, or stagnant and dying?
- AI ROI: Is AI usage driving better outcomes or just burning tokens?
- Operational: Any pending approvals, stuck users, or system issues needing attention?

CRITICAL RULES:
- When you mention at-risk teams or stuck users, use their actual names from the data
- When comparing periods, state the exact numbers ("grew from 12 to 18, a 50% increase")
- Every recommendation must have a clear "why now" and expected impact
- Don't restate what the dashboard already shows — find the HIDDEN insights
- If data is limited (small platform), acknowledge it and focus on early-stage priorities

RESPOND IN THIS EXACT JSON FORMAT:
{
  "healthScore": <number 1-100>,
  "executiveSummary": "<string — 3-4 sentences: overall platform health, biggest win, biggest concern, one key action>",
  "insights": [
    {
      "type": "positive" | "warning" | "critical" | "opportunity",
      "title": "<short headline>",
      "detail": "<1-2 sentences with specific numbers and names>",
      "action": "<one specific, actionable step>"
    }
  ],
  "trends": {
    "userGrowth": "growing" | "stable" | "declining",
    "engagement": "growing" | "stable" | "declining",
    "featureAdoption": "growing" | "stable" | "declining",
    "teamHealth": "growing" | "stable" | "declining",
    "aiUtilization": "growing" | "stable" | "declining"
  },
  "recommendations": [
    {
      "priority": 1 | 2 | 3,
      "title": "<string>",
      "reason": "<why this matters NOW, with data>",
      "impact": "<expected outcome if acted on>",
      "effort": "low" | "medium" | "high"
    }
  ],
  "risks": [
    {
      "severity": "low" | "medium" | "high",
      "title": "<string>",
      "detail": "<what could happen if not addressed, with specifics>",
      "mitigation": "<concrete prevention step>"
    }
  ],
  "operationalActions": [
    {
      "urgency": "immediate" | "this_week" | "this_month",
      "action": "<specific action: approve team X, email user Y, etc.>",
      "reason": "<why>"
    }
  ]
}`;

    const userPrompt = `Analyze these platform-wide metrics for ProbSolver:

${JSON.stringify(metrics, null, 2)}

This is the ENTIRE platform's data — all teams, all users, all activity. You are advising the Super Admin who oversees everything.

Focus on:
1. Where users are dropping off in the funnel (registered → verified → onboarded → active)
2. Which teams need attention (at-risk, pending approval too long)  
3. Which features are being adopted vs ignored
4. Whether AI investment is paying off
5. Any specific users or teams that need immediate action
6. Growth trajectory — is the platform healthy or in trouble?

Be brutally honest. Use specific names and numbers from the data.`;

    const analysis = await aiComplete({
      systemPrompt,
      userPrompt,
      userId: req.user.id,
      model:
        process.env.OPENAI_MODEL_PREMIUM ||
        process.env.OPENAI_MODEL ||
        "gpt-4o-mini",
      maxTokens: 2500,
      temperature: 0.7,
    });

    // ── Persist the analysis ─────────────────────────
    const saved = await prisma.platformAnalysis.create({
      data: {
        generatedById: req.user.id,
        content: analysis,
        metricsSnapshot: metrics,
        period: metrics.period || 30,
      },
      select: {
        id: true,
        createdAt: true,
        period: true,
      },
    });

    return success(res, {
      ...analysis,
      analysisId: saved.id,
      generatedAt: saved.createdAt,
      period: saved.period,
    });
  } catch (err) {
    console.error("Platform AI analysis error:", err.message);
    return error(res, `Analysis failed: ${err.message}`, 500);
  }
}

// ============================================================================
// GET /api/platform/health/analysis — Get latest saved analysis
// ============================================================================
export async function getLatestAnalysis(req, res) {
  try {
    const latest = await prisma.platformAnalysis.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        period: true,
        createdAt: true,
        generatedById: true,
      },
    });

    if (!latest) {
      return success(res, { analysis: null });
    }

    return success(res, {
      analysis: {
        ...latest.content,
        analysisId: latest.id,
        generatedAt: latest.createdAt,
        period: latest.period,
      },
    });
  } catch (err) {
    console.error("Get latest analysis error:", err);
    return error(res, "Failed to fetch latest analysis.", 500);
  }
}

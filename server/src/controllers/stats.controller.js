// ============================================================================
// ProbSolver v3.0 — Stats Controller (Team-Scoped)
// ============================================================================
//
// Three scopes of stats:
//
// 1. Personal stats (req.user.id + req.teamId) — for user dashboard
// 2. Team stats (req.teamId) — for team dashboard/leaderboard
// 3. Platform stats (no team filter) — for SUPER_ADMIN only
//
// The 6D Intelligence Report is computed from the user's activity
// within their CURRENT team context. If they switch teams, their
// report changes because it's based on different data.
//
// ============================================================================

import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// ============================================================================
// PERSONAL STATS (dashboard)
// ============================================================================

export async function getPersonalStats(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

    // ── All queries scoped to team ─────────────────────
    const [
      totalSolved,
      solvedByDifficulty,
      solvedByCategory,
      avgConfidence,
      reviewsDue,
      quizCount,
      interviewCount,
      recentSolutions,
    ] = await Promise.all([
      // Total solutions in this team
      prisma.solution.count({
        where: { userId, teamId },
      }),

      // Breakdown by difficulty
      prisma.solution
        .groupBy({
          by: ["problem"],
          where: { userId, teamId },
          _count: true,
        })
        .then(async () => {
          // Use raw query for difficulty grouping via join
          const rows = await prisma.$queryRaw`
  SELECT p.difficulty, COUNT(*)::int as count
  FROM solutions s
  JOIN problems p ON s."problemId" = p.id
  WHERE s."userId" = ${userId} AND s."teamId" = ${teamId}
  GROUP BY p.difficulty
        `;
          return rows;
        }),

      // Breakdown by category
      prisma.$queryRaw`
  SELECT p.category, COUNT(*)::int as count
  FROM solutions s
  JOIN problems p ON s."problemId" = p.id
  WHERE s."userId" = ${userId} AND s."teamId" = ${teamId}
  GROUP BY p.category
      `,

      // Average confidence
      prisma.solution.aggregate({
        where: { userId, teamId },
        _avg: { confidence: true },
      }),

      // Due reviews
      prisma.solution.count({
        where: {
          userId,
          teamId,
          nextReviewDate: { lte: new Date() },
        },
      }),

      // Quiz count
      prisma.quizAttempt.count({
        where: { userId, teamId },
      }),

      // Interview count
      prisma.interviewSession.count({
        where: { userId, teamId },
      }),

      // Recent solutions (last 5)
      prisma.solution.findMany({
        where: { userId, teamId },
        select: {
          id: true,
          confidence: true,
          createdAt: true,
          problem: {
            select: { id: true, title: true, difficulty: true, category: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    // ── User profile data ──────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        streak: true,
        lastSolvedAt: true,
        targetCompany: true,
        interviewDate: true,
      },
    });

    return success(res, {
      stats: {
        totalSolved,
        solvedByDifficulty,
        solvedByCategory,
        avgConfidence: avgConfidence._avg.confidence
          ? Math.round(avgConfidence._avg.confidence * 10) / 10
          : 0,
        reviewsDue,
        quizCount,
        interviewCount,
        streak: user?.streak || 0,
        lastSolvedAt: user?.lastSolvedAt,
        targetCompany: user?.targetCompany,
        interviewDate: user?.interviewDate,
        recentSolutions,
      },
    });
  } catch (err) {
    console.error("Personal stats error:", err);
    return error(res, "Failed to fetch stats.", 500);
  }
}

// ============================================================================
// TEAM LEADERBOARD
// ============================================================================

export async function getLeaderboard(req, res) {
  try {
    const teamId = req.teamId;

    // ── Get all active members in this team ────────────
    const members = await prisma.user.findMany({
      where: {
        currentTeamId: teamId,
        activityStatus: { not: "DORMANT" }, // Exclude dormant users
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        teamRole: true,
        streak: true,
        lastSolvedAt: true,
        activityStatus: true,
      },
    });

    // ── Get solution counts per user ───────────────────
    const solutionCounts = await prisma.$queryRaw`
  SELECT
    s."userId" as "userId",
    COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE p.difficulty = 'EASY')::int as easy,
    COUNT(*) FILTER (WHERE p.difficulty = 'MEDIUM')::int as medium,
    COUNT(*) FILTER (WHERE p.difficulty = 'HARD')::int as hard,
    ROUND(AVG(s.confidence), 1)::float as avg_confidence
  FROM solutions s
  JOIN problems p ON s."problemId" = p.id
  WHERE s."teamId" = ${teamId}
  GROUP BY s."userId"
`;

    // ── Map counts to members ──────────────────────────
    const countMap = new Map();
    for (const row of solutionCounts) {
      countMap.set(row.userId, row);
    }

    const leaderboard = members.map((member) => {
      const counts = countMap.get(member.id) || {
        total: 0,
        easy: 0,
        medium: 0,
        hard: 0,
        avg_confidence: 0,
      };

      return {
        ...member,
        totalSolved: counts.total,
        easySolved: counts.easy,
        mediumSolved: counts.medium,
        hardSolved: counts.hard,
        avgConfidence: counts.avg_confidence || 0,
      };
    });

    // ── Sort by: hard count desc, then total desc ──────
    leaderboard.sort((a, b) => {
      if (b.hardSolved !== a.hardSolved) return b.hardSolved - a.hardSolved;
      if (b.totalSolved !== a.totalSolved) return b.totalSolved - a.totalSolved;
      return b.streak - a.streak;
    });

    // ── Add rank ───────────────────────────────────────
    const ranked = leaderboard.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

    return success(res, { leaderboard: ranked });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return error(res, "Failed to fetch leaderboard.", 500);
  }
}

// ============================================================================
// 6D INTELLIGENCE REPORT (team-scoped)
// ============================================================================

export async function get6DReport(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

    // ── Fetch all user solutions in this team ──────────
    const solutions = await prisma.solution.findMany({
      where: { userId, teamId },
      select: {
        pattern: true,
        patternIdentificationTime: true,
        keyInsight: true,
        feynmanExplanation: true,
        realWorldConnection: true,
        confidence: true,
        bruteForce: true,
        optimizedApproach: true,
        timeComplexity: true,
        spaceComplexity: true,
        nextReviewDate: true,
        lastReviewedAt: true,
        reviewCount: true,
      },
    });

    const totalSolutions = solutions.length;

    if (totalSolutions === 0) {
      return success(res, {
        report: {
          dimensions: {
            patternRecognition: 0,
            solutionDepth: 0,
            communication: 0,
            optimization: 0,
            pressurePerformance: 0,
            knowledgeRetention: 0,
          },
          overall: 0,
          totalSolutions: 0,
          message: "Submit solutions to build your intelligence profile.",
        },
      });
    }

    // ── D1: Pattern Recognition ────────────────────────
    const withPattern = solutions.filter((s) => s.pattern).length;
    const uniquePatterns = new Set(
      solutions.filter((s) => s.pattern).map((s) => s.pattern),
    ).size;
    const patternRate = (withPattern / totalSolutions) * 60;
    const diversityRate = Math.min(uniquePatterns / 16, 1) * 40;
    const d1 = Math.round(patternRate + diversityRate);

    // ── D2: Solution Depth ─────────────────────────────
    const withInsight = solutions.filter((s) => s.keyInsight).length;
    const withFeynman = solutions.filter((s) => s.feynmanExplanation).length;
    const withRealWorld = solutions.filter((s) => s.realWorldConnection).length;
    const avgConf =
      solutions.reduce((s, r) => s + r.confidence, 0) / totalSolutions;
    const d2 = Math.round(
      (withInsight / totalSolutions) * 30 +
        (withFeynman / totalSolutions) * 30 +
        (withRealWorld / totalSolutions) * 20 +
        (avgConf / 5) * 20,
    );

    // ── D3: Communication (peer clarity ratings) ───────
    const clarityRatings = await prisma.clarityRating.findMany({
      where: {
        solution: { userId, teamId },
      },
      select: { rating: true },
    });
    const d3 =
      clarityRatings.length > 0
        ? Math.round(
            (clarityRatings.reduce((s, r) => s + r.rating, 0) /
              clarityRatings.length /
              5) *
              100,
          )
        : 0;

    // ── D4: Optimization ───────────────────────────────
    const withBrute = solutions.filter((s) => s.bruteForce).length;
    const withOptimized = solutions.filter((s) => s.optimizedApproach).length;
    const withBothComplexity = solutions.filter(
      (s) => s.timeComplexity && s.spaceComplexity,
    ).length;
    const d4 = Math.round(
      (withBrute / totalSolutions) * 25 +
        (withOptimized / totalSolutions) * 40 +
        (withBothComplexity / totalSolutions) * 35,
    );

    // ── D5: Pressure Performance ───────────────────────
    const sims = await prisma.simSession.findMany({
      where: { userId, teamId, completed: true },
      select: { score: true, hintsUsed: true },
    });
    const interviews = await prisma.interviewSession.findMany({
      where: { userId, teamId, status: "COMPLETED" },
      select: { scores: true },
    });
    const totalPressure = sims.length + interviews.length;
    let d5 = 0;
    if (totalPressure > 0) {
      const simRate = Math.min(sims.length / 5, 1) * 40;
      const avgSimScore =
        sims.length > 0
          ? (sims.reduce((s, r) => s + (r.score || 0), 0) / sims.length / 5) *
            40
          : 0;
      const noHint = sims.filter((s) => s.hintsUsed === 0).length;
      const noHintRate = sims.length > 0 ? (noHint / sims.length) * 20 : 0;
      d5 = Math.round(simRate + avgSimScore + noHintRate);
    }

    // ── D6: Knowledge Retention ────────────────────────
    const reviewed = solutions.filter((s) => s.reviewCount > 0).length;
    const reviewedConf = solutions.filter((s) => s.reviewCount > 0);
    const avgReviewConf =
      reviewedConf.length > 0
        ? reviewedConf.reduce((s, r) => s + r.confidence, 0) /
          reviewedConf.length
        : 0;
    const d6 = Math.round(
      (reviewed / totalSolutions) * 50 + (avgReviewConf / 5) * 50,
    );

    // ── Overall ────────────────────────────────────────
    const overall = Math.round((d1 + d2 + d3 + d4 + d5 + d6) / 6);

    return success(res, {
      report: {
        dimensions: {
          patternRecognition: Math.min(d1, 100),
          solutionDepth: Math.min(d2, 100),
          communication: Math.min(d3, 100),
          optimization: Math.min(d4, 100),
          pressurePerformance: Math.min(d5, 100),
          knowledgeRetention: Math.min(d6, 100),
        },
        overall: Math.min(overall, 100),
        totalSolutions,
        quizCount: await prisma.quizAttempt.count({
          where: { userId, teamId },
        }),
        interviewCount: interviews.length,
        simCount: sims.length,
      },
    });
  } catch (err) {
    console.error("6D report error:", err);
    return error(res, "Failed to generate report.", 500);
  }
}

// ============================================================================
// PLATFORM STATS (SUPER_ADMIN only)
// ============================================================================

export async function getPlatformStats(req, res) {
  try {
    const [
      totalUsers,
      totalTeams,
      activeTeams,
      pendingTeams,
      totalProblems,
      totalSolutions,
      totalQuizzes,
      totalInterviews,
      usersByStatus,
    ] = await Promise.all([
      prisma.user.count({ where: { globalRole: "USER" } }),
      prisma.team.count({ where: { isPersonal: false } }),
      prisma.team.count({ where: { status: "ACTIVE", isPersonal: false } }),
      prisma.team.count({ where: { status: "PENDING" } }),
      prisma.problem.count(),
      prisma.solution.count(),
      prisma.quizAttempt.count(),
      prisma.interviewSession.count(),
      prisma.user.groupBy({
        by: ["activityStatus"],
        _count: true,
      }),
    ]);

    const statusMap = {};
    usersByStatus.forEach((row) => {
      statusMap[row.activityStatus] = row._count;
    });

    return success(res, {
      platform: {
        totalUsers,
        totalTeams,
        activeTeams,
        pendingTeams,
        totalProblems,
        totalSolutions,
        totalQuizzes,
        totalInterviews,
        usersByActivity: {
          active: statusMap.ACTIVE || 0,
          inactive: statusMap.INACTIVE || 0,
          dormant: statusMap.DORMANT || 0,
        },
      },
    });
  } catch (err) {
    console.error("Platform stats error:", err);
    return error(res, "Failed to fetch platform stats.", 500);
  }
}

// ============================================================================
// SHOWCASE STATS (public-ish, for showcase page)
// ============================================================================

export async function getShowcaseStats(req, res) {
  try {
    const teamId = req.teamId;

    const [
      totalProblems,
      totalSolutions,
      totalQuizzes,
      totalSims,
      totalMembers,
      problemsByCategory,
      problemsByDifficulty,
    ] = await Promise.all([
      prisma.problem.count({ where: { teamId } }),
      prisma.solution.count({ where: { teamId } }),
      prisma.quizAttempt.count({ where: { teamId } }),
      prisma.interviewSession.count({ where: { teamId } }),
      prisma.user.count({ where: { currentTeamId: teamId } }),
      prisma.problem.groupBy({
        by: ["category"],
        where: { teamId },
        _count: true,
      }),
      prisma.problem.groupBy({
        by: ["difficulty"],
        where: { teamId },
        _count: true,
      }),
    ]);

    const catMap = {};
    problemsByCategory.forEach((row) => {
      catMap[row.category] = row._count;
    });

    const diffMap = {};
    problemsByDifficulty.forEach((row) => {
      diffMap[row.difficulty] = row._count;
    });

    return success(res, {
      data: {
        totalProblems,
        totalSolutions,
        totalQuizzes,
        totalSims,
        totalUsers: totalMembers,
        problemsByCategory: catMap,
        problemsByDifficulty: diffMap,
        aiEnabled: !!(await import("../config/env.js")).AI_ENABLED,
      },
    });
  } catch (err) {
    console.error("Showcase stats error:", err);
    return error(res, "Failed to fetch showcase stats.", 500);
  }
}

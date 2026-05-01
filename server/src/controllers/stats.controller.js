// ============================================================================
// ProbSolver v3.0 — Stats Controller (Team-Scoped)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

// Add near top of file, before any export
function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

// ============================================================================
// PERSONAL STATS (dashboard)
// ============================================================================
export async function getPersonalStats(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

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
      prisma.solution.count({ where: { userId, teamId } }),
      prisma.$queryRaw`
        SELECT p.difficulty, COUNT(*)::int as count
        FROM solutions s
        JOIN problems p ON s."problemId" = p.id
        WHERE s."userId" = ${userId} AND s."teamId" = ${teamId}
        GROUP BY p.difficulty
      `,
      prisma.$queryRaw`
        SELECT p.category, COUNT(*)::int as count
        FROM solutions s
        JOIN problems p ON s."problemId" = p.id
        WHERE s."userId" = ${userId} AND s."teamId" = ${teamId}
        GROUP BY p.category
      `,
      prisma.solution.aggregate({
        where: { userId, teamId },
        _avg: { confidence: true },
      }),
      prisma.solution.count({
        where: { userId, teamId, nextReviewDate: { lte: new Date() } },
      }),
      // Bug 3 fix: quizzes are personal — do not filter by teamId
      prisma.quizAttempt.count({ where: { userId } }),
      prisma.interviewSession.count({ where: { userId, teamId } }),
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

    const members = await prisma.user.findMany({
      where: {
        currentTeamId: teamId,
        activityStatus: { not: "DORMANT" },
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

    leaderboard.sort((a, b) => {
      if (b.hardSolved !== a.hardSolved) return b.hardSolved - a.hardSolved;
      if (b.totalSolved !== a.totalSolved) return b.totalSolved - a.totalSolved;
      return b.streak - a.streak;
    });

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

    // ── D3: Communication ─────────────────────────────
    // Bug 1 fix: use peer ratings when available, fall back to Feynman
    // quality proxy when no ratings exist. Proxy caps at 70 to be
    // honest — peer validation is a stronger signal than self-reported.
    const clarityRatings = await prisma.clarityRating.findMany({
      where: { solution: { userId, teamId } },
      select: { rating: true },
    });

    let d3;
    let communicationFromProxy = false;

    if (clarityRatings.length > 0) {
      // Real peer ratings — use them directly (scale 1-5 → 0-100)
      d3 = Math.round(
        (clarityRatings.reduce((s, r) => s + r.rating, 0) /
          clarityRatings.length /
          5) *
          100,
      );
    } else {
      // Bug 1 fix: proxy from user's own communication signals
      // Feynman explanations and real-world connections are written
      // communication artifacts — they reflect communication ability
      // even without peer validation
      communicationFromProxy = true;
      const withFeynmanComms = solutions.filter(
        (s) => stripHtml(s.feynmanExplanation).length > 20,
      ).length;
      const withRealWorldComms = solutions.filter(
        (s) => stripHtml(s.realWorldConnection).length > 15,
      ).length;
      const feynmanScore = (withFeynmanComms / totalSolutions) * 60;
      const realWorldScore = (withRealWorldComms / totalSolutions) * 40;
      d3 = Math.min(Math.round(feynmanScore + realWorldScore), 70);
    }

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
    // Bug 2 fix: include quiz performance alongside sims and interviews.
    // Quizzes are timed and directly measure performance under pressure.
    const [sims, interviews, quizzesForPressure] = await Promise.all([
      prisma.simSession.findMany({
        where: { userId, teamId, completed: true },
        select: { score: true, hintsUsed: true },
      }),
      prisma.interviewSession.findMany({
        where: { userId, teamId, status: "COMPLETED" },
        select: { scores: true },
      }),
      // Bug 3 fix: quizzes are personal — no teamId filter
      prisma.quizAttempt.findMany({
        where: { userId, completedAt: { not: null }, score: { not: null } },
        select: { score: true, timeSpent: true },
        orderBy: { createdAt: "desc" },
        take: 20, // Use most recent 20 for performance
      }),
    ]);

    let d5 = 0;
    const hasAnyPressureData =
      sims.length > 0 || interviews.length > 0 || quizzesForPressure.length > 0;

    if (hasAnyPressureData) {
      // Sim contribution (40% weight when sims exist)
      let simScore = 0;
      if (sims.length > 0) {
        const simCompletionRate = Math.min(sims.length / 5, 1) * 40;
        const avgSimScore =
          (sims.reduce((s, r) => s + (r.score || 0), 0) / sims.length / 5) * 40;
        const noHintRate =
          (sims.filter((s) => s.hintsUsed === 0).length / sims.length) * 20;
        simScore = simCompletionRate + avgSimScore + noHintRate;
      }

      // Interview contribution (standalone signal)
      const interviewScore =
        interviews.length > 0 ? Math.min(interviews.length / 3, 1) * 100 : 0;

      // Bug 2 fix: quiz contribution — avg score on timed quizzes
      let quizPressureScore = 0;
      if (quizzesForPressure.length > 0) {
        const avgQuizScore =
          quizzesForPressure.reduce((s, r) => s + (r.score || 0), 0) /
          quizzesForPressure.length;
        // Scale: avg quiz score maps directly to 0-100
        quizPressureScore = avgQuizScore;
      }

      // Weight: sims 40%, interviews 30%, quizzes 30%
      // Adjust weights based on what data actually exists
      const hasSims = sims.length > 0;
      const hasInterviews = interviews.length > 0;
      const hasQuizzes = quizzesForPressure.length > 0;

      if (hasSims && hasInterviews && hasQuizzes) {
        d5 = Math.round(
          simScore * 0.4 + interviewScore * 0.3 + quizPressureScore * 0.3,
        );
      } else if (hasSims && hasQuizzes) {
        d5 = Math.round(simScore * 0.5 + quizPressureScore * 0.5);
      } else if (hasInterviews && hasQuizzes) {
        d5 = Math.round(interviewScore * 0.5 + quizPressureScore * 0.5);
      } else if (hasSims && hasInterviews) {
        d5 = Math.round(simScore * 0.6 + interviewScore * 0.4);
      } else if (hasQuizzes) {
        // Only quizzes — use quiz score directly but cap at 80
        // Sims and interviews are harder pressure tests
        d5 = Math.min(Math.round(quizPressureScore), 80);
      } else if (hasSims) {
        d5 = Math.round(simScore);
      } else if (hasInterviews) {
        d5 = Math.round(interviewScore);
      }

      d5 = Math.min(d5, 100);
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
    // Bug 5 fix: when D3 is from proxy (no peer ratings), weight it
    // slightly less to avoid over-penalizing users with no teammates.
    // Redistributed weight goes to D1 and D2 which are most reliable.
    let overall;
    if (communicationFromProxy) {
      // D3 proxy: weight 0.8, D1 and D2 each get +0.067 extra weight
      overall = Math.round(
        d1 * (1 / 6 + 0.067) +
          d2 * (1 / 6 + 0.067) +
          d3 * ((1 / 6) * 0.8) +
          d4 * (1 / 6) +
          d5 * (1 / 6) +
          d6 * (1 / 6),
      );
    } else {
      overall = Math.round((d1 + d2 + d3 + d4 + d5 + d6) / 6);
    }

    // Bug 3 fix: quizCount uses userId only — quizzes are personal
    const quizCount = await prisma.quizAttempt.count({ where: { userId } });

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
        quizCount,
        interviewCount: interviews.length,
        simCount: sims.length,
        // Surface proxy flag to client so UI can show appropriate context
        communicationFromProxy,
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
// SHOWCASE STATS
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
      totalProblems,
      totalSolutions,
      totalQuizzes,
      totalSims,
      totalUsers: totalMembers,
      problemsByCategory: catMap,
      problemsByDifficulty: diffMap,
      aiEnabled: !!(await import("../config/env.js")).AI_ENABLED,
    });
  } catch (err) {
    console.error("Showcase stats error:", err);
    return error(res, "Failed to fetch showcase stats.", 500);
  }
}

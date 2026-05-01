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

    // Fetch all solutions with full data for analytics
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
        aiFeedback: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
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
            retention: 0,
          },
          overall: 0,
          totalSolutions: 0,
          message: "Submit solutions to build your intelligence profile.",
        },
      });
    }

    // ── D1: Pattern Recognition ──────────────────────
    const withPattern = solutions.filter((s) => s.pattern).length;
    const uniquePatterns = new Set(
      solutions.filter((s) => s.pattern).map((s) => s.pattern),
    );
    const patternRate = (withPattern / totalSolutions) * 60;
    const diversityRate = Math.min(uniquePatterns.size / 16, 1) * 40;
    const d1 = Math.round(patternRate + diversityRate);

    // ── D2: Solution Depth ───────────────────────────
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

    // ── D3: Communication ────────────────────────────
    function stripHtml(html) {
      if (!html) return "";
      return html.replace(/<[^>]*>/g, "").trim();
    }

    const clarityRatings = await prisma.clarityRating.findMany({
      where: { solution: { userId, teamId } },
      select: { rating: true },
    });

    let d3;
    let communicationFromProxy = false;

    if (clarityRatings.length > 0) {
      d3 = Math.round(
        (clarityRatings.reduce((s, r) => s + r.rating, 0) /
          clarityRatings.length /
          5) *
          100,
      );
    } else {
      communicationFromProxy = true;
      const withFeynmanComms = solutions.filter(
        (s) => stripHtml(s.feynmanExplanation).length > 20,
      ).length;
      const withRealWorldComms = solutions.filter(
        (s) => stripHtml(s.realWorldConnection).length > 15,
      ).length;
      d3 = Math.min(
        Math.round(
          (withFeynmanComms / totalSolutions) * 60 +
            (withRealWorldComms / totalSolutions) * 40,
        ),
        70,
      );
    }

    // ── D4: Optimization ─────────────────────────────
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

    // ── D5: Pressure Performance ─────────────────────
    const [sims, interviews, quizzesForPressure] = await Promise.all([
      prisma.simSession.findMany({
        where: { userId, teamId, completed: true },
        select: { score: true, hintsUsed: true },
      }),
      prisma.interviewSession.findMany({
        where: { userId, teamId, status: "COMPLETED" },
        select: { scores: true },
      }),
      prisma.quizAttempt.findMany({
        where: { userId, completedAt: { not: null }, score: { not: null } },
        select: { score: true, timeSpent: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    let d5 = 0;
    const hasSims = sims.length > 0;
    const hasInterviews = interviews.length > 0;
    const hasQuizzes = quizzesForPressure.length > 0;

    if (hasSims || hasInterviews || hasQuizzes) {
      let simScore = 0;
      if (hasSims) {
        const simCompletionRate = Math.min(sims.length / 5, 1) * 40;
        const avgSimScore =
          (sims.reduce((s, r) => s + (r.score || 0), 0) / sims.length / 5) * 40;
        const noHintRate =
          (sims.filter((s) => s.hintsUsed === 0).length / sims.length) * 20;
        simScore = simCompletionRate + avgSimScore + noHintRate;
      }
      const interviewScore = hasInterviews
        ? Math.min(interviews.length / 3, 1) * 100
        : 0;
      const quizPressureScore = hasQuizzes
        ? quizzesForPressure.reduce((s, r) => s + (r.score || 0), 0) /
          quizzesForPressure.length
        : 0;

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
        d5 = Math.min(Math.round(quizPressureScore), 80);
      } else if (hasSims) {
        d5 = Math.round(simScore);
      } else {
        d5 = Math.round(interviewScore);
      }
      d5 = Math.min(d5, 100);
    }

    // ── D6: Knowledge Retention ──────────────────────
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

    // ── Overall (weighted — D3 proxy gets 0.8 weight) ─
    let overall;
    if (communicationFromProxy) {
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

    // ════════════════════════════════════════════════
    // ANALYTICS LAYER
    // Everything below is additional intelligence beyond
    // the raw 6D scores. Used for the coaching sections.
    // ════════════════════════════════════════════════

    // ── 1. Weekly velocity (last 4 weeks) ─────────────
    // How many solutions per week over the past month.
    // Used for: "At this pace, you'll be ready in X weeks"
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const recentSolutions = solutions.filter(
      (s) => new Date(s.createdAt) >= fourWeeksAgo,
    );

    // Build weekly buckets [week4ago, week3ago, week2ago, thisWeek]
    const weeklyBuckets = [0, 0, 0, 0];
    recentSolutions.forEach((s) => {
      const daysAgo = Math.floor(
        (Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      const weekIdx = Math.min(Math.floor(daysAgo / 7), 3);
      weeklyBuckets[3 - weekIdx]++; // reverse so index 3 = this week
    });

    const avgWeeklyVelocity = weeklyBuckets.reduce((a, b) => a + b, 0) / 4;

    // ── 2. Pattern coverage gap ───────────────────────
    // The 16 canonical patterns from PATTERNS constant.
    // Which ones has the user never practiced?
    const CANONICAL_PATTERNS = [
      "Array / Hashing",
      "Two Pointers",
      "Sliding Window",
      "Stack",
      "Binary Search",
      "Linked List",
      "Trees",
      "Tries",
      "Heap / Priority Queue",
      "Backtracking",
      "Graphs",
      "Dynamic Programming",
      "Greedy",
      "Intervals",
      "Math & Geometry",
      "Bit Manipulation",
    ];

    const usedPatterns = new Set(
      solutions.filter((s) => s.pattern).map((s) => s.pattern),
    );
    const missingPatterns = CANONICAL_PATTERNS.filter(
      (p) => !usedPatterns.has(p),
    );

    // ── 3. AI review score trend ──────────────────────
    // Extract overallScore from aiFeedback JSON array.
    // Used for: "Your AI review scores are improving / declining"
    const aiScores = [];
    solutions.forEach((s) => {
      if (s.aiFeedback && Array.isArray(s.aiFeedback)) {
        s.aiFeedback.forEach((review) => {
          if (review.overallScore != null) {
            aiScores.push({
              score: review.overallScore,
              date: review.reviewedAt,
            });
          }
        });
      }
    });

    aiScores.sort((a, b) => new Date(a.date) - new Date(b.date));
    const recentAiScores = aiScores.slice(-5).map((s) => s.score);
    const avgAiScore =
      recentAiScores.length > 0
        ? Math.round(
            (recentAiScores.reduce((a, b) => a + b, 0) /
              recentAiScores.length) *
              10,
          )
        : null;

    // Trend: compare first half vs second half of ai scores
    let aiScoreTrend = null;
    if (aiScores.length >= 4) {
      const mid = Math.floor(aiScores.length / 2);
      const firstHalfAvg =
        aiScores.slice(0, mid).reduce((a, b) => a + b.score, 0) / mid;
      const secondHalfAvg =
        aiScores.slice(mid).reduce((a, b) => a + b.score, 0) /
        (aiScores.length - mid);
      if (secondHalfAvg > firstHalfAvg + 0.5) aiScoreTrend = "improving";
      else if (secondHalfAvg < firstHalfAvg - 0.5) aiScoreTrend = "declining";
      else aiScoreTrend = "stable";
    }

    // ── 4. Overdue reviews ────────────────────────────
    // Ebbinghaus forgetting curve: missed reviews = lost retention
    const overdueReviews = await prisma.solution.count({
      where: {
        userId,
        teamId,
        nextReviewDate: { lte: new Date() },
      },
    });

    // ── 5. Confidence trend ───────────────────────────
    // Compare avg confidence of first 5 solutions vs last 5
    let confidenceTrend = null;
    if (solutions.length >= 6) {
      const first5Avg =
        solutions.slice(0, 5).reduce((a, b) => a + b.confidence, 0) / 5;
      const last5Avg =
        solutions.slice(-5).reduce((a, b) => a + b.confidence, 0) / 5;
      if (last5Avg > first5Avg + 0.3) confidenceTrend = "improving";
      else if (last5Avg < first5Avg - 0.3) confidenceTrend = "declining";
      else confidenceTrend = "stable";
    }

    // ── 6. Optimization completion rate ──────────────
    // What % of solutions have BOTH brute force and optimized
    // This is the single most actionable metric for most users
    const bothApproachesRate =
      totalSolutions > 0
        ? Math.round(
            (solutions.filter((s) => s.bruteForce && s.optimizedApproach)
              .length /
              totalSolutions) *
              100,
          )
        : 0;

    // ── 7. Quiz data for coaching ─────────────────────
    const quizCount = await prisma.quizAttempt.count({ where: { userId } });

    // Get quiz performance by subject for coaching recommendations
    const quizHistory = await prisma.quizAttempt.findMany({
      where: { userId, completedAt: { not: null }, score: { not: null } },
      select: { subject: true, score: true, difficulty: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    // Group by subject, compute avg score
    const quizBySubject = {};
    quizHistory.forEach((q) => {
      if (!quizBySubject[q.subject]) quizBySubject[q.subject] = [];
      quizBySubject[q.subject].push(q.score);
    });

    const weakQuizSubjects = Object.entries(quizBySubject)
      .map(([subject, scores]) => ({
        subject,
        avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        attempts: scores.length,
      }))
      .filter((s) => s.avg < 60)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3);

    // ── 8. Weeks to readiness estimate ───────────────
    // Based on current velocity and gap to next threshold
    // Thresholds: phone_screen=55, technical_screen=65, onsite=75
    const THRESHOLDS = {
      phone_screen: 55,
      technical_screen: 65,
      onsite: 75,
      faang: 85,
    };

    // Each week of practice at current velocity contributes ~1.5 points
    // to overall (empirical estimate based on 6D formula weights)
    const pointsPerWeek = Math.max(avgWeeklyVelocity * 1.5, 0.5);

    const weeksToThresholds = {};
    Object.entries(THRESHOLDS).forEach(([tier, threshold]) => {
      const gap = threshold - Math.min(overall, 100);
      weeksToThresholds[tier] = gap <= 0 ? 0 : Math.ceil(gap / pointsPerWeek);
    });

    // ── Finalize dimensions ───────────────────────────
    const dimensions = {
      patternRecognition: Math.min(d1, 100),
      solutionDepth: Math.min(d2, 100),
      communication: Math.min(d3, 100),
      optimization: Math.min(d4, 100),
      pressurePerformance: Math.min(d5, 100),
      retention: Math.min(d6, 100),
    };

    return success(res, {
      report: {
        dimensions,
        overall: Math.min(overall, 100),
        totalSolutions,
        quizCount,
        interviewCount: interviews.length,
        simCount: sims.length,
        communicationFromProxy,
        // Analytics layer — used by coaching sections
        analytics: {
          weeklyVelocity: {
            avg: Math.round(avgWeeklyVelocity * 10) / 10,
            weekly: weeklyBuckets, // [week4ago, week3ago, week2ago, thisWeek]
          },
          patternCoverage: {
            used: usedPatterns.size,
            total: CANONICAL_PATTERNS.length,
            missing: missingPatterns,
          },
          aiReview: {
            avgScore: avgAiScore,
            trend: aiScoreTrend,
            recentScores: recentAiScores,
          },
          overdueReviews,
          confidenceTrend,
          optimizationRate: bothApproachesRate,
          weakQuizSubjects,
          weeksToThresholds,
          pointsPerWeek: Math.round(pointsPerWeek * 10) / 10,
        },
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

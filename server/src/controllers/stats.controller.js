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

    function stripHtml(html) {
      if (!html) return "";
      return html.replace(/<[^>]*>/g, "").trim();
    }

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

    // ════════════════════════════════════════════════
    // EXTRACT AI REVIEW DATA
    // AI reviews are the most honest signal — they see the actual code
    // ════════════════════════════════════════════════
    const allAiReviews = [];
    solutions.forEach((s) => {
      if (s.aiFeedback && Array.isArray(s.aiFeedback)) {
        // Use most recent review per solution
        const latest = s.aiFeedback[s.aiFeedback.length - 1];
        if (latest) allAiReviews.push(latest);
      }
    });

    const reviewedSolutions = allAiReviews.length;

    // Extract key quality signals from AI reviews
    const aiOverallScores = allAiReviews
      .map((r) => r.overallScore)
      .filter((s) => s != null);

    const aiAvgOverall =
      aiOverallScores.length > 0
        ? aiOverallScores.reduce((a, b) => a + b, 0) / aiOverallScores.length
        : null;

    // Count critical flags across all reviews
    const incompleteCount = allAiReviews.filter(
      (r) => r.flags?.incompleteSubmission === true,
    ).length;
    const wrongPatternCount = allAiReviews.filter(
      (r) => r.flags?.wrongPattern === true,
    ).length;
    const overconfidenceCount = allAiReviews.filter(
      (r) => r.flags?.overconfidenceDetected === true,
    ).length;

    // Extract dimension scores from AI reviews
    const aiPatternAccuracyScores = allAiReviews
      .map((r) => r.dimensionScores?.patternAccuracy)
      .filter((s) => s != null);
    const aiExplanationScores = allAiReviews
      .map((r) => r.dimensionScores?.explanationQuality)
      .filter((s) => s != null);
    const aiUnderstandingScores = allAiReviews
      .map((r) => r.dimensionScores?.understandingDepth)
      .filter((s) => s != null);
    const aiCodeCorrectnessScores = allAiReviews
      .map((r) => r.dimensionScores?.codeCorrectness)
      .filter((s) => s != null);

    const avgAiPatternAccuracy =
      aiPatternAccuracyScores.length > 0
        ? aiPatternAccuracyScores.reduce((a, b) => a + b, 0) /
          aiPatternAccuracyScores.length
        : null;
    const avgAiExplanation =
      aiExplanationScores.length > 0
        ? aiExplanationScores.reduce((a, b) => a + b, 0) /
          aiExplanationScores.length
        : null;
    const avgAiUnderstanding =
      aiUnderstandingScores.length > 0
        ? aiUnderstandingScores.reduce((a, b) => a + b, 0) /
          aiUnderstandingScores.length
        : null;

    // ════════════════════════════════════════════════
    // D1: Pattern Recognition — quality-weighted
    // ════════════════════════════════════════════════
    const withPattern = solutions.filter((s) => s.pattern).length;
    const uniquePatterns = new Set(
      solutions.filter((s) => s.pattern).map((s) => s.pattern),
    );

    // Solutions where pattern was labeled correctly (no wrongPattern flag from AI)
    // We cross-reference: solutions with pattern AND an AI review AND no wrongPattern flag
    const correctPatternCount = allAiReviews.filter(
      (r) =>
        r.flags?.wrongPattern !== true &&
        r.dimensionScores?.patternAccuracy >= 5,
    ).length;

    // Base: did you attempt pattern identification?
    const patternAttemptRate = (withPattern / totalSolutions) * 30;

    // Quality: how accurate were your pattern identifications?
    // If AI reviews exist, use them. Otherwise use presence only.
    let patternQualityScore;
    if (avgAiPatternAccuracy !== null) {
      // AI pattern accuracy score (1-10) → 0-50 contribution
      patternQualityScore = (avgAiPatternAccuracy / 10) * 50;
    } else {
      // No AI reviews: credit for having patterns but cap at 30
      patternQualityScore =
        withPattern > 0 ? Math.min((withPattern / totalSolutions) * 30, 30) : 0;
    }

    // Diversity bonus
    const diversityBonus = Math.min(uniquePatterns.size / 16, 1) * 20;

    // Wrong pattern penalty: each wrong pattern identified = -5 points
    const wrongPatternPenalty =
      reviewedSolutions > 0 ? (wrongPatternCount / reviewedSolutions) * 20 : 0;

    const d1 = Math.max(
      Math.round(
        patternAttemptRate +
          patternQualityScore +
          diversityBonus -
          wrongPatternPenalty,
      ),
      0,
    );

    // ════════════════════════════════════════════════
    // D2: Solution Depth — quality-weighted
    // ════════════════════════════════════════════════
    // Measure meaningful content, not presence of any content
    const INSIGHT_MIN_CHARS = 30;
    const FEYNMAN_MIN_CHARS = 80;
    const REALWORLD_MIN_CHARS = 50;

    const withMeaningfulInsight = solutions.filter(
      (s) => stripHtml(s.keyInsight).length >= INSIGHT_MIN_CHARS,
    ).length;
    const withMeaningfulFeynman = solutions.filter(
      (s) => stripHtml(s.feynmanExplanation).length >= FEYNMAN_MIN_CHARS,
    ).length;
    const withMeaningfulRealWorld = solutions.filter(
      (s) => stripHtml(s.realWorldConnection).length >= REALWORLD_MIN_CHARS,
    ).length;

    // Confidence weighted by self-assessment calibration
    // Overconfident solutions (AI flags) should reduce the confidence signal
    const overconfidencePenaltyFactor =
      reviewedSolutions > 0
        ? 1 - (overconfidenceCount / reviewedSolutions) * 0.4
        : 1;
    const avgConf =
      solutions.reduce((s, r) => s + r.confidence, 0) / totalSolutions;
    const calibratedConfScore = (avgConf / 5) * overconfidencePenaltyFactor;

    // Base depth score from meaningful content
    const baseDepth = Math.round(
      (withMeaningfulInsight / totalSolutions) * 25 +
        (withMeaningfulFeynman / totalSolutions) * 30 +
        (withMeaningfulRealWorld / totalSolutions) * 20 +
        calibratedConfScore * 25,
    );

    // AI understanding score overlay: if AI reviewed solutions,
    // blend AI's assessment of understanding depth
    let d2;
    if (avgAiUnderstanding !== null) {
      const aiDepthScore = (avgAiUnderstanding / 10) * 100;
      // Weighted blend: 60% AI assessment, 40% behavioral signals
      d2 = Math.round(aiDepthScore * 0.6 + baseDepth * 0.4);
    } else {
      d2 = baseDepth;
    }

    // ════════════════════════════════════════════════
    // D3: Communication
    // ════════════════════════════════════════════════
    const clarityRatings = await prisma.clarityRating.findMany({
      where: { solution: { userId, teamId } },
      select: { rating: true },
    });

    let d3;
    let communicationFromProxy = false;

    if (clarityRatings.length > 0) {
      // Peer ratings are the gold standard
      d3 = Math.round(
        (clarityRatings.reduce((s, r) => s + r.rating, 0) /
          clarityRatings.length /
          5) *
          100,
      );
    } else if (avgAiExplanation !== null) {
      // AI explanation quality score is more reliable than just presence
      communicationFromProxy = true;
      d3 = Math.min(Math.round((avgAiExplanation / 10) * 75), 75);
    } else {
      // Fallback: presence-based proxy, capped very low
      communicationFromProxy = true;
      const withMeaningfulComms = solutions.filter(
        (s) => stripHtml(s.feynmanExplanation).length >= FEYNMAN_MIN_CHARS,
      ).length;
      d3 = Math.min(
        Math.round((withMeaningfulComms / totalSolutions) * 50),
        50,
      );
    }

    // ════════════════════════════════════════════════
    // D4: Optimization — unchanged (this is the most honest behavioral signal)
    // ════════════════════════════════════════════════
    const withBrute = solutions.filter(
      (s) => s.bruteForce && s.bruteForce.trim().length > 10,
    ).length;
    const withOptimized = solutions.filter(
      (s) => s.optimizedApproach && s.optimizedApproach.trim().length > 10,
    ).length;
    const withBothApproaches = solutions.filter(
      (s) =>
        s.bruteForce &&
        s.bruteForce.trim().length > 10 &&
        s.optimizedApproach &&
        s.optimizedApproach.trim().length > 10,
    ).length;
    const withBothComplexity = solutions.filter(
      (s) => s.timeComplexity && s.spaceComplexity,
    ).length;

    const d4 = Math.round(
      (withBrute / totalSolutions) * 20 +
        (withOptimized / totalSolutions) * 30 +
        (withBothApproaches / totalSolutions) * 30 +
        (withBothComplexity / totalSolutions) * 20,
    );

    // ════════════════════════════════════════════════
    // D5: Pressure Performance — performance-weighted
    // ════════════════════════════════════════════════
    const [sims, interviews, quizzesForPressure] = await Promise.all([
      prisma.simSession.findMany({
        where: { userId, teamId, completed: true },
        select: { score: true, hintsUsed: true },
      }),
      prisma.interviewSession.findMany({
        where: { userId, teamId, status: "COMPLETED" },
        select: { scores: true, debrief: true },
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
      // Sim score: weighted by performance, not just completion
      let simScore = 0;
      if (hasSims) {
        const avgSimScore =
          sims.reduce((s, r) => s + (r.score || 0), 0) / sims.length;
        const noHintRate =
          sims.filter((s) => s.hintsUsed === 0).length / sims.length;
        // Scale: avg score (0-5) → 0-100, bonus for no-hint sessions
        simScore = Math.min((avgSimScore / 5) * 80 + noHintRate * 20, 100);
      }

      // Interview score: use actual debrief scores if available
      // If no debrief scores, interviews count very little (just attempted)
      let interviewScore = 0;
      if (hasInterviews) {
        const interviewsWithScores = interviews.filter(
          (i) =>
            i.scores &&
            typeof i.scores === "object" &&
            Object.keys(i.scores).length > 0,
        );
        if (interviewsWithScores.length > 0) {
          // Extract numeric scores from debrief — structure varies
          const scoreValues = interviewsWithScores.flatMap((i) => {
            const scores = i.scores;
            if (Array.isArray(scores))
              return scores.filter((s) => typeof s === "number");
            if (typeof scores === "object") {
              return Object.values(scores).filter((s) => typeof s === "number");
            }
            return [];
          });
          if (scoreValues.length > 0) {
            const avgInterviewScore =
              scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
            // Normalize to 0-100 (assuming scores are 0-10 scale)
            interviewScore = Math.min((avgInterviewScore / 10) * 100, 100);
          } else {
            // Has interviews with debrief but no numeric scores — partial credit
            interviewScore = Math.min(interviewsWithScores.length * 8, 40);
          }
        } else {
          // Interviews completed but no debrief scores — minimal credit
          // This catches "start interview, immediately end it" behavior
          interviewScore = Math.min(interviews.length * 3, 15);
        }
      }

      // Quiz score: avg performance (already the most honest signal)
      const quizPressureScore = hasQuizzes
        ? quizzesForPressure.reduce((s, r) => s + (r.score || 0), 0) /
          quizzesForPressure.length
        : 0;

      // Weighted blend based on what data exists
      const hasSims2 = hasSims;
      const hasInts = hasInterviews;
      const hasQzs = hasQuizzes;

      if (hasSims2 && hasInts && hasQzs) {
        d5 = Math.round(
          simScore * 0.35 + interviewScore * 0.3 + quizPressureScore * 0.35,
        );
      } else if (hasSims2 && hasQzs) {
        d5 = Math.round(simScore * 0.5 + quizPressureScore * 0.5);
      } else if (hasInts && hasQzs) {
        d5 = Math.round(interviewScore * 0.4 + quizPressureScore * 0.6);
      } else if (hasSims2 && hasInts) {
        d5 = Math.round(simScore * 0.6 + interviewScore * 0.4);
      } else if (hasQzs) {
        d5 = Math.min(Math.round(quizPressureScore), 75);
      } else if (hasSims2) {
        d5 = Math.round(simScore);
      } else {
        d5 = Math.round(interviewScore);
      }

      d5 = Math.min(d5, 100);
    }

    // ════════════════════════════════════════════════
    // D6: Knowledge Retention — decay-penalized
    // ════════════════════════════════════════════════
    const overdueCount = await prisma.solution.count({
      where: { userId, teamId, nextReviewDate: { lte: new Date() } },
    });

    const reviewed = solutions.filter((s) => s.reviewCount > 0).length;
    const reviewedSols = solutions.filter((s) => s.reviewCount > 0);

    // Post-review confidence: what was confidence AFTER reviews
    // Low confidence after review = not retained
    const avgPostReviewConf =
      reviewedSols.length > 0
        ? reviewedSols.reduce((s, r) => s + r.confidence, 0) /
          reviewedSols.length
        : 0;

    // Overdue ratio: higher = more careless about retention
    const overdueRatio = totalSolutions > 0 ? overdueCount / totalSolutions : 0;

    const d6Raw = Math.round(
      (reviewed / totalSolutions) * 40 +
        (avgPostReviewConf / 5) * 40 -
        overdueRatio * 30, // Penalty: overdue reviews = carelessness
    );
    const d6 = Math.max(d6Raw, 0);

    // ════════════════════════════════════════════════
    // OVERALL — AI quality gate + weighted average
    // ════════════════════════════════════════════════
    // Weights reflect actual interview importance:
    // D4 Optimization and D1 Pattern are most tested in technical screens
    const WEIGHTS = {
      patternRecognition: 0.2,
      solutionDepth: 0.18,
      communication: 0.12,
      optimization: 0.22,
      pressurePerformance: 0.16,
      retention: 0.12,
    };

    const weightedSum =
      Math.min(d1, 100) * WEIGHTS.patternRecognition +
      Math.min(d2, 100) * WEIGHTS.solutionDepth +
      Math.min(d3, 100) * WEIGHTS.communication +
      Math.min(d4, 100) * WEIGHTS.optimization +
      Math.min(d5, 100) * WEIGHTS.pressurePerformance +
      Math.min(d6, 100) * WEIGHTS.retention;

    let overall = Math.round(weightedSum);

    // ── AI Quality Gate ────────────────────────────
    // If AI has reviewed solutions and the avg score is poor,
    // cap the overall. You cannot claim 60/100 readiness if
    // AI consistently gives your solutions 1-2/10.
    // This is the most honest check in the entire model.
    if (aiAvgOverall !== null) {
      // AI overall scores are 1-10. Map to 0-100 scale.
      const aiQualityCap = Math.round((aiAvgOverall / 10) * 100);

      // Cap formula: overall cannot exceed the AI quality cap by more than 15 points
      // The 15-point buffer allows behavioral signals to partially offset
      // poor AI scores (e.g. user who practices but hasn't been reviewed on best solutions)
      const maxAllowed = Math.min(aiQualityCap + 15, 100);
      overall = Math.min(overall, maxAllowed);
    }

    // Penalty for systematic overconfidence
    if (
      reviewedSolutions > 0 &&
      overconfidenceCount / reviewedSolutions > 0.5
    ) {
      overall = Math.round(overall * 0.85);
    }

    // ════════════════════════════════════════════════
    // ANALYTICS LAYER
    // ════════════════════════════════════════════════
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const recentSolutions = solutions.filter(
      (s) => new Date(s.createdAt) >= fourWeeksAgo,
    );

    const weeklyBuckets = [0, 0, 0, 0];
    recentSolutions.forEach((s) => {
      const daysAgo = Math.floor(
        (Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      const weekIdx = Math.min(Math.floor(daysAgo / 7), 3);
      weeklyBuckets[3 - weekIdx]++;
    });
    const avgWeeklyVelocity = weeklyBuckets.reduce((a, b) => a + b, 0) / 4;

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

    // AI review trend
    const aiScoreTimeline = [];
    solutions.forEach((s) => {
      if (s.aiFeedback && Array.isArray(s.aiFeedback)) {
        s.aiFeedback.forEach((r) => {
          if (r.overallScore != null)
            aiScoreTimeline.push({ score: r.overallScore, date: r.reviewedAt });
        });
      }
    });
    aiScoreTimeline.sort((a, b) => new Date(a.date) - new Date(b.date));
    const recentAiScores = aiScoreTimeline.slice(-5).map((s) => s.score);

    let aiScoreTrend = null;
    if (aiScoreTimeline.length >= 4) {
      const mid = Math.floor(aiScoreTimeline.length / 2);
      const firstHalfAvg =
        aiScoreTimeline.slice(0, mid).reduce((a, b) => a + b.score, 0) / mid;
      const secondHalfAvg =
        aiScoreTimeline.slice(mid).reduce((a, b) => a + b.score, 0) /
        (aiScoreTimeline.length - mid);
      aiScoreTrend =
        secondHalfAvg > firstHalfAvg + 0.5
          ? "improving"
          : secondHalfAvg < firstHalfAvg - 0.5
            ? "declining"
            : "stable";
    }

    let confidenceTrend = null;
    if (solutions.length >= 6) {
      const first5Avg =
        solutions.slice(0, 5).reduce((a, b) => a + b.confidence, 0) / 5;
      const last5Avg =
        solutions.slice(-5).reduce((a, b) => a + b.confidence, 0) / 5;
      confidenceTrend =
        last5Avg > first5Avg + 0.3
          ? "improving"
          : last5Avg < first5Avg - 0.3
            ? "declining"
            : "stable";
    }

    const bothApproachesRate =
      totalSolutions > 0
        ? Math.round((withBothApproaches / totalSolutions) * 100)
        : 0;

    const quizCount = await prisma.quizAttempt.count({ where: { userId } });
    const quizHistory = await prisma.quizAttempt.findMany({
      where: { userId, completedAt: { not: null }, score: { not: null } },
      select: { subject: true, score: true, difficulty: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
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

    const pointsPerWeek = Math.max(avgWeeklyVelocity * 1.2, 0.5);
    const THRESHOLDS = {
      phone_screen: 45,
      technical_screen: 58,
      onsite: 70,
      faang: 82,
    };
    const weeksToThresholds = {};
    Object.entries(THRESHOLDS).forEach(([tier, threshold]) => {
      const gap = threshold - Math.min(overall, 100);
      weeksToThresholds[tier] = gap <= 0 ? 0 : Math.ceil(gap / pointsPerWeek);
    });

    const finalDimensions = {
      patternRecognition: Math.min(d1, 100),
      solutionDepth: Math.min(d2, 100),
      communication: Math.min(d3, 100),
      optimization: Math.min(d4, 100),
      pressurePerformance: Math.min(d5, 100),
      retention: Math.min(d6, 100),
    };

    return success(res, {
      report: {
        dimensions: finalDimensions,
        overall: Math.min(overall, 100),
        totalSolutions,
        quizCount,
        interviewCount: interviews.length,
        simCount: sims.length,
        communicationFromProxy,
        // Transparency: show what's affecting the score
        scoringSignals: {
          aiReviewedSolutions: reviewedSolutions,
          avgAiScore:
            aiAvgOverall !== null ? Math.round(aiAvgOverall * 10) / 10 : null,
          incompleteSubmissions: incompleteCount,
          wrongPatternFlags: wrongPatternCount,
          overconfidenceFlags: overconfidenceCount,
          overdueReviews: overdueCount,
          bothApproachesRate,
        },
        analytics: {
          weeklyVelocity: {
            avg: Math.round(avgWeeklyVelocity * 10) / 10,
            weekly: weeklyBuckets,
          },
          patternCoverage: {
            used: usedPatterns.size,
            total: CANONICAL_PATTERNS.length,
            missing: missingPatterns,
          },
          aiReview: {
            avgScore:
              aiAvgOverall !== null ? Math.round(aiAvgOverall * 10) / 10 : null,
            trend: aiScoreTrend,
            recentScores: recentAiScores,
          },
          overdueReviews: overdueCount,
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

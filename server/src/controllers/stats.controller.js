// ============================================================================
// ProbSolver v3.0 — Stats Controller (Team-Scoped)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

// ============================================================================
// QUIZ SUBJECT → 6D DIMENSION MAPPER
// ============================================================================
//
// Maps free-text quiz subjects to the 6D dimensions they signal.
// Uses keyword matching — multiple keywords per dimension to handle
// how users naturally name quiz subjects ("Binary Search", "BST",
// "binary search trees" all signal D1).
//
// Scientific basis:
// - D1 Pattern Recognition: knowledge of algorithm patterns and data structures
//   is a prerequisite for pattern identification speed under pressure.
// - D2 Solution Depth: CS fundamentals and concept quizzes test the depth of
//   understanding that underpins Feynman-quality explanations.
// - D3 Communication: behavioral and soft-skills quizzes signal awareness of
//   communication frameworks (STAR, etc.) even if not direct communication skill.
// - D4 Optimization: algorithm complexity and optimization quizzes directly
//   signal knowledge of the trade-offs D4 measures behaviorally.
//
// A quiz can map to multiple dimensions (e.g. "Dynamic Programming" → D1 + D2).
// Weights are modest (max 15 pts) — quizzes are declarative knowledge signals,
// not behavioral performance signals. They supplement but never replace
// actual solution data.
//
// ============================================================================
const QUIZ_DIMENSION_MAP = {
  d1_patterns: {
    // Pattern Recognition — algorithm and data structure knowledge
    keywords: [
      "array",
      "hashing",
      "hash map",
      "hash table",
      "two pointer",
      "sliding window",
      "binary search",
      "stack",
      "queue",
      "linked list",
      "tree",
      "bst",
      "binary tree",
      "trie",
      "heap",
      "priority queue",
      "graph",
      "dynamic programming",
      "dp ",
      " dp",
      "greedy",
      "backtracking",
      "recursion",
      "sorting",
      "searching",
      "interval",
      "bit manipulation",
      "bitwise",
      "math",
      "pattern",
      "algorithm",
      "data structure",
      "leetcode",
      "coding interview",
      "neetcode",
    ],
    maxContribution: 15,
  },
  d2_depth: {
    // Solution Depth — conceptual understanding and CS fundamentals
    keywords: [
      "operating system",
      "os ",
      " os",
      "process",
      "thread",
      "concurrency",
      "networking",
      "tcp",
      "udp",
      "http",
      "dns",
      "network",
      "database",
      "dbms",
      "sql",
      "nosql",
      "indexing",
      "b-tree",
      "acid",
      "cap theorem",
      "distributed",
      "consistency",
      "availability",
      "object oriented",
      "oop",
      "solid",
      "design pattern",
      "singleton",
      "factory",
      "observer",
      "mvc",
      "rest",
      "api design",
      "memory",
      "cache",
      "virtual memory",
      "garbage collection",
      "computer science",
      "cs fundamental",
      "computer architecture",
      "complexity",
      "big o",
      "time complexity",
      "space complexity",
      "functional programming",
      "system design concept",
    ],
    maxContribution: 10,
  },
  d3_communication: {
    // Communication — behavioral and communication framework knowledge
    keywords: [
      "behavioral",
      "star method",
      "star format",
      "soft skill",
      "communication",
      "leadership",
      "conflict resolution",
      "teamwork",
      "collaboration",
      "hr ",
      " hr",
      "interview skill",
      "situational",
      "amazon leadership",
      "leadership principle",
      "emotional intelligence",
      "presentation",
    ],
    maxContribution: 10,
  },
  d4_optimization: {
    // Optimization — complexity analysis and optimization technique knowledge
    keywords: [
      "optimization",
      "complexity analysis",
      "performance",
      "space complexity",
      "time complexity",
      "efficient",
      "scalability",
      "query optimization",
      "index",
      "database optimization",
      "memory optimization",
      "big o",
      "amortized",
      "trade off",
      "system optimization",
      "bottleneck",
      "profiling",
    ],
    maxContribution: 12,
  },
};

// Returns which dimensions a quiz subject maps to and at what score weight
function mapQuizSubjectToDimensions(subject) {
  const normalized = subject.toLowerCase();
  const mappings = [];

  for (const [dimKey, config] of Object.entries(QUIZ_DIMENSION_MAP)) {
    const matched = config.keywords.some((kw) => normalized.includes(kw));
    if (matched) {
      mappings.push({ dimKey, maxContribution: config.maxContribution });
    }
  }

  return mappings;
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
      // Quizzes are personal — do not filter by teamId
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
// TEAM LEADERBOARD — Composite Score Formula
// ============================================================================
//
// COMPOSITE SCORE (0-100):
//   Component 1 — Solution Quality Score (SQS)      40%
//   Component 2 — Problem Difficulty Distribution   25%
//   Component 3 — Consistency Score                 20%
//   Component 4 — Knowledge Retention Score         10%
//   Component 5 — Pattern Breadth Score              5%
//
// ANTI-GAMING:
//   - SQS requires AI review or peer rating to exceed 50
//   - PDDS is halved if SQS < 40 (can't claim difficulty credit with no quality)
//   - Self-reported confidence has max 10% influence and is penalized for
//     overconfidence detected by AI
//   - Retention uses SM-2 EF + Ebbinghaus decay — cannot be gamed
//
// ============================================================================
export async function getLeaderboard(req, res) {
  try {
    const teamId = req.teamId;

    // ── Load all team members ──────────────────────────
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
        lastActiveAt: true,
        activityStatus: true,
      },
    });

    if (members.length === 0) {
      return success(res, { leaderboard: [] });
    }

    const memberIds = members.map((m) => m.id);

    // ── Load all solutions for this team (batch, not per-user) ──
    const allSolutions = await prisma.solution.findMany({
      where: {
        teamId,
        userId: { in: memberIds },
      },
      select: {
        userId: true,
        confidence: true,
        pattern: true,
        bruteForce: true,
        optimizedApproach: true,
        timeComplexity: true,
        spaceComplexity: true,
        aiFeedback: true,
        sm2EasinessFactor: true,
        sm2Repetitions: true,
        nextReviewDate: true,
        lastReviewedAt: true,
        reviewCount: true,
        createdAt: true,
        problem: {
          select: { difficulty: true },
        },
      },
    });

    // ── Load peer clarity ratings (batch) ─────────────
    const allClarityRatings = await prisma.clarityRating.findMany({
      where: { teamId },
      select: {
        rating: true,
        solution: { select: { userId: true } },
      },
    });

    // ── Load quiz attempts (personal — no teamId filter) ──
    // Quizzes are personal but feed into pressure performance
    // We only need recent performance for consistency component
    const allQuizzes = await prisma.quizAttempt.findMany({
      where: {
        userId: { in: memberIds },
        completedAt: { not: null },
        score: { not: null },
      },
      select: {
        userId: true,
        score: true,
        completedAt: true,
      },
      orderBy: { completedAt: "desc" },
    });

    // ── Group all data by userId ────────────────────────
    const solutionsByUser = new Map();
    const ratingsByUser = new Map();
    const quizzesByUser = new Map();

    memberIds.forEach((id) => {
      solutionsByUser.set(id, []);
      ratingsByUser.set(id, []);
      quizzesByUser.set(id, []);
    });

    allSolutions.forEach((s) => {
      if (solutionsByUser.has(s.userId)) {
        solutionsByUser.get(s.userId).push(s);
      }
    });

    allClarityRatings.forEach((r) => {
      const userId = r.solution?.userId;
      if (userId && ratingsByUser.has(userId)) {
        ratingsByUser.get(userId).push(r.rating);
      }
    });

    allQuizzes.forEach((q) => {
      if (quizzesByUser.has(q.userId)) {
        quizzesByUser.get(q.userId).push(q);
      }
    });

    const now = Date.now();
    const CANONICAL_PATTERN_COUNT = 16;

    // ══════════════════════════════════════════════════
    // COMPUTE COMPOSITE SCORE PER MEMBER
    // ══════════════════════════════════════════════════
    const scored = members.map((member) => {
      const solutions = solutionsByUser.get(member.id) || [];
      const clarityRatings = ratingsByUser.get(member.id) || [];
      const quizzes = quizzesByUser.get(member.id) || [];
      const totalSolutions = solutions.length;

      // ── Difficulty counts ─────────────────────────
      const easySolved = solutions.filter(
        (s) => s.problem?.difficulty === "EASY",
      ).length;
      const mediumSolved = solutions.filter(
        (s) => s.problem?.difficulty === "MEDIUM",
      ).length;
      const hardSolved = solutions.filter(
        (s) => s.problem?.difficulty === "HARD",
      ).length;

      // ─────────────────────────────────────────────
      // COMPONENT 1: Solution Quality Score (SQS) — 40%
      //
      // Measures actual quality of submitted solutions.
      // AI reviews are the most trustworthy signal (objective).
      // Peer ratings are second (social proof, hard to game).
      // Self-reported confidence is last (subjective, gameable).
      // ─────────────────────────────────────────────
      let sqs = 0;

      if (totalSolutions === 0) {
        sqs = 0;
      } else {
        // Extract AI review overall scores
        const aiOverallScores = [];
        let overconfidenceFlags = 0;
        let reviewedCount = 0;

        solutions.forEach((s) => {
          if (s.aiFeedback && Array.isArray(s.aiFeedback)) {
            const latest = s.aiFeedback[s.aiFeedback.length - 1];
            if (latest?.overallScore != null) {
              aiOverallScores.push(latest.overallScore); // 1-10 scale
              reviewedCount++;
              if (latest.flags?.overconfidenceDetected) overconfidenceFlags++;
            }
          }
        });

        const hasAiReviews = aiOverallScores.length > 0;
        const hasPeerRatings = clarityRatings.length > 0;

        // Normalize AI score: 1-10 → 0-100
        const aiAvg = hasAiReviews
          ? (aiOverallScores.reduce((a, b) => a + b, 0) /
              aiOverallScores.length /
              10) *
            100
          : null;

        // Normalize peer rating: 1-5 → 0-100
        const peerAvg = hasPeerRatings
          ? (clarityRatings.reduce((a, b) => a + b, 0) /
              clarityRatings.length /
              5) *
            100
          : null;

        // Confidence calibration: penalize overconfidence
        const avgConf =
          solutions.reduce((s, r) => s + r.confidence, 0) / totalSolutions;
        const overconfidencePenalty =
          reviewedCount > 0
            ? 1 - (overconfidenceFlags / reviewedCount) * 0.4
            : 1;
        const calibratedConf = (avgConf / 5) * 100 * overconfidencePenalty;

        if (hasAiReviews && hasPeerRatings) {
          sqs = aiAvg * 0.65 + peerAvg * 0.25 + calibratedConf * 0.1;
        } else if (hasAiReviews) {
          sqs = aiAvg * 0.75 + calibratedConf * 0.25;
        } else if (hasPeerRatings) {
          sqs = peerAvg * 0.7 + calibratedConf * 0.3;
        } else {
          // No objective quality signal — heavy discount
          // This user cannot rank highly without AI review or peer ratings
          sqs = calibratedConf * 0.5;
        }

        sqs = Math.min(Math.max(Math.round(sqs), 0), 100);
      }

      // ─────────────────────────────────────────────
      // COMPONENT 2: Problem Difficulty Distribution (PDDS) — 25%
      //
      // Hard problems are weighted 6x easy, medium 3x easy.
      // Rationale: FAANG hard problems represent roughly this
      // difficulty ratio relative to easy problems in prep value.
      // Max score achievable = all hard problems = 100.
      // Quality gate: halved if SQS < 40 (low-quality hard solutions
      // should not earn difficulty credit).
      // ─────────────────────────────────────────────
      let pdds = 0;

      if (totalSolutions > 0) {
        const weightedSum = hardSolved * 6 + mediumSolved * 3 + easySolved * 1;
        // Normalize: if all solutions were hard, weightedSum = totalSolutions * 6
        const maxPossible = totalSolutions * 6;
        pdds = Math.round((weightedSum / maxPossible) * 100);

        // Quality gate
        if (sqs < 40) pdds = Math.round(pdds * 0.5);

        pdds = Math.min(Math.max(pdds, 0), 100);
      }

      // ─────────────────────────────────────────────
      // COMPONENT 3: Consistency Score (CS) — 20%
      //
      // Three sub-signals:
      //   streak (40%): continuous daily practice
      //   weekly velocity (40%): recent average output
      //   total volume (20%): overall accumulated practice
      //
      // Streak cap: 30 days (beyond this, marginal value)
      // Velocity cap: 7 solutions/week (more than this = quantity concern)
      // Volume cap: 60 solutions (beyond this, diminishing returns for CS)
      // ─────────────────────────────────────────────
      const streakNorm = Math.min(member.streak / 30, 1) * 100;

      // Weekly velocity from last 28 days
      const fourWeeksAgo = new Date(now - 28 * 24 * 60 * 60 * 1000);
      const recentSolutions = solutions.filter(
        (s) => new Date(s.createdAt) >= fourWeeksAgo,
      );
      const avgWeeklyVelocity = recentSolutions.length / 4;
      const velocityNorm = Math.min(avgWeeklyVelocity / 7, 1) * 100;

      const volumeNorm = Math.min(totalSolutions / 60, 1) * 100;

      const cs = Math.round(
        streakNorm * 0.4 + velocityNorm * 0.4 + volumeNorm * 0.2,
      );

      // ─────────────────────────────────────────────
      // COMPONENT 4: Knowledge Retention Score (KRS) — 10%
      //
      // Uses identical Ebbinghaus + SM-2 formula as the 6D report D6.
      // Reusing the same computation ensures leaderboard retention score
      // is consistent with what the user sees on their own report page.
      // ─────────────────────────────────────────────
      let krs = 0;

      const reviewedSols = solutions.filter((s) => s.reviewCount > 0);
      const overdueCount = solutions.filter(
        (s) => s.nextReviewDate && new Date(s.nextReviewDate) <= new Date(),
      ).length;

      if (totalSolutions > 0) {
        const retentionScores = solutions
          .filter((s) => s.lastReviewedAt || s.createdAt)
          .map((s) => {
            const lastInteraction = s.lastReviewedAt || s.createdAt;
            const daysSince =
              (now - new Date(lastInteraction).getTime()) /
              (1000 * 60 * 60 * 24);
            const ef = s.sm2EasinessFactor ?? 2.5;
            const reps = s.sm2Repetitions ?? 0;
            const stability = Math.max(1, ef * Math.pow(reps + 1, 0.7));
            const retention = Math.exp(-daysSince / (stability * 10));
            const confidenceWeight = s.confidence
              ? (s.confidence / 5) * 0.3 + 0.7
              : 1.0;
            return Math.min(retention * confidenceWeight, 1.0);
          });

        if (retentionScores.length > 0) {
          const avgRetention =
            retentionScores.reduce((a, b) => a + b, 0) / retentionScores.length;
          const reviewedRate = reviewedSols.length / totalSolutions;
          const overdueRatio = overdueCount / totalSolutions;
          const overduePenalty = Math.round(overdueRatio * overdueRatio * 40);

          krs = Math.max(
            Math.round(reviewedRate * 40 + avgRetention * 60) - overduePenalty,
            0,
          );
        }
      }

      // ─────────────────────────────────────────────
      // COMPONENT 5: Pattern Breadth Score (PBS) — 5%
      //
      // How many of the 16 canonical interview patterns has this
      // user practiced? Breadth bonus (10%) if > 8 patterns covered.
      // ─────────────────────────────────────────────
      const uniquePatterns = new Set(
        solutions.filter((s) => s.pattern).map((s) => s.pattern),
      );
      let pbs = Math.round(
        (uniquePatterns.size / CANONICAL_PATTERN_COUNT) * 100,
      );
      if (uniquePatterns.size > 8) pbs = Math.min(Math.round(pbs * 1.1), 100);

      // ─────────────────────────────────────────────
      // COMPOSITE SCORE
      // ─────────────────────────────────────────────
      const compositeScore = Math.round(
        sqs * 0.4 + pdds * 0.25 + cs * 0.2 + krs * 0.1 + pbs * 0.05,
      );

      return {
        // Identity
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        teamRole: member.teamRole,
        activityStatus: member.activityStatus,
        lastSolvedAt: member.lastSolvedAt,

        // Composite score
        compositeScore: Math.min(compositeScore, 100),

        // Score breakdown — sent to client for transparency
        scoreBreakdown: {
          solutionQuality: sqs,
          difficultyDistribution: pdds,
          consistency: cs,
          retention: krs,
          patternBreadth: pbs,
        },

        // Raw stats — still needed for UI display
        totalSolved: totalSolutions,
        easySolved,
        mediumSolved,
        hardSolved,
        streak: member.streak,
        avgConfidence:
          totalSolutions > 0
            ? Math.round(
                (solutions.reduce((s, r) => s + r.confidence, 0) /
                  totalSolutions) *
                  10,
              ) / 10
            : 0,
        uniquePatterns: uniquePatterns.size,
        aiReviewedSolutions: solutions.filter(
          (s) =>
            s.aiFeedback &&
            Array.isArray(s.aiFeedback) &&
            s.aiFeedback.length > 0,
        ).length,
      };
    });

    // ── Sort by composite score, tiebreak by streak then recency ──
    scored.sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) {
        return b.compositeScore - a.compositeScore;
      }
      if (b.streak !== a.streak) return b.streak - a.streak;
      const aLast = a.lastSolvedAt ? new Date(a.lastSolvedAt).getTime() : 0;
      const bLast = b.lastSolvedAt ? new Date(b.lastSolvedAt).getTime() : 0;
      return bLast - aLast;
    });

    const ranked = scored.map((entry, index) => ({
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
        approach: true,
        timeComplexity: true,
        spaceComplexity: true,
        sm2EasinessFactor: true,
        sm2Interval: true,
        sm2Repetitions: true,
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
    // ════════════════════════════════════════════════
    const allAiReviews = [];
    solutions.forEach((s) => {
      if (s.aiFeedback && Array.isArray(s.aiFeedback)) {
        const latest = s.aiFeedback[s.aiFeedback.length - 1];
        if (latest) allAiReviews.push(latest);
      }
    });

    const reviewedSolutions = allAiReviews.length;

    const aiOverallScores = allAiReviews
      .map((r) => r.overallScore)
      .filter((s) => s != null);
    const aiAvgOverall =
      aiOverallScores.length > 0
        ? aiOverallScores.reduce((a, b) => a + b, 0) / aiOverallScores.length
        : null;

    const incompleteCount = allAiReviews.filter(
      (r) => r.flags?.incompleteSubmission === true,
    ).length;
    const wrongPatternCount = allAiReviews.filter(
      (r) => r.flags?.wrongPattern === true,
    ).length;
    const overconfidenceCount = allAiReviews.filter(
      (r) => r.flags?.overconfidenceDetected === true,
    ).length;

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
      .map(
        (r) => r.dimensionScores?.codeCorrectness ?? r.scores?.codeCorrectness,
      )
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
    const avgAiCodeCorrectness =
      aiCodeCorrectnessScores.length > 0
        ? aiCodeCorrectnessScores.reduce((a, b) => a + b, 0) /
          aiCodeCorrectnessScores.length
        : null;

    // ════════════════════════════════════════════════
    // QUIZ CROSS-FEED — Phase 3
    //
    // Load all completed quizzes for this user and compute
    // per-dimension knowledge signals from quiz subject + score.
    //
    // Design: quiz subjects are free text. We use keyword matching
    // to map each subject to one or more 6D dimensions. Only completed
    // quizzes with a score are used. Scores are 0-100 (percentage correct).
    //
    // Per-dimension quiz signal:
    //   1. Collect all quizzes that map to this dimension
    //   2. Weight recent quizzes more (exponential decay by age)
    //   3. Compute weighted average score
    //   4. Scale to the dimension's maxContribution
    //
    // The time-decay weight ensures recent quiz performance matters more
    // than a quiz taken 3 months ago — knowledge degrades over time.
    // Decay constant: half-life of 30 days (score halves in weight after 30 days).
    // ════════════════════════════════════════════════
    const allQuizzesForDimensions = await prisma.quizAttempt.findMany({
      where: {
        userId,
        completedAt: { not: null },
        score: { not: null },
      },
      select: {
        subject: true,
        score: true,
        difficulty: true,
        completedAt: true,
      },
      orderBy: { completedAt: "desc" },
      take: 100, // cap at 100 most recent — beyond this, signal quality drops
    });

    // Compute quiz signals per dimension
    const quizDimensionSignals = {
      d1_patterns: { weightedScoreSum: 0, weightSum: 0, count: 0 },
      d2_depth: { weightedScoreSum: 0, weightSum: 0, count: 0 },
      d3_communication: { weightedScoreSum: 0, weightSum: 0, count: 0 },
      d4_optimization: { weightedScoreSum: 0, weightSum: 0, count: 0 },
    };

    const now = Date.now();
    const HALF_LIFE_DAYS = 30;
    const DECAY_CONSTANT = Math.LN2 / HALF_LIFE_DAYS; // ln(2) / 30

    allQuizzesForDimensions.forEach((quiz) => {
      const mappings = mapQuizSubjectToDimensions(quiz.subject);
      if (mappings.length === 0) return;

      const daysAgo =
        (now - new Date(quiz.completedAt).getTime()) / (1000 * 60 * 60 * 24);

      // Exponential decay: weight = e^(-λt)
      // A quiz from today has weight 1.0, from 30 days ago has weight 0.5,
      // from 60 days ago has weight 0.25, etc.
      const timeWeight = Math.exp(-DECAY_CONSTANT * daysAgo);

      // Difficulty multiplier: harder quiz = stronger signal of real knowledge
      const difficultyMultiplier =
        quiz.difficulty === "HARD"
          ? 1.3
          : quiz.difficulty === "MEDIUM"
            ? 1.0
            : 0.8;

      const effectiveWeight = timeWeight * difficultyMultiplier;

      mappings.forEach(({ dimKey }) => {
        if (quizDimensionSignals[dimKey]) {
          quizDimensionSignals[dimKey].weightedScoreSum +=
            (quiz.score || 0) * effectiveWeight;
          quizDimensionSignals[dimKey].weightSum += effectiveWeight;
          quizDimensionSignals[dimKey].count += 1;
        }
      });
    });

    // Convert to weighted average scores (0-100) per dimension
    // Require at least 2 quizzes before trusting the signal (1 quiz is noise)
    function getQuizSignal(dimKey) {
      const sig = quizDimensionSignals[dimKey];
      if (sig.count < 2 || sig.weightSum === 0) return null;
      return sig.weightedScoreSum / sig.weightSum; // 0-100
    }

    const quizSignalD1 = getQuizSignal("d1_patterns");
    const quizSignalD2 = getQuizSignal("d2_depth");
    const quizSignalD3 = getQuizSignal("d3_communication");
    const quizSignalD4 = getQuizSignal("d4_optimization");

    // ════════════════════════════════════════════════
    // D1: Pattern Recognition — quality-weighted + quiz cross-feed
    // ════════════════════════════════════════════════
    const withPattern = solutions.filter((s) => s.pattern).length;
    const uniquePatterns = new Set(
      solutions.filter((s) => s.pattern).map((s) => s.pattern),
    );

    const patternAttemptRate = (withPattern / totalSolutions) * 30;

    let patternQualityScore;
    if (avgAiPatternAccuracy !== null) {
      patternQualityScore = (avgAiPatternAccuracy / 10) * 50;
    } else {
      patternQualityScore =
        withPattern > 0 ? Math.min((withPattern / totalSolutions) * 30, 30) : 0;
    }

    const diversityBonus = Math.min(uniquePatterns.size / 16, 1) * 20;
    const wrongPatternPenalty =
      reviewedSolutions > 0 ? (wrongPatternCount / reviewedSolutions) * 20 : 0;

    let d1 = Math.max(
      Math.round(
        patternAttemptRate +
          patternQualityScore +
          diversityBonus -
          wrongPatternPenalty,
      ),
      0,
    );

    // Quiz cross-feed: pattern/algorithm quizzes supplement behavioral signals
    // Scale quiz signal (0-100) to maxContribution (15 pts) and blend
    // Only applies if behavioral signal is low (quiz can fill the gap)
    // or if there are no AI reviews yet (quiz is the only quality signal)
    if (quizSignalD1 !== null) {
      const quizBonus = Math.round(
        (quizSignalD1 / 100) * QUIZ_DIMENSION_MAP.d1_patterns.maxContribution,
      );
      // Blend: quiz bonus only adds up to the gap between current d1 and cap
      // This prevents quiz-grinding from inflating an already high D1
      const headroom = Math.max(0, 85 - d1); // max quiz can push D1 to is 85
      d1 = Math.min(d1 + Math.min(quizBonus, headroom), 100);
    }

    // ════════════════════════════════════════════════
    // D2: Solution Depth — quality-weighted + quiz cross-feed
    // ════════════════════════════════════════════════
    const INSIGHT_MIN_CHARS = 60;
    const FEYNMAN_MIN_CHARS = 200;
    const REALWORLD_MIN_CHARS = 80;

    const withMeaningfulInsight = solutions.filter(
      (s) => stripHtml(s.keyInsight).length >= INSIGHT_MIN_CHARS,
    ).length;
    const withMeaningfulFeynman = solutions.filter(
      (s) => stripHtml(s.feynmanExplanation).length >= FEYNMAN_MIN_CHARS,
    ).length;
    const withMeaningfulRealWorld = solutions.filter(
      (s) => stripHtml(s.realWorldConnection).length >= REALWORLD_MIN_CHARS,
    ).length;

    const overconfidencePenaltyFactor =
      reviewedSolutions > 0
        ? 1 - (overconfidenceCount / reviewedSolutions) * 0.4
        : 1;

    const avgConf =
      solutions.reduce((s, r) => s + r.confidence, 0) / totalSolutions;
    const calibratedConfScore = (avgConf / 5) * overconfidencePenaltyFactor;

    // Metacognitive accuracy (Kruger & Dunning 1999, Dunlosky 2013)
    let metacognitiveAccuracy = null;
    if (allAiReviews.length >= 3) {
      const calibrationDeltas = allAiReviews
        .map((review) => {
          const solution = solutions.find(
            (s) =>
              s.aiFeedback &&
              Array.isArray(s.aiFeedback) &&
              s.aiFeedback.includes(review),
          );
          const selfConfidence = solution?.confidence;
          const aiOverall = review.overallScore;
          if (selfConfidence == null || aiOverall == null) return null;
          const normalizedSelf = (selfConfidence - 1) / 4;
          const normalizedAI = (aiOverall - 1) / 9;
          return Math.abs(normalizedSelf - normalizedAI);
        })
        .filter((d) => d !== null);

      if (calibrationDeltas.length > 0) {
        const avgDelta =
          calibrationDeltas.reduce((a, b) => a + b, 0) /
          calibrationDeltas.length;
        metacognitiveAccuracy = 1 - avgDelta;
      }
    }

    const baseDepth = Math.round(
      (withMeaningfulInsight / totalSolutions) * 20 +
        (withMeaningfulFeynman / totalSolutions) * 25 +
        (withMeaningfulRealWorld / totalSolutions) * 15 +
        calibratedConfScore * 20 +
        (metacognitiveAccuracy !== null ? metacognitiveAccuracy * 20 : 10),
    );

    let d2;
    if (avgAiUnderstanding !== null) {
      const aiDepthScore = (avgAiUnderstanding / 10) * 100;
      d2 = Math.round(aiDepthScore * 0.6 + baseDepth * 0.4);
    } else {
      d2 = baseDepth;
    }

    // Quiz cross-feed for D2: CS fundamentals and conceptual quizzes
    if (quizSignalD2 !== null) {
      const quizBonus = Math.round(
        (quizSignalD2 / 100) * QUIZ_DIMENSION_MAP.d2_depth.maxContribution,
      );
      const headroom = Math.max(0, 80 - d2);
      d2 = Math.min(d2 + Math.min(quizBonus, headroom), 100);
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
      d3 = Math.round(
        (clarityRatings.reduce((s, r) => s + r.rating, 0) /
          clarityRatings.length /
          5) *
          100,
      );
    } else if (avgAiExplanation !== null) {
      communicationFromProxy = true;
      d3 = Math.min(Math.round((avgAiExplanation / 10) * 75), 75);
    } else {
      communicationFromProxy = true;
      const withMeaningfulApproach = solutions.filter(
        (s) =>
          s.approach &&
          s.approach.trim().length > 80 &&
          s.realWorldConnection &&
          stripHtml(s.realWorldConnection).length >= REALWORLD_MIN_CHARS,
      ).length;
      d3 = Math.min(
        Math.round((withMeaningfulApproach / totalSolutions) * 50),
        50,
      );
    }

    // Quiz cross-feed for D3: behavioral/communication-topic quizzes
    // These get a smaller headroom cap (70) because quiz can't replace
    // actual peer ratings or AI explanation quality assessment
    if (quizSignalD3 !== null) {
      const quizBonus = Math.round(
        (quizSignalD3 / 100) *
          QUIZ_DIMENSION_MAP.d3_communication.maxContribution,
      );
      const headroom = Math.max(0, 70 - d3);
      d3 = Math.min(d3 + Math.min(quizBonus, headroom), 100);
    }

    // ════════════════════════════════════════════════
    // D4: Optimization — behavioral signals + AI quality gate + quiz cross-feed
    // ════════════════════════════════════════════════
    const withBrute = solutions.filter(
      (s) => s.bruteForce && s.bruteForce.trim().length > 20,
    ).length;
    const withOptimized = solutions.filter(
      (s) => s.optimizedApproach && s.optimizedApproach.trim().length > 20,
    ).length;
    const withBothApproaches = solutions.filter(
      (s) =>
        s.bruteForce &&
        s.bruteForce.trim().length > 20 &&
        s.optimizedApproach &&
        s.optimizedApproach.trim().length > 20,
    ).length;
    const withBothComplexity = solutions.filter(
      (s) => s.timeComplexity && s.spaceComplexity,
    ).length;

    const d4Base = Math.round(
      (withBrute / totalSolutions) * 15 +
        (withOptimized / totalSolutions) * 20 +
        (withBothApproaches / totalSolutions) * 30 +
        (withBothComplexity / totalSolutions) * 15,
    );

    let d4;
    if (avgAiCodeCorrectness !== null) {
      const correctnessGate = Math.pow(avgAiCodeCorrectness / 10, 0.6);
      d4 = Math.round(d4Base * correctnessGate);
    } else {
      d4 = Math.min(d4Base, 70);
    }

    // Quiz cross-feed for D4: complexity and optimization quizzes
    if (quizSignalD4 !== null) {
      const quizBonus = Math.round(
        (quizSignalD4 / 100) *
          QUIZ_DIMENSION_MAP.d4_optimization.maxContribution,
      );
      const headroom = Math.max(0, 80 - d4);
      d4 = Math.min(d4 + Math.min(quizBonus, headroom), 100);
    }

    // ════════════════════════════════════════════════
    // D5: Pressure Performance — normalized blend
    // (unchanged — quiz already feeds D5 via quizPressureScore)
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
      let simScore = 0;
      if (hasSims) {
        const avgSimScore =
          sims.reduce((s, r) => s + (r.score || 0), 0) / sims.length;
        const noHintRate =
          sims.filter((s) => s.hintsUsed === 0).length / sims.length;
        simScore = Math.min((avgSimScore / 5) * 80 + noHintRate * 20, 100);
      }

      let interviewScore = 0;
      if (hasInterviews) {
        const interviewsWithScores = interviews.filter(
          (i) =>
            i.scores &&
            typeof i.scores === "object" &&
            Object.keys(i.scores).length > 0,
        );
        if (interviewsWithScores.length > 0) {
          const normalizedInterviewScores = interviewsWithScores
            .map((interview) => {
              const scores = interview.scores;
              if (!scores || typeof scores !== "object") return null;
              const normalized = [];
              const scale10Fields = [
                "problemDecomposition",
                "codeCorrectness",
                "codeQuality",
                "communicationWhileCoding",
                "edgeCaseHandling",
                "optimizationAbility",
                "composureUnderPressure",
                "requirementsClarification",
                "architectureClarity",
                "scaleThinking",
                "failureModeAwareness",
                "tradeOffReasoning",
                "componentDepth",
                "communicationClarity",
                "starStructure",
                "specificity",
                "quantifiedImpact",
                "growthMindset",
                "relevanceToRole",
                "conceptualAccuracy",
                "explanationDepth",
                "realWorldApplication",
                "misconceptionAwareness",
                "schemaUnderstanding",
                "queryCorrectness",
                "optimizationAwareness",
                "codeReadability",
                "authenticity",
                "companyResearch",
                "careerNarrative",
                "questionQuality",
                "cultureFit",
              ];
              const scale4Fields = [
                "clarifyingQuestions",
                "hintUtilization",
                "personalOwnership",
              ];
              scale10Fields.forEach((field) => {
                if (
                  scores[field] != null &&
                  typeof scores[field] === "number"
                ) {
                  normalized.push((scores[field] / 10) * 100);
                }
              });
              scale4Fields.forEach((field) => {
                if (
                  scores[field] != null &&
                  typeof scores[field] === "number"
                ) {
                  normalized.push((scores[field] / 4) * 100);
                }
              });
              if (normalized.length === 0) return null;
              return normalized.reduce((a, b) => a + b, 0) / normalized.length;
            })
            .filter((s) => s !== null);

          if (normalizedInterviewScores.length > 0) {
            interviewScore = Math.round(
              normalizedInterviewScores.reduce((a, b) => a + b, 0) /
                normalizedInterviewScores.length,
            );
          } else {
            interviewScore = Math.min(interviewsWithScores.length * 8, 40);
          }
        } else {
          interviewScore = Math.min(interviews.length * 3, 15);
        }
      }

      const quizPressureScore = hasQuizzes
        ? quizzesForPressure.reduce((s, r) => s + (r.score || 0), 0) /
          quizzesForPressure.length
        : 0;

      if (hasSims && hasInterviews && hasQuizzes) {
        d5 = Math.round(
          simScore * 0.35 + interviewScore * 0.3 + quizPressureScore * 0.35,
        );
      } else if (hasSims && hasQuizzes) {
        d5 = Math.round(simScore * 0.5 + quizPressureScore * 0.5);
      } else if (hasInterviews && hasQuizzes) {
        d5 = Math.round(interviewScore * 0.4 + quizPressureScore * 0.6);
      } else if (hasSims && hasInterviews) {
        d5 = Math.round(simScore * 0.6 + interviewScore * 0.4);
      } else if (hasQuizzes) {
        d5 = Math.min(Math.round(quizPressureScore), 75);
      } else if (hasSims) {
        d5 = Math.round(simScore);
      } else {
        d5 = Math.round(interviewScore);
      }
      d5 = Math.min(d5, 100);
    }

    // ════════════════════════════════════════════════
    // D6: Knowledge Retention — Ebbinghaus + SM-2
    // ════════════════════════════════════════════════
    const now_d6 = Date.now();

    const overdueCount = await prisma.solution.count({
      where: { userId, teamId, nextReviewDate: { lte: new Date() } },
    });

    const reviewedSols = solutions.filter((s) => s.reviewCount > 0);

    const retentionScores = solutions
      .filter((s) => s.lastReviewedAt || s.createdAt)
      .map((s) => {
        const lastInteraction = s.lastReviewedAt || s.createdAt;
        const daysSince =
          (now_d6 - new Date(lastInteraction).getTime()) /
          (1000 * 60 * 60 * 24);
        const ef = s.sm2EasinessFactor ?? 2.5;
        const reps = s.sm2Repetitions ?? 0;
        const stability = Math.max(1, ef * Math.pow(reps + 1, 0.7));
        const retention = Math.exp(-daysSince / (stability * 10));
        const confidenceWeight = s.confidence
          ? (s.confidence / 5) * 0.3 + 0.7
          : 1.0;
        return Math.min(retention * confidenceWeight, 1.0);
      });

    let d6;
    if (retentionScores.length === 0) {
      d6 = 0;
    } else {
      const avgRetention =
        retentionScores.reduce((a, b) => a + b, 0) / retentionScores.length;
      const reviewedRate = reviewedSols.length / totalSolutions;
      const engagementScore = reviewedRate * 40;
      const retentionScore = avgRetention * 60;
      d6 = Math.round(engagementScore + retentionScore);
      const overdueRatio =
        totalSolutions > 0 ? overdueCount / totalSolutions : 0;
      const overduePenalty = Math.round(overdueRatio * overdueRatio * 40);
      d6 = Math.max(d6 - overduePenalty, 0);
    }

    // ════════════════════════════════════════════════
    // OVERALL — weighted average + AI quality gate
    // ════════════════════════════════════════════════
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

    if (aiAvgOverall !== null) {
      const aiQualityCap = Math.round((aiAvgOverall / 10) * 100);
      const maxAllowed = Math.min(aiQualityCap + 15, 100);
      overall = Math.min(overall, maxAllowed);
    }

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

    const recentSolutionsList = solutions.filter(
      (s) => new Date(s.createdAt) >= fourWeeksAgo,
    );

    const weeklyBuckets = [0, 0, 0, 0];
    recentSolutionsList.forEach((s) => {
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

    const aiScoreTimeline = [];
    solutions.forEach((s) => {
      if (s.aiFeedback && Array.isArray(s.aiFeedback)) {
        s.aiFeedback.forEach((r) => {
          if (r.overallScore != null) {
            aiScoreTimeline.push({ score: r.overallScore, date: r.reviewedAt });
          }
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

    // Build quiz signal summary for transparency in scoringSignals
    const quizDimensionContributions = {
      patternRecognition:
        quizSignalD1 !== null
          ? {
              avgScore: Math.round(quizSignalD1),
              quizCount: quizDimensionSignals.d1_patterns.count,
            }
          : null,
      solutionDepth:
        quizSignalD2 !== null
          ? {
              avgScore: Math.round(quizSignalD2),
              quizCount: quizDimensionSignals.d2_depth.count,
            }
          : null,
      communication:
        quizSignalD3 !== null
          ? {
              avgScore: Math.round(quizSignalD3),
              quizCount: quizDimensionSignals.d3_communication.count,
            }
          : null,
      optimization:
        quizSignalD4 !== null
          ? {
              avgScore: Math.round(quizSignalD4),
              quizCount: quizDimensionSignals.d4_optimization.count,
            }
          : null,
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
        scoringSignals: {
          aiReviewedSolutions: reviewedSolutions,
          avgAiScore:
            aiAvgOverall !== null ? Math.round(aiAvgOverall * 10) / 10 : null,
          incompleteSubmissions: incompleteCount,
          wrongPatternFlags: wrongPatternCount,
          overconfidenceFlags: overconfidenceCount,
          overdueReviews: overdueCount,
          bothApproachesRate,
          metacognitiveAccuracy:
            metacognitiveAccuracy !== null
              ? Math.round(metacognitiveAccuracy * 100)
              : null,
          // Phase 3: quiz cross-feed transparency
          quizDimensionContributions,
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

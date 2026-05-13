// ============================================================================
// ProbSolver v3.0 — Stats Controller (Team-Scoped)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
  hasReflectiveContent,
  hasBothApproaches,
  isCodingSolution,
} from "../utils/solutionSignals.js";
import { wilsonCI, meanCI, combineCIs } from "../utils/dimensionStats.js";
import {
  retrievability,
  stabilityAfterReps,
} from "../utils/fsrsRetention.js";
import {
  READINESS_TIERS,
  classifyReadiness,
} from "../utils/readinessTiers.js";
import { aiComplete } from "../services/ai.service.js";
import {
  readinessVerdictPrompt,
  READINESS_VERDICT_FEWSHOT,
} from "../services/ai.prompts.js";
import {
  validateVerdict,
  extractJSON,
  hashEvidence,
} from "../services/ai.validators.js";
import { buildFallbackVerdict } from "../services/ai.fallbacks.js";
import { AI_MODEL_PREMIUM, AI_MODEL_FAST } from "../config/env.js";

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
      "low level design",
      "lld",
      "object oriented",
      "oop",
      "design pattern",
      "solid principle",
      "single responsibility",
      "open closed",
      "liskov",
      "dependency injection",
      "factory pattern",
      "strategy pattern",
      "observer pattern",
      "decorator pattern",
      "uml",
      "class diagram",
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
      "design pattern optimization",
      "refactoring",
      "clean code",
      "code smell",
      "coupling",
      "cohesion",
      "abstraction",
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
        patterns: true,
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
        solutions.flatMap((s) => s.patterns ?? []),
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
// The report is rebuilt around three principles research has validated:
//   1. Per-dimension activation gates — a score based on n=1 submission
//      isn't a score, it's noise. Dimensions below their evidence floor
//      return { status: 'inactive', score: null, activationMessage: ... }.
//   2. Confidence intervals travel with every score (Wilson for proportions,
//      mean±1.96·SE for continuous). Users see how trustworthy each number is.
//   3. D6 "Retention" strictly requires OBSERVED recall (ReviewAttempt rows
//      with quality ≥ 3) — unreviewed solutions don't contribute. Uses
//      FSRS retrievability, not the naive Ebbinghaus-from-createdAt that
//      was producing D6=89 for users with 1 partial submission.
// ============================================================================

// Weight of each dimension in the overall score. Re-normalized across
// active dimensions only (inactive dims don't drag the average to zero).
const DIM_WEIGHTS = {
  patternRecognition: 0.2,
  solutionDepth: 0.18,
  communication: 0.12,
  optimization: 0.22,
  pressurePerformance: 0.16,
  retention: 0.12,
};

const DIM_KEYS = Object.keys(DIM_WEIGHTS);

function inactiveDim(key, reason, n = 0) {
  return {
    key,
    status: "inactive",
    score: null,
    n,
    ci: null,
    basis: [],
    activationMessage: reason,
  };
}

function activeDim(key, { score, n, ci, basis }) {
  return {
    key,
    status: "active",
    score: Math.max(0, Math.min(100, Math.round(score))),
    n,
    ci: ci ? [Math.round(ci[0]), Math.round(ci[1])] : null,
    basis: basis ?? [],
    activationMessage: null,
  };
}

function buildInactiveReport({ message } = {}) {
  const dimensions = DIM_KEYS.map((key) =>
    inactiveDim(key, "Submit solutions to unlock this dimension"),
  );
  return {
    dimensions,
    overall: null,
    reportCoverage: {
      active: 0,
      total: DIM_KEYS.length,
      pct: 0,
      overallComputable: false,
    },
    tier: classifyReadiness(0, {}),
    totalSolutions: 0,
    message: message || null,
  };
}

export async function get6DReport(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

    const solutions = await prisma.solution.findMany({
      where: { userId, teamId },
      select: {
        patterns: true,
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
        categorySpecificData: true,
        sm2EasinessFactor: true,
        sm2Interval: true,
        sm2Repetitions: true,
        nextReviewDate: true,
        lastReviewedAt: true,
        reviewCount: true,
        aiFeedback: true,
        createdAt: true,
        problem: { select: { category: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const totalSolutions = solutions.length;

    if (totalSolutions === 0) {
      // Zero-submission users get a fully-inactive report shape —
      // same schema as the normal response so the client doesn't have
      // to branch on presence/absence of fields.
      return success(res, {
        report: buildInactiveReport({
          message: "Submit solutions to build your intelligence profile.",
        }),
      });
    }

    // ════════════════════════════════════════════════
    // FETCH ALL ACTIVITY DATA IN PARALLEL
    // Must happen before any dimension computation so that
    // interview signals are available for D1-D4 cross-feed
    // and pressure data is available for D5.
    // ════════════════════════════════════════════════
    const [
      sims,
      interviews,
      quizzesForPressure,
      clarityRatings,
      allQuizzesForDimensions,
      overdueCount,
      successfulReviewAttempts,
    ] = await Promise.all([
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
      prisma.clarityRating.findMany({
        where: { solution: { userId, teamId } },
        select: { rating: true },
      }),
      prisma.quizAttempt.findMany({
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
        take: 100,
      }),
      prisma.solution.count({
        where: { userId, teamId, nextReviewDate: { lte: new Date() } },
      }),
      // Successful review attempts (SM-2 quality >= 3). D6 ("Retention")
      // is computed ONLY from these — never from createdAt of unreviewed
      // solutions. We scope by the parent solution's userId+teamId so
      // cross-team attempts don't leak.
      prisma.reviewAttempt.findMany({
        where: {
          quality: { gte: 3 },
          solution: { userId, teamId },
        },
        select: {
          solutionId: true,
          createdAt: true,
          solution: {
            select: {
              sm2EasinessFactor: true,
              sm2Repetitions: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

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
    // INTERVIEW DIMENSION CROSS-FEED
    //
    // Must be computed BEFORE D1-D4 so the blend variables
    // (ivD1, ivD2, ivD3, ivD4, ivBlendWeight) are available.
    //
    // Dimension mapping:
    //   D1 ← problemDecomposition, requirementsClarification, clarifyingQuestions
    //   D2 ← explanationDepth, conceptualAccuracy, realWorldApplication, starStructure
    //   D3 ← communicationWhileCoding, communicationClarity, specificity,
    //         authenticity, careerNarrative, personalOwnership
    //   D4 ← optimizationAbility, edgeCaseHandling, codeCorrectness,
    //         codeQuality, tradeOffReasoning, scaleThinking,
    //         optimizationAwareness, hintUtilization
    // ════════════════════════════════════════════════
    const interviewDimSignals = { d1: [], d2: [], d3: [], d4: [] };

    interviews
      .filter(
        (i) =>
          i.scores &&
          typeof i.scores === "object" &&
          Object.keys(i.scores).length > 0,
      )
      .forEach((interview) => {
        const s = interview.scores;
        if (!s || typeof s !== "object") return;

        // D1 — pattern identification (1-10 scale → 0-100)
        ["problemDecomposition", "requirementsClarification"].forEach((f) => {
          if (s[f] != null && typeof s[f] === "number") {
            interviewDimSignals.d1.push((s[f] / 10) * 100);
          }
        });
        // clarifyingQuestions is 1-4 scale
        if (
          s.clarifyingQuestions != null &&
          typeof s.clarifyingQuestions === "number"
        ) {
          interviewDimSignals.d1.push((s.clarifyingQuestions / 4) * 100);
        }

        // D2 — depth of understanding
        [
          "explanationDepth",
          "conceptualAccuracy",
          "realWorldApplication",
        ].forEach((f) => {
          if (s[f] != null && typeof s[f] === "number") {
            interviewDimSignals.d2.push((s[f] / 10) * 100);
          }
        });
        if (s.starStructure != null && typeof s.starStructure === "number") {
          interviewDimSignals.d2.push((s.starStructure / 10) * 100);
        }

        // D3 — communication under interview conditions
        [
          "communicationWhileCoding",
          "communicationClarity",
          "specificity",
          "authenticity",
          "careerNarrative",
        ].forEach((f) => {
          if (s[f] != null && typeof s[f] === "number") {
            interviewDimSignals.d3.push((s[f] / 10) * 100);
          }
        });
        // personalOwnership is 1-4 scale
        if (
          s.personalOwnership != null &&
          typeof s.personalOwnership === "number"
        ) {
          interviewDimSignals.d3.push((s.personalOwnership / 4) * 100);
        }

        // D4 — optimization and technical rigor
        [
          "optimizationAbility",
          "edgeCaseHandling",
          "codeCorrectness",
          "codeQuality",
          "tradeOffReasoning",
          "scaleThinking",
          "optimizationAwareness",
        ].forEach((f) => {
          if (s[f] != null && typeof s[f] === "number") {
            interviewDimSignals.d4.push((s[f] / 10) * 100);
          }
        });
        // hintUtilization is 1-4 scale
        if (
          s.hintUtilization != null &&
          typeof s.hintUtilization === "number"
        ) {
          interviewDimSignals.d4.push((s.hintUtilization / 4) * 100);
        }
      });

    function avgInterviewSignal(arr) {
      if (arr.length === 0) return null;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    const ivD1 = avgInterviewSignal(interviewDimSignals.d1);
    const ivD2 = avgInterviewSignal(interviewDimSignals.d2);
    const ivD3 = avgInterviewSignal(interviewDimSignals.d3);
    const ivD4 = avgInterviewSignal(interviewDimSignals.d4);

    // Blend weight: 1 interview = 0.15, 2 = 0.20, 3 = 0.25, 5+ = 0.35
    const interviewsWithDimScores = interviews.filter(
      (i) =>
        i.scores &&
        typeof i.scores === "object" &&
        Object.keys(i.scores).length > 0,
    ).length;
    const ivBlendWeight = Math.min(0.1 + interviewsWithDimScores * 0.05, 0.35);

    // ════════════════════════════════════════════════
    // QUIZ CROSS-FEED — Phase 3
    // ════════════════════════════════════════════════
    const quizDimensionSignals = {
      d1_patterns: { weightedScoreSum: 0, weightSum: 0, count: 0 },
      d2_depth: { weightedScoreSum: 0, weightSum: 0, count: 0 },
      d3_communication: { weightedScoreSum: 0, weightSum: 0, count: 0 },
      d4_optimization: { weightedScoreSum: 0, weightSum: 0, count: 0 },
    };

    const now = Date.now();
    const HALF_LIFE_DAYS = 30;
    const DECAY_CONSTANT = Math.LN2 / HALF_LIFE_DAYS;

    allQuizzesForDimensions.forEach((quiz) => {
      const mappings = mapQuizSubjectToDimensions(quiz.subject);
      if (mappings.length === 0) return;

      const daysAgo =
        (now - new Date(quiz.completedAt).getTime()) / (1000 * 60 * 60 * 24);
      const timeWeight = Math.exp(-DECAY_CONSTANT * daysAgo);
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

    function getQuizSignal(dimKey) {
      const sig = quizDimensionSignals[dimKey];
      if (sig.count < 2 || sig.weightSum === 0) return null;
      return sig.weightedScoreSum / sig.weightSum;
    }

    const quizSignalD1 = getQuizSignal("d1_patterns");
    const quizSignalD2 = getQuizSignal("d2_depth");
    const quizSignalD3 = getQuizSignal("d3_communication");
    const quizSignalD4 = getQuizSignal("d4_optimization");

    // ════════════════════════════════════════════════
    // D1: Pattern Recognition
    // ════════════════════════════════════════════════
    const withPattern = solutions.filter((s) => s.patterns?.length > 0).length;
    const uniquePatterns = new Set(
      solutions.flatMap((s) => s.patterns ?? []),
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

    // Quiz cross-feed
    if (quizSignalD1 !== null) {
      const quizBonus = Math.round(
        (quizSignalD1 / 100) * QUIZ_DIMENSION_MAP.d1_patterns.maxContribution,
      );
      const headroom = Math.max(0, 85 - d1);
      d1 = Math.min(d1 + Math.min(quizBonus, headroom), 100);
    }

    // Interview cross-feed
    if (ivD1 !== null) {
      d1 = Math.round(d1 * (1 - ivBlendWeight) + ivD1 * ivBlendWeight);
      d1 = Math.min(d1, 100);
    }

    // ════════════════════════════════════════════════
    // D2: Solution Depth
    // ════════════════════════════════════════════════
    const INSIGHT_MIN_CHARS = 60;
    const FEYNMAN_MIN_CHARS = 200;
    const REALWORLD_MIN_CHARS = 80;

    // CODING-native signal (generic columns). Non-CODING submissions
    // use a categorySpecificData-aware helper instead of these raw checks.
    const withMeaningfulInsight = solutions.filter(
      (s) => isCodingSolution(s)
        ? stripHtml(s.keyInsight).length >= INSIGHT_MIN_CHARS
        : hasReflectiveContent(s),
    ).length;
    const withMeaningfulFeynman = solutions.filter(
      (s) => isCodingSolution(s)
        ? stripHtml(s.feynmanExplanation).length >= FEYNMAN_MIN_CHARS
        : hasReflectiveContent(s),
    ).length;
    const withMeaningfulRealWorld = solutions.filter(
      (s) => isCodingSolution(s)
        ? stripHtml(s.realWorldConnection).length >= REALWORLD_MIN_CHARS
        : hasReflectiveContent(s),
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

    // Quiz cross-feed
    if (quizSignalD2 !== null) {
      const quizBonus = Math.round(
        (quizSignalD2 / 100) * QUIZ_DIMENSION_MAP.d2_depth.maxContribution,
      );
      const headroom = Math.max(0, 80 - d2);
      d2 = Math.min(d2 + Math.min(quizBonus, headroom), 100);
    }

    // Interview cross-feed
    if (ivD2 !== null) {
      d2 = Math.round(d2 * (1 - ivBlendWeight) + ivD2 * ivBlendWeight);
      d2 = Math.min(d2, 100);
    }

    // ════════════════════════════════════════════════
    // D3: Communication
    // ════════════════════════════════════════════════
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

    // Quiz cross-feed
    if (quizSignalD3 !== null) {
      const quizBonus = Math.round(
        (quizSignalD3 / 100) *
          QUIZ_DIMENSION_MAP.d3_communication.maxContribution,
      );
      const headroom = Math.max(0, 70 - d3);
      d3 = Math.min(d3 + Math.min(quizBonus, headroom), 100);
    }

    // Interview cross-feed — higher weight when no peer ratings
    if (ivD3 !== null) {
      const d3InterviewWeight =
        clarityRatings.length === 0
          ? Math.min(ivBlendWeight * 1.5, 0.5)
          : ivBlendWeight;
      d3 = Math.round(d3 * (1 - d3InterviewWeight) + ivD3 * d3InterviewWeight);
      d3 = Math.min(d3, 100);
    }

    // ════════════════════════════════════════════════
    // D4: Optimization — CODING-only dimension. Non-CODING submissions
    // don't express brute/optimized approaches, so they don't dilute this
    // denominator; a user with 0 CODING solutions has no optimization
    // signal at all (d4 = 0 via the guard below).
    // ════════════════════════════════════════════════
    const codingSolutions = solutions.filter(isCodingSolution);
    const codingTotal = codingSolutions.length;
    const withBrute = codingSolutions.filter(
      (s) => s.bruteForce && s.bruteForce.trim().length > 20,
    ).length;
    const withOptimized = codingSolutions.filter(
      (s) => s.optimizedApproach && s.optimizedApproach.trim().length > 20,
    ).length;
    const withBothApproachesCount = codingSolutions.filter(hasBothApproaches).length;
    const withBothComplexity = codingSolutions.filter(
      (s) => s.timeComplexity && s.spaceComplexity,
    ).length;

    const d4Base = codingTotal === 0 ? 0 : Math.round(
      (withBrute / codingTotal) * 15 +
        (withOptimized / codingTotal) * 20 +
        (withBothApproachesCount / codingTotal) * 30 +
        (withBothComplexity / codingTotal) * 15,
    );

    let d4;
    if (avgAiCodeCorrectness !== null) {
      const correctnessGate = Math.pow(avgAiCodeCorrectness / 10, 0.6);
      d4 = Math.round(d4Base * correctnessGate);
    } else {
      d4 = Math.min(d4Base, 70);
    }

    // Quiz cross-feed
    if (quizSignalD4 !== null) {
      const quizBonus = Math.round(
        (quizSignalD4 / 100) *
          QUIZ_DIMENSION_MAP.d4_optimization.maxContribution,
      );
      const headroom = Math.max(0, 80 - d4);
      d4 = Math.min(d4 + Math.min(quizBonus, headroom), 100);
    }

    // Interview cross-feed
    if (ivD4 !== null) {
      d4 = Math.round(d4 * (1 - ivBlendWeight) + ivD4 * ivBlendWeight);
      d4 = Math.min(d4, 100);
    }

    // ════════════════════════════════════════════════
    // D5: Pressure Performance — normalized blend
    // ════════════════════════════════════════════════
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
    // D6: Retention — STRICT, FSRS-based.
    //
    // Only ReviewAttempt rows with quality >= 3 count. A fresh unreviewed
    // solution contributes zero signal — it is unmeasured, not "retained."
    // Per FSRS: retention is a function of stability × elapsed time, and
    // stability is meaningless until observed recall has occurred.
    //
    // Activation gate: need ≥ 3 successful attempts across ≥ 2 distinct
    // solutions (prevents single-card artifact from driving the whole dim).
    // ════════════════════════════════════════════════

    // Dedupe to the most-recent successful attempt per solution.
    const latestSuccessfulBySolution = new Map();
    for (const attempt of successfulReviewAttempts) {
      const existing = latestSuccessfulBySolution.get(attempt.solutionId);
      if (!existing || new Date(attempt.createdAt) > new Date(existing.createdAt)) {
        latestSuccessfulBySolution.set(attempt.solutionId, attempt);
      }
    }
    const d6Attempts = Array.from(latestSuccessfulBySolution.values());
    const d6SolutionCount = latestSuccessfulBySolution.size;

    // Legacy `d6` number kept around only in case any downstream code
    // still expects it mid-function; the authoritative output is `d6Score`.
    let d6 = 0;
    let d6Score;
    if (d6Attempts.length < 3 || d6SolutionCount < 2) {
      const need = Math.max(0, 3 - d6Attempts.length);
      const needSol = Math.max(0, 2 - d6SolutionCount);
      const msg = needSol > 0
        ? `Review ${need || "a few"} more problems across ${needSol} more solution${needSol === 1 ? "" : "s"} to unlock retention tracking`
        : `Need ${need} more successful review${need === 1 ? "" : "s"} to unlock retention tracking`;
      d6Score = inactiveDim("retention", msg, d6Attempts.length);
    } else {
      const now_d6 = Date.now();
      const retentionValues = d6Attempts.map((a) => {
        const daysSince =
          (now_d6 - new Date(a.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const reps = a.solution?.sm2Repetitions ?? 1;
        // Difficulty inferred from EF: lower EF = harder card. Map EF in
        // [1.3, 2.5+] to difficulty in [8, 3] (rough inverse).
        const ef = a.solution?.sm2EasinessFactor ?? 2.5;
        const difficulty = Math.max(1, Math.min(10, 10 - (ef - 1.3) * 3));
        const stability = stabilityAfterReps(reps, difficulty);
        return retrievability(daysSince, stability) * 100;
      });
      const ci = meanCI(retentionValues);
      d6 = ci.score;
      d6Score = activeDim("retention", {
        score: ci.score,
        n: d6Attempts.length,
        ci: ci.ci,
        basis: [
          `successful_reviews: ${d6Attempts.length}`,
          `distinct_solutions: ${d6SolutionCount}`,
          `overdue: ${overdueCount}`,
        ],
      });
    }

    // ════════════════════════════════════════════════
    // ACTIVATION GATES — wrap D1–D5 in DimScore shapes
    // ════════════════════════════════════════════════
    // D1 active iff ≥ 3 solutions with patterns claimed AND ≥ 1 AI review
    // (self-reported patterns need external validation to be trusted).
    let d1Score;
    {
      const hasMinPatterns = withPattern >= 3;
      const hasValidation = reviewedSolutions >= 1;
      if (!hasMinPatterns || !hasValidation) {
        const parts = [];
        if (!hasMinPatterns) {
          parts.push(`claim patterns on ${3 - withPattern} more solution${3 - withPattern === 1 ? "" : "s"}`);
        }
        if (!hasValidation) parts.push("get at least 1 AI review to validate");
        d1Score = inactiveDim("patternRecognition", parts.join(" and "), withPattern);
      } else {
        // CI from Wilson on the pattern-attempt proportion, score from
        // the existing multi-signal computation (preserves cross-feeds).
        const { ci } = wilsonCI(withPattern, totalSolutions);
        d1Score = activeDim("patternRecognition", {
          score: d1,
          n: withPattern,
          ci,
          basis: [
            `patterns_claimed: ${withPattern}`,
            `unique_patterns: ${uniquePatterns.size}`,
            `ai_reviews: ${reviewedSolutions}`,
            ...(wrongPatternCount > 0 ? [`wrong_pattern_flags: ${wrongPatternCount}`] : []),
          ],
        });
      }
    }

    // D2 active iff ≥ 3 solutions with reflective content (insight, Feynman,
    // or real-world — any of them).
    let d2Score;
    {
      const withAnyReflection = solutions.filter(hasReflectiveContent).length;
      if (withAnyReflection < 3) {
        d2Score = inactiveDim(
          "solutionDepth",
          `Add reflective content (insight / Feynman / real-world) to ${3 - withAnyReflection} more solution${3 - withAnyReflection === 1 ? "" : "s"}`,
          withAnyReflection,
        );
      } else {
        const { ci } = wilsonCI(withMeaningfulInsight + withMeaningfulFeynman, totalSolutions * 2);
        d2Score = activeDim("solutionDepth", {
          score: d2,
          n: withAnyReflection,
          ci,
          basis: [
            `reflective_solutions: ${withAnyReflection}`,
            `meaningful_insights: ${withMeaningfulInsight}`,
            `feynman_explanations: ${withMeaningfulFeynman}`,
            ...(avgAiUnderstanding !== null
              ? [`ai_understanding: ${avgAiUnderstanding.toFixed(1)}/10`]
              : []),
            ...(metacognitiveAccuracy !== null
              ? [`metacognitive_accuracy: ${(metacognitiveAccuracy * 100).toFixed(0)}%`]
              : []),
          ],
        });
      }
    }

    // D3 active iff ≥ 2 peer clarity ratings OR ≥ 2 AI explanation scores.
    // Pure "approach-length" proxy is not a real communication signal and
    // doesn't activate the dim.
    let d3Score;
    {
      const hasEnoughRatings = clarityRatings.length >= 2;
      const hasEnoughAI = aiExplanationScores.length >= 2;
      if (!hasEnoughRatings && !hasEnoughAI) {
        const ratingsNeeded = Math.max(0, 2 - clarityRatings.length);
        const aiNeeded = Math.max(0, 2 - aiExplanationScores.length);
        d3Score = inactiveDim(
          "communication",
          `Get ${ratingsNeeded} more peer clarity rating${ratingsNeeded === 1 ? "" : "s"} or ${aiNeeded} more AI review${aiNeeded === 1 ? "" : "s"}`,
          clarityRatings.length + aiExplanationScores.length,
        );
      } else {
        // Prefer peer ratings for the CI (more directly measures communication).
        const ci = hasEnoughRatings
          ? meanCI(clarityRatings.map((r) => (r.rating / 5) * 100)).ci
          : meanCI(aiExplanationScores.map((s) => (s / 10) * 100)).ci;
        d3Score = activeDim("communication", {
          score: d3,
          n: Math.max(clarityRatings.length, aiExplanationScores.length),
          ci,
          basis: [
            `peer_ratings: ${clarityRatings.length}`,
            `ai_explanation_scores: ${aiExplanationScores.length}`,
            ...(communicationFromProxy ? ["source: proxy (no peer ratings)"] : []),
          ],
        });
      }
    }

    // D4 active iff ≥ 3 CODING solutions with both-approach OR AI correctness.
    let d4Score;
    {
      const hasEnoughCoding = codingTotal >= 3;
      const hasEnoughApproachOrAI =
        withBothApproachesCount >= 1 || aiCodeCorrectnessScores.length >= 1;
      if (!hasEnoughCoding) {
        d4Score = inactiveDim(
          "optimization",
          `Submit ${3 - codingTotal} more CODING solution${3 - codingTotal === 1 ? "" : "s"} to measure optimization`,
          codingTotal,
        );
      } else if (!hasEnoughApproachOrAI) {
        d4Score = inactiveDim(
          "optimization",
          "Add brute-force AND optimized approaches on at least 1 CODING solution, or get an AI review",
          codingTotal,
        );
      } else {
        const { ci } = wilsonCI(withBothApproachesCount, codingTotal);
        d4Score = activeDim("optimization", {
          score: d4,
          n: codingTotal,
          ci,
          basis: [
            `coding_solutions: ${codingTotal}`,
            `both_approaches: ${withBothApproachesCount}`,
            ...(avgAiCodeCorrectness !== null
              ? [`ai_correctness: ${avgAiCodeCorrectness.toFixed(1)}/10`]
              : []),
          ],
        });
      }
    }

    // D5 active iff ≥ 1 sim/interview with scores OR ≥ 3 quizzes. Never
    // zero-by-default — that's category-insensitive and misleading.
    let d5Score;
    {
      const interviewsWithScoresCount = interviews.filter(
        (i) => i.scores && typeof i.scores === "object" && Object.keys(i.scores).length > 0,
      ).length;
      const pressureDataPoints = sims.length + interviewsWithScoresCount + quizzesForPressure.length;
      const hasEnough = sims.length + interviewsWithScoresCount >= 1 || quizzesForPressure.length >= 3;
      if (!hasEnough) {
        d5Score = inactiveDim(
          "pressurePerformance",
          "Complete 1 mock interview or simulation (or 3 quizzes) to unlock pressure performance",
          pressureDataPoints,
        );
      } else {
        // Wide CI when n is small; narrows with more data.
        const ci = meanCI(
          [
            ...sims.map((s) => ((s.score ?? 0) / 5) * 100),
            ...quizzesForPressure.map((q) => q.score ?? 0),
          ],
          1.96,
        );
        d5Score = activeDim("pressurePerformance", {
          score: d5,
          n: pressureDataPoints,
          ci: ci?.ci ?? [Math.max(0, d5 - 20), Math.min(100, d5 + 20)],
          basis: [
            `sims: ${sims.length}`,
            `interviews_scored: ${interviewsWithScoresCount}`,
            `quizzes: ${quizzesForPressure.length}`,
          ],
        });
      }
    }

    // ════════════════════════════════════════════════
    // OVERALL — re-normalized weights over ACTIVE dims only
    // ════════════════════════════════════════════════
    const dimensions = [d1Score, d2Score, d3Score, d4Score, d5Score, d6Score];
    const activeDims = dimensions.filter((d) => d.status === "active");
    const activeCount = activeDims.length;

    const reportCoverage = {
      active: activeCount,
      total: DIM_KEYS.length,
      pct: Math.round((activeCount / DIM_KEYS.length) * 100),
      overallComputable: activeCount >= 3,
    };

    let overall = null;
    if (activeCount >= 3) {
      const combined = combineCIs(
        activeDims.map((d) => ({
          score: d.score,
          ci: d.ci,
          weight: DIM_WEIGHTS[d.key],
        })),
        DIM_KEYS.length,
      );
      if (combined) {
        overall = { score: combined.score, ci: combined.ci };

        // AI quality cap — if the user has real AI reviews and they
        // average low, cap overall so a cold-start proxy score can't
        // exceed what AI is actually seeing.
        if (aiAvgOverall !== null) {
          const aiQualityCap = Math.round((aiAvgOverall / 10) * 100);
          const maxAllowed = Math.min(aiQualityCap + 15, 100);
          if (overall.score > maxAllowed) overall.score = maxAllowed;
        }
        // Overconfidence penalty — if >50% of reviews are flagged
        // overconfident, reduce overall by 15%.
        if (
          reviewedSolutions > 0 &&
          overconfidenceCount / reviewedSolutions > 0.5
        ) {
          overall.score = Math.round(overall.score * 0.85);
        }
      }
    }

    // ════════════════════════════════════════════════
    // TIER CLASSIFICATION
    // ════════════════════════════════════════════════
    const dimScoresByKey = Object.fromEntries(
      dimensions
        .filter((d) => d.status === "active")
        .map((d) => [d.key, d.score]),
    );
    const tierInfo = classifyReadiness(overall?.score ?? 0, dimScoresByKey);

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
      solutions.flatMap((s) => s.patterns ?? []),
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

    // Reported as a % of CODING solutions — doesn't make sense against
    // a total that includes HR / Behavioral / etc.
    const bothApproachesRate =
      codingTotal > 0
        ? Math.round((withBothApproachesCount / codingTotal) * 100)
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

    // Weeks-to-tier extrapolation — keyed by tier.id from the unified
    // READINESS_TIERS config so client and server never disagree. Null
    // when overall is not yet computable (too few active dims).
    const weeksToTiers = {};
    if (overall) {
      for (const t of tierInfo.tiers) {
        const gap = t.threshold - overall.score;
        weeksToTiers[t.id] = gap <= 0 ? 0 : Math.ceil(gap / pointsPerWeek);
      }
    }

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
        // New-shape: array of DimScore {key, status, score, n, ci, basis,
        // activationMessage}. Inactive dims score=null, ci=null, with an
        // activationMessage telling the user exactly what they need.
        dimensions,
        // overall is null when < 3 dims active (i.e. "not yet computable").
        // Otherwise { score, ci: [lo, hi] } with CI widened by coverage penalty.
        overall,
        // Honest "how much of the 6D profile is actually measured" number.
        reportCoverage,
        // Tier classification consumed by client ReportPage + Dashboard;
        // single source of truth from readinessTiers.js.
        tier: tierInfo,
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
          quizDimensionContributions,
          interviewDimensionContributions:
            interviewsWithDimScores > 0
              ? {
                  d1Signal: ivD1 !== null ? Math.round(ivD1) : null,
                  d2Signal: ivD2 !== null ? Math.round(ivD2) : null,
                  d3Signal: ivD3 !== null ? Math.round(ivD3) : null,
                  d4Signal: ivD4 !== null ? Math.round(ivD4) : null,
                  blendWeight: Math.round(ivBlendWeight * 100),
                  interviewCount: interviewsWithDimScores,
                }
              : null,
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
          weeksToTiers,
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

// ============================================================================
// TEAM ACTIVITY FEED
// ============================================================================
//
// Returns the most recent solutions submitted by any team member.
// Used by the Dashboard activity feed to show team pulse.
//
// Design decisions:
// 1. Capped at 20 items — enough for a meaningful feed, not overwhelming
// 2. Ordered by createdAt DESC — most recent first
// 3. Includes problem metadata (title, difficulty, category) for display
// 4. Includes user info for attribution
// 5. Only returns solutions from the last 14 days — older activity
//    is not relevant for the "what's happening now" dashboard signal
//
export async function getTeamActivity(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentSolutions = await prisma.solution.findMany({
      where: {
        teamId,
        createdAt: { gte: fourteenDaysAgo },
      },
      select: {
        id: true,
        confidence: true,
        patterns: true,
        createdAt: true,
        userId: true,
        user: {
          select: { id: true, name: true, avatarUrl: true },
        },
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            category: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Shape into activity feed format expected by ActivityFeed component
    const activities = recentSolutions.map((s) => ({
      solutionId: s.id,
      problemId: s.problem?.id,
      problemTitle: s.problem?.title || "Unknown Problem",
      difficulty: s.problem?.difficulty || "MEDIUM",
      category: s.problem?.category || "CODING",
      username: s.user?.name || "Unknown",
      avatarColor: s.user?.avatarUrl || "#7c6ff7",
      confidence: s.confidence || 0,
      solvedAt: s.createdAt,
      isOwn: s.userId === userId,
    }));

    // Summary stats for the activity section header
    const uniqueContributors = new Set(recentSolutions.map((s) => s.userId))
      .size;
    const totalInPeriod = recentSolutions.length;

    return success(res, {
      activities,
      meta: {
        totalInPeriod,
        uniqueContributors,
        periodDays: 14,
      },
    });
  } catch (err) {
    console.error("Team activity error:", err);
    return error(res, "Failed to fetch team activity.", 500);
  }
}

// ============================================================================
// READINESS VERDICT (AI, grounded, audited)
// ============================================================================
//
// Flow:
//   1. Build the same 6D evidence the client sees on /report.
//   2. Hash the evidence → cache key.
//   3. If a VerdictLog exists for (userId, teamId, inputHash) within the
//      last 5 minutes, return its verdictJson. No LLM call.
//   4. Otherwise:
//      a. Call OPENAI_MODEL_PREMIUM with system prompt + few-shot.
//      b. Extract JSON from the response (text may include a
//         <thinking> scaffold before the JSON object).
//      c. Run validateVerdict — 5 hard-rule checks. On any failure,
//         log the violations and substitute the deterministic template.
//      d. Store VerdictLog (inputHash, inputPayload, verdictJson,
//         usedFallback) and return.
//
// The verdict is NEVER generated in-line with /stats/report — the
// endpoints are decoupled so scores render immediately while the
// verdict card loads progressively in the client.
// ============================================================================

const VERDICT_CACHE_TTL_MS = 5 * 60 * 1000;

// validateVerdict, extractJSON, hashEvidence, buildFallbackVerdict, and the
// TENTATIVE_VOCAB / PARTIAL_VOCAB constants live in
// ../services/ai.validators.js + ../services/ai.fallbacks.js — imported above.
// Keeping them in dedicated modules so the same pattern can be applied to
// other AI surfaces during the AI Prompts Overhaul.

// Build the evidence block sent to the LLM. Shape matches the verdict
// prompt's <evidence> schema exactly. All signals come from the already-
// computed `report` so we avoid duplicate DB traversal.
function buildVerdictEvidence(report) {
  const totalSolutions = report.totalSolutions || 0;
  const totalReviews = report.scoringSignals?.aiReviewedSolutions ?? 0;
  const totalSuccessfulReviews =
    (report.dimensions || []).find((d) => d.key === "retention")?.n ?? 0;

  const nearestTier = report.tier?.highest
    ? {
        name: report.tier.highest.name,
        threshold: report.tier.highest.threshold,
        ready: true,
      }
    : null;
  const nextTier = report.tier?.next
    ? {
        name: report.tier.next.name,
        threshold: report.tier.next.threshold,
        gap: report.tier.next.overallGap,
      }
    : null;

  return {
    user: { totalSolutions, totalReviews, totalSuccessfulReviews },
    dimensions: report.dimensions || [],
    overall: report.overall,
    reportCoverage: report.reportCoverage,
    nearestTier,
    nextTier,
    recentFlags: {
      wrongPattern: report.scoringSignals?.wrongPatternFlags ?? 0,
      overconfidence: report.scoringSignals?.overconfidenceFlags ?? 0,
      incomplete: report.scoringSignals?.incompleteSubmissions ?? 0,
    },
  };
}

// Capture-stub res used to call get6DReport internally and read back
// the report object without hitting HTTP. get6DReport calls
// `success(res, {...})` which runs res.status(200).json(envelope).
function makeCaptureRes() {
  const res = {
    _body: null,
    status() { return res; },
    json(body) { res._body = body; return res; },
  };
  return res;
}

export async function generateReadinessVerdict(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;

    // Run the same report computation to get the exact evidence the
    // client would see. Uses a capture response stub — the controller
    // calls res.json once at the end; we intercept that.
    const captureRes = makeCaptureRes();
    await get6DReport(req, captureRes);
    const captured = captureRes._body;
    if (!captured || !captured.success || !captured.data?.report) {
      return error(res, "Failed to build evidence for verdict.", 500);
    }
    const report = captured.data.report;

    const evidence = buildVerdictEvidence(report);
    const inputHash = hashEvidence(evidence);

    // Cache lookup — return any verdict for this exact evidence within TTL
    const cacheCutoff = new Date(Date.now() - VERDICT_CACHE_TTL_MS);
    const cached = await prisma.verdictLog.findFirst({
      where: {
        userId,
        teamId,
        inputHash,
        createdAt: { gte: cacheCutoff },
      },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      return success(res, {
        verdict: cached.verdictJson,
        usedFallback: cached.usedFallback,
        cached: true,
      });
    }

    // LLM call with few-shot — verdict is the highest-stakes surface, so it
    // gets the premium tier (env.js falls through to AI_MODEL_FAST when no
    // premium override is set, preserving prior behavior).
    const { system, user } = readinessVerdictPrompt(evidence);
    const model = AI_MODEL_PREMIUM || AI_MODEL_FAST;

    let verdictJson;
    let usedFallback = false;
    let violations = [];

    try {
      // jsonMode=false because few-shot assistant messages include a
      // <thinking> block that isn't valid JSON. We extract the JSON
      // from the full response manually.
      const raw = await aiComplete({
        systemPrompt: system,
        userPrompt: user,
        userId,
        model,
        temperature: 0.2,
        maxTokens: 1200,
        jsonMode: false,
        fewShotMessages: READINESS_VERDICT_FEWSHOT,
      });

      const parsed = extractJSON(raw);
      const check = validateVerdict(parsed, evidence);
      if (check.valid) {
        verdictJson = parsed;
      } else {
        violations = check.violations;
        console.warn(
          `[verdict] validation failed for user ${userId}: ${violations.join(", ")}`,
        );
        verdictJson = buildFallbackVerdict(evidence);
        usedFallback = true;
      }
    } catch (aiErr) {
      console.warn(`[verdict] LLM call failed: ${aiErr.message}`);
      verdictJson = buildFallbackVerdict(evidence);
      usedFallback = true;
      violations = [`llm-error:${aiErr.code || aiErr.message}`];
    }

    // Audit log — every call lands here, cache hit or not.
    await prisma.verdictLog.create({
      data: {
        userId,
        teamId,
        inputHash,
        inputPayload: evidence,
        verdictJson: { ...verdictJson, _violations: violations.length ? violations : undefined },
        usedFallback,
      },
    });

    return success(res, {
      verdict: verdictJson,
      usedFallback,
      cached: false,
    });
  } catch (err) {
    console.error("Readiness verdict error:", err);
    return error(res, "Failed to generate readiness verdict.", 500);
  }
}

// ============================================================================
// VERDICT AUDIT (SUPER_ADMIN)
// ============================================================================
//
// Read-only view of the VerdictLog table for spot-checking LLM output
// quality and prompt health. Two pieces of data matter most:
//
//   1. **Fallback rate** over the last 7 days. Spike = prompt regression
//      (or OpenAI outage). We expect < 5% in steady state.
//   2. **Individual verdicts** — expand a row to see the exact evidence
//      the model was given and the JSON it emitted. Catching one clearly-
//      wrong verdict tells you the prompt needs a rule.
//
// Pagination via offset + limit; filter by `usedFallback=true` to focus
// on the ones that failed validation.
// ============================================================================
export async function getVerdictAudit(req, res) {
  try {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const fallbackOnly = req.query.fallbackOnly === "true";

    const where = fallbackOnly ? { usedFallback: true } : {};

    // 7-day fallback rate — two counts in parallel.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [verdicts, totalCount, recentTotal, recentFallback] = await Promise.all([
      prisma.verdictLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          userId: true,
          teamId: true,
          inputHash: true,
          inputPayload: true,
          verdictJson: true,
          usedFallback: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
          team: { select: { id: true, name: true, isPersonal: true } },
        },
      }),
      prisma.verdictLog.count({ where }),
      prisma.verdictLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.verdictLog.count({
        where: { createdAt: { gte: sevenDaysAgo }, usedFallback: true },
      }),
    ]);

    const fallbackRate =
      recentTotal > 0 ? Math.round((recentFallback / recentTotal) * 1000) / 10 : 0;

    return success(res, {
      verdicts,
      pagination: { total: totalCount, limit, offset },
      stats: {
        windowDays: 7,
        totalVerdicts: recentTotal,
        fallbackVerdicts: recentFallback,
        fallbackRatePct: fallbackRate,
      },
    });
  } catch (err) {
    console.error("Verdict audit error:", err);
    return error(res, "Failed to load verdict audit.", 500);
  }
}

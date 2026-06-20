// ============================================================================
// AI Weekly Coaching Plan Controller
// ============================================================================
//
// Owns: getWeeklyPlan — data-driven 7-day coaching plan grounded in the
// same signals the 6D report uses (pattern gaps, SM-2 overdue items, quiz
// performance, velocity, category distribution, interview history).
//
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_FAST } from "../config/env.js";
import { aiComplete } from "../services/ai.service.js";
import {
  hasBothApproaches,
  isCodingSolution,
} from "../utils/solutionSignals.js";
import {
  CANONICAL_PATTERN_LABELS,
  FAANG_CORE_PATTERNS,
} from "../utils/patternTaxonomy.js";
import { aiErrorResponse } from "../utils/aiErrorResponse.js";

// ============================================================================
// AI WEEKLY COACHING PLAN — Data-Driven, 6D-Grounded
// ============================================================================
//
// PREVIOUS PROBLEM: The old version passed raw counts to the AI.
// It had no idea what the 6D scores were, which patterns were missing,
// which quiz subjects were weak, or what SM-2 state looked like.
// The AI was guessing at gaps from incomplete signals.
//
// THIS VERSION: We compute the exact same signals the 6D report uses
// and pass the full diagnostic picture to the AI. The result is a
// coaching plan that is genuinely personalized — it references specific
// patterns, specific quiz subjects, specific dimension scores, and
// the actual interview readiness verdict.
//
// ============================================================================
export async function getWeeklyPlan(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const userId = req.user.id;
    const teamId = req.teamId;

    // ── Load user profile ──────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        targetCompany: true,
        interviewDate: true,
        streak: true,
        name: true,
      },
    });

    // ── Load solutions (for pattern/depth analysis) ────
    const solutions = await prisma.solution.findMany({
      where: { userId, teamId },
      select: {
        patterns: true,
        confidence: true,
        bruteForce: true,
        optimizedApproach: true,
        timeComplexity: true,
        spaceComplexity: true,
        keyInsight: true,
        feynmanExplanation: true,
        categorySpecificData: true,
        aiFeedback: true,
        sm2EasinessFactor: true,
        sm2Repetitions: true,
        nextReviewDate: true,
        reviewCount: true,
        lastReviewedAt: true,
        createdAt: true,
        problem: { select: { category: true, difficulty: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const totalSolutions = solutions.length;

    // ── Compute 6D dimension scores (lightweight version) ──
    // We recompute the key signals here rather than calling the full
    // get6DReport endpoint — avoids circular dependency and is faster
    // since we only need the scores, not the full analytics layer.

    // D1 proxy
    const withPattern = solutions.filter((s) => s.patterns?.length > 0).length;
    const uniquePatterns = new Set(
      solutions.flatMap((s) => s.patterns ?? []),
    );
    const patternCoverageRate =
      totalSolutions > 0 ? Math.round((withPattern / totalSolutions) * 100) : 0;

    // D4 proxy — "optimization" is a CODING concept; compute % against
    // coding solutions only rather than diluting with non-CODING rows.
    const codingSolutions = solutions.filter(isCodingSolution);
    const codingTotal = codingSolutions.length;
    const withBothApproachesCount = codingSolutions.filter(hasBothApproaches).length;
    const optimizationRate =
      codingTotal > 0
        ? Math.round((withBothApproachesCount / codingTotal) * 100)
        : 0;

    // AI review signals
    const allAiReviews = [];
    solutions.forEach((s) => {
      if (s.aiFeedback && Array.isArray(s.aiFeedback)) {
        const latest = s.aiFeedback[s.aiFeedback.length - 1];
        if (latest) allAiReviews.push(latest);
      }
    });
    const avgAiScore =
      allAiReviews.length > 0
        ? Math.round(
            (allAiReviews
              .map((r) => r.overallScore)
              .filter((s) => s != null)
              .reduce((a, b) => a + b, 0) /
              allAiReviews.length) *
              10,
          ) / 10
        : null;

    // Pattern gaps — read from the SINGLE SOURCE OF TRUTH in
    // patternTaxonomy.js. The legacy inline 16-pattern list duplicated here
    // drifted from the canonical 25 (with 15 FAANG-core) and produced
    // misleading "/16" denominators in the AI weekly plan prompt.
    // Surface FAANG-core gaps preferentially — those are the patterns that
    // most directly affect interview readiness.
    const missingPatterns = FAANG_CORE_PATTERNS.filter(
      (p) => !uniquePatterns.has(p),
    );

    // SM-2 overdue with pattern context — flatten per-pattern so
    // multi-pattern overdue solutions contribute to every pattern they touch.
    const overdueItems = solutions
      .filter(
        (s) => s.nextReviewDate && new Date(s.nextReviewDate) <= new Date(),
      )
      .flatMap((s) => {
        const daysSince = Math.round(
          (Date.now() - new Date(s.nextReviewDate).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const ef = s.sm2EasinessFactor ?? 2.5;
        const category = s.problem?.category;
        const patterns = s.patterns?.length > 0 ? s.patterns : [null];
        return patterns.map((pattern) => ({ pattern, category, daysSince, ef }));
      })
      .sort((a, b) => b.daysSince - a.daysSince);

    // Most at-risk patterns (lowest EF + most overdue)
    const atRiskPatterns = [
      ...new Set(
        overdueItems
          .filter((o) => o.ef < 2.0 || o.daysSince > 3)
          .map((o) => o.pattern)
          .filter(Boolean),
      ),
    ].slice(0, 3);

    // ── Quiz performance analysis ─────────────────────
    // Quizzes are personal — not scoped to teamId
    const recentQuizzes = await prisma.quizAttempt.findMany({
      where: {
        userId,
        completedAt: { not: null },
        score: { not: null },
      },
      select: {
        subject: true,
        score: true,
        difficulty: true,
        aiAnalysis: true,
        completedAt: true,
      },
      orderBy: { completedAt: "desc" },
      take: 30,
    });

    // Group by subject and compute stats
    const quizBySubject = {};
    recentQuizzes.forEach((q) => {
      const key = q.subject.toLowerCase().trim();
      if (!quizBySubject[key]) {
        quizBySubject[key] = { subject: q.subject, scores: [], weakTopics: [] };
      }
      quizBySubject[key].scores.push(q.score);
      if (q.aiAnalysis?.weakTopics) {
        quizBySubject[key].weakTopics.push(...q.aiAnalysis.weakTopics);
      }
    });

    const quizSummary = Object.values(quizBySubject)
      .map((s) => ({
        subject: s.subject,
        avgScore: Math.round(
          s.scores.reduce((a, b) => a + b, 0) / s.scores.length,
        ),
        attempts: s.scores.length,
        weakTopics: [...new Set(s.weakTopics)].slice(0, 3),
        trend:
          s.scores.length >= 2
            ? s.scores[0] > s.scores[s.scores.length - 1]
              ? "improving"
              : s.scores[0] < s.scores[s.scores.length - 1]
                ? "declining"
                : "stable"
            : null,
      }))
      .sort((a, b) => a.avgScore - b.avgScore);

    const weakQuizSubjects = quizSummary.filter((s) => s.avgScore < 65);
    const strongQuizSubjects = quizSummary.filter((s) => s.avgScore >= 80);

    // ── Category distribution ──────────────────────────
    const categoryCount = {};
    solutions.forEach((s) => {
      const cat = s.problem?.category || "CODING";
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    // Missing categories (not practiced at all)
    const ALL_CATEGORIES = [
      "CODING",
      "SYSTEM_DESIGN",
      "LOW_LEVEL_DESIGN",
      "BEHAVIORAL",
      "CS_FUNDAMENTALS",
      "HR",
      "SQL",
    ];
    const missingCategories = ALL_CATEGORIES.filter(
      (c) => !categoryCount[c] || categoryCount[c] < 2,
    );

    // ── Interview history ──────────────────────────────
    const recentInterviews = await prisma.interviewSession.findMany({
      where: { userId, teamId, status: "COMPLETED" },
      select: { scores: true, category: true, debrief: true },
      orderBy: { completedAt: "desc" },
      take: 5,
    });

    // Extract interview weak areas from debriefs
    const interviewWeakAreas = [];
    recentInterviews.forEach((iv) => {
      if (iv.debrief?.improvements) {
        interviewWeakAreas.push(...iv.debrief.improvements.slice(0, 2));
      }
    });

    // ── Velocity ──────────────────────────────────────
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const recentSolutionCount = solutions.filter(
      (s) => new Date(s.createdAt) >= fourWeeksAgo,
    ).length;
    const avgWeeklyVelocity = Math.round((recentSolutionCount / 4) * 10) / 10;

    // ── Days until interview ───────────────────────────
    const daysUntilInterview = user?.interviewDate
      ? Math.ceil(
          (new Date(user.interviewDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    // ── Build the AI prompt with full diagnostic context ──
    const weeklyPlanSystem = `You are a personal interview coach creating a specific 7-day study plan.
You have been given a detailed diagnostic report of the candidate's strengths, gaps, and knowledge state.
Use this data to create a plan that directly addresses their specific weaknesses — not generic advice.

RULES:
1. Every daily task must reference a SPECIFIC pattern, category, or topic from the data below.
   BAD: "Practice dynamic programming problems."
   GOOD: "Solve 2 Dynamic Programming problems focusing on the 1D DP pattern (your pattern coverage shows DP is missing)."
2. If there are overdue reviews, assign specific review sessions — name the at-risk patterns.
3. If quiz scores are low on specific subjects, assign a retake — name the subject.
4. Tasks must be achievable in the stated time estimate.
5. If interview date is soon (<14 days), make the plan aggressive — 2-3 topics/day.
6. The weekly goal must be MEASURABLE (e.g., "Reach 5 patterns covered" not "improve skills").

Return JSON:
{
  "weeklyGoal": "One specific measurable goal",
  "urgencyLevel": "low|medium|high|critical",
  "focusAreas": ["top gap 1", "top gap 2"],
  "days": [
    {
      "day": "Monday",
      "focus": "Pattern Recognition|Solution Depth|Communication|Optimization|Pressure Performance|Retention",
      "tasks": ["specific task referencing actual data", "specific task"],
      "timeEstimate": "30 min",
      "priority": "critical|high|medium"
    }
  ],
  "keyInsight": "One specific, honest insight about the biggest gap in their preparation",
  "interviewReadinessAssessment": "One sentence on where they stand right now"
}`;

    const weeklyPlanUser = `CANDIDATE: ${user?.name || "Candidate"}
TARGET COMPANY: ${user?.targetCompany || "Not specified"}
DAYS UNTIL INTERVIEW: ${daysUntilInterview !== null ? daysUntilInterview : "Not set"}
CURRENT STREAK: ${user?.streak || 0} days
WEEKLY VELOCITY: ${avgWeeklyVelocity} solutions/week

── SOLUTION PRACTICE ──
Total solutions: ${totalSolutions}
Category breakdown: ${JSON.stringify(categoryCount)}
Missing categories (< 2 solutions): ${missingCategories.join(", ") || "None"}
AI review average: ${avgAiScore !== null ? `${avgAiScore}/10` : "No reviews yet"}
Optimization rate (brute→optimal): ${optimizationRate}% (target: 80%+)

── PATTERN COVERAGE ──
Patterns practiced (${uniquePatterns.size}/${CANONICAL_PATTERN_LABELS.length}): ${[...uniquePatterns].join(", ") || "None"}
Missing patterns: ${missingPatterns.length > 0 ? missingPatterns.join(", ") : "None — full coverage!"}
Pattern identification rate: ${patternCoverageRate}%

── KNOWLEDGE RETENTION (SM-2) ──
Overdue reviews: ${overdueItems.length}
At-risk patterns (low EF or long overdue): ${atRiskPatterns.length > 0 ? atRiskPatterns.join(", ") : "None"}

── QUIZ PERFORMANCE ──
${
  weakQuizSubjects.length > 0
    ? `Weak quiz subjects (avg < 65%):
${weakQuizSubjects
  .slice(0, 5)
  .map(
    (s) =>
      `  - ${s.subject}: ${s.avgScore}% (${s.attempts} attempts)${s.weakTopics.length > 0 ? `, weak on: ${s.weakTopics.join(", ")}` : ""}`,
  )
  .join("\n")}`
    : "No weak quiz subjects identified."
}
${
  strongQuizSubjects.length > 0
    ? `Strong quiz subjects (avg ≥ 80%):
${strongQuizSubjects
  .slice(0, 3)
  .map((s) => `  - ${s.subject}: ${s.avgScore}%`)
  .join("\n")}`
    : ""
}

── MOCK INTERVIEW HISTORY ──
Completed interviews: ${recentInterviews.length}
${
  interviewWeakAreas.length > 0
    ? `Recurring weaknesses from debriefs:
${interviewWeakAreas
  .slice(0, 4)
  .map((w) => `  - ${w}`)
  .join("\n")}`
    : "No interview history yet."
}

Build a specific 7-day plan that turns this data into daily actions.`;

    let plan;
    try {
      plan = await aiComplete({
        systemPrompt: weeklyPlanSystem,
        userPrompt: weeklyPlanUser,
        userId,
        teamId,
        model: AI_MODEL_FAST,
        temperature: 0.65,
        maxTokens: 2000,
        jsonMode: true,
        surface: "weekly-plan",
      });
    } catch (aiErr) {
      return aiErrorResponse(res, aiErr, "Failed to generate coaching plan.");
    }

    // Attach the diagnostic context so the UI can show what drove the plan
    plan.diagnosticSummary = {
      totalSolutions,
      avgAiScore,
      optimizationRate,
      patternCoverage: uniquePatterns.size,
      missingPatterns: missingPatterns.slice(0, 5),
      overdueReviews: overdueItems.length,
      atRiskPatterns,
      weakQuizSubjects: weakQuizSubjects.slice(0, 3).map((s) => ({
        subject: s.subject,
        avgScore: s.avgScore,
      })),
      targetCompany: user?.targetCompany,
      daysUntilInterview,
    };

    return success(res, { plan });
  } catch (err) {
    console.error("Weekly plan error:", err);
    return error(res, "Failed to generate coaching plan.", 500);
  }
}

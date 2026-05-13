// ============================================================================
// ProbSolver v3.0 — AI Controller (Team-Scoped RAG)
// ============================================================================
//
// SCOPING: The critical change here is RAG isolation. Every vector
// similarity search includes WHERE team_id = ? to ensure solutions
// from other teams are never retrieved as context.
//
// This is "pool-based multi-tenant RAG" — same table, filtered queries.
//
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_PRIMARY, AI_MODEL_FAST } from "../config/env.js";
import { aiComplete, AIError } from "../services/ai.service.js";
import { validateReview } from "../services/ai.validators.js";
import { buildFallbackReview } from "../services/ai.fallbacks.js";
import {
  hasBothApproaches,
  isCodingSolution,
} from "../utils/solutionSignals.js";
import { resolveGeneratedSourceUrl } from "../utils/platformSearch.js";
import { findSimilarTitles } from "../utils/titleSimilarity.js";

// Map AIError codes (rate limit, OpenAI down, parse fail, …) to HTTP
// responses so every controller in this file returns the same envelope
// shape on AI failure. Caller-visible error text matches what the
// pre-migration controllers produced for the same conditions.
function aiErrorResponse(res, err, defaultMessage) {
  if (err instanceof AIError) {
    if (err.code === "RATE_LIMITED") {
      return error(res, err.message, 429, err.code);
    }
    if (err.code === "OPENAI_RATE_LIMITED") {
      return error(
        res,
        "AI is temporarily rate-limited. Please retry shortly.",
        503,
        err.code,
      );
    }
    if (err.code === "OPENAI_DOWN" || err.code === "OPENAI_TIMEOUT") {
      return error(res, "AI is temporarily unavailable.", 503, err.code);
    }
    if (err.code === "INVALID_API_KEY") {
      return error(res, "AI is not configured correctly.", 500, err.code);
    }
    if (err.code === "PARSE_ERROR") {
      return error(res, defaultMessage, 500, err.code);
    }
  }
  console.error(`AI controller error: ${err?.message || err}`);
  return error(res, defaultMessage, 500);
}

// ============================================================================
// AI SOLUTION REVIEW (RAG-Enhanced, Team-Scoped)
// ============================================================================
// ============================================================================
// AI SOLUTION REVIEW (RAG-Enhanced, Rubric-Based, Team-Scoped)
// ============================================================================
//
// SCORING MODEL:
// AI scores each dimension independently (1-10).
// Controller computes weighted final score from dimension scores.
// Hard caps applied in code — not in prompt (more reliable).
// aiFeedback stored as array of reviews for improvement tracking.
//
export async function reviewSolution(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }
    const { solutionId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;

    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId },
      include: {
        problem: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            difficulty: true,
            adminNotes: true,
            tags: true,
            followUpQuestions: {
              orderBy: { order: "asc" },
              select: {
                id: true,
                question: true,
                difficulty: true,
                order: true,
              },
            },
          },
        },
        followUpAnswers: {
          include: {
            followUpQuestion: {
              select: { id: true, question: true, difficulty: true },
            },
          },
        },
      },
    });

    if (!solution) {
      return error(res, "Solution not found.", 404);
    }

    // ── RAG: Find similar teammate solutions ────────────
    let teammateSolutions = [];
    try {
      const solutionText = [
        solution.approach || "",
        solution.keyInsight || "",
        solution.code ? solution.code.substring(0, 300) : "",
      ].join(" ");
      const { generateEmbedding } =
        await import("../services/embedding.service.js");
      const queryEmbedding = await generateEmbedding(solutionText);
      if (queryEmbedding) {
        const vectorStr = `[${queryEmbedding.join(",")}]`;
        teammateSolutions = await prisma.$queryRawUnsafe(
          `SELECT s.id, s.approach, s."keyInsight" as "key_insight",
           s."timeComplexity" as "time_complexity", s."spaceComplexity" as "space_complexity",
           s.confidence, s.patterns, u.name as author_name,
           1 - (s.embedding <=> $1::vector) as similarity
           FROM solutions s JOIN users u ON s."userId" = u.id
           WHERE s."teamId" = $2 AND s."problemId" = $3 AND s."userId" != $4
           AND s.embedding IS NOT NULL ORDER BY s.embedding <=> $1::vector LIMIT 3`,
          vectorStr,
          teamId,
          solution.problemId,
          userId,
        );
      }
    } catch (err) {
      console.error("RAG search failed (continuing without):", err.message);
    }

    // ── Build RAG context ──────────────────────────────
    let ragContext = "";
    if (teammateSolutions.length > 0) {
      ragContext = teammateSolutions
        .map(
          (ts, i) =>
            `Teammate ${i + 1} (${ts.author_name}):
  Approach: ${ts.approach || "Not provided"}
  Key Insight: ${ts.key_insight || "Not provided"}
  Complexity: ${ts.time_complexity || "?"} time, ${ts.space_complexity || "?"} space
  Pattern: ${(ts.patterns ?? []).join(", ") || "Not identified"}
  Confidence: ${ts.confidence}/5`,
        )
        .join("\n\n");
    }

    // ── Pattern baseline: user's historical performance on this pattern ──
    // Fetch last 5 AI-reviewed solutions with same pattern to compute baseline.
    // Tells the AI: "this user usually scores X/10 on [pattern] problems."
    // Non-fatal — review continues without it if query fails.
    let patternBaseline = null;
    if (solution.patterns?.length > 0) {
      try {
        const patternSolutions = await prisma.solution.findMany({
          where: {
            userId,
            teamId,
            // Overlap match: baseline includes any past solution that
            // shared ANY of this solution's patterns. Stronger signal
            // than primary-only matching.
            patterns: { hasSome: solution.patterns },
            id: { not: solutionId },
            aiFeedback: { not: null },
          },
          select: {
            aiFeedback: true,
            problem: { select: { difficulty: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        });

        if (patternSolutions.length > 0) {
          const historicalScores = patternSolutions
            .map((s) => {
              const feedback = s.aiFeedback;
              if (!Array.isArray(feedback) || feedback.length === 0)
                return null;
              const latest = feedback[feedback.length - 1];
              return latest?.overallScore ?? null;
            })
            .filter((score) => score !== null);

          if (historicalScores.length > 0) {
            const avgScore =
              Math.round(
                (historicalScores.reduce((a, b) => a + b, 0) /
                  historicalScores.length) *
                  10,
              ) / 10;

            const dimFields = [
              "codeCorrectness",
              "patternAccuracy",
              "understandingDepth",
              "explanationQuality",
            ];
            const dimAvgs = {};
            dimFields.forEach((dim) => {
              const dimScores = patternSolutions.flatMap((s) => {
                const feedback = s.aiFeedback;
                if (!Array.isArray(feedback)) return [];
                return feedback
                  .map((r) => r.dimensionScores?.[dim])
                  .filter((v) => v != null);
              });
              if (dimScores.length > 0) {
                dimAvgs[dim] =
                  Math.round(
                    (dimScores.reduce((a, b) => a + b, 0) / dimScores.length) *
                      10,
                  ) / 10;
              }
            });

            // historicalScores is desc order: [0] = most recent, [last] = oldest
            let trend = null;
            if (historicalScores.length >= 2) {
              const recent = historicalScores[0];
              const oldest = historicalScores[historicalScores.length - 1];
              trend =
                recent > oldest
                  ? "improving"
                  : recent < oldest
                    ? "declining"
                    : "stable";
            }

            patternBaseline = {
              // Joined display string — baseline spans any-overlap with
              // the current solution's patterns.
              pattern: solution.patterns.join(", "),
              solutionCount: patternSolutions.length,
              avgOverallScore: avgScore,
              dimensionAverages: dimAvgs,
              trend,
            };
          }
        }
      } catch (baselineErr) {
        console.error(
          "Pattern baseline fetch failed (continuing):",
          baselineErr.message,
        );
      }
    }

    // ── Build follow-up context ────────────────────────
    const answeredMap = new Map(
      solution.followUpAnswers.map((a) => [a.followUpQuestionId, a.answerText]),
    );
    const followUpAnswersForPrompt = solution.problem.followUpQuestions.map(
      (fq) => ({
        id: fq.id,
        question: fq.question,
        difficulty: fq.difficulty,
        answerText: answeredMap.get(fq.id) || null,
      }),
    );

    // ── Call AI ────────────────────────────────────────
    const { solutionReviewPrompt } = await import("../services/ai.prompts.js");
    const { system, user } = solutionReviewPrompt({
      problem: solution.problem,
      category: solution.problem.category,
      difficulty: solution.problem.difficulty,
      language: solution.language,
      code: solution.code,
      approach: solution.approach,
      patterns: solution.patterns,
      keyInsight: solution.keyInsight,
      feynmanExplanation: solution.feynmanExplanation,
      realWorldConnection: solution.realWorldConnection,
      confidence: solution.confidence,
      timeTaken: solution.timeTaken || null,
      solveMethod: solution.solveMethod || null,
      adminNotes: solution.problem.adminNotes,
      ragContext,
      followUpAnswers: followUpAnswersForPrompt,
      patternBaseline, // ← new
      categorySpecificData: solution.categorySpecificData || null, // ADD THIS
    });

    // ── AI call → validate → fallback if needed ───────────
    // The grounded-AI pattern from the readiness verdict applied here:
    //   1. Try the LLM. Transient errors (429/5xx) already retried inside
    //      aiComplete; only terminal failures throw.
    //   2. If the call returns, validate against validateReview's hard
    //      rules (score ranges, flag/explainer consistency, follow-up
    //      questionId echo-back, refusal detection).
    //   3. On any AI error or validation failure → buildFallbackReview.
    //      User sees a working "review unavailable, please retry"
    //      response instead of a 500.
    const expectedQuestionIds = followUpAnswersForPrompt.map((q) => q.id);
    let aiResponse;
    let usedReviewFallback = false;
    let reviewViolations = [];
    try {
      aiResponse = await aiComplete({
        systemPrompt: system,
        userPrompt: user,
        userId,
        model: AI_MODEL_FAST,
        temperature: 0.6,
        maxTokens: 2000,
        jsonMode: true,
        surface: "solution-review",
      });
      const check = validateReview(aiResponse, {
        followUpQuestionIds: expectedQuestionIds,
      });
      if (!check.valid) {
        reviewViolations = check.violations;
        console.warn(
          `[solution-review] validation failed for solution ${solutionId}: ${reviewViolations.join(", ")}`,
        );
        aiResponse = buildFallbackReview({
          followUpQuestionIds: expectedQuestionIds,
        });
        usedReviewFallback = true;
      }
    } catch (aiErr) {
      // Hard AI failure (429, 5xx exhaustion, parse error, rate limit).
      // Map RATE_LIMITED to a user-visible 429 — they explicitly hit the
      // per-day cap and should know. Everything else falls back to a safe
      // review so the user isn't blocked on transient infra problems.
      if (aiErr instanceof AIError && aiErr.code === "RATE_LIMITED") {
        return aiErrorResponse(res, aiErr, "Failed to generate AI feedback.");
      }
      console.warn(
        `[solution-review] AI call failed (${aiErr?.code || aiErr?.message}); using fallback`,
      );
      aiResponse = buildFallbackReview({
        followUpQuestionIds: expectedQuestionIds,
      });
      usedReviewFallback = true;
      reviewViolations = [`llm-error:${aiErr?.code || aiErr?.message || "unknown"}`];
    }

    // ── Compute weighted score ─────────────────────────
    const dimScores = aiResponse.scores || {};
    const aiFlags = aiResponse.flags || {};
    let computedScore =
      (dimScores.codeCorrectness || 5) * 0.35 +
      (dimScores.patternAccuracy || 5) * 0.2 +
      (dimScores.understandingDepth || 5) * 0.2 +
      (dimScores.explanationQuality || 5) * 0.15 +
      (dimScores.confidenceCalibration || 5) * 0.1;

    if (
      (dimScores.codeCorrectness || 10) <= 3 ||
      aiFlags.incompleteSubmission
    ) {
      computedScore = Math.min(computedScore, 5.0);
    }

    const answeredCount = solution.followUpAnswers.length;
    const followUpBonus = Math.min(answeredCount * 0.5, 2.0);
    const overallScore = Math.min(
      Math.round(computedScore + followUpBonus),
      10,
    );

    const overconfidenceDetected =
      solution.confidence >= 4 && (dimScores.codeCorrectness || 10) <= 3;

    const flags = {
      languageMismatch: aiFlags.languageMismatch || false,
      detectedLanguage: aiFlags.detectedLanguage || null,
      selectedLanguage: solution.language || null,
      incompleteSubmission: aiFlags.incompleteSubmission || false,
      wrongPattern: aiFlags.wrongPattern || false,
      identifiedPattern:
        (solution.patterns ?? []).join(", ") ||
        aiFlags.identifiedPattern ||
        null,
      correctPattern: aiFlags.correctPattern || null,
      overconfidenceDetected,
      candidateConfidence: solution.confidence,
      codeCorrectnessScore: dimScores.codeCorrectness || null,
    };

    const followUpEvaluations = followUpAnswersForPrompt.map((fq, i) => {
      const aiEval = aiResponse.followUpEvaluations?.[i];
      return {
        questionId: fq.id,
        question: fq.question,
        difficulty: fq.difficulty,
        wasAnswered: !!fq.answerText,
        score: fq.answerText ? aiEval?.score || null : null,
        feedback: fq.answerText
          ? aiEval?.feedback || null
          : "Skipped — no answer provided",
      };
    });

    await Promise.all(
      followUpEvaluations
        .filter((e) => e.wasAnswered && e.score != null)
        .map((e) =>
          prisma.solutionFollowUpAnswer
            .updateMany({
              where: { solutionId, followUpQuestionId: e.questionId },
              data: { aiScore: e.score, aiFeedback: e.feedback },
            })
            .catch(() => {}),
        ),
    );

    const reviewRecord = {
      reviewedAt: new Date().toISOString(),
      reviewNumber: (solution.reviewCount || 0) + 1,
      overallScore,
      dimensionScores: dimScores,
      flags,
      strengths: aiResponse.strengths || [],
      gaps: aiResponse.gaps || [],
      improvement: aiResponse.improvement || null,
      interviewTip: aiResponse.interviewTip || null,
      readinessVerdict: aiResponse.readinessVerdict || null,
      complexityCheck: aiResponse.complexityCheck || null,
      followUpEvaluations,
      followUpBonus,
      ragContext: {
        teammateCount: teammateSolutions.length,
        hasAdminNotes: !!solution.problem.adminNotes,
      },
      patternBaseline, // ← stored — AIReviewCard can display baseline context
      // Set when the AI failed or returned an output that didn't pass
      // validateReview. UI can render a "review unavailable, retry"
      // banner instead of misrepresenting the placeholder as real feedback.
      usedFallback: usedReviewFallback,
      fallbackReason: usedReviewFallback ? reviewViolations : undefined,
    };

    const existingFeedback = Array.isArray(solution.aiFeedback)
      ? solution.aiFeedback
      : solution.aiFeedback
        ? [solution.aiFeedback]
        : [];
    const updatedFeedback = [...existingFeedback, reviewRecord];

    // Also freeze this review onto the most-recent SolutionAttempt so the
    // attempt-history UI can show AI score deltas per attempt. The attempt
    // log is never nullable once Commit 1 has shipped; this is a best-effort
    // update — missing attempts just means older data (pre-history).
    await prisma.$transaction(async (tx) => {
      await tx.solution.update({
        where: { id: solutionId },
        data: {
          aiFeedback: updatedFeedback,
          reviewCount: { increment: 1 },
          lastReviewedAt: new Date(),
          timeComplexity:
            solution.timeComplexity ||
            aiResponse.complexityCheck?.timeComplexity ||
            null,
          spaceComplexity:
            solution.spaceComplexity ||
            aiResponse.complexityCheck?.spaceComplexity ||
            null,
        },
      });
      const latestAttempt = await tx.solutionAttempt.findFirst({
        where: { solutionId },
        orderBy: { attemptNumber: "desc" },
        select: { id: true },
      });
      if (latestAttempt) {
        await tx.solutionAttempt.update({
          where: { id: latestAttempt.id },
          data: { aiFeedbackSnapshot: reviewRecord },
        });
      }
    });

    return success(res, {
      feedback: reviewRecord,
      isFirstReview: existingFeedback.length === 0,
      previousScore:
        existingFeedback.length > 0
          ? existingFeedback[existingFeedback.length - 1].overallScore
          : null,
      totalReviews: updatedFeedback.length,
      usedFallback: usedReviewFallback,
    });
  } catch (err) {
    console.error("AI review error:", err);
    return error(res, "Failed to generate AI review.", 500);
  }
}

// ============================================================================
// AI PROGRESSIVE HINTS (Team-Scoped)
// ============================================================================
export async function getHint(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { problemId } = req.params;
    const { level } = req.body;
    const teamId = req.teamId;

    const problem = await prisma.problem.findFirst({
      where: { id: problemId, teamId },
      select: {
        title: true,
        description: true,
        category: true,
        adminNotes: true,
        tags: true,
      },
    });

    if (!problem) {
      return error(res, "Problem not found.", 404);
    }

    const hintLevel = Math.min(Math.max(parseInt(level) || 1, 1), 3);
    const levelInstructions = {
      1: "Give a vague directional nudge. Do NOT name the pattern or approach. Just point them in the right direction.",
      2: 'Name the general approach category (e.g., "Consider a sliding window approach") but do NOT give specific implementation details.',
      3: "Name the specific technique and give a brief outline of the first step. Still do NOT give the full solution.",
    };

    let hintText;
    try {
      hintText = await aiComplete({
        systemPrompt: `You are an interview coach giving a Level ${hintLevel}/3 hint.
${levelInstructions[hintLevel]}
Keep it to 1-2 sentences maximum.`,
        userPrompt: `Problem: ${problem.title}\nDescription: ${problem.description || "N/A"}\nCategory: ${problem.category}\nTags: ${problem.tags?.join(", ") || "none"}`,
        userId: req.user.id,
        model: AI_MODEL_FAST,
        temperature: 0.7,
        maxTokens: 200,
        jsonMode: false,
        surface: "problem-hint",
      });
    } catch (aiErr) {
      return aiErrorResponse(res, aiErr, "Failed to generate hint.");
    }

    return success(res, {
      hint: {
        level: hintLevel,
        text: (hintText || "").trim(),
      },
    });
  } catch (err) {
    console.error("Hint error:", err);
    return error(res, "Failed to generate hint.", 500);
  }
}

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

    // Pattern gaps
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
    const missingPatterns = CANONICAL_PATTERNS.filter(
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
Patterns practiced (${uniquePatterns.size}/16): ${[...uniquePatterns].join(", ") || "None"}
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

// ============================================================================
// AI PROBLEM CONTENT GENERATOR (TEAM_ADMIN tool)
// ============================================================================
export async function generateProblemContent(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { title, category, difficulty } = req.body;

    const contentTokenBudget = {
      SYSTEM_DESIGN: 3500,
      LOW_LEVEL_DESIGN: 2800,
      CODING: 2000,
      BEHAVIORAL: 1800,
      CS_FUNDAMENTALS: 2000,
      SQL: 1800,
      HR: 1500,
    };
    const contentModelMap = {
      SYSTEM_DESIGN: AI_MODEL_PRIMARY,
      LOW_LEVEL_DESIGN: AI_MODEL_PRIMARY,
    };

    let content;
    try {
      content = await aiComplete({
        systemPrompt: `You are an expert interview problem designer. Generate complete problem content.
Return JSON:
{
  "description": "Full problem description with examples",
  "realWorldContext": "Real-world application of this problem",
  "useCases": "3-5 use cases as a string",
  "adminNotes": "Teaching notes: expected approach, edge cases, key insight, common mistakes",
  "tags": ["tag1", "tag2", ...],
  "followUpQuestions": [
    { "question": "...", "difficulty": "EASY", "hint": "..." },
    { "question": "...", "difficulty": "MEDIUM", "hint": "..." },
    { "question": "...", "difficulty": "HARD", "hint": "..." }
  ]
}`,
        userPrompt: `Generate content for: "${title}"\nCategory: ${category || "CODING"}\nDifficulty: ${difficulty || "MEDIUM"}`,
        userId: req.user.id,
        model: contentModelMap[category] || AI_MODEL_FAST,
        temperature: 0.8,
        maxTokens: contentTokenBudget[category] || 2000,
        jsonMode: true,
        surface: "problem-content",
      });
    } catch (aiErr) {
      return aiErrorResponse(res, aiErr, "Failed to generate problem content.");
    }

    return success(res, { content });
  } catch (err) {
    console.error("Generate content error:", err);
    return error(res, "Failed to generate problem content.", 500);
  }
}

// ============================================================================
// SIMILAR PROBLEMS SEARCH (Team-Scoped Vector Search)
// ============================================================================
export async function findSimilarProblems(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { query } = req.body;
    const teamId = req.teamId;

    const { generateEmbedding } =
      await import("../services/embedding.service.js");
    const embedding = await generateEmbedding(query);

    if (!embedding) {
      return error(res, "Failed to generate search embedding.", 500);
    }

    const vectorStr = `[${embedding.join(",")}]`;

    const similar = await prisma.$queryRawUnsafe(
      `
  SELECT
    p.id,
    p.title,
    p.difficulty,
    p.category,
    p.tags,
    1 - (p.embedding <=> $1::vector) as similarity
  FROM problems p
  WHERE p."teamId" = $2
    AND p."isPublished" = true
    AND p."isHidden" = false
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> $1::vector
  LIMIT 5
`,
      vectorStr,
      teamId,
    );

    return success(res, { problems: similar });
  } catch (err) {
    console.error("Similar problems error:", err);
    return error(res, "Failed to search similar problems.", 500);
  }
}

// ============================================================================
// AI PROBLEM GENERATION (Multi-Stage Pipeline — for Team Admin)
// ============================================================================
//
// ARCHITECTURE:
// Stage 1 — Intelligence: Gather team performance data from DB (parallel queries)
// Stage 2 — Selection: AI decides WHAT problems to generate (fast, cheap call)
// Stage 3 — Content: Generate rich content per problem IN PARALLEL
//
// Platform assignment: done in CODE before Stage 2, not left to AI.
// Currently LeetCode-only for reliable URLs.
// TODO: Replace with Search API for multi-platform support.
// See Super Admin → Product Roadmap for details.
//
// ============================================================================
export async function generateProblemsAI(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const teamId = req.teamId;
    const userId = req.user.id;
    const { category, count, difficulty, targetCompany, focusAreas } = req.body;

    if (!category) {
      return error(res, "Category is required.", 400);
    }

    const problemCount = Math.min(Math.max(parseInt(count) || 1, 1), 5);
    const difficultyPref = difficulty || "auto";

    // ── STAGE 1: Intelligence Gathering ────────────────
    // All DB queries run in parallel for speed.
    let teamContext = "";
    let existingProblems = "";
    let difficultyInstruction = "";

    try {
      const [existing, totalMembers, solutionStats, patternGaps] =
        await Promise.all([
          // Existing problems to avoid duplicates
          prisma.problem.findMany({
            where: { teamId, category, isPublished: true },
            select: { title: true, difficulty: true },
            take: 50,
          }),
          // Team size for context
          prisma.user.count({ where: { currentTeamId: teamId } }),
          // Performance by difficulty in this category
          prisma.$queryRaw`
            SELECT
              p.difficulty,
              COUNT(DISTINCT s."userId")::int as solvers,
              ROUND(AVG(s.confidence), 1)::float as avg_confidence,
              COUNT(s.id)::int as total_solutions
            FROM solutions s
            JOIN problems p ON s."problemId" = p.id
            WHERE s."teamId" = ${teamId}
              AND p.category = ${category}::"ProblemCategory"
            GROUP BY p.difficulty
          `,
          // This user's patterns to find gaps (intentionally userId-scoped,
          // not team-scoped — we want to know what THIS user has practiced)
          prisma.solution.findMany({
            where: { teamId, userId },
            select: { patterns: true, confidence: true },
            orderBy: { createdAt: "desc" },
            take: 30,
          }),
        ]);

      // Build existing problems list for deduplication
      if (existing.length > 0) {
        existingProblems = existing
          .map((p) => `- ${p.title} (${p.difficulty})`)
          .join("\n");
      }

      // Build rich team context string
      if (solutionStats.length > 0) {
        teamContext = `Team size: ${totalMembers} members\n`;
        teamContext += `Experience in ${category}:\n`;
        solutionStats.forEach((s) => {
          const level =
            s.avg_confidence >= 4
              ? "Strong"
              : s.avg_confidence >= 3
                ? "Developing"
                : "Struggling";
          teamContext += `  ${s.difficulty}: ${s.solvers}/${totalMembers} members solved, avg confidence ${s.avg_confidence}/5 (${level})\n`;
        });

        const practicedPatterns = [
          ...new Set(patternGaps.flatMap((s) => s.patterns ?? [])),
        ];
        if (practicedPatterns.length > 0) {
          teamContext += `Patterns already practiced: ${practicedPatterns.join(", ")}\n`;
        }

        const weakPatterns = [
          ...new Set(
            patternGaps
              .filter((s) => s.confidence <= 2 && s.patterns?.length > 0)
              .flatMap((s) => s.patterns),
          ),
        ];
        if (weakPatterns.length > 0) {
          teamContext += `Weak areas needing reinforcement: ${weakPatterns.join(", ")}\n`;
        }
      } else {
        teamContext = `Team size: ${totalMembers} members. Fresh start in ${category} — no solutions yet. Begin with fundamentals.`;
      }

      // Compute difficulty instruction from actual team performance
      if (difficultyPref === "auto") {
        const hasEasy = solutionStats.find((s) => s.difficulty === "EASY");
        const hasMedium = solutionStats.find((s) => s.difficulty === "MEDIUM");

        if (!hasEasy || hasEasy.avg_confidence < 3) {
          difficultyInstruction = `Team needs foundational work. Generate ${Math.ceil(problemCount * 0.6)} EASY and ${Math.floor(problemCount * 0.4)} MEDIUM problems.`;
        } else if (!hasMedium || hasMedium.avg_confidence < 3) {
          difficultyInstruction = `Team has basic skills. Generate ${Math.ceil(problemCount * 0.3)} EASY, ${Math.ceil(problemCount * 0.5)} MEDIUM, and ${Math.floor(problemCount * 0.2)} HARD problems.`;
        } else {
          difficultyInstruction = `Team is progressing well. Generate ${Math.ceil(problemCount * 0.2)} EASY, ${Math.ceil(problemCount * 0.4)} MEDIUM, and ${Math.floor(problemCount * 0.4)} HARD problems.`;
        }
      } else if (difficultyPref.startsWith("custom:")) {
        const parts = difficultyPref.replace("custom:", "").split(",");
        const easy = parseInt(parts[0]) || 0;
        const medium = parseInt(parts[1]) || 0;
        const hard = parseInt(parts[2]) || 0;
        difficultyInstruction = `Generate exactly: ${easy} EASY, ${medium} MEDIUM, ${hard} HARD problems.`;
      } else {
        difficultyInstruction = `All ${problemCount} problems should be ${difficultyPref} difficulty.`;
      }
    } catch (err) {
      console.error("Stage 1 intelligence gathering failed:", err.message);
      // Non-fatal — continue with defaults
      teamContext = "Context unavailable — generate balanced problems.";
      difficultyInstruction =
        difficultyPref === "auto"
          ? "Mix of EASY, MEDIUM, and HARD."
          : difficultyPref.startsWith("custom:")
            ? difficultyInstruction || "Mix of difficulties."
            : `${difficultyPref} difficulty.`;
    }

    // ── STAGE 2: Problem Selection ──────────────────────
    // Platform assignments computed HERE in code — not left to AI.
    // This guarantees reliable URLs (LeetCode-only for now).
    // TODO: Replace with Search API for multi-platform support.
    // See Super Admin → Product Roadmap for details.
    const { problemSelectionPrompt, problemContentGenerationPrompt } =
      await import("../services/ai.prompts.js");

    const platformAssignments = Array.from(
      { length: problemCount },
      (_, i) => ({
        platform:
          category === "CODING" || category === "SQL" ? "LEETCODE" : "OTHER",
        slot: i + 1,
        difficulty: (() => {
          if (!difficultyPref.startsWith("custom:")) {
            return difficultyPref === "auto" ? "auto" : difficultyPref;
          }
          const parts = difficultyPref.replace("custom:", "").split(",");
          const easy = parseInt(parts[0]) || 0;
          const medium = parseInt(parts[1]) || 0;
          if (i < easy) return "EASY";
          if (i < easy + medium) return "MEDIUM";
          return "HARD";
        })(),
      }),
    );

    const selectionPromptData = {
      category,
      count: problemCount,
      difficulty: difficultyPref,
      difficultyInstruction,
      teamContext,
      existingProblems,
      targetCompany,
      focusAreas,
      platformAssignments,
    };

    const { system: selSystem, user: selUser } =
      problemSelectionPrompt(selectionPromptData);

    let selections = [];
    let learningPath = "";

    try {
      const selectionResult = await aiComplete({
        systemPrompt: selSystem,
        userPrompt: selUser,
        userId: req.user.id,
        model: AI_MODEL_FAST,
        temperature: 0.7,
        maxTokens: 1200,
        jsonMode: true,
        surface: "problem-selection",
      });

      selections = selectionResult.selections || [];
      learningPath = selectionResult.learningPath || "";

      // Enforce platform assignments — AI sometimes substitutes platforms
      selections = selections.map((sel, i) => ({
        ...sel,
        platform: platformAssignments[i]?.platform || sel.platform,
      }));
    } catch (err) {
      console.error("Stage 2 selection failed:", err.message);

      // Fallback to legacy single-call approach
      const { problemGenerationPrompt } =
        await import("../services/ai.prompts.js");
      const { system, user } = problemGenerationPrompt({
        category,
        count: problemCount,
        difficulty: difficultyPref,
        targetCompany,
        focusAreas,
        teamContext,
        existingProblems,
      });

      const maxTokens = Math.min(problemCount * 1800, 8000);

      let fallbackResult;
      try {
        fallbackResult = await aiComplete({
          systemPrompt: system,
          userPrompt: user,
          userId: req.user.id,
          model: AI_MODEL_FAST,
          temperature: 0.8,
          maxTokens,
          jsonMode: true,
          surface: "problem-generation-legacy",
        });
      } catch (fallbackErr) {
        return aiErrorResponse(
          res,
          fallbackErr,
          "AI failed to generate problems.",
        );
      }

      if (!fallbackResult.problems?.length) {
        return error(res, "AI failed to generate problems.", 500);
      }

      return success(res, {
        problems: fallbackResult.problems,
        reasoning: fallbackResult.reasoning,
        count: fallbackResult.problems.length,
        category,
        difficulty: difficultyPref,
        pipeline: "legacy",
      });
    }

    if (selections.length === 0) {
      return error(res, "AI failed to select problems.", 500);
    }

    // Pre-fetch existing team titles ONCE for duplicate detection below.
    // Cheap — just id + title, no description or embeddings. At 500 problems
    // this is ~5 KB over the wire; in-memory token-Jaccard per generated
    // title is microseconds. If a team ever reaches 10k problems, move
    // this to a raw SQL trigram query instead.
    const existingTitles = await prisma.problem.findMany({
      where: { teamId },
      select: { id: true, title: true },
    });

    // ── STAGE 3: Content Generation (PARALLEL) ──────────
    // One focused call per problem, all running simultaneously.
    // If one fails, that problem returns partial data — others succeed.
    const contentPromises = selections.map(async (selection) => {
      try {
        const { system: contentSystem, user: contentUser } =
          problemContentGenerationPrompt({
            title: selection.title,
            category,
            difficulty: selection.difficulty,
            platform: selection.platform,
            url: selection.url,
            pattern: selection.pattern,
            targetCompany,
            hrQuestionCategory: selection.hrQuestionCategory || null, // ← ADD THIS
          });

        // Category-specific token budgets and model selection.
        //
        // Research basis for budgets:
        // SYSTEM_DESIGN: needs full problem description with scale requirements,
        //   NFRs, architecture overview, teaching notes (5 sections), follow-ups.
        //   Minimum viable output is ~2800 tokens. Set to 3500 with buffer.
        // LOW_LEVEL_DESIGN: needs entity list, class hierarchy description,
        //   design pattern justification, SOLID analysis, extensibility follow-ups.
        //   Minimum viable output is ~2200 tokens. Set to 2800 with buffer.
        // BEHAVIORAL/HR: narrative content, more concise. 1800 is sufficient.
        // Others: 2000 is adequate with some buffer.
        //
        // Model selection:
        // SYSTEM_DESIGN and LOW_LEVEL_DESIGN require genuine multi-step reasoning
        // about architecture and object relationships. GPT-4o-mini produces shallow
        // SD/LLD content — it names components without understanding trade-offs.
        // GPT-4o produces meaningfully better content for these two categories.
        // Cost delta at 5 problems max is negligible.
        const categoryTokenBudget = {
          SYSTEM_DESIGN: 3500,
          LOW_LEVEL_DESIGN: 2800,
          CODING: 2000,
          BEHAVIORAL: 1800,
          CS_FUNDAMENTALS: 2000,
          SQL: 1800,
          HR: 1500,
        };
        const categoryModel = {
          SYSTEM_DESIGN: AI_MODEL_PRIMARY,
          LOW_LEVEL_DESIGN: AI_MODEL_PRIMARY,
        };
        const contentMaxTokens = categoryTokenBudget[category] || 2000;
        const contentModel = categoryModel[category] || AI_MODEL_FAST;

        const content = await aiComplete({
          systemPrompt: contentSystem,
          userPrompt: contentUser,
          userId: req.user.id,
          model: contentModel,
          temperature: 0.75,
          maxTokens: contentMaxTokens,
          jsonMode: true,
          surface: "problem-content-stage3",
        });

        const isHRProblem = category === "HR";

        return {
          title: selection.title,
          difficulty: selection.difficulty,
          category,
          source: selection.platform,
          // Policy lives in utils/platformSearch.js. Key behavior:
          //   low confidence OR missing URL → platform search URL,
          //   high/medium → the AI-provided URL,
          //   HR → always empty.
          sourceUrl: resolveGeneratedSourceUrl({
            isHRProblem,
            urlConfidence: selection.urlConfidence,
            url: selection.url,
            platform: selection.platform,
            title: selection.title,
          }),
          description: content.description || "",
          // HR: realWorldContext and useCases are empty (not applicable)
          realWorldContext: isHRProblem ? "" : content.realWorldContext || "",
          useCases: isHRProblem ? "" : content.useCases || "",
          adminNotes: content.adminNotes || "",
          // HR: no algorithm tags or company tags
          tags: isHRProblem ? [] : (content.tags || []).filter(Boolean),
          companyTags: isHRProblem
            ? []
            : (content.companyTags || []).filter(Boolean),
          followUpQuestions: content.followUpQuestions || [],
          whySelected: selection.whySelected || "",
          urlConfidence: selection.urlConfidence || "high",
          // Duplicate detection: token-Jaccard against every existing
          // team title. Empty array = no likely duplicates. Admin sees
          // a warning chip on the preview card when this is non-empty.
          similarTo: findSimilarTitles(selection.title, existingTitles),
          // HR: pass hrQuestionCategory through for categoryData storage
          // Uses content.hrQuestionCategory (from Stage 3 AI response) or
          // falls back to selection.hrQuestionCategory (from Stage 2 selection)
          ...(isHRProblem && {
            hrQuestionCategory:
              content.hrQuestionCategory ||
              selection.hrQuestionCategory ||
              null,
          }),
        };
      } catch (err) {
        console.error(
          `Stage 3 content generation failed for "${selection.title}":`,
          err.message,
        );

        // Return partial problem — better than nothing
        return {
          title: selection.title,
          difficulty: selection.difficulty,
          category,
          source: selection.platform,
          // Content generation failed, so we can't trust the URL either;
          // fall back to a platform search so the admin still has
          // something to click when curating.
          sourceUrl: resolveGeneratedSourceUrl({
            isHRProblem: category === "HR",
            urlConfidence: "low",
            url: null,
            platform: selection.platform,
            title: selection.title,
          }),
          description: `Problem: ${selection.title}\nPlease look up this problem on LeetCode for the full description.`,
          realWorldContext: "",
          useCases: "",
          adminNotes:
            `Pattern: ${selection.pattern || ""}. ${selection.whySelected || ""}`.trim(),
          tags: [selection.pattern].filter(Boolean),
          companyTags: [],
          followUpQuestions: [],
          whySelected: selection.whySelected || "",
          similarTo: findSimilarTitles(selection.title, existingTitles),
          contentGenerationFailed: true,
        };
      }
    });

    const problems = await Promise.all(contentPromises);

    const successCount = problems.filter(
      (p) => !p.contentGenerationFailed,
    ).length;

    const reasoning = learningPath
      ? `${learningPath} (${successCount}/${problems.length} fully generated)`
      : `Generated ${successCount}/${problems.length} problems for ${category}`;

    return success(res, {
      problems,
      reasoning,
      count: problems.length,
      category,
      difficulty: difficultyPref,
      pipeline: "multi-stage",
      stages: {
        intelligenceGathered: !!teamContext,
        problemsSelected: selections.length,
        contentGenerated: successCount,
      },
    });
  } catch (err) {
    console.error("AI problem generation error:", err);
    return error(res, "Failed to generate problems.", 500);
  }
}

// ============================================================================
// GENERATE REVIEW HINTS (Active Recall Support)
// ============================================================================
//
// Called during a review session after the user has attempted recall.
// Uses the solution's existing aiFeedback to generate targeted questions
// that probe exactly where the user previously struggled.
// One fast GPT call using cached data — no new DB reads needed.
//
export async function generateReviewHints(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const { solutionId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;
    // Client may pass the in-progress recall attempt so the AI can probe
    // exactly where the user fell short, rather than re-asking the same
    // generic questions every review. Optional — older clients omit it.
    const recallText =
      typeof req.body?.recallText === "string" ? req.body.recallText.trim() : "";
    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId },
      select: {
        id: true,
        patterns: true,
        keyInsight: true,
        confidence: true,
        reviewCount: true,
        aiFeedback: true,
        problem: {
          select: {
            title: true,
            category: true,
            difficulty: true,
            adminNotes: true,
          },
        },
      },
    });

    if (!solution) {
      return error(res, "Solution not found.", 404);
    }

    // Extract the most recent AI review for context
    const latestReview = Array.isArray(solution.aiFeedback)
      ? solution.aiFeedback[solution.aiFeedback.length - 1]
      : null;

    // Build context from what we know about this solution
    const previousGaps = latestReview?.gaps || [];
    const previousFlags = latestReview?.flags || {};
    const dimensionScores = latestReview?.dimensionScores || {};
    const previousScore = latestReview?.overallScore || null;

    // Identify the weakest dimensions to probe
    const weakAreas = [];
    if (previousFlags.wrongPattern) {
      weakAreas.push(
        `pattern identification (user said "${previousFlags.identifiedPattern}" but correct pattern is different)`,
      );
    }
    if (previousFlags.incompleteSubmission) {
      weakAreas.push("solution completeness");
    }
    if ((dimensionScores.understandingDepth || 10) <= 4) {
      weakAreas.push("conceptual understanding");
    }
    if ((dimensionScores.explanationQuality || 10) <= 4) {
      weakAreas.push("ability to explain the solution clearly");
    }
    if (previousGaps.length > 0) {
      weakAreas.push(...previousGaps.slice(0, 2));
    }

    const reviewHintsSystem = `You are a spaced repetition coach helping someone review a coding problem they previously solved.
Generate 2 short, targeted recall questions that probe their understanding.
Focus on the weak areas identified. If a recall attempt is provided, tailor
the questions to fill in what they missed or got wrong — do NOT re-ask what
they already demonstrated. Questions should be answerable in 1-2 sentences.
Do NOT ask them to write code. Ask them to explain concepts, trade-offs, or patterns.

Return JSON:
{
  "questions": [
    { "question": "...", "focus": "pattern|complexity|explanation|edge_case|trade_off" },
    { "question": "...", "focus": "..." }
  ],
  "hint": "One short encouraging hint if they're struggling — not the answer"
}`;

    const reviewHintsUser = `Problem: ${solution.problem.title} (${solution.problem.difficulty} ${solution.problem.category})
Pattern: ${(solution.patterns ?? []).join(", ") || "not identified"}
Previous AI score: ${previousScore !== null ? `${previousScore}/10` : "not reviewed"}
Review count: ${solution.reviewCount}
${weakAreas.length > 0 ? `Known weak areas: ${weakAreas.join(", ")}` : ""}
${solution.problem.adminNotes ? `Key concept: ${solution.problem.adminNotes.substring(0, 200)}` : ""}
${recallText ? `\nCandidate's recall attempt (what they remembered from memory, no notes):\n"""\n${recallText.slice(0, 2000)}\n"""\n` : ""}
Generate 2 questions that will test if they truly remember and understand this problem${recallText ? ", focusing on what their recall attempt above missed or got wrong" : ""}.`;

    let parsed;
    try {
      parsed = await aiComplete({
        systemPrompt: reviewHintsSystem,
        userPrompt: reviewHintsUser,
        userId: req.user.id,
        model: AI_MODEL_FAST,
        temperature: 0.7,
        maxTokens: 500,
        jsonMode: true,
        surface: "review-hints",
      });
    } catch (aiErr) {
      return aiErrorResponse(res, aiErr, "Failed to generate review hints.");
    }

    return success(res, {
      questions: parsed.questions || [],
      hint: parsed.hint || null,
      context: {
        problemTitle: solution.problem.title,
        patterns: solution.patterns,
        reviewCount: solution.reviewCount,
        previousScore,
      },
    });
  } catch (err) {
    console.error("Review hints error:", err);
    return error(res, "Failed to generate review hints.", 500);
  }
}

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
// Extracted from ai.controller.js in Sprint 2 Task 6 (Pass A — byte-for-byte
// move; Pass B will migrate the orchestration to runAISurface()).
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_FAST } from "../config/env.js";
import { aiComplete, AIError } from "../services/ai.service.js";
import { validateReview } from "../services/ai.validators.js";
import { buildFallbackReview } from "../services/ai.fallbacks.js";
import { applySolveMethodCaps } from "../utils/solveMethodCaps.js";
import { computeReviewInputHash } from "../utils/aiReviewHash.js";

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

export async function reviewSolution(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }
    const { solutionId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;
    const force = req.body?.force === true;

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

    // ── Cache check ────────────────────────────────────────────────
    // If the review input hash hasn't changed since the last review,
    // return the latest stored feedback as a cache hit. No OpenAI call,
    // no embedding call, no RAG search. Bypass with `force: true`.
    const inputHash = computeReviewInputHash(solution);
    if (
      !force &&
      solution.aiFeedbackInputHash &&
      solution.aiFeedbackInputHash === inputHash
    ) {
      const existing = Array.isArray(solution.aiFeedback)
        ? solution.aiFeedback
        : solution.aiFeedback
          ? [solution.aiFeedback]
          : [];
      if (existing.length > 0) {
        return success(res, {
          feedback: existing[existing.length - 1],
          isFirstReview: false,
          cached: true,
        });
      }
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
    const { solutionReviewPrompt, SOLUTION_REVIEW_FEWSHOT } = await import(
      "../services/ai.prompts.js"
    );
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
      categorySpecificData: solution.categorySpecificData || null,
      // ── Multi-tab fields for pickFinalTab + <progression> ──
      timeComplexity: solution.timeComplexity,
      spaceComplexity: solution.spaceComplexity,
      bruteForce: solution.bruteForce,
      bruteForceMeta: solution.bruteForceMeta,
      optimizedApproach: solution.optimizedApproach,
      alternativeApproach: solution.alternativeApproach,
      alternativeMeta: solution.alternativeMeta,
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
        teamId,
        model: AI_MODEL_FAST,
        temperature: 0.6,
        maxTokens: 2000,
        jsonMode: true,
        // Calibration: 2 examples (cold/incomplete vs well-explained)
        // anchor the model to the expected score band and the
        // claim-with-evidence style. Cache-friendly — same array on
        // every call.
        fewShotMessages: SOLUTION_REVIEW_FEWSHOT,
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

    // ── Apply solveMethod caps (server-authoritative discount) ─────────
    // Skip on the fallback path: buildFallbackReview emits deterministic
    // placeholder scores (all 5s); applying caps to those would surface
    // misleading "score adjustments" for an output the AI never produced.
    const normalizedSolveMethod =
      typeof solution.solveMethod === "string"
        ? solution.solveMethod.trim().toUpperCase()
        : null;
    const cappedResult = usedReviewFallback
      ? { scores: { ...(aiResponse.scores || {}) }, adjustments: [] }
      : applySolveMethodCaps(aiResponse.scores || {}, normalizedSolveMethod || null);
    const dimScores = cappedResult.scores;
    const scoreAdjustments = cappedResult.adjustments;
    const aiFlags = aiResponse.flags || {};

    // ── Compute weighted score from CAPPED dimension scores ────────────
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
      scoreAdjustments,
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
          // Persist the input hash so the next call can short-circuit
          // when nothing has changed. Re-computed up-front in this
          // request, not at write time, so RAG-context-only changes
          // don't accidentally rev the cache key.
          aiFeedbackInputHash: inputHash,
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

    // Fire-and-forget: kick off auto-note + auto-flashcards generation
    // for this submission. Skipped automatically when the review used a
    // fallback (no point compounding degraded review with degraded note).
    // Errors are logged inside the service; never propagate.
    import("../services/autoNoteFromReview.service.js")
      .then((m) =>
        m.generateAutoNoteFromReview({
          solutionId,
          userId,
          teamId,
          solution,
          problem: solution.problem,
          reviewRecord,
        }),
      )
      .catch((err) =>
        console.error(
          `[autoNote] solution=${solutionId} dispatch failed:`,
          err?.message || err,
        ),
      );

    return success(res, {
      feedback: reviewRecord,
      isFirstReview: existingFeedback.length === 0,
      previousScore:
        existingFeedback.length > 0
          ? existingFeedback[existingFeedback.length - 1].overallScore
          : null,
      totalReviews: updatedFeedback.length,
      usedFallback: usedReviewFallback,
      // Source-of-truth for the response payload — read from reviewRecord
      // so a future mutation to the persisted blob automatically updates
      // the wire format (no two-place drift).
      overallScore: reviewRecord.overallScore,
      dimensionScores: reviewRecord.dimensionScores,
      scoreAdjustments: reviewRecord.scoreAdjustments,
    });
  } catch (err) {
    console.error("AI review error:", err);
    return error(res, "Failed to generate AI review.", 500);
  }
}

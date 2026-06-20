// ============================================================================
// AI HINTS — progressive pre-solve hints + active-recall review hints
// ============================================================================
//
// getHint          — three-level progressive nudge during problem solving.
//                    Level 1 = directional nudge; Level 2 = approach category;
//                    Level 3 = specific technique + first step outline.
//
// generateReviewHints — spaced-repetition recall support. Called after the
//                    user attempts recall. Reads existing aiFeedback to
//                    generate 2 targeted probe questions that focus on the
//                    user's previously identified weak areas (or fills gaps
//                    in the in-progress recall attempt when recallText is
//                    supplied).
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_FAST } from "../config/env.js";
import { aiComplete, AIError } from "../services/ai.service.js";

// Map AIError codes (rate limit, OpenAI down, parse fail, …) to HTTP
// responses so every controller in this file returns the same envelope
// shape on AI failure.
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
    // Level rubric now lives in the static system prompt below — see
    // the cache-friendly restructure in P6.

    let hintText;
    try {
      hintText = await aiComplete({
        // Cache-friendly: static rules + the three level rubrics. The
        // per-call level number + problem context move to the user
        // message so the same system prefix is reused across all 3
        // hint levels for every problem.
        systemPrompt: `You are an interview coach giving a tiered hint on a coding problem.

LEVEL RUBRIC — read the user message for which level to apply:
- Level 1: Give a vague directional nudge. Do NOT name the pattern or approach. Just point them in the right direction.
- Level 2: Name the general approach category (e.g., "Consider a sliding window approach") but do NOT give specific implementation details.
- Level 3: Name the specific technique and give a brief outline of the first step. Still do NOT give the full solution.

OUTPUT FORMAT: 1-2 sentences maximum. Plain text, no JSON.`,
        userPrompt: `Apply Level ${hintLevel}/3 to this problem.

Problem: ${problem.title}
Description: ${problem.description || "N/A"}
Category: ${problem.category}
Tags: ${problem.tags?.join(", ") || "none"}`,
        userId: req.user.id,
        teamId: req.teamId,
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
        teamId: req.teamId,
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

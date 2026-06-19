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
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_PRIMARY, AI_MODEL_FAST } from "../config/env.js";
import { aiComplete, AIError } from "../services/ai.service.js";
import {
  validateReview,
  validateProblemSelection,
  validateProblemContent,
  validateCanonicalAnswer,
  validateCanonicalAlternative,
  validateAlternativeAllowingPrimaryPattern,
} from "../services/ai.validators.js";
import { dedupAndCapAlternatives } from "../utils/canonicalAltDedup.js";
import {
  buildFallbackReview,
  buildFallbackProblemContent,
} from "../services/ai.fallbacks.js";
import {
  hasBothApproaches,
  isCodingSolution,
} from "../utils/solutionSignals.js";
import { resolveGeneratedSourceUrl } from "../utils/platformSearch.js";
import {
  findSimilarTitles,
  normalizeProblemTitle,
} from "../utils/titleSimilarity.js";
import {
  CANONICAL_PATTERN_LABELS,
  FAANG_CORE_PATTERNS,
} from "../utils/patternTaxonomy.js";
import { CANONICAL_SOURCE_LISTS } from "../utils/sourceListTaxonomy.js";

// ============================================================================
// CANONICAL ANSWER GENERATOR
// ============================================================================

const CANONICAL_TAXONOMY_LIST = CANONICAL_PATTERN_LABELS.join(", ");

const CANONICAL_SYSTEM_PROMPT = `You produce the canonical interview answer for a coding problem. Your output is the ground truth that future spaced-repetition reviews will be graded against. Be precise, terse, and pick the most teachable approach when several are valid.

Rules:
- pattern: pick ONE label from the canonical taxonomy when possible. If the problem is a clear hybrid, pick the more dominant pattern.
- keyInsight: 2-3 sentences. State the core idea, not the implementation. A candidate who reads this should be able to derive the algorithm.
- timeComplexity / spaceComplexity: optimal complexity. Use "O(?)" form.
- Do not include code.
- Do not hedge. This is the canonical answer; admins can override later.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "pattern":         "<single label>",
  "keyInsight":      "<2-3 sentences>",
  "timeComplexity":  "O(?)",
  "spaceComplexity": "O(?)"
}`;

const CANONICAL_SYSTEM_PROMPT_WITH_ALTS = `You produce the canonical interview answer for a coding problem. Your output is the ground truth that future spaced-repetition reviews will be graded against.

Output a PRIMARY answer plus 0-3 ALTERNATIVES.

Primary rules:
- pattern: pick ONE label from the canonical taxonomy when possible.
- keyInsight: 2-3 sentences. State the core idea, not the implementation.
- timeComplexity / spaceComplexity: optimal complexity for the most teachable approach. Use "O(?)" form.

When to include alternatives:
Many interview problems have 2-3 valid approaches with materially different trade-offs (e.g. iterative O(1) space vs memoized O(n) space). Include an alternative ONLY when it differs from PRIMARY in at least one of:
  - pattern
  - timeComplexity
  - spaceComplexity
And ONLY when it's a textbook approach a strong candidate would mention. Do NOT pad with degenerate variants (e.g. "brute force O(n^3)" when the problem has obvious better solutions). Cap at 3.

Alternative rules:
- name: short label (≤ 60 chars), e.g. "Memoized recursion", "Iterative two-variable", "Heap-based selection".
- pattern: from canonical taxonomy OR same as primary.
- keyInsight: 1-2 sentences specific to this approach (not a copy of primary).
- timeComplexity / spaceComplexity: O(?) form.

Do not include code. Do not hedge. Be terse and precise.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "pattern":         "<single label>",
  "keyInsight":      "<2-3 sentences>",
  "timeComplexity":  "O(?)",
  "spaceComplexity": "O(?)",
  "alternatives": [
    {
      "name":            "<≤60 char label>",
      "pattern":         "<taxonomy label or same as primary>",
      "keyInsight":      "<1-2 sentences>",
      "timeComplexity":  "O(?)",
      "spaceComplexity": "O(?)"
    }
  ]
}`;

const CANONICAL_AUGMENT_SYSTEM_PROMPT = `You augment an existing canonical answer for a coding problem with valid alternative approaches. The PRIMARY answer is already established and will NOT be modified. Your job: identify 0-3 textbook alternatives.

When to include alternatives:
Many interview problems have 2-3 valid approaches with materially different trade-offs (e.g. iterative O(1) space vs memoized O(n) space). Include an alternative ONLY when it differs from PRIMARY in at least one of:
  - pattern
  - timeComplexity
  - spaceComplexity
And ONLY when it's a textbook approach a strong candidate would mention. Do NOT pad with degenerate variants. Cap at 3.

Alternative rules:
- name: short label (≤ 60 chars), e.g. "Memoized recursion", "Iterative two-variable".
- pattern: from canonical taxonomy OR same as primary.
- keyInsight: 1-2 sentences specific to this approach (not a copy of primary).
- timeComplexity / spaceComplexity: O(?) form.

Do NOT propose changes to the primary. Do NOT include the primary in your output array.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "alternatives": [
    { "name": "...", "pattern": "...", "keyInsight": "...",
      "timeComplexity": "O(?)", "spaceComplexity": "O(?)" }
  ]
}`;

/**
 * Generate the canonical answer for a problem. Returns null if the AI call
 * succeeds but the output fails validation — caller should NOT persist
 * canonicalGeneratedAt in that case so the next request retries.
 *
 * Throws on AI errors (timeout / 5xx / not-enabled). Caller handles those
 * with a retry-able 503 envelope.
 */
export async function generateCanonicalAnswer(problem, { userId, teamId }) {
  const userPrompt = `<problem_title>${problem.title}</problem_title>
<problem_description>${problem.description ?? ""}</problem_description>
Difficulty: ${problem.difficulty}
Category: ${problem.category}`;

  const altsEnabled = process.env.FEATURE_CANONICAL_ALTERNATIVES === "true";
  const systemPrompt = altsEnabled
    ? CANONICAL_SYSTEM_PROMPT_WITH_ALTS
    : CANONICAL_SYSTEM_PROMPT;
  const maxTokens = altsEnabled ? 700 : 400;

  const parsed = await aiComplete({
    systemPrompt,
    userPrompt,
    userId,
    teamId,
    model: AI_MODEL_FAST,
    temperature: 0.1,
    maxTokens,
    jsonMode: true,
    surface: "canonical-generate",
  });

  return validateCanonicalAnswer(parsed);
}

/**
 * Generate alternatives for an existing canonical (legacy backfill path).
 * Takes the existing primary as input. Never modifies the primary.
 *
 * Returns: array of validated alternatives (may be empty). Returns [] on
 * malformed responses — caller decides whether to persist.
 *
 * Throws on AI errors (timeout / 5xx / not-enabled). Caller handles.
 */
export async function augmentCanonicalAlternatives(problem, primary, { userId, teamId }) {
  const userPrompt = `<problem_title>${problem.title}</problem_title>
<problem_description>${problem.description ?? ""}</problem_description>
Difficulty: ${problem.difficulty}
Category: ${problem.category}

PRIMARY (already established, do not modify):
<primary_pattern>${primary.pattern}</primary_pattern>
<primary_key_insight>${primary.keyInsight}</primary_key_insight>
<primary_complexity>${primary.timeComplexity} / ${primary.spaceComplexity}</primary_complexity>

Identify 0-3 valid alternatives. Return JSON only.`;

  const parsed = await aiComplete({
    systemPrompt: CANONICAL_AUGMENT_SYSTEM_PROMPT,
    userPrompt,
    userId,
    teamId,
    model: AI_MODEL_FAST,
    temperature: 0.1,
    maxTokens: 400,
    jsonMode: true,
    surface: "canonical-augment",
  });

  if (!parsed || typeof parsed !== "object") return [];
  const rawAlts = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];

  const validatedAlts = rawAlts
    .map((alt) => {
      if (alt && typeof alt === "object" && alt.pattern === primary.pattern) {
        return validateAlternativeAllowingPrimaryPattern(alt);
      }
      return validateCanonicalAlternative(alt);
    })
    .filter((a) => a !== null);

  return dedupAndCapAlternatives(validatedAlts, primary);
}

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
// ── Stable serialization for the review-input hash ─────────────────
// JSON.stringify isn't deterministic across object key insertion order,
// so we walk objects with sorted keys. Anything in the hash input means
// "changing this re-runs the AI review."
function stableStringify(value) {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") +
    "}"
  );
}

export function computeReviewInputHash(solution) {
  // The review prompt incorporates these fields. If any change → rerun.
  // RAG context (teammate solutions, pattern baseline) is intentionally
  // OUTSIDE the hash — those evolve with the team's other activity and
  // we don't want every teammate submission to invalidate every cache.
  // The cost of that decision: a user might see the same review even
  // though new RAG context exists. Force button is the escape hatch.
  const inputs = {
    problemVersion: solution.problemVersion ?? null,
    code: solution.code ?? "",
    approach: solution.approach ?? "",
    bruteForce: solution.bruteForce ?? "",
    optimizedApproach: solution.optimizedApproach ?? "",
    timeComplexity: solution.timeComplexity ?? "",
    spaceComplexity: solution.spaceComplexity ?? "",
    keyInsight: solution.keyInsight ?? "",
    feynmanExplanation: solution.feynmanExplanation ?? "",
    realWorldConnection: solution.realWorldConnection ?? "",
    patterns: [...(solution.patterns ?? [])].sort(),
    categorySpecificData: stableStringify(solution.categorySpecificData),
    followUpAnswers: (solution.followUpAnswers ?? [])
      .slice()
      .sort((a, b) =>
        (a.followUpQuestion?.id || "").localeCompare(b.followUpQuestion?.id || ""),
      )
      .map((a) => ({ qId: a.followUpQuestion?.id || "", a: a.answer ?? "" })),
  };
  return crypto.createHash("sha256").update(stableStringify(inputs)).digest("hex");
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
    let usedContentFallback = false;
    let contentViolations = [];
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
        teamId: req.teamId,
        model: contentModelMap[category] || AI_MODEL_FAST,
        temperature: 0.8,
        maxTokens: contentTokenBudget[category] || 2000,
        jsonMode: true,
        surface: "problem-content",
      });
      const check = validateProblemContent(content, { category });
      if (!check.valid) {
        contentViolations = check.violations;
        console.warn(
          `[problem-content] validation failed: ${contentViolations.join(", ")}`,
        );
        content = buildFallbackProblemContent({ title, category });
        usedContentFallback = true;
      }
    } catch (aiErr) {
      if (aiErr instanceof AIError && aiErr.code === "RATE_LIMITED") {
        return aiErrorResponse(res, aiErr, "Failed to generate problem content.");
      }
      console.warn(
        `[problem-content] AI call failed (${aiErr?.code || aiErr?.message}); using fallback`,
      );
      content = buildFallbackProblemContent({ title, category });
      usedContentFallback = true;
      contentViolations = [`llm-error:${aiErr?.code || aiErr?.message || "unknown"}`];
    }

    return success(res, {
      content,
      usedFallback: usedContentFallback,
      ...(usedContentFallback ? { fallbackReason: contentViolations } : {}),
    });
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
    const {
      category,
      count,
      difficulty,
      targetCompany,
      focusAreas,
      sourceList,
      urls,
    } = req.body;

    if (!category) {
      return error(res, "Category is required.", 400);
    }

    // sourceList (optional) constrains the AI to a canonical curriculum sheet.
    // Stricter than the manual create form: AI can only reliably recall the
    // four canonical sheets, so custom labels are rejected here even though
    // the underlying column accepts them.
    let curriculum = null;
    if (sourceList !== undefined && sourceList !== null && sourceList !== "") {
      if (typeof sourceList !== "string") {
        return error(res, "sourceList must be a string.", 400);
      }
      const match = CANONICAL_SOURCE_LISTS.find(
        (s) => s.toLowerCase() === sourceList.trim().toLowerCase(),
      );
      if (!match) {
        return error(
          res,
          `Custom curriculum labels aren't supported in the generator yet — leave blank or pick from: ${CANONICAL_SOURCE_LISTS.join(", ")}.`,
          400,
        );
      }
      curriculum = match;
    }

    // urls (optional) flips the generator into URL recall mode. Each URL must
    // parse via the URL constructor and use http(s). Cap at 5 to match the
    // existing per-batch ceiling.
    let problemUrls = null;
    if (urls !== undefined && urls !== null && urls !== "") {
      if (!Array.isArray(urls)) {
        return error(res, "urls must be an array of strings.", 400);
      }
      if (urls.length === 0) {
        // Empty array — treat as not-set
      } else if (urls.length > 5) {
        return error(res, "urls accepts at most 5 entries.", 400);
      } else {
        const parsed = [];
        for (const raw of urls) {
          if (typeof raw !== "string" || raw.trim() === "") {
            return error(res, "urls must be non-empty strings.", 400);
          }
          try {
            const u = new URL(raw.trim());
            if (u.protocol !== "http:" && u.protocol !== "https:") {
              return error(res, `Invalid URL protocol: ${raw}`, 400);
            }
            parsed.push(raw.trim());
          } catch {
            return error(res, `Malformed URL: ${raw}`, 400);
          }
        }
        problemUrls = parsed;
      }
    }
    const urlMode = problemUrls !== null;

    // URL mode forces count = urls.length and difficulty = "auto" (AI infers
    // per URL from recall). Form controls are visually locked client-side;
    // server enforces it regardless to keep the prompt coherent.
    const problemCount = urlMode
      ? problemUrls.length
      : Math.min(Math.max(parseInt(count) || 1, 1), 5);
    const difficultyPref = urlMode ? "auto" : difficulty || "auto";

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
      sourceList: curriculum,
      urls: problemUrls,
      platformAssignments,
    };

    const { system: selSystem, user: selUser } =
      problemSelectionPrompt(selectionPromptData);

    let selections = [];
    let learningPath = "";
    let unrecognizedUrls = [];

    try {
      const selectionResult = await aiComplete({
        systemPrompt: selSystem,
        userPrompt: selUser,
        userId: req.user.id,
        teamId: req.teamId,
        model: AI_MODEL_FAST,
        temperature: 0.7,
        maxTokens: 1200,
        jsonMode: true,
        surface: "problem-selection",
      });

      // Validate the AI's selection against hard rules: array length,
      // urlConfidence enum, well-formed URLs, HR category required for HR.
      // In URL mode, the count check is relaxed: selections (high-conf) +
      // unrecognizedUrls must equal the requested count, and learningPath
      // is optional. Any violation → throw to trigger the legacy single-call
      // fallback (non-URL mode only).
      const selectionCheck = validateProblemSelection(selectionResult, {
        count: problemCount,
        category,
        urlMode,
      });
      if (!selectionCheck.valid) {
        console.warn(
          `[problem-selection] validation failed: ${selectionCheck.violations.join(", ")}`,
        );
        throw new Error(
          `selection-validation-failed:${selectionCheck.violations.join(",")}`,
        );
      }

      selections = selectionResult.selections || [];
      learningPath = selectionResult.learningPath || "";
      if (urlMode && Array.isArray(selectionResult.unrecognizedUrls)) {
        unrecognizedUrls = selectionResult.unrecognizedUrls;
      }

      // Enforce platform assignments — AI sometimes substitutes platforms.
      // platformAssignments was sized for `problemCount` (URL count), but in
      // URL mode the AI may have returned fewer selections — index by
      // selection position, not slot, since the legacy slot semantics
      // (E/M/H ordering) don't apply when URLs drive selection.
      // Also normalize title casing here — single point of repair so every
      // downstream consumer (Stage 3 content generation, similarTo lookup,
      // response payload, fallback paths) sees the corrected title.
      selections = selections.map((sel, i) => ({
        ...sel,
        title: normalizeProblemTitle(sel.title),
        platform: platformAssignments[i]?.platform || sel.platform,
      }));
    } catch (err) {
      console.error("Stage 2 selection failed:", err.message);

      // In URL mode, the legacy single-call generator can't recall specific
      // URLs — falling back would silently substitute generic problems and
      // confuse the admin. Surface the failure instead.
      if (urlMode) {
        return aiErrorResponse(
          res,
          err,
          "AI failed to recall the requested URLs. Try fewer URLs or paste the problem statement manually.",
        );
      }

      // Fallback to legacy single-call approach
      const { problemGenerationPrompt } =
        await import("../services/ai.prompts.js");
      const { system, user } = problemGenerationPrompt({
        category,
        count: problemCount,
        difficulty: difficultyPref,
        targetCompany,
        focusAreas,
        sourceList: curriculum,
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
          teamId: req.teamId,
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
        sourceList: curriculum,
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

        let content = await aiComplete({
          systemPrompt: contentSystem,
          userPrompt: contentUser,
          userId: req.user.id,
          teamId: req.teamId,
          model: contentModel,
          temperature: 0.75,
          maxTokens: contentMaxTokens,
          jsonMode: true,
          surface: "problem-content-stage3",
        });

        // Validate per-problem content. On any violation, swap in a
        // clearly-marked stub for THIS problem only — the other parallel
        // generations are unaffected. Admin sees a "[AI Unavailable]" tag
        // on the preview so they can't silently approve a bad row.
        const contentCheck = validateProblemContent(content, { category });
        let usedContentFallback = false;
        if (!contentCheck.valid) {
          console.warn(
            `[problem-content] validation failed for "${selection.title}": ${contentCheck.violations.join(", ")}`,
          );
          content = buildFallbackProblemContent({
            title: selection.title,
            category,
          });
          usedContentFallback = true;
        }

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
          // Marker for the admin UI — the preview card renders an
          // "AI unavailable, edit before approving" warning when this
          // is true. Distinct from contentGenerationFailed below
          // (which is the hard-throw path); usedFallback covers BOTH
          // hard fails and validation rejects.
          usedFallback: usedContentFallback,
        };
      } catch (err) {
        console.error(
          `Stage 3 content generation failed for "${selection.title}":`,
          err.message,
        );

        // Build a deterministic stub for this slot — clearly marked so
        // the admin must edit before approving. Reuses the same
        // fallback shape as the validation-failure path above.
        const fallbackContent = buildFallbackProblemContent({
          title: selection.title,
          category,
        });
        const isHRProblem = category === "HR";

        return {
          title: selection.title,
          difficulty: selection.difficulty,
          category,
          source: selection.platform,
          // Content generation failed, so we can't trust the URL either;
          // fall back to a platform search so the admin still has
          // something to click when curating.
          sourceUrl: resolveGeneratedSourceUrl({
            isHRProblem,
            urlConfidence: "low",
            url: null,
            platform: selection.platform,
            title: selection.title,
          }),
          description: fallbackContent.description,
          realWorldContext: fallbackContent.realWorldContext,
          useCases: fallbackContent.useCases,
          adminNotes: fallbackContent.adminNotes,
          tags: fallbackContent.tags,
          companyTags: fallbackContent.companyTags,
          followUpQuestions: fallbackContent.followUpQuestions,
          whySelected: selection.whySelected || "",
          urlConfidence: "low",
          similarTo: findSimilarTitles(selection.title, existingTitles),
          ...(isHRProblem && {
            hrQuestionCategory: fallbackContent.hrQuestionCategory,
          }),
          usedFallback: true,
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
      sourceList: curriculum,
      unrecognizedUrls,
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

// ============================================================================
// REVIEW GRADE — semantic match of structured recall vs stored notes
// ============================================================================
//
// Why this exists: the legacy word-diff in RecallDiff.jsx returns harshly
// false negatives when the user uses synonymous concepts ("HashMap" ≈
// "Hashing"). This endpoint runs an LLM as a semantic grader on three
// structured fields (pattern, keyInsight, complexity) and surfaces a
// calibrated suggestedConfidence so the user can self-rate honestly.
//
// Reported by Sooraj Singh (Binary Thinkers, 2026-05-25, feedback ID
// cmpl5lefk0006bvxu3gppm9ph).
//
// Validate→fallback pattern: if the LLM returns a malformed shape, the
// controller emits a deterministic conservative grade so the UI never
// crashes.
// ============================================================================

const VALID_MATCH = new Set(["YES", "PARTIAL", "NO"]);
const VALID_OVERALL = new Set(["pass", "partial", "miss"]);

const MULTI_APPROACH_GRADER_SYSTEM = `You are a strict but fair spaced-repetition grader. The user is recalling a coding problem they previously solved. Many problems have multiple valid approaches; your job is to identify which approach the user implemented and grade their recall against THAT approach — not against a single "right answer".

You receive:
  - <canonical_primary>: the main canonical approach (pattern, keyInsight, complexity).
  - <canonical_alternatives>: 0-N additional valid approaches, each with a name + pattern + keyInsight + complexity.
  - <user_notes>: what the user wrote when they originally solved the problem (their actual implementation).
  - <user_recall>: what they typed just now (their memory check).

PROCEDURE — follow exactly:

Step 1 — IDENTIFY which approach the user implemented.
  Compare <user_notes_complexity> and <user_notes_pattern> against PRIMARY and each ALTERNATIVE. The MATCHED APPROACH is whichever scores closest on pattern + complexity. If user_notes are sparse or ambiguous, fall back to PRIMARY.

Step 2 — GRADE user_recall against the MATCHED APPROACH (not primary).
  - Match SEMANTICALLY ("HashMap" matches "Hashing"; "linear time" matches "O(n)"; "two-pointer" matches "Two Pointers").
  - YES: recall captures the same concept as the matched approach.
  - PARTIAL: right idea, missed important detail.
  - NO: empty, wrong, or unrelated to the matched approach AND to all other approaches.
  - For complexity: O(n) ≠ O(n log n). If user gives one but matched approach has both time + space, PARTIAL on the missing one.

Step 3 — In feedback, name the approach the user used and reference the others where helpful. e.g. "You used the memoized recursion variant (O(n) space) — correct. The iterative two-variable approach achieves O(1) space." This trade-off awareness is the cognitive task interviewers test; surface it.

Step 4 — suggestedConfidence (1-5) follows the matched approach's grade:
  5 = all YES, 4 = one PARTIAL, 3 = one NO or two PARTIAL, 2 = multiple gaps, 1 = mostly wrong/empty.
  If \`peeked: true\`, suggestedConfidence MUST be ≤ 3.

Output STRICT JSON, no prose:
{
  "matchedApproach":    "primary" | "<alternative.name>",
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}`;

function stripHtmlServer(html) {
  if (typeof html !== "string") return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

function clampConfidence(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(5, v));
}

function validateRecallGrade(parsed, { peeked = false, validAlternativeNames = [] } = {}) {
  if (!parsed || typeof parsed !== "object") return null;
  const fields = ["pattern", "keyInsight", "complexity"];
  const out = {};
  for (const f of fields) {
    const slot = parsed[f];
    if (!slot || typeof slot !== "object") return null;
    const match = String(slot.match ?? "").toUpperCase();
    if (!VALID_MATCH.has(match)) return null;
    const feedback = typeof slot.feedback === "string" ? slot.feedback.trim().slice(0, 400) : "";
    out[f] = { match, feedback };
  }
  const overall = String(parsed.overall ?? "").toLowerCase();
  if (!VALID_OVERALL.has(overall)) return null;
  out.overall = overall;
  let suggestedConfidence = clampConfidence(parsed.suggestedConfidence);
  if (peeked && suggestedConfidence > 3) {
    console.warn("[recall-grade:peek-clamp] model suggested", suggestedConfidence, "→ 3");
    suggestedConfidence = 3;
  }
  out.suggestedConfidence = suggestedConfidence;
  let { matchedApproach } = parsed;
  if (matchedApproach != null) {
    const validNames = new Set(["primary", ...validAlternativeNames]);
    if (typeof matchedApproach !== "string" || !validNames.has(matchedApproach)) {
      console.warn("[recall-grade:invalid-match]", matchedApproach, "→ primary");
      matchedApproach = "primary";
    }
  }
  out.matchedApproach = matchedApproach ?? null;
  return out;
}

function buildFallbackRecallGrade({ pattern, keyInsight, complexity, peeked = false } = {}) {
  // Conservative: when the LLM is unavailable, mark every field PARTIAL with
  // an honest "AI offline" message and suggest the middle confidence rating.
  // When the user peeked, lower the suggested confidence to 2 (re-learning).
  const partial = {
    match: "PARTIAL",
    feedback: "AI grading is unavailable right now — review your notes manually and rate honestly.",
  };
  const empty = {
    match: "NO",
    feedback: "Nothing recalled in this field.",
  };
  return {
    pattern: pattern?.trim() ? partial : empty,
    keyInsight: keyInsight?.trim() ? partial : empty,
    complexity: complexity?.trim() ? partial : empty,
    overall: "partial",
    suggestedConfidence: peeked ? 2 : 3,
  };
}

export async function gradeReviewRecall(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are disabled.", 503);
    }

    const { solutionId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;

    const recall = req.body?.recall ?? {};
    const pattern = typeof recall.pattern === "string" ? recall.pattern.trim().slice(0, 500) : "";
    const keyInsight = typeof recall.keyInsight === "string" ? recall.keyInsight.trim().slice(0, 1500) : "";
    const complexity = typeof recall.complexity === "string" ? recall.complexity.trim().slice(0, 200) : "";
    const peeked = req.body?.peeked === true;

    // Reject completely empty submissions — there's nothing to grade.
    if (!pattern && !keyInsight && !complexity) {
      return error(res, "Recall is empty — type something in at least one field.", 400);
    }

    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId },
      select: {
        id: true,
        problemId: true,
        patterns: true,
        keyInsight: true,
        optimizedApproach: true,
        feynmanExplanation: true,
        timeComplexity: true,
        spaceComplexity: true,
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            category: true,
            description: true,
            canonicalGeneratedAt: true,
            canonicalPattern: true,
            canonicalKeyInsight: true,
            canonicalTimeComplexity: true,
            canonicalSpaceComplexity: true,
            canonicalAlternatives: true,
          },
        },
      },
    });
    if (!solution) return error(res, "Solution not found.", 404);

    // Decide anchor: canonical (preferred) vs legacy user-notes fallback.
    const prob = solution.problem;
    const hasCanonical =
      prob?.canonicalGeneratedAt != null &&
      (prob.canonicalPattern || prob.canonicalKeyInsight || prob.canonicalTimeComplexity);

    const altsFlagOn = process.env.FEATURE_CANONICAL_ALTERNATIVES === "true";
    const alternatives =
      Array.isArray(prob?.canonicalAlternatives) ? prob.canonicalAlternatives : [];
    const useMultiApproachPrompt = altsFlagOn && hasCanonical && alternatives.length > 0;

    let systemPrompt;
    let userPrompt;

    if (useMultiApproachPrompt) {
      // ── Multi-approach grader (canonical + alternatives) ──────────────────
      const notesPattern = (solution.patterns ?? []).join(", ") || "(none)";
      const notesInsight =
        stripHtmlServer(solution.keyInsight) ||
        stripHtmlServer(solution.feynmanExplanation) ||
        stripHtmlServer(solution.optimizedApproach) ||
        "(none)";
      const notesComplexity = [solution.timeComplexity, solution.spaceComplexity]
        .filter(Boolean)
        .join(" / ") || "(none)";

      const altsBlock = alternatives
        .map(
          (alt) =>
            `${alt.name}:
    pattern: ${alt.pattern}
    keyInsight: ${alt.keyInsight}
    time: ${alt.timeComplexity}  space: ${alt.spaceComplexity}`,
        )
        .join("\n  ");

      systemPrompt = MULTI_APPROACH_GRADER_SYSTEM;
      userPrompt = `Problem: <problem_title>${prob.title}</problem_title> (${prob.difficulty} ${prob.category})

<canonical_primary>
  pattern: ${prob.canonicalPattern || "(none)"}
  keyInsight: ${prob.canonicalKeyInsight || "(none)"}
  time: ${prob.canonicalTimeComplexity || "(none)"}  space: ${prob.canonicalSpaceComplexity || "(none)"}
</canonical_primary>

<canonical_alternatives>
  ${altsBlock}
</canonical_alternatives>

<user_notes_pattern>${notesPattern}</user_notes_pattern>
<user_notes_key_insight>${notesInsight.slice(0, 1500)}</user_notes_key_insight>
<user_notes_complexity>${notesComplexity}</user_notes_complexity>

<user_recall_pattern>${pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>${keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>${complexity || "(empty)"}</user_recall_complexity>

peeked: ${peeked}

Identify the matched approach, then grade. Return JSON only.`;
    } else if (hasCanonical) {
      // ── Canonical-anchor path ─────────────────────────────────────────────
      const canonicalComplexity = [prob.canonicalTimeComplexity, prob.canonicalSpaceComplexity]
        .filter(Boolean)
        .join(" / ") || "(not recorded)";
      const notesPattern = (solution.patterns ?? []).join(", ") || "(none)";
      const notesInsight =
        stripHtmlServer(solution.keyInsight) ||
        stripHtmlServer(solution.feynmanExplanation) ||
        stripHtmlServer(solution.optimizedApproach) ||
        "(none)";
      const notesComplexity = [solution.timeComplexity, solution.spaceComplexity]
        .filter(Boolean)
        .join(" / ") || "(none)";

      systemPrompt = `You are a strict but fair spaced-repetition grader. The user is recalling a coding problem they previously solved. Judge whether their recall is correct FOR THE PROBLEM, not whether it matches their old notes.

The CANONICAL block is the ground truth. The USER_NOTES block is what the user wrote when they originally solved it — useful as context (they may have discovered a different valid angle), but never override CANONICAL with USER_NOTES if they conflict. If the user's recall matches a valid alternative not captured in CANONICAL, grade YES and note the alternative in feedback.

Grading rules:
- Match SEMANTICALLY. "HashMap" matches "Hashing"; "two-pointer" matches "Two Pointers"; "linear time" matches "O(n)".
- A field is YES if the recall captures the same concept (or a valid alternative for the problem).
- A field is PARTIAL if right idea but missed important detail.
- A field is NO if empty, wrong, or unrelated to the problem.
- For complexity: O(n) ≠ O(n log n). If user gives one but reference has both, PARTIAL on the missing one.
- suggestedConfidence (1-5): 5 = all YES, 4 = one PARTIAL, 3 = one NO or two PARTIAL, 2 = multiple gaps, 1 = mostly wrong/empty. Be honest.
- If \`peeked: true\` is set, suggestedConfidence MUST be ≤ 3 (the user saw the answer; this is a re-learning moment, not a successful recall).

Feedback strings are shown to the user — be specific and constructive.
On PARTIAL/NO, name the gap and the next step ("You said hashmap; the canonical is two-pointers — they're different time/space tradeoffs").

Output STRICT JSON, no prose:
{
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}`;

      userPrompt = `Problem: <problem_title>${prob.title}</problem_title> (${prob.difficulty} ${prob.category})

<canonical_pattern>${prob.canonicalPattern || "(none)"}</canonical_pattern>
<canonical_key_insight>${prob.canonicalKeyInsight || "(none)"}</canonical_key_insight>
<canonical_complexity>${canonicalComplexity}</canonical_complexity>

<user_notes_pattern>${notesPattern}</user_notes_pattern>
<user_notes_key_insight>${notesInsight.slice(0, 1500)}</user_notes_key_insight>
<user_notes_complexity>${notesComplexity}</user_notes_complexity>

<user_recall_pattern>${pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>${keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>${complexity || "(empty)"}</user_recall_complexity>

peeked: ${peeked}

Grade each field. Return JSON only.`;
    } else {
      // ── Legacy notes-anchor path (canonical not yet generated) ────────────
      const referencePattern = (solution.patterns ?? []).join(", ") || "(not recorded)";
      const referenceInsight =
        stripHtmlServer(solution.keyInsight) ||
        stripHtmlServer(solution.feynmanExplanation) ||
        stripHtmlServer(solution.optimizedApproach) ||
        "(not recorded)";
      const referenceComplexity = [solution.timeComplexity, solution.spaceComplexity]
        .filter(Boolean)
        .join(" / ") || "(not recorded)";

      systemPrompt = `You are a strict but fair spaced-repetition grader for coding problems. The user has just attempted to recall a problem they previously solved. You are comparing their recall (in three fields: pattern, keyInsight, complexity) against their own stored notes from when they originally solved it.

Grading rules:
- Match SEMANTICALLY, not by surface words. "HashMap" matches "Hashing" or "Hash Table"; "Two Pointers" matches "two-pointer technique"; "O(n)" matches "linear time".
- A field is YES if the user's recall captures the same concept as the reference, even with different wording.
- A field is PARTIAL if the user got the right idea but missed an important detail, or named a related-but-not-identical concept.
- A field is NO if the user's recall is empty, wrong, or unrelated.
- For complexity: if user says "O(n)" and reference is "O(n log n)", that's NO (different time class). If user says "Time: O(n)" and reference is "O(n)" without specifying space, that's YES on time (PARTIAL if reference also has space and user omits it).
- suggestedConfidence is an integer 1-5 calibrated to the SM-2 scale: 5 = perfect recall (all fields YES), 4 = strong with one PARTIAL, 3 = mostly right but one NO or two PARTIAL, 2 = rough idea but multiple gaps, 1 = mostly wrong or empty. Be honest — overconfident ratings hurt long-term retention.

Return JSON ONLY, no prose:
{
  "pattern":     { "match": "YES"|"PARTIAL"|"NO", "feedback": "<one short sentence>" },
  "keyInsight":  { "match": "YES"|"PARTIAL"|"NO", "feedback": "<one short sentence>" },
  "complexity":  { "match": "YES"|"PARTIAL"|"NO", "feedback": "<one short sentence>" },
  "overall":     "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5 integer>
}

The "feedback" strings are shown directly to the user — be specific and constructive. If a recall is exactly right, say so plainly; don't pad with praise.`;

      userPrompt = `Problem: <problem_title>${prob?.title || solution.problemId}</problem_title> (${prob?.difficulty || ""} ${prob?.category || ""})

<user_notes_pattern>${referencePattern}</user_notes_pattern>
<user_notes_key_insight>${referenceInsight.slice(0, 1500)}</user_notes_key_insight>
<user_notes_complexity>${referenceComplexity}</user_notes_complexity>

<user_recall_pattern>${pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>${keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>${complexity || "(empty)"}</user_recall_complexity>

Grade each field semantically. Return JSON only.`;
    }

    let parsed;
    try {
      parsed = await aiComplete({
        systemPrompt,
        userPrompt,
        userId,
        teamId,
        model: AI_MODEL_FAST,
        temperature: 0.2,
        maxTokens: useMultiApproachPrompt ? 800 : 600,
        jsonMode: true,
        surface: "review-grade",
      });
    } catch (aiErr) {
      // Fall through to deterministic fallback rather than 500 — this surface
      // is interactive; user is staring at the modal waiting for a response.
      console.error("review-grade aiComplete failed:", aiErr);
      const fallback = buildFallbackRecallGrade({ pattern, keyInsight, complexity, peeked });
      return success(res, { ...fallback, fallback: true });
    }

    const validAlternativeNames = alternatives.map((a) => a.name);
    const validated = validateRecallGrade(parsed, { peeked, validAlternativeNames });
    if (!validated) {
      console.warn("review-grade: validator rejected LLM output, using fallback");
      const fallback = buildFallbackRecallGrade({ pattern, keyInsight, complexity, peeked });
      return success(res, { ...fallback, fallback: true });
    }

    return success(res, { ...validated, fallback: false });
  } catch (err) {
    console.error("Review grade error:", err);
    return error(res, "Failed to grade recall.", 500);
  }
}

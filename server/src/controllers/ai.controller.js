/**
 * AI CONTROLLER — Endpoints for all AI features
 */
import { aiComplete } from "../services/ai.service.js";
import {
  solutionReviewPrompt,
  problemContentPrompt,
  hintGenerationPrompt,
  weeklyPlanPrompt,
} from "../services/ai.prompts.js";
import {
  solutionReviewSchema,
  problemContentSchema,
  hintSchema,
  weeklyPlanSchema,
  validateAIResponse,
} from "../services/ai.schemas.js";
import prisma from "../lib/prisma.js";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
} from "../utils/response.js";

import {
  embedAllExisting,
  findSimilarSolutions,
  findSimilarProblems,
  isEmbeddingEnabled,
} from "../services/embedding.service.js";

// ── POST /api/ai/review-solution ───────────────────────
export async function reviewSolution(req, res) {
  const { solutionId } = req.body;
  const userId = req.user.id;

  const solution = await prisma.solution.findUnique({
    where: { id: solutionId },
    include: {
      problem: { select: { title: true, difficulty: true, tags: true } },
    },
  });

  if (!solution) return notFoundResponse(res, "Solution");

  const { system, user } = solutionReviewPrompt({
    problemTitle: solution.problem.title,
    difficulty: solution.problem.difficulty,
    pattern: solution.patternIdentified,
    approach: solution.optimizedApproach || solution.bruteForceApproach,
    timeComplexity: solution.optimizedTime || solution.bruteForceTime,
    spaceComplexity: solution.optimizedSpace || solution.bruteForceSpace,
    code: solution.code,
    language: solution.language,
    keyInsight: solution.keyInsight,
    explanation: solution.feynmanExplanation,
  });

  const raw = await aiComplete({
    systemPrompt: system,
    userPrompt: user,
    userId,
    maxTokens: 1500,
  });

  // Validate response
  const validation = validateAIResponse(solutionReviewSchema, raw);
  if (!validation.valid) {
    return errorResponse(res, "AI returned invalid format. Try again.", 500);
  }

  // Save feedback to solution
  await prisma.solution.update({
    where: { id: solutionId },
    data: { aiFeedback: JSON.stringify(validation.data) },
  });

  return successResponse(res, validation.data, "Solution reviewed by AI");
}

// ── POST /api/ai/generate-problem-content ──────────────
export async function generateProblemContent(req, res) {
  const { title, source, sourceUrl, difficulty, tags } = req.body;
  const userId = req.user.id;

  if (!title) {
    return errorResponse(res, "Problem title is required", 400);
  }

  const { system, user } = problemContentPrompt({
    title,
    source: source || "LEETCODE",
    sourceUrl: sourceUrl || "",
    difficulty: difficulty || "MEDIUM",
    tags: tags || [],
  });

  const raw = await aiComplete({
    systemPrompt: system,
    userPrompt: user,
    userId,
    maxTokens: 2000,
  });

  const validation = validateAIResponse(problemContentSchema, raw);
  if (!validation.valid) {
    return errorResponse(res, "AI returned invalid format. Try again.", 500);
  }

  return successResponse(res, validation.data, "Problem content generated");
}

// ── POST /api/ai/generate-hint ─────────────────────────
export async function generateHint(req, res) {
  const { problemId, timeElapsed, timeLimit, hintLevel } = req.body;
  const userId = req.user.id;

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      title: true,
      difficulty: true,
      tags: true,
    },
  });

  if (!problem) return notFoundResponse(res, "Problem");

  const tags = JSON.parse(problem.tags || "[]");

  const { system, user } = hintGenerationPrompt({
    problemTitle: problem.title,
    difficulty: problem.difficulty,
    pattern: tags[0] || "Unknown",
    timeElapsed: timeElapsed || 0,
    timeLimit: timeLimit || 2700,
    hintLevel: hintLevel || 1,
  });

  const raw = await aiComplete({
    systemPrompt: system,
    userPrompt: user,
    userId,
    maxTokens: 500,
  });

  const validation = validateAIResponse(hintSchema, raw);
  if (!validation.valid) {
    return errorResponse(res, "AI returned invalid format. Try again.", 500);
  }

  return successResponse(res, validation.data, "Hint generated");
}

// ── POST /api/ai/weekly-plan ───────────────────────────
export async function generateWeeklyPlan(req, res) {
  const userId = req.user.id;

  // Fetch user stats
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      solutions: {
        include: { problem: { select: { difficulty: true, tags: true } } },
      },
      simSessions: { where: { completed: true } },
    },
  });

  const solutions = user.solutions;
  const total = solutions.length;

  // Compute stats for the prompt
  const easy = solutions.filter((s) => s.problem.difficulty === "EASY").length;
  const medium = solutions.filter(
    (s) => s.problem.difficulty === "MEDIUM",
  ).length;
  const hard = solutions.filter((s) => s.problem.difficulty === "HARD").length;

  const avgConf = total
    ? (
        solutions.reduce((sum, s) => sum + s.confidenceLevel, 0) / total
      ).toFixed(1)
    : 0;

  const patternMap = {};
  solutions.forEach((s) => {
    if (s.patternIdentified) {
      patternMap[s.patternIdentified] =
        (patternMap[s.patternIdentified] || 0) + 1;
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reviewsDue = solutions.filter((s) => {
    const dates = JSON.parse(s.reviewDates || "[]");
    return dates.some((d) => {
      const rd = new Date(d);
      rd.setHours(0, 0, 0, 0);
      return rd <= today;
    });
  }).length;

  const { system, user: userPrompt } = weeklyPlanPrompt({
    totalSolved: total,
    easy,
    medium,
    hard,
    streak: user.streak,
    reviewsDue,
    simCount: user.simSessions.length,
    avgConfidence: avgConf,
    dimensions: req.body.dimensions || {},
    patternsCovered: Object.keys(patternMap).join(", "),
    targetCompanies: JSON.parse(user.targetCompanies || "[]"),
    targetDate: user.targetDate,
  });

  const raw = await aiComplete({
    systemPrompt: system,
    userPrompt,
    userId,
    maxTokens: 1500,
  });

  const validation = validateAIResponse(weeklyPlanSchema, raw);
  if (!validation.valid) {
    return errorResponse(res, "AI returned invalid format. Try again.", 500);
  }

  return successResponse(res, validation.data, "Weekly plan generated");
}

// ── GET /api/ai/status ─────────────────────────────────
export async function getAIStatus(req, res) {
  const userId = req.user.id;
  const { checkRateLimit } = await import("../services/ai.service.js");
  const rateCheck = checkRateLimit(userId);

  return successResponse(res, {
    enabled: process.env.AI_ENABLED === "true",
    hasApiKey: !!process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    rateLimit: {
      limit: rateCheck.limit,
      remaining: rateCheck.remaining,
      allowed: rateCheck.allowed,
    },
  });
}

// ── POST /api/ai/embed-all ─────────────────────────────
export async function triggerBatchEmbedding(req, res) {
  if (!isEmbeddingEnabled()) {
    return errorResponse(res, "Embedding service not enabled", 503);
  }

  // Run in background
  embedAllExisting().catch((err) =>
    console.error("[Embedding] Batch failed:", err.message),
  );

  return successResponse(res, {
    message:
      "Batch embedding started in background. Check server logs for progress.",
  });
}

// ── GET /api/ai/similar-solutions/:solutionId ──────────
export async function getSimilarSolutions(req, res) {
  const { solutionId } = req.params;
  const results = await findSimilarSolutions(solutionId, 5);
  return successResponse(res, results);
}

// ── GET /api/ai/similar-problems/:problemId ────────────
export async function getSimilarProblems(req, res) {
  const { problemId } = req.params;
  const results = await findSimilarProblems(problemId, 5);
  return successResponse(res, results);
}

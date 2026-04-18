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
// ── POST /api/ai/review-solution ───────────────────────
export async function reviewSolution(req, res) {
  const { solutionId } = req.body;
  const userId = req.user.id;

  const solution = await prisma.solution.findUnique({
    where: { id: solutionId },
    include: {
      problem: {
        select: {
          title: true,
          difficulty: true,
          category: true,
          tags: true,
          description: true,
          realWorldContext: true,
          adminNotes: true,
        },
      },
      user: { select: { username: true, currentLevel: true } },
    },
  });

  if (!solution) return notFoundResponse(res, "Solution");

  // ── RAG: Find similar solutions from teammates ─────
  let ragContext = "";

  try {
    // Method 1: Vector similarity search (if embeddings exist)
    const similarSolutions = await prisma.$queryRawUnsafe(
      `
      SELECT s.id, s."userId", s."patternIdentified",
             s."optimizedApproach", s."optimizedTime", s."optimizedSpace",
             s."keyInsight", s."confidenceLevel", s.language,
             u.username,
             s.embedding <=> (SELECT embedding FROM solutions WHERE id = $1) AS distance
      FROM solutions s
      JOIN users u ON u.id = s."userId"
      WHERE s.id != $1
        AND s."problemId" = $2
        AND s."userId" != $3
        AND s.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT 3
    `,
      solutionId,
      solution.problemId,
      userId,
    );

    if (similarSolutions.length > 0) {
      ragContext = "\n\n--- TEAMMATE SOLUTIONS FOR CONTEXT ---\n";
      ragContext +=
        "Here are how other team members solved the same problem:\n\n";
      similarSolutions.forEach((ts, i) => {
        ragContext += `Teammate ${i + 1} (${ts.username}):\n`;
        if (ts.patternIdentified)
          ragContext += `  Pattern: ${ts.patternIdentified}\n`;
        if (ts.optimizedApproach)
          ragContext += `  Approach: ${ts.optimizedApproach.slice(0, 300)}\n`;
        if (ts.optimizedTime) ragContext += `  Time: ${ts.optimizedTime}\n`;
        if (ts.optimizedSpace) ragContext += `  Space: ${ts.optimizedSpace}\n`;
        if (ts.keyInsight) ragContext += `  Key Insight: ${ts.keyInsight}\n`;
        ragContext += `  Confidence: ${ts.confidenceLevel}/5\n\n`;
      });
    }
  } catch (err) {
    console.log(
      "[AI Review] RAG vector search failed, falling back to direct query:",
      err.message,
    );
  }

  // Method 2: Fallback — direct query if vector search fails or no embeddings
  if (!ragContext) {
    try {
      const teammateSolutions = await prisma.solution.findMany({
        where: {
          problemId: solution.problemId,
          userId: { not: userId },
        },
        include: {
          user: { select: { username: true } },
        },
        take: 3,
        orderBy: { confidenceLevel: "desc" },
      });

      if (teammateSolutions.length > 0) {
        ragContext = "\n\n--- TEAMMATE SOLUTIONS FOR CONTEXT ---\n";
        ragContext +=
          "Here are how other team members solved the same problem:\n\n";
        teammateSolutions.forEach((ts, i) => {
          ragContext += `Teammate ${i + 1} (${ts.user.username}):\n`;
          if (ts.patternIdentified)
            ragContext += `  Pattern: ${ts.patternIdentified}\n`;
          if (ts.optimizedApproach)
            ragContext += `  Approach: ${ts.optimizedApproach.slice(0, 300)}\n`;
          if (ts.optimizedTime) ragContext += `  Time: ${ts.optimizedTime}\n`;
          if (ts.optimizedSpace)
            ragContext += `  Space: ${ts.optimizedSpace}\n`;
          if (ts.keyInsight) ragContext += `  Key Insight: ${ts.keyInsight}\n`;
          ragContext += `  Confidence: ${ts.confidenceLevel}/5\n\n`;
        });
      }
    } catch (err) {
      console.log("[AI Review] Fallback query also failed:", err.message);
    }
  }

  // ── RAG: Get problem admin notes for reviewer context ──
  let adminContext = "";
  if (solution.problem.adminNotes) {
    adminContext = `\n\n--- ADMIN TEACHING NOTES ---\n${solution.problem.adminNotes}`;
  }
  if (solution.problem.realWorldContext) {
    adminContext += `\n\n--- REAL WORLD CONTEXT ---\n${solution.problem.realWorldContext}`;
  }

  // ── Build the RAG-enhanced prompt ─────────────────────
  const tags =
    typeof solution.problem.tags === "string"
      ? JSON.parse(solution.problem.tags || "[]")
      : solution.problem.tags || [];

  const { system, user } = solutionReviewPrompt({
    problemTitle: solution.problem.title,
    difficulty: solution.problem.difficulty,
    category: solution.problem.category || "CODING",
    pattern: solution.patternIdentified,
    approach: solution.optimizedApproach || solution.bruteForceApproach,
    timeComplexity: solution.optimizedTime || solution.bruteForceTime,
    spaceComplexity: solution.optimizedSpace || solution.bruteForceSpace,
    code: solution.code,
    language: solution.language,
    keyInsight: solution.keyInsight,
    explanation: solution.feynmanExplanation,
    userLevel: solution.user?.currentLevel || "BEGINNER",
    ragContext,
    adminContext,
  });

  console.log(
    `[AI Review] RAG context: ${ragContext ? ragContext.length + " chars" : "none"}`,
  );
  console.log(
    `[AI Review] Admin context: ${adminContext ? adminContext.length + " chars" : "none"}`,
  );

  try {
    const raw = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId,
      maxTokens: 1500,
    });

    const validation = validateAIResponse(solutionReviewSchema, raw);
    if (!validation.valid) {
      return errorResponse(res, "AI returned invalid format. Try again.", 500);
    }

    // Save feedback to solution
    await prisma.solution.update({
      where: { id: solutionId },
      data: { aiFeedback: JSON.stringify(validation.data) },
    });

    return successResponse(
      res,
      {
        ...validation.data,
        ragUsed: !!ragContext,
        teammateCount: ragContext
          ? (ragContext.match(/Teammate \d+/g) || []).length
          : 0,
      },
      "Solution reviewed by AI",
    );
  } catch (error) {
    console.error(
      "[AI Review] Error:",
      error.code || error.name,
      error.message,
    );
    if (error.name === "AIError") {
      return errorResponse(
        res,
        error.message,
        error.code === "RATE_LIMITED" ? 429 : 500,
        error.code,
      );
    }
    return errorResponse(
      res,
      `Review failed: ${error.message}`,
      500,
      "AI_ERROR",
    );
  }
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

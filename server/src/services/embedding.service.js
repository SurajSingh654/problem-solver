/**
 * EMBEDDING SERVICE — Generate and store vector embeddings
 * Uses OpenAI's text-embedding-3-small model (1536 dimensions)
 * Stores embeddings in pgvector columns for similarity search
 */
import OpenAI from "openai";
import prisma from "../lib/prisma.js";

let openai = null;

function getClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// ── Generate embedding from text ───────────────────────
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) return null;

  try {
    const client = getClient();
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text.trim().slice(0, 8000), // Max ~8000 chars for safety
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("[Embedding] Generation failed:", error.message);
    return null;
  }
}

// ── Build text representation for a solution ───────────
export function buildSolutionText(solution, problem) {
  const parts = [];

  if (problem?.title) parts.push(`Problem: ${problem.title}`);
  if (problem?.difficulty) parts.push(`Difficulty: ${problem.difficulty}`);
  if (problem?.category) parts.push(`Category: ${problem.category}`);
  if (solution.patternIdentified)
    parts.push(`Pattern: ${solution.patternIdentified}`);
  if (solution.bruteForceApproach)
    parts.push(`Brute Force: ${solution.bruteForceApproach}`);
  if (solution.optimizedApproach)
    parts.push(`Optimized: ${solution.optimizedApproach}`);
  if (solution.optimizedTime) parts.push(`Time: ${solution.optimizedTime}`);
  if (solution.optimizedSpace) parts.push(`Space: ${solution.optimizedSpace}`);
  if (solution.keyInsight) parts.push(`Key Insight: ${solution.keyInsight}`);
  if (solution.feynmanExplanation)
    parts.push(`Explanation: ${solution.feynmanExplanation}`);
  if (solution.code) parts.push(`Code: ${solution.code.slice(0, 1000)}`);

  return parts.join("\n");
}

// ── Build text representation for a problem ────────────
export function buildProblemText(problem) {
  const parts = [];

  parts.push(`Title: ${problem.title}`);
  if (problem.category) parts.push(`Category: ${problem.category}`);
  if (problem.difficulty) parts.push(`Difficulty: ${problem.difficulty}`);
  if (problem.description) parts.push(`Description: ${problem.description}`);

  const tags =
    typeof problem.tags === "string"
      ? JSON.parse(problem.tags || "[]")
      : problem.tags || [];
  if (tags.length) parts.push(`Tags: ${tags.join(", ")}`);

  const companyTags =
    typeof problem.companyTags === "string"
      ? JSON.parse(problem.companyTags || "[]")
      : problem.companyTags || [];
  if (companyTags.length) parts.push(`Companies: ${companyTags.join(", ")}`);

  if (problem.realWorldContext)
    parts.push(`Real World: ${problem.realWorldContext}`);

  return parts.join("\n");
}

// ── Generate and store embedding for a solution ────────
export async function embedSolution(solutionId) {
  try {
    const solution = await prisma.solution.findUnique({
      where: { id: solutionId },
      include: {
        problem: {
          select: { title: true, difficulty: true, category: true, tags: true },
        },
      },
    });

    if (!solution) return null;

    const text = buildSolutionText(solution, solution.problem);
    if (!text || text.length < 20) return null;

    const embedding = await generateEmbedding(text);
    if (!embedding) return null;

    // Store using raw SQL since Prisma doesn't support vector type natively
    await prisma.$executeRawUnsafe(
      `UPDATE solutions SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(",")}]`,
      solutionId,
    );

    console.log(
      `[Embedding] Solution ${solutionId} embedded (${text.length} chars)`,
    );
    return embedding;
  } catch (error) {
    console.error(
      `[Embedding] Failed for solution ${solutionId}:`,
      error.message,
    );
    return null;
  }
}

// ── Generate and store embedding for a problem ─────────
export async function embedProblem(problemId) {
  try {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) return null;

    const text = buildProblemText(problem);
    if (!text || text.length < 20) return null;

    const embedding = await generateEmbedding(text);
    if (!embedding) return null;

    await prisma.$executeRawUnsafe(
      `UPDATE problems SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(",")}]`,
      problemId,
    );

    console.log(
      `[Embedding] Problem ${problemId} embedded (${text.length} chars)`,
    );
    return embedding;
  } catch (error) {
    console.error(
      `[Embedding] Failed for problem ${problemId}:`,
      error.message,
    );
    return null;
  }
}

// ── Find similar solutions using vector search ─────────
export async function findSimilarSolutions(solutionId, limit = 5) {
  try {
    const results = await prisma.$queryRawUnsafe(
      `
      SELECT s.id, s."problemId", s."userId", s."patternIdentified",
             s."optimizedApproach", s."keyInsight", s."optimizedTime",
             s."confidenceLevel", s.language,
             s.embedding <=> (SELECT embedding FROM solutions WHERE id = $1) AS distance
      FROM solutions s
      WHERE s.id != $1
        AND s.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT $2
    `,
      solutionId,
      limit,
    );

    return results;
  } catch (error) {
    console.error(
      "[Embedding] Similar solutions search failed:",
      error.message,
    );
    return [];
  }
}

// ── Find similar problems using vector search ──────────
export async function findSimilarProblems(problemId, limit = 5) {
  try {
    const results = await prisma.$queryRawUnsafe(
      `
      SELECT p.id, p.title, p.difficulty, p.category, p.tags,
             p.embedding <=> (SELECT embedding FROM problems WHERE id = $1) AS distance
      FROM problems p
      WHERE p.id != $1
        AND p.embedding IS NOT NULL
        AND p."isActive" = true
      ORDER BY distance ASC
      LIMIT $2
    `,
      problemId,
      limit,
    );

    return results.map((r) => ({
      ...r,
      tags: JSON.parse(r.tags || "[]"),
    }));
  } catch (error) {
    console.error("[Embedding] Similar problems search failed:", error.message);
    return [];
  }
}

// ── Find solutions similar to a text query ─────────────
export async function searchSolutionsByText(queryText, limit = 5) {
  try {
    const embedding = await generateEmbedding(queryText);
    if (!embedding) return [];

    const vectorStr = `[${embedding.join(",")}]`;

    const results = await prisma.$queryRawUnsafe(
      `
      SELECT s.id, s."problemId", s."userId", s."patternIdentified",
             s."optimizedApproach", s."keyInsight",
             s.embedding <=> $1::vector AS distance
      FROM solutions s
      WHERE s.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT $2
    `,
      vectorStr,
      limit,
    );

    return results;
  } catch (error) {
    console.error("[Embedding] Text search failed:", error.message);
    return [];
  }
}

// ── Batch embed all existing solutions and problems ────
export async function embedAllExisting() {
  console.log("[Embedding] Starting batch embedding...");

  // Embed problems without embeddings
  const problems = await prisma.$queryRawUnsafe(`
    SELECT id FROM problems WHERE embedding IS NULL AND "isActive" = true
  `);
  console.log(`[Embedding] ${problems.length} problems need embedding`);

  for (const p of problems) {
    await embedProblem(p.id);
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  // Embed solutions without embeddings
  const solutions = await prisma.$queryRawUnsafe(`
    SELECT id FROM solutions WHERE embedding IS NULL
  `);
  console.log(`[Embedding] ${solutions.length} solutions need embedding`);

  for (const s of solutions) {
    await embedSolution(s.id);
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("[Embedding] Batch embedding complete");
}

// ── Check if embedding service is available ────────────
export function isEmbeddingEnabled() {
  return process.env.AI_ENABLED === "true" && !!process.env.OPENAI_API_KEY;
}

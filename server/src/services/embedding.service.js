/**
 * EMBEDDING SERVICE — Generate and store vector embeddings.
 *
 * Default model: text-embedding-3-small (1536 dimensions). Override via
 * `AI_EMBEDDING_MODEL` env var. NOTE: changing to a model with different
 * dimensions (e.g. text-embedding-3-large at 3072) requires a separate
 * schema migration — vector columns are declared `vector(1536)` and a
 * dimension mismatch on INSERT throws a Postgres error. Out of scope for
 * Sprint 4.2a; tracked separately for any future model-upgrade work.
 */
import OpenAI from "openai";
import prisma from "../lib/prisma.js";
import {
  OPENAI_API_KEY,
  AI_REQUEST_TIMEOUT_MS,
  AI_EMBEDDING_MODEL,
} from "../config/env.js";

let openai = null;

function getClient() {
  if (!openai) {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    // Bounded timeout so a stuck embedding request can't hold a worker
    // indefinitely. Default SDK retries (2) are kept here because there is
    // no outer retry loop on this code path — a transient failure becomes
    // a NULL embedding otherwise. The proper retry queue is a separate
    // roadmap item (embedding-outbox-retry-queue).
    openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
  }
  return openai;
}

// ── Generate embedding from text ───────────────────────
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) return null;
  try {
    const client = getClient();
    const response = await client.embeddings.create({
      model: AI_EMBEDDING_MODEL,
      input: text.trim().slice(0, 8000),
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
  if (Array.isArray(solution.patterns) && solution.patterns.length > 0)
    parts.push(`Patterns: ${solution.patterns.join(", ")}`);
  // CODING-native generic columns (populated only for CODING submissions
  // after the category-specific-data refactor; legacy rows still have them).
  if (solution.bruteForce)
    parts.push(`Brute Force: ${solution.bruteForce}`);
  if (solution.optimizedApproach)
    parts.push(`Optimized: ${solution.optimizedApproach}`);
  if (solution.timeComplexity) parts.push(`Time: ${solution.timeComplexity}`);
  if (solution.spaceComplexity) parts.push(`Space: ${solution.spaceComplexity}`);
  if (solution.keyInsight) parts.push(`Key Insight: ${solution.keyInsight}`);
  if (solution.feynmanExplanation)
    parts.push(`Explanation: ${solution.feynmanExplanation}`);
  if (solution.code) parts.push(`Code: ${solution.code.slice(0, 1000)}`);

  // Non-CODING submissions carry their content in categorySpecificData.
  // Flatten any string fields into the embedding text so similarity search
  // has something meaningful to match against for HR / Behavioral / TK / SQL.
  if (solution.categorySpecificData && typeof solution.categorySpecificData === "object") {
    const csdText = Object.values(solution.categorySpecificData)
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join(" ")
      .slice(0, 2000);
    if (csdText) parts.push(csdText);
  }

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

// ── Unified writer: load → buildText → embed → persist (+ enqueue on failure)
// ── Polymorphic over entityType via the ENTITY_CONFIG map.

const ENTITY_CONFIG = {
  Solution: {
    table: "solutions",
    load: (id) =>
      prisma.solution.findUnique({
        where: { id },
        select: {
          approach: true,
          code: true,
          keyInsight: true,
          patterns: true,
          problem: {
            select: { title: true, difficulty: true, category: true, tags: true },
          },
        },
      }),
    buildText: (s) => buildSolutionText(s, s.problem),
  },
  Problem: {
    table: "problems",
    load: (id) => prisma.problem.findUnique({ where: { id } }),
    buildText: (p) => buildProblemText(p),
  },
  Note: {
    table: "notes",
    load: (id) => prisma.note.findUnique({ where: { id } }),
    buildText: (n) => buildNoteText(n),
  },
};

export async function embedAndPersist(entityType, entityId) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    console.error(`[Embedding] Unknown entityType: ${entityType}`);
    return null;
  }
  try {
    const entity = await config.load(entityId);
    if (!entity) return null;

    const text = config.buildText(entity);
    if (!text || text.length < 20) return null;

    const embedding = await generateEmbedding(text);
    if (!embedding) {
      const { enqueueEmbedding } = await import("./embedding.outbox.js");
      await enqueueEmbedding(
        entityType,
        entityId,
        "generateEmbedding returned null",
      );
      return null;
    }

    try {
      const vectorStr = `[${embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "${config.table}" SET embedding = $1::vector WHERE id = $2`,
        vectorStr,
        entityId,
      );
      console.log(
        `[Embedding] ${entityType} ${entityId} embedded (${text.length} chars)`,
      );
      return embedding;
    } catch (dbErr) {
      const { enqueueEmbedding } = await import("./embedding.outbox.js");
      await enqueueEmbedding(
        entityType,
        entityId,
        `db update failed: ${dbErr.message}`,
      );
      return null;
    }
  } catch (err) {
    console.error(`[Embedding] ${entityType} ${entityId} failed:`, err.message);
    try {
      const { enqueueEmbedding } = await import("./embedding.outbox.js");
      await enqueueEmbedding(entityType, entityId, err.message);
    } catch {
      // enqueue self-failure already CRITICAL-logs; don't mask original error
    }
    return null;
  }
}

// ── Batch embed all existing solutions and problems (manual recovery tool).
// Failed rows are queued into the outbox via embedAndPersist for retry.
export async function embedAllExisting() {
  console.log("[Embedding] Starting batch embedding...");
  const problems = await prisma.$queryRawUnsafe(`
    SELECT id FROM problems WHERE embedding IS NULL AND "isPublished" = true
  `);
  console.log(`[Embedding] ${problems.length} problems need embedding`);
  for (const p of problems) {
    await embedAndPersist("Problem", p.id);
    await new Promise((r) => setTimeout(r, 200));
  }
  const solutions = await prisma.$queryRawUnsafe(`
    SELECT id FROM solutions WHERE embedding IS NULL
  `);
  console.log(`[Embedding] ${solutions.length} solutions need embedding`);
  for (const s of solutions) {
    await embedAndPersist("Solution", s.id);
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log("[Embedding] Batch embedding complete");
}

// ── Notes ──────────────────────────────────────────────
//
// Notes are user-scoped. The text representation includes title + tags +
// the markdown body so the embedding captures both topic and content.
// Generation runs from `notes.embedding.js` after every save (debounced).

export function buildNoteText(note) {
  const parts = [];
  if (note.title) parts.push(`Title: ${note.title}`);
  if (Array.isArray(note.tags) && note.tags.length > 0)
    parts.push(`Tags: ${note.tags.join(", ")}`);
  if (note.linkedEntityType) parts.push(`Linked: ${note.linkedEntityType}`);
  if (note.contentMarkdown) parts.push(note.contentMarkdown);
  return parts.join("\n\n");
}

// Find similar notes belonging to the same user. Excludes archived rows
// and the source note itself.
export async function findSimilarNotes(noteId, userId, limit = 5) {
  try {
    const results = await prisma.$queryRawUnsafe(
      `
      SELECT n.id, n.title, n.tags, n."updatedAt",
             n.embedding <=> (SELECT embedding FROM notes WHERE id = $1) AS distance
      FROM notes n
      WHERE n.id != $1
        AND n."userId" = $2
        AND n."archivedAt" IS NULL
        AND n.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT $3
    `,
      noteId,
      userId,
      limit,
    );
    return results;
  } catch (error) {
    console.error("[Embedding] Similar notes search failed:", error.message);
    return [];
  }
}

// Cross-table: find Problems similar to a note (within the user's
// accessible team set). Used for "linked problems" suggestions.
export async function findProblemsByNoteEmbedding(noteId, teamIds, limit = 5) {
  try {
    if (!Array.isArray(teamIds) || teamIds.length === 0) return [];

    // Pre-check: source note must have a non-NULL embedding. Otherwise
    // the `<=>` operator returns NULL for every candidate and we silently
    // get zero results — indistinguishable from "no similar problems".
    // Better to log + bail explicitly.
    const sourceCheck = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM notes WHERE id = $1 AND embedding IS NOT NULL LIMIT 1`,
      noteId,
    );
    if (sourceCheck.length === 0) {
      console.log(
        `[Embedding] findProblemsByNoteEmbedding: note ${noteId} has no embedding yet — returning empty`,
      );
      return [];
    }

    const results = await prisma.$queryRawUnsafe(
      `
      SELECT p.id, p.title, p.difficulty, p.category, p.tags,
             p.embedding <=> (SELECT embedding FROM notes WHERE id = $1) AS distance
      FROM problems p
      WHERE p."teamId" = ANY($2::text[])
        AND p."isPublished" = true
        AND p.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT $3
    `,
      noteId,
      teamIds,
      limit,
    );
    return results;
  } catch (error) {
    console.error(
      "[Embedding] Cross-table note→problem search failed:",
      error.message,
    );
    return [];
  }
}

// ── Check if embedding service is available ────────────
export function isEmbeddingEnabled() {
  return process.env.AI_ENABLED === "true" && !!process.env.OPENAI_API_KEY;
}

/**
 * RAG SERVICE — teammate-solution retrieval orchestration.
 *
 * Owns the SQL + filters + formatting for "find teammate solutions
 * similar to this one" RAG queries used by aiReview.controller.js and
 * interview.engine.js::searchTeammateSolutions.
 *
 * Tuning lives in named constants below — see spec
 * docs/superpowers/specs/2026-06-26-rag-retrieval-hardening-design.md
 * for the reasoning behind each value.
 */
import prisma from "../lib/prisma.js";
import { generateEmbedding } from "./embedding.service.js";

// ── Tuning constants (single source of truth) ──────────────────────────
//
// RAG_FRESHNESS_DAYS = 180 — only teammate solutions updated within the
// last 6 months count. Balances "captures recent activity" vs "doesn't
// punish active prep cycles" vs "stale framework idioms dilute prompt".
// Change via redeploy if telemetry shows the wrong number.
export const RAG_FRESHNESS_DAYS = 180;

// RAG_TEAMMATE_LIMIT_DEFAULT = 3 — research-backed RAG top-k sweet spot.
// Beyond 3, marginal signal becomes noise + inflates prompt-injection
// attack surface (every teammate solution is untrusted input).
export const RAG_TEAMMATE_LIMIT_DEFAULT = 3;

// Per-field char caps bound the per-teammate token footprint at ~175
// tokens (4 chars/token English heuristic). 3 teammates × 175 ≈ 525
// tokens of RAG payload, comfortably under any model budget.
export const RAG_APPROACH_CHAR_CAP = 400;
export const RAG_KEY_INSIGHT_CHAR_CAP = 300;

// Defense-in-depth total backstop. If a future change adds a 4th field
// or bumps per-field caps, the prompt budget stays bounded. The
// "[...truncated]" marker tells the model the picture is incomplete.
export const RAG_CONTEXT_HARD_CAP = 2400;

export async function findSimilarTeammateSolutions({
  problemId,
  teamId,
  userId,
  queryText,
  limit = RAG_TEAMMATE_LIMIT_DEFAULT,
  freshnessDays = RAG_FRESHNESS_DAYS,
}) {
  if (!queryText || queryText.trim().length === 0) return [];
  try {
    const embedding = await generateEmbedding(queryText);
    if (!embedding) return [];
    const vectorStr = `[${embedding.join(",")}]`;
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT s.id, s.approach,
             s."keyInsight" AS "keyInsight",
             s."timeComplexity" AS "timeComplexity",
             s."spaceComplexity" AS "spaceComplexity",
             s.confidence, s.patterns,
             u.name AS "authorName",
             1 - (s.embedding <=> $1::vector) AS similarity
      FROM solutions s
      JOIN users u ON s."userId" = u.id
      WHERE s."teamId" = $2
        AND s."problemId" = $3
        AND s."userId" != $4
        AND s.embedding IS NOT NULL
        AND s."updatedAt" > now() - ($5 || ' days')::interval
      ORDER BY s.embedding <=> $1::vector
      LIMIT $6
    `,
      vectorStr,
      teamId,
      problemId,
      userId,
      String(freshnessDays),
      limit,
    );
    return rows;
  } catch (err) {
    console.error(
      "[rag.service] findSimilarTeammateSolutions failed:",
      err.message,
    );
    return [];
  }
}

export function formatTeammateContext(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const formatted = rows
    .map((ts, i) => {
      const approach = (ts.approach || "Not provided").slice(
        0,
        RAG_APPROACH_CHAR_CAP,
      );
      const keyInsight = (ts.keyInsight || "Not provided").slice(
        0,
        RAG_KEY_INSIGHT_CHAR_CAP,
      );
      const patterns =
        (ts.patterns ?? []).join(", ") || "Not identified";
      const time = ts.timeComplexity || "?";
      const space = ts.spaceComplexity || "?";
      const confidence = ts.confidence ?? "?";
      return `Teammate ${i + 1} (${ts.authorName}):
  Approach: ${approach}
  Key Insight: ${keyInsight}
  Complexity: ${time} time, ${space} space
  Pattern: ${patterns}
  Confidence: ${confidence}/5`;
    })
    .join("\n\n");
  if (formatted.length > RAG_CONTEXT_HARD_CAP) {
    return formatted.slice(0, RAG_CONTEXT_HARD_CAP) + "\n[...truncated]";
  }
  return formatted;
}

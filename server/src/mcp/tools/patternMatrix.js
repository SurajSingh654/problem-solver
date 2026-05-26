// ============================================================================
// MCP tool — get_pattern_matrix
// ============================================================================
//
// Returns the per-pattern mastery matrix (D1) — Untouched / Touched /
// Working / Solid / Owned per canonical pattern. The single highest-leverage
// piece of context for a coding-coaching LLM:
//
//   "Walking through Two Pointers — your D1 mastery shows this is Untouched,
//    so I'll explain the chunk-recognition fundamentals first."
//
// PRIVACY/SECURITY:
//   - Reuses get6DReport (same auth + multi-tenancy as web report)
//   - Pattern names come from canonical taxonomy (already public, no PII)
//   - Counts are integers (no risk of PII leak)
//
// FILTERS:
//   filter='all'        — all 25 canonical patterns
//   filter='faang-core' — only the 15 FAANG-core
//   filter='gaps'       — Untouched + Touched (what to practice next)
//   filter='in-progress' — Working (currently improving)
//   filter='owned'      — Solid + Owned (mastered)
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import { callController } from "../utils/captureRes.js";
import { get6DReport } from "../../controllers/stats.controller.js";

// ── Input ────────────────────────────────────────────────────────────
const inputSchema = z
  .object({
    filter: z
      .enum(["all", "faang-core", "gaps", "in-progress", "owned"])
      .optional(),
  })
  .strict();

// ── Output ───────────────────────────────────────────────────────────
const matrixRowSchema = z.object({
  pattern: z.string(),
  state: z.enum(["UNTOUCHED", "TOUCHED", "WORKING", "SOLID", "OWNED"]),
  solves: z.number(),
  coldSolves: z.number(),
  difficulties: z.array(z.string()),
  retained: z.boolean(),
  isCore: z.boolean(),
});

// ── Implementation ──────────────────────────────────────────────────
async function handler(args) {
  const { userId, teamId, globalRole, teamRole } = getMcpContext();
  if (!teamId) {
    return {
      content: [
        {
          type: "text",
          text: "No active team context. Switch to a team in the web UI before querying pattern mastery.",
        },
      ],
      isError: true,
    };
  }

  const filter = args?.filter ?? "all";

  const captured = await callController(get6DReport, {
    user: { id: userId, globalRole, currentTeamId: teamId, teamRole },
    teamId,
  });

  const report = captured?.data?.report;
  const d1 = (report?.dimensions || []).find((d) => d.key === "patternRecognition");

  // patternMatrix is attached to d1Score in stats.controller.js when
  // FEATURE_PATTERN_MASTERY_V2 is on and the dim is active.
  const matrix = d1?.patternMatrix;
  if (!Array.isArray(matrix)) {
    return {
      content: [
        {
          type: "text",
          text:
            d1?.activationMessage ||
            "Pattern matrix unavailable — D1 v2 may not be active for this user yet. " +
            "Submit ≥3 solutions with patterns claimed and get ≥2 AI reviews to unlock.",
        },
      ],
      isError: false, // not an error, just an inactive state
    };
  }

  // Filter rows per the requested view.
  const filtered = matrix.filter((row) => {
    if (filter === "faang-core") return row.isCore;
    if (filter === "gaps") return row.state === "UNTOUCHED" || row.state === "TOUCHED";
    if (filter === "in-progress") return row.state === "WORKING";
    if (filter === "owned") return row.state === "SOLID" || row.state === "OWNED";
    return true;
  });

  // Validate output shape (Zod field allowlist).
  const rows = filtered.map((row) =>
    matrixRowSchema.parse({
      pattern: row.pattern,
      state: row.state,
      solves: row.solves,
      coldSolves: row.coldSolves,
      difficulties: row.difficulties,
      retained: row.retained,
      isCore: row.isCore,
    }),
  );

  // Add a one-line summary at the top so the LLM can answer "how am I
  // doing on patterns?" without iterating the full matrix.
  const counts = {
    untouched: matrix.filter((r) => r.state === "UNTOUCHED").length,
    touched: matrix.filter((r) => r.state === "TOUCHED").length,
    working: matrix.filter((r) => r.state === "WORKING").length,
    solid: matrix.filter((r) => r.state === "SOLID").length,
    owned: matrix.filter((r) => r.state === "OWNED").length,
    coreSolidOrAbove: matrix.filter(
      (r) => r.isCore && (r.state === "SOLID" || r.state === "OWNED"),
    ).length,
    totalCore: matrix.filter((r) => r.isCore).length,
    totalCanonical: matrix.length,
  };

  const summary = {
    filter,
    counts,
    rows,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
  };
}

// ── Registration ─────────────────────────────────────────────────────
export function register(server) {
  server.registerTool(
    "get_pattern_matrix",
    {
      title: "Get pattern mastery matrix",
      description:
        "Get the per-pattern coding-mastery state for the authenticated user. " +
        "Each canonical pattern has a state: UNTOUCHED, TOUCHED, WORKING, SOLID, or OWNED. " +
        "Use this to recommend what pattern to practice next, or to ground coding-help responses " +
        'in actual mastery state (e.g. "Two Pointers is Untouched — let\'s start with the chunk-' +
        'recognition fundamentals"). ' +
        "Filter options: 'all' (default), 'faang-core' (15 highest-frequency patterns), 'gaps' " +
        "(Untouched + Touched, what to practice next), 'in-progress' (Working), 'owned' " +
        "(Solid + Owned, what's mastered).",
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}

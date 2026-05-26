// ============================================================================
// MCP tool — get_dim_breakdown(dim_key)
// ============================================================================
//
// Returns the detailed breakdown for ONE dimension (D1-D10). Companion to
// get_readiness_report which returns the summary across all dims.
//
// Example LLM use:
//   "Tell me more about my Solution Depth score" →
//      get_dim_breakdown(dim_key="solutionDepth")
//
// PRIVACY/SECURITY:
//   - Reuses get6DReport (same auth + multi-tenancy)
//   - dim_key validated against canonical Zod enum (no arbitrary key injection)
//   - basis lines surfaced (deeper detail than the summary tool)
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import { callController } from "../utils/captureRes.js";
import { get6DReport } from "../../controllers/stats.controller.js";

const DIM_KEYS = [
  "patternRecognition",
  "solutionDepth",
  "communication",
  "optimization",
  "pressurePerformance",
  "retention",
  "teachingContributions",
  "designAptitude",
  "behavioralPerformance",
  "verificationMetacognition",
];

const inputSchema = z
  .object({
    dim_key: z.enum(DIM_KEYS),
  })
  .strict();

async function handler(args) {
  const { userId, teamId, globalRole, teamRole } = getMcpContext();
  if (!teamId) {
    return {
      content: [
        {
          type: "text",
          text: "No active team context. Switch to a team in the web UI before querying dim breakdown.",
        },
      ],
      isError: true,
    };
  }

  const captured = await callController(get6DReport, {
    user: { id: userId, globalRole, currentTeamId: teamId, teamRole },
    teamId,
  });

  const report = captured?.data?.report;
  const dim = (report?.dimensions || []).find((d) => d.key === args.dim_key);

  if (!dim) {
    return {
      content: [
        {
          type: "text",
          text: `Dimension '${args.dim_key}' not found in report. May be flag-gated or opt-in.`,
        },
      ],
      isError: false,
    };
  }

  // Build a verbose-but-bounded shape. Includes basis lines + any v2
  // metadata the controller attached (sourceQuality, ceiling, etc.).
  const breakdown = {
    key: dim.key,
    status: dim.status,
    score: dim.score ?? null,
    n: dim.n ?? 0,
    ci: Array.isArray(dim.ci) && dim.ci.length === 2 ? [dim.ci[0], dim.ci[1]] : null,
    basis: Array.isArray(dim.basis) ? dim.basis : [],
    activationMessage: dim.activationMessage ?? null,
    // v2 metadata when present
    sourceQuality: dim.sourceQuality ?? null,
    ceiling: dim.ceiling ?? null,
    // dim-specific extras (each set only when relevant)
    retentionLeechCount: dim.retentionLeechCount ?? null,
    teachingFlaggedCount: dim.teachingFlaggedCount ?? null,
    behavioralCalibrationDelta: dim.behavioralCalibrationDelta ?? null,
    verificationCalibrationDelta: dim.verificationCalibrationDelta ?? null,
    verificationWrongPatternCount: dim.verificationWrongPatternCount ?? null,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(breakdown, null, 2) }],
  };
}

export function register(server) {
  server.registerTool(
    "get_dim_breakdown",
    {
      title: "Get dimension breakdown",
      description:
        "Get detailed breakdown for ONE dimension (D1-D10). Returns score, CI, sample size, " +
        "basis lines (per-dim diagnostic detail), source-quality tier (D3/D5/D7/D8/D9/D10), and " +
        "any v2-specific metadata (leech count, calibration delta, wrong-pattern flags, etc.). " +
        "Use this when get_readiness_report's summary isn't enough — e.g. user asks 'why is my " +
        "Solution Depth score so low?' or 'how calibrated am I?'. " +
        "Valid dim_key values: patternRecognition, solutionDepth, communication, optimization, " +
        "pressurePerformance, retention, teachingContributions, designAptitude, " +
        "behavioralPerformance, verificationMetacognition.",
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}

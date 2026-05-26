// ============================================================================
// MCP tool — get_team_leaderboard
// ============================================================================
//
// Returns the team's leaderboard (ranked members + scores). Reuses the
// existing getLeaderboard controller.
//
// LLM use:
//   "Where do I stand on my team?" / "Who's leading on my team?"
//
// PRIVACY:
//   - Team-scoped via getMcpContext().teamId (multi-tenancy enforced)
//   - Returns display names + scores only — no email, no internal IDs
//   - Score breakdown components surfaced (helps the LLM explain "you're
//     #2 because solution quality is high but pattern coverage is low")
//   - Highlights which entry is the calling user (`is_self: true`) so the
//     LLM can answer "where do I rank?" without re-deriving identity
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import { callController } from "../utils/captureRes.js";
import { getLeaderboard } from "../../controllers/stats.controller.js";
import { wrapUserContent } from "../utils/safeOutput.js";

const inputSchema = z.object({}).strict();

const entrySchema = z.object({
  rank: z.number(),
  display_name: z.string(),
  score: z.number().nullable(),
  solved_count: z.number().nullable(),
  streak_days: z.number().nullable(),
  patterns_covered: z.number().nullable(),
  top_strength: z.string().nullable(),
  is_self: z.boolean(),
});

async function handler() {
  const { userId, teamId, globalRole, teamRole } = getMcpContext();
  if (!teamId) {
    return {
      content: [
        {
          type: "text",
          text: "No active team context. Switch to a team in the web UI before querying leaderboard.",
        },
      ],
      isError: true,
    };
  }

  const captured = await callController(getLeaderboard, {
    user: { id: userId, globalRole, currentTeamId: teamId, teamRole },
    teamId,
    query: {},
  });

  // Controller shape: { success, data: { leaderboard: [{ userId, displayName, score, solvedCount, streakDays, patternsCovered, topStrength, ... }] } }
  const entries = captured?.data?.leaderboard ?? captured?.data ?? [];

  const out = (Array.isArray(entries) ? entries : []).map((e, i) => {
    const isSelf = e.userId === userId;
    return entrySchema.parse({
      rank: e.rank ?? i + 1,
      // Display names are user-controlled; wrap as defense-in-depth.
      display_name: wrapUserContent("display_name", e.displayName || e.name || "(anonymous)", { maxChars: 100 }),
      score: typeof e.score === "number" ? e.score : null,
      solved_count: typeof e.solvedCount === "number" ? e.solvedCount : null,
      streak_days: typeof e.streakDays === "number" ? e.streakDays : null,
      patterns_covered: typeof e.patternsCovered === "number" ? e.patternsCovered : null,
      top_strength: e.topStrength ?? null,
      is_self: isSelf,
    });
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { count: out.length, leaderboard: out },
          null,
          2,
        ),
      },
    ],
  };
}

export function register(server) {
  server.registerTool(
    "get_team_leaderboard",
    {
      title: "Get team leaderboard",
      description:
        "Get the team's full leaderboard — ranked members with scores, streaks, pattern coverage, " +
        "and top strengths. Use to answer 'where do I rank on my team?' or 'who's leading?'. " +
        "Each entry includes is_self=true for the calling user so the LLM doesn't need to re-derive " +
        "identity. No email/PII — display names + score components only.",
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}

// ============================================================================
// MCP tool — get_recommended_problems(count)
// ============================================================================
//
// Returns recommendations for what problem to solve next. Reuses the existing
// recommendations controller — same logic the web UI uses, accessible from
// inside Claude Code.
//
// LLM use cases:
//   "What should I solve next?" → get_recommended_problems(count=3)
//   "Give me 5 problems matching my weakest patterns" → get_recommended_problems(count=5)
//
// SECURITY:
//   - userId + teamId from getMcpContext (JWT-derived)
//   - count clamped 1..10 (DoS / context-budget)
//   - Output is a Zod-validated allowlist — only exposes title, difficulty,
//     pattern, slug, reason. Internal IDs and AI prompts stay server-side.
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import { callController } from "../utils/captureRes.js";
import { getRecommendations } from "../../controllers/recommendations.controller.js";
import { wrapUserContent } from "../utils/safeOutput.js";

const inputSchema = z
  .object({
    count: z.number().int().min(1).max(10).optional(),
  })
  .strict();

const recSchema = z.object({
  title: z.string(),
  slug: z.string().nullable(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
  category: z.string().nullable(),
  pattern: z.string().nullable(),
  reason: z.string(),
  type: z.string().nullable(), // recommendation type — "untouched_pattern", "review", etc.
});

async function handler(args) {
  const { userId, teamId, globalRole, teamRole } = getMcpContext();
  if (!teamId) {
    return {
      content: [
        {
          type: "text",
          text: "No active team context. Switch to a team in the web UI before requesting recommendations.",
        },
      ],
      isError: true,
    };
  }

  const count = args?.count ?? 3;

  const captured = await callController(getRecommendations, {
    user: { id: userId, globalRole, currentTeamId: teamId, teamRole },
    teamId,
    query: {},
  });

  // Controller returns { success, data: { recommendations: [...] } }
  const recs = captured?.data?.recommendations ?? captured?.data ?? [];
  const limited = Array.isArray(recs) ? recs.slice(0, count) : [];

  const out = limited.map((r) => {
    const reason = r.reason || r.why || "";
    return recSchema.parse({
      // Wrap titles + reasons via safeOutput — these are user-facing strings
      // that may include AI-generated text; defense-in-depth on prompt injection.
      title: wrapUserContent("problem_title", r.title || "(untitled)", { maxChars: 200 }),
      slug: r.slug ?? null,
      difficulty: r.difficulty ?? null,
      category: r.category ?? null,
      pattern: r.pattern ?? null,
      reason: wrapUserContent("recommendation_reason", reason, { maxChars: 500 }),
      type: r.type ?? r.recommendationType ?? null,
    });
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ count: out.length, recommendations: out }, null, 2) }],
  };
}

export function register(server) {
  server.registerTool(
    "get_recommended_problems",
    {
      title: "Get recommended problems",
      description:
        "Get the user's next-best problems to solve, ranked by what would lift their readiness most. " +
        "Recommendations are grounded in the user's pattern matrix (untouched FAANG-core patterns " +
        "ranked higher), SM-2 review queue (overdue items appear first), and weak dimensions. " +
        "Each recommendation includes a `reason` explaining why it was selected. " +
        "Default count: 3. Max: 10. Use this for 'what should I solve next?' queries.",
      inputSchema: inputSchema.shape,
    },
    handler,
  );
}

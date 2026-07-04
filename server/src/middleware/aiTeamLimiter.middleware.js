// ============================================================================
// AI TEAM LIMITER MIDDLEWARE — per-team daily AI rate limit
// ============================================================================
//
// Enforces AI_TEAM_DAILY_LIMIT AI-backed curriculum requests per team per UTC
// day. Fires 429 with Retry-After when the cap is hit; sets X-Team-AI-Limit /
// X-Team-AI-Remaining response headers so the client can surface remaining
// quota in the UI.
//
// Requires req.teamId (mount AFTER `requireTeamContext`). No-op when
// req.teamId is absent — SUPER_ADMIN routes without team context skip
// this limiter entirely.
//
// Pairs with `aiLimiter` (per-user). Both gates fire independently:
// a request is only allowed when BOTH counters are under quota.
//
// Curriculum · Learn+Teach Phase 1 · W2.T1
// ============================================================================
import { checkTeam, incrementTeam } from "../services/ai.rateLimiter.team.js";
import { error as errorResponse } from "../utils/response.js";

export async function aiTeamLimiter(req, res, next) {
  const teamId = req.teamId;
  if (!teamId) {
    // SUPER_ADMIN / no-team routes bypass — pairs with the existing
    // per-user aiLimiter which also short-circuits when unauthed.
    return next();
  }

  const result = await checkTeam(teamId);

  // Surface team-level quota headers so the client UI can render "X/500
  // team requests used today" alongside the existing per-user X-AI-* headers.
  res.set("X-Team-AI-Limit", String(result.limit));
  res.set("X-Team-AI-Remaining", String(result.remaining));

  if (!result.allowed) {
    // 86400s = 24h. Retry-After is a coarse hint; the counter resets at
    // UTC midnight so the actual wait is typically shorter than that.
    res.set("Retry-After", "86400");
    return errorResponse(
      res,
      `Team AI rate limit reached (${result.limit} requests/day). Try again tomorrow.`,
      429,
      "TEAM_AI_RATE_LIMITED",
      { limit: result.limit, remaining: 0 },
    );
  }

  await incrementTeam(teamId);
  return next();
}

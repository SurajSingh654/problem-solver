// ============================================================================
// TEAM-LEVEL AI RATE LIMITER — Postgres backed via TeamAIUsage model
// ============================================================================
//
// Fires 429 when a team exceeds AI_TEAM_DAILY_LIMIT curriculum-scoped AI
// requests per UTC day. Fail-open on DB error so a blip doesn't cascade
// into an AI-surface outage.
//
// Pairs with ai.rateLimiter.postgres.js (per-user limiter) — both gates
// fire independently. Curriculum AI routes chain both middlewares; a
// request only proceeds when BOTH counters are under quota.
//
// Storage: TeamAIUsage (teamId, date [@db.Date], count). Atomic increment
// via Prisma upsert → Postgres ON CONFLICT DO UPDATE. Multi-replica safe
// from day one because the counter is a DB row, not a Map.
//
// Curriculum · Learn+Teach Phase 1 · W2.T1
// ============================================================================
import prisma from "../lib/prisma.js";
import { AI_TEAM_DAILY_LIMIT } from "../config/env.js";

/**
 * UTC-midnight Date for the current day. `TeamAIUsage.date` is stored as
 * `@db.Date` (Postgres DATE), so we zero the time component to guarantee
 * a stable key regardless of the caller's wall-clock time.
 */
function todayUtcDate() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Check whether the team is under the daily AI request cap.
 *
 * @param {string} teamId
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number}>}
 */
export async function checkTeam(teamId) {
  const date = todayUtcDate();
  try {
    const row = await prisma.teamAIUsage.findUnique({
      where: { teamId_date: { teamId, date } },
      select: { count: true },
    });
    const count = row?.count ?? 0;
    if (count >= AI_TEAM_DAILY_LIMIT) {
      return { allowed: false, remaining: 0, limit: AI_TEAM_DAILY_LIMIT };
    }
    return {
      allowed: true,
      remaining: AI_TEAM_DAILY_LIMIT - count,
      limit: AI_TEAM_DAILY_LIMIT,
    };
  } catch (err) {
    console.warn(
      `[rateLimiter:team] check DB error, failing open: ${err?.code || err?.message}`,
    );
    // Fail-open: DB blip must not cascade into an AI-surface outage.
    return {
      allowed: true,
      remaining: AI_TEAM_DAILY_LIMIT,
      limit: AI_TEAM_DAILY_LIMIT,
    };
  }
}

/**
 * Increment the team's counter for the current UTC day. Silently swallows
 * DB errors — a missed increment is a soft undercount, not a user-facing
 * failure. Real spend still lands in UsageTracking elsewhere.
 *
 * @param {string} teamId
 * @returns {Promise<void>}
 */
export async function incrementTeam(teamId) {
  const date = todayUtcDate();
  try {
    await prisma.teamAIUsage.upsert({
      where: { teamId_date: { teamId, date } },
      create: { teamId, date, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    console.warn(
      `[rateLimiter:team] increment DB error, telemetry loss: ${err?.code || err?.message}`,
    );
  }
}

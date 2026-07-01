// ============================================================================
// AI RATE LIMITER — Postgres backend (active when FEATURE_PERSIST_RATE_LIMITER="true")
// ============================================================================
//
// Stores the per-user daily AI usage counter in Postgres via the
// AiUsageDailyCounter model (composite PK: userId + day).
//
// Atomic increment via Prisma upsert → Postgres ON CONFLICT DO UPDATE:
//   INSERT INTO "ai_usage_daily_counter" (...) VALUES (...)
//   ON CONFLICT ("userId", "day") DO UPDATE
//   SET "count" = "ai_usage_daily_counter"."count" + 1, "updatedAt" = now()
//
// Fail-open on DB error: a Postgres blip must not cascade into an
// AI-surface outage. See spec for numeric burst bound at TOCTOU.
//
// Interface mirrors ai.rateLimiter.inMemory.js so both backends are
// drop-in interchangeable in the ai.service.js dispatcher.
// ============================================================================
import prisma from "../lib/prisma.js";
import { AI_DAILY_LIMIT } from "../config/env.js";

const RATE_LIMIT = AI_DAILY_LIMIT;

function todayUtc() {
  return new Date().toISOString().split("T")[0];
}

export async function check(userId) {
  const day = todayUtc();
  try {
    const row = await prisma.aiUsageDailyCounter.findUnique({
      where: { userId_day: { userId, day } },
      select: { count: true },
    });
    const count = row?.count ?? 0;
    if (count >= RATE_LIMIT) {
      return { allowed: false, remaining: 0, limit: RATE_LIMIT };
    }
    return { allowed: true, remaining: RATE_LIMIT - count, limit: RATE_LIMIT };
  } catch (err) {
    console.warn(
      `[rateLimiter:pg] check DB error, failing open: ${err?.code || err?.message}`,
    );
    // Fail-open: DB blip must not cascade into an AI-surface outage.
    return { allowed: true, remaining: RATE_LIMIT, limit: RATE_LIMIT };
  }
}

export async function increment(userId) {
  const day = todayUtc();
  try {
    await prisma.aiUsageDailyCounter.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    console.warn(
      `[rateLimiter:pg] increment DB error, telemetry loss: ${err?.code || err?.message}`,
    );
    // Fail-open silently — a missed increment is a soft undercount, not
    // a user-facing failure. Real spend still lands in UsageTracking.
  }
}

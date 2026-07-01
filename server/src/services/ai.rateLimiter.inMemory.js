// ============================================================================
// AI RATE LIMITER — in-memory backend (default; per process)
// ============================================================================
//
// Preserves the historical behavior of ai.service.js:69-97 as a standalone
// module. Selected by ai.service.js's dispatcher when FEATURE_PERSIST_RATE_LIMITER
// is not "true".
//
// Interface is async (returns Promise) so the postgres backend at
// ai.rateLimiter.postgres.js can drop in without changing call sites.
// The impl is sync-under-the-hood; the async signature is for interface
// parity only.
//
// TOCTOU: check-then-increment is not atomic. This is a soft cost cap
// (not a security boundary), so the race is accepted. See spec for
// numeric burst bound.
// ============================================================================
import { AI_DAILY_LIMIT } from "../config/env.js";

const rateLimitMap = new Map();
const RATE_LIMIT = AI_DAILY_LIMIT;

function todayUtc() {
  return new Date().toISOString().split("T")[0];
}

function getRateLimitKey(userId) {
  return `${userId}:${todayUtc()}`;
}

export async function check(userId) {
  const key = getRateLimitKey(userId);
  const count = rateLimitMap.get(key) || 0;
  if (count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, limit: RATE_LIMIT };
  }
  return { allowed: true, remaining: RATE_LIMIT - count, limit: RATE_LIMIT };
}

export async function increment(userId) {
  const key = getRateLimitKey(userId);
  const count = rateLimitMap.get(key) || 0;
  rateLimitMap.set(key, count + 1);
  // 1% GC of yesterday's keys — preserved from the original in-memory impl.
  if (Math.random() < 0.01) {
    const today = todayUtc();
    for (const [k] of rateLimitMap) {
      if (!k.endsWith(today)) rateLimitMap.delete(k);
    }
  }
}

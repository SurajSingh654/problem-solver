// ============================================================================
// PRISMA-BACKED STORE FOR express-rate-limit v8
// ============================================================================
//
// Persists per-IP rate-limit counters to Postgres so counts don't reset
// per process (fixes H5 middleware portion — enables multi-replica deploys
// without halving effective brute-force protection).
//
// Atomicity: window rollover + increment are one SQL statement via
// INSERT ... ON CONFLICT DO UPDATE + CASE WHEN. Postgres row lock
// serializes concurrent increments for the same key.
//
// Fail-open: every DB operation catches errors, logs a single-line warning,
// and returns a safe default. A DB blip must not cascade into a rate-limit
// outage across every rate-limited route (~every route via apiLimiter).
// ============================================================================
import prisma from "../lib/prisma.js";

export class PrismaRateLimitStore {
  constructor({ prefix }) {
    if (!prefix) {
      throw new Error("PrismaRateLimitStore requires a `prefix`");
    }
    this.prefix = prefix;
    this.windowMs = 60_000;   // overwritten by init()
    this.localKeys = false;   // shared store — required by express-rate-limit for correctness
  }

  init(options) {
    // Called once per limiter at construction time. Options include the
    // resolved windowMs, max, etc.
    this.windowMs = options.windowMs;
  }

  fullKey(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    const fullKey = this.fullKey(key);
    const nowMs = Date.now();
    const newResetAt = new Date(nowMs + this.windowMs);

    try {
      // Atomic single-statement: INSERT ON CONFLICT DO UPDATE with CASE WHEN
      // handles window rollover in the same operation. Postgres row lock
      // serializes concurrent hits for the same key.
      const rows = await prisma.$queryRaw`
        INSERT INTO "rate_limit_counter" ("key", "count", "resetAt", "updatedAt")
        VALUES (${fullKey}, 1, ${newResetAt}, NOW())
        ON CONFLICT ("key") DO UPDATE
        SET
          "count" = CASE
            WHEN "rate_limit_counter"."resetAt" < NOW()
            THEN 1
            ELSE "rate_limit_counter"."count" + 1
          END,
          "resetAt" = CASE
            WHEN "rate_limit_counter"."resetAt" < NOW()
            THEN ${newResetAt}
            ELSE "rate_limit_counter"."resetAt"
          END,
          "updatedAt" = NOW()
        RETURNING "count" AS "totalHits", "resetAt" AS "resetTime"
      `;
      const row = rows[0];
      return {
        totalHits: Number(row.totalHits),
        resetTime: new Date(row.resetTime),
      };
    } catch (err) {
      console.warn(
        `[rateLimitStore:${this.prefix}] increment DB error, failing open: ${err?.code || err?.message}`,
      );
      // Fail-open: return low totalHits so express-rate-limit lets the request through.
      return { totalHits: 1, resetTime: newResetAt };
    }
  }

  async decrement(key) {
    const fullKey = this.fullKey(key);
    try {
      // Best-effort decrement (invoked when skipSuccessful/FailedRequests is on).
      // Prevent negative counts with GREATEST.
      await prisma.$executeRaw`
        UPDATE "rate_limit_counter"
        SET "count" = GREATEST("count" - 1, 0), "updatedAt" = NOW()
        WHERE "key" = ${fullKey}
      `;
    } catch (err) {
      console.warn(
        `[rateLimitStore:${this.prefix}] decrement DB error: ${err?.code || err?.message}`,
      );
      // Fail-open silently.
    }
  }

  // NOTE (Security Manager fold-in): never expose via HTTP — internal
  // library use only. Exposing resetKey to an authenticated endpoint
  // would create a bypass vector (an attacker with admin access could
  // reset their own rate-limit counter). If a future feature needs an
  // admin-facing "unblock this IP" flow, wire it through a separate
  // gated admin endpoint that resets specific counters, not through
  // this Store method directly.
  async resetKey(key) {
    const fullKey = this.fullKey(key);
    try {
      await prisma.rateLimitCounter.deleteMany({ where: { key: fullKey } });
    } catch (err) {
      console.warn(
        `[rateLimitStore:${this.prefix}] resetKey DB error: ${err?.code || err?.message}`,
      );
    }
  }
}

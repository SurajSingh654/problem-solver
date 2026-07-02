// ============================================================================
// AI USAGE WRITER — persist every aiComplete/aiStream call to the DB
// ============================================================================
//
// Subscribes to the EventEmitter exposed by ai.service.js and writes a
// row into UsageTracking per call. Designed to be:
//
//   • Non-blocking: the writer NEVER awaits in the hot path. The
//     emission handler is fire-and-forget; the AI response returns to
//     the user regardless of write success.
//   • Failure-tolerant: a Prisma write failure logs once and silently
//     drops the row. Telemetry loss is acceptable; user-facing latency
//     regression is not.
//   • Cheap: one INSERT per AI call. At the existing scale (~100s of
//     AI calls/day) this is negligible. At 10K+ calls/day we'd switch
//     to batched buffered writes; not yet warranted.
//
// Started once at boot from src/index.js via mountUsageWriter(). Idempotent.
// ============================================================================
import prisma from "../lib/prisma.js";
import { onUsageEvent } from "./ai.service.js";

// 90 days — append-only telemetry useful for trend analysis but not
// needed indefinitely. Rows beyond this are pruned daily.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
// Once per 24h. setInterval is preferred over node-cron here because we
// already have a setInterval pattern in websocket.service.js heartbeat,
// and the precise time of day doesn't matter — pruning is idempotent.
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let mounted = false;

export function mountUsageWriter() {
    if (mounted) return;
    mounted = true;

    onUsageEvent((event) => {
        // Don't await — fire and forget. Errors caught by .catch.
        prisma.usageTracking
            .create({
                data: {
                    userId: event.userId || null,
                    teamId: event.teamId || null,
                    surface: event.surface || "unknown",
                    modelRequested: event.modelRequested || event.modelUsed || "unknown",
                    modelUsed: event.modelUsed || event.modelRequested || "unknown",
                    promptTokens: event.promptTokens ?? 0,
                    completionTokens: event.completionTokens ?? 0,
                    totalTokens: event.totalTokens ?? 0,
                    latencyMs: event.latencyMs ?? 0,
                    usedFallback: !!event.usedFallback,
                    cached: !!event.cached,
                    errorCode: event.errorCode || null,
                    streamCall: !!event.stream,
                },
            })
            .catch((err) => {
                // Single-line warning. Don't spam — if the DB is down the
                // request that triggered this is already failing or has
                // returned successfully; either way there's no recovery
                // action available here.
                console.warn(
                    `[ai.usageWriter] persist failed: ${err?.code || err?.message || err}`,
                );
            });
    });

    // Schedule the prune job. First fire happens 1 minute after boot so
    // restarts don't all hit the DB simultaneously, then every 24h.
    const prune = async () => {
        try {
            const cutoff = new Date(Date.now() - RETENTION_MS);
            const { count } = await prisma.usageTracking.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            if (count > 0) {
                console.log(
                    `[ai.usageWriter] pruned ${count} rows older than ${RETENTION_MS / 86_400_000}d`,
                );
            }
        } catch (err) {
            console.warn(
                `[ai.usageWriter] prune failed: ${err?.code || err?.message || err}`,
            );
        }

        // Also prune stale ai_usage_daily_counter rows (2-day floor).
        const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)
            .toISOString().split("T")[0];
        try {
            const { count: prunedCounters } = await prisma.aiUsageDailyCounter.deleteMany({
                where: { day: { lt: twoDaysAgo } },
            });
            if (prunedCounters > 0) {
                console.log(`[ai.usageWriter] pruned ${prunedCounters} rate-limit counters older than 2d`);
            }
        } catch (err) {
            console.warn(`[ai.usageWriter] counter prune failed: ${err?.code || err?.message}`);
        }

        // Also prune stale RateLimitCounter rows (1-hour floor past resetAt).
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const { count: prunedLimiters } = await prisma.rateLimitCounter.deleteMany({
                where: { resetAt: { lt: oneHourAgo } },
            });
            if (prunedLimiters > 0) {
                console.log(
                    `[ai.usageWriter] pruned ${prunedLimiters} rate-limit counters older than 1h past reset`,
                );
            }
        } catch (err) {
            console.warn(
                `[ai.usageWriter] rate-limit prune failed: ${err?.code || err?.message}`,
            );
        }
    };
    setTimeout(prune, 60_000);
    const interval = setInterval(prune, PRUNE_INTERVAL_MS);
    // Don't keep the process alive solely for this interval — if the
    // server is shutting down, abandon the cron silently.
    if (interval.unref) interval.unref();
}

// ============================================================================
// MCP rate limiting — per-user + per-IP backstop
// ============================================================================
//
// Two windowed counters:
//   - per-user: 60 requests / minute per JWT subject (req.user.id)
//   - per-IP: 600 requests / minute per source IP (cred-stuffing/spray defense)
//
// Both are in-memory token-bucket equivalents (windowed counter with sliding
// 60s key). At >1 replica these counters are per-process — the per-IP cap
// becomes 600 × replicas. Tracked under `persist-ai-rate-limiter` roadmap
// item; until then, deploy at single replica.
//
// On limit exceeded: 429 with Retry-After header. Client should back off.
// We DO NOT include the bucket name in the response (defense against
// probing — don't tell them whether they hit the user or IP cap).
//
// Both buckets MUST pass before the handler runs. Order: cheap (IP) first,
// expensive (user, requires auth context) second — but in practice mcpAuth
// runs before rate-limit, so req.user is set when this runs.
// ============================================================================

const WINDOW_MS = 60 * 1000;
const PER_USER_LIMIT = 60;
const PER_IP_LIMIT = 600;

// Map<key, { count: number, windowStart: number }>
const userBuckets = new Map();
const ipBuckets = new Map();

function checkBucket(map, key, limit) {
  const now = Date.now();
  let entry = map.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    map.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000),
    );
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true, retryAfterSec: 0 };
}

// Periodic cleanup so buckets don't grow forever. Run every 5 minutes.
// Removes expired entries (windowStart older than 2× WINDOW_MS).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
function cleanup() {
  const cutoff = Date.now() - 2 * WINDOW_MS;
  for (const [k, v] of userBuckets) {
    if (v.windowStart < cutoff) userBuckets.delete(k);
  }
  for (const [k, v] of ipBuckets) {
    if (v.windowStart < cutoff) ipBuckets.delete(k);
  }
}
const cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
// Don't keep the process alive just for the cleanup timer.
if (cleanupTimer.unref) cleanupTimer.unref();

/**
 * Best-effort client-IP extractor. Trusts the X-Forwarded-For LEFTMOST
 * value when behind Railway's proxy (which is the standard convention).
 * Falls back to req.ip / connection.remoteAddress.
 */
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || "unknown";
}

/**
 * Rate-limit middleware. Run AFTER mcpAuth so req.user is populated.
 * Both buckets must pass.
 */
export function mcpRateLimit(req, res, next) {
  const ip = clientIp(req);
  const ipResult = checkBucket(ipBuckets, ip, PER_IP_LIMIT);
  if (!ipResult.allowed) {
    res.set("Retry-After", String(ipResult.retryAfterSec));
    return res.status(429).json({
      error: "Rate limit exceeded",
      code: "MCP_RATE_LIMITED",
    });
  }

  const userId = req.user?.id;
  if (userId) {
    const userResult = checkBucket(userBuckets, userId, PER_USER_LIMIT);
    if (!userResult.allowed) {
      res.set("Retry-After", String(userResult.retryAfterSec));
      return res.status(429).json({
        error: "Rate limit exceeded",
        code: "MCP_RATE_LIMITED",
      });
    }
  }

  return next();
}

// Exported for tests.
export const _internals = {
  userBuckets,
  ipBuckets,
  WINDOW_MS,
  PER_USER_LIMIT,
  PER_IP_LIMIT,
  resetForTests() {
    userBuckets.clear();
    ipBuckets.clear();
  },
};

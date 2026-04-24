// ============================================================================
// ProbSolver v3.0 — Rate Limiting
// ============================================================================
import rateLimit from "express-rate-limit";

// ── Helper: create rate limit response with request ID ───
function rateLimitResponse(message, code) {
  return (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        message,
        code,
        requestId: req.requestId,
      },
    });
  };
}

// General API rate limit — 100 requests per 15 minutes per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse(
    "Too many requests. Please try again in a few minutes.",
    "RATE_LIMITED",
  ),
});

// Auth rate limit — stricter for login/register (10 per 15 min)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse(
    "Too many authentication attempts. Please try again later.",
    "AUTH_RATE_LIMITED",
  ),
});

// AI rate limit — expensive operations (20 per 15 min)
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse(
    "AI rate limit reached. Please wait before making more AI requests.",
    "AI_RATE_LIMITED",
  ),
});

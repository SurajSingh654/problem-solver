// ============================================================================
// ProbSolver v3.0 — Rate Limiting
// ============================================================================
import rateLimit from "express-rate-limit";

// General API rate limit — 100 requests per 15 minutes per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please try again in a few minutes.",
    code: "RATE_LIMITED",
  },
});

// Auth rate limit — stricter for login/register (10 per 15 min)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many authentication attempts. Please try again later.",
    code: "AUTH_RATE_LIMITED",
  },
});

// AI rate limit — expensive operations (20 per 15 min)
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "AI rate limit reached. Please wait before making more AI requests.",
    code: "AI_RATE_LIMITED",
  },
});

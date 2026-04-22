/**
 * AI MIDDLEWARE
 * Checks if AI is enabled and handles rate limiting.
 * Use before any AI endpoint.
 */
import { isAIEnabled, checkRateLimit } from "../services/ai.service.js";
import { error as errorResponse } from "../utils/response.js";

export function requireAI(req, res, next) {
  if (!isAIEnabled()) {
    return errorResponse(
      res,
      "AI features are not enabled. Set AI_ENABLED=true and OPENAI_API_KEY in environment variables.",
      503,
      "AI_DISABLED",
    );
  }
  next();
}

export function aiRateLimit(req, res, next) {
  const userId = req.user?.id;
  if (!userId) {
    return errorResponse(res, "Authentication required", 401);
  }

  const check = checkRateLimit(userId);

  // Set rate limit headers
  res.set("X-AI-Limit", String(check.limit));
  res.set("X-AI-Remaining", String(check.remaining));

  if (!check.allowed) {
    return errorResponse(
      res,
      `Daily AI limit reached (${check.limit} requests/day). Try again tomorrow.`,
      429,
      "AI_RATE_LIMITED",
    );
  }

  next();
}

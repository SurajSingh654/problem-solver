// Shared HTTP error envelope for AI controllers.
// Maps AIError codes (rate limit, OpenAI down, parse fail, …) to the
// project-standard error response format.
//
// Single source of truth — replaces the 2 inline copies that existed in
// ai.controller.js and aiWeeklyPlan.controller.js after Sprint 2 Task 8.

import { AIError } from "../services/ai.service.js";
import { error } from "./response.js";

export function aiErrorResponse(res, err, defaultMessage) {
  if (err instanceof AIError) {
    if (err.code === "RATE_LIMITED") {
      return error(res, err.message, 429, err.code);
    }
    if (err.code === "OPENAI_RATE_LIMITED") {
      return error(
        res,
        "AI is temporarily rate-limited. Please retry shortly.",
        503,
        err.code,
      );
    }
    if (err.code === "OPENAI_DOWN" || err.code === "OPENAI_TIMEOUT") {
      return error(res, "AI is temporarily unavailable.", 503, err.code);
    }
    if (err.code === "INVALID_API_KEY") {
      return error(res, "AI is not configured correctly.", 500, err.code);
    }
    if (err.code === "PARSE_ERROR") {
      return error(res, defaultMessage, 500, err.code);
    }
  }
  console.error(`AI controller error: ${err?.message || err}`);
  return error(res, defaultMessage, 500);
}

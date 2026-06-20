import { describe, it, expect } from "vitest";
import { classifyAIError, FALLBACK_REASONS } from "../../src/services/aiSurface.js";

// AIError codes that ai.service.js actually throws (verified against source):
//
//   Thrown directly by aiComplete / aiStream:
//     "RATE_LIMITED"        — per-user-per-day cap (checkRateLimit)
//     "EMPTY_RESPONSE"      — AI returned empty content
//     "PARSE_ERROR"         — jsonMode response wasn't valid JSON
//
//   Produced by mapErrorToCode(err) then wrapped in AIError:
//     "OPENAI_RATE_LIMITED" — HTTP 429 from OpenAI
//     "INVALID_API_KEY"     — HTTP 401
//     "OPENAI_DOWN"         — HTTP 500 / 502 / 503 / 504
//     "OPENAI_TIMEOUT"      — HTTP 408
//     "AI_ERROR"            — catch-all fallback from mapErrorToCode
//
//   Note: "model_not_found" and "model_not_available" are detected by
//   callWithModelFallback to trigger a model swap, but if the swap
//   fails the re-thrown raw OpenAI error goes through mapErrorToCode
//   which returns "AI_ERROR" (404 is not in its status list). So
//   "model_not_found" does NOT appear as an AIError.code in production.

describe("classifyAIError — against real ai.service.js error codes", () => {
  it("maps OPENAI_TIMEOUT to TIMEOUT", () => {
    expect(classifyAIError({ code: "OPENAI_TIMEOUT" })).toBe(FALLBACK_REASONS.TIMEOUT);
  });

  it("maps RATE_LIMITED (per-user-per-day cap) to RATE_LIMIT", () => {
    expect(classifyAIError({ code: "RATE_LIMITED" })).toBe(FALLBACK_REASONS.RATE_LIMIT);
  });

  it("maps OPENAI_RATE_LIMITED (HTTP 429 from OpenAI) to RATE_LIMIT", () => {
    expect(classifyAIError({ code: "OPENAI_RATE_LIMITED" })).toBe(FALLBACK_REASONS.RATE_LIMIT);
  });

  it("maps INVALID_API_KEY to UNKNOWN (not a user-actionable surface event)", () => {
    expect(classifyAIError({ code: "INVALID_API_KEY" })).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  it("maps OPENAI_DOWN to UNKNOWN", () => {
    expect(classifyAIError({ code: "OPENAI_DOWN" })).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  it("maps EMPTY_RESPONSE to UNKNOWN", () => {
    expect(classifyAIError({ code: "EMPTY_RESPONSE" })).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  it("maps PARSE_ERROR to UNKNOWN", () => {
    expect(classifyAIError({ code: "PARSE_ERROR" })).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  it("maps AI_ERROR (generic catch-all) to UNKNOWN", () => {
    expect(classifyAIError({ code: "AI_ERROR" })).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  // model_not_found does NOT reach classifyAIError as a real AIError code (see
  // comment above), but it remains handled for parity / defence in depth.
  it("maps model_not_found to MODEL_NOT_FOUND", () => {
    expect(classifyAIError({ code: "model_not_found" })).toBe(FALLBACK_REASONS.MODEL_NOT_FOUND);
  });

  it("maps model_not_available to MODEL_NOT_FOUND", () => {
    expect(classifyAIError({ code: "model_not_available" })).toBe(FALLBACK_REASONS.MODEL_NOT_FOUND);
  });

  it("maps unknown shapes to UNKNOWN", () => {
    expect(classifyAIError({ message: "something else" })).toBe(FALLBACK_REASONS.UNKNOWN);
    expect(classifyAIError(null)).toBe(FALLBACK_REASONS.UNKNOWN);
    expect(classifyAIError(undefined)).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  // Legacy incorrect codes that the old implementation matched but ai.service.js
  // never actually produces — kept here to document they now map to UNKNOWN.
  it("maps legacy TIMEOUT code (never produced by ai.service.js) to UNKNOWN", () => {
    expect(classifyAIError({ code: "TIMEOUT" })).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  it("maps legacy ETIMEDOUT (never produced by ai.service.js) to UNKNOWN", () => {
    expect(classifyAIError({ code: "ETIMEDOUT" })).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  it("maps legacy numeric status=429 (never produced by AIError) to UNKNOWN", () => {
    expect(classifyAIError({ status: 429 })).toBe(FALLBACK_REASONS.UNKNOWN);
  });
});

import { describe, it, expect } from "vitest";
import { classifyAIError, FALLBACK_REASONS } from "../../src/services/aiSurface.js";

describe("classifyAIError", () => {
  it("maps TIMEOUT code to TIMEOUT reason", () => {
    expect(classifyAIError({ code: "TIMEOUT" })).toBe(FALLBACK_REASONS.TIMEOUT);
  });

  it("maps ETIMEDOUT to TIMEOUT", () => {
    expect(classifyAIError({ code: "ETIMEDOUT" })).toBe(FALLBACK_REASONS.TIMEOUT);
  });

  it("maps HTTP 429 to RATE_LIMIT (via code)", () => {
    expect(classifyAIError({ code: 429 })).toBe(FALLBACK_REASONS.RATE_LIMIT);
  });

  it("maps HTTP 429 to RATE_LIMIT (via status)", () => {
    expect(classifyAIError({ status: 429 })).toBe(FALLBACK_REASONS.RATE_LIMIT);
  });

  it("maps model_not_found to MODEL_NOT_FOUND", () => {
    expect(classifyAIError({ code: "model_not_found" })).toBe(FALLBACK_REASONS.MODEL_NOT_FOUND);
  });

  it("maps unknown shapes to UNKNOWN", () => {
    expect(classifyAIError({ message: "something else" })).toBe(FALLBACK_REASONS.UNKNOWN);
    expect(classifyAIError(null)).toBe(FALLBACK_REASONS.UNKNOWN);
    expect(classifyAIError(undefined)).toBe(FALLBACK_REASONS.UNKNOWN);
  });
});

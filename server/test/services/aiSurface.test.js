import { describe, it, expect, beforeEach, vi } from "vitest";

let aiCompleteMock;
let aiEnabledMock;

vi.mock("../../src/services/ai.service.js", () => ({
  aiComplete: (...args) => aiCompleteMock(...args),
  isAIEnabled: () => aiEnabledMock(),
}));

const { runAISurface, FALLBACK_REASONS } = await import("../../src/services/aiSurface.js");

const validatorOk = (data) => ({ valid: true, data });
const validatorReject = () => ({ valid: false, violations: ["bad"] });
const fallback = (reason) => ({ fallbackFor: reason });
const promptOk = () => ({ system: "S", user: "U" });

beforeEach(() => {
  aiEnabledMock = () => true;
  aiCompleteMock = vi.fn(async () => ({ ok: true }));
});

describe("runAISurface — happy path", () => {
  it("calls aiComplete and returns validated data", async () => {
    const result = await runAISurface({
      surface: "test",
      promptVersion: "v1",
      buildPrompt: promptOk,
      validate: validatorOk,
      buildFallback: fallback,
      aiOptions: { model: "gpt-4o-mini", temperature: 0.2, maxTokens: 100, jsonMode: true, userId: "u", teamId: "t" },
    });
    expect(result.fromFallback).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.data).toEqual({ ok: true });
    expect(aiCompleteMock).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: "S",
      userPrompt: "U",
      surface: "test",
    }));
  });

  it("applies transform after validate", async () => {
    const result = await runAISurface({
      surface: "test",
      promptVersion: "v1",
      buildPrompt: promptOk,
      validate: validatorOk,
      buildFallback: fallback,
      transform: (d) => ({ ...d, transformed: true }),
      aiOptions: {},
    });
    expect(result.data).toEqual({ ok: true, transformed: true });
  });
});

describe("runAISurface — fallback paths", () => {
  it("returns AI_DISABLED fallback when isAIEnabled() is false", async () => {
    aiEnabledMock = () => false;
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.AI_DISABLED);
    expect(result.data).toEqual({ fallbackFor: "AI_DISABLED" });
  });

  it("returns TIMEOUT fallback when aiComplete throws TIMEOUT", async () => {
    aiCompleteMock = vi.fn(async () => {
      const e = new Error("timed out"); e.code = "TIMEOUT"; throw e;
    });
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.TIMEOUT);
  });

  it("returns RATE_LIMIT fallback on 429", async () => {
    aiCompleteMock = vi.fn(async () => { const e = new Error("rate"); e.status = 429; throw e; });
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.reason).toBe(FALLBACK_REASONS.RATE_LIMIT);
  });

  it("returns VALIDATION fallback when validator rejects", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorReject, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.VALIDATION);
    expect(result.data).toEqual({ fallbackFor: "VALIDATION" });
  });

  it("returns UNKNOWN fallback for unmapped errors", async () => {
    aiCompleteMock = vi.fn(async () => { throw new Error("mystery"); });
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.reason).toBe(FALLBACK_REASONS.UNKNOWN);
  });
});

describe("runAISurface — cache short-circuit", () => {
  it("returns cached value without calling aiComplete when cacheLookup hits", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      cacheKey: "abc",
      cacheLookup: async (k) => k === "abc" ? { cached: true } : null,
      aiOptions: {},
    });
    expect(result.fromCache).toBe(true);
    expect(result.data).toEqual({ cached: true });
    expect(aiCompleteMock).not.toHaveBeenCalled();
  });

  it("falls through to AI when cacheLookup returns null", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      cacheKey: "abc",
      cacheLookup: async () => null,
      aiOptions: {},
    });
    expect(result.fromCache).toBe(false);
    expect(aiCompleteMock).toHaveBeenCalled();
  });
});

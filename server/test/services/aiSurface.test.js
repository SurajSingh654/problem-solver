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

  it("returns TIMEOUT fallback when aiComplete throws OPENAI_TIMEOUT (real AIError code)", async () => {
    aiCompleteMock = vi.fn(async () => {
      const e = new Error("timed out"); e.code = "OPENAI_TIMEOUT"; throw e;
    });
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.TIMEOUT);
  });

  it("returns RATE_LIMIT fallback when aiComplete throws RATE_LIMITED (per-user cap)", async () => {
    aiCompleteMock = vi.fn(async () => { const e = new Error("rate"); e.code = "RATE_LIMITED"; throw e; });
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

describe("runAISurface — defensive shapes and edge cases", () => {
  it("does not crash when aiOptions is undefined (defaults to {})", async () => {
    aiCompleteMock = vi.fn(async () => ({ ok: true }));
    const result = await runAISurface({
      surface: "test",
      promptVersion: "v1",
      buildPrompt: promptOk,
      validate: validatorOk,
      buildFallback: fallback,
    });
    expect(result.fromFallback).toBe(false);
    expect(result.data).toEqual({ ok: true });
  });

  it("returns violations in the result when validator rejects", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorReject, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.violations).toEqual(["bad"]);
  });

  it("does not include violations on non-VALIDATION fallback paths", async () => {
    aiEnabledMock = () => false;
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.violations).toBeUndefined();
  });

  it("does not call buildPrompt or buildFallback on cache hit", async () => {
    const buildPromptSpy = vi.fn(promptOk);
    const buildFallbackSpy = vi.fn(fallback);
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: buildPromptSpy,
      validate: validatorOk,
      buildFallback: buildFallbackSpy,
      cacheKey: "abc",
      cacheLookup: async () => ({ cached: true }),
      aiOptions: {},
    });
    expect(buildPromptSpy).not.toHaveBeenCalled();
    expect(buildFallbackSpy).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
  });

  it("treats 0 as a valid cache hit (not falsy miss)", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      cacheKey: "abc",
      cacheLookup: async () => 0,
      aiOptions: {},
    });
    expect(result.fromCache).toBe(true);
    expect(result.data).toBe(0);
  });

  it("treats empty string as a valid cache hit (not falsy miss)", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      cacheKey: "abc",
      cacheLookup: async () => "",
      aiOptions: {},
    });
    expect(result.fromCache).toBe(true);
    expect(result.data).toBe("");
  });

  it("falls through when cacheKey provided but cacheLookup is missing (no crash)", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      cacheKey: "abc",
      aiOptions: {},
    });
    expect(result.fromCache).toBe(false);
    expect(aiCompleteMock).toHaveBeenCalled();
  });

  it("propagates buildPrompt errors as UNKNOWN fallback (no uncaught throw)", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: () => { throw new Error("prompt builder broke"); },
      validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  it("propagates validate throws as VALIDATION fallback (no uncaught throw)", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk,
      validate: () => { throw new Error("validator broke"); },
      buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.VALIDATION);
  });

  it("propagates transform errors as UNKNOWN fallback (no uncaught throw)", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      transform: () => { throw new Error("transform broke"); },
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(true);
    expect(result.reason).toBe(FALLBACK_REASONS.UNKNOWN);
  });

  it("supports async buildPrompt", async () => {
    const result = await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: async () => ({ system: "S", user: "U" }),
      validate: validatorOk, buildFallback: fallback,
      aiOptions: {},
    });
    expect(result.fromFallback).toBe(false);
  });
});

describe("runAISurface — log shape", () => {
  it("emits a [ai-surface] entry with required fields on every call", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorOk, buildFallback: fallback,
      aiOptions: { model: "gpt-4o-mini", userId: "u1", teamId: "t1" },
      requestId: "req-abc",
    });
    expect(logSpy).toHaveBeenCalled();
    const call = logSpy.mock.calls[logSpy.mock.calls.length - 1];
    expect(call[0]).toBe("[ai-surface]");
    const entry = JSON.parse(call[1]);
    expect(entry.surface).toBe("test");
    expect(entry.promptVersion).toBe("v1");
    expect(typeof entry.latencyMs).toBe("number");
    expect(entry.fromFallback).toBe(false);
    expect(entry.model).toBe("gpt-4o-mini");
    expect(entry.userId).toBe("u1");
    expect(entry.teamId).toBe("t1");
    expect(entry.requestId).toBe("req-abc");
    logSpy.mockRestore();
  });

  it("includes violations in the log entry when reason is VALIDATION", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runAISurface({
      surface: "test", promptVersion: "v1",
      buildPrompt: promptOk, validate: validatorReject, buildFallback: fallback,
      aiOptions: {},
    });
    const call = logSpy.mock.calls[logSpy.mock.calls.length - 1];
    const entry = JSON.parse(call[1]);
    expect(entry.violations).toEqual(["bad"]);
    logSpy.mockRestore();
  });
});

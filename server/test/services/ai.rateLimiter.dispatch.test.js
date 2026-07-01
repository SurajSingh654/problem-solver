// ============================================================================
// T176a/b/c — ai.service.js rate-limiter flag dispatch tests
// ============================================================================
//
// Verifies that ai.service.js routes checkRateLimit() calls to the correct
// backend based on the FEATURE_PERSIST_RATE_LIMITER env flag.
//
// SKIPPED until Task 4 wires the dispatcher into ai.service.js.
// Remove the .skip annotation from the describe block when Task 4 lands.
//
// Sprint 7 H5 — persist-ai-rate-limiter
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

const inMemMock = vi.hoisted(() => ({
  check: vi.fn().mockResolvedValue({ allowed: true, remaining: 50, limit: 50 }),
  increment: vi.fn().mockResolvedValue(undefined),
}));
const pgMock = vi.hoisted(() => ({
  check: vi.fn().mockResolvedValue({ allowed: true, remaining: 50, limit: 50 }),
  increment: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/services/ai.rateLimiter.inMemory.js", () => inMemMock);
vi.mock("../../src/services/ai.rateLimiter.postgres.js", () => pgMock);

// Vary the flag via env mock per-test using `vi.doMock` + re-import pattern.
// describe.skip: removed in Task 4 when the flag-dispatch wrapper lands in ai.service.js.
describe.skip("ai.service — rate-limiter flag dispatch (unskipped after Task 4 dispatcher lands)", () => {
  beforeEach(() => {
    vi.resetModules();
    inMemMock.check.mockClear();
    pgMock.check.mockClear();
  });

  it("test 176a: flag OFF (default) routes to in-memory backend", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_RATE_LIMITER: "false" };
    });
    const { checkRateLimit } = await import("../../src/services/ai.service.js");
    await checkRateLimit("user_1");
    expect(inMemMock.check).toHaveBeenCalledTimes(1);
    expect(pgMock.check).not.toHaveBeenCalled();
  });

  it("test 176b: flag ON routes to postgres backend", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_RATE_LIMITER: "true" };
    });
    const { checkRateLimit } = await import("../../src/services/ai.service.js");
    await checkRateLimit("user_1");
    expect(pgMock.check).toHaveBeenCalledTimes(1);
    expect(inMemMock.check).not.toHaveBeenCalled();
  });

  it("test 176c: flag with mixed case still routes to postgres (robustness)", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_RATE_LIMITER: "TRUE" };
    });
    const { checkRateLimit } = await import("../../src/services/ai.service.js");
    await checkRateLimit("user_1");
    // With the .toLowerCase() robustness in the wrapper, "TRUE" → "true" → pg.
    expect(pgMock.check).toHaveBeenCalledTimes(1);
    expect(inMemMock.check).not.toHaveBeenCalled();
  });
});

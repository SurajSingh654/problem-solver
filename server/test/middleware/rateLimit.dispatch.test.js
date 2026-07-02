// SKIPPED until Task 3 wires storeFor() in rateLimit.middleware.js
import { describe, it, expect, beforeEach, vi } from "vitest";

describe.skip("rateLimit.middleware — flag dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("test 188a: flag OFF (default) → all 4 limiters use MemoryStore (store: undefined)", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_MIDDLEWARE_LIMITER: "false" };
    });
    // Re-import to pick up the mocked flag. Assert on the resolved limiters —
    // they should have `store: undefined` (or omitted; express-rate-limit uses
    // MemoryStore in that case). We inspect the module's internal `storeFor`
    // export to verify.
    const module = await import("../../src/middleware/rateLimit.middleware.js");
    // If storeFor is exported, use it:
    // Hard guard (LE + BA fold-in): without this, if storeFor is not exported
    // the conditional-skip made T188 silently pass — flag dispatch untested.
    expect(typeof module.storeFor).toBe("function");
    expect(module.storeFor("auth")).toBeUndefined();
  });

  it("test 188b: flag ON (\"true\") → storeFor returns PrismaRateLimitStore instance", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_MIDDLEWARE_LIMITER: "true" };
    });
    const module = await import("../../src/middleware/rateLimit.middleware.js");
    const { PrismaRateLimitStore } = await import(
      "../../src/middleware/rateLimit.prismaStore.js"
    );
    expect(typeof module.storeFor).toBe("function");
    expect(module.storeFor("auth")).toBeInstanceOf(PrismaRateLimitStore);
  });

  it("test 188c: flag with mixed case (\"TRUE\") → activates pg store (robustness)", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_MIDDLEWARE_LIMITER: "TRUE" };
    });
    const module = await import("../../src/middleware/rateLimit.middleware.js");
    const { PrismaRateLimitStore } = await import(
      "../../src/middleware/rateLimit.prismaStore.js"
    );
    expect(typeof module.storeFor).toBe("function");
    expect(module.storeFor("auth")).toBeInstanceOf(PrismaRateLimitStore);
  });
});

// ── Imports + hoisted prisma mock ──
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  rateLimitCounter: {
    deleteMany: vi.fn(),
  },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const { PrismaRateLimitStore } = await import(
  "../../src/middleware/rateLimit.prismaStore.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$queryRaw.mockReset();
  prismaMock.$executeRaw.mockReset();
  prismaMock.rateLimitCounter.deleteMany.mockReset();
});

describe("PrismaRateLimitStore", () => {
  it("test 178: constructor requires prefix", () => {
    expect(() => new PrismaRateLimitStore({})).toThrow(/requires.*prefix/i);
  });

  it("test 179: localKeys is false", () => {
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    expect(store.localKeys).toBe(false);
  });

  it("test 180: init sets windowMs", () => {
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    store.init({ windowMs: 15 * 60 * 1000 });
    expect(store.windowMs).toBe(15 * 60 * 1000);
  });

  it("test 181: increment first hit returns coerced shape + SQL contract", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { totalHits: 1n, resetTime: new Date("2026-07-02T12:15:00Z") },
    ]);
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    store.init({ windowMs: 15 * 60 * 1000 });
    const result = await store.increment("1.2.3.4");
    expect(result.totalHits).toBe(1);           // BigInt coerced to Number
    expect(result.resetTime).toBeInstanceOf(Date);
    expect(result.resetTime.getTime()).toBe(new Date("2026-07-02T12:15:00Z").getTime());

    // SQL contract — atomicity regression guard. If a future refactor mutates
    // the CASE WHEN branch or drops ON CONFLICT, this test catches it.
    const call = prismaMock.$queryRaw.mock.calls[0];
    const sql = call[0].join("").replace(/\s+/g, " ");  // strings array + whitespace-tolerant
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO UPDATE/i);
    expect(sql).toMatch(/CASE WHEN "rate_limit_counter"\."resetAt" < NOW\(\)/i);
    // Both CASE arms must set count and resetAt consistently
    expect(sql).toMatch(/THEN 1 ELSE "rate_limit_counter"\."count" \+ 1 END/i);
    expect(sql).toMatch(/RETURNING "count" AS "totalHits", "resetAt" AS "resetTime"/i);
  });

  it("test 182: increment applies prefix to key", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ totalHits: 1n, resetTime: new Date() }]);
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    store.init({ windowMs: 900_000 });
    await store.increment("1.2.3.4");
    // $queryRaw tagged-template's params array contains the fullKey.
    const call = prismaMock.$queryRaw.mock.calls[0];
    const paramsPassed = call.slice(1); // first arg is the strings array
    expect(paramsPassed).toContain("auth:1.2.3.4");
  });

  it("test 183: increment DB error fails open with warning", async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    const windowMs = 900_000;
    store.init({ windowMs });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const beforeMs = Date.now();
      const result = await store.increment("1.2.3.4");
      const afterMs = Date.now();
      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
      // Range check: fallback resetTime must be ~now + windowMs, NOT epoch or stale.
      // A regression returning new Date(0) or missing the +windowMs offset fails here.
      expect(result.resetTime.getTime()).toBeGreaterThanOrEqual(beforeMs + windowMs - 1000);
      expect(result.resetTime.getTime()).toBeLessThanOrEqual(afterMs + windowMs + 1000);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/rateLimitStore:auth.*failing open/));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("test 184: decrement uses GREATEST guard against negative", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(1);
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    store.init({ windowMs: 900_000 });
    await store.decrement("1.2.3.4");
    const call = prismaMock.$executeRaw.mock.calls[0];
    const params = call.slice(1);
    expect(params).toContain("auth:1.2.3.4");
    // Inspect the SQL string portion for the GREATEST guard
    const sqlStrings = call[0].join("");
    expect(sqlStrings).toMatch(/GREATEST\("count"\s*-\s*1,\s*0\)/);
  });

  it("test 185: decrement DB error silent no-op with warning", async () => {
    prismaMock.$executeRaw.mockRejectedValueOnce(new Error("connection lost"));
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    store.init({ windowMs: 900_000 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(store.decrement("1.2.3.4")).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("test 186: resetKey deletes by fullKey", async () => {
    prismaMock.rateLimitCounter.deleteMany.mockResolvedValueOnce({ count: 1 });
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    store.init({ windowMs: 900_000 });
    await store.resetKey("1.2.3.4");
    expect(prismaMock.rateLimitCounter.deleteMany).toHaveBeenCalledWith({
      where: { key: "auth:1.2.3.4" },
    });
  });

  it("test 187: resetKey DB error silent no-op with warning", async () => {
    prismaMock.rateLimitCounter.deleteMany.mockRejectedValueOnce(new Error("timeout"));
    const store = new PrismaRateLimitStore({ prefix: "auth" });
    store.init({ windowMs: 900_000 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(store.resetKey("1.2.3.4")).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

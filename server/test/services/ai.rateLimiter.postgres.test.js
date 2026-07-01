// ============================================================================
// T168-T175, T177 — ai.rateLimiter.postgres.js unit tests
// ============================================================================
//
// Tests the Postgres-backed AI rate-limiter backend in isolation via a hoisted
// Prisma mock. Does NOT spin up Express or hit a real DB.
//
// Sprint 7 H5 — persist-ai-rate-limiter
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  aiUsageDailyCounter: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// Force LIMIT to a small predictable number for these tests.
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_DAILY_LIMIT: 3 };
});

const { check, increment } = await import(
  "../../src/services/ai.rateLimiter.postgres.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.aiUsageDailyCounter.findUnique.mockReset();
  prismaMock.aiUsageDailyCounter.upsert.mockReset();
});

describe("ai.rateLimiter.postgres", () => {
  // T168 — no row exists → allowed with full remaining
  it("T168: check — no row exists → allowed with full remaining", async () => {
    prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce(null);
    const r = await check("user_1");
    expect(r).toEqual({ allowed: true, remaining: 3, limit: 3 });
    const arg = prismaMock.aiUsageDailyCounter.findUnique.mock.calls[0][0];
    expect(arg.where.userId_day.userId).toBe("user_1");
    expect(arg.where.userId_day.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // T169 — count below LIMIT → allowed with computed remaining
  it("T169: check — count below LIMIT → allowed with computed remaining", async () => {
    prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce({ count: 1 });
    const r = await check("user_1");
    expect(r).toEqual({ allowed: true, remaining: 2, limit: 3 });
  });

  // T170 — count at LIMIT → denied (CORRECTNESS-CRITICAL)
  it("T170: check — count at LIMIT → denied", async () => {
    prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce({ count: 3 });
    const r = await check("user_1");
    expect(r).toEqual({ allowed: false, remaining: 0, limit: 3 });
  });

  // T171 — check DB error → fails open (SECURITY-CRITICAL)
  it("T171: check — DB error → fails open with warning logged", async () => {
    prismaMock.aiUsageDailyCounter.findUnique.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await check("user_1");
      expect(r).toEqual({ allowed: true, remaining: 3, limit: 3 });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  // T172 — increment first call — upsert with create populated
  it("T172: increment — first call — upsert with correct create payload", async () => {
    prismaMock.aiUsageDailyCounter.upsert.mockResolvedValueOnce({ count: 1 });
    await increment("user_1");
    const arg = prismaMock.aiUsageDailyCounter.upsert.mock.calls[0][0];
    expect(arg.where.userId_day.userId).toBe("user_1");
    expect(arg.create).toEqual({ userId: "user_1", day: expect.any(String), count: 1 });
    expect(arg.update).toEqual({ count: { increment: 1 } });
  });

  // T173 — increment subsequent — the update branch fires atomically
  it("T173: increment — subsequent call — atomic increment expression asserted", async () => {
    prismaMock.aiUsageDailyCounter.upsert.mockResolvedValueOnce({ count: 2 });
    await increment("user_1");
    expect(prismaMock.aiUsageDailyCounter.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.aiUsageDailyCounter.upsert.mock.calls[0][0];
    // The increment expression is what makes the atomic path work — assert it.
    expect(arg.update.count).toEqual({ increment: 1 });
  });

  // T174 — increment DB error → fails open silently (SECURITY-CRITICAL)
  it("T174: increment — DB error → fails open silently with warning logged", async () => {
    prismaMock.aiUsageDailyCounter.upsert.mockRejectedValueOnce(
      new Error("connection lost"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(increment("user_1")).resolves.toBeUndefined(); // no throw
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  // T175 — day rollover — where clause uses fresh day string after UTC midnight
  it("T175: day rollover — where clause uses fresh day string after UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T23:59:59Z"));
    prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce({ count: 2 });
    await check("user_1");
    const arg1 = prismaMock.aiUsageDailyCounter.findUnique.mock.calls[0][0];
    expect(arg1.where.userId_day.day).toBe("2026-07-01");

    vi.setSystemTime(new Date("2026-07-02T00:00:01Z")); // 2 seconds later, next UTC day
    prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce(null);
    await check("user_1");
    const arg2 = prismaMock.aiUsageDailyCounter.findUnique.mock.calls[1][0];
    expect(arg2.where.userId_day.day).toBe("2026-07-02");
    vi.useRealTimers();
  });

  // T177 — null/undefined userId defensive (BA fold-in — SECURITY-CRITICAL)
  it("T177: null/undefined userId — fails open with warning logged", async () => {
    // Prisma will reject the where clause with `userId: undefined`.
    prismaMock.aiUsageDailyCounter.findUnique.mockRejectedValueOnce(
      new Error("Argument userId: Expected String, got Undefined"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await check(undefined);
      // Fail-open: an upstream auth bug that lets a null userId through
      // should not also blow up the AI-service call path.
      expect(r).toEqual({
        allowed: true,
        remaining: expect.any(Number),
        limit: expect.any(Number),
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

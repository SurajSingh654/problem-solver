// ============================================================================
// ai.rateLimiter.team.js — unit tests
// ============================================================================
//
// Tests the per-team Postgres-backed AI rate limiter in isolation via a
// hoisted Prisma mock. Does NOT spin up Express or hit a real DB.
//
// Curriculum · Learn+Teach Phase 1 · W2.T1
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  teamAIUsage: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// Force LIMIT to a small predictable number for these tests.
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_TEAM_DAILY_LIMIT: 500 };
});

const { checkTeam, incrementTeam } = await import(
  "../../src/services/ai.rateLimiter.team.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.teamAIUsage.findUnique.mockReset();
  prismaMock.teamAIUsage.upsert.mockReset();
});

describe("ai.rateLimiter.team — checkTeam", () => {
  it("allows when count < limit", async () => {
    prismaMock.teamAIUsage.findUnique.mockResolvedValueOnce({ count: 100 });
    const r = await checkTeam("team_a");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(400);
    expect(r.limit).toBe(500);
  });

  it("denies at limit", async () => {
    prismaMock.teamAIUsage.findUnique.mockResolvedValueOnce({ count: 500 });
    const r = await checkTeam("team_a");
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.limit).toBe(500);
  });

  it("denies over limit (defensive)", async () => {
    prismaMock.teamAIUsage.findUnique.mockResolvedValueOnce({ count: 999 });
    const r = await checkTeam("team_a");
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("allows when no row exists (count = 0)", async () => {
    prismaMock.teamAIUsage.findUnique.mockResolvedValueOnce(null);
    const r = await checkTeam("team_a");
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(500);
    expect(r.limit).toBe(500);
  });

  it("fails open on DB error", async () => {
    prismaMock.teamAIUsage.findUnique.mockRejectedValueOnce(
      new Error("connection lost"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await checkTeam("team_a");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(500);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("uses teamId_date compound key with UTC-midnight date", async () => {
    prismaMock.teamAIUsage.findUnique.mockResolvedValueOnce(null);
    await checkTeam("team_a");
    const arg = prismaMock.teamAIUsage.findUnique.mock.calls[0][0];
    expect(arg.where.teamId_date.teamId).toBe("team_a");
    // date should be a Date object at UTC midnight
    const d = arg.where.teamId_date.date;
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });
});

describe("ai.rateLimiter.team — incrementTeam", () => {
  it("upserts with create when no row", async () => {
    prismaMock.teamAIUsage.upsert.mockResolvedValueOnce({});
    await incrementTeam("team_a");
    expect(prismaMock.teamAIUsage.upsert).toHaveBeenCalledOnce();
    const args = prismaMock.teamAIUsage.upsert.mock.calls[0][0];
    expect(args.where.teamId_date.teamId).toBe("team_a");
    expect(args.create.teamId).toBe("team_a");
    expect(args.create.count).toBe(1);
    expect(args.update.count).toEqual({ increment: 1 });
  });

  it("swallows DB errors silently", async () => {
    prismaMock.teamAIUsage.upsert.mockRejectedValueOnce(
      new Error("connection lost"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // Should not throw
      await expect(incrementTeam("team_a")).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

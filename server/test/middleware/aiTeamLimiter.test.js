// ============================================================================
// aiTeamLimiter.middleware.js — unit tests
// ============================================================================
//
// Tests the team-level AI rate-limit middleware in isolation via a hoisted
// mock of the underlying service (checkTeam / incrementTeam).
//
// Curriculum · Learn+Teach Phase 1 · W2.T1
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

const rateLimiterMock = vi.hoisted(() => ({
  checkTeam: vi.fn(),
  incrementTeam: vi.fn(),
}));
vi.mock("../../src/services/ai.rateLimiter.team.js", () => rateLimiterMock);

const { aiTeamLimiter } = await import(
  "../../src/middleware/aiTeamLimiter.middleware.js"
);

const makeRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    // response.js reads res.req?.requestId — provide a stub
    req: {},
  };
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiTeamLimiter middleware", () => {
  it("calls next() when allowed and increments the counter", async () => {
    rateLimiterMock.checkTeam.mockResolvedValueOnce({
      allowed: true,
      remaining: 400,
      limit: 500,
    });
    rateLimiterMock.incrementTeam.mockResolvedValueOnce(undefined);
    const next = vi.fn();
    const res = makeRes();
    await aiTeamLimiter({ teamId: "team_a" }, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(rateLimiterMock.checkTeam).toHaveBeenCalledWith("team_a");
    expect(rateLimiterMock.incrementTeam).toHaveBeenCalledWith("team_a");
  });

  it("returns 429 with Retry-After header when denied", async () => {
    rateLimiterMock.checkTeam.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 500,
    });
    const next = vi.fn();
    const res = makeRes();
    await aiTeamLimiter({ teamId: "team_a" }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith("Retry-After", "86400");
    // Assert error envelope shape
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("TEAM_AI_RATE_LIMITED");
    expect(body.error.details).toEqual({ limit: 500, remaining: 0 });
  });

  it("does not increment when denied", async () => {
    rateLimiterMock.checkTeam.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 500,
    });
    const next = vi.fn();
    const res = makeRes();
    await aiTeamLimiter({ teamId: "team_a" }, res, next);
    expect(rateLimiterMock.incrementTeam).not.toHaveBeenCalled();
  });

  it("skips when no req.teamId (SUPER_ADMIN routes without team context)", async () => {
    const next = vi.fn();
    const res = makeRes();
    await aiTeamLimiter({}, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(rateLimiterMock.checkTeam).not.toHaveBeenCalled();
    expect(rateLimiterMock.incrementTeam).not.toHaveBeenCalled();
  });

  it("sets X-Team-AI-Limit / X-Team-AI-Remaining headers on allowed requests", async () => {
    rateLimiterMock.checkTeam.mockResolvedValueOnce({
      allowed: true,
      remaining: 250,
      limit: 500,
    });
    rateLimiterMock.incrementTeam.mockResolvedValueOnce(undefined);
    const next = vi.fn();
    const res = makeRes();
    await aiTeamLimiter({ teamId: "team_a" }, res, next);
    expect(res.set).toHaveBeenCalledWith("X-Team-AI-Limit", "500");
    expect(res.set).toHaveBeenCalledWith("X-Team-AI-Remaining", "250");
  });
});

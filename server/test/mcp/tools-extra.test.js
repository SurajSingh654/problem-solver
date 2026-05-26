// ============================================================================
// MCP tools (batch 2) — security + behavior tests
// ============================================================================
//
// Covers the four tools added in MCP Phase 2 batch 2:
//   - get_dim_breakdown
//   - get_recommended_problems
//   - get_team_leaderboard
//   - get_calibration_status
//
// Same invariants as tools.test.js: identity from getMcpContext (NOT args),
// teamId enforced, strict Zod schemas. ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

vi.mock("../../src/lib/prisma.js", () => ({
  default: {},
}));

vi.mock("../../src/controllers/stats.controller.js", () => ({
  get6DReport: vi.fn(async (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        report: {
          overall: { score: 70, ci: [60, 80] },
          tier: { highest: null, next: null },
          dimensions: [
            {
              key: "solutionDepth",
              status: "active",
              score: 65,
              n: 12,
              ci: [55, 75],
              basis: ["mean(state.points)=2.4 across 12 solutions"],
              activationMessage: null,
              sourceQuality: null,
              ceiling: null,
            },
            {
              key: "verificationMetacognition",
              status: "active",
              score: 72,
              n: 8,
              ci: [62, 82],
              basis: [],
              activationMessage: null,
            },
          ],
          analytics: {
            verification: {
              score: 72,
              ci: [62, 82],
              sourceQuality: "ai-reviews+mocks",
              ceiling: 100,
              reviewCount: 8,
              calibrationN: 5,
              complexityCheckCount: 6,
              followUpCount: 3,
              mockCount: 2,
              calibrationDelta: 0.18,
              calibrationScore: 82,
              complexityScore: 70,
              patternAccuracyScore: 80,
              probeDefenseScore: 65,
              edgeCaseScore: 75,
              wrongPatternCount: 1,
            },
          },
        },
      },
    });
  }),
  getLeaderboard: vi.fn(async (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        leaderboard: [
          { userId: "user-1", displayName: "Alice", score: 80, solvedCount: 50, streakDays: 7, patternsCovered: 12, topStrength: "Solution Depth", rank: 1 },
          { userId: "other-user", displayName: "Bob", score: 70, solvedCount: 40, streakDays: 3, patternsCovered: 9, topStrength: "Pattern Recognition", rank: 2 },
        ],
      },
    });
  }),
}));

vi.mock("../../src/controllers/recommendations.controller.js", () => ({
  getRecommendations: vi.fn(async (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        recommendations: [
          { title: "Two Sum", slug: "two-sum", difficulty: "EASY", category: "Arrays", pattern: "Two Pointers", reason: "Reinforce hot pattern", type: "review" },
          { title: "Word Ladder", slug: "word-ladder", difficulty: "HARD", category: "Graphs", pattern: "BFS", reason: "Untouched FAANG-core pattern", type: "untouched_pattern" },
          { title: "Course Schedule", slug: "course-schedule", difficulty: "MEDIUM", category: "Graphs", pattern: "Topological Sort", reason: "Pattern variant", type: "variant" },
          { title: "Median of Streams", slug: "median", difficulty: "HARD", category: "Heap", pattern: "Heap", reason: "Stretch problem", type: "stretch" },
        ],
      },
    });
  }),
}));

const { mcpContext } = await import("../../src/mcp/context.js");
const dimBreakdown = await import("../../src/mcp/tools/dimBreakdown.js");
const recommendedProblems = await import("../../src/mcp/tools/recommendedProblems.js");
const teamLeaderboard = await import("../../src/mcp/tools/teamLeaderboard.js");
const calibrationStatus = await import("../../src/mcp/tools/calibrationStatus.js");
const { get6DReport, getLeaderboard } = await import("../../src/controllers/stats.controller.js");
const { getRecommendations } = await import("../../src/controllers/recommendations.controller.js");

function makeMockServer() {
  const tools = new Map();
  return {
    registerTool(name, def, handler) {
      const zodSchema = z.object(def.inputSchema).strict();
      tools.set(name, { schema: zodSchema, handler });
    },
    invoke(name, args) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool ${name} not registered`);
      tool.schema.parse(args ?? {});
      return tool.handler(args);
    },
  };
}

beforeEach(() => {
  get6DReport.mockClear();
  getLeaderboard.mockClear();
  getRecommendations.mockClear();
});

const validCtx = {
  userId: "user-1",
  teamId: "team-1",
  jti: "jti-1",
  globalRole: null,
  teamRole: "MEMBER",
};
const noTeamCtx = { ...validCtx, teamId: null };

// ════════════════════════════════════════════════════════════════════
// get_dim_breakdown
// ════════════════════════════════════════════════════════════════════
describe("get_dim_breakdown", () => {
  it("returns the requested dim with basis lines + score/CI/n", async () => {
    const server = makeMockServer();
    dimBreakdown.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_dim_breakdown", { dim_key: "solutionDepth" }),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.key).toBe("solutionDepth");
    expect(body.score).toBe(65);
    expect(body.n).toBe(12);
    expect(body.ci).toEqual([55, 75]);
    expect(body.basis).toContain("mean(state.points)=2.4 across 12 solutions");
  });

  it("returns a not-found message when dim is absent (flag-gated etc.)", async () => {
    const server = makeMockServer();
    dimBreakdown.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_dim_breakdown", { dim_key: "designAptitude" }),
    );
    expect(result.content[0].text).toMatch(/not found/i);
    expect(result.isError).toBe(false);
  });

  it("rejects unknown dim_key via Zod enum (no arbitrary keys)", () => {
    const server = makeMockServer();
    dimBreakdown.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("get_dim_breakdown", { dim_key: "nonsense" })).toThrow();
    });
  });

  it("rejects extra fields via .strict()", () => {
    const server = makeMockServer();
    dimBreakdown.register(server);
    mcpContext.run(validCtx, () => {
      expect(() =>
        server.invoke("get_dim_breakdown", { dim_key: "solutionDepth", userId: "spoofed" }),
      ).toThrow(/Unrecognized key|userId/);
    });
  });

  it("returns isError when teamId is null", async () => {
    const server = makeMockServer();
    dimBreakdown.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("get_dim_breakdown", { dim_key: "solutionDepth" }),
    );
    expect(result.isError).toBe(true);
  });

  it("calls the controller with userId + teamId from the JWT context", async () => {
    const server = makeMockServer();
    dimBreakdown.register(server);
    await mcpContext.run(validCtx, () =>
      server.invoke("get_dim_breakdown", { dim_key: "solutionDepth" }),
    );
    const callArgs = get6DReport.mock.calls[0][0];
    expect(callArgs.user.id).toBe("user-1");
    expect(callArgs.teamId).toBe("team-1");
  });
});

// ════════════════════════════════════════════════════════════════════
// get_recommended_problems
// ════════════════════════════════════════════════════════════════════
describe("get_recommended_problems", () => {
  it("returns up to `count` recommendations with allowed fields only", async () => {
    const server = makeMockServer();
    recommendedProblems.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_recommended_problems", { count: 2 }),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.count).toBe(2);
    expect(body.recommendations).toHaveLength(2);
    const rec = body.recommendations[0];
    expect(Object.keys(rec).sort()).toEqual(
      ["category", "difficulty", "pattern", "reason", "slug", "title", "type"].sort(),
    );
  });

  it("default count is 3 when omitted", async () => {
    const server = makeMockServer();
    recommendedProblems.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_recommended_problems", {}),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.count).toBe(3);
  });

  it("clamps count between 1 and 10 (Zod schema)", () => {
    const server = makeMockServer();
    recommendedProblems.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("get_recommended_problems", { count: 0 })).toThrow();
      expect(() => server.invoke("get_recommended_problems", { count: 11 })).toThrow();
    });
  });

  it("rejects unknown fields via .strict()", () => {
    const server = makeMockServer();
    recommendedProblems.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("get_recommended_problems", { userId: "spoofed" })).toThrow();
    });
  });

  it("wraps user-facing strings via wrapUserContent (XML tags present)", async () => {
    const server = makeMockServer();
    recommendedProblems.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_recommended_problems", { count: 1 }),
    );
    const body = JSON.parse(result.content[0].text);
    // safeOutput wraps content in `<problem_title>...</problem_title>` form.
    expect(body.recommendations[0].title).toMatch(/<user_problem_title>/);
    expect(body.recommendations[0].reason).toMatch(/<user_recommendation_reason>/);
  });

  it("returns isError when teamId is null", async () => {
    const server = makeMockServer();
    recommendedProblems.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("get_recommended_problems", {}),
    );
    expect(result.isError).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// get_team_leaderboard
// ════════════════════════════════════════════════════════════════════
describe("get_team_leaderboard", () => {
  it("returns the team leaderboard with is_self flagged for the caller", async () => {
    const server = makeMockServer();
    teamLeaderboard.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_team_leaderboard", {}),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.count).toBe(2);
    const me = body.leaderboard.find((e) => e.is_self);
    expect(me).toBeDefined();
    expect(me.is_self).toBe(true);
    const other = body.leaderboard.find((e) => !e.is_self);
    expect(other.is_self).toBe(false);
  });

  it("does not leak userId or email — display_name + scores only", async () => {
    const server = makeMockServer();
    teamLeaderboard.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_team_leaderboard", {}),
    );
    const body = JSON.parse(result.content[0].text);
    const entry = body.leaderboard[0];
    expect(entry).not.toHaveProperty("userId");
    expect(entry).not.toHaveProperty("email");
    expect(entry).not.toHaveProperty("id");
  });

  it("wraps display names via wrapUserContent (defense-in-depth)", async () => {
    const server = makeMockServer();
    teamLeaderboard.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_team_leaderboard", {}),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.leaderboard[0].display_name).toMatch(/<user_display_name>/);
  });

  it("rejects extra args via .strict()", () => {
    const server = makeMockServer();
    teamLeaderboard.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("get_team_leaderboard", { teamId: "spoofed" })).toThrow();
    });
  });

  it("returns isError when teamId is null", async () => {
    const server = makeMockServer();
    teamLeaderboard.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("get_team_leaderboard", {}),
    );
    expect(result.isError).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// get_calibration_status
// ════════════════════════════════════════════════════════════════════
describe("get_calibration_status", () => {
  it("returns calibration delta + sub-component scores from analytics.verification", async () => {
    const server = makeMockServer();
    calibrationStatus.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_calibration_status", {}),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.calibration.delta).toBe(0.18);
    expect(body.calibration.score).toBe(82);
    expect(body.sub_components.complexity_verification).toBe(70);
    expect(body.sub_components.pattern_accuracy).toBe(80);
    expect(body.sub_components.probe_defense).toBe(65);
    expect(body.sub_components.edge_case_independence).toBe(75);
    expect(body.flags.wrong_pattern_count).toBe(1);
  });

  it("surfaces sample-size counts so the LLM can hedge appropriately", async () => {
    const server = makeMockServer();
    calibrationStatus.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_calibration_status", {}),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.sample_sizes.ai_reviews).toBe(8);
    expect(body.sample_sizes.calibration_data_points).toBe(5);
    expect(body.sample_sizes.complexity_check_rows).toBe(6);
  });

  it("returns activation message when D10 verification analytics is absent", async () => {
    // Override the controller mock for this test only.
    get6DReport.mockImplementationOnce(async (req, res) => {
      res.status(200).json({
        success: true,
        data: {
          report: {
            dimensions: [
              {
                key: "verificationMetacognition",
                status: "inactive",
                activationMessage: "Need ≥5 AI reviews",
              },
            ],
            analytics: {},
          },
        },
      });
    });
    const server = makeMockServer();
    calibrationStatus.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_calibration_status", {}),
    );
    expect(result.content[0].text).toMatch(/Need ≥5 AI reviews|not active/i);
    expect(result.isError).toBe(false);
  });

  it("rejects extra args via .strict()", () => {
    const server = makeMockServer();
    calibrationStatus.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("get_calibration_status", { userId: "spoofed" })).toThrow();
    });
  });

  it("returns isError when teamId is null", async () => {
    const server = makeMockServer();
    calibrationStatus.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("get_calibration_status", {}),
    );
    expect(result.isError).toBe(true);
  });
});

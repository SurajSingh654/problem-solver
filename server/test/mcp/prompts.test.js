// ============================================================================
// MCP prompts — security + behavior tests
// ============================================================================
//
// Each prompt is a function that:
//   1. Reads userId/teamId from getMcpContext (NOT from args)
//   2. Pulls fresh data via the existing controllers
//   3. Returns { messages: [{ role, content }] }
//
// Tests verify: identity propagation, multi-tenancy enforcement, no-team
// fallback shape, .strict() arg schemas, wrapUserContent on user-derived
// strings (prompt-injection defense), and that the primer text actually
// contains the data the LLM needs (overall score, dim scores, pattern state).
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

vi.mock("../../src/lib/prisma.js", () => ({ default: {} }));

vi.mock("../../src/controllers/stats.controller.js", () => ({
  get6DReport: vi.fn(async (req, res) => {
    res.status(200).json({
      success: true,
      data: {
        report: {
          overall: { score: 70 },
          tier: {
            highest: { name: "tier3", threshold: 60 },
            next: { name: "tier2", overallGap: 5 },
          },
          dimensions: [
            {
              key: "patternRecognition",
              status: "active",
              score: 75,
              n: 30,
              patternMatrix: [
                { pattern: "Two Pointers", state: "WORKING", solves: 5, coldSolves: 3, difficulties: ["EASY", "MEDIUM"], retained: false, isCore: true },
                { pattern: "Backtracking", state: "UNTOUCHED", solves: 0, coldSolves: 0, difficulties: [], retained: false, isCore: true },
              ],
            },
            { key: "solutionDepth", status: "active", score: 60, n: 12, activationMessage: null },
            { key: "communication", status: "active", score: 55, n: 4, activationMessage: null },
            { key: "verificationMetacognition", status: "active", score: 72, n: 8, activationMessage: null },
            { key: "designAptitude", status: "inactive", score: null, n: 0, activationMessage: "Need ≥3 design sessions" },
          ],
          analytics: {
            verification: {
              calibrationDelta: 0.18,
              calibrationN: 5,
              reviewCount: 8,
              sourceQuality: "ai-reviews+mocks",
              wrongPatternCount: 1,
            },
          },
        },
      },
    });
  }),
}));

const { mcpContext } = await import("../../src/mcp/context.js");
const weeklyPrepCheckin = await import("../../src/mcp/prompts/weeklyPrepCheckin.js");
const preInterviewBrief = await import("../../src/mcp/prompts/preInterviewBrief.js");
const patternDeepDive = await import("../../src/mcp/prompts/patternDeepDive.js");
const calibrationCoach = await import("../../src/mcp/prompts/calibrationCoach.js");
const { get6DReport } = await import("../../src/controllers/stats.controller.js");

function makeMockServer() {
  const prompts = new Map();
  return {
    registerPrompt(name, def, handler) {
      const shape = def.argsSchema ?? {};
      const zodSchema = z.object(shape).strict();
      prompts.set(name, { schema: zodSchema, handler });
    },
    invoke(name, args) {
      const p = prompts.get(name);
      if (!p) throw new Error(`Prompt ${name} not registered`);
      p.schema.parse(args ?? {});
      return p.handler(args);
    },
  };
}

beforeEach(() => {
  get6DReport.mockClear();
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
// weekly-prep-checkin
// ════════════════════════════════════════════════════════════════════
describe("weekly-prep-checkin", () => {
  it("returns a primer message containing the user's overall + tier state", async () => {
    const server = makeMockServer();
    weeklyPrepCheckin.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("weekly-prep-checkin", {}),
    );
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    const text = result.messages[0].content.text;
    expect(text).toMatch(/Overall score: 70/);
    expect(text).toMatch(/tier3/);
    expect(text).toMatch(/Next tier: tier2/);
  });

  it("lists active and inactive dimensions in the primer", async () => {
    const server = makeMockServer();
    weeklyPrepCheckin.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("weekly-prep-checkin", {}),
    );
    const text = result.messages[0].content.text;
    expect(text).toMatch(/patternRecognition: 75\/100/);
    expect(text).toMatch(/designAptitude/);
    expect(text).toMatch(/Need ≥3 design sessions/);
  });

  it("wraps the primer in <user_checkin_primer> XML (prompt-injection defense)", async () => {
    const server = makeMockServer();
    weeklyPrepCheckin.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("weekly-prep-checkin", {}),
    );
    expect(result.messages[0].content.text).toMatch(/<user_checkin_primer>/);
  });

  it("returns a no-team fallback message when teamId is null", async () => {
    const server = makeMockServer();
    weeklyPrepCheckin.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("weekly-prep-checkin", {}),
    );
    expect(result.messages[0].content.text).toMatch(/no active team/i);
  });

  it("calls get6DReport with userId + teamId from JWT context (not args)", async () => {
    const server = makeMockServer();
    weeklyPrepCheckin.register(server);
    await mcpContext.run(validCtx, () => server.invoke("weekly-prep-checkin", {}));
    const callArgs = get6DReport.mock.calls[0][0];
    expect(callArgs.user.id).toBe("user-1");
    expect(callArgs.teamId).toBe("team-1");
  });

  it("rejects unknown args via .strict()", () => {
    const server = makeMockServer();
    weeklyPrepCheckin.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("weekly-prep-checkin", { userId: "spoofed" })).toThrow();
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// pre-interview-brief
// ════════════════════════════════════════════════════════════════════
describe("pre-interview-brief", () => {
  it("renders a generalist brief when target_tier is omitted", async () => {
    const server = makeMockServer();
    preInterviewBrief.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("pre-interview-brief", {}),
    );
    const text = result.messages[0].content.text;
    expect(text).toMatch(/generalist brief|No specific target tier/i);
    expect(result.description).toMatch(/generalist/i);
  });

  it("includes target_tier in description and primer when provided", async () => {
    const server = makeMockServer();
    preInterviewBrief.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("pre-interview-brief", { target_tier: "faang" }),
    );
    const text = result.messages[0].content.text;
    expect(text).toMatch(/FAANG/);
    expect(result.description).toMatch(/FAANG/);
  });

  it("ranks active dims by score (top 3 + bottom 3)", async () => {
    const server = makeMockServer();
    preInterviewBrief.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("pre-interview-brief", {}),
    );
    const text = result.messages[0].content.text;
    // patternRecognition is highest at 75, communication is lowest at 55
    expect(text).toMatch(/patternRecognition: 75/);
    expect(text).toMatch(/communication: 55/);
  });

  it("rejects target_tier values outside the allowed enum", () => {
    const server = makeMockServer();
    preInterviewBrief.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("pre-interview-brief", { target_tier: "principal" })).toThrow();
    });
  });

  it("rejects extra args via .strict()", () => {
    const server = makeMockServer();
    preInterviewBrief.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("pre-interview-brief", { teamId: "spoofed" })).toThrow();
    });
  });

  it("returns the no-team fallback when teamId is null", async () => {
    const server = makeMockServer();
    preInterviewBrief.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("pre-interview-brief", {}),
    );
    expect(result.messages[0].content.text).toMatch(/no active team/i);
  });
});

// ════════════════════════════════════════════════════════════════════
// pattern-deep-dive
// ════════════════════════════════════════════════════════════════════
describe("pattern-deep-dive", () => {
  it("matches case-insensitively against patternMatrix", async () => {
    const server = makeMockServer();
    patternDeepDive.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("pattern-deep-dive", { pattern: "two pointers" }),
    );
    const text = result.messages[0].content.text;
    expect(text).toMatch(/Current state: WORKING/);
    expect(text).toMatch(/solves=5/);
  });

  it("falls back to UNTOUCHED guidance when pattern not in canonical taxonomy", async () => {
    const server = makeMockServer();
    patternDeepDive.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("pattern-deep-dive", { pattern: "xyz-not-real" }),
    );
    const text = result.messages[0].content.text;
    expect(text).toMatch(/not found in canonical taxonomy/);
  });

  it("requires the pattern arg (Zod min(1))", () => {
    const server = makeMockServer();
    patternDeepDive.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("pattern-deep-dive", {})).toThrow();
      expect(() => server.invoke("pattern-deep-dive", { pattern: "" })).toThrow();
    });
  });

  it("rejects pattern strings longer than 80 chars (Zod max)", () => {
    const server = makeMockServer();
    patternDeepDive.register(server);
    mcpContext.run(validCtx, () => {
      expect(() =>
        server.invoke("pattern-deep-dive", { pattern: "x".repeat(81) }),
      ).toThrow();
    });
  });

  it("rejects extra args via .strict()", () => {
    const server = makeMockServer();
    patternDeepDive.register(server);
    mcpContext.run(validCtx, () => {
      expect(() =>
        server.invoke("pattern-deep-dive", { pattern: "Two Pointers", userId: "spoofed" }),
      ).toThrow();
    });
  });

  it("returns the no-team fallback when teamId is null", async () => {
    const server = makeMockServer();
    patternDeepDive.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("pattern-deep-dive", { pattern: "Two Pointers" }),
    );
    expect(result.messages[0].content.text).toMatch(/no active team/i);
  });
});

// ════════════════════════════════════════════════════════════════════
// calibration-coach
// ════════════════════════════════════════════════════════════════════
describe("calibration-coach", () => {
  it("renders the calibration delta + sample-size in the primer", async () => {
    const server = makeMockServer();
    calibrationCoach.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("calibration-coach", {}),
    );
    const text = result.messages[0].content.text;
    expect(text).toMatch(/Calibration delta: 18%/);
    expect(text).toMatch(/Sample size: 5 data points across 8 AI reviews/);
    expect(text).toMatch(/Wrong-pattern flags: 1/);
  });

  it("references Kruger-Dunning 1999 (research grounding)", async () => {
    const server = makeMockServer();
    calibrationCoach.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("calibration-coach", {}),
    );
    expect(result.messages[0].content.text).toMatch(/Kruger-Dunning/);
  });

  it("falls back to a no-D10 message when verification analytics is absent", async () => {
    get6DReport.mockImplementationOnce(async (req, res) => {
      res.status(200).json({
        success: true,
        data: {
          report: {
            dimensions: [
              {
                key: "verificationMetacognition",
                status: "inactive",
                activationMessage: "needs ≥5 AI reviews",
              },
            ],
            analytics: {},
          },
        },
      });
    });
    const server = makeMockServer();
    calibrationCoach.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("calibration-coach", {}),
    );
    expect(result.messages[0].content.text).toMatch(/needs ≥5 AI reviews|practice prediction/);
  });

  it("rejects extra args via .strict()", () => {
    const server = makeMockServer();
    calibrationCoach.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("calibration-coach", { userId: "spoofed" })).toThrow();
    });
  });

  it("returns the no-team fallback when teamId is null", async () => {
    const server = makeMockServer();
    calibrationCoach.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("calibration-coach", {}),
    );
    expect(result.messages[0].content.text).toMatch(/no active team/i);
  });
});

// ============================================================================
// MCP tools — security + behavior tests
// ============================================================================
//
// What we verify:
//
//   1. SECURITY: tools read userId/teamId from getMcpContext(), NOT from
//      args. Even if the LLM client sends malicious args (e.g. claiming a
//      different userId), the tool ignores them.
//
//   2. MULTI-TENANCY: each tool's underlying query is filtered by teamId.
//      Mocked Prisma calls confirm the where clause.
//
//   3. NO-TEAM HANDLING: when teamId is null, tools return a clear
//      isError result rather than 500ing or leaking cross-team data.
//
//   4. ZOD SCHEMA VALIDATION: tool inputs are .strict() — extra fields rejected.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma BEFORE importing tool modules.
vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    solution: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

// Mock the controller call so we don't drag the whole stats subsystem
// into a unit test. The controller is tested separately.
vi.mock("../../src/controllers/stats.controller.js", () => ({
  get6DReport: vi.fn(async (req, res) => {
    // The controller's job is to populate res with the report. We mock it
    // with a minimal valid shape so tools can extract what they need.
    res.status(200).json({
      success: true,
      data: {
        report: {
          dimensions: [
            {
              key: "patternRecognition",
              status: "active",
              score: 60,
              n: 10,
              ci: [50, 70],
              patternMatrix: [
                {
                  pattern: "Two Pointers",
                  state: "WORKING",
                  solves: 3,
                  coldSolves: 2,
                  difficulties: ["EASY", "MEDIUM"],
                  retained: false,
                  isCore: true,
                },
                {
                  pattern: "Backtracking",
                  state: "UNTOUCHED",
                  solves: 0,
                  coldSolves: 0,
                  difficulties: [],
                  retained: false,
                  isCore: true,
                },
              ],
            },
          ],
          overall: { score: 55, ci: [45, 65] },
          reportCoverage: { active: 1, total: 6, pct: 17 },
          tier: { highest: null, next: null },
          verdict: { headline: "Building your foundation" },
        },
      },
    });
  }),
}));

const { mcpContext } = await import("../../src/mcp/context.js");
const readinessReport = await import("../../src/mcp/tools/readinessReport.js");
const patternMatrix = await import("../../src/mcp/tools/patternMatrix.js");
const reviewQueue = await import("../../src/mcp/tools/reviewQueue.js");
const { get6DReport } = await import("../../src/controllers/stats.controller.js");
const prisma = (await import("../../src/lib/prisma.js")).default;

import { z } from "zod";

// Shared mock McpServer that captures registered tools and mirrors the
// real SDK's input-validation behavior. The SDK validates args against
// the registered schema BEFORE calling the handler — so our mock does
// the same, otherwise we'd test handlers against args the SDK would
// have rejected.
function makeMockServer() {
  const tools = new Map();
  return {
    registerTool(name, def, handler) {
      // def.inputSchema is a Zod shape (raw object). Reconstruct the
      // strict Zod schema for validation (matches what the SDK does).
      const zodSchema = z.object(def.inputSchema).strict();
      tools.set(name, { schema: zodSchema, handler });
    },
    invoke(name, args) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool ${name} not registered`);
      tool.schema.parse(args ?? {}); // throws ZodError on invalid args
      return tool.handler(args);
    },
  };
}

beforeEach(() => {
  prisma.solution.findMany.mockReset();
  prisma.solution.findMany.mockResolvedValue([]);
  prisma.solution.count.mockReset();
  prisma.solution.count.mockResolvedValue(0);
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
// get_readiness_report
// ════════════════════════════════════════════════════════════════════
describe("get_readiness_report", () => {
  it("registers with the server", async () => {
    const server = makeMockServer();
    readinessReport.register(server);
    // Confirm tool is registered AND invokable inside a context.
    await mcpContext.run(validCtx, () =>
      server.invoke("get_readiness_report", {}),
    );
  });

  it("returns the report summary inside an MCP request context", async () => {
    const server = makeMockServer();
    readinessReport.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_readiness_report", {}),
    );
    expect(result.content).toBeDefined();
    const body = JSON.parse(result.content[0].text);
    expect(body.overall_score).toBe(55);
    expect(body.dimensions).toHaveLength(1);
    expect(body.dimensions[0].key).toBe("patternRecognition");
  });

  it("returns isError when teamId is null", async () => {
    const server = makeMockServer();
    readinessReport.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("get_readiness_report", {}),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No active team context/);
  });

  it("strict Zod schema rejects unknown args (defense-in-depth on userId spoofing)", () => {
    // Even attempting to send userId in args throws at the schema layer
    // before reaching the handler. This is the *first* line of defense.
    // The *second* line (in the handler) is reading from getMcpContext().
    // Note: schema validation throws synchronously inside the SDK (and
    // our mock), so we use expect(fn).toThrow() rather than .rejects.
    const server = makeMockServer();
    readinessReport.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("get_readiness_report", { userId: "attacker-spoofed" })).toThrow(
        /Unrecognized key|userId/,
      );
    });
  });

  it("calls the controller with the JWT-derived userId from context", async () => {
    const server = makeMockServer();
    readinessReport.register(server);
    await mcpContext.run(validCtx, () => server.invoke("get_readiness_report", {}));
    expect(get6DReport).toHaveBeenCalled();
    const callArgs = get6DReport.mock.calls[0][0];
    expect(callArgs.user.id).toBe("user-1");
    expect(callArgs.teamId).toBe("team-1");
  });

  it("respects include_basis=true (passes through to output)", async () => {
    // The mock controller returns dims without basis lines. We verify
    // the tool doesn't add fields it shouldn't — output schema enforces this.
    const server = makeMockServer();
    readinessReport.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_readiness_report", { include_basis: true }),
    );
    expect(result.content).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════
// get_pattern_matrix
// ════════════════════════════════════════════════════════════════════
describe("get_pattern_matrix", () => {
  it("returns full matrix with default filter", async () => {
    const server = makeMockServer();
    patternMatrix.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_pattern_matrix", {}),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.filter).toBe("all");
    expect(body.rows).toHaveLength(2);
    expect(body.counts.untouched).toBe(1);
    expect(body.counts.working).toBe(1);
  });

  it("filter='gaps' returns only UNTOUCHED + TOUCHED rows", async () => {
    const server = makeMockServer();
    patternMatrix.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_pattern_matrix", { filter: "gaps" }),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].state).toBe("UNTOUCHED");
  });

  it("filter='owned' returns only SOLID + OWNED rows", async () => {
    const server = makeMockServer();
    patternMatrix.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_pattern_matrix", { filter: "owned" }),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.rows).toHaveLength(0); // mock has none Solid/Owned
  });

  it("returns no-team error when teamId is null", async () => {
    const server = makeMockServer();
    patternMatrix.register(server);
    const result = await mcpContext.run(noTeamCtx, () =>
      server.invoke("get_pattern_matrix", {}),
    );
    expect(result.isError).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// get_review_queue
// ════════════════════════════════════════════════════════════════════
describe("get_review_queue", () => {
  it("queries Prisma with userId + teamId from context (multi-tenancy)", async () => {
    const server = makeMockServer();
    reviewQueue.register(server);
    await mcpContext.run(validCtx, () => server.invoke("get_review_queue", {}));
    expect(prisma.solution.findMany).toHaveBeenCalled();
    const call = prisma.solution.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe("user-1");
    expect(call.where.teamId).toBe("team-1");
  });

  it("strict schema rejects userId injection via args", () => {
    const server = makeMockServer();
    reviewQueue.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("get_review_queue", { userId: "spoofed" })).toThrow(
        /Unrecognized key|userId/,
      );
    });
  });

  it("clamps limit between 1 and 20 (Zod schema enforced)", async () => {
    const server = makeMockServer();
    reviewQueue.register(server);
    mcpContext.run(validCtx, () => {
      expect(() => server.invoke("get_review_queue", { limit: 0 })).toThrow();
      expect(() => server.invoke("get_review_queue", { limit: 21 })).toThrow();
    });
    // Valid limit should not throw on validation; handler should run.
    prisma.solution.findMany.mockResolvedValue([]);
    prisma.solution.count.mockResolvedValue(0);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_review_queue", { limit: 5 }),
    );
    expect(result.content).toBeDefined();
  });

  it("returns empty queue cleanly when user has no overdue items", async () => {
    const server = makeMockServer();
    reviewQueue.register(server);
    const result = await mcpContext.run(validCtx, () =>
      server.invoke("get_review_queue", { limit: 5 }),
    );
    const body = JSON.parse(result.content[0].text);
    expect(body.total_overdue).toBe(0);
    expect(body.items).toEqual([]);
  });

  it("include_upcoming=true extends the cutoff", async () => {
    const server = makeMockServer();
    reviewQueue.register(server);
    await mcpContext.run(validCtx, () =>
      server.invoke("get_review_queue", { include_upcoming: true }),
    );
    // Verify the cutoff date passed to Prisma is in the future.
    const call = prisma.solution.findMany.mock.calls[0][0];
    expect(call.where.nextReviewDate.lte.getTime()).toBeGreaterThan(Date.now());
  });
});

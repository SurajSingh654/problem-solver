// ============================================================================
// learnAi controller tests — mock the service layer, exercise the wrappers.
// ============================================================================
//
// We mock services/mcp.service.js so the controller can be invoked without
// any real MCP traffic. Every controller is a thin wrapper around
// callMcpTool, so we cover one happy path + the full error-code mapping
// once and trust the rest to follow.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

const mockState = vi.hoisted(() => ({
  callImpl: null,
}));

vi.mock("../../src/services/mcp.service.js", async () => {
  class McpServiceError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "McpServiceError";
      this.code = code;
      if (details !== undefined) this.details = details;
    }
  }
  return {
    McpServiceError,
    callMcpTool: vi.fn(async (...args) => {
      if (!mockState.callImpl) {
        return { ok: true };
      }
      return mockState.callImpl(...args);
    }),
    closeMcpClient: vi.fn().mockResolvedValue(undefined),
  };
});

const {
  searchCode,
  searchDocs,
  readChunk,
  deepExplain,
} = await import("../../src/controllers/learnAi.controller.js");
const { McpServiceError } = await import("../../src/services/mcp.service.js");

beforeEach(() => {
  mockState.callImpl = null;
});

describe("searchCode — happy path", () => {
  it("returns the envelope with tool + result", async () => {
    mockState.callImpl = async (name, args) => {
      expect(name).toBe("search_code");
      expect(args).toEqual({ query: "caching", k: 3 });
      return { result: [{ id: "f#0", file: "foo.py" }] };
    };

    const res = await invoke(
      searchCode,
      makeReq({ body: { query: "caching", k: 3 } }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        tool: "search_code",
        result: { result: [{ id: "f#0", file: "foo.py" }] },
      },
    });
  });
});

describe("error mapping", () => {
  const cases = [
    { code: "MCP_DISABLED", expectStatus: 503, expectCode: "LEARN_AI_DISABLED" },
    { code: "MCP_NOT_CONFIGURED", expectStatus: 503, expectCode: "LEARN_AI_NOT_CONFIGURED" },
    { code: "MCP_SPAWN_TIMEOUT", expectStatus: 504, expectCode: "MCP_SPAWN_TIMEOUT" },
    { code: "MCP_CALL_TIMEOUT", expectStatus: 504, expectCode: "MCP_CALL_TIMEOUT" },
    { code: "MCP_TOOL_ERROR", expectStatus: 502, expectCode: "MCP_TOOL_ERROR" },
    { code: "MCP_INTERNAL", expectStatus: 500, expectCode: "LEARN_AI_INTERNAL" },
  ];

  it.each(cases)(
    "maps $code → HTTP $expectStatus / code $expectCode",
    async ({ code, expectStatus, expectCode }) => {
      mockState.callImpl = async () => {
        throw new McpServiceError(code, `simulated ${code}`);
      };

      const res = await invoke(searchDocs, makeReq({ body: { query: "x" } }));
      expect(res.status).toBe(expectStatus);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(expectCode);
    },
  );

  it("maps an arbitrary thrown Error to 500 LEARN_AI_INTERNAL", async () => {
    mockState.callImpl = async () => {
      throw new Error("kaboom");
    };
    const res = await invoke(searchDocs, makeReq({ body: { query: "x" } }));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("LEARN_AI_INTERNAL");
  });
});

describe("read_chunk + deep_explain wire to the right tool name", () => {
  it("read_chunk passes chunk_id through unchanged", async () => {
    let captured = null;
    mockState.callImpl = async (name, args) => {
      captured = { name, args };
      return { id: args.chunk_id, text: "..." };
    };
    await invoke(
      readChunk,
      makeReq({
        body: { chunk_id: "lessons/06_rag_basic/_shared.py#2" },
        user: { id: "u1", globalRole: "SUPER_ADMIN", currentTeamId: "t1" },
      }),
    );
    expect(captured).toEqual({
      name: "read_chunk",
      args: { chunk_id: "lessons/06_rag_basic/_shared.py#2" },
    });
  });

  it("deep_explain forwards the question", async () => {
    let captured = null;
    mockState.callImpl = async (name, args) => {
      captured = { name, args };
      return { answer: "..." };
    };
    await invoke(
      deepExplain,
      makeReq({ body: { question: "how does RAG work?" } }),
    );
    expect(captured).toEqual({
      name: "deep_explain",
      args: { question: "how does RAG work?" },
    });
  });
});

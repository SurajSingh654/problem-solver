// ============================================================================
// mcp.service unit tests
// ============================================================================
//
// We mock the MCP SDK transport + client and the env-config module. Env vars
// are exposed via getters so individual tests can flip LEARN_AI_ENABLED /
// LEARN_AI_REPO_PATH without re-importing the module.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mutable env state — getters give the SUT live bindings.
const envState = vi.hoisted(() => ({
  LEARN_AI_ENABLED: true,
  LEARN_AI_REPO_PATH: "/fake/learn-ai",
  LEARN_AI_SPAWN_TIMEOUT_MS: 200,
  LEARN_AI_CALL_TIMEOUT_MS: 200,
}));

vi.mock("../../src/config/env.js", () => ({
  get LEARN_AI_ENABLED() {
    return envState.LEARN_AI_ENABLED;
  },
  get LEARN_AI_REPO_PATH() {
    return envState.LEARN_AI_REPO_PATH;
  },
  get LEARN_AI_SPAWN_TIMEOUT_MS() {
    return envState.LEARN_AI_SPAWN_TIMEOUT_MS;
  },
  get LEARN_AI_CALL_TIMEOUT_MS() {
    return envState.LEARN_AI_CALL_TIMEOUT_MS;
  },
}));

// Capture the most recently constructed Client + Transport so tests can
// program their behavior. The fake Client.connect resolves immediately by
// default; tests override callTool per case.
const mockState = vi.hoisted(() => ({
  client: null,
  transport: null,
  connectImpl: null,
  callToolImpl: null,
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  // Vitest 4.x requires `class`/`function` (not arrow) for newable mocks.
  Client: class FakeClient {
    constructor() {
      this.connect = vi.fn(async (...args) => {
        if (mockState.connectImpl) return mockState.connectImpl(...args);
      });
      this.callTool = vi.fn(async (...args) => {
        if (mockState.callToolImpl) return mockState.callToolImpl(...args);
        return { content: [{ type: "text", text: "{}" }] };
      });
      this.close = vi.fn().mockResolvedValue(undefined);
      mockState.client = this;
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class FakeStdioClientTransport {
    constructor() {
      this.onclose = null;
      this.onerror = null;
      this.close = vi.fn().mockResolvedValue(undefined);
      mockState.transport = this;
    }
  },
}));

import {
  callMcpTool,
  closeMcpClient,
  McpServiceError,
  __testing,
} from "../../src/services/mcp.service.js";

beforeEach(() => {
  envState.LEARN_AI_ENABLED = true;
  envState.LEARN_AI_REPO_PATH = "/fake/learn-ai";
  envState.LEARN_AI_SPAWN_TIMEOUT_MS = 200;
  envState.LEARN_AI_CALL_TIMEOUT_MS = 200;
  mockState.client = null;
  mockState.transport = null;
  mockState.connectImpl = null;
  mockState.callToolImpl = null;
  __testing.reset();
});

describe("callMcpTool — guards", () => {
  it("throws MCP_DISABLED when feature flag is off (no spawn)", async () => {
    envState.LEARN_AI_ENABLED = false;

    await expect(callMcpTool("search_code", { query: "x" })).rejects.toMatchObject({
      code: "MCP_DISABLED",
    });
    // Should not have constructed a client/transport.
    expect(mockState.client).toBeNull();
    expect(mockState.transport).toBeNull();
  });

  it("throws MCP_NOT_CONFIGURED when path is missing", async () => {
    envState.LEARN_AI_REPO_PATH = "";

    await expect(callMcpTool("search_code", { query: "x" })).rejects.toMatchObject({
      code: "MCP_NOT_CONFIGURED",
    });
    expect(mockState.client).toBeNull();
  });
});

describe("callMcpTool — happy path", () => {
  it("returns parsed JSON content from a successful tool call", async () => {
    mockState.callToolImpl = async ({ name, arguments: args }) => {
      expect(name).toBe("search_code");
      expect(args).toEqual({ query: "prompt caching", k: 3 });
      return {
        content: [{ type: "text", text: JSON.stringify({ result: [{ id: "f#0" }] }) }],
      };
    };

    const out = await callMcpTool("search_code", { query: "prompt caching", k: 3 });
    expect(out).toEqual({ result: [{ id: "f#0" }] });
    expect(mockState.client.connect).toHaveBeenCalledTimes(1);
  });

  it("reuses the connected client across calls (one connect, two callTool)", async () => {
    mockState.callToolImpl = async () => ({
      content: [{ type: "text", text: "{}" }],
    });

    await callMcpTool("search_docs", { query: "a" });
    await callMcpTool("search_docs", { query: "b" });

    expect(mockState.client.connect).toHaveBeenCalledTimes(1);
    expect(mockState.client.callTool).toHaveBeenCalledTimes(2);
  });

  it("prefers structuredContent when the SDK returns it", async () => {
    mockState.callToolImpl = async () => ({
      structuredContent: { hello: "world" },
      content: [{ type: "text", text: "ignored" }],
    });

    const out = await callMcpTool("search_code", { query: "x" });
    expect(out).toEqual({ hello: "world" });
  });
});

describe("callMcpTool — error mapping", () => {
  it("maps spawn timeout to MCP_SPAWN_TIMEOUT", async () => {
    envState.LEARN_AI_SPAWN_TIMEOUT_MS = 30;
    // connect hangs forever → withTimeout fires.
    mockState.connectImpl = () => new Promise(() => {});

    await expect(callMcpTool("search_code", { query: "x" })).rejects.toMatchObject({
      code: "MCP_SPAWN_TIMEOUT",
    });
  });

  it("maps tool-call timeout to MCP_CALL_TIMEOUT", async () => {
    envState.LEARN_AI_CALL_TIMEOUT_MS = 30;
    mockState.callToolImpl = () => new Promise(() => {});

    await expect(callMcpTool("search_code", { query: "x" })).rejects.toMatchObject({
      code: "MCP_CALL_TIMEOUT",
    });
  });

  it("maps isError result to MCP_TOOL_ERROR with the text payload", async () => {
    mockState.callToolImpl = async () => ({
      isError: true,
      content: [{ type: "text", text: "Index missing. Run mcp-ingest first." }],
    });

    await expect(callMcpTool("search_code", { query: "x" })).rejects.toMatchObject({
      code: "MCP_TOOL_ERROR",
      message: expect.stringContaining("Index missing"),
    });
  });

  it("instances are McpServiceError so controllers can pattern-match", async () => {
    envState.LEARN_AI_ENABLED = false;
    try {
      await callMcpTool("search_code", { query: "x" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(McpServiceError);
      expect(err.code).toBe("MCP_DISABLED");
    }
  });
});

describe("closeMcpClient", () => {
  it("is a no-op before any spawn", async () => {
    await expect(closeMcpClient()).resolves.toBeUndefined();
  });

  it("closes the client+transport once spawned", async () => {
    mockState.callToolImpl = async () => ({ content: [{ type: "text", text: "{}" }] });
    await callMcpTool("search_code", { query: "x" });

    const c = mockState.client;
    const t = mockState.transport;
    await closeMcpClient();
    expect(c.close).toHaveBeenCalled();
    expect(t.close).toHaveBeenCalled();
  });
});

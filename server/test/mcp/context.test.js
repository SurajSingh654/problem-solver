// ============================================================================
// MCP context — AsyncLocalStorage propagation tests
// ============================================================================
//
// Critical security invariant: getMcpContext() must NEVER return another
// user's context. This test suite verifies AsyncLocalStorage isolates
// context across concurrent async operations.
// ============================================================================
import { describe, it, expect } from "vitest";
import { mcpContext, getMcpContext, tryGetMcpContext } from "../../src/mcp/context.js";

describe("mcpContext — AsyncLocalStorage isolation", () => {
  it("getMcpContext throws when called outside .run()", () => {
    expect(() => getMcpContext()).toThrow(/No request context/);
  });

  it("tryGetMcpContext returns null outside .run()", () => {
    expect(tryGetMcpContext()).toBeNull();
  });

  it("returns the correct context inside .run()", async () => {
    const ctx = { userId: "u1", teamId: "t1", jti: "j1", globalRole: null, teamRole: null };
    await mcpContext.run(ctx, async () => {
      expect(getMcpContext()).toEqual(ctx);
    });
  });

  it("does NOT leak context between concurrent .run() calls", async () => {
    // Two simultaneous "requests" with different users. Each should see
    // its own context, never the other's. This is the critical
    // multi-tenancy invariant.
    const aContext = { userId: "user-a", teamId: "team-a", jti: "ja", globalRole: null, teamRole: null };
    const bContext = { userId: "user-b", teamId: "team-b", jti: "jb", globalRole: null, teamRole: null };

    const [a, b] = await Promise.all([
      mcpContext.run(aContext, async () => {
        // Microtask boundary — async hop the OS scheduler can interleave.
        await new Promise((r) => setTimeout(r, 5));
        return getMcpContext();
      }),
      mcpContext.run(bContext, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getMcpContext();
      }),
    ]);
    expect(a.userId).toBe("user-a");
    expect(b.userId).toBe("user-b");
    expect(a.userId).not.toBe(b.userId);
  });

  it("nested .run() calls override the outer context (rare but possible)", async () => {
    const outer = { userId: "outer", teamId: "t-outer", jti: "j-outer", globalRole: null, teamRole: null };
    const inner = { userId: "inner", teamId: "t-inner", jti: "j-inner", globalRole: null, teamRole: null };
    await mcpContext.run(outer, async () => {
      expect(getMcpContext().userId).toBe("outer");
      await mcpContext.run(inner, async () => {
        expect(getMcpContext().userId).toBe("inner");
      });
      expect(getMcpContext().userId).toBe("outer"); // restored
    });
  });
});

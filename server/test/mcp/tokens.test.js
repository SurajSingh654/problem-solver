// ============================================================================
// MCP token endpoints — security + behavior tests
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    mcpToken: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../src/config/env.js", async () => {
  const actual = await vi.importActual("../../src/config/env.js");
  return {
    ...actual,
    FEATURE_MCP_ENABLED: true,
    MCP_TOKEN_EXPIRY_SECONDS: 86400,
  };
});

const {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
} = await import("../../src/controllers/mcpTokens.controller.js");
const prisma = (await import("../../src/lib/prisma.js")).default;

function makeReq({ user = { id: "user-1", currentTeamId: "team-1" }, body = {}, params = {} } = {}) {
  return {
    user,
    teamId: user.currentTeamId,
    body,
    params,
  };
}
function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

beforeEach(() => {
  prisma.mcpToken.count.mockReset().mockResolvedValue(0);
  prisma.mcpToken.create.mockReset().mockResolvedValue({ jti: "jti-test" });
  prisma.mcpToken.findMany.mockReset().mockResolvedValue([]);
  prisma.mcpToken.findUnique.mockReset().mockResolvedValue(null);
  prisma.mcpToken.update.mockReset().mockResolvedValue({});
});

// ════════════════════════════════════════════════════════════════════
// createMcpToken
// ════════════════════════════════════════════════════════════════════
describe("createMcpToken", () => {
  it("returns 200 + token + jti for a valid request", async () => {
    const req = makeReq({ body: { name: "My Mac" } });
    const res = makeRes();
    await createMcpToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe("string");
    expect(res.body.data.token.length).toBeGreaterThan(50); // JWT-shaped
    expect(res.body.data.jti).toBeDefined();
    expect(res.body.data.expiresAt).toBeDefined();
  });

  it("persists metadata to McpToken before returning the token", async () => {
    const req = makeReq({ body: { name: "Test" } });
    await createMcpToken(req, makeRes());
    expect(prisma.mcpToken.create).toHaveBeenCalled();
    const call = prisma.mcpToken.create.mock.calls[0][0];
    expect(call.data.userId).toBe("user-1");
    expect(call.data.name).toBe("Test");
    expect(call.data.revokedAt).toBeUndefined(); // NOT revoked on create
  });

  it("rejects when user already has MAX active tokens", async () => {
    prisma.mcpToken.count.mockResolvedValueOnce(5); // at the cap
    const req = makeReq();
    const res = makeRes();
    await createMcpToken(req, res);
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/active MCP tokens|max/i);
    expect(prisma.mcpToken.create).not.toHaveBeenCalled();
  });

  it("rejects unknown body fields (Zod .strict())", async () => {
    const req = makeReq({ body: { name: "ok", userId: "spoofed" } });
    const res = makeRes();
    await createMcpToken(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("accepts an empty body (name optional)", async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await createMcpToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// listMcpTokens
// ════════════════════════════════════════════════════════════════════
describe("listMcpTokens", () => {
  it("returns the user's tokens with status field derived correctly", async () => {
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 86400 * 1000);
    prisma.mcpToken.findMany.mockResolvedValueOnce([
      // active
      { jti: "j1", name: "Mac", issuedAt: past, expiresAt: future, revokedAt: null, revokedReason: null, lastUsedAt: null, lastUsedIp: null },
      // revoked
      { jti: "j2", name: "Old", issuedAt: past, expiresAt: future, revokedAt: past, revokedReason: "user-revoked", lastUsedAt: null, lastUsedIp: null },
      // expired
      { jti: "j3", name: "Stale", issuedAt: past, expiresAt: past, revokedAt: null, revokedReason: null, lastUsedAt: null, lastUsedIp: null },
    ]);
    const req = makeReq();
    const res = makeRes();
    await listMcpTokens(req, res);
    expect(res.statusCode).toBe(200);
    const tokens = res.body.data.tokens;
    expect(tokens).toHaveLength(3);
    expect(tokens[0].status).toBe("active");
    expect(tokens[1].status).toBe("revoked");
    expect(tokens[2].status).toBe("expired");
  });

  it("filters by userId from req.user.id (multi-tenancy)", async () => {
    await listMcpTokens(makeReq(), makeRes());
    const call = prisma.mcpToken.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe("user-1");
  });
});

// ════════════════════════════════════════════════════════════════════
// revokeMcpToken
// ════════════════════════════════════════════════════════════════════
describe("revokeMcpToken", () => {
  it("revokes the token by jti", async () => {
    prisma.mcpToken.findUnique.mockResolvedValueOnce({
      userId: "user-1",
      revokedAt: null,
    });
    const req = makeReq({ params: { jti: "jti-mine" } });
    const res = makeRes();
    await revokeMcpToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.revoked).toBe("jti-mine");
    expect(res.body.data.alreadyRevoked).toBe(false);
    expect(prisma.mcpToken.update).toHaveBeenCalled();
    const call = prisma.mcpToken.update.mock.calls[0][0];
    expect(call.where.jti).toBe("jti-mine");
    expect(call.data.revokedReason).toBe("user-revoked");
  });

  it("returns 404 when the token doesn't exist", async () => {
    prisma.mcpToken.findUnique.mockResolvedValueOnce(null);
    const req = makeReq({ params: { jti: "nonexistent" } });
    const res = makeRes();
    await revokeMcpToken(req, res);
    expect(res.statusCode).toBe(404);
    expect(prisma.mcpToken.update).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when the token belongs to another user (no leakage)", async () => {
    prisma.mcpToken.findUnique.mockResolvedValueOnce({
      userId: "other-user",
      revokedAt: null,
    });
    const req = makeReq({ params: { jti: "someones-jti" } });
    const res = makeRes();
    await revokeMcpToken(req, res);
    // Important: 404 (same as nonexistent) — don't tell the attacker
    // that the jti EXISTS but belongs to someone else.
    expect(res.statusCode).toBe(404);
    expect(prisma.mcpToken.update).not.toHaveBeenCalled();
  });

  it("idempotent on already-revoked tokens", async () => {
    prisma.mcpToken.findUnique.mockResolvedValueOnce({
      userId: "user-1",
      revokedAt: new Date(),
    });
    const req = makeReq({ params: { jti: "already-revoked" } });
    const res = makeRes();
    await revokeMcpToken(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.alreadyRevoked).toBe(true);
    expect(prisma.mcpToken.update).not.toHaveBeenCalled();
  });

  it("rejects malformed jti", async () => {
    const req = makeReq({ params: { jti: "x".repeat(100) } }); // > 64 chars
    const res = makeRes();
    await revokeMcpToken(req, res);
    expect(res.statusCode).toBe(400);
  });
});

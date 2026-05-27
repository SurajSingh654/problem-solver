// ============================================================================
// MCP middleware — penetration-style security tests
// ============================================================================
//
// Each test maps to one row of the threat model in
// docs/AGENT_TOOLING_REFERENCE.md. If you add a new threat row, add a test
// here and reference the threat number in the test name.
// ============================================================================
import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../src/config/env.js";

// Mock prisma BEFORE importing middleware.
vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    mcpToken: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

const { mcpAuth, _internals: authInternals } = await import(
  "../../src/mcp/middleware/mcpAuth.js"
);
const { mcpOrigin, _internals: originInternals } = await import(
  "../../src/mcp/middleware/mcpOrigin.js"
);
const { mcpRateLimit, _internals: rateInternals } = await import(
  "../../src/mcp/middleware/mcpRateLimit.js"
);
const prisma = (await import("../../src/lib/prisma.js")).default;

// ── Tiny request/response harness ────────────────────────────────────

function makeReq({ headers = {}, ip = "1.2.3.4" } = {}) {
  return {
    headers,
    ip,
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };
}
function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
  };
  return res;
}

function signMcpToken({ id = "user-1", scope = "mcp:read", jti = "jti-abc", currentTeamId = "team-1", expiresIn = "1h" } = {}) {
  return jwt.sign({ id, scope, jti, currentTeamId, teamRole: "MEMBER" }, JWT_SECRET, { expiresIn });
}

beforeEach(() => {
  authInternals.revocationCache.clear();
  authInternals.lastUsedDebounceCache.clear();
  rateInternals.resetForTests();
  prisma.mcpToken.findUnique.mockReset();
  prisma.mcpToken.findUnique.mockResolvedValue(null);
  prisma.mcpToken.update.mockReset();
  prisma.mcpToken.update.mockResolvedValue({});
});

// ════════════════════════════════════════════════════════════════════
// THREAT 1 — Stolen JWT
// ════════════════════════════════════════════════════════════════════
describe("mcpAuth — threat 1 (stolen JWT scope/revocation)", () => {
  it("rejects request with no Authorization header → 401", async () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    await mcpAuth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("MCP_AUTH_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects malformed Bearer header → 401", async () => {
    const req = makeReq({ headers: { authorization: "Bearer" } });
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    expect(res.statusCode).toBe(401);
  });

  it("rejects token signed with wrong secret → 401 generic", async () => {
    const bad = jwt.sign({ id: "x", scope: "mcp:read", jti: "j" }, "wrong-secret");
    const req = makeReq({ headers: { authorization: `Bearer ${bad}` } });
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("MCP_TOKEN_INVALID");
    // No leak of WHY it failed (signature vs expiry vs malformed).
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("rejects expired token → 401 generic", async () => {
    const expired = jwt.sign(
      { id: "x", scope: "mcp:read", jti: "j" },
      JWT_SECRET,
      { expiresIn: "-1s" },
    );
    const req = makeReq({ headers: { authorization: `Bearer ${expired}` } });
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("MCP_TOKEN_INVALID");
  });

  it("rejects web-scope token (no scope claim) → 403 MCP_SCOPE_REQUIRED", async () => {
    // A web JWT (no scope field) must not be usable for MCP.
    const webToken = jwt.sign({ id: "user-1", currentTeamId: "team-1" }, JWT_SECRET);
    const req = makeReq({ headers: { authorization: `Bearer ${webToken}` } });
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("MCP_SCOPE_REQUIRED");
  });

  it("rejects token with wrong scope → 403", async () => {
    const wrongScope = jwt.sign({ id: "x", scope: "admin", jti: "j" }, JWT_SECRET);
    const req = makeReq({ headers: { authorization: `Bearer ${wrongScope}` } });
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    expect(res.statusCode).toBe(403);
  });

  it("rejects token without jti claim → 403", async () => {
    const noJti = jwt.sign({ id: "x", scope: "mcp:read" }, JWT_SECRET);
    const req = makeReq({ headers: { authorization: `Bearer ${noJti}` } });
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("MCP_JTI_REQUIRED");
  });

  it("rejects revoked token (jti in revocation list) → 401 generic", async () => {
    prisma.mcpToken.findUnique.mockResolvedValueOnce({ jti: "revoked-jti", revokedAt: new Date() });
    const tok = signMcpToken({ jti: "revoked-jti" });
    const req = makeReq({ headers: { authorization: `Bearer ${tok}` } });
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("MCP_TOKEN_INVALID");
  });

  it("accepts a valid mcp:read token with jti not in revocation list", async () => {
    const tok = signMcpToken();
    const req = makeReq({ headers: { authorization: `Bearer ${tok}` } });
    const res = makeRes();
    const next = vi.fn();
    await mcpAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe("user-1");
    expect(req.user.jti).toBe("jti-abc");
    expect(req.teamId).toBe("team-1");
  });

  it("caches revocation lookups (60s TTL) — second request avoids DB", async () => {
    const tok = signMcpToken({ jti: "shared-jti" });
    const req1 = makeReq({ headers: { authorization: `Bearer ${tok}` } });
    const req2 = makeReq({ headers: { authorization: `Bearer ${tok}` } });
    await mcpAuth(req1, makeRes(), vi.fn());
    await mcpAuth(req2, makeRes(), vi.fn());
    // Cache hit on second request — DB called only once.
    expect(prisma.mcpToken.findUnique).toHaveBeenCalledTimes(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// THREAT 4 — DNS rebinding (Origin allowlist)
// ════════════════════════════════════════════════════════════════════
describe("mcpOrigin — threat 4 (DNS rebinding)", () => {
  it("allows requests with no Origin header (desktop client convention)", () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    mcpOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows Origin: null (some packaged-app environments)", () => {
    const req = makeReq({ headers: { origin: "null" } });
    const res = makeRes();
    const next = vi.fn();
    mcpOrigin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects unknown Origin → 403 generic, no echo of Origin in response", () => {
    const req = makeReq({ headers: { origin: "https://attacker.example" } });
    const res = makeRes();
    const next = vi.fn();
    mcpOrigin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("MCP_ORIGIN_REJECTED");
    expect(JSON.stringify(res.body)).not.toContain("attacker");
    expect(next).not.toHaveBeenCalled();
  });

  it("ALLOWED set contains the documented public clients", () => {
    expect(originInternals.ALLOWED.has("https://claude.ai")).toBe(true);
    expect(originInternals.ALLOWED.has("https://claude.com")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// THREAT 6 — DoS via excess request rate
// ════════════════════════════════════════════════════════════════════
describe("mcpRateLimit — threat 6 (DoS rate limiting)", () => {
  it("allows requests under the per-user limit", () => {
    const req = makeReq();
    req.user = { id: "u1" };
    const next = vi.fn();
    mcpRateLimit(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects with 429 + Retry-After when per-user limit exceeded", () => {
    const userId = "spammer";
    // Hit the limit.
    for (let i = 0; i < rateInternals.PER_USER_LIMIT; i++) {
      const req = makeReq();
      req.user = { id: userId };
      const next = vi.fn();
      mcpRateLimit(req, makeRes(), next);
      expect(next).toHaveBeenCalled();
    }
    // Next one should be throttled.
    const req = makeReq();
    req.user = { id: userId };
    const res = makeRes();
    mcpRateLimit(req, res, vi.fn());
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.body.code).toBe("MCP_RATE_LIMITED");
  });

  it("per-IP backstop catches multi-user floods from one IP", () => {
    const ip = "9.9.9.9";
    // Slam the IP cap.
    for (let i = 0; i < rateInternals.PER_IP_LIMIT; i++) {
      const req = makeReq({ ip });
      req.user = { id: `u-${i}` };
      mcpRateLimit(req, makeRes(), vi.fn());
    }
    const req = makeReq({ ip });
    req.user = { id: "another" };
    const res = makeRes();
    mcpRateLimit(req, res, vi.fn());
    expect(res.statusCode).toBe(429);
  });

  it("does NOT leak which bucket triggered (defense against probing)", () => {
    const userId = "test-user";
    for (let i = 0; i < rateInternals.PER_USER_LIMIT; i++) {
      const req = makeReq();
      req.user = { id: userId };
      mcpRateLimit(req, makeRes(), vi.fn());
    }
    const req = makeReq();
    req.user = { id: userId };
    const res = makeRes();
    mcpRateLimit(req, res, vi.fn());
    // Generic message, no "user" / "ip" leak.
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("user");
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("ip");
  });
});

// ════════════════════════════════════════════════════════════════════
// THREAT 8 — Compromised client (server-side authz only)
// ════════════════════════════════════════════════════════════════════
describe("mcpAuth — threat 8 (server-side authz)", () => {
  it("ignores user identity in request body (only trusts JWT)", async () => {
    const tok = signMcpToken({ id: "real-user" });
    const req = makeReq({ headers: { authorization: `Bearer ${tok}` } });
    // Even if the client puts a different userId in the body, middleware
    // ignores it — req.user.id always reflects the JWT subject.
    req.body = { userId: "attacker-spoofed", id: "attacker-spoofed" };
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    expect(req.user.id).toBe("real-user");
  });
});

// ════════════════════════════════════════════════════════════════════
// MCP-5 — lastUsedAt / lastUsedIp activity tracking (debounced)
// ════════════════════════════════════════════════════════════════════
describe("mcpAuth — last-used activity tracking", () => {
  // Wait for the fire-and-forget update to settle so we can assert on it.
  async function flushMicrotasks() {
    await new Promise((r) => setImmediate(r));
  }

  it("writes lastUsedAt + lastUsedIp on the first authenticated request", async () => {
    const tok = signMcpToken({ jti: "fresh-jti" });
    const req = makeReq({
      headers: { authorization: `Bearer ${tok}` },
      ip: "203.0.113.42",
    });
    const next = vi.fn();
    await mcpAuth(req, makeRes(), next);
    await flushMicrotasks();
    expect(next).toHaveBeenCalled();
    expect(prisma.mcpToken.update).toHaveBeenCalledTimes(1);
    const call = prisma.mcpToken.update.mock.calls[0][0];
    expect(call.where.jti).toBe("fresh-jti");
    expect(call.data.lastUsedIp).toBe("203.0.113.42");
    expect(call.data.lastUsedAt).toBeInstanceOf(Date);
  });

  it("debounces follow-up requests within 5 min (no extra writes)", async () => {
    const tok = signMcpToken({ jti: "chatty-jti" });
    const next = vi.fn();
    // 5 requests back-to-back — only the first should hit the DB.
    for (let i = 0; i < 5; i++) {
      const req = makeReq({ headers: { authorization: `Bearer ${tok}` } });
      await mcpAuth(req, makeRes(), next);
    }
    await flushMicrotasks();
    expect(prisma.mcpToken.update).toHaveBeenCalledTimes(1);
  });

  it("writes again after the 5-minute debounce window elapses", async () => {
    const tok = signMcpToken({ jti: "long-session-jti" });
    const next = vi.fn();
    await mcpAuth(makeReq({ headers: { authorization: `Bearer ${tok}` } }), makeRes(), next);
    await flushMicrotasks();
    // Manually expire the debounce by rolling the cache timestamp back.
    const old = Date.now() - (authInternals.LAST_USED_DEBOUNCE_MS + 1);
    authInternals.lastUsedDebounceCache.set("long-session-jti", old);
    await mcpAuth(makeReq({ headers: { authorization: `Bearer ${tok}` } }), makeRes(), next);
    await flushMicrotasks();
    expect(prisma.mcpToken.update).toHaveBeenCalledTimes(2);
  });

  it("auth still succeeds if the lastUsedAt write rejects (best-effort)", async () => {
    prisma.mcpToken.update.mockRejectedValue(new Error("row deleted"));
    const tok = signMcpToken({ jti: "race-condition-jti" });
    const req = makeReq({ headers: { authorization: `Bearer ${tok}` } });
    const next = vi.fn();
    await mcpAuth(req, makeRes(), next);
    await flushMicrotasks();
    // next() called BEFORE the failing write resolves; auth path stays clean.
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe("user-1");
  });

  it("does NOT write when auth fails (revoked token never updates lastUsed)", async () => {
    prisma.mcpToken.findUnique.mockResolvedValueOnce({
      jti: "revoked-jti",
      revokedAt: new Date(),
    });
    const tok = signMcpToken({ jti: "revoked-jti" });
    const req = makeReq({ headers: { authorization: `Bearer ${tok}` } });
    const res = makeRes();
    await mcpAuth(req, res, vi.fn());
    await flushMicrotasks();
    expect(res.statusCode).toBe(401);
    expect(prisma.mcpToken.update).not.toHaveBeenCalled();
  });
});

// ============================================================================
// MCP authentication middleware — bearer-token + scope + revocation
// ============================================================================
//
// DESIGN DECISIONS (locked in docs/AGENT_TOOLING_REFERENCE.md):
//
// 1. SEPARATE SCOPE — MCP tokens are JWTs signed with the same secret as
//    web tokens, but they MUST carry `scope: "mcp:read"`. Web tokens have
//    no `scope` field. This means a stolen web token cannot be used to
//    call MCP, and a stolen MCP token cannot be used as a web JWT.
//
// 2. JTI REVOCATION — every MCP token carries a `jti` (UUIDv4). The
//    RevokedMcpToken table is the blocklist. We cache lookups in-memory
//    for 60s to avoid a DB round-trip per MCP request. Cache invalidation
//    happens automatically (TTL); explicit revocation has up to 60s lag.
//    For instant revocation guarantee, add a Redis pub/sub later.
//
// 3. CONSTANT-TIME COMPARISON — JWT verification (jsonwebtoken lib) uses
//    constant-time comparison internally. We don't compare token strings
//    ourselves anywhere; the lib handles that.
//
// 4. NO ACTIVITY TRACKING — unlike the web `authenticate` middleware, we
//    don't fire-and-forget update lastActiveAt on every MCP request. MCP
//    requests are bot-frequency (every few seconds during a coding
//    session), so the activity-tracking debounce would just churn writes.
//    "Last MCP activity" is tracked separately on the RevokedMcpToken
//    table's `lastUsedAt` column when set during cleanup.
//
// 5. NO TEAM-CONTEXT MIDDLEWARE EQUIVALENT — req.teamId is read directly
//    from the JWT (currentTeamId claim). MCP tokens are bound to the
//    team the user was in when they issued the token. If the user
//    switches teams in the web UI, their MCP token still works for the
//    OLD team until they regenerate it (acceptable trade-off — explicit
//    re-issuance is the simplest mental model).
// ============================================================================

import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/env.js";
import prisma from "../../lib/prisma.js";

// ── Revocation cache ────────────────────────────────────────────────
// Map<jti, { revoked: boolean, expiresAt: number }>
// Both positive and negative results cached so a not-revoked check
// doesn't hit the DB on every request from an active MCP session.
// TTL: 60 seconds.
const revocationCache = new Map();
const REVOCATION_CACHE_TTL_MS = 60 * 1000;

function checkRevocationCache(jti) {
  const entry = revocationCache.get(jti);
  if (!entry) return null; // not cached
  if (Date.now() > entry.expiresAt) {
    revocationCache.delete(jti);
    return null;
  }
  return entry.revoked;
}

function setRevocationCache(jti, revoked) {
  revocationCache.set(jti, {
    revoked,
    expiresAt: Date.now() + REVOCATION_CACHE_TTL_MS,
  });
}

/**
 * Internal — check if a JTI is revoked. Returns true if blocked.
 * Cached for 60s to avoid per-request DB lookup.
 */
async function isJtiRevoked(jti) {
  const cached = checkRevocationCache(jti);
  if (cached !== null) return cached;
  const row = await prisma.revokedMcpToken.findUnique({
    where: { jti },
    select: { jti: true },
  });
  const revoked = row !== null;
  setRevocationCache(jti, revoked);
  return revoked;
}

/**
 * MCP auth middleware. Validates:
 *   - Authorization header present + Bearer scheme
 *   - JWT signature valid
 *   - JWT carries `scope: "mcp:read"` (separates from web tokens)
 *   - JWT has a jti and the jti is not in the revocation list
 *   - JWT not expired (handled by jsonwebtoken)
 *
 * On success: sets req.user = { id, globalRole, currentTeamId, teamRole, jti }
 * and req.teamId = currentTeamId. Mirrors the web `authenticate` shape so
 * downstream tool code feels familiar.
 *
 * Failures return generic 401 / 403 — no information leakage about which
 * specific check failed (defense against probing).
 */
export async function mcpAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required",
        code: "MCP_AUTH_REQUIRED",
      });
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        error: "Authentication required",
        code: "MCP_AUTH_REQUIRED",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      // Could be expired, malformed, or wrong signature — same response
      // either way. The client already knows the token they sent; no
      // benefit to telling them WHICH way it failed.
      return res.status(401).json({
        error: "Invalid or expired token",
        code: "MCP_TOKEN_INVALID",
      });
    }

    // Scope check — MCP tokens must explicitly carry mcp:read.
    if (decoded.scope !== "mcp:read") {
      return res.status(403).json({
        error: "Token not authorized for MCP",
        code: "MCP_SCOPE_REQUIRED",
      });
    }

    // JTI required for revocation tracking.
    if (typeof decoded.jti !== "string" || decoded.jti.length === 0) {
      return res.status(403).json({
        error: "Token missing required claim",
        code: "MCP_JTI_REQUIRED",
      });
    }

    // Revocation list check — generic 401 (don't say "revoked", just "invalid").
    const revoked = await isJtiRevoked(decoded.jti);
    if (revoked) {
      return res.status(401).json({
        error: "Invalid or expired token",
        code: "MCP_TOKEN_INVALID",
      });
    }

    // Required identity claims.
    if (!decoded.id || typeof decoded.id !== "string") {
      return res.status(403).json({
        error: "Token missing required claim",
        code: "MCP_TOKEN_INVALID",
      });
    }

    // Mirror the web `authenticate` shape so tool implementations can
    // reuse req.user / req.teamId conventions without translation.
    req.user = {
      id: decoded.id,
      globalRole: decoded.globalRole,
      currentTeamId: decoded.currentTeamId ?? null,
      teamRole: decoded.teamRole ?? null,
      jti: decoded.jti,
    };
    req.teamId = decoded.currentTeamId ?? null;

    return next();
  } catch (err) {
    // Server-side log includes detail; client gets generic.
    console.error("[mcp:auth] unexpected error:", err?.message || err);
    return res.status(500).json({
      error: "Authentication processing failed",
      code: "MCP_AUTH_ERROR",
    });
  }
}

// Exported for tests + admin diagnostics.
export const _internals = {
  revocationCache,
  REVOCATION_CACHE_TTL_MS,
  isJtiRevoked,
};

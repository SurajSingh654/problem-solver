// ============================================================================
// MCP token management — REST endpoints (Phase MCP-4)
// ============================================================================
//
// Endpoints (all gated by FEATURE_MCP_ENABLED + standard JWT auth):
//
//   POST   /api/v1/users/me/mcp-tokens        Create a new token
//   GET    /api/v1/users/me/mcp-tokens        List the caller's tokens
//   DELETE /api/v1/users/me/mcp-tokens/:jti   Revoke a token
//
// SECURITY:
//   - All endpoints scoped to req.user.id — users can only manage their
//     own tokens. NO admin override; even SUPER_ADMIN goes through their
//     own token list.
//   - The token (the actual JWT string) is shown ONCE on creation. Never
//     stored in plaintext server-side. We store only metadata (jti, name,
//     expiresAt, lastUsedAt) so a leaked DB doesn't leak tokens.
//   - Creating a token always issues a fresh `jti` (UUIDv4); we record
//     metadata + return the JWT in the response. The client copies it
//     into their MCP-client config.
// ============================================================================

import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import {
  JWT_SECRET,
  MCP_TOKEN_EXPIRY_SECONDS,
  FEATURE_MCP_ENABLED,
} from "../config/env.js";
import { success, error } from "../utils/response.js";

// Hard-cap concurrent active tokens per user. Prevents accidental token
// sprawl + bounds the size of the settings page list.
const MAX_ACTIVE_TOKENS_PER_USER = 5;

const createSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
  })
  .strict();

/**
 * POST /api/v1/users/me/mcp-tokens
 * Body: { name?: string }
 * Returns: { token, jti, expiresAt }
 */
export async function createMcpToken(req, res) {
  if (!FEATURE_MCP_ENABLED) {
    return error(res, "MCP server is disabled.", 503);
  }
  const userId = req.user.id;
  const teamId = req.teamId ?? req.user.currentTeamId ?? null;

  // Validate input
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return error(res, "Invalid request body.", 400);
  }
  const { name } = parsed.data;

  // Cap active tokens per user — prevent sprawl.
  const activeCount = await prisma.mcpToken.count({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (activeCount >= MAX_ACTIVE_TOKENS_PER_USER) {
    return error(
      res,
      `You have ${activeCount} active MCP tokens (max ${MAX_ACTIVE_TOKENS_PER_USER}). Revoke an existing token before creating a new one.`,
      400,
    );
  }

  const jti = randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + MCP_TOKEN_EXPIRY_SECONDS * 1000);

  // Persist metadata BEFORE returning the token. If the insert fails,
  // we never return a token that the auth middleware doesn't know about.
  await prisma.mcpToken.create({
    data: {
      jti,
      userId,
      name: name ?? null,
      issuedAt,
      expiresAt,
    },
  });

  // Sign the JWT. Same secret as web tokens but with `scope: "mcp:read"`.
  const token = jwt.sign(
    {
      id: userId,
      scope: "mcp:read",
      jti,
      currentTeamId: teamId,
      teamRole: req.user.teamRole ?? null,
      globalRole: req.user.globalRole ?? null,
    },
    JWT_SECRET,
    { expiresIn: MCP_TOKEN_EXPIRY_SECONDS },
  );

  return success(res, {
    token,
    jti,
    name: name ?? null,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    instructions:
      "Copy this token into your MCP client config now — it's not retrievable later. " +
      "Example: claude mcp add --transport http --scope user binary-thinkers " +
      "<MCP_URL> --header \"Authorization: Bearer <token>\"",
  });
}

/**
 * GET /api/v1/users/me/mcp-tokens
 * Returns: { tokens: [{ jti, name, issuedAt, expiresAt, revokedAt, lastUsedAt, lastUsedIp, status }] }
 */
export async function listMcpTokens(req, res) {
  if (!FEATURE_MCP_ENABLED) {
    return error(res, "MCP server is disabled.", 503);
  }
  const userId = req.user.id;
  const rows = await prisma.mcpToken.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    select: {
      jti: true,
      name: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      revokedReason: true,
      lastUsedAt: true,
      lastUsedIp: true,
    },
  });

  const now = Date.now();
  const tokens = rows.map((r) => {
    let status;
    if (r.revokedAt) status = "revoked";
    else if (r.expiresAt.getTime() <= now) status = "expired";
    else status = "active";
    return {
      jti: r.jti,
      name: r.name,
      issuedAt: r.issuedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokedReason: r.revokedReason,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      lastUsedIp: r.lastUsedIp,
      status,
    };
  });

  return success(res, { tokens });
}

/**
 * DELETE /api/v1/users/me/mcp-tokens/:jti
 * Returns: { revoked: jti }
 */
export async function revokeMcpToken(req, res) {
  if (!FEATURE_MCP_ENABLED) {
    return error(res, "MCP server is disabled.", 503);
  }
  const userId = req.user.id;
  const jti = req.params.jti;
  if (!jti || typeof jti !== "string" || jti.length > 64) {
    return error(res, "Invalid jti.", 400);
  }

  // Atomically: must belong to this user AND not already revoked.
  const existing = await prisma.mcpToken.findUnique({
    where: { jti },
    select: { userId: true, revokedAt: true },
  });
  if (!existing) {
    return error(res, "Token not found.", 404);
  }
  if (existing.userId !== userId) {
    // Cross-user revocation attempt — don't tell them the jti exists.
    return error(res, "Token not found.", 404);
  }
  if (existing.revokedAt) {
    return success(res, { revoked: jti, alreadyRevoked: true });
  }

  await prisma.mcpToken.update({
    where: { jti },
    data: {
      revokedAt: new Date(),
      revokedReason: "user-revoked",
    },
  });

  return success(res, { revoked: jti, alreadyRevoked: false });
}

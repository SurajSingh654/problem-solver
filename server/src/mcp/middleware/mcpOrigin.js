// ============================================================================
// MCP Origin allowlist — DNS rebinding defense
// ============================================================================
//
// Per the MCP transport spec (modelcontextprotocol.io/transports#security-warning),
// servers MUST validate the Origin header to prevent DNS rebinding attacks.
//
// DNS rebinding attack flow we're defending against:
//   1. Victim visits attacker.com in their browser.
//   2. attacker.com triggers a fetch() to https://probsolver-api.up.railway.app/mcp
//      with the victim's bearer token (somehow extracted — say, via an XSS).
//   3. Without Origin validation, our server happily replies with the victim's
//      readiness data, which the malicious page exfiltrates.
//
// The Origin allowlist forces the request to come from a known MCP client UI.
// Browser-launched clients (Claude.ai, ChatGPT, Cursor web) all set Origin
// honestly. Desktop clients (Claude Code, Cursor desktop, VS Code) often send
// no Origin or "null" — those rely on bearer-token auth alone, which is OK
// because they're trusted-runtime environments not exposed to drive-by web.
//
// Policy:
//   - No Origin header at all → ALLOW (desktop client; bearer token gates access).
//   - Origin === "null" → ALLOW (some packaged-app environments do this).
//   - Origin in allowlist → ALLOW.
//   - Origin not in allowlist → 403, generic message.
//
// MCP_ALLOWED_ORIGINS env var controls the allowlist. Default ships with the
// known major clients. Self-hosted integrations can add their domain.
// ============================================================================

import { MCP_ALLOWED_ORIGINS } from "../../config/env.js";

const ALLOWED = new Set(MCP_ALLOWED_ORIGINS);

/**
 * Origin validation middleware. Must run before mcpAuth so we don't even
 * verify a JWT for a request we'd reject anyway.
 */
export function mcpOrigin(req, res, next) {
  const origin = req.get("origin");

  // Desktop clients commonly omit Origin or send "null".
  if (!origin || origin === "null") {
    return next();
  }

  if (ALLOWED.has(origin)) {
    return next();
  }

  // Generic rejection. Don't echo the Origin back into the response.
  return res.status(403).json({
    error: "Origin not allowed",
    code: "MCP_ORIGIN_REJECTED",
  });
}

// Exported for tests.
export const _internals = { ALLOWED };

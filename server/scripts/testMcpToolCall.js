// ============================================================================
// Dev-only — exercise an MCP tool end-to-end (init → tools/call)
//
// Useful for verifying tools work without going through Claude Code (which
// has its own caching/session state). This script does the proper MCP
// handshake:
//   1. POST initialize → get Mcp-Session-Id from response header
//   2. POST notifications/initialized → ack
//   3. POST tools/call with that session ID → invoke the tool
//
// USAGE:
//   # Use an externally-minted token (preferred — pick your own user/team):
//   TOKEN=$(node scripts/mintMcpToken.js --email=you@example.com --teamId=cm...)
//   node scripts/testMcpToolCall.js get_readiness_report
//
//   # Or let the script auto-mint for the first SUPER_ADMIN (convenience):
//   unset TOKEN
//   node scripts/testMcpToolCall.js get_readiness_report
//
//   # Pass tool args as second positional:
//   node scripts/testMcpToolCall.js get_pattern_matrix '{"filter":"gaps"}'
//   node scripts/testMcpToolCall.js get_review_queue '{"limit":3}'
// ============================================================================

import "dotenv/config";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import {
  JWT_SECRET,
  MCP_TOKEN_EXPIRY_SECONDS,
} from "../src/config/env.js";

const MCP_URL = process.env.MCP_TEST_URL || "http://localhost:5000/mcp";

const prisma = new PrismaClient({ log: ["error"] });

async function mintToken() {
  const admin = await prisma.user.findFirst({
    where: { globalRole: "SUPER_ADMIN" },
    select: { id: true, email: true, currentTeamId: true },
  });
  if (!admin) {
    console.error("No SUPER_ADMIN found.");
    process.exit(1);
  }
  let teamId = admin.currentTeamId;
  if (!teamId) {
    const t = await prisma.team.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
    });
    teamId = t?.id ?? null;
    if (teamId) console.error(`[test] picked team ${t.name}`);
  }
  return jwt.sign(
    { id: admin.id, scope: "mcp:read", jti: randomUUID(), currentTeamId: teamId },
    JWT_SECRET,
    { expiresIn: MCP_TOKEN_EXPIRY_SECONDS },
  );
}

/**
 * Parse SSE-formatted body into the JSON-RPC response object.
 * SSE shape: `event: message\ndata: {...}\n\n`
 * Plain-JSON shape: just the object.
 */
function parseMcpResponse(rawBody, contentType) {
  if (contentType.includes("text/event-stream")) {
    const m = rawBody.match(/^data:\s*(.+)$/m);
    if (!m) throw new Error(`SSE body missing data line: ${rawBody.slice(0, 200)}`);
    return JSON.parse(m[1]);
  }
  return JSON.parse(rawBody);
}

async function rpc(token, sessionId, body) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  return {
    status: res.status,
    sessionId: res.headers.get("mcp-session-id"),
    body: text.length === 0 ? null : parseMcpResponse(text, ct),
    raw: text,
  };
}

async function main() {
  const toolName = process.argv[2];
  if (!toolName) {
    console.error("Usage: node scripts/testMcpToolCall.js <tool-name> [json-args]");
    console.error("Example: node scripts/testMcpToolCall.js get_pattern_matrix '{\"filter\":\"gaps\"}'");
    process.exit(1);
  }
  const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};

  // Prefer an externally-supplied token via $TOKEN env (lets the user
  // pick which account to test as — passing --email=... etc. to the
  // mint script). Fall back to auto-minting for the first SUPER_ADMIN
  // when $TOKEN is unset.
  let token;
  if (process.env.TOKEN && process.env.TOKEN.length > 20) {
    console.error(`[test] using existing $TOKEN env var`);
    token = process.env.TOKEN;
  } else {
    console.error(`[test] no $TOKEN env — auto-minting for first SUPER_ADMIN`);
    token = await mintToken();
  }

  // Server runs in stateless mode (sessionIdGenerator: undefined), so
  // initialize doesn't issue a session ID and subsequent requests don't
  // need one. Each request is fully independent.
  console.error(`[test] POST initialize → ${MCP_URL}`);
  const init = await rpc(token, null, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-script", version: "1.0.0" },
    },
  });
  if (init.status !== 200) {
    console.error(`[test] initialize FAILED: ${init.status}\n${init.raw}`);
    process.exit(1);
  }
  console.error(`[test] initialize OK (stateless — no session id)`);

  console.error(`[test] POST tools/call name=${toolName} args=${JSON.stringify(args)}`);
  const call = await rpc(token, null, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });

  if (call.status !== 200) {
    console.error(`[test] tools/call FAILED: ${call.status}`);
    console.error(`[test] response headers content-type: (see server logs for full)`);
    console.error(`[test] raw body length: ${call.raw.length}`);
    console.error(`[test] raw body: ${call.raw || "(empty — check server logs for the actual error)"}`);
    process.exit(1);
  }

  // Pretty-print the tool's output.
  const result = call.body?.result;
  if (!result) {
    console.error("[test] No result in response");
    console.log(JSON.stringify(call.body, null, 2));
    process.exit(0);
  }
  if (result.isError) {
    console.error(`[test] tool returned isError`);
  }
  for (const block of result.content || []) {
    if (block.type === "text") {
      console.log(block.text);
    } else {
      console.log(JSON.stringify(block, null, 2));
    }
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[test] FAILED:", err?.message || err);
  process.exit(1);
});

// ============================================================================
// Dev-only — mint an mcp:read JWT for testing the MCP server before the
// settings-page UI ships (Phase MCP-4).
//
// USAGE:
//   node scripts/mintMcpToken.js <userId>
//   node scripts/mintMcpToken.js <userId> --teamId=<teamId>
//   node scripts/mintMcpToken.js me   # mints for the first SUPER_ADMIN found
//
// WARNING: This script reads JWT_SECRET from .env. Do NOT ship it. Do NOT
// run it in production. The Phase MCP-4 settings page is the production
// flow for issuing MCP tokens — with revocation tracking, last-used
// timestamps, and a UI for the user to manage their own tokens.
//
// Output: a signed JWT printed to stdout. Pipe it into your client config:
//
//   TOKEN=$(node scripts/mintMcpToken.js me)
//   claude mcp add binary-thinkers http://localhost:5000/mcp --header "Authorization: Bearer $TOKEN"
// ============================================================================

import "dotenv/config";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import {
  JWT_SECRET,
  MCP_TOKEN_EXPIRY_SECONDS,
} from "../src/config/env.js";

// Use a dedicated PrismaClient with logs OFF — the shared one in
// src/lib/prisma.js writes `prisma:query` lines to stdout in dev, which
// pollutes scripts that pipe the output (TOKEN=$(node …)). Quiet client
// keeps stdout clean for the JWT.
const prisma = new PrismaClient({ log: ["error"] });

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node scripts/mintMcpToken.js <userId|me> [--teamId=<teamId>]");
    process.exit(1);
  }

  let userId = args[0];
  const teamArg = args.find((a) => a.startsWith("--teamId="));
  let teamId = teamArg ? teamArg.split("=")[1] : null;

  // "me" — mint for the first SUPER_ADMIN. Convenient for dev since
  // you're probably testing as yourself.
  if (userId === "me") {
    const admin = await prisma.user.findFirst({
      where: { globalRole: "SUPER_ADMIN" },
      select: { id: true, email: true, currentTeamId: true, teamRole: true, globalRole: true },
    });
    if (!admin) {
      console.error("No SUPER_ADMIN found. Create one or pass an explicit userId.");
      process.exit(1);
    }
    userId = admin.id;
    teamId = teamId || admin.currentTeamId;
    console.error(`[mint] Resolved 'me' → ${admin.email} (${userId})`);
  } else {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, currentTeamId: true, teamRole: true, globalRole: true },
    });
    if (!u) {
      console.error(`User ${userId} not found.`);
      process.exit(1);
    }
    teamId = teamId || u.currentTeamId;
    console.error(`[mint] User ${u.email} (${userId})`);
  }

  const jti = randomUUID();
  const payload = {
    id: userId,
    scope: "mcp:read",
    jti,
    currentTeamId: teamId,
    teamRole: null, // populated by web flow; unnecessary for read-only MCP
    globalRole: null,
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: MCP_TOKEN_EXPIRY_SECONDS,
  });

  // Diagnostics to stderr so stdout is just the token (pipe-friendly).
  console.error(`[mint] jti=${jti}`);
  console.error(`[mint] expires in ${MCP_TOKEN_EXPIRY_SECONDS}s (~${Math.round(MCP_TOKEN_EXPIRY_SECONDS / 3600)}h)`);
  console.error(`[mint] teamId=${teamId || "(none)"}`);
  console.error("[mint] To revoke: insert this jti into RevokedMcpToken table.");
  console.error("");

  // Token to stdout — single line, no extras.
  console.log(token);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[mint] FAILED:", err?.message || err);
  process.exit(1);
});

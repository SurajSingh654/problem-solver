// ============================================================================
// Dev-only — mint an mcp:read JWT for testing the MCP server before the
// settings-page UI ships (Phase MCP-4).
//
// USAGE:
//   node scripts/mintMcpToken.js <userId>
//   node scripts/mintMcpToken.js <userId> --teamId=<teamId>
//   node scripts/mintMcpToken.js me                       # first SUPER_ADMIN
//   node scripts/mintMcpToken.js --email=user@example.com # look up by email
//   node scripts/mintMcpToken.js --list                   # show id + email + currentTeamId for all users
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
    console.error(
      "Usage:\n" +
      "  node scripts/mintMcpToken.js me [--teamId=<id>]\n" +
      "  node scripts/mintMcpToken.js <userId> [--teamId=<id>]\n" +
      "  node scripts/mintMcpToken.js --email=<email> [--teamId=<id>]\n" +
      "  node scripts/mintMcpToken.js --list",
    );
    process.exit(1);
  }

  // --list: enumerate users for convenience.
  if (args.includes("--list")) {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, currentTeamId: true, globalRole: true },
      orderBy: { createdAt: "asc" },
    });
    console.error(`[mint] ${users.length} users:`);
    for (const u of users) {
      const role = u.globalRole === "SUPER_ADMIN" ? " [SUPER_ADMIN]" : "";
      console.error(`  ${u.id}  ${u.email}${role}  team=${u.currentTeamId || "(none)"}`);
    }
    await prisma.$disconnect();
    process.exit(0);
  }

  // --email=<email>: look up by email.
  const emailArg = args.find((a) => a.startsWith("--email="));
  const teamArg = args.find((a) => a.startsWith("--teamId="));
  let teamId = teamArg ? teamArg.split("=")[1] : null;

  let userId;
  if (emailArg) {
    const email = emailArg.split("=")[1];
    const u = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, currentTeamId: true, teamRole: true, globalRole: true },
    });
    if (!u) {
      console.error(`User with email ${email} not found.`);
      process.exit(1);
    }
    userId = u.id;
    teamId = teamId || u.currentTeamId;
    console.error(`[mint] Resolved email ${email} → ${userId}`);
  } else {
    userId = args.find((a) => !a.startsWith("--"));
    if (!userId) {
      console.error("Missing userId. Pass 'me', a CUID, or --email=<email>. Use --list to see users.");
      process.exit(1);
    }
  }

  // "me" — mint for the first SUPER_ADMIN. Convenient for dev since
  // you're probably testing as yourself.
  let resolvedUser;
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
    resolvedUser = admin;
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
    resolvedUser = u;
    console.error(`[mint] User ${u.email} (${userId})`);
  }

  // If the user has no currentTeamId, find any team they have access to.
  // For a SUPER_ADMIN, that's "any active team". For a regular user, it's
  // teams they're a member of via TeamMembership. Falls back to the
  // user's personal team if available. Without this, MCP tools that
  // require a team context (most do) return isError to the LLM.
  if (!teamId) {
    if (resolvedUser?.globalRole === "SUPER_ADMIN") {
      const anyTeam = await prisma.team.findFirst({
        where: { status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });
      if (anyTeam) {
        teamId = anyTeam.id;
        console.error(`[mint] No currentTeamId — SUPER_ADMIN, picked first ACTIVE team: ${anyTeam.name} (${teamId})`);
      }
    } else {
      // Find any team this user is a member of.
      const membership = await prisma.teamMembership.findFirst({
        where: { userId },
        select: { teamId: true, team: { select: { name: true } } },
      });
      if (membership?.teamId) {
        teamId = membership.teamId;
        console.error(`[mint] No currentTeamId — picked team via membership: ${membership.team?.name} (${teamId})`);
      }
    }
  }

  if (!teamId) {
    console.error(
      "[mint] WARN: still no teamId — token will be issued without team context. " +
      "Most MCP tools will return 'No active team context'. Switch to a team in the " +
      "web UI to set currentTeamId, then re-mint.",
    );
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

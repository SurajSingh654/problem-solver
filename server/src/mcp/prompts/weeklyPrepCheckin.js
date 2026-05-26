// ============================================================================
// MCP prompt — weekly-prep-checkin
// ============================================================================
//
// Slash-command prompt the user invokes (e.g. /weekly-prep-checkin in
// Claude Code). Pulls the user's readiness summary + queue + recent
// activity, formats it as a starter conversation that primes the LLM to
// run a 5-minute weekly check-in:
//
//   - "Here's your readiness as of today..."
//   - "These dimensions improved / regressed since last week..."
//   - "Your priorities for the week ahead are..."
//
// PRIVACY/SECURITY:
//   - userId + teamId from getMcpContext (JWT-derived)
//   - All user-derived strings wrapped via wrapUserContent
//   - No external API calls — composes from existing report data
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import { callController } from "../utils/captureRes.js";
import { get6DReport } from "../../controllers/stats.controller.js";
import { wrapUserContent } from "../utils/safeOutput.js";

const argsSchema = z.object({}).strict();

async function handler() {
  const { userId, teamId, globalRole, teamRole } = getMcpContext();
  if (!teamId) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "I tried to start a weekly check-in but my account has no active team. Can you help me set one up?",
          },
        },
      ],
    };
  }

  const captured = await callController(get6DReport, {
    user: { id: userId, globalRole, currentTeamId: teamId, teamRole },
    teamId,
  });
  const report = captured?.data?.report;
  const dims = report?.dimensions ?? [];
  const overall = report?.overall?.score ?? null;
  const tierReady = report?.tier?.highest;
  const nextTier = report?.tier?.next;

  // Compose a primer message containing the user's snapshot. The LLM
  // reads this as the user's opening message and responds with a
  // structured weekly check-in conversation.
  const dimSummary = dims
    .filter((d) => d.status === "active")
    .map((d) => `  - ${d.key}: ${d.score}/100 (n=${d.n})`)
    .join("\n");

  const inactiveSummary = dims
    .filter((d) => d.status === "inactive")
    .map((d) => `  - ${d.key}: ${d.activationMessage || "inactive"}`)
    .join("\n");

  const tierLine = tierReady
    ? `Currently ready for ${tierReady.name} (threshold ${tierReady.threshold}).`
    : "Not yet tier-ready.";
  const nextTierLine = nextTier
    ? `Next tier: ${nextTier.name} (${nextTier.overallGap} points away).`
    : "";

  const primerText =
    `Let's run my weekly readiness check-in. Here's my current state:\n\n` +
    `Overall score: ${overall ?? "(not yet measurable)"}\n` +
    `${tierLine}\n${nextTierLine}\n\n` +
    `Active dimensions:\n${dimSummary || "  (none yet — still building profile)"}\n\n` +
    (inactiveSummary
      ? `Inactive dimensions / activation gates:\n${inactiveSummary}\n\n`
      : "") +
    `Please:\n` +
    `1. Identify my biggest signal-to-noise improvement this week (which dim should I focus on?).\n` +
    `2. Suggest 2-3 concrete actions for the next 7 days, grounded in my actual scores.\n` +
    `3. Call out any dim that's at risk of regression.\n` +
    `4. Be honest — if my coverage is low, say so. Don't overclaim readiness.`;

  return {
    description: "Weekly readiness check-in primed with the user's current 10D snapshot.",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: wrapUserContent("checkin_primer", primerText, { maxChars: 6000 }),
        },
      },
    ],
  };
}

export function register(server) {
  server.registerPrompt(
    "weekly-prep-checkin",
    {
      title: "Weekly readiness check-in",
      description:
        "Run a 5-minute weekly check-in. Pulls the user's current 10D readiness profile, " +
        "tier readiness, and active/inactive dim status, then primes the LLM to surface " +
        "the highest-leverage focus area for the week ahead.",
      argsSchema: argsSchema.shape,
    },
    handler,
  );
}

// ============================================================================
// MCP prompt — pre-interview-brief
// ============================================================================
//
// Pre-interview readiness brief. User invokes before a real interview.
// Optionally accepts a target tier (junior / tier3 / tier2 / faang). Pulls
// the user's current state + tier gates, primes the LLM to deliver a
// 5-minute "here's what to focus on / here's what you've got" briefing.
//
// LLM is expected to:
//   - Confirm what the user CAN demonstrate (their strongest dims)
//   - Surface the most likely "trip-up" dims given their target
//   - Suggest a 5-minute warmup routine
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import { callController } from "../utils/captureRes.js";
import { get6DReport } from "../../controllers/stats.controller.js";
import { wrapUserContent } from "../utils/safeOutput.js";

const argsSchema = z
  .object({
    target_tier: z.enum(["junior", "tier3", "tier2", "faang"]).optional(),
  })
  .strict();

async function handler(args) {
  const { userId, teamId, globalRole, teamRole } = getMcpContext();
  if (!teamId) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "I tried to run a pre-interview brief but my account has no active team. Can you help me set one up?",
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
  const targetTier = args?.target_tier;

  // Find the user's three strongest active dims and three weakest active dims.
  const active = dims.filter((d) => d.status === "active" && typeof d.score === "number");
  const sortedDesc = [...active].sort((a, b) => b.score - a.score);
  const top3 = sortedDesc.slice(0, 3);
  const bottom3 = sortedDesc.slice(-3).reverse();

  const tierTargetText = targetTier
    ? `My target tier: ${targetTier.toUpperCase()}.\n`
    : `(No specific target tier given — give a generalist brief.)\n`;

  const primerText =
    `I have an interview coming up — please give me a 5-minute pre-interview brief.\n\n` +
    `Current overall: ${overall ?? "(unknown)"}/100.\n` +
    tierTargetText +
    `\nMy strongest active dimensions:\n` +
    top3.map((d) => `  - ${d.key}: ${d.score}/100`).join("\n") +
    `\n\nMy weakest active dimensions:\n` +
    bottom3.map((d) => `  - ${d.key}: ${d.score}/100`).join("\n") +
    `\n\nPlease:\n` +
    `1. Confirm what I can confidently demonstrate (highest-confidence claims I should be ready to make).\n` +
    `2. Surface the top 2 likely trip-up areas for ${targetTier ? targetTier.toUpperCase() : "any tier"} interviews.\n` +
    `3. Recommend a 5-minute warmup routine based on my weak dims.\n` +
    `4. Be calibrated — if a dim has small sample size (low n), don't oversell it.`;

  return {
    description: targetTier
      ? `Pre-interview brief targeted at ${targetTier.toUpperCase()} readiness.`
      : "Pre-interview brief (generalist).",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: wrapUserContent("brief_primer", primerText, { maxChars: 6000 }),
        },
      },
    ],
  };
}

export function register(server) {
  server.registerPrompt(
    "pre-interview-brief",
    {
      title: "Pre-interview brief",
      description:
        "Quick pre-interview briefing. Optionally pass target_tier (junior|tier3|tier2|faang) " +
        "to focus the brief on what the user needs to show vs. their actual strengths and gaps. " +
        "LLM produces: confidence-calibrated 'what you can demonstrate', top trip-up areas for " +
        "that tier, 5-minute warmup routine.",
      argsSchema: argsSchema.shape,
    },
    handler,
  );
}

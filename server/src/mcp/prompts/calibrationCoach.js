// ============================================================================
// MCP prompt — calibration-coach
// ============================================================================
//
// Pre-submission prediction game. Reads D10 calibration data, primes the
// LLM to walk the user through:
//
//   1. "Predict your codeCorrectness score (1-10) before I check the AI review."
//   2. Compare prediction vs. actual.
//   3. Track the gap over time.
//
// Kruger-Dunning 1999 — explicit prediction practice closes the calibration
// gap faster than any other intervention.
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
            text: "I tried to run calibration coaching but my account has no active team.",
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
  const v = report?.analytics?.verification;
  const d10 = (report?.dimensions || []).find((d) => d.key === "verificationMetacognition");

  const stateLine = v
    ? `Calibration delta: ${(v.calibrationDelta * 100).toFixed(0)}% (smaller is better; perfect = 0%).\n` +
      `Sample size: ${v.calibrationN} data points across ${v.reviewCount} AI reviews.\n` +
      `Source quality tier: ${v.sourceQuality}.\n` +
      `Wrong-pattern flags: ${v.wrongPatternCount}.\n`
    : `D10 (calibration) is ${d10?.activationMessage || "not yet active — needs ≥5 AI-reviewed solutions"}.\n` +
      `Even without D10, I want to practice prediction.`;

  const primerText =
    `Let's run a calibration coaching session — pre-submission prediction game.\n\n` +
    `My current state:\n${stateLine}\n` +
    `Procedure I want you to run:\n` +
    `1. Ask me to share a solution I haven't yet submitted for AI review.\n` +
    `2. Before I show you the code, ask me: "On a 1-10 scale, what's your predicted codeCorrectness score?"\n` +
    `3. Then look at the code, give me YOUR honest 1-10 estimate.\n` +
    `4. Compare predictions. If we differ by ≥2, dig into why.\n` +
    `5. After I submit and the real AI review comes back, we compare to the actual score.\n` +
    `6. Track the pattern: am I systematically over- or under-confident?\n\n` +
    `Goal: shrink my calibration gap by training the prediction muscle, ` +
    `not by writing better code in the moment. (Kruger-Dunning 1999.)`;

  return {
    description: "Calibration coaching session — pre-submission prediction game using D10 data.",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: wrapUserContent("calibration_primer", primerText, { maxChars: 5000 }),
        },
      },
    ],
  };
}

export function register(server) {
  server.registerPrompt(
    "calibration-coach",
    {
      title: "Calibration coaching",
      description:
        "Pre-submission prediction game. Reads D10 calibration data + wrong-pattern flags, " +
        "primes the LLM to walk through the prediction game (Kruger-Dunning 1999). User predicts " +
        "their codeCorrectness score before submitting; LLM compares to AI's actual rating; gap " +
        "shrinks over repeated practice. The most direct way to train calibration as a measurable skill.",
      argsSchema: argsSchema.shape,
    },
    handler,
  );
}

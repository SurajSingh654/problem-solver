// ============================================================================
// MCP prompt — pattern-deep-dive
// ============================================================================
//
// Coaching template for ONE pattern. User passes pattern name (e.g.
// "Two Pointers"), prompt pulls their current state for that pattern +
// nearby recommendations, primes the LLM to do a focused coaching pass.
// ============================================================================

import { z } from "zod";
import { getMcpContext } from "../context.js";
import { callController } from "../utils/captureRes.js";
import { get6DReport } from "../../controllers/stats.controller.js";
import { wrapUserContent } from "../utils/safeOutput.js";

const argsSchema = z
  .object({
    pattern: z.string().min(1).max(80),
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
            text: "I tried to run a pattern deep-dive but my account has no active team. Can you help?",
          },
        },
      ],
    };
  }

  const requested = args.pattern;
  const captured = await callController(get6DReport, {
    user: { id: userId, globalRole, currentTeamId: teamId, teamRole },
    teamId,
  });
  const report = captured?.data?.report;
  const d1 = (report?.dimensions || []).find((d) => d.key === "patternRecognition");
  const matrix = Array.isArray(d1?.patternMatrix) ? d1.patternMatrix : [];

  // Case-insensitive match — accommodates LLM variations ("two pointers" vs "Two Pointers")
  const found = matrix.find(
    (r) => r.pattern.toLowerCase() === requested.toLowerCase(),
  );
  const stateLine = found
    ? `Current state: ${found.state}. solves=${found.solves}, coldSolves=${found.coldSolves}, ` +
      `difficulties=[${found.difficulties.join(", ") || "none yet"}], ` +
      `retained=${found.retained}, isFAANGCore=${found.isCore}.`
    : `Pattern '${requested}' not found in canonical taxonomy. ` +
      `If it's a custom pattern, treat as UNTOUCHED and explain the chunk-recognition fundamentals.`;

  const primerText =
    `Coach me on the "${requested}" pattern. Here's where I am:\n\n` +
    `${stateLine}\n\n` +
    `Please:\n` +
    `1. Briefly explain when this pattern applies vs. doesn't (so I can recognize it under pressure).\n` +
    `2. Walk me through 1 representative problem I should solve next, given my current state.\n` +
    `3. If I'm UNTOUCHED, start with the recognition fundamentals.\n` +
    `4. If I'm WORKING, push toward SOLID — what's missing?\n` +
    `5. If I'm SOLID/OWNED, suggest harder variants or interview-style follow-ups.\n` +
    `6. Be calibrated — don't claim I'm strong if I haven't actually shown it.`;

  return {
    description: `Coaching deep-dive on the '${requested}' pattern, grounded in mastery state.`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: wrapUserContent("pattern_primer", primerText, { maxChars: 4000 }),
        },
      },
    ],
  };
}

export function register(server) {
  server.registerPrompt(
    "pattern-deep-dive",
    {
      title: "Pattern deep-dive coaching",
      description:
        "Focused coaching on a single coding pattern (e.g. 'Two Pointers'). Pulls the user's " +
        "mastery state for that pattern (UNTOUCHED / TOUCHED / WORKING / SOLID / OWNED), then " +
        "primes the LLM to coach at the appropriate level — fundamentals if untouched, harder " +
        "variants if owned. Grounds advice in actual data, not guesses.",
      argsSchema: argsSchema.shape,
    },
    handler,
  );
}

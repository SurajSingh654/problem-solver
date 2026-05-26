// ============================================================================
// MCP prompts registry — central registration point for prompts
// ============================================================================
//
// Same shape as tools/index.js but for prompts. Each prompt module exports
// a `register(server)` function that calls `server.registerPrompt(...)`
// with its name, schema, and handler.
//
// Prompts differ from tools in that:
//   - User INVOKES them explicitly (often via slash command in the MCP client)
//   - They return a list of `messages` to seed a conversation (not a tool result)
//   - They're read-only by definition (just compose data into a primer message)
// ============================================================================

import { register as registerWeeklyCheckin } from "./weeklyPrepCheckin.js";
import { register as registerPreInterviewBrief } from "./preInterviewBrief.js";
import { register as registerPatternDeepDive } from "./patternDeepDive.js";
import { register as registerCalibrationCoach } from "./calibrationCoach.js";

/**
 * Wrap a prompt handler in an error boundary — same pattern as tools.
 * Without this, a thrown error returns an opaque 500 with no body.
 */
function withErrorBoundary(promptName, handler) {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const stack = err?.stack || err?.message || String(err);
      console.error(`[mcp:prompt:${promptName}] error:\n${stack}`);
      return {
        description: `Prompt '${promptName}' failed; the user can retry or check server logs.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `I tried to run the '${promptName}' prompt but it failed server-side. ` +
                `Please tell me what went wrong if you can introspect, or suggest I retry.`,
            },
          },
        ],
      };
    }
  };
}

export function registerAllPrompts(server) {
  const originalRegister = server.registerPrompt.bind(server);
  server.registerPrompt = (name, def, handler) =>
    originalRegister(name, def, withErrorBoundary(name, handler));

  registerWeeklyCheckin(server);
  registerPreInterviewBrief(server);
  registerPatternDeepDive(server);
  registerCalibrationCoach(server);
}

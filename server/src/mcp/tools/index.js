// ============================================================================
// MCP tool registry — central registration point
// ============================================================================
//
// Add new tools here. The McpServer's `registerTool` is called once per
// tool from `registerAllTools(server)`. Keeping the call site in one
// place makes it easy to:
//   - See the full tool surface at a glance
//   - Test the registration shape in isolation
//   - Gate tools behind feature flags if needed
//
// Each tool module exports a `register(server)` function that calls
// `server.registerTool(...)` with its name, schema, and handler. Tool
// implementations live in their own files (one per tool).
// ============================================================================

import { register as registerReadinessReport } from "./readinessReport.js";
import { register as registerPatternMatrix } from "./patternMatrix.js";
import { register as registerReviewQueue } from "./reviewQueue.js";
import { register as registerDimBreakdown } from "./dimBreakdown.js";
import { register as registerRecommendedProblems } from "./recommendedProblems.js";
import { register as registerTeamLeaderboard } from "./teamLeaderboard.js";
import { register as registerCalibrationStatus } from "./calibrationStatus.js";

/**
 * Wrap a tool handler so that any thrown error is:
 *   1. Logged server-side with full stack trace (debugging visibility)
 *   2. Returned to the LLM as an isError MCP response (no opaque 500s)
 *
 * Without this wrapper, an uncaught exception in a tool handler bubbles
 * up to the SDK transport, which returns a generic 500 with no body —
 * making MCP debugging impossible from the client side.
 */
function withErrorBoundary(toolName, handler) {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const stack = err?.stack || err?.message || String(err);
      console.error(`[mcp:tool:${toolName}] error:\n${stack}`);
      return {
        content: [
          {
            type: "text",
            text: `Tool '${toolName}' failed. Server-side error logged. ` +
              `(Generic message — full stack in server logs to avoid leaking internals.)`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Register every read-only tool with the McpServer instance.
 * Called once at server startup from src/mcp/server.js.
 *
 * Each tool is wrapped in withErrorBoundary so failures are observable
 * server-side and return graceful isError responses client-side.
 */
export function registerAllTools(server) {
  // Capture the original registerTool so we can wrap handlers transparently.
  const originalRegister = server.registerTool.bind(server);
  server.registerTool = (name, def, handler) =>
    originalRegister(name, def, withErrorBoundary(name, handler));

  registerReadinessReport(server);
  registerPatternMatrix(server);
  registerReviewQueue(server);
  registerDimBreakdown(server);
  registerRecommendedProblems(server);
  registerTeamLeaderboard(server);
  registerCalibrationStatus(server);
}

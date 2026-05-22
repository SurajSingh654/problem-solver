// ============================================================================
// MCP SERVICE — Lazy stdio bridge to the external Python `repo-brain` server.
// ============================================================================
//
// The Express server acts as an MCP host: on the first /api/v1/learn-ai/* call
// we spawn `uv --directory $LEARN_AI_REPO_PATH run learn-ai mcp-repo-brain` as
// a subprocess and hold the MCP session for the lifetime of the Node process.
// Subsequent calls reuse the session (cold start ~1–3s, warm calls ~50ms).
//
// Stdout discipline: the Python server speaks JSON-RPC over stdout. The SDK's
// StdioClientTransport owns the pipes — we MUST NOT inherit/pipe stdout
// elsewhere, or any non-frame byte will corrupt the wire. We pipe stderr to
// our logger so we can see Python crashes.
//
// Errors are typed (not stringly): callers map { code, message } onto HTTP
// statuses in the controller. See learnAi.controller.js::mapMcpError.
// ============================================================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  LEARN_AI_ENABLED,
  LEARN_AI_REPO_PATH,
  LEARN_AI_SPAWN_TIMEOUT_MS,
  LEARN_AI_CALL_TIMEOUT_MS,
} from "../config/env.js";

let client = null;
let transport = null;
let connectingPromise = null;

class McpServiceError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "McpServiceError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function withTimeout(promise, ms, code, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new McpServiceError(code, `${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Internal: spawn + connect. Concurrent callers share one in-flight connect.
async function connect() {
  if (client) return client;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const t = new StdioClientTransport({
      command: "uv",
      args: [
        "--directory",
        LEARN_AI_REPO_PATH,
        "run",
        "learn-ai",
        "mcp-repo-brain",
      ],
      // Inherit stderr so Python tracebacks land in our logs;
      // stdout is owned by the transport for JSON-RPC frames.
      stderr: "inherit",
    });

    const c = new Client(
      { name: "probsolver", version: "1.0.0" },
      { capabilities: {} },
    );

    // Reset the singletons on any unexpected close so the next call respawns.
    t.onclose = () => {
      if (transport === t) {
        console.warn("[mcp] transport closed; will respawn on next call");
        client = null;
        transport = null;
      }
    };
    t.onerror = (err) => {
      console.error("[mcp] transport error:", err?.message || err);
    };

    await withTimeout(
      c.connect(t),
      LEARN_AI_SPAWN_TIMEOUT_MS,
      "MCP_SPAWN_TIMEOUT",
      "MCP server spawn",
    );

    client = c;
    transport = t;
    return c;
  })().finally(() => {
    connectingPromise = null;
  });

  return connectingPromise;
}

/**
 * Call a tool on the Python `repo-brain` server.
 *
 * Throws McpServiceError with one of:
 *   MCP_DISABLED         — feature flag off
 *   MCP_NOT_CONFIGURED   — LEARN_AI_REPO_PATH unset
 *   MCP_SPAWN_TIMEOUT    — subprocess didn't respond to handshake in time
 *   MCP_CALL_TIMEOUT     — tool call exceeded LEARN_AI_CALL_TIMEOUT_MS
 *   MCP_TOOL_ERROR       — tool returned isError=true (structured tool error)
 *   MCP_INTERNAL         — anything else (transport crash, bad JSON, etc.)
 *
 * @param {string} name — tool name (e.g. "search_code")
 * @param {Object} args — tool arguments (validated by the route's Zod schema)
 * @returns {Promise<unknown>} parsed tool result content
 */
export async function callMcpTool(name, args) {
  if (!LEARN_AI_ENABLED) {
    throw new McpServiceError(
      "MCP_DISABLED",
      "Learn-AI brain is not enabled on this server.",
    );
  }
  if (!LEARN_AI_REPO_PATH) {
    throw new McpServiceError(
      "MCP_NOT_CONFIGURED",
      "LEARN_AI_REPO_PATH is not set.",
    );
  }

  // Up to one transparent retry: if the held session died between calls,
  // null'd singletons will re-spawn. Don't loop further — that masks real bugs.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const c = await connect();
      const result = await withTimeout(
        c.callTool({ name, arguments: args }),
        LEARN_AI_CALL_TIMEOUT_MS,
        "MCP_CALL_TIMEOUT",
        `tool ${name}`,
      );

      if (result?.isError) {
        // FastMCP wraps Python exceptions as text content with isError=true.
        const text = extractText(result);
        throw new McpServiceError(
          "MCP_TOOL_ERROR",
          text || `Tool ${name} returned an error.`,
          { tool: name },
        );
      }

      return parseContent(result);
    } catch (err) {
      if (err instanceof McpServiceError) throw err;

      // Transport-level failure — null the singletons and retry once.
      const isFirstAttempt = attempt === 0;
      const looksTransient =
        err?.code === "ERR_STREAM_PREMATURE_CLOSE" ||
        /closed|EPIPE|ECONNRESET|disconnected/i.test(err?.message || "");
      if (isFirstAttempt && looksTransient) {
        console.warn(
          `[mcp] transient error on tool ${name}; retrying once: ${err.message}`,
        );
        client = null;
        transport = null;
        continue;
      }

      throw new McpServiceError(
        "MCP_INTERNAL",
        err?.message || `Tool ${name} failed.`,
      );
    }
  }
  // Unreachable — the loop either returns or throws.
  throw new McpServiceError("MCP_INTERNAL", "unreachable");
}

// FastMCP serializes tool return values as content[] entries. Most tools
// return JSON-as-text; some return plain strings. We prefer the structured
// result if present (modern SDK), else parse the first text block.
function parseContent(result) {
  if (result?.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const text = extractText(result);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractText(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  for (const b of blocks) {
    if (b?.type === "text" && typeof b.text === "string") return b.text;
  }
  return null;
}

/** Graceful shutdown — called from the SIGTERM handler in index.js. */
export async function closeMcpClient() {
  if (!client && !transport) return;
  try {
    await client?.close?.();
  } catch (err) {
    console.warn("[mcp] error closing client:", err?.message || err);
  }
  try {
    await transport?.close?.();
  } catch (err) {
    console.warn("[mcp] error closing transport:", err?.message || err);
  }
  client = null;
  transport = null;
}

// Test seam — production code should never call these. Tests use them to
// reset module-level state between cases without spawning real subprocesses.
export const __testing = {
  reset() {
    client = null;
    transport = null;
    connectingPromise = null;
  },
  injectClient(c) {
    client = c;
  },
};

export { McpServiceError };

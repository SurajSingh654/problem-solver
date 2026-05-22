// ============================================================================
// Learn-AI controllers — wrap each MCP tool as an Express handler.
// ============================================================================
//
// Each handler is a one-liner: validated body → callMcpTool → response
// envelope. Errors from the service layer are typed (McpServiceError); we
// translate them to HTTP statuses in mapMcpError() below so route consumers
// see a consistent shape.
// ============================================================================

import { callMcpTool, McpServiceError } from "../services/mcp.service.js";
import { success, error } from "../utils/response.js";

function mapMcpError(res, err) {
  if (!(err instanceof McpServiceError)) {
    return error(res, err?.message || "Unexpected error.", 500, "LEARN_AI_INTERNAL");
  }
  switch (err.code) {
    case "MCP_DISABLED":
      return error(res, err.message, 503, "LEARN_AI_DISABLED");
    case "MCP_NOT_CONFIGURED":
      return error(res, err.message, 503, "LEARN_AI_NOT_CONFIGURED");
    case "MCP_SPAWN_TIMEOUT":
      return error(res, err.message, 504, "MCP_SPAWN_TIMEOUT");
    case "MCP_CALL_TIMEOUT":
      return error(res, err.message, 504, "MCP_CALL_TIMEOUT");
    case "MCP_TOOL_ERROR":
      return error(res, err.message, 502, "MCP_TOOL_ERROR", err.details);
    default:
      return error(res, err.message, 500, "LEARN_AI_INTERNAL");
  }
}

async function callAndRespond(res, toolName, args) {
  try {
    const result = await callMcpTool(toolName, args);
    return success(res, { tool: toolName, result });
  } catch (err) {
    return mapMcpError(res, err);
  }
}

export async function searchCode(req, res) {
  return callAndRespond(res, "search_code", req.body);
}

export async function searchDocs(req, res) {
  return callAndRespond(res, "search_docs", req.body);
}

export async function findSimilar(req, res) {
  return callAndRespond(res, "find_similar", req.body);
}

export async function explainSymbol(req, res) {
  return callAndRespond(res, "explain_symbol", req.body);
}

export async function recentChanges(req, res) {
  return callAndRespond(res, "recent_changes", req.body);
}

export async function readChunk(req, res) {
  return callAndRespond(res, "read_chunk", req.body);
}

export async function deepExplain(req, res) {
  return callAndRespond(res, "deep_explain", req.body);
}

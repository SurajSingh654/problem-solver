// ============================================================================
// MCP request context — AsyncLocalStorage for tool handlers
// ============================================================================
//
// PROBLEM:
//   The MCP SDK's tool handler signature is `(args) => result`. There's no
//   `req` argument. So when a tool runs, it has no direct access to the
//   authenticated user/team that the Express middleware established.
//
// SOLUTION:
//   AsyncLocalStorage. Express middleware sets up the context BEFORE
//   calling `transport.handleRequest(...)`, propagating it through the
//   async call chain — including the SDK's internal handlers and our
//   tool handlers — without needing to thread it through every function.
//
// USAGE:
//   In Express handler:
//     mcpContext.run({ userId, teamId, ... }, () => transport.handleRequest(...))
//
//   In a tool handler:
//     const { userId, teamId } = getMcpContext();
//     // teamId may be null for users without a current team. Tool handlers
//     // should reject closed (return an MCP-shaped error) when team context
//     // is required but missing.
//
// SECURITY INVARIANT:
//   Tool handlers MUST read userId/teamId from this context, NOT from tool
//   args. The args come from the LLM client and are NOT trusted. The
//   context comes from the JWT, which the auth middleware already verified.
//
// LEAK GUARANTEE:
//   AsyncLocalStorage is request-scoped — it cannot leak between concurrent
//   requests. Two simultaneous MCP calls from different users will see
//   different contexts. If you ever see a tool handler returning data from
//   the wrong user, it means we're calling getMcpContext() OUTSIDE the
//   .run() block — which would throw the explicit error below.
// ============================================================================

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * @typedef {object} McpRequestContext
 * @property {string} userId       — JWT-verified user ID
 * @property {string|null} teamId  — Current team (null if user has no team)
 * @property {string} jti          — Token JTI (for audit trails / revocation lookup)
 * @property {string|null} globalRole — SUPER_ADMIN | USER (rarely needed in MCP)
 * @property {string|null} teamRole  — TEAM_ADMIN | MEMBER | null
 */

/** @type {AsyncLocalStorage<McpRequestContext>} */
export const mcpContext = new AsyncLocalStorage();

/**
 * Read the current request's auth context from AsyncLocalStorage.
 * Throws if called outside an MCP request — that means a tool handler
 * is being invoked without context, which is a bug we want to surface
 * loudly rather than silently leak data.
 */
export function getMcpContext() {
  const ctx = mcpContext.getStore();
  if (!ctx) {
    throw new Error(
      "[mcp:context] No request context found. " +
      "Tool handlers must run inside mcpContext.run(...). " +
      "If you see this in production, the Express middleware is misconfigured.",
    );
  }
  return ctx;
}

/**
 * Variant that returns null instead of throwing — useful for code paths
 * that work both inside and outside an MCP request (rare but possible).
 */
export function tryGetMcpContext() {
  return mcpContext.getStore() ?? null;
}

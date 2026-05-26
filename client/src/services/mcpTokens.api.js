// ============================================================================
// MCP tokens — API client (Phase MCP-4-UI)
// ============================================================================
// Per-user issuance / listing / revocation of MCP bearer tokens.
// Server endpoints: POST/GET/DELETE /api/v1/users/me/mcp-tokens
// (also mounted at /api/users/me/mcp-tokens via the dual-prefix mountRoutes).
// ============================================================================
import api from "./api.js";

export const mcpTokensApi = {
    list:   ()        => api.get("/users/me/mcp-tokens"),
    create: (data)    => api.post("/users/me/mcp-tokens", data),
    revoke: (jti)     => api.delete(`/users/me/mcp-tokens/${jti}`),
};

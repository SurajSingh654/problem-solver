-- ============================================================================
-- MCP read-only server — RevokedMcpToken table
-- ============================================================================
-- Token revocation list for MCP-scoped JWTs. Every MCP token carries a `jti`
-- claim; middleware checks this table on every request (with 60s in-memory
-- cache to avoid per-request DB round-trip).
--
-- See:
--   - docs/AGENT_TOOLING_REFERENCE.md (architecture decision log)
--   - server/prisma/schema.prisma (model RevokedMcpToken)
--   - mcp-server-readonly roadmap entry
-- ============================================================================

CREATE TABLE "revoked_mcp_tokens" (
    "jti"        TEXT       NOT NULL,
    "userId"     TEXT       NOT NULL,
    "reason"     TEXT       NOT NULL,
    "issuedAt"   TIMESTAMP(3) NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "revokedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedIp" TEXT,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "revoked_mcp_tokens_pkey" PRIMARY KEY ("jti")
);

-- Cascade-delete revocation rows when the user is deleted (mirrors User
-- relation `revokedMcpTokens` with onDelete: Cascade).
ALTER TABLE "revoked_mcp_tokens"
    ADD CONSTRAINT "revoked_mcp_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Hot path: jti lookup on every MCP request. Even though jti is the PK
-- (B-tree index by default), an explicit index here documents intent
-- and matches the `@@index([jti])` declaration in schema.prisma.
CREATE INDEX "revoked_mcp_tokens_jti_idx" ON "revoked_mcp_tokens"("jti");

-- Cleanup cron: select rows where expiresAt + 7 days < now().
CREATE INDEX "revoked_mcp_tokens_expiresAt_idx"
    ON "revoked_mcp_tokens"("expiresAt");

-- Settings page: "show me my revoked tokens" — userId + revokedAt desc.
CREATE INDEX "revoked_mcp_tokens_userId_revokedAt_idx"
    ON "revoked_mcp_tokens"("userId", "revokedAt" DESC);

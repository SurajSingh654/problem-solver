-- ============================================================================
-- Evolve revoked_mcp_tokens → mcp_tokens
-- ============================================================================
-- Phase MCP-4 expands the original revocation-list table to track ALL
-- issued tokens (active + revoked), so the settings page can list and
-- manage them.
--
-- Changes:
--   1. Rename table: revoked_mcp_tokens → mcp_tokens
--   2. Make revokedAt nullable (was DEFAULT NOW())
--   3. Rename `reason` → `revokedReason`
--   4. Add `name` field (TEXT, nullable, user-given label)
--   5. Replace `userId + revokedAt DESC` index with `userId + issuedAt DESC`
--      (more useful for "show me my tokens" listing)
--
-- Existing rows: any rows already in the old table become "revoked" rows
-- in the new schema (revokedAt has a value because of the DEFAULT NOW();
-- once we drop the default, the value stays).
-- ============================================================================

-- 1. Rename the table.
ALTER TABLE "revoked_mcp_tokens" RENAME TO "mcp_tokens";

-- 2. Make revokedAt nullable + drop the default.
ALTER TABLE "mcp_tokens" ALTER COLUMN "revokedAt" DROP DEFAULT;
ALTER TABLE "mcp_tokens" ALTER COLUMN "revokedAt" DROP NOT NULL;

-- 3. Rename `reason` → `revokedReason` + make nullable (active rows have no reason).
ALTER TABLE "mcp_tokens" RENAME COLUMN "reason" TO "revokedReason";
ALTER TABLE "mcp_tokens" ALTER COLUMN "revokedReason" DROP NOT NULL;

-- 4. Add `name` field for user-given labels.
ALTER TABLE "mcp_tokens" ADD COLUMN "name" TEXT;

-- 5. Drop old index, add new index.
DROP INDEX IF EXISTS "revoked_mcp_tokens_jti_idx";
DROP INDEX IF EXISTS "revoked_mcp_tokens_expiresAt_idx";
DROP INDEX IF EXISTS "revoked_mcp_tokens_userId_revokedAt_idx";

CREATE INDEX "mcp_tokens_jti_idx" ON "mcp_tokens"("jti");
CREATE INDEX "mcp_tokens_expiresAt_idx" ON "mcp_tokens"("expiresAt");
CREATE INDEX "mcp_tokens_userId_issuedAt_idx" ON "mcp_tokens"("userId", "issuedAt" DESC);

-- 6. Rename the foreign-key constraint for clarity (optional but matches schema).
ALTER TABLE "mcp_tokens" RENAME CONSTRAINT "revoked_mcp_tokens_userId_fkey" TO "mcp_tokens_userId_fkey";

-- 7. Rename primary-key constraint.
ALTER TABLE "mcp_tokens" RENAME CONSTRAINT "revoked_mcp_tokens_pkey" TO "mcp_tokens_pkey";

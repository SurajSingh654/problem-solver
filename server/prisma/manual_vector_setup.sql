-- ============================================================================
-- pgvector setup — run after Prisma migration
-- ============================================================================

-- Enable the extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Problem embeddings ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_problems_embedding_hnsw
  ON problems
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_problems_team_embedding
  ON problems ("teamId")
  WHERE embedding IS NOT NULL;

-- ── Solution embeddings ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_solutions_embedding_hnsw
  ON solutions
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_solutions_team_embedding
  ON solutions ("teamId")
  WHERE embedding IS NOT NULL;

-- ============================================================================
-- Partial indexes for soft deletes (PostgreSQL-specific optimization)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (email)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_teams_active
  ON teams (status, "createdAt")
  WHERE "deletedAt" IS NULL;

-- ============================================================================
-- Performance: covering indexes for hot paths
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_solutions_leaderboard
  ON solutions ("teamId", "userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_solutions_review_queue
  ON solutions ("userId", "teamId", "nextReviewDate")
  WHERE "nextReviewDate" IS NOT NULL;
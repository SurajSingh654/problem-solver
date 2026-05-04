-- Baseline: registers HNSW vector indexes and composite solution index
-- that were created via manual_vector_setup.sql outside Prisma's migration
-- system. These already exist in the database. This file exists only to
-- resolve drift detection — it is safe to re-run due to IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS "idx_problems_embedding_hnsw"
    ON "problems" USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "idx_solutions_embedding_hnsw"
    ON "solutions" USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "idx_solutions_leaderboard"
    ON "solutions"("teamId", "userId", "createdAt" DESC);
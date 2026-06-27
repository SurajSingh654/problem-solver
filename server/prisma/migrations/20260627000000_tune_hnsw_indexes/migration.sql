-- Sprint 4.2c: Tune HNSW vector indexes for the 10k+ scale tier.
--
-- Previous parameters (m=16, ef_construction=64) are pgvector defaults
-- tuned for small (<1k vector) workloads. As the system grows past 10k
-- vectors per table, recall on hard queries degrades. The audit
-- (Sprint 1 M13, 2026-06-20) flagged these as untuned.
--
-- New parameters (m=24, ef_construction=128):
--   * m=24: ~1.5× memory of m=16; raises the recall ceiling for the
--     10k-100k row range. Build time ~2× of m=16 (one-time cost).
--   * ef_construction=128: 2× the default construction-time candidate
--     list. Better graph quality (more bidirectional links validated).
--
-- HNSW parameters cannot be ALTERed in place. Pattern: DROP + CREATE.
-- At current scale (<1k vectors per table), index rebuild completes in
-- seconds with a brief write-lock window — acceptable.
--
-- ef_search (query-time recall/speed knob) is left at the Postgres
-- default of 40 — adequate for top-3 retrieval (RAG_TEAMMATE_LIMIT=3
-- in rag.service.js). Revisit if telemetry shows poor recall.

-- ── Problems ───────────────────────────────────────────
DROP INDEX IF EXISTS "idx_problems_embedding_hnsw";
CREATE INDEX "idx_problems_embedding_hnsw"
    ON "problems" USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 128);

-- ── Solutions ──────────────────────────────────────────
DROP INDEX IF EXISTS "idx_solutions_embedding_hnsw";
CREATE INDEX "idx_solutions_embedding_hnsw"
    ON "solutions" USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 128);

-- ── Notes ──────────────────────────────────────────────
DROP INDEX IF EXISTS "idx_notes_embedding_hnsw";
CREATE INDEX "idx_notes_embedding_hnsw"
    ON "notes" USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 128);

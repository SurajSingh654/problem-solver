# HNSW Index Tuning — Design Spec (Sprint 4.2c)

**Date:** 2026-06-27
**Sprint:** 4.2c (third slice of decomposed Sprint 4.2 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit finding closed:** M13
**Branch:** `feat/hnsw-tuning`
**Layers on:** main, post Sprint 4.2b (`0b3ec98`)
**Feature flag:** None — schema migration only; no application code path changes

---

## Problem

Sprint 1 audit, M13 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` line 165):

> `prisma/migrations/20260802000001_baseline_vector_indexes/migration.sql:6-12` — HNSW `m=16, ef_construction=64` are defaults; not tuned for 10k+ scale.

The current parameters are pgvector defaults intended for small workloads (<1k vectors per index). As the system grows past 10k vectors per table (solutions / problems / notes), recall on hard queries — where the true nearest neighbors are not also the local-cluster nearest — degrades. The graph's branching factor (`m`) caps how many bidirectional links each node maintains; `ef_construction` controls how exhaustively candidate links are evaluated at build time. Both are too low for scale.

### Zero-trust verification (current state)

All 3 HNSW indexes use identical default parameters:

| Index | Migration file | Parameters |
| --- | --- | --- |
| `idx_problems_embedding_hnsw` | `20260802000001_baseline_vector_indexes/migration.sql:6-8` | `m=16, ef_construction=64` |
| `idx_solutions_embedding_hnsw` | `20260802000001_baseline_vector_indexes/migration.sql:10-12` | `m=16, ef_construction=64` |
| `idx_notes_embedding_hnsw` | `20261001000000_add_notes_flashcards/migration.sql:48-50` | `m=16, ef_construction=64` |

No `ef_search` is explicitly set anywhere in `server/src/`. Postgres session default applies (`ef_search=40`).

---

## Principle

A targeted DB tuning. Single migration file. Three index rebuilds. No application code changes. No new tests (parameter assertions would verify our own SQL — circular).

The decisions worth flagging up front:

1. **m=24, ef_construction=128.** Mid-tier production parameters. ~1.5× memory of m=16, ~2× build time. Covers the 10k-100k vector range cleanly. Higher tiers (m=32, ef_construction=200+) reserved for >100k vectors — overkill for our scale.
2. **Plain DROP + CREATE, not CONCURRENTLY.** `prisma migrate deploy` wraps each migration in a transaction; `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. CONCURRENTLY would require a manual-psql-via-runbook workaround that adds operational surface for a benefit only relevant at scale we don't have yet. Brief write-lock during rebuild (~seconds at current row counts) is the tradeoff. Standing principle: don't add operational surface until you need it. Revisit when row counts justify the runbook complexity.
3. **`ef_search` left at default 40.** Query-time recall/speed knob. Adequate for `RAG_TEAMMATE_LIMIT_DEFAULT = 3` (Sprint 4.2b). Higher values benefit k > 10 or recall-critical workloads — not us. Revisit if RAG telemetry shows poor match quality.

---

## Scope

### In scope

- New migration file `server/prisma/migrations/20260627000000_tune_hnsw_indexes/migration.sql`.
- DROP + CREATE for 3 HNSW indexes: problems, solutions, notes.
- Header docstring documenting parameter choices + revisit conditions.

### Out of scope

- **CONCURRENTLY index rebuilds** — deferred until row counts AND write contention justify the runbook complexity.
- **`ef_search` query-time tuning** — defaults adequate at k=3.
- **`server/prisma/manual_vector_setup.sql`** legacy reference doc — left as a historical anchor; the new migration is the source of truth.
- **Future model upgrade migration** (text-embedding-3-large at 3072 dims would require rebuilding the vector columns entirely, not just the indexes) — out of scope; tracked separately under the M15 dimension-warning header comment in `embedding.service.js`.
- **Unit tests** — index parameters are runtime DB metadata; testing them via `pg_class` introspection would be circular self-reference. Verification happens via `prisma migrate status` and the post-apply pg_indexes smoke (see §"Test plan").

---

## Migration content

`server/prisma/migrations/20260627000000_tune_hnsw_indexes/migration.sql`:

```sql
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
```

### Why `DROP INDEX IF EXISTS` (defensive)

If a fresh DB seeded from a snapshot doesn't have the baseline index (e.g. local dev wipe), the DROP silently no-ops rather than failing. The matching `CREATE INDEX` (without `IF NOT EXISTS`) is intentional — we want a hard error if the rebuild fails, not a silent skip.

### Why DROP + CREATE, not ALTER

HNSW's `m` and `ef_construction` are graph-construction parameters. Postgres has no `ALTER INDEX` syntax to retune them — the graph itself has to be rebuilt against the existing vectors. DROP + CREATE is the only path.

### Migration execution flow

Standard Prisma flow (matches CLAUDE.md "Migration workflow"):

1. Migration file is manually authored (above content) by the implementer.
2. `npx prisma migrate deploy` applies it (each environment: local, Railway prod).
3. `npx prisma migrate status` confirms applied state.
4. **No `prisma generate` needed** — no `schema.prisma` changes (vector columns remain `Unsupported("vector(1536)")`).

### Concurrent-traffic behavior during the migration window

Each `DROP INDEX` + `CREATE INDEX` pair takes an `ACCESS EXCLUSIVE` lock on the table briefly. During the window:

- Vector queries against that table cannot use the index. Postgres falls back to sequential scan (the `embedding IS NOT NULL` predicate from rag.service.js + embedding.service.js queries still matches; just slower). At current row counts, seq scan latency is ~ms — tolerable.
- INSERTs/UPDATEs to the table wait briefly. Lock window is ~seconds at current scale.
- `rag.service.findSimilarTeammateSolutions` and `findProblemsByNoteEmbedding` are both wrapped in try/catch returning `[]` — even if a query lands DURING the lock-then-rebuild window and somehow errors, RAG context just goes empty for that one request. Graceful degradation.

Two layers of protection already in place from earlier sprints:

- **Sprint 4.1**: embedding-outbox retry queue catches embedding-write failures and retries.
- **Sprint 4.2b**: rag.service try/catch returns `[]` on any retrieval failure.

---

## Test plan

### No new unit tests

Index parameters are runtime DB metadata. A test asserting "this index has m=24" via `pg_class` introspection would verify our own SQL — circular self-reference. The right verification path:

| # | Verification | How |
| --- | --- | --- |
| V1 | Migration syntactically valid + applies cleanly | `npx prisma migrate deploy` exits 0 |
| V2 | Migration recorded in `_prisma_migrations` | `npx prisma migrate status` reports "up to date" |
| V3 | New parameters in `pg_indexes` | Manual smoke: query pg_indexes.indexdef for the 3 index names |
| V4 | No regression in existing tests | Full `npm test` at 1256 (post-4.2b baseline) |
| V5 | Vector queries functional end-to-end | Implicitly covered by V4 — rag.service tests mock Prisma, so the SQL shape passing is enough |

### V3 verification query

After migration completes, the implementer runs:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname IN (
  'idx_problems_embedding_hnsw',
  'idx_solutions_embedding_hnsw',
  'idx_notes_embedding_hnsw'
);
```

Expected: 3 rows, each `indexdef` containing the substring `WITH (m='24', ef_construction='128')`.

Note on format: pgvector renders the WITH clause with single-quoted string values in `pg_indexes.indexdef` (`m='24'` not `m=24`). The implementer should match Postgres' actual rendered format, not the SQL-source format.

### Post-deploy prod verification (operator runbook)

After the migration ships to Railway prod:

1. Railway deploy log shows `Applying migration '20260627000000_tune_hnsw_indexes'` followed by success.
2. Operator opens the Railway DB console (or `psql` against prod DATABASE_URL) → run the V3 query → confirm 3 rows with the tuned params.
3. Optional smoke: submit one solution → confirm RAG context populates in the resulting AI review (log line `[Embedding] Solution ...` appears).

If V3 fails on prod (e.g. one index didn't rebuild), the recovery is to manually run the failing CREATE statement via the Railway DB console + `prisma migrate resolve --applied 20260627000000_tune_hnsw_indexes` to mark it done.

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | New migration; 3 DROP + CREATE pairs; no data migration. |
| Token / session invalidation | None |
| Behavior change | None observable to users. HNSW is approximate; recall improvement at k=3 is sub-1% at current scale. |
| Latency | Per-query: marginally faster on hard queries (better graph). One-time build cost: seconds per index at current scale. |
| Lock window | `ACCESS EXCLUSIVE` per table for ~seconds. Mitigated by rag.service.js try/catch + Postgres' seq-scan fallback. |
| Memory footprint | ~1.5× per-index at m=24 vs m=16. Tiny at current row counts. |
| Rollback | Revert the migration file. (In practice unneeded — m=24 indexes are strictly better for our workload.) |
| Multi-replica safety | Single-replica today. Migration runs once. |
| OpenAI quota | Zero impact — no embedding regeneration. |
| Test runtime impact | Zero — no new tests. |

---

## Backward compatibility

- **Application code**: unchanged. No imports modified. No SQL queries modified.
- **Existing tests**: all stay green. rag.service tests mock Prisma — the SQL string they assert doesn't change.
- **Vector queries**: identical SQL; only the underlying index structure differs. Results may differ in tie-breaking order on near-tie similarity rankings, but the top-k set is stable for any reasonable distance margin.

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders / TBDs | None. The migration SQL is concrete. Verification queries are concrete. |
| Internal consistency | Three indexes, identical parameters, identical structure. Single migration file. |
| Scope | Tight: M13 only. CONCURRENTLY deferred (Prisma-tx incompatibility documented). `ef_search` deferred. `manual_vector_setup.sql` legacy doc untouched. Carved explicitly. |
| Ambiguity | One explicit call: plain DROP + CREATE over CONCURRENTLY (user-confirmed after the Prisma-tx incompatibility wrinkle was surfaced). |
| Adversarial review | Partial-failure during migration: per-table DROP succeeds + CREATE fails would leave the table without an HNSW index. Mitigation: `embedding IS NOT NULL` predicate + Postgres seq-scan fallback + rag.service try/catch. Queries stay correct, just slower. Recovery: manually run the failing CREATE + `prisma migrate resolve`. |
| Risk floor | Low. Single migration. No code change. No new tests. Rollback is "revert the migration file." Most surface area is operational documentation, not new attack surface. |

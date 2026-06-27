# Sprint 4.2c — HNSW Index Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tune the 3 HNSW vector indexes (`idx_problems_embedding_hnsw`, `idx_solutions_embedding_hnsw`, `idx_notes_embedding_hnsw`) from pgvector defaults (m=16, ef_construction=64) to production-tier values (m=24, ef_construction=128) via a single Prisma migration.

**Architecture:** New raw SQL migration file with 3 DROP + CREATE pairs. Plain (non-CONCURRENT) index rebuild — fits inside Prisma's standard `migrate deploy` flow. No application code changes, no new tests. Verification via `prisma migrate status` + manual `pg_indexes` smoke after apply.

**Tech Stack:** Postgres 16 + pgvector extension, Prisma 5 raw SQL migrations.

**Spec:** [`docs/superpowers/specs/2026-06-27-hnsw-tuning-design.md`](../specs/2026-06-27-hnsw-tuning-design.md)

**Branch:** `feat/hnsw-tuning`

**Baseline test count:** 1256 (post Sprint 4.2b, commit `0b3ec98`). Capture exact in Task 0. Target after sprint: **1256** (unchanged — no new tests, no test count drift).

---

## File map (locked decisions)

**Create:**
- `server/prisma/migrations/20260627000000_tune_hnsw_indexes/migration.sql` — 3 DROP + CREATE pairs with header docstring.

**Modify:**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 4.2c shipped (Task 2).

**Unchanged (explicitly):**
- `server/prisma/schema.prisma` — vector columns stay `Unsupported("vector(1536)")`. No model changes.
- `server/prisma/manual_vector_setup.sql` — legacy reference doc, left as historical anchor.
- All application code (`embedding.service.js`, `rag.service.js`, `embedding.outbox.js`, controllers).

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm on `main` with clean tree**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `main`, last commit `72f6a01` (the 4.2c spec). Pre-existing untracked files (`.claude/settings.json`, etc.) are OK.

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/hnsw-tuning
```
Expected: `Switched to a new branch 'feat/hnsw-tuning'`.

- [ ] **Step 3: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests   1256 passed` (or close). Record exact count. Target after sprint: same count (no new tests).

- [ ] **Step 4: Pre-push gate sanity**

Each must exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

If any fails, STOP and report BLOCKED.

NO commits in this task.

---

## Task 1: Create + apply the HNSW tuning migration

**Files:**
- Create: `server/prisma/migrations/20260627000000_tune_hnsw_indexes/migration.sql`

- [ ] **Step 1: Create the migration directory**

```bash
mkdir -p /Users/surajsingh/Downloads/Projects/problem-solver/server/prisma/migrations/20260627000000_tune_hnsw_indexes
```

- [ ] **Step 2: Write the migration file**

Create `server/prisma/migrations/20260627000000_tune_hnsw_indexes/migration.sql` with EXACTLY this content:

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

- [ ] **Step 3: Apply the migration to dev DB**

Per CLAUDE.md "Migration workflow", use `prisma migrate deploy` (NOT `migrate dev` — the drift-detection prompt triggers because of the `Unsupported("vector(...)")` placeholders).

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate deploy
```

Expected: `Applying migration '20260627000000_tune_hnsw_indexes'`. If you see `Database schema is up to date.` instead, the migration may have been partially applied already — proceed to Step 4 to confirm.

If a partial-failure error appears (e.g. "DROP succeeded but CREATE failed"), STOP and report BLOCKED with the exact error. The recovery path is: manually run the failing CREATE via psql, then `prisma migrate resolve --applied 20260627000000_tune_hnsw_indexes`.

- [ ] **Step 4: Confirm migration applied (V1 + V2)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```
Expected: output ends with `Database schema is up to date.` — no pending migrations.

The new migration name `20260627000000_tune_hnsw_indexes` should appear in the "applied migrations" list. If `migrate status` mentions any drift or pending state, STOP and investigate.

- [ ] **Step 5: V3 — verify new parameters in pg_indexes**

Run this SQL against the dev DB:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma db execute --stdin <<EOF
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname IN (
  'idx_problems_embedding_hnsw',
  'idx_solutions_embedding_hnsw',
  'idx_notes_embedding_hnsw'
)
ORDER BY indexname;
EOF
```

Expected: 3 rows. Each `indexdef` string should contain BOTH `m='24'` AND `ef_construction='128'` (note: pgvector renders the WITH clause with single-quoted string values in `pg_indexes.indexdef`).

If `npx prisma db execute --stdin` doesn't work for SELECT (Prisma's `db execute` is designed for DDL/DML; SELECT may fall through with no output), fall back to running the query via the project's preferred psql path:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && node --input-type=module -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.\$queryRawUnsafe(\`
  SELECT indexname, indexdef FROM pg_indexes
  WHERE indexname LIKE 'idx_%_embedding_hnsw' ORDER BY indexname
\`);
for (const r of rows) console.log(r.indexname + ' :: ' + r.indexdef);
await p.\$disconnect();
"
```

Expected output (3 lines, each containing the m='24' and ef_construction='128' substrings):
```
idx_notes_embedding_hnsw :: CREATE INDEX idx_notes_embedding_hnsw ON public.notes USING hnsw (embedding vector_cosine_ops) WITH (m='24', ef_construction='128')
idx_problems_embedding_hnsw :: ... WITH (m='24', ef_construction='128')
idx_solutions_embedding_hnsw :: ... WITH (m='24', ef_construction='128')
```

If ANY of the 3 rows lacks the tuned params, STOP and report — partial rollout means one table is mis-tuned.

- [ ] **Step 6: V4 — full server test suite (no regression)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: 1256 passed (unchanged from baseline). No new tests in this sprint.

- [ ] **Step 7: Server lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/prisma/migrations/20260627000000_tune_hnsw_indexes/migration.sql
git commit -m "Tune HNSW indexes to m=24, ef_construction=128 (M13)"
```

---

## Task 2: Final gates + push + FF-merge + roadmap update

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Re-run all pre-push gates**

Each exit 0:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```
Expected: 1256 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push the feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/hnsw-tuning
```
Expected: pre-push hook (~30-60s), passes. DO NOT use `--no-verify`. If the hook fails, paste output + STOP.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/hnsw-tuning && git push origin main
```
Expected: FF merge clean, push succeeds. The migration applies to prod when Railway picks up the new main HEAD (`prisma migrate deploy` runs as part of `npm run start:prod`).

- [ ] **Step 4: Update roadmap**

Edit `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`. Find:

```markdown
| 4.2c | HNSW index tuning (M13: m / ef_construction tuning + migration) | queued | — | — |
```

Replace with:

```markdown
| 4.2c | HNSW index tuning (M13 — bumped m=16→24, ef_construction=64→128 across 3 indexes for 10k+ scale; plain DROP+CREATE inside Prisma's standard migrate flow) | ✅ shipped | [`2026-06-27-hnsw-tuning-design.md`](../specs/2026-06-27-hnsw-tuning-design.md) | 2026-06-27 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 4.2c (HNSW index tuning) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main
```

- [ ] **Step 6: Post-deploy verification on prod (operator runbook)**

After Railway picks up the new main HEAD and the migration applies in prod:

1. Railway deploy log shows `Applying migration '20260627000000_tune_hnsw_indexes'` followed by success.
2. Open Railway DB console (or `psql` against prod `DATABASE_URL`) → run:
   ```sql
   SELECT indexname, indexdef
   FROM pg_indexes
   WHERE indexname LIKE 'idx_%_embedding_hnsw'
   ORDER BY indexname;
   ```
   Expected: 3 rows, each `indexdef` containing `m='24'` and `ef_construction='128'`.
3. Optional smoke: submit one new solution → confirm RAG context populates in the resulting AI review (Railway log shows `[Embedding] Solution ... embedded (...)`).

If V3 fails on prod (e.g. one index didn't rebuild), recovery: manually run the failing CREATE via the Railway DB console + `npx prisma migrate resolve --applied 20260627000000_tune_hnsw_indexes` to mark it done.

- [ ] **Step 7: Final verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -10
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```

Verify: local HEAD == origin/main; top commits include the 4.2c migration + roadmap update.

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ **M13** (tune m + ef_construction) → Task 1 Step 2 (migration content) + Steps 3-5 (apply + verify)
- ✅ **3 HNSW indexes** (problems / solutions / notes) → Task 1 Step 2 (all 3 in one file)
- ✅ **Plain DROP + CREATE** (no CONCURRENTLY) → Task 1 Step 2
- ✅ **V1 + V2 + V3 + V4 verifications** → Task 1 Steps 3, 4, 5, 6
- ✅ **Post-deploy prod smoke** → Task 2 Step 6
- ✅ **Recovery path for partial failure** → Task 1 Step 3 + Task 2 Step 6
- ✅ **Roadmap update** → Task 2 Step 4

### Placeholder scan

- No "TBD" / "implement later" / "fill in details".
- The V3 verification has a fallback path (`prisma db execute` falling through → `node` + PrismaClient) — both alternatives are concrete commands. Not a placeholder; it's a documented contingency.

### Type consistency

- 3 index names referenced consistently across migration + V3 verification + post-deploy smoke: `idx_problems_embedding_hnsw`, `idx_solutions_embedding_hnsw`, `idx_notes_embedding_hnsw`.
- New parameter values consistent: `m=24, ef_construction=128` everywhere in the migration SQL; `m='24', ef_construction='128'` (single-quoted) in the verification asserts (matching Postgres' rendered format in `pg_indexes.indexdef`).

### Adversarial check on the plan itself

- **Risk: partial-apply during the migration.** Each table's DROP+CREATE pair is one of 3 sequential statement pairs in the file. Prisma wraps the migration in a transaction by default; if any statement fails, the whole transaction rolls back, leaving all 3 indexes in their pre-migration state. Recovery: investigate the failure, fix the underlying issue, re-run `prisma migrate deploy`.
- **Risk: brief seq-scan window during the rebuild.** Vector queries during the per-table lock window fall back to seq scan via the `embedding IS NOT NULL` predicate. At current scale (~hundreds of vectors per table), seq scan latency is sub-ms. Tolerable.
- **Risk: V3 SELECT not supported via `prisma db execute --stdin`.** Documented fallback path: use a Node.js script with PrismaClient for the SELECT. Both paths produce the same data; either works.

---

## Done criteria

- Migration file created + applied on dev DB.
- `prisma migrate status` reports up to date.
- V3 pg_indexes query shows 3 rows with `m='24', ef_construction='128'`.
- Full server suite: 1256 (no change).
- `npm run lint` + audits + client build: all exit 0.
- Feature branch FF-merged to main; both pushed to origin.
- Roadmap row reflects Sprint 4.2c shipped.
- Post-deploy prod smoke runbook documented (operator runs V3 on prod after Railway picks up the new main).

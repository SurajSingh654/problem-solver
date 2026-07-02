# Sprint 7b — H5 Middleware Per-IP Rate-Limiter Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 4 in-memory `express-rate-limit` limiters (`authLimiter`, `apiLimiter`, `aiLimiter`, `exportLimiter`) to a Postgres-backed store via a custom `PrismaRateLimitStore` implementing express-rate-limit v8's Store interface. Feature flag defaults OFF — zero behavior change on merge. Closes H5 middleware portion. Sibling of Sprint 7 (per-user AI counter, already shipped).

**Architecture:** Additive Prisma model (`RateLimitCounter`), custom Store adapter with atomic `INSERT ON CONFLICT DO UPDATE` + `CASE WHEN` for window rollover, fail-open on DB error, feature-flag gated via `FEATURE_PERSIST_MIDDLEWARE_LIMITER`. Prune extension on the existing 24h `ai.usageWriter` job. 11 new tests (T178-T188 across 2 files).

**Tech Stack:** Prisma 5.20 + Postgres, express-rate-limit v8.3.2, Vitest 4.1.6.

**Spec:** [`docs/superpowers/specs/2026-07-02-sprint-7b-h5-middleware-persist-rate-limit-design.md`](../specs/2026-07-02-sprint-7b-h5-middleware-persist-rate-limit-design.md)

**Branch:** `feat/persist-middleware-rate-limiter` (already created; spec committed at `1fcfd5b`)

**Baseline test count:** 1398 (post Sprint 7, main commit `3327267`). Capture exact in Task 0. Target after sprint: **1411** (+13 test executions across 2 new files spanning 11 test IDs T178-T188).

**Review history:** Pre-implementation 4-role panel review (PO + BA + Security Manager + Lead Engineer) runs on this plan BEFORE the implementer subagent is dispatched, per `feedback_multi_agent_review_before_code.md`. All CHANGES_REQUESTED fold-ins must land in spec/plan before Task 0.

---

## File map

**Create:**
- `server/prisma/migrations/YYYYMMDD000000_add_rate_limit_counter/migration.sql` — CREATE TABLE + resetAt index
- `server/src/middleware/rateLimit.prismaStore.js` — PrismaRateLimitStore adapter class
- `server/test/middleware/rateLimit.prismaStore.test.js` — 10 tests T178-T187
- `server/test/middleware/rateLimit.dispatch.test.js` — 1 logical test T188 with 3 sub-`it` blocks (flag routing)

**Modify:**
- `server/prisma/schema.prisma` — add `RateLimitCounter` model (place near `AiUsageDailyCounter` from Sprint 7 for topical grouping)
- `server/src/config/env.js` — add `FEATURE_PERSIST_MIDDLEWARE_LIMITER` (default `"false"`)
- `server/src/middleware/rateLimit.middleware.js` — add flag-gated `storeFor(prefix)` helper + `store: storeFor("...")` on all 4 `rateLimit(...)` calls; export `storeFor` for test T188
- `server/src/services/ai.usageWriter.js` — extend prune with `rate_limit_counter` cleanup (1-hour grace after resetAt)
- `server/.env.example` (if it exists) — document `FEATURE_PERSIST_MIDDLEWARE_LIMITER`

**Modify (Task 5 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 7b Phase 1 shipped; H5 fully closed at code level

**Unchanged (explicit):**
- Sprint 7 code: `ai.rateLimiter.inMemory.js`, `ai.rateLimiter.postgres.js`, `ai.service.js` dispatcher — fully independent
- 15+ wire sites in `server/src/index.js` — unchanged (limiter exports have stable signatures)
- Client code, all controllers, WebSocket

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm current state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `feat/persist-middleware-rate-limiter`, latest commit `1fcfd5b` (spec). Working tree clean (or has panel fold-ins if applied).

- [ ] **Step 2: Capture baseline test count + limiter caller-site inventory**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1398 passed`.

Then capture the limiter wiring inventory as a drift-check baseline:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -rnE "apiLimiter|authLimiter|aiLimiter|exportLimiter" server/src | grep -v "middleware/rateLimit.middleware.js"
```

Record the total count. Should be ~15-20 wire sites. This sprint should NOT add or remove any — pure store swap.

- [ ] **Step 3: Pre-push gate sanity (each MUST exit 0)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

If any fails STOP and report BLOCKED. `prisma migrate status` printing "Database schema is up to date!" (44 migrations, including Sprint 7's) is success — retry once on transient DB blip.

NO commits in this task.

---

## Task 1: Schema + migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/YYYYMMDD000000_add_rate_limit_counter/migration.sql`

### Steps

- [ ] **Step 1: Add the Prisma model**

Locate `AiUsageDailyCounter` (added in Sprint 7 near line 1998). Add `RateLimitCounter` immediately after it for topical grouping:

```prisma
model RateLimitCounter {
  key       String    @id       // e.g., "auth:1.2.3.4" — prefix + IP
  count     Int       @default(0)
  resetAt   DateTime               // absolute reset moment
  updatedAt DateTime  @updatedAt

  @@index([resetAt])
  @@map("rate_limit_counter")
}
```

Use the Edit tool.

- [ ] **Step 2: Pre-create the migration file (non-interactive workflow per Sprint 7 fold-in)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && \
  TIMESTAMP=$(date -u +%Y%m%d000000) && \
  mkdir -p prisma/migrations/${TIMESTAMP}_add_rate_limit_counter && \
  cat > prisma/migrations/${TIMESTAMP}_add_rate_limit_counter/migration.sql <<'EOF'
CREATE TABLE "rate_limit_counter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counter_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rate_limit_counter_resetAt_idx" ON "rate_limit_counter"("resetAt");
EOF
echo "Created migration ${TIMESTAMP}_add_rate_limit_counter"
```

Verify:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && ls -la server/prisma/migrations/*_add_rate_limit_counter/
cat server/prisma/migrations/*_add_rate_limit_counter/migration.sql
```

- [ ] **Step 3: Apply the migration (non-interactive)**

Per Sprint 7 fold-in — use `migrate deploy`, not `migrate dev`:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate deploy
```

Expected: applies the new migration cleanly with no interactive prompt.

Verify:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

Expected: "Database schema is up to date!" (45 migrations total).

- [ ] **Step 4: Regenerate Prisma Client**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma generate
```

Sanity check `prisma.rateLimitCounter` exists on the client:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -A 3 "rateLimitCounter" server/node_modules/.prisma/client/index.d.ts | head -20
```

Expected: type surfaces for `RateLimitCounter` + delegate methods (`findUnique`, `deleteMany`, etc.).

- [ ] **Step 5: Run the full suite (regression check)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1398 passed` (unchanged; no code changes yet, just schema).

- [ ] **Step 6: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

Standing rules: NO Co-Authored-By, single-line subject.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/prisma/schema.prisma server/prisma/migrations && git commit -m "Add RateLimitCounter Prisma model + migration"
```

---

## Task 2: Prisma store adapter + 11 tests

**Files:**
- Create: `server/src/middleware/rateLimit.prismaStore.js`
- Create: `server/test/middleware/rateLimit.prismaStore.test.js` — 10 tests T178-T187
- Create: `server/test/middleware/rateLimit.dispatch.test.js` — 1 test T188 (3 sub-`it` blocks)

### Steps

- [ ] **Step 1: Create `rateLimit.prismaStore.js`**

Build from the spec's "`server/src/middleware/rateLimit.prismaStore.js` (NEW)" section VERBATIM. Includes:
- `import prisma from "../lib/prisma.js"`
- `export class PrismaRateLimitStore` with constructor (requires `prefix`), `init(options)`, `fullKey(key)`, `increment(key)`, `decrement(key)`, `resetKey(key)`
- `this.localKeys = false` (required for shared stores by express-rate-limit)
- All 3 async methods have `try/catch` that logs `[rateLimitStore:${prefix}]` warnings and fails open

Read the file after creation and confirm the raw SQL in `increment()` matches:

```bash
grep -A 25 "async increment" /Users/surajsingh/Downloads/Projects/problem-solver/server/src/middleware/rateLimit.prismaStore.js
```

Verify the SQL contains `ON CONFLICT ("key") DO UPDATE`, `CASE WHEN "rate_limit_counter"."resetAt" < NOW()`, `RETURNING "count" AS "totalHits", "resetAt" AS "resetTime"`.

- [ ] **Step 2: Create `rateLimit.prismaStore.test.js` (T178-T187)**

Build from the spec's "Mock pattern" + "Per-test design" T178-T187 sections. Structure:

```js
// ── Imports + hoisted prisma mock ──
// ── await import of PrismaRateLimitStore ──
// ── beforeEach with mockReset() on both $queryRaw and $executeRaw and rateLimitCounter.deleteMany ──

describe("PrismaRateLimitStore", () => {
  it("test 178: constructor requires prefix", () => { /* ... */ });
  it("test 179: localKeys is false", () => { /* ... */ });
  it("test 180: init sets windowMs", () => { /* ... */ });
  it("test 181: increment first hit returns coerced shape", async () => { /* ... */ });
  it("test 182: increment applies prefix to key", async () => { /* ... */ });
  it("test 183: increment DB error fails open with warning", async () => { /* ... */ });
  it("test 184: decrement uses GREATEST guard against negative", async () => { /* ... */ });
  it("test 185: decrement DB error silent no-op with warning", async () => { /* ... */ });
  it("test 186: resetKey deletes by fullKey", async () => { /* ... */ });
  it("test 187: resetKey DB error silent no-op with warning", async () => { /* ... */ });
});
```

Each `it()` body copied verbatim from the spec.

- [ ] **Step 3: Create `rateLimit.dispatch.test.js` (T188a/b/c)**

Build from the spec's T188 section verbatim. `vi.doMock` + `vi.resetModules()` + `await import()` pattern for env-flag swap between describe blocks. Requires `rateLimit.middleware.js` to export `storeFor` — that export lands in Task 3.

**Important**: this test will FAIL until Task 3 wires the `storeFor` export in `rateLimit.middleware.js`. Wrap the entire `describe(...)` in `describe.skip(...)` for now. Task 3 will unskip.

- [ ] **Step 4: Run just the postgres store tests (T178-T187)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/middleware/rateLimit.prismaStore.test.js
```

Expected: 10/10 pass.

**Decision tree on failure**:
- T183, T185, T187 (fail-open branches) — SECURITY-CRITICAL — divergences MUST escalate
- T181 (BigInt coercion) — if this fails because Prisma returns Number not BigInt, adjust the coercion; not a security issue but note the divergence
- T182 (prefix + key concatenation) — CORRECTNESS — divergences MUST escalate
- T184 (GREATEST guard) — if the SQL doesn't have GREATEST, the store can produce negative counts; SECURITY-adjacent — escalate
- Other failures — spec assumption wrong → update test + record divergence

- [ ] **Step 5: Run full suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1408 passed | 3 skipped` (1398 + 10 new; T188a/b/c skipped until Task 3).

- [ ] **Step 6: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add \
  server/src/middleware/rateLimit.prismaStore.js \
  server/test/middleware/rateLimit.prismaStore.test.js \
  server/test/middleware/rateLimit.dispatch.test.js && \
  git commit -m "Add PrismaRateLimitStore + 11 tests (T178-T188) — dispatch tests skipped until Task 3"
```

---

## Task 3: Wire flag dispatch in `rateLimit.middleware.js` + unskip T188

**Files:**
- Modify: `server/src/config/env.js`
- Modify: `server/src/middleware/rateLimit.middleware.js`
- Modify: `server/src/services/ai.usageWriter.js`
- Modify: `server/test/middleware/rateLimit.dispatch.test.js` (unskip)
- Modify (optional): `server/.env.example`

### Steps

- [ ] **Step 1: Add feature flag to env.js**

Find the existing FEATURE_* pattern:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "FEATURE_" server/src/config/env.js
```

Add near the other FEATURE_* exports (specifically near `FEATURE_PERSIST_RATE_LIMITER` for topical grouping):

```js
export const FEATURE_PERSIST_MIDDLEWARE_LIMITER =
  process.env.FEATURE_PERSIST_MIDDLEWARE_LIMITER ?? "false";
```

Match the file's existing style (raw string return; case-insensitive comparison happens in `rateLimit.middleware.js`).

- [ ] **Step 2: Add flag to `.env.example` if applicable**

```bash
[ -f /Users/surajsingh/Downloads/Projects/problem-solver/server/.env.example ] && echo "EXISTS" || echo "NO"
```

If it exists AND lists other FEATURE_* flags, add:

```
FEATURE_PERSIST_MIDDLEWARE_LIMITER="false"
```

With a one-line comment: `# When "true", the 4 express-rate-limit limiters (auth/api/ai/export) persist their per-IP counters to Postgres via PrismaRateLimitStore. Unblocks multi-replica deploys. Case-insensitive. Defaults off; flip after code ships.`

- [ ] **Step 3: Refactor `rateLimit.middleware.js` — add flag-gated store**

Replace the current file with the version from the spec's "`rateLimit.middleware.js` refactor" section. Key changes vs current file:
- Add imports at the top: `import { FEATURE_PERSIST_MIDDLEWARE_LIMITER } from "../config/env.js"` and `import { PrismaRateLimitStore } from "./rateLimit.prismaStore.js"`
- Add `isPersistFlagOn()` and `storeFor(prefix)` helpers
- Add `export { storeFor }` (needed by T188 test)
- Add `store: storeFor("api")` / `storeFor("auth")` / `storeFor("ai")` / `storeFor("export")` to each `rateLimit({...})` call
- All 4 `rateLimit(...)` public exports keep the SAME signature — only the `store` option is added

Verify by grep after the edit:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "storeFor\|store:" server/src/middleware/rateLimit.middleware.js
```

Expected: 4 `store: storeFor("...")` lines + 1 `export function storeFor` + 1 `export { storeFor }` or equivalent.

- [ ] **Step 4: Extend prune in `ai.usageWriter.js`**

Read the existing prune fn (extended in Sprint 7):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '70,140p' server/src/services/ai.usageWriter.js
```

Add the third cleanup block per the spec's prune-extension section AFTER the Sprint 7 counter cleanup. Wrap in its own try/catch so a rate-limit prune failure can't poison the outer prune.

- [ ] **Step 5: Unskip T188 dispatch tests**

Read the current dispatch test:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && head -20 server/test/middleware/rateLimit.dispatch.test.js
```

Change `describe.skip(...)` back to `describe(...)`. If the current file has a placeholder comment about being skipped, remove it.

- [ ] **Step 6: Run the dispatch tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/middleware/rateLimit.dispatch.test.js
```

Expected: 3/3 pass (T188a, T188b, T188c).

If they fail:
- **T188a fails** (flag OFF should route to undefined store): the `isPersistFlagOn()` function or the `storeFor` return is wrong. Grep the module and verify.
- **T188b fails** (flag ON should return PrismaRateLimitStore): the `PrismaRateLimitStore` import path might be wrong in the test, or `storeFor` isn't exported.
- **T188c fails** (mixed-case "TRUE" should activate): the `.toLowerCase()` call was missed. Re-check `isPersistFlagOn()`.

SECURITY-CRITICAL: these tests target the flag typo → wrong backend regression. Any failure escalates.

- [ ] **Step 7: Run full suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1411 passed` (0 skipped; 1398 + 13 test executions).

**Common failure modes**:
- Any test importing `rateLimit.middleware.js` accidentally triggers a Prisma connection at module-load time — if that happens with the `PrismaRateLimitStore` import, tests could fail on connection errors. The `storeFor()` returning `undefined` for flag OFF should prevent construction, but verify the store class isn't instantiated eagerly at module import.
- If any existing test that uses `authLimiter` / `apiLimiter` / etc. fails after the store option was added, the change may have altered behavior. Investigate.

- [ ] **Step 8: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0.

- [ ] **Step 9: Commit**

Determine changed files:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
```

Commit (adjust file list based on actual changes):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add \
  server/src/config/env.js \
  server/src/middleware/rateLimit.middleware.js \
  server/src/services/ai.usageWriter.js \
  server/test/middleware/rateLimit.dispatch.test.js && \
  git commit -m "Wire flag-gated Prisma store into 4 limiters + extend prune + unskip dispatch tests"
```

Include `.env.example` in `git add` if it was modified.

---

## Task 4: Final gates + push + FF-merge + roadmap + ops handoff

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Pre-push gate** (sequential):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: 1411 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/persist-middleware-rate-limiter
```

DO NOT use `--no-verify`.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/persist-middleware-rate-limiter && git push origin main
```

- [ ] **Step 4: Update roadmap**

Find the existing 7b row (added in Sprint 7's roadmap update):

```markdown
| 7b | H5 middleware per-IP rate-limiter migration ... | queued | — | — |
```

Replace with (adjust wording to match file's column format):

```markdown
| 7b | H5 middleware per-IP rate-limiter migration (Phase 1: code + migration + 11 tests T178-T188 shipped behind FEATURE_PERSIST_MIDDLEWARE_LIMITER=false; custom PrismaRateLimitStore with atomic INSERT ON CONFLICT + CASE WHEN for window rollover; fail-open uniformly on DB error; 4-role panel reviewed pre-implementation. H5 fully closed at code level. Phase 2 = ops flip in Railway) | ✅ shipped (Phase 1) | [`2026-07-02-sprint-7b-h5-middleware-persist-rate-limit-design.md`](../specs/2026-07-02-sprint-7b-h5-middleware-persist-rate-limit-design.md) | 2026-07-02 |
```

If the H5 audit finding has an overall status field somewhere in the roadmap, mark H5 as fully addressed.

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 7b Phase 1 shipped; H5 fully closed at code level"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main
```

- [ ] **Step 6: Verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -10
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```

Verify local HEAD == origin/main.

- [ ] **Step 7: Ops handoff note (surface verbatim to user)**

Sprint 7b Phase 1 code-complete. Phase 2 is a manual ops action on Railway:

> **To activate the Postgres middleware rate-limiter (Sprint 7b Phase 2):**
>
> 1. On Railway, set `FEATURE_PERSIST_MIDDLEWARE_LIMITER=true` on the server service
> 2. Redeploy (auto-triggers on env-var change; ~90s propagation)
> 3. **Post-flip atomicity spot-check**: enable `DEBUG=prisma:query` on one replica temporarily. Trigger an auth attempt (or any rate-limited route). Observe the SQL emitted for the store's `increment()` call. Confirm it produces:
>    ```sql
>    INSERT INTO "rate_limit_counter" (...) VALUES (...)
>    ON CONFLICT ("key") DO UPDATE
>    SET "count" = CASE WHEN "rate_limit_counter"."resetAt" < NOW() THEN 1 ELSE ... END, ...
>    ```
>    If the emitted SQL diverges, atomicity claim is broken — roll back immediately.
> 4. Watch `[rateLimitStore:*]` warning logs for 24-48h. Expected: zero. Rare warnings on DB blips are fail-open events — safe.
> 5. If clean, schedule a future cleanup sprint to delete the MemoryStore fallback branch in `rateLimit.middleware.js`.
> 6. **Rollback**: flip `FEATURE_PERSIST_MIDDLEWARE_LIMITER=false` and redeploy (~90s). MemoryStore resumes. **Data consequence**: all counters reset to empty per process — during the rollback window an attacker could restart brute-force attempts. Same tradeoff as Sprint 7; acceptable for a last-resort rollback.
> 7. Flag comparison is **case-insensitive** (matches Sprint 7's robustness): `"true"` / `"True"` / `"TRUE"` all activate the pg store.

## Report (under 300 words)

- Step 1: each gate PASS/FAIL
- Step 2: feature branch push success
- Step 3: FF-merge success
- Step 4: roadmap edit (before/after lines)
- Step 5: roadmap commit SHA
- Step 6: HEAD SHA + origin/main SHA (confirm equal)
- Step 7 handoff surfaced verbatim to user in final output
- Final status: DONE / DONE_WITH_CONCERNS / BLOCKED

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ Schema + migration → Task 1
- ✅ PrismaRateLimitStore + 11 tests → Task 2
- ✅ Flag dispatch + all 4 store wire-ups → Task 3 Step 3
- ✅ Prune extension → Task 3 Step 4
- ✅ Dispatch tests unskip → Task 3 Step 5
- ✅ Roadmap update → Task 4 Step 4
- ✅ Phase 2 ops handoff → Task 4 Step 7

### Placeholder scan

No "TBD" / "implement later". `YYYYMMDD000000` in the migration path is filled in at Task 1 Step 2 via `date -u +%Y%m%d000000` (same pattern as Sprint 7, confirmed working non-interactively).

### Type consistency

- Test IDs T178-T188 contiguous with prior T1-T177 (last shipped: Sprint 7's T177).
- `String key @id` used consistently in schema, migration SQL, and tests.
- Flag name `FEATURE_PERSIST_MIDDLEWARE_LIMITER` used identically in env.js, dispatch, `.env.example`, roadmap, and tests.
- 4 prefixes (`"auth"`, `"api"`, `"ai"`, `"export"`) used consistently in `storeFor` calls and matched in test assertions where the composite key is inspected.

### Adversarial check

- **Migration via `migrate deploy`** (not `migrate dev`) — inherited fold-in from Sprint 7 that avoided the drift-fix prompt cleanly. Verified working non-interactively.
- **Flag comparison case-insensitive** — `.toLowerCase()` per Sprint 7 fold-in. T188c enforces this.
- **Prisma Client regeneration** — Task 1 Step 4 explicitly runs `prisma generate` so `prisma.rateLimitCounter` surfaces on the client before Task 2 tests reference it.
- **Store construction at module load** — `storeFor()` runs when `rateLimit.middleware.js` is imported. If the DB is unreachable at boot, the constructor doesn't touch the DB (only stores config), so a broken DB doesn't break the app boot. Actual DB access is deferred to the first `increment()` call, which fails open. Verified in T183.
- **`X-Forwarded-For` / `req.ip`** — `trust proxy: 1` is already set in `server/src/index.js:83` (Sprint 7 didn't touch it). express-rate-limit uses `req.ip` which respects this. Store is oblivious to the IP source — it takes whatever string key express-rate-limit passes. No changes needed.

---

## Done criteria

- Migration applied via `migrate deploy` (non-interactive, no drift-fix prompt); `prisma migrate status` clean
- 11 new tests pass (T178-T188 across 2 files); vitest execution count is +13
- Full suite at **1411**
- `npm run lint` (server + client) exit 0
- Server + client audits exit 0
- Client `npm run build` clean
- `FEATURE_PERSIST_MIDDLEWARE_LIMITER` in `env.js` (and `.env.example` if applicable); defaults `"false"`
- Feature branch FF-merged to main; both pushed to origin
- Roadmap row 7b → ✅ shipped (Phase 1); H5 fully closed at code level
- Any divergences captured in commit body with `T<id>: <expected> vs <actual> — <decision>` format
- 4-role panel review completed pre-implementation with all CHANGES_REQUESTED fold-ins applied before Task 0
- Ops handoff note surfaced verbatim to user at sprint completion

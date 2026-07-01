# Sprint 7 — H5 Persist AI Rate-Limiter to Postgres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the code + migration + tests for persisting the per-user AI daily rate-limit counter to Postgres. Feature flag defaults OFF — zero behavior change in production on merge. Closes H5 (per-user portion); middleware per-IP limiters carved out.

**Architecture:** Additive Prisma model, atomic UPSERT via `ON CONFLICT DO UPDATE`, two backends dispatched by feature flag, fail-open on DB error. Prune extension on the existing 24h `ai.usageWriter` job. 8 new tests (T168-T175); 2 existing tests adapted for `async`.

**Tech Stack:** Prisma + Postgres, Vitest 4.1.6.

**Spec:** [`docs/superpowers/specs/2026-07-01-sprint-7-h5-persist-rate-limiter-design.md`](../specs/2026-07-01-sprint-7-h5-persist-rate-limiter-design.md)

**Branch:** `feat/persist-ai-rate-limiter` (already created; spec committed at `941b848`)

**Baseline test count:** 1386 (post Sprint 6c, main commit `2cceab7`). Capture exact in Task 0. Target after sprint: **1394** (+8).

**Review history:** Pre-implementation 4-role panel review (PO + BA + Security Manager + Lead Engineer) runs on this plan BEFORE the implementer subagent is dispatched, per `feedback_multi_agent_review_before_code.md`. All CHANGES_REQUESTED fold-ins must land in spec/plan before Task 0.

---

## File map

**Create:**
- `server/prisma/migrations/YYYYMMDD000000_add_ai_usage_daily_counter/migration.sql` — CREATE TABLE + index (exact timestamp determined at Task 1 time)
- `server/src/services/ai.rateLimiter.inMemory.js` — extracted from `ai.service.js:69-96`
- `server/src/services/ai.rateLimiter.postgres.js` — new Prisma-backed impl
- `server/test/services/ai.rateLimiter.postgres.test.js` — 8 tests T168-T175

**Modify:**
- `server/prisma/schema.prisma` — add `AiUsageDailyCounter` model near `UsageTracking` (~line 1953)
- `server/src/config/env.js` — add `FEATURE_PERSIST_RATE_LIMITER` (default `"false"`)
- `server/src/services/ai.service.js` — replace L69-97 with flag-dispatch wrapper; keep call sites at L259 + L397 with `await`
- `server/src/services/ai.usageWriter.js` — extend prune fn with counter cleanup
- `server/test/ai/service.test.js` — adapt L363-386 (add `await` on `checkRateLimit`)
- `server/test/ai/smoke.test.js` — adapt L22-28 (add `await`)
- `server/.env.example` (if it exists) — document `FEATURE_PERSIST_RATE_LIMITER`

**Modify (Task 5 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 7 shipped.

**Unchanged (explicit):**
- All controllers, routes, WebSocket, middleware
- `server/src/middleware/rateLimit.middleware.js` (out of scope; different threat model, deferred)
- Client code (backend-only flag)

---

## Task 0: Pre-flight

**Files:** none modified.

- [ ] **Step 1: Confirm current state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -1
```
Expected: branch `feat/persist-ai-rate-limiter`, latest commit `941b848` (spec). Working tree clean (or has 4-role panel fold-ins if applied).

- [ ] **Step 2: Capture baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```
Expected: `Tests 1386 passed`. If lower or higher, STOP and reconcile.

- [ ] **Step 3: Pre-push gate sanity (each MUST exit 0)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

If any fails STOP and report BLOCKED. `prisma migrate status` printing "Database schema is up to date!" is success — retry once on transient DB blip.

NO commits in this task.

---

## Task 1: Schema + migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/YYYYMMDD000000_add_ai_usage_daily_counter/migration.sql`

### Steps

- [ ] **Step 1: Add the Prisma model**

Locate the `UsageTracking` model (around line 1953). Add `AiUsageDailyCounter` immediately after it:

```prisma
model AiUsageDailyCounter {
  userId    String
  day       String    // "YYYY-MM-DD" UTC, matches existing rate-limiter key format
  count     Int       @default(0)
  updatedAt DateTime  @updatedAt

  @@id([userId, day])           // Composite PK — atomic UPSERT target
  @@index([day])                 // For 2-day prune sweep
  @@map("ai_usage_daily_counter")
}
```

- [ ] **Step 2: Pre-create the migration file** (CLAUDE.md workflow — avoids the drift-fix prompt)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && \
  TIMESTAMP=$(date -u +%Y%m%d000000) && \
  mkdir -p prisma/migrations/${TIMESTAMP}_add_ai_usage_daily_counter && \
  cat > prisma/migrations/${TIMESTAMP}_add_ai_usage_daily_counter/migration.sql <<'EOF'
CREATE TABLE "ai_usage_daily_counter" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_daily_counter_pkey" PRIMARY KEY ("userId", "day")
);

CREATE INDEX "ai_usage_daily_counter_day_idx" ON "ai_usage_daily_counter"("day");
EOF
echo "Created migration ${TIMESTAMP}_add_ai_usage_daily_counter"
```

- [ ] **Step 3: Apply the migration**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run db:migrate
```

**IMPORTANT** (CLAUDE.md gotcha): after applying your migration, Prisma will prompt "Enter a name for the new migration" — this is the drift-fix prompt for pgvector placeholders. **Press Ctrl+C.**

Then verify:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

Expected: "Database schema is up to date!"

- [ ] **Step 4: Regenerate Prisma Client**

`npm run db:migrate` should have triggered `prisma generate` already, but confirm:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run build
```

Expected: no errors. `prisma.aiUsageDailyCounter` should now exist on the Prisma Client (verified in Task 2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/prisma/schema.prisma server/prisma/migrations && git commit -m "Add AiUsageDailyCounter Prisma model + migration"
```

Standing rules: NO `Co-Authored-By:` trailer; single-line subject.

---

## Task 2: In-memory backend extraction

**Files:**
- Create: `server/src/services/ai.rateLimiter.inMemory.js`

This task ONLY extracts the current code into a new module WITHOUT changing behavior. `ai.service.js` still references the extracted functions — that update happens in Task 4.

### Steps

- [ ] **Step 1: Read the existing rate-limiter code**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '69,97p' server/src/services/ai.service.js
```

Confirm lines 69-97 are the current implementation.

- [ ] **Step 2: Create `ai.rateLimiter.inMemory.js`**

Copy the spec's "`ai.rateLimiter.inMemory.js` — extraction" section verbatim. The file exports two async functions `check(userId)` and `increment(userId)` plus a test-only `_resetForTests()`.

- [ ] **Step 3: Verify no test breakage yet**

Nothing imports the new file yet, so the suite should still pass at 1386:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1386 passed`.

- [ ] **Step 4: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/services/ai.rateLimiter.inMemory.js && git commit -m "Extract in-memory AI rate-limiter to its own module"
```

---

## Task 3: Postgres backend + 8 new tests

**Files:**
- Create: `server/src/services/ai.rateLimiter.postgres.js`
- Create: `server/test/services/ai.rateLimiter.postgres.test.js`

### Steps

- [ ] **Step 1: Create `ai.rateLimiter.postgres.js`**

Copy the spec's "`ai.rateLimiter.postgres.js` — new backend" section verbatim. The file exports `check(userId)` and `increment(userId)` with fail-open catch blocks.

- [ ] **Step 2: Create the test file (TDD ordering: RED first)**

Build `server/test/services/ai.rateLimiter.postgres.test.js` from the spec's "Per-test design" section verbatim. Includes:
- Hoisted `prismaMock` with `aiUsageDailyCounter.{findUnique, upsert}` as vi.fn()
- `vi.mock` for prisma + env (`AI_DAILY_LIMIT: 3` for predictable assertions)
- `await import` of `check`, `increment`
- `beforeEach` with `mockReset()` on both mocks
- 8 tests T168-T175 with the exact code blocks from the spec

- [ ] **Step 3: Run the new tests**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/ai.rateLimiter.postgres.test.js
```

Expected: 8/8 pass.

**Decision tree on failure**:
- T170 (deny at cap) or T175 (day rollover) — CORRECTNESS-CRITICAL — divergences MUST escalate
- T171, T174 (fail-open branches) — SECURITY-CRITICAL — divergences MUST escalate (fail-closed would cascade a DB blip into an outage)
- T172, T173 (upsert argument shape) — the atomic-increment contract. Divergence probably means Prisma API change; escalate.
- Other failures — spec assumption wrong → update test + record divergence.

- [ ] **Step 4: Full suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1394 passed` (1386 + 8).

- [ ] **Step 5: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/services/ai.rateLimiter.postgres.js server/test/services/ai.rateLimiter.postgres.test.js && git commit -m "Add Postgres AI rate-limiter backend + 8 regression tests (T168-T175)"
```

---

## Task 4: Wire flag dispatch + adapt existing tests

**Files:**
- Modify: `server/src/config/env.js`
- Modify: `server/src/services/ai.service.js`
- Modify: `server/src/services/ai.usageWriter.js`
- Modify: `server/test/ai/service.test.js`
- Modify: `server/test/ai/smoke.test.js`
- Modify (optional): `server/.env.example`

### Steps

- [ ] **Step 1: Add feature flag to `env.js`**

Find the existing feature flag exports in `server/src/config/env.js`. Add:

```js
export const FEATURE_PERSIST_RATE_LIMITER =
  process.env.FEATURE_PERSIST_RATE_LIMITER ?? "false";
```

Follow whatever pattern the file uses for the existing `FEATURE_*` exports (they may use a single object export or individual named exports — match style).

- [ ] **Step 2: Add flag to `.env.example` (if it exists)**

```bash
[ -f /Users/surajsingh/Downloads/Projects/problem-solver/server/.env.example ] && grep -qE "^FEATURE_" /Users/surajsingh/Downloads/Projects/problem-solver/server/.env.example
```

If it exists and lists other FEATURE_* flags, add:

```
FEATURE_PERSIST_RATE_LIMITER="false"
```

with a one-line comment: `# When "true", per-user AI daily rate-limit reads/writes go to Postgres (unblocks multi-replica). Flip after code ships, defaults off.`

- [ ] **Step 3: Refactor `ai.service.js` — replace L69-97 with flag dispatch**

Delete the current in-memory implementation (L69-97) and replace with:

```js
import { FEATURE_PERSIST_RATE_LIMITER } from "../config/env.js";
import * as inMemLimiter from "./ai.rateLimiter.inMemory.js";
import * as pgLimiter from "./ai.rateLimiter.postgres.js";

function activeLimiter() {
  return FEATURE_PERSIST_RATE_LIMITER === "true" ? pgLimiter : inMemLimiter;
}

export async function checkRateLimit(userId) {
  return activeLimiter().check(userId);
}

async function incrementRateLimit(userId) {
  return activeLimiter().increment(userId);
}
```

Place these imports with the other imports at the top of the file. Place the function definitions in the same location as the old code (near L69).

- [ ] **Step 4: Update the two caller sites** (`aiComplete` L259, `aiStream` L397)

The current code at L259:
```js
const rateCheck = checkRateLimit(userId);
```

Becomes:
```js
const rateCheck = await checkRateLimit(userId);
```

Same at L397 in `aiStream`.

The current code at L314 (after successful AI call in `aiComplete`):
```js
incrementRateLimit(userId);
```

Becomes:
```js
await incrementRateLimit(userId);
```

Same in `aiStream` — find the equivalent post-success increment line and add `await`.

Use grep to verify no other call sites exist:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "checkRateLimit\|incrementRateLimit" server/src/services/ai.service.js
```

- [ ] **Step 5: Adapt `test/ai/service.test.js:363-386`**

Read the test carefully:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '363,390p' server/test/ai/service.test.js
```

Find the loop that hammers `checkRateLimit` and the surrounding assertions. Add `await` at every call site. If the test uses `for (let i=0; i<N; i++) { const r = checkRateLimit(userId); ... }`, convert to `for (let i=0; i<N; i++) { const r = await checkRateLimit(userId); ... }`. If it uses a `while` loop, same pattern.

The test's env is default (flag OFF) → exercises the in-memory backend. Behavior should be unchanged; only the sync-vs-async signature update matters.

- [ ] **Step 6: Adapt `test/ai/smoke.test.js:22-28`**

Same pattern — the smoke test calls `checkRateLimit('user-smoke-1')` synchronously. Wrap in `await`. Confirm the test's assertion (`expect(r).toEqual(...)`) still matches — the shape is unchanged.

- [ ] **Step 7: Extend `ai.usageWriter.js` prune**

Read the existing prune fn:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '70,110p' server/src/services/ai.usageWriter.js
```

Find the `const prune = async () => { ... }` block. After the existing `prisma.usageTracking.deleteMany` call, add the counter cleanup per the spec's "Prune extension" section:

```js
const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)
  .toISOString().split("T")[0];
try {
  const { count: prunedCounters } = await prisma.aiUsageDailyCounter.deleteMany({
    where: { day: { lt: twoDaysAgo } },
  });
  if (prunedCounters > 0) {
    console.log(`[ai.usageWriter] pruned ${prunedCounters} rate-limit counters older than 2d`);
  }
} catch (err) {
  console.warn(`[ai.usageWriter] counter prune failed: ${err?.code || err?.message}`);
}
```

- [ ] **Step 8: Run the full server suite**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1394 passed` (still). The 2 adapted tests should now pass under async. No regression in the rest of the suite.

**Common failure mode**: if the two adapted tests fail with "expected object, got Promise", it means the caller forgot to `await`. Re-read the test's assertion lines and add `await` where the return value of `checkRateLimit`/`incrementRateLimit` is used.

- [ ] **Step 9: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/config/env.js server/src/services/ai.service.js server/src/services/ai.usageWriter.js server/test/ai/service.test.js server/test/ai/smoke.test.js && git commit -m "Wire flag-dispatch rate-limiter + extend prune + adapt existing tests"
```

If `.env.example` was modified, include it in the `git add`.

---

## Task 5: Final gates + push + FF-merge + roadmap

**Files:**
- Modify: `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Pre-push gate** (sequential; DB connection + heavy client build):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: 1394 passing, 0 vulnerabilities, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/persist-ai-rate-limiter
```

DO NOT use `--no-verify`. Retry once on transient hook flake.

- [ ] **Step 3: FF-merge to main + push**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/persist-ai-rate-limiter && git push origin main
```

- [ ] **Step 4: Update roadmap**

Read the roadmap:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && sed -n '65,75p' docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md
```

Find the existing Sprint 7 row (per the roadmap header at line 69):

```markdown
| 7 | Persist-rate-limiter migration ... | queued | — | — |
```

Replace with (match the file's actual column count/alignment; adjust wording if the row template differs):

```markdown
| 7 | H5 persist AI rate-limiter (Phase 1: code + migration + 8 tests T168-T175 shipped behind FEATURE_PERSIST_RATE_LIMITER=false; per-user daily counter atomic UPSERT in ai_usage_daily_counter; fail-open on DB error; middleware per-IP limiters carved to future sprint; 4-role panel reviewed pre-implementation. Phase 2 = ops flip in Railway) | ✅ shipped (Phase 1) | [`2026-07-01-sprint-7-h5-persist-rate-limiter-design.md`](../specs/2026-07-01-sprint-7-h5-persist-rate-limiter-design.md) | 2026-07-01 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 7 Phase 1 (H5 persist AI rate-limiter code + migration) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main
```

- [ ] **Step 6: Verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -12
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```

Verify local HEAD == origin/main.

- [ ] **Step 7: Ops handoff note**

Sprint 7 Phase 1 is done. Phase 2 requires a manual ops step:

> To activate the Postgres rate-limiter in production:
> 1. On Railway, set `FEATURE_PERSIST_RATE_LIMITER=true` on the server service
> 2. Redeploy (auto-triggers on env-var change)
> 3. Watch `[rateLimiter:pg]` warning logs for 24-48h
> 4. If clean, schedule a future cleanup sprint to delete the in-memory path
> 5. To roll back: flip `FEATURE_PERSIST_RATE_LIMITER=false` and redeploy (~90s)

This handoff note should be surfaced to the user at end-of-sprint.

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ Schema addition + migration → Task 1
- ✅ In-memory extraction → Task 2
- ✅ Postgres backend + 8 tests T168-T175 → Task 3
- ✅ Flag dispatch in `ai.service.js` → Task 4 Steps 1, 3
- ✅ Caller await updates → Task 4 Step 4
- ✅ Prune extension → Task 4 Step 7
- ✅ Existing test adaptations → Task 4 Steps 5, 6
- ✅ Roadmap update → Task 5 Step 4
- ✅ Phase 2 ops handoff → Task 5 Step 7

### Placeholder scan

No "TBD" / "implement later". `YYYYMMDD000000` in the migration path is filled in at Task 1 Step 2 via `date -u +%Y%m%d000000`.

### Type consistency

- Test IDs T168-T175 contiguous with prior T1-T167 (last shipped: 6c's T143-T167).
- `String day` used consistently in schema, backends, and tests.
- Flag name `FEATURE_PERSIST_RATE_LIMITER` used identically in `env.js`, `ai.service.js`, test env mock, `.env.example`, and roadmap row.
- Composite PK field order: `[userId, day]` used identically in schema, tests, and Prisma-generated where clause (`userId_day: { userId, day }`).

### Adversarial check

- **Prisma drift-fix prompt** — Task 1 Step 3 explicitly warns to Ctrl+C. Without this, the drift-fix migration writes destructive SQL for the pgvector placeholders.
- **`checkRateLimit` sync→async signature change** — Task 4 Steps 4, 5, 6 each carry an explicit "add `await`" instruction. Grep in Task 4 Step 4 verifies no other call sites.
- **Flag string comparison** (`=== "true"`) — the spec pins this comparison in the dispatch code. Any environment where the env var is set as a boolean (`FEATURE_PERSIST_RATE_LIMITER=true` without quotes) would still work because shell env vars are always strings. The `??` operator in `env.js` ensures a `undefined` fallback becomes `"false"`. Not `""` (which would be falsy but not `"false"`).
- **Migration + Prisma Client regeneration** — Task 1 Step 4 explicitly rebuilds so Task 2/3 tests can reference `prisma.aiUsageDailyCounter`. If the client isn't regenerated, `prismaMock.aiUsageDailyCounter` would exist in the test (hoisted mock) but any real production call would throw `TypeError: prisma.aiUsageDailyCounter is not defined`. Rebuild is load-bearing.

---

## Done criteria

- Migration applied; `prisma migrate status` clean; drift-fix prompt did NOT run
- 8 new tests pass; 2 existing rate-limiter tests adapted and passing
- Full suite at **1394**
- `npm run lint` (server + client) exit 0
- Server + client audit exit 0
- Client `npm run build` clean
- `FEATURE_PERSIST_RATE_LIMITER` in `env.js` (and `.env.example` if applicable); defaults `"false"`
- Feature branch FF-merged to main; both pushed to origin
- Roadmap row 7 → ✅ shipped (Phase 1)
- Any divergences captured in commit body with `T<id>: <expected> vs <actual> — <decision>` format
- 4-role panel review completed pre-implementation with all CHANGES_REQUESTED fold-ins applied before Task 0
- Ops handoff note surfaced to user at sprint completion

# Sprint 7 — H5 Persist AI Rate-Limiter to Postgres — Design Spec

**Date:** 2026-07-01
**Sprint:** 7 (H5 audit finding; roadmap NEXT entry `persist-ai-rate-limiter`)
**Audit findings closed:** H5 (partial — per-user AI counter portion; per-IP middleware limiters carved to future sprint 7b/8)
**Branch:** `feat/persist-ai-rate-limiter`
**Layers on:** main, post Sprint 6c (`2cceab7`)
**Feature flag:** `FEATURE_PERSIST_RATE_LIMITER` (env, default `"false"`)
**Review history:** Will require the standing 4-role panel review (PO + BA + Security Manager + Lead Engineer) on the implementation plan BEFORE implementer dispatch, per `feedback_multi_agent_review_before_code.md`.

---

## Problem

Sprint 1 audit, **H5** (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:83-88`):

> `server/src/services/ai.service.js:69-96` — All limiters in-memory per process. Per-day AI counter resets on process restart and exists independently per replica.
> Failure scenario: Cost overrun at scale (per-user cap doubles for every additional replica).
> Status: CLAUDE.md flags as `persist-ai-rate-limiter` roadmap NEXT. Constraint today: deploy at single replica only.

### Zero-trust verification

`grep -nE "rateLimitMap|checkRateLimit|incrementRateLimit" server/src/services/ai.service.js` confirms:
- L70: `const rateLimitMap = new Map()` — process-local, no persistence
- L78-85: `checkRateLimit(userId)` — read count, compare to `AI_DAILY_LIMIT`
- L87-97: `incrementRateLimit(userId)` — bump count, 1% random GC of yesterday's keys
- Callers at L259 (`aiComplete`) and L397 (`aiStream`) — pre-call check + post-success increment

**Behavior at N replicas today**: each replica has its own Map; effective daily limit = N × configured limit. Root cause: shared state was never persisted.

### Related but out of scope

H5 also covers `server/src/middleware/rateLimit.middleware.js` (per-IP/route auth/api/ai limiters via `express-rate-limit`, all in-memory). Different threat model (brute-force protection, not cost cap), different tech stack (needs a persistent-store adapter). **Deferred** to Sprint 7b or later — current sprint is focused on the per-user AI counter, the highest-cost failure mode.

---

## Principle

**Structural fix with a reversible rollout.** Move the counter from process-local `Map` to a Postgres row keyed by `(userId, day)`. Atomic UPSERT preserves the current semantics under concurrency; a feature flag lets us ship the code first (default OFF, zero behavior change) then flip to the new backend when confident. Fail-open on DB error so a Postgres blip doesn't cascade into a rate-limit outage across every AI surface.

---

## Scope

### In scope

- **New Prisma model** `AiUsageDailyCounter` with composite PK `(userId, day)`
- **Migration** creating the table + `day` index
- **Two limiter backends** — in-memory (extracted from current code, unchanged) + Postgres (new) — dispatched by `FEATURE_PERSIST_RATE_LIMITER` flag
- **`ai.service.js` refactor** — extract the current in-memory limiter into `ai.rateLimiter.inMemory.js`; add `ai.rateLimiter.postgres.js`; add flag-dispatch wrapper in `ai.service.js` so callers are unchanged
- **`ai.usageWriter.js` prune extension** — sweep stale counter rows (`day < today - 2 days`) on the existing 24h prune interval
- **`env.js` addition** — `FEATURE_PERSIST_RATE_LIMITER` env var (default `"false"`)
- **8 new tests (T168-T175)** for the Postgres backend
- **Adapt existing rate-limiter tests** — `checkRateLimit` becomes `async`; call sites gain `await`

### Out of scope (carved)

- **Middleware per-IP limiters** in `rateLimit.middleware.js` (auth/api/ai) — different tech, defer
- **Phase 2 flag-flip** — actual production behavior swap is an ops step (env var change on Railway) after this sprint ships with flag OFF
- **Deletion of the in-memory path** — kept as fallback for the flag-off branch; delete in a future cleanup sprint once Phase 2 is stable
- **Retry / circuit breaker on Postgres for the limiter** — YAGNI; fail-open is the safety net
- **Reserve-atomic slot** (check+increment in one round trip) — would consume slots for AI calls that later fail. Current semantics preserved.
- **Distributed lock / SELECT FOR UPDATE** — UPSERT with `ON CONFLICT DO UPDATE` is atomic in Postgres. No explicit lock needed.
- **Client-side rate-limit indicator changes** — the response envelope on RATE_LIMITED is unchanged.

---

## Architecture

```
server/prisma/
├── schema.prisma                            [MODIFIED — add AiUsageDailyCounter]
└── migrations/YYYYMMDD000000_add_ai_usage_daily_counter/migration.sql   [NEW]

server/src/
├── config/env.js                            [MODIFIED — add FEATURE_PERSIST_RATE_LIMITER]
└── services/
    ├── ai.service.js                        [MODIFIED — flag-dispatch wrapper]
    ├── ai.rateLimiter.inMemory.js           [NEW — extracted from ai.service.js:69-96]
    ├── ai.rateLimiter.postgres.js           [NEW — Prisma-backed impl]
    └── ai.usageWriter.js                    [MODIFIED — extend prune]

server/test/services/
└── ai.rateLimiter.postgres.test.js          [NEW — 8 tests T168-T175]
```

**Callers unchanged.** `ai.service.js:259` (`aiComplete`) and `:397` (`aiStream`) still call `checkRateLimit(userId)` and `incrementRateLimit(userId)`. The dispatch to in-memory vs Postgres is internal.

**Unchanged:**
- All controllers
- All routes
- `ai.usageWriter.js` core (existing UsageTracking writes and 90-day prune)
- `rateLimit.middleware.js` (out of scope)
- Client code

---

## Schema

Add to `schema.prisma` (place near `UsageTracking` at line 1953):

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

Rationale for `String day` (not `DateTime @db.Date`): matches `new Date().toISOString().split("T")[0]` exactly; no timezone-conversion drift in the Prisma client. First migration; no historical data.

**No `User` back-relation.** The counter is telemetry-adjacent, self-cleaning within 2 days, and doesn't need `onDelete: Cascade` semantics — a deleted user's stale counter row will get pruned naturally. Keeping the model detached avoids the User model growing another relation for a transient table.

### Migration SQL

```sql
CREATE TABLE "ai_usage_daily_counter" (
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_usage_daily_counter_pkey" PRIMARY KEY ("userId", "day")
);

CREATE INDEX "ai_usage_daily_counter_day_idx" ON "ai_usage_daily_counter"("day");
```

---

## Algorithm

### `ai.rateLimiter.inMemory.js` — extraction (behavior unchanged)

```js
import { AI_DAILY_LIMIT } from "../config/env.js";

const rateLimitMap = new Map();
const RATE_LIMIT = AI_DAILY_LIMIT;

function todayUtc() {
  return new Date().toISOString().split("T")[0];
}

function getRateLimitKey(userId) {
  return `${userId}:${todayUtc()}`;
}

// Interface is async (returns Promise) so the postgres backend can drop
// in without changing call sites. Impl is sync-under-the-hood.
export async function check(userId) {
  const key = getRateLimitKey(userId);
  const count = rateLimitMap.get(key) || 0;
  if (count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, limit: RATE_LIMIT };
  }
  return { allowed: true, remaining: RATE_LIMIT - count, limit: RATE_LIMIT };
}

export async function increment(userId) {
  const key = getRateLimitKey(userId);
  const count = rateLimitMap.get(key) || 0;
  rateLimitMap.set(key, count + 1);
  // 1% GC of yesterday's keys — preserved from original.
  if (Math.random() < 0.01) {
    const today = todayUtc();
    for (const [k] of rateLimitMap) {
      if (!k.endsWith(today)) rateLimitMap.delete(k);
    }
  }
}

// Test-only reset (for existing test suite that hammers the counter).
export function _resetForTests() {
  rateLimitMap.clear();
}
```

### `ai.rateLimiter.postgres.js` — new backend

```js
import prisma from "../lib/prisma.js";
import { AI_DAILY_LIMIT } from "../config/env.js";

const RATE_LIMIT = AI_DAILY_LIMIT;

function todayUtc() {
  return new Date().toISOString().split("T")[0];
}

export async function check(userId) {
  const day = todayUtc();
  try {
    const row = await prisma.aiUsageDailyCounter.findUnique({
      where: { userId_day: { userId, day } },
      select: { count: true },
    });
    const count = row?.count ?? 0;
    if (count >= RATE_LIMIT) {
      return { allowed: false, remaining: 0, limit: RATE_LIMIT };
    }
    return { allowed: true, remaining: RATE_LIMIT - count, limit: RATE_LIMIT };
  } catch (err) {
    console.warn(
      `[rateLimiter:pg] check DB error, failing open: ${err?.code || err?.message}`,
    );
    // Fail-open: DB blip must not cascade into an AI-surface outage.
    return { allowed: true, remaining: RATE_LIMIT, limit: RATE_LIMIT };
  }
}

export async function increment(userId) {
  const day = todayUtc();
  try {
    await prisma.aiUsageDailyCounter.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch (err) {
    console.warn(
      `[rateLimiter:pg] increment DB error, telemetry loss: ${err?.code || err?.message}`,
    );
    // Fail-open silently — a missed increment is a soft undercount, not
    // a user-facing failure. Real spend still lands in UsageTracking.
  }
}
```

### `ai.service.js` — flag dispatch (replaces L69-97)

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

Callers at L259 and L397 already sit inside async functions and use `await` in the surrounding logic. The signature change from sync to async is transparent — Prisma calls are already async elsewhere in these functions.

**Note:** `incrementRateLimit` in the current code is fire-and-forget-adjacent (result unused). To preserve latency behavior — the AI response should return to the user AS FAST as possible, not wait for a Postgres UPSERT — we can either `await` the increment (adds ~1-3ms Postgres latency to the response, negligible) OR fire-and-forget with `.catch()`. **Recommendation: `await` the increment.** The 1-3ms is dwarfed by the OpenAI call it just followed, and awaiting means a Prisma error is captured for logging within the request path.

### Atomicity guarantee

Prisma's `upsert` on Postgres compiles to `INSERT ... ON CONFLICT ("userId", "day") DO UPDATE SET "count" = "ai_usage_daily_counter"."count" + 1, "updatedAt" = ...`. Postgres holds the row lock for the duration of the ON CONFLICT resolution. Two concurrent upserts serialize at the row-lock level under READ COMMITTED (Postgres default). No `SELECT FOR UPDATE` wrapper needed; no application-level lock needed.

### TOCTOU on check-then-increment (soft cap, preserved)

The current in-memory implementation has an identical race — between check and increment, a concurrent request can push over the cap. This is a **soft cost cap**, not a hard security boundary. Bursting by 1-2 requests over the cap is acceptable at the tail; the alternative (reserve-atomic upfront with rollback-on-failure) would consume slots for AI calls that later fail — worse UX for the same daily cost delta.

If future requirements convert this to a hard billing gate, switch to reserve-atomic. Not in Sprint 7 scope.

### Fail-open on DB error

Both `check` and `increment` catch DB errors, log a single-line warning with error code, and return safely:

- **`check` fail-open**: returns `{allowed: true, remaining: LIMIT, limit: LIMIT}`. Rationale: a DB blip is already breaking most user-facing flows; adding "AI features blocked because the counter is unreachable" on top makes the outage worse without cost benefit.
- **`increment` fail-open**: returns void; the missed increment is a soft undercount. Real spend still lands in `UsageTracking` (separate writer path).

### Prune extension (extends `ai.usageWriter.js`)

```js
// Inside the existing 24h prune fn, after the UsageTracking deleteMany:
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

Rationale for 2-day floor: yesterday's counter is stale at UTC midnight. A 2-day window keeps a brief overlap where late-arriving increments for `day = yesterday` can still land (they'd create a fresh row, pruned next sweep).

---

## `env.js` addition

```js
FEATURE_PERSIST_RATE_LIMITER: process.env.FEATURE_PERSIST_RATE_LIMITER ?? "false"
```

Default `"false"` on all environments until ops flips it in Railway. No client-side counterpart (backend-only flag; no VITE mirror needed).

---

## Tests — 8 new (T168-T175)

**File**: `server/test/services/ai.rateLimiter.postgres.test.js` (NEW)

Mock pattern (matches Sprint 6 discipline — hoisted vi.fn + mockReset in beforeEach):

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  aiUsageDailyCounter: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

// Force LIMIT to a small predictable number for these tests.
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, AI_DAILY_LIMIT: 3 };
});

const { check, increment } = await import(
  "../../src/services/ai.rateLimiter.postgres.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.aiUsageDailyCounter.findUnique.mockReset();
  prismaMock.aiUsageDailyCounter.upsert.mockReset();
});
```

### Per-test design

**T168 check — no row exists → allowed with full remaining**:
```js
prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce(null);
const r = await check("user_1");
expect(r).toEqual({ allowed: true, remaining: 3, limit: 3 });
const arg = prismaMock.aiUsageDailyCounter.findUnique.mock.calls[0][0];
expect(arg.where.userId_day.userId).toBe("user_1");
expect(arg.where.userId_day.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
```

**T169 check — count below LIMIT → allowed with computed remaining**:
```js
prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce({ count: 1 });
const r = await check("user_1");
expect(r).toEqual({ allowed: true, remaining: 2, limit: 3 });
```

**T170 check — count at LIMIT → denied**:
```js
prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce({ count: 3 });
const r = await check("user_1");
expect(r).toEqual({ allowed: false, remaining: 0, limit: 3 });
```

**T171 check DB error → fails open**:
```js
prismaMock.aiUsageDailyCounter.findUnique.mockRejectedValueOnce(new Error("connection refused"));
const r = await check("user_1");
expect(r).toEqual({ allowed: true, remaining: 3, limit: 3 });
// Warning was logged (spy on console.warn to verify).
```

**T172 increment first call — upsert with `create` populated**:
```js
prismaMock.aiUsageDailyCounter.upsert.mockResolvedValueOnce({ count: 1 });
await increment("user_1");
const arg = prismaMock.aiUsageDailyCounter.upsert.mock.calls[0][0];
expect(arg.where.userId_day.userId).toBe("user_1");
expect(arg.create).toEqual({ userId: "user_1", day: expect.any(String), count: 1 });
expect(arg.update).toEqual({ count: { increment: 1 } });
```

**T173 increment subsequent — the update branch fires atomically** (structural: upsert always passes both create and update; Postgres selects one based on ON CONFLICT):
```js
prismaMock.aiUsageDailyCounter.upsert.mockResolvedValueOnce({ count: 2 });
await increment("user_1");
expect(prismaMock.aiUsageDailyCounter.upsert).toHaveBeenCalledTimes(1);
const arg = prismaMock.aiUsageDailyCounter.upsert.mock.calls[0][0];
// The increment expression is what makes the atomic path work — assert it.
expect(arg.update.count).toEqual({ increment: 1 });
```

**T174 increment DB error → fails open silently**:
```js
prismaMock.aiUsageDailyCounter.upsert.mockRejectedValueOnce(new Error("connection lost"));
await expect(increment("user_1")).resolves.toBeUndefined();  // no throw
// Warning was logged.
```

**T175 day rollover — where clause uses fresh day string after UTC midnight**:
```js
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-07-01T23:59:59Z"));
prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce({ count: 2 });
await check("user_1");
const arg1 = prismaMock.aiUsageDailyCounter.findUnique.mock.calls[0][0];
expect(arg1.where.userId_day.day).toBe("2026-07-01");

vi.setSystemTime(new Date("2026-07-02T00:00:01Z"));  // 2 seconds later, next UTC day
prismaMock.aiUsageDailyCounter.findUnique.mockResolvedValueOnce(null);
await check("user_1");
const arg2 = prismaMock.aiUsageDailyCounter.findUnique.mock.calls[1][0];
expect(arg2.where.userId_day.day).toBe("2026-07-02");
vi.useRealTimers();
```

### Existing test adaptations

- **`test/ai/service.test.js:363-386`** (`"throws RATE_LIMITED before calling the client when the user is over the cap"`) — uses `checkRateLimit` synchronously. Now async → add `await`. Flag defaults to `false`, so this exercises the in-memory backend — behavior unchanged. The test's loop `while (r.allowed)` becomes `while ((r = await checkRateLimit(userId)).allowed)`.
- **`test/ai/smoke.test.js:22-28`** — smoke test of `checkRateLimit` shape. Same async adaptation. No mock changes.

### Test count target

- Baseline (post 6c): **1386**
- New in Sprint 7: **+8**
- Existing tests adapted (no count delta): 2
- Target: **1394**

---

## Rollout — two-phase

### Phase 1 (Sprint 7 scope)

Ship code + migration + tests. Feature flag defaults to `"false"` → zero behavior change in production on merge. In-memory path unchanged. New Postgres path exists in the codebase but is not exercised by any live traffic. New table exists in the DB but stays empty.

### Phase 2 (ops, out of sprint scope)

Ops flips `FEATURE_PERSIST_RATE_LIMITER=true` on Railway. Redeploy propagates. In-memory Map goes cold; Postgres becomes the source of truth. Watch `[rateLimiter:pg]` warning logs for 24-48h. If clean → **future sprint** deletes the in-memory path.

**Rollback**: flip flag back to `"false"` in Railway; the deploy that follows uses in-memory again. No code revert needed. Full rollback in one env-var change, ~90s propagation.

---

## Done criteria

- Migration applied locally; `prisma migrate status` clean; drift-fix prompt did NOT run (per CLAUDE.md workflow)
- 8 new tests pass; 2 existing rate-limiter tests adapted for async signature and still pass
- Full suite at **1394**
- `npm run lint` (server + client) exit 0
- Server + client audit exit 0
- Client `npm run build` clean
- Feature flag `FEATURE_PERSIST_RATE_LIMITER` documented in `env.js` + surfaced in `.env.example` if that file exists
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 7 row → ✅ shipped (Phase 1 only)
- **4-role panel review** completed pre-implementation; CHANGES_REQUESTED items folded in (standing rule per `feedback_multi_agent_review_before_code.md`)
- Any divergences captured; security/correctness escalation override on the fail-open branches, the atomic-upsert increment path, and the flag-dispatch (getting the flag comparison wrong flips users to the untested path)

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | **YES** — new table only, no data migration, no column changes on existing tables |
| Behavior change (flag OFF, ships this sprint) | None |
| Behavior change (flag ON, Phase 2 ops) | Rate-limit source of truth moves from process-local Map to Postgres. Semantically identical from the user's perspective on 1 replica. Reduces cap from N× to 1× at N replicas — the point of the sprint. |
| Client impact | None (backend-only) |
| Test runtime impact | +8 mock-only tests, sub-100ms |
| Backward compatibility | Full — in-memory path preserved as flag-off default |
| Rollback | Env var flip on Railway; no code revert |
| Risk floor | Low for Phase 1 (flag-guarded, defaults OFF). Medium for Phase 2 (actual behavior swap) mitigated by the fail-open backstop + one-env-var reversibility |

---

## Backward compatibility

- All existing callers unchanged (dispatch is internal to `ai.service.js`)
- `checkRateLimit` return shape unchanged: `{ allowed, remaining, limit }`
- `AIError("RATE_LIMITED", ...)` thrown identically on cap exhaustion
- Client-side `USER_RATE_LIMIT` fallback (`aiSurface.test.js:83`) unchanged
- Existing `UsageTracking` table + writer path fully unchanged (this sprint adds a NEW table for a DIFFERENT purpose — counter vs event log; the two are complementary, not overlapping)

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — schema, migration SQL, both backends, all 8 tests, adapter changes for existing tests all specified concretely |
| Internal consistency | New table `AiUsageDailyCounter` referenced consistently. `String day` key format matches existing `todayUtc()` output. Composite PK enables atomic UPSERT. Flag naming (`FEATURE_PERSIST_RATE_LIMITER`) consistent across env.js, dispatch, and test override |
| Scope | Tight: user-AI counter only. Middleware per-IP, phase-2 flag-flip, and in-memory-path deletion all explicitly carved |
| Ambiguity | Three explicit calls: (a) `String` vs `DateTime @db.Date` decided in favor of String with rationale; (b) reserve-atomic vs check-then-increment decided in favor of preserving current soft-cap semantics with rationale; (c) `await increment` vs fire-and-forget decided in favor of await for consistent error logging |
| Adversarial review | Highest-risk paths: flag comparison (`=== "true"` — string comparison, not boolean; typo would flip to wrong backend silently). Fail-open branches (both catch blocks) — tests T171 + T174 cover them. Atomic-upsert semantics — Postgres provides them, tests assert on the argument shape (`update: { count: { increment: 1 } }`) not the persistence itself, so the assertion is a contract test |
| Risk floor | Low. Flag OFF ships zero behavior change. Migration is additive-only. Rollback is one env var. |

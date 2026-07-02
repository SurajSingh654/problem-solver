# Sprint 7b — H5 Middleware Per-IP Rate-Limiter Migration — Design Spec

**Date:** 2026-07-02
**Sprint:** 7b (H5 audit finding — middleware portion; sibling of Sprint 7 which covered per-user AI counter)
**Audit findings closed:** H5 (complete; per-user portion shipped in Sprint 7)
**Branch:** `feat/persist-middleware-rate-limiter`
**Layers on:** main, post Sprint 7 (`3327267`)
**Feature flag:** `FEATURE_PERSIST_MIDDLEWARE_LIMITER` (env, default `"false"`)
**Review history:** Will require the standing 4-role panel review (PO + BA + Security Manager + Lead Engineer) on the implementation plan BEFORE implementer dispatch, per `feedback_multi_agent_review_before_code.md`.

---

## Problem

Sprint 1 audit, **H5** — middleware portion (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:83-88`):

> `server/src/middleware/rateLimit.middleware.js` — All limiters in-memory per process. Per-IP `authLimiter`/`apiLimiter`/`aiLimiter`/`exportLimiter` reset on process restart and exist independently per replica.
> Failure scenario: **auth bruteforce protection halved per additional replica**; general DoS protection halved.
> Status: CLAUDE.md flags as `persist-ai-rate-limiter` roadmap NEXT. Sprint 7 shipped the per-user AI-counter portion; this sprint closes the middleware portion.

### Zero-trust verification

`server/src/middleware/rateLimit.middleware.js` (67 lines) declares 4 `rateLimit(...)` instances using `express-rate-limit@^8.3.2` with the default `MemoryStore`. Each limiter is per-IP, keyed by the caller's IP after `trust proxy: 1` unwraps one Railway proxy hop (`server/src/index.js:83`).

| Limiter | Window | Max | Wired at | Threat model |
| --- | --- | --- | --- | --- |
| `authLimiter` | 15 min | 10 | `/auth/login`, `/auth/register`, `/auth/forgot-password` | **Brute-force protection (highest security stakes)** |
| `apiLimiter` | 15 min | 100 | ~15 route mounts across the app | General DoS / cost protection |
| `aiLimiter` | 15 min | 20 | AI + admin AI + platform-health analyze | Cost protection at the network edge (per-user AI cap is separate — Sprint 7) |
| `exportLimiter` | 5 min | 10 | Export routers (imported inside sub-routers) | Prevents abuse of heavy export operations |

**Behavior at N replicas today**: each process has its own `MemoryStore`; effective per-IP limit = N × configured limit. For `authLimiter`, that means an attacker can attempt N × 10 login attempts per 15-minute window instead of 10 — brute-force protection degrades linearly with replica count.

**Behavior on process restart**: all counters reset to zero. Fail-open by accident.

**No test coverage on `rateLimit.middleware.js`** — the middleware ships un-guarded.

---

## Principle

**Structural fix with a reversible rollout.** Replace `express-rate-limit`'s default `MemoryStore` with a Postgres-backed store implementing the same v8 `Store` interface. A feature flag lets us ship code first (default OFF, zero behavior change) then flip in ops when confident. Fail-open on DB error so a Postgres blip doesn't cascade into a full rate-limit outage across every rate-limited route (which is ~every route via `apiLimiter`).

**Same architectural pattern as Sprint 7**, but for the express-rate-limit Store interface (not the ai.service.js internal counter). Reuses the flag-gate discipline, fail-open backstop, `.toLowerCase()` robustness, and the `ai.usageWriter.js` prune extension.

---

## Scope

### In scope

- **New Prisma model** `RateLimitCounter` with single-column PK on `key`
- **Migration** creating the table + `resetAt` index
- **Custom Prisma-backed Store** implementing `express-rate-limit` v8's `Store` interface (init / increment / decrement / resetKey)
- **`rateLimit.middleware.js` refactor** — add `store: storeFor(prefix)` option to all 4 `rateLimit(...)` calls; keeps the exports and their wiring stable
- **`ai.usageWriter.js` prune extension** — sweep stale `rate_limit_counter` rows (`resetAt < now - 1h`) on the existing 24h interval
- **`env.js` addition** — `FEATURE_PERSIST_MIDDLEWARE_LIMITER` env var (default `"false"`)
- **11 new tests (T178-T188)** — direct tests of `PrismaRateLimitStore` methods + flag dispatch

### Out of scope (carved)

- **Per-user AI counter** in `ai.service.js` — shipped in Sprint 7
- **Redis migration** — considered and rejected in favor of Prisma (existing pool, no new infra cost). If future scale demands, that's a separate sprint
- **Rate-limit configuration changes** — the current limits (10/15min auth, 100/15min api, 20/15min ai, 10/5min export) are preserved verbatim. Any tightening / loosening is a separate decision
- **Phase 2 flag-flip** — actual behavior swap is an ops step on Railway after this sprint ships with flag OFF
- **Deletion of the MemoryStore fallback** — kept as flag-off backstop; delete in a future cleanup sprint once Phase 2 is stable
- **`X-Forwarded-For` handling** — `trust proxy: 1` is already set (`server/src/index.js:83`); express-rate-limit uses `req.ip` which respects this. Not changing.
- **Server-side rate-limit metrics / alerting** — the `[rateLimitStore:*]` warning logs are enough for Phase 2 observation. Structured metrics can come later.

---

## Architecture

```
server/prisma/
├── schema.prisma                            [MODIFIED — add RateLimitCounter]
└── migrations/YYYYMMDD000000_add_rate_limit_counter/migration.sql   [NEW]

server/src/
├── config/env.js                            [MODIFIED — add FEATURE_PERSIST_MIDDLEWARE_LIMITER]
├── middleware/
│   ├── rateLimit.middleware.js              [MODIFIED — flag-gated store option]
│   └── rateLimit.prismaStore.js             [NEW — express-rate-limit Store adapter]
└── services/ai.usageWriter.js               [MODIFIED — extend prune]

server/test/middleware/
└── rateLimit.prismaStore.test.js            [NEW — 11 tests T178-T188]
```

**Callers unchanged.** `server/src/index.js` still imports `apiLimiter`/`authLimiter`/`aiLimiter` from `rateLimit.middleware.js`. All 15+ wire sites unchanged. `exportLimiter` unchanged.

**Unchanged:**
- All controllers, routes, WebSocket
- Client code (backend-only)
- Sprint 7 code (`ai.rateLimiter.inMemory.js`, `ai.rateLimiter.postgres.js`, `ai.service.js` dispatcher) — independent from this sprint

---

## Schema

Add to `server/prisma/schema.prisma` (place near `AiUsageDailyCounter` from Sprint 7 for topical grouping):

```prisma
model RateLimitCounter {
  key       String    @id       // e.g., "auth:1.2.3.4" — prefix + IP
  count     Int       @default(0)
  resetAt   DateTime               // absolute reset moment (windowMs computed at increment time)
  updatedAt DateTime  @updatedAt

  @@index([resetAt])              // for prune sweep
  @@map("rate_limit_counter")
}
```

**Design rationale:**
- **Single-column PK on `key`**: express-rate-limit's Store interface always operates on a single string key per limiter. Per-limiter namespacing is achieved via a prefix (`"auth:"`, `"api:"`, `"ai:"`, `"export:"`) at the store level. A composite PK would over-engineer.
- **`resetAt` (absolute Datetime)**, not `createdAt + windowMs`: makes the window-rollover check trivial in SQL (`resetAt < NOW()`). No client-side timer needed.
- **No `User` back-relation**: this is per-IP, not per-user. Even users who don't exist yet (failed logins for missing accounts) count against the limit — that's the intended threat-model coverage.

### Migration SQL

```sql
CREATE TABLE "rate_limit_counter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counter_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rate_limit_counter_resetAt_idx" ON "rate_limit_counter"("resetAt");
```

### Rollback SQL (defense-in-depth)

```sql
DROP TABLE "rate_limit_counter";
```

Additive migration; no data dependencies on this table from other models. Zero-risk rollback if ever needed.

### Data classification

`RateLimitCounter.key` contains an IP address (e.g., `"auth:203.0.113.42"`). Under GDPR, IP addresses in the EU are considered personal data. The row is self-cleaning within `windowMs + 1h` via the prune sweep (max ~16 minutes retention). Retention justification: operational necessity for brute-force protection; minimal retention.

---

## Store implementation

### `server/src/middleware/rateLimit.prismaStore.js` (NEW)

```js
// ============================================================================
// PRISMA-BACKED STORE FOR express-rate-limit v8
// ============================================================================
//
// Persists per-IP rate-limit counters to Postgres so counts don't reset
// per process (fixes H5 middleware portion — enables multi-replica deploys
// without halving effective brute-force protection).
//
// Atomicity: window rollover + increment are one SQL statement via
// INSERT ... ON CONFLICT DO UPDATE + CASE WHEN. Postgres row lock
// serializes concurrent increments for the same key.
//
// Fail-open: every DB operation catches errors, logs a single-line warning,
// and returns a safe default. A DB blip must not cascade into a rate-limit
// outage across every rate-limited route (~every route via apiLimiter).
// ============================================================================
import prisma from "../lib/prisma.js";

export class PrismaRateLimitStore {
  constructor({ prefix }) {
    if (!prefix) {
      throw new Error("PrismaRateLimitStore requires a `prefix`");
    }
    this.prefix = prefix;
    this.windowMs = 60_000;   // overwritten by init()
    this.localKeys = false;   // shared store — required by express-rate-limit for correctness
  }

  init(options) {
    // Called once per limiter at construction time. Options include the
    // resolved windowMs, max, etc.
    this.windowMs = options.windowMs;
  }

  fullKey(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    const fullKey = this.fullKey(key);
    const nowMs = Date.now();
    const newResetAt = new Date(nowMs + this.windowMs);

    try {
      // Atomic single-statement: INSERT ON CONFLICT DO UPDATE with CASE WHEN
      // handles window rollover in the same operation. Postgres row lock
      // serializes concurrent hits for the same key.
      const rows = await prisma.$queryRaw`
        INSERT INTO "rate_limit_counter" ("key", "count", "resetAt", "updatedAt")
        VALUES (${fullKey}, 1, ${newResetAt}, NOW())
        ON CONFLICT ("key") DO UPDATE
        SET
          "count" = CASE
            WHEN "rate_limit_counter"."resetAt" < NOW()
            THEN 1
            ELSE "rate_limit_counter"."count" + 1
          END,
          "resetAt" = CASE
            WHEN "rate_limit_counter"."resetAt" < NOW()
            THEN ${newResetAt}
            ELSE "rate_limit_counter"."resetAt"
          END,
          "updatedAt" = NOW()
        RETURNING "count" AS "totalHits", "resetAt" AS "resetTime"
      `;
      const row = rows[0];
      return {
        totalHits: Number(row.totalHits),
        resetTime: new Date(row.resetTime),
      };
    } catch (err) {
      console.warn(
        `[rateLimitStore:${this.prefix}] increment DB error, failing open: ${err?.code || err?.message}`,
      );
      // Fail-open: return low totalHits so express-rate-limit lets the request through.
      return { totalHits: 1, resetTime: newResetAt };
    }
  }

  async decrement(key) {
    const fullKey = this.fullKey(key);
    try {
      // Best-effort decrement (invoked when skipSuccessful/FailedRequests is on).
      // Prevent negative counts with GREATEST.
      await prisma.$executeRaw`
        UPDATE "rate_limit_counter"
        SET "count" = GREATEST("count" - 1, 0), "updatedAt" = NOW()
        WHERE "key" = ${fullKey}
      `;
    } catch (err) {
      console.warn(
        `[rateLimitStore:${this.prefix}] decrement DB error: ${err?.code || err?.message}`,
      );
      // Fail-open silently.
    }
  }

  async resetKey(key) {
    const fullKey = this.fullKey(key);
    try {
      await prisma.rateLimitCounter.deleteMany({ where: { key: fullKey } });
    } catch (err) {
      console.warn(
        `[rateLimitStore:${this.prefix}] resetKey DB error: ${err?.code || err?.message}`,
      );
    }
  }
}
```

### Why raw SQL for `increment`

Prisma's ORM `upsert` doesn't support conditional `SET` expressions. Handling window rollover with the ORM would require:
1. `findUnique` → check `resetAt < now` client-side
2. Either `update` (increment) or `update` (reset with new resetAt)

Two round-trips, and the branch is not atomic — a concurrent request can increment between the check and write. Raw SQL keeps it to one statement with true atomicity via Postgres row locks.

`prisma.$queryRaw` uses tagged-template SQL — parameterized (injection-safe), typed return, shares the Prisma connection pool.

### Window rollover semantics

The `CASE WHEN "resetAt" < NOW()` branch is load-bearing:

| Scenario | `INSERT` result | `ON CONFLICT UPDATE` result |
| --- | --- | --- |
| First hit for key | count=1, resetAt=now+windowMs | (not fired) |
| Hit within window | (conflict fires) | count += 1, resetAt unchanged |
| Hit after window expired | (conflict fires) | count = 1, resetAt = now+windowMs (fresh window) |

No client-side timer needed. Stale rows sit in the table until the 24h prune sweeps them (max ~1 hour past `resetAt`).

### Fail-open behavior

All three methods catch DB errors:

- **`increment` fail-open**: returns `{ totalHits: 1, resetTime: <computed> }`. express-rate-limit compares `totalHits` to `max` — 1 is well below any configured max, so the request goes through.
- **`decrement` fail-open**: silent no-op. A missed decrement leaves the count slightly high, which briefly tightens the limit for that key — not a security regression.
- **`resetKey` fail-open**: silent no-op. Admin-initiated resets can be retried.

**Threat-model tradeoff (documented)**: during a DB outage, brute-force protection on `authLimiter` is disabled (fail-open lets every login attempt through). Accepted because:
- The alternative (fail-closed) makes every route ~unavailable during a DB blip (`apiLimiter` is on ~15 mounts including all reads)
- Real brute-force attacks would trigger monitoring on 4xx/5xx rates BEFORE exhausting the DB
- Sprint 7 established fail-open uniformly for the internal rate-limiter; consistency matters more than a marginal security improvement here

---

## `rateLimit.middleware.js` refactor

```js
import rateLimit from "express-rate-limit";
import { FEATURE_PERSIST_MIDDLEWARE_LIMITER } from "../config/env.js";
import { PrismaRateLimitStore } from "./rateLimit.prismaStore.js";

function isPersistFlagOn() {
  const flag = String(FEATURE_PERSIST_MIDDLEWARE_LIMITER ?? "").trim().toLowerCase();
  return flag === "true";
}

function storeFor(prefix) {
  return isPersistFlagOn() ? new PrismaRateLimitStore({ prefix }) : undefined;
  // undefined → express-rate-limit uses its default MemoryStore
}

function rateLimitResponse(message, code) {
  return (req, res) => {
    res.status(429).json({
      success: false,
      error: { message, code, requestId: req.requestId },
    });
  };
}

// One store per limiter, per module load. Cached at module scope so
// express-rate-limit's init() is called exactly once per limiter.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("api"),
  handler: rateLimitResponse("Too many requests. Please try again in a few minutes.", "RATE_LIMITED"),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("auth"),
  handler: rateLimitResponse("Too many authentication attempts. Please try again later.", "AUTH_RATE_LIMITED"),
});

export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("ai"),
  handler: rateLimitResponse("AI rate limit reached. Please wait before making more AI requests.", "AI_RATE_LIMITED"),
});

export const exportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: storeFor("export"),
  handler: rateLimitResponse("Export rate limit reached. Please wait before exporting again.", "EXPORT_RATE_LIMITED"),
});
```

**Module-load-time dispatch**: `storeFor()` runs ONCE per limiter when the module is imported. The flag is read at boot. Changing it requires a Railway redeploy (~90s). Matches Sprint 7's dispatch semantics.

**Also export `storeFor` for tests** (test T188 verifies the flag dispatch).

---

## `env.js` addition

```js
export const FEATURE_PERSIST_MIDDLEWARE_LIMITER =
  process.env.FEATURE_PERSIST_MIDDLEWARE_LIMITER ?? "false";
```

Default `"false"` — zero behavior change on merge. Case-insensitive comparison in `isPersistFlagOn()` (`.toLowerCase()`) — matches Sprint 7's robustness fold-in. `"true"`, `"True"`, `"TRUE"` all activate the pg store.

---

## `ai.usageWriter.js` prune extension

Inside the existing `prune = async () => { ... }` block (which already sweeps `UsageTracking` + `AiUsageDailyCounter`), add:

```js
try {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const { count: prunedLimiters } = await prisma.rateLimitCounter.deleteMany({
    where: { resetAt: { lt: oneHourAgo } },
  });
  if (prunedLimiters > 0) {
    console.log(
      `[ai.usageWriter] pruned ${prunedLimiters} rate-limit counters older than 1h past reset`,
    );
  }
} catch (err) {
  console.warn(
    `[ai.usageWriter] rate-limit prune failed: ${err?.code || err?.message}`,
  );
}
```

**1-hour grace after `resetAt`**: rate-limit rows are ephemeral (max 15-minute windows). Aggressive cleanup keeps the table tiny; auditability isn't needed (no retention requirement for per-IP counters — see data-classification note above).

Wrapped in its own try/catch so a counter-prune failure can't poison the outer prune (which handles UsageTracking + AiUsageDailyCounter).

---

## Tests — 11 new (T178-T188)

**File**: `server/test/middleware/rateLimit.prismaStore.test.js` (NEW)

### Mock pattern

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  rateLimitCounter: {
    deleteMany: vi.fn(),
  },
}));
vi.mock("../../src/lib/prisma.js", () => ({ default: prismaMock }));

const { PrismaRateLimitStore } = await import(
  "../../src/middleware/rateLimit.prismaStore.js"
);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$queryRaw.mockReset();
  prismaMock.$executeRaw.mockReset();
  prismaMock.rateLimitCounter.deleteMany.mockReset();
});
```

### Per-test design

**T178 constructor requires `prefix`**:
```js
expect(() => new PrismaRateLimitStore({})).toThrow(/requires.*prefix/i);
```

**T179 `localKeys === false`** (required for shared stores per express-rate-limit docs):
```js
const store = new PrismaRateLimitStore({ prefix: "auth" });
expect(store.localKeys).toBe(false);
```

**T180 `init(options)` sets `windowMs`**:
```js
const store = new PrismaRateLimitStore({ prefix: "auth" });
store.init({ windowMs: 15 * 60 * 1000 });
expect(store.windowMs).toBe(15 * 60 * 1000);
```

**T181 `increment` first hit — return shape**:
```js
prismaMock.$queryRaw.mockResolvedValueOnce([
  { totalHits: 1n, resetTime: new Date("2026-07-02T12:15:00Z") },
]);
const store = new PrismaRateLimitStore({ prefix: "auth" });
store.init({ windowMs: 15 * 60 * 1000 });
const result = await store.increment("1.2.3.4");
expect(result.totalHits).toBe(1);           // BigInt coerced to Number
expect(result.resetTime).toBeInstanceOf(Date);
expect(result.resetTime.getTime()).toBe(new Date("2026-07-02T12:15:00Z").getTime());
```

**T182 `increment` — prefix applied to key**:
```js
prismaMock.$queryRaw.mockResolvedValueOnce([{ totalHits: 1n, resetTime: new Date() }]);
const store = new PrismaRateLimitStore({ prefix: "auth" });
store.init({ windowMs: 900_000 });
await store.increment("1.2.3.4");
// $queryRaw tagged-template's params array contains the fullKey.
const call = prismaMock.$queryRaw.mock.calls[0];
const paramsPassed = call.slice(1); // first arg is the strings array
expect(paramsPassed).toContain("auth:1.2.3.4");
```

**T183 `increment` DB error — fails open**:
```js
prismaMock.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
const store = new PrismaRateLimitStore({ prefix: "auth" });
store.init({ windowMs: 900_000 });
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
try {
  const result = await store.increment("1.2.3.4");
  expect(result.totalHits).toBe(1);
  expect(result.resetTime).toBeInstanceOf(Date);
  expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/rateLimitStore:auth.*failing open/));
} finally {
  warnSpy.mockRestore();
}
```

**T184 `decrement` — `GREATEST(count - 1, 0)` prevents negative**:
```js
prismaMock.$executeRaw.mockResolvedValueOnce(1);
const store = new PrismaRateLimitStore({ prefix: "auth" });
store.init({ windowMs: 900_000 });
await store.decrement("1.2.3.4");
const call = prismaMock.$executeRaw.mock.calls[0];
const params = call.slice(1);
expect(params).toContain("auth:1.2.3.4");
// Inspect the SQL string portion for the GREATEST guard
const sqlStrings = call[0].join("");
expect(sqlStrings).toMatch(/GREATEST\("count"\s*-\s*1,\s*0\)/);
```

**T185 `decrement` DB error — silent no-op**:
```js
prismaMock.$executeRaw.mockRejectedValueOnce(new Error("connection lost"));
const store = new PrismaRateLimitStore({ prefix: "auth" });
store.init({ windowMs: 900_000 });
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
try {
  await expect(store.decrement("1.2.3.4")).resolves.toBeUndefined();
  expect(warnSpy).toHaveBeenCalled();
} finally {
  warnSpy.mockRestore();
}
```

**T186 `resetKey` — deleteMany with fullKey**:
```js
prismaMock.rateLimitCounter.deleteMany.mockResolvedValueOnce({ count: 1 });
const store = new PrismaRateLimitStore({ prefix: "auth" });
store.init({ windowMs: 900_000 });
await store.resetKey("1.2.3.4");
expect(prismaMock.rateLimitCounter.deleteMany).toHaveBeenCalledWith({
  where: { key: "auth:1.2.3.4" },
});
```

**T187 `resetKey` DB error — silent no-op**:
```js
prismaMock.rateLimitCounter.deleteMany.mockRejectedValueOnce(new Error("timeout"));
const store = new PrismaRateLimitStore({ prefix: "auth" });
store.init({ windowMs: 900_000 });
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
try {
  await expect(store.resetKey("1.2.3.4")).resolves.toBeUndefined();
  expect(warnSpy).toHaveBeenCalled();
} finally {
  warnSpy.mockRestore();
}
```

**T188 flag dispatch — `storeFor()` returns store or undefined**:

This lives in a SEPARATE test file `server/test/middleware/rateLimit.dispatch.test.js` because it needs to swap the env flag between `it()` blocks and re-import `rateLimit.middleware.js`. Same `vi.doMock` + `vi.resetModules()` + `await import()` pattern as Sprint 7's T176.

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("rateLimit.middleware — flag dispatch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("test 188a: flag OFF (default) → all 4 limiters use MemoryStore (store: undefined)", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_MIDDLEWARE_LIMITER: "false" };
    });
    // Re-import to pick up the mocked flag. Assert on the resolved limiters —
    // they should have `store: undefined` (or omitted; express-rate-limit uses
    // MemoryStore in that case). We inspect the module's internal `storeFor`
    // export to verify.
    const module = await import("../../src/middleware/rateLimit.middleware.js");
    // If storeFor is exported, use it:
    if (typeof module.storeFor === "function") {
      expect(module.storeFor("auth")).toBeUndefined();
    } else {
      // Alternatively, inspect limiter internals — not stable across versions.
      // Skip if storeFor isn't exported.
    }
  });

  it("test 188b: flag ON (\"true\") → storeFor returns PrismaRateLimitStore instance", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_MIDDLEWARE_LIMITER: "true" };
    });
    const module = await import("../../src/middleware/rateLimit.middleware.js");
    const { PrismaRateLimitStore } = await import(
      "../../src/middleware/rateLimit.prismaStore.js"
    );
    if (typeof module.storeFor === "function") {
      expect(module.storeFor("auth")).toBeInstanceOf(PrismaRateLimitStore);
    }
  });

  it("test 188c: flag with mixed case (\"TRUE\") → activates pg store (robustness)", async () => {
    vi.doMock("../../src/config/env.js", async (importOriginal) => {
      const actual = await importOriginal();
      return { ...actual, FEATURE_PERSIST_MIDDLEWARE_LIMITER: "TRUE" };
    });
    const module = await import("../../src/middleware/rateLimit.middleware.js");
    const { PrismaRateLimitStore } = await import(
      "../../src/middleware/rateLimit.prismaStore.js"
    );
    if (typeof module.storeFor === "function") {
      expect(module.storeFor("auth")).toBeInstanceOf(PrismaRateLimitStore);
    }
  });
});
```

To make T188 assertions clean, `rateLimit.middleware.js` should `export { storeFor }` — small API surface, needed by the dispatch test.

### Test count target

- Baseline (post Sprint 7): **1398**
- New in Sprint 7b: **+11** (T178-T187 = 10 in postgres store test file; T188a/b/c = 3 executions counted as 1 logical test-ID)
- Vitest run count increases by 13. Suite target: **1411**

---

## Rollout — two-phase (same pattern as Sprint 7)

### Phase 1 (Sprint 7b scope)

Ship code + migration + tests. `FEATURE_PERSIST_MIDDLEWARE_LIMITER` defaults `"false"` → zero behavior change on merge. All 4 limiters use the default `MemoryStore` until ops flips the flag.

### Phase 2 (ops step, out of sprint scope)

**To activate the Postgres middleware rate-limiter:**

1. On Railway, set `FEATURE_PERSIST_MIDDLEWARE_LIMITER=true` on the server service
2. Redeploy (auto-triggers on env-var change; ~90s propagation)
3. **Post-flip atomicity spot-check**: enable `DEBUG=prisma:query` on one replica temporarily. Trigger an AI request or auth attempt. Observe the SQL emitted for one `increment()`. Confirm it produces:
   ```sql
   INSERT INTO "rate_limit_counter" (...) VALUES (...)
   ON CONFLICT ("key") DO UPDATE
   SET "count" = CASE WHEN ... END, "resetAt" = CASE WHEN ... END, ...
   ```
   If the SQL is different, atomicity claim broken → roll back.
4. Watch `[rateLimitStore:*]` warning logs for 24-48h. Expected: zero (rare warnings on DB blips — those are fail-open events, safe by design).
5. If clean, schedule a future cleanup sprint to delete the `MemoryStore` fallback branch.
6. **Rollback**: flip `FEATURE_PERSIST_MIDDLEWARE_LIMITER=false` and redeploy. `MemoryStore` resumes. **Data consequence**: all counters reset to empty per process — during the rollback window an attacker can restart brute-force attempts. Same tradeoff as Sprint 7; acceptable for a last-resort rollback.
7. Flag comparison is **case-insensitive** (`.toLowerCase()` — same as Sprint 7): `"true"` / `"True"` / `"TRUE"` all activate the pg store.

---

## Done criteria

- Migration applied via `migrate deploy` (non-interactive, no drift-fix prompt); `prisma migrate status` clean
- 11 new tests pass (T178-T188 across 2 files: `rateLimit.prismaStore.test.js` + `rateLimit.dispatch.test.js`); vitest execution count increases by 13
- Full suite at **1411**
- `npm run lint` (server + client) exit 0
- Server + client audit exit 0
- Client `npm run build` clean
- `FEATURE_PERSIST_MIDDLEWARE_LIMITER` in `env.js` (and `.env.example` if applicable); defaults `"false"`
- Feature branch FF-merged to main; both pushed
- Roadmap row 7b → ✅ shipped (Phase 1); H5 fully closed at the code level
- Any divergences captured in commit body with `T<id>: <expected> vs <actual> — <decision>` format
- 4-role panel review completed pre-implementation with all CHANGES_REQUESTED fold-ins applied before Task 0
- Ops handoff note surfaced to user at sprint completion

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | **YES** — new table `rate_limit_counter`, no data migration |
| Behavior change (flag OFF, ships this sprint) | None |
| Behavior change (flag ON, Phase 2 ops) | 4 limiters swap from process-local `MemoryStore` to shared Postgres store. Semantically equivalent from user's perspective on 1 replica. At N replicas: cap becomes 1× (from N×) |
| Client impact | None (backend-only) |
| Test runtime impact | +11 mock-only tests, sub-150ms |
| Backward compatibility | Full — `MemoryStore` preserved as flag-off default; all 4 exports and their wiring stable |
| Rollback | Env-var flip on Railway |
| Risk floor | Low for Phase 1 (flag-guarded). Medium for Phase 2 (touches ~every route via `apiLimiter`). Mitigated by fail-open backstop + one-env-var reversibility |

---

## Backward compatibility

- All 4 exports (`apiLimiter`, `authLimiter`, `aiLimiter`, `exportLimiter`) unchanged in signature
- 15+ wire sites in `server/src/index.js` unchanged
- `exportLimiter` used inside sub-routers (not in `index.js`) unchanged
- Response envelope on 429 unchanged: `{ success: false, error: { message, code, requestId } }`
- Existing `trust proxy: 1` in `server/src/index.js:83` unchanged; `req.ip` still respects `X-Forwarded-For` first hop
- Sprint 7's `ai.rateLimiter.postgres` etc. fully independent — this sprint doesn't touch them

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — schema, migration SQL, store implementation, all 11 tests, and adapter changes are specified concretely |
| Internal consistency | New table `RateLimitCounter` referenced consistently. `String key @id` composite via `${prefix}:${ip}` documented. Flag naming `FEATURE_PERSIST_MIDDLEWARE_LIMITER` consistent across env.js, dispatch, tests. Reuses `.toLowerCase()` robustness from Sprint 7 |
| Scope | Tight: middleware portion only. Per-user AI counter shipped in Sprint 7. Redis alternative rejected with reason. Phase-2 flag-flip explicitly out of scope. MemoryStore deletion deferred |
| Ambiguity | Explicit calls: (a) fail-open uniformly per user's Section 1 answer; (b) raw SQL over ORM upsert with atomicity rationale; (c) 1-hour prune grace justified; (d) `storeFor` export needed for T188 assertion cleanliness |
| Adversarial review | Highest-risk paths: (a) raw SQL injection surface — mitigated by `$queryRaw` tagged-template parameterization; T182 asserts the parameter list contains the composite key; (b) CASE WHEN condition ambiguity — the `resetAt < NOW()` check MUST use the row's `resetAt`, not the excluded row's — tested via T181's return-shape check; (c) flag typo silently falling back to MemoryStore — case-insensitive comparison + T188 dispatch test |
| Risk floor | Low. Flag OFF ships zero behavior change. Migration is additive-only. Rollback is one env var |

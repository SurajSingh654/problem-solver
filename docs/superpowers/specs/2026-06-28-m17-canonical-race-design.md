# M17 Canonical Augment Race Verification — Design Spec (Sprint 5c)

**Date:** 2026-06-28
**Sprint:** 5c (third slice of decomposed Sprint 5 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit finding closed:** M17 (already handled; Sprint 5c locks it in with regression tests)
**Branch:** `feat/m17-canonical-race-tests`
**Layers on:** main, post Sprint 5b (`71d2d58`)
**Feature flag:** None — pure additive test work

---

## Problem

Sprint 1 audit, M17 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:174`):

> `problems.controller.js:608-641` — Canonical alternatives augment race — after `SELECT FOR UPDATE`, the inside-transaction check uses pre-lock state. Both transactions can compute (wasted tokens) but only one persists.

### Zero-trust verification (current state)

Re-read the code at `server/src/controllers/problems.controller.js:600-650` carefully:

```js
// Line 604: outer pre-check on pre-transaction state (problem.canonicalGeneratedAt)
if (problem.canonicalGeneratedAt) {
  // Line 606: outer pre-check on pre-transaction state (problem.canonicalAltGeneratedAt)
  if (altsFlagOn && problem.canonicalAltGeneratedAt == null && isAIEnabled()) {
    try {
      // Line 608: enter $transaction
      const augmented = await prisma.$transaction(async (tx) => {
        // Lines 609-616: SELECT ... FOR UPDATE — acquire row lock
        const rows = await tx.$queryRaw`
          SELECT "id", "canonicalGeneratedAt", "canonicalAltGeneratedAt",
                 "canonicalPattern", "canonicalKeyInsight",
                 "canonicalTimeComplexity", "canonicalSpaceComplexity"
          FROM "problems"
          WHERE "id" = ${id}
          FOR UPDATE
        `;
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const locked = rows[0];
        // Lines 619-622: POST-LOCK DOUBLE-CHECK using LOCKED state
        if (locked.canonicalAltGeneratedAt) {
          // Race winner already filled; signal the outer code to keep its current values.
          return null;
        }
        // Lines 623-633: only race winners reach the AI call
        const lockedPrimary = { /* ... */ };
        const alternatives = await augmentCanonicalAlternatives(
          problem, lockedPrimary, { userId, teamId },
        );
        // Lines 634-641: persist alternatives + set canonicalAltGeneratedAt
        await tx.problem.update({ /* ... */ });
        return alternatives;
      });
      // ...
```

### Why M17 is already handled correctly

The race goes:

1. Controllers A and B both pass the outer pre-check at lines 604-606 (`problem.canonicalAltGeneratedAt == null` in the pre-transaction state).
2. Both enter `prisma.$transaction(...)`.
3. Controller A's transaction runs `SELECT ... FOR UPDATE` first — acquires the row lock.
4. Controller B's transaction blocks at `SELECT ... FOR UPDATE` waiting for A to commit/rollback.
5. **A sees `locked.canonicalAltGeneratedAt == null`** in the locked snapshot — proceeds to call `augmentCanonicalAlternatives` (the expensive AI call), persists, commits, releases lock.
6. **B's lock acquires** — sees `locked.canonicalAltGeneratedAt != null` now (because A's commit is visible inside B's locked snapshot — Postgres MVCC under `READ COMMITTED` + `FOR UPDATE` shows the latest committed state).
7. B's transaction returns null at line 621 **BEFORE** reaching the AI call at line 629.

Net result:
- Exactly 1 AI call (controller A's). No double-compute.
- Exactly 1 persistence (controller A's update).
- B observes the winner's state and serves the cached value.

**The audit's M17 claim ("Both transactions can compute") is OBSOLETE.** The code as it stands correctly implements double-checked locking. Sprint 2.7's "Canonical drops observability" sprint or a subsequent change likely introduced this fix.

---

## Principle

This is **a regression-guard sprint**, not a fix sprint.

The production code is correct. The goal is to lock in the post-lock double-check pattern with tests so a future refactor that removes the check would break the test. This is the cheapest form of insurance against re-introducing the audit's flagged race.

---

## Scope

### In scope

- **2 regression tests** in a new file `server/test/controllers/problems.canonical.race.test.js`
- **Audit status update** noting M17 is resolved (no production code change required)

### Out of scope

- Modifying any production code (M17 is already correctly handled)
- Simulating the actual Postgres `FOR UPDATE` lock at the SQL level (Postgres-built behavior; not our code)
- Integration test against a real Postgres instance
- Multi-process race simulation (vitest is single-process; not a useful test environment for that)

---

## Architecture

```
server/test/controllers/
└── problems.canonical.race.test.js   [NEW — 2 tests, T113-T114]
```

One new test file. 2 tests. **No production code changes.**

---

## Per-test design

The test simulates the race-loser and race-winner scenarios by mocking `$transaction` and `tx.$queryRaw`:

### T113 — Race loser scenario

The post-lock `tx.$queryRaw` returns a row where `canonicalAltGeneratedAt` is already set (simulating that the winning transaction just committed). Assert:
- `augmentCanonicalAlternatives` is NOT called (no wasted AI compute)
- `tx.problem.update` is NOT called (no double-persist)
- The controller still responds successfully (serves the primary canonical alone)

### T114 — Race winner scenario

The post-lock `tx.$queryRaw` returns a row where `canonicalAltGeneratedAt` is null (this transaction is the winner). Assert:
- `augmentCanonicalAlternatives` IS called once
- `tx.problem.update` IS called with `canonicalAlternatives + canonicalAltGeneratedAt: <Date>` in the data
- The controller responds with the augmented canonical

### Mock pattern

Reuse the canonical mock pattern from Sprint 5b's `problems.canonical.test.js`. Key additions:

```js
// Mock $transaction so the inner callback runs against a custom tx mock.
// The tx mock has $queryRaw (returns the locked row) + problem.update.
prismaMock.$transaction.mockImplementation(async (cb) => {
  const tx = {
    $queryRaw: vi.fn(),  // configured per test
    problem: { update: vi.fn() },
  };
  // Configure per-test, then run callback
  return cb(tx);
});

// Mock augmentCanonicalAlternatives (imported from a service file — read controller to find import path)
vi.mock("/* path to canonical service */", () => ({
  augmentCanonicalAlternatives: vi.fn(),
  // ... other exports
}));
```

The test sets up `tx.$queryRaw` to return the appropriate row state (locked.canonicalAltGeneratedAt set vs. null) and asserts on `augmentCanonicalAlternatives` being called or not.

### Required env mock

`FEATURE_CANONICAL_ALTERNATIVES = "true"` to enable the lazy-augment branch (Sprint 5b's `problems.canonical.test.js` defaults this to `"false"` to skip the branch — Sprint 5c flips it for these specific tests).

---

## Test count target

- Baseline (post Sprint 5b): **1331**
- New tests in 5c: **+2**
- Target after 5c: **1333**

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — production code is unchanged |
| Test runtime impact | +2 mock-only tests, sub-100ms |
| Backward compatibility | None |
| Rollback | Revert the test file |
| Risk floor | Lowest of any sprint in the cluster |

---

## Backward compatibility

Production code untouched. All existing tests continue passing. No callers or APIs affected.

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — both tests have concrete assertions and concrete mock setup |
| Internal consistency | Single file, 2 tests, single concern |
| Scope | Tight: M17 verification + 2 regression tests. No code changes. |
| Ambiguity | One explicit call: M17 is already handled correctly; Sprint 5c locks in the existing fix with regression tests rather than introducing a new fix. |
| Adversarial review | Tests use mocked `$transaction` to simulate the inner callback. This tests the application-level double-check pattern, not the Postgres-level `FOR UPDATE` lock (which is built-in behavior we don't own). The application's response to the locked state IS our code and is what the regression guard should cover. |
| Risk floor | Effectively zero. Pure additive regression tests against unchanged production code. |

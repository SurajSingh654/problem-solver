# Sprint 8c — M35 completeOnboarding Team-Overflow Race Fix — Design Spec

**Date:** 2026-07-03
**Sprint:** 8c (final slice of Sprint 8 cluster per roadmap)
**Audit finding closed:** M35 (all three candidates — two obsolete, one hardened)
**Branch:** `feat/onboarding-race-fix`
**Layers on:** main, post Sprint 8b (`ed649e0`)
**Feature flag:** None — production bugfix + regression tests
**Review history:** 4-role panel to run pre-implementation per `feedback_multi_agent_review_before_code.md`

---

## Problem

Sprint 1 audit, M35 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:207`):

> **M35**: Concurrency — `auth.controller.js:completeOnboarding` (joinCode race), `solutions.controller.js` (archive/restore race), `ai.controller.js:369-387` (force-review cache race) — All untested

### Zero-trust verification

Source-level audit of all three candidates against current code:

| Candidate | Status | Verdict |
|---|---|---|
| `auth.controller.js:completeOnboarding` joinCode race | **REAL** at L404-L480 | Fix + tests |
| `solutions.controller.js` archive/restore race | **PHANTOM** — no such endpoints exist; `Solution` model has no `deletedAt`; git history has never contained `archiveSolution` / `restoreSolution` | Obsolete |
| `ai.controller.js:369-387` force-review cache race | **OBSOLETE** — file deleted in Sprint 2 Task 10 | Obsolete |

**Only one real race remains.** Sprint 8c closes M35 by hardening it and recording the other two as audit inaccuracies.

### The race in detail

`server/src/controllers/auth.controller.js:337-491`, `mode: "team" + joinCode` branch:

```
L404-L414: prisma.team.findUnique({where: {joinCode}}) with _count.currentMembers      [OUTSIDE tx]
L426:      if (team._count.currentMembers >= team.maxMembers) return 400              [OUTSIDE tx]
L437-L480: $transaction { create personalTeam; user.update currentTeamId; membership.createMany }
```

The `_count.currentMembers` read at L404 is not repeated inside the transaction, and no row lock is taken on the `Team`. Two concurrent `POST /auth/onboarding` calls with the same `joinCode` can both see `count=99` when `maxMembers=100`, both pass the L426 check, both commit — team ends up at 101 members.

**Semantic note:** `Team.currentMembers` is `User[] @relation("CurrentTeamMembers")` (schema.prisma:409) — Prisma's `_count.currentMembers` counts USERS whose `currentTeamId` = this team, not `TeamMembership` rows. The invariant SQL therefore counts from `users`, not `TeamMembership`.

### Failure model

Production exposure is low (team growth is human-paced) but the invariant belongs at the DB layer, not application logic. Standing principle: "everything is going to production, we do not have leverage to mess up anything." Same rationale as Sprint 3.2 M22 (reset-code single-use) — a low-frequency race, hardened anyway to move the invariant off the hot path.

---

## Principle

**Minimal production change (~20 lines in one function) + focused regression tests.**

Same pattern as:
- Sprint 2.5 H3 (aiFeedback race) — SELECT FOR UPDATE inside the transaction
- Sprint 3.2 M22 (reset-code single-use) — atomic invariant re-check inside a transaction
- SM-2 review submit (documented in CLAUDE.md) — row lock as first step of the tx

---

## Scope

### In scope

**Production:**
- `server/src/controllers/auth.controller.js:437-480` — extend the transaction with a `tx.$queryRaw` FOR UPDATE lock on the target team + re-check `current_count < maxMembers` under lock + observability log on overflow rejection.

**Tests:** 4 new tests **T243-T246** in existing `server/test/integration/auth.teamContext.integration.test.js` (extends `describe("mode: team — join existing team")` block). Test-harness change: extend `vi.mock("../../src/lib/prisma.js")` to include `$queryRaw` recorder + call-ordered returns queue.

**Roadmap:** mark Sprint 8c ✅ shipped 2026-07-03; document 2/3 M35 candidates confirmed obsolete + 3rd hardened.

### Out of scope (carved)

- **The outer L404-L426 fast-path check** — kept intact as an optimization. Common case (team not near capacity) short-circuits without opening the tx.
- **Refactoring the individual/create-team branches** — those don't have a comparable invariant; individual creates a new personal team (maxMembers=1, no concurrency), create-team creates a new PENDING team.
- **A new `AppError` class** — the existing throw-then-`catch (err)` at L565 is fine; we throw an `Error` with `err.status = 400` / `err.message`, and the outer catch maps to `error(res, err.message, err.status || 500)`.
- **Migration or schema change** — none. Pure application-layer fix using existing pgvector-DB Postgres transaction primitives.

---

## Architecture

```
server/src/controllers/auth.controller.js       [MODIFY — extend join-team tx with SELECT FOR UPDATE]
server/test/integration/auth.teamContext.integration.test.js   [MODIFY — extend prisma mock + add T243-T246]
docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md  [MODIFY — mark 8c shipped, note 2/3 obsolete]
```

**Unchanged:**
- `schema.prisma` — no field additions, no relation changes
- Migrations — none
- All other tests
- Zod schemas
- Client
- Feature-flag surface

---

## The fix

Extend the existing `$transaction` at L437 with a locking pre-check:

```js
// ── TEAM MODE: Join existing team via join code ────
if (mode === "team" && joinCode) {
  const team = await prisma.team.findUnique({
    where: { joinCode },
    select: {
      id: true,
      name: true,
      status: true,
      maxMembers: true,
      createdById: true,
      _count: { select: { currentMembers: true } },
    },
  });

  if (!team) {
    return error(res, "Invalid join code. Please check and try again.", 404);
  }
  if (team.status !== "ACTIVE") {
    return error(res, "This team is not currently accepting members.", 400);
  }
  // Fast-path check — cheap short-circuit before opening the tx.
  // The authoritative check happens under lock inside the tx below.
  if (team._count.currentMembers >= team.maxMembers) {
    return error(res, "This team is full. Please contact the team admin.", 400);
  }

  const teamRole = team.createdById === userId ? "TEAM_ADMIN" : "MEMBER";

  try {
    await prisma.$transaction(async (tx) => {
      // Atomically lock the team row + re-check the maxMembers invariant.
      // Without this lock two concurrent onboarding requests with the same
      // joinCode can both pass the fast-path check above and both commit,
      // overflowing the team. Row-locking the Team serializes concurrent
      // joins on this team without impacting joins to other teams.
      const lockedRows = await tx.$queryRaw`
        SELECT
          id,
          "maxMembers",
          (SELECT COUNT(*)::int
             FROM "users"
             WHERE "currentTeamId" = ${team.id}
               AND "deletedAt" IS NULL) AS current_count
        FROM "Team"
        WHERE id = ${team.id}
        FOR UPDATE
      `;

      const locked = lockedRows?.[0];
      if (!locked) {
        const err = new Error("Team no longer exists.");
        err.status = 404;
        throw err;
      }
      if (locked.current_count >= locked.maxMembers) {
        console.warn(
          `[completeOnboarding:overflow] userId=${userId} ` +
          `teamId=${team.id} attemptedCount=${locked.current_count + 1} ` +
          `maxMembers=${locked.maxMembers}`,
        );
        const err = new Error("This team is full. Please contact the team admin.");
        err.status = 400;
        throw err;
      }

      // Existing tx body — unchanged.
      const personalTeam = await tx.team.create({ ... });
      await tx.user.update({ ... });
      await tx.teamMembership.createMany({ ... });
    });
  } catch (err) {
    if (err.status) {
      return error(res, err.message, err.status);
    }
    throw err;
  }

  // ... existing success response ...
}
```

**Design choices:**
- Fast-path outer check retained — no perf regression when team is not near capacity.
- Row-lock scope: only the target `Team` row. Other teams' joins unaffected.
- Count read is a subquery inside the locking `SELECT` — one round-trip.
- `::int` cast on the COUNT — Postgres `COUNT(*)` returns `bigint`, JS `Number()` comparison against `maxMembers` (an Int32) would be fine but the cast is cleaner and matches Prisma's raw-SQL idiom.
- No new dependencies, no new files.
- Observability log matches the `[resetPassword:race]` convention from Sprint 3.2 M22.
- Structured error re-throw pattern: throw an `Error` with `.status` inside the tx, catch outside and map to `error()`. Avoids adding a new `AppError` class.

---

## Test archetypes + full patterns

### Harness change

Extend the existing prisma mock in `auth.teamContext.integration.test.js` (currently lacks `$queryRaw`):

```js
// Add to state:
queryRawCalls: [],
queryRawReturns: [],
queryRawCallNumber: 0,

// Inside vi.mock:
const queryRawFn = vi.fn(async (strings, ...values) => {
  state.queryRawCallNumber++;
  // Reconstruct the full SQL string for pattern assertions.
  const sqlString = Array.isArray(strings)
    ? strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "")
    : String(strings);
  state.queryRawCalls.push({ sqlString, values });
  const idx = state.queryRawCallNumber - 1;
  if (idx >= state.queryRawReturns.length) {
    throw new Error(
      `auth.teamContext.integration.test.js: $queryRaw call #${state.queryRawCallNumber} ` +
      `has no fixture. Add an entry to state.queryRawReturns. SQL: ${sqlString}`,
    );
  }
  return state.queryRawReturns[idx];
});

// Add to top-level default + inside tx namespace:
$queryRaw: queryRawFn,

// Add to beforeEach reset:
state.queryRawCalls.length = 0;
state.queryRawReturns = [];
state.queryRawCallNumber = 0;
```

The `Prisma.$queryRaw` tagged-template invocation passes `strings` as an array + a rest of interpolated `values`. The mock reconstructs a `$1`-marker SQL string for text assertions and preserves the raw `values` for identity checks (`values.some(v => v === "team_real_1")`).

### T243 — Under-lock re-check happens inside the transaction

```js
it("test 243: takes SELECT FOR UPDATE on the team inside the transaction (race guard)", async () => {
  state.userFindUniqueReturns = [
    { id: "user_authed_1", name: "Bob", onboardingComplete: false },
  ];
  state.teamFindUniqueReturns = [
    {
      id: "team_real_1",
      name: "Acme",
      status: "ACTIVE",
      maxMembers: 50,
      createdById: "user_other",
      _count: { currentMembers: 5 },
    },
  ];
  state.queryRawReturns = [
    [{ id: "team_real_1", maxMembers: 50, current_count: 5 }],
  ];
  state.buildUserResponseResult = makeFullUser({ id: "user_authed_1" });

  const { status } = await post(
    "/api/auth/onboarding",
    { mode: "team", joinCode: "ABCDEF" },
    authedHeaders,
  );

  expect(status).toBe(200);
  expect(state.queryRawCalls).toHaveLength(1);
  expect(state.queryRawCalls[0].sqlString).toMatch(/FOR UPDATE/i);
  expect(state.queryRawCalls[0].sqlString).toMatch(/"Team"/);
  expect(state.queryRawCalls[0].values).toContain("team_real_1");
});
```

**What this locks in:** the fix must issue a raw SQL query containing `FOR UPDATE` against the `Team` table, interpolating the target team id. If a future refactor drops the lock or removes the team-id filter, this fails.

### T244 — Overflow rejection inside the tx (locked count == maxMembers)

```js
it("test 244: rejects with 400 when locked count equals maxMembers (race outcome)", async () => {
  state.userFindUniqueReturns = [
    { id: "user_authed_1", name: "Bob", onboardingComplete: false },
  ];
  // Outer fast-path check passes (49 < 50)…
  state.teamFindUniqueReturns = [
    {
      id: "team_real_1",
      name: "Acme",
      status: "ACTIVE",
      maxMembers: 50,
      createdById: "user_other",
      _count: { currentMembers: 49 },
    },
  ];
  // …but under lock the count is now 50 (another request slipped in).
  state.queryRawReturns = [
    [{ id: "team_real_1", maxMembers: 50, current_count: 50 }],
  ];

  const { status, body } = await post(
    "/api/auth/onboarding",
    { mode: "team", joinCode: "ABCDEF" },
    authedHeaders,
  );

  expect(status).toBe(400);
  expect(body?.error?.message).toMatch(/team is full/i);
  // No memberships created — tx rolled back.
  expect(state.teamMembershipCreateManyCalls).toHaveLength(0);
  // Personal team creation was inside the tx and rolled back — no create call recorded either.
  // (Note: our mock records the call attempt but the "commit" is conceptual.
  // The important assertion is on membership.createMany which is downstream of the throw.)
});
```

### T245 — Happy path (locked count < maxMembers)

Absorb into the existing "joins an existing team, creates personalTeam and TWO memberships" test at line 365 rather than duplicating — extend it with the `state.queryRawReturns` fixture and one new assertion:

```js
// Extend existing happy-path test:
state.queryRawReturns = [
  [{ id: "team_real_1", maxMembers: 50, current_count: 5 }],
];
// New assertion at the end:
expect(state.queryRawCalls).toHaveLength(1); // lock was taken
```

Rationale: T245 as a fresh test would duplicate ~30 lines of the existing happy-path. Extending the existing test avoids duplication while still gating "happy path works after the fix."

### T246 — Observability log on overflow rejection

```js
it("test 246: emits [completeOnboarding:overflow] warning on race-outcome rejection", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    state.userFindUniqueReturns = [
      { id: "user_authed_1", name: "Bob", onboardingComplete: false },
    ];
    state.teamFindUniqueReturns = [
      {
        id: "team_real_1",
        name: "Acme",
        status: "ACTIVE",
        maxMembers: 50,
        createdById: "user_other",
        _count: { currentMembers: 49 },
      },
    ];
    state.queryRawReturns = [
      [{ id: "team_real_1", maxMembers: 50, current_count: 50 }],
    ];

    await post(
      "/api/auth/onboarding",
      { mode: "team", joinCode: "ABCDEF" },
      authedHeaders,
    );

    const overflowLog = warnSpy.mock.calls.find((c) =>
      String(c[0]).includes("[completeOnboarding:overflow]"),
    );
    expect(overflowLog).toBeDefined();
    expect(overflowLog[0]).toMatch(/teamId=team_real_1/);
    expect(overflowLog[0]).toMatch(/attemptedCount=51/);
    expect(overflowLog[0]).toMatch(/maxMembers=50/);
  } finally {
    warnSpy.mockRestore();
  }
});
```

### Test discipline

- **No real DB** — pure mock-based test in the existing integration harness.
- **`vi.spyOn` for console.warn** — restored in `finally` to avoid polluting other tests.
- **`state.queryRawReturns` is a queue** — call-ordered, matches the existing `teamFindUniqueReturns` convention.
- **No new file** — extends `auth.teamContext.integration.test.js` (currently 720 lines). No overflow risk; adds ~120 lines.

### Divergence discipline

- **If the implementer uses a different SQL shape** (e.g., two queries — separate FOR UPDATE + COUNT) — adapt the assertion patterns in T243 to match the emitted SQL. What locks in is: (a) `FOR UPDATE` appears somewhere in a $queryRaw call, (b) the team id is in the values, (c) `teamMembership.createMany` is not called when the invariant fails.
- **If the implementer chooses a different error message** — adapt the T244/T246 message regex, but keep the `/team is full/i` intent.
- **If the observability log key changes** — adapt T246 spy assertions.
- **Non-adaptable class**: the FOR UPDATE lock itself, and no-membership-created on overflow. These are the load-bearing security/correctness assertions.

---

## Test count target

- Baseline (post Sprint 8b): **1470**
- New in Sprint 8c: **+4** (T243, T244, T246; T245 extends existing test)
- Target: **1474**

Note: 3 new `it()` blocks + 1 test extension. Vitest reports each `it` as a test, so the count matches the +4 target only if T245 is a genuine new `it` block. **If T245 is folded into the existing test as an assertion extension, target is +3 → 1473**. The plan Task 1 will settle this — recommendation is +3 (fold T245 to avoid duplication).

**Final target: 1473** (1470 + 3 new `it` blocks).

---

## Done criteria

- Production fix applied to `auth.controller.js` join-team transaction
- 3 new `it` blocks (T243, T244, T246) + 1 assertion extension (T245) — full suite at **1473**
- `npm run lint` (server + client) + audits exit 0
- `prisma migrate status` up to date (no schema change)
- Client `npm run build` clean
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 8 row → 8c marked ✅ shipped 2026-07-03; document 2/3 M35 candidates obsolete + 3rd hardened; M35 closed overall
- 4-role panel review completed pre-implementation; CHANGES_REQUESTED fold-ins applied

---

## Production risk inventory

| Dimension | Status |
|---|---|
| Schema migration | None |
| Behavior change | Adds a $queryRaw SELECT FOR UPDATE inside the join-team transaction. Serializes concurrent joins to the SAME team; other teams unaffected. Under typical usage (team growth is human-paced) the lock is uncontended. |
| Client impact | None — API surface unchanged. Error message on overflow (`"team is full"`) unchanged from current outer fast-path check. |
| Test runtime | +3 sync integration tests, ~30ms |
| Backward compatibility | Full |
| Rollback | Revert the auth.controller.js hunk (single function scope) + revert the 3 tests. No migration to reverse. |
| Risk floor | Low — matches Sprint 3.2 M22 profile |

---

## Backward compatibility

Zero API-shape impact. The endpoint response is unchanged for the common case. The only observable difference: under a race that previously produced silent overflow, one of the two concurrent callers now sees a `400 "This team is full"` response — the correct outcome. Existing integration tests continue to pass (the happy-path extension only adds an assertion, doesn't change semantics).

---

## Self-review

| Check | Status |
|---|---|
| Placeholders | None — 3 tests + 1 extension specified with concrete assertion targets |
| Internal consistency | Test IDs T243-T246 contiguous with prior T1-T242. T245 marked as extension (not a new `it`) so the +3 count is consistent |
| Scope | Tight: one function, one race, three new tests + one extension. M35 the last remaining Sprint 8-cluster audit item |
| Ambiguity | Two explicit calls: (a) SQL shape may vary — T243 asserts the contract (FOR UPDATE + team id filter), not the exact wire format; (b) T245 explicitly marked as an extension of the existing happy-path test |
| Adversarial review | Highest-risk assertion is T243 (FOR UPDATE present + team id interpolated). If the fix drifts to a plain findUnique-then-check pattern, T243 fails, preventing silent regression |
| Risk floor | Low — matches Sprint 3.2 M22 precedent; ~20 lines production change |

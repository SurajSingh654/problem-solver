# Sprint 8c — M35 Onboarding Race Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix TOCTOU race in `auth.controller.js:completeOnboarding` join-team branch (M35 audit). Two concurrent joins to the same team can currently both pass a pre-tx `_count.currentMembers >= maxMembers` check and both commit, overflowing the team. Fix: add SELECT FOR UPDATE inside the transaction + status re-check + observability. Adds 4 new `it` blocks (T243, T244 with 2 `.each` rows, T246, T247) + extends 1 existing happy-path test (T245).

**Architecture:** One production file modified (`auth.controller.js:337-491`, join-team branch only). One test file extended (`auth.teamContext.integration.test.js`) — new `$queryRaw` mock in the shared prisma mock, plus 4 new tests. No schema change, no migration.

**Tech Stack:** Vitest 4.1.6, Node 20 ESM, Prisma 5.x, Postgres 15 + pgvector.

**Spec:** [`docs/superpowers/specs/2026-07-03-sprint-8c-m35-onboarding-race-design.md`](../specs/2026-07-03-sprint-8c-m35-onboarding-race-design.md)

**Branch:** `feat/onboarding-race-fix` (already created; spec v2 committed at `ab8e1d1`)

**Baseline test count:** 1470 (post Sprint 8b, main commit `ed649e0`). Target after sprint: **1475** (+5).

**Review history:** Full 4-role panel completed pre-implementation. Fold-ins applied in spec v2:
- BA F1 (BLOCKER) — `FROM "Team"` → `FROM "teams"` (Prisma maps `Team` model to `@@map("teams")`; verbatim v1 would runtime-error `relation "Team" does not exist`)
- PO F3 (real gap) — status-flip race added; SELECT FOR UPDATE now reads `status` and re-checks under lock; new test T247
- PO F2 (real gap) — T244 widened to `it.each` covering both `==` boundary and `>` overflow
- PO F1 (nit) — `TEAM_FULL_MESSAGE` const extracted to prevent fast-path vs lock-path message drift
- BA F2 (nit) — test-count target unified to 1475
- BA F3 (nit) — divergence policy: advisory-lock refactor requires spec amendment

---

## File map

**Modify:**
- `server/src/controllers/auth.controller.js` — extend the `mode: "team" && joinCode` transaction with a `tx.$queryRaw` SELECT FOR UPDATE lock on `"teams"` + status re-check + count re-check + observability logs. Extract `TEAM_FULL_MESSAGE` const near top of file. Wrap the tx in a `try/catch` that maps `err.status` to `error(res, ...)`.
- `server/test/integration/auth.teamContext.integration.test.js` — extend the shared prisma mock with a `$queryRaw` recorder + call-ordered returns queue. Add T243, T244 (`describe` + `it.each`), T246, T247. Extend the existing happy-path test at L365 with `state.queryRawReturns` + one new assertion (T245).

**Modify (Task 2 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md` — mark Sprint 8c shipped 2026-07-03; document 2/3 M35 candidates obsolete + 3rd hardened; close M35 overall.

**Unchanged (explicit):**
- `server/prisma/schema.prisma` (read-only for `@@map` verification)
- All other production code
- All other tests
- Zod schemas
- Migrations (none)
- Client code

---

## Task 0: Pre-flight

- [ ] **Step 1: Confirm branch + clean state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -2
```

Expected: branch `feat/onboarding-race-fix`, latest commit `ab8e1d1` (spec v2), clean tree.

- [ ] **Step 2: Baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1470 passed`.

- [ ] **Step 3: Pre-push gate sanity** (each exit 0)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
```

NO commits.

---

## Task 1: RED tests + GREEN fix + observability

**Files:**
- Modify: `server/test/integration/auth.teamContext.integration.test.js`
- Modify: `server/src/controllers/auth.controller.js`

### Sub-task 1A — Extend test-harness prisma mock with $queryRaw

- [ ] **Step 1: Read current mock shape**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "state.teamFindUniqueReturns\|state.userFindUniqueReturns\|\\\$transaction" server/test/integration/auth.teamContext.integration.test.js | head -20
```

Locate:
- The `state` hoisted-vi object (around L37)
- The `vi.mock("../../src/lib/prisma.js", ...)` block (around L109)
- The `beforeEach` reset block (around L237)

- [ ] **Step 2: Extend `state` with `$queryRaw` recorder + returns queue**

Add to `state = vi.hoisted(() => ({ ... }))`:

```js
queryRawCalls: [],
queryRawReturns: [],
queryRawCallNumber: 0,
```

- [ ] **Step 3: Add `queryRawFn` inside the mock factory**

Add a `queryRawFn` alongside the other `vi.fn` instances in `vi.mock("../../src/lib/prisma.js", ...)`. Prisma's `$queryRaw` tagged-template signature is `(strings: TemplateStringsArray, ...values: any[])` — the mock defensively handles both this and a plain-string call shape:

```js
const queryRawFn = vi.fn(async (strings, ...values) => {
  state.queryRawCallNumber++;
  // Defensive: Prisma's tagged-template call passes a TemplateStringsArray + rest values.
  // If a caller passes a plain string (Prisma also supports $queryRawUnsafe), fall back to that.
  let sqlString;
  if (Array.isArray(strings) || (strings && typeof strings === "object" && "length" in strings)) {
    sqlString = Array.from(strings).reduce(
      (acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""),
      "",
    );
  } else {
    sqlString = String(strings);
  }
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
```

Then in both the top-level `default` object AND the `tx` namespace inside `$transaction`, expose:

```js
$queryRaw: queryRawFn,
```

- [ ] **Step 4: Add reset in `beforeEach`**

```js
state.queryRawCalls.length = 0;
state.queryRawReturns = [];
state.queryRawCallNumber = 0;
```

- [ ] **Step 5: Run existing tests — should still all pass (mock extension is backward-compatible)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.teamContext.integration.test.js 2>&1 | tail -20
```

Expected: existing tests still pass. The `$queryRaw` mock is not yet called (production code hasn't changed).

### Sub-task 1B — Write RED tests for the fix (before production change)

- [ ] **Step 6: Add T243 inside `describe("mode: team — join existing team")`**

Insert after the existing "returns 400 when the joined team is not ACTIVE" test:

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
    [{ id: "team_real_1", status: "ACTIVE", maxMembers: 50, current_count: 5 }],
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
  expect(state.queryRawCalls[0].sqlString).toMatch(/"teams"/);
  expect(state.queryRawCalls[0].values).toContain("team_real_1");
});
```

- [ ] **Step 7: Add T244 (describe + it.each) after T243**

```js
describe("test 244: rejects with 400 when locked count >= maxMembers (race outcome)", () => {
  it.each([
    { name: "at boundary (50==50)", currentCount: 50 },
    { name: "over cap (51>50) — admin-adjusted overflow", currentCount: 51 },
  ])("$name", async ({ currentCount }) => {
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
      [{ id: "team_real_1", status: "ACTIVE", maxMembers: 50, current_count: currentCount }],
    ];

    const { status, body } = await post(
      "/api/auth/onboarding",
      { mode: "team", joinCode: "ABCDEF" },
      authedHeaders,
    );

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/team is full/i);
    expect(state.teamMembershipCreateManyCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 8: Add T246 (observability log on overflow) after T244**

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
      [{ id: "team_real_1", status: "ACTIVE", maxMembers: 50, current_count: 50 }],
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

- [ ] **Step 9: Add T247 (status-flip race) after T246**

```js
it("test 247: rejects with 400 when team status flips to PENDING under lock (status-flip race)", async () => {
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
        _count: { currentMembers: 5 },
      },
    ];
    state.queryRawReturns = [
      [{ id: "team_real_1", status: "PENDING", maxMembers: 50, current_count: 5 }],
    ];

    const { status, body } = await post(
      "/api/auth/onboarding",
      { mode: "team", joinCode: "ABCDEF" },
      authedHeaders,
    );

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/not currently accepting members/i);
    expect(state.teamMembershipCreateManyCalls).toHaveLength(0);

    const flipLog = warnSpy.mock.calls.find((c) =>
      String(c[0]).includes("[completeOnboarding:status_flip]"),
    );
    expect(flipLog).toBeDefined();
    expect(flipLog[0]).toMatch(/teamId=team_real_1/);
    expect(flipLog[0]).toMatch(/status=PENDING/);
  } finally {
    warnSpy.mockRestore();
  }
});
```

- [ ] **Step 10: Extend existing happy-path test at L365 with T245 assertion**

Find the test `it("joins an existing team, creates personalTeam and TWO memberships", ...)` at line 365 of the existing file. Add `state.queryRawReturns` fixture near the top of the test body, and add `expect(state.queryRawCalls).toHaveLength(1);` at the end:

```js
// After state.teamFindUniqueReturns is set:
state.queryRawReturns = [
  [{ id: "team_real_1", status: "ACTIVE", maxMembers: 50, current_count: 5 }],
];

// … existing assertions …

// New at end (T245 fold-in):
expect(state.queryRawCalls).toHaveLength(1);
```

- [ ] **Step 11: Verify RED — run just the target test file**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.teamContext.integration.test.js 2>&1 | tail -40
```

Expected: T243, T244 (×2), T246, T247 FAIL (production code doesn't emit `$queryRaw` yet, so the mock's "no fixture" sentinel fires OR the tests assert against absent lock calls). The existing happy-path test extended with T245 will also fail at the new `expect(state.queryRawCalls).toHaveLength(1)` assertion (still zero because prod code unchanged).

If instead the tests are PASSING, that indicates the production code somehow already invokes `$queryRaw` — inconsistent with source at auth.controller.js:437-480. Investigate before proceeding.

### Sub-task 1C — Apply GREEN production fix

- [ ] **Step 12: Read the existing controller function**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "TEAM_MAX_MEMBERS_DEFAULT\|^const\|^import\|export async function completeOnboarding" server/src/controllers/auth.controller.js | head -15
```

Locate:
- Top-of-file imports/consts (for `TEAM_FULL_MESSAGE` insertion)
- `completeOnboarding` function start (L337)
- The `mode: "team" && joinCode` branch (L403-L491)

- [ ] **Step 13: Add `TEAM_FULL_MESSAGE` constant**

Place near existing top-of-file constants (search for `TEAM_MAX_MEMBERS_DEFAULT` — put `TEAM_FULL_MESSAGE` next to it, or at least in the same "top-of-file constants" area):

```js
const TEAM_FULL_MESSAGE = "This team is full. Please contact the team admin.";
```

- [ ] **Step 14: Update the outer L426 fast-path error to use the const**

Change:

```js
if (team._count.currentMembers >= team.maxMembers) {
  return error(
    res,
    "This team is full. Please contact the team admin.",
    400,
  );
}
```

To:

```js
if (team._count.currentMembers >= team.maxMembers) {
  return error(res, TEAM_FULL_MESSAGE, 400);
}
```

- [ ] **Step 15: Wrap the join-team transaction with the FOR UPDATE lock + status/count re-check + try/catch**

The current L437-L480 is:

```js
await prisma.$transaction(async (tx) => {
  const personalTeam = await tx.team.create({ ... });
  await tx.user.update({ ... });
  await tx.teamMembership.createMany({ ... });
});
```

Replace with:

```js
try {
  await prisma.$transaction(async (tx) => {
    // Atomically lock the team row + re-check invariants (status AND
    // maxMembers) under lock. Without this lock two concurrent onboarding
    // requests with the same joinCode can both pass the fast-path check
    // above and both commit, overflowing the team. Additionally, a team
    // admin flipping status to PENDING between the outer read and the
    // tx commit could let a new member slip into a paused team. Row-
    // locking the Team serializes concurrent joins + status flips on
    // this team without impacting other teams.
    const lockedRows = await tx.$queryRaw`
      SELECT
        id,
        status,
        "maxMembers",
        (SELECT COUNT(*)::int
           FROM "users"
           WHERE "currentTeamId" = ${team.id}
             AND "deletedAt" IS NULL) AS current_count
      FROM "teams"
      WHERE id = ${team.id}
      FOR UPDATE
    `;

    const locked = lockedRows?.[0];
    if (!locked) {
      const err = new Error("Team no longer exists.");
      err.status = 404;
      throw err;
    }
    if (locked.status !== "ACTIVE") {
      console.warn(
        `[completeOnboarding:status_flip] userId=${userId} ` +
          `teamId=${team.id} status=${locked.status}`,
      );
      const err = new Error("This team is not currently accepting members.");
      err.status = 400;
      throw err;
    }
    if (locked.current_count >= locked.maxMembers) {
      console.warn(
        `[completeOnboarding:overflow] userId=${userId} ` +
          `teamId=${team.id} attemptedCount=${locked.current_count + 1} ` +
          `maxMembers=${locked.maxMembers}`,
      );
      const err = new Error(TEAM_FULL_MESSAGE);
      err.status = 400;
      throw err;
    }

    // Existing tx body — unchanged.
    const personalTeam = await tx.team.create({ ... });   // keep existing args
    await tx.user.update({ ... });                        // keep existing args
    await tx.teamMembership.createMany({ ... });          // keep existing args
  });
} catch (err) {
  if (err && err.status) {
    return error(res, err.message, err.status);
  }
  throw err;
}
```

**IMPORTANT:** Keep the existing tx body verbatim (the `tx.team.create`, `tx.user.update`, `tx.teamMembership.createMany` calls with their exact args). Only add the new lock-and-check code at the top of the tx and the surrounding try/catch.

- [ ] **Step 16: Verify GREEN — run just the target test file**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.teamContext.integration.test.js 2>&1 | tail -40
```

Expected: all tests pass, including the 4 new ones (5 vitest entries counting T244's 2 `.each` rows) and the extended happy-path.

**If tests fail:**

- **T243 fails on `/FOR UPDATE/i`** — check the SQL string actually contains those tokens; verify the tagged-template literal wasn't accidentally converted to a string concat.
- **T243 fails on `/"teams"/`** — check `FROM "teams"` is present and quoted correctly.
- **T244 fails** — check the count comparison is `>=` (not `>`) inside the tx.
- **T246 fails on log format** — check the `console.warn` message includes `teamId=`, `attemptedCount=`, `maxMembers=` in the format specified.
- **T247 fails** — check the `status !== "ACTIVE"` guard is present BEFORE the count guard.
- **Happy path fails** — check the `state.queryRawReturns` fixture was added; the mock's sentinel-throw indicates a missing fixture.
- **Prisma version incompatibility on `tx.$queryRaw`** — if `tx.$queryRaw is not a function` errors out, verify Prisma 5.x exposes `$queryRaw` on the interactive-transaction client (documented API — should work). Otherwise fall back to `prisma.$queryRaw` outside the tx callback? NO — that would defeat the lock. Escalate to user before making that change.

- [ ] **Step 17: Full-suite regression check**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Tests +[0-9]+" | tail -3
```

Expected: `Tests 1475 passed` (1470 + 5).

- [ ] **Step 18: Lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
```

Expected: exit 0. If lint complains about `_locked` being unused or an unused variable in the error re-throw path — fix inline; do not silence with a comment.

- [ ] **Step 19: Commit**

Standing rules: NO Co-Authored-By, single-line subject.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/controllers/auth.controller.js server/test/integration/auth.teamContext.integration.test.js && git commit -m "Fix completeOnboarding team-overflow race with SELECT FOR UPDATE (M35)"
```

---

## Task 2: Final gates + push + FF-merge + roadmap

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

Expected: 1475 passing, 0 vulns, schema up to date, client build clean.

- [ ] **Step 2: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/onboarding-race-fix
```

DO NOT use `--no-verify`.

- [ ] **Step 3: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/onboarding-race-fix && git push origin main
```

- [ ] **Step 4: Update roadmap**

Find the existing Sprint 8c row:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "^| 8c " docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md
```

Replace with (match file's actual column format):

```markdown
| 8c | M35 concurrency race guards (completeOnboarding team-overflow race hardened with SELECT FOR UPDATE + status re-check inside the transaction; TEAM_FULL_MESSAGE const extracted; 4 new tests T243-T247 in auth.teamContext.integration.test.js + happy-path extended; other 2 M35 candidates verified obsolete — ai.controller.js:369-387 deleted in Sprint 2, solutions.controller.js archive/restore endpoints never existed; M35 closed) | ✅ shipped | [`2026-07-03-sprint-8c-m35-onboarding-race-design.md`](../specs/2026-07-03-sprint-8c-m35-onboarding-race-design.md) | 2026-07-03 |
```

- [ ] **Step 5: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 8c (onboarding race fix) shipped and close M35"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main
```

- [ ] **Step 6: Verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -10
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```

Verify local HEAD == origin/main.

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ SELECT FOR UPDATE inside the tx → Task 1 Step 15
- ✅ Status re-check under lock (PO F3) → Task 1 Step 15 + T247 (Task 1 Step 9)
- ✅ TEAM_FULL_MESSAGE const extraction (PO F1) → Task 1 Steps 13-14
- ✅ T244 `.each` widening (PO F2) → Task 1 Step 7
- ✅ `FROM "teams"` correction (BA F1 blocker) → Task 1 Step 15 SQL + T243 assertion (Task 1 Step 6)
- ✅ Test-count 1475 target (BA F2) → Task 1 Step 17
- ✅ $queryRaw mock extension → Task 1 Steps 1-5
- ✅ Roadmap M35 closure → Task 2 Step 4

### Placeholder scan

No "TBD" / "implement later". Every code block includes complete text or explicit `keep existing args` markers pointing back to the current source.

### Type consistency

- Test IDs T243-T247 contiguous with prior T1-T242 (Sprint 8b shipped through T242).
- Test count: 3 new `it` blocks + 1 `it.each` with 2 rows = 5 vitest entries. 1470 + 5 = 1475. ✓
- SQL column names match schema: `"users"."currentTeamId"`, `"users"."deletedAt"`, `"teams"."status"`, `"teams"."maxMembers"`.

### Adversarial check

- **Prisma unmarshalling of `COUNT(*)::int`** — Postgres `bigint` would deserialize to a JS `BigInt`, which fails `>=` comparison to a regular `number`. The `::int` cast returns `int4`, which unmarshals to JS `number`. Verified against Prisma raw-SQL conventions. Should the implementer see a `BigInt` at runtime (unexpected), they must NOT paper over with `Number(...)` — that hides a schema type mismatch. Escalate.
- **`tx.$queryRaw` availability** — Prisma 5.x's interactive-transaction client exposes `$queryRaw` on the `tx` handle. If it doesn't, Step 16's error message explicitly instructs escalation rather than fall-back.
- **Test file line-count** — 720 → ~850 lines. Well below any file-size ceiling.

---

## Done criteria

- 4 new `it` blocks (T243, T244 with 2 `.each` rows, T246, T247) + 1 assertion extension (T245) — full suite at **1475**
- Production fix at `auth.controller.js:337-491` join-team branch (SELECT FOR UPDATE + status + count re-checks + TEAM_FULL_MESSAGE const + try/catch)
- `npm run lint` (server + client) + audits exit 0
- `prisma migrate status` up to date (no schema change)
- Client `npm run build` clean
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 8c → ✅ shipped 2026-07-03; M35 closed
- 4-role panel review completed pre-implementation; fold-ins applied (BA F1 blocker, PO F3 status-flip, PO F2 `.each`, PO F1 const, BA F2 count, BA F3 divergence policy)

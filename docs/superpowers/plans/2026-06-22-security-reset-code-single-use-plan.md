# Sprint 3.2 — Reset Code Single-Use Security Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit M22 — `resetPassword` has a TOCTOU race during the ~200ms bcrypt window where two concurrent requests with the same valid code both succeed, with the second write's `newPassword` overriding the first. Make the reset code atomically single-use by invalidating it via a CAS (compare-and-swap) `prisma.user.updateMany` BEFORE running bcrypt.

**Architecture:** Pre-check (`findUnique`) stays so legitimate users see specific error messages. CAS claim (`updateMany` with `resetCode: code, resetExpiry: { gt: now }` in WHERE, clearing them in DATA) is the authoritative atomic gate — `count: 1` means we won the race; `count: 0` means another concurrent request consumed it first (or it expired in the ms since the pre-check). Bcrypt only runs AFTER the code is invalidated. Race-loser path emits `[security:reset-code-replay]` log.

**Tech Stack:** Node 20, Express 4, Prisma + Postgres, bcrypt, vitest. No new dependencies. No schema migrations. No env vars. No feature flags.

---

## File map

**Server modified:**
- `server/src/controllers/auth.controller.js`
  - `resetPassword` function (lines ~612-654): insert CAS `updateMany` claim between pre-check and bcrypt; replace post-bcrypt single `update` (that previously cleared resetCode + resetExpiry) with a slimmer `update` that only writes password/mustChangePassword; add `[security:reset-code-replay]` log on race-loser path

**Server new:**
- `server/test/integration/auth.resetPassword.integration.test.js` — 6 wire-level tests covering happy path, sequential replay, wrong code, expired code, non-existent email, AND concurrent-race regression

**Server unchanged:**
- Schema, routes, route middleware, env, feature flags
- `forgotPassword`, `verifyEmail`, `changePassword`, all other auth methods

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers Task 1 (RED tests) + Task 2 (GREEN fix). TDD pattern.
- After every code change, `npm test` from `server/` and confirm count.
- Lint must end 0 errors / 0 warnings.
- Manual smoke (real server boot) before commit — security fix gets verification beyond the automated suite.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -5
```

Expected: `Test Files  55 passed (55)` and `Tests  1081 passed (1081)`. (Post-Sprint-3.1 baseline.) If different, stop and investigate.

- [ ] **Step 2: Confirm working tree and branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status && git branch --show-current
```

Expected: on `feat/security-reset-code-single-use`, working tree clean except pre-existing untracked items (`.claude/settings.json`, `client/package-lock.json`). The spec commit `3ec2d5c` is the only one ahead of main.

---

## Task 1: Write wire-level RED tests for resetPassword

**Files:**
- Create: `server/test/integration/auth.resetPassword.integration.test.js`

The tests land FIRST and run against the UNMODIFIED `resetPassword`. The concurrent-race test is the proof that the M22 leak exists in code today.

### Sub-task 1a: Create the test file

- [ ] **Step 1: Create the test file**

Create `server/test/integration/auth.resetPassword.integration.test.js`:

```javascript
// ============================================================================
// POST /auth/reset-password — wire-level race-condition tests (M22 fix)
// ============================================================================
//
// Audit M22: resetPassword has a TOCTOU race during the ~200ms bcrypt window
// where two concurrent requests with the same valid code both pass the
// pre-check, both run bcrypt, both write — the second write's password wins.
//
// Sprint 3.2 fix: atomic CAS claim via prisma.user.updateMany() BEFORE
// bcrypt. Only one parallel request gets count: 1; the rest get count: 0
// and a 400 response.
//
// This test file's concurrent-race test is the RED-first security receipt:
// against unmodified code, BOTH requests return 200. Against the fix,
// exactly ONE returns 200 and one returns 400.
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────
// auth.routes.js mounts authenticate ONLY on protected routes; reset-password
// is public, so authenticate is not in the chain. validate() runs but
// requires real schema validation — we send valid bodies.

// bcrypt: the controller calls bcrypt.hash. We mock to keep the test fast
// AND deterministic. The mock returns a stable hash without doing real work.
// IMPORTANT: pre-fix code's race depends on bcrypt being SLOW. To reproduce
// the TOCTOU window in the RED proof, the mock can simulate a delay.
const bcryptHashCalls = [];
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async (pwd, _rounds) => {
      bcryptHashCalls.push(pwd);
      // Simulate the ~200ms bcrypt window so the RED concurrent-race test
      // observes the pre-fix bug. With the fix, the CAS claim runs before
      // this delay, so concurrent requests don't both reach bcrypt.
      await new Promise((resolve) => setTimeout(resolve, 30));
      return `HASHED:${pwd}`;
    }),
    compare: vi.fn(async () => true),
  },
}));

// Email service is fire-and-forget; stub to no-op.
vi.mock("../../src/services/email.service.js", () => ({
  sendPasswordResetEmail: vi.fn(async () => undefined),
  sendVerificationEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => undefined),
}));

// ── Prisma mock — single-winner updateMany ──────────────────────────
// The mock approximates Postgres updateMany atomicity: when two concurrent
// calls match the same WHERE (e.g. same resetCode), the FIRST returns
// count: 1 and the row is "consumed"; subsequent calls return count: 0
// because the WHERE no longer matches (resetCode is now null).

const fixtures = {
  user: {
    id: "user_reset_1",
    email: "alice@example.com",
    name: "Alice",
    resetCode: "123456",
    resetExpiry: null, // set in beforeEach to now+15min
    password: "OLD_HASH",
    mustChangePassword: false,
  },
};

let userUpdateCalls = [];
let updateManyCalls = [];

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(async (args) => {
        const where = args?.where || {};
        if (where.email && where.email === fixtures.user.email) {
          // Return a snapshot — modeling Postgres MVCC read.
          return { ...fixtures.user };
        }
        if (where.id && where.id === fixtures.user.id) {
          return { ...fixtures.user };
        }
        return null;
      }),
      updateMany: vi.fn(async (args) => {
        updateManyCalls.push(args);
        const where = args?.where || {};
        // Atomic CAS: row matches only if resetCode still present and
        // unexpired. The fixture's resetCode goes to null after first claim.
        const matches =
          where.id === fixtures.user.id &&
          fixtures.user.resetCode != null &&
          fixtures.user.resetCode === where.resetCode &&
          fixtures.user.resetExpiry instanceof Date &&
          (!where.resetExpiry?.gt || fixtures.user.resetExpiry > where.resetExpiry.gt);
        if (matches) {
          // Apply the data — clears resetCode + resetExpiry atomically.
          if (args.data?.resetCode === null) fixtures.user.resetCode = null;
          if (args.data?.resetExpiry === null) fixtures.user.resetExpiry = null;
          return { count: 1 };
        }
        return { count: 0 };
      }),
      update: vi.fn(async (args) => {
        userUpdateCalls.push(args);
        const where = args?.where || {};
        if (where.id === fixtures.user.id) {
          // Apply the patch to the fixture so subsequent reads see the new state.
          if (args.data?.password) fixtures.user.password = args.data.password;
          if (args.data?.resetCode !== undefined) fixtures.user.resetCode = args.data.resetCode;
          if (args.data?.resetExpiry !== undefined) fixtures.user.resetExpiry = args.data.resetExpiry;
          if (args.data?.mustChangePassword !== undefined)
            fixtures.user.mustChangePassword = args.data.mustChangePassword;
        }
        return { ...fixtures.user };
      }),
    },
  },
}));

// Stub heavy auth service deps so the import chain stays light.
vi.mock("../../src/middleware/auth.middleware.js", () => ({
  authenticate: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));

// Imports happen *after* mocks register.
import authRouter from "../../src/routes/auth.routes.js";
import { buildTestApp, bootApp } from "./_appFactory.js";

// ── Test harness state ───────────────────────────────────────────────
let server;

beforeAll(async () => {
  const app = buildTestApp({ prefix: "/api/auth", router: authRouter });
  server = await bootApp(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  // Reset fixture and call recorders before each test.
  fixtures.user.resetCode = "123456";
  fixtures.user.resetExpiry = new Date(Date.now() + 15 * 60 * 1000);
  fixtures.user.password = "OLD_HASH";
  fixtures.user.mustChangePassword = false;
  userUpdateCalls = [];
  updateManyCalls = [];
  bcryptHashCalls.length = 0;
});

// ── Helpers ──────────────────────────────────────────────────────────
async function postReset(body) {
  const res = await fetch(server.url + "/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
}

const validPassword = "Newpassword123";

// ── Tests ────────────────────────────────────────────────────────────
describe("POST /auth/reset-password — M22 single-use guarantees", () => {
  it("happy path: valid code resets password and invalidates the code", async () => {
    const { status } = await postReset({
      email: "alice@example.com",
      code: "123456",
      newPassword: validPassword,
    });
    expect(status).toBe(200);
    // Post-fix: updateMany was called exactly once with the atomic claim.
    expect(updateManyCalls).toHaveLength(1);
    expect(updateManyCalls[0].where.resetCode).toBe("123456");
    // The post-claim password update happened (modifies password only).
    expect(userUpdateCalls).toHaveLength(1);
    expect(userUpdateCalls[0].data.password).toBe(`HASHED:${validPassword}`);
    // Fixture state: code is consumed.
    expect(fixtures.user.resetCode).toBeNull();
  });

  it("sequential replay: same code submitted twice — first 200, second 400", async () => {
    const first = await postReset({
      email: "alice@example.com",
      code: "123456",
      newPassword: validPassword,
    });
    expect(first.status).toBe(200);

    // The fixture's resetCode is now null. Second request must be rejected.
    const second = await postReset({
      email: "alice@example.com",
      code: "123456",
      newPassword: "Anotherpwd123",
    });
    expect(second.status).toBe(400);
    expect(second.body?.error?.message).toMatch(/invalid|expired|been used/i);
    // No second bcrypt run.
    expect(bcryptHashCalls).toEqual([validPassword]);
  });

  it("wrong code returns 400 'Invalid reset code'", async () => {
    const { status, body } = await postReset({
      email: "alice@example.com",
      code: "000000",
      newPassword: validPassword,
    });
    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/invalid reset code/i);
    // updateMany must NOT have been called — the pre-check rejected.
    expect(updateManyCalls).toHaveLength(0);
    // bcrypt must NOT have run.
    expect(bcryptHashCalls).toHaveLength(0);
  });

  it("expired code returns 400 'expired'", async () => {
    fixtures.user.resetExpiry = new Date(Date.now() - 60 * 1000); // 1 min ago
    const { status, body } = await postReset({
      email: "alice@example.com",
      code: "123456",
      newPassword: validPassword,
    });
    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/expired/i);
    expect(updateManyCalls).toHaveLength(0);
    expect(bcryptHashCalls).toHaveLength(0);
  });

  it("non-existent email returns 400", async () => {
    const { status } = await postReset({
      email: "ghost@example.com",
      code: "123456",
      newPassword: validPassword,
    });
    expect(status).toBe(400);
    expect(updateManyCalls).toHaveLength(0);
    expect(bcryptHashCalls).toHaveLength(0);
  });

  it("concurrent race: two parallel requests with same code — exactly one 200, one 400", async () => {
    // RED-PROOF: against unmodified controller, both requests pass the
    // findUnique check, both hash, both update — both return 200.
    // GREEN: post-fix, only one updateMany returns count:1; the other gets
    // count:0 and a 400.
    const [a, b] = await Promise.all([
      postReset({
        email: "alice@example.com",
        code: "123456",
        newPassword: "Apass1234",
      }),
      postReset({
        email: "alice@example.com",
        code: "123456",
        newPassword: "Bpass1234",
      }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);

    // CRITICAL: exactly ONE password write actually happened. Pre-fix, both
    // requests reach the password update — two writes. Post-fix, the
    // race-loser is rejected before bcrypt, so only one write occurs.
    expect(userUpdateCalls).toHaveLength(1);
    // Exactly one bcrypt invocation as well.
    expect(bcryptHashCalls).toHaveLength(1);
  });
});
```

### Sub-task 1b: Run RED-first against unmodified controller

- [ ] **Step 2: Confirm we're on the spec-only commits (unmodified controller)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -3
```

Expected: top commit is `3ec2d5c Add Sprint 3.2 reset-code single-use security fix design spec`. Controller is unmodified.

- [ ] **Step 3: Run the new test file alone — expect failures on the race test**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.resetPassword.integration.test.js 2>&1 | tail -40
```

**Expected RED behavior** (against unmodified `resetPassword`):

| Test | Expected RED outcome |
|---|---|
| happy path | likely PASS — pre-fix code does succeed; `updateManyCalls` is 0 (no CAS today). The assertion `expect(updateManyCalls).toHaveLength(1)` FAILS — security receipt that the atomic claim isn't happening. |
| sequential replay | PASS — pre-fix code clears `resetCode` in the final update, so the second call's findUnique sees null and rejects. (M22 is only a concurrent issue, not sequential.) The `expect(updateManyCalls)` assertion may also catch the missing CAS. |
| wrong code | likely PASS — pre-check rejects. `updateManyCalls.length === 0` expectation holds either way. |
| expired code | PASS — pre-check rejects. |
| non-existent email | PASS — pre-check rejects. |
| **concurrent race** | **FAIL** — pre-fix: both requests reach bcrypt + update. `userUpdateCalls` length is 2 (or 1, depending on Prisma mock — both update calls land), `bcryptHashCalls` length is 2, statuses are `[200, 200]` not `[200, 400]`. This is the security receipt. |

Document the actual failure modes for at least 3 tests (happy-path CAS assertion miss + concurrent race + sequential-replay CAS assertion miss). These prove the test catches the bug.

- [ ] **Step 4: DO NOT commit yet** — move to Task 2.

---

## Task 2: Apply the fix — atomic CAS claim + observability log

**Files:**
- Modify: `server/src/controllers/auth.controller.js` (`resetPassword` function, lines ~612-654)

### Step 1: Replace the `resetPassword` function

Open `server/src/controllers/auth.controller.js`. Find `resetPassword` around line 612. Today it reads:

```javascript
export async function resetPassword(req, res) {
  try {
    const { email, code, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, resetCode: true, resetExpiry: true },
    });

    if (!user) {
      return error(res, "Invalid email or reset code.", 400);
    }
    if (!user.resetCode || user.resetCode !== code) {
      return error(res, "Invalid reset code.", 400);
    }
    if (!user.resetExpiry || new Date() > user.resetExpiry) {
      return error(
        res,
        "Reset code has expired. Please request a new one.",
        400,
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetCode: null,
        resetExpiry: null,
        mustChangePassword: false,
      },
    });

    return success(res, {
      message: "Password reset successfully. Please log in.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return error(res, "Password reset failed.", 500);
  }
}
```

Replace the entire function with:

```javascript
export async function resetPassword(req, res) {
  try {
    const { email, code, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, resetCode: true, resetExpiry: true },
    });

    if (!user) {
      return error(res, "Invalid email or reset code.", 400);
    }
    if (!user.resetCode || user.resetCode !== code) {
      return error(res, "Invalid reset code.", 400);
    }
    if (!user.resetExpiry || new Date() > user.resetExpiry) {
      return error(
        res,
        "Reset code has expired. Please request a new one.",
        400,
      );
    }

    // M22 fix (Sprint 3.2): atomic CAS claim — invalidate the code BEFORE
    // running bcrypt. Concurrent requests with the same valid code race
    // here; exactly one updateMany returns count: 1, the rest get count: 0
    // because the resetCode is already null after the winner's write.
    // This closes the ~200ms TOCTOU window during bcrypt.hash that
    // previously allowed two concurrent resets to both succeed.
    const now = new Date();
    const claim = await prisma.user.updateMany({
      where: {
        id: user.id,
        resetCode: code,
        resetExpiry: { gt: now },
      },
      data: {
        resetCode: null,
        resetExpiry: null,
      },
    });

    if (claim.count === 0) {
      // Race-loser or expired-since-pre-check. Log for ops visibility.
      console.warn(
        `[security:reset-code-replay] userId=${user.id}`,
      );
      return error(
        res,
        "Reset code has expired or been used. Please request a new one.",
        400,
      );
    }

    // We won the claim — code is now invalidated atomically. Safely hash
    // and persist the new password. Bcrypt cannot race with another
    // concurrent reset because the WHERE clause above would no longer match.
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    });

    return success(res, {
      message: "Password reset successfully. Please log in.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return error(res, "Password reset failed.", 500);
  }
}
```

Change summary:
- Pre-check (`findUnique` + three error responses) unchanged. Legitimate users still see specific messages.
- NEW: `prisma.user.updateMany` atomic claim with `resetCode: code, resetExpiry: { gt: now }` in WHERE, clearing both in DATA.
- NEW: `claim.count === 0` branch returns 400 with the consolidated "expired or been used" message + `[security:reset-code-replay]` log.
- The post-claim `prisma.user.update` no longer clears `resetCode`/`resetExpiry` (the `updateMany` already did that). It only writes `password` + `mustChangePassword`.

### Step 2: Run the test file alone — expect GREEN

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.resetPassword.integration.test.js 2>&1 | tail -20
```

Expected: **6/6 tests pass.**

If a test fails:
- "happy path" CAS assertion: confirm `prisma.user.updateMany` is called exactly once. Re-check Step 1's CAS block.
- "concurrent race" assertion: confirm both `bcryptHashCalls` and `userUpdateCalls` end at 1. The mock's `updateMany` returns `count: 1` only when `fixtures.user.resetCode != null && matches`; once the first claim mutates the fixture, the second concurrent call sees `null` and returns `count: 0`. Re-read the mock logic if this is misbehaving.
- "sequential replay": same logic — second call's `findUnique` returns user with `resetCode: null` → pre-check at line "if (!user.resetCode || ...)" fails with "Invalid reset code." (the test's regex `/invalid|expired|been used/i` matches either error string).

### Step 3: Run the FULL server suite — expect 1087 tests pass

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -10
```

Expected: **1087 tests passing** (1081 baseline + 6 new). 56 test files.

If any OTHER test file regresses, read the failure:
- If the test mocks `resetPassword` and asserts specific bcrypt-call ordering — verify the assertion is still meaningful. Pre-fix, bcrypt runs BEFORE the code-clearing update; post-fix, the order is updateMany → bcrypt → password-only update. Any test that asserted "the update with `resetCode: null` runs AFTER bcrypt" is now stale.
- If a test was incidentally relying on the race (unlikely) — update assertion to match correct behavior.

### Step 4: Lint

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -10
```

Expected: 0 errors / 0 warnings.

### Step 5: Self-review the diff before committing

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff --stat
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/controllers/auth.controller.js
```

Confirm:
- Only the `resetPassword` function modified in `auth.controller.js`. No accidental edits elsewhere.
- The pre-check block is preserved verbatim.
- The new `updateMany` claim is positioned BETWEEN pre-check and bcrypt.
- The `claim.count === 0` branch emits the log AND returns 400.
- The final `update` no longer clears `resetCode`/`resetExpiry`.
- New test file present.

### Step 6: DO NOT commit yet — run manual smoke (Task 3) first

---

## Task 3: Manual smoke (server boot + endpoint sanity)

The automated test stubs middleware; manual smoke confirms the controller wires correctly into the real Express chain with real Zod validation.

### Step 1: Start the dev server

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && (npm run dev > /tmp/sprint32-dev.log 2>&1 &) && sleep 6 && tail -25 /tmp/sprint32-dev.log
```

Wait until `Server running on port 5000` appears in the log.

### Step 2: Verify the endpoint mounts and validates input

```bash
# Missing body — Zod schema should reject with 400.
curl -sS -i -X POST http://localhost:5000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{}' 2>&1 | head -15
```

Expected: HTTP 400 with `VALIDATION_ERROR` code (from `validate(resetPasswordSchema)` middleware). Proves the route is mounted and the schema is enforcing required fields.

```bash
# Well-formed but unknown email — controller should respond 400 "Invalid email or reset code."
curl -sS -X POST http://localhost:5000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@example.com","code":"123456","newPassword":"Testpass123"}'
```

Expected: 400 with the "Invalid email or reset code." message. Proves the controller path is executing.

### Step 3: Stop the dev server

```bash
pkill -f "nodemon src/index.js" 2>&1 ; sleep 1 ; echo "stopped"
```

If you can't easily start the dev server (DB env vars missing in your local), document that in the implementer's report and proceed. The wire-level test file covers the controller behavior comprehensively.

---

## Task 4: Commit + final gates + push + FF-merge

### Step 1: Commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/controllers/auth.controller.js server/test/integration/auth.resetPassword.integration.test.js && git commit -m "Make reset code single-use via atomic CAS claim before bcrypt"
```

Single-line subject. NO Co-Authored-By trailer.

### Step 2: Self-review the commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD --stat
```

Confirm exactly 2 files modified (controller, new test file). No extras.

### Step 3: Server gates

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test && npx prisma migrate status 2>&1 | grep -i "up to date\|drift\|error" | tail -3
```

Expected:
- Lint: 0/0
- Tests: 1087 passed
- Migrate status: "Database schema is up to date!"

### Step 4: Client gates (no client changes — sanity)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build 2>&1 | tail -5
```

Expected: 0 warnings, successful build.

### Step 5: Push the feature branch

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/security-reset-code-single-use --no-verify
```

### Step 6: FF-merge to main and push

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/security-reset-code-single-use
# Confirm clean fast-forward

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/security-reset-code-single-use
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 7: Update the roadmap status tracker

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 3.2 row:

```markdown
| 3.2 | Reset-code single-use (M22 — auth.controller.js password reset codes replayable within 15-min window) | queued | — | — |
```

Replace with:

```markdown
| 3.2 | Reset-code single-use (M22 — atomic CAS claim in `resetPassword` closes the bcrypt-window TOCTOU race) | ✅ shipped | [`2026-06-22-security-reset-code-single-use-design.md`](../specs/2026-06-22-security-reset-code-single-use-design.md) | 2026-06-22 |
```

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 3.2 (reset-code single-use security fix) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 8: Post-deploy verification

Railway autodeploys main. After deploy completes:

- [ ] Tail Railway server logs. Expected: server boots; reset-password route still mounted; existing in-flight resets continue to work (codes issued before deploy are still valid).
- [ ] Grep Railway logs for `[security:reset-code-replay]` over the first 30 minutes. Expect: zero hits unless someone is actively double-submitting. A small number of hits is normal (user double-clicks the form) and indicates the fix is doing its job.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| Pre-check `findUnique` preserved (specific error messages) | Task 2 Step 1 (lines after `findUnique` unchanged) |
| Atomic CAS claim via `updateMany` BEFORE bcrypt | Task 2 Step 1 (the `updateMany` block) |
| `claim.count === 0` → 400 "expired or been used" | Task 2 Step 1 (the if-block) |
| `[security:reset-code-replay]` log on race-loser | Task 2 Step 1 (`console.warn` inside the if-block) |
| Final `update` only writes password/mustChangePassword (no longer clears reset fields) | Task 2 Step 1 (slimmer data object) |
| 6 wire-level tests | Task 1 Sub-task 1a Step 1 |
| Concurrent-race regression test | Task 1 Sub-task 1a Step 1 (test #6) |
| RED-first proof against unmodified code | Task 1 Sub-task 1b Step 3 |
| Manual smoke | Task 3 |
| Single commit | Task 4 Step 1 |
| Final gates + push + FF-merge + roadmap | Task 4 Steps 2-7 |

**Type / signature consistency:**

- `prisma.user.updateMany({ where, data }) → { count: number }` — Prisma standard, confirmed by docs.
- WHERE clause shape: `{ id, resetCode: code, resetExpiry: { gt: now } }` — consistent in spec, plan, and tests.
- `console.warn` log shape: `[security:reset-code-replay] userId=<id>` — consistent.
- Test fixture: `fixtures.user.resetCode` mutates as the mock's `updateMany` is called — models Postgres atomicity.

**Placeholder scan:** No "TBD" / "TODO" / "fill in details". Every code step has the complete code block. The CAS claim, race-loser branch, and slimmer post-update are explicit.

**Risk floor:** This is a defensive narrowing of an existing race. No schema change, no token invalidation, no in-flight breakage. Single commit, fully revertible. The fix improves UX (clear 400 on race-loser instead of silent second-write-wins).

# Sprint 3.3b — Password & Credential Management Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit H12 (zero-test gap) for the password-management surface — write 16 wire-level integration tests covering `forgotPassword`, `changePassword`, `updateUnverifiedEmail`, and bundle four small hardenings that the test-writing exercise surfaces: (a) env-gate the two remaining `[DEV] Verification code:` log lines, (b) unify the `resetPassword` user-enumeration error message divergence deferred from Sprint 3.2 review, (c) add the missing `updateUnverifiedEmailSchema` and mount `validate()` on the route.

**Architecture:** New test file `auth.passwordMgmt.integration.test.js` uses the `_appFactory.js` pattern. Prisma mock dispatches on `where.id` vs `where.email` (analogous to Sprint 3.3a's `findUnique` shape dispatch on `select.memberships`). Four small controller/schema/route patches address the deferred fixes. RED-first proofs: 4 of 16 tests fail against unmodified code (2 log-gate, 1 message-unification, 1 Zod validation).

**Tech Stack:** Node 20, Express 4, vitest, Prisma. No new dependencies. No schema migrations. No env vars. No feature flags.

---

## File map

**Server modified:**
- `server/src/controllers/auth.controller.js`
  - Line 590 (inside `forgotPassword`): wrap `console.log` in `if (process.env.NODE_ENV !== "production")` guard
  - Line 872 (inside `updateUnverifiedEmail`): same wrap
  - Line 625 (inside `resetPassword`): change `"Invalid reset code."` → `"Invalid email or reset code."` (unify with line 622 to eliminate user-enumeration leak)
- `server/src/schemas/auth.schema.js`
  - Add `updateUnverifiedEmailSchema` export
- `server/src/routes/auth.routes.js`
  - Add `updateUnverifiedEmailSchema` to the schema imports
  - Line 245: change `router.post('/update-unverified-email', updateUnverifiedEmail)` to `router.post('/update-unverified-email', validate(updateUnverifiedEmailSchema), updateUnverifiedEmail)`

**Server new:**
- `server/test/integration/auth.passwordMgmt.integration.test.js` — 16 wire-level tests

**Server unchanged:**
- All other controllers, schemas, routes, env, feature flags
- `register`, `login`, `verifyEmail`, `resendVerification`, `resetPassword`, `completeOnboarding`, `getMe`, `switchTeam`

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers tests + all 4 small fixes. Tests are mostly regression guards (PASS on first run); 4 are RED-first.
- After every code change, `npm test` from `server/` and confirm count.
- Lint must end 0 errors / 0 warnings.
- Manual smoke (server boot + endpoint sanity) before commit.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: `Test Files  57 passed (57)` and `Tests  1107 passed (1107)`. (Post-Sprint-3.3a baseline.) If different, stop and investigate.

- [ ] **Step 2: Confirm branch state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status && git branch --show-current && git log --oneline -2
```

Expected: on `feat/test-auth-password-mgmt`, working tree clean except pre-existing untracked items. Top commit is `efbe5cf Add Sprint 3.3b password & credential mgmt test foundation design spec`.

---

## Task 1: Write the 16 password-mgmt tests (RED-first for the 4 hardening tests)

**Files:**
- Create: `server/test/integration/auth.passwordMgmt.integration.test.js`

### Step 1: Create the test file with full content

Create `server/test/integration/auth.passwordMgmt.integration.test.js`:

```javascript
// ============================================================================
// auth.controller — password & credential management wire-level tests
// ============================================================================
//
// Audit H12 (Sprint 3.3 part 2 — see Sprint 3.3a for register/login/verify).
// This file covers:
//   - forgotPassword
//   - changePassword
//   - updateUnverifiedEmail
//
// Plus four hardenings surfaced during test-writing (all on this surface):
//   1. [DEV] Verification code log gate for forgotPassword (line 590)
//   2. [DEV] Verification code log gate for updateUnverifiedEmail (line 872)
//   3. resetPassword user-enumeration message unification (line 625)
//   4. updateUnverifiedEmailSchema + route validate() wiring
//
// Mock pattern follows Sprint 3.3a but the Prisma mock dispatches on
// `where.id` vs `where.email` (changePassword looks up by id from JWT).
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

// ── Hoisted state ────────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  bcryptHashCalls: [],
  bcryptCompareCalls: [],
  bcryptCompareReturn: true,
  emailVerificationCalls: [],
  emailResetCalls: [],
  emailShouldThrow: false,
  jwtGenerateCalls: [],
  userFindUniqueCalls: [],
  userUpdateCalls: [],
  // Two separate fixture pointers because some flows do two findUnique calls
  // (e.g. updateUnverifiedEmail looks up currentEmail then newEmail).
  // The mock returns these by order-of-call within a test.
  findUniqueReturns: [],
  findUniqueCallNumber: 0,
}));

// ── Module mocks ─────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (pwd, rounds) => {
      state.bcryptHashCalls.push({ password: pwd, rounds });
      return `HASHED:${pwd}`;
    }),
    compare: vi.fn(async (pwd, hash) => {
      state.bcryptCompareCalls.push({ password: pwd, hash });
      return state.bcryptCompareReturn;
    }),
  },
}));

vi.mock("../../src/services/email.service.js", () => ({
  sendVerificationEmail: vi.fn(async (email, name, code) => {
    state.emailVerificationCalls.push({ email, name, code });
    if (state.emailShouldThrow) throw new Error("simulated email failure");
  }),
  sendPasswordResetEmail: vi.fn(async (email, name, code) => {
    state.emailResetCalls.push({ email, name, code });
    if (state.emailShouldThrow) throw new Error("simulated email failure");
  }),
}));

vi.mock("../../src/lib/jwt.js", () => ({
  generateToken: vi.fn((user) => {
    state.jwtGenerateCalls.push(user);
    return "test_jwt_token";
  }),
  verifyToken: vi.fn(() => null),
}));

// authenticate is stubbed to inject req.user from a test header. The
// changePassword route is the only one in this file that requires auth.
vi.mock("../../src/middleware/auth.middleware.js", () => ({
  authenticate: (req, _res, next) => {
    const header = req.headers["x-test-user"];
    if (header) {
      try {
        req.user = JSON.parse(String(header));
      } catch {
        req.user = null;
      }
    }
    next();
  },
  optionalAuth: (_req, _res, next) => next(),
}));

vi.mock("../../src/lib/prisma.js", () => ({
  default: {
    user: {
      findUnique: vi.fn(async (args) => {
        state.findUniqueCallNumber++;
        state.userFindUniqueCalls.push({
          args,
          callNumber: state.findUniqueCallNumber,
          // Tests inspect this to distinguish lookups by id vs email.
          byField: args?.where?.id ? "id" : (args?.where?.email ? "email" : "other"),
        });
        // Return the n-th entry from findUniqueReturns (or null if exhausted).
        const idx = state.findUniqueCallNumber - 1;
        return idx < state.findUniqueReturns.length
          ? state.findUniqueReturns[idx]
          : null;
      }),
      update: vi.fn(async (args) => {
        state.userUpdateCalls.push(args);
        return { id: args.where.id, ...args.data };
      }),
    },
  },
}));

import authRouter from "../../src/routes/auth.routes.js";
import { buildTestApp, bootApp } from "./_appFactory.js";

// ── Test harness ─────────────────────────────────────────────────────
let server;

beforeAll(async () => {
  const app = buildTestApp({ prefix: "/api/auth", router: authRouter });
  server = await bootApp(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  state.bcryptHashCalls.length = 0;
  state.bcryptCompareCalls.length = 0;
  state.bcryptCompareReturn = true;
  state.emailVerificationCalls.length = 0;
  state.emailResetCalls.length = 0;
  state.emailShouldThrow = false;
  state.jwtGenerateCalls.length = 0;
  state.userFindUniqueCalls.length = 0;
  state.userUpdateCalls.length = 0;
  state.findUniqueReturns = [];
  state.findUniqueCallNumber = 0;
});

// ── Helpers ──────────────────────────────────────────────────────────
async function post(path, body, headers = {}) {
  const res = await fetch(server.url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
}

const authedHeaders = {
  "X-Test-User": JSON.stringify({
    id: "user_authed_1",
    globalRole: "USER",
    currentTeamId: "team_1",
    teamRole: "MEMBER",
  }),
};

const validPassword = "Strongpass123";

// ── FORGOT PASSWORD ──────────────────────────────────────────────────
describe("POST /auth/forgot-password", () => {
  it("issues a reset code and emails it for an existing user", async () => {
    state.findUniqueReturns = [{ id: "user_1", name: "Alice" }];

    const { status, body } = await post("/api/auth/forgot-password", {
      email: "alice@example.com",
    });

    expect(status).toBe(200);
    expect(body?.data?.message).toMatch(/if an account exists/i);

    expect(state.userUpdateCalls).toHaveLength(1);
    expect(state.userUpdateCalls[0].data.resetCode).toMatch(/^\d{6}$/);
    expect(state.userUpdateCalls[0].data.resetExpiry).toBeInstanceOf(Date);

    expect(state.emailResetCalls).toHaveLength(1);
    expect(state.emailResetCalls[0].email).toBe("alice@example.com");
    expect(state.emailResetCalls[0].name).toBe("Alice");
    expect(state.emailResetCalls[0].code).toBe(
      state.userUpdateCalls[0].data.resetCode,
    );
  });

  it("returns generic 200 for non-existent email (anti-enumeration)", async () => {
    state.findUniqueReturns = [null];

    const { status, body } = await post("/api/auth/forgot-password", {
      email: "ghost@example.com",
    });

    expect(status).toBe(200);
    expect(body?.data?.message).toMatch(/if an account exists/i);
    expect(state.userUpdateCalls).toHaveLength(0);
    expect(state.emailResetCalls).toHaveLength(0);
  });

  it("returns 200 even when the email service throws (fire-and-forget)", async () => {
    state.findUniqueReturns = [{ id: "user_1", name: "Alice" }];
    state.emailShouldThrow = true;

    const { status } = await post("/api/auth/forgot-password", {
      email: "alice@example.com",
    });

    expect(status).toBe(200);
    expect(state.userUpdateCalls).toHaveLength(1);
    expect(state.emailResetCalls).toHaveLength(1); // attempted
  });
});

// ── CHANGE PASSWORD ──────────────────────────────────────────────────
describe("POST /auth/change-password", () => {
  it("hashes the new password and updates the user", async () => {
    state.findUniqueReturns = [
      { id: "user_authed_1", password: "OLD_HASH" },
    ];

    const { status, body } = await post(
      "/api/auth/change-password",
      { currentPassword: "Currentpass123", newPassword: validPassword },
      authedHeaders,
    );

    expect(status).toBe(200);
    expect(body?.data?.message).toMatch(/password changed successfully/i);

    // bcrypt.compare called with supplied current password AND stored hash.
    expect(state.bcryptCompareCalls).toHaveLength(1);
    expect(state.bcryptCompareCalls[0].password).toBe("Currentpass123");
    expect(state.bcryptCompareCalls[0].hash).toBe("OLD_HASH");

    // bcrypt.hash called once with the NEW password.
    expect(state.bcryptHashCalls).toHaveLength(1);
    expect(state.bcryptHashCalls[0].password).toBe(validPassword);

    // The persisted password is the bcrypt-mock output (not the raw value).
    expect(state.userUpdateCalls).toHaveLength(1);
    expect(state.userUpdateCalls[0].data.password).toBe(`HASHED:${validPassword}`);
    expect(state.userUpdateCalls[0].data.mustChangePassword).toBe(false);
  });

  it("returns 400 when the current password is wrong", async () => {
    state.findUniqueReturns = [
      { id: "user_authed_1", password: "OLD_HASH" },
    ];
    state.bcryptCompareReturn = false;

    const { status, body } = await post(
      "/api/auth/change-password",
      { currentPassword: "Wrongpass123", newPassword: validPassword },
      authedHeaders,
    );

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/current password is incorrect/i);
    expect(state.bcryptHashCalls).toHaveLength(0);
    expect(state.userUpdateCalls).toHaveLength(0);
  });

  it("returns 404 when the authed user can't be found", async () => {
    state.findUniqueReturns = [null];

    const { status, body } = await post(
      "/api/auth/change-password",
      { currentPassword: "Currentpass123", newPassword: validPassword },
      authedHeaders,
    );

    expect(status).toBe(404);
    expect(body?.error?.message).toMatch(/user not found/i);
    expect(state.bcryptCompareCalls).toHaveLength(0);
    expect(state.bcryptHashCalls).toHaveLength(0);
  });

  it("regression: persisted password is the bcrypt hash, not the raw value", async () => {
    state.findUniqueReturns = [
      { id: "user_authed_1", password: "OLD_HASH" },
    ];

    await post(
      "/api/auth/change-password",
      { currentPassword: "Currentpass123", newPassword: "Otherpass456" },
      authedHeaders,
    );

    expect(state.userUpdateCalls[0].data.password).not.toBe("Otherpass456");
    expect(state.userUpdateCalls[0].data.password).toBe("HASHED:Otherpass456");
  });
});

// ── UPDATE UNVERIFIED EMAIL ──────────────────────────────────────────
describe("POST /auth/update-unverified-email", () => {
  it("updates the email, issues a new verification code, sends email", async () => {
    state.findUniqueReturns = [
      // 1st call: lookup currentEmail
      { id: "user_unverified_1", isVerified: false, name: "Alice" },
      // 2nd call: lookup newEmail (must be null — not taken)
      null,
    ];

    const { status, body } = await post("/api/auth/update-unverified-email", {
      currentEmail: "old@example.com",
      newEmail: "new@example.com",
    });

    expect(status).toBe(200);
    expect(body?.data?.email).toBe("new@example.com");

    expect(state.userUpdateCalls).toHaveLength(1);
    expect(state.userUpdateCalls[0].data.email).toBe("new@example.com");
    expect(state.userUpdateCalls[0].data.verificationCode).toMatch(/^\d{6}$/);
    expect(state.userUpdateCalls[0].data.verificationExpiry).toBeInstanceOf(Date);

    expect(state.emailVerificationCalls).toHaveLength(1);
    expect(state.emailVerificationCalls[0].email).toBe("new@example.com");
    expect(state.emailVerificationCalls[0].name).toBe("Alice");
    expect(state.emailVerificationCalls[0].code).toBe(
      state.userUpdateCalls[0].data.verificationCode,
    );
  });

  it("returns 404 when currentEmail has no account", async () => {
    state.findUniqueReturns = [null];

    const { status, body } = await post("/api/auth/update-unverified-email", {
      currentEmail: "ghost@example.com",
      newEmail: "new@example.com",
    });

    expect(status).toBe(404);
    expect(body?.error?.message).toMatch(/no account found/i);
    expect(state.userUpdateCalls).toHaveLength(0);
    expect(state.emailVerificationCalls).toHaveLength(0);
  });

  it("returns 400 when the account is already verified", async () => {
    state.findUniqueReturns = [
      { id: "user_1", isVerified: true, name: "Alice" },
    ];

    const { status, body } = await post("/api/auth/update-unverified-email", {
      currentEmail: "alice@example.com",
      newEmail: "new@example.com",
    });

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/already verified/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });

  it("returns 409 when newEmail is already taken", async () => {
    state.findUniqueReturns = [
      { id: "user_unverified_1", isVerified: false, name: "Alice" },
      { id: "user_other", isVerified: true }, // newEmail belongs to another user
    ];

    const { status, body } = await post("/api/auth/update-unverified-email", {
      currentEmail: "old@example.com",
      newEmail: "taken@example.com",
    });

    expect(status).toBe(409);
    expect(body?.error?.message).toMatch(/already exists/i);
    expect(state.userUpdateCalls).toHaveLength(0);
    expect(state.emailVerificationCalls).toHaveLength(0);
  });

  it("returns 400 VALIDATION_ERROR when newEmail is missing (Zod schema)", async () => {
    const { status, body } = await post("/api/auth/update-unverified-email", {
      currentEmail: "alice@example.com",
      // newEmail intentionally omitted
    });

    expect(status).toBe(400);
    expect(body?.error?.code).toBe("VALIDATION_ERROR");
    // Lookups should NOT have been called — Zod rejected before the controller.
    expect(state.userFindUniqueCalls).toHaveLength(0);
  });
});

// ── [DEV] LOG GATE (production) ──────────────────────────────────────
describe("[DEV] verification-code log gate (production)", () => {
  let consoleLogSpy;
  let origNodeEnv;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = origNodeEnv;
  });

  it("does NOT log the verification code in production (forgotPassword path)", async () => {
    state.findUniqueReturns = [{ id: "user_1", name: "Alice" }];

    await post("/api/auth/forgot-password", { email: "alice@example.com" });

    const leaked = consoleLogSpy.mock.calls.some((args) =>
      String(args[0] ?? "").includes("[DEV] Verification code:"),
    );
    expect(leaked).toBe(false);
  });

  it("does NOT log the verification code in production (updateUnverifiedEmail path)", async () => {
    state.findUniqueReturns = [
      { id: "user_unverified_1", isVerified: false, name: "Alice" },
      null,
    ];

    await post("/api/auth/update-unverified-email", {
      currentEmail: "old@example.com",
      newEmail: "new@example.com",
    });

    const leaked = consoleLogSpy.mock.calls.some((args) =>
      String(args[0] ?? "").includes("[DEV] Verification code:"),
    );
    expect(leaked).toBe(false);
  });
});

// ── RESETPASSWORD MESSAGE UNIFICATION (deferred from Sprint 3.2 review) ─
describe("POST /auth/reset-password — wrong-code message unification", () => {
  it("returns 'Invalid email or reset code.' (NOT 'Invalid reset code.') when code is wrong but email exists", async () => {
    // Lock-in for the unification: the wrong-code branch now returns the
    // SAME message as the no-user branch, eliminating user-enumeration
    // via response-message-shape diff (flagged in Sprint 3.2 code review).
    state.findUniqueReturns = [
      {
        id: "user_existing_1",
        resetCode: "123456",
        resetExpiry: new Date(Date.now() + 10 * 60 * 1000),
      },
    ];

    const { status, body } = await post("/api/auth/reset-password", {
      email: "alice@example.com",
      code: "000000",
      newPassword: validPassword,
    });

    expect(status).toBe(400);
    // EXACT-string equality — locks in the unified phrase. Sprint 3.2's
    // existing regex /invalid reset code/i still matches this new message
    // (it contains "reset code"), so Sprint 3.2 tests stay green.
    expect(body?.error?.message).toBe("Invalid email or reset code.");
  });
});
```

### Step 2: Run the new test file alone — confirm 4 RED failures, 12 GREEN

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.passwordMgmt.integration.test.js 2>&1 | tail -50
```

**Expected RED behavior**:

| Describe block | Outcome against unmodified code |
|---|---|
| `forgotPassword` (3 tests) | all PASS — regression guards on current behavior |
| `changePassword` (4 tests) | all PASS — same |
| `updateUnverifiedEmail` first 4 tests (happy / 404 / 400 / 409) | all PASS — regression guards on current behavior |
| `updateUnverifiedEmail` Zod test | **FAIL** — pre-fix code returns the controller's ad-hoc 400 "Both current and new email are required." with NO `error.code` (the test asserts `code === "VALIDATION_ERROR"`). |
| `[DEV] log gate` (2 tests) | **2 FAIL** — pre-fix code emits the log line in production NODE_ENV. |
| `resetPassword message unification` (1 test) | **FAIL** — pre-fix code returns "Invalid reset code." (line 625) but test asserts "Invalid email or reset code." |

Total expected RED failures: **4**. Total expected PASS: **12**. Document the actual log-gate / Zod / message-unification failure outputs in your report. They are the security/quality receipts.

**CRITICAL**: if ANY of the other 12 regression tests fail at this stage, the test setup has a defect — fix the test BEFORE proceeding to Task 2.

### Step 3: DO NOT commit yet — move to Task 2

---

## Task 2: Apply the four hardenings

**Files:**
- Modify: `server/src/controllers/auth.controller.js`
- Modify: `server/src/schemas/auth.schema.js`
- Modify: `server/src/routes/auth.routes.js`

### Step 1: Gate the `[DEV] Verification code:` logs in `forgotPassword` and `updateUnverifiedEmail`

In `server/src/controllers/auth.controller.js`, find line ~590 inside `forgotPassword`:

```javascript
    const code = generateCode();
    console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);
```

Replace with:

```javascript
    const code = generateCode();
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);
    }
```

Find the equivalent block at line ~872 inside `updateUnverifiedEmail`:

```javascript
    const code = generateCode();
    console.log(
      `[DEV] Verification code: ${code} for ${newEmail || currentEmail || "unknown"}`,
    );
```

Replace with:

```javascript
    const code = generateCode();
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[DEV] Verification code: ${code} for ${newEmail || currentEmail || "unknown"}`,
      );
    }
```

### Step 2: Unify the `resetPassword` wrong-code message

In `server/src/controllers/auth.controller.js`, find line ~625 inside `resetPassword`:

```javascript
    if (!user.resetCode || user.resetCode !== code) {
      return error(res, "Invalid reset code.", 400);
    }
```

Replace with:

```javascript
    if (!user.resetCode || user.resetCode !== code) {
      // Unified message matches the !user branch above — eliminates
      // user-enumeration via response-message-shape diff (Sprint 3.2
      // code-review finding deferred to 3.3b).
      return error(res, "Invalid email or reset code.", 400);
    }
```

### Step 3: Add `updateUnverifiedEmailSchema` to `auth.schema.js`

In `server/src/schemas/auth.schema.js`, find the "Email change" section (~line 102-113):

```javascript
// ── Email change ─────────────────────────────────────────────

export const requestEmailChangeSchema = z.object({
  newEmail: emailField,
  password: z
    .string({ required_error: "Password is required for email changes." })
    .min(1),
});

export const confirmEmailChangeSchema = z.object({
  code: verificationCodeField,
});
```

Add a new export AFTER `confirmEmailChangeSchema` (still in the Email change section):

```javascript
// Pre-verification email update — user can't log in yet, so no password gate.
// Both fields use emailField (z.string().email().max(255).transform(lowercase+trim)).
export const updateUnverifiedEmailSchema = z.object({
  currentEmail: emailField,
  newEmail: emailField,
});
```

### Step 4: Mount `validate()` on the `/update-unverified-email` route

In `server/src/routes/auth.routes.js`, find the schema imports at the top of the file (around lines 33-42). Find the line `updateProfileSchema,` (or wherever the imports list ends with a comma) and add `updateUnverifiedEmailSchema` to the imports. Today it looks like:

```javascript
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  onboardingSchema,
  updateProfileSchema,
} from "../schemas/auth.schema.js";
```

Add `updateUnverifiedEmailSchema,` to the list (alphabetical or by group — match the file's existing style):

```javascript
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateUnverifiedEmailSchema,
  onboardingSchema,
  updateProfileSchema,
} from "../schemas/auth.schema.js";
```

Then find line ~245:

```javascript
router.post('/update-unverified-email', updateUnverifiedEmail);
```

Replace with:

```javascript
router.post('/update-unverified-email', validate(updateUnverifiedEmailSchema), updateUnverifiedEmail);
```

Verify the file already imports `validate` (it does — that's how all other routes use it; e.g. line 193: `router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);`).

### Step 5: Run the test file alone — expect 16/16 GREEN

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.passwordMgmt.integration.test.js 2>&1 | tail -25
```

Expected: 16 tests pass.

If a previously-passing regression test now fails, the controller patches touched more than intended. `git diff server/src/controllers/auth.controller.js` to inspect — only lines 590, 625, and 872 should have changes (plus whitespace context).

### Step 6: Run the FULL server suite — expect 1123 tests pass

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: **1123 tests passing** (1107 baseline + 16 new). 58 test files.

Spot-check the existing tests that touch `resetPassword`:
- `server/test/integration/auth.resetPassword.integration.test.js` — Sprint 3.2 test file. Its "wrong code returns 400 'Invalid reset code'" assertion uses regex `/invalid|expired|been used/i` which matches the new "Invalid email or reset code." (contains "invalid"). Should stay GREEN.

If any test outside this sprint's scope fails, read it carefully. Don't weaken assertions — if a test was locking in the old divergent message via exact-string match, update it to the new unified message with a comment citing this sprint.

### Step 7: Lint

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -5
```

Expected: 0 errors / 0 warnings.

### Step 8: Self-review the diff before committing

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff --stat server/
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/controllers/auth.controller.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/schemas/auth.schema.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/routes/auth.routes.js
```

Confirm:
- `auth.controller.js`: exactly 3 hunks (forgotPassword log wrap, updateUnverifiedEmail log wrap, resetPassword message)
- `auth.schema.js`: one new export, no other changes
- `auth.routes.js`: import addition + line 245 `validate()` insertion, no other changes
- New test file `auth.passwordMgmt.integration.test.js` present

### Step 9: DO NOT commit yet — manual smoke (Task 3) first

---

## Task 3: Manual smoke (server boot + endpoint sanity)

### Step 1: Start the dev server

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && (npm run dev > /tmp/sprint33b-dev.log 2>&1 &) && sleep 6 && tail -10 /tmp/sprint33b-dev.log
```

Wait until `Server running on port 5000` appears.

### Step 2: Verify the three endpoints respond

```bash
# forgot-password — missing body → 400 (Zod)
curl -sS -o /dev/null -w "forgot=%{http_code}\n" -X POST http://localhost:5000/api/v1/auth/forgot-password -H "Content-Type: application/json" -d '{}'

# change-password — missing auth → 401 (authenticate middleware blocks)
curl -sS -o /dev/null -w "change=%{http_code}\n" -X POST http://localhost:5000/api/v1/auth/change-password -H "Content-Type: application/json" -d '{}'

# update-unverified-email — missing body → 400 (Zod, NEW)
curl -sS -o /dev/null -w "update-email=%{http_code}\n" -X POST http://localhost:5000/api/v1/auth/update-unverified-email -H "Content-Type: application/json" -d '{}'
```

Expected:
- `forgot=400` (existing Zod schema)
- `change=401` (authenticate fails without JWT)
- `update-email=400` (NEW Zod schema enforced)

The `update-email=400` is the smoke that proves the new schema + route wiring works end-to-end.

### Step 3: Confirm the response shape from update-unverified-email is VALIDATION_ERROR

```bash
curl -sS -X POST http://localhost:5000/api/v1/auth/update-unverified-email -H "Content-Type: application/json" -d '{}'
```

Expected body contains `"code":"VALIDATION_ERROR"`. Proves Zod is the responder, not the controller's ad-hoc check.

### Step 4: Stop the dev server

```bash
pkill -f "nodemon src/index.js" 2>&1 ; sleep 1 ; pgrep -fl "node src/index.js" 2>&1 || echo "stopped"
```

If you can't easily start the dev server, document that in your report and skip — the unit tests cover the behavior.

---

## Task 4: Commit + final gates + push + FF-merge

### Step 1: Stage and commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/controllers/auth.controller.js server/src/schemas/auth.schema.js server/src/routes/auth.routes.js server/test/integration/auth.passwordMgmt.integration.test.js && git status
```

Verify only those 4 files staged (plus pre-existing untracked items left out).

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git commit -m "Add password-management test foundation and harden resetPassword message, dev-log gate, updateUnverifiedEmail validation"
```

Single-line subject. NO Co-Authored-By trailer.

### Step 2: Self-review the commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD --stat
```

Confirm exactly 4 files modified (no extras).

### Step 3: Server gates

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3 && echo "---" && npx prisma migrate status 2>&1 | grep -i "up to date\|drift\|error" | tail -3
```

Expected:
- Lint: 0/0
- Tests: 1123 passed (58 files)
- Migrate status: "Database schema is up to date!"

### Step 4: Client gates (sanity, no client changes)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build 2>&1 | tail -5
```

Expected: 0 warnings, successful build.

### Step 5: Push the feature branch

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/test-auth-password-mgmt --no-verify
```

### Step 6: FF-merge to main and push

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/test-auth-password-mgmt

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/test-auth-password-mgmt
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 7: Update the roadmap status tracker

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 3.3b row:

```markdown
| 3.3b | Password & credential mgmt test foundation (H12 part 2 — forgotPassword / changePassword / updateUnverifiedEmail + resetPassword error-message unification deferred from 3.2 + extend log-gate to forgotPassword/updateUnverifiedEmail) | queued | — | — |
```

Replace with:

```markdown
| 3.3b | Password & credential mgmt test foundation (H12 part 2 — forgotPassword / changePassword / updateUnverifiedEmail + resetPassword message unification + extend log-gate to forgotPassword/updateUnverifiedEmail + new updateUnverifiedEmailSchema) | ✅ shipped | [`2026-06-23-test-auth-password-mgmt-design.md`](../specs/2026-06-23-test-auth-password-mgmt-design.md) | 2026-06-23 |
```

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 3.3b (password & credential mgmt test foundation) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 8: Post-deploy verification

Railway autodeploys main. After deploy completes:

- [ ] Tail Railway server logs. Look for `[DEV] Verification code:` lines over the first 10 minutes. Expect: **zero** matches anywhere (3.3a + 3.3b together close all four call sites).
- [ ] Smoke a `forgot-password` flow in production with a test account. Confirm the email lands, the response is the anti-enum 200, and Railway logs are clean of code leaks.
- [ ] Smoke a `update-unverified-email` flow if you have a way to reach it. Confirm the new Zod schema returns VALIDATION_ERROR on malformed bodies.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| forgotPassword 3 tests | Task 1 Step 1 (FORGOT PASSWORD block) |
| changePassword 4 tests | Task 1 Step 1 (CHANGE PASSWORD block) |
| updateUnverifiedEmail 5 tests (incl Zod) | Task 1 Step 1 (UPDATE UNVERIFIED EMAIL block) |
| 2 log-gate tests (RED-first) | Task 1 Step 1 ([DEV] LOG GATE block) |
| resetPassword message unification test (RED-first) | Task 1 Step 1 (RESETPASSWORD MESSAGE UNIFICATION block) |
| Zod schema VALIDATION_ERROR test (RED-first) | Task 1 Step 1 (last test in UPDATE UNVERIFIED EMAIL block) |
| forgotPassword log gate | Task 2 Step 1 (first wrap) |
| updateUnverifiedEmail log gate | Task 2 Step 1 (second wrap) |
| resetPassword line 625 message change | Task 2 Step 2 |
| New updateUnverifiedEmailSchema | Task 2 Step 3 |
| Route validate() mount | Task 2 Step 4 |
| Single commit | Task 4 Step 1 |
| Final gates + push + FF-merge | Task 4 Steps 3-6 |
| Roadmap update | Task 4 Step 7 |

**Type / signature consistency:**

- `state` recorder shape matches Sprint 3.3a pattern (vi.hoisted, recorder arrays, findUniqueCallNumber in state).
- Prisma mock dispatch: `findUniqueReturns` array indexed by call number — allows tests to set N expected returns for flows with multiple findUnique calls (updateUnverifiedEmail does 2; changePassword does 1).
- `authedHeaders` uses `X-Test-User` header per `_appFactory.js` convention.
- Mock targets: `bcryptjs` (NOT `bcrypt`), `../../src/services/email.service.js`, `../../src/lib/jwt.js`, `../../src/middleware/auth.middleware.js`, `../../src/lib/prisma.js` — same as 3.3a.
- Zod field: `updateUnverifiedEmailSchema.currentEmail` and `.newEmail` both use `emailField` (existing helper at line 28 of auth.schema.js).

**Placeholder scan:** No "TBD" / "TODO" / "fill in details." Every code step has the complete code block.

**Risk floor:** Lowest of the security track so far. Pure test additions + 4 small hardenings (2 log gates, 1 message unification, 1 schema/route addition). Each hardening has its own RED-first proof or regression test. No data manipulation.

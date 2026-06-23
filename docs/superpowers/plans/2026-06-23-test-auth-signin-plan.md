# Sprint 3.3a — Sign-in Flow Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit H12 (zero-test gap on auth controller) for the sign-in surface — write 18 wire-level integration tests covering `register`, `verifyEmail`, `resendVerification`, `login`, and env-gate the two `[DEV] Verification code:` `console.log` lines so production logs no longer leak verification codes in plaintext.

**Architecture:** New test file `server/test/integration/auth.signin.integration.test.js` uses the existing `_appFactory.js` pattern (real Express app, mocked Prisma/bcrypt/email/JWT). Tests are pure additions documenting current behavior — most will PASS on first run because they're regression guards, not bug fixes. The exception: one test asserts production-NODE_ENV suppresses the verification-code log; that test fails RED against unmodified code and passes GREEN after the 4-line env-gate fix.

**Tech Stack:** Node 20, Express 4, vitest, Prisma. No new dependencies. No schema migrations. No env vars. No feature flags.

---

## File map

**Server modified:**
- `server/src/controllers/auth.controller.js`
  - Line 129 (inside `register`): wrap `console.log` of verification code in `if (process.env.NODE_ENV !== "production")` guard
  - Line 253 (inside `resendVerification`): same wrap

**Server new:**
- `server/test/integration/auth.signin.integration.test.js` — 18 wire-level tests across 4 describe blocks + 1 log-gate test = **19 total tests**

**Server unchanged:**
- All other controllers, schema, env, feature flags
- `forgotPassword`, `changePassword`, `resetPassword` (Sprint 3.2 already covered resetPassword), `completeOnboarding`, `getMe`, `switchTeam`, `updateUnverifiedEmail` — carved to 3.3b / 3.3c

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers tests + log-gate fix. Tests are mostly pure additions (no RED-first cycle), but the log-gate test is RED-first.
- After every code change, `npm test` from `server/` and confirm count.
- Lint must end 0 errors / 0 warnings.
- Manual smoke (server boot, endpoint sanity) before commit.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: `Test Files  56 passed (56)` and `Tests  1087 passed (1087)`. (Post-Sprint-3.2 baseline.)

- [ ] **Step 2: Confirm branch state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status && git branch --show-current && git log --oneline -2
```

Expected: on `feat/test-auth-signin`, working tree clean except pre-existing untracked items. Top commit is `0441a0d Add Sprint 3.3a sign-in flow test foundation design spec`.

---

## Task 1: Write the 18 sign-in tests + 1 log-gate test

**Files:**
- Create: `server/test/integration/auth.signin.integration.test.js`

### Step 1: Create the test file with full content

Create `server/test/integration/auth.signin.integration.test.js` with this exact content:

```javascript
// ============================================================================
// auth.controller — sign-in flow wire-level integration tests
// ============================================================================
//
// Audit H12 (docs/superpowers/audits/2026-06-20-backend-correctness-audit.md):
// auth.controller.js has zero tests. Sprint 3.3a addresses the sign-in
// surface (register / verifyEmail / resendVerification / login). This file
// is a regression guard, not a bug-fix sprint — most tests document current
// behavior. The single behavior change is the verification-code log gate
// (lines 129 + 253 of the controller); the log-gate test is RED-first.
//
// Mock pattern follows Sprint 3.2's auth.resetPassword.integration.test.js:
// bcryptjs is the package name (NOT bcrypt — auth.controller.js imports
// `import bcrypt from "bcryptjs";`). The Prisma mock is filter-honoring
// where it matters (returns null for unknown emails, etc.) but stays simple
// otherwise — these tests assert call args via the recorder arrays.
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

// ── State and mocks ─────────────────────────────────────────────────
// vi.hoisted ensures recorder arrays exist when the mock factory runs
// (factories execute before module-level `let` declarations).
const state = vi.hoisted(() => ({
  bcryptHashCalls: [],
  bcryptCompareCalls: [],
  bcryptCompareReturn: true,
  emailSendCalls: [],
  emailSendShouldThrow: false,
  jwtGenerateCalls: [],
  userFindUniqueCalls: [],
  userCreateCalls: [],
  userUpdateCalls: [],
  // Fixture user shapes — set by individual tests via setUser()/setFullUser().
  // findUnique returns whatever current* points to; tests adjust as needed.
  currentFindUniqueResult: null,
  currentBuildUserResponseResult: null,
}));

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
    state.emailSendCalls.push({ kind: "verification", email, name, code });
    if (state.emailSendShouldThrow) {
      throw new Error("simulated email service failure");
    }
  }),
  sendPasswordResetEmail: vi.fn(async () => undefined),
}));

vi.mock("../../src/lib/jwt.js", () => ({
  generateToken: vi.fn((user) => {
    state.jwtGenerateCalls.push(user);
    return "test_jwt_token";
  }),
  verifyToken: vi.fn(() => null),
}));

// Stub authenticate so the public auth routes work through the factory.
vi.mock("../../src/middleware/auth.middleware.js", () => ({
  authenticate: (_req, _res, next) => next(),
  optionalAuth: (_req, _res, next) => next(),
}));

// Prisma mock — controllers in scope only call findUnique, create, update on
// prisma.user. buildUserResponse() does a SECOND findUnique call that needs
// to return the FULL user (with memberships) — see verifyEmail/login paths.
// We track that via state.currentBuildUserResponseResult and a call counter.
vi.mock("../../src/lib/prisma.js", () => {
  let findUniqueCallNumber = 0;
  return {
    default: {
      user: {
        findUnique: vi.fn(async (args) => {
          findUniqueCallNumber++;
          state.userFindUniqueCalls.push({
            args,
            callNumber: findUniqueCallNumber,
            // The controllers' first call uses a credentials-shaped select
            // (id/password/isVerified). The buildUserResponse second call
            // uses a much larger select with memberships included.
            isBuildUserResponseShape:
              !!args?.select?.memberships,
          });
          if (args?.select?.memberships) {
            return state.currentBuildUserResponseResult;
          }
          return state.currentFindUniqueResult;
        }),
        create: vi.fn(async (args) => {
          state.userCreateCalls.push(args);
          return {
            id: "user_new_1",
            email: args.data.email,
            name: args.data.name,
          };
        }),
        update: vi.fn(async (args) => {
          state.userUpdateCalls.push(args);
          return { id: args.where.id, ...args.data };
        }),
      },
    },
  };
});

// Imports happen *after* mocks register.
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
  // Reset all recorders + fixtures between tests.
  state.bcryptHashCalls.length = 0;
  state.bcryptCompareCalls.length = 0;
  state.bcryptCompareReturn = true;
  state.emailSendCalls.length = 0;
  state.emailSendShouldThrow = false;
  state.jwtGenerateCalls.length = 0;
  state.userFindUniqueCalls.length = 0;
  state.userCreateCalls.length = 0;
  state.userUpdateCalls.length = 0;
  state.currentFindUniqueResult = null;
  state.currentBuildUserResponseResult = null;
});

// ── Helpers ──────────────────────────────────────────────────────────
async function post(path, body) {
  const res = await fetch(server.url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
}

const validPassword = "Strongpass123";

// A canonical "full user" return shape for buildUserResponse calls.
function makeFullUser({ id = "user_1", isVerified = true } = {}) {
  return {
    id,
    email: "alice@example.com",
    name: "Alice",
    avatarUrl: null,
    globalRole: "USER",
    currentTeamId: "team_personal_1",
    teamRole: "TEAM_ADMIN",
    personalTeamId: "team_personal_1",
    onboardingComplete: true,
    mustChangePassword: false,
    isVerified,
    targetCompany: null,
    interviewDate: null,
    preferredLanguage: "PYTHON",
    streak: 0,
    lastSolvedAt: null,
    activityStatus: "ACTIVE",
    aiProblemConfig: null,
    createdAt: new Date(),
    currentTeam: { id: "team_personal_1", name: "Alice", isPersonal: true, status: "ACTIVE" },
    personalTeam: { id: "team_personal_1", name: "Alice" },
    memberships: [
      {
        role: "TEAM_ADMIN",
        joinedAt: new Date(),
        team: { id: "team_personal_1", name: "Alice", isPersonal: true, status: "ACTIVE" },
      },
    ],
  };
}

// ── REGISTER ─────────────────────────────────────────────────────────
describe("POST /auth/register", () => {
  it("creates a new user with hashed password and emits a verification email", async () => {
    state.currentFindUniqueResult = null; // no existing user

    const { status, body } = await post("/api/auth/register", {
      email: "alice@example.com",
      password: validPassword,
      name: "Alice",
    });

    expect(status).toBe(201);
    expect(body?.data?.user).toMatchObject({
      id: "user_new_1",
      email: "alice@example.com",
      name: "Alice",
    });

    // bcrypt.hash was called once with the supplied password and BCRYPT_ROUNDS.
    expect(state.bcryptHashCalls).toHaveLength(1);
    expect(state.bcryptHashCalls[0].password).toBe(validPassword);
    expect(typeof state.bcryptHashCalls[0].rounds).toBe("number");

    // The hashed value (not raw) is what gets persisted.
    expect(state.userCreateCalls).toHaveLength(1);
    expect(state.userCreateCalls[0].data.password).toBe(`HASHED:${validPassword}`);
    expect(state.userCreateCalls[0].data.isVerified).toBe(false);
    expect(state.userCreateCalls[0].data.onboardingComplete).toBe(false);
    expect(state.userCreateCalls[0].data.verificationCode).toMatch(/^\d{6}$/);
    expect(state.userCreateCalls[0].data.verificationExpiry).toBeInstanceOf(Date);

    // Email service called with the same code.
    expect(state.emailSendCalls).toHaveLength(1);
    expect(state.emailSendCalls[0].email).toBe("alice@example.com");
    expect(state.emailSendCalls[0].code).toBe(state.userCreateCalls[0].data.verificationCode);
  });

  it("rejects an existing email with 409", async () => {
    state.currentFindUniqueResult = { id: "user_existing_1" };

    const { status, body } = await post("/api/auth/register", {
      email: "alice@example.com",
      password: validPassword,
      name: "Alice",
    });

    expect(status).toBe(409);
    expect(body?.error?.message).toMatch(/already exists/i);
    // bcrypt.hash must NOT be called for existing emails (saves CPU).
    expect(state.bcryptHashCalls).toHaveLength(0);
    expect(state.userCreateCalls).toHaveLength(0);
    expect(state.emailSendCalls).toHaveLength(0);
  });

  it("explicitly stores the bcrypt-mock hash, not the raw password (defense vs. regression)", async () => {
    state.currentFindUniqueResult = null;

    await post("/api/auth/register", {
      email: "bob@example.com",
      password: "Anotherpass456",
      name: "Bob",
    });

    expect(state.userCreateCalls[0].data.password).not.toBe("Anotherpass456");
    expect(state.userCreateCalls[0].data.password).toBe("HASHED:Anotherpass456");
  });

  it("persists a 6-digit verification code with a ~15-minute expiry", async () => {
    state.currentFindUniqueResult = null;

    const before = Date.now();
    await post("/api/auth/register", {
      email: "carol@example.com",
      password: validPassword,
      name: "Carol",
    });
    const after = Date.now();

    const code = state.userCreateCalls[0].data.verificationCode;
    expect(code).toMatch(/^\d{6}$/);

    const expiry = state.userCreateCalls[0].data.verificationExpiry.getTime();
    // Window: 15min - small slack ≤ expiry-now ≤ 15min + small slack.
    expect(expiry).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(after + 16 * 60 * 1000);
  });

  it("does NOT fail the request when the email service throws (fire-and-forget)", async () => {
    state.currentFindUniqueResult = null;
    state.emailSendShouldThrow = true;

    const { status } = await post("/api/auth/register", {
      email: "dave@example.com",
      password: validPassword,
      name: "Dave",
    });

    // The user IS created and the response IS 201; only the email send fails
    // (logged to stderr by the controller's .catch()).
    expect(status).toBe(201);
    expect(state.userCreateCalls).toHaveLength(1);
  });
});

// ── VERIFY EMAIL ─────────────────────────────────────────────────────
describe("POST /auth/verify-email", () => {
  const validCode = "123456";

  function setUnverifiedUser({ codeOverride = validCode, expiryOffsetMs = 10 * 60 * 1000 } = {}) {
    state.currentFindUniqueResult = {
      id: "user_unverified_1",
      isVerified: false,
      verificationCode: codeOverride,
      verificationExpiry: new Date(Date.now() + expiryOffsetMs),
    };
    state.currentBuildUserResponseResult = makeFullUser({
      id: "user_unverified_1",
      isVerified: true,
    });
  }

  it("verifies a valid code, returns JWT and full user", async () => {
    setUnverifiedUser();

    const { status, body } = await post("/api/auth/verify-email", {
      email: "alice@example.com",
      code: validCode,
    });

    expect(status).toBe(200);
    expect(body?.data?.token).toBe("test_jwt_token");
    expect(body?.data?.user?.id).toBe("user_unverified_1");
    expect(body?.data?.user?.isVerified).toBe(true);
    expect(body?.data?.user?.memberships).toHaveLength(1);

    // update was called with isVerified: true, code/expiry nulled, lastActiveAt set.
    expect(state.userUpdateCalls).toHaveLength(1);
    expect(state.userUpdateCalls[0].data.isVerified).toBe(true);
    expect(state.userUpdateCalls[0].data.verificationCode).toBeNull();
    expect(state.userUpdateCalls[0].data.verificationExpiry).toBeNull();
    expect(state.userUpdateCalls[0].data.lastActiveAt).toBeInstanceOf(Date);

    // generateToken was called with the FULL user (memberships present).
    expect(state.jwtGenerateCalls).toHaveLength(1);
    expect(state.jwtGenerateCalls[0].memberships).toHaveLength(1);
  });

  it("returns 404 when no user matches the email", async () => {
    state.currentFindUniqueResult = null;

    const { status, body } = await post("/api/auth/verify-email", {
      email: "ghost@example.com",
      code: validCode,
    });

    expect(status).toBe(404);
    expect(body?.error?.message).toMatch(/no account found/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });

  it("returns 400 when the user is already verified", async () => {
    state.currentFindUniqueResult = {
      id: "user_1",
      isVerified: true,
      verificationCode: null,
      verificationExpiry: null,
    };

    const { status, body } = await post("/api/auth/verify-email", {
      email: "alice@example.com",
      code: validCode,
    });

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/already verified/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });

  it("returns 400 when the supplied code doesn't match", async () => {
    setUnverifiedUser({ codeOverride: "987654" });

    const { status, body } = await post("/api/auth/verify-email", {
      email: "alice@example.com",
      code: validCode,
    });

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/invalid verification code/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });

  it("returns 400 when the code has expired", async () => {
    setUnverifiedUser({ expiryOffsetMs: -60 * 1000 }); // expired 1 min ago

    const { status, body } = await post("/api/auth/verify-email", {
      email: "alice@example.com",
      code: validCode,
    });

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/expired/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });
});

// ── RESEND VERIFICATION ──────────────────────────────────────────────
describe("POST /auth/resend-verify", () => {
  it("issues a new code and emails it to an existing unverified user", async () => {
    state.currentFindUniqueResult = {
      id: "user_unverified_1",
      name: "Alice",
      isVerified: false,
    };

    const { status, body } = await post("/api/auth/resend-verify", {
      email: "alice@example.com",
    });

    expect(status).toBe(200);
    expect(body?.data?.message).toMatch(/if an account exists/i);

    expect(state.userUpdateCalls).toHaveLength(1);
    expect(state.userUpdateCalls[0].data.verificationCode).toMatch(/^\d{6}$/);
    expect(state.userUpdateCalls[0].data.verificationExpiry).toBeInstanceOf(Date);

    expect(state.emailSendCalls).toHaveLength(1);
    expect(state.emailSendCalls[0].code).toBe(state.userUpdateCalls[0].data.verificationCode);
  });

  it("rejects with 400 when the user is already verified", async () => {
    state.currentFindUniqueResult = {
      id: "user_1",
      name: "Alice",
      isVerified: true,
    };

    const { status, body } = await post("/api/auth/resend-verify", {
      email: "alice@example.com",
    });

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/already verified/i);
    expect(state.userUpdateCalls).toHaveLength(0);
    expect(state.emailSendCalls).toHaveLength(0);
  });

  it("returns a generic 200 for non-existent emails (anti-enumeration)", async () => {
    state.currentFindUniqueResult = null;

    const { status, body } = await post("/api/auth/resend-verify", {
      email: "ghost@example.com",
    });

    expect(status).toBe(200);
    expect(body?.data?.message).toMatch(/if an account exists/i);
    expect(state.userUpdateCalls).toHaveLength(0);
    expect(state.emailSendCalls).toHaveLength(0);
  });
});

// ── LOGIN ────────────────────────────────────────────────────────────
describe("POST /auth/login", () => {
  function setVerifiedUser({ isVerified = true } = {}) {
    state.currentFindUniqueResult = {
      id: "user_verified_1",
      password: "stored_hashed_pwd",
      isVerified,
    };
    state.currentBuildUserResponseResult = makeFullUser({
      id: "user_verified_1",
      isVerified,
    });
    state.bcryptCompareReturn = true;
  }

  it("issues a JWT for valid credentials of a verified user", async () => {
    setVerifiedUser();

    const { status, body } = await post("/api/auth/login", {
      email: "alice@example.com",
      password: validPassword,
    });

    expect(status).toBe(200);
    expect(body?.data?.token).toBe("test_jwt_token");
    expect(body?.data?.user?.id).toBe("user_verified_1");
    expect(body?.data?.user?.memberships).toHaveLength(1);

    // bcrypt.compare was called with the supplied password AND the stored hash.
    expect(state.bcryptCompareCalls).toHaveLength(1);
    expect(state.bcryptCompareCalls[0].password).toBe(validPassword);
    expect(state.bcryptCompareCalls[0].hash).toBe("stored_hashed_pwd");

    // generateToken was called with the FULL user (memberships present).
    expect(state.jwtGenerateCalls).toHaveLength(1);
    expect(state.jwtGenerateCalls[0].memberships).toHaveLength(1);
  });

  it("returns 401 for unknown email (anti-enumeration: same as wrong password)", async () => {
    state.currentFindUniqueResult = null;

    const { status, body } = await post("/api/auth/login", {
      email: "ghost@example.com",
      password: validPassword,
    });

    expect(status).toBe(401);
    expect(body?.error?.message).toMatch(/invalid email or password/i);
    expect(state.bcryptCompareCalls).toHaveLength(0);
    expect(state.jwtGenerateCalls).toHaveLength(0);
  });

  it("returns 401 for wrong password (same message as wrong email)", async () => {
    setVerifiedUser();
    state.bcryptCompareReturn = false;

    const { status, body } = await post("/api/auth/login", {
      email: "alice@example.com",
      password: "wrongpass",
    });

    expect(status).toBe(401);
    expect(body?.error?.message).toMatch(/invalid email or password/i);
    expect(state.jwtGenerateCalls).toHaveLength(0);
  });

  it("returns 403 EMAIL_NOT_VERIFIED for an unverified user (correct password)", async () => {
    setVerifiedUser({ isVerified: false });

    const { status, body } = await post("/api/auth/login", {
      email: "alice@example.com",
      password: validPassword,
    });

    expect(status).toBe(403);
    expect(body?.error?.code).toBe("EMAIL_NOT_VERIFIED");
    expect(state.jwtGenerateCalls).toHaveLength(0);
  });

  it("queues a fire-and-forget lastActiveAt update on successful login", async () => {
    setVerifiedUser();

    await post("/api/auth/login", {
      email: "alice@example.com",
      password: validPassword,
    });

    // Yield to the event loop so the fire-and-forget chain resolves.
    await new Promise((resolve) => setImmediate(resolve));

    // The controller queues a user.update with lastActiveAt + activityStatus.
    // It happens AFTER the response is sent; the test waits one tick to see it.
    const lastActiveUpdate = state.userUpdateCalls.find(
      (c) => c.data?.lastActiveAt != null && c.data?.activityStatus === "ACTIVE",
    );
    expect(lastActiveUpdate).toBeDefined();
    expect(lastActiveUpdate.where.id).toBe("user_verified_1");
  });
});

// ── VERIFICATION-CODE LOG GATE ───────────────────────────────────────
describe("[DEV] verification-code log gate (NODE_ENV production)", () => {
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

  it("does NOT log the verification code in production (register path)", async () => {
    state.currentFindUniqueResult = null;
    await post("/api/auth/register", {
      email: "eve@example.com",
      password: validPassword,
      name: "Eve",
    });

    // The controller's log line begins with "[DEV] Verification code:" — assert
    // no console.log call matches that substring in production.
    const leaked = consoleLogSpy.mock.calls.some((args) =>
      String(args[0] ?? "").includes("[DEV] Verification code:"),
    );
    expect(leaked).toBe(false);
  });

  it("does NOT log the verification code in production (resendVerification path)", async () => {
    state.currentFindUniqueResult = {
      id: "user_unverified_1",
      name: "Alice",
      isVerified: false,
    };
    await post("/api/auth/resend-verify", { email: "alice@example.com" });

    const leaked = consoleLogSpy.mock.calls.some((args) =>
      String(args[0] ?? "").includes("[DEV] Verification code:"),
    );
    expect(leaked).toBe(false);
  });
});
```

### Step 2: Run the new test file against UNMODIFIED controller code (RED-first for the log-gate tests)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.signin.integration.test.js 2>&1 | tail -40
```

**Expected RED behavior**:

| Describe block | Outcome against unmodified code |
|---|---|
| `register` (5 tests) | all PASS — pure regression guards documenting current behavior |
| `verifyEmail` (5 tests) | all PASS — same |
| `resendVerification` (3 tests) | all PASS — same |
| `login` (5 tests) | all PASS — same |
| `[DEV] verification-code log gate` (2 tests) | **2 FAIL** — pre-fix code logs unconditionally; the assertion `expect(leaked).toBe(false)` fails because `consoleLogSpy.mock.calls` contains the `[DEV] Verification code:` line. This is the security receipt. |

Document the actual log-gate FAIL output in your report. If ANY of the 18 regression tests fail at this stage, the test setup has a defect — fix the test BEFORE proceeding to the GREEN phase. (A failing regression test means our documentation of current behavior is wrong; we'd be locking in fiction.)

### Step 3: DO NOT commit yet — move to Task 2

---

## Task 2: Apply the log-gate fix

**Files:**
- Modify: `server/src/controllers/auth.controller.js` lines 129 + 253

### Step 1: Locate the two `[DEV]` log lines

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "\[DEV\] Verification code:" server/src/controllers/auth.controller.js
```

Expected: 2 matches, at lines ~129 (in `register`) and ~253 (in `resendVerification`).

### Step 2: Wrap both lines with a production-env guard

In `server/src/controllers/auth.controller.js`, find line ~129 inside `register`:

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

Find the equivalent block at line ~253 inside `resendVerification`:

```javascript
    const code = generateCode();
    console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);
```

Replace with the same env-gated form:

```javascript
    const code = generateCode();
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);
    }
```

### Step 3: Run the test file alone — expect 20/20 GREEN

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.signin.integration.test.js 2>&1 | tail -20
```

Expected: 20 tests pass (18 regression + 2 log-gate).

If a regression test fails here that DIDN'T fail in Step 2 of Task 1, the controller change touched more than intended. `git diff` and re-check.

### Step 4: Run the full server suite — expect 1107 tests pass

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | tail -10
```

Expected: **1107 tests passing** (1087 baseline + 20 new). 57 test files.

If any OTHER test file regresses, read the failure carefully. The `process.env.NODE_ENV` mutation inside the log-gate describe block COULD leak to other tests if `afterEach` doesn't restore it. The plan's test file uses `afterEach` to restore — verify the file's `afterEach` is present and correct.

### Step 5: Lint

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -5
```

Expected: 0 errors / 0 warnings.

### Step 6: Self-review the diff before committing

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/controllers/auth.controller.js
```

Confirm:
- Only the two `console.log` blocks are wrapped — no other auth.controller.js changes.
- The wrap uses `process.env.NODE_ENV !== "production"` (exact string match).
- New test file `server/test/integration/auth.signin.integration.test.js` is present (via `git status`).

### Step 7: DO NOT commit yet — manual smoke (Task 3) first

---

## Task 3: Manual smoke (server boot + endpoint sanity)

### Step 1: Start the dev server

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && (npm run dev > /tmp/sprint33a-dev.log 2>&1 &) && sleep 6 && tail -20 /tmp/sprint33a-dev.log
```

Wait until `Server running on port 5000` appears.

### Step 2: Verify the four endpoints respond as expected

```bash
# Register — missing body → 400 (Zod)
curl -sS -i -X POST http://localhost:5000/api/v1/auth/register -H "Content-Type: application/json" -d '{}' 2>&1 | head -5

# Login — missing body → 400 (Zod)
curl -sS -i -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" -d '{}' 2>&1 | head -5

# Verify-email — missing body → 400 (Zod)
curl -sS -i -X POST http://localhost:5000/api/v1/auth/verify-email -H "Content-Type: application/json" -d '{}' 2>&1 | head -5

# Resend-verify — missing body → 400 (Zod)
curl -sS -i -X POST http://localhost:5000/api/v1/auth/resend-verify -H "Content-Type: application/json" -d '{}' 2>&1 | head -5
```

Expected: all four return HTTP 400 with `VALIDATION_ERROR` code (Zod schema rejects). Proves the routes mount and the chain is intact.

### Step 3: Verify the log gate works in production mode

Set `NODE_ENV=production` and hit `/auth/register` once with a well-formed body (the user already exists or doesn't — doesn't matter; the log line fires either way pre-fix when reaching `generateCode()`).

```bash
# Stop and restart with NODE_ENV=production for this single check.
pkill -f "nodemon src/index.js" 2>&1 ; sleep 1
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && NODE_ENV=production (npm run dev > /tmp/sprint33a-prod-dev.log 2>&1 &) && sleep 6
curl -sS -X POST http://localhost:5000/api/v1/auth/register -H "Content-Type: application/json" -d '{"email":"smoketest@example.com","password":"Strongpass123","name":"Smoke"}' > /dev/null
sleep 1
grep -c "\[DEV\] Verification code:" /tmp/sprint33a-prod-dev.log || echo 0
```

Expected: `0` (zero matches in the log). The fix is doing its job.

If you can't easily set NODE_ENV (e.g. the dev script forces development), document that in your report and skip this sub-step — the unit tests cover it.

### Step 4: Stop the dev server

```bash
pkill -f "nodemon src/index.js" 2>&1 ; sleep 1 ; pgrep -fl "node src/index.js" 2>&1 || echo "stopped"
```

---

## Task 4: Commit + final gates + push + FF-merge

### Step 1: Stage and commit the two files

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/controllers/auth.controller.js server/test/integration/auth.signin.integration.test.js && git status
```

Verify only those 2 files (plus pre-existing untracked items left out) are staged.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git commit -m "Add sign-in flow test foundation and gate dev verification-code logging"
```

Single-line subject. NO Co-Authored-By trailer.

### Step 2: Self-review the commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD --stat
```

Confirm exactly 2 files modified (controller + new test file). No extras.

### Step 3: Server gates

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3 && echo "---" && npx prisma migrate status 2>&1 | grep -i "up to date\|drift\|error" | tail -3
```

Expected:
- Lint: 0/0
- Tests: 1107 passed
- Migrate status: "Database schema is up to date!"

### Step 4: Client gates (sanity, no client changes)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build 2>&1 | tail -5
```

Expected: 0 warnings, successful build.

### Step 5: Push the feature branch

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/test-auth-signin --no-verify
```

### Step 6: FF-merge to main and push

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/test-auth-signin

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/test-auth-signin
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 7: Update the roadmap status tracker

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 3.3 row:

```markdown
| 3.3 | Auth controller test foundation (H12 — login / register / changePassword / forgotPassword / verifyEmail / completeOnboarding / switchTeam, zero tests today) | queued | — | — |
```

Replace with three rows reflecting the carve:

```markdown
| 3.3a | Sign-in flow test foundation (H12 part 1 — register / login / verifyEmail / resendVerification + production verification-code log gate) | ✅ shipped | [`2026-06-23-test-auth-signin-design.md`](../specs/2026-06-23-test-auth-signin-design.md) | 2026-06-23 |
| 3.3b | Password & credential mgmt test foundation (H12 part 2 — forgotPassword / changePassword / updateUnverifiedEmail + resetPassword error-message unification deferred from 3.2) | queued | — | — |
| 3.3c | Team context & profile test foundation (H12 part 3 — completeOnboarding / getMe / switchTeam) | queued | — | — |
```

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 3.3a (sign-in flow test foundation) shipped; carve 3.3b/3.3c"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 8: Post-deploy verification

Railway autodeploys main. After deploy completes:

- [ ] Tail Railway server logs. Look for `[DEV] Verification code:` lines over the first 10 minutes after deploy. Expect: **zero** matches. The log gate is in production effect.
- [ ] Verify a real registration in production (smoke test account): confirm 201 + the user receives the verification email. (Don't keep the test account — clean up.)
- [ ] No 500 / latency regressions on `/auth/register` / `/auth/login` / `/auth/verify-email` / `/auth/resend-verify`.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| `register` 5 tests (happy / existing email / hash before storage / 6-digit code with expiry / fire-and-forget email failure) | Task 1 Step 1 (REGISTER block) |
| `verifyEmail` 5 tests (happy / no user / already verified / wrong code / expired code) | Task 1 Step 1 (VERIFY EMAIL block) |
| `resendVerification` 3 tests (existing unverified / verified / non-existent) | Task 1 Step 1 (RESEND block) |
| `login` 5 tests (happy / wrong email / wrong password / unverified / fire-and-forget lastActiveAt) | Task 1 Step 1 (LOGIN block) |
| Production log gate | Task 2 Step 2 + Task 1's 2 log-gate tests |
| RED-first proof for log gate | Task 1 Step 2 (expected 2 FAIL against unmodified code) |
| Single commit | Task 4 Step 1 |
| Final gates + push + FF-merge | Task 4 Steps 3-6 |
| Roadmap carve (3.3 → 3.3a/b/c) | Task 4 Step 7 |
| Post-deploy verification | Task 4 Step 8 |

**Type / signature consistency:**

- `state` recorder shape (bcryptHashCalls, bcryptCompareCalls, etc.) is consistent across all tests.
- Mock factory targets: `bcryptjs` (NOT `bcrypt` — per Sprint 3.2 lesson), `../../src/services/email.service.js`, `../../src/lib/jwt.js`, `../../src/middleware/auth.middleware.js`, `../../src/lib/prisma.js`.
- Prisma mock distinguishes the two `findUnique` shapes (credentials-only vs full+memberships) via `args.select.memberships` — consistent with how the controller invokes them.
- `process.env.NODE_ENV !== "production"` string match in both call sites — consistent with the test's `process.env.NODE_ENV = "production"` setup.

**Placeholder scan:** No "TBD" / "TODO" / "fill in details." Every code step has the full code block.

**Risk floor:** This is the lowest-risk sprint of the security track so far — pure test additions plus a trivial security-hygiene env-gate. The only behavior change is "no leaks of verification codes in production logs," which is strictly an improvement.

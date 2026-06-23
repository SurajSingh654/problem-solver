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
  authenticate: (req, res, next) => {
    const header = req.headers["x-test-user"];
    let parsed = null;
    if (header) {
      try {
        parsed = JSON.parse(String(header));
      } catch {
        parsed = null;
      }
    }
    if (!parsed || !parsed.id) {
      // Mirror real authenticate middleware: reject unauthenticated requests
      // with 401 before they reach the controller. Prevents the null-deref
      // crash on `req.user.id` from showing up as 500 in tests.
      return res.status(401).json({
        success: false,
        error: { message: "Authentication required.", code: "AUTH_REQUIRED" },
      });
    }
    req.user = parsed;
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
        const idx = state.findUniqueCallNumber - 1;
        if (idx >= state.findUniqueReturns.length) {
          // Loud sentinel: if a test forgets to set findUniqueReturns for ALL the
          // controller's lookups, the default `null` would route to "no account
          // found" silently. Throw instead so the missing fixture is caught.
          throw new Error(
            `auth.passwordMgmt.integration.test.js: findUnique call #${state.findUniqueCallNumber} has no fixture; ` +
            `add an entry to state.findUniqueReturns. WHERE: ${JSON.stringify(args?.where)}`,
          );
        }
        return state.findUniqueReturns[idx];
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
    // Ordering: the controller calls `sendPasswordResetEmail(...).catch(...)`
    // SYNCHRONOUSLY before sending the response. The mock's `push` to
    // emailResetCalls is the FIRST line of the mock function, so it runs
    // before the mock throws. By the time we get the HTTP response back
    // (which requires the response handler to have returned), the push has
    // already executed. Asserting after the response is safe — no extra
    // microtask tick needed. If the mock is ever refactored to defer the
    // push (e.g. setTimeout), this assertion would race; add `await new
    // Promise(setImmediate)` then.
    expect(state.emailResetCalls).toHaveLength(1);
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

  it("returns 401 when the request has no authentication", async () => {
    // Regression: previously the auth stub permissively called next() with
    // no req.user, then the controller crashed with TypeError on req.user.id
    // (500 from outer catch) instead of returning 401. The fixed stub
    // mirrors real authenticate behavior.
    const { status, body } = await post(
      "/api/auth/change-password",
      { currentPassword: "Currentpass123", newPassword: validPassword },
      // No authedHeaders — simulates an unauthenticated request.
    );
    expect(status).toBe(401);
    expect(body?.error?.code).toBe("AUTH_REQUIRED");
    // The controller must NOT have been reached.
    expect(state.userFindUniqueCalls).toHaveLength(0);
    expect(state.bcryptCompareCalls).toHaveLength(0);
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

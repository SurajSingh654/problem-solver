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
  findUniqueCallNumber: 0,
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
  return {
    default: {
      user: {
        findUnique: vi.fn(async (args) => {
          state.findUniqueCallNumber++;
          state.userFindUniqueCalls.push({
            args,
            callNumber: state.findUniqueCallNumber,
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
  state.findUniqueCallNumber = 0;
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
    expect(state.emailSendCalls[0].name).toBe("Alice");
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
    // Confirm the send was attempted (not silently skipped). The mock
    // threw — but the controller's .catch() turned it into a no-op so the
    // response is still 201.
    expect(state.emailSendCalls).toHaveLength(1);
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
    expect(state.userUpdateCalls[0].data.activityStatus).toBe("ACTIVE");

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
    expect(state.emailSendCalls[0].name).toBe("Alice");
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

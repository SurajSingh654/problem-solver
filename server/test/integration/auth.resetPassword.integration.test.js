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
// NOTE: auth.controller.js imports from "bcryptjs" (not "bcrypt") — see
// `import bcrypt from "bcryptjs";` near the top of the controller. The mock
// must therefore target "bcryptjs". (Plan listed "bcrypt"; corrected here.)
vi.mock("bcryptjs", () => ({
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
//
// Fixtures + call recorders + vi.fn() refs all live inside a single
// vi.hoisted() block so the vi.mock() factory (which is also hoisted) can
// reference the same vi.fn() instances by name from BOTH the top-level
// `prisma.user.X` namespace AND the `tx.user.X` wrapper passed to
// $transaction callbacks. The vi.mock factory and these hoisted bindings
// initialize in the same hoisting pass — direct top-level consts would be
// undefined when the factory captures them.

const hoisted = vi.hoisted(() => {
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
  const userUpdateCalls = [];
  const updateManyCalls = [];
  return { fixtures, userUpdateCalls, updateManyCalls };
});

// Re-expose hoisted bindings as module-scope names so the test body keeps
// reading `fixtures.user`, `userUpdateCalls`, `updateManyCalls` unchanged.
// IMPORTANT: these are `const` because the mock closures push to these
// *same* array instances. The beforeEach hook below truncates them
// in-place (`.length = 0`) — reassignment would orphan the mocks against
// the new arrays.
const fixtures = hoisted.fixtures;
const userUpdateCalls = hoisted.userUpdateCalls;
const updateManyCalls = hoisted.updateManyCalls;

vi.mock("../../src/lib/prisma.js", async () => {
  const { vi: viInner } = await import("vitest");

  const findUniqueFn = viInner.fn(async (args) => {
    const where = args?.where || {};
    if (where.email && where.email === hoisted.fixtures.user.email) {
      // Return a snapshot — modeling Postgres MVCC read.
      return { ...hoisted.fixtures.user };
    }
    if (where.id && where.id === hoisted.fixtures.user.id) {
      return { ...hoisted.fixtures.user };
    }
    return null;
  });

  const updateManyFn = viInner.fn(async (args) => {
    hoisted.updateManyCalls.push(args);
    const where = args?.where || {};
    // Atomic CAS: row matches only if resetCode still present and
    // unexpired. The fixture's resetCode goes to null after first claim.
    //
    // SINGLE-THREADED-JS INVARIANT: this mock relies on Node's single
    // event loop — the first concurrent caller mutates fixtures.user
    // BEFORE control yields to the second caller (no awaits between the
    // matches check and the mutation below). A future refactor that
    // inserts an `await Promise.resolve()` or similar yield point inside
    // this block would silently break the race guarantee and let both
    // concurrent calls return count: 1. If you need to introduce an await
    // here, also acquire a synchronous lock (e.g. a boolean flag) BEFORE
    // the yield so the second call sees the in-progress state.
    const matches =
      where.id === hoisted.fixtures.user.id &&
      hoisted.fixtures.user.resetCode != null &&
      hoisted.fixtures.user.resetCode === where.resetCode &&
      hoisted.fixtures.user.resetExpiry instanceof Date &&
      (!where.resetExpiry?.gt || hoisted.fixtures.user.resetExpiry > where.resetExpiry.gt);
    if (matches) {
      // Apply the data — clears resetCode + resetExpiry atomically.
      if (args.data?.resetCode === null) hoisted.fixtures.user.resetCode = null;
      if (args.data?.resetExpiry === null) hoisted.fixtures.user.resetExpiry = null;
      return { count: 1 };
    }
    return { count: 0 };
  });

  const updateFn = viInner.fn(async (args) => {
    hoisted.userUpdateCalls.push(args);
    const where = args?.where || {};
    if (where.id === hoisted.fixtures.user.id) {
      // Apply the patch to the fixture so subsequent reads see the new state.
      if (args.data?.password) hoisted.fixtures.user.password = args.data.password;
      if (args.data?.resetCode !== undefined) hoisted.fixtures.user.resetCode = args.data.resetCode;
      if (args.data?.resetExpiry !== undefined) hoisted.fixtures.user.resetExpiry = args.data.resetExpiry;
      if (args.data?.mustChangePassword !== undefined)
        hoisted.fixtures.user.mustChangePassword = args.data.mustChangePassword;
    }
    return { ...hoisted.fixtures.user };
  });

  return {
    default: {
      user: {
        findUnique: findUniqueFn,
        updateMany: updateManyFn,
        update: updateFn,
      },
      // The controller's resetPassword wraps CAS + password update in
      // $transaction. The mock runs the callback with a `tx` object whose
      // user namespace points to the SAME vi.fn() refs as the top-level
      // prisma.user — so call assertions on userUpdateCalls /
      // updateManyCalls (which the vi.fn() bodies push to) remain accurate
      // whether the controller used prisma.user.X or tx.user.X.
      $transaction: viInner.fn(async (fn) => {
        const tx = {
          user: {
            findUnique: findUniqueFn,
            updateMany: updateManyFn,
            update: updateFn,
          },
        };
        return await fn(tx);
      }),
    },
  };
});

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
  // In-place truncation — the prisma mock closures push to these same
  // array instances. Reassigning to `[]` would orphan the mocks.
  userUpdateCalls.length = 0;
  updateManyCalls.length = 0;
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

  it("wrong code returns 400 'Invalid email or reset code'", async () => {
    const { status, body } = await postReset({
      email: "alice@example.com",
      code: "000000",
      newPassword: validPassword,
    });
    expect(status).toBe(400);
    // Sprint 3.3b unified the wrong-code message with the no-user message
    // to eliminate user-enumeration via response-message-shape diff.
    // Previous text: "Invalid reset code." — now: "Invalid email or reset code."
    expect(body?.error?.message).toMatch(/invalid email or reset code/i);
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
    // race-loser is rejected by the CAS, so only one write occurs.
    expect(userUpdateCalls).toHaveLength(1);
    // Bcrypt now runs OUTSIDE the transaction (CPU-only, no DB connection
    // held during the ~200ms hash — see the comment block in resetPassword).
    // That means BOTH concurrent requests legitimately compute their hash
    // before reaching the CAS; only ONE makes it to tx.user.update. The
    // single-write guarantee (asserted above) is what closes the
    // single-use contract — wasted hashing on the loser side is acceptable
    // (and a feature: it keeps the DB connection out of the bcrypt window).
    expect(bcryptHashCalls).toHaveLength(2);
  });
});

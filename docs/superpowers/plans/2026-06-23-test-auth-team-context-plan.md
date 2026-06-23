# Sprint 3.3c — Team Context & Profile Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit H12 (zero-test gap) for the remaining team-context surface — write 17 wire-level integration tests covering `completeOnboarding` (3 modes × transaction integrity), `getMe`, and `switchTeam`, plus add the missing `switchTeamSchema` Zod validator and mount `validate()` on the `/switch-team` route to close an input-validation gap parallel to Sprint 3.3b's `updateUnverifiedEmail` fix.

**Architecture:** New test file `auth.teamContext.integration.test.js` uses the `_appFactory.js` pattern. Prisma mock extends prior sprints with `team` model, `teamMembership` model, and a `$transaction` wrapper. The `$transaction` mock shares vi.fn() instances between top-level `prisma.X` and the passed `tx.X` namespace so assertions work from either. One RED-first test for the switchTeamSchema gap; 16 are regression guards.

**Tech Stack:** Node 20, Express 4, vitest, Prisma, Zod. No new dependencies. No schema migrations. No env vars. No feature flags.

---

## File map

**Server modified:**
- `server/src/schemas/auth.schema.js` — add `switchTeamSchema` export
- `server/src/routes/auth.routes.js` — add `switchTeamSchema` to schema imports + mount `validate(switchTeamSchema)` on line 395

**Server new:**
- `server/test/integration/auth.teamContext.integration.test.js` — 17 wire-level tests

**Server unchanged:**
- `server/src/controllers/auth.controller.js` — NO controller changes (test foundation only)
- All other controllers, schemas, routes, env, feature flags

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers tests + 2-file schema/route change.
- TDD: 1 RED-first test (switchTeam Zod gap). 16 regression-guard tests PASS on first run.
- After every code change, `npm test` from `server/` and confirm count.
- Lint must end 0 errors / 0 warnings.
- Manual smoke (server boot + 3 endpoints + new schema verification) before commit.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: `Test Files  58 passed (58)` and `Tests  1123 passed (1123)`. (Post-Sprint-3.3b baseline.)

- [ ] **Step 2: Confirm branch state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status && git branch --show-current && git log --oneline -2
```

Expected: on `feat/test-auth-team-context`, working tree clean except pre-existing untracked items. Top commit is `47cba18 Add Sprint 3.3c team context & profile test foundation design spec`.

---

## Task 1: Write the 17 team-context tests

**Files:**
- Create: `server/test/integration/auth.teamContext.integration.test.js`

### Step 1: Create the test file with full content

Create `server/test/integration/auth.teamContext.integration.test.js`:

```javascript
// ============================================================================
// auth.controller — team context + profile wire-level tests
// ============================================================================
//
// Audit H12 (Sprint 3.3 part 3 — see 3.3a for sign-in, 3.3b for password mgmt).
// Covers the final 3 functions on the auth controller:
//   - completeOnboarding (3 modes × transaction integrity)
//   - getMe
//   - switchTeam
//
// Plus one bundled hardening: new switchTeamSchema + route validate() mount.
// Mirrors the gap that updateUnverifiedEmail had pre-3.3b.
//
// Prisma mock notes:
//   - Extends prior sprints with prisma.team.* and prisma.teamMembership.*
//   - $transaction passes a `tx` namespace whose methods are the SAME
//     vi.fn() instances as the top-level prisma.X — assertions can read
//     from either side. The controller's `pendingTeamData = { id: ... }`
//     capture-from-inside-tx pattern works because tx.team.create returns
//     an object with a generated `id` field.
//   - The findUniqueReturns array supports MIXED user/team lookups via
//     two separate arrays (state.userFindUniqueReturns and
//     state.teamFindUniqueReturns), each consumed by call order.
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

// ── Hoisted state ────────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  jwtGenerateCalls: [],
  // user.findUnique recorders (call-order returns)
  userFindUniqueCalls: [],
  userFindUniqueReturns: [],
  userFindUniqueCallNumber: 0,
  // user.update recorder
  userUpdateCalls: [],
  // team.create recorder (incremented id per call so the controller's
  // `personalTeam.id` reference works)
  teamCreateCalls: [],
  teamCreateNextId: 0,
  // team.findUnique recorder + returns
  teamFindUniqueCalls: [],
  teamFindUniqueReturns: [],
  teamFindUniqueCallNumber: 0,
  // teamMembership recorders
  teamMembershipCreateCalls: [],
  teamMembershipCreateManyCalls: [],
  teamMembershipFindUniqueCalls: [],
  teamMembershipFindUniqueReturn: null,
  // For buildUserResponse: returns the rich user shape on the
  // second user.findUnique call (with select.memberships set).
  buildUserResponseResult: null,
}));

// ── Module mocks ─────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (p) => `HASHED:${p}`),
    compare: vi.fn(async () => true),
  },
}));

vi.mock("../../src/services/email.service.js", () => ({
  sendVerificationEmail: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
}));

vi.mock("../../src/lib/jwt.js", () => ({
  generateToken: vi.fn((user) => {
    state.jwtGenerateCalls.push(user);
    return "test_jwt_token";
  }),
  verifyToken: vi.fn(() => null),
}));

// authenticate stub: same shape as Sprint 3.3b — mirrors real middleware.
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

// Prisma mock — extended with team + teamMembership + $transaction.
vi.mock("../../src/lib/prisma.js", () => {
  // Hoisted vi.fn() instances so tx.X === prisma.X.
  const userFindUnique = vi.fn(async (args) => {
    state.userFindUniqueCallNumber++;
    const isBuildUserShape = !!args?.select?.memberships;
    state.userFindUniqueCalls.push({
      args,
      callNumber: state.userFindUniqueCallNumber,
      isBuildUserShape,
    });
    if (isBuildUserShape) {
      return state.buildUserResponseResult;
    }
    const idx = state.userFindUniqueCallNumber - 1;
    // Note: buildUserResponse call also increments the counter, but it
    // returns BEFORE consulting findUniqueReturns. The counter advances
    // for both shapes — tests should set returns for the controller's
    // direct calls only (not the buildUserResponse second call).
    if (idx >= state.userFindUniqueReturns.length) {
      throw new Error(
        `auth.teamContext.integration.test.js: user.findUnique call #${state.userFindUniqueCallNumber} ` +
          `(non-buildUserResponse) has no fixture. Add an entry to state.userFindUniqueReturns. ` +
          `WHERE: ${JSON.stringify(args?.where)}`,
      );
    }
    return state.userFindUniqueReturns[idx];
  });

  const userUpdate = vi.fn(async (args) => {
    state.userUpdateCalls.push(args);
    return { id: args.where.id, ...args.data };
  });

  const teamCreate = vi.fn(async (args) => {
    state.teamCreateNextId++;
    const created = { id: `team_${state.teamCreateNextId}`, ...args.data };
    state.teamCreateCalls.push({ args, returned: created });
    return created;
  });

  const teamFindUnique = vi.fn(async (args) => {
    state.teamFindUniqueCallNumber++;
    state.teamFindUniqueCalls.push({
      args,
      callNumber: state.teamFindUniqueCallNumber,
    });
    const idx = state.teamFindUniqueCallNumber - 1;
    if (idx >= state.teamFindUniqueReturns.length) {
      throw new Error(
        `auth.teamContext.integration.test.js: team.findUnique call #${state.teamFindUniqueCallNumber} ` +
          `has no fixture. Add an entry to state.teamFindUniqueReturns. ` +
          `WHERE: ${JSON.stringify(args?.where)}`,
      );
    }
    return state.teamFindUniqueReturns[idx];
  });

  const teamMembershipCreate = vi.fn(async (args) => {
    state.teamMembershipCreateCalls.push(args);
    return { id: "membership_new", ...args.data };
  });

  const teamMembershipCreateMany = vi.fn(async (args) => {
    state.teamMembershipCreateManyCalls.push(args);
    return { count: args.data?.length || 0 };
  });

  const teamMembershipFindUnique = vi.fn(async (args) => {
    state.teamMembershipFindUniqueCalls.push(args);
    return state.teamMembershipFindUniqueReturn;
  });

  return {
    default: {
      user: { findUnique: userFindUnique, update: userUpdate },
      team: { create: teamCreate, findUnique: teamFindUnique },
      teamMembership: {
        create: teamMembershipCreate,
        createMany: teamMembershipCreateMany,
        findUnique: teamMembershipFindUnique,
      },
      $transaction: vi.fn(async (fn) => {
        // Share fn instances so tests can assert from either side.
        const tx = {
          user: { findUnique: userFindUnique, update: userUpdate },
          team: { create: teamCreate, findUnique: teamFindUnique },
          teamMembership: {
            create: teamMembershipCreate,
            createMany: teamMembershipCreateMany,
            findUnique: teamMembershipFindUnique,
          },
        };
        return await fn(tx);
      }),
    },
  };
});

import authRouter from "../../src/routes/auth.routes.js";
import { buildTestApp, bootApp } from "./_appFactory.js";

// ── Test harness ─────────────────────────────────────────────────────
let server;

const authedUser = {
  id: "user_authed_1",
  globalRole: "USER",
  currentTeamId: null,
  teamRole: null,
};

const authedHeaders = {
  "X-Test-User": JSON.stringify(authedUser),
};

beforeAll(async () => {
  const app = buildTestApp({ prefix: "/api/auth", router: authRouter });
  server = await bootApp(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  state.jwtGenerateCalls.length = 0;
  state.userFindUniqueCalls.length = 0;
  state.userFindUniqueReturns = [];
  state.userFindUniqueCallNumber = 0;
  state.userUpdateCalls.length = 0;
  state.teamCreateCalls.length = 0;
  state.teamCreateNextId = 0;
  state.teamFindUniqueCalls.length = 0;
  state.teamFindUniqueReturns = [];
  state.teamFindUniqueCallNumber = 0;
  state.teamMembershipCreateCalls.length = 0;
  state.teamMembershipCreateManyCalls.length = 0;
  state.teamMembershipFindUniqueCalls.length = 0;
  state.teamMembershipFindUniqueReturn = null;
  state.buildUserResponseResult = null;
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

async function get(path, headers = {}) {
  const res = await fetch(server.url + path, {
    method: "GET",
    headers: { ...headers },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
}

function makeFullUser({ id = "user_authed_1" } = {}) {
  return {
    id,
    email: "alice@example.com",
    name: "Alice",
    avatarUrl: null,
    globalRole: "USER",
    currentTeamId: "team_1",
    teamRole: "TEAM_ADMIN",
    personalTeamId: "team_1",
    onboardingComplete: true,
    mustChangePassword: false,
    isVerified: true,
    targetCompany: null,
    interviewDate: null,
    preferredLanguage: "PYTHON",
    streak: 0,
    lastSolvedAt: null,
    activityStatus: "ACTIVE",
    aiProblemConfig: null,
    createdAt: new Date(),
    currentTeam: { id: "team_1", name: "Alice", isPersonal: true, status: "ACTIVE" },
    personalTeam: { id: "team_1", name: "Alice" },
    memberships: [
      {
        role: "TEAM_ADMIN",
        joinedAt: new Date(),
        team: { id: "team_1", name: "Alice", isPersonal: true, status: "ACTIVE" },
      },
    ],
  };
}

// ── COMPLETE ONBOARDING ──────────────────────────────────────────────
describe("POST /auth/onboarding", () => {
  describe("mode: individual", () => {
    it("creates personalTeam + updates user + creates membership in a transaction", async () => {
      // First findUnique: controller's pre-check (id, name, onboardingComplete)
      state.userFindUniqueReturns = [
        { id: "user_authed_1", name: "Alice", onboardingComplete: false },
      ];
      // Second findUnique (buildUserResponse) returns the full shape
      state.buildUserResponseResult = makeFullUser();

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "individual" },
        authedHeaders,
      );

      expect(status).toBe(200);
      expect(body?.data?.token).toBe("test_jwt_token");
      expect(body?.data?.user?.id).toBe("user_authed_1");

      // team.create called once with personalTeam payload
      expect(state.teamCreateCalls).toHaveLength(1);
      expect(state.teamCreateCalls[0].args.data).toMatchObject({
        name: "Alice's Space",
        isPersonal: true,
        status: "ACTIVE",
        createdById: "user_authed_1",
        maxMembers: 1,
      });

      // user.update sets personalTeamId + currentTeamId + onboardingComplete
      const onboardUpdate = state.userUpdateCalls.find(
        (c) => c.data?.onboardingComplete === true,
      );
      expect(onboardUpdate).toBeDefined();
      expect(onboardUpdate.data.personalTeamId).toBe("team_1");
      expect(onboardUpdate.data.currentTeamId).toBe("team_1");
      expect(onboardUpdate.data.teamRole).toBe("TEAM_ADMIN");

      // teamMembership.create called with personalTeam role TEAM_ADMIN
      expect(state.teamMembershipCreateCalls).toHaveLength(1);
      expect(state.teamMembershipCreateCalls[0].data).toMatchObject({
        userId: "user_authed_1",
        teamId: "team_1",
        role: "TEAM_ADMIN",
        isActive: true,
      });

      // generateToken called with full user (memberships present)
      expect(state.jwtGenerateCalls).toHaveLength(1);
      expect(state.jwtGenerateCalls[0].memberships).toHaveLength(1);
    });
  });

  describe("mode: team — join existing team", () => {
    it("joins an existing team, creates personalTeam and TWO memberships", async () => {
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
      state.buildUserResponseResult = makeFullUser({ id: "user_authed_1" });

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "team", joinCode: "ABCDEF" },
        authedHeaders,
      );

      expect(status).toBe(200);
      expect(body?.data?.team).toMatchObject({ id: "team_real_1", name: "Acme" });

      // team.create called ONCE (personal team only — the real team already exists)
      expect(state.teamCreateCalls).toHaveLength(1);
      expect(state.teamCreateCalls[0].args.data.isPersonal).toBe(true);

      // user.update: currentTeamId points to the real team (NOT personal)
      const onboardUpdate = state.userUpdateCalls.find(
        (c) => c.data?.onboardingComplete === true,
      );
      expect(onboardUpdate.data.currentTeamId).toBe("team_real_1");
      expect(onboardUpdate.data.teamRole).toBe("MEMBER");

      // teamMembership.createMany called once with TWO records
      expect(state.teamMembershipCreateManyCalls).toHaveLength(1);
      expect(state.teamMembershipCreateManyCalls[0].data).toHaveLength(2);
      expect(state.teamMembershipCreateManyCalls[0].data.map((d) => d.teamId).sort()).toEqual(
        ["team_1", "team_real_1"].sort(),
      );
      expect(state.teamMembershipCreateManyCalls[0].skipDuplicates).toBe(true);
    });

    it("returns 404 for an invalid join code", async () => {
      state.userFindUniqueReturns = [
        { id: "user_authed_1", name: "Bob", onboardingComplete: false },
      ];
      state.teamFindUniqueReturns = [null];

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "team", joinCode: "INVALI" },
        authedHeaders,
      );

      expect(status).toBe(404);
      expect(body?.error?.message).toMatch(/invalid join code/i);
      expect(state.teamCreateCalls).toHaveLength(0);
      expect(state.teamMembershipCreateManyCalls).toHaveLength(0);
    });

    it("returns 400 when the joined team is not ACTIVE", async () => {
      state.userFindUniqueReturns = [
        { id: "user_authed_1", name: "Bob", onboardingComplete: false },
      ];
      state.teamFindUniqueReturns = [
        {
          id: "team_pending_1",
          name: "Pending Team",
          status: "PENDING",
          maxMembers: 50,
          createdById: "user_other",
          _count: { currentMembers: 0 },
        },
      ];

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "team", joinCode: "ABCDEF" },
        authedHeaders,
      );

      expect(status).toBe(400);
      expect(body?.error?.message).toMatch(/not currently accepting members/i);
      expect(state.teamCreateCalls).toHaveLength(0);
    });
  });

  describe("mode: team — create new team", () => {
    it("creates personalTeam + new team in PENDING status + one membership", async () => {
      state.userFindUniqueReturns = [
        { id: "user_authed_1", name: "Carol", onboardingComplete: false },
      ];
      state.buildUserResponseResult = makeFullUser({ id: "user_authed_1" });

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "team", teamName: "New Team" },
        authedHeaders,
      );

      expect(status).toBe(200);
      expect(body?.data?.pendingTeam).toMatchObject({
        id: "team_2", // second team.create returns team_2
        name: "New Team",
        status: "PENDING",
      });

      // team.create called TWICE — first personal, then new (PENDING)
      expect(state.teamCreateCalls).toHaveLength(2);
      expect(state.teamCreateCalls[0].args.data.isPersonal).toBe(true);
      expect(state.teamCreateCalls[1].args.data).toMatchObject({
        name: "New Team",
        status: "PENDING",
      });

      // user.update: currentTeamId points to personalTeam (NOT new team — pending)
      const onboardUpdate = state.userUpdateCalls.find(
        (c) => c.data?.onboardingComplete === true,
      );
      expect(onboardUpdate.data.currentTeamId).toBe("team_1");
      expect(onboardUpdate.data.teamRole).toBe("TEAM_ADMIN");

      // teamMembership.create called ONCE — personal only
      // (membership for the new team is created when SuperAdmin approves it)
      expect(state.teamMembershipCreateCalls).toHaveLength(1);
      expect(state.teamMembershipCreateCalls[0].data.teamId).toBe("team_1");
    });
  });

  describe("pre-check failures", () => {
    it("returns 400 when onboarding is already complete", async () => {
      state.userFindUniqueReturns = [
        { id: "user_authed_1", name: "Alice", onboardingComplete: true },
      ];

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "individual" },
        authedHeaders,
      );

      expect(status).toBe(400);
      expect(body?.error?.message).toMatch(/already completed/i);
      expect(state.teamCreateCalls).toHaveLength(0);
    });

    it("returns 404 when the authed user no longer exists", async () => {
      state.userFindUniqueReturns = [null];

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "individual" },
        authedHeaders,
      );

      expect(status).toBe(404);
      expect(body?.error?.message).toMatch(/user not found/i);
    });
  });

  describe("invalid mode-config combinations", () => {
    it("returns 400 when joined team is full", async () => {
      state.userFindUniqueReturns = [
        { id: "user_authed_1", name: "Bob", onboardingComplete: false },
      ];
      state.teamFindUniqueReturns = [
        {
          id: "team_full_1",
          name: "Full Team",
          status: "ACTIVE",
          maxMembers: 5,
          createdById: "user_other",
          _count: { currentMembers: 5 },
        },
      ];

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "team", joinCode: "ABCDEF" },
        authedHeaders,
      );

      expect(status).toBe(400);
      expect(body?.error?.message).toMatch(/team is full/i);
      expect(state.teamCreateCalls).toHaveLength(0);
    });

    it("returns 400 when mode=team but neither joinCode nor teamName provided", async () => {
      state.userFindUniqueReturns = [
        { id: "user_authed_1", name: "Alice", onboardingComplete: false },
      ];

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "team" }, // neither joinCode nor teamName
        authedHeaders,
      );

      expect(status).toBe(400);
      expect(body?.error?.message).toMatch(/invalid onboarding configuration/i);
      expect(state.teamCreateCalls).toHaveLength(0);
    });
  });
});

// ── GET ME ───────────────────────────────────────────────────────────
describe("GET /auth/me", () => {
  it("returns the full user profile with memberships", async () => {
    state.buildUserResponseResult = makeFullUser();

    const { status, body } = await get("/api/auth/me", authedHeaders);

    expect(status).toBe(200);
    expect(body?.data?.user?.id).toBe("user_authed_1");
    expect(body?.data?.user?.memberships).toHaveLength(1);
    // Internal buildUserResponse call should be the only findUnique
    // (uses the build-shape select).
    expect(
      state.userFindUniqueCalls.some((c) => c.isBuildUserShape),
    ).toBe(true);
  });

  it("returns 404 when the authed user no longer exists", async () => {
    state.buildUserResponseResult = null;

    const { status, body } = await get("/api/auth/me", authedHeaders);

    expect(status).toBe(404);
    expect(body?.error?.message).toMatch(/user not found/i);
  });
});

// ── SWITCH TEAM ──────────────────────────────────────────────────────
describe("POST /auth/switch-team", () => {
  it("switches the user's current team context and issues a new JWT", async () => {
    state.teamFindUniqueReturns = [
      { id: "team_target_1", name: "Target Team", status: "ACTIVE", isPersonal: false },
    ];
    state.teamMembershipFindUniqueReturn = { role: "MEMBER", isActive: true };
    state.buildUserResponseResult = makeFullUser();

    const { status, body } = await post(
      "/api/auth/switch-team",
      { teamId: "team_target_1" },
      authedHeaders,
    );

    expect(status).toBe(200);
    expect(body?.data?.token).toBe("test_jwt_token");
    expect(body?.data?.message).toMatch(/switched to target team/i);

    // user.update called with the new team context.
    const switchUpdate = state.userUpdateCalls.find(
      (c) => c.data?.currentTeamId === "team_target_1",
    );
    expect(switchUpdate).toBeDefined();
    expect(switchUpdate.data.teamRole).toBe("MEMBER");

    // generateToken called with full user (memberships present)
    expect(state.jwtGenerateCalls).toHaveLength(1);
    expect(state.jwtGenerateCalls[0].memberships).toHaveLength(1);
  });

  it("returns 404 when the target team does not exist", async () => {
    state.teamFindUniqueReturns = [null];

    const { status, body } = await post(
      "/api/auth/switch-team",
      { teamId: "team_nonexistent_1" },
      authedHeaders,
    );

    expect(status).toBe(404);
    expect(body?.error?.message).toMatch(/team not found/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });

  it("returns 400 when the target team is not ACTIVE", async () => {
    state.teamFindUniqueReturns = [
      { id: "team_pending_1", name: "Pending", status: "PENDING", isPersonal: false },
    ];

    const { status, body } = await post(
      "/api/auth/switch-team",
      { teamId: "team_pending_1" },
      authedHeaders,
    );

    expect(status).toBe(400);
    expect(body?.error?.message).toMatch(/team is not active/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });

  it("returns 403 when the user has no membership in the target team", async () => {
    state.teamFindUniqueReturns = [
      { id: "team_target_1", name: "Target", status: "ACTIVE", isPersonal: false },
    ];
    state.teamMembershipFindUniqueReturn = null;

    const { status, body } = await post(
      "/api/auth/switch-team",
      { teamId: "team_target_1" },
      authedHeaders,
    );

    expect(status).toBe(403);
    expect(body?.error?.message).toMatch(/not a member of this team/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });

  it("returns 403 when the membership exists but is inactive", async () => {
    state.teamFindUniqueReturns = [
      { id: "team_target_1", name: "Target", status: "ACTIVE", isPersonal: false },
    ];
    state.teamMembershipFindUniqueReturn = { role: "MEMBER", isActive: false };

    const { status, body } = await post(
      "/api/auth/switch-team",
      { teamId: "team_target_1" },
      authedHeaders,
    );

    expect(status).toBe(403);
    expect(body?.error?.message).toMatch(/not a member of this team/i);
    expect(state.userUpdateCalls).toHaveLength(0);
  });
});

// ── SWITCHTEAM ZOD VALIDATION GAP (RED-first) ─────────────────────────
describe("POST /auth/switch-team — Zod validation", () => {
  it("returns 400 VALIDATION_ERROR when teamId is missing", async () => {
    const { status, body } = await post(
      "/api/auth/switch-team",
      {}, // missing teamId
      authedHeaders,
    );

    expect(status).toBe(400);
    expect(body?.error?.code).toBe("VALIDATION_ERROR");
    // Controller / team lookups must NOT have been reached.
    expect(state.teamFindUniqueCalls).toHaveLength(0);
    expect(state.userUpdateCalls).toHaveLength(0);
  });
});
```

### Step 2: Run the test file against UNMODIFIED routes — confirm 1 RED failure, 16 GREEN

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.teamContext.integration.test.js 2>&1 | tail -50
```

**Expected RED behavior**:

| Describe block | Outcome against unmodified code |
|---|---|
| completeOnboarding individual mode (1) | PASS — regression guard |
| completeOnboarding team-join (3 tests) | all PASS — regression guards |
| completeOnboarding team-create (1) | PASS |
| completeOnboarding pre-check failures (2) | all PASS |
| completeOnboarding invalid combinations (2) | all PASS |
| getMe (2) | all PASS |
| switchTeam happy/error paths (5) | all PASS |
| **switchTeam Zod validation (1)** | **FAIL** — pre-fix code returns ad-hoc 400 "Team ID is required." without `error.code === "VALIDATION_ERROR"`. |

Total expected RED failures: **1**. Total expected PASS: **16**. Document the actual Zod failure mode in your report. It's the security receipt.

**CRITICAL**: if ANY of the 16 regression tests fail, the test setup has a defect — fix it BEFORE proceeding to Task 2.

### Step 3: DO NOT commit yet — move to Task 2

---

## Task 2: Apply the `switchTeamSchema` hardening

**Files:**
- Modify: `server/src/schemas/auth.schema.js`
- Modify: `server/src/routes/auth.routes.js`

### Step 1: Add `switchTeamSchema` to `auth.schema.js`

Open `server/src/schemas/auth.schema.js`. Find the `updateUnverifiedEmailSchema` export (around line 117-120) — recently added in Sprint 3.3b. Add a new export immediately after it (so similar input-validation schemas are co-located):

```javascript
// Team context switch — requires only the target teamId. Both the
// existence check and membership check live in the controller.
export const switchTeamSchema = z.object({
  teamId: z
    .string({ required_error: "Team ID is required." })
    .min(1, "Team ID is required."),
});
```

### Step 2: Mount `validate(switchTeamSchema)` on the `/switch-team` route

Open `server/src/routes/auth.routes.js`. Find the schema imports near the top (lines 33-43 area). Add `switchTeamSchema` to the import list. Today the imports look like:

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

Add `switchTeamSchema` to the list (match the file's existing ordering — likely alphabetical-by-group or grouped semantically; place it after `onboardingSchema` since they're related auth-flow schemas):

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
  switchTeamSchema,
  updateProfileSchema,
} from "../schemas/auth.schema.js";
```

Find line ~395:

```javascript
router.post("/switch-team", authenticate, switchTeam);
```

Replace with:

```javascript
router.post("/switch-team", authenticate, validate(switchTeamSchema), switchTeam);
```

### Step 3: Run the test file alone — expect 17/17 GREEN

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/integration/auth.teamContext.integration.test.js 2>&1 | tail -20
```

Expected: 17 tests pass.

If the Zod test still fails, check the schema export name + route import match the EXACT names used in the file.

### Step 4: Run the FULL server suite — expect 1140 tests pass

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: **1140 tests passing** (1123 baseline + 17 new). 59 test files.

If any OTHER test file regresses, read the failure carefully. The schema and route addition are pure additions — they should not break existing tests. The only realistic regression is if some existing test was depending on `/switch-team` accepting malformed bodies and now gets 400 with a different message. Update such a test to match the new response shape (with a sprint-citing comment).

### Step 5: Lint

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -5
```

Expected: 0 errors / 0 warnings.

### Step 6: Self-review the diff before committing

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff --stat
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/schemas/auth.schema.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/routes/auth.routes.js
```

Confirm:
- `auth.schema.js`: one new export, no other changes
- `auth.routes.js`: import addition + line ~395 `validate()` insertion, no other changes
- New test file `auth.teamContext.integration.test.js` is present (via `git status`)

### Step 7: DO NOT commit yet — manual smoke (Task 3) first

---

## Task 3: Manual smoke (3 endpoints + new Zod schema verification)

### Step 1: Start the dev server

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && (npm run dev > /tmp/sprint33c-dev.log 2>&1 &) && sleep 6 && tail -5 /tmp/sprint33c-dev.log
```

Wait until `Server running on port 5000` appears.

### Step 2: Verify the three endpoints respond as expected

```bash
# onboarding — missing auth → 401 (authenticate)
curl -sS -o /dev/null -w "onboarding=%{http_code}\n" -X POST http://localhost:5000/api/v1/auth/onboarding -H "Content-Type: application/json" -d '{}'

# me — missing auth → 401 (authenticate)
curl -sS -o /dev/null -w "me=%{http_code}\n" -X GET http://localhost:5000/api/v1/auth/me

# switch-team — missing auth → 401 (authenticate)
curl -sS -o /dev/null -w "switch=%{http_code}\n" -X POST http://localhost:5000/api/v1/auth/switch-team -H "Content-Type: application/json" -d '{}'
```

Expected: all three return 401 (no auth header → authenticate middleware rejects before any schema or controller runs).

### Step 3: Confirm the new Zod schema is in production effect by bypassing the auth check via a dev account

This sub-step requires a valid JWT for an existing user. If you don't have one available, SKIP this sub-step and document — the unit test (`POST /auth/switch-team — Zod validation`) covers it.

If you DO have a JWT (e.g. from a recent dev login):

```bash
# With a valid JWT, missing teamId in body → expect 400 VALIDATION_ERROR
curl -sS -X POST http://localhost:5000/api/v1/auth/switch-team \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_JWT_HERE>" \
  -d '{}'
```

Expected: body contains `"code":"VALIDATION_ERROR"`. Proves the new Zod schema is in production effect.

### Step 4: Stop the dev server

```bash
pkill -f "nodemon src/index.js" 2>&1 ; sleep 1 ; pgrep -fl "node src/index.js" 2>&1 || echo "stopped"
```

---

## Task 4: Commit + final gates + push + FF-merge

### Step 1: Stage and commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/schemas/auth.schema.js server/src/routes/auth.routes.js server/test/integration/auth.teamContext.integration.test.js && git status
```

Verify only those 3 files staged (plus pre-existing untracked items left out).

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git commit -m "Add team-context test foundation and harden switchTeam input validation"
```

Single-line subject. NO Co-Authored-By trailer.

### Step 2: Self-review the commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD --stat
```

Confirm exactly 3 files modified/new (no extras).

### Step 3: Server gates

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3 && echo "---" && npx prisma migrate status 2>&1 | grep -i "up to date\|drift\|error" | tail -3
```

Expected:
- Lint: 0/0
- Tests: 1140 passed (59 files)
- Migrate status: "Database schema is up to date!"

### Step 4: Client gates (sanity, no client changes)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build 2>&1 | tail -5
```

Expected: 0 warnings, successful build.

### Step 5: Push the feature branch

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/test-auth-team-context --no-verify
```

### Step 6: FF-merge to main and push

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/test-auth-team-context

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/test-auth-team-context
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 7: Update the roadmap status tracker

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 3.3c row:

```markdown
| 3.3c | Team context & profile test foundation (H12 part 3 — completeOnboarding / getMe / switchTeam) | queued | — | — |
```

Replace with:

```markdown
| 3.3c | Team context & profile test foundation (H12 part 3 — completeOnboarding / getMe / switchTeam + new switchTeamSchema) | ✅ shipped | [`2026-06-23-test-auth-team-context-design.md`](../specs/2026-06-23-test-auth-team-context-design.md) | 2026-06-23 |
```

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 3.3c (team context & profile test foundation) shipped; H12 complete"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 8: Post-deploy verification

Railway autodeploys main. After deploy completes:

- [ ] Tail Railway server logs. Confirm `/auth/switch-team` requests with malformed bodies (e.g. missing teamId) now return 400 with `VALIDATION_ERROR`.
- [ ] No 500 / latency regressions on `/auth/onboarding`, `/auth/me`, or `/auth/switch-team`.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| completeOnboarding individual mode (1 test) | Task 1 Step 1 (COMPLETE ONBOARDING / individual block) |
| completeOnboarding team-join happy (1) | Task 1 Step 1 (team-join block, first test) |
| completeOnboarding team-join failures: invalid joinCode, inactive team (2) | Task 1 Step 1 (team-join block, tests 2+3) |
| completeOnboarding team-create happy (1) | Task 1 Step 1 (team-create block) |
| completeOnboarding pre-check failures: already-onboarded, user-not-found (2) | Task 1 Step 1 (pre-check failures block) |
| completeOnboarding invalid combinations: team-full, neither code/name (2) | Task 1 Step 1 (invalid combinations block) |
| getMe happy + 404 (2) | Task 1 Step 1 (GET ME block) |
| switchTeam happy + 4 failure modes (5) | Task 1 Step 1 (SWITCH TEAM block) |
| switchTeamSchema Zod test (RED-first) (1) | Task 1 Step 1 (last describe block) |
| New switchTeamSchema | Task 2 Step 1 |
| Route validate() mount | Task 2 Step 2 |
| Single commit | Task 4 Step 1 |
| Final gates + push + FF-merge + roadmap | Task 4 Steps 3-7 |

**Type / signature consistency:**

- `state` recorder shape consistent with 3.3a/3.3b patterns. `userFindUniqueReturns` / `teamFindUniqueReturns` are SEPARATE arrays consumed by call order on each.
- `$transaction` mock shares vi.fn() instances between `prisma.X` and `tx.X` namespaces. Assertions can read from either side.
- `tx.team.create` returns `{ id: "team_${N}", ...args.data }` — the controller's `personalTeam.id` reference uses this. Tests assert `team_1` for first call (personal), `team_2` for second (new team in team-create mode).
- `state.findUniqueCallNumber` reset in `beforeEach` (per Sprint 3.3a's pattern lesson).
- Mock targets: `bcryptjs` (defensive stub even though not directly called here), `email.service.js`, `jwt.js`, `auth.middleware.js`, `prisma.js` — same as 3.3a/3.3b.

**Placeholder scan:** No "TBD" / "TODO" / "fill in details." Every code step has the complete code block. The Manual Smoke Step 3 (Authorization Bearer JWT check) is explicitly optional and documents how to skip — that's not a placeholder.

**Risk floor:** Lowest of the auth-test track. Pure test additions + 1 small schema-addition that mirrors Sprint 3.3b's exact pattern. After this lands, all 11 functions on the auth controller have test coverage. Sprint 3.3 complete.

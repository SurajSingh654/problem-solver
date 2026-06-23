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
    // The counter ALWAYS increments — including for the buildUserResponse
    // shape (where args.select.memberships is set). However, only NON-
    // buildUserShape calls consume from `userFindUniqueReturns`:
    // buildUserShape calls return state.buildUserResponseResult and exit
    // before this line. To size `userFindUniqueReturns` correctly, count
    // only the controller's direct findUnique calls (NOT the implicit
    // buildUserResponse second call). If you exceed that count, the
    // sentinel throw below fires.
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
      const personalTeamId = state.teamCreateCalls[0].returned.id;
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
      expect(onboardUpdate.data.personalTeamId).toBe(personalTeamId);
      expect(onboardUpdate.data.currentTeamId).toBe(personalTeamId);
      expect(onboardUpdate.data.teamRole).toBe("TEAM_ADMIN");

      // teamMembership.create called with personalTeam role TEAM_ADMIN
      expect(state.teamMembershipCreateCalls).toHaveLength(1);
      expect(state.teamMembershipCreateCalls[0].data).toMatchObject({
        userId: "user_authed_1",
        teamId: personalTeamId,
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
      const personalTeamId = state.teamCreateCalls[0].returned.id;
      expect(state.teamMembershipCreateManyCalls[0].data).toHaveLength(2);
      expect(state.teamMembershipCreateManyCalls[0].data.map((d) => d.teamId).sort()).toEqual(
        [personalTeamId, "team_real_1"].sort(),
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
      const personalTeamId = state.teamCreateCalls[0].returned.id; // first team.create = personal
      const newTeamId = state.teamCreateCalls[1].returned.id;       // second team.create = new PENDING
      expect(body?.data?.pendingTeam).toMatchObject({
        id: newTeamId,
        name: "New Team",
        status: "PENDING",
      });

      // team.create called TWICE — first personal, then new (PENDING)
      expect(state.teamCreateCalls).toHaveLength(2);
      expect(state.teamCreateCalls[0].args.data.isPersonal).toBe(true);
      expect(state.teamCreateCalls[1].args.data).toMatchObject({
        name: "New Team",
        status: "PENDING",
        maxMembers: expect.any(Number), // controller uses TEAM_MAX_MEMBERS_DEFAULT
      });

      // user.update: currentTeamId points to personalTeam (NOT new team — pending)
      const onboardUpdate = state.userUpdateCalls.find(
        (c) => c.data?.onboardingComplete === true,
      );
      expect(onboardUpdate.data.currentTeamId).toBe(personalTeamId);
      expect(onboardUpdate.data.teamRole).toBe("TEAM_ADMIN");

      // teamMembership.create called ONCE — personal only
      // (membership for the new team is created when SuperAdmin approves it)
      expect(state.teamMembershipCreateCalls).toHaveLength(1);
      expect(state.teamMembershipCreateCalls[0].data.teamId).toBe(personalTeamId);
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

    it("returns 400 VALIDATION_ERROR when mode=team but neither joinCode nor teamName provided", async () => {
      // No userFindUniqueReturns needed — Zod's onboardingSchema.refine()
      // rejects this combination before the controller is reached (see
      // auth.schema.js:153-166). The original spec/plan asserted the
      // controller's line 564 fallback ("Invalid onboarding configuration.")
      // but that branch is unreachable: Zod returns VALIDATION_ERROR first.
      // We assert the actual contract (Zod rejection, no DB writes).

      const { status, body } = await post(
        "/api/auth/onboarding",
        { mode: "team" }, // neither joinCode nor teamName
        authedHeaders,
      );

      expect(status).toBe(400);
      expect(body?.error?.code).toBe("VALIDATION_ERROR");
      expect(state.teamCreateCalls).toHaveLength(0);
      // Controller never ran — no findUnique calls either.
      expect(state.userFindUniqueCalls).toHaveLength(0);
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

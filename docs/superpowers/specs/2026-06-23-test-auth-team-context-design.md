# Team Context & Profile Test Foundation — Design Spec

**Date:** 2026-06-23
**Sprint:** 3.3c (per `2026-06-20-refactor-redesign-sprint.md`, final carve of Sprint 3.3)
**Branch:** `feat/test-auth-team-context`
**Layers on:** main, post Sprint 3.3b (`ba04b19`)
**Feature flag:** None — test foundation + one input-validation hardening

---

## Problem

Sprint 1 audit finding H12 (zero tests on `auth.controller.js`) concludes with this sub-sprint. Sprint 3.3a covered sign-in flow; Sprint 3.3b covered password & credential management. Three functions remain:

- `completeOnboarding` (line 337, 232 LoC) — transaction-heavy: three modes (individual / team-join-by-code / team-create-pending). The audit's specific H12 failure scenario ("a buggy `register()` could fail to create the personal-team `TeamMembership` row inside the transaction → user can't access anything") is misattributed in the audit text — `register` doesn't create memberships; `completeOnboarding` does. This sprint addresses the audit's *actual* failure mode.

- `getMe` (line 763, 14 LoC) — simple profile fetch via `buildUserResponse`.

- `switchTeam` (line 781, 60 LoC) — change current team context, re-issue JWT. Pre-checks team existence + active status + user's TeamMembership.

Reading the three functions surfaces **one** issue to fix in this sprint:

1. **`switchTeam` route is unvalidated** (`auth.routes.js:395`): `router.post("/switch-team", authenticate, switchTeam)` — no `validate(schema)` middleware, no `switchTeamSchema` in `auth.schema.js`. The controller does ad-hoc `if (!teamId)` check but no string/length validation. Same input-validation gap pattern as `updateUnverifiedEmail` had before Sprint 3.3b.

## Principle

Final test-foundation carve for the auth controller. After 3.3c lands, **all 11 exported functions** of `auth.controller.js` have wire-level integration test coverage. Sprint 3.3 (parts a/b/c combined) closes audit finding H12 in its entirety.

This sprint is **tightly scoped to the three functions + the one bundled schema-addition**. Latent issues that the test-writing exercise surfaces are NOT fixed here unless one-line cheap:

- `completeOnboarding` TOCTOU race on `user.onboardingComplete` pre-check (two concurrent requests can both create personal teams). Documented out-of-scope below — would need a CAS-pattern refactor analogous to Sprint 3.2.
- `switchTeam` not wrapped in `$transaction`. Acceptable.

## Scope

In scope:

- **New test file** `server/test/integration/auth.teamContext.integration.test.js` — wire-level integration tests via `_appFactory.js`. Mocks: Prisma (extended with `team` model, `teamMembership` model, `$transaction` wrapper), `bcryptjs` (not used by these functions but stubbed defensively), `jwt.js`, `auth.middleware.js` (header-driven req.user injection like Sprint 3.3b). Estimated 17 tests across 4 describe blocks.

- **`auth.schema.js` addition**: `switchTeamSchema`:
  ```javascript
  export const switchTeamSchema = z.object({
    teamId: z.string({ required_error: "Team ID is required." }).min(1),
  });
  ```

- **`auth.routes.js` modification**: import `switchTeamSchema`, mount `validate(switchTeamSchema)` on the route at line 395.

Out of scope:

- `completeOnboarding` TOCTOU race fix. The "attacker" is the user double-clicking the form (same user, no privilege escalation). End state: 1 user.personalTeamId (last write wins), 2 TeamMembership rows, 1 orphaned personal team. Data corruption but not exploitable. Out of scope — fix would require moving the `onboardingComplete: true` check INSIDE the `$transaction` with a `SELECT FOR UPDATE` on User. Carve as Sprint 3.3.d if a real complaint surfaces.
- `switchTeam` transaction wrap. Pre-checks + user.update + buildUserResponse not atomic. If buildUserResponse fails after a successful update, the user's context is changed but the response is an error; refresh fixes it. Acceptable.
- `completeOnboarding` team-create flow's TeamMembership creation for the new team (deferred to SuperAdmin approval per comment line 535). Out of scope — tests assert the documented current behavior.
- Sprint 3.4 (`email.service.js` test foundation, audit H13).
- Sprint 3.5 (`mcp/middleware/mcpAuth.js` revocation Redis upgrade, audit M23 — deferred to Phase 2).

## Architecture

```
server/test/integration/auth.teamContext.integration.test.js   [NEW]
  ├── module mocks: prisma (user/team/teamMembership + $transaction), bcryptjs, jwt, auth.middleware
  ├── helpers: postJson, getJson, authedHeaders
  ├── describe("POST /auth/onboarding")    [9 tests]
  ├── describe("GET /auth/me")             [2 tests]
  ├── describe("POST /auth/switch-team")   [5 tests]
  └── describe("switchTeamSchema validation gap (Zod)") [1 test]

server/src/schemas/auth.schema.js          [MODIFIED]
  └── Add switchTeamSchema export

server/src/routes/auth.routes.js           [MODIFIED]
  ├── import: add switchTeamSchema
  └── line 395: router.post("/switch-team", authenticate, validate(switchTeamSchema), switchTeam)
```

## Test plan — detail per describe block

### `completeOnboarding` (9 tests)

**Individual mode (1 test):**

1. **Happy path — individual mode** — POST `{ mode: "individual" }` → 200 with `{ message, token, user }`. Asserts inside the `$transaction`:
   - `tx.team.create` called once with `name: "Alice's Space"`, `isPersonal: true`, `status: "ACTIVE"`, `maxMembers: 1`, `createdById: userId`
   - `tx.user.update` called with `personalTeamId`, `currentTeamId: personalTeam.id`, `teamRole: "TEAM_ADMIN"`, `onboardingComplete: true`
   - `tx.teamMembership.create` called with `userId`, `teamId: personalTeam.id`, `role: "TEAM_ADMIN"`, `isActive: true`
   - `generateToken` called with the full user (memberships present)

**Team-join-by-code mode (3 tests):**

2. **Happy path — join existing team** — POST `{ mode: "team", joinCode: "ABC123" }`. Pre-check returns a valid team. Asserts:
   - `team.create` called once (personalTeam, NOT the joined team)
   - `tx.user.update` called with `currentTeamId: realTeam.id`, `teamRole: "MEMBER"`
   - `tx.teamMembership.createMany` called with 2-element data array: personalTeam (TEAM_ADMIN) + realTeam (MEMBER), `skipDuplicates: true`
   - Response includes `team: { id: realTeam.id, name: realTeam.name }`

3. **Invalid joinCode** — pre-check returns null → 404 "Invalid join code." `$transaction` NOT entered. `teamMembership.createMany` NOT called.

4. **Inactive team** — pre-check returns team with `status: "PENDING"` → 400 "This team is not currently accepting members." `$transaction` NOT entered.

**Team-create mode (1 test):**

5. **Happy path — create new team** — POST `{ mode: "team", teamName: "Acme" }`. Asserts:
   - `tx.team.create` called TWICE: once for personalTeam, once for newTeam (status: "PENDING")
   - `tx.user.update` called with `currentTeamId: personalTeam.id` (NOT newTeam — user practices in personal space until approval)
   - `tx.teamMembership.create` called ONCE (personalTeam only — per controller comment line 535)
   - Response includes `pendingTeam: { id, name: "Acme", status: "PENDING" }`

**Pre-check failures (2 tests):**

6. **Already onboarded** — `findUnique` returns user with `onboardingComplete: true` → 400 "Onboarding already completed." `$transaction` NOT entered.

7. **User not found** — `findUnique` returns null → 404 "User not found."

**Invalid mode-config combinations (2 tests):**

8. **Team-full case** — pre-check returns team with `_count.currentMembers >= maxMembers` → 400 "This team is full." `$transaction` NOT entered.

9. **Team mode without joinCode or teamName** — Zod allows `mode: "team"` to pass with neither field set (since both are `.optional()`). Controller falls through all three branches and reaches line 564: 400 "Invalid onboarding configuration."

### `getMe` (2 tests)

1. **Happy path** — authenticated user → 200 with `{ user: { id, email, name, memberships[], ... } }`. Asserts `buildUserResponse` called with `req.user.id`.

2. **User not found edge** — `findUnique` returns null → 404 "User not found."

### `switchTeam` (5 tests)

1. **Happy path** — authenticated user, team exists + active, user is member → 200 with `{ token, user }`. Asserts:
   - `prisma.user.update` called with `currentTeamId: target, teamRole: <from membership>`
   - `generateToken` called with FULL user (post-update, memberships present)

2. **Team not found** — `prisma.team.findUnique` returns null → 404 "Team not found." `prisma.user.update` NOT called.

3. **Team inactive** — team found with `status: "PENDING"` → 400 "This team is not active." `update` NOT called.

4. **User not a member** — `teamMembership.findUnique` returns null → 403 "You are not a member of this team." `update` NOT called.

5. **Membership exists but inactive** — `teamMembership.findUnique` returns `{ role, isActive: false }` → 403 "You are not a member of this team." `update` NOT called.

### `switchTeamSchema` validation gap (1 RED-first test)

POST `{}` (empty body) → 400 with `error.code === "VALIDATION_ERROR"`. Lookup calls (`teamFindUniqueCalls`) must be empty (Zod rejected before the controller).

## RED-first proofs

Against unmodified code:
- 1 test fails RED: `switchTeamSchema` validation — pre-fix code returns the controller's ad-hoc 400 "Team ID is required." with no `error.code === "VALIDATION_ERROR"`.

Other 16 tests are regression guards. Document the 1 RED failure as the security receipt.

## Production risk inventory

| Risk dimension | Status |
|---|---|
| Schema migration | None |
| Token / session invalidation | None |
| Behavior change | One: `switchTeam` malformed bodies now hit Zod before the controller. Today's ad-hoc check returns 400 with a different message; Zod returns 400 with `VALIDATION_ERROR` code and field-level details. Strict improvement. |
| In-flight requests | None |
| Rollback | `git revert` single commit |

## Backward compatibility

- API response shapes unchanged on happy paths.
- `switchTeam` malformed bodies: 400 status preserved; the response body shape changes from `{success:false,error:{message:"Team ID is required."}}` to `{success:false,error:{message:"Validation failed.",code:"VALIDATION_ERROR",details:[...]}}`. Clients that parse `error.message` see different text. Acceptable: matches the pattern Sprint 3.3b's `updateUnverifiedEmail` change established.

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | The Prisma mock's `$transaction` pattern is called out as needing shared-fn-instance pattern (tx.X uses the same vi.fn() as prisma.X). The test plan enumerates assertions per mode + per pre-check failure. The single RED-first test is precisely defined. |
| Scope | One new test file, one schema add, one route edit. Single commit. Sister sprints 3.4 (email) and 3.5 (MCP, deferred) explicitly carved. |
| Ambiguity | `$transaction` mock behavior (run fn with tx namespace; tx.X === prisma.X) pinned. `switchTeam` happy-path asserts `update.where.id === userId` AND `update.data.currentTeamId === target.id` — both specific. |
| Backward compat | No API/schema/flag changes that break clients. Response shape on the malformed-body path improves. |
| Adversarial review | The `completeOnboarding` test for team-create has the trickiest assertion: TWO `tx.team.create` calls in order (personal first, then real team — verify by inspecting the recorder array). If the controller's order ever flips, the test should catch it via the order check. |
| Risk floor | Lowest of the auth-test track. Pure test additions + 1 small schema-addition that mirrors Sprint 3.3b's pattern. Final H12 carve completes the auth-controller test foundation. |

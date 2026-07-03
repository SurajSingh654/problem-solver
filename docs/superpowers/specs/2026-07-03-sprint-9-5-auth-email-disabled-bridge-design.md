# Sprint 9.5 — Auth Email-Disabled Bridge — Design Spec

**Date:** 2026-07-03
**Sprint:** 9.5 (small pre-Sprint-10 hotfix; unblocks Binary Thinkers team onboarding without requiring Resend + domain setup)
**Branch:** `feat/auth-email-disabled-bridge`
**Layers on:** main, post Sprint 9 (`cb1f726`)
**Feature flag:** Yes — `AUTH_SKIP_EMAIL_VERIFICATION` (opt-in; default off)
**Review history:** 4-role panel runs pre-implementation per always-on rule (`feedback_multi_agent_review_before_code.md`)

---

## Problem

Users can register on ProbSolver production but cannot verify their email — `RESEND_API_KEY` is not configured on Railway, so `sendVerificationEmail()` silently no-ops (`email.service.js:37-44` returns `{simulated: true}` when `!EMAIL_ENABLED || !resend`). Verification codes exist only in the `verificationCode` DB column and are never surfaced. Login is blocked at `auth.controller.js:309` because `!isVerified`.

The user has an immediate operational need: onboard members of the **Binary Thinkers** team (closed-invite via WhatsApp/DM/Slack). Setting up Resend + a verified sender domain would take 30 min active work + 1-2 hours DNS propagation — too slow. The user has explicitly deferred Resend setup and requested a bridge.

### Two related gaps this sprint closes

**Gap 1 — Skip verification for closed-invite onboarding.** Binary Thinkers users receive the team joinCode privately from the team admin. Email verification adds friction with zero security benefit (the admin already knows and trusts each user). A feature-flagged bypass lets those users sign up and land in the team in ~60 seconds.

**Gap 2 — Log OTP codes to Railway when email is disabled.** Even with the bypass flag ON, password-reset and email-change flows still require OTP codes (those flows aren't behind the skip flag). When email is disabled, the codes today live only in the DB. Adding a `[AUTH:CODE_NOT_EMAILED]` warn log surfaces them to Railway logs where the admin can hand-deliver via out-of-band channel. This is self-remediating — the log fires ONLY when `!isEmailEnabled()`, so once Resend is configured, the logs auto-quiet.

### Failure model these fixes guard

- **Without Skip flag:** every new Binary Thinkers member is stuck at the verify-email screen. No path forward without ops involvement (SQL flip per user).
- **Without OTP-to-logs:** even when a user asks the admin for help resetting their password, the admin has no way to retrieve the code — it exists only in the DB, unreadable from Railway logs.

---

## Principle

**Minimal opt-in feature flags with strict blast-radius controls.** Both mechanisms are:
- **Off by default** — no behavior change without explicit env-var opt-in
- **Loudly warned at boot** — impossible to miss a "flag is on" state in Railway logs
- **Self-remediating** — the OTP-to-logs auto-disables when email is configured; the skip flag becomes a no-op the moment Resend is set up (since verification codes become deliverable again)
- **Tagged for grep** — `[AUTH:VERIFICATION_SKIPPED]`, `[AUTH:CODE_NOT_EMAILED]`, `[SECURITY WARN]` prefixes make log-search trivial
- **Backwards-compatible** — flipping the flag off later reverts to the current strict behavior for future users; existing pre-flag `isVerified: true` users are unaffected

---

## Scope

### In scope

**1. `AUTH_SKIP_EMAIL_VERIFICATION` env flag** in `server/src/config/env.js`.
- Default: `false`
- When `true`: register creates user with `isVerified: true` (skips code generation entirely); login skips the `!isVerified` check
- Ripples: `resendVerification` becomes a no-op success (nothing to verify); `verifyEmail` still works (defensive — if flag is later flipped off, users mid-flow can complete)

**2. `isEmailEnabled()` helper export** in `server/src/services/email.service.js`.
- Currently the value is available as `EMAIL_ENABLED` (a boolean derived from `!!RESEND_API_KEY`), but consuming it requires importing the env module directly. A named helper makes the check explicit and greppable in call sites.

**3. `[AUTH:CODE_NOT_EMAILED]` warn logs** at all 4 code-sending sites in `auth.controller.js`:
- `register` (L160) — verification code
- `resendVerification` (L274) — verification code (only reachable when skip flag OFF)
- `forgotPassword` (L664) — password reset code
- `updateUnverifiedEmail` (L953) — email-change verification code

Log format:
```
[AUTH:CODE_NOT_EMAILED] surface="<surface>" email="<recipient>" code="<code>" reason="RESEND_API_KEY not set — deliver manually via admin channel"
```

Only fires when `!isEmailEnabled()`. Auto-quiets when Resend is configured.

**4. Boot-time warnings** in `server/src/index.js`:
- If `!isEmailEnabled()`: `[SECURITY WARN] Email delivery disabled. Verification / reset codes will be logged to stdout. Set RESEND_API_KEY on Railway to enable email.`
- If `AUTH_SKIP_EMAIL_VERIFICATION=true`: `[SECURITY WARN] AUTH_SKIP_EMAIL_VERIFICATION=true — email verification is bypassed for all new registrations. Set to false when Resend is configured and closed-invite onboarding is complete.`

**5. Test coverage** — extend existing `auth.signin.integration.test.js` + `auth.teamContext.integration.test.js` (or a new small file) with tests for:
- Register with flag ON creates user `isVerified: true` and does NOT set `verificationCode`
- Register with flag ON does NOT log `[AUTH:CODE_NOT_EMAILED]` (nothing to email)
- Register with flag OFF + `!isEmailEnabled()` logs `[AUTH:CODE_NOT_EMAILED]` with correct format
- Login with flag ON allows a user with `isVerified: false` (from before flag was flipped)
- Login with flag OFF preserves the current 403 on `!isVerified`
- `resendVerification` with flag ON returns 200 no-op (does not create a new code)
- `forgotPassword` with `!isEmailEnabled()` logs `[AUTH:CODE_NOT_EMAILED]` regardless of skip-flag state
- `updateUnverifiedEmail` with `!isEmailEnabled()` logs `[AUTH:CODE_NOT_EMAILED]` regardless of skip-flag state

Target: **+8 tests** — T248 through T255. Server suite: 1475 → **1483**.

**6. Ops handoff** — the sprint's ship report includes:
- SQL to unblock currently-stuck users (`UPDATE users SET "isVerified"=true, "verificationCode"=NULL, "verificationExpiry"=NULL WHERE "isVerified"=false AND "deletedAt" IS NULL;`)
- Railway env vars to set: `AUTH_SKIP_EMAIL_VERIFICATION=true`
- Confirmation that flipping later (`=false` or delete var) reverts cleanly

### Out of scope (carved)

- **SuperAdmin manually-verify-user endpoint** — larger surface, dedicated sprint later if needed
- **Resend setup** — user is doing this out-of-band on their own timeline
- **Client-side changes** — the client's registration flow doesn't need to change; a user with `isVerified: true` from the register response flows through the same UI paths as before. The onboarding wizard already handles "user is verified and hasn't onboarded" (that's the current post-verify state anyway).
- **Password-reset UI** — same reason; the flow works, only the OTP delivery mechanism changes
- **Sprint 10 (AI prompts overhaul)** — deferred to after this sprint ships

---

## Architecture

```
server/src/
├── config/env.js                                    [MODIFY — add AUTH_SKIP_EMAIL_VERIFICATION]
├── services/email.service.js                        [MODIFY — export isEmailEnabled()]
├── controllers/auth.controller.js                   [MODIFY — 4 code-sending sites + login isVerified check + resendVerification no-op]
└── index.js                                         [MODIFY — 2 boot-time warnings]

server/test/integration/
├── auth.signin.integration.test.js                  [MODIFY — add flag ON login test + flag OFF regression]
└── auth.emailDisabled.integration.test.js           [NEW — 6-8 tests for OTP-to-logs + resendVerification no-op]

docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md  [MODIFY — mark Sprint 9.5 shipped]
```

**Unchanged (explicit):**
- All client code (no UI changes needed)
- All Prisma migrations, schema.prisma
- All other tests
- All Zod schemas — the register/login payloads don't change
- Team invitation flow (`sendTeamInviteEmail`) — untouched; still requires Resend when used, which is fine for closed-invite ops via joinCode

---

## Env flag details

### `AUTH_SKIP_EMAIL_VERIFICATION`

**Type:** boolean (parsed via existing `optional` helper in `env.js`)
**Default:** `false`
**Semantics:**
- `true`: new registrations skip email verification entirely; users start with `isVerified: true`. Login accepts users with `isVerified: false` (existing pre-flag users) OR `true`.
- `false`: current behavior — codes generated, delivery attempted via Resend, login blocks on `!isVerified`

**Coupling with `RESEND_API_KEY`:**
- Skip flag ON + RESEND unset → all onboarding works, no email at all (Binary Thinkers-style flow)
- Skip flag ON + RESEND set → registration still skips codes (flag wins); resend/reset/change-email still send real emails via Resend
- Skip flag OFF + RESEND set → normal production behavior
- Skip flag OFF + RESEND unset → current broken state, but `[AUTH:CODE_NOT_EMAILED]` now surfaces codes to logs

**Grep tag:** `[AUTH:VERIFICATION_SKIPPED]` on every skip event (register) — one line per skipped verification, includes email + userId.

---

## Test archetypes + patterns

### Archetype A — Flag ON register creates verified user

```js
it("test 248: register with AUTH_SKIP_EMAIL_VERIFICATION=true creates isVerified:true user", async () => {
  // Env is mocked to skip = true in this describe block
  const { status, body } = await post("/api/auth/register", {
    email: "bob@example.com",
    password: "Sup3rSecure!",
    name: "Bob",
  });

  expect(status).toBe(201);
  const createCall = state.userCreateCalls[0];
  expect(createCall.data.isVerified).toBe(true);
  expect(createCall.data.verificationCode).toBeUndefined();
  expect(createCall.data.verificationExpiry).toBeUndefined();
});
```

### Archetype B — Flag OFF + email disabled logs OTP

```js
it("test 249: register with skip flag off + email disabled logs [AUTH:CODE_NOT_EMAILED]", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { status } = await post("/api/auth/register", {
      email: "carol@example.com",
      password: "Sup3rSecure!",
      name: "Carol",
    });
    expect(status).toBe(201);

    const codeLog = warnSpy.mock.calls.find((c) =>
      String(c[0]).includes("[AUTH:CODE_NOT_EMAILED]"),
    );
    expect(codeLog).toBeDefined();
    expect(codeLog[0]).toMatch(/surface="register"/);
    expect(codeLog[0]).toMatch(/email="carol@example.com"/);
    expect(codeLog[0]).toMatch(/code="\d{6}"/);
  } finally {
    warnSpy.mockRestore();
  }
});
```

### Archetype C — Login bypass with flag ON

```js
it("test 250: login with AUTH_SKIP_EMAIL_VERIFICATION=true accepts !isVerified user", async () => {
  state.userFindUniqueReturns = [
    { id: "u1", email: "dave@example.com", password: "HASHED:Sup3r", isVerified: false },
  ];
  const { status, body } = await post("/api/auth/login", {
    email: "dave@example.com",
    password: "Sup3r",
  });
  expect(status).toBe(200);
  expect(body?.data?.token).toBe("test_jwt_token");
});
```

### Archetype D — resendVerification no-op with flag ON

```js
it("test 253: resendVerification with skip flag ON returns 200 no-op", async () => {
  state.userFindUniqueReturns = [{ id: "u1", isVerified: false, name: "Eve" }];
  const { status, body } = await post("/api/auth/resend-verification", {
    email: "eve@example.com",
  });
  expect(status).toBe(200);
  expect(body?.data?.message).toMatch(/verification.*disabled|no verification/i);
  expect(state.userUpdateCalls).toHaveLength(0); // no new code stored
});
```

### Test discipline

- **Flag state must be settable per-test** — since `env.js` reads env vars at module-load time, tests either (a) `vi.doMock` + `vi.resetModules` + `await import()` per test, OR (b) if the flag is read fresh on each request via a helper (`isSkipVerificationEnabled()`), tests can just set `process.env.AUTH_SKIP_EMAIL_VERIFICATION` in `beforeEach`. **Recommend option (b)** — cleaner test ergonomics + matches how Sprint 7's flag dispatch was implemented.
- **`console.warn` spies restored in `finally`** — matches Sprint 8c T246/T247 pattern.
- **No new mocks of `email.service.js` needed** — existing `auth.teamContext.integration.test.js` already mocks it; new tests can reuse.

---

## Boot-warning format

In `server/src/index.js`, at server-boot time (after env vars are loaded, before routes are mounted):

```js
import { AUTH_SKIP_EMAIL_VERIFICATION } from "./config/env.js";
import { isEmailEnabled } from "./services/email.service.js";

if (!isEmailEnabled()) {
  console.warn(
    "[SECURITY WARN] Email delivery is disabled (RESEND_API_KEY not set). " +
    "Verification and password-reset codes will be logged to stdout with the " +
    "[AUTH:CODE_NOT_EMAILED] tag. Configure Resend to auto-remediate.",
  );
}

if (AUTH_SKIP_EMAIL_VERIFICATION) {
  console.warn(
    "[SECURITY WARN] AUTH_SKIP_EMAIL_VERIFICATION=true — new registrations " +
    "bypass email verification. Intended for closed-invite onboarding only. " +
    "Set to false after Resend is configured and onboarding is complete.",
  );
}
```

Both fire independently. If both are true, user sees two warnings back-to-back at boot — deliberate; each conveys a distinct operational state.

---

## Divergence discipline

- **If a test surfaces a real hole** (e.g., login unexpectedly allows a `deletedAt: !null` user through when skip flag is on) — that's a real bug the sprint uncovered. Fix it inline, record in commit body.
- **If flipping the skip flag requires additional callers to be updated** (e.g., some code path re-checks `isVerified` beyond login/register) — grep-verify during implementation. Expected callers already enumerated above.
- **If `env.js` parsing turns out to require a specific pattern** for boolean flags (Sprint 7/7b's pattern with `.toLowerCase()`) — match the existing convention.

---

## Test count target

- Baseline (post Sprint 9): **1475**
- New in Sprint 9.5: **+8** (T248-T255)
- Target: **1483**

---

## Done criteria

- `AUTH_SKIP_EMAIL_VERIFICATION` env var added to `env.js` with `false` default
- `isEmailEnabled()` exported from `email.service.js`
- 4 code-sending sites in `auth.controller.js` gated with `[AUTH:CODE_NOT_EMAILED]` warn when `!isEmailEnabled()`
- `login` bypasses `!isVerified` check when skip flag is ON
- `register` sets `isVerified: true` (and skips code generation) when skip flag is ON
- `resendVerification` returns 200 no-op when skip flag is ON
- Boot warnings fire in `index.js` for both flag-on states
- 8 new tests pass; full suite at **1483**
- `npm run lint` (server + client) + audits exit 0
- `npx prisma migrate status` up to date (no schema change)
- Client `npm run build` clean
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 9.5 → ✅ shipped 2026-07-03
- Ship report includes: SQL to unblock existing stuck users, Railway env vars to flip
- 4-role panel review completed pre-implementation; CHANGES_REQUESTED fold-ins applied before implementer runs

---

## Production risk inventory

| Dimension | Status |
|---|---|
| Schema migration | None |
| Backend behavior change | Behind opt-in env flag. Default = current strict behavior preserved. Flag-on = closed-invite bypass. |
| Client impact | None — registration/login/onboarding UI flows unchanged. Users who register when flag is ON just don't hit the "verify email" screen (they're already verified). |
| Test runtime | +8 sync integration tests, sub-100ms total |
| Backward compatibility | Full — existing users unaffected; flipping flag off later restores strict behavior for future users |
| Rollback | Delete or set `AUTH_SKIP_EMAIL_VERIFICATION=false` on Railway → old strict behavior resumes for future registrations. Existing pre-flag `isVerified: true` users stay. |
| Risk floor | Low-medium — auth verification bypass is a security-sensitive surface, but scoped tightly (opt-in flag + boot warning + backwards-compat) |

---

## Backward compatibility

Full. No API-shape change. Client code untouched. The only observable difference under `AUTH_SKIP_EMAIL_VERIFICATION=true`:
- New registrations don't hit the "check your email for verification code" screen — they land at the onboarding wizard immediately
- Existing users with `isVerified: false` (currently stuck) can now log in successfully

Under `!isEmailEnabled()`:
- OTP codes now surface in Railway logs with a specific tag — admin can hand-deliver via out-of-band channel

Nothing regresses.

---

## Ops handoff (post-ship steps for the user)

**Immediately after Sprint 9.5 ships to main:**

1. **Optional one-time SQL** — unblock currently-stuck users:
   ```sql
   UPDATE users
   SET "isVerified" = true,
       "verificationCode" = NULL,
       "verificationExpiry" = NULL
   WHERE "isVerified" = false
     AND "deletedAt" IS NULL;
   ```
   Run in Railway Postgres console.

2. **Set env var** on Railway server service:
   ```
   AUTH_SKIP_EMAIL_VERIFICATION=true
   ```
   Save → Railway auto-redeploys.

3. **Verify at boot** — Railway logs should now show both `[SECURITY WARN]` lines confirming email is disabled + verification is bypassed.

4. **Share Binary Thinkers join code + signup URL** privately with team members via WhatsApp/DM.

5. **When Resend is set up later:**
   - Configure `RESEND_API_KEY` + `EMAIL_FROM` on Railway
   - Delete `AUTH_SKIP_EMAIL_VERIFICATION` env var (or set `=false`)
   - Both `[SECURITY WARN]` lines disappear from boot logs
   - Future signups get real emails; password reset flows work end-to-end

---

## Self-review

| Check | Status |
|---|---|
| Placeholders | None — 8 tests specified with concrete assertion targets |
| Internal consistency | 8 test IDs T248-T255 contiguous with prior T1-T247 (Sprint 8c). Flag name matches existing `AUTH_*` env-var namespace |
| Scope | Tight: 2 files touched in production code + 1-2 test files. No schema change, no migration, no client change |
| Ambiguity | Two explicit divergence policies: (a) match existing env-boolean parsing pattern; (b) if login exposes an unexpected `!isVerified` path when flag ON (e.g., soft-deleted users), fix inline |
| Adversarial review | Load-bearing test = T250 (login bypass works with flag ON) — if flag isn't checked at auth.controller.js:309, all downstream tests are moot. Security-critical test class flagged for panel review. |
| Risk floor | Low-medium — auth surface but tightly scoped, opt-in, self-remediating, backwards-compatible |

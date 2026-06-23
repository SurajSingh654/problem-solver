# Sign-in Flow Test Foundation — Design Spec

**Date:** 2026-06-23
**Sprint:** 3.3a (per `2026-06-20-refactor-redesign-sprint.md`, first carve of Sprint 3.3)
**Branch:** `feat/test-auth-signin`
**Layers on:** main, post Sprint 3.2 (`6b2720d`)
**Feature flag:** None — test foundation + one small security-hygiene fix

---

## Problem

Sprint 1 audit finding H12 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` lines 123-125):

> `auth.controller.js` — `login`, `register`, `changePassword`, `forgotPassword`, `verifyEmail`, `completeOnboarding`, `switchTeam`. Zero references in `server/test/`. **Failure scenario:** A buggy `register()` could fail to create the personal-team `TeamMembership` row inside the transaction → user can't access anything. No regression guard.

(Reading `register` directly: the TeamMembership creation lives in `completeOnboarding`, not `register` — the audit's specific failure-scenario sentence is out-of-date for `register`. The broader concern — zero tests on the most security-sensitive controller — stands.)

`auth.controller.js` has 11 exported functions across 892 LoC. After Sprint 3.2 shipped tests for `resetPassword`, 10 functions remain untested. Sprint 3.3 was decomposed into three sub-sprints by surface:

- **3.3a (this spec) — sign-in flow**: `register` / `login` / `verifyEmail` / `resendVerification`
- 3.3b — password & credential management: `forgotPassword` / `changePassword` / `updateUnverifiedEmail`
- 3.3c — team context & profile: `completeOnboarding` / `getMe` / `switchTeam`

## Principle

This sprint is **test foundation + one security-hygiene fix** scoped to the sign-in surface. The four functions are the front door — every authenticated session originates here. The test foundation locks in current behavior (regression guard) and gives reviewers a basis to inspect every future change to this surface. The security-hygiene fix (env-gating `[DEV] Verification code:` logs) is bundled because it lives in the same file, would surface during test writing anyway, and trivially low-risk.

This is **NOT** the place to audit-redesign the sign-in flow. Behavior changes are out of scope unless surfaced by writing the test (e.g. a test reveals a real bug). If a test surfaces a latent bug that's bigger than a one-line fix, I'll document it and carve a follow-up sprint.

## Scope

In scope:

- **New test file** `server/test/integration/auth.signin.integration.test.js` — wire-level integration tests via `_appFactory.js`. Mocks: Prisma (`user.findUnique`, `user.create`, `user.update`), `bcryptjs` (`hash`, `compare`), `email.service.js` (`sendVerificationEmail`), `jwt.js` (`generateToken`). Estimated 18 tests across 4 describe blocks (one per function).
- **`auth.controller.js` modification**: env-gate the two `[DEV] Verification code:` `console.log` lines (lines 129 + 253). Production logs no longer contain plaintext verification codes. ~3-line change.

Out of scope:

- `resendVerification` reveals "Email is already verified" status (user enumeration). Real but small: the registration form already reveals registered-or-not via 409. Leave alone.
- `verifyEmail` not wrapped in a transaction. A parallel verify could double-issue JWTs to the same user. Same user, same auth — not a security issue. Leave alone.
- `register` doesn't catch Prisma P2002 (unique-constraint race on email). Two parallel registrations of the same email: second returns generic 500. Cosmetic. Leave alone.
- Decomposition tail: 3.3b (password mgmt) + 3.3c (team context). Separate sub-sprints.
- User-enumeration error-message divergence in `resetPassword` (flagged by Sprint 3.2 code review). Carved to 3.3b — sits naturally next to the password-mgmt tests.

## Architecture

```
server/test/integration/auth.signin.integration.test.js   [NEW]
  ├── module mocks: prisma, bcryptjs, email.service, jwt
  ├── helpers: postJson(server, path, body), buildPrincipal(...)
  ├── describe("POST /auth/register")     [5 tests]
  ├── describe("POST /auth/verify-email") [5 tests]
  ├── describe("POST /auth/resend-verify") [3 tests]
  └── describe("POST /auth/login")        [5 tests]

server/src/controllers/auth.controller.js                 [MODIFIED]
  ├── line 129 (register):           console.log → if (!IS_PRODUCTION) console.log
  └── line 253 (resendVerification): console.log → if (!IS_PRODUCTION) console.log
```

The env gate uses `process.env.NODE_ENV !== "production"` directly (no new constant — keep the change minimal). If a future sprint wants a structured logger, we'll refactor then.

## Test plan — detail per function

### `register` (5 tests)

1. **Happy path** — POST `{ email, password, name }` → 201 + `{ user: { id, email, name } }` response shape. Asserts:
   - `bcrypt.hash` called once with the supplied password and `BCRYPT_ROUNDS` (12)
   - `prisma.user.create` called with `email`, hashed password, `verificationCode` matching `/^\d{6}$/`, `isVerified: false`, `onboardingComplete: false`
   - `sendVerificationEmail` called with `email`, `name`, the code

2. **Existing email** — when `findUnique` returns a user → 409 "An account with this email already exists." `bcrypt.hash` NOT called.

3. **Password is hashed before storage** — explicit assertion: `prisma.user.create`'s `data.password` is the bcrypt-mock's return value (`HASHED:<password>`), NOT the raw password. Catches a regression where someone removes the hash call.

4. **Verification code shape** — POST → response message contains "check your email", and the persisted code matches `/^\d{6}$/` with `verificationExpiry` ~15 minutes in the future.

5. **Email-send failure is fire-and-forget** — `sendVerificationEmail` mock rejects with a thrown error. Response is still 201 (the controller `.catch()`-es the rejection). Asserts the controller doesn't throw.

### `verifyEmail` (5 tests)

1. **Happy path** — POST `{ email, code }` matching DB → 200 with `{ message, token, user }`. Asserts:
   - `prisma.user.update` called with `isVerified: true`, `verificationCode: null`, `verificationExpiry: null`
   - `generateToken` called with the full user object (includes `memberships[]` from `buildUserResponse`)
   - Returned `token` is the mock's stable test value

2. **No user** — `findUnique` returns null → 404 "No account found with this email."

3. **Already verified** — `findUnique` returns user with `isVerified: true` → 400 "Email is already verified."

4. **Wrong code** — DB code is `"123456"`, request sends `"000000"` → 400 "Invalid verification code." `update` NOT called.

5. **Expired code** — DB code matches but `verificationExpiry < now` → 400 "Verification code has expired." `update` NOT called.

### `resendVerification` (3 tests)

1. **Existing unverified user** — `findUnique` returns unverified user → 200 with anti-enumeration message ("If an account exists..."). Asserts:
   - `prisma.user.update` called with new `verificationCode` matching `/^\d{6}$/` and fresh `verificationExpiry`
   - `sendVerificationEmail` called with the new code

2. **Existing verified user** — `findUnique` returns verified user → 400 "Email is already verified." `update` NOT called. (This DOES leak verified-status, documented out-of-scope above.)

3. **Non-existent email** — `findUnique` returns null → 200 with the same anti-enumeration message as case 1. `update` NOT called. `sendVerificationEmail` NOT called.

### `login` (5 tests)

1. **Happy path** — POST `{ email, password }` matching verified user → 200 with `{ token, user }`. Asserts:
   - `bcrypt.compare` called with supplied password and stored hash
   - `generateToken` called with full user (memberships included)
   - Fire-and-forget `lastActiveAt` update was queued (mock's `update` recorded the call)

2. **Wrong email** — `findUnique` returns null → 401 "Invalid email or password." (anti-enumeration: same message as wrong-password case). `bcrypt.compare` NOT called.

3. **Wrong password** — `bcrypt.compare` returns false → 401 "Invalid email or password." (same message as wrong-email). `generateToken` NOT called.

4. **Unverified user** — `bcrypt.compare` returns true but user has `isVerified: false` → 403 with body `error.code === "EMAIL_NOT_VERIFIED"`. `generateToken` NOT called.

5. **Fire-and-forget `lastActiveAt`** — after a successful login response is sent, the controller queues a `prisma.user.update` with `lastActiveAt` + `activityStatus: "ACTIVE"`. The test waits a tick (`await new Promise(setImmediate)`) then asserts the mock was called. Lock-in for the fire-and-forget pattern.

## The `[DEV]` log gate fix

Today (`auth.controller.js` lines 129 + 253):

```javascript
console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);
```

The `[DEV]` prefix telegraphs intent (dev-only) but it's unconditional. In production logs (Railway), this leaks verification codes in plaintext. Plain hash-of-code in DB + plain log line in the platform = anyone with log access can claim any unverified account by reading the log.

Change both call sites to:

```javascript
if (process.env.NODE_ENV !== "production") {
  console.log(`[DEV] Verification code: ${code} for ${email || "unknown"}`);
}
```

The log stays in dev for developer convenience (no need to dig in DB). It disappears in prod.

No new constant or helper — the inline check is fine for two call sites. If a third comes along, hoist.

## Production risk inventory

| Risk dimension | Status |
|---|---|
| Schema migration | None |
| Token / session invalidation | None |
| Behavior change | One: production logs no longer contain plaintext verification codes. Strictly an improvement; no user-visible change. |
| In-flight requests | None |
| Email delivery | Unaffected (`sendVerificationEmail` still called). |
| Rollback | `git revert` single commit |
| Test infrastructure | New file isolated; no shared test helper changes |

## Backward compatibility

- API response shapes unchanged on all four endpoints.
- Email templates untouched.
- JWT payload shape untouched (`generateToken` continues to read from `buildUserResponse`).
- Email service signature untouched.

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | Test plan enumerates every assertion per function; latent-issues list separates in-scope (log gate) from out-of-scope (enumeration via 409 / verifyEmail tx / P2002) with explicit rationale. |
| Scope | One new test file, one small controller patch, single commit. Sister functions (forgotPassword/changePassword/etc.) explicitly carved to 3.3b/3.3c. |
| Ambiguity | Each test's mock-call assertions are specific. Log-gate change is a pinned `process.env.NODE_ENV !== "production"` inline check, no new helper. |
| Backward compat | No API/schema/flag changes. Pre-existing dev workflows unaffected. |
| Adversarial review | The "fire-and-forget" lastActiveAt assertion is the highest-risk fragile spot — depends on event-loop scheduling. Pattern: `await new Promise(setImmediate); expect(update).toHaveBeenCalled();`. If flaky, fall back to asserting the controller's `.catch()` chain is set up (less direct but stable). |
| Plan defects to call out | (1) `bcrypt` mock target must be `bcryptjs` (per Sprint 3.2 lesson — `auth.controller.js` imports from `bcryptjs`, not `bcrypt`). (2) For `verifyEmail` happy path, the post-update `buildUserResponse` does a separate `findUnique` — mocks must return the FULL user shape (with memberships) on that second call, NOT the credentials-only shape returned on the first call. |
| Risk floor | Lowest of the security-track sprints. Pure test additions + one trivial security-hygiene gate. No data manipulation. |

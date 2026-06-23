# Password & Credential Management Test Foundation — Design Spec

**Date:** 2026-06-23
**Sprint:** 3.3b (per `2026-06-20-refactor-redesign-sprint.md`, second carve of Sprint 3.3)
**Branch:** `feat/test-auth-password-mgmt`
**Layers on:** main, post Sprint 3.3a (`99b4a07`)
**Feature flag:** None — test foundation + four small hardenings

---

## Problem

Sprint 1 audit finding H12 (zero tests on `auth.controller.js`) continues into the password-management surface. Sprint 3.3a covered the sign-in flow (register/login/verifyEmail/resendVerification). This sprint covers the three remaining credential-management functions:

- `forgotPassword` (line 574, 40 LoC) — re-issues a reset code, anti-enumeration response
- `changePassword` (line 720, 38 LoC) — authenticated password change
- `updateUnverifiedEmail` (line 837, 60 LoC) — fix typo'd email pre-verification

Reading the three functions surfaces **four** issues to address in this sprint:

1. **Two more `[DEV] Verification code:` `console.log` lines unguarded** at `forgotPassword:590` and `updateUnverifiedEmail:872` — same secret-in-prod-logs class as 3.3a's fix.

2. **`resetPassword` user-enumeration via error-message divergence** (deferred from Sprint 3.2 code review): line 622 returns `"Invalid email or reset code."` for missing user; line 625 returns `"Invalid reset code."` for wrong code. A 12-character difference tells an attacker whether the email is registered.

3. **`updateUnverifiedEmail` route is unvalidated** (`auth.routes.js:245`): `router.post('/update-unverified-email', updateUnverifiedEmail)` — no `validate(schema)` middleware, no `updateUnverifiedEmailSchema` in `auth.schema.js`. The controller does ad-hoc `if (!currentEmail || !newEmail)` checks but no email-format validation, no max-length, no normalization (lowercase/trim). Malformed bodies hit the controller body.

4. **`forgotPassword` and `updateUnverifiedEmail` have no regression coverage.** A future refactor that removes the anti-enumeration message or breaks the email-update flow has no test to catch it.

## Principle

This sprint completes the password-management surface of H12 and bundles the related deferred fixes that the test-writing exercise surfaces. The bundling is tight (all four issues live on the password-management surface; all touch `auth.controller.js` / `auth.schema.js` / `auth.routes.js`) — not scope creep. Anything beyond this surface is carved to 3.3c (`completeOnboarding` / `getMe` / `switchTeam`) or 3.4 (`email.service.js` tests).

## Scope

In scope:

- **New test file** `server/test/integration/auth.passwordMgmt.integration.test.js` — wire-level integration tests via `_appFactory.js`. Mocks: Prisma (`user.findUnique` with dual-shape dispatch on `where.id` vs `where.email`, plus `user.update`), `bcryptjs`, `email.service.js`, `auth.middleware.js`. Estimated 16 tests across 5 describe blocks.

- **`auth.controller.js` modifications**:
  - Line 590 (in `forgotPassword`): wrap `console.log` in `if (process.env.NODE_ENV !== "production")` (same pattern as 3.3a)
  - Line 872 (in `updateUnverifiedEmail`): same wrap
  - Line 625 (in `resetPassword`): change `"Invalid reset code."` to `"Invalid email or reset code."` — unify with line 622, eliminate user-enumeration via message-shape diff

- **`auth.schema.js` modification**: add `updateUnverifiedEmailSchema`:
  ```javascript
  export const updateUnverifiedEmailSchema = z.object({
    currentEmail: emailField,
    newEmail: emailField,
  });
  ```
  Uses the existing `emailField` (z.string().email().max(255).transform(lowercase+trim)).

- **`auth.routes.js` modification**: import `updateUnverifiedEmailSchema`, mount `validate(updateUnverifiedEmailSchema)` on the route at line 245.

Out of scope:

- `changePassword` TOCTOU race during bcrypt window (same shape as the pre-fix `resetPassword`). The "attacker" must already have the user's current password (i.e. is authenticated as the user); net effect of the race is "second submission wins" — acceptable UX for a double-clicked form, not a security gap. Leave alone.
- `forgotPassword` brute-force enumeration — already protected by route-level `authLimiter` middleware.
- `updateUnverifiedEmail` race on email uniqueness — Prisma's `@unique` on `User.email` + P2002 catch handles this. Acceptable.
- `requestEmailChangeSchema` (existing schema for AUTHENTICATED email change, requires password) is unrelated to `updateUnverifiedEmailSchema` (pre-verification flow, no password). Don't conflate.
- 3.3c (`completeOnboarding` / `getMe` / `switchTeam`) — separate sub-sprint.
- 3.4 (H13 email service tests) — separate sub-sprint.

## Architecture

```
server/test/integration/auth.passwordMgmt.integration.test.js   [NEW]
  ├── module mocks: prisma, bcryptjs, email.service, auth.middleware
  ├── helpers: postJson, makeUser
  ├── describe("POST /auth/forgot-password")        [3 tests]
  ├── describe("POST /auth/change-password")        [4 tests]
  ├── describe("POST /auth/update-unverified-email") [5 tests]
  ├── describe("[DEV] log gate — forgot + updateUnverified") [2 tests]
  ├── describe("resetPassword wrong-code message unification") [1 test]
  └── describe("updateUnverifiedEmail Zod validation")        [1 test]

server/src/controllers/auth.controller.js  [MODIFIED]
  ├── line 590 (forgotPassword):           console.log → if (!IS_PRODUCTION) console.log
  ├── line 872 (updateUnverifiedEmail):    console.log → if (!IS_PRODUCTION) console.log
  └── line 625 (resetPassword):            "Invalid reset code." → "Invalid email or reset code."

server/src/schemas/auth.schema.js          [MODIFIED]
  └── Add updateUnverifiedEmailSchema export

server/src/routes/auth.routes.js           [MODIFIED]
  ├── import: add updateUnverifiedEmailSchema
  └── line 245: router.post('/update-unverified-email', validate(updateUnverifiedEmailSchema), updateUnverifiedEmail)
```

## Test plan — detail per describe block

### `forgotPassword` (3 tests)

1. **Existing user** — `findUnique` returns user → 200 with anti-enumeration message ("If an account exists..."). Asserts:
   - `prisma.user.update` called with `resetCode` matching `/^\d{6}$/` and `resetExpiry` ~15min in future
   - `sendPasswordResetEmail` called with `email`, `name`, the code

2. **Non-existent email** — `findUnique` returns null → 200 with same anti-enum message. `update` NOT called. `sendPasswordResetEmail` NOT called.

3. **Email-send failure is fire-and-forget** — `sendPasswordResetEmail` mock throws → response still 200; `update` still happened (code was persisted; only email send failed).

### `changePassword` (4 tests)

1. **Happy path** — authenticated user submits valid currentPassword + newPassword → 200. Asserts:
   - `bcrypt.compare` called with supplied `currentPassword` AND stored hash
   - `bcrypt.hash` called once with newPassword and BCRYPT_ROUNDS
   - `prisma.user.update` called with `password: "HASHED:<newPassword>"` and `mustChangePassword: false`

2. **Wrong current password** — `bcrypt.compare` returns false → 400 "Current password is incorrect." `bcrypt.hash` NOT called. `update` NOT called.

3. **User not found edge case** — `findUnique` returns null (somehow `req.user.id` is invalid) → 404 "User not found." `bcrypt.compare` NOT called.

4. **Password is hashed before storage (explicit regression guard)** — assert `update.data.password` is the bcrypt-mock's return `"HASHED:<newPassword>"`, NOT the raw newPassword. Catches a regression where someone removes the hash call.

### `updateUnverifiedEmail` (5 tests)

1. **Happy path** — unverified user submits valid currentEmail+newEmail, neither taken → 200 with `{ message, email: newEmail }`. Asserts:
   - `update` called with `email: newEmail`, `verificationCode` matching `/^\d{6}$/`, fresh expiry
   - `sendVerificationEmail` called with `newEmail`, user's name, the new code

2. **Non-existent currentEmail** — first `findUnique` returns null → 404 "No account found with this email." `update` NOT called.

3. **Already verified** — `findUnique` returns user with `isVerified: true` → 400 "This account is already verified..." `update` NOT called.

4. **New email already taken** — second `findUnique` returns an existing user → 409 "An account with this email already exists." `update` NOT called.

5. **Missing body fields** — POST `{ currentEmail: "alice@example.com" }` (no newEmail) → 400 VALIDATION_ERROR (from Zod after the schema addition).

### `[DEV] log gate` (2 tests)

Both follow the 3.3a pattern: spy `console.log`, set `NODE_ENV = "production"`, post a valid request, assert no `[DEV] Verification code:` line emitted.

1. **forgotPassword path** in production — no leak
2. **updateUnverifiedEmail path** in production — no leak

`beforeEach` saves `process.env.NODE_ENV` and sets to "production"; `afterEach` restores. Same pattern as 3.3a.

### `resetPassword wrong-code message unification` (1 test)

Posts a valid email + wrong code to `/api/auth/reset-password`. Asserts the response body's `error.message` is EXACTLY `"Invalid email or reset code."` (the unified message, not the old `"Invalid reset code."`). Lock-in for the message-shape unification that closes the user-enumeration leak.

Note: Sprint 3.2's existing tests use regex `/invalid reset code/i` which matches BOTH the old and new messages, so they stay green. This new test uses exact-string equality to lock the unification.

### `updateUnverifiedEmail Zod validation` (1 test)

POSTs `{}` (empty body) to `/api/auth/update-unverified-email`. Asserts 400 with `error.code === "VALIDATION_ERROR"`. Proves Zod is enforcing the schema after we add it.

## RED-first proofs

Against unmodified code:
- 2 log-gate tests **FAIL** (controller emits the log line in production)
- 1 message-unification test **FAILS** (controller still returns "Invalid reset code." on line 625)
- 1 Zod-validation test **FAILS** (controller hits the ad-hoc check and returns generic 400 "Both current and new email are required." — message doesn't match Zod's VALIDATION_ERROR shape)

Other 12 tests are regression guards documenting current behavior — they PASS on first run. Document the 4 RED failure modes as security/quality receipts.

## Production risk inventory

| Risk dimension | Status |
|---|---|
| Schema migration | None |
| Token / session invalidation | None |
| Behavior change 1 (log gate) | Prod logs no longer contain plaintext verification codes from `forgotPassword` / `updateUnverifiedEmail`. Strict improvement. |
| Behavior change 2 (message unification) | `resetPassword` wrong-code response message changes from "Invalid reset code." → "Invalid email or reset code." (12 chars longer, same status code, same caller-detectable success/failure boundary — strict improvement). The existing 3.2 test's regex matches both phrasings; it stays green. |
| Behavior change 3 (Zod validation) | `updateUnverifiedEmail` malformed bodies now hit Zod and return 400 VALIDATION_ERROR before the controller. Acceptable: today's malformed bodies fall through to the ad-hoc `if (!currentEmail || !newEmail)` check which already returns 400 — same status code, slightly different message shape. Clients should not be parsing message text. |
| In-flight requests | None |
| Rollback | `git revert` single commit |

## Backward compatibility

- API response shapes unchanged on happy paths.
- `resetPassword` wrong-code message: 12-character expansion. Existing Sprint 3.2 test regex passes. No known client parsing this message.
- `updateUnverifiedEmail`: Zod normalizes emails to lowercase + trim. Today the controller does case-sensitive `findUnique` on `currentEmail`. After Zod normalization, lookups will be lowercase. If a user's stored email was previously normalized to lowercase (likely — `register` also uses Zod's `emailField` which lowercases), the lookup is unaffected. If somehow a user has a mixed-case email in the DB (legacy data — extremely unlikely given `register`'s schema), they'd hit "No account found." Acceptable edge case; user can re-register.

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | All 4 controller changes scoped to one file with explicit line numbers. The Prisma mock's `where.id` vs `where.email` dispatch pattern called out (mirrors 3.3a's memberships pattern). RED-first list enumerates EXACTLY which 4 of 16 tests fail without the fixes. |
| Scope | One test file, three controller edits, one schema add, one route edit. Single commit. Sister sub-sprint 3.3c (team context) and 3.4 (email tests) carved explicitly. |
| Ambiguity | Message-unification test uses EXACT string equality (not regex) — explicit. Zod test uses VALIDATION_ERROR code check (not message text). |
| Backward compat | All three behavior changes are strict improvements; the API surface remains the same. |
| Adversarial review | The `emailField` lowercase-transform could surprise: if a user's stored email is `Alice@Example.com` and they submit `Alice@Example.com`, Zod normalizes to `alice@example.com` then `findUnique({ where: { email: "alice@example.com" }})` won't match. **Mitigation**: register already uses `emailField` (Sprint 3.3a tests confirm), so the DB-stored email is already lowercase. The case-mismatch scenario requires legacy/manually-inserted users — practically zero risk in production. If it ever surfaces, add a `mode: "insensitive"` to the Prisma query. Documented out-of-scope. |
| Risk floor | Low — pure test additions + 3 small controller hardenings (2 log gates, 1 message unification) + 1 schema/route addition. All RED-first proofs document the test catches the bug. No data manipulation. |

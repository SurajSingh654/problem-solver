# Reset Code Single-Use — Security Fix Design Spec

**Date:** 2026-06-22
**Sprint:** 3.2 (per `2026-06-20-refactor-redesign-sprint.md`)
**Branch:** `feat/security-reset-code-single-use`
**Layers on:** main, post Sprint 3.1 (`458e8f6`)
**Feature flag:** None — security fix

---

## Problem

Sprint 1 audit finding M22 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` line 184):

> `auth.controller.js:resetPassword` — Reset code valid until expiry (15 min) — can be replayed within window.

### Zero-trust verification (code reading)

The audit's wording ("replayed within window") is slightly imprecise on close reading of `auth.controller.js:612-654`. The actual issue is a **TOCTOU race** during the bcrypt latency window:

1. `resetPassword` does `findUnique({ email })` to read `resetCode` and `resetExpiry`.
2. If the code matches and isn't expired, it runs `bcrypt.hash(newPassword, BCRYPT_ROUNDS)` — ~200ms with 12 rounds.
3. After bcrypt completes, it runs `update({ password, resetCode: null, resetExpiry: null })`.

Between steps 1 and 3, the code is still in the DB. A second `resetPassword` request arriving in that ~200ms window passes the same `findUnique` check, computes its own bcrypt hash, and writes. The second write's `newPassword` wins.

**Exploit scenario:**
- Attacker intercepts the reset code (compromised email forwarder, phishing, etc.).
- Legitimate user clicks the reset link and submits at the same time.
- Both requests race. Attacker's request wins by ~milliseconds. Legitimate user sees "Password reset successfully" but the active password is the attacker's value.

Sequential replay AFTER a successful reset is already blocked — line 641-642 sets `resetCode: null` and `resetExpiry: null`, and the next `findUnique` returns `resetCode: null` → 400 "Invalid reset code." So the audit's stated symptom is real only within the bcrypt window.

**Severity:** Medium. Requires sub-200ms timing, which lifts the bar above casual attackers. But explicitly flagged in the audit and the user has set the bar at "everything is going in production. We do not have any leverage to mess it up anything."

### What the fix must NOT do

- **Must not change the schema.** No migration; existing `User.resetCode` + `User.resetExpiry` columns suffice.
- **Must not break in-flight reset emails at deploy time.** Codes already issued must continue to work.
- **Must not change the happy-path UX.** Legitimate single-request resets continue to work identically.

## Principle

This is the second of Sprint 3's decomposed sub-sprints (3.1 H1 ✅ shipped → 3.2 M22 here → 3.3 H12 auth test foundation → 3.4 H13 email tests). This sprint is narrowly scoped to the `resetPassword` function. Sister concerns (broader auth test coverage, `verifyEmail` race, brute-force protection on `forgotPassword`) are explicitly carved out below.

## Scope

In scope:

- **Refactor `resetPassword`** in `server/src/controllers/auth.controller.js` to use a compare-and-swap (CAS) atomic claim via `prisma.user.updateMany` BEFORE running `bcrypt.hash`. Only the winning request gets `count: 1` and proceeds; concurrent requests get `count: 0` and a clear 400 "Reset code has expired or been used."
- **Observability log** `[security:reset-code-replay] userId=<id>` emitted on the race-loser path. Useful for spotting concurrent-attempt patterns in production logs.
- **New test file** `server/test/integration/auth.resetPassword.integration.test.js` with 6 tests covering happy path, sequential replay, wrong code, expired code, non-existent email, AND a **concurrent-race regression test** that fires two parallel HTTP requests with the same valid code and asserts exactly one succeeds.

Out of scope:

- `verifyEmail` TOCTOU. Same shape but no bcrypt window (~ms not ~200ms) and replay just re-sets `isVerified: true` — no security impact. Leaving alone.
- `forgotPassword` brute-force / rate limiting. Separate concern; covered by the existing `authLimiter` rate-limit middleware at the route level.
- Broader auth controller test foundation (H12) — Sprint 3.3.
- `changePassword` (logged-in flow) — different attack surface (requires current password); not flagged by the audit.

## Architecture

```
auth.controller.js::resetPassword(req, res)
  ├── findUnique(user by email)  [unchanged — gives user clear error msgs]
  ├── pre-check: user exists? → 400 if not
  ├── pre-check: resetCode matches? → 400 if not
  ├── pre-check: resetExpiry > now? → 400 if not
  │
  ├── [NEW] Atomic CAS claim:
  │     prisma.user.updateMany({
  │       where: { id, resetCode: code, resetExpiry: { gt: now } },
  │       data:  { resetCode: null, resetExpiry: null }
  │     }) → { count }
  │
  ├── if claim.count === 0:
  │     console.warn("[security:reset-code-replay] userId=<id>")
  │     → 400 "Reset code has expired or been used."
  │
  ├── bcrypt.hash(newPassword, BCRYPT_ROUNDS)  [now safe — code invalidated]
  ├── prisma.user.update({ password, mustChangePassword: false })
  └── → 200 "Password reset successfully."
```

The pre-check `findUnique` stays so legitimate users see specific error messages ("Invalid reset code" vs "expired" vs "user not found") instead of a single ambiguous "expired or been used." The CAS claim is the authoritative atomic gate — it covers the race window even when the pre-check happens to pass.

## Why CAS via `updateMany` (not `$transaction` + `SELECT FOR UPDATE`)

Two viable atomic patterns:

1. **`updateMany` with code+expiry in WHERE (chosen).** Single SQL statement that compiles to `UPDATE users SET resetCode=NULL, resetExpiry=NULL WHERE id=$1 AND resetCode=$2 AND resetExpiry > $3`. Postgres returns affected-row count atomically — `1` if we won the race, `0` if not. Minimal latency, no transaction overhead.

2. **`$transaction` + `SELECT FOR UPDATE`.** Lock the row first, re-check inside the transaction, do bcrypt, write, commit. Used by SM-2 review submit (line 524 of `solutions.controller.js`) and the H3 fix in `aiReview.controller.js` Sprint 2.5.

`updateMany` wins here because:
- It's a single round-trip vs three (BEGIN + SELECT FOR UPDATE + UPDATE + COMMIT).
- The race window we're protecting against is the bcrypt window (~200ms), and `updateMany` happens BEFORE bcrypt. The transaction approach would hold the lock during bcrypt, serializing concurrent reset attempts for ~200ms each — same end result, slower.
- The CAS pattern is the textbook fix for "single-use token" semantics in SQL.

## Why pre-check + CAS (not just CAS alone)

Without the pre-check, every failure produces the same generic "Reset code has expired or been used" message. This is a worse UX:
- User who typed the wrong code can't distinguish "I typed wrong" from "expired."
- User who submitted twice (e.g. double-clicked) sees a confusing "expired or been used" when they just expected success.

The pre-check separates these into specific messages while the CAS handles the rare race case. The CAS's error message ("expired or been used") is honest about which two states it actually saw.

## Tests

### Wire-level integration tests — `server/test/integration/auth.resetPassword.integration.test.js`

Mirrors the `designReferences.tenancy.integration.test.js` pattern (Sprint 3.1). Uses `_appFactory.js` to mount the auth router with stubbed middleware, mocks Prisma, fires real HTTP requests via `fetch`. The CAS-honoring Prisma mock approximates Postgres `updateMany` behavior — exactly one parallel call returns `count: 1`; the rest return `count: 0` if the WHERE no longer matches (resetCode already cleared).

Tests:

1. **Happy path** — valid code, valid expiry → 200, Prisma `updateMany` called with `count: 1`, follow-up `update` writes the hashed password.
2. **Sequential replay** — same code submitted twice. First returns 200; second returns 400 "expired or been used" (resetCode already null in DB, `updateMany` returns `count: 0`).
3. **Wrong code** — `code: "000000"` when DB has `"123456"` → 400 "Invalid reset code" (caught by pre-check; `updateMany` never called).
4. **Expired code** — DB has `resetExpiry` in the past → 400 "expired or been used" or "expired, please request new" (caught by pre-check).
5. **Non-existent email** — `email: "nobody@example.com"` → 400 "Invalid email or reset code."
6. **Concurrent race** — `Promise.all([fetch, fetch])` with the same valid code. Prisma mock's `updateMany` simulates atomic single-winner. Assert exactly ONE response is 200 and ONE is 400. Asserts the bcrypt+update call happened exactly once.

### RED-first proof

Before the fix lands, run the concurrent-race test against unmodified controller code. Pre-fix behavior: both requests pass the `findUnique` check and proceed through bcrypt + update, returning 200 for both. The race test fails with "expected exactly one 200, got two." Document this as the security receipt.

## Production risk inventory

| Risk dimension | Status |
|---|---|
| Schema migration | None |
| Token/session invalidation | None |
| Data backfill | None |
| Currently-issued reset codes (in user emails at deploy time) | Still valid; new controller validates them normally |
| Happy-path UX | Identical to today |
| Concurrent-attempt UX | Race-loser now sees clear 400 instead of silent "second write wins"; race-winner sees normal 200 |
| `bcrypt` failure recovery | If bcrypt throws after code is invalidated, the user must request a new code. Acceptable: bcrypt almost never fails for valid input (Zod enforces password rules upstream) |
| In-flight requests at deploy | Mid-bcrypt requests use old code path; legitimately consume the code; no double-charging |
| Rollback | `git revert` single commit, clean |
| Observability | New `[security:reset-code-replay]` log line on race-loser path |

## Backward compatibility

- API response shape: unchanged on happy path. Error messages on the race-loser path change from "200 with second-write-wins behavior" to "400 with explicit message." Better UX.
- Database state: unchanged. Same columns, same semantics — code+expiry get cleared on successful reset.
- Email templates: untouched.
- Rate limiter: untouched (`authLimiter` already on the route).

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | CAS pattern + pre-check rationalized in dedicated section; the dual-error-message UX is documented; the test plan exercises both happy and race paths. |
| Scope | One controller method, one new test file, single commit. Sister concerns (verifyEmail race, brute-force, broader auth tests) explicitly carved. |
| Ambiguity | `updateMany` semantics pinned: `count: 1` → race winner; `count: 0` → race loser. Specific error message pinned. RED-first proof requirement explicit. |
| Backward compat | No API/schema/flag changes. In-flight reset codes continue to work. Happy path identical. |
| Risk floor | Lower than 3.1 — no exploitable read leak. The fix is a defensive narrowing of an existing race that requires sub-200ms attacker timing. |
| Adversarial review | What if a user issues two `forgotPassword` requests back-to-back? The second overwrites the first's code. Pre-fix and post-fix: same. Not a regression. What if the user's email is compromised AND they're online at the same time as the attacker? Same outcome — the legitimate user can re-request a code after the failed reset. Post-fix is strictly better because the attacker can't silently win the race. |

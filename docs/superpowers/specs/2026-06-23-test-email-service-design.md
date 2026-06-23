# Email Service Test Foundation — Design Spec

**Date:** 2026-06-23
**Sprint:** 3.4 (per `2026-06-20-refactor-redesign-sprint.md`)
**Branch:** `feat/test-email-service`
**Layers on:** main, post Sprint 3.3c (`649f1ff`)
**Feature flag:** None — pure test foundation

---

## Problem

Sprint 1 audit finding H13 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` lines 127-129):

> `server/src/services/email.service.js` — No tests for template rendering, missing-email handling, or service-failure fallback. Email templates have variables; a typo could ship.

Reading the file end-to-end:

- **14 exported send functions** + 1 internal `sendEmail` core + 6 helper functions (`emailWrapper`, `codeBlock`, `paragraph`, `heading`, `button`, `formatSessionTime`, `escapeHtml`).
- `sendEmail(to, subject, html)` branches on `EMAIL_ENABLED && resend`: real send via Resend SDK, or console-log simulation. On Resend failure, logs to stderr and re-throws (callers fire-and-forget).
- Function signatures are heterogeneous — 10 take positional args (`(to, name, code)` etc.); 4 teaching-session functions take a destructured object (`{ to, hostName, session }`).
- 4 teaching-session functions guard `if (!to) return { success: false, simulated: true }` BEFORE calling `sendEmail`. The other 10 don't.
- HTML-escape is inconsistent: only the 4 teaching functions use `escapeHtml`. The other 10 interpolate user-controlled values raw. **Out of scope for 3.4** per user decision — defer to a separate 3.4.b sprint after this lands.

## Principle

This sprint is **pure test foundation** for `email.service.js`. The audit's three concerns:
1. **Template rendering** — locked in via HTML-contains assertions per function
2. **Missing-email handling** — covered by the teaching-functions' early-return guard tests + `to: undefined` edge in core
3. **Service-failure fallback** — Resend mock throwing + caller-error propagation tests

No controller changes, no schema changes, no behavior changes. Pure test additions.

The HTML-escape inconsistency is documented as a deferred concern. The source comment at line 447-450 explicitly says "we don't want to retrofit them" — overriding that without an explicit hardening sprint is scope creep.

## Scope

In scope:

- **New test file** `server/test/services/email.service.test.js` — wire-level service tests with mocked Resend SDK + mocked env. Estimated 50-53 tests organized as:
  - 5 core `sendEmail` tests
  - 14 × 3 = 42 per-function tests (happy / disabled / throws)
  - 4 extra "missing `to`" guard tests for teaching functions
  - 2 `formatSessionTime` tests
- **Mocks**:
  - `vi.mock("resend")` — stub `Resend` class with `emails.send: vi.fn()`
  - `vi.mock("../../src/config/env.js")` — hoisted state to toggle `EMAIL_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM`, `CLIENT_URL`

Out of scope:

- **HTML-escape retrofit on the 10 non-teaching functions** — deferred to Sprint 3.4.b per user decision. Tracked separately.
- Sprint 3.5 (M23 MCP revocation Redis upgrade — deferred to Phase 2 per user decision).
- Controller / schema / route changes.

## Architecture

```
server/test/services/email.service.test.js   [NEW]
  ├── module mocks: resend, ../../src/config/env.js
  ├── helpers: collectSentEmail() (reads from resend.emails.send mock)
  │
  ├── describe("sendEmail core")              [5 tests]
  │     ├── EMAIL_ENABLED + resend OK → Resend.emails.send called
  │     ├── EMAIL_ENABLED false → simulated, no Resend call
  │     ├── RESEND_API_KEY missing → simulated
  │     ├── Resend throws → error propagates (catch + re-throw)
  │     └── Resend error path logs to stderr with recipient
  │
  ├── describe("sendVerificationEmail") through ...
  │     "sendFeedbackNotificationEmail"      [10 × 3 = 30 tests]
  │     (per-function: happy, disabled, throws)
  │
  ├── describe("sendTeachingSessionCreatedEmail") through ...
  │     "sendTeachingFlaggedEmail"           [4 × 4 = 16 tests]
  │     (per-function: happy, disabled, throws, missing-to-guard)
  │
  └── describe("formatSessionTime")           [2 tests]
        ├── valid Date → formatted string
        └── falsy → "Soon"

server/src/services/email.service.js          [UNCHANGED]
```

## Mock strategy details

### `vi.mock("resend")`

The service does `import { Resend } from "resend"` then `const resend = new Resend(RESEND_API_KEY)` at module load time. Mock factory returns a stub `Resend` class:

```javascript
const sendMock = vi.hoisted(() => ({
  emailSendCalls: [],
  shouldThrow: false,
  throwError: null,
}));

vi.mock("resend", () => ({
  Resend: class StubResend {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.emails = {
        send: vi.fn(async (args) => {
          sendMock.emailSendCalls.push(args);
          if (sendMock.shouldThrow) {
            throw sendMock.throwError || new Error("Resend down");
          }
          return { id: "resend_msg_test_1" };
        }),
      };
    }
  },
}));
```

### `vi.mock("../../src/config/env.js")`

The service reads `RESEND_API_KEY`, `EMAIL_ENABLED`, `EMAIL_FROM`, `CLIENT_URL` at module load:

```javascript
const envMock = vi.hoisted(() => ({
  EMAIL_ENABLED: true,
  RESEND_API_KEY: "test_api_key",
  EMAIL_FROM: "no-reply@probsolver.test",
  CLIENT_URL: "https://probsolver.test",
  // other env vars used elsewhere — pass through with safe defaults
}));

vi.mock("../../src/config/env.js", () => envMock);
```

Tests flip `envMock.EMAIL_ENABLED = false` (or `envMock.RESEND_API_KEY = null`) inside specific test cases. `beforeEach` resets to defaults.

### Important: module-load timing

The service does `const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;` at the TOP LEVEL — meaning `resend` is captured at import time based on `RESEND_API_KEY`. If a test changes `envMock.RESEND_API_KEY = null` after the import, the service's `resend` constant doesn't get re-evaluated.

This means the "RESEND_API_KEY missing" test path is harder than the "EMAIL_ENABLED false" path. For RESEND_API_KEY-null testing, we either:
1. **Accept the limitation**: test only the `EMAIL_ENABLED=false` simulation path, document that the `RESEND_API_KEY=null` path is symmetric and untestable at runtime due to module-load capture. Reasonable — the production deployment always has both set or both unset.
2. **Module-reset trick**: use `vi.resetModules()` + `await import()` per-test to re-evaluate the module. Heavier but covers both branches.

**Chosen: Option 1.** The two paths produce identical observable behavior (simulated console.log). Testing one branch covers the contract. If the test infrastructure ever needs to test cold-start config sensitivity, we add the module-reset trick at that point.

## Test plan — per function

### Core `sendEmail` (5 tests)

The service exports `sendEmail` is NOT exported — it's internal. But every public function calls it. Tests exercise it indirectly via `sendVerificationEmail`. The 5 tests:

1. **Happy path** — `sendVerificationEmail(...)` with `EMAIL_ENABLED=true`. Asserts:
   - `resend.emails.send` called with `{ from: EMAIL_FROM, to, subject, html }`
   - Return value `{ success: true, id: "resend_msg_test_1" }`

2. **EMAIL_ENABLED=false** — `sendVerificationEmail(...)`. Asserts:
   - `resend.emails.send` NOT called
   - Return value `{ success: true, simulated: true }`
   - `console.log` called with the simulated email banner

3. **Resend throws** — `sendVerificationEmail(...)` with `sendMock.shouldThrow = true`. Asserts:
   - Promise rejects (the error propagates)
   - `console.error` called with `Email send failed to ${to}: ${err.message}`

4. **`to` is undefined for a non-teaching function** — caller passes `to: undefined`. The function passes through to `sendEmail` which calls `resend.emails.send({ to: undefined })`. Assert this hits Resend (and probably fails — Resend rejects null `to`). Lock in current behavior.

5. **HTML wrapper structure** — `sendVerificationEmail` includes the `<!DOCTYPE html>` wrapper. Spot-check that `resend.emails.send.html` starts with `<!DOCTYPE` (or contains `ProbSolver` brand header). Lock in the template.

### Per-function tests — positional-args functions (10 functions × 3 tests = 30 tests)

For each function, three tests:
- **Happy**: assert `resend.emails.send` called with the right subject + HTML contains the function-specific dynamic fields
- **Disabled**: `EMAIL_ENABLED=false` → simulated return, no Resend call
- **Throws**: Resend throws → promise rejects

| # | Function | Args | Subject | HTML must contain |
|---|---|---|---|---|
| 1 | `sendVerificationEmail` | `(to, name, code)` | `Verify your ProbSolver account` | name, code, "15 minutes" |
| 2 | `sendWelcomeEmail` | `(to, name)` | `Welcome to ProbSolver!` | name, "Get Started", CLIENT_URL |
| 3 | `sendPasswordResetEmail` | `(to, name, code)` | `Reset your ProbSolver password` | name, code, "15 minutes" |
| 4 | `sendTeamInviteEmail` | `(to, teamName, joinCode, inviteToken)` | `Join ${teamName} on ProbSolver` | teamName, joinCode, "Join Team", inviteToken in href |
| 5 | `sendTeamApprovedEmail` | `(to, name, teamName, joinCode)` | `${teamName} is approved — start inviting!` | name, teamName, joinCode |
| 6 | `sendTeamRejectedEmail` | `(to, name, teamName, reason)` | `Update on ${teamName}` | name, teamName, reason |
| 7 | `sendEmailChangeNotification` | `(to, name)` | `ProbSolver — Email address changed` | name, "didn't make this change" |
| 8 | `sendEmailChangeVerification` | `(to, name, code)` | `Verify your new ProbSolver email` | name, code, "15 minutes" |
| 9 | `sendMemberRemovedEmail` | `(to, name, teamName)` | `${teamName} — Membership update` | name, teamName, "Continue Practicing" |
| 10 | `sendFeedbackNotificationEmail` | `(to, report)` | `🚨 CRITICAL [ProbSolver] 🐛 Bug Report: ...` for severity CRITICAL+type BUG | report.title, report.description, severity, type label, user.name |

### Per-function tests — destructured-args teaching functions (4 × 4 = 16 tests)

For each teaching function, FOUR tests: happy / disabled / throws + **missing-to guard**:

| # | Function | Args | Subject | HTML must contain | Missing-to guard |
|---|---|---|---|---|---|
| 11 | `sendTeachingSessionCreatedEmail` | `{ to, hostName, session }` | `New teaching session: ${session.title}` | hostName, session.title, formatSessionTime output | `to: null` → `{ success: false, simulated: true }`, no Resend call |
| 12 | `sendTeachingStartingSoonEmail` | `{ to, session }` | `${session.title} starts in 5 minutes` | session.title, "Starting in 5 minutes" | same |
| 13 | `sendTeachingEndedEmail` | `{ to, session }` | `Add notes for "${session.title}" to unlock AI summary` | session.title, "Post markdown notes" | same |
| 14 | `sendTeachingFlaggedEmail` | `{ to, session, flag }` | `Teaching session flagged: ${session.title}` | session.title, flag.reason (escaped) | same |

### `formatSessionTime` (2 tests)

Internal helper but worth testing because the 4 teaching emails depend on its output shape.

1. **Valid Date** — `formatSessionTime(new Date("2026-06-23T14:30:00Z"))` returns a string containing a weekday short name (matches `/Mon|Tue|Wed|Thu|Fri|Sat|Sun/`). The exact output is locale-dependent, so assert structural properties not exact string.

2. **Falsy input** — `formatSessionTime(null)` returns `"Soon"`.

These tests verify via indirect access through `sendTeachingSessionCreatedEmail` — the function isn't exported. Pass `scheduledAt: null` to one of the teaching tests and assert the rendered HTML contains "Soon".

## RED-first proofs

This sprint has NO production code changes. Every test is a regression guard documenting current behavior. All 50+ tests should PASS on first run.

If any test fails on first run, the test setup has a defect (mock wrong, fixture wrong, env mock incomplete). Fix the test before proceeding to commit.

## Production risk inventory

| Risk dimension | Status |
|---|---|
| Schema migration | None |
| Token / session invalidation | None |
| Behavior change | None — pure test additions |
| In-flight requests | None |
| Test runtime impact | ~50 mostly-synchronous tests run fast (mock-only, no I/O). Expect <1s added to suite duration. |
| Rollback | `git revert` single commit, clean |

## Backward compatibility

- No production code changes.
- Existing callers (auth.controller.js, etc.) are unaffected.

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | Mock strategy documented; module-load timing limitation acknowledged with chosen workaround (Option 1: don't test RESEND_API_KEY-null path separately); per-function test table covers all 14 send functions with explicit subject + HTML-contains assertions. |
| Scope | One new test file. Pure test foundation. Sister concerns (HTML-escape retrofit, MCP Redis) explicitly carved to 3.4.b and Phase 2. |
| Ambiguity | Per-function table is explicit. Asymmetric `if (!to) return` guard between teaching (has it) and other (doesn't have it) functions explicitly tested. |
| Backward compat | No code changes; no compatibility surface. |
| Risk floor | Lowest of the entire Sprint 3 track. Pure test additions, no production code touched. The HTML-escape concern is documented as deferred with explicit user decision (3.4.b) so no scope creep. |
| Adversarial review | The Resend SDK mock pattern (stub class with `emails.send: vi.fn()`) is the established Node.js-mocking idiom. The `vi.hoisted` state pattern for env toggle is from Sprint 3.3a/b/c. No new test infrastructure invented. |

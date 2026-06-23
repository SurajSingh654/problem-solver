# Sprint 3.4 — Email Service Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit H13 — `email.service.js` has zero tests. Add ~50 wire-level service tests covering the internal `sendEmail` core, all 14 exported send functions, and the `formatSessionTime` helper. Mock the Resend SDK at the module factory level and toggle `EMAIL_ENABLED` via a hoisted env mock.

**Architecture:** New file `server/test/services/email.service.test.js` runs against a `vi.mock("resend")` stub `Resend` class plus `vi.mock("../../src/config/env.js")` hoisted env state. Each test asserts the right `subject` + HTML-contains for its function, plus the disabled/throws variants. Teaching-session functions get an extra `to: null` guard test (those 4 functions early-return; the other 10 don't — asymmetric current behavior).

**Tech Stack:** Node 20, vitest. No new dependencies. No schema migrations. No env vars. No feature flags. **Pure test additions — no production code changes.**

---

## File map

**Server modified:** None.

**Server new:**
- `server/test/services/email.service.test.js` — ~50 tests, ~700 LoC

**Server unchanged:**
- `server/src/services/email.service.js` (the target)
- All other files

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit.
- No RED-first cycle needed — every test is a regression guard documenting current behavior. All ~50 tests should PASS on first run.
- After every step, `npm test` from `server/` and confirm count.
- Lint must end 0 errors / 0 warnings.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: `Test Files  59 passed (59)` and `Tests  1140 passed (1140)`. (Post-Sprint-3.3c baseline.)

- [ ] **Step 2: Confirm branch state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status && git branch --show-current && git log --oneline -2
```

Expected: on `feat/test-email-service`, working tree clean except pre-existing untracked items. Top commit is `6883246 Add Sprint 3.4 email service test foundation design spec`.

---

## Task 1: Write the email service test file

**Files:**
- Create: `server/test/services/email.service.test.js`

### Step 1: Create the test file with full content

Create `server/test/services/email.service.test.js`:

```javascript
// ============================================================================
// email.service — wire-level service tests (audit H13)
// ============================================================================
//
// The service has 14 exported send functions + 1 internal sendEmail that
// branches on EMAIL_ENABLED. Tests:
//   - Lock in template rendering (subject + HTML-contains assertions per fn)
//   - Cover the simulated path (EMAIL_ENABLED=false → console.log only)
//   - Cover the error-propagation path (Resend throws → caller rejects)
//   - Lock in the asymmetric missing-to guard (4 teaching fns early-return;
//     the other 10 pass undefined through to Resend)
//
// Pure test foundation — no production code changes. HTML-escape retrofit
// is deliberately deferred to Sprint 3.4.b per design spec.
// ============================================================================

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

// ── Hoisted state ────────────────────────────────────────────────────
// Tests flip EMAIL_ENABLED / Resend.send behavior between cases via these
// shared refs. `vi.hoisted` ensures they exist when the mock factories run.
const envMock = vi.hoisted(() => ({
  EMAIL_ENABLED: true,
  RESEND_API_KEY: "test_api_key",
  EMAIL_FROM: "ProbSolver <noreply@test.example>",
  CLIENT_URL: "https://probsolver.test",
}));

const resendMock = vi.hoisted(() => ({
  emailSendCalls: [],
  shouldThrow: false,
  throwError: null,
}));

// ── Module mocks ─────────────────────────────────────────────────────
// `resend` package — stub Resend class. Service does `new Resend(API_KEY)`
// at module load; the instance's `emails.send` is our recorder.
vi.mock("resend", () => ({
  Resend: class StubResend {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.emails = {
        send: vi.fn(async (args) => {
          resendMock.emailSendCalls.push(args);
          if (resendMock.shouldThrow) {
            throw resendMock.throwError || new Error("Resend down");
          }
          return { id: "resend_msg_test_1" };
        }),
      };
    }
  },
}));

// env.js — service reads RESEND_API_KEY / EMAIL_ENABLED / EMAIL_FROM /
// CLIENT_URL at module load. Mock with hoisted state so tests can toggle.
// IMPORTANT: the service's top-level `const resend = RESEND_API_KEY ? new
// Resend(RESEND_API_KEY) : null` is captured at import time. Changing
// envMock.RESEND_API_KEY at runtime does NOT re-evaluate `resend`. The
// spec accepts this — we only toggle EMAIL_ENABLED to switch between
// "real send" and "simulated" code paths. See spec for the rationale.
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    get RESEND_API_KEY() { return envMock.RESEND_API_KEY; },
    get EMAIL_FROM() { return envMock.EMAIL_FROM; },
    get CLIENT_URL() { return envMock.CLIENT_URL; },
    get EMAIL_ENABLED() { return envMock.EMAIL_ENABLED; },
  };
});

// Imports happen AFTER mocks register.
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendTeamInviteEmail,
  sendTeamApprovedEmail,
  sendTeamRejectedEmail,
  sendEmailChangeNotification,
  sendEmailChangeVerification,
  sendMemberRemovedEmail,
  sendFeedbackNotificationEmail,
  sendTeachingSessionCreatedEmail,
  sendTeachingStartingSoonEmail,
  sendTeachingEndedEmail,
  sendTeachingFlaggedEmail,
} from "../../src/services/email.service.js";

// ── Console spies (set per-test) ─────────────────────────────────────
let consoleLogSpy;
let consoleErrorSpy;

beforeEach(() => {
  // Reset recorders + defaults.
  resendMock.emailSendCalls.length = 0;
  resendMock.shouldThrow = false;
  resendMock.throwError = null;
  envMock.EMAIL_ENABLED = true;
  envMock.RESEND_API_KEY = "test_api_key";
  envMock.EMAIL_FROM = "ProbSolver <noreply@test.example>";
  envMock.CLIENT_URL = "https://probsolver.test";

  consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

// ── Helpers ──────────────────────────────────────────────────────────
function lastSentEmail() {
  return resendMock.emailSendCalls[resendMock.emailSendCalls.length - 1];
}

// ════════════════════════════════════════════════════════════════════
// CORE: sendEmail (exercised indirectly via sendVerificationEmail)
// ════════════════════════════════════════════════════════════════════
describe("sendEmail core", () => {
  it("calls Resend with from/to/subject/html when EMAIL_ENABLED=true", async () => {
    const result = await sendVerificationEmail("alice@example.com", "Alice", "123456");
    expect(result).toMatchObject({ success: true, id: "resend_msg_test_1" });
    expect(resendMock.emailSendCalls).toHaveLength(1);
    const sent = lastSentEmail();
    expect(sent).toMatchObject({
      from: "ProbSolver <noreply@test.example>",
      to: "alice@example.com",
      subject: "Verify your ProbSolver account",
    });
    expect(typeof sent.html).toBe("string");
    expect(sent.html.length).toBeGreaterThan(0);
  });

  it("returns simulated:true and skips Resend when EMAIL_ENABLED=false", async () => {
    envMock.EMAIL_ENABLED = false;
    const result = await sendVerificationEmail("alice@example.com", "Alice", "123456");
    expect(result).toEqual({ success: true, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
    // Banner logged to stdout.
    expect(consoleLogSpy).toHaveBeenCalled();
    const loggedFirstArg = consoleLogSpy.mock.calls.map(c => String(c[0])).join("\n");
    expect(loggedFirstArg).toMatch(/EMAIL.*not sent/i);
  });

  it("propagates Resend errors and logs them via console.error", async () => {
    resendMock.shouldThrow = true;
    resendMock.throwError = new Error("Network unreachable");
    await expect(
      sendVerificationEmail("alice@example.com", "Alice", "123456"),
    ).rejects.toThrow("Network unreachable");
    expect(consoleErrorSpy).toHaveBeenCalled();
    const errMsg = consoleErrorSpy.mock.calls
      .map((c) => String(c[0] ?? ""))
      .join("\n");
    expect(errMsg).toContain("Email send failed");
    expect(errMsg).toContain("alice@example.com");
  });

  it("renders a full HTML document with ProbSolver branding (template wrapper lock-in)", async () => {
    await sendVerificationEmail("alice@example.com", "Alice", "123456");
    const html = lastSentEmail().html;
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("ProbSolver");
  });

  it("passes the configured EMAIL_FROM to Resend (env wiring lock-in)", async () => {
    envMock.EMAIL_FROM = "Custom <custom@example.org>";
    await sendVerificationEmail("alice@example.com", "Alice", "123456");
    expect(lastSentEmail().from).toBe("Custom <custom@example.org>");
  });
});

// ════════════════════════════════════════════════════════════════════
// POSITIONAL-ARGS SEND FUNCTIONS (10 × 3 = 30 tests)
// ════════════════════════════════════════════════════════════════════

// Helper: run the three standard cases per function. Caller provides a
// builder that invokes the function with its specific args and an
// expectation block { subject, htmlIncludes: string[] }.
function expectStandardSendBehavior(name, invoke, expected) {
  describe(name, () => {
    it("sends with correct subject and HTML payload (happy)", async () => {
      const result = await invoke();
      expect(result).toMatchObject({ success: true, id: "resend_msg_test_1" });
      expect(resendMock.emailSendCalls).toHaveLength(1);
      const sent = lastSentEmail();
      expect(sent.subject).toBe(expected.subject);
      for (const fragment of expected.htmlIncludes) {
        expect(sent.html).toContain(fragment);
      }
    });

    it("returns simulated:true when EMAIL_ENABLED=false", async () => {
      envMock.EMAIL_ENABLED = false;
      const result = await invoke();
      expect(result).toEqual({ success: true, simulated: true });
      expect(resendMock.emailSendCalls).toHaveLength(0);
    });

    it("propagates errors when Resend throws", async () => {
      resendMock.shouldThrow = true;
      await expect(invoke()).rejects.toThrow();
    });
  });
}

expectStandardSendBehavior(
  "sendVerificationEmail",
  () => sendVerificationEmail("alice@example.com", "Alice", "123456"),
  {
    subject: "Verify your ProbSolver account",
    htmlIncludes: ["Alice", "123456", "15 minutes"],
  },
);

expectStandardSendBehavior(
  "sendWelcomeEmail",
  () => sendWelcomeEmail("alice@example.com", "Alice"),
  {
    subject: "Welcome to ProbSolver!",
    htmlIncludes: ["Alice", "Get Started", "https://probsolver.test"],
  },
);

expectStandardSendBehavior(
  "sendPasswordResetEmail",
  () => sendPasswordResetEmail("alice@example.com", "Alice", "654321"),
  {
    subject: "Reset your ProbSolver password",
    htmlIncludes: ["Alice", "654321", "15 minutes"],
  },
);

expectStandardSendBehavior(
  "sendTeamInviteEmail",
  () => sendTeamInviteEmail("alice@example.com", "Engineering", "ABC123", "invite_tok_x"),
  {
    subject: "Join Engineering on ProbSolver",
    htmlIncludes: [
      "Engineering",
      "ABC123",
      "Join Team",
      "invite_tok_x", // appears in the join URL inside the button href
      "https://probsolver.test/join?token=invite_tok_x",
    ],
  },
);

expectStandardSendBehavior(
  "sendTeamApprovedEmail",
  () => sendTeamApprovedEmail("alice@example.com", "Alice", "Engineering", "ABC123"),
  {
    subject: "Engineering is approved — start inviting!",
    htmlIncludes: ["Alice", "Engineering", "ABC123", "Go to Team Dashboard"],
  },
);

expectStandardSendBehavior(
  "sendTeamRejectedEmail",
  () =>
    sendTeamRejectedEmail(
      "alice@example.com",
      "Alice",
      "Engineering",
      "Duplicate of an existing team.",
    ),
  {
    subject: "Update on Engineering",
    htmlIncludes: [
      "Alice",
      "Engineering",
      "Duplicate of an existing team.",
    ],
  },
);

expectStandardSendBehavior(
  "sendEmailChangeNotification",
  () => sendEmailChangeNotification("alice@example.com", "Alice"),
  {
    subject: "ProbSolver — Email address changed",
    htmlIncludes: ["Alice", "didn't make this change"],
  },
);

expectStandardSendBehavior(
  "sendEmailChangeVerification",
  () => sendEmailChangeVerification("alice@example.com", "Alice", "999888"),
  {
    subject: "Verify your new ProbSolver email",
    htmlIncludes: ["Alice", "999888", "15 minutes"],
  },
);

expectStandardSendBehavior(
  "sendMemberRemovedEmail",
  () => sendMemberRemovedEmail("alice@example.com", "Alice", "Engineering"),
  {
    subject: "Engineering — Membership update",
    htmlIncludes: ["Alice", "Engineering", "Continue Practicing"],
  },
);

// Feedback notification: richer report fixture with nested user/team fields.
const sampleReport = {
  id: "report_test_1",
  type: "BUG",
  severity: "CRITICAL",
  title: "Login fails on Safari",
  description: "Submit button does nothing on Safari 17.",
  affectedArea: "Auth",
  stepsToReproduce: "1. Open Safari\n2. Click Login",
  user: { name: "Alice", email: "alice@example.com" },
  team: { name: "Engineering" },
};

expectStandardSendBehavior(
  "sendFeedbackNotificationEmail",
  () => sendFeedbackNotificationEmail("admin@example.com", sampleReport),
  {
    subject: "🚨 CRITICAL [ProbSolver] 🐛 Bug Report: Login fails on Safari",
    htmlIncludes: [
      "Login fails on Safari",
      "Submit button does nothing on Safari 17.",
      "🐛 Bug Report", // typeLabel
      "CRITICAL",      // severity badge
      "Alice (alice@example.com)",
      "Engineering",
      "Auth",
      "1. Open Safari", // stepsToReproduce
      "report_test_1",  // report ID footer
    ],
  },
);

// ════════════════════════════════════════════════════════════════════
// DESTRUCTURED-ARGS TEACHING SEND FUNCTIONS (4 × 4 = 16 tests)
// ════════════════════════════════════════════════════════════════════
// Each teaching function has an additional missing-`to` guard that the
// 10 positional functions above do NOT have. We lock in that asymmetry.

const sampleSession = {
  id: "session_1",
  title: "Intro to Sliding Window",
  topic: "Two Pointers",
  scheduledAt: new Date("2026-06-23T14:30:00Z"),
};

describe("sendTeachingSessionCreatedEmail", () => {
  it("sends with correct subject and HTML payload (happy)", async () => {
    const result = await sendTeachingSessionCreatedEmail({
      to: "alice@example.com",
      hostName: "Bob",
      session: sampleSession,
    });
    expect(result).toMatchObject({ success: true, id: "resend_msg_test_1" });
    const sent = lastSentEmail();
    expect(sent.subject).toBe(`New teaching session: ${sampleSession.title}`);
    expect(sent.html).toContain("Bob"); // hostName (escaped, plain-ascii)
    expect(sent.html).toContain(sampleSession.title);
    expect(sent.html).toContain(sampleSession.topic);
  });

  it("returns simulated:true when EMAIL_ENABLED=false", async () => {
    envMock.EMAIL_ENABLED = false;
    const result = await sendTeachingSessionCreatedEmail({
      to: "alice@example.com",
      hostName: "Bob",
      session: sampleSession,
    });
    expect(result).toEqual({ success: true, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
  });

  it("propagates errors when Resend throws", async () => {
    resendMock.shouldThrow = true;
    await expect(
      sendTeachingSessionCreatedEmail({
        to: "alice@example.com",
        hostName: "Bob",
        session: sampleSession,
      }),
    ).rejects.toThrow();
  });

  it("returns simulated:true when `to` is null (early-return guard)", async () => {
    const result = await sendTeachingSessionCreatedEmail({
      to: null,
      hostName: "Bob",
      session: sampleSession,
    });
    expect(result).toEqual({ success: false, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
  });
});

describe("sendTeachingStartingSoonEmail", () => {
  it("sends with correct subject and HTML payload (happy)", async () => {
    const result = await sendTeachingStartingSoonEmail({
      to: "alice@example.com",
      session: sampleSession,
    });
    expect(result).toMatchObject({ success: true, id: "resend_msg_test_1" });
    const sent = lastSentEmail();
    expect(sent.subject).toBe(`${sampleSession.title} starts in 5 minutes`);
    expect(sent.html).toContain(sampleSession.title);
    expect(sent.html).toContain("Starting in 5 minutes");
  });

  it("returns simulated:true when EMAIL_ENABLED=false", async () => {
    envMock.EMAIL_ENABLED = false;
    const result = await sendTeachingStartingSoonEmail({
      to: "alice@example.com",
      session: sampleSession,
    });
    expect(result).toEqual({ success: true, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
  });

  it("propagates errors when Resend throws", async () => {
    resendMock.shouldThrow = true;
    await expect(
      sendTeachingStartingSoonEmail({
        to: "alice@example.com",
        session: sampleSession,
      }),
    ).rejects.toThrow();
  });

  it("returns simulated:true when `to` is null (early-return guard)", async () => {
    const result = await sendTeachingStartingSoonEmail({
      to: null,
      session: sampleSession,
    });
    expect(result).toEqual({ success: false, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
  });
});

describe("sendTeachingEndedEmail", () => {
  it("sends with correct subject and HTML payload (happy)", async () => {
    const result = await sendTeachingEndedEmail({
      to: "alice@example.com",
      session: sampleSession,
    });
    expect(result).toMatchObject({ success: true, id: "resend_msg_test_1" });
    const sent = lastSentEmail();
    expect(sent.subject).toBe(`Add notes for "${sampleSession.title}" to unlock AI summary`);
    expect(sent.html).toContain(sampleSession.title);
    expect(sent.html).toContain("Post markdown notes");
  });

  it("returns simulated:true when EMAIL_ENABLED=false", async () => {
    envMock.EMAIL_ENABLED = false;
    const result = await sendTeachingEndedEmail({
      to: "alice@example.com",
      session: sampleSession,
    });
    expect(result).toEqual({ success: true, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
  });

  it("propagates errors when Resend throws", async () => {
    resendMock.shouldThrow = true;
    await expect(
      sendTeachingEndedEmail({
        to: "alice@example.com",
        session: sampleSession,
      }),
    ).rejects.toThrow();
  });

  it("returns simulated:true when `to` is null (early-return guard)", async () => {
    const result = await sendTeachingEndedEmail({
      to: null,
      session: sampleSession,
    });
    expect(result).toEqual({ success: false, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
  });
});

describe("sendTeachingFlaggedEmail", () => {
  it("sends with correct subject and HTML payload (happy)", async () => {
    const result = await sendTeachingFlaggedEmail({
      to: "admin@example.com",
      session: sampleSession,
      flag: { reason: "Inappropriate content shared during session." },
    });
    expect(result).toMatchObject({ success: true, id: "resend_msg_test_1" });
    const sent = lastSentEmail();
    expect(sent.subject).toBe(`Teaching session flagged: ${sampleSession.title}`);
    expect(sent.html).toContain(sampleSession.title);
    expect(sent.html).toContain("Inappropriate content"); // flag.reason (escaped)
  });

  it("returns simulated:true when EMAIL_ENABLED=false", async () => {
    envMock.EMAIL_ENABLED = false;
    const result = await sendTeachingFlaggedEmail({
      to: "admin@example.com",
      session: sampleSession,
      flag: { reason: "..." },
    });
    expect(result).toEqual({ success: true, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
  });

  it("propagates errors when Resend throws", async () => {
    resendMock.shouldThrow = true;
    await expect(
      sendTeachingFlaggedEmail({
        to: "admin@example.com",
        session: sampleSession,
        flag: { reason: "..." },
      }),
    ).rejects.toThrow();
  });

  it("returns simulated:true when `to` is null (early-return guard)", async () => {
    const result = await sendTeachingFlaggedEmail({
      to: null,
      session: sampleSession,
      flag: { reason: "..." },
    });
    expect(result).toEqual({ success: false, simulated: true });
    expect(resendMock.emailSendCalls).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// formatSessionTime (exercised indirectly via sendTeachingSessionCreatedEmail)
// ════════════════════════════════════════════════════════════════════
describe("formatSessionTime (via sendTeachingSessionCreatedEmail)", () => {
  it("formats a valid Date into a weekday-prefixed string", async () => {
    // The exact output is locale-dependent. Assert structural properties:
    // includes a weekday short name and isn't the "Soon" fallback.
    await sendTeachingSessionCreatedEmail({
      to: "alice@example.com",
      hostName: "Bob",
      session: { ...sampleSession, scheduledAt: new Date("2026-06-23T14:30:00Z") },
    });
    const html = lastSentEmail().html;
    expect(html).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
    expect(html).not.toContain("📅 Soon");
  });

  it("renders 'Soon' for falsy scheduledAt", async () => {
    await sendTeachingSessionCreatedEmail({
      to: "alice@example.com",
      hostName: "Bob",
      session: { ...sampleSession, scheduledAt: null },
    });
    const html = lastSentEmail().html;
    expect(html).toContain("Soon");
  });
});
```

### Step 2: Run the new test file alone

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/email.service.test.js 2>&1 | tail -30
```

Expected: **~52 tests pass** on the first run. All tests are regression guards documenting current behavior; none are RED-first.

If any test fails:
- **Mock issue**: most likely the `envMock` getter pattern OR the `Resend` class import. Re-check the mock factory.
- **Subject string mismatch**: check the exact emoji prefix on feedback notification (`🚨`, `⚠️`, `📋`). The exact byte sequence matters.
- **HTML-contains mismatch**: the test asserts substring inclusion. If the controller HTML actually wraps a value differently (e.g. `<strong>${name}</strong>` vs raw `${name}`), the substring is still present — verify the exact string passed.
- **formatSessionTime locale**: in CI, the `toLocaleString` may default to a different locale. The test asserts `/Mon|Tue|Wed|Thu|Fri|Sat|Sun/` — that's English short weekday names. If the test runs under a non-English locale (rare in CI), the assertion may fail. If it does, document and update.

### Step 3: Run the FULL server suite

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: **~1192 tests passing** (1140 baseline + ~52 new). 60 test files.

If any OTHER test file fails, the env-mock or resend mock leaked outside the file. The hoisted state pattern should keep mocks scoped — verify no test in another file imports `resend` or `email.service.js` with mocks expecting different behavior. (Unlikely; previous sprints already mock these where needed.)

### Step 4: Lint

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -5
```

Expected: 0 errors / 0 warnings.

### Step 5: Self-review the diff

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
```

Expected: only the new test file is untracked. No modified production files.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && wc -l server/test/services/email.service.test.js
```

Expected: roughly 600-700 lines.

### Step 6: DO NOT commit yet — Task 2 (commit + gates + push + FF-merge) follows

---

## Task 2: Commit + final gates + push + FF-merge

### Step 1: Commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/test/services/email.service.test.js && git status
```

Verify only that one file is staged (plus pre-existing untracked items left out).

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git commit -m "Add email service test foundation"
```

Single-line subject. NO Co-Authored-By trailer.

### Step 2: Self-review the commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD --stat
```

Confirm: exactly 1 new file. No accidents.

### Step 3: Server gates

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3 && echo "---" && npx prisma migrate status 2>&1 | grep -i "up to date\|drift\|error" | tail -3
```

Expected:
- Lint: 0/0
- Tests: ~1192 passed (60 files)
- Migrate status: "Database schema is up to date!"

### Step 4: Client gates (sanity, no client changes)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build 2>&1 | tail -5
```

Expected: 0 warnings, successful build.

### Step 5: Push the feature branch

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/test-email-service --no-verify
```

### Step 6: FF-merge to main and push

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/test-email-service

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/test-email-service
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 7: Update the roadmap status tracker

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 3.4 row:

```markdown
| 3.4 | Email service test foundation (H13 — template rendering, missing-email handling, service-failure fallback, zero tests today) | queued | — | — |
```

Replace with:

```markdown
| 3.4 | Email service test foundation (H13 — template rendering + missing-email + service-failure tests across 14 send functions; HTML-escape retrofit deferred to 3.4.b) | ✅ shipped | [`2026-06-23-test-email-service-design.md`](../specs/2026-06-23-test-email-service-design.md) | 2026-06-23 |
```

(If 3.4.b is not yet a row, leave that part as-is — it'll be added if/when the user approves the HTML-escape retrofit sprint.)

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 3.4 (email service test foundation) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 8: Post-deploy verification

Railway autodeploys main. After deploy completes:

- [ ] Tail Railway server logs. Confirm the email service still functions on real-world flows (registration, password reset, etc.) — the test foundation should not affect runtime behavior since no production code was changed.
- [ ] No 500 / latency regressions on email-triggering endpoints.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| 5 core sendEmail tests | Task 1 Step 1 (CORE: sendEmail block) |
| 10 positional × 3 = 30 tests | Task 1 Step 1 (POSITIONAL-ARGS block via `expectStandardSendBehavior` helper) |
| 4 teaching × 4 (incl missing-to guard) = 16 tests | Task 1 Step 1 (DESTRUCTURED-ARGS TEACHING block — 4 explicit describes) |
| formatSessionTime 2 tests | Task 1 Step 1 (formatSessionTime block, exercised via sendTeachingSessionCreatedEmail) |
| Resend SDK mock as stub class | Task 1 Step 1 (vi.mock("resend") block) |
| Env mock with hoisted state for EMAIL_ENABLED toggle | Task 1 Step 1 (vi.mock("../../src/config/env.js") with getters) |
| Module-load timing limitation accepted | Documented inline in the env mock comment |
| HTML-escape retrofit deferred to 3.4.b | Out of scope (per spec); plan doesn't touch email.service.js |
| Single commit | Task 2 Step 1 |
| Final gates + push + FF-merge | Task 2 Steps 3-6 |
| Roadmap update | Task 2 Step 7 |

**Type / signature consistency:**

- `envMock` state shape (EMAIL_ENABLED, RESEND_API_KEY, EMAIL_FROM, CLIENT_URL) matches the env.js exports.
- `resendMock` state shape (emailSendCalls, shouldThrow, throwError) used consistently across all tests.
- `expectStandardSendBehavior(name, invoke, expected)` signature: `expected = { subject: string, htmlIncludes: string[] }` — used identically by all 10 positional-args functions.
- Teaching describes use explicit per-function `describe` blocks (NOT the helper) because they have an extra missing-to guard test.

**Placeholder scan:** No "TBD" / "TODO" / "fill in details." Every code step has the complete code block. Each per-function test specifies its exact subject + the expected HTML substrings.

**Risk floor:** Lowest possible for this sprint — pure test additions, no production code changes. The only risk surface is the test file itself: if the `Resend` class stub or env mock pattern is wrong, tests fail loudly but production is unaffected. Rollback is `git revert` on a single commit.

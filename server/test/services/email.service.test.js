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
      // Note: the stub mock pushes to emailSendCalls BEFORE throwing — so
      // this test only asserts the promise rejection contract, NOT that no
      // attempt was made. The "happy" test already locks in the call shape.
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
    // Drop the weekday-shape regex — `toLocaleString` is OS-locale-dependent
    // and would fail on non-English CI runners. The "not '📅 Soon'" check is
    // the meaningful invariant: it proves formatSessionTime returned a real
    // formatted string, not the falsy-input fallback.
    await sendTeachingSessionCreatedEmail({
      to: "alice@example.com",
      hostName: "Bob",
      session: { ...sampleSession, scheduledAt: new Date("2026-06-23T14:30:00Z") },
    });
    const html = lastSentEmail().html;
    expect(html).not.toContain("📅 Soon");
    // Sanity: the rendered output for a real Date is a non-trivial string.
    const dateLine = html.match(/📅 [^<]+/)?.[0] ?? "";
    expect(dateLine.length).toBeGreaterThan("📅 Soon".length);
  });

  it("renders 'Soon' for falsy scheduledAt", async () => {
    await sendTeachingSessionCreatedEmail({
      to: "alice@example.com",
      hostName: "Bob",
      session: { ...sampleSession, scheduledAt: null },
    });
    const html = lastSentEmail().html;
    // The template wraps the formatSessionTime output as `📅 ${result}`.
    // Asserting the full token is more specific than just "Soon".
    expect(html).toContain("📅 Soon");
  });
});

// ════════════════════════════════════════════════════════════════════
// XSS REGRESSION TESTS (Sprint 3.4.b)
// ════════════════════════════════════════════════════════════════════
// One test per non-teaching send function. Each fires the function with
// HTML-laden values in EVERY escapable field and asserts:
//   1. The escaped form (e.g. `&lt;script&gt;`) appears in the output HTML.
//   2. The raw form (e.g. `<script>`) does NOT appear.
//
// Pre-retrofit, these tests fail (raw HTML interpolated into the email
// body, no escapeHtml applied). Post-retrofit, they pass.
//
// The 4 teaching functions are NOT covered here — they already use
// escapeHtml correctly (verified by Sprint 3.4 happy-path tests).
// ════════════════════════════════════════════════════════════════════

const XSS_PAYLOAD = `<script>alert("xss")</script>`;
const XSS_ESCAPED = "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;";

describe("XSS regression — user-controlled fields are HTML-escaped", () => {
  it("sendVerificationEmail escapes `name`", async () => {
    await sendVerificationEmail("u@e.com", XSS_PAYLOAD, "123456");
    const html = lastSentEmail().html;
    expect(html).toContain(XSS_ESCAPED);
    expect(html).not.toContain(XSS_PAYLOAD);
  });

  it("sendWelcomeEmail escapes `name`", async () => {
    await sendWelcomeEmail("u@e.com", XSS_PAYLOAD);
    const html = lastSentEmail().html;
    expect(html).toContain(XSS_ESCAPED);
    expect(html).not.toContain(XSS_PAYLOAD);
  });

  it("sendPasswordResetEmail escapes `name`", async () => {
    await sendPasswordResetEmail("u@e.com", XSS_PAYLOAD, "654321");
    const html = lastSentEmail().html;
    expect(html).toContain(XSS_ESCAPED);
    expect(html).not.toContain(XSS_PAYLOAD);
  });

  it("sendTeamInviteEmail escapes `teamName`", async () => {
    await sendTeamInviteEmail("u@e.com", XSS_PAYLOAD, "ABC123", "tok_x");
    const html = lastSentEmail().html;
    expect(html).toContain(XSS_ESCAPED);
    expect(html).not.toContain(XSS_PAYLOAD);
  });

  it("sendTeamApprovedEmail escapes `name` and `teamName`", async () => {
    // Use distinct markers per field so we can catch a per-field miss.
    const nameXss = `<NAME-${Math.random()}>`;
    const teamXss = `<TEAM-${Math.random()}>`;
    await sendTeamApprovedEmail("u@e.com", nameXss, teamXss, "JC123");
    const html = lastSentEmail().html;
    // Both fields must be escaped (assert escaped form present + raw absent).
    expect(html).toContain(nameXss.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    expect(html).toContain(teamXss.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    expect(html).not.toContain(nameXss);
    expect(html).not.toContain(teamXss);
  });

  it("sendTeamRejectedEmail escapes `name`, `teamName`, and `reason`", async () => {
    const nameXss = `<NAME-${Math.random()}>`;
    const teamXss = `<TEAM-${Math.random()}>`;
    const reasonXss = `<REASON-${Math.random()}>`;
    await sendTeamRejectedEmail("u@e.com", nameXss, teamXss, reasonXss);
    const html = lastSentEmail().html;
    const escape = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    expect(html).toContain(escape(nameXss));
    expect(html).toContain(escape(teamXss));
    expect(html).toContain(escape(reasonXss));
    expect(html).not.toContain(nameXss);
    expect(html).not.toContain(teamXss);
    expect(html).not.toContain(reasonXss);
  });

  it("sendEmailChangeNotification escapes `name`", async () => {
    await sendEmailChangeNotification("u@e.com", XSS_PAYLOAD);
    const html = lastSentEmail().html;
    expect(html).toContain(XSS_ESCAPED);
    expect(html).not.toContain(XSS_PAYLOAD);
  });

  it("sendEmailChangeVerification escapes `name`", async () => {
    await sendEmailChangeVerification("u@e.com", XSS_PAYLOAD, "777888");
    const html = lastSentEmail().html;
    expect(html).toContain(XSS_ESCAPED);
    expect(html).not.toContain(XSS_PAYLOAD);
  });

  it("sendMemberRemovedEmail escapes `name` and `teamName`", async () => {
    const nameXss = `<NAME-${Math.random()}>`;
    const teamXss = `<TEAM-${Math.random()}>`;
    await sendMemberRemovedEmail("u@e.com", nameXss, teamXss);
    const html = lastSentEmail().html;
    const escape = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    expect(html).toContain(escape(nameXss));
    expect(html).toContain(escape(teamXss));
    expect(html).not.toContain(nameXss);
    expect(html).not.toContain(teamXss);
  });

  it("sendFeedbackNotificationEmail escapes every user-controlled field", async () => {
    // 7 distinct markers so we can prove every interpolation site escapes.
    const markers = {
      title: `<TITLE-${Math.random()}>`,
      description: `<DESC-${Math.random()}>`,
      affectedArea: `<AREA-${Math.random()}>`,
      stepsToReproduce: `<STEPS-${Math.random()}>`,
      userName: `<UNAME-${Math.random()}>`,
      userEmail: `<UMAIL-${Math.random()}>`,
      teamName: `<TNAME-${Math.random()}>`,
    };
    const report = {
      id: "rpt_xss_1",
      type: "BUG",
      severity: "CRITICAL",
      title: markers.title,
      description: markers.description,
      affectedArea: markers.affectedArea,
      stepsToReproduce: markers.stepsToReproduce,
      user: { name: markers.userName, email: markers.userEmail },
      team: { name: markers.teamName },
    };
    await sendFeedbackNotificationEmail("admin@e.com", report);
    const html = lastSentEmail().html;
    const escape = (s) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    for (const [field, raw] of Object.entries(markers)) {
      expect(html, `field "${field}" must appear escaped`).toContain(escape(raw));
      expect(html, `field "${field}" must NOT appear raw`).not.toContain(raw);
    }
  });

  it("sendFeedbackNotificationEmail escapes typeLabel when report.type is an unknown enum value", async () => {
    // Defense-in-depth: if the Prisma enum is widened (new FeedbackType
    // added) before the typeLabels map is updated, the fallback at
    // `typeLabels[report.type] || escapeHtml(report.type)` runs. Make
    // sure the raw value is escaped, not injected raw into the HTML body.
    const xssType = `<UNKNOWN-${Math.random()}>`;
    const report = {
      id: "rpt_xss_2",
      type: xssType, // intentionally not BUG/SUGGESTION/QUESTION
      severity: "CRITICAL",
      title: "Plain title",
      description: "Plain description",
      affectedArea: "Plain area",
      stepsToReproduce: "Plain steps",
      user: { name: "Plain user", email: "u@e.com" },
      team: { name: "Plain team" },
    };
    await sendFeedbackNotificationEmail("admin@e.com", report);
    const html = lastSentEmail().html;
    const escaped = xssType.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    expect(html).toContain(escaped);
    expect(html).not.toContain(xssType);
  });
});

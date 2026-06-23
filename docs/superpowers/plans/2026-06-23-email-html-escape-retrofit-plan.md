# Sprint 3.4.b — Email Service HTML-Escape Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the existing private `escapeHtml` helper to every user-controlled HTML body interpolation across the 10 non-teaching email send functions. Closes a defense-in-depth XSS gap flagged in Sprint 3.4's code review. Match the existing pattern the 4 teaching functions already use.

**Architecture:** Per-call-site escaping (NOT helper-level). Each interpolation like `${name}` becomes `${escapeHtml(name)}` in the function body. The shared helpers (`paragraph`, `heading`, `button`, `codeBlock`) remain unchanged — some callers legitimately pass pre-built HTML markup. Update the historical source comment to document the deliberate retrofit. Add 10 RED-first XSS regression tests (one per function).

**Tech Stack:** Node 20, vitest. No new dependencies. No schema migrations. No env vars. No feature flags. No new abstractions.

---

## File map

**Server modified:**
- `server/src/services/email.service.js`
  - 10 non-teaching send functions: wrap user-controlled fields with `escapeHtml(...)` at each interpolation site (~22-25 individual edits)
  - The historical source comment at line 447-450 above `function escapeHtml(str)`: updated to document the Sprint 3.4.b retrofit
- `server/test/services/email.service.test.js`
  - Add 10 new XSS regression tests (one `describe`/`it` per function)

**Server unchanged:**
- The 4 teaching-session functions (already correct)
- The shared helpers: `emailWrapper`, `codeBlock`, `paragraph`, `heading`, `button`, `formatSessionTime`
- Subject lines (plain text, not HTML — escape would distort visible inbox display)
- URLs / hrefs (server-generated tokens are URL-safe by construction)
- All other files

**Client unchanged.** Server-only sprint.

---

## Conventions

- Single-line commit subject (per memory), no Co-Authored-By trailer.
- Single commit covers all 10 function retrofits + comment update + 10 XSS tests.
- TDD on the new XSS tests: write tests FIRST (RED), confirm all 10 fail against unmodified code (proof the escape is needed), apply retrofit (GREEN). The 53 existing Sprint 3.4 tests continue to pass on both sides — their fixtures use plain alphanumeric values where `escapeHtml('Alice') === 'Alice'`.
- Lint must end 0 errors / 0 warnings.
- Auto-merge to main per memory pref after final gates pass.

---

## Pre-flight: capture baseline

- [ ] **Step 1: Confirm baseline test count**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: `Test Files  60 passed (60)` and `Tests  1193 passed (1193)`. (Post-Sprint-3.4 baseline.)

- [ ] **Step 2: Confirm branch state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status && git branch --show-current && git log --oneline -2
```

Expected: on `feat/email-html-escape-retrofit`, working tree clean except pre-existing untracked items. Top commit is `7e2324f Add Sprint 3.4.b email service HTML-escape retrofit design spec`.

---

## Task 1: Add 10 RED-first XSS regression tests

**Files:**
- Modify: `server/test/services/email.service.test.js`

### Step 1: Add the XSS tests at the end of the test file

Open `server/test/services/email.service.test.js`. Add this complete new block AT THE END of the file (after the closing of the last existing `describe`):

```javascript
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
    const escape = (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    const escape = (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    const escape = (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const [field, raw] of Object.entries(markers)) {
      expect(html, `field "${field}" must appear escaped`).toContain(escape(raw));
      expect(html, `field "${field}" must NOT appear raw`).not.toContain(raw);
    }
  });
});
```

### Step 2: Run the test file alone — expect 10 RED failures (pre-retrofit)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/email.service.test.js -t "XSS regression" 2>&1 | tail -30
```

Expected: **10 tests FAIL**. Each failure asserts the escaped form is present in the HTML; pre-retrofit, the controller interpolates raw, so the assertion `expect(html).toContain(XSS_ESCAPED)` fails (only the raw form appears).

The failures are the security receipts. Document the 10 failure modes briefly (one line per).

### Step 3: Run the FULL test file — expect 53 still PASS + 10 FAIL (63 total)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/email.service.test.js 2>&1 | tail -10
```

Expected: 53 passing (the existing Sprint 3.4 tests with plain alphanumeric fixtures) + 10 failing (the new XSS tests).

### Step 4: DO NOT commit yet — move to Task 2 to apply the retrofit

---

## Task 2: Apply the `escapeHtml` retrofit to all 10 non-teaching functions

**Files:**
- Modify: `server/src/services/email.service.js`

### Step 1: Update `sendVerificationEmail` (line 118-128)

Find:

```javascript
export async function sendVerificationEmail(to, name, code) {
  const html = emailWrapper(`
    ${heading(`Welcome, ${name}!`)}
    ${paragraph("Thanks for signing up for ProbSolver. Enter this code to verify your email:")}
    ${codeBlock(code)}
    ${paragraph('This code expires in <strong style="color:#f3f4f6;">15 minutes</strong>.')}
    ${paragraph("If you didn't create this account, you can safely ignore this email.")}
  `);

  return sendEmail(to, "Verify your ProbSolver account", html);
}
```

Replace with:

```javascript
export async function sendVerificationEmail(to, name, code) {
  const html = emailWrapper(`
    ${heading(`Welcome, ${escapeHtml(name)}!`)}
    ${paragraph("Thanks for signing up for ProbSolver. Enter this code to verify your email:")}
    ${codeBlock(code)}
    ${paragraph('This code expires in <strong style="color:#f3f4f6;">15 minutes</strong>.')}
    ${paragraph("If you didn't create this account, you can safely ignore this email.")}
  `);

  return sendEmail(to, "Verify your ProbSolver account", html);
}
```

### Step 2: Update `sendWelcomeEmail` (line 132-143)

Find:

```javascript
    ${heading(`You're in, ${name}!`)}
```

Replace with:

```javascript
    ${heading(`You're in, ${escapeHtml(name)}!`)}
```

### Step 3: Update `sendPasswordResetEmail` (line 147-157)

Find:

```javascript
    ${paragraph(`Hi ${name}, we received a request to reset your password. Enter this code:`)}
```

Replace with:

```javascript
    ${paragraph(`Hi ${escapeHtml(name)}, we received a request to reset your password. Enter this code:`)}
```

### Step 4: Update `sendTeamInviteEmail` (line 161-177)

Find:

```javascript
    ${heading(`You're invited to ${teamName}`)}
```

Replace with:

```javascript
    ${heading(`You're invited to ${escapeHtml(teamName)}`)}
```

(The `joinCode` in `${codeBlock(joinCode)}` and the URL stay raw — both are server-generated and URL-safe by construction.)

### Step 5: Update `sendTeamApprovedEmail` (line 181-192)

Find:

```javascript
    ${paragraph(`Great news, ${name}! Your team <strong style="color:#f3f4f6;">${teamName}</strong> has been approved and is now active.`)}
```

Replace with:

```javascript
    ${paragraph(`Great news, ${escapeHtml(name)}! Your team <strong style="color:#f3f4f6;">${escapeHtml(teamName)}</strong> has been approved and is now active.`)}
```

### Step 6: Update `sendTeamRejectedEmail` (line 196-208)

Find:

```javascript
    ${paragraph(`Hi ${name}, your team <strong style="color:#f3f4f6;">${teamName}</strong> was not approved.`)}
    <div style="background:#0f1117;border:1px solid #ef4444;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#fca5a5;"><strong>Reason:</strong> ${reason}</p>
    </div>
```

Replace with:

```javascript
    ${paragraph(`Hi ${escapeHtml(name)}, your team <strong style="color:#f3f4f6;">${escapeHtml(teamName)}</strong> was not approved.`)}
    <div style="background:#0f1117;border:1px solid #ef4444;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#fca5a5;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
    </div>
```

### Step 7: Update `sendEmailChangeNotification` (line 212-219)

Find:

```javascript
    ${paragraph(`Hi ${name}, your ProbSolver account email has been changed. If you didn't make this change, please contact the platform administrator immediately.`)}
```

Replace with:

```javascript
    ${paragraph(`Hi ${escapeHtml(name)}, your ProbSolver account email has been changed. If you didn't make this change, please contact the platform administrator immediately.`)}
```

### Step 8: Update `sendEmailChangeVerification` (line 223-232)

Find:

```javascript
    ${paragraph(`Hi ${name}, enter this code to confirm your new email address:`)}
```

Replace with:

```javascript
    ${paragraph(`Hi ${escapeHtml(name)}, enter this code to confirm your new email address:`)}
```

### Step 9: Update `sendMemberRemovedEmail` (line 236-245)

Find:

```javascript
    ${paragraph(`Hi ${name}, you have been removed from <strong style="color:#f3f4f6;">${teamName}</strong>. You've been switched to your personal practice space.`)}
```

Replace with:

```javascript
    ${paragraph(`Hi ${escapeHtml(name)}, you have been removed from <strong style="color:#f3f4f6;">${escapeHtml(teamName)}</strong>. You've been switched to your personal practice space.`)}
```

### Step 10: Update `sendFeedbackNotificationEmail` (lines 251-331)

This function has 7 user-controlled fields in the HTML body. Find each interpolation and wrap with `escapeHtml(...)`. The locations are:

**Around line 281** (`From` row in the table):
```javascript
<td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${report.user?.name || "Unknown"} (${report.user?.email || ""})</td>
```

Replace with:
```javascript
<td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${escapeHtml(report.user?.name || "Unknown")} (${escapeHtml(report.user?.email || "")})</td>
```

**Around line 288** (`Team` row):
```javascript
<td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${report.team.name}</td>
```

Replace with:
```javascript
<td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${escapeHtml(report.team.name)}</td>
```

**Around line 297** (`Area` row):
```javascript
<td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${report.affectedArea}</td>
```

Replace with:
```javascript
<td style="padding:4px 0;font-size:12px;color:#f3f4f6;">${escapeHtml(report.affectedArea)}</td>
```

**Around lines 304-305** (title + description):
```javascript
<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f3f4f6;">${report.title}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#d1d5db;">${report.description}</p>
```

Replace with:
```javascript
<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#f3f4f6;">${escapeHtml(report.title)}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#d1d5db;">${escapeHtml(report.description)}</p>
```

**Around line 312** (steps to reproduce):
```javascript
<p style="margin:0;font-size:12px;line-height:1.6;color:#d1d5db;white-space:pre-wrap;">${report.stepsToReproduce}</p>
```

Replace with:
```javascript
<p style="margin:0;font-size:12px;line-height:1.6;color:#d1d5db;white-space:pre-wrap;">${escapeHtml(report.stepsToReproduce)}</p>
```

**Around line 317** (report ID footer):
```javascript
<p style="margin:0;font-size:11px;color:#6b7280;">Report ID: ${report.id}</p>
```

Replace with:
```javascript
<p style="margin:0;font-size:11px;color:#6b7280;">Report ID: ${escapeHtml(report.id)}</p>
```

(The `typeLabel`, `severityLabel`, `severityColor` interpolations come from server-controlled lookup tables — those stay raw.)

### Step 11: Update the historical source comment

Find (around lines 447-450):

```javascript
// Defense-in-depth: callers shouldn't be sending pre-escaped strings,
// but if they are we don't want to break the layout. Keep this private —
// the existing code paths use raw template-literal interpolation and we
// don't want to retrofit them.
function escapeHtml(str) {
```

Replace with:

```javascript
// HTML-escape helper. Defense-in-depth applied across ALL 14 send
// functions (Sprint 3.4.b — 2026-06-23). Originally only the 4 teaching
// functions used it; the historical comment said "we don't want to
// retrofit them" but the production bar reversed that decision. Future
// callers MUST escapeHtml any user-controlled field before interpolating
// into HTML body templates. Subject lines and URLs stay raw (subjects
// are plain text; URLs use server-generated tokens with no special chars).
function escapeHtml(str) {
```

### Step 12: Re-run the XSS tests alone — expect 10 PASS

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/email.service.test.js -t "XSS regression" 2>&1 | tail -15
```

Expected: 10/10 PASS.

### Step 13: Run the full test file — expect 63 PASS total (53 existing + 10 new)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx vitest run test/services/email.service.test.js 2>&1 | tail -10
```

Expected: 63/63 PASS. The 53 existing Sprint 3.4 tests stay green because their fixtures use plain alphanumeric strings where `escapeHtml('Alice') === 'Alice'`.

### Step 14: Run the FULL server suite

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3
```

Expected: **1203 tests passing** (1193 baseline + 10 new XSS). 60 test files.

If any OTHER test fails (auth controller tests that exercise email-sending fire-and-forget paths), check whether the test's fixture sends a name containing HTML characters. Unlikely — Sprint 3.3a/b/c tests use plain `"Alice"` names.

### Step 15: Lint

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint 2>&1 | tail -5
```

Expected: 0 errors / 0 warnings.

### Step 16: Self-review the diff

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff --stat server/
cd /Users/surajsingh/Downloads/Projects/problem-solver && git diff server/src/services/email.service.js | wc -l
```

Sanity-check the size of the diff. Expected: ~50-80 lines of diff (10 functions × 1-2 lines avg + the comment update).

Also grep for any missed interpolations of user-controlled fields in the 10 non-teaching functions:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "\${name\}\|\${teamName\}\|\${reason\}\|\${report\." server/src/services/email.service.js
```

Each match should be inside an `escapeHtml(...)` wrap. If any bare interpolation remains, it's a missed site — fix and re-run tests.

### Step 17: DO NOT commit yet — manual smoke (Task 3) first

---

## Task 3: Manual smoke (no production-visible impact, but verify server boots)

The retrofit has zero behavioral impact on plain-alphanumeric inputs (the universal case). Manual smoke is a sanity check that the import chain still works.

### Step 1: Start the dev server

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && (npm run dev > /tmp/sprint34b-dev.log 2>&1 &) && sleep 6 && tail -5 /tmp/sprint34b-dev.log
```

Wait until `Server running on port 5000` appears.

### Step 2: Hit the health endpoint

```bash
curl -sS -o /dev/null -w "health=%{http_code}\n" http://localhost:5000/health
```

Expected: `health=200`. Proves the server booted cleanly with the modified email.service.js — no import errors.

### Step 3: Stop the dev server

```bash
pkill -f "nodemon src/index.js" 2>&1 ; sleep 1 ; pgrep -fl "node src/index.js" 2>&1 || echo "stopped"
```

---

## Task 4: Commit + final gates + push + FF-merge

### Step 1: Stage and commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add server/src/services/email.service.js server/test/services/email.service.test.js && git status
```

Verify only those 2 files staged.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git commit -m "Escape user-controlled fields in 10 non-teaching email templates"
```

Single-line subject. NO Co-Authored-By trailer.

### Step 2: Self-review the commit

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git show HEAD --stat
```

Confirm exactly 2 files modified.

### Step 3: Server gates

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint && npm test 2>&1 | grep -E "Test Files|Tests " | tail -3 && echo "---" && npx prisma migrate status 2>&1 | grep -i "up to date\|drift\|error" | tail -3
```

Expected:
- Lint: 0/0
- Tests: 1203 passed (60 files)
- Migrate status: "Database schema is up to date!"

### Step 4: Client gates (sanity, no client changes)

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint && npm run build 2>&1 | tail -5
```

Expected: 0 warnings, successful build.

### Step 5: Push the feature branch

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/email-html-escape-retrofit --no-verify
```

### Step 6: FF-merge to main and push

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git fetch origin main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline origin/main..feat/email-html-escape-retrofit

cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main
cd /Users/surajsingh/Downloads/Projects/problem-solver && git merge --ff-only feat/email-html-escape-retrofit
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 7: Update the roadmap status tracker

In `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`, find the Sprint 3.4.b row:

```markdown
| 3.4.b | Email service HTML-escape retrofit (10 non-teaching send functions interpolate user-controlled values raw; defense-in-depth XSS hardening per code review) | queued | — | — |
```

Replace with:

```markdown
| 3.4.b | Email service HTML-escape retrofit (10 non-teaching send functions now escape user-controlled fields; defense-in-depth XSS hardening) | ✅ shipped | [`2026-06-23-email-html-escape-retrofit-design.md`](../specs/2026-06-23-email-html-escape-retrofit-design.md) | 2026-06-23 |
```

Commit + push:

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 3.4.b (email service HTML-escape retrofit) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main --no-verify
```

### Step 8: Post-deploy verification

Railway autodeploys main. After deploy completes:

- [ ] Confirm `/health` returns 200 (server booted with modified `email.service.js`).
- [ ] Trigger any one email-sending flow (e.g. password reset for a test account) and verify the email arrives normally.
- [ ] No 500 / latency regressions on auth-related endpoints (registration, password reset, team invite).

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| 10 functions × user-controlled fields escape | Task 2 Steps 1-10 (one step per function with exact find/replace) |
| Historical source comment update | Task 2 Step 11 |
| 10 XSS regression tests | Task 1 Step 1 (full test block verbatim) |
| RED-first proof (10 fail against unmodified code) | Task 1 Step 2 |
| Existing 53 tests stay green | Task 2 Step 13 (assertion) |
| Per-call-site escape (no helper change) | Task 2 Steps 1-10 (every step wraps at the interpolation site, not at the helper level) |
| Subject lines unchanged | Steps 1-10 do NOT touch the `sendEmail(to, "subject", html)` argument |
| URLs / hrefs unchanged | Steps 1-10 do NOT touch any `${joinUrl}`, `${CLIENT_URL}` interpolation |
| Single commit | Task 4 Step 1 |
| Final gates + push + FF-merge | Task 4 Steps 3-6 |
| Roadmap update | Task 4 Step 7 |

**Type / signature consistency:**

- `escapeHtml(str)` already exists in `email.service.js` line 451 — no signature change. The retrofit just adds call sites.
- The XSS test pattern is uniform across all 10: payload contains HTML special chars, assert escaped form is present + raw form is absent.
- Markers in multi-field tests (`sendTeamApprovedEmail`, `sendTeamRejectedEmail`, etc.) use distinct random-suffixed strings so a per-field miss is caught (the assertion would name which field failed).

**Placeholder scan:** No "TBD" / "TODO" / "fill in details." Every code step has the complete code block — find/replace pairs explicit per function.

**Risk floor:** Low. Pure call-site additions of an existing helper. The XSS tests provide RED-first proof that the gap exists in unmodified code and is closed by the fix. The 53 existing tests serve as regression coverage for normal-input behavior. No production code path is changed for the universal case of plain-alphanumeric inputs.

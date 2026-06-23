# Email Service HTML-Escape Retrofit — Design Spec

**Date:** 2026-06-23
**Sprint:** 3.4.b (per `2026-06-20-refactor-redesign-sprint.md` — bundled hardening deferred from Sprint 3.4)
**Branch:** `feat/email-html-escape-retrofit`
**Layers on:** main, post Sprint 3.4 (`715b2bf`)
**Feature flag:** None — defense-in-depth security hardening

---

## Problem

Sprint 3.4's code review surfaced a real gap in `server/src/services/email.service.js`:

> 11 of 14 send functions interpolate user-controlled fields (`name`, `teamName`, `reason`) raw into HTML email bodies. The `escapeHtml` helper exists at line 451 but is private and used only by the 4 teaching-session functions. The source comment at line 447-450 explicitly says "we don't want to retrofit them" — but defense-in-depth XSS hardening is the right call given the production bar.

Sprint 3.4 deferred this as a separate sub-sprint (3.4.b) so the test-foundation sprint shipped cleanly. Per user decision, we now retrofit.

### Why this matters

Modern email clients (Gmail, Apple Mail, Outlook) sanitize HTML aggressively at render time — `<script>` tags are stripped, dangerous attributes neutralized. So the practical XSS impact today is low. But:

- **Defense in depth**: relying on email-client sanitization is brittle (different clients, different rules, legacy clients still in use).
- **Display-layer breakage**: an unescaped `<` or `&` in a user name doesn't execute code, but it does break the email's visual layout (HTML parsers truncate text at unexpected angle brackets).
- **Newer email targets**: Resend-rendered previews in admin tooling, web-mail clients embedding the HTML in iframes, mobile email clients — each is a different rendering context with different sanitization rules.
- **The audit's H13 emphasis**: "Email templates have variables; a typo could ship."

The right answer is to escape every user-controlled value in the HTML body at the call site, matching the pattern the 4 teaching functions already use.

### Zero-trust verification (code reading)

Read all 11 (originally said 11 in 3.4 review; on close re-count there are 10 non-teaching functions interpolating user-controlled fields, plus 1 — `sendVerificationEmail` — that does interpolate `name` raw). Inventory:

| Function | Line | Unescaped user-controlled fields |
|---|---|---|
| `sendVerificationEmail` | 120 | `name` |
| `sendWelcomeEmail` | 134 | `name` |
| `sendPasswordResetEmail` | 150 | `name` |
| `sendTeamInviteEmail` | 165 | `teamName` |
| `sendTeamApprovedEmail` | 184 | `name`, `teamName` |
| `sendTeamRejectedEmail` | 199, 201 | `name`, `teamName`, `reason` |
| `sendEmailChangeNotification` | 215 | `name` |
| `sendEmailChangeVerification` | 226 | `name` |
| `sendMemberRemovedEmail` | 239 | `name`, `teamName` |
| `sendFeedbackNotificationEmail` | 281, 288, 297, 304, 305, 312, 317 | `report.title`, `report.description`, `report.affectedArea`, `report.stepsToReproduce`, `report.user.name`, `report.user.email`, `report.team.name`, `report.id` |

Total: 10 functions × varies = ~22-25 individual interpolation sites needing `escapeHtml`.

## Principle

This is a **focused defense-in-depth security retrofit** — narrow scope, narrow blast radius. Apply the `escapeHtml` pattern already established by the 4 teaching functions to the 10 non-teaching functions. Match the existing pattern. Don't introduce new abstractions or change helper signatures.

## Scope

In scope:

- **Modify `email.service.js`**: wrap every user-controlled HTML body interpolation in `escapeHtml(...)` across the 10 non-teaching functions. Server-generated values (`code`, `joinCode`, `inviteToken`, `report.id`) are excluded — cryptographic randoms have no special characters by construction. But `report.id` is debatable — including it defensively to be uniform.
- **Update the source comment** at line 447-450 to document the retrofit:
  ```javascript
  // Defense-in-depth: escapeHtml is now consistently applied across ALL
  // 14 send functions (Sprint 3.4.b retrofit). Originally only the 4
  // teaching functions used it; the historical comment said "we don't
  // want to retrofit them" but the production bar in 2026-06 reversed
  // that call. Future callers MUST escapeHtml any user-controlled
  // field before interpolating into HTML body templates.
  function escapeHtml(str) { ... }
  ```
- **Add 10 XSS regression tests** to `email.service.test.js` — one per function. Each fires the function with a value containing `<script>`/`&`/`"`/`'`/`<` and asserts (a) the escaped form appears in the HTML body, (b) the raw form does NOT appear.

Out of scope:

- **Subject line escaping** — email subjects are plain text; email clients don't render HTML in subjects. HTML-escape would visually distort the subject (`&amp;` showing literally in the inbox). Subjects stay raw.
- **URL/href escaping** — server-generated tokens (`inviteToken`, `joinCode`, CUIDs) are URL-safe by construction. The current `button(text, url)` helper interpolates `url` raw into `href="..."`. If you ever pass a URL with `"` in it, you'd break the attribute — but no current caller does this. Out of scope.
- **Helper-level escaping** — `paragraph(text)`, `heading(text)`, `button(text, url)` continue to accept raw HTML. Some callers legitimately pass pre-built HTML (e.g. `<strong style="...">${name}</strong>` wrappers). Changing helpers would either break that pattern or require a confusing dual-mode API.

## Architecture

```
email.service.js  [MODIFIED]
  ├── sendVerificationEmail        : name → escapeHtml
  ├── sendWelcomeEmail              : name → escapeHtml
  ├── sendPasswordResetEmail        : name → escapeHtml
  ├── sendTeamInviteEmail           : teamName → escapeHtml
  ├── sendTeamApprovedEmail         : name, teamName → escapeHtml
  ├── sendTeamRejectedEmail         : name, teamName, reason → escapeHtml
  ├── sendEmailChangeNotification   : name → escapeHtml
  ├── sendEmailChangeVerification   : name → escapeHtml
  ├── sendMemberRemovedEmail        : name, teamName → escapeHtml
  ├── sendFeedbackNotificationEmail : 8 fields → escapeHtml
  ├── (4 teaching fns)              : unchanged (already correct)
  ├── (helpers paragraph/heading/...) : unchanged
  └── escapeHtml                    : comment updated to document the retrofit

email.service.test.js  [MODIFIED]
  └── Add 10 XSS-regression describes/its (one per function)
```

## Why per-call-site (not helper-level)

Three viable approaches were considered:

1. **Per-call-site escape** (chosen). Match the existing teaching-function pattern. Every `${name}` becomes `${escapeHtml(name)}`. Helpers stay as raw-HTML accepters.

2. **Helper-level escape**: change `paragraph(text)` to `paragraph(text) { return ... escapeHtml(text) ... }`. Would break the ~12 existing call sites that pass pre-built HTML markup (e.g. `paragraph(\`<strong>${name}</strong>\`)`).

3. **New escape-aware helper variants**: `paragraphRaw(html)` vs `paragraphText(text)`. Introduces 2x the helper surface for a one-off retrofit. YAGNI.

Approach 1 wins on every axis — matches existing code, no helper-signature change, no broken callers, smallest diff.

## XSS test design

For each function, ONE test with a single payload that exercises ALL its escapable fields. For functions with multiple fields, the payload tests them together to catch the case where one field's escape is forgotten. Template:

```javascript
it("escapes HTML in user-controlled fields (XSS-regression)", async () => {
  const xss = `<script>alert("xss")</script>`;
  await sendFnEmail("to@example.com", xss, ...);  // pass xss as each field
  const html = lastSentEmail().html;
  // Escaped form appears
  expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  // Raw form does NOT appear (would mean some interpolation site was missed)
  expect(html).not.toContain('<script>alert("xss")</script>');
});
```

For `sendFeedbackNotificationEmail` (8 fields), the test sets each escapable field of the `report` to a unique XSS marker (e.g. `report.title = "<TITLE>"`, `report.description = "<DESC>"`) and asserts each marker appears in escaped form. Catches per-field regression.

## Production risk inventory

| Risk dimension | Status |
|---|---|
| Schema migration | None |
| Token / session invalidation | None |
| Email delivery | Unaffected — Resend SDK call signature unchanged |
| Visual output for normal inputs | Identical (`escapeHtml("Alice")` = `"Alice"`, etc.) |
| Visual output for inputs containing `<`, `>`, `&`, `"`, `'` | Now displays the literal characters (escaped representation in HTML source) instead of breaking layout/getting stripped by email client |
| In-flight emails | None — synchronous behavior |
| Backward compatibility | Existing Sprint 3.4 tests stay green (their fixtures use plain alphanumeric values; escapeHtml is a no-op for those) |
| Rollback | `git revert` single commit |

## Backward compatibility

- **API**: no caller change. Email service signature unchanged.
- **Existing tests**: all 53 Sprint 3.4 tests stay green. Their fixtures use plain alphanumeric strings; `escapeHtml('Alice')` = `'Alice'`. Substring assertions like `expect(html).toContain("Alice")` continue to match.
- **Email client rendering**: normal users see no visible difference. Users with special characters in their name now see their actual name (e.g. `O'Brien` → `O&#39;Brien` in source, renders as `O'Brien`).

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | The 10-function table enumerates exact line numbers + fields. The pattern (per-call-site escape) matches the existing 4 teaching functions. The escapeHtml comment update is precise. Tests assert both the escaped form (present) and the raw form (absent) per function. |
| Scope | One file modified (controller + helper comment) + one test file modified. Single commit. No new abstractions. Subject/URL/helper changes explicitly carved out. |
| Ambiguity | The `report.id` field is explicitly included in the escape list defensively (even though it's a server-generated CUID). Reasoning: uniform treatment of all interpolated fields is easier to audit than a mixed escape-some/raw-some pattern. |
| Backward compat | All Sprint 3.4 tests stay green. No API change. |
| Adversarial review | The teaching-function pattern (e.g. `escapeHtml(session.title)`) IS the existing precedent — this sprint just brings the other 10 functions into alignment. Reviewers should ask: are there any user-controlled fields I missed? Verify by grepping `${[^}]*}` in the 10 function bodies and cross-referencing the inventory table above. |
| Risk floor | Low. Pure call-site additions of an existing helper. The only risk surface is "did I miss an interpolation site?" — caught by the XSS tests which use a unique marker per field. |

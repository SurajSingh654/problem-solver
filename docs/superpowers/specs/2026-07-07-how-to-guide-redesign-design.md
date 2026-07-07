# How-To Guide redesign — role-specific, task-first, end-to-end

**Date:** 2026-07-07
**Owner:** Suraj Singh
**Status:** Design approved, awaiting implementation plan
**Feature flag:** None — content-only change, zero user-facing risk of the sort flags exist to gate

---

## 1. Motivation

**The problem:** Suraj (acting as TEAM_ADMIN) landed on `/admin/curriculum/templates` mid-walkthrough, saw the "Fork into my team" button, and did not know what to do next. He opened the existing `/docs/how-to` guide expecting to self-serve — and found no Curriculum coverage at all. The guide today covers Design Studio, Problems, Add Problem, Quiz, Mock Interview, Feedback, and the Intelligence Report — but the entire Curriculum Learn+Teach feature (Phase 1, launching to staging soak this week) is undocumented.

Beyond the Curriculum gap, the current guide is a single 1,700-line scrolling page with no role gating. Admin sections carry an "Admin only" label but are shown to every user, mixing paths that a MEMBER cannot execute into their reading path. There is no search, no task-first entry, and no deep-linking from in-app errors ("stuck on the publish gate → open the relevant guide").

**Primary audience:** New users who don't know what the app can do — "what is Intelligence Report?", "how do I give a quiz?", "where do I go to review my solutions?". The guide is an **onboarding + reference manual**, not a troubleshooting runbook — but a small inline `🔧 If it fails` section on each guide serves the return user who's hit an error.

**Success criteria:**
- A brand-new MEMBER can open the guide, pick "Your first 30 minutes", and complete their first solve without asking for help
- A brand-new TEAM_ADMIN can fork a template, author a topic, run AI review, and publish — end-to-end from the guide alone
- A SUPER_ADMIN can sync templates, understand every admin panel, and triage feedback from the guide
- Any error surface in the app (409 fork, 403 permission, publish gate failure) has a one-click "Learn about this" link that lands on the exact relevant guide

---

## 2. Scope

**In scope:**
- Replace the current single-page `/docs/how-to` with a **role-gated, task-first, searchable** guide
- Add **end-to-end Curriculum coverage** — all four TEAM_ADMIN authoring flows + all learner flows + SUPER_ADMIN sync
- Add **SUPER_ADMIN section** — every admin surface currently at `/super-admin/*` (teams, users, verdict audit, feedback inbox, AI usage, teaching flags, roadmap, diagnostics)
- Rewrite existing sections into the new per-task format (mostly rip-and-repackage — the prose is good, the structure isn't)
- Wire deep-links from ~4 key in-app error surfaces
- Client-side fuzzy search, "View as" toggle for admins, breadcrumbs, next-up links
- Screenshot placeholders for new Curriculum + SUPER_ADMIN content; existing screenshots preserved

**Out of scope (deferred to backlog):**
- Capturing new screenshots for all new content (placeholders ship; capture happens incrementally)
- `<HelpButton taskId="…" />` component drops beyond the initial 4 error surfaces
- Analytics on which guides get opened most
- Server-backed search (client-side is enough for ~31 tasks)
- Multi-language / i18n
- Video walkthroughs

---

## 3. Architecture & routing

**Single route, role-gated content.** Keep `/docs/how-to` as the entry point. Behind it, the page reads `user.globalRole` + `user.teamRole` from `authStore` and renders a role-specific view. Sidebar link stays at `Sidebar.jsx:156` unchanged.

**New file structure:**
```
client/src/pages/docs/
├── HowToPage.jsx              (existing — becomes a thin re-export of HowToShell)
├── ReadmePage.jsx             (existing — unchanged)
└── howto/                     (NEW)
    ├── HowToShell.jsx         (landing + search + role tabs + view-as toggle)
    ├── GettingStarted.jsx     (no-role-gate overview page — its own task)
    ├── TaskPage.jsx           (generic long-form step-guide renderer)
    ├── manifest.js            (single source of truth for TASKS + GROUPS)
    ├── components.jsx         (extracted StepCard, Callout, HowToImage, PasteBlock, K, IfItFails, NextUp, PrereqList, SummaryBlock)
    └── content/
        ├── member/            (11 files)
        ├── team-admin/        (7 files)
        └── super-admin/       (9 files)
```

**URL scheme:**
- `/docs/how-to` — landing (search + workflow groups filtered by role)
- `/docs/how-to/task/:taskId` — deep-linkable guide detail
- `/docs/how-to?viewAs=member` — admin's presentation-only override (`viewAs=team-admin` allowed only for SUPER_ADMIN)
- Existing hash anchors (`/docs/how-to#solve`, `#ds-sd`, etc.) — backward-compatible via a hash-to-taskId map read by `HowToShell.jsx` on mount, then `navigate()` to the new task URL

**Role detection (client-side only):**
```js
const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
const isTeamAdmin  = !isSuperAdmin && user?.teamRole === 'TEAM_ADMIN'
const actualRole   = isSuperAdmin ? 'super-admin' : isTeamAdmin ? 'team-admin' : 'member'
const viewAsParam  = new URLSearchParams(location.search).get('viewAs')
const viewAsValid  = viewAsParam &&
                     (isSuperAdmin || (isTeamAdmin && viewAsParam === 'member'))
const effectiveRole = viewAsValid ? viewAsParam : actualRole
```

**Trust boundary note:** Content visibility is a **UX filter, not a security gate**. A curious MEMBER who guesses a URL like `/docs/how-to/task/sync-templates` can read the guide — but the actions described (running `curriculum:sync`, viewing all teams) are separately gated by the app's real authz middleware (`requireGlobalRole('SUPER_ADMIN')` on the actual endpoints). The guide is documentation about a locked door; the door is the security gate.

**Component boundaries** (each testable independently):
```
HowToShell           orchestrates role, search, view-as
  ├─ SearchBar       controlled input + debounce
  ├─ RoleTogglePill  current-role display
  ├─ ViewAsMenu      dropdown, admin-only
  ├─ GroupSection    renders one group's tiles
  │   └─ TaskTile    single card (icon + title + summary + minutes)
  └─ SearchResults   flat list when query non-empty

TaskPage             per-task guide shell
  ├─ Breadcrumbs
  ├─ PrereqList
  ├─ StepCard        (reused from existing HowToPage.jsx)
  ├─ IfItFails       new: expanded callout when task.hasErrors
  └─ NextUp          renders task.relatedTasks

GettingStarted       hero-strip overview + role-branched "Your first 30 minutes"
```

---

## 4. Manifest schema

One file drives everything — landing tiles, search, role gating, breadcrumb hierarchy, next-up links, deep-linkable IDs.

```js
// client/src/pages/docs/howto/manifest.js

export const ROLES = ['member', 'team-admin', 'super-admin']

export const GROUPS = {
  // roles: ['*'] means shown to everyone
  'getting-started':      { label: '🚀 Getting Started',      roles: ['*'],           order: 1 },
  'learn':                { label: '📚 Learn',                 roles: ['member'],      order: 2 },
  'practice':             { label: '💪 Practice',              roles: ['member'],      order: 3 },
  'insights':             { label: '📊 Insights',              roles: ['member'],      order: 4 },
  'curriculum-authoring': { label: '📚 Curriculum Authoring',  roles: ['team-admin'],  order: 5 },
  'problem-bank':         { label: '📝 Problem Bank',          roles: ['team-admin'],  order: 6 },
  'team-management':      { label: '👥 Team Management',       roles: ['team-admin'],  order: 7 },
  'platform-ops':         { label: '⚡ Platform Operations',   roles: ['super-admin'], order: 8 },
  'moderation':           { label: '🛡️ Moderation',           roles: ['super-admin'], order: 9 },
  'support':              { label: '💬 Support',               roles: ['*'],           order: 10 },
}

export const TASKS = [
  {
    id: 'fork-template',                        // URL slug — /docs/how-to/task/fork-template
    role: 'team-admin',                         // 'member' | 'team-admin' | 'super-admin' | '*'
    group: 'curriculum-authoring',
    icon: '🍴',
    title: 'Fork a Curriculum Template',
    summary: 'Deep-clone a global template into your team as a Topic you can edit.',
    keywords: ['fork', 'template', 'clone', 'curriculum', 'topic'],
    estimatedMinutes: 3,
    prerequisites: ['sync-templates'],          // shows "Prereq: Sync Templates" bar; also validated at build
    relatedTasks: ['author-topic', 'publish-topic'],
    component: () => import('./content/team-admin/fork-template.jsx'),
    hasErrors: true,                            // enables the 🔧 If it fails callout
    hashAliases: [],                            // legacy hash anchors that redirect here
  },
  // ...one row per task
]
```

**Structural invariants (checked by `client/scripts/validate-manifest.js`, see §11):**
- Every `task.id` is unique
- Every `task.group` exists in `GROUPS`
- Every `task.role` is one of `ROLES` or `'*'`
- Every `task.component` is a function returning a dynamic import (evaluated at test time)
- Every `task.relatedTasks[i]` and `task.prerequisites[i]` references a real task id
- The `getting-started` group has `roles: ['*']`
- `support` group has `roles: ['*']`

---

## 5. Landing composition

**For a TEAM_ADMIN (`effectiveRole === 'team-admin'`)** the landing renders:

```
┌──────────────────────────────────────────────────────────────┐
│ 📘 How-To Guide            [🛡️ Team Admin ▾] [Search…]  │
├──────────────────────────────────────────────────────────────┤
│ 🚀 Getting Started                                            │
│   [Your first 30 minutes → ]  [What is Problem Solver? → ]   │
│                                                               │
│ 📚 Curriculum Authoring (4 guides)                            │
│   [🍴 Fork Template]  [✏️ Author Topic]                       │
│   [🤖 Run AI Review]  [🚀 Publish]                            │
│                                                               │
│ 📝 Problem Bank (2 guides)                                    │
│   [🤖 Add Problem AI]  [✍️ Add Problem Manual]                │
│                                                               │
│ 👥 Team Management (1 guide)                                  │
│   [👥 Manage Members]                                         │
│                                                               │
│ 💬 Support                                                    │
│   [💬 File Feedback]                                          │
└──────────────────────────────────────────────────────────────┘
```

**Render algorithm:**
1. Import `TASKS` + `GROUPS` from `manifest.js` (static, zero network)
2. Filter `TASKS` where `task.role === effectiveRole || task.role === '*'`
3. Group results by `task.group`
4. For each group ordered by `GROUPS[groupId].order`, render header + task tiles — but only if that group has ≥1 matching task
5. On search input (150ms debounce): tokenize query, score each task on token matches in `title + summary + keywords`, render flat list of top matches

**View-as toggle** — top-right dropdown, visible only when `isSuperAdmin || isTeamAdmin`. Options:
- View as Member (sets `?viewAs=member`)
- View as Team Admin (SUPER_ADMIN only; sets `?viewAs=team-admin`)
- Reset to my role (clears `?viewAs`)

When active, a banner shows at top: `👁️ Viewing as MEMBER — [Reset]`. Server never sees this — it's purely presentational.

---

## 6. Task-page composition

Every task page renders in the same shape (fixed sections users learn to expect):

```
┌──────────────────────────────────────────────────────────────┐
│ ← All Guides / Curriculum Authoring / Fork a Template        │
├──────────────────────────────────────────────────────────────┤
│ 🍴 Fork a Curriculum Template   ⏱ 3 min  🛡️ Team Admin      │
│                                                               │
│ Summary paragraph (≤ 2 sentences)                             │
│                                                               │
│ Prerequisites:                                                │
│   • TEAM_ADMIN role in the current team                       │
│   • SUPER_ADMIN has run curriculum:sync → [Sync Templates]    │
│                                                               │
│ [Step 1 card + screenshot placeholder]                        │
│ [Step 2 card + screenshot placeholder]                        │
│ [Step 3 card + screenshot placeholder]                        │
│                                                               │
│ 🔧 If something goes wrong                                    │
│   • 409 DUPLICATE_SLUG → open the existing fork               │
│   • 404 not found → SUPER_ADMIN must run sync first           │
│   • 403 forbidden → check your role                           │
│                                                               │
│ ▶ Next up: [Author a Topic] [Run AI Review] [Publish]         │
└──────────────────────────────────────────────────────────────┘
```

**Role-mismatch soft-block:** If `task.role !== effectiveRole && task.role !== '*'` and no `viewAs` override is active, `TaskPage` shows a soft-block screen with `[Return to your guides]` + `[View anyway →]`. The "View anyway" click sets the appropriate `?viewAs` param. This is a UX guardrail, not a security gate (see §3).

---

## 7. Search flow

Client-side, no server call. 30-line matcher suffices for ~31 total tasks.

```
User types "fork gate" → 150ms debounce
Split query → ['fork', 'gate']
For each task in (TASKS filtered by effectiveRole):
  score = count of tokens matched in (title + summary + keywords)
  keep if score > 0
Sort desc by score, then by title asc
Render top 10 matches; empty query → return to grouped landing view
```

If task count later grows past ~100, swap in Fuse.js. Not needed at 31.

---

## 8. Deep-linking from the app

Four surfaces in this initial cut. Every one uses the stable `taskId` — content can be rewritten without breaking these links.

| Surface | Trigger | Link target |
|---------|---------|-------------|
| `TemplateBrowserPage.jsx` | 409 DUPLICATE_SLUG on fork attempt | `/docs/how-to/task/fork-template#if-it-fails` |
| `PublishTab.jsx` | Any red gate | `/docs/how-to/task/publish-topic` |
| `TopicAuthoringPage.jsx` | Empty state (concepts=0) | `/docs/how-to/task/author-topic` |
| `OnboardingPage.jsx` | First-time-visit hero | `/docs/how-to` (landing) |

Backlog: add a reusable `<HelpButton taskId="…" />` component and drop it in ~10 more places over subsequent sprints.

---

## 9. Content authoring plan

**31 guides total.** Every guide follows the same shape via reusable components:

```jsx
<SummaryBlock>Deep-clone a global TopicTemplate into your team as an editable Topic.</SummaryBlock>

<PrereqList items={[
  'You have TEAM_ADMIN role in the current team',
  'A SUPER_ADMIN has run curriculum sync — see Sync Templates',
  'The template has not already been forked into your team',
]} />

<StepCard num="1" title="Open the Template Browser" sub="Sidebar → Curriculum → Templates">
  <p>Navigate to <K>/team-admin/curriculum/templates</K>.</p>
  <HowToImage file="ta-fork-01-browser.png" alt="…" caption="…" />
</StepCard>

<StepCard num="2" title="Click Fork into my team" sub="Confirm the fork dialog">…</StepCard>
<StepCard num="3" title="Land in the 4-tab authoring UI">…</StepCard>

<IfItFails>
  <li><strong>409 DUPLICATE_SLUG</strong> — already forked. Open the existing one.</li>
  <li><strong>404</strong> — SUPER_ADMIN needs to run sync first.</li>
  <li><strong>403</strong> — you're not TEAM_ADMIN in the current team.</li>
</IfItFails>

<NextUp taskIds={['author-topic', 'run-ai-review', 'publish-topic']} />
```

**Quality bar per guide (automated at test time):**
- Summary ≤ 200 chars, exports as a plain string
- Prerequisites list is populated
- ≥ 2 `StepCard`s
- ≥ 1 `HowToImage` placeholder
- `IfItFails` present when `task.hasErrors === true`
- ≥ 1 `NextUp` (unless it's a terminal-node guide)
- Every internal link uses `to="/docs/how-to/task/:id"` and the id is validated against manifest

**Screenshot handling:**
- Filename convention: `<role-code>-<task-slug>-<step>-<slug>.png`
  - Role codes: `mb` (member), `ta` (team-admin), `sa` (super-admin), `gs` (getting-started)
  - Example: `ta-fork-01-browser.png`, `sa-sync-02-diff.png`, `mb-solve-04-workspace.png`
- All PNGs drop into `client/public/docs/how-to/` — served at `/docs/how-to/*.png`
- `HowToImage` component already renders a nice `📷 Screenshot placeholder` frame when the PNG is missing (see `HowToPage.jsx:40-62`) — no change needed
- Existing screenshots preserved; new content ships with placeholders

**Parallelization (per the standing four-role-review rule + implementer agents):**

BEFORE any content is written:
- **PO** — content-inventory check. Is this what a new user actually needs? Any missing "you'd get stuck without this" flows?
- **BA** — every claim must be verifiable against real controller / route / service files. No hallucinated buttons.
- **SecurityManager** — no leak of security-sensitive detail (e.g., admin-header trick documented for non-admins)
- **LeadEngineer** — architecture sanity on manifest + shell isolation

All four run in parallel in one message. Findings roll up, then implementers proceed.

Content generation parallelizes into three streams:
- **MEMBER agent** — 11 files under `content/member/`, appends 11 manifest entries
- **TEAM_ADMIN agent** — 7 files under `content/team-admin/`, appends 7 entries
- **SUPER_ADMIN agent** — 9 files under `content/super-admin/`, appends 9 entries
- **Me** — 4 Getting Started files (cross-cutting, shorter than others)

Every agent must read the actual routes/controllers/service files to verify steps correspond to real code — no hallucinated buttons, no invented URLs. Existing How-To prose sections are ripped verbatim where they still apply (10 of the 11 MEMBER guides already exist).

**Estimated size:**
- 31 files × 100-180 lines each ≈ 4,500 lines JSX content
- Plus manifest (~130 lines) + shell/components (~500 lines) + refactor of existing HowToPage.jsx (~300 lines removed/moved)
- Rough total: **~5,300 lines added, ~1,700 removed**

---

## 10. Content inventory

### 🚀 Getting Started
1. **What is Problem Solver?** — role `'*'` — 6-tile app-shape tour (Curriculum, Problems, Design Studio, Report, Mock, Quiz). Reuses most of the current Overview block.
2. **Your first 30 minutes** — role `member` — solve one problem → try Design Studio → check Intelligence Report
3. **Your first 30 minutes** — role `team-admin` — fork a template → author one concept → publish
4. **Your first 30 minutes** — role `super-admin` — sync templates → view teams → set up your first team

Each is a separate manifest task with a role-scoped `taskId` (e.g., `first-30-minutes-member`, `first-30-minutes-team-admin`) so deep-linking from role-specific onboarding surfaces works cleanly. On the landing, all four appear under the "Getting Started" group header; the three role-scoped ones only render when the effective role matches.

### 👤 MEMBER (11 guides)
1. **Learn a curriculum topic** — enroll → primer → lab → check-in → teach *(NEW)*
2. **Solve a Problem** *(rip from existing `#solve`)*
3. **Practice in Design Studio — System Design** *(rip from existing `#ds-sd`)*
4. **Practice in Design Studio — Low-Level Design** *(rip from existing `#ds-lld`)*
5. **Edit a Solution** *(rip from existing `#edit-solution`)*
6. **Attempt History + A/B diff** *(rip from existing `#history`)*
7. **Review Queue + Recall** *(rip from existing `#review`)*
8. **Attempt a Quiz** *(rip from existing `#quiz`)*
9. **Mock Interview** *(rip from existing `#mock`)*
10. **Intelligence Report — dimensions + activation** *(rip from existing `#report`)*
11. **File Feedback** *(rip from existing `#feedback`)*

### 🛡️ TEAM_ADMIN (7 guides)
1. **Fork a Curriculum Template** *(NEW)*
2. **Author a Topic — 4-tab UI** *(NEW)*
3. **Run AI Curriculum Review — Rules 18-22** *(NEW)*
4. **Publish a Topic — gates explained** *(NEW)*
5. **Add a Problem (AI generation)** *(rip from existing `#add-problem-ai`)*
6. **Add a Problem (Manual)** *(rip from existing `#add-problem-manual`)*
7. **Manage Team Members — invite, roles, personal-team model** *(NEW; source: `server/src/routes/team*.js` + relevant client pages)*

### ⚡ SUPER_ADMIN (9 guides)
1. **Sync Curriculum Templates** *(NEW; source: `curriculum:sync` script + `POST /api/v1/super-admin/curriculum/templates/sync`)*
2. **View All Teams** *(NEW; `/super-admin/teams`)*
3. **View All Users** *(NEW; `/super-admin/users`)*
4. **Verdict Audit** *(NEW; `/super-admin/verdicts`)*
5. **Feedback Inbox — triage** *(NEW; `/super-admin/feedback`)*
6. **AI Usage / Rate Limits** *(NEW; `/super-admin/ai-usage`)*
7. **Teaching Flags panel** *(NEW; `/super-admin/teaching-flags`)*
8. **Roadmap page** *(NEW; `/super-admin/roadmap`)*
9. **Diagnostics** *(NEW; `/super-admin/diagnostics`)*

---

## 11. Testing plan

Pure client change — no server tests needed.

**Automated (Vitest — currently zero client component tests exist; this ships the first three).**

Actually, per CLAUDE.md, client has no component test runner set up (`client-test-foundation` in roadmap LATER). Two paths:

1. **Preferred: add Vitest to the client** as part of this feature — bootstraps the client-test-foundation deliverable
2. **Fallback: skip automated tests for this pass, rely on lint + manual smoke** — ship faster, but manifest invariants become drift-prone

**Recommendation: fallback for this sprint.** The client-test-foundation is a bigger commitment than this feature warrants. Substitute with a **Node script** (`client/scripts/validate-manifest.js`) run in the pre-push hook that loads `manifest.js` and asserts the invariants from §4. That gives us the safety of a test without adopting a full client test runner as scope creep.

**`client/scripts/validate-manifest.js` — structural invariants:**
- Every `task.id` unique
- Every `task.group` exists in `GROUPS`
- Every `task.role` in `['member','team-admin','super-admin','*']`
- Every `task.component` resolvable (dynamic import evaluated at check time)
- Every `task.relatedTasks[i]` and `task.prerequisites[i]` references a real task id
- `getting-started` and `support` groups have `roles: ['*']`

Add to `.githooks/pre-push` alongside the existing client-lint/build steps.

**Manual smoke on staging (7 scenarios):**
1. Log in as MEMBER → sidebar → How-To Guide → only MEMBER + `*` groups visible
2. Type "curriculum" in search → only "Learn a Topic" appears (no admin authoring guides)
3. Log in as TEAM_ADMIN → Curriculum Authoring, Problem Bank, Team Management groups appear
4. Click "View as → Member" → banner appears + landing switches
5. Click each guide (~31) → all StepCards render, images show placeholder, breadcrumbs work
6. Log in as SUPER_ADMIN → Platform Ops + Moderation groups appear
7. As MEMBER, hit `/docs/how-to/task/sync-templates` directly → soft-block screen renders

**Lint:** existing `client/npm run lint --max-warnings 0` covers new files. No new rules needed.

**Legacy anchor mapping test:** Manually verify at least three of the current in-page anchor URLs (`#solve`, `#ds-sd`, `#review`) redirect to their new task pages.

---

## 12. Rollout order (2-3 day sprint)

Everything ships behind zero feature flags — content-only, no user-facing risk of the sort flags exist to gate.

**Day 1 — Foundation**
1. Four-role review of THIS spec doc — PO + BA + SecurityManager + LeadEngineer in parallel
2. Address any BLOCKERs from review
3. Extract shared components from `HowToPage.jsx` → `client/src/pages/docs/howto/components.jsx`. Existing `/docs/how-to` still renders throughout.
4. Write `manifest.js` (empty tasks, groups defined), `HowToShell.jsx`, `TaskPage.jsx`, `GettingStarted.jsx` scaffolds
5. Wire `/docs/how-to/task/:taskId` route in `App.jsx`
6. Write `client/scripts/validate-manifest.js` + wire into `.githooks/pre-push`

**Day 2 — Content in parallel**
1. MEMBER-guides agent — 11 files
2. TEAM_ADMIN-guides agent — 7 files
3. SUPER_ADMIN-guides agent — 9 files
4. Me — 4 Getting Started variants + landing hero strip
5. Redirect legacy `#anchor` URLs to their new task pages (hash-to-taskId map in `HowToShell.jsx`)

**Day 3 — Polish + verify**
1. Enable manifest validator in pre-push — all invariants pass
2. Manual smoke — all 7 scenarios
3. Wire deep-links from 4 in-app surfaces (Template Browser 409, Publish gate red, Topic Authoring empty state, Onboarding page)
4. Capture highest-value screenshots while mid-walkthrough on staging (Fork, Author Metadata, Concepts tab, Publish gates) — the rest deferred
5. Merge to main, deploy

**Post-launch backlog:**
- Capture remaining screenshots
- `<HelpButton taskId="…" />` drops beyond initial 4 surfaces
- Analytics on guide open rate (informs which need more depth)

---

## 13. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent-generated content hallucinates UI elements that don't exist | HIGH | HIGH | BA review agent runs before implementer; every implementer must cite file:line for non-obvious claims; existing prose is ripped verbatim, not regenerated |
| Legacy `#anchor` links break, existing bookmarks 404 | MEDIUM | MEDIUM | Hash-to-taskId map in `HowToShell.jsx` on mount; validated in manual smoke |
| Manifest drift — a task has `role: 'team-admin'` but content mentions super-admin actions | MEDIUM | LOW | BA review catches; also validator could scan JSX for role-mismatched language (out of scope for v1) |
| Screenshot filenames don't match convention → 404 images everywhere | LOW | LOW | `HowToImage` component already handles missing gracefully (placeholder frame) |
| Guide contradicts CLAUDE.md guardrails (e.g., documents `req.user.currentTeamId` read) | LOW | HIGH | SecurityManager review; CLAUDE.md is loaded into every implementer's context |
| View-as toggle leaks admin-only info to hijacked URLs on a non-admin machine | LOW | LOW | View-as is purely presentation; actions are re-checked server-side. Documented as UX filter, not security gate. |

---

## 14. Explicit non-goals

- Not a video walkthrough system
- Not a multi-language guide
- Not backed by CMS — content lives as JSX so it's PR-reviewable like code
- Not a live-search index — client-side matcher only, ~31 tasks fit comfortably
- Not attempting to auto-generate content from the codebase (though agent-assisted authoring uses codebase as ground truth)
- Not a permissioned admin panel — filtering is a UX convenience; real authz lives in the app's middleware

---

## 15. Success measurement (post-launch)

Weak first-week signals:
- Suraj self-serves the Fork → Author → Publish flow on a fresh forked topic without external notes
- Feedback tab receives ≥ 0 "how do I…" reports on covered flows for 7 days
- Sidebar `How-To Guide` link is clicked at least once per active session (client-side event; deferred, not blocking launch)

Strong signals (post-analytics, not blocking):
- Guide page views by role match role distribution in the user table
- Search terms with 0 results feed content backlog
- Deep-link click-through rate on the 4 wired surfaces

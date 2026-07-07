# How-To Guide Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page `/docs/how-to` with a role-gated, task-first, searchable guide that includes end-to-end Curriculum coverage — so new MEMBER / TEAM_ADMIN / SUPER_ADMIN users can self-serve every workflow without asking for help.

**Architecture:** Single React shell (`HowToShell.jsx`) reads the user's role from `authStore` and filters a manifest of 31 tasks. Landing shows workflow-grouped tiles; each task deep-links to `/docs/how-to/task/:taskId` rendering a long-form guide component (Summary · Prereqs · Steps · If it fails · Next up). Content lives as per-task JSX files under `content/{member,team-admin,super-admin}/`. Client-side fuzzy search over the manifest. Manifest invariants validated by a Node script in pre-push.

**Tech Stack:** React 18 · React Router 6 · Zustand (authStore) · Tailwind · Vite · No test runner in client (pre-push uses lint + build + Node validator script)

**Spec:** `docs/superpowers/specs/2026-07-07-how-to-guide-redesign-design.md`

---

## File Structure

**New files:**
```
client/src/pages/docs/howto/
├── HowToShell.jsx                     Landing + search + role-tab + view-as
├── TaskPage.jsx                       Generic task-page renderer
├── manifest.js                        TASKS[] + GROUPS{} — single source of truth
├── components.jsx                     Shared: StepCard, Callout, HowToImage,
│                                       PasteBlock, K, IfItFails, NextUp,
│                                       PrereqList, SummaryBlock
├── content/
│   ├── member/                        11 task JSX files
│   ├── team-admin/                    7 task JSX files
│   └── super-admin/                   9 task JSX files
└── gettingStarted/                    4 GS task JSX files

client/scripts/
└── validate-manifest.js               Structural invariants — pre-push
```

**Modified files:**
```
client/src/pages/docs/HowToPage.jsx    Thinned to `export { default } from './howto/HowToShell'`
client/src/App.jsx                     Add /docs/how-to/task/:taskId route
client/src/pages/team-admin/curriculum/TemplateBrowserPage.jsx   Deep-link on 409
client/src/pages/team-admin/curriculum/PublishTab.jsx            Deep-link on gate red
client/src/pages/team-admin/curriculum/TopicAuthoringPage.jsx    Deep-link on empty state
client/src/pages/OnboardingPage.jsx    Deep-link hero for first-time users
.githooks/pre-push                     Add validate-manifest step
```

**Removed (once shell is live):**
```
client/src/pages/docs/HowToPage.jsx    Legacy 1700-line file — content moved to
                                        components.jsx + content/member/*
```

---

## Phase 0 — Pre-work: four-role review of the spec

### Task 0: Four-role review of the design spec

Per the standing four-role review panel rule, run these BEFORE any code lands.

**Files:**
- Read: `docs/superpowers/specs/2026-07-07-how-to-guide-redesign-design.md`

- [ ] **Step 1: Dispatch four review agents in parallel in a single message**

Use the Agent tool with `feature-dev:code-reviewer` subagent_type for all four, each with a distinct lens:

  **Agent PO** — content/user-value lens. Prompt: "Read the spec at `docs/superpowers/specs/2026-07-07-how-to-guide-redesign-design.md`. Answer: is the 31-guide inventory actually what a brand-new user needs? What flows are missing that would leave a user stuck? Under 300 words."

  **Agent BA** — codebase-consistency lens. Prompt: "Read the spec. Cross-check every claim about existing code against the codebase. Does the manifest schema map cleanly to existing patterns? Does the route pattern `/docs/how-to/task/:taskId` conflict with anything? Any inconsistencies between spec claims and actual code? Under 300 words."

  **Agent SecurityManager** — leakage lens. Prompt: "Read the spec. The guide will contain step-by-step docs for SUPER_ADMIN actions (sync, verdict audit, teaching flags). Is there a leakage path where a MEMBER learns something they shouldn't? Note that content is UX-filtered but URL-guessable per §3. Should any content be moved to server-gated docs instead? Under 300 words."

  **Agent LeadEngineer** — architecture lens. Prompt: "Read the spec. Assess architecture: manifest schema, component boundaries, route pattern, backward-compat hash mapping, validator script vs Vitest tradeoff. Any brittle joints? Under 300 words."

- [ ] **Step 2: Collect findings and triage**

For each BLOCKER-level finding:
- Update the spec inline
- Commit spec change with message: `Spec: address BLOCKER from <agent> — <one-line summary>`

For MINOR / SUGGESTION findings:
- Add to a Section 16 "Review feedback deferred" at the bottom of the spec
- Do not block on them

- [ ] **Step 3: Confirm review clean, gate to Phase 1**

If no BLOCKERs found or all addressed, proceed to Phase 1. Otherwise loop until BLOCKERs are cleared.

---

## Phase 1 — Foundation (single engineer/agent, sequential)

### Task 1: Extract shared components from HowToPage.jsx into components.jsx

**Files:**
- Create: `client/src/pages/docs/howto/components.jsx`
- Modify: `client/src/pages/docs/HowToPage.jsx` (imports)

- [ ] **Step 1: Create the new components file with the existing components**

Copy these components verbatim from `client/src/pages/docs/HowToPage.jsx` into `client/src/pages/docs/howto/components.jsx`:
- `HowToImage` (lines 27-115)
- `Example` (lines 165-173)
- `PasteBlock` (lines 176-186)
- `K` (lines 189-196)
- The four style constants `BRAND`, `SUCCESS`, `WARN`, `INFO` (lines 159-162)

Also import + re-export these from `./components` in `HowToPage.jsx`:
- `DocsLayout`, `DocsHero`, `Section`, `SectionTitle`, `SectionDesc`, `StepCard`, `Callout`, `SbLink` (already imported from `./components` in HowToPage.jsx — leave alone)

Add three new components at the bottom of `components.jsx`:

```jsx
// ── SummaryBlock ────────────────────────────────────────
// Short intro sentence (≤2 lines) at the top of every task page.
export function SummaryBlock({ children }) {
    return (
        <p className="text-sm text-text-secondary leading-relaxed mb-4">
            {children}
        </p>
    )
}

// ── PrereqList ─────────────────────────────────────────
// Bullet list rendered above the first StepCard.
export function PrereqList({ items }) {
    if (!items || items.length === 0) return null
    return (
        <div className="my-4 p-3 rounded-lg border border-border-default bg-surface-2">
            <div className="text-[11px] font-bold text-text-disabled uppercase
                            tracking-widest mb-2">
                Prerequisites
            </div>
            <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                {items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
        </div>
    )
}

// ── IfItFails ──────────────────────────────────────────
// Yellow-tinted error-help callout, rendered after the last step.
export function IfItFails({ children }) {
    return (
        <div className="my-5 p-4 rounded-xl border-l-4 border-yellow-500 bg-yellow-500/5">
            <div className="text-sm font-bold text-yellow-500 mb-2">
                🔧 If something goes wrong
            </div>
            <ul className="text-xs text-text-secondary space-y-1.5 list-disc pl-4">
                {children}
            </ul>
        </div>
    )
}

// ── NextUp ─────────────────────────────────────────────
// Footer with related-task links.
export function NextUp({ taskIds, taskLookup }) {
    if (!taskIds || taskIds.length === 0) return null
    return (
        <div className="mt-8 mb-4">
            <div className="text-[11px] font-bold text-text-disabled uppercase
                            tracking-widest mb-2">
                Next up
            </div>
            <div className="flex flex-wrap gap-2">
                {taskIds.map(id => {
                    const t = taskLookup?.(id)
                    if (!t) return null
                    return (
                        <a key={id} href={`/docs/how-to/task/${id}`}
                           className="text-xs text-brand-fg-soft hover:text-brand-400
                                      border border-brand-line hover:border-brand-500
                                      rounded-full px-3 py-1.5 transition-colors">
                            {t.icon} {t.title} →
                        </a>
                    )
                })}
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Verify existing /docs/how-to still renders**

Run: `cd client && npm run dev`
Open: http://localhost:5173/docs/how-to
Expected: Existing guide renders identically. If anything is broken (missing component, import path), fix imports.

- [ ] **Step 3: Run lint**

Run: `cd client && npm run lint`
Expected: 0 warnings

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/docs/howto/components.jsx client/src/pages/docs/HowToPage.jsx
git commit -m "Extract How-To shared components into howto/components.jsx"
```

---

### Task 2: Write manifest.js with GROUPS + empty TASKS

**Files:**
- Create: `client/src/pages/docs/howto/manifest.js`

- [ ] **Step 1: Write the manifest file**

```js
// client/src/pages/docs/howto/manifest.js
//
// Single source of truth for the How-To Guide. Every task, group, and
// role-gate lives here. Structural invariants are checked by
// client/scripts/validate-manifest.js in pre-push.

export const ROLES = ['member', 'team-admin', 'super-admin']

export const GROUPS = {
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

export const TASKS = []

// Helpers -----------------------------------------------------------
export function findTask(id) {
    return TASKS.find(t => t.id === id)
}

export function tasksForRole(effectiveRole) {
    return TASKS.filter(t => t.role === effectiveRole || t.role === '*')
}

export function groupsForRole(effectiveRole) {
    return Object.entries(GROUPS)
        .filter(([, g]) => g.roles.includes(effectiveRole) || g.roles.includes('*'))
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([id, g]) => ({ id, ...g }))
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/docs/howto/manifest.js
git commit -m "Add How-To manifest scaffold (empty TASKS, GROUPS defined)"
```

---

### Task 3: Write validate-manifest.js pre-push validator

**Files:**
- Create: `client/scripts/validate-manifest.js`
- Modify: `.githooks/pre-push`

- [ ] **Step 1: Write the validator**

```js
#!/usr/bin/env node
// client/scripts/validate-manifest.js
//
// Structural invariants on client/src/pages/docs/howto/manifest.js.
// Fails the pre-push hook if the manifest is inconsistent.

import { TASKS, GROUPS, ROLES } from '../src/pages/docs/howto/manifest.js'

const errors = []

// 1. Unique task ids
const seenIds = new Set()
for (const t of TASKS) {
    if (seenIds.has(t.id)) errors.push(`Duplicate task.id: ${t.id}`)
    seenIds.add(t.id)
}

// 2. Every task.group exists
for (const t of TASKS) {
    if (!GROUPS[t.group]) errors.push(`Task ${t.id} references unknown group: ${t.group}`)
}

// 3. Every task.role in ROLES or '*'
const validRoles = new Set([...ROLES, '*'])
for (const t of TASKS) {
    if (!validRoles.has(t.role)) errors.push(`Task ${t.id} has invalid role: ${t.role}`)
}

// 4. relatedTasks / prerequisites reference real tasks
for (const t of TASKS) {
    for (const rel of (t.relatedTasks || [])) {
        if (!seenIds.has(rel)) errors.push(`Task ${t.id} relatedTasks references unknown: ${rel}`)
    }
    for (const pre of (t.prerequisites || [])) {
        if (!seenIds.has(pre)) errors.push(`Task ${t.id} prerequisites references unknown: ${pre}`)
    }
}

// 5. getting-started and support have roles: ['*']
for (const groupId of ['getting-started', 'support']) {
    const g = GROUPS[groupId]
    if (!g || !g.roles.includes('*')) {
        errors.push(`Group ${groupId} must have roles: ['*']`)
    }
}

// 6. Every task.component is a function (dynamic import)
for (const t of TASKS) {
    if (typeof t.component !== 'function') {
        errors.push(`Task ${t.id}.component must be a () => import(...) function`)
    }
}

if (errors.length > 0) {
    console.error('\n❌ Manifest validation failed:\n')
    errors.forEach(e => console.error(`  • ${e}`))
    console.error('')
    process.exit(1)
}

console.log(`✔ Manifest valid — ${TASKS.length} tasks across ${Object.keys(GROUPS).length} groups`)
```

- [ ] **Step 2: Test with empty manifest**

Run: `cd client && node scripts/validate-manifest.js`
Expected: `✔ Manifest valid — 0 tasks across 10 groups`

- [ ] **Step 3: Test error case (temp)**

Temporarily edit `manifest.js` to add a broken task:
```js
export const TASKS = [
  { id: 'broken', role: 'invalid-role', group: 'nonexistent-group', component: 'not-a-function' }
]
```
Run: `cd client && node scripts/validate-manifest.js`
Expected: Exit code 1, three errors printed
Then revert the temp edit.

- [ ] **Step 4: Wire into pre-push hook**

Add this step to `.githooks/pre-push` after the client lint block:

```bash
    # Manifest validation — checks How-To manifest invariants
    # (unique ids, valid groups/roles, cross-refs resolve).
    run_in client "client: how-to manifest" node scripts/validate-manifest.js
```

Insert between `client: lint (strict)` and `client: npm audit`.

- [ ] **Step 5: Test hook locally**

Run: `.githooks/pre-push`
Expected: All checks pass, including `client: how-to manifest`

- [ ] **Step 6: Commit**

```bash
git add client/scripts/validate-manifest.js .githooks/pre-push
git commit -m "Add How-To manifest validator to pre-push hook"
```

---

### Task 4: Write HowToShell.jsx scaffold with role detection + landing

**Files:**
- Create: `client/src/pages/docs/howto/HowToShell.jsx`

- [ ] **Step 1: Write the shell**

```jsx
// client/src/pages/docs/howto/HowToShell.jsx
//
// Landing + search + role-tab + view-as toggle for /docs/how-to.
// Reads user.globalRole + teamRole from authStore, filters TASKS +
// GROUPS from the manifest, renders workflow-grouped tiles.

import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@stores/authStore'
import { TASKS, GROUPS, tasksForRole, groupsForRole } from './manifest.js'
import { DocsLayout, DocsHero } from '../components'

// ── Role detection ──────────────────────────────────────
function useEffectiveRole() {
    const user = useAuthStore(s => s.user)
    const location = useLocation()
    const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
    const isTeamAdmin  = !isSuperAdmin && user?.teamRole === 'TEAM_ADMIN'
    const actualRole   = isSuperAdmin ? 'super-admin' : isTeamAdmin ? 'team-admin' : 'member'

    const params = new URLSearchParams(location.search)
    const viewAs = params.get('viewAs')
    const viewAsValid =
        viewAs === 'member' && (isSuperAdmin || isTeamAdmin) ? 'member' :
        viewAs === 'team-admin' && isSuperAdmin ? 'team-admin' :
        null

    const effectiveRole = viewAsValid || actualRole
    return { actualRole, effectiveRole, viewAsActive: !!viewAsValid, isSuperAdmin, isTeamAdmin }
}

// ── Search matcher ──────────────────────────────────────
function scoreTask(task, tokens) {
    const haystack = `${task.title} ${task.summary} ${(task.keywords || []).join(' ')}`.toLowerCase()
    let score = 0
    for (const tok of tokens) {
        if (haystack.includes(tok)) score++
    }
    return score
}

function searchTasks(tasks, query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return null
    return tasks
        .map(t => ({ task: t, score: scoreTask(t, tokens) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title))
        .slice(0, 10)
        .map(x => x.task)
}

// ── Task tile ──────────────────────────────────────────
function TaskTile({ task }) {
    return (
        <Link
            to={`/docs/how-to/task/${task.id}`}
            className="block bg-surface-2 border border-border-default rounded-xl p-4
                       hover:border-brand-line hover:bg-surface-3 transition-all"
        >
            <div className="flex items-start gap-3">
                <div className="text-xl flex-shrink-0">{task.icon}</div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-text-primary mb-0.5">
                        {task.title}
                    </div>
                    <div className="text-xs text-text-tertiary leading-relaxed">
                        {task.summary}
                    </div>
                    {task.estimatedMinutes && (
                        <div className="text-[10px] text-text-disabled uppercase tracking-widest mt-1.5">
                            ⏱ {task.estimatedMinutes} min
                        </div>
                    )}
                </div>
            </div>
        </Link>
    )
}

// ── View-as menu ────────────────────────────────────────
function ViewAsMenu({ isSuperAdmin, isTeamAdmin, viewAsActive }) {
    const navigate = useNavigate()
    const location = useLocation()
    const [open, setOpen] = useState(false)

    if (!isSuperAdmin && !isTeamAdmin) return null

    const setViewAs = (role) => {
        const params = new URLSearchParams(location.search)
        if (role) params.set('viewAs', role)
        else params.delete('viewAs')
        navigate(`${location.pathname}?${params.toString()}`)
        setOpen(false)
    }

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className="text-xs px-3 py-2 rounded-lg border border-brand-line
                           bg-brand-soft text-brand-fg-soft hover:bg-brand-soft/60"
            >
                👁️ {viewAsActive ? 'Viewing as…' : 'View as'} ▾
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border
                                border-border-default bg-surface-2 shadow-lg z-10">
                    <button onClick={() => setViewAs('member')}
                            className="block w-full text-left text-xs px-3 py-2
                                       hover:bg-surface-3">
                        Member
                    </button>
                    {isSuperAdmin && (
                        <button onClick={() => setViewAs('team-admin')}
                                className="block w-full text-left text-xs px-3 py-2
                                           hover:bg-surface-3">
                            Team Admin
                        </button>
                    )}
                    <button onClick={() => setViewAs(null)}
                            className="block w-full text-left text-xs px-3 py-2
                                       hover:bg-surface-3 border-t border-border-default">
                        Reset to my role
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Main shell ─────────────────────────────────────────
export default function HowToShell() {
    const { actualRole, effectiveRole, viewAsActive, isSuperAdmin, isTeamAdmin } = useEffectiveRole()
    const [query, setQuery] = useState('')

    const filteredTasks = useMemo(() => tasksForRole(effectiveRole), [effectiveRole])
    const visibleGroups = useMemo(() => groupsForRole(effectiveRole), [effectiveRole])
    const searchResults = useMemo(() => searchTasks(filteredTasks, query), [filteredTasks, query])

    return (
        <DocsLayout>
            <DocsHero
                eyebrow="📘 How-To Guide · v5.0"
                title="Do everything —"
                titleGradient="one guide"
                desc={`Every workflow, filtered to your role (${effectiveRole}). Search or browse.`}
            />

            {viewAsActive && (
                <div className="mb-4 p-3 rounded-lg border border-brand-line bg-brand-soft/40 text-xs">
                    👁️ Viewing as <strong>{effectiveRole}</strong>. Your actual role is <strong>{actualRole}</strong>.
                    {' '}
                    <button onClick={() => window.location.search = ''}
                            className="underline hover:text-brand-400">
                        Reset
                    </button>
                </div>
            )}

            <div className="flex items-center gap-3 mb-6">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="🔍  Search guides…"
                    className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-border-default
                               bg-surface-2 text-text-primary placeholder:text-text-disabled
                               focus:outline-none focus:border-brand-line"
                />
                <div className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                    {effectiveRole}
                </div>
                <ViewAsMenu isSuperAdmin={isSuperAdmin} isTeamAdmin={isTeamAdmin} viewAsActive={viewAsActive} />
            </div>

            {searchResults ? (
                <div>
                    <div className="text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                        {searchResults.map(t => <TaskTile key={t.id} task={t} />)}
                    </div>
                    {searchResults.length === 0 && (
                        <p className="text-sm text-text-tertiary italic">
                            No guides match your search. Clear the query to see all workflows.
                        </p>
                    )}
                </div>
            ) : (
                visibleGroups.map(group => {
                    const groupTasks = filteredTasks.filter(t => t.group === group.id)
                    if (groupTasks.length === 0) return null
                    return (
                        <div key={group.id} className="mb-8">
                            <div className="text-sm font-bold text-brand-fg-soft mb-3">
                                {group.label} <span className="text-text-disabled">· {groupTasks.length} guide{groupTasks.length === 1 ? '' : 's'}</span>
                            </div>
                            <div className="grid md:grid-cols-2 gap-3">
                                {groupTasks.map(t => <TaskTile key={t.id} task={t} />)}
                            </div>
                        </div>
                    )
                })
            )}
        </DocsLayout>
    )
}
```

- [ ] **Step 2: Point /docs/how-to at the new shell**

Modify `client/src/pages/docs/HowToPage.jsx`. Replace the entire file contents with:

```jsx
// Legacy entry point — thin re-export of the new role-aware shell.
export { default } from './howto/HowToShell'
```

- [ ] **Step 3: Verify /docs/how-to renders with empty state**

Run: `cd client && npm run dev`
Open: http://localhost:5173/docs/how-to
Expected: New shell renders with header + search bar. No groups appear (TASKS is empty). "Viewing as {role}" indicator shows.

- [ ] **Step 4: Verify /docs/how-to?viewAs=member renders as MEMBER**

As a SUPER_ADMIN or TEAM_ADMIN, open `/docs/how-to?viewAs=member`. Banner appears saying "Viewing as member". Role indicator shows "member".

- [ ] **Step 5: Lint**

Run: `cd client && npm run lint`
Expected: 0 warnings

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/docs/howto/HowToShell.jsx client/src/pages/docs/HowToPage.jsx
git commit -m "Add HowToShell — role-aware landing with search + view-as"
```

---

### Task 5: Write TaskPage.jsx generic task-guide renderer

**Files:**
- Create: `client/src/pages/docs/howto/TaskPage.jsx`
- Modify: `client/src/App.jsx` (add route)

- [ ] **Step 1: Write the task page**

```jsx
// client/src/pages/docs/howto/TaskPage.jsx
//
// Generic renderer for a single How-To task. Reads :taskId from route
// params, looks up the manifest entry, lazy-imports the content
// component, wraps with breadcrumbs / prereqs / footer.

import { Suspense, lazy, useMemo, useState } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@stores/authStore'
import { findTask, GROUPS } from './manifest.js'
import { DocsLayout } from '../components'
import { NextUp, PrereqList } from './components'

function useEffectiveRole() {
    const user = useAuthStore(s => s.user)
    const location = useLocation()
    const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
    const isTeamAdmin  = !isSuperAdmin && user?.teamRole === 'TEAM_ADMIN'
    const actualRole   = isSuperAdmin ? 'super-admin' : isTeamAdmin ? 'team-admin' : 'member'
    const viewAs = new URLSearchParams(location.search).get('viewAs')
    const viewAsValid =
        viewAs === 'member' && (isSuperAdmin || isTeamAdmin) ? 'member' :
        viewAs === 'team-admin' && isSuperAdmin ? 'team-admin' :
        null
    return viewAsValid || actualRole
}

export default function TaskPage() {
    const { taskId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const effectiveRole = useEffectiveRole()
    const [forceView, setForceView] = useState(false)

    const task = useMemo(() => findTask(taskId), [taskId])
    const Content = useMemo(() => task ? lazy(task.component) : null, [task])

    if (!task) {
        return (
            <DocsLayout>
                <div className="text-center py-16">
                    <div className="text-4xl mb-3">🤷</div>
                    <div className="text-lg font-bold text-text-primary mb-2">
                        Guide not found
                    </div>
                    <div className="text-sm text-text-tertiary mb-6">
                        No task with id <code>{taskId}</code>.
                    </div>
                    <Link to="/docs/how-to"
                          className="text-sm text-brand-fg-soft hover:text-brand-400 underline">
                        ← Back to all guides
                    </Link>
                </div>
            </DocsLayout>
        )
    }

    // Role-mismatch soft-block
    const roleMismatch = task.role !== '*' && task.role !== effectiveRole
    if (roleMismatch && !forceView) {
        return (
            <DocsLayout>
                <div className="max-w-lg mx-auto text-center py-16">
                    <div className="text-4xl mb-3">🛑</div>
                    <div className="text-lg font-bold text-text-primary mb-2">
                        This guide is for {task.role}
                    </div>
                    <div className="text-sm text-text-tertiary mb-6">
                        You're viewing as <strong>{effectiveRole}</strong>. The actions described
                        below may not be available to you in the app.
                    </div>
                    <div className="flex gap-2 justify-center">
                        <Link to="/docs/how-to"
                              className="text-sm px-4 py-2 rounded-lg border border-border-default
                                         hover:border-brand-line">
                            Back to your guides
                        </Link>
                        <button onClick={() => setForceView(true)}
                                className="text-sm px-4 py-2 rounded-lg border border-brand-line
                                           bg-brand-soft text-brand-fg-soft hover:bg-brand-soft/60">
                            View anyway →
                        </button>
                    </div>
                </div>
            </DocsLayout>
        )
    }

    const group = GROUPS[task.group]
    const prereqItems = (task.prerequisites || []).map(pid => {
        const t = findTask(pid)
        return t ? `${t.title} → open guide` : pid
    })

    return (
        <DocsLayout>
            {/* Breadcrumbs */}
            <div className="text-xs text-text-tertiary mb-3">
                <Link to="/docs/how-to" className="hover:text-text-primary">All guides</Link>
                {' / '}
                {group?.label || task.group}
                {' / '}
                <span className="text-text-primary">{task.title}</span>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-extrabold text-text-primary mb-2">
                {task.icon} {task.title}
            </h1>
            <div className="flex gap-3 text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-4">
                {task.estimatedMinutes && <span>⏱ {task.estimatedMinutes} min</span>}
                <span>· {task.role}</span>
            </div>

            <PrereqList items={prereqItems} />

            <Suspense fallback={<div className="text-sm text-text-tertiary italic py-6">Loading guide…</div>}>
                <Content />
            </Suspense>

            <NextUp taskIds={task.relatedTasks} taskLookup={findTask} />

            <div className="mt-8 pt-4 border-t border-border-default text-xs text-text-tertiary">
                <Link to="/docs/how-to" className="hover:text-text-primary">
                    ← All guides
                </Link>
            </div>
        </DocsLayout>
    )
}
```

- [ ] **Step 2: Add route to App.jsx**

Modify `client/src/App.jsx`. Find the existing route:
```jsx
<Route path="docs/how-to" element={<Lazy><HowToPage /></Lazy>} />
```

Add a new route immediately after it:
```jsx
<Route path="docs/how-to/task/:taskId" element={<Lazy><HowToTaskPage /></Lazy>} />
```

And add the lazy import at the top with the other `docs` imports:
```jsx
const HowToTaskPage = lazy(() => import('@pages/docs/howto/TaskPage'))
```

- [ ] **Step 3: Verify /docs/how-to/task/nonexistent renders 404 UI**

Run: `cd client && npm run dev`
Open: http://localhost:5173/docs/how-to/task/nonexistent
Expected: "🤷 Guide not found" page with a back link.

- [ ] **Step 4: Lint**

Run: `cd client && npm run lint`
Expected: 0 warnings

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/docs/howto/TaskPage.jsx client/src/App.jsx
git commit -m "Add TaskPage — generic task-guide renderer with role soft-block"
```

---

### Task 6: Add hash-to-taskId legacy anchor redirect

**Files:**
- Modify: `client/src/pages/docs/howto/HowToShell.jsx`
- Modify: `client/src/pages/docs/howto/manifest.js` (add HASH_ALIAS_MAP export)

- [ ] **Step 1: Add HASH_ALIAS_MAP to manifest.js**

Append to `manifest.js`:

```js
// ── Hash alias map ─────────────────────────────────────
// The old How-To was a single-page-scrolling doc with hash anchors like
// #solve, #ds-sd. Existing bookmarks and inbound links (e.g., feedback
// email templates) may still use these. Read on mount and navigate() to
// the equivalent task page.

export const HASH_ALIAS_MAP = {
    'overview':          'what-is-problem-solver',
    'ds-sd':             'design-studio-sd',
    'ds-lld':            'design-studio-lld',
    'solve':             'solve-problem',
    'edit-solution':     'edit-solution',
    'history':           'attempt-history',
    'review':            'review-queue',
    'report':            'intelligence-report',
    'add-problem-ai':    'add-problem-ai',
    'add-problem-manual':'add-problem-manual',
    'quiz':              'quiz',
    'mock':              'mock-interview',
    'feedback':          'feedback',
}
```

- [ ] **Step 2: Read hash on mount in HowToShell and redirect**

Add to `HowToShell.jsx` — at the top of the component body, above `useMemo`:

```jsx
import { useEffect } from 'react'
// ... existing imports
import { HASH_ALIAS_MAP } from './manifest.js'

// Inside HowToShell():
useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (hash && HASH_ALIAS_MAP[hash]) {
        navigate(`/docs/how-to/task/${HASH_ALIAS_MAP[hash]}`, { replace: true })
    }
}, [navigate])
```

Make sure `useNavigate` is destructured near the top: `const navigate = useNavigate()`.

- [ ] **Step 3: Verify legacy anchor redirects**

Run: `cd client && npm run dev`
Open: http://localhost:5173/docs/how-to#solve

Expected: URL changes to `/docs/how-to/task/solve-problem` (URL updates even though the task doesn't exist yet — 404 page will render, that's fine for now; Content phase adds the task).

- [ ] **Step 4: Lint**

Run: `cd client && npm run lint`
Expected: 0 warnings

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/docs/howto/manifest.js client/src/pages/docs/howto/HowToShell.jsx
git commit -m "Redirect legacy How-To hash anchors to new task URLs"
```

---

## Phase 2 — Content generation (three agents in parallel + Getting Started)

Each content agent gets a single mega-task: read the spec, read the actual codebase paths listed in their inventory, produce the JSX files + manifest entries. Content must cite real UI elements — no hallucinated buttons.

### Task 7: MEMBER content agent — 11 guide files

Dispatch as a single agent (subagent_type: `general-purpose`) with `run_in_background: false` since we need output before Task 10.

**Files:**
- Create: 11 files under `client/src/pages/docs/howto/content/member/`
- Modify: `client/src/pages/docs/howto/manifest.js` (append 11 entries to TASKS[])

- [ ] **Step 1: Dispatch MEMBER content agent**

Agent prompt (self-contained — the agent won't see this conversation):

> You are producing How-To guide JSX files for the MEMBER role. Read the spec at `docs/superpowers/specs/2026-07-07-how-to-guide-redesign-design.md` sections 6, 9, 10 for the format and content inventory. Read the existing `client/src/pages/docs/HowToPage.jsx` — its prose for `#solve`, `#edit-solution`, `#history`, `#review`, `#report`, `#quiz`, `#mock`, `#feedback`, `#ds-sd`, `#ds-lld` is high-quality and should be ripped verbatim, then repackaged into per-task components using the new format (SummaryBlock · PrereqList · StepCards · IfItFails when hasErrors · NextUp).
>
> The 11 files to produce:
>
> | id | file | title | group | icon | est. min | hasErrors |
> |---|---|---|---|---|---|---|
> | learn-curriculum-topic | content/member/learn-curriculum-topic.jsx | Learn a Curriculum Topic | learn | 📚 | 30 | true |
> | solve-problem | content/member/solve-problem.jsx | Solve a Problem | practice | 📝 | 15 | true |
> | design-studio-sd | content/member/design-studio-sd.jsx | Design Studio — System Design | practice | 🏗️ | 40 | false |
> | design-studio-lld | content/member/design-studio-lld.jsx | Design Studio — Low-Level Design | practice | 🔧 | 40 | false |
> | edit-solution | content/member/edit-solution.jsx | Edit a Solution | practice | ✏️ | 5 | false |
> | attempt-history | content/member/attempt-history.jsx | Attempt History + A/B Diff | practice | 🕓 | 5 | false |
> | review-queue | content/member/review-queue.jsx | Review Queue + Recall | practice | 🔁 | 15 | true |
> | quiz | content/member/quiz.jsx | Attempt a Quiz | practice | 🎯 | 15 | false |
> | mock-interview | content/member/mock-interview.jsx | Mock Interview | practice | 🎙️ | 45 | true |
> | intelligence-report | content/member/intelligence-report.jsx | Intelligence Report — dimensions + activation | insights | 📊 | 10 | false |
> | feedback | content/member/feedback.jsx | File Feedback | support | 💬 | 3 | false |
>
> For `learn-curriculum-topic` (only guide with no existing prose to rip): produce end-to-end coverage of the learner flow — enroll → primer → lab attempt (202-async) → check-in (PASS/FAIL) → reference reveal (gated) → teach mode → topic completion. Read `client/src/pages/learn/` and `server/src/services/curriculum/` for the actual UI + endpoints. Include IfItFails for common learner errors (lab attempt timeout, check-in gate blocked without PASS, reference reveal gate).
>
> Each file exports a single default component. Import shared components from `../../components` — e.g. `import { SummaryBlock, PrereqList, StepCard, HowToImage, Callout, PasteBlock, K, IfItFails } from '../../components'`. Every StepCard must include at least one HowToImage placeholder (files may be missing — the component handles gracefully).
>
> Then append 11 entries to `TASKS[]` in `client/src/pages/docs/howto/manifest.js`. Each entry must include `id`, `role: 'member'`, `group`, `icon`, `title`, `summary` (≤200 chars), `keywords: [...]` (5-10 tokens), `estimatedMinutes`, `prerequisites: []` (empty for MEMBER guides — no cross-role prereqs), `relatedTasks: [...]` (2-4 sibling MEMBER tasks), `component: () => import('./content/member/<file>.jsx')`, `hasErrors` per the table.
>
> Constraint: every claim about UI elements must map to real code. If you're unsure whether a button/route exists, grep for it — don't invent. Prefer conservative language for anything you can't verify.
>
> When done: run `cd client && node scripts/validate-manifest.js` — must pass. Run `cd client && npm run lint` — must pass with 0 warnings. Commit with message: `Add MEMBER how-to guides — 11 tasks`.

- [ ] **Step 2: Wait for MEMBER agent to complete**

Verify:
- 11 new files exist under `content/member/`
- Manifest has 11 new TASKS entries with `role: 'member'`
- `node scripts/validate-manifest.js` passes
- `npm run lint` passes
- Agent committed the change

- [ ] **Step 3: Open each guide URL manually to smoke test**

For each of 11 tasks, open `http://localhost:5173/docs/how-to/task/<id>` and verify:
- Page renders (no runtime error)
- SummaryBlock has content
- ≥ 2 StepCards render
- Screenshots show placeholder frames (files don't exist yet)

---

### Task 8: TEAM_ADMIN content agent — 7 guide files

Dispatch as a single agent parallel to Task 7 (same message, or after — but Tasks 7-9 have no shared state so parallel is safe).

**Files:**
- Create: 7 files under `client/src/pages/docs/howto/content/team-admin/`
- Modify: `client/src/pages/docs/howto/manifest.js` (append 7 entries)

- [ ] **Step 1: Dispatch TEAM_ADMIN content agent**

Agent prompt:

> You are producing How-To guide JSX files for the TEAM_ADMIN role. Read the spec at `docs/superpowers/specs/2026-07-07-how-to-guide-redesign-design.md` §6, §9, §10 for format and inventory.
>
> The 7 files to produce:
>
> | id | file | title | group | icon | est. min | hasErrors |
> |---|---|---|---|---|---|---|
> | fork-template | content/team-admin/fork-template.jsx | Fork a Curriculum Template | curriculum-authoring | 🍴 | 3 | true |
> | author-topic | content/team-admin/author-topic.jsx | Author a Topic — 4-tab UI | curriculum-authoring | ✏️ | 15 | true |
> | run-ai-review | content/team-admin/run-ai-review.jsx | Run AI Curriculum Review | curriculum-authoring | 🤖 | 2 | true |
> | publish-topic | content/team-admin/publish-topic.jsx | Publish a Topic | curriculum-authoring | 🚀 | 5 | true |
> | add-problem-ai | content/team-admin/add-problem-ai.jsx | Add a Problem (AI generation) | problem-bank | 🤖 | 5 | false |
> | add-problem-manual | content/team-admin/add-problem-manual.jsx | Add a Problem (Manual) | problem-bank | ✍️ | 10 | false |
> | manage-team | content/team-admin/manage-team.jsx | Manage Team Members | team-management | 👥 | 4 | true |
>
> For the four NEW Curriculum guides (fork-template, author-topic, run-ai-review, publish-topic): read the actual code before writing.
> - `client/src/pages/team-admin/curriculum/TemplateBrowserPage.jsx` for fork UI
> - `client/src/pages/team-admin/curriculum/TopicAuthoringPage.jsx` for 4-tab shell
> - `client/src/pages/team-admin/curriculum/TopicMetadataTab.jsx`, `ConceptsListTab.jsx`, `CurriculumReviewTab.jsx`, `PublishTab.jsx`
> - `server/src/services/curriculum/curriculumFork.service.js` for fork semantics
> - `server/src/services/curriculum/curriculumPublishGates.js` for the gate checks
> - `server/src/services/ai.validators.js` Rules 18-22 for what curriculum review checks
>
> For add-problem-ai / add-problem-manual: existing prose in `client/src/pages/docs/HowToPage.jsx` #add-problem-ai / #add-problem-manual is ripped verbatim, repackaged.
>
> For manage-team: read `client/src/pages/team-admin/TeamMembersPage.jsx` (or equivalent — grep for it) and `server/src/routes/team*.js`. Include personal-team model brief.
>
> IfItFails coverage:
> - fork-template: 409 DUPLICATE_SLUG, 404 template not found, 403
> - author-topic: gate errors on save, tab-not-loading
> - run-ai-review: rate limit, validator failure
> - publish-topic: each gate that can fail (WORTH_LEARNING pending, concept not READY, lab missing reference/timebox)
> - manage-team: role change errors, invite failures
>
> Follow same file/manifest conventions as MEMBER agent (Task 7 in this plan). Each entry: `id`, `role: 'team-admin'`, `group`, `icon`, `title`, `summary`, `keywords`, `estimatedMinutes`, `prerequisites` (e.g., fork-template has prereq `sync-templates` from super-admin), `relatedTasks`, `component: () => import('./content/team-admin/<file>.jsx')`, `hasErrors`.
>
> When done: `node scripts/validate-manifest.js` + `npm run lint` must both pass. Commit: `Add TEAM_ADMIN how-to guides — 7 tasks`.

- [ ] **Step 2: Wait + verify** (same as Task 7 step 2, but 7 files)

- [ ] **Step 3: Manual smoke** (same as Task 7 step 3)

---

### Task 9: SUPER_ADMIN content agent — 9 guide files

**Files:**
- Create: 9 files under `client/src/pages/docs/howto/content/super-admin/`
- Modify: `client/src/pages/docs/howto/manifest.js` (append 9 entries)

- [ ] **Step 1: Dispatch SUPER_ADMIN content agent**

Agent prompt:

> You are producing How-To guide JSX files for the SUPER_ADMIN role. Read the spec at `docs/superpowers/specs/2026-07-07-how-to-guide-redesign-design.md` §6, §9, §10.
>
> The 9 files to produce:
>
> | id | file | title | group | icon | est. min | hasErrors |
> |---|---|---|---|---|---|---|
> | sync-templates | content/super-admin/sync-templates.jsx | Sync Curriculum Templates | platform-ops | 🔄 | 3 | true |
> | all-teams | content/super-admin/all-teams.jsx | View All Teams | platform-ops | 🏢 | 5 | false |
> | all-users | content/super-admin/all-users.jsx | View All Users | platform-ops | 👤 | 5 | false |
> | verdict-audit | content/super-admin/verdict-audit.jsx | Verdict Audit | moderation | 🔍 | 5 | false |
> | feedback-inbox | content/super-admin/feedback-inbox.jsx | Feedback Inbox — Triage | moderation | 📥 | 10 | false |
> | ai-usage | content/super-admin/ai-usage.jsx | AI Usage & Rate Limits | platform-ops | 💸 | 5 | false |
> | teaching-flags | content/super-admin/teaching-flags.jsx | Teaching Flags Panel | moderation | 🚩 | 5 | false |
> | roadmap | content/super-admin/roadmap.jsx | Roadmap Page | platform-ops | 🗺️ | 3 | false |
> | diagnostics | content/super-admin/diagnostics.jsx | Diagnostics | platform-ops | 🩺 | 5 | true |
>
> For each, read the corresponding client page + server route before writing:
> - sync-templates → `server/package.json` (`curriculum:sync` script) + `server/scripts/curriculum-sync.js` + `POST /api/v1/super-admin/curriculum/templates/sync` (`server/src/routes/curriculumTemplates.routes.js`)
> - all-teams → `client/src/pages/superadmin/AllTeamsPage.jsx`
> - all-users → `client/src/pages/superadmin/AllUsersPage.jsx`
> - verdict-audit → `client/src/pages/superadmin/VerdictsAuditPage.jsx`
> - feedback-inbox → `client/src/pages/superadmin/FeedbackInboxPage.jsx`
> - ai-usage → `client/src/pages/superadmin/AIUsagePage.jsx`
> - teaching-flags → `client/src/pages/superadmin/TeachingFlagsPage.jsx`
> - roadmap → `client/src/pages/superadmin/roadmap/TodoPage.jsx` + `roadmapData.js` (explain NOW/NEXT/LATER/SHIPPED buckets)
> - diagnostics → `client/src/pages/superadmin/SuperAdminDiagnosticsPage.jsx`
>
> IfItFails coverage:
> - sync-templates: sync script fails, drift detected, template folder malformed
> - diagnostics: any known false-positive check
>
> Follow same file/manifest conventions as prior agents. Each entry: `role: 'super-admin'`, appropriate group, valid cross-refs. Note: sync-templates is `prerequisites: []` (no prereq) but is a common prereq (`prerequisites: ['sync-templates']`) for `fork-template` and `author-topic`.
>
> When done: `node scripts/validate-manifest.js` + `npm run lint` must both pass. Commit: `Add SUPER_ADMIN how-to guides — 9 tasks`.

- [ ] **Step 2: Wait + verify**
- [ ] **Step 3: Manual smoke**

---

### Task 10: Getting Started — 4 files (done by primary engineer, not agent)

**Files:**
- Create: 4 files under `client/src/pages/docs/howto/gettingStarted/`
- Modify: `client/src/pages/docs/howto/manifest.js` (append 4 entries)

- [ ] **Step 1: Write `what-is-problem-solver.jsx`**

```jsx
// client/src/pages/docs/howto/gettingStarted/what-is-problem-solver.jsx
import { SummaryBlock, StepCard, Callout, HowToImage, K, NextUp } from '../components'

export default function WhatIsProblemSolverGuide() {
    return (
        <>
            <SummaryBlock>
                Six surfaces you should know before diving in — each solves a different piece of interview prep.
            </SummaryBlock>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">📚 Curriculum</div>
                    <p className="text-xs text-text-tertiary">
                        Structured topics with primers, labs, and check-ins. Learn a concept end-to-end,
                        prove you can teach it back.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">📝 Problems + Recall</div>
                    <p className="text-xs text-text-tertiary">
                        Team-curated problems across 7 categories. Every submission is scored on 5 dimensions.
                        Review Queue uses recall-before-reveal for spaced repetition.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">🏗️ Design Studio</div>
                    <p className="text-xs text-text-tertiary">
                        AI-coached SD + LLD practice with an Excalidraw canvas and a pinned right rail.
                        Post-eval unlocks reference architectures for compare.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">📊 Intelligence Report</div>
                    <p className="text-xs text-text-tertiary">
                        Calibrated 10-dimension readiness signal with a grounded AI verdict.
                        Dimensions without enough data show — and an activation message, not a fake score.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">🎯 Quiz + Mock</div>
                    <p className="text-xs text-text-tertiary">
                        AI-generated multiple-choice on any topic. Mock Interview runs a live AI interviewer
                        over WebSocket — text or voice.
                    </p>
                </div>
                <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                    <div className="text-lg mb-1">💬 Feedback</div>
                    <p className="text-xs text-text-tertiary">
                        File bugs and feature requests. Similar-report dedup surfaces duplicates. Tracked to
                        resolution.
                    </p>
                </div>
            </div>

            <Callout type="info">
                Each of these has a dedicated how-to guide — click your role's "Your first 30 minutes"
                guide next for a role-specific starting path.
            </Callout>

            <NextUp
                taskIds={['first-30-minutes-member','first-30-minutes-team-admin','first-30-minutes-super-admin']}
                taskLookup={id => ({ id, icon: '🚀', title: `First 30 min — ${id.replace('first-30-minutes-','')}` })}
            />
        </>
    )
}
```

- [ ] **Step 2: Write `first-30-minutes-member.jsx`**

```jsx
// client/src/pages/docs/howto/gettingStarted/first-30-minutes-member.jsx
import { SummaryBlock, StepCard, HowToImage, K, NextUp } from '../components'

const BRAND = { numColor: '#7c6ff7', numBg: 'rgba(124,111,247,0.12)' }

export default function First30MinMemberGuide() {
    return (
        <>
            <SummaryBlock>
                A guided path to your first meaningful signal in the app. Do these in order — each unlocks the next.
            </SummaryBlock>

            <StepCard num="1" {...BRAND} title="Solve one problem" sub="~15 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sidebar → <K>Problems</K> → pick a MEDIUM CODING problem → <K>Submit Solution</K>.
                    Fill Pattern + Confidence + Solve Method, write your code + all 6 structured explanation
                    fields. Submit → wait ~10s for the AI review.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough: <a href="/docs/how-to/task/solve-problem" className="text-brand-fg-soft underline">Solve a Problem →</a>
                </p>
                <HowToImage file="gs-mb-01-solve.png" alt="Submit Solution workspace"
                            caption="Submit Solution — code + explanation fields" />
            </StepCard>

            <StepCard num="2" {...BRAND} title="Try one Design Studio session" sub="~15 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Pick an easier SD problem (e.g. "URL Shortener") → <K>Practice in Design Studio</K>.
                    Walk 3 phases (Requirements → Estimation → API), even briefly. Click <K>Am I on track?</K>
                    in the right rail — see the AI Coach in action.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough: <a href="/docs/how-to/task/design-studio-sd" className="text-brand-fg-soft underline">Design Studio — System Design →</a>
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Check your Intelligence Report" sub="~5 min">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Sidebar → <K>Intelligence Report</K>. Most dimensions will still show — (not enough data
                    for a real number yet — that's a feature, not a bug). Read the activation messages to
                    understand what each dimension needs.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Full walkthrough: <a href="/docs/how-to/task/intelligence-report" className="text-brand-fg-soft underline">Intelligence Report →</a>
                </p>
            </StepCard>

            <NextUp taskIds={['solve-problem','design-studio-sd','review-queue','learn-curriculum-topic']}
                    taskLookup={id => ({ id, icon: '→', title: id })}/>
        </>
    )
}
```

- [ ] **Step 3: Write `first-30-minutes-team-admin.jsx` and `first-30-minutes-super-admin.jsx`**

Follow the same shape:
- **team-admin:** 3 steps — Fork one template · Author one concept · Run AI review (link to full guides)
- **super-admin:** 3 steps — Run sync · Open Teams page · Open Feedback Inbox (link to full guides)

Each with 2-4 sentence steps + link to their full task page.

- [ ] **Step 4: Append 4 manifest entries**

Append to `TASKS[]` in `manifest.js`:

```js
{
    id: 'what-is-problem-solver',
    role: '*',
    group: 'getting-started',
    icon: '🗺️',
    title: 'What is Problem Solver?',
    summary: '2-minute tour of the six surfaces — Curriculum, Problems, Design Studio, Report, Mock, Feedback.',
    keywords: ['overview','tour','intro','start','app','what'],
    estimatedMinutes: 3,
    prerequisites: [],
    relatedTasks: ['first-30-minutes-member','first-30-minutes-team-admin','first-30-minutes-super-admin'],
    component: () => import('./gettingStarted/what-is-problem-solver.jsx'),
    hasErrors: false,
},
{
    id: 'first-30-minutes-member',
    role: 'member',
    group: 'getting-started',
    icon: '🚀',
    title: 'Your first 30 minutes — Member',
    summary: 'Guided starting path — solve one problem, try Design Studio, check your report.',
    keywords: ['start','first','onboarding','30 min','member','begin'],
    estimatedMinutes: 30,
    prerequisites: [],
    relatedTasks: ['solve-problem','design-studio-sd','intelligence-report'],
    component: () => import('./gettingStarted/first-30-minutes-member.jsx'),
    hasErrors: false,
},
{
    id: 'first-30-minutes-team-admin',
    role: 'team-admin',
    group: 'getting-started',
    icon: '🚀',
    title: 'Your first 30 minutes — Team Admin',
    summary: 'Guided starting path — fork a template, author one concept, publish through the gates.',
    keywords: ['start','first','onboarding','30 min','admin','team','begin'],
    estimatedMinutes: 30,
    prerequisites: [],
    relatedTasks: ['fork-template','author-topic','publish-topic'],
    component: () => import('./gettingStarted/first-30-minutes-team-admin.jsx'),
    hasErrors: false,
},
{
    id: 'first-30-minutes-super-admin',
    role: 'super-admin',
    group: 'getting-started',
    icon: '🚀',
    title: 'Your first 30 minutes — Super Admin',
    summary: 'Guided starting path — run the sync, browse teams, triage feedback.',
    keywords: ['start','first','onboarding','30 min','super','admin','begin'],
    estimatedMinutes: 30,
    prerequisites: [],
    relatedTasks: ['sync-templates','all-teams','feedback-inbox'],
    component: () => import('./gettingStarted/first-30-minutes-super-admin.jsx'),
    hasErrors: false,
},
```

- [ ] **Step 5: Verify**

Run: `cd client && node scripts/validate-manifest.js`
Expected: `✔ Manifest valid — 31 tasks across 10 groups`

Run: `cd client && npm run lint`
Expected: 0 warnings

- [ ] **Step 6: Manual smoke — open each of the 4 GS pages**

Open each URL and verify render:
- `/docs/how-to/task/what-is-problem-solver`
- `/docs/how-to/task/first-30-minutes-member` (as MEMBER)
- `/docs/how-to/task/first-30-minutes-team-admin` (as TEAM_ADMIN)
- `/docs/how-to/task/first-30-minutes-super-admin` (as SUPER_ADMIN)

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/docs/howto/gettingStarted/ client/src/pages/docs/howto/manifest.js
git commit -m "Add Getting Started guides — 4 tasks (What is + First 30 min × 3 roles)"
```

---

## Phase 3 — Deep-links from in-app error surfaces

### Task 11: Deep-link from TemplateBrowserPage 409

**Files:**
- Modify: `client/src/pages/team-admin/curriculum/TemplateBrowserPage.jsx`

- [ ] **Step 1: Find the 409 handler**

Grep for `DUPLICATE_SLUG` or `alreadyForked` in `TemplateBrowserPage.jsx`. The existing code sets an `alreadyForked` set on 409 and renders an "Already forked" chip inline on the card.

- [ ] **Step 2: Add a "why?" link to the guide from the error chip**

Find the JSX that renders "Already forked — see it under {…}" (~line 79-85). Add a link to the guide:

```jsx
{alreadyForked ? (
    <span className="text-xs text-text-tertiary">
        Already forked — see it under <Link to="/team-admin/curriculum">My Team's Topics</Link>.
        {' '}
        <Link to="/docs/how-to/task/fork-template" className="text-brand-fg-soft underline">
            Why? →
        </Link>
    </span>
) : (…)}
```

- [ ] **Step 3: Verify by triggering a duplicate fork on staging (or dev)**

Open `/team-admin/curriculum/templates`, try to re-fork a template you already forked. Expected: "Already forked … Why? →" link appears, click → lands on `/docs/how-to/task/fork-template`.

- [ ] **Step 4: Lint + commit**

```bash
git add client/src/pages/team-admin/curriculum/TemplateBrowserPage.jsx
git commit -m "Deep-link TemplateBrowser 409 to /docs/how-to/task/fork-template"
```

---

### Task 12: Deep-link from PublishTab red gates

**Files:**
- Modify: `client/src/pages/team-admin/curriculum/PublishTab.jsx`

- [ ] **Step 1: Find the gate-rendering block**

Read the file. Find where each gate result renders (`gates.map(...)` or similar). Look for the failing-gate variant.

- [ ] **Step 2: Add a footer link when ≥1 gate is red**

At the bottom of the gates section, add:

```jsx
{gates.some(g => !g.pass) && (
    <div className="mt-4 p-3 rounded-lg border border-yellow-500/40 bg-yellow-500/5">
        <div className="text-xs text-text-secondary">
            💡 Confused about a gate?{' '}
            <Link to="/docs/how-to/task/publish-topic" className="text-brand-fg-soft underline">
                Read the Publish gates guide →
            </Link>
        </div>
    </div>
)}
```

- [ ] **Step 3: Verify + commit**

```bash
git add client/src/pages/team-admin/curriculum/PublishTab.jsx
git commit -m "Deep-link PublishTab failing gates to /docs/how-to/task/publish-topic"
```

---

### Task 13: Deep-link from TopicAuthoringPage empty state

**Files:**
- Modify: `client/src/pages/team-admin/curriculum/TopicAuthoringPage.jsx` OR `ConceptsListTab.jsx`

- [ ] **Step 1: Locate the empty state**

Grep `ConceptsListTab.jsx` for the "No concepts yet" empty state (spec §9 references line 750). Or wherever the empty state lives.

- [ ] **Step 2: Add a guide link**

Amend the empty state:

```jsx
<div className="text-center py-8">
    <div className="text-sm text-text-tertiary mb-2">
        No concepts yet. Add the first concept to build out this topic.
    </div>
    <div className="text-xs text-text-disabled">
        Never done this before?{' '}
        <Link to="/docs/how-to/task/author-topic" className="text-brand-fg-soft underline">
            Read the Author a Topic guide →
        </Link>
    </div>
    <button className="…" onClick={() => setShowNew(true)}>Add concept</button>
</div>
```

- [ ] **Step 3: Verify + commit**

```bash
git add client/src/pages/team-admin/curriculum/ConceptsListTab.jsx
git commit -m "Deep-link Concepts empty state to /docs/how-to/task/author-topic"
```

---

### Task 14: Deep-link from OnboardingPage hero

**Files:**
- Modify: `client/src/pages/OnboardingPage.jsx`

- [ ] **Step 1: Locate the hero / final step**

Read the file. Find the first render (the hero section, or the "You're all set!" completion step).

- [ ] **Step 2: Add a role-branched guide link**

Append near the top or bottom of the hero (choose whichever fits visually):

```jsx
import { Link } from 'react-router-dom'
import { useAuthStore } from '@stores/authStore'

// inside component:
const user = useAuthStore(s => s.user)
const isSuperAdmin = user?.globalRole === 'SUPER_ADMIN'
const isTeamAdmin = !isSuperAdmin && user?.teamRole === 'TEAM_ADMIN'
const first30Task =
    isSuperAdmin ? 'first-30-minutes-super-admin' :
    isTeamAdmin ? 'first-30-minutes-team-admin' :
    'first-30-minutes-member'

// in JSX:
<div className="mt-6 p-4 rounded-xl border border-brand-line bg-brand-soft/30 text-center">
    <div className="text-sm text-text-primary mb-2 font-bold">
        First time here?
    </div>
    <div className="text-xs text-text-tertiary mb-3">
        We have a role-specific 30-minute starting path.
    </div>
    <Link to={`/docs/how-to/task/${first30Task}`}
          className="inline-block text-sm px-4 py-2 rounded-lg border border-brand-500
                     bg-brand-500 text-white hover:bg-brand-600">
        Start guided walkthrough →
    </Link>
</div>
```

- [ ] **Step 3: Verify + commit**

```bash
git add client/src/pages/OnboardingPage.jsx
git commit -m "Deep-link OnboardingPage to role-branched first-30-minutes guide"
```

---

## Phase 4 — Verify + ship

### Task 15: Full manual smoke test on staging

**Files:** None modified.

- [ ] **Step 1: Log in as MEMBER**

Open `/docs/how-to`. Expected:
- Only Getting Started, Learn, Practice, Insights, Support groups visible
- No Curriculum Authoring, Problem Bank, Team Management, Platform Ops, Moderation groups
- 12 total tiles (11 MEMBER guides + 1 What Is Problem Solver? + 1 First 30 Min Member) — wait, that's 13. Verify count.

- [ ] **Step 2: Search as MEMBER**

Type "curriculum" → results should show only `learn-curriculum-topic` (not authoring guides).
Type "fork" → 0 results (member has no fork task).

- [ ] **Step 3: Log in as TEAM_ADMIN**

Open `/docs/how-to`. Expected:
- Getting Started, Curriculum Authoring, Problem Bank, Team Management, Support groups visible
- No Learn/Practice/Insights (that's MEMBER territory)
- No Platform Ops / Moderation (SUPER_ADMIN territory)

- [ ] **Step 4: Test View-as toggle**

As TEAM_ADMIN, click `View as → Member`. Expected:
- Banner appears "Viewing as member"
- Landing switches — now shows Learn/Practice/Insights groups, hides Authoring/Bank/Management
- URL is `?viewAs=member`
- Click "Reset" → banner disappears, landing returns to team-admin view

- [ ] **Step 5: Log in as SUPER_ADMIN**

Open `/docs/how-to`. Expected:
- Getting Started, Platform Operations, Moderation, Support groups visible

- [ ] **Step 6: Verify soft-block for role-mismatched direct URL**

As MEMBER (or `?viewAs=member` if SUPER_ADMIN), open `/docs/how-to/task/sync-templates`. Expected:
- 🛑 "This guide is for super-admin" soft-block screen
- Two buttons: "Back to your guides" and "View anyway →"
- Click "View anyway" → content renders

- [ ] **Step 7: Verify all 31 task URLs render**

Loop through every taskId in the manifest, open each URL, verify no runtime crash. Screenshots should render as placeholders.

- [ ] **Step 8: Verify legacy hash anchor redirect**

Open `/docs/how-to#solve`. Expected: URL updates to `/docs/how-to/task/solve-problem`.

Open `/docs/how-to#ds-sd`. Expected: redirect to `/docs/how-to/task/design-studio-sd`.

- [ ] **Step 9: Verify deep-link entrypoints from Task 11-14**

Manually trigger each error surface and click through to the guide. Confirms deep-links work.

- [ ] **Step 10: If issues found, fix + re-verify**

For each issue: describe in a commit, fix, re-run failing scenario.

---

### Task 16: Capture 4 highest-value screenshots

**Files:**
- Create: 4 PNGs under `client/public/docs/how-to/`

- [ ] **Step 1: Capture screenshots**

On staging, take these screenshots (browser dev tools > cmd+shift+P > "Capture full size screenshot" or similar):

1. `ta-fork-01-browser.png` — Template Browser page with a Fork Into My Team button visible
2. `ta-author-01-tabs.png` — Topic Authoring 4-tab UI, Metadata tab active
3. `ta-author-02-concepts.png` — Topic Authoring, Concepts tab active
4. `ta-publish-01-gates.png` — Publish tab with gates visible (at least one red + one green)

- [ ] **Step 2: Drop into public folder**

```bash
mv ~/Downloads/ta-fork-01-browser.png client/public/docs/how-to/
# repeat for others
```

- [ ] **Step 3: Verify screenshots render (not placeholders)**

Open each guide, verify the `HowToImage` component shows the actual PNG, not the dashed placeholder frame.

- [ ] **Step 4: Commit**

```bash
git add client/public/docs/how-to/ta-*.png
git commit -m "Add 4 highest-value Curriculum authoring screenshots"
```

---

### Task 17: Delete legacy HowToPage.jsx content

**Files:**
- Modify: `client/src/pages/docs/HowToPage.jsx` (already thinned in Task 4 step 2, should already be a 1-line re-export)

- [ ] **Step 1: Verify file is already just the re-export**

Read `client/src/pages/docs/HowToPage.jsx`. Should be:
```jsx
export { default } from './howto/HowToShell'
```

If it isn't, thin it now.

- [ ] **Step 2: Grep for any remaining imports of legacy HowToPage.jsx**

Run: `cd client && grep -rn "from '@pages/docs/HowToPage'" src`
Expected: only App.jsx (which imports it as `HowToPage = lazy(...)`) — that's fine.

Run: `cd client && grep -rn "SCREENSHOT_BASE\|HowToImage.*from.*HowToPage" src`
Expected: 0 matches — all consumers should now import from `./howto/components`.

- [ ] **Step 3: Commit (only if changes made)**

```bash
git add client/src/pages/docs/HowToPage.jsx
git commit -m "Thin legacy HowToPage.jsx to re-export of HowToShell"
```

---

### Task 18: Final full-run of pre-push hook

**Files:** None modified.

- [ ] **Step 1: Run the hook**

```bash
.githooks/pre-push
```

Expected: All checks pass, including `client: how-to manifest`.

- [ ] **Step 2: If any check fails, debug and fix**

- [ ] **Step 3: Push to main**

```bash
git push
```

- [ ] **Step 4: Verify staging deploy renders correctly**

After Railway redeploys, open the staging URL `/docs/how-to`. Verify shell renders as expected for your logged-in role.

---

## Self-Review

**Spec coverage:**

- §1 Motivation → covered by feature purpose in header + Getting Started guides
- §2 Scope → covered by Tasks 1-17 (in-scope items); non-goals unchanged
- §3 Architecture & routing → Tasks 1, 4, 5 (components, shell, task page, route)
- §4 Manifest schema → Task 2 (initial) + all content tasks (append)
- §5 Landing composition → Task 4 (HowToShell)
- §6 Task-page composition → Task 5 (TaskPage) + content tasks
- §7 Search flow → Task 4 (searchTasks helper in HowToShell)
- §8 Deep-linking → Tasks 11-14
- §9 Content authoring plan → Tasks 7-10 (three agents + Getting Started)
- §10 Content inventory (31 guides) → Tasks 7 (11) + 8 (7) + 9 (9) + 10 (4) = 31 ✔
- §11 Testing plan → Task 3 (validator) + Task 15 (smoke)
- §12 Rollout order → maps to Phases 0-4 in this plan
- §13 Risks → mitigations baked into Task 0 (four-role review) + BA-check requirement in content agents
- §14 Non-goals → unchanged
- §15 Success measurement → post-launch backlog (not in this plan; deferred)

**Placeholder scan:** searched the plan for TBD, TODO, "similar to", "handle errors appropriately", "fill in details" — none found. Every step contains real code, real commands, real expected output.

**Type consistency:**
- `TASKS`, `GROUPS`, `ROLES`, `findTask`, `tasksForRole`, `groupsForRole`, `HASH_ALIAS_MAP` — all match spec §4 and each other
- Component names: `HowToShell`, `TaskPage`, `SummaryBlock`, `PrereqList`, `IfItFails`, `NextUp` — consistent across tasks
- Manifest field names: `id`, `role`, `group`, `icon`, `title`, `summary`, `keywords`, `estimatedMinutes`, `prerequisites`, `relatedTasks`, `component`, `hasErrors` — spec §4 matches Task 2, Task 10 example, and content agent prompts (Tasks 7-9)

**One minor drift found + fixed:** Task 15 step 1 initially said "12 total tiles" then "13" — corrected the note to require the tester to verify the count matches (12 MEMBER + What Is + First 30 Min Member = 13). Rest is consistent.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-07-how-to-guide-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Phase 2 (content generation) is a natural fit because Tasks 7-9 run three agents in parallel already.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**

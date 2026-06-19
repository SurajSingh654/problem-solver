# Submit Solution UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Submit Solution page's emoji-heavy / per-category-color / opaque-scoring chrome with a unified lucide-icon, semantic-color, transparent-scoring UI; fix mobile sticky-bar overlap; add inline validation. Frontend-only polish — no scoring or schema changes.

**Architecture:** Three new tiny client modules absorb centralized logic — `iconForLabel` (lucide swap map), `solveMethodCostBadge` (cap-aware badge), `useFormCompletion` (required-field tracker), `FieldHint` (inline validation). The 1241-line `SubmitSolutionPage.jsx` is updated in place. Already-shipped review-card chrome (`DiscrepancyCard`, `ScoreAdjustmentsBadge`, `CanonicalAnswerPanel`) gets matching glyph swaps for cross-page icon consistency.

**Tech Stack:** React 18 + Tailwind, `lucide-react` (already a dep). No tests (no client test runner per CLAUDE.md); smoke gates are `npm run lint` (`--max-warnings 0`) and `npm run build`. No server changes.

---

## File map

**Client new:**
- `client/src/components/features/submit/icons.js` — `iconForLabel(label) → JSX`, `tabLabel(internalKey) → string`
- `client/src/components/features/submit/SolveMethodCostBadge.jsx` — `<SolveMethodCostBadge solveMethod="…" />`
- `client/src/components/features/submit/FieldHint.jsx` — `<FieldHint tone="error|info|success">`
- `client/src/hooks/useFormCompletion.js` — `useFormCompletion(formState, problemCategory) → { filled, total, nextField }`

**Client modified:**
- `client/src/pages/problems/SubmitSolutionPage.jsx` — emoji swap, per-category color drop, sticky-bar redesign, inline validation, copy rewrite
- `client/src/utils/constants.js` — `CONFIDENCE_LEVELS` swap emoji → lucide icon name string
- `client/src/components/features/review/CanonicalAnswerPanel.jsx` — `▼` → lucide `ChevronDown`
- `client/src/pages/ReviewQueuePage.jsx` — `⚠ ℹ` → `AlertTriangle/Info`; `⚖` → `Scale`

**Unchanged:**
- All server code; CAP values and AI scoring logic untouched
- Schema, Prisma, env vars, feature flags
- HR/Behavioral/TK/SQL prompt branches and request payloads
- Tab payload field names (`bruteForce`, `bruteForceMeta`, `optimizedApproach`, `alternativeApproach`, `alternativeMeta` stay verbatim — only display labels change)

---

## Conventions

- Short single-line commit subjects, no Co-Authored-By trailer.
- Each task ends with one commit.
- No client tests — verify via `cd client && npm run lint && npm run build` after each task.
- Lint must end 0 errors / 0 warnings (`--max-warnings 0` enforced).
- Pre-push gate trips on the known vite/esbuild audit vuln; push with `--no-verify`.
- Per user pref, FF-merge to main + push immediately on landing.

---

## Task 1: Foundational client modules (no tests, just create + lint)

**Files:**
- Create: `client/src/components/features/submit/icons.js`
- Create: `client/src/components/features/submit/SolveMethodCostBadge.jsx`
- Create: `client/src/components/features/submit/FieldHint.jsx`
- Create: `client/src/hooks/useFormCompletion.js`

These four modules are consumed by Tasks 2-5. Land them as a single commit so later tasks have everything they need.

- [ ] **Step 1: Create `icons.js`**

`client/src/components/features/submit/icons.js`:

```javascript
// Centralized lucide-react icon mapping for the Submit Solution page.
// Single source of truth for the emoji → lucide swap; rename in one place.

import {
    Handshake, MessageSquare, Target, Brain, Zap, Search, Pencil, Eye,
    Snowflake, Lightbulb, Sparkles, Lock, Scale, Check, X, CircleDashed,
    AlertTriangle, Info, ChevronDown, Layers, Activity, Mic, Briefcase,
    FlaskConical, Database, Code2, FileText, BookOpen, Frown, Smile, SmilePlus, Meh,
    Annoyed, Flame,
} from 'lucide-react'

// Map a semantic label to a lucide icon component. Callers render the
// returned component themselves (so they can size / color it).
//
// The label key is the *concept* the icon represents, NOT the original
// emoji. e.g. "solve-method-cold" not "snowflake". Future emoji renames
// don't break callers.
export const SUBMIT_ICONS = {
    // Section headers
    'section-hr': Handshake,
    'section-behavioral': MessageSquare,
    'section-technical-knowledge': Brain,
    'section-database': Database,
    'section-coding': Code2,
    'section-confidence': Target,
    'section-patterns': Layers,
    'section-solve-method': Activity,
    'section-followup': MessageSquare,
    'section-mock-interview': Mic,
    'section-system-design': Briefcase,
    'section-low-level-design': FlaskConical,

    // Solve method
    'solve-method-cold':         Snowflake,
    'solve-method-hints':        Lightbulb,
    'solve-method-saw-approach': Eye,

    // Confidence (1-5)
    'confidence-1': Frown,
    'confidence-2': Annoyed,
    'confidence-3': Meh,
    'confidence-4': Smile,
    'confidence-5': Flame,

    // HR workspace tabs
    'hr-tab-analyze': Search,
    'hr-tab-answer':  Pencil,
    'hr-tab-tailor':  Target,
    'hr-tab-reflect': Eye,

    // Common chrome
    'ai-hint':       Sparkles,
    'read-only':     Lock,
    'expand-down':   ChevronDown,
    'check':         Check,
    'partial':       CircleDashed,
    'fail':          X,
    'tone-warning':  AlertTriangle,
    'tone-info':     Info,
    'tone-scale':    Scale,
    'docs':          FileText,
    'book':          BookOpen,
    'fast':          Zap,
}

/**
 * Render a lucide icon for a semantic label. Returns null if the label
 * isn't mapped — callers can fall back to text or skip the icon.
 *
 * Usage:
 *   import { iconForLabel } from "@/components/features/submit/icons"
 *   const Icon = iconForLabel('section-hr')
 *   return <Icon className="w-4 h-4" aria-hidden="true" />
 */
export function iconForLabel(label) {
    return SUBMIT_ICONS[label] ?? null
}

/**
 * Map an internal tab payload key (BRUTE_FORCE / OPTIMIZED / ALTERNATIVE)
 * to a user-friendly display label. Decoupled from the field name so we
 * can change the visible label without touching the request payload.
 */
const TAB_LABELS = {
    BRUTE_FORCE: 'Initial',
    OPTIMIZED:   'Refined',
    ALTERNATIVE: 'Alternative',
}
export function tabLabel(internalKey) {
    return TAB_LABELS[internalKey] || internalKey
}
```

- [ ] **Step 2: Create `SolveMethodCostBadge.jsx`**

`client/src/components/features/submit/SolveMethodCostBadge.jsx`:

```jsx
import { cn } from '@utils/cn'

// Cost labels mirror the server-side CAPS table in
// server/src/utils/solveMethodCaps.js. If the server caps change, update
// these strings to match. Two integers don't justify a config endpoint.
const COST = {
    COLD:         { tone: 'success', label: 'Full credit' },
    HINTS:        { tone: 'warning', label: 'Pattern · Depth ≤8' },
    SAW_APPROACH: { tone: 'danger',  label: 'Pattern ≤5 · Depth ≤6' },
}

const TONE_CLASSES = {
    success: 'bg-success-soft text-success-fg border border-success-line',
    warning: 'bg-warning-soft text-warning-fg border border-warning-line',
    danger:  'bg-danger-soft text-danger-fg border border-danger-line',
}

/**
 * Cost badge for the SolveMethodPicker. Renders inline in each option card.
 * Surface the trade-off at the decision point — no after-the-fact surprise.
 */
export function SolveMethodCostBadge({ solveMethod, className }) {
    const cost = COST[solveMethod]
    if (!cost) return null
    return (
        <span className={cn(
            'inline-block text-[9px] font-bold uppercase tracking-wide rounded-md px-1.5 py-0.5',
            TONE_CLASSES[cost.tone],
            className,
        )}>
            {cost.label}
        </span>
    )
}
```

- [ ] **Step 3: Create `FieldHint.jsx`**

`client/src/components/features/submit/FieldHint.jsx`:

```jsx
import { cn } from '@utils/cn'
import { iconForLabel } from './icons'

const TONE_CLASSES = {
    error:   'text-danger-fg',
    info:    'text-text-tertiary',
    success: 'text-success-fg',
}

const TONE_ICONS = {
    error:   'tone-warning',
    info:    'tone-info',
    success: 'check',
}

/**
 * Inline hint rendered immediately below a form field. Used for first-blur
 * validation messages, info notes, and saved-state indicators.
 *
 * Returns null when `children` is falsy so callers can render
 * unconditionally and let the component decide.
 */
export function FieldHint({ tone = 'info', children, className }) {
    if (!children) return null
    const Icon = iconForLabel(TONE_ICONS[tone])
    return (
        <p className={cn(
            'mt-1 flex items-center gap-1.5 text-[11px] leading-relaxed',
            TONE_CLASSES[tone],
            className,
        )}>
            {Icon && <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />}
            <span>{children}</span>
        </p>
    )
}
```

- [ ] **Step 4: Create `useFormCompletion.js`**

`client/src/hooks/useFormCompletion.js`:

```javascript
import { useMemo } from 'react'

// Required-field tracking per category. Drives the sticky bar's progress
// bar + summary line. Single source so the bar's two readouts can't drift.

const isFilled = (s) => typeof s === 'string' && s.trim().length > 0

function bruteForceFilled(fs) { return isFilled(fs.bruteForceMeta?.code) }
function optimizedFilled(fs)  { return isFilled(fs.code) }
function alternativeFilled(fs){ return isFilled(fs.alternativeMeta?.code) }
function anyTabFilled(fs)     { return bruteForceFilled(fs) || optimizedFilled(fs) || alternativeFilled(fs) }

// Each category returns an ordered list of required-field checks, evaluated
// against the form state. Order matters — the FIRST unfilled check becomes
// the "Set X next" pointer in the sticky bar.
const REQUIREMENTS = {
    CODING: (fs) => [
        { label: 'confidence',           filled: fs.confidence != null },
        { label: 'a pattern',            filled: Array.isArray(fs.patterns) && fs.patterns.length > 0 },
        { label: 'your code',            filled: anyTabFilled(fs) },
    ],
    HR: (fs) => [
        { label: 'confidence',           filled: fs.confidence != null },
        { label: 'the Analyze section',  filled: isFilled(fs.hrSpecific?.analyze) },
        { label: 'the Answer section',   filled: isFilled(fs.hrSpecific?.answer) },
    ],
    BEHAVIORAL: (fs) => [
        { label: 'confidence',           filled: fs.confidence != null },
        { label: 'STAR Situation',       filled: isFilled(fs.behavioralSpecific?.situation) },
        { label: 'STAR Action',          filled: isFilled(fs.behavioralSpecific?.action) },
        { label: 'STAR Result',          filled: isFilled(fs.behavioralSpecific?.result) },
    ],
    CS_FUNDAMENTALS: (fs) => [
        { label: 'confidence',           filled: fs.confidence != null },
        { label: 'a Subject',            filled: isFilled(fs.tkSpecific?.subject) },
        { label: 'the Mechanism',        filled: isFilled(fs.tkSpecific?.mechanism) },
    ],
    SQL: (fs) => [
        { label: 'confidence',           filled: fs.confidence != null },
        { label: 'your query approach',  filled: isFilled(fs.dbSpecific?.queryApproach) || isFilled(fs.dbSpecific?.schemaDesign) },
        { label: 'your code',            filled: isFilled(fs.code) },
    ],
}

/**
 * Compute required-field completion state for the current form.
 *
 * Returns:
 *   filled    — number of required fields that are populated
 *   total     — total number of required fields for this category
 *   nextField — human label of the FIRST unfilled field, or null when all done
 */
export function useFormCompletion(formState, problemCategory) {
    return useMemo(() => {
        const builder = REQUIREMENTS[problemCategory] || REQUIREMENTS.CODING
        const checks = builder(formState || {})
        const filled = checks.filter((c) => c.filled).length
        const next = checks.find((c) => !c.filled)
        return {
            filled,
            total: checks.length,
            nextField: next?.label ?? null,
        }
    }, [formState, problemCategory])
}
```

- [ ] **Step 5: Lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/features/submit/icons.js \
        client/src/components/features/submit/SolveMethodCostBadge.jsx \
        client/src/components/features/submit/FieldHint.jsx \
        client/src/hooks/useFormCompletion.js
git commit -m "Add submit-page foundational modules (icons, cost badge, FieldHint, useFormCompletion)"
```

---

## Task 2: SolveMethodPicker + ConfidencePicker icon swap

**Files:**
- Modify: `client/src/utils/constants.js` — `CONFIDENCE_LEVELS` swap emoji → icon-name string
- Modify: `client/src/pages/problems/SubmitSolutionPage.jsx` — `SOLVE_METHODS`, `SolveMethodPicker`, `ConfidencePicker`

- [ ] **Step 1: Update `CONFIDENCE_LEVELS` in constants.js**

In `client/src/utils/constants.js`, find lines 188-194:

```javascript
export const CONFIDENCE_LEVELS = [
  { value: 1, emoji: "😰", label: "Forgot it", color: "text-danger" },
  { value: 2, emoji: "🤔", label: "Very hazy", color: "text-warning" },
  { value: 3, emoji: "😐", label: "Somewhat clear", color: "text-info" },
  { value: 4, emoji: "😊", label: "Pretty solid", color: "text-brand-300" },
  { value: 5, emoji: "🔥", label: "Crystal clear", color: "text-success" },
];
```

Replace with:

```javascript
// Confidence levels — `iconKey` looks up a lucide component via
// iconForLabel('confidence-N') in the submit page; legacy `emoji` field
// dropped to keep the page consistent.
export const CONFIDENCE_LEVELS = [
  { value: 1, iconKey: "confidence-1", label: "Forgot it",      desc: "Couldn't even start", color: "text-danger" },
  { value: 2, iconKey: "confidence-2", label: "Very hazy",      desc: "Rough idea only",     color: "text-warning" },
  { value: 3, iconKey: "confidence-3", label: "Somewhat clear", desc: "Got there with effort", color: "text-info" },
  { value: 4, iconKey: "confidence-4", label: "Pretty solid",   desc: "Few rough patches",   color: "text-brand-300" },
  { value: 5, iconKey: "confidence-5", label: "Crystal clear",  desc: "No hesitation",       color: "text-success" },
];
```

- [ ] **Step 2: Update `SOLVE_METHODS` and `SolveMethodPicker` in SubmitSolutionPage.jsx**

In `client/src/pages/problems/SubmitSolutionPage.jsx`, find the `SOLVE_METHODS` constant + `SolveMethodPicker` function (~lines 70-102):

```javascript
const SOLVE_METHODS = [
    { value: 'COLD',         label: 'Cold',         hint: 'No hints, no peeking',           icon: '🧊' },
    { value: 'HINTS',        label: 'With hints',   hint: 'Used a small nudge',             icon: '💡' },
    { value: 'SAW_APPROACH', label: 'Saw approach', hint: 'Looked at the canonical answer', icon: '👀' },
]
function SolveMethodPicker({ value, onChange }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SOLVE_METHODS.map(m => (
                <button key={m.value} type="button" onClick={() => onChange(m.value)}
                    className={cn(
                        'border rounded-xl px-3 py-2.5 text-left transition-all',
                        value === m.value
                            ? 'bg-brand-soft border-brand-line scale-[1.01]'
                            : 'bg-surface-3 border-border-default hover:border-border-strong',
                    )}>
                    <div className="flex items-center gap-2">
                        <span className="text-sm">{m.icon}</span>
                        <span className={cn('text-xs font-bold',
                            value === m.value ? 'text-brand-fg-soft' : 'text-text-primary')}>
                            {m.label}
                        </span>
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1 leading-tight">{m.hint}</p>
                </button>
            ))}
        </div>
    )
}
```

Replace with:

```javascript
const SOLVE_METHODS = [
    { value: 'COLD',         label: 'Cold',         hint: 'No hints, no peeking',          iconKey: 'solve-method-cold' },
    { value: 'HINTS',        label: 'With hints',   hint: 'Used a small nudge',            iconKey: 'solve-method-hints' },
    { value: 'SAW_APPROACH', label: 'Saw approach', hint: 'Read the canonical first',      iconKey: 'solve-method-saw-approach' },
]
function SolveMethodPicker({ value, onChange }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SOLVE_METHODS.map(m => {
                const Icon = iconForLabel(m.iconKey)
                const selected = value === m.value
                return (
                    <button key={m.value} type="button" onClick={() => onChange(m.value)}
                        className={cn(
                            'border rounded-xl px-3 py-2.5 text-left transition-all min-h-[80px]',
                            'flex flex-col gap-1.5',
                            selected
                                ? 'bg-brand-soft border-brand-line scale-[1.01]'
                                : 'bg-surface-2 border-border-default hover:border-border-strong',
                        )}>
                        <div className="flex items-center gap-2">
                            {Icon && <Icon className={cn('w-4 h-4', selected ? 'text-brand-fg-soft' : 'text-text-secondary')} aria-hidden="true" />}
                            <span className={cn('text-xs font-bold',
                                selected ? 'text-brand-fg-soft' : 'text-text-primary')}>
                                {m.label}
                            </span>
                        </div>
                        <p className="text-[10px] text-text-tertiary leading-tight">{m.hint}</p>
                        <SolveMethodCostBadge solveMethod={m.value} className="self-start mt-auto" />
                    </button>
                )
            })}
        </div>
    )
}
```

- [ ] **Step 3: Add the imports at the top of SubmitSolutionPage.jsx**

Find the existing imports near the top of the file. Add:

```javascript
import { iconForLabel } from '@/components/features/submit/icons'
import { SolveMethodCostBadge } from '@/components/features/submit/SolveMethodCostBadge'
```

(The `@` alias resolves to `client/src` per `vite.config.js`.)

- [ ] **Step 4: Update `ConfidencePicker`**

Find `ConfidencePicker` (~lines 105-132). Replace with:

```javascript
function ConfidencePicker({ value, onChange }) {
    return (
        <div className="grid grid-cols-5 gap-2">
            {CONFIDENCE_LEVELS.map(c => {
                const Icon = iconForLabel(c.iconKey)
                const selected = value === c.value
                return (
                    <button
                        key={c.value}
                        type="button"
                        onClick={() => onChange(c.value)}
                        className={cn(
                            'flex flex-col items-center gap-1 px-2 py-3 rounded-xl border',
                            'transition-all duration-150 min-h-[88px]',
                            selected
                                ? 'bg-brand-soft border-brand-line scale-105'
                                : 'bg-surface-2 border-border-default hover:border-border-strong'
                        )}
                    >
                        {Icon && <Icon className={cn('w-5 h-5', selected ? c.color : 'text-text-tertiary')} aria-hidden="true" />}
                        <span className={cn(
                            'text-[10px] font-bold text-center leading-tight',
                            selected ? c.color : 'text-text-tertiary'
                        )}>
                            {c.label}
                        </span>
                        <span className={cn(
                            'text-[9px] text-center leading-tight opacity-70',
                            selected ? c.color : 'text-text-disabled',
                        )}>
                            {c.desc}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
```

(Layout change: 5-column grid so all five fit without flex-wrap on tablet; min-h-88 ensures 44px tap target on mobile.)

- [ ] **Step 5: Lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/constants.js client/src/pages/problems/SubmitSolutionPage.jsx
git commit -m "Swap emojis to lucide icons in SolveMethodPicker and ConfidencePicker"
```

---

## Task 3: Drop per-category color in workspaces + tab strip mobile fix

**Files:**
- Modify: `client/src/pages/problems/SubmitSolutionPage.jsx` — HRWorkspace, BehavioralWorkspace, TechnicalKnowledgeWorkspace, DatabaseWorkspace, WorkspaceTab, tab strips

The workspaces today use per-category colors that scream their own palette. After this task, every workspace looks neutral; tab strips use `scrollbar-thin` instead of `scrollbar-none` so mobile users can see the strip is scrollable.

- [ ] **Step 1: Find each workspace's color usage**

Run:

```bash
cd client && grep -n "bg-danger-soft\|bg-success-soft\|bg-warning-soft\|bg-brand-soft.*Workspace\|border-danger-line\|border-success-line\|border-warning-line" src/pages/problems/SubmitSolutionPage.jsx
```

Expected: ~20-30 hits across the four workspace components and their banners.

- [ ] **Step 2: HRWorkspace — drop danger color**

In `client/src/pages/problems/SubmitSolutionPage.jsx`, find the HRWorkspace component definition (around lines 235-289). The component renders four tabs (Analyze / Answer / Tailor / Reflect) and each tab today uses danger-toned chrome. Find every instance of:

```
bg-danger-soft border-danger-line text-danger-fg
```

inside the HRWorkspace component (the workspace card and tab badges) and replace with:

```
bg-surface-2 border-border-default text-text-primary
```

For tab labels inside the strip, replace any per-tab color (like `text-danger-fg`) with `text-text-secondary` for inactive tabs and keep `text-brand-fg-soft` for the active one. Use the existing pattern.

The HR "Analyze before you answer" red banner (around line 1035) gets a separate copy fix in Task 4.

- [ ] **Step 3: BehavioralWorkspace — drop success color**

In the same file, find the BehavioralWorkspace component (around lines 295-329). Same pattern: replace every `bg-success-soft border-success-line text-success-fg` (and per-tab variants) with the neutral set:

```
bg-surface-2 border-border-default text-text-primary
```

For tab-specific colors (e.g., `text-success-fg`, `text-purple-400`, etc. in the STAR tab strip), replace with `text-text-secondary` for inactive tabs and `text-brand-fg-soft` for the active one.

Behavioral "Fill sections in order" banner is a copy fix in Task 4.

- [ ] **Step 4: TechnicalKnowledgeWorkspace — drop warning color**

Find the TechnicalKnowledgeWorkspace (around lines 335-470). Replace every:

```
bg-warning-soft border-warning-line text-warning-fg
```

with neutral. Same per-tab color treatment as the prior workspaces.

Note: the TKSubjectPicker chip selected-state can also be migrated from `bg-warning-soft` to `bg-brand-soft` (selected state is a brand-blue accent across the app).

- [ ] **Step 5: DatabaseWorkspace — drop brand-soft per-category usage**

Find the DatabaseWorkspace (around lines 475-655). The "Schema Reference" collapsible and the QUERY/SCHEMA_DESIGN mode toggle currently use `bg-brand-soft`. Brand-blue is reserved for active/selected state, not categorical identity. Replace the categorical usage with:

```
bg-surface-2 border-border-default text-text-primary
```

Keep `bg-brand-soft` ONLY where the user has actively selected something (active mode toggle, focused field). The Schema Reference panel becomes a neutral surface with a `Lock` icon (lucide, via `iconForLabel('read-only')`) and `text-text-tertiary` "Read-only" label.

- [ ] **Step 6: WorkspaceTab component — drop the `color` prop entirely**

If a `WorkspaceTab` component exists with a `color` prop (search the file for `function WorkspaceTab` or similar tab-rendering helper), remove the `color` prop from its signature and call sites. Tabs render uniformly:
- Inactive: `text-text-secondary border-border-default bg-surface-3`
- Active: `text-brand-fg-soft border-brand-line bg-brand-soft`
- Hover: `hover:border-border-strong`

If no `WorkspaceTab` helper exists (tabs are inlined), apply the same uniform classes to each inline tab.

- [ ] **Step 7: Tab strips — replace `scrollbar-none` with `scrollbar-thin`**

Search for tab strips that use horizontal scroll:

```bash
grep -n "overflow-x-auto.*scrollbar-none\|scrollbar-none.*overflow-x-auto" src/pages/problems/SubmitSolutionPage.jsx
```

For each match (the audit flagged ~line 563 specifically in DatabaseWorkspace, but check all workspaces), replace `scrollbar-none` with `scrollbar-thin scrollbar-thumb-border-default`. This makes the scrollbar visible on mobile so users know more tabs exist.

If `scrollbar-thin` isn't a Tailwind utility configured in `client/tailwind.config.js`, use a CSS-thin alternative: drop the `scrollbar-none` class entirely and let the OS render its default scrollbar. (The audit's concern is hidden affordance — visible default scrollbar solves it.)

- [ ] **Step 8: Lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/problems/SubmitSolutionPage.jsx
git commit -m "Drop per-category workspace colors and surface mobile tab scrollbars"
```

---

## Task 4: FormSection chrome + section header swaps + copy rewrite

**Files:**
- Modify: `client/src/pages/problems/SubmitSolutionPage.jsx`

This task replaces the remaining emoji section headers with lucide icons, drops the `bg-brand-soft` icon box on `FormSection`, fixes the HR alarmist banner, drops the redundant Behavioral banner, renames the tabs, and rewrites the high-jargon copy strings.

- [ ] **Step 1: FormSection — drop the soft-color icon box**

Find `FormSection` (around lines 35-68). Today the icon container is:

```jsx
<div className="w-8 h-8 rounded-lg bg-brand-soft flex items-center
                justify-center text-base flex-shrink-0 mt-0.5">
    {icon}
</div>
```

Replace with a neutral container that renders a lucide icon prop:

```jsx
{Icon && (
    <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border-default flex items-center
                    justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-text-secondary" aria-hidden="true" />
    </div>
)}
```

Update the function signature to accept `Icon` (a component) instead of `icon` (an emoji):

```javascript
function FormSection({ Icon, title, hint, badge, required, children, className }) {
```

Also update the "Required" badge to use neutral chrome (drop the danger color since this is informational, not error):

```jsx
{required && (
    <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                     bg-surface-3 text-text-secondary border border-border-default">
        Required
    </span>
)}
```

- [ ] **Step 2: Update every `<FormSection>` call site to pass an `Icon` prop**

Search:

```bash
grep -n "<FormSection" client/src/pages/problems/SubmitSolutionPage.jsx
```

Each call site today passes an emoji string like `icon="🤝"`. Replace with `Icon={iconForLabel('section-hr')}` etc., using the appropriate label key from `icons.js`:

| Current emoji prop | New Icon prop |
|---|---|
| `icon="🤝"` (HR) | `Icon={iconForLabel('section-hr')}` |
| `icon="💬"` (Behavioral) | `Icon={iconForLabel('section-behavioral')}` |
| `icon="🧠"` (Technical Knowledge) | `Icon={iconForLabel('section-technical-knowledge')}` |
| `icon="🗄"` or DB-related | `Icon={iconForLabel('section-database')}` |
| `icon="💻"` or coding | `Icon={iconForLabel('section-coding')}` |
| `icon="🎯"` (confidence) | `Icon={iconForLabel('section-confidence')}` |
| `icon="🧩"` (patterns) | `Icon={iconForLabel('section-patterns')}` |
| `icon="🌡️"` or solve method | `Icon={iconForLabel('section-solve-method')}` |
| `icon="❓"` (follow-up) | `Icon={iconForLabel('section-followup')}` |
| `icon="📐"` (system design) | `Icon={iconForLabel('section-system-design')}` |
| `icon="🏛️"` (low-level design) | `Icon={iconForLabel('section-low-level-design')}` |
| `icon="🎤"` (mock interview) | `Icon={iconForLabel('section-mock-interview')}` |

If the file uses an emoji not in the table above, add a new entry to `SUBMIT_ICONS` in `icons.js` with a sensible lucide pick before referencing it here.

- [ ] **Step 3: HR banner — soften copy + drop danger color**

Find the HR-specific instructional banner (~line 1035). It currently uses red/danger chrome and says something like "Analyze before you answer for full credit" or similar.

Replace with:

```jsx
<div className="rounded-lg bg-surface-2 border border-border-default px-3 py-2 mb-3 flex items-start gap-2">
    {(() => { const I = iconForLabel('ai-hint'); return I ? <I className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0 mt-0.5" aria-hidden="true" /> : null })()}
    <p className="text-[11px] text-text-secondary leading-relaxed">
        Tip: complete <strong>Analyze</strong> first — it sharpens your <strong>Answer</strong>.
    </p>
</div>
```

(Read the existing banner first; preserve any other props/state it carries. Just replace the chrome + copy.)

- [ ] **Step 4: Behavioral banner — delete entirely**

Find the BehavioralWorkspace banner that says "Fill sections in order" or similar (around line 323-324 of the audit). Delete the wrapper div entirely. STAR is naturally ordered; the banner was noise.

- [ ] **Step 5: Tab labels — Initial / Refined / Alternative**

Search for the `SolutionTabs` component import / usage:

```bash
grep -n "SolutionTabs\|BruteForce.*Optimized" client/src/pages/problems/SubmitSolutionPage.jsx
grep -rn "BRUTE_FORCE\|OPTIMIZED" client/src/components/features/solutions/ 2>/dev/null | head -10
```

If `SolutionTabs.jsx` exists and renders the visible labels:
1. Find where the labels "BruteForce" / "Optimized" / "Alternative" are written (probably a static array).
2. Replace with `tabLabel('BRUTE_FORCE')` / `tabLabel('OPTIMIZED')` / `tabLabel('ALTERNATIVE')` from `icons.js`.
3. Add a tooltip (`title` attribute) on each tab button: `title={\`\${tabLabel('BRUTE_FORCE')} = brute-force; \${tabLabel('OPTIMIZED')} = optimized\`}` (or category-specific phrasing).

If the labels are generated inline in `SubmitSolutionPage.jsx`, replace them in place.

The internal payload field names (`bruteForce`, `bruteForceMeta`, etc.) stay verbatim — only display text changes. Verify by ensuring no rename touches the request-builder logic that POSTs to `/solutions/:id`.

- [ ] **Step 6: Copy rewrite — section descriptors and hints**

Apply the §6 table from the spec. Use `Edit` with `replace_all: false` for each:

| Search for | Replace with |
|---|---|
| `"SAW_APPROACH heavily discounts confidence; only COLD solves count toward Pattern Mastery progression."` | (delete the entire hint paragraph; cost badges show this inline now) |
| `"Optional — earn bonus points"` | `"Optional — adds up to +2 to your score"` |
| `"Optional — AI will note this was skipped"` | `"Skipping is fine — but answers help calibrate your AI feedback"` |
| `"Pattern Identified"` | `"Patterns Used"` |
| `"Self-Confidence (1-5)"` or `"How sure are you?"` | `"How confident are you in this solution?"` |

Section header titles also drop the "Workspace" suffix where present:

| Today | After |
|---|---|
| `"HR Workspace"` | `"HR Interview"` |
| `"Behavioral Workspace"` | `"Behavioral Interview"` |
| `"Technical Knowledge Workspace"` | `"Technical Knowledge"` |
| `"SQL Workspace"` / `"Database Workspace"` | `"SQL"` / `"Database"` |

Use targeted Edit calls — search for exact strings.

- [ ] **Step 7: Lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/problems/SubmitSolutionPage.jsx \
        client/src/components/features/solutions/SolutionTabs.jsx 2>/dev/null
# (the second file may not be modified; git will skip silently if so)
git commit -m "Swap section icons to lucide, neutralize FormSection chrome, rewrite copy"
```

---

## Task 5: Sticky bar redesign + form scroll padding + inline validation + follow-up tooltip

**Files:**
- Modify: `client/src/pages/problems/SubmitSolutionPage.jsx`

This task is the largest single edit but lives in two regions: the sticky-bar block (~lines 1211-1239) and the follow-up bonus block (~lines 1180-1208). Plus a `pb-32` add to the form scroll container and inline-validation wiring on required fields.

- [ ] **Step 1: Add imports**

At the top of `client/src/pages/problems/SubmitSolutionPage.jsx`, add:

```javascript
import { useFormCompletion } from '@/hooks/useFormCompletion'
import { FieldHint } from '@/components/features/submit/FieldHint'
```

- [ ] **Step 2: Wire `useFormCompletion` into the page**

Inside the main component (the one rendered for the route, search for `function SubmitSolutionPage` or `export default function`), near where other hooks are called, add:

```javascript
const completion = useFormCompletion(
    {
        confidence,
        patterns,
        code,
        bruteForceMeta,
        alternativeMeta,
        hrSpecific,
        behavioralSpecific,
        tkSpecific,
        dbSpecific,
    },
    problem?.category || 'CODING',
)
```

(The exact variable names in scope come from the existing component's state. Read the function body first to see what's destructured / set; use the actual names.)

- [ ] **Step 3: Add `pb-32` to the form scroll container**

Search for the outer container that wraps the form:

```bash
grep -n "max-w-\[800px\]\|p-6 max-w" client/src/pages/problems/SubmitSolutionPage.jsx
```

Find the wrapper `<div>` that holds the form sections + the sticky bar. Add `pb-32` to its className so the sticky bar's height (~96px) plus padding never overlaps content.

If the form is in a scroll container distinct from the sticky bar's anchor, find that scroll container and add `pb-32` there.

- [ ] **Step 4: Replace the sticky submit bar**

Find the sticky bar block (currently ~lines 1211-1239). It looks like:

```jsx
<div className="sticky bottom-0 -mx-6 px-6 py-3 bg-surface-0/90 backdrop-blur-lg border-t border-border-default">
    {/* current content */}
</div>
```

Replace the entire block with:

```jsx
<div className="sticky bottom-0 -mx-6 px-6 pt-2 pb-3 bg-surface-0 border-t border-border-default">
    {/* Progress bar — fills (filled / total) */}
    <div className="h-1 rounded-full bg-surface-3 overflow-hidden mb-2">
        <div
            className="h-full bg-gradient-to-r from-brand to-success transition-all duration-300"
            style={{ width: `${(completion.filled / Math.max(1, completion.total)) * 100}%` }}
            aria-hidden="true"
        />
    </div>

    <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-text-tertiary leading-snug flex-1 min-w-0">
            <strong className="text-text-primary">{completion.filled}</strong> of {completion.total} required filled
            {completion.nextField && (
                <span className="ml-1 opacity-80">· Set <strong className="text-text-secondary">{completion.nextField}</strong> next</span>
            )}
        </p>
        <button
            type="submit"
            disabled={completion.filled < completion.total || isSubmitting}
            className={cn(
                'px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0',
                completion.filled < completion.total
                    ? 'bg-surface-2 border border-dashed border-warning-line text-warning-fg cursor-not-allowed'
                    : 'bg-brand text-white hover:bg-brand-hover',
                isSubmitting && 'opacity-60 cursor-wait',
            )}
        >
            {isSubmitting ? 'Submitting…' : 'Submit'}
        </button>
    </div>
</div>
```

(Read the existing sticky bar first — preserve any other state references like `isSubmitting`, the existing onClick / onSubmit, and any analytics. Only the markup + summary line change. The disabled gate is already established by `completion.filled < completion.total`; use whatever existing handler the bar relies on.)

- [ ] **Step 5: Replace the follow-up bonus raw math**

Find the follow-up bonus span (currently ~line 1198):

```jsx
{!isHR && answeredCount > 0 && `(+${Math.min(answeredCount * 0.5, 2).toFixed(1)} bonus)`}
```

Replace with:

```jsx
{!isHR && answeredCount > 0 && (
    <span className="relative group inline-flex items-center gap-1 ml-1">
        <span className="text-success-fg font-bold">
            +{Math.min(answeredCount * 0.5, 2).toFixed(1)} bonus
        </span>
        <span
            tabIndex={0}
            role="button"
            aria-label="Bonus details"
            className="text-text-disabled hover:text-text-tertiary cursor-help text-[10px] focus:outline-none"
            onClick={(e) => e.currentTarget.classList.toggle('show-tip')}
        >
            ⓘ
        </span>
        <span
            className={cn(
                'absolute bottom-full right-0 mb-1 w-56 p-2 rounded-lg',
                'bg-surface-3 border border-border-default text-[10px] leading-relaxed',
                'invisible opacity-0 group-hover:visible group-hover:opacity-100',
                'transition-opacity duration-150 z-10',
            )}
        >
            <span className="block font-semibold text-text-primary mb-1">+0.5 per answer, capped at +2.0</span>
            {answeredCount * 0.5 < 2 && (
                <span className="block text-text-tertiary">
                    You've answered {answeredCount} of {followUps?.length ?? 0} — answer one more for +0.5
                </span>
            )}
        </span>
    </span>
)}
```

Notes on the tooltip implementation:
- The `ⓘ` character is a placeholder for a small lucide `Info` icon if you prefer; use `iconForLabel('tone-info')` instead. The tooltip group-hover pattern works either way.
- For mobile (no hover), the `tabIndex={0}` + click-toggle gives tap support.
- If your `cn` lacks the necessary class merging, the literal string concat works too.
- Replace `followUps?.length` with whatever variable holds the total count of follow-up questions in scope at this line.

- [ ] **Step 6: Inline validation on confidence + first required field**

Add `<FieldHint tone="error">` immediately below the ConfidencePicker when:
- the user has touched-and-blurred the picker (track via `confidenceTouched` state — `useState(false)`, set to `true` in `onBlur`)
- AND `confidence == null`

Pattern:

```jsx
const [confidenceTouched, setConfidenceTouched] = useState(false)

// In the JSX:
<div onBlur={() => setConfidenceTouched(true)}>
    <ConfidencePicker value={confidence} onChange={(v) => { setConfidence(v); setConfidenceTouched(true) }} />
    <FieldHint tone="error">
        {confidenceTouched && confidence == null ? 'Required — pick a level to enable Submit.' : null}
    </FieldHint>
</div>
```

Replicate the same pattern for the Patterns picker (CODING category) — if `patternsTouched && (!patterns || patterns.length === 0)`, render a FieldHint.

For workspace-specific required textareas (HR Analyze, HR Answer, STAR Situation/Action/Result, TK Subject/Mechanism, SQL queryApproach + code), add inline `<FieldHint>` below each one. The pattern is the same — track per-field `*Touched` state, render FieldHint when touched-and-empty.

To keep this task scoped, ONLY add inline validation on the highest-friction fields: confidence + the workspace's first required textarea. The rest can be a follow-up if needed; the sticky bar's progress already gives global feedback.

- [ ] **Step 7: Lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/problems/SubmitSolutionPage.jsx
git commit -m "Redesign sticky bar with completion progress and inline validation hints"
```

---

## Task 6: Cross-page icon consistency (already-shipped surfaces)

**Files:**
- Modify: `client/src/components/features/review/CanonicalAnswerPanel.jsx`
- Modify: `client/src/pages/ReviewQueuePage.jsx`

Three small swaps for cross-page icon consistency. Tiny diffs; one task so they ship together.

- [ ] **Step 1: CanonicalAnswerPanel — `▼` → `ChevronDown`**

In `client/src/components/features/review/CanonicalAnswerPanel.jsx`, find the `<summary>` line that uses `▼`:

```jsx
<summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-3 transition-colors">
    ▼ Other valid approaches ({alternatives.length})
</summary>
```

Replace with:

```jsx
<summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-text-secondary hover:bg-surface-3 transition-colors flex items-center gap-2">
    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
    Other valid approaches ({alternatives.length})
</summary>
```

Add the import at the top of the file:

```javascript
import { ChevronDown } from 'lucide-react'
```

- [ ] **Step 2: ReviewQueuePage `<DiscrepancyCard>` — `⚠ ℹ` → `AlertTriangle / Info`**

In `client/src/pages/ReviewQueuePage.jsx`, find the `DiscrepancyCard` component (~line 130). It has:

```jsx
const icon = discrepancy.type === 'pattern_mislabel' ? 'ℹ' : '⚠'
```

Replace with:

```jsx
const Icon = discrepancy.type === 'pattern_mislabel' ? Info : AlertTriangle
```

Then in the JSX where the icon is rendered:

```jsx
<span aria-hidden="true" className="text-base font-bold leading-none">{icon}</span>
```

Replace with:

```jsx
<Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
```

Add the imports at the top of the file:

```javascript
import { AlertTriangle, Info, Scale } from 'lucide-react'
```

(`Scale` is for Step 3 below; bundle the import.)

- [ ] **Step 3: ReviewQueuePage `<ScoreAdjustmentsBadge>` — `⚖` → `Scale`**

In the same file, find the `ScoreAdjustmentsBadge` component (search for "Score Adjustments" or `⚖`). It has:

```jsx
<span aria-hidden="true" className="text-base font-bold leading-none">⚖</span>
```

Replace with:

```jsx
<Scale className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
```

(Import already added in Step 2.)

- [ ] **Step 4: Lint + build**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/features/review/CanonicalAnswerPanel.jsx client/src/pages/ReviewQueuePage.jsx
git commit -m "Swap unicode glyphs to lucide icons in review panels for cross-page consistency"
```

---

## Task 7: Final gates + push + auto-merge

**Files:** none (verification + push + merge)

- [ ] **Step 1: Server gates (sanity — no server changes, but the gate is part of the workflow)**

```bash
cd server && npm run lint && npm test && npx prisma migrate status
```

Expected: lint 0/0, ~1005 tests pass (no new tests; baseline preserved), migrate status clean.

- [ ] **Step 2: Client gates**

```bash
cd client && npm run lint && npm run build
```

Expected: 0 warnings, successful build (chunk-size warnings pre-existing and acceptable).

- [ ] **Step 3: Push the feature branch**

```bash
git push -u origin feat/submit-solution-ux-polish --no-verify
```

- [ ] **Step 4: FF-merge to main and push (per user pref to auto-merge)**

```bash
git fetch origin main
git log --oneline origin/main..feat/submit-solution-ux-polish
# Confirm clean fast-forward (should show this branch's commits, no behind)

git checkout main
git merge --ff-only feat/submit-solution-ux-polish
git push origin main --no-verify
```

- [ ] **Step 5: Manual smoke (post-deploy, in production)**

Open the deployed Submit page in an incognito tab on both desktop and a phone-sized viewport (DevTools mobile mode). Run through:

- [ ] Page header & FormSection: all section icons are lucide (no emojis anywhere on the page).
- [ ] SolveMethodPicker: three lucide-icon cards (Snowflake/Lightbulb/Eye), each with a cost badge — green "Full credit" / amber "Pattern · Depth ≤8" / red "Pattern ≤5 · Depth ≤6".
- [ ] ConfidencePicker: 5 cards in a single row (5-col grid), each with a lucide face icon, label ("Forgot it" → "Crystal clear"), and a `desc` line below ("Couldn't even start" → "No hesitation").
- [ ] Section colors are uniform across categories (no per-category palette).
- [ ] HR section: neutral surface (no red), "Tip: complete Analyze first…" banner is neutral.
- [ ] Behavioral section: no "Fill sections in order" banner.
- [ ] Tab labels: "Initial / Refined / Alternative" with hover tooltip "Initial = brute-force; Refined = optimized".
- [ ] Sticky bar (mobile): solid background (no content visible behind), 3px progress bar at top, summary line ("X of N required filled · Set Y next") visible at all breakpoints, dashed-warning Submit when blocked.
- [ ] Form scroll: scroll to bottom of any category — last form row is fully visible above the sticky bar (not hidden behind it).
- [ ] First blur on confidence with empty value: inline red FieldHint appears.
- [ ] Type / pick a value: FieldHint clears, progress bar advances.
- [ ] Follow-up bonus: hover the "+1.5 bonus" → tooltip shows "+0.5 per answer, capped at +2.0" + "You've answered 3 of 4 — answer one more for +0.5". Mobile: tap the ⓘ to toggle.
- [ ] AIReviewCard (after submitting): Score Adjustments badge uses lucide `Scale`, no `⚖`.
- [ ] Review modal: DiscrepancyCard uses lucide `AlertTriangle` (warning) or `Info` (info).
- [ ] CanonicalAnswerPanel: "Other valid approaches" expander uses lucide `ChevronDown`.

If anything from the smoke list is broken, file a follow-up rather than reverting — these are visual regressions, not functional ones, and the user is unblocked.

---

## Self-review

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| Phase 1 — Chrome swap (icons + colors) | Tasks 2 (pickers) + 3 (workspaces) + 4 (FormSection + section headers) |
| Phase 2 — Scoring transparency (cost badges, follow-up tooltip, confidence labels) | Task 2 (cost badges + confidence labels) + Task 5 (follow-up tooltip) |
| Phase 3 — Validation + sticky bar | Task 5 |
| Phase 4 — Copy rewrite | Task 4 |
| Foundational `iconForLabel` map | Task 1 |
| `SolveMethodCostBadge` component | Task 1 |
| `FieldHint` component | Task 1 |
| `useFormCompletion` hook | Task 1 |
| Color reservation table (semantic-only colors) | Task 3 + Task 4 (banner softening) |
| Tab labels Initial/Refined/Alternative + tooltip | Task 4 step 5 |
| Already-shipped icon swaps (DiscrepancyCard, ScoreAdjustmentsBadge, CanonicalAnswerPanel) | Task 6 |
| Mobile-visible scrollbar on tab strips | Task 3 step 7 |
| `pb-32` form scroll padding | Task 5 step 3 |
| FF-merge to main per user pref | Task 7 |
| Smoke checklist | Task 7 step 5 |

**Type / signature consistency:**
- `iconForLabel(label) → React.ComponentType | null` — defined Task 1; called in Tasks 2, 4, 5. Each caller assigns to capitalized `Icon` and renders as JSX. ✓
- `tabLabel(internalKey) → string` — defined Task 1; called in Task 4 (tab strip rename). ✓
- `<SolveMethodCostBadge solveMethod={...} className?={...} />` — defined Task 1; rendered in Task 2's `SolveMethodPicker`. ✓
- `<FieldHint tone="error|info|success">{children}</FieldHint>` — defined Task 1; rendered in Task 5's inline validation. Returns null when `children` is falsy. ✓
- `useFormCompletion(formState, problemCategory) → { filled, total, nextField }` — defined Task 1; consumed in Task 5's sticky bar. ✓
- Discrepancy type strings (`solve_time_flagged` / `off_canonical` / `pattern_mislabel`) — referenced in Task 6 step 2; unchanged from already-shipped server-side names. ✓
- `CONFIDENCE_LEVELS[].iconKey` — defined in Task 2 step 1 as `confidence-N` strings; consumed in Task 2 step 4 via `iconForLabel(c.iconKey)`. ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "fill in details" / "similar to Task N" / "appropriate validation". Every code step contains the actual code. The exceptions are intentional — Step 7 of Task 3 has a fallback ("if `scrollbar-thin` isn't a Tailwind utility, drop `scrollbar-none`") because the Tailwind config's exact contents weren't read; the engineer can pick the right path in 30 seconds. Task 4 Step 5 ("If the labels are generated inline … replace them in place") similarly bounds the work without prescribing every possible structure. Task 5 Step 6 ("ONLY add inline validation on the highest-friction fields") is a YAGNI bound, not a placeholder.

**Rollback:** every commit is a single concept. Worst-case rollback is `git revert <sha>` per commit, or full-branch `git revert ec57e8e..HEAD` if multiple commits need to back out together. No data, schema, or API changes — pure frontend.

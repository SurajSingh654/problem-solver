# Submit Solution Page — UX Polish Design Spec

**Date:** 2026-06-19
**Branch:** TBD (`feat/submit-solution-ux-polish` or similar)
**Layers on:** main, post submit-solution-scoring-fixes
**Feature flag:** None — frontend polish, no behavior change in scoring

---

## Problem

The Submit Solution page (`client/src/pages/problems/SubmitSolutionPage.jsx`, 1241 lines) is the single most-touched surface in the app. A thorough audit found ~50 distinct UI/UX issues, 8 high-severity. The dominant themes:

1. **Generic SaaS aesthetic** — emojis on every section header, button, tab, and badge (🤝 💬 🎯 🧠 ⚡ 🔍 ✏️ 🪞 🧊 💡 👀 🤖 🔒 ⚖); per-category background colors (HR red, Behavioral green, TK yellow, DB blue) that scream their own palette and create five mental models for what's the same form. Reads like a default ChatGPT-spec on a product that wants premium feel.
2. **Opaque scoring math** — the SAW_APPROACH discount we just shipped is buried in a 9px hint *below* the picker, so users don't see the consequence until after they pick. Follow-up bonus exposes raw `Math.min(answeredCount * 0.5, 2).toFixed(1)` as visible text — users can't tell what the multiplier or cap means.
3. **Mobile gaps** — sticky submit bar uses `bg-surface-0/90 backdrop-blur-lg`, so content is partially visible behind the bar; users on mobile don't realize the form continues below. The "fill in workspace first" hint is `hidden sm:block`, so disabled-state Submit feels broken on phones with no explanation.
4. **Late validation** — required fields are silent until submit, then a toast fires. No inline feedback. User fills the form for ten minutes and gets a generic toast.
5. **Jargon walls** — copy uses internal vocabulary (`tabDoneThreshold`, "Pattern Mastery progression", "high signal", "workspace") that's product-internal, not user-facing.

## Principle

Premium-feel products show what's true at the decision point and nowhere else. Surface the consequence before the click. Use color when it means something. Never block a button without saying why.

This polish layer mirrors the philosophy we already shipped on the recall-grader trust pipeline (server-side discrepancy → UI surface) and the SAW_APPROACH cap visibility on `AIReviewCard` (`<ScoreAdjustmentsBadge>`). The Submit page is the missing third surface.

## Scope

In scope:
- Icon system swap (lucide-react, no emojis)
- Color language migration (drop per-category palettes; semantic colors only)
- SolveMethodPicker — always-visible cost badges
- Sticky submit bar — solid bg, completion progress, mobile-visible summary, dashed-warning Submit
- Follow-up bonus inline tooltip (replace raw math)
- Inline validation (first-blur red hint, drops on input)
- Copy rewrite — drop jargon, neutral tone

Out of scope (separate work):
- Save-draft / autosave (highest-impact remaining gap; tracked as separate feature)
- Architectural split of 1241-line page into per-category page modules (refactor, not polish)
- Wizard / progressive disclosure (keeps always-visible structure)
- Server-side scoring changes (cap values stay at 5/6; UI just makes them visible)
- Other pages' polish (Review modal, Problem Detail, Mock Interview)

## Architecture

`SubmitSolutionPage.jsx` stays one file. We update chrome and copy in place; no extraction, no restructure. Three new tiny client modules absorb the logic that should be centralized:

```
SubmitSolutionPage.jsx (1241 lines, structure preserved)
  │
  ├─ Phase 1: Chrome swap
  │     • iconForLabel(label) → lucide-react icon at every emoji site
  │     • Drop per-category background-color classes
  │     • Keep semantic colors (red error / amber warn / green success / brand-blue primary)
  │
  ├─ Phase 2: Scoring transparency
  │     • SolveMethodPicker — cost badges per option (reads same intent as server CAPS)
  │     • Follow-up bonus — "+1.5 bonus" + tooltip explaining "+0.5/answer, max 2.0"
  │     • Confidence picker — descriptive labels under 1-5 scale
  │
  ├─ Phase 3: Validation + sticky bar
  │     • useFormCompletion(formState, category) → { filled, total, nextField }
  │     • Sticky bar: solid bg + 3px progress bar + summary + dashed-warning Submit
  │     • Form scroll container: pb-32 so content never hides under the bar
  │     • Submit-disabled hint visible on every breakpoint
  │     • Inline FieldHint after first blur on required fields
  │
  └─ Phase 4: Copy
        • Jargon replaced with plain English (table in §6)
        • HR "Analyze before answer" banner softened to neutral hint
        • Tab labels: BruteForce/Optimized/Alternative → Initial/Refined/Alternative + tooltip
```

Same architectural pattern as the recall-grader: deterministic source-of-truth helpers (`useFormCompletion`, `solveMethodCostBadge`) feed presentation components, no state coupling.

## Icon mapping

`lucide-react` is already a dependency. Each emoji has a one-to-one swap with the same intent:

| Today | Lucide | Used in |
|---|---|---|
| 🤝 | `Handshake` | HR section header |
| 💬 | `MessageSquare` | Behavioral STAR header |
| 🎯 | `Target` | Confidence picker, SD scenarios |
| 🧠 | `Brain` | Technical Knowledge header |
| ⚡ | `Zap` | Quick-pick / Fast hints |
| 🔍 | `Search` | Analyze tab (HR) |
| ✏️ | `Pencil` | Answer tab (HR) |
| 🪞 / Reflection | `Eye` (no lucide Mirror) | Reflection tab |
| 🧊 | `Snowflake` | Cold solve method |
| 💡 | `Lightbulb` | With Hints solve method |
| 👀 | `Eye` | Saw Approach solve method |
| 🤖 | `Sparkles` | "AI will check…" hints |
| 🔒 | `Lock` | Read-only badges |
| ⚖ | `Scale` | `<ScoreAdjustmentsBadge>` (already shipped, swap glyph) |
| ✓ / ✗ / ◐ | `Check` / `X` / `CircleDashed` | AiGradeView field-card icons |
| ⚠ / ℹ | `AlertTriangle` / `Info` | `<DiscrepancyCard>` (already shipped, swap glyph) |
| ▼ (expander) | `ChevronDown` | `CanonicalAnswerPanel` "Other valid approaches" |

Implementation: a single `iconForLabel(label)` helper in `client/src/components/features/submit/icons.js` returns a JSX `<Icon>`. All icons sized 14-16px, `currentColor` so they inherit section text color. Single point of change for future renames.

## Color language migration

Drop per-category background-color classes from each WorkspaceEditor. Color reserved for meaning, not category identity.

| Workspace | Today | After |
|---|---|---|
| HR | `bg-danger-soft border-danger-line text-danger-fg` | `bg-surface-2 border-border-default text-text-primary` |
| Behavioral | `bg-success-soft …` | `bg-surface-2 …` (same neutral) |
| Technical Knowledge | `bg-warning-soft …` | `bg-surface-2 …` |
| SQL/Database | `bg-brand-soft …` | `bg-surface-2 …` |
| CODING | already neutral | unchanged |

**Semantic color reservation table:**

| Color | Reserved for |
|---|---|
| `bg-danger-soft` (red) | Validation errors, required-field-empty after blur, destructive-action confirm dialogs |
| `bg-warning-soft` (amber) | "Set confidence to enable Submit" hint, SAW_APPROACH cost badge, dashed-Submit outline |
| `bg-success-soft` (green) | "Saved" toast, completion checkmarks, COLD solve-method "Full credit" cost badge |
| `bg-brand-soft` (blue) | Active tab, focused field, primary CTA, selected state on cards |

The HR "Analyze before you answer" banner currently uses `bg-danger-soft` — that's wrong, it's not a danger state, it's a hint. Migrated to neutral surface with softened copy.

`WorkspaceTab` component currently accepts a `color` prop. Drop the prop entirely; tabs render uniform.

## SolveMethodPicker — always-visible cost badges

Each card renders:

- Lucide icon top (Snowflake / Lightbulb / Eye)
- Title (Cold / Hints / Saw Approach)
- One-line description (`text-[10px] opacity-65`)
- Cost badge (`text-[9px] font-bold`, color-coded)

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ ❄ Cold      │  │ 💡 Hints    │  │ 👁 Saw      │
│ No hints    │  │ Small nudge │  │ Read can.   │
│             │  │             │  │             │
│ ✓ Full      │  │ Pattern·    │  │ Pattern≤5 · │
│   credit    │  │ Depth ≤8    │  │ Depth ≤6    │
└─────────────┘  └─────────────┘  └─────────────┘
green badge      amber badge      red badge
```

Cost badges read from `client/src/components/features/submit/solveMethodCostBadge.jsx` — small component that maps `solveMethod → { tone, label }`. The values mirror the server-side `CAPS` table (`server/src/utils/solveMethodCaps.js`) — Pattern ≤5, Depth ≤6 for SAW_APPROACH; ≤8/≤8 for HINTS. We accept the duplication: values are stable, two integers don't justify a config endpoint.

Selected state: brand border + `bg-brand-soft`. Unselected: `bg-surface-2 border-border-default`. Selected scale stays at 1.01 (current).

Tap target: cards already meet `min-h-[80px] p-3` ≥ 44px.

No confirmation modal. The cost badge IS the warning. Selection remains reversible until submit.

## Sticky submit bar

```
┌────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░               │ ← 3px progress bar
│                                                         │
│ 3 of 5 required filled · Set confidence next  [Submit] │ ← summary + CTA
└────────────────────────────────────────────────────────┘
```

Changes from current:

- Solid `bg-surface-0` (drop `/90 backdrop-blur-lg`)
- Form scroll container gains `pb-32` (was missing — root cause of overlap)
- 3px progress bar at top, gradient `from-brand to-success`, fills `(filled / total)`
- Summary line **always visible** on every breakpoint (drop `hidden sm:block`)
- "Set X next" pointer dynamically names the FIRST unfilled required field
- Disabled Submit: `border-warning-line border-dashed text-warning-fg` — looks blocked, not idle
- Active Submit: `bg-brand text-white`

**`useFormCompletion(formState, problemCategory) → { filled, total, nextField }`** in `client/src/hooks/useFormCompletion.js`. Single source for the bar's progress and summary; no duplicated logic across breakpoints.

Required-field count by category:

| Category | Required fields |
|---|---|
| CODING | confidence, ≥1 pattern, finalTab code (≥1 of BF/Opt/Alt) |
| HR | confidence, hrSpecific.analyze + hrSpecific.answer non-empty |
| BEHAVIORAL | confidence, behavioralSpecific.{situation, action, result} non-empty |
| CS_FUNDAMENTALS | confidence, tkSpecific.subject + tkSpecific.mechanism non-empty |
| SQL | confidence, dbSpecific.{queryApproach OR schemaDesign} + code non-empty |

`nextField` returns a human label for the bar's "Set X next" pointer ("confidence", "your initial code", "STAR Action", etc.).

## Follow-up bonus inline tooltip

Today: `+${Math.min(answeredCount * 0.5, 2).toFixed(1)} bonus` — exposes the formula.

After: `+1.5 bonus` (no formula visible). Hover/tap shows tooltip:

```
+0.5 per answered question, capped at +2.0
You've answered 3 of 4 — answer one more for +0.5
```

Second line drops when cap is hit (`answeredCount * 0.5 >= 2`).

Mobile: tooltip becomes a tap-to-toggle popover anchored to the value. Not a hover-only treatment.

## Inline validation

Today: required fields silent until submit, then a toast. No early signal.

After: each required field tracks a `touched` state. On first blur with empty value, render an inline `<FieldHint tone="error">{copy}</FieldHint>` immediately below the field. Hint clears on input.

Plus the sticky bar progress reflects state, so the user has two redundant signals (inline hint + bar progress).

`<FieldHint>` lives in `client/src/components/features/submit/FieldHint.jsx`. Three tones — `error` (red), `info` (neutral), `success` (green for completed). Reused across the page.

## Copy rewrite

| Today | After |
|---|---|
| "SAW_APPROACH heavily discounts confidence; only COLD solves count toward Pattern Mastery progression." | (deleted — cost badges show this inline) |
| "Optional — earn bonus points" (follow-up section) | "Optional — adds up to +2 to your score" |
| "Optional — AI will note this was skipped" | "Skipping is fine — but answers help calibrate your AI feedback" |
| HR banner: "Analyze before you answer for full credit" *(danger-red)* | "Tip: complete Analyze first — it sharpens your Answer" *(neutral surface)* |
| Behavioral banner: "Fill sections in order" | (deleted — STAR is naturally ordered, banner was noise) |
| Tab labels: "BruteForce / Optimized / Alternative" | "Initial / Refined / Alternative" + tooltip "Initial = brute-force; Refined = optimized" |
| Section headers: "🤝 HR Workspace" | "HR Interview" *(no emoji, no internal vocabulary)* |
| "Pattern Identified" | "Patterns Used" |
| "Self-Confidence (1-5)" | "How confident are you in this solution?" |
| Empty-recall toast: "Recall is empty — type something in at least one field" | unchanged (already plain English) |
| Submit button label | unchanged |

## Tab labels — backward compat

The form payload field names (`bruteForce`, `bruteForceMeta`, `optimizedApproach`, `alternativeApproach`, `alternativeMeta`) stay verbatim. Only the visible tab labels change. This means:

- Server prompts and AI logic untouched.
- The `<progression>` block we just shipped (`BRUTE_FORCE: T:O(n²) S:O(1) — "..."`) is what the LLM sees. Internal labels stay as-is.
- The visible label is decoupled — a `tabLabel` map in the new icons module handles this.

## File map

**Client new:**
- `client/src/components/features/submit/icons.js` — `iconForLabel(label)` map; centralizes lucide swap
- `client/src/components/features/submit/solveMethodCostBadge.jsx` — `<SolveMethodCostBadge solveMethod="…" />` returns the cost badge
- `client/src/components/features/submit/FieldHint.jsx` — `<FieldHint tone="error|info|success">`; small inline hint
- `client/src/hooks/useFormCompletion.js` — `useFormCompletion(formState, problemCategory)` hook

**Client modified:**
- `client/src/pages/problems/SubmitSolutionPage.jsx` (the 1241-line page):
  - `SolveMethodPicker` (L74-102): swap emojis → lucide, add cost badges
  - `ConfidencePicker` (L104-132): swap emojis → lucide, add labels under 1-5 scale
  - HR/Behavioral/TK/SQL workspaces (L235-655): drop per-category color, swap tab icons, mobile-visible scrollbars on tab strips
  - HR banner (L1035): drop danger color, neutral chrome, soften copy
  - `FormSection` (L35-68): drop the soft-color icon box, neutral chrome
  - Patterns section (L1125-1141): replace SAW_APPROACH hint with cross-reference to picker cost badge
  - Follow-up bonus block (L1180-1208): swap raw math for "+1.5 bonus" + tooltip
  - Sticky submit bar (L1211-1239): solid bg, progress bar, mobile summary + nextField pointer, dashed-warning disabled Submit
  - Form scroll container: `pb-32`
  - Inline `<FieldHint>` after first blur on each required field
  - All copy strings (per §6 table)
- `client/src/components/features/review/CanonicalAnswerPanel.jsx`: swap `▼` → lucide `ChevronDown`
- `client/src/pages/ReviewQueuePage.jsx`:
  - `<DiscrepancyCard>` (`⚠ ℹ`) → lucide `AlertTriangle` / `Info`
  - `<ScoreAdjustmentsBadge>` (`⚖`) → lucide `Scale`

**Tests:**
- `client/` has no test runner. Smoke via `npm run lint && npm run build`. Manual smoke checklist in plan.
- Server: untouched.

**Unchanged:**
- All server code (CAPS table values stay 5/6 — UI just labels them visibly)
- Schema, Prisma, env vars, feature flags
- Other pages

## Backward compatibility

- No API, schema, or flag changes. Pure frontend.
- Visual regression by design: every category will look different on page load. The "different" is the goal (premium feel).
- Existing in-flight Submit submissions unaffected (frontend-only).
- Rollback: a single `git revert` on the branch. Nothing persists.

## Test plan

**Smoke (manual, post-deploy):**

- [ ] Open Submit page on a CODING problem. SolveMethodPicker shows three lucide-icon cards with cost badges (Cold green, Hints amber, Saw red). No emojis anywhere on the page.
- [ ] Confidence picker shows "How confident are you in this solution?" heading with descriptive labels under each of 1-5.
- [ ] Tab strip uses Initial / Refined / Alternative. Hover shows tooltip "Initial = brute-force; Refined = optimized".
- [ ] HR Interview: section is neutral surface (not red). The "Tip: complete Analyze first" banner is also neutral.
- [ ] Submit page on mobile: sticky bar shows progress bar at top, "X of N required filled · Set Y next" line below. No content hides behind the bar (scroll to bottom — last form row is fully visible above the bar).
- [ ] Click Submit with confidence unset: dashed warning Submit is visible at all breakpoints; "Set confidence next" appears in the summary; on first blur of a required field, inline red FieldHint appears.
- [ ] Type into the field — FieldHint clears, progress bar advances.
- [ ] Hover follow-up bonus value → tooltip explains "+0.5 per answered, max +2.0". Tap on mobile → popover toggles.
- [ ] Behavioral category: drop "Fill sections in order" banner. STAR tabs render with neutral chrome.
- [ ] Submit a solution. AIReviewCard renders with the new lucide `Scale` icon on the Score Adjustments badge.
- [ ] Open a review modal. DiscrepancyCard uses lucide `AlertTriangle` (warning tone) or `Info` (info tone). CanonicalAnswerPanel expander uses ChevronDown.

**Smoke (automated):**

- `cd client && npm run lint && npm run build` clean

## Self-review

| Check | Status |
|---|---|
| Placeholders / TBDs | None |
| Internal consistency | Icon swap centralized via `iconForLabel`; cost badges read same intent as server `CAPS` (values mirrored, decoupled wisely); completion hook used in both progress bar and summary line |
| Scope | Single PR. Frontend-only. Save-draft, page split, server-side scoring excluded. |
| Ambiguity | Tab label tooltip pinned ("Initial = brute-force; Refined = optimized"); cost badge values pinned ("Pattern ≤5 · Depth ≤6") to match server CAPS; semantic color reservation table is the explicit list |
| Backward compat | No API/schema/flag changes; rollback = `git revert` |
| Risk | Visual regression is the goal. Risk is users experiencing change shock — mitigated by no functional change. |
| Cap value rationale | Already established in submit-solution-scoring-fixes spec; this spec only makes them visible. |

## Out of scope (separate work)

- **Save-draft / autosave** — biggest remaining gap. Form data lost on refresh. Tracked as separate feature spec.
- **Architectural split** of 1241-line page into per-category page modules. Refactor.
- **Wizard / progressive disclosure** layout. Keeps current always-visible structure.
- **Server-side scoring changes** to CAP values, prompt, or response shape.
- **Other pages' polish** (Review modal, Problem Detail, Mock Interview).

# Lab Section Overhaul — Design Spec

**Date:** 2026-07-10
**Status:** Approved. Phase A implementation immediate.
**Authors:** Four-lens review panel (pedagogy, product/journey, UI/UX/a11y, engineering)

## Problem

The learner-facing Lab tab (`client/src/pages/learn/tabs/ConceptLabTab.jsx`) drives the highest-value moment in the concept flow: read primer → **write code + submit + get AI verdict + reveal reference** → check-in. Four-reviewer audit found:

**Real bugs (engineering + correctness):**
1. `usedFallback` field from CODE_REVIEW never persisted → fabricated WEAK verdict permanently blocks reveal for learners who hit a transient AI failure
2. `reviewSemaphore` queue is unbounded → sustained abuse pins ~50MB per team burst (100KB × 500 submits)
3. `PENDING` attempts orphaned on process restart with no resurrection scan; learner sees forever-spinner
4. `getAttempt` returns full 100KB `code` field on every 3s poll tick even when review isn't complete
5. `clearDraft` conditional on `result?.attemptId` — a partial 2xx response leaves stale draft → duplicate submissions
6. CODE_REVIEW prompt reads legacy `primerMarkdown` but many concepts now use `primerSections` (Phase B); AI sees empty primer excerpt for those

**Cross-reviewer triple-confirms (highest UX leverage):**
- `topFocus` field never rendered — the AI's single most-actionable output is invisible (Pedagogy + Product + UI)
- Reveal gate's `nextStep` lock invisible to client → learner clicks enabled-looking button, gets 403 (Pedagogy + Product + UI)
- 15s wait is dead air — Submit button re-enables at 202 ACK (1s), then no visible progress for 14s (Product + UI)
- Attempt history invisible — data exists, UI shows only latest (Pedagogy + Product)
- Monaco-only shape breaks SQL / HLD / design labs (Pedagogy + Product + UI)

**Author/learner friction:**
Timebox stored but not shown as countdown · no pre-reveal self-reflection · autosave invisible · diff mode not toggleable · ERROR state has no editable resubmit · verdict color-only for colorblind · reveal modal X-close only · desktop wide viewport wasted (should be 2-col at lg+) · attempt meta duplicates verdict badges · Monaco Tab-trap · `prefers-reduced-motion` unrespected · no "Ready for check-in" CTA after reveal · no "step 2 of 5" framing · no author feedback loop.

## Design principles

1. **Struggle-first policy stays.** Reveal remains gated by STRONG/ADEQUATE + `nextStep === READY_FOR_REFERENCE`. UX changes make the gate transparent, not weaker.
2. **`topFocus` is the primary AI output.** All other verdict fields support it. Layout must reflect that.
3. **Fallback verdicts are always distinguishable** from real AI verdicts. Learner never sees a fabricated result labelled as authoritative.
4. **The Lab surface accommodates all disciplines.** Code labs (DSA, LLD, Programming Language, Framework), query labs (SQL, NoSQL), design-prose labs (HLD) each get a fit-for-purpose editor.
5. **Every failure mode has a recovery path.** No forever-spinners, no dead-end error states, no lost drafts.

## Schema changes

```prisma
model LabAttempt {
  // Phase A — persist the "fallback fired" flag so the client can badge the verdict.
  // The CODE_REVIEW validator returns `usedFallback` on the response envelope; today
  // it's silently dropped by `onReviewCompleted`. Learners with a real STRONG attempt
  // that hit a transient OpenAI outage currently get a permanent WEAK verdict.
  usedFallback Boolean @default(false)
  // rest unchanged
}

model Lab {
  // Phase D — variant discriminator. Drives the editor surface (Monaco vs query
  // editor vs freeform textarea). Default CODE preserves current behavior.
  variant       LabVariant @default(CODE)
  // Phase D — optional context (SQL schema, HLD scenario, etc.) shown alongside
  // the editor. Rendered as markdown; not scored by the AI.
  contextMarkdown String? @db.Text
}

enum LabVariant {
  CODE           // Monaco code editor (default; DSA / LLD / language / framework)
  QUERY          // Query editor with schema panel (SQL / NoSQL)
  DESIGN_PROSE   // Plain textarea for architecture writeups (HLD)
}
```

## Server API changes

- `getAttempt` conditionally selects `code` (only when `reviewStatus IN (COMPLETED, ERROR)`)
- `getAttempt` includes `usedFallback` in the response
- `revealReference` error responses include `nextStep` in `details` block
- `onReviewCompleted` persists `usedFallback` to `LabAttempt`
- `submitAttempt` catches `REVIEW_QUEUE_FULL` from the semaphore and flips the attempt to `ERROR`
- Server startup: scan for PENDING LabAttempts older than 5 minutes, flip to ERROR (one-shot resurrection)
- `buildCodeReviewPrompt` derives `primerExcerpt` from `primerSections` when `primerMarkdown` is empty

## Client changes

- `CodeReviewResult`:
  - New `topFocus` callout above the 6-dimension grid (primary AI output)
  - Fallback banner when `usedFallback === true` (mirrors ConceptCheckInTab treatment)
  - Verdict badges get a shape icon (triangle WEAK, circle-check STRONG, dash ADEQUATE) for colorblind parity
- `computeRevealGate` (client) mirrors both server gates including `nextStep`; button `aria-describedby` its gate message
- `PENDING` and `REVIEWING` states get distinct copy + animated progress phases
- `ERROR` state gets a "Resubmit this code" button that repopulates the editor with `attempt.code`
- `ReferenceDiffModal`:
  - Footer gains "Close" + "Close and edit solution" primary action
  - Responsive height on mobile (`h-[min(520px,60vh)]`), inline diff at `<600px`
  - `useReducedMotion` guards the scale animation
- `MonacoLabEditor` sets `tabFocusMode: true` so keyboard users can Tab out
- `MonacoLabEditor` shows "Saved 2s ago" autosave status
- New attempt-history panel (Phase C) — collapsible list of prior attempts + verdicts
- Desktop 2-col layout at `lg:` (Phase D) — task left, editor right
- Pre-reveal self-reflection prompt (Phase C) — retrieval-before-feedback
- Diff mode toggle side-by-side ↔ inline (Phase C)
- "Ready for check-in" CTA after successful reveal (Phase B)
- "Step 2 of 5" mastery-journey framing banner (Phase B)

## Phasing

| Phase | Content | Ships |
|---|---|---|
| **A. Real bugs + top-5 wins** | Schema: `LabAttempt.usedFallback`. Migration. `topFocus` render, reveal-gate mirror, usedFallback banner, queue cap, PENDING resurrection, poll size fix, clearDraft unconditional, CODE_REVIEW prompt reads primerSections, colorblind shape icons, Monaco tabFocusMode, prefers-reduced-motion, aria-describedby on reveal button. No new API endpoints. | Immediately after spec approval |
| **B. Verdict + waiting-state UX** | Animated progress phases during REVIEWING. Distinct PENDING/REVIEWING/ERROR states + ERROR-resubmit. Reveal modal "close and edit". Ready-for-check-in CTA. Step-2-of-5 framing. Verdict density polish (attempt meta collapsed into header, DimBadge label truncation). | After A |
| **C. Attempt history + reflection** | New `GET /labs/:id/attempts` endpoint (metadata only, no code body). History panel. Pre-reveal reflection input (persist on LabAttempt). Diff mode toggle. Autosave status visible ("Saved 2s ago"). Side-by-side vs inline toggle. | After B |
| **D. Discipline expansion + layout** | Schema: `Lab.variant` enum, `Lab.contextMarkdown`. Migration. Per-variant editor surfaces (Query panel with schema, Design-prose textarea). Desktop 2-col layout at lg+. Monaco language mode mapping (SQL etc). Timebox soft countdown. | After C |

## Non-goals

- Do NOT weaken the struggle-first reveal gate — server contract is unchanged
- Do NOT allow arbitrary code without a variant type — every Lab picks CODE / QUERY / DESIGN_PROSE
- Do NOT introduce a durable job queue for CODE_REVIEW — the startup resurrection scan is the interim answer (roadmap: `curriculum-review-durable-queue`)
- Do NOT surface `usedFallback` publicly as an opt-out — the verdict is honest but flagged; learner can retry to get a real AI review

## Signals + telemetry

- New structured event: `lab_verdict_landed { userId, conceptId, teamId, verdict, usedFallback, attemptNumber, latencyMs }`
- Existing `signal_shift_delta` retained
- Author-side aggregation (verdict distribution per lab, avg-attempts-to-STRONG, reveal rate) is a Phase C follow-up

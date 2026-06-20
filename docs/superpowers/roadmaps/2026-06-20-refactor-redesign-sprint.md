# Refactor + Redesign Sprint

**Started:** 2026-06-20
**Target close:** 2026-09-12 (≈12 weeks)
**Pattern:** brainstorm → spec → plan → subagent-driven implement → review → ship → auto-merge to main
**Pre-sprint state:** Submit Solution Page just shipped (commits `d5503bd..60e512f`); recall-grader trust pipeline + canonical alternatives + submit-scoring fixes already on main

---

## Why a roadmap, not a rewrite

- **No big-bang.** Production keeps running. Every sprint ships visible improvement.
- **No feature freeze.** The sprint is paced so feature work continues alongside if needed.
- **Stack stays.** Node 20 / Express 4 / Prisma + Postgres / React 18 / Vite 5 / Tailwind. All current. Rewrite would solve none of the named problems.
- **Premium feel via composition.** Each sprint compounds — design system primitives build the language, page sprints apply it, architectural cleanups pay it forward.

---

## Phase 1 — Foundation (~2-3 weeks, sprints 1-2)

### Sprint 1 — Shared design system
**Status:** UP NEXT
**Scope:** audit existing primitives (`Button`, `Input`, `Card`, `Modal`, `Toast`, `Spinner`); codify token usage (brand-{300..600}, surface-{0..3}, text-primary/secondary/tertiary, border-default/strong); add missing primitives (`<EmptyState>`, `<LoadingState>`, `<ErrorState>`); produce a 1-page reference doc.
**Why first:** every Phase 2 sprint consumes these. Skipping it means re-inventing per page.
**Trade-off acknowledged:** ~2 weeks before users see a polish change. Worth it for compound returns.

### Sprint 2 — Dead-code + duplication purge
**Status:** queued
**Scope:** ESLint strict on `unused-vars` / `unused-imports`; manual cross-page dedup pass (4 different `stripHtml`? duplicate empty-states?); replace deprecated `CONFIDENCE_LEVELS.emoji` field across 5 known consumers (ProfilePage, ReviewQueuePage, FlashcardReviewModal, SolutionCard, EditSolutionPage); server-side scan for orphaned utilities + unused Prisma fields.
**Output:** smaller surface area for the page sprints; net LoC delta probably negative.

---

## Phase 2 — Page-by-page polish (~4-5 weeks, sprints 3-6)

Same pattern as the just-shipped Submit Solution Page sprint: audit → spec → plan → ship → auto-merge.

### Sprint 3 — Review Queue Page
**Status:** queued
**Scope:** finish polish (DiscrepancyCard + matched-approach badge already shipped; remaining: recall input UX, AiGradeView field cards, peek behavior, recall-vs-canonical view transitions).
**Priority signal:** highest user traffic after Submit.

### Sprint 4 — Problem Detail Page
**Status:** queued
**Scope:** solution browsing, AIReviewCard rendering refinements, follow-up answers display, history/attempts UI.

### Sprint 5 — Dashboard + 6D Report + Verdict card
**Status:** queued
**Scope:** information-dense surface. Will reward premium-feel investment most because it's where the product's value-prop shows. Existing 10-dim cards (D1-D10), readiness verdict, mastery counts.

### Sprint 6 — Auth + Onboarding flows
**Status:** queued
**Scope:** first-impression conversion. Login / register / change-password / onboarding wizard / forgot-password.

---

## Phase 3 — Heavy interactive surfaces (~2-3 weeks, sprints 7-9)

### Sprint 7 — Mock Interview UX
**Status:** queued
**Scope:** realtime WebSocket flows, transcript rendering, phase indicator, debrief view, pre-session confidence capture.

### Sprint 8 — Design Studio UX
**Status:** queued
**Scope:** Excalidraw integration polish, scenario testing card, evaluation results, INTERVIEW-mode pairing handoff.

### Sprint 9 — Teaching Sessions
**Status:** queued
**Scope:** live rooms, peer ratings, scheduler UX, flag handling.

---

## Phase 4 — Architectural cleanups (~1-2 weeks, sprints 10-11)

### Sprint 10 — Split mega-files (client)
**Status:** queued
**Scope:** `SubmitSolutionPage.jsx` (1241 LoC) → per-category page modules (`/coding`, `/hr`, `/behavioral`, `/cs-fundamentals`, `/sql`); `AIReviewCard.jsx` (1074 LoC) → focused subcomponents (DimensionBars, FollowUpReview, FlagsRibbon, etc.).
**Risk:** every PR for the next month touches the new structure. Adoption window matters.

### Sprint 11 — Split server `ai.controller.js`
**Status:** queued
**Scope:** the controller has accumulated 7+ feature surfaces (canonical, recall-grade, review, augment, follow-up eval, embedding-related). Split per surface, mirror what Sprint 10 does on the client.

---

## Out of scope for this roadmap

- Full greenfield rewrite (rejected upfront — see "Why a roadmap, not a rewrite")
- Schema redesign (current Prisma model is sound; no breaking changes)
- Stack swap (Node/React/Postgres/Tailwind all current)
- New product features (sprint focus is polish + refactor; new features go through the normal feature-dev process in parallel)
- Save-draft / autosave on Submit (separate feature spec, queued post-sprint)
- Architectural split of the 1241-line page DURING Phase 2 polish (Sprint 10 handles it cleanly with foundations in place)

---

## Status tracker

| # | Sprint | Status | Spec | Shipped |
|---|---|---|---|---|
| 0 | Submit Solution Page UX polish | ✅ shipped | [`2026-06-19-submit-solution-ux-polish-design.md`](../specs/2026-06-19-submit-solution-ux-polish-design.md) | 2026-06-20 |
| 1 | Shared design system | UP NEXT | — | — |
| 2 | Dead-code + duplication purge | queued | — | — |
| 3 | Review Queue Page | queued | — | — |
| 4 | Problem Detail Page | queued | — | — |
| 5 | Dashboard + 6D + Verdict | queued | — | — |
| 6 | Auth + Onboarding | queued | — | — |
| 7 | Mock Interview UX | queued | — | — |
| 8 | Design Studio UX | queued | — | — |
| 9 | Teaching Sessions | queued | — | — |
| 10 | Mega-file splits (client) | queued | — | — |
| 11 | `ai.controller.js` split | queued | — | — |

---

## Update protocol

When a sprint ships:
1. Update Status column to `✅ shipped` and add the spec link + ship date.
2. If the work surfaced a sub-issue worth a follow-up spec, add a line under the table (e.g. "Sprint 3 surfaced: SR feedback latency on slow networks → tracked separately").
3. If the sprint changed scope (e.g. Sprint 5 grew to include the verdict modal), edit the Scope description in place — don't lose history but keep the table truthful.
4. Bump "Target close" if reality is materially diverging.

Sprints are roughly weekly. If a sprint is taking >2 weeks, that's a signal to split it.

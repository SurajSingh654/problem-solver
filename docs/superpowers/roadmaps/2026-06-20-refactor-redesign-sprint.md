# Refactor + Redesign Sprint

**Started:** 2026-06-20
**Target close:** 2026-09-12 (≈12 weeks)
**Pattern:** brainstorm → spec → plan → subagent-driven implement → review → ship → auto-merge to main
**Pre-sprint state:** Submit Solution Page just shipped (commits `d5503bd..60e512f`); recall-grader trust pipeline + canonical alternatives + submit-scoring fixes already on main

---

## Priority statement

**Backend correctness > UI polish.** A polished UI on top of wrong scores polishes the lie. Sprint 1 is a **wholesale backend correctness + AI surface audit**, not the design system. The design system moves to Phase 2.

The user's explicit weighting:

> "Prompts, RAG, vector DB, all these AI features is the Life of the project — they should be very very solid. Also project security, reliability, and reusability."

These three terms (security / reliability / reusability) are first-class audit dimensions, not afterthoughts. The AI/RAG/vector layer gets the deepest scrutiny because every other layer depends on it producing correct, fast, defensible output.

---

## Why a roadmap, not a rewrite

- **No big-bang.** Production keeps running. Every sprint ships visible improvement.
- **No feature freeze.** The sprint is paced so feature work continues alongside if needed.
- **Stack stays.** Node 20 / Express 4 / Prisma + Postgres / React 18 / Vite 5 / Tailwind. All current. Rewrite would solve none of the named problems.
- **Correctness compounds.** Sprint 1's audit becomes the priority queue for the rest of the roadmap. Every fixed formula or hardened prompt makes downstream work less risky.

---

## Phase 1 — Backend Correctness Audit + Fixes (~3-4 weeks, sprints 1-3)

### Sprint 1 — Wholesale backend audit
**Status:** UP NEXT (in progress)
**Scope:** parallel deep-dive across 12 categories below. Output: `docs/superpowers/audits/2026-06-20-backend-correctness-audit.md` with severity per finding (high = wrong-result, medium = robustness gap, low = nit). User triages. Then sprints 2+ ship fixes by severity.

Audit categories (weighted toward AI/RAG/vector + security/reliability/reusability):

1. **AI prompts** — every prompt across `ai.prompts.js`. Quality, edge cases, schema fidelity, few-shot accuracy, untrusted-input handling.
2. **AI validators + fallbacks** — every `validateX` + `buildFallbackX` pair. Completeness vs the prompt's contract. Conservative-fallback correctness.
3. **RAG / Vector / Embeddings** — pgvector indexes, HNSW config, embedding pipeline (when it runs / what it produces / retry behavior), RAG context selection (what gets retrieved, why, freshness, staleness).
4. **Score formulas — D1-D10** — verify each implementation matches its own spec (CLAUDE.md describes 10 dimensions in detail). Sub-component blends, source-tier ceilings, tier mastery gates.
5. **AI response handling** — controller cap clamping, fallback paths, persistence shape, response shape consistency across surfaces.
6. **Multi-tenant invariants** — every team-scoped query filters by `req.teamId`. CLAUDE.md flags as critical; easy to silently violate.
7. **Prompt injection / untrusted-input** — XML tagging on every user-content interpolation. CLAUDE.md flagged `prompt-injection-hardening` as roadmap NEXT.
8. **Concurrency / race conditions** — in-memory rate limiter (`>1 replica = doubled cap` per CLAUDE.md), embedding fire-and-forget, canonical augment race, SM-2 review submit (already has `SELECT FOR UPDATE`).
9. **AI outage / fallback / retry** — validate→fallback pattern coverage. Surfaces lacking fallbacks. Retry semantics (timeout, 429/5xx, model fallback primary→fast).
10. **Data integrity** — soft-delete filter coverage, cascade rules, FK consistency, orphaned rows.
11. **Five-touchpoint contract** — Prisma migration → schema.prisma → Zod → controller allow-list → client payload. CLAUDE.md: skipping #3 silently strips fields. Audit finds drift.
12. **Code reusability + duplication** — multiple `stripHtml`? duplicate validators? scattered utilities that should be shared modules?
13. **Test-gap analysis** — which surfaces lack regression guards. Tests assert *what code does*, not *what it should do* — wrong formulas pass tests.
14. **Infrastructure security** — JWT signing/rotation, MCP token handling, password storage (bcrypt rounds), CORS, secrets handling, admin-endpoint gating, rate-limiter key collisions.

### Sprint 2 — High-severity fixes (Wave 1)
**Status:** queued (scope set by Sprint 1 audit)
**Scope:** the audit's `high` findings get batched into a single fix sprint or split if too large. Each fix follows the validate→fix→test pattern.

### Sprint 3 — Medium-severity fixes (Wave 2)
**Status:** queued (scope set by Sprint 1 audit)
**Scope:** the audit's `medium` findings + any high findings deferred from Sprint 2.

---

## Phase 2 — Foundation (~2-3 weeks, sprints 4-5)

### Sprint 4 — Shared design system
**Status:** queued
**Scope:** audit existing primitives (`Button`, `Input`, `Card`, `Modal`, `Toast`, `Spinner`); codify token usage (brand-{300..600}, surface-{0..3}, text-primary/secondary/tertiary, border-default/strong); add missing primitives (`<EmptyState>`, `<LoadingState>`, `<ErrorState>`); produce a 1-page reference doc.
**Why now:** every Phase 3 sprint consumes these. Skipping means re-inventing per page.

### Sprint 5 — Dead-code + frontend duplication purge
**Status:** queued
**Scope:** ESLint strict on `unused-vars` / `unused-imports`; manual cross-page dedup pass; replace deprecated `CONFIDENCE_LEVELS.emoji` field across 5 known consumers; server-side scan for orphaned utilities + unused Prisma fields.
**Output:** smaller surface area for the page sprints; net LoC delta probably negative.

---

## Phase 3 — Page-by-page polish (~4-5 weeks, sprints 6-9)

Same pattern as the just-shipped Submit Solution Page sprint: audit → spec → plan → ship → auto-merge.

### Sprint 6 — Review Queue Page
**Status:** queued
**Scope:** finish polish (DiscrepancyCard + matched-approach badge already shipped; remaining: recall input UX, AiGradeView field cards, peek behavior, recall-vs-canonical view transitions).
**Priority signal:** highest user traffic after Submit.

### Sprint 7 — Problem Detail Page
**Status:** queued
**Scope:** solution browsing, AIReviewCard rendering refinements, follow-up answers display, history/attempts UI.

### Sprint 8 — Dashboard + 6D Report + Verdict card
**Status:** queued
**Scope:** information-dense surface. Will reward premium-feel investment most because it's where the product's value-prop shows. Existing 10-dim cards (D1-D10), readiness verdict, mastery counts.

### Sprint 9 — Auth + Onboarding flows
**Status:** queued
**Scope:** first-impression conversion. Login / register / change-password / onboarding wizard / forgot-password.

---

## Phase 4 — Heavy interactive surfaces (~2-3 weeks, sprints 10-12)

### Sprint 10 — Mock Interview UX
**Status:** queued
**Scope:** realtime WebSocket flows, transcript rendering, phase indicator, debrief view, pre-session confidence capture.

### Sprint 11 — Design Studio UX
**Status:** queued
**Scope:** Excalidraw integration polish, scenario testing card, evaluation results, INTERVIEW-mode pairing handoff.

### Sprint 12 — Teaching Sessions
**Status:** queued
**Scope:** live rooms, peer ratings, scheduler UX, flag handling.

---

## Phase 5 — Architectural cleanups (~1-2 weeks, sprints 13-14)

### Sprint 13 — Split mega-files (client)
**Status:** queued
**Scope:** `SubmitSolutionPage.jsx` (1241 LoC) → per-category page modules (`/coding`, `/hr`, `/behavioral`, `/cs-fundamentals`, `/sql`); `AIReviewCard.jsx` (1074 LoC) → focused subcomponents (DimensionBars, FollowUpReview, FlagsRibbon, etc.).
**Risk:** every PR for the next month touches the new structure. Adoption window matters.

### Sprint 14 — Split server `ai.controller.js`
**Status:** queued
**Scope:** the controller has accumulated 7+ feature surfaces (canonical, recall-grade, review, augment, follow-up eval, embedding-related). Split per surface, mirror what Sprint 13 does on the client.

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
| 1 | Wholesale backend correctness audit | UP NEXT (in progress) | — | — |
| 2 | High-severity fixes (Wave 1) | queued (scope from Sprint 1) | — | — |
| 3 | Medium-severity fixes (Wave 2) | queued (scope from Sprint 1) | — | — |
| 4 | Shared design system | queued | — | — |
| 5 | Dead-code + duplication purge | queued | — | — |
| 6 | Review Queue Page | queued | — | — |
| 7 | Problem Detail Page | queued | — | — |
| 8 | Dashboard + 6D + Verdict | queued | — | — |
| 9 | Auth + Onboarding | queued | — | — |
| 10 | Mock Interview UX | queued | — | — |
| 11 | Design Studio UX | queued | — | — |
| 12 | Teaching Sessions | queued | — | — |
| 13 | Mega-file splits (client) | queued | — | — |
| 14 | `ai.controller.js` split | queued | — | — |

---

## Update protocol

When a sprint ships:
1. Update Status column to `✅ shipped` and add the spec link + ship date.
2. If the work surfaced a sub-issue worth a follow-up spec, add a line under the table (e.g. "Sprint 3 surfaced: SR feedback latency on slow networks → tracked separately").
3. If the sprint changed scope (e.g. Sprint 5 grew to include the verdict modal), edit the Scope description in place — don't lose history but keep the table truthful.
4. Bump "Target close" if reality is materially diverging.

Sprints are roughly weekly. If a sprint is taking >2 weeks, that's a signal to split it.

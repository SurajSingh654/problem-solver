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

### Re-framing — sprints 2 onward are surface-by-surface, not severity-batched

Sprint 1 found ~80 issues across the codebase. The original Sprint 2/3 plan batched them by severity (HIGH wave first, MEDIUM wave second). That framing is wrong: it produces grab-bag PRs that touch unrelated files and skip the *refinement* work (re-architecture, consolidation, dead-code removal, missing-capability addition) that doesn't show up as a "bug" in an audit.

**Reframed pattern (from Sprint 2 onward):**

Each sprint takes one logical surface (e.g. "AI controller layer", "auth + email", "RAG + embeddings") and does the full pass on it: re-audit specific to that surface, refine architecture, fix bugs, remove dead code, add missing tests, optionally split mega-files, polish the public contract. The Sprint 1 audit feeds priorities into each surface sprint; it does not drive sprint structure on its own.

**Surface sprints planned (proposed order, see "Status tracker" for current state):**

- **Sprint 2: AI controller surface** — `ai.controller.js` (~2500 LoC, 7+ feature surfaces), plus `ai.prompts.js` / `ai.validators.js` / `ai.fallbacks.js` / `ai.service.js`. Concentrates 7 of the 15 HIGH findings (H3 race, H6 envelope adjacent, H7-H10 validation, H11 prompt injection). Largest surface; biggest payoff.
- **Sprint 3: Security + auth surface** — `auth.controller.js` + `email.service.js` + `mcp/middleware/mcpAuth.js` + `designReferences.controller.js`. Addresses H1 (cross-team leak, live exploit), H12-H13 (zero tests on most security-sensitive controllers), reset-code single-use, MCP revocation propagation. Smaller surface; locks down user data immediately.
- **Sprint 4: RAG + embeddings surface** — `embedding.service.js` + `notes.embedding.js` + RAG retrieval in `ai.controller.js` + vector indexes. Addresses H4 (silent NULL, "the Life of the project" per user), M10-M16 (note-delete race, RAG freshness, HNSW tuning, model upgrade path).
- **Sprint 5: Problems + solutions controllers** — CRUD-heavy. Untested mutations (M28-M30), `data: ...spread` checks, soft-delete + restore flows, canonical augment race (M17).
- **Sprint 6: Notes surface** — `notes.controller.js` + `notesAiTemplate.controller.js` (H6 envelope bypass) + AI features (M31), embeddings overlap with Sprint 4.
- **Sprint 7: Persist-rate-limiter migration** — H5 (rate-limiter doubles at >1 replica, blocks horizontal scale). Cross-cutting infrastructure work.
- **Sprint 8: Test foundation + concurrency tests** — Prisma soft-delete middleware tests (H15), Zod schema tests (M34), concurrency tests (M35), test-smell remediation. Pays off every later sprint.
- **Sprint 9: Frontend foundation — design system + dead code** — was the original Sprint 4/5; runs after backend surfaces stabilize so polish work has a stable backend to build on.
- **Sprints 10+: Frontend page-by-page** — Review Queue, Problem Detail, Dashboard/6D, Auth, Mock Interview, Design Studio, Teaching. Same pattern as Submit Solution.
- **Sprints final: Architectural splits** — `SubmitSolutionPage.jsx` per-category split, `AIReviewCard.jsx` subcomponents, `ai.controller.js` per-surface split (already addressed inside Sprint 2 if it makes sense to split there).

This produces fewer "fix-only" sprints and more "surface owned end-to-end" sprints. Each sprint ships a coherent story.

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

## Out of scope for this roadmap

- Full greenfield rewrite (rejected upfront — see "Why a roadmap, not a rewrite")
- Schema redesign across the board (current Prisma model is mostly sound; per-surface schema refinements happen inside their own surface sprint)
- Stack swap (Node/React/Postgres/Tailwind all current)
- New product features (sprint focus is refactor + refine + fix; new features go through the normal feature-dev process in parallel)

---

## Status tracker

| # | Sprint (surface) | Status | Spec | Shipped |
|---|---|---|---|---|
| 0 | Submit Solution Page UX polish | ✅ shipped | [`2026-06-19-submit-solution-ux-polish-design.md`](../specs/2026-06-19-submit-solution-ux-polish-design.md) | 2026-06-20 |
| 1 | Wholesale backend correctness audit | ✅ shipped | [`2026-06-20-backend-correctness-audit.md`](../audits/2026-06-20-backend-correctness-audit.md) | 2026-06-20 |
| 2 | AI controller surface (split + scaffolding extraction) | ✅ shipped | [`2026-06-20-ai-controller-surface-design.md`](../specs/2026-06-20-ai-controller-surface-design.md) | 2026-06-20 |
| 2.5 | AI feature surface deep-fixes (Pass B reviewSolution + H3 race + H7/H9/H10 + solutionReviewPrompt contract) | queued (carved from Sprint 2 deferrals) | — | — |
| 3 | Security + auth surface | queued | — | — |
| 4 | RAG + embeddings surface | queued | — | — |
| 5 | Problems + solutions controllers surface | queued | — | — |
| 6 | Notes surface | queued | — | — |
| 7 | Persist-rate-limiter migration | queued | — | — |
| 8 | Test foundation + concurrency tests | queued | — | — |
| 9 | Frontend foundation (design system + dead code) | queued | — | — |
| 10+ | Frontend page-by-page (Review, Problem Detail, Dashboard, Auth, Mock Interview, Design Studio, Teaching) | queued | — | — |
| Final | Architectural splits (client mega-files, server ai.controller.js if not done in Sprint 2) | queued | — | — |

---

## Update protocol

When a sprint ships:
1. Update Status column to `✅ shipped` and add the spec link + ship date.
2. If the work surfaced a sub-issue worth a follow-up spec, add a line under the table (e.g. "Sprint 3 surfaced: SR feedback latency on slow networks → tracked separately").
3. If the sprint changed scope (e.g. Sprint 5 grew to include the verdict modal), edit the Scope description in place — don't lose history but keep the table truthful.
4. Bump "Target close" if reality is materially diverging.

Sprints are roughly weekly. If a sprint is taking >2 weeks, that's a signal to split it.

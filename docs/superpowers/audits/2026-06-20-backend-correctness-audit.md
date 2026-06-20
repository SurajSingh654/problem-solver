# Backend Correctness Audit

**Date:** 2026-06-20
**Sprint:** 1 (per `2026-06-20-refactor-redesign-sprint.md`)
**Methodology:** 8 parallel Explore agents, each focused on one audit slice. Findings de-duplicated across slices.
**Total findings:** ~80, across 7 issue categories
**Format:** Findings → severity (HIGH = wrong-result/security/data-loss; MEDIUM = robustness gap; LOW = nit). Each finding has file:line refs.

---

## Executive summary

The 10-dimension score-formula layer is **pristine** — every dimension's implementation matches its spec verbatim across 10 separate files plus the cross-cutting `readinessTiers.js`. That's the single most important finding because it tells us the **scoring core is trustworthy**; the issues are around the AI/RAG/concurrency/security perimeter, not the math.

The most consequential findings, ranked:

| # | Finding | Category | Why it matters |
|---|---|---|---|
| 1 | **DesignReference cross-team data leak** — controller has zero `teamId` filter; user A can read team B's design references by guessing `problemId` | Security | Live exploitable cross-tenant leak |
| 2 | **`aiFeedback` array append race** — two concurrent reviews land → second write overwrites the first; one review silently lost | Reliability | Data loss in production |
| 3 | **6 entire server surfaces have zero tests** — auth, email, embedding, interview engine, mentor, Prisma soft-delete middleware | Test gaps | Most security-sensitive controller (auth) has no regression guards |
| 4 | **`stripHtml` duplicated 4× with subtle drift** — `stripHtmlServer` in ai.controller.js doesn't normalize `&nbsp;` while the others do | Reusability | Silent measurement inconsistency: char-count thresholds compute differently in different surfaces |
| 5 | **Embedding silent NULL on OAI outage** — flagged in CLAUDE.md but unfixed; user submission persists with NULL embedding, never retried | Reliability | Search broken for that solution forever |
| 6 | **Rate limiter at >1 replica silently doubles cap** — flagged in CLAUDE.md; deploy at single replica today (constraint) | Reliability | Cost overrun + abuse vector at scale |
| 7 | **Follow-up validation allows silent omission** — `validateReview` doesn't fail when `followUpEvaluations` is empty despite non-empty `followUpQuestionIds` | AI prompts | User loses scoring data; review appears complete when partial |
| 8 | **Rate-limiter UTC midnight race** — 1% cleanup probability + day-key transition can let users bypass cap or hit false limit at midnight | AI prompts | Non-deterministic, hard to debug |

What's recommended for Sprint 2 (high-severity wave): items 1, 2, 3 (auth surface only), 7, 8, plus the `notesAiTemplate` envelope bypass. What's recommended for Sprint 3 (medium wave): items 4, 5, 6, plus the rest.

---

## Methodology

The audit dispatched 8 parallel Explore agents covering:

1. **AI prompts + validators + fallbacks** — every prompt in `ai.prompts.js`, every `validateX`, every `buildFallbackX`
2. **RAG + vector + embeddings** — pgvector schema, HNSW indexes, embedding pipeline, RAG context selection
3. **Score formulas D1-D10** — each dimension's implementation against CLAUDE.md spec
4. **Security + multi-tenant** — every team-scoped query, auth middleware, prompt injection, secrets, rate limiting, MCP tokens, WebSocket auth
5. **Reliability + concurrency** — race conditions, AI outage handling, WebSocket lifecycle, soft-delete hygiene, error envelope consistency
6. **Code reusability + duplication** — cross-file duplicates, drifty constant tables, repeated patterns
7. **Test gap analysis** — controller / service / utility / validator / fallback / schema coverage; test smells
8. **Five-touchpoint contract drift** — Prisma migration → schema.prisma → Zod → controller allow-list → client payload alignment

Findings below are organized by severity; within each severity, by category. Where the same finding surfaces in multiple slices, it's listed once with a cross-reference.

---

## HIGH severity (15 findings — recommended for Sprint 2)

### Security

#### H1. DesignReference cross-team data leak
**File:** `server/src/controllers/designReferences.controller.js:31, 59, 101, 157, 182`
**Issue:** `listReferences()`, `getReference()`, `createReference()`, `updateReference()`, `deleteReference()` all query by `problemId` only. Zero `teamId` filter on any of them. Routes use `optionalTeamContext`, not `requireTeamContext`.
**Attack:** User A from team X calls `GET /api/v1/design-references?problemId=PROBLEM_ID` where `PROBLEM_ID` belongs to team Y. They see team Y's design references.
**Confirmed by:** reading lines 28-47, 59-66, 101-105, 145-158, 182. Zero `teamId` in any `where` clause.

#### H2. CORS configuration weak
**File:** `server/src/index.js` (CORS config) + `server/src/config/env.js:50`
**Issue:** Production CORS allows `CLIENT_URL` env var with no startup validation. A misconfigured `CLIENT_URL` (typo, trailing slash, wildcard) silently passes to `cors()` middleware.
**Attack:** Operator misconfiguration → broader-than-intended origin allowed.
**Mitigation:** Validate `CLIENT_URL` is exactly one HTTPS URL on startup; reject wildcard.

### Reliability

#### H3. `aiFeedback` array append race condition
**File:** `server/src/controllers/ai.controller.js:732-770`
**Issue:** Two concurrent solution reviews:
1. Both read `solution.aiFeedback` (currently `[review1]`)
2. Both compute `updatedFeedback = [...existing, newReview]`
3. Both write back

Without `SELECT FOR UPDATE`, the second write overwrites the first. One review is silently lost. The transaction wrapper exists but does NOT lock the row (unlike the SM-2 review path in `solutions.controller.js:524` which DOES lock).
**Failure scenario:** User submits a solution, immediately re-submits force=true → one review lost.
**Confirmed by:** reading the transaction body. `tx.solution.update({ data: { aiFeedback: updatedFeedback }})` with no preceding `SELECT FOR UPDATE`.

#### H4. Embedding silent NULL on OpenAI outage
**File:** `server/src/services/embedding.service.js:31-46`
**Issue:** `generateEmbedding()` catches all errors and returns `null`. On 429, 5xx, or timeout, the calling controller persists the row with `embedding = NULL` and never retries.
**Status:** CLAUDE.md flags this as `embedding-outbox-retry-queue` roadmap NEXT. Unfixed today.
**Failure scenario:** Transient OAI outage → batch of submissions all index with NULL → vector search returns nothing for those rows forever.

#### H5. Rate limiter doubles at >1 replica
**File:** `server/src/services/ai.service.js:69-96`, `server/src/middleware/rateLimit.middleware.js`
**Issue:** All limiters in-memory per process. Per-day AI counter and per-IP/route auth/api/ai limiters reset on process restart and exist independently per replica.
**Status:** CLAUDE.md flags as `persist-ai-rate-limiter` roadmap NEXT. Constraint today: deploy at single replica only.
**Failure scenario:** Cost overrun at scale; auth bruteforce protection halved per additional replica.

#### H6. `notesAiTemplate` controller bypasses error envelope
**File:** `server/src/controllers/notesAiTemplate.controller.js:66, 80, 95, 110, 121, 136, 157, 182, 192`
**Issue:** 9 call sites use `res.status(...).json({...})` directly. No `requestId`. Inconsistent shape vs `error()` helper.
**Failure scenario:** Client error-extraction utilities (`extractErrorMessage`, `extractErrorCode`) silently fail on these responses; ops can't correlate user-reported errors with server logs.

### AI prompts + validators

#### H7. Follow-up validation allows silent omission
**File:** `server/src/services/ai.validators.js:1652-1669`
**Issue:** `validateReview` enforces bidirectional ID matching (input IDs all echoed; no invented IDs) but does NOT fail when `followUpEvaluations` is empty despite `followUpQuestionIds` being non-empty. Validator passes; user-visible review appears complete; per-question score data is silently missing.
**Confirmed by:** reading the validation logic — no length check.

#### H8. Rate-limiter UTC midnight race
**File:** `server/src/services/ai.service.js:73-96`
**Issue:** Day-key from `toISOString().split("T")[0]`. Async cleanup at 1% probability. Between calls at 23:59 UTC and 00:01 UTC, cleanup can orphan the old key while the new key hasn't been incremented yet. User exceeds limit undetected OR gets false-limited.
**Failure scenario:** non-deterministic rate-limiting at midnight UTC; hard to reproduce or debug.

#### H9. `readinessVerdict` declared in schema but not validated
**File:** `server/src/services/ai.prompts.js:551` vs `server/src/services/ai.validators.js:1600-1681`
**Issue:** System prompt declares output includes `readinessVerdict: <string>`. `validateReview` doesn't check it exists. AI can omit; validation passes; UI code expecting it crashes.
**Confirmed by:** the `validateReview` function body.

#### H10. Canonical alternatives silently dropped during validation
**File:** `server/src/services/ai.validators.js:1567-1572`
**Issue:** `validateCanonicalAnswer` calls `dedupAndCapAlternatives` which removes invalid/duplicate items. The function returns success without signaling that items were dropped. Admin sees fewer alternatives than AI generated, no warning.

#### H11. Prompt injection boundary unclear on follow-up answers
**File:** `server/src/services/ai.prompts.js:850-854` + `ai.validators.js:80-82`
**Issue:** Follow-up answers wrapped in `<followup_answers>` tag with `xmlEscape`. Defense relies entirely on `xmlEscape`; the system prompt's `UNTRUSTED_INPUT_RULE` doesn't explicitly warn the model about closed-tag spoofing. Today safe (because `xmlEscape` neutralizes `</...>`); future maintenance risk if escape is bypassed somewhere.
**Status:** CLAUDE.md flags `prompt-injection-hardening` as roadmap NEXT.

### Test gaps

#### H12. Auth controller — zero tests
**File:** `server/src/controllers/auth.controller.js` — `login`, `register`, `changePassword`, `forgotPassword`, `verifyEmail`, `completeOnboarding`, `switchTeam`. Zero references in `server/test/`.
**Failure scenario:** A buggy `register()` could fail to create the personal-team `TeamMembership` row inside the transaction → user can't access anything. No regression guard.

#### H13. Email service — zero tests
**File:** `server/src/services/email.service.js`
**Issue:** No tests for template rendering, missing-email handling, or service-failure fallback. Email templates have variables; a typo could ship.

#### H14. Embedding service — zero tests
**File:** `server/src/services/embedding.service.js`
**Issue:** `generateEmbedding()` only ever mocked in ai.review tests. No isolation tests: dimension correctness, null/empty text handling, rate-limit/fallback behavior.

#### H15. Prisma soft-delete middleware — zero tests
**File:** `server/src/lib/prisma.js:46-95`
**Issue:** The middleware that auto-injects `deletedAt: null` on `findMany/findFirst/findUnique/delete/deleteMany` has zero tests. A refactor that removes the middleware would not be caught. The `delete → update` conversion (line 82-84) likewise has no test guard.
**Failure scenario:** Soft-deleted users become visible in queries; cascade behavior changes silently.

---

## MEDIUM severity (~30 findings — recommended for Sprint 3)

### AI prompts + validators

| # | File:line | Issue |
|---|---|---|
| M1 | `ai.fallbacks.js:111-120` vs `ai.validators.js:312-320` | Communication source-quality fallback can produce strings the validator's `COMM_SOURCE_PATTERNS` doesn't match on unknown `sourceQuality` |
| M2 | `ai.prompts.js` (problem-generation) | Temperature 0.7 (default) is conservative for creative problem generation; 0.8-0.9 is calibrated for variety |
| M3 | `ai.validators.js:942-948` | `validateTeachingTopicCoverage` verdict-score bands too strict (FULL ≥75, PARTIAL 35-74, OFF_TOPIC <35); score 34 + PARTIAL fails |
| M4 | `ai.prompts.js:1031-1041` | Quiz prompt says "EQUALLY PLAUSIBLE" but doesn't forbid near-duplicates; validator only checks exact-string dupes |
| M5 | `ai.validators.js` (multiple) | Validator error shapes inconsistent — `validateCanonicalAlternative` returns `null`; `validateReview` returns `{valid, violations}`. Callers can't generalize |
| M6 | `ai.validators.js:1128-1134` | `validateCoaching` teach-mode doesn't check content relevance to candidate's actual phase submission |
| M7 | `ai.service.js:55` | Per-call timeout is hard 30s; doesn't account for slow streaming (token-rate timeout would be more accurate) |
| M8 | `ai.fallbacks.js:97-100` | `buildFallbackVerdict` falls back to "score=X over n=Y" even when `evidence.patternMastery` is set; misses opportunity to cite distribution |
| M9 | `ai.service.js:161-176, 341, 349` | When secondary model also fails, telemetry still shows `modelUsed: model` (primary), not `AI_MODEL_FAST` (secondary). Telemetry inaccurate |

### RAG / vector / embeddings

| # | File:line | Issue |
|---|---|---|
| M10 | `notes.embedding.js:28-35` + `notes.controller.js:527` | Note delete doesn't cancel pending 5s debounced embedding. Embed-after-delete fires on missing row, fails silently |
| M11 | `ai.controller.js:402-414` | RAG retrieval doesn't filter by `updatedAt`; a 2-year-old teammate solution can dilute the prompt |
| M12 | `ai.controller.js:420-434` | RAG context size unbounded against token budget. Verbose teammates can consume 600+ tokens of prompt |
| M13 | `prisma/migrations/20260802000001_baseline_vector_indexes/migration.sql:6-12` | HNSW `m=16, ef_construction=64` are defaults; not tuned for 10k+ scale |
| M14 | `embedding.service.js:187,217,243` + `ai.controller.js:409` + `interview.engine.js:288` | Vector-search result count hardcoded inconsistently (3 vs 5 across surfaces) |
| M15 | `embedding.service.js:37` | `text-embedding-3-small` hardcoded in code; `AI_EMBEDDING_MODEL` env var has no effect. No migration story for model upgrade |
| M16 | `embedding.service.js:359-385` | `findProblemsByNoteEmbedding` doesn't pre-check note's own embedding is non-NULL; produces silent zero-result query |

### Reliability + concurrency

| # | File:line | Issue |
|---|---|---|
| M17 | `problems.controller.js:608-641` | Canonical alternatives augment race — after `SELECT FOR UPDATE`, the inside-transaction check uses pre-lock state. Both transactions can compute (wasted tokens) but only one persists |
| M18 | `services/websocket.service.js:142-152` | WebSocket connection leak on auth-timeout: `ws.close(4401)` is best-effort; if TCP doesn't cooperate, socket stays in `wss.clients` |
| M19 | `services/ai.service.js:55` + CLAUDE.md:162 | 30s AI timeout blocks Express main thread pool. 20 concurrent AI calls × 30s ≈ thread exhaustion |
| M20 | `lib/prisma.js:41, 56-71` | Soft-delete middleware doesn't intercept `$queryRaw`/`$executeRaw`; raw queries that forget the filter see deleted rows |
| M21 | `services/teaching.scheduler.js:66-71, 107-114` | CAS pattern works under single-region Postgres (Railway today); breaks at multi-region |

### Security + multi-tenant

| # | File:line | Issue |
|---|---|---|
| M22 | `auth.controller.js:resetPassword` | Reset code valid until expiry (15 min) — can be replayed within window |
| M23 | `mcp/middleware/mcpAuth.js:52` | MCP revocation cache TTL 60s; user-initiated revoke takes up to 60s to propagate. Documented design, but worth a Redis pub/sub upgrade for emergency revocation |
| M24 | `services/websocket.service.js:145-150` | WS auth window is hardcoded 5s; no env override. Slow clients on mobile networks fail intermittently |

### Code reusability

| # | File | Issue |
|---|---|---|
| M25 | `useSaveCoordinator.js`, `ExcalidrawEditor.jsx:44`, `FeedbackPage.jsx:424`, `NoteDetailPage.jsx:50` | 3 manual debounce implementations + 1 sophisticated coordinator. No shared `useDebounce` hook |
| M26 | 20+ pages | Loading-state boilerplate (`useState(false)` + try/catch/finally) repeated; no `useLoadingState` hook |
| M27 | `ai.controller.js` (multiple) + `solutionDepth.js` + `stats.controller.js` | `validate→fallback→persist` AI scaffolding pattern not centralized; each surface re-writes it |

### Test gaps

| # | Surface | Issue |
|---|---|---|
| M28 | `ai.controller.js` — `generateCanonicalAnswer`, `augmentCanonicalAlternatives`, `generateProblemContent`, `generateReadinessVerdict`, `askAICoach`, `generateReviewHints`, `generateQuiz` | All untested or only tested via mocked downstream calls |
| M29 | `problems.controller.js` — `createProblem`, `updateProblem`, `deleteProblem`, `getProblem`, `generateProblemsAI`, `findSimilarProblems` | All untested |
| M30 | `solutions.controller.js` — `submitReview`, `rateSolutionClarity`, `exportFeedback`, `getSolutionAttempts` | All untested |
| M31 | `notes.controller.js` — every AI-related endpoint (`generateNoteFlashcards`, `generateNoteSummary`, `generateNoteFromTemplates`, `suggestNoteTags`) plus archive/restore/duplicate | All untested |
| M32 | `ai.validators.js` — `validateProblemSelection`, `validateProblemContent`, `validateCoaching`, `validateScenarioGen`, `validateScenarioEval`, `validateQuizQuestions`, `validateNoteSummary`, `validateNoteAutoTag` | All have only happy-path coverage; rejection cases untested |
| M33 | `ai.fallbacks.js` — `buildFallbackReview`, `buildFallbackProblemContent`, `buildFallbackCoaching`, scenario/quiz fallbacks | All scaffolded but never asserted in tests |
| M34 | Zod schemas — `auth.schema.js`, `solutions.schema.js`, `problems.schema.js`, `team.schema.js` | No dedicated tests; only 2 integration tests (`problems.sourceLists`, `solutions.update`) catch drift |
| M35 | Concurrency — `auth.controller.js:completeOnboarding` (joinCode race), `solutions.controller.js` (archive/restore race), `ai.controller.js:369-387` (force-review cache race) | All untested |

### Five-touchpoint drift

| # | File:line | Issue |
|---|---|---|
| M36 | `server/src/schemas/problem.schema.js:113-133` (`canonicalPatchSchema`) | `canonicalAlternatives` and `canonicalAltGeneratedAt` are NOT in the Zod schema. Today neutralized by `.strict()` (rejected as unknown). Latent footgun: if the schema is later relaxed without re-thinking, fields become silently writable from the client |

---

## LOW severity (~35 findings — defer or fold into other work)

Includes: TENTATIVE/PARTIAL vocab overlap; xmlEscape doesn't escape `"` or `'` (safe today, future risk); `extractJSON` naive brace counting; teaching-topic-coverage fallback uses naive keyword matching; `surface=?` placeholder in usage logs; quiz max-length missing from system prompt; HNSW operator-class consistency uncodified; recommendations endpoint freshness; vector ordering distance-only; verification dev-log code disclosure; JWT web/MCP shared secret; HSTS header verification; designReference FK validation incomplete (defense-in-depth on top of H1); xmlEscape vs HTML escape; no per-email rate limit on password reset; SM-2 lock vs rate-limit-check ordering (minimal risk); soft-delete middleware doesn't apply to raw queries (intended); teaching scheduler CAS single-region assumption (safe today); pool size implicit in `DATABASE_URL`; no prod query logging; SOURCES redefined in admin pages; FSRS retention/platformSearch/skillTaxonomy/solutionSignals utilities untested; minor naming inconsistencies. Each has a file:line ref in the source audits.

---

## What's CLEAN (worth highlighting)

- **All 10 dimension formulas** (D1-D10) match CLAUDE.md spec verbatim. Sub-component blends, source-tier ceilings, tier mastery gates, calibration multipliers, asymmetric CI clamps, opt-in skip logic, MAX_THRESHOLD_KEYS — all correct. **The scoring core is trustworthy.**
- **Multi-tenant filtering on Solution / Problem / Note queries** — every query I sampled correctly filters by `req.teamId` (DesignReference is the exception — see H1)
- **Bcrypt rounds, JWT verification, auth middleware** — solid
- **`success(res, ...)` / `error(res, ...)` helpers used consistently** — except `notesAiTemplate.controller.js` (see H6)
- **`normalizeBigO`, `cn`, `EmptyState`, response helpers** — properly centralized
- **WebSocket auth model** — token-as-first-message + 5s window + close code 4401 — well-designed (the leak in M18 is an edge case)
- **Cascade rules, soft-delete, vector schema** — design is sound; gaps are operational

---

## Recommended sprint sequence

| Sprint | Scope | Findings |
|---|---|---|
| **2 (Wave 1, HIGH)** | Bug-class + security hot spots | H1 (DesignReference leak), H3 (aiFeedback append race), H6 (notesAiTemplate envelope), H7 (follow-up validation), H8 (UTC race), H9 (readinessVerdict validation), H10 (canonical alternatives drop), H12 (auth tests — at minimum login/register), H15 (soft-delete middleware tests) |
| **3 (Wave 2, MEDIUM core)** | Reliability + AI surface hardening | H4 (embedding outbox retry queue — already roadmap NEXT), M10 (note-delete cancels embed), M11+M12 (RAG freshness + token bound), M17 (canonical augment race), M18 (WS leak), M22 (reset code single-use), M27 (extract validate→fallback scaffolding) |
| **4 (Wave 3, MEDIUM rest + LOW)** | Code health + test foundation | H4 alternative — Postgres rate-limiter (already roadmap NEXT, blocks multi-replica deploy); H13/H14 (email + embedding tests); M28-M35 (controller + schema + concurrency tests); M25-M26 (useDebounce, useLoadingState extractions); LOW backlog |

H2 (CORS validation) and H5 (rate-limiter Postgres migration) are deploy-config / infra work that can run in parallel with code sprints.

H11 (prompt injection hardening) is already roadmap NEXT and should be folded into Wave 2 or Wave 3.

---

## Appendix — known issues already in roadmap

CLAUDE.md flags these as roadmap NEXT/LATER. The audit confirms they're still unaddressed:

- `embedding-outbox-retry-queue` (H4)
- `persist-ai-rate-limiter` (H5)
- `prompt-injection-hardening` (H11)
- Centralized error tracking (Sentry) and JSON logs to a queryable sink (LOW; observability)

These don't need re-discovery; they need scheduling.

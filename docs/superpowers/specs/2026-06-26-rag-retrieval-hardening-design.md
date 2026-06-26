# RAG Retrieval Hardening — Design Spec (Sprint 4.2b)

**Date:** 2026-06-26
**Sprint:** 4.2b (second slice of decomposed Sprint 4.2 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit findings closed:** M11, M12, M14 (+ dedup of duplicated raw SQL)
**Branch:** `feat/rag-retrieval-hardening`
**Layers on:** main, post Sprint 4.2a (`7c32ca0`)
**Feature flag:** None — refactor + narrow audit fixes; behavior preserved except for the intentional staleness filter

---

## Problem

Sprint 1 audit, three medium findings (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md`):

- **M11** — `aiReview.controller.js:127-156` + `interview.engine.js:264-300` both run RAG retrieval against teammate solutions without filtering by `updatedAt`. A 2-year-old teammate solution can dilute the prompt: it might reflect a stale approach, deprecated framework idioms, or pre-rubric scoring norms.
- **M12** — Same call sites. The RAG context size is unbounded against the model's token budget. Verbose teammate solutions can consume 600+ tokens of prompt, crowding out the user's own solution + system rubric + the AI's reasoning budget.
- **M14** — Vector-search `LIMIT` is hardcoded inconsistently. Both live call sites use `LIMIT 3` (correct, settled empirically). The previously-deleted dead-export `findSimilarSolutions` defaulted to `limit = 5`. After Sprint 4.2a removed the dead code, the convention is informally "3" everywhere — but there's no constant, no single source of truth, no reasoned default.

In addition, the raw RAG SQL is **duplicated across 2 files** — `aiReview.controller.js` and `interview.engine.js` carry the same `SELECT ... FROM solutions s JOIN users u ON s."userId" = u.id WHERE s."teamId" = $X AND s."problemId" = $Y AND s."userId" != $Z AND s.embedding IS NOT NULL ORDER BY s.embedding <=> $vec LIMIT 3` query with minor cosmetic differences. Drift risk every time anyone changes one site.

### Zero-trust verification

Code reading on current branch (post Sprint 4.2a, commit `7c32ca0`):

| Site | File:line | LIMIT | updatedAt filter | char bound |
| --- | --- | --- | --- | --- |
| aiReview RAG | `aiReview.controller.js:140-152` | `LIMIT 3` (hardcoded) | none | none |
| interview engine searchTeammateSolutions | `interview.engine.js:282-293` | `LIMIT 3` (hardcoded) | none | none |

The two queries differ only in: (a) `aiReview` includes `s.id` and computes `1 - (s.embedding <=> $1::vector) as similarity`, (b) cosmetic alias casing (`key_insight` vs `keyInsight`).

---

## Principle

Two narrow audit fixes (M11 freshness + M12 char bounds) layered onto one DRY refactor (M14 consistency + helper extraction). All three audit fixes apply at the same site once the helper exists, instead of being applied pointwise to two duplicated queries that could drift.

Constants over env vars. No new schema. No new dependency. Behavior preservation tested end-to-end.

---

## Scope

### In scope

1. **M11** — `s."updatedAt" > now() - ($freshnessDays || ' days')::interval` predicate on the RAG SQL. Constant: `RAG_FRESHNESS_DAYS = 180`.
2. **M12** — Per-field truncation in the formatter (`approach → 400 chars`, `keyInsight → 300 chars`) + total ragContext cap (`2400 chars` with `[...truncated]` marker).
3. **M14** — Single named constant `RAG_TEAMMATE_LIMIT_DEFAULT = 3` in the helper signature.
4. **Dedup** — New `server/src/services/rag.service.js` owns the SQL query + the formatter. Both call sites switch to the helper.

### Out of scope (carved to follow-up sprints)

- **M13** HNSW index tuning → Sprint 4.2c.
- **H14** embedding service test foundation → Sprint 4.3.
- **prompt-injection-hardening** of teammate-context XML-tag wrapping → separate roadmap item (per CLAUDE.md "Conventions to preserve" §"For new AI calls").
- The non-vector fallback path in `interview.engine.js::searchTeammateSolutions` (orderBy confidence DESC when query is missing) — not RAG, stays in place.
- `embedding.service.js::findSimilarNotes` and `findProblemsByNoteEmbedding` (notes ↔ problems cross-table, owned by `notes.controller.js`) — different feature, different file, untouched.

---

## Architecture

```
server/src/services/
├── embedding.service.js      [unchanged] — generateEmbedding + embedAndPersist + text builders
├── embedding.outbox.js       [unchanged] — retry queue
├── notes.embedding.js        [unchanged] — debouncer
└── rag.service.js            [NEW] — teammate-solution retrieval orchestration

server/src/controllers/
└── aiReview.controller.js    [MODIFIED] — 30-line inline RAG block → 12-line helper calls

server/src/services/
└── interview.engine.js       [MODIFIED] — vector-search branch of searchTeammateSolutions → helper call

server/test/services/
└── rag.service.test.js       [NEW] — 14 unit tests

server/test/services/
└── interview.engine.searchTeammate.test.js  [NEW] — 1 behavior-preservation test (T16)

server/test/controllers/ai.review.rag.test.js (or extend existing reviewGrade test)
                                              [NEW or MODIFIED] — 1 behavior-preservation test (T15)
```

---

## `rag.service.js` — public API

```js
import prisma from "../lib/prisma.js";
import { generateEmbedding } from "./embedding.service.js";

// ── Constants (single source of truth for retrieval tuning) ────────────
//
// RAG_FRESHNESS_DAYS = 180 — solutions updated within the last 6 months count.
// Reasoning: prep contexts (frameworks, library idioms, scoring norms) shift
// across longer windows; 6 months balances captures-recent-activity vs not-
// punishing-active-prep-cycles. Reviewable / changeable via redeploy if
// telemetry shows we landed on the wrong number.
//
// RAG_TEAMMATE_LIMIT_DEFAULT = 3 — top-3 retrieval is the research-backed
// sweet spot for prompt-RAG. Beyond 3, marginal signal becomes noise that
// dilutes the AI's focus + inflates prompt-injection attack surface.
//
// CHAR caps — approach 400, key_insight 300 — bound the per-teammate token
// footprint at ~175 tokens (≈4 chars/token English heuristic). 3 teammates
// × ~175 ≈ 525 tokens of RAG payload, comfortably under any model budget.
// RAG_CONTEXT_HARD_CAP = 2400 is a defense-in-depth backstop against future
// changes (added fields, larger caps) blowing the budget; appends a
// "[...truncated]" marker so the model knows the picture is incomplete.

export const RAG_FRESHNESS_DAYS = 180;
export const RAG_TEAMMATE_LIMIT_DEFAULT = 3;
export const RAG_APPROACH_CHAR_CAP = 400;
export const RAG_KEY_INSIGHT_CHAR_CAP = 300;
export const RAG_CONTEXT_HARD_CAP = 2400;

/**
 * Search for similar teammate solutions to a given problem.
 *
 * @param {object} params
 * @param {string} params.problemId
 * @param {string} params.teamId
 * @param {string} params.userId               — caller's own userId, excluded from results
 * @param {string} params.queryText            — text to embed for similarity search
 * @param {number} [params.limit=3]            — max rows to return
 * @param {number} [params.freshnessDays=180]  — exclude rows older than this many days
 *
 * @returns {Promise<Array<{
 *   id: string,
 *   approach: string | null,
 *   keyInsight: string | null,
 *   timeComplexity: string | null,
 *   spaceComplexity: string | null,
 *   confidence: number | null,
 *   patterns: string[] | null,
 *   authorName: string,
 *   similarity: number
 * }>>}
 *
 * Returns [] on:
 *   - empty queryText (no embedding to search with)
 *   - generateEmbedding returning null (transient OpenAI failure)
 *   - any DB error during the search (logged + swallowed)
 */
export async function findSimilarTeammateSolutions({
  problemId,
  teamId,
  userId,
  queryText,
  limit = RAG_TEAMMATE_LIMIT_DEFAULT,
  freshnessDays = RAG_FRESHNESS_DAYS,
}) {
  if (!queryText || queryText.trim().length === 0) return [];
  try {
    const embedding = await generateEmbedding(queryText);
    if (!embedding) return [];
    const vectorStr = `[${embedding.join(",")}]`;
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT s.id, s.approach,
             s."keyInsight" AS "keyInsight",
             s."timeComplexity" AS "timeComplexity",
             s."spaceComplexity" AS "spaceComplexity",
             s.confidence, s.patterns,
             u.name AS "authorName",
             1 - (s.embedding <=> $1::vector) AS similarity
      FROM solutions s
      JOIN users u ON s."userId" = u.id
      WHERE s."teamId" = $2
        AND s."problemId" = $3
        AND s."userId" != $4
        AND s.embedding IS NOT NULL
        AND s."updatedAt" > now() - ($5 || ' days')::interval
      ORDER BY s.embedding <=> $1::vector
      LIMIT $6
    `,
      vectorStr,
      teamId,
      problemId,
      userId,
      String(freshnessDays),
      limit,
    );
    return rows;
  } catch (err) {
    console.error("[rag.service] findSimilarTeammateSolutions failed:", err.message);
    return [];
  }
}

/**
 * Format an array of teammate solution rows into a prompt-ready string.
 *
 * Per-field truncation: approach → 400, keyInsight → 300.
 * Total cap: 2400 chars + "[...truncated]" marker.
 *
 * @param {Array} rows — output of findSimilarTeammateSolutions
 * @returns {string} — empty string if rows is empty or null
 */
export function formatTeammateContext(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const formatted = rows
    .map((ts, i) => {
      const approach = (ts.approach || "Not provided").slice(0, RAG_APPROACH_CHAR_CAP);
      const keyInsight = (ts.keyInsight || "Not provided").slice(0, RAG_KEY_INSIGHT_CHAR_CAP);
      const patterns = (ts.patterns ?? []).join(", ") || "Not identified";
      const time = ts.timeComplexity || "?";
      const space = ts.spaceComplexity || "?";
      const confidence = ts.confidence ?? "?";
      return `Teammate ${i + 1} (${ts.authorName}):
  Approach: ${approach}
  Key Insight: ${keyInsight}
  Complexity: ${time} time, ${space} space
  Pattern: ${patterns}
  Confidence: ${confidence}/5`;
    })
    .join("\n\n");
  if (formatted.length > RAG_CONTEXT_HARD_CAP) {
    return formatted.slice(0, RAG_CONTEXT_HARD_CAP) + "\n[...truncated]";
  }
  return formatted;
}
```

### Why retrieval and formatting are separated

Both call sites use the same retrieval (same SQL, same parameters) but format differently:

- **`aiReview.controller.js`** injects a pre-formatted "Teammate N:" block into the AI review system prompt. Calls both `findSimilarTeammateSolutions` AND `formatTeammateContext`.
- **`interview.engine.js::searchTeammateSolutions`** is an AI tool-call handler — it returns structured `{ solutions: [...] }` to the AI's tool-calling layer, which decides how to use the data conversationally. Calls only `findSimilarTeammateSolutions`; skips the formatter.

Forcing both through one formatted-string helper would require the interview engine to parse the formatted string back into structured data — backwards work. Keeping the seam at "return structured rows; format separately" preserves intent.

### Why constants, not env vars

Standing design principle in this sprint cluster: configuration adds operational surface, drift risk between environments, and cognitive overhead. Worse, an env-var with a default *defers the product decision indefinitely* — we never commit, never learn, never validate. Sprint 4.1's backoff schedule + Sprint 4.2a's `ENTITY_CONFIG` followed the same constants-over-env-vars rule.

If empirical data later shows 180 days is wrong, the change is a 1-line edit + Railway redeploy (~3 min). Cheap. The cost we *avoid* by hardcoding is the perpetual "what should this be?" wonder for every contributor.

### SQL injection note

The `freshnessDays` parameter flows into the query as `($5 || ' days')::interval` — Postgres builds the interval from a parameterized integer, then casts. No string interpolation of caller-controlled data into the SQL. Same defense pattern as the Sprint 4.1 outbox claim query.

The `limit` parameter is also positional. The `vectorStr` is built from the embedding array (numeric values from OpenAI's API; not user content) and passed as a parameter cast to `vector`.

### Cycle safety

`rag.service.js` imports `generateEmbedding` from `embedding.service.js`. One-way. No reverse import. Standard static ESM import — no lazy dance needed.

---

## Call site migration

### `aiReview.controller.js` (lines 127-172)

Current:
- 30-line block: build query text → import generateEmbedding → call → raw SQL → format into ragContext.

After:
```js
// ── RAG: Find similar teammate solutions ────────────
let ragContext = "";
try {
  const { findSimilarTeammateSolutions, formatTeammateContext } =
    await import("../services/rag.service.js");
  const queryText = [
    solution.approach || "",
    solution.keyInsight || "",
    solution.code ? solution.code.substring(0, 300) : "",
  ].join(" ");
  const rows = await findSimilarTeammateSolutions({
    problemId: solution.problemId,
    teamId,
    userId,
    queryText,
  });
  ragContext = formatTeammateContext(rows);
} catch (err) {
  console.error("RAG search failed (continuing without):", err.message);
}
```

The local `teammateSolutions` array is dropped — the controller doesn't need raw rows after extracting `ragContext`. Pure delegation.

The format string moves from inline (lines 161-171 of the current code) into `formatTeammateContext`. Behavior preservation: same labels, same fields, same ordering. Only difference is the M12 per-field caps + total cap, which only fire for long-form teammate solutions (the audit's stated failure mode).

### `interview.engine.js::searchTeammateSolutions` (lines 264-300)

Vector-search branch becomes:
```js
if (query) {
  try {
    const { findSimilarTeammateSolutions } =
      await import("./rag.service.js");
    const rows = await findSimilarTeammateSolutions({
      problemId: targetProblemId,
      teamId: context.teamId,
      userId: context.userId,
      queryText: query,
    });
    if (rows.length > 0) {
      return {
        solutions: rows.map((r) => ({
          approach: r.approach,
          key_insight: r.keyInsight,
          time_complexity: r.timeComplexity,
          space_complexity: r.spaceComplexity,
          patterns: r.patterns,
          confidence: r.confidence,
          author_name: r.authorName,
        })),
      };
    }
  } catch (err) {
    console.error("Vector search in interview failed:", err.message);
  }
}
// Existing non-vector fallback (orderBy confidence DESC) unchanged.
```

#### Why the snake_case reshape

The interview engine's tool-call response feeds into the AI's tool-call output schema, which is wired with snake_case field names (`key_insight`, `time_complexity`, `space_complexity`, `author_name`). Changing those to camelCase would break the AI's understanding of the tool response — the prompt explicitly references those field names.

The helper returns camelCase (consistent internal contract); the interview engine maps to snake_case at the seam where it leaves the service layer. One ugly map function, contained, with an explicit boundary.

Alternative considered + rejected: add a `caseStyle: "camel" | "snake"` parameter to the helper. Changing data shape based on a flag is anti-pattern — the right answer is the explicit map at the call site that has the format-specific need.

### Fallback path (non-vector)

The existing `prisma.solution.findMany({ ... orderBy: { confidence: "desc" }, take: 3 })` fallback (when `query` is missing OR vector search returns 0 rows) is NOT RAG — it's a confidence-ordered list. Stays in interview.engine.js. Out of 4.2b scope.

---

## Test plan

### `server/test/services/rag.service.test.js` (NEW — 14 tests)

#### `findSimilarTeammateSolutions` — 8 tests

| # | Test | Asserts |
| --- | --- | --- |
| T1 | Happy path with default limit/freshness | `generateEmbedding` called once with the queryText; `prisma.$queryRawUnsafe` called once with vector + teamId + problemId + userId + "180" + 3 as positional args; returns mocked rows |
| T2 | Empty queryText → `[]`, no calls | Defensive: no embedding call, no DB call |
| T3 | `generateEmbedding` returns null → `[]` | OpenAI outage doesn't crash |
| T4 | DB throws → `[]`, logs `[rag.service]` error | Graceful degradation |
| T5 | SQL shape includes `"updatedAt" > now()` + interval clause | Lock in M11 |
| T6 | SQL shape includes `ORDER BY s.embedding <=>` + `LIMIT $6` | Lock in vector ordering + parameterized limit |
| T7 | Custom `limit` parameter respected | The 6th positional arg matches the passed limit |
| T8 | Custom `freshnessDays` parameter respected | The 5th positional arg matches |

#### `formatTeammateContext` — 6 tests

| # | Test | Asserts |
| --- | --- | --- |
| T9 | `formatTeammateContext([])` → `""` | Empty case |
| T10 | Typical rows → expected "Teammate N (name): Approach: ... Key Insight: ... Complexity: ... time, ... space\nPattern: ...\nConfidence: N/5" structure | Block-by-block string match on a known fixture |
| T11 | Approach >400 chars → truncated to 400 in output | Pass an 800-char approach; assert only first 400 appear |
| T12 | KeyInsight >300 chars → truncated to 300 | Same shape |
| T13 | Many-teammate input → total cap fires | Pass 5 teammates with maxed fields; assert output ≤ 2400 chars + `[...truncated]` marker |
| T14 | Null fields → "Not provided" / "Not identified" / "?" fallbacks | Defensive formatting |

### Behavior preservation tests — 2 tests

| # | Test | File |
| --- | --- | --- |
| T15 | aiReview path: mocked teammate rows produce the expected "Teammate 1 (Alice):" structured ragContext | Add to `server/test/controllers/ai.review.rag.test.js` (NEW) or extend existing reviewGrade test |
| T16 | interview.engine path: mocked teammate rows produce `solutions` tool output with snake_case keys | `server/test/services/interview.engine.searchTeammate.test.js` (NEW — first test on this file) |

**Total new: 14 + 2 = 16 tests.**

### Adapted tests (existing files, no count change)

The following currently mock `embedding.service.generateEmbedding` to return null, skipping the inline RAG branch in aiReview / interview.engine. After 4.2b they should continue to work (the null propagates through `rag.service.findSimilarTeammateSolutions → []`):

- `server/test/controllers/ai.review.h3.concurrency.test.js`
- `server/test/controllers/ai.review.solveMethod.test.js`
- `server/test/controllers/ai.reviewCache.test.js`
- `server/test/controllers/ai.reviewGrade.test.js`
- `server/test/controllers/ai.reviewGrade.matchedApproach.test.js`

If any test asserts on the inline-SQL-call shape (e.g. checks `prisma.$queryRawUnsafe` args directly against the old query), it'll need a 1-line tweak to either: (a) keep the `generateEmbedding`-null mock + remove the SQL-shape assertion, OR (b) additionally mock `rag.service.findSimilarTeammateSolutions` to return `[]`. The implementer determines per-file during Task 2.

### Test count target

- Baseline (post 4.2a): 1239
- Target after 4.2b: **1255** (+16)

### RED-first proofs

T1-T14 fail today: `rag.service.js` doesn't exist; the imports throw. T15 / T16 fail today because their assertions match the new structure that doesn't ship until the controllers + interview.engine migrate to the helper.

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Token / session invalidation | None |
| Behavior change for normal users | **One intentional change**: teammate solutions older than 180 days no longer appear in RAG context. By design — that's the M11 fix. Affects long-tenured teams only; new teams (most of the user base today) have 0-row impact. |
| Latency | Adds one indexed predicate (`"updatedAt" > now() - interval`) to the vector-search query. HNSW dominates the plan; the additional filter is sub-millisecond. Per-field truncation in the formatter is `.slice()` — sub-microsecond. |
| Prompt fidelity | Per-field + total caps make the AI's input deterministic in size. Strictly better hygiene. |
| Backward compatibility | aiReview controller: same ragContext string shape (bounded). interview.engine: same snake_case tool-output keys. AI tool-call schema unchanged. |
| Multi-replica safety | Unchanged. RAG is stateless. |
| OpenAI quota | One `generateEmbedding` call per RAG request. No change. |
| Rollback | Single PR. Revert. No DB migration. |
| Test runtime impact | +16 mock-only tests, <1s suite-time delta. |

---

## Backward compatibility

- **`aiReview.controller.js`**: produces the same ragContext string format. Per-field truncation only fires for unusually long teammate solutions (audit's stated failure mode). Short solutions look identical.
- **`interview.engine.js::searchTeammateSolutions`**: produces the same `{ solutions: [...] }` tool-call response shape with the same snake_case keys. The AI's tool-handling code is unaffected.
- **Sprint 4.1/4.2a wiring tests** (concurrency, cache, solveMethod, reviewGrade): the `generateEmbedding`-null mock pattern propagates through `rag.service` returning `[]`. End behavior identical.
- **The `findSimilarNotes` + `findProblemsByNoteEmbedding` notes-RAG path** (in `embedding.service.js`): completely untouched. Different feature surface.

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders / TBDs | None. Every constant has a value; every SQL fragment is the real query; every formatter rule is concrete. |
| Internal consistency | 5 constants live in one file (`rag.service.js`) and are referenced by formatter + tests. Both call sites use the same helper with the same defaults. Single source of truth. |
| Scope | Tight: M11 + M12 + M14 + dedup of the 2 inline RAG sites. M13 → 4.2c. H14 → 4.3. Prompt-injection XML wrapping → separate roadmap item. Carved explicitly. |
| Ambiguity | Two explicit calls: (a) helper returns camelCase rows; interview.engine maps to snake_case at the seam (not a flag), (b) constants are `export const` in `rag.service.js` (not env vars). |
| Adversarial review | SQL injection: `freshnessDays` flows through Postgres parameterized `interval` cast, no string interp. Empty queryText: helper returns []. Null embedding: returns []. DB throw: caught + logged + returns []. Stale teammate: filtered. Verbose teammate: capped per-field + total. Both call sites get the same hardening simultaneously. |
| Risk floor | Low. Pure refactor + 3 narrow audit fixes. No DB migration. Behavior preservation tested end-to-end (T15 + T16). Single-PR revertable. |

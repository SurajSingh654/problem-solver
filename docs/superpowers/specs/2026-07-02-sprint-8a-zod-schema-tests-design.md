# Sprint 8a — Zod Schema Test Foundation (M34) — Design Spec

**Date:** 2026-07-02
**Sprint:** 8a (first slice of decomposed Sprint 8 per `2026-06-20-refactor-redesign-sprint.md`)
**Audit finding closed:** M34 (all 7 Zod schema files)
**Branch:** `feat/zod-schema-tests`
**Layers on:** main, post Sprint 7b (`8265286`)
**Feature flag:** None — pure additive test work
**Review history:** Will require standing 4-role panel review (PO + BA + Security Manager + Lead Engineer) on the implementation plan BEFORE implementer dispatch, per `feedback_multi_agent_review_before_code.md`.

---

## Problem

Sprint 1 audit, M34 (`docs/superpowers/audits/2026-06-20-backend-correctness-audit.md:206`):

> Zod schemas — `auth.schema.js`, `solutions.schema.js`, `problems.schema.js`, `team.schema.js` — No dedicated tests; only 2 integration tests (`problems.sourceLists`, `solutions.update`) catch drift.

### Zero-trust verification

`server/src/schemas/` contains 7 schema files exporting 42 total schemas:

| File | Schemas | Notable complexity |
| --- | --- | --- |
| `auth.schema.js` | 13 | Onboarding `.refine()` for joinCode + mode; changePassword cross-field refinement |
| `designStudio.schema.js` | 9 | Nested object shapes; enum enforcement |
| `feedback.schema.js` | 3 | Simple; enum on status |
| `problem.schema.js` | 5 | `updateProblemSchema` uses `.partial()`; canonicalPatch partial semantics |
| `quiz.schema.js` | 1 | Simple |
| `solution.schema.js` | 4 | `updateSolutionSchema` = `createSolutionSchema.partial().strict()` — audit-mentioned drift catcher |
| `team.schema.js` | 7 | Role enum enforcement; email arrays |

**Test coverage state**: exactly ONE test file references these schemas (`server/test/integration/solutions.update.integration.test.js:1`). That test exists specifically to catch drift on the 5-touchpoint mutation-field contract (per `CLAUDE.md` — new field must land in Prisma migration, schema.prisma, Zod schema, controller allow-list, and client payload — missing the Zod step silently strips at the middleware boundary).

**Highest-signal failure mode** the audit calls out: a new field added to a mutation payload passes Prisma/schema.prisma/controller/client but MISSES the Zod schema — the `validate()` middleware silently strips it at the request boundary. The user's project memory (`feedback_zod_schema_strip.md`) flags this as "first diagnostic for 'field in payload, persisted null'". Dedicated `.strict()` schema tests are the guard.

**Why now**: Sprint 6 closed M31 (notes), Sprint 5 closed M29+M30 (problems + solutions). Sprint 8a closes the schema layer that guards ALL of those mutation surfaces. Sprint 8b will handle validator + fallback assertion gaps (M32 + M33); Sprint 8c will handle concurrency races (M35). Sprint 8a is the least-blocked slice — no external dependencies, pure Zod parsing.

---

## Principle

**Pure additive test work.** Each schema gets a small `<name>.schema.test.js` file with 2-10 tests depending on complexity. Every `.strict()` schema gets an explicit unknown-key rejection test — this is the load-bearing guard against the 5-touchpoint silent-strip regression. Business-logic refinements get dedicated tests. Simple happy-path-only schemas get a minimal happy + strict pair.

---

## Scope

### In scope

**35 new tests (T189-T223) across 7 new test files**:

| File | Tests | Test IDs | Focus |
| --- | --- | --- | --- |
| `auth.schema.test.js` | 10 | T189-T198 | High-risk surface: register/login/onboarding/passwords; refinements on onboarding + changePassword |
| `designStudio.schema.test.js` | 5 | T199-T203 | 3 write schemas + enum + nested shape |
| `feedback.schema.test.js` | 3 | T204-T206 | 3 schemas; enum + query coercion |
| `problem.schema.test.js` | 5 | T207-T211 | strict + `.partial()` semantics + batch array + canonicalPatch |
| `quiz.schema.test.js` | 2 | T212-T213 | happy + strict |
| `solution.schema.test.js` | 5 | T214-T218 | **audit-mentioned drift catcher (T215)** + submitReview rating bounds |
| `team.schema.test.js` | 5 | T219-T223 | strict + role enum + email arrays |

Total: **35 tests** (1411 → 1446).

### Out of scope (carved)

- **Field-by-field type-check every property**: testing Zod's own behavior is a tautology
- **Middleware wire-up testing**: `validate(schema)` middleware surface — separate concern (M28-adjacent)
- **Cross-schema consistency** (e.g., Zod enum matching Prisma enum): would require schema-introspection tooling; too much scope
- **Sprint 8b (M32 + M33 validator + fallback assertions)**: separate follow-up
- **Sprint 8c (M35 concurrency races)**: separate follow-up
- **Production code changes**: none. If a test surfaces a real bug (schema missing a needed constraint), document divergence and decide per case (Sprint 5a/5b precedent)

---

## Architecture

```
server/test/schemas/                        [NEW directory]
├── auth.schema.test.js                     [NEW — 10 tests T189-T198]
├── designStudio.schema.test.js             [NEW — 5 tests T199-T203]
├── feedback.schema.test.js                 [NEW — 3 tests T204-T206]
├── problem.schema.test.js                  [NEW — 5 tests T207-T211]
├── quiz.schema.test.js                     [NEW — 2 tests T212-T213]
├── solution.schema.test.js                 [NEW — 5 tests T214-T218]
└── team.schema.test.js                     [NEW — 5 tests T219-T223]
```

**Unchanged:**
- All schema files (read-only)
- All production code
- All existing tests

---

## Test archetypes

### Archetype A — Happy path

```js
describe("registerSchema", () => {
  it("test 189: accepts a canonical register payload", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "SecureP@ss123",
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });
});
```

### Archetype B — Strict-mode enforcement (silent-strip guard)

The load-bearing test class. Guards the 5-touchpoint contract from `CLAUDE.md` — if `.strict()` is silently dropped from a schema, `validate()` middleware would swallow unknown fields, hiding drift bugs at the request boundary.

```js
describe("updateSolutionSchema", () => {
  it("test 215: rejects unknown keys (5-touchpoint drift catcher)", () => {
    // updateSolutionSchema is createSolutionSchema.partial().strict().
    // The .strict() is load-bearing — dropping it makes the validate()
    // middleware silently strip unknown fields, hiding a Prisma/schema/
    // Zod drift bug at the request boundary. See project memory:
    // feedback_zod_schema_strip.md ("first diagnostic for 'field in
    // payload, persisted null'").
    const result = updateSolutionSchema.safeParse({
      code: "print('hi')",           // valid field
      unknownField: "malicious",     // MUST reject
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.code === "unrecognized_keys" || i.path.includes("unknownField"),
      );
      expect(issue).toBeDefined();
    }
  });
});
```

### Archetype C — Refinement / boundary

```js
describe("changePasswordSchema", () => {
  it("test 196: rejects when newPassword equals currentPassword (refinement)", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "SecureP@ss123",
      newPassword: "SecureP@ss123",  // same → refinement violation
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /same|different|match/i.test(i.message))).toBe(true);
    }
  });
});

describe("changeMemberRoleSchema", () => {
  it("test 222: rejects invalid role enum value", () => {
    const result = changeMemberRoleSchema.safeParse({
      userId: "user_1",
      role: "SUPER_HERO",  // not in TeamRole enum
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.code === "invalid_enum_value" || /invalid.*role/i.test(i.message))).toBe(true);
    }
  });
});
```

### Test discipline

- **`.safeParse()`, not `.parse()`** — never throws; gives structured `result.error.issues` we can assert precisely on
- **`.toBe(false)` first, then narrow** — every rejection test asserts `result.success === false` FIRST, then inspects `.issues`
- **No snapshots** — Zod error snapshots rewrite themselves silently; explicit `.code`/`.path`/message-regex assertions catch real behavior changes
- **No mocks / no async / no `beforeEach`** — schemas don't touch Express or Prisma
- **Inline valid/invalid payloads per test** — extracting constants is over-engineering for schema tests; readability wins

---

## Per-test details

### File 1 — `auth.schema.test.js` (T189-T198)

**T189** `registerSchema` happy — canonical `{email, password, firstName, lastName}`.

**T190** `registerSchema` strict — `{...valid, unknownField: "x"}` → rejected with `unrecognized_keys` code.

**T191** `registerSchema` — invalid email (`"not-an-email"`) rejected with `invalid_string` / `invalid_email` issue code (depending on Zod version).

**T192** `loginSchema` happy — `{email, password}`.

**T193** `loginSchema` — omit `password` → rejected as missing required field.

**T194** `onboardingSchema` happy — `mode: "individual"` path (no joinCode needed).

**T195** `onboardingSchema` refinement — `{mode: "join"}` without `joinCode` rejected; message about joinCode required for join mode. **Verify actual refinement exists in schema before writing** — if the refinement isn't there, escalate (this is a real gap).

**T196** `changePasswordSchema` refinement — `currentPassword === newPassword` rejected. **Verify actual refinement exists** before writing.

**T197** `switchTeamSchema` strict — unknown key rejected.

**T198** `updateProfileSchema` strict — unknown key rejected.

### File 2 — `designStudio.schema.test.js` (T199-T203)

**T199** `createDesignSessionSchema` happy — canonical `{title, designType, difficulty, scenarioId}` (adjust per actual schema).

**T200** `submitScenarioResponseSchema` happy — nested response object accepted.

**T201** `aiCoachingSchema` strict — unknown key rejected.

**T202** `updateSessionStatusSchema` — invalid status (e.g., `"IN_PROGRESS_MAYBE"`) rejected with enum issue.

**T203** `savePhaseSchema` — nested `workspace` object shape validated (e.g., missing required nested field rejected).

### File 3 — `feedback.schema.test.js` (T204-T206)

**T204** `createFeedbackSchema` happy — `{category, message}` or equivalent.

**T205** `updateFeedbackStatusSchema` — invalid status enum rejected.

**T206** `exportFeedbackQuerySchema` happy — query-string params (may involve Zod's `.coerce()` for boolean/number coercion — verify per actual schema).

### File 4 — `problem.schema.test.js` (T207-T211)

**T207** `createProblemSchema` happy — canonical problem payload.

**T208** `createProblemSchema` strict — unknown key rejected.

**T209** `updateProblemSchema` — `.partial()` allows subset of fields; empty object `{}` accepted (partial-empty is valid Zod behavior).

**T210** `batchCreateProblemsSchema` — array of 2 valid items accepted; array with one invalid item (e.g., missing title) rejects the whole array.

**T211** `canonicalPatchSchema` — partial-patch semantics (subset accepted) + strict on unknown keys.

### File 5 — `quiz.schema.test.js` (T212-T213)

**T212** `generateQuizSchema` happy.

**T213** `generateQuizSchema` strict — unknown key rejected.

### File 6 — `solution.schema.test.js` (T214-T218)

**T214** `createSolutionSchema` happy.

**T215** **`updateSolutionSchema` strict — unknown key rejected** ⭐ (audit-mentioned drift catcher; comment explicitly cites 5-touchpoint rule).

**T216** `submitReviewSchema` happy — `{solutionId, quality: 4}` (or whatever the shape actually is).

**T217** `submitReviewSchema` — `quality: 6` (out of 1-5 range) rejected.

**T218** `rateSolutionClaritySchema` — `rating: 0` and `rating: 6` both rejected; boundary `rating: 1` and `rating: 5` both accepted.

### File 7 — `team.schema.test.js` (T219-T223)

**T219** `createTeamSchema` happy.

**T220** `joinTeamSchema` happy — with `joinCode`.

**T221** `inviteMembersSchema` — array of valid emails accepted; one invalid email in array rejects the whole array.

**T222** `changeMemberRoleSchema` — invalid role enum value rejected.

**T223** `approveTeamSchema` strict — unknown key rejected.

---

## Divergence discipline

For tests that assume a specific refinement or constraint (T191 email format, T195 onboarding joinCode refinement, T196 changePassword refinement, T211 canonicalPatch strict, T215 update strict, T222 role enum, etc.): the implementer MUST read the actual schema file to verify the assumption before writing the test.

Sprint 5a/5b's precedent: 23 spec divergences surfaced across two similar test-foundation sprints. Expected divergence rate here: **~5-10% (2-4 tests out of 35)** — schemas evolved after audit, some refinements may not exist, boundary defaults may differ.

**Decision tree on divergence:**
- Missing refinement (e.g., changePasswordSchema doesn't cross-field-refine) → adapt the test to what the schema actually does; record `T<id>: expected refinement, actual none — accepted (schema doesn't enforce)` in commit body
- Missing `.strict()` on an audit-mentioned schema (T215 or similar) → **ESCALATE** — real gap in the 5-touchpoint contract
- Enum values don't match expected shape → adapt test to actual enum; record divergence

Security-critical tests (T190, T197, T198, T201, T208, T211, T213, T215, T223 — all strict-mode enforcement) require divergence escalation. Missing `.strict()` on any of these is a real bug.

---

## Test count target

- Baseline (post Sprint 7b): **1411**
- New in Sprint 8a: **+35**
- Target: **1446**

---

## Done criteria

- All 35 tests pass; full suite at **1446**
- `npm run lint` (server + client) + audits exit 0
- `prisma migrate status` up to date (no schema change in this sprint)
- Client `npm run build` clean
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 8 row decomposed: 8a ✅ shipped 2026-07-02; 8b + 8c queued
- Any divergences captured in commit body with `T<id>: <expected> vs <actual> — <decision>` format
- 4-role panel review completed pre-implementation; CHANGES_REQUESTED fold-ins applied before Task 0
- Security-critical divergences (T190/T197/T198/T201/T208/T211/T213/T215/T223) escalated, not auto-updated

---

## Production risk inventory

| Dimension | Status |
| --- | --- |
| Schema migration | None |
| Behavior change | None — pure additive tests |
| Client impact | None |
| Test runtime | +35 sync tests, sub-50ms total (Zod parsing only) |
| Backward compatibility | None |
| Rollback | Revert the 7 new test files |
| Risk floor | Lowest since Sprint 6b/6c |

---

## Backward compatibility

Zero-impact. Production code untouched. All existing tests continue passing. No callers, APIs, migrations, or schemas modified.

---

## Self-review

| Check | Status |
| --- | --- |
| Placeholders | None — 35 tests specified with concrete assertion targets |
| Internal consistency | 7 files × per-file test count sums to 35. Test IDs T189-T223 contiguous with prior T1-T188 (last shipped: Sprint 7b's T188). Assertion pattern uniform per archetype |
| Scope | Tight: Zod schema tests only. Validator + fallback → Sprint 8b. Concurrency → Sprint 8c. Middleware wire-up → separate concern |
| Ambiguity | Two explicit calls: (a) refinement assumptions must be verified against actual schema file per test; (b) security-critical divergence escalation criterion documented |
| Adversarial review | Highest-risk tests are the strict-mode enforcement class (T190/T197/T198/T201/T208/T211/T213/T215/T223). Missing `.strict()` on any of these is the exact 5-touchpoint silent-strip regression. Escalation criterion protects against auto-updating tests to accept the bug |
| Risk floor | Effectively zero. Pure additive; no production code change |

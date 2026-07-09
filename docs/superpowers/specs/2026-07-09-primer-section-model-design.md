# Primer Section Model — Design Spec

**Date:** 2026-07-09
**Status:** Approved. Phase A implementation immediate.
**Authors:** Four-lens review panel (pedagogy, product/journey, UI/UX/a11y, engineering)

## Problem

The learner-facing Primer tab (`client/src/pages/learn/tabs/ConceptPrimerTab.jsx`) renders `primerMarkdown` as a single markdown blob, plus optional `workedExample`, `expectedQuestions`, and `canonicalSources`. Four-reviewer audit found:

**Real bugs:**
1. `MarkdownRenderer` applies `prose-invert` unconditionally — light-mode users see white text on white
2. DOMPurify config allows `<img src="data:...">` — stored XSS surface via SVG data URIs with inline `<script>`
3. `getConceptDetail` over-fetches `readinessRubric`, `assessmentCriteria`, `primerHtml`, `richHtmlEnabled` to the learner client — internal rubric leak + latent XSS if `primerHtml` ever gets a naive render path
4. `cheatsheetMarkdown` field is authored but never rendered on the learner surface
5. `<h2>` rank collision between authored markdown and section labels — screen-reader heading outline is flat

**Content architecture gaps:**
- Learning Objectives: no schema field, no rendering — learner has no contract for what they'll be able to DO
- Prerequisites: `ConceptDependency` data exists but Primer never shows it
- Mental Model: folded into `primerMarkdown`, no first-class treatment
- Check-yourself: static, no interaction, no wiring to Check-in tab
- Cross-discipline consistency: current design leans DSA/LLD/HLD/AI-Eng and would break down for programming languages, frameworks, SQL/NoSQL, networking

**Signal-quality gaps:**
- `primer_read` fires on mount — no dwell time, accidental tab-open == 12-min read
- No TEAM_ADMIN feedback loop on whether primers work

## Design

### Section-based primer model

A Concept's primer becomes an ordered `primerSections Json` array. Section catalog is fixed at **12 types** — no `custom` freeform, no discipline-specific extensions bolted on as new curricula land.

**Universal core (7):**
- `objectives` — 2-4 learning outcomes with Bloom verbs
- `prerequisites` — links to prereq concepts + per-prereq author note
- `mentalModel` — the high-leverage "picture" — analogy, framing, one diagram
- `body` — free-form deep-dive markdown
- `workedExample` — a concrete walk-through applying the mental model
- `checkYourself` — retrieval prompts, reveal-on-click, wires to Check-in
- `cheatsheet` — compact reference, primary on return visits

**Domain-flavored (5) — abstract patterns, not discipline-specific:**
- `codeReference` — languages/frameworks/SQL/AI Eng SDK usage
- `diagram` — HLD/LLD/AI Eng/Networking/DBMS/OS
- `comparison` — HLD tradeoffs, LLD pattern-vs-pattern, language versions, framework choice, protocol tradeoffs
- `gotchas` — anti-patterns, failure modes, language pitfalls, edge cases
- `complexity` — DSA algorithmic, SQL query plan, throughput/latency, bandwidth

Cross-discipline test: this catalog covers DSA, LLD, HLD, AI Eng today AND accommodates future programming-language / framework / SQL / NoSQL / networking curricula without new section types.

### Section shape

```jsonc
[
  { "type": "objectives",
    "items": [{ "verb": "identify", "outcome": "O(n log n) opportunities", "bloomLevel": "apply" }] },
  { "type": "prerequisites", "note": "if Fenwick trees feel hazy, skim that primer first" },
  { "type": "mentalModel", "markdown": "...", "diagramUrl": null },
  { "type": "body", "markdown": "...", "heading": "Deep dive" },
  { "type": "workedExample", "markdown": "..." },
  { "type": "checkYourself", "revealMode": "click" },
  { "type": "cheatsheet", "markdown": "..." }
]
```

Special sections that reference existing fields (no data duplication):
- `prerequisites` — reads `Concept.prerequisites` (ConceptDependency)
- `checkYourself` — reads `Concept.expectedQuestions`

### Schema changes

```prisma
model Concept {
  // new
  primerSections Json @default("[]")
  // existing (retained for one release cycle as safety net, then deprecated)
  primerMarkdown String @db.Text
  workedExample  String? @db.Text
  cheatsheetMarkdown String? @db.Text
  expectedQuestions Json @default("[]")
  // rest unchanged
}

model ConceptDependency {
  // new — per-prereq author note surfaced in the Primer prerequisites section
  hintNote String?
  // rest unchanged
}
```

### Discipline expansion (future)

Companion schema additions to support programming languages / frameworks / SQL / NoSQL / networking:

```prisma
enum TopicCategory {
  // existing: SYSTEM_DESIGN, LOW_LEVEL_DESIGN, DBMS, OS, NETWORKS, DSA,
  //           BEHAVIORAL, HR, CS_FUNDAMENTALS, AI_ENGINEERING
  PROGRAMMING_LANGUAGE  // new
  FRAMEWORK             // new
  SQL                   // new (split from DBMS)
  NOSQL                 // new
}

model Topic {
  // new — free-text differentiator for grouped categories
  // ("Advanced Java" / "Python" under PROGRAMMING_LANGUAGE;
  //  "Spring Boot" / "React" under FRAMEWORK)
  subCategory String?
}
```

Client `CategoryBadge` tone map extends by one line per new category.

### Server API

`getConceptDetail`:
- Returns `primerSections`
- Includes `prerequisites: { include: { prereq: { select: { id, slug, name, status } } } }`
- **Explicit `select` on Concept** — drops `readinessRubric`, `assessmentCriteria`, `primerHtml`, `richHtmlEnabled` from the learner payload (Engineering #2)
- Folds `latestAttempt` into `lab.attempts` include (Engineering #7)

Zod schema on the authoring PATCH validates `primerSections` structure per section type.

### Client rendering

```
client/src/pages/learn/tabs/primer/
├── PrimerSectionRenderer.jsx        # orchestrator
├── sections/                        # 12 section components
└── sectionRegistry.js               # type → renderer, unknown-type fallback
```

`ConceptPrimerTab` becomes a shell: fetches, hooks up primer-read signal, delegates rendering to `PrimerSectionRenderer`.

**Unknown-section-type fallback**: render as plain body with dev console.warn. Client can lag server by one deploy.

### Migration

One-shot backfill per Concept:

```
sections = []
if primerMarkdown        → push({ type: "body",          markdown: primerMarkdown })
if workedExample         → push({ type: "workedExample", markdown: workedExample })
if cheatsheetMarkdown    → push({ type: "cheatsheet",    markdown: cheatsheetMarkdown })
if expectedQuestions[]   → push({ type: "checkYourself", revealMode: "click" })
```

Flat fields retained for one release cycle as backup. Read path falls back to deriving from flat fields when `primerSections` is empty.

## Phasing

| Phase | Content | Independence |
|---|---|---|
| **A. Real bugs** | prose-invert light mode, data: URI XSS hook, over-fetch narrow select, latestAttempt fold, cheatsheet render inline, h2/h3 rank fix, mobile footer wrap, tabpanel focus mgmt, prefers-reduced-motion. No schema, no migration. | Ships immediately. |
| **B. Section model backbone** | Schema: `primerSections`, `ConceptDependency.hintNote`. Backfill migration. Server: getConceptDetail returns sections + prereqs include + Zod. Client: `PrimerSectionRenderer` + 12 section components. Authors keep flat editing surface. | After A. Bigger PR. Real learner-facing win. |
| **C. Authoring UI** | TEAM_ADMIN section editor: add/remove/reorder/edit sections per type. Deprecate flat primerMarkdown editing surface (field stays for compat). | After B. Gives authors the new expressiveness. |
| **D. Discipline expansion** | TopicCategory grows. subCategory column. CategoryBadge tone map extends. First-visit vs return-visit mode. Excalidraw diagram support. | After the new curriculum types are actually being authored. |

## Non-goals

- Do NOT add per-section `discipline` gate — sections are portable, discipline-flavor lives on `Topic.category` only
- Do NOT support arbitrary `custom` section types — validator would explode
- Do NOT drop flat `primerMarkdown` in this iteration — one release of dual-write, then deprecate
- No real-time collaborative editing on the authoring surface — out of scope

## Signals + telemetry

Existing `primer_read` retained but repurposed to fire on **scroll-to-bottom OR footer intersection**, not on mount. Adds structured `primer_engagement` companion event with `durationSeconds` + `scrolledToBottom: bool` at unmount for author-side feedback. Both are Phase B — Phase A leaves the mount-fire behavior in place.

# `server/curriculum/` — authoring guide

This folder is the **source-of-truth** for the `TopicTemplate` / `ConceptTemplate` /
`LabTemplate` rows the app reads at runtime. It is checked into the repo so a change
to a lesson is a normal PR — reviewable, revertable, diffable.

`npm run curriculum:sync` (or the admin-only `POST /api/v1/super-admin/curriculum/templates/sync`
endpoint) walks this tree and upserts the rows in Postgres. The sync is idempotent — running
it twice is a no-op. Removals are not yet automatic (delete the row in the DB, then delete
the folder here).

Do **not** put per-learner data (attempts, review notes, progress trackers) in this tree.
Templates are shared across every team; learner state lives in the `TeamTopic` / `Solution` /
`LabAttempt` / `ConceptCheckIn` tables.

---

## Layout

```
server/curriculum/
├── README.md                           ← this file
└── <topic-slug>-template/              ← one folder per topic
    ├── topic.yml                       ← topic manifest (name, category, hours estimate)
    ├── description.md                  ← long-form topic overview (rendered to HTML on sync)
    ├── 01-<concept-slug>.md            ← one file per concept — frontmatter + primer body
    ├── 02-<concept-slug>.md
    └── labs/
        └── <concept-slug>/             ← lab folder matches its concept slug (1:1)
            ├── README.md               ← task description + constraints + submit workflow
            ├── artifacts.yml           ← expected artifacts (checklist for the AI reviewer)
            ├── starter/                ← optional starter code (multi-file OK)
            │   └── *.java
            └── reference/              ← reference solution (REQUIRED — see sync rules below)
                └── *.java
```

**File-name rules the sync enforces:**

- Topic folder must be named `<slug>-template/`. The slug in `topic.yml` is authoritative.
- Concept files must match `^\d{2}-[a-z0-9-]+\.md$` (two-digit prefix drives `order`).
- Lab folder name (under `labs/`) must equal the concept slug it belongs to. A lab with
  no matching concept is silently skipped.
- Every lab **must** have a non-empty `reference/` directory — sync throws if `reference/` is
  missing or empty. Starter code is optional.

---

## Concept frontmatter spec

Every `NN-<slug>.md` file starts with YAML frontmatter. Only the top-level `## Worked example`
heading is special — the sync extracts everything under it into the `workedExample` column
and the rest becomes `primerMarkdown` (+ sanitized `primerHtml`).

```yaml
---
slug: 01-oop-for-lld              # concept slug (must match filename prefix + folder if lab)
name: "OOP for LLD"               # display name
order: 1                          # 1-indexed order within the topic
estimatedMinutes: 90              # rough time-to-complete for a first-pass learner
prerequisites: []                 # slugs of prerequisite concepts (same topic only)
expectedQuestions:                # 3-6 questions a proficient learner should be able to answer
  - "When would you prefer composition over inheritance?"
  - "How does encapsulation differ from abstraction in practice?"
canonicalSources:                 # optional citations rendered on the concept page
  - { title: "Head First Design Patterns", type: "book", author: "Freeman" }
readinessRubric:                  # 8-axis "can you do X?" checklist — powers self-assessment
  explainToJunior: "..."
  sketchArchitecture: "..."
  buildFromScratch: "..."
  nameFailureModes: "..."
  compareAlternatives: "..."
  estimateCost: "..."
  blastRadius: "..."
  debugFromSymptoms: "..."
---
```

**What NOT to include in the concept body:**

- Suraj-specific attempts, review verdicts, or progress notes — those live per-learner in
  `Solution` / `LabAttempt` / `ConceptCheckIn`, not in the shared template.
- "Next module" hints — the client renders navigation from the topic's concept ordering.
- Status stamps (`✅ Completed`, `🟠 In progress`) — templates are versionless from the
  learner's perspective; state lives in `TeamTopic` / `TeamConcept`.

Keep everything else: theory sections (Problem → Mental model → Core concept → Worked
example → Under the hood → Trade-offs → Production concerns → Senior-engineer perspective →
Further reading), inline code samples, and check-in questions. Those are the pedagogy.

---

## Lab spec

```
labs/<concept-slug>/
├── README.md         # task description, constraints, "How to submit" — see below
├── artifacts.yml     # list of expected artifacts, one string per bullet
├── starter/*.java    # optional starter files (multi-file supported)
└── reference/*.java  # REQUIRED — the teacher's clean solution (unlocks on STRONG/ADEQUATE)
```

**`README.md`** must contain a `time-box: NN` line somewhere (case-insensitive; the sync
extracts the integer for the `LabTemplate.timeboxMinutes` column). Rewrite any local-run
instructions (`javac`, IntelliJ, etc.) to a Monaco-editor submission flow — labs run in the
browser, not on the learner's laptop.

**`artifacts.yml`** is a YAML list of strings, one per artifact the AI reviewer should
confirm:

```yaml
- "≥4 classes exist (BankAccount, SavingsAccount, CheckingAccount, Bank)"
- "every field is private unless justified"
- "Bank.applyMonthlyInterest() has zero `instanceof` checks"
```

**`starter/`** and **`reference/`** are multi-file directories. The sync reads every file
verbatim and concatenates them with `// File: <filename>` separators into the corresponding
`starterCode` / `referenceSolution` text columns. Filenames are preserved.

---

## Adding a new topic template

1. `mkdir server/curriculum/<slug>-template/labs`
2. Create `topic.yml` with `slug`, `name`, `category` (matches the `TopicCategory` enum),
   and optional `estimatedHoursToMastery`.
3. Create `description.md` with the topic-level overview (the module list, target audience,
   estimated time, etc.).
4. For each concept, create `NN-<slug>.md` with frontmatter and body.
5. For each concept that has a hands-on lab, create `labs/<slug>/` with `README.md`,
   `artifacts.yml`, and a `reference/` solution.
6. Dry-run first: `cd server && npm run curriculum:sync:dry`. Fix any parse errors.
7. Apply: `cd server && npm run curriculum:sync`. Confirm the printed diff matches your
   expectation.

**Sanity checks the sync enforces (fail-loud):**

- Missing `reference/` on any lab → throws
- Path traversal in any read path → throws
- Symlinks anywhere in the tree → throws
- Concept slug in frontmatter mismatches filename → the row is created but the lab won't
  find its concept (silent skip in the labs loop — grep the diff)

---

## Related Claude skills

Three skills live under `.claude/skills/` at the repo root for authoring-time help. Invoke
them via the Skill tool when writing new content:

- `teacher-curriculum-review` — reviews a topic's module list for completeness, sequencing,
  and coverage. Use when adding or resequencing modules in `description.md`.
- `teacher-lesson-review` — reviews an individual concept `.md` for pedagogy quality
  (mental-model-first, worked example, check-ins gated on prior sections, etc.). Use before
  merging a new concept file.
- `teacher-code-review` — reviews a learner's lab submission with a teaching lens (not just
  correctness). Used at runtime by the lab-attempt AI reviewer; also invocable at authoring
  time to sanity-check a `reference/` solution.

These encode the pedagogy source-of-truth from the Personal Guide's Teacher/ folder. Keep
them in lock-step with any material change to authoring standards in this README.

---
name: teacher-lesson-review
description: Reviews saved lesson markdown files in Teacher/<Topic>/ against the template and quality bar in Teacher/CLAUDE.md and Teacher/_lesson-template.md. Use whenever Suraj asks to review, audit, check, or grade a module file — including phrases like "is this module ready?", "did we cover everything?", "check module 03", "review the lesson on X", "before we move on, review N-1". Also invoke proactively after saving a new lesson file matching the NN-<name>.md pattern inside Teacher/<Topic>/. Do NOT use for insurance HTML, code files, or non-Teacher markdown.
---

# Teacher lesson review

Grades a saved lesson `.md` against the template and pedagogical bar. Verdict is one of Ready / Needs polish / Not ready.

## Steps

1. Identify the file. Usually `Teacher/<Topic>/NN-<name>.md`. Ask if unclear.
2. Read the file end to end.
3. Read `Teacher/_lesson-template.md` and `Teacher/CLAUDE.md` to know the expected structure and principles.
4. Grade using the rubric below.
5. Report using the format below.

Be honest, not polite. If a section is thin, say so. Suraj asked for review, not validation.

## Structural rubric

Grade each **Pass / Weak / Missing**:

| Section | Notes |
|---|---|
| Learning objectives | ≥ 2 action verbs (build, design, debug, refactor, benchmark, trace) |
| Prerequisites + setup | Links to earlier modules + tooling needed |
| The problem it solves | Historical framing — what came before and why it failed |
| Mental model | Sticky analogy or diagram |
| Core concept | Layered — simple statement → nuance |
| Worked example | Realistic, not toy |
| 🛠️ Hands-on lab | Task + constraints + submission format |
| Suraj's attempt captured | Must be inline in the file |
| Review of the attempt | ✅ / ⚠️ / ❌ commentary |
| Reference solution | Present, but AFTER the attempt |
| Under the hood | Internals — what the layer below actually does |
| Mini-lab | Optional but valuable — "see internals for yourself" |
| Trade-offs table | ≥ 3 alternatives compared |
| Production concerns | Failure modes + observability + cost + footguns |
| Debug drill | Diagnose from symptoms |
| Senior-engineer perspective | Architectural / migration / team implications |
| Check-in | All three: recall + apply + build |

## Content quality dimensions

Also grade Pass / Weak / Missing:

- **Depth calibration** — senior-engineer level, not tutorial
- **Fundamentals first** — why before how
- **Progressive layering** — not everything at once
- **Concrete over academic** — real scenarios and code
- **Trade-off honesty** — names what this approach *loses*
- **Production reality** — failure modes and cost, not just happy path
- **Curation** — 20% that matters, not Wikipedia everything
- **Length calibration** — matches depth the topic actually needs

## Senior-engineer readiness — 8-check rubric

After this module, could Suraj:

1. Explain it to a junior without cheat-sheeting?
2. Sketch its architecture on a whiteboard?
3. Build a working implementation from scratch?
4. Name two failure modes and how to detect them?
5. Compare it to two alternatives and justify a pick?
6. Estimate cost at a specific scale?
7. Predict what breaks (blast radius)?
8. Debug it from symptoms?

Any "no" = module not ready.

## Report format

```markdown
# Lesson review — <NN-name>.md

**Verdict:** ✅ Ready · 🟡 Needs polish · 🔴 Not ready

## Structural completeness

<Section-by-section table with pass/weak/missing + 1-line justification>

## Content quality

<Grade each dimension. Cite specific line numbers or section names.>

## Senior-engineer readiness (8-check)

<Check off each. Any "no" blocks the verdict from being Ready.>

## Must-fix (top 3)

1. <specific fix, reference exact section>
2. <specific fix>
3. <specific fix>

## Nice-to-have (top 3)

1. <suggestion>
2. <suggestion>
3. <suggestion>

## What's genuinely strong

<Specific praise so Suraj knows what worked.>

## Next step

Ready → "Move to next module."
Needs polish → "Apply must-fix items 1-2, then re-review."
Not ready → "Do the hands-on lab / add section X first."
```

## What to avoid

- Rubber-stamping. If the module is thin, say so.
- Vague criticism. Say *which* section, *what's wrong*, *how to fix*.
- Rewriting the lesson in the review. Point at gaps; let the teacher fill them.
- Grading the *topic* instead of the *lesson*. He isn't asking if the topic is important.
- Fence-sitting on the verdict. Pick one.

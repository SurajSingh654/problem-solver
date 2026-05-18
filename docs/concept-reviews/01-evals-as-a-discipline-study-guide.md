# Week 1 — Evals as a discipline · Study Guide

> **This is your worksheet, not my essay.** I've scaffolded the AI Topic Notes Template. You write your own answers. Sections 3, 13, 14 in particular MUST be your own draft before reading authoritative sources — that's the productive-failure principle the template is built around. After reading, update; don't replace.

---

## Why this is Week 1 (one paragraph, mine)

Without evals, every prompt change is a vibe check. You think the new prompt is better; you can't prove it. You ship something that works on three examples and fails silently in production. The hardest engineers I know describe evals as "the thing I wish I'd built six months earlier." Hamel Husain's framing: *"Your AI product needs evals because evals are the only way to make AI engineering look like engineering."* You'll spend 5 weeks after this measuring things — so build the ruler first.

---

## Day 1–2 — STUDY

### Reading list (in order)

1. **Hamel Husain — "Your AI Product Needs Evals"** (~30 min). https://hamel.dev/blog/posts/evals/ . The definitive practitioner essay; read first.
2. **Eugene Yan — "Evaluation & Hallucination Detection for Abstractive Summaries"** (~25 min). His blog (eugeneyan.com) has multiple eval posts; this one introduces the LLM-as-judge pattern.
3. **Anthropic — "Build evaluations"** (their docs site) (~20 min). Concrete API patterns and dataset shape.
4. **OpenAI `openai/evals` repo README** (~10 min, skim only). Don't read the code; just understand the framework concept: register an eval, run it, get a score.
5. **Bryan Bischof — "Vibe checks vs. evals"** essay (~15 min). Why the gap matters in practice.

Total reading time: ~100 minutes. Pace yourself — split across 2 days.

### Active recall while reading

Open `01-evals-as-a-discipline.md` (a copy of the AI Topic Notes Template) and **before reading any source, fill in:**

- Your Quick Reference (first guess)
- §3 Mental model — your own analogy for what an eval is
- §13 Interview script — try to explain evals to a peer in 45 seconds
- §14 Open questions — what you genuinely don't know yet

Productive failure: your first attempt is wrong but useful. The drift between your draft and what you write after reading IS the learning.

### Self-test you should be able to answer by end of Day 2

```
Q1. What's the difference between a unit test and an eval?
Q2. Name three categories of metric for an LLM eval.
Q3. What is "LLM-as-judge" and what is its main failure mode?
Q4. Why does a 5-item golden set beat zero evals?
Q5. What is the "vibes-vs-evals" gap, and when does it bite?
Q6. When should you NOT add an eval (i.e., what surfaces don't need one)?
Q7. What are reference-free vs. reference-based evals?
Q8. How do you decide what metrics to track for a new surface?
```

If you can answer 6/8 cold, you've got the foundation. Below that, re-read.

---

## Day 3–5 — BUILD

The scaffold is already in `server/eval/`. Your job:

1. **Run it as-is** to confirm the harness works:
   ```bash
   cd server && npm run eval:notes
   ```
   You should see metrics for 5 hand-picked notes summarized.
2. **Read** `server/eval/runner.js` and `server/eval/metrics/basic.js`. Understand every line. If something's unclear, that's a study target.
3. **Add 5 more golden-set items** to `server/eval/golden-sets/note-summary.json`. Pick *adversarial* ones:
   - A note that's mostly code (does the summarizer ignore the code?)
   - A note in the wrong language (e.g., Hindi or Spanish)
   - A note that's literally one sentence (does it hallucinate elaboration?)
   - A note with prompt-injection text inside (`Ignore previous instructions...`)
   - A note that contradicts itself
4. **Make a prompt change** to `noteSummaryPrompt` in `ai.prompts.js` (any change — instructional emphasis, rule reordering, whatever). Re-run the harness. **Commit the eval delta to your concept notes.** Did the metric move? Did the right metric move? This is the loop you'll repeat for the rest of the curriculum.
5. **Day 4–5 stretch goal:** add one LLM-as-judge metric. I'll ship the scaffold for this on Day 5 (next focused turn) — for now, look at `server/eval/metrics/basic.js` and propose what an LLM judge would *do differently* than the basic metrics.

### What "done" looks like for Days 3-5

- 10+ items in `note-summary.json`
- At least one prompt change measured A/B
- One observation in your notes: "metric X moved by Y because Z" — concrete, not vibey

---

## Day 6 — REVIEW

Open `01-evals-as-a-discipline.md` (you've been filling it incrementally). Now finish:
- §7 Implementation — paste links / file references to the harness you built
- §8 Hyperparameters — for evals these are: golden set size, judge temperature, judge model
- §9 Failure modes — what goes wrong with evals (judge bias, golden-set staleness, Goodhart's law)
- §10 Compared to alternatives — evals vs. unit tests vs. integration tests vs. user feedback
- §11 Real-world usage — who uses what (Anthropic's evals, OpenAI evals, internal tools)
- §12 Research lineage — short; LLM-as-judge papers and their critics

Save the finished file. This is your worked example for Week 1. It must stand on its own at month 6 when you forget all the details.

---

## Day 7 — SPACED REVIEW

This is Week 1, so there's nothing prior to review. Use the 30 min to:
- Re-do the self-test above, cold
- Identify which 2 questions were hardest → write flashcard-style Q/A in §15 of your concept notes
- Read the roadmap (`/docs/ai-learning-roadmap.md`) — confirm Week 2 (Advanced RAG) is still the right next step

---

## Why I scaffolded this and not the full notes

The AI Topic Notes Template's §3 Mental Model says: *"Write your mental model BEFORE reading anyone else's. This is the productive-failure principle — your first attempt is wrong but useful, and the gap between yours and the right one is what locks the concept in."*

If I write the notes for you, you skip the productive failure. You also skip the generation effect (Slamecka & Graf 1978: producing answers > re-reading by 1.4× on retention). The whole point of the template collapses.

**My job:** scaffold the directory, build the infrastructure (eval harness), curate the reading list, ask the right self-test questions.

**Your job:** do the actual learning. Fill the template. Earn the retention.

---

## What I'm shipping in this turn (already done)

- This study guide
- `/docs/ai-learning-roadmap.md`
- `server/eval/` — runnable harness with 5 golden-set items for the note-summary surface
- `npm run eval:notes` script

What I'm NOT shipping yet (your call when):
- The filled-in `01-evals-as-a-discipline.md` (your work)
- LLM-as-judge metric (Day 5 / next focused turn)
- Eval harness for additional surfaces (defer until Week 1 surface stabilizes)

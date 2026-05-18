# AI Learning Roadmap — 6-week project-integrated curriculum

> **Frame:** this is not "pause development to study." Every concept is studied for 1–2 days, **built into the project for 3 days**, then captured as a worked example. The project is the lab. Production constraints are the difficulty. Both are deliberate, not accidents.

---

## Why integrated learning, not pause-then-resume

Three findings from learning science, all replicated:

1. **Transfer-appropriate processing** (Morris, Bransford & Franks 1977 → 100+ replications): you become good at the conditions you practiced under. Studying agents in a notebook ≠ shipping an agent. Knowledge from passive learning transfers ~30–40% to applied contexts; knowledge from production-stakes building transfers ~80–90%.
2. **Desirable difficulties** (Bjork 1994; Bjork & Bjork 2011): learning that feels harder in the moment produces stronger long-term retention. Production constraints (real users, real failures, real cost) are the difficulty. Sandbox isolation removes the difficulty and the retention with it.
3. **Project-Based Learning meta-analyses** (Strobel & van Barneveld 2009; Chen & Yang 2019): PBL outperforms traditional study by ~0.45 SD on long-term retention, ~0.52 SD on transfer to novel problems. Effect size grows with the learner's existing experience — and you have 2 months.

**Cost of pause-to-learn:** retention plummets without recall pressure; resumption rate is low; "learned" features never ship.

---

## What you've already done (no need to relearn)

| Concept | Status |
|---|---|
| Prompt engineering | ✅ Extensive — `ai.prompts.js` ~3000 lines |
| Structured outputs | ✅ Zod schemas + validate-or-fallback |
| Embeddings + RAG | ✅ pgvector + HNSW; similarity search |
| Streaming | ✅ Mock interview, design studio, AI-from-template |
| Tool calling (basic) | 🟡 1–2 tools in interview engine; not extended |
| Rate limiting + cost engineering | ✅ Per-user daily cap, max-tokens clamp, retry |

These don't need explicit weeks. You'll deepen them through the new concepts (e.g., agents extend tool calling; advanced RAG extends current RAG).

---

## The 6-week curriculum

One concept per week. Each week culminates in a production feature + a worked example doc.

| Week | Concept | What you build | Why this order |
|---|---|---|---|
| **1** | **Evals as a discipline** (LLM-as-judge, golden datasets, regression suites) | `server/eval/` harness; golden set for a real surface; `npm run eval:*` scripts | **You can't improve what you don't measure.** Without this every other concept is unmeasurable. Highest leverage. |
| **2** | **Advanced RAG** (re-ranking, hybrid BM25+vector, query rewriting) | Upgrade notes-similarity + the related-notes panel; A/B against current via Week 1 evals | Builds on existing RAG. Immediate user-visible quality win you can measure. |
| **3** | **Tool-calling at depth** (parallel tools, error recovery, tool schemas) | Extend interview engine OR add a Solution Reviewer that calls multiple tools | Foundation for Week 4 agents. Substrate already there. |
| **4** | **AI agents** (ReAct loop, multi-step planning, autonomous task completion) | Auto-Solver agent: given a problem, plans → drafts → tests → critiques → revises in observable loop | Synthesizes weeks 1–3. The most-asked-about modern AI concept. |
| **5** | **MCP** (Model Context Protocol) | Stand up an MCP server exposing problems / solutions / sessions as MCP resources | **Caveat:** stack is OpenAI; MCP is Anthropic's protocol. Learning is high-value (becoming a standard) but you'll integrate, not migrate. |
| **6** | **Production AI engineering** (caching, model routing, semantic caching, latency budgets) | Semantic cache on AI-review surface; cost-reduction measurement via Week 1 evals | Production-grade polish. Saves real money. |

---

## Weekly cadence (same shape every week)

```
Day 1-2 — STUDY (~3 hours total)
   ├── Read 2 papers / blog posts from the week's reading list
   ├── Fill AI Topic Notes Template sections 1–6 (your draft)
   └── Write your mental model BEFORE reading authoritative ones (productive failure)

Day 3-5 — BUILD (~6 hours total)
   ├── Implement the smallest meaningful version in the project
   ├── Use Week 1's eval harness to measure it (Week 2+)
   └── Iterate on prompt / approach until the metric you're targeting moves

Day 6 — REVIEW (~2 hours)
   ├── Finish AI Topic Template sections 7–14
   ├── Save worked example to /docs/concept-reviews/<NN>-<concept>.md
   └── Update this roadmap's "current week" pointer

Day 7 — SPACED REVIEW (~30 min)
   ├── Re-do self-tests from ALL prior weeks' notes
   ├── Note which questions were hard → those go on next week's flashcard pile
   └── No new content; just consolidation
```

The **Day 7 spaced review** is where retention happens. Skip it twice in a row and you'll lose Week 1 by Week 4. The 30 minutes is non-negotiable.

---

## Deliverables checklist

| Week | Doc deliverable | Code deliverable | Measurement deliverable |
|---|---|---|---|
| 1 | `/docs/concept-reviews/01-evals-as-a-discipline.md` ⏳ pending | `server/eval/` harness ✅ shipped | First baseline scores for one surface ✅ captured (note-summary, valid_rate 0.80) |
| 2 | `02-advanced-rag.md` | Re-ranker + hybrid search in notes pipeline | Eval delta: new RAG vs. old RAG |
| 3 | `03-tool-calling-deep.md` | Multi-tool surface (interview or solution reviewer) | Tool-call success rate metric |
| 4 | `04-ai-agents.md` | Auto-Solver agent, observable | End-to-end success rate on a problem set |
| 5 | `05-mcp.md` | MCP server (separate process / package) | Connection demo with Claude Desktop or other client |
| 6 | `06-production-ai-engineering.md` | Semantic cache + model router | $/call reduction, latency p95 reduction |

By end of week 6: 6 worked-example notes, 6 production features, a measurement framework, and the muscle memory of integrated learning.

---

## Reading list per week (curated, not exhaustive)

### Week 1 — Evals
- **Hamel Husain — "Your AI Product Needs Evals"** (definitive practitioner essay; 30 min)
- **Eugene Yan — "LLM Evaluations: Patterns and Pitfalls"** series (2022–2024 archive)
- **Anthropic — "Building Evals" docs** + Anthropic Evals cookbook
- **OpenAI — `openai/evals` repo** (skim, not read end-to-end)
- **Bryan Bischof — "Vibe checks vs. Evals"** (essay on why vibes fail)

### Week 2 — Advanced RAG
- **Anthropic — "Contextual Retrieval"** (2024; their re-ranking + chunking blog)
- **Pinecone — "Hybrid Search" guide**
- **Cohere — "Re-ranking with Rerank API"** (concept transferable to any reranker)
- **LlamaIndex — "Advanced RAG Cookbook"** (skim recipes)
- **"RAG vs Long Context Windows"** — current debate framing

### Week 3 — Tool calling deep
- **OpenAI — "Function Calling Guide"** (latest revision; tool_choice, parallel calls, structured tool args)
- **Anthropic — "Tool use" docs**
- **DSPy paper** (Khattab et al. 2023) — for the conceptual frame, not adoption
- **A practical multi-tool agent walkthrough** (any well-cited 2024 tutorial)

### Week 4 — Agents
- **ReAct paper** (Yao et al. 2022) — foundational
- **Reflexion paper** (Shinn et al. 2023) — self-critique loops
- **"Anatomy of an Agent"** (any 2024 essay, Lilian Weng's blog has one)
- **AutoGen / CrewAI / LangGraph docs** (skim — don't adopt unless needed)

### Week 5 — MCP
- **MCP spec** (modelcontextprotocol.io)
- **Anthropic announcement post** (2024)
- **MCP server quickstart** (TypeScript or Python)
- Existing MCP servers as reference (filesystem, sqlite, github)

### Week 6 — Production AI engineering
- **"Semantic caching with embeddings"** (any 2024 essay)
- **OpenAI batch API + prompt caching docs**
- **"Token economics: small models for big jobs"** (model-routing patterns)
- **vLLM / TGI docs** (for awareness; you may not run your own inference)

---

## What's parked (not part of this curriculum, by design)

- **Fine-tuning** — your data is too small (<10K labeled examples per surface). Re-evaluate in 6 months.
- **DSPy / LangChain / LangGraph adoption** — abstractions over what you're already doing. Read once, don't adopt unless a use case demands it.
- **Benchmark-chasing on MMLU / HumanEval** — academic, not the same as evaluating your surfaces.
- **Reinforcement learning from human feedback (RLHF)** — not feasible at solo scale.
- **Multi-modal (vision / audio)** — defer until your text-only surface is fully evaluated.

---

## Roadmap update cadence

Re-read this doc on Day 7 of every week. Update:
- `Current week` pointer
- Any concept reordering (if a week revealed a stronger dependency)
- "Parked" list (if something becomes relevant)

If you skip a week, **don't skip the spaced review of prior weeks**. The roadmap is fungible; the spaced review is not.

---

## Current week

> **Week 1 — Evals as a discipline.** Started 2026-05-18. Mid-week (Day 3–5 build phase). Study guide at `/docs/concept-reviews/01-evals-as-a-discipline-study-guide.md`. Eval harness at `server/eval/`. Progress log below.

---

## Week 1 — progress log

### ✅ Done

- **Eval harness MVP shipped** (`server/eval/`):
  - Generic runner (`runner.js`) — sequential or bounded-parallel; saves NDJSON-shaped reports to `eval/reports/`
  - Surface adapter (`surfaces/note-summary.js`) — wraps existing `noteSummaryPrompt` + `validateNoteSummary` + usage-emitter subscription
  - Basic metrics (`metrics/basic.js`) — error_rate, latency p50/p95/max, token avgs, cost USD, output length stats, declarative assertions, **tag-based slicing** (`by_tag.<tag>`)
  - Validation metric (`metrics/validation.js`) — valid_rate, top violations, sample failures
  - LLM-as-judge groundedness (`judges/groundedness.js`) — hallucination detection via gpt-4o judge, opt-in via `EVAL_JUDGE=1`
  - Cost lookup table (`lib/cost.js`) — USD per 1M tokens for gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, embeddings (last updated 2026-05-18)
  - Diff script (`scripts/eval-diff.js`) — direction-aware, color-coded, run via `npm run eval:diff -- <a>.json <b>.json`
  - 5 hand-picked golden items covering typical / empty / code-only / prompt-injection / rambling
- **First baseline run captured** (2026-05-18 09:34Z) on `note-summary`:
  - 0 errors, 15/15 assertions passed, valid_rate 0.80
  - p50 latency 4.3s, p95 6.2s on gpt-4o-mini
  - Avg cost $0.0043 / call → projected $4.31 per 1k calls
  - Adversarial vs typical valid_rate split surfaced via tag slicing (adversarial 0.667, typical 1.0)
- **Real bug surfaced by the eval** — prompt-vs-validator inconsistency: `noteSummaryPrompt` instructs the LLM to "return empty arrays for empty notes," but `validateNoteSummary` rejects `keyTakeaways.length < 3` regardless of `hasContent`. The empty-input case has been silently failing validation in production for weeks.

### ⏳ Pending (the rest of Week 1)

| Task | Owner | Notes |
|---|---|---|
| **Experiment 1**: fix the validator-vs-prompt inconsistency in `validateNoteSummary` (gate the keyTakeaways count check on `hasContent`) | You | Predicted: valid_rate 0.80 → 1.00. The "evals find bugs" lesson. |
| **Experiment 2**: pick one prompt change (reduce few-shot count, lower temperature, or strengthen empty-note instruction), run, diff against baseline | You | Write the hypothesis BEFORE running. The hypothesis-vs-result gap IS the learning. |
| **Experiment 3** (optional): deliberately game `valid_rate` with placeholder padding to experience Goodhart's law live | You | Skip if time tight. |
| Run once with `EVAL_JUDGE=1` to see groundedness numbers and worst-offender hallucinations | You | Costs ~$0.005/item × 5 items = ~$0.025 per run |
| Add 5+ adversarial golden items to `golden-sets/note-summary.json` | You | Templates: foreign-language, self-contradictory, repetition, mixed quality |
| Day 6 — write the worked-example concept note `/docs/concept-reviews/01-evals-as-a-discipline.md` (using AI Topic Notes Template) | You | Productive failure: §3 mental model BEFORE reading authoritative sources |
| Day 7 — spaced review of the self-test questions in the concept note (cold) | You | First week, no prior content to review yet |

### 🅿️ Parked (intentionally, until justified)

- **Eval reports UI** — a SuperAdmin page to browse + diff reports visually. Defer until JSON-file review becomes painful (probably after 3–4 surfaces evaluated and 20+ historical reports). Premature UI is procrastination dressed as progress.
- **More surfaces evaluated** (AI Solution Review, AI Readiness Verdict, Note Auto-Tag, Note Flashcards) — defer until Week 1 surface stabilizes. Each adds ~30 min of adapter + golden-set work.
- **Token capture for the judge itself** — currently estimated via char-count proxy in `judges/groundedness.js`. Real capture works but adds plumbing; defer.
- **Persistent baseline pinning** — right now you eyeball "the last report" as baseline. A `baseline.json` symlink / pin would clarify — defer until needed.
- **Concurrent eval runs** — runner supports it (`concurrency: 3`) but defaults to 1 to keep traces readable. Bump when comfortable.

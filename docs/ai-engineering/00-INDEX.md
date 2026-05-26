# AI Engineering — Build Notes

> **What this folder is.** Practical, project-grounded learning notes for every AI Engineering phase shipped in this repo. Different genre from `docs/ai-topic-notes-template.md` (which is for ML _theory_ — Transformers, loss functions, etc.). These notes capture the _engineering_ side: protocols, integrations, security, deployment, real bugs, real fixes.
>
> **Who it's for.** Me, future me, future contributors. Specifically: someone who wants to learn AI Engineering by reading what was actually built — concepts grounded in actual code, decisions tied to actual constraints, issues with actual stack traces.
>
> **The discipline.** Every shipped phase gets one note. Notes follow `template-build-log.md`. Notes are written _while shipping_ (the "build journal" section), not retrospectively — debugging-while-it's-fresh is when learning sticks.

---

## How to use this folder

Three reading paths depending on why you're here:

| Why you're here                                     | Read                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| You want the big picture of what's been built       | This INDEX, then any phase note                                                     |
| You want to learn one concept (e.g. "what is MCP?") | The relevant phase note's **Concept primer** + **Glossary** sections                |
| You're debugging a similar problem                  | The relevant phase note's **Issues & fixes** section                                |
| You want to ship a similar phase yourself           | Read the Phase MCP-1 note end-to-end, then use `template-build-log.md` for your own |

---

## Notes index

### Phase 1 — MCP server (read-only)

| File                                                             | Status                | What it covers                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-mcp-phase-1-foundation.md`](./01-mcp-phase-1-foundation.md) | ✅ shipped 2026-05-26 | What MCP is. Streamable HTTP transport. Bearer token auth with `mcp:read` scope. JTI revocation. DNS rebinding defense. Prompt injection defense. Rate limiting. The five real bugs we hit + fixes. FAQs from a learner's perspective. |

### Future phases (planned)

| Phase                          | What it'll cover                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP-2 — read tools             | Registering MCP tools. Zod schemas for inputs/outputs. Reusing existing controllers. Per-tool multi-tenancy enforcement. Tool naming + description style for LLM consumption. |
| MCP-3 — prompts                | Prompt templates as first-class MCP primitives. Combining user data into guided conversation starters.                                                                        |
| MCP-4 — token UX + diagnostics | Settings page UI for token issuance. Last-used tracking. Revocation flow. Diagnostics dashboard.                                                                              |
| MCP-5 — hardening review + GA  | Final security audit. `npm audit` in pre-push gate. Canary rollout.                                                                                                           |
| Outcome capture loop           | Populating `VerdictLog.interviewOutcome`. Survey hook + email + 6-month re-anchor. Why every weight in the system is research-by-analogy until this ships.                    |
| Cross-modal recalibration      | Per-modality activation floors. Why coding-only users shouldn't claim "tier-ready".                                                                                           |

---

## Cross-reference — engineering docs

These docs live elsewhere in the repo but pair with the notes here:

| Doc                                                                | Purpose                                                                                                                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/AGENT_TOOLING_REFERENCE.md`](../AGENT_TOOLING_REFERENCE.md) | Architecture-level reference. MCP vs LangChain vs LangGraph vs raw OpenAI. Decision log. Threat model table. **Read this BEFORE the build notes** — it's the conceptual foundation. |
| [`CLAUDE.md`](../../CLAUDE.md)                                     | Project-level conventions. Multi-tenancy invariants. Pre-push gate. Migration workflow.                                                                                             |
| [`docs/ai-topic-notes-template.md`](../ai-topic-notes-template.md) | Template for _theory_ learning notes (Transformer, attention, etc.).                                                                                                                |
| [`docs/ai-learning-roadmap.md`](../ai-learning-roadmap.md)         | The 6-week curriculum. Project-integrated.                                                                                                                                          |

---

## Notation used in build notes

To keep notes scannable:

| Marker | Meaning                                                           |
| ------ | ----------------------------------------------------------------- |
| 🟢     | "Worked first try" — happy path                                   |
| 🟡     | "Took a debug cycle" — fixable but worth noting                   |
| 🔴     | "Real bug" — wrong assumption, now corrected                      |
| 💡     | "AHA moment" — concept that finally clicked                       |
| 🎓     | "Learner question" — something a beginner would reasonably wonder |
| ⚠️     | "Trap for newcomers" — easy mistake to make                       |
| 📚     | "Read more" — link out to authoritative source                    |

---

## Update this INDEX when

- A new phase ships → add a row to the "Notes index" table
- A new template emerges (e.g. for incident write-ups) → add to "Cross-reference"
- A note gets renamed → fix all links in this INDEX

The INDEX is the only file that's hand-maintained; phase notes are append-only once shipped.

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

### Phase 1 — MCP server foundation

| File                                                             | Status                | What it covers                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-mcp-phase-1-foundation.md`](./01-mcp-phase-1-foundation.md) | ✅ shipped 2026-05-26 | What MCP is. Streamable HTTP transport. Bearer token auth with `mcp:read` scope. JTI revocation. DNS rebinding defense. Prompt injection defense. Rate limiting. The six real bugs we hit + fixes. FAQs from a learner's perspective. |

### Phase 2 — MCP read tools

| File                                                             | Status                                                                           | What it covers                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`02-mcp-phase-2-read-tools.md`](./02-mcp-phase-2-read-tools.md) | ✅ batches 1+2 shipped 2026-05-26 (7 tools live; 8th `get_weekly_plan` deferred) | AsyncLocalStorage for auth context. Capture-res shim for controller reuse. Stateless transport + per-request server creation. Zod input + output schemas. The four real bugs (stateful-vs-stateless, test-script auto-mint, cwd scope, no-team handling). Tool registration patterns + FAQ. |

### Phase 3 — MCP prompts

| File                                                       | Status                | What it covers                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`03-mcp-phase-3-prompts.md`](./03-mcp-phase-3-prompts.md) | ✅ shipped 2026-05-26 | What MCP prompts are (vs tools/resources). Slash-command UX. Pulling user data into primer messages. The 4 templates: `weekly-prep-checkin`, `pre-interview-brief`, `pattern-deep-dive(pattern)`, `calibration-coach`. Verified end-to-end via real Claude Code invocation. |

### Phase 4 — MCP token API

| File                                                           | Status                                          | What it covers                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`04-mcp-phase-4-token-api.md`](./04-mcp-phase-4-token-api.md) | ✅ server-side shipped 2026-05-26 (UI deferred) | Per-user token API. `RevokedMcpToken → McpToken` schema evolution. POST/GET/DELETE `/me/mcp-tokens`. Token-shown-once UX. Cross-user revoke returns 404 (not 403). 5-token cap. Idempotent revocation. 12 new tests. |

### Future phases (planned)

| Phase                         | What it'll cover                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP-4-UI — settings page      | React UI for token issuance + revocation. Last-used relative time. Copy-to-clipboard auto-clear. Soft-delete cleanup cron (revoked rows >90d).             |
| MCP-2 follow-up               | `get_weekly_plan` tool — needs cache-first read + AI quota gate before MCP-safe.                                                                           |
| MCP-5 — hardening review + GA | Final security audit. `npm audit` in pre-push gate. Canary rollout.                                                                                        |
| Outcome capture loop          | Populating `VerdictLog.interviewOutcome`. Survey hook + email + 6-month re-anchor. Why every weight in the system is research-by-analogy until this ships. |
| Cross-modal recalibration     | Per-modality activation floors. Why coding-only users shouldn't claim "tier-ready".                                                                        |

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

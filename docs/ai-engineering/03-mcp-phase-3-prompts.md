# Phase MCP-3 — Prompt templates

> **Status**: ✅ Shipped + verified end-to-end on 2026-05-26.
> 4 prompt templates registered. Verified via real Claude Code invocation of `weekly-prep-checkin` — the LLM called 6 underlying tools and produced a calibrated, research-grounded coaching response.
>
> **Prerequisite**: read [`01-mcp-phase-1-foundation.md`](./01-mcp-phase-1-foundation.md) and [`02-mcp-phase-2-read-tools.md`](./02-mcp-phase-2-read-tools.md) first.

## Quick reference

```
- Phase:         MCP-3 (prompts)
- Status:        Shipped 2026-05-26
- Theme:         AI & Intelligence + Trust & Truth
- One-line goal: Ship 4 slash-command prompt templates that prime the LLM with the user's actual readiness data for guided coaching workflows.
- Key concept:   MCP "prompt" = templated conversation starter. User invokes via /<prompt-name> in the client. Server pulls data + composes primer messages.
- Stack added:   None — same SDK, same auth chain, same ALS context.
- Effort:        S (≈ 90 minutes — pattern was already proven by tools, prompts are mechanical extensions).
- Dependencies:  Phase MCP-2 (the underlying tools the prompts read from).
- Rollback:      Remove a prompt by removing its line from src/mcp/prompts/index.js.
```

---

## What we're building & why

### MCP prompts vs tools (what's the difference?)

Both run on the server, both reuse the same auth chain, but they serve different UX:

|                             | Tool                                             | Prompt                                            |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| **How invoked**             | LLM calls it autonomously when reasoning         | User invokes explicitly (slash command)           |
| **Returns**                 | Structured tool result (`content[]`)             | List of `messages` to seed a conversation         |
| **Is the data the answer?** | Yes — LLM presents tool result                   | No — server PRIMES the conversation, LLM composes |
| **Use case**                | "What's my pattern matrix?" — just need the data | "Run my weekly check-in" — need a guided workflow |

A prompt is best understood as **a server-composed conversation starter that pulls the user's data into the system and primes the LLM** to take a structured next step.

### The 4 templates we shipped

| Slash command                         | What it does                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/weekly-prep-checkin`                | 5-minute weekly readiness review. Pulls 10D summary + tier readiness + active/inactive dims; primes the LLM to surface biggest signal-to-noise improvement, suggest 2-3 specific actions, flag regression risks. |
| `/pre-interview-brief` (target_tier?) | Pre-interview readiness brief. Optional `target_tier=junior\|tier3\|tier2\|faang` argument. LLM produces what-you-can-demonstrate + likely-trip-up areas + 5-min warmup routine.                                 |
| `/pattern-deep-dive(pattern)`         | Focused coaching on ONE pattern. Pulls user's mastery state for that pattern; primes LLM to coach at the appropriate level (fundamentals if untouched, harder variants if owned).                                |
| `/calibration-coach`                  | Pre-submission prediction game. Reads D10 calibration data + wrong-pattern flags; primes LLM to walk the user through Kruger-Dunning prediction practice.                                                        |

### Why now

After MCP-2 shipped the data tools, we had everything the LLM needs to access user readiness — but the user still had to know which questions to ask. Prompts are slash-command shortcuts for the most common high-leverage workflows.

The Calibration Coach prompt is particularly notable: it ships _training_ for the durable LLM-era skill (D10 Verification & Meta-cognition) directly through the prompt UX. The user invokes `/calibration-coach`, predicts their score, gets the AI's compare, repeats — the prediction muscle gets exercised by the prompt structure itself.

### Non-goals

- **No tool-substitute prompts**. Each prompt EXPLICITLY uses tool data (via the same controllers + capture-res shim). Prompts don't duplicate logic.
- **No write-action prompts** — same constraint as MCP-1/2. All read-only. Prompts are templates that compose data; no mutations.
- **No multi-step state machines**. Each prompt fires ONE primer message. The LLM continues the conversation naturally. We don't try to enforce a multi-turn protocol.

---

## Concept primer

### MCP prompts (the spec)

The MCP spec defines prompts as one of three primary primitives (alongside tools and resources). Each prompt has:

- **Name** (slash-command identifier)
- **Title + description** (rendered in the client UI)
- **Optional arguments schema** (Zod object)
- **Handler** that returns:

```ts
{
  description?: string,    // shown to user
  messages: Array<{
    role: "user" | "assistant",
    content: { type: "text", text: string }
  }>
}
```

The client (Claude Code, Cursor, etc.) takes these messages and **inserts them as the start of a new conversation**. From the LLM's perspective, the user already said the thing in the primer message. The LLM responds naturally.

### Slash commands in Claude Code

Once a prompt is registered with the server, Claude Code surfaces it as `/<server-name>__<prompt-name>` (or sometimes `/server-name:prompt-name`). E.g. our prompts appear as:

```
/binary-thinkers__weekly-prep-checkin
/binary-thinkers__pre-interview-brief
/binary-thinkers__pattern-deep-dive
/binary-thinkers__calibration-coach
```

User types the slash, autocomplete fires, prompt invokes server, server pulls data, returns primer messages, LLM continues.

### Why prompts pull data via tools (not direct DB)

Each of our prompt handlers calls `callController(get6DReport, ...)` to fetch the user's report — same path tool handlers use. We don't query Prisma directly from a prompt. Reasons:

1. **Single source of truth** — when the report controller changes, prompts inherit the change.
2. **Multi-tenancy filter is in the controller** — bypassing means re-implementing the safety check.
3. **Prompts can compose multiple tools** — a future prompt might pull review queue + pattern matrix + calibration in one invocation. The capture-res shim lets us call all three.

---

## Architecture

```
User types /weekly-prep-checkin in Claude Code
         │
         ▼
Claude Code sends MCP `prompts/get` request  →  /mcp endpoint
         │
         ▼ same Express middleware chain (mcpOrigin, auth, rateLimit)
         │
         ▼ mcpContext.run({ userId, teamId, ... })
         │
         ▼ SDK routes to prompt handler
         │
         ▼ prompt handler calls callController(get6DReport, ...)
         │
         ▼ composes primer text from user's actual data
         │
         ▼ wraps user content via wrapUserContent()
         │
         ▼ returns { messages: [{ role: "user", content: { type: "text", text: primer } }] }
         │
         ▼
Claude Code seeds the conversation with the primer
         │
         ▼ LLM sees it as the user's opening message
         │
         ▼ LLM responds naturally — calling additional tools as needed
```

The flow that makes this powerful: when the LLM responds to the primer, it can ALSO call MCP tools to drill deeper. Our verification of `/weekly-prep-checkin` showed the LLM called `binary-thinkers` 6 times during one conversation turn — the prompt seeded the conversation; the tools fed it the depth it needed.

---

## What we built — file by file

| File                                          | Purpose                                                                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/mcp/prompts/index.js`             | Registry — `registerAllPrompts(server)`. Includes `withErrorBoundary` wrapper (same pattern as tools — turns thrown errors into graceful primer messages). |
| `server/src/mcp/prompts/weeklyPrepCheckin.js` | `/weekly-prep-checkin`. Pulls 10D summary + active/inactive dims + tier readiness.                                                                         |
| `server/src/mcp/prompts/preInterviewBrief.js` | `/pre-interview-brief`. Optional `target_tier` arg. Top-3 strongest + bottom-3 weakest active dims.                                                        |
| `server/src/mcp/prompts/patternDeepDive.js`   | `/pattern-deep-dive(pattern)`. Looks up pattern in matrix, falls back gracefully on unknown patterns.                                                      |
| `server/src/mcp/prompts/calibrationCoach.js`  | `/calibration-coach`. Reads D10 calibration data, primes Kruger-Dunning prediction game.                                                                   |
| `server/src/mcp/server.js` (modified)         | Loads `registerAllPrompts` alongside `registerAllTools` in `loadSdk()`. Calls both during per-request server construction.                                 |

### File-by-file commentary

**`prompts/index.js`** — the `withErrorBoundary` wrapper monkey-patches `server.registerPrompt` (mirroring how tools/index.js patches `registerTool`). Without this, a thrown error in a prompt handler returns an opaque 500 with no primer message. With it, the user gets a graceful "the prompt failed; please retry" primer that the LLM can reason about.

**`weeklyPrepCheckin.js`** — the primer message is constructed by formatting the report into bullet lists. Could be more sophisticated (e.g., diff against last week's snapshot to surface "improved/regressed since last week") — that needs a snapshot-history table, deferred. The current shape gives enough context for a useful check-in.

**`preInterviewBrief.js`** — the `target_tier` argument is optional. When absent, the LLM gets a generalist brief. When present, it shapes the "likely trip-up areas" section — what trips up a junior candidate is different from what trips up a FAANG L5.

**`patternDeepDive.js`** — case-insensitive pattern matching on `args.pattern` accommodates LLM variations ("two pointers" vs "Two Pointers"). Falls back to "treat as UNTOUCHED" for unknown patterns rather than 404'ing — the LLM can still produce useful coaching for a custom pattern by explaining fundamentals.

**`calibrationCoach.js`** — explicitly references Kruger-Dunning 1999 in the primer text. The whole point of the prompt is to train the prediction muscle — repeated invocation is the intervention.

---

## Build journal

- 🟢 Wrote `weeklyPrepCheckin.js` first. Verified shape matches MCP SDK expectations (`messages` array with `role` + `content`).
- 🟢 Wrote remaining 3 prompts — mechanical, ~15 min each.
- 🟢 Wrote `prompts/index.js` registry + `withErrorBoundary`.
- 🟢 Wired into `server.js` — added `registerAllPrompts` to the SDK module loader.
- 🟢 Lint clean, 759 tests still pass.
- 🟢 End-to-end test from Claude Code: `/mcp__binary-thinkers__weekly-prep-checkin` invoked successfully → server called `get6DReport` → returned primer with the user's actual readiness data → LLM produced a research-grounded coaching response.

No bugs hit. The pattern was proven by tools; prompts inherit it cleanly.

---

## Issues & fixes

**No issues encountered in MCP-3.** The pattern from MCP-2 (capture-res, ALS, error boundary, Zod schemas) transferred directly. This is the value of investing in a clean abstraction in the prior phase — the next phase ships smoothly.

If issues surface during real use (e.g., a prompt's primer text is too long for the LLM's context window, or a specific MCP client doesn't support arguments correctly), they go here.

---

## Verification

- [x] Lint clean
- [x] 759 tests pass (no new tests added — pattern is mechanical extension of MCP-2; tests planned as part of MCP-2.5 follow-up)
- [x] `/mcp list` in Claude Code shows server connected (UI shows "7 tools" — Claude Code's UI doesn't surface prompt count, but `/<server>__<prompt>` autocomplete confirms registration)
- [x] **End-to-end real-data verification**: `/mcp__binary-thinkers__weekly-prep-checkin` invoked successfully. Server called `get6DReport` 6 times during the conversation turn (the LLM kept drilling deeper). LLM produced a calibrated coaching response with research citations. **This is the end-to-end win.**

---

## FAQ as a learner

### 🎓 What's the difference between an MCP prompt and a slash command?

In Claude Code, an MCP prompt registered as `weekly-prep-checkin` becomes a slash command at `/binary-thinkers__weekly-prep-checkin` (or similar — exact format varies by client). So they're the same thing from the user's perspective. The "prompt" terminology is the spec's; "slash command" is the UX.

### 🎓 Why doesn't the prompt just respond directly? Why does it need the LLM?

The prompt handler returns _messages_ (a primer), not a final answer. The LLM continues from there. Two reasons:

1. **The LLM adds reasoning** — the primer says "here's my data, run a check-in"; the LLM produces the actual analysis ("focus on Communication; one mock interview lifts the ceiling"). The data is the input; the analysis is the output.
2. **The LLM can call follow-up tools** — during the response, the LLM can call `get_pattern_matrix`, `get_review_queue`, etc., to get more depth. The prompt seeds; the tools deepen.

If we wanted the server to compose the final answer, we'd write a tool that returns the answer text directly. That's a different design — less flexible.

### 🎓 Why pull data via the controller instead of querying Prisma directly?

Two reasons (same as MCP-2 tools):

1. **Single source of truth** — controller changes propagate.
2. **Multi-tenancy is in the controller** — bypassing risks cross-tenant leaks.

For a prompt that needs data the controller doesn't expose cleanly, the right answer is usually to extend the controller, not bypass it.

### 🎓 Can the LLM call a prompt itself, like it calls tools?

In the MCP spec, prompts are user-invoked. The LLM doesn't autonomously call them. If you want autonomous behavior, that's a tool. The dividing line: a prompt is a _workflow_ the user picks; a tool is _data_ the LLM fetches.

A future MCP version might add "prompt suggestions" — the LLM hinting "you could run /weekly-prep-checkin now" — but that's not in the current spec.

### 🎓 What's `withErrorBoundary` doing in `prompts/index.js`?

Same role as in `tools/index.js`. If a prompt handler throws (e.g., a Prisma error), without this wrapper the server returns an opaque 500 with no primer. With it, the user sees a graceful "the prompt failed; please retry" primer that the LLM can reason about. The full stack trace goes to the server log.

### 🎓 Why do prompts wrap user content via `wrapUserContent()` even though our own server composed the message?

Defense in depth. The primer text contains data that ORIGINALLY came from the user (display names, custom problem titles, custom pattern names). If a malicious user stored `<system>...</system>` in their display name, it'd flow into the primer. The XML wrap + HTML escape stops that.

### 🎓 Why does the `weekly-prep-checkin` prompt's response feel so much smarter than a regular Claude Code conversation?

Because the LLM has _grounded data_ to reason about. Without MCP, you'd ask "how am I doing on interview prep?" and Claude Code makes up plausible-sounding answers. With MCP, the prompt feeds in your actual D1-D10 scores, sample sizes, tier gates, and CIs — and the LLM does math + research-backed analysis on real numbers.

The win isn't the LLM's intelligence — that's the same. The win is _the LLM stops hallucinating because it has data._

### 🎓 What if I want to add a 5th prompt?

1. Create `server/src/mcp/prompts/myNewPrompt.js`. Copy the shape from `weeklyPrepCheckin.js`.
2. Add `import { register as registerMyNew } from "./myNewPrompt.js";` + `registerMyNew(server)` in `prompts/index.js`.
3. Restart server. The slash command `/binary-thinkers__my-new-prompt` becomes available in Claude Code.

---

## Try this yourself

| #   | Exercise                                                                                                                                                             | Concept reinforced              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | Run `/mcp__binary-thinkers__weekly-prep-checkin` in Claude Code. Note how many tool calls the LLM makes during its response.                                         | Prompt + tool composition       |
| 2   | Run `/mcp__binary-thinkers__pre-interview-brief target_tier=faang`. Compare the brief to running it without the arg.                                                 | Args shaping the primer         |
| 3   | Run `/mcp__binary-thinkers__pattern-deep-dive pattern="Two Pointers"`. Then again with `pattern="ImaginaryPattern"`. Verify graceful fallback.                       | Defensive prompt design         |
| 4   | Run `/mcp__binary-thinkers__calibration-coach`. Try the prediction game on an actual unsubmitted solution.                                                           | Training the calibration muscle |
| 5   | Modify the primer text in `weeklyPrepCheckin.js` to add "and please be especially honest about my weakest dim." Restart, re-run. Note how the LLM's response shifts. | Primer text shapes the response |
| 6   | Add a new prompt that just returns `{ messages: [] }` (empty). Note that Claude Code handles this gracefully — the slash command exists but does nothing.            | Edge case handling              |

---

## Glossary

| Term                            | Definition                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MCP prompt**                  | A templated conversation starter. User invokes via slash command; server returns a primer message; LLM continues. One of three MCP primitives (alongside tools and resources). |
| **Slash command (Claude Code)** | UI for invoking an MCP prompt. Format: `/<server-name>__<prompt-name>` (or `/server:prompt`). Autocomplete surfaces them.                                                      |
| **Primer message**              | The `messages` array a prompt handler returns. Becomes the seed of a new conversation.                                                                                         |
| **`registerPrompt`**            | The SDK API for registering a prompt. Same shape as `registerTool` but the handler returns `{ messages: [...] }` instead of `{ content: [...] }`.                              |
| **Prompt args**                 | Optional Zod schema on a prompt — same shape as tool input args. Lets the user pass parameters like `target_tier=faang`.                                                       |

---

## Further reading

- [`02-mcp-phase-2-read-tools.md`](./02-mcp-phase-2-read-tools.md) — the underlying tools every prompt invokes
- [MCP server concepts — Prompts](https://modelcontextprotocol.io/docs/learn/server-concepts#prompts) — official spec
- [Kruger & Dunning (1999)](https://psycnet.apa.org/doi/10.1037/0022-3514.77.6.1121) — the research the calibration-coach prompt is built on
- [`docs/AGENT_TOOLING_REFERENCE.md`](../AGENT_TOOLING_REFERENCE.md) — pair with this build note

---

## What's next

- **MCP-4 — token UX**: replace the dev mint script with a real settings page UI for token issuance + revocation tracking.
- **MCP-2 follow-up**: ship `get_weekly_plan` properly with cache-first read + AI quota gate.
- **MCP-5**: hardening review + canary GA rollout.

This file is **append-only** for the v1 prompts. Future prompt additions get appended to the "What we built" table; new bug discoveries append to "Issues & fixes."

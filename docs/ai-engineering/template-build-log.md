# Phase {N} — {Phase title}

> **Genre**: AI Engineering build log (practical, project-grounded). For ML-theory notes (architecture, loss functions, etc.) use `docs/ai-topic-notes-template.md` instead.
>
> **How to use this template**: copy this file to `0N-<short-name>.md` *before* you start the phase. Fill the **Quick reference** + **What we're building & why** sections first (forces commitment). Update the **Build journal** as you ship each step (not retrospectively). Capture **Issues & fixes** the moment they happen — you'll forget the details by the next day. The **FAQ** and **Glossary** sections get written at the end.

---

## Quick reference

A 60-second skim of the phase. Always at the top.

```
- Phase:         <e.g. MCP-1, D8, outcome-capture-loop>
- Status:        <planning | in-progress | shipped YYYY-MM-DD | rolled-back>
- Theme:         <Engineering Hygiene | Security | AI & Intelligence | Trust & Truth | etc.>
- One-line goal: <≤ 25 words — what changes after this ships>
- Key concept:   <e.g. Streamable HTTP transport, Bearer token scoping, OAuth PKCE>
- Stack added:   <new libs / SDKs / env vars / DB tables>
- Effort:        <S | M | L>  (real-world, not estimated)
- Dependencies:  <other phases / features that must ship first>
- Rollback:      <how to disable in one minute, who can do it>
```

---

## What we're building & why

A plain-English description for someone who hasn't been in the planning meetings. **Zero jargon.** If you need a term, define it inline or link to the Glossary.

> **What weak looks like**: "Adding MCP support to expose RPC over HTTP" — restates the title.
>
> **What good looks like**: "Letting users query their interview-prep data from inside Claude Code (the AI coding assistant they already use) without context-switching to our web UI. We're using a standard called MCP that Claude Code already speaks."

Then add ~3 paragraphs:

1. **The user-facing change** — what does someone actually experience differently?
2. **The why-now** — why is this the right phase to ship this in (vs earlier or later)?
3. **The non-goals** — what we explicitly are NOT doing, and why deferring is OK.

---

## Concept primer

The minimum theoretical foundation a contributor needs to read the code without confusion. Aim for **just enough** — the goal is unblocking the rest of the note, not teaching the whole topic.

For each concept introduced in this phase:

### Concept name

- **What it is** (1–2 sentences, plain English)
- **Why it exists** (what problem it solves)
- **The one thing that confuses everyone** (call out the standard misunderstanding)
- **Authoritative reference** (linked)

Example shape (from MCP-1):

> **JSON-RPC 2.0**
> - **What it is**: A protocol for calling functions on a remote server over HTTP, using a JSON envelope: `{ "jsonrpc": "2.0", "id": 1, "method": "...", "params": { ... } }`.
> - **Why it exists**: Predates REST. Lightweight. Lets you have many "operations" on one URL by routing on the `method` field instead of the URL path.
> - **Confusion**: Looks like REST but isn't — there's only ONE endpoint (e.g. `/mcp`), and the operation lives in the body. Standard REST tools (Swagger, Postman path-based testing) don't work cleanly.
> - **Reference**: [jsonrpc.org/specification](https://www.jsonrpc.org/specification)

---

## Architecture

How the pieces fit together. **Diagram if useful.** Mermaid renders inline in many editors.

```
┌──────────────┐    POST /mcp     ┌────────────────────────────┐
│ Claude Code  │ ────────────────>│ Express                    │
│ (or curl)    │ <──────────────  │  → mcpOrigin               │
└──────────────┘    SSE / JSON    │  → express.json (100KB cap)│
                                  │  → mcpAuth (JWT + jti)      │
                                  │  → mcpRateLimit             │
                                  │  → @modelcontextprotocol/sdk│
                                  │     StreamableHTTPTransport │
                                  └────────────────────────────┘
                                              │
                                              ▼
                                  ┌────────────────────┐
                                  │ McpServer          │
                                  │  (tools, resources, │
                                  │   prompts)         │
                                  └────────────────────┘
```

Then prose explaining each box, top-to-bottom:

- Box X does Y
- Critical invariant: Z
- The data flow on the happy path

---

## Decisions log

Every non-obvious choice, with rationale and alternatives that were rejected. **Locking decisions in the note prevents re-litigating them later.**

### Decision N: <one-line title>

**Status**: Locked / Reconsidered YYYY-MM-DD / Reversed YYYY-MM-DD

**Choice**: <what we picked>

**Why**: <the reasoning>

**Rejected alternatives**:
- Option A — <why not>
- Option B — <why not>

**Implication**: <what this means for future phases>

(Repeat for every meaningful decision. 5–10 decisions per phase is typical.)

---

## What we built — file by file

A guided tour of the artifacts. Aim for a contributor who needs to understand the diff. Keep file paths clickable.

| File | Purpose | Key lines |
|---|---|---|
| `path/to/new-file.js` | One-line description | Cite specific line numbers for non-obvious bits |
| `path/to/modified.js` | What changed and why | (Don't paraphrase the diff; explain the *intent*) |

For each file with non-obvious code, add a paragraph below the table:

> **`path/to/file.js`** — explain WHY the code is shaped this way, not WHAT it does (the code shows what). Mention any trap-for-newcomers patterns (e.g. "this looks racy but isn't because X").

---

## Build journal

Chronological record of what happened, written **as it happened.** Not a retrospective. The friction here is the learning.

### Day 1 / morning

- Set up env flag
- Wrote the migration
- Ran into [link to Issue 1 in next section]

### Day 1 / afternoon

- Finished middleware chain
- Tests pass
- Committed

(Keep this short — bullet points, not prose. The depth lives in the next section.)

---

## Issues & fixes

The debugging journey. **One subsection per issue.** Each one is a learning moment.

### Issue 1: <one-line title>

**Symptom**: What you saw (error message, wrong behavior). Paste the actual log.

**Hypothesis 1**: What you thought it was. Why that was wrong.

**Hypothesis 2**: <if applicable>

**Root cause**: The actual reason.

**Fix**: What you changed. Include diff or link to the commit.

**Lesson**: One-sentence takeaway. *"From now on, I will..."*

**Prevention**: How to avoid this class of bug in the future (test fixture, lint rule, etc.).

---

### Issue 2: ...

Same shape.

(Aim for 3–7 issues per phase. If you have zero, you weren't paying attention.)

---

## Verification

How we proved it works. Checklist of what should pass before declaring the phase done.

- [ ] Lint clean
- [ ] All existing tests pass
- [ ] New tests for this phase pass
- [ ] Manual test scenario A: <description> → <expected outcome>
- [ ] Manual test scenario B: <description> → <expected outcome>
- [ ] Negative tests: <list of failure paths verified>
- [ ] Logs / metrics in a known-good state

For each manual test, include the actual command/curl and the actual response.

---

## FAQ as a learner

Questions a beginner would reasonably wonder, written in their voice. **Three properties of good FAQs**:

1. They're questions you actually had during the phase (not invented).
2. The answers are honest — including "this is awkward and we know it".
3. They cite the file/section where the implementation lives, so the reader can verify.

Example shape:

### 🎓 Why isn't this just a REST API?

Because the LLM clients we want to support (Claude Code, Cursor, ChatGPT) all speak MCP, not arbitrary REST APIs. If we shipped REST, every client would need a custom integration. MCP is the open standard that makes us instantly compatible with all of them.

### 🎓 Why bearer tokens instead of OAuth?

OAuth is the spec-recommended path but adds 3–5 days of work for the redirect flow. We're shipping bearer tokens for v1 (`mcp:read` scope, 24h expiry, instant revocation). OAuth is a follow-up if user demand surfaces. See `docs/AGENT_TOOLING_REFERENCE.md` Decision 3.

### 🎓 What happens if my token leaks?

(Honest answer about blast radius and how to revoke.)

(8–15 FAQs is a good range. Aim for the questions that took you the longest to answer for yourself during the build.)

---

## Try this yourself

Hands-on exercises. The "go and break it" section. Tied to the actual code.

| # | Exercise | What you'll learn |
|---|---|---|
| 1 | <action> | <concept reinforced> |
| 2 | <action> | <concept reinforced> |

Example:

> **Exercise 1: Cause every kind of 401**
> Hit `/mcp` with: (a) no Authorization header, (b) `Authorization: Bearer junk`, (c) an expired JWT, (d) a JWT signed with the wrong secret. Note the response codes and bodies. Confirm they're all `401 MCP_TOKEN_INVALID` (no information leakage about which check failed).

---

## Glossary

Terms introduced in this phase. **Define on first use.**

| Term | Definition |
|---|---|
| Term 1 | One-line definition. Link to Concept primer if you went deeper. |

---

## Further reading

- [Authoritative spec / paper / blog](https://...) — what to read for depth
- [Source code we depend on](https://github.com/...) — when stuck, read the SDK
- [Related project doc](../AGENT_TOOLING_REFERENCE.md) — pair with this note

---

## What's next

The next phase, framed in terms of what changes. **One paragraph max.**

- Next phase: `<phase ID>`
- Builds on this by: <one sentence>
- Blocks until this is verified by: <how you'll know v1 is solid>

---

## Maintenance notes

When the phase is rolled forward (e.g. v1 → v2), don't edit this file in place — copy the relevant lessons-learned bullets into the new phase's note and link back. This file is the historical record.

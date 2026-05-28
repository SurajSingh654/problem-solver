# AI Engineering FAQ — Things people ask while learning

> **What this is.** A growing reference for the "wait, how does X actually work?" questions that come up when you're learning AI engineering by reading real production code. Different genre from the phase notes (which document _what we built_, in order). This doc is a flat Q&A — pick the question that matches what's confusing you, read the answer, follow the "How this codebase does it" pointers if you want to see real code.
>
> **Who it's for.** Someone who's read a tutorial or two on LLMs / RAG / tool calling and is now staring at a real codebase wondering how the pieces fit together. Each answer assumes you know what an LLM is but doesn't assume you've shipped one.
>
> **How to read this.** Each entry is self-contained — jump around. Glossary at the bottom for jargon. Phase note links go deeper if you want the full backstory.

---

## Table of contents

**Tools, agents & MCP**

- [Q1 — Why does my AI coding assistant ask to read my local files when I'm trying to use a remote MCP tool?](#q1)
- [Q3 — If every user has the codebase locally, do we still need MCP (or any API at all)?](#q3)
- [Q4 — Do I need to create hundreds of `.md` files to "instruct" the LLM about every tool?](#q4)
- [Q5 — Why can't the LLM just read `.md` files containing the SQL queries and execute them directly?](#q5)
- [Q6 — Can I just have `.md` files that tell the LLM which existing service to call?](#q6)

**Caching, embeddings & retrieval**

- [Q2 — If users ask the same question repeatedly, where should I cache? Vector DB? Prompt cache? Something else?](#q2)

**Reference**

- [Glossary](#glossary)
- [How to add to this doc](#how-to-add)

---

<a id="q1"></a>

## Q1 — Why does my AI coding assistant ask to read my local files when I'm trying to use a remote MCP tool?

### TL;DR

Coding assistants like Claude Code / Cursor / Continue have **two separate tool surfaces** running in parallel:

1. **Built-in tools** — `Read`, `Bash`, `Edit`, `Grep`, `Task`. These touch your local filesystem. They prompt for permission per directory.
2. **MCP tools** — anything a remote MCP server exposes. These never touch your local filesystem; their security boundary is the bearer token + the remote server's authorization checks.

When you ask the LLM a question, it might decide to use **both** surfaces to give a richer answer. The folder-permission prompt comes from the built-in tools, not MCP. If you decline, the LLM continues with just MCP and usually gets the same answer.

### The full picture

A modern AI coding assistant is best understood as **the LLM + a toolbox**. The LLM never directly does anything; it asks the assistant to do things on its behalf. The toolbox typically has three categories:

| Category         | Examples                                                       | Where the work happens                |
| ---------------- | -------------------------------------------------------------- | ------------------------------------- |
| Local FS / shell | `Read("/path/to/file")`, `Bash("npm test")`, `Edit("file.js")` | Your machine                          |
| Web              | `WebFetch(url)`, `WebSearch(query)`                            | The assistant's HTTPS layer           |
| MCP              | `mcp__myserver__some_tool({...})`                              | A remote MCP server you've registered |

Each category has its own **permission model**. Local FS tools ask "can I read this directory?" because reading random files on someone's machine is a real privacy concern. MCP tools don't ask anything locally — the assistant just makes an HTTPS request to your server, and your server is responsible for authn/authz at that layer (bearer token, scope check, multi-tenancy filter).

The reason it _feels_ confusing: when you launch the assistant from inside a codebase, the LLM has access to **both surfaces simultaneously**. So if you ask "explain my readiness score," the LLM might:

1. Call the MCP tool to get the actual numbers, AND
2. Call `Read` to look at the source code that computed those numbers, so it can explain _why_ the score is what it is.

Step 2 is where the folder-permission prompt comes from. It's the assistant being thorough, not MCP doing something sneaky.

For a remote user without your codebase: only step 1 is possible. So they never see a folder prompt. Same MCP tool, same data, fewer questions.

### Visual

```
                ┌──────────────────────────┐
                │       The LLM            │
                │  (decides which to use)  │
                └──┬─────────┬─────────┬───┘
                   │         │         │
        Built-in tools    Web tools   MCP tools
        ────────────────  ─────────   ──────────────────
        Read, Bash,       WebFetch,   mcp__bt__leaderboard
        Edit, Grep        WebSearch   mcp__bt__readiness
                   │         │         │
                   ▼         ▼         ▼
           your laptop     the web    your remote server
           ↑                          ↑
           │ asks per-dir consent     │ no local prompt;
           │ ("Allow Read?")          │ auth = bearer token
           │                          │ + server-side checks
```

Two surfaces, one LLM. The folder prompt is from the **left arm** of the diagram.

### How this codebase does it

- **MCP server** — `server/src/mcp/server.js`. Registers tools/prompts; mounts at `/mcp` (Streamable HTTP, JSON-RPC 2.0).
- **Auth boundary** — `server/src/mcp/middleware/mcpAuth.js`. Verifies bearer token, checks scope, looks up revocation. Never reads anything from a filesystem.
- **Multi-tenancy** — every tool reads `userId` + `teamId` from `getMcpContext()` (sourced from the JWT, not from the LLM's tool args). Defined in `server/src/mcp/context.js`.

The MCP threat model is documented in `docs/AGENT_TOOLING_REFERENCE.md` ("Security threat model" section, rows 1–20).

### Try this yourself

Run your assistant from two different working directories with the same MCP server registered:

```bash
# 1. Inside a repo
cd ~/Projects/your-project
claude
> What does my readiness score reflect?
# → may prompt for file access

# 2. Outside any repo
cd ~
claude
> What does my readiness score reflect?
# → uses MCP tools only, no file prompt
```

Same LLM, same MCP server, totally different "feel" because the tool surface available to the LLM is different.

### When this comes up (use cases)

- **First-time MCP setup** — a developer registers an MCP server, runs the assistant from their repo, gets confused by file prompts. Answer: those are unrelated; ignore or accept.
- **Demoing to a non-technical user** — they don't have your codebase, so they see the clean MCP-only flow. Use this for screenshots in marketing.
- **Debugging "why is the answer different in dev vs in production"** — the local LLM may have read uncommitted code; the remote user only sees prod-deployed behavior.

### Trap for newcomers

Don't assume MCP tools are "the dangerous ones" because they connect to the network. They're often **safer** than local tools — they have a tight server-enforced authz boundary, output schemas that whitelist fields, and rate limiting. Local FS tools have only "trust the user clicked Allow." Permission prompts measure local-FS scope, not MCP risk.

---

<a id="q2"></a>

## Q2 — If users ask the same question repeatedly, where should I cache? Vector DB? Prompt cache? Something else?

### TL;DR

Three caching layers exist in a typical AI app, and they each solve different problems. Beginners often pick the wrong one because tutorials conflate them:

| Layer                                          | What it caches                                                      | When it helps                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Vector database**                            | Embeddings of unstructured content (text, code) for semantic search | "Find me documents like this query" — fuzzy retrieval over a corpus                  |
| **Prompt caching** (Anthropic, OpenAI feature) | Recently-used prompt prefixes, in the API provider's infrastructure | The same system prompt / tool definitions / few-shot examples are sent over and over |
| **Application response cache**                 | The output of _your_ expensive computations                         | Same user asks the same question; the answer hasn't changed yet                      |

Vector DBs are NOT a general-purpose cache. They're a retrieval engine for _similar but not identical_ content. If your user keeps asking the _same_ question, vector search isn't helping — application-level response caching is.

### The full picture

Let me walk through each layer with a concrete example.

**Vector DB.** Used for _semantic search_. You take user-generated content (notes, problem statements, code snippets), run it through an embedding model (e.g. OpenAI `text-embedding-3-small`), and store the resulting 1536-dim vector in a column with a vector index (HNSW, IVFFlat). Then "find similar notes" becomes a nearest-neighbor query in vector space. **The vector DB is not deciding what to compute — it's helping you locate relevant context to feed into the LLM.** This is what people mean by "RAG" (retrieval-augmented generation).

When NOT to use it: anything where exact match works (looking up a known ID), anything purely numeric (a score, a count, an aggregate), anything where staleness matters more than fuzzy similarity.

**Prompt caching.** A relatively new API feature where the LLM provider caches the prefix of your prompt for ~5 minutes after first use. If you send the same long system prompt + tool definitions + examples on every request (very common in agentic apps), the provider charges you a fraction of the input-token cost on subsequent requests because the prefix is already in their KV cache. **You don't manage this directly** — you mark cacheable spans in the request, the provider handles the rest. The 5-minute TTL is a hardware constraint of how the cache lives.

This one is almost free wins for any app that uses long system prompts.

**Application response cache.** Plain old caching of your _own_ expensive computations. "User asked for their dashboard 3 seconds ago; the underlying data hasn't changed; serve the same JSON instead of re-running 12 SQL queries." This lives in your code — Redis, in-memory Map, Postgres-with-TTL, whatever. The crucial design question is _invalidation_: if the underlying data changes, how does the cache know to expire?

For a real-time-ish app (where the user expects "current" state), aggressive response caching is dangerous because it makes the UI feel stale. For a less-fresh-required app (top-of-leaderboard, list of trending posts), a 30s-to-5min cache is a huge perf win.

### Visual — three layers, three problems

```
USER: "show me my dashboard" (asks 5 times in 2 minutes)

  ┌──── LLM client (Claude Code / Cursor) ──────────────┐
  │                                                     │
  │   Anthropic prompt cache (5-min TTL)  ← Layer 1     │
  │   ↓ saves on input tokens                           │
  │                                                     │
  └──── tool call to your server ───────────────────────┘
                            │
                            ▼
  ┌──── Your server ────────────────────────────────────┐
  │                                                     │
  │   Application response cache (your code)  ← Layer 3 │
  │   ↓ skips expensive recomputation if hot            │
  │                                                     │
  │   ↓ on cache miss: fetch from DB                    │
  │   ↓ if RAG: also query vector DB                    │
  │                                                     │
  │   Vector DB (pgvector)  ← Layer 2 (RAG only)        │
  │   ↑ retrieves SIMILAR content (not identical)       │
  │                                                     │
  └─────────────────────────────────────────────────────┘
```

The 3 layers don't compete; they compose.

### How this codebase does it

| Layer          | Where                                                                                                                                                                                                                           | What                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Vector DB      | `server/prisma/schema.prisma` (`Unsupported("vector(1536)")` columns), `server/src/services/embedding.service.js`, `server/prisma/manual_vector_setup.sql` (HNSW indexes)                                                       | Used for semantic search on Notes ("related notes") and Solutions. Powered by OpenAI `text-embedding-3-small`. |
| Prompt caching | Handled automatically by the LLM client (e.g. Claude Code marks long prefixes as cacheable). Server doesn't directly manage it.                                                                                                 | Saves token cost on the LLM-side — invisible to us.                                                            |
| Response cache | `server/src/controllers/ai.controller.js` writes verdict prose to `VerdictLog` keyed by `(userId, teamId, evidenceHash)` with 5-min TTL. The numeric report itself is NOT cached (intentional — it must reflect current state). | Saves an LLM call on repeated verdict requests within 5 min.                                                   |

**Key design decision in this codebase**: the readiness score is computed fresh every time. We deliberately don't cache it because the user will ask "did solving that problem move my score?" right after solving it, and a stale cache would lie to them. Verdict _prose_ (the AI narrative) gets cached because LLM calls are slow + expensive and the prose is essentially a summary of the same numbers.

This trade-off is project-specific. For a leaderboard, you'd cache the numbers. For a personal dashboard, you don't.

### Try this yourself

Open the network tab in your browser, refresh your dashboard twice quickly. Look at:

- The aggregate API endpoint (e.g. `/api/v1/stats/report`) — you should see a fresh response each time. Different `requestId` in the response header.
- The verdict endpoint (`/api/v1/stats/verdict` if it's separate) — the second request should be much faster on a cache hit.
- Browser console: count how many requests fired. If you see 30 instead of 5, the client also needs query-result caching (TanStack Query / SWR) layered on top.

The pattern: **fresh on the server, deduped on the client, retrieved-by-similarity in the vector DB, cached at the LLM provider for prompts.** Each layer optimizes for a different cost.

### When this comes up (use cases)

- **"My OpenAI bill is too high"** — usually fixed by enabling prompt caching, NOT by adding a vector DB.
- **"Search is slow"** — usually means you need a vector DB (or a real text index like Elasticsearch), NOT a response cache.
- **"My API is slow"** — usually a response cache, NOT prompt caching.
- **"The user sees stale data"** — your response cache TTL is too long, or you forgot to invalidate on writes.

### Trap for newcomers

Reaching for "let me set up a vector DB" the moment caching comes up. Vector DBs solve "find me content similar to X." If your problem is "make the same query faster the second time," that's a normal response cache + maybe prompt caching at the LLM layer. Pinecone is not the answer to a missing Redis.

---

<a id="q3"></a>

## Q3 — If every user has the codebase locally, do we still need MCP (or any API at all)?

### TL;DR

**Yes — having the codebase tells the LLM _how_ things work; you still need a live-data layer to answer _what's currently true_.** MCP is one option among several. The right choice depends on your audience, security posture, and how many tools you'll add over time.

### The key distinction

The single insight that unlocks this question:

```
       CODEBASE                    PRODUCTION DATA
   ──────────────────             ──────────────────
   "How is leaderboard            "Who's #1 right now?
    computed?"                     What's their score?"
   stats.controller.js            Postgres rows
   schema.prisma                  current state
       ↑                              ↑
       │                              │
       └─ readable from local ─┐   ┌─ only via API/DB
                               │   │
                          LLM needs BOTH
```

The codebase is **how**. The data is **what**. They're never in the same place.

So even if every user has cloned your repo, the LLM still cannot answer "what's my readiness score?" by reading code alone — that question requires a live query against production state.

### Alternatives to MCP for live-data access

| Approach                     | How it works                                                                               | Pros                                                                                                                                   | Cons                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **A. MCP** (what we built)   | LLM calls registered tools via MCP protocol; auth via bearer token in the assistant config | Standardized; works in Claude Code / Cursor / ChatGPT alike; output schemas; auth-once-then-forget; multi-tenancy enforced server-side | Setup cost (~1 day for foundation, less per tool added)                                                                          |
| **B. Curl + stored JWT**     | LLM uses `Bash` to `curl` your API with a JWT the user pasted into shell env               | Zero infra (the API exists already)                                                                                                    | Token in shell history; LLM has to memorize endpoints; no output filtering; brittle when API shape changes                       |
| **C. Local CLI tool**        | Build a `bt` CLI that wraps your API; LLM invokes via `Bash`                               | Familiar UX; one auth setup; output formatted for humans                                                                               | Each new tool = new command + docs; not portable across LLM clients; you're now maintaining a CLI                                |
| **D. LLM writes ad-hoc SQL** | Give the LLM `DATABASE_URL`, let it run queries via `psql` or Prisma                       | Maximum flexibility                                                                                                                    | Catastrophic. No multi-tenancy filter, no rate limiting, accidental `DELETE FROM users` is one prompt away. **Don't ship this.** |
| **E. Run server locally**    | User runs `npm run dev` pointing at prod DB; LLM curls `localhost:5000`                    | Mirror of dev experience                                                                                                               | Each user needs prod DB credentials; uncommitted local code drift means results don't reflect prod                               |

### Concrete example: "Fetch the leaderboard"

**Option B (curl + JWT) — what it feels like in practice:**

```bash
# One-time setup: user copies their JWT from browser DevTools → localStorage
export BT_TOKEN="eyJhbGciOiJIUzI1NiIs..."

# Then, in the chat:
> Fetch the leaderboard

# LLM responds by running:
curl -s https://api.binarythinkers.app/api/v1/stats/leaderboard \
  -H "Authorization: Bearer $BT_TOKEN" | jq '.data.leaderboard'
```

It works. It's also where the road of pain begins:

- **The LLM has to know the endpoint URL** (you tell it once; it might forget; new tools = new prose to remember)
- **The JWT expires every 7 days** — user re-pastes
- **The raw response includes fields you didn't mean to expose** — internal `userId`, `email`, etc., now in the chat context
- **No standard schema** — every new endpoint = new shape the LLM has to figure out

**Option A (MCP) — same query:**

```
> Fetch the leaderboard

# LLM internally does:
mcp__binary-thinkers__get_team_leaderboard()

# Returns (output schema enforces fields):
{
  "count": 5,
  "leaderboard": [
    { "rank": 1, "display_name": "Alice", "score": 80, "is_self": false, ... },
    { "rank": 2, "display_name": "Bob",   "score": 70, "is_self": true,  ... },
    ...
  ]
}
```

Auth: registered once with `claude mcp add --header`. Output: only allowlisted fields. Endpoint: the LLM doesn't need to know the URL — it knows the tool name and trusts the registration.

### When MCP is overkill (be honest)

Skip MCP if **all** of these are true:

- Single user (just you)
- Data isn't sensitive (no PII, no multi-tenancy)
- ≤ 2 endpoints you'd want LLM-callable
- You're prototyping and the API isn't stable yet

In that scenario, **Option B (curl + JWT)** is fine. Don't engineer infrastructure you won't benefit from.

### When MCP is the right call

Use MCP if **any** of these is true:

- Multiple users (real or anticipated)
- Multi-tenancy is a hard requirement
- The API surface will grow (you'll add tools over time)
- You want it to work in any LLM client, not just one
- The data is sensitive enough that an output-field allowlist matters

In your case (Binary Thinkers): all five apply. MCP is the right call.

### Visual — when each approach makes sense

```
                  Single user?                     Many users?
                  ───────────                      ──────────
  Public data    → curl + JWT (B)         →        MCP (A) for output schema
  Sensitive data → CLI tool (C) or MCP    →        MCP (A) — non-negotiable

  Few tools (≤2) → curl + JWT (B)         →        MCP (A) starts to win
  Many tools     → MCP (A) — schema saves you →    MCP (A) — even more so

  Prototyping    → curl + JWT (B)         →        prototype, then migrate
  Production     → MCP (A) or CLI (C)     →        MCP (A)
```

### How this codebase does it

We chose MCP. The decision is documented in `docs/AGENT_TOOLING_REFERENCE.md` ("Architecture decision log"). The trigger was: real users (Tanmay) without the codebase, sensitive per-user data, growing tool count (now 7), wanting to support ChatGPT desktop / Cursor too in the future.

Real moment-of-truth: the day Tanmay successfully ran `claude mcp add` on Windows + Zscaler and got a coached response with his real readiness data. None of the curl-based approaches would have worked for him.

### Try this yourself

A small experiment: pretend you're Tanmay. Open a fresh Claude Code session in a directory that has NO codebase access:

```bash
cd /tmp
claude
> Fetch my leaderboard
```

If your MCP server is registered correctly (at user scope), it works. If you're relying on the LLM reading local code, it can't help.

### When this comes up (use cases)

- **"Why don't I just put everything in CLAUDE.md?"** — see Q4. Instructions don't fetch live data.
- **"Why don't I just give the LLM the DATABASE_URL?"** — Option D. The reasons listed above. Don't.
- **"Why not just curl?"** — Option B. Fine for a single-user prototype; brittle the moment you have collaborators.

### Trap for newcomers

The trap is thinking "I have the codebase, so I have everything." You have **how**. You don't have **what**. Every dynamic question about current state requires a live data path — the codebase is necessary but not sufficient.

---

<a id="q4"></a>

## Q4 — Do I need to create hundreds of `.md` files to "instruct" the LLM about every tool?

### TL;DR

**No.** Instructions (`.md` files like `CLAUDE.md`) and tools (MCP tools, function calls) are two completely different things — they solve different problems. You'd never replace one with the other. Typical project shape: **1 instruction file + many tools + many code files + a few reference docs.** Never "hundreds of `.md` files per feature."

### The two mechanisms

```
┌────────────────────────────────────────────────────────────┐
│ INSTRUCTIONS (CLAUDE.md, .cursorrules, system prompt)      │
│ ──────────────────────────────────────────────────────     │
│ • Natural language                                         │
│ • Loaded ONCE at session start, every session              │
│ • Static knowledge — conventions, philosophy, decisions    │
│ • Token cost: paid on EVERY request                        │
│ • Quantity: small (1 root + maybe a few subtree)           │
│                                                            │
│ Example contents:                                          │
│   "Always cite sample size when discussing scores"         │
│   "Never run npm install autonomously"                     │
│   "Use 2-space indentation in TypeScript files"            │
└────────────────────────────────────────────────────────────┘
                           vs.
┌────────────────────────────────────────────────────────────┐
│ TOOLS (MCP tools, built-in Read/Bash, function calls)      │
│ ──────────────────────────────────────────────────────     │
│ • Structured: input schema + output schema                 │
│ • Invoked at runtime, only when the LLM decides to         │
│ • Carry live data — return current state                   │
│ • Token cost: definitions sent up front; results paid per-use │
│ • Quantity: many (one per capability)                      │
│                                                            │
│ Example tools:                                             │
│   get_team_leaderboard()                                   │
│   get_readiness_report()                                   │
│   revoke_mcp_token(jti)                                    │
└────────────────────────────────────────────────────────────┘
```

These solve different problems. You always have **both** — they compose.

### Why instructions can't replace tools

Three concrete reasons:

1. **Static prose can't fetch live data.** A `.md` saying "the leaderboard is at this endpoint" doesn't get the leaderboard. The LLM still needs an executable path to the data.
2. **Token economics are brutal at scale.** Every word in `CLAUDE.md` is sent on every request. This codebase already has a 40k-char `CLAUDE.md` and Claude Code warns about it. Imagine 100 `.md` files with one tool described in each — you'd pay for the entire library on every prompt, even for "what time is it?"
3. **Instructions are advisory; schemas are enforced.** A `.md` saying "don't expose the user's email" is a hint the LLM may follow or ignore. An MCP tool with an output schema that omits `email` is a guarantee.

### Why tools can't replace instructions

Equally important — tools also can't do everything:

1. **Tools have no context about your conventions.** `revoke_mcp_token(jti)` doesn't know that you prefer revoke-then-mint over update-in-place. That's a cultural decision; it lives in instructions.
2. **Tools can't teach the LLM about gotchas.** `prisma migrate dev` is a Bash tool, but the "Ctrl+C the drift prompt" gotcha lives in `CLAUDE.md`.
3. **Tools don't communicate intent.** "Always treat user content as untrusted" is a stance that informs how the LLM interprets every tool call. It's instructional, not invokable.

### The complete mental model — four layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: INSTRUCTIONS                  ← rules & philosophy │
│ ─────────────────────────                                   │
│ CLAUDE.md, .cursorrules, system prompt                      │
│ "always cite sample size", "never auto-install"             │
│ → SMALL: 1 root file, optionally subtree-scoped             │
│ → ALWAYS LOADED into LLM context                            │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: TOOLS                         ← verbs & live data  │
│ ─────────────                                               │
│ MCP tools, built-in Read/Bash, function calls               │
│ get_leaderboard(), Read("file.js"), Bash("npm test")        │
│ → MANY: one per discrete capability                         │
│ → CALLED ON DEMAND, descriptions sent up front              │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: THE CODEBASE                  ← self-documenting   │
│ ────────────────────                                        │
│ stats.controller.js, schema.prisma, etc.                    │
│ "How is the leaderboard computed?" → just read the code     │
│ → EXISTS NATURALLY, LLM reads on demand                     │
│ → No need to write prose describing what code already shows │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: REFERENCE DOCS                ← deep context       │
│ ──────────────────────                                      │
│ Build notes, learner-faq.md, decision logs                  │
│ "Why did we choose MCP over LangChain?"                     │
│ → A FEW per major topic                                     │
│ → READ ON DEMAND by humans (or LLM when explicitly told)    │
└─────────────────────────────────────────────────────────────┘
```

The growth shape is **`1 + many + many + few`** — never "hundreds of `.md` files describing each tool."

### Concrete example for this codebase

| Question                                                     | Where the LLM finds the answer                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| "Should I write a Co-Authored-By trailer?"                   | **Instructions** (memory: "no Co-Authored-By trailer in commits")                                                    |
| "What's the user's current readiness?"                       | **Tool** (`mcp__binary-thinkers__get_readiness_report`)                                                              |
| "How is `pressurePerformance` actually computed?"            | **Codebase** (read `pressurePerformanceStats.js`)                                                                    |
| "Why did we use a source-tier ceiling architecture for D5?"  | **Reference docs** (the relevant phase note + CLAUDE.md decision log)                                                |
| "What does `mcp__binary-thinkers__get_team_leaderboard` do?" | **The tool's own description** (registered with `server.registerTool(name, { description })`) — NOT a separate `.md` |

Notice: the tool's _description_ is what the LLM uses to decide when to call it. That's a single field set when registering the tool — not a file. We don't write `docs/tools/get-team-leaderboard.md`. The tool documents itself.

### What CLAUDE.md is actually for in this project

About 40k characters covering:

- **Conventions not visible in code** — "Don't run `npm install` autonomously"
- **Decisions and reasons** — "Soft-delete users via `deletedAt`; here's why"
- **Gotchas** — "`prisma migrate dev` will prompt for a fix migration; Ctrl+C"
- **Cross-cutting invariants** — "Every team-scoped query must filter by `req.teamId`"
- **Pointers** — "For X, see file Y" so the LLM knows where to look without grepping the whole repo

What it does NOT contain:

- A description of every controller (the controllers describe themselves)
- A description of every MCP tool (each tool's own `description` field handles that)
- A description of every dimension's scoring formula (one paragraph per dim, all in CLAUDE.md — not 10 separate files)

### Visual — what gets loaded when

```
Every prompt the user sends:
─────────────────────────────
  ┌─ system prompt (the assistant's own behavior)              ← always loaded
  ├─ CLAUDE.md                                                  ← always loaded
  ├─ tool definitions (just names + descriptions + schemas)     ← always loaded
  ├─ recent conversation history                                ← always loaded
  └─ user's latest message                                      ← the new bit

Only on demand (the LLM decides):
─────────────────────────────────
  ─ Read("server/src/foo.js")  ← only if LLM grep-then-reads
  ─ Bash("npm test")           ← only if LLM runs it
  ─ MCP tool result            ← only if LLM calls it
  ─ docs/ai-engineering/*.md   ← only if LLM is explicitly directed there
```

The "always loaded" pile is what your token bill scales with. That's why CLAUDE.md being 40k chars is already a concern, and why "hundreds of .md files would be 100× worse.

### Try this yourself

Look at your project's `CLAUDE.md`. Is there a paragraph describing what `getLeaderboard` does in detail? If yes, **that paragraph is probably wasted**: the LLM can read the function. Move that prose to a code comment if it's actually useful, or delete it if the function name + signature already tells the story.

The litmus test: **could a competent dev read the function and figure out what it does?** If yes, don't describe it in prose. The function describes itself.

### When this comes up (use cases)

- **"My CLAUDE.md is huge and the LLM is slow"** — you're describing things the codebase already shows. Trim.
- **"How do I tell the LLM about my new tool?"** — set a good `description` in the tool registration. No `.md` needed.
- **"How do I tell the LLM about a new convention?"** — that goes in CLAUDE.md (one line, ideally).
- **"I want the LLM to follow a specific workflow for a specific task"** — that's a _skill_ / `.claude/commands/` if your client supports it; otherwise it's a section in CLAUDE.md. Either way, NOT one `.md` per tool.

### Trap for newcomers

Treating the LLM like a junior dev who needs documentation for every function. The LLM is a senior generalist who reads code well. What it needs from you is: (a) the _non-obvious_ conventions and decisions, in one place; (b) tools that fetch live data with output schemas; (c) the codebase itself, which it'll read on demand. Prose-describing every tool is the AI-engineering equivalent of writing JSDoc that just restates the function name.

---

<a id="q5"></a>

## Q5 — Why can't the LLM just read `.md` files containing the SQL queries and execute them directly?

### TL;DR

Because **the LLM cannot execute SQL by itself** — it's a text generator, not a database client. To run a query, you need a tool that takes a SQL string and runs it. The moment you add that tool, you've reinvented MCP — but with all the safety-net layers (auth, multi-tenancy, output schemas, optimization) stripped out and replaced by "please follow the prose instructions correctly." This is the worst of both worlds.

### The proposal, drawn out

This is a natural-feeling architecture when you first encounter it:

```
.md files (in codebase)              ┌── for "top 5 users from leaderboard":
  ├── leaderboard-top5.md   ─────►   │   SELECT id, name, score FROM users
  ├── recent-activity.md             │   WHERE team_id = <YOUR_TEAM>
  ├── revoke-token.md                │   ORDER BY score DESC LIMIT 5
  └── ...                            └──

   ↓ LLM reads the relevant .md, extracts the SQL

LLM ──executes──► PostgreSQL ──► returns rows ──► back to user
```

Looks clean. But the second arrow ("LLM executes") is impossible — the LLM is just a text-generator. To make this work, you need:

```
.md files                +    a generic run_sql(query) tool
("here's the SQL")            (executes whatever the LLM passes)
```

Which is **MCP, but worse**. Let me show you why.

### What breaks in practice

**1. Multi-tenancy becomes "please follow the instructions" instead of enforced.**

The .md says:

```sql
SELECT * FROM users WHERE team_id = '<USER_TEAM_ID>' ORDER BY score DESC LIMIT 5
```

The LLM is supposed to substitute `<USER_TEAM_ID>` correctly. But:

- The LLM sometimes drops the WHERE clause when "helpfully simplifying"
- A user types "show me everyone, not just my team" and the LLM happily complies (it's just text)
- Tomorrow you add a new sensitive column — every `.md` with `SELECT *` silently leaks it

With MCP, `req.teamId` filtering happens server-side in code the LLM cannot reach or modify. No prose to misread.

**2. Auth disappears.**

The `.md` tells you the SQL but not "and only run this if the user is authenticated as a team member." Where does that check happen? Either:

- In the `.md` as more prose ("first verify auth by …") — which the LLM also might skip
- In your `run_sql` tool, which now needs to parse SQL to figure out which permissions apply — impossible in general
- In a separate auth tool the LLM is supposed to call first — which it sometimes won't

With MCP, every tool runs through `mcpAuth.js` middleware. The LLM literally cannot reach the data without first passing scope + revocation checks.

**3. Output schemas vanish.**

`SELECT * FROM users WHERE team_id = ... LIMIT 5` returns every column on the table — `email`, `hashedPassword`, `lastLoginIp`, internal IDs. All of those columns end up in the LLM's chat context, which means they end up in conversation history, in any logs you keep, in screen-shares the user does.

With MCP's `get_team_leaderboard`, the output schema explicitly allowlists `display_name + score + rank`. Other columns can't leak even by accident.

**4. The `.md` files are a copy of the schema, doomed to drift.**

Add a column `archived_at`. Now:

- The schema knows about it
- The controllers handle it automatically (if they do `SELECT *` or use Prisma's typed client)
- But your 50 `.md` files still reference the old shape
- Next prod query → silent inconsistency between what `.md` says and what's true

With MCP, the controller is the only schema-coupled layer. Schema change → update one place. Done.

**5. Performance optimizations evaporate.**

A controller can: add caching, batch related queries, use prepared statements, hit a read replica, apply a 30s TTL. The `run_sql` tool can't do any of that because the LLM is composing the query — there's no place to inject those optimizations.

**6. The token bill explodes.**

If you have 50 operations, you have 50 `.md` files. The LLM has to either:

- Have all 50 loaded into context (your CLAUDE.md is already at 40k chars; this multiplies it), OR
- Be told which one to read each time (now you need a "tool registry" `.md`, which is just MCP with worse UX)

MCP tool descriptions are compact (one paragraph each); only the descriptions are sent up front; results are paid on use.

**7. The LLM's SQL is non-deterministic.**

Same question, different prompts: the LLM might generate:

```sql
SELECT name FROM users WHERE team = 'X' ORDER BY score DESC LIMIT 5
```

…or…

```sql
SELECT id, name FROM users WHERE team_id = 'X' ORDER BY -score LIMIT 5
```

…or get the table name wrong. Each variant might or might not work, might or might not return the same data. With MCP, `get_team_leaderboard()` runs the same code every time.

### Visual — the safety layers MCP gives you that .md+SQL strips away

```
WITH MCP:                              WITH .md + run_sql:

   LLM                                    LLM
    │ calls get_team_leaderboard()         │ generates a SQL string from .md
    ▼                                      ▼
┌──────────────────┐                   ┌──────────────────┐
│ ✓ Auth check     │                   │   run_sql(query) │
│ ✓ Scope check    │                   │   ┌──────────────┘
│ ✓ Rate limit     │                   │   │ "trust the LLM"
│ ✓ Multi-tenancy  │                   │   ▼
│ ✓ Input schema   │                   │ PostgreSQL
│ ↓                │                   │ (sees raw SQL,
│ Controller logic │                   │  has no idea
│ ↓                │                   │  who the user is)
│ ✓ Output schema  │                   │
│ ↓                │                   │
└──────────────────┘                   └──────────────────┘
       │                                       │
       ▼                                       ▼
   Database                              Database
       │                                       │
       ▼                                       ▼
  Filtered rows                         Whatever SELECT *
  (allowed fields                       returned
   only)
```

Every checkmark on the left is a layer that the .md+SQL approach removes.

### The closest variant that DOES work

There's a legitimate related pattern: **named SQL templates loaded at server startup**. Your server reads `.sql` files at boot, parses them into named, parameter-bound prepared statements:

```
.sql files in repo:
  ├── queries/get_top_5_users.sql
  └── queries/get_recent_activity.sql

Server reads at boot →  registers as functions:
  ├── getTopFiveUsers(teamId)
  └── getRecentActivity(userId, sinceDate)

Each is exposed as an MCP tool with input + output schemas.
```

This works. It's a fine code-organization choice (separates SQL from JS). But notice: **you've just reinvented MCP tools, with the SQL stored in side files instead of inline.** The MCP layer is still load-bearing — it's what enforces auth and output schemas. The .md/SQL files are just a convenient place to keep query bodies, not a replacement for the protocol.

### Concrete: "Top 5 leaderboard users", both ways

| Aspect                                 | `.md` + SQL approach                                                                                             | MCP approach                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **What the LLM sees**                  | Full text of `leaderboard-top5.md`; has to interpolate `<USER_TEAM_ID>` correctly, generate the right SQL string | `get_team_leaderboard()` tool description; calls it with no args       |
| **What the LLM has to "remember"**     | Schema column names, where to put the WHERE clause, when to add LIMIT, how to escape user input                  | Nothing. Just the tool name.                                           |
| **What runs**                          | Whatever SQL the LLM produces (today vs tomorrow, different SQL for the same question)                           | A specific function in your codebase, deterministic                    |
| **Multi-tenancy**                      | The LLM is _asked_ to behave                                                                                     | Server middleware enforces                                             |
| **Output filtering**                   | Whatever columns the LLM included in `SELECT`                                                                    | Output schema allowlist                                                |
| **What changes when you add a column** | Every `.md` file that touches this table needs re-checking                                                       | Nothing (unless you want to expose it; then update one tool)           |
| **What happens if the LLM is wrong**   | Wrong data, possibly cross-tenant leak, possibly broken query                                                    | Tool fails with a clear error; data integrity preserved                |
| **Auditability**                       | "The LLM ran some SQL" — hard to trace                                                                           | Every call goes through the controller; logged with userId + tool name |

### How this codebase does it

We chose MCP. The query for `get_team_leaderboard` lives in `server/src/controllers/stats.controller.js::getLeaderboard` (a real function, not a prose template). The MCP tool wrapper at `server/src/mcp/tools/teamLeaderboard.js` adds the input/output schemas and the auth-context wiring. If you want to see how this would have looked the .md+SQL way, imagine that controller's body copied into a markdown file and the LLM tasked with re-deriving it from prose every time.

### Try this yourself

Mental experiment, no code needed:

1. Imagine you wrote a `get-top-5-users.md` saying "run `SELECT * FROM users WHERE team_id = '<X>' ORDER BY score DESC LIMIT 5`."
2. A user asks: "show me the top 5 users."
3. The LLM, having read your `.md`, runs the query — but it doesn't know what `<X>` should be, so it guesses (maybe leaves it blank, maybe inserts a team ID it saw earlier in the conversation).
4. Now you've leaked another team's data. The .md said "interpolate the user's team ID"; the LLM didn't.

Now imagine the same scenario with MCP: `get_team_leaderboard()` reads `req.teamId` from the JWT context — set server-side, immutable, the LLM has no input to it. Same user request, no possible cross-tenant leak.

### When this comes up (use cases)

- **"I want a chat-based admin tool for my own data"** — single-user, you trust yourself: `.md` + `run_sql` is fine, even pleasant. This is what tools like Vanna AI do.
- **"I want a chat interface my users can trust with their data"** — multi-user product: MCP (or equivalent enforced API). The `.md` approach can't be made safe.
- **"I'm prototyping; I'll add safety later"** — common trap. Once your friends start using it, "later" doesn't come. Decide the architecture before users.
- **"Why does the LLM keep generating broken SQL?"** — that's the determinism issue. Move to fixed queries (named templates / MCP tools).

### Trap for newcomers

The trap is thinking "the LLM is smart, it can write the SQL correctly if I tell it the schema." It can — about 80% of the time. The other 20% it generates queries that are subtly wrong, accidentally cross-tenant, or expose fields you didn't intend. **For internal data exploration that's tolerable. For a multi-user product it isn't.** MCP isn't paranoia; it's the layer that converts "the LLM probably did the right thing" into "the LLM cannot do the wrong thing because the server won't let it."

The deeper version of this insight: every "let the LLM just generate X and run it" architecture is fine in single-user contexts and dangerous in multi-user ones. SQL is the obvious example. Generating shell commands, generating API requests, generating Terraform — same shape, same trade-off. MCP is one specific answer to "how do you let an LLM affect multi-user systems safely"; the answer always involves a constrained, schema-validated tool layer somewhere.

---

<a id="q6"></a>

## Q6 — Can I just have `.md` files that tell the LLM which existing service to call?

### TL;DR

This is the **smart refinement** of Q4 and Q5: instead of putting prose or SQL in `.md` files, point the LLM at your existing service-layer functions (`leaderboardService.getTopFive(teamId)`, etc.). It's the right intuition — but it's also **MCP, just unstructured**. You've climbed the abstraction ladder and arrived at the layer MCP formalizes. The remaining gap is small but load-bearing: you still need a structured tool layer that validates input, enforces auth, and constrains output. That layer is what MCP _is_.

### What you're proposing

```
.md files describe routing:
  ├── leaderboard-top5.md  → "call leaderboardService.getTopFive(teamId)"
  ├── readiness.md         → "call statsService.computeReport(userId, teamId)"
  └── revoke-token.md      → "call mcpTokensService.revoke(jti)"

LLM reads .md → picks the right service → executes it
```

This is much better than the SQL version (Q5) because:

- **Multi-tenancy is already baked in** — services are called from controllers that pass `req.teamId`; you don't depend on the LLM remembering to add a WHERE clause
- **Services have typed signatures** — input validation is partially handled
- **No schema drift** — services and schema move together (they're in the same repo)
- **Auth checks already live inside service code** — many services do their own permission checks

You've absorbed the "don't let the LLM compose SQL" lesson and reached for the right abstraction. **The remaining gap is just one piece**, but it's the one that everything depends on.

### The piece that's still missing

The same problem as Q5: **the LLM cannot execute JavaScript by itself.** To call `leaderboardService.getTopFive(teamId)`, something has to:

1. Receive that intent from the LLM
2. Look up the service module
3. Validate the arguments
4. Run it inside a request context that has `userId` / `teamId` / `auth`
5. Validate the output before returning to the LLM

That "something" is a tool. So your architecture really looks like:

```
.md files                +    a generic call_service(name, args) tool
("this is the service")        (executes whatever the LLM names)
```

Now think about step 4 — running with the right auth context. The "generic invoker" needs to know:

- Who is calling? (auth)
- What's their team? (multi-tenancy)
- Are they allowed to call THIS service with THESE args? (authz)
- What fields can come back? (output schema)

If you encode all of those as additional `.md` instructions, you're asking the LLM to enforce auth as a checklist. Same failure modes as Q5 — sometimes the LLM forgets a step.

If you encode them in the invoker code, **the invoker becomes a per-service registration with input validation, auth enforcement, and output schema**. That's MCP.

### Visual — your proposal vs MCP, side by side

```
YOUR PROPOSAL                        MCP

.md file                             registerTool(name, def, handler)
"For the leaderboard, call           ────────────────────────────────
 leaderboardService.getTopFive       description: "Get the team
 (currentTeamId from JWT).           leaderboard..."
 Returns name + score + rank."       inputSchema:  Zod (no args)
                                     outputSchema: Zod (allowlist)
        │                            handler: (args) => {
        │ LLM reads, interprets        const { userId, teamId } =
        ▼                                getMcpContext()       ← auth
                                       return await callController(
generic call_service(...)                getLeaderboard, ...   ← service
        │                              )
        │ "trust the LLM did it      }
        │  right"
        ▼
  Service runs (or doesn't,            ▲
  with whatever auth context           │ Tool description tells LLM
  the LLM happened to set up)          │ WHEN to call.
                                       │ Input schema enforces ARGS.
                                       │ Auth context comes from JWT,
                                       │ not from LLM args.
                                       │ Output schema enforces FIELDS.
```

Both diagrams describe **routing the LLM to the right service**. The difference is what enforces the routing's contract: prose (your version) or schema + auth-context plumbing (MCP).

### Concrete: same code, both shapes

**Your proposal** (`docs/services/leaderboard-top5.md`):

```markdown
# Leaderboard top-5

When the user asks for the leaderboard, call:

leaderboardService.getTopFive(teamId)

Pass the user's currentTeamId from the JWT.
Return columns: name, score, rank.
Don't expose userId or email.
```

**What this codebase actually has** (`server/src/mcp/tools/teamLeaderboard.js`):

```js
server.registerTool(
  "get_team_leaderboard",
  {
    description:
      "Get the team's full leaderboard — ranked members with scores, " +
      "streaks, pattern coverage, and top strengths. Use to answer " +
      "'where do I rank on my team?'.",
    inputSchema: z.object({}).strict(),
    outputSchema: entrySchema,  // allowlist: rank, display_name, score, ...
  },
  async () => {
    const { userId, teamId } = getMcpContext();          // ← auth from JWT
    if (!teamId) return { isError: true, content: [...] };
    const captured = await callController(getLeaderboard, {
      user: { id: userId, currentTeamId: teamId, ... },
      teamId,
    });
    return { content: [{ type: "text", text: JSON.stringify(out) }] };
  },
);
```

These are **doing the same job**:

- Both say "this is the routing for 'fetch the leaderboard'"
- Both reference the existing service / controller
- Both pass user context

The difference: your `.md` is **prose the LLM has to interpret correctly every time**. The MCP tool is **code the LLM cannot misinterpret** — the input schema rejects bad args, the output schema rejects bad fields, the context propagation is automatic, the description tells the LLM _when_ to call it.

**The `description` field in `registerTool` is your `.md`. It's just been moved next to the code, with a structured envelope around it.**

### Where this idea is legitimately useful

Your `.md`-as-routing instinct DOES have a real home, just not as a replacement for MCP tools. It's called **agent skills** (or playbooks, or slash-command workflows):

```markdown
# .claude/commands/debug-readiness.md

Step 1: call get_readiness_report
Step 2: for each dim with status='inactive', call get_dim_breakdown
Step 3: synthesize what's blocking the user from Tier 2
Step 4: suggest 2 concrete actions, citing actual numbers from step 1
```

This `.md` doesn't replace tools — it **orchestrates them**. The LLM still calls `get_readiness_report` (an MCP tool) and `get_dim_breakdown` (another MCP tool); the `.md` just describes the multi-tool workflow that produces a useful answer.

Claude Code supports this via `.claude/commands/`. Cursor supports it via custom rules. Continue supports it via slash commands. **It's a real pattern that sits ON TOP of MCP, not next to it.** Tools do the calling; skills compose them.

### Verdict — how relevant is your idea?

| Your `.md`-points-at-services idea, used as…        | Relevance                                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A replacement for MCP tools                         | **Not relevant** — you've described MCP without the structure that makes it safe                                              |
| Documentation that points at services               | **Marginal** — the MCP tool's `description` field already does this, in the right place (next to the code, in source control) |
| Workflow orchestration over multiple existing tools | **Highly relevant** — this is the "skill / playbook / command" pattern that **complements** MCP                               |

Two-line summary of where your thinking has landed:

1. **For invoking individual services**: MCP is the structured version of your `.md` idea. Use it.
2. **For chaining services into workflows**: That's where `.md` files (skills/commands) actually shine. Build them on top of MCP, not instead of it.

### How this codebase does it

We chose MCP for service routing. Each MCP tool in `server/src/mcp/tools/` is essentially a thin wrapper that:

- Carries the prose ("when to call this") in the `description` field
- Validates input via a Zod schema
- Pulls auth from the JWT context (not from LLM args)
- Calls the existing controller / service code
- Validates output via another Zod schema

We don't yet have agent-skill `.md` files for orchestrating multi-tool workflows, but that would be the natural place to use the `.md`-as-routing pattern — and would slot in cleanly without disturbing the MCP layer.

### Try this yourself

Look at any tool in `server/src/mcp/tools/`. Mentally extract the `description` field, paste it into a fresh `.md` file. Now compare:

- Your `.md` says "when X, call Y." That's the description.
- Your `.md` says "make sure to pass the user's teamId." That's `getMcpContext()`.
- Your `.md` says "only return these fields, not those." That's the output schema.
- Your `.md` says "validate the args first." That's the input schema.

Each thing the `.md` would have asked the LLM to remember is encoded as code in the MCP tool. Same intent, structurally enforced.

### When this comes up (use cases)

- **"I have an MVC codebase and want LLM access to my services"** — wrap each callable service as an MCP tool. The wrappers are ~30 lines each (see `server/src/mcp/tools/*.js` for examples).
- **"I want to compose multiple service calls into a workflow"** — that's a skill/playbook (`.claude/commands/*.md` or your client's equivalent), built on top of MCP tools.
- **"My team has 50 services; do I really need 50 MCP tools?"** — probably not 50; pick the ones that make sense to expose to LLM users. MCP tools should be **user-meaningful capabilities**, not 1:1 with internal services. (Internal helpers stay internal; the LLM only needs to know about top-level use cases.)

### Trap for newcomers

Believing that you can refine prose-based routing enough to make it safe. Each refinement (raw SQL → service-layer references → typed signatures → workflow descriptions) gets closer to safety, but **none of them cross the structure boundary by themselves**. The moment you write down the input contract + output contract + auth-context propagation rule, you've written an MCP tool. There's no middle ground where prose alone provides MCP-level guarantees.

The deeper meta-lesson across Q4 / Q5 / Q6: **structured tools and natural-language instructions solve different problems and you always need both.** Tools are the _verbs_ you let the LLM execute. Instructions/skills are the _strategy_ describing when to combine which verbs. You build the verbs first (with structure), then layer the strategy on top (with prose).

---

<a id="glossary"></a>

## Glossary

| Term                                       | Definition                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP**                                    | Model Context Protocol. An open spec by Anthropic for exposing tools/resources/prompts to LLM clients in a standardized way. Lets one LLM client (Claude Code) talk to many backends (Linear, Notion, your custom server) through a single protocol.                                                                                                                                                       |
| **MCP server**                             | A backend process that speaks the MCP protocol, usually over HTTPS. Hosts tools (functions the LLM can call), prompts (templated conversation starters), resources (read-only data the LLM can fetch).                                                                                                                                                                                                     |
| **MCP client**                             | The LLM-side program that knows how to consume MCP servers. Examples: Claude Code, Cursor, Continue, Claude Desktop.                                                                                                                                                                                                                                                                                       |
| **Bearer token**                           | A long opaque string the client sends in the `Authorization: Bearer <token>` HTTP header. The server validates it and grants access. Like a hotel key card — possessing it is sufficient.                                                                                                                                                                                                                  |
| **JWT (JSON Web Token)**                   | A specific bearer-token format. Self-contained: contains the user identity + scope + expiry signed by a server-side secret. Server validates by checking the signature; doesn't need a DB lookup per request (though a revocation list is usually checked too).                                                                                                                                            |
| **Scope**                                  | A field inside the JWT declaring what the token is allowed to do (`mcp:read`, `admin`, etc.). Prevents a token meant for one purpose from being reused for another.                                                                                                                                                                                                                                        |
| **Vector embedding**                       | A fixed-length array of floats (typically 384–3072 dimensions) representing a piece of content's "meaning." Generated by an embedding model. Two semantically similar texts have nearby vectors; you find similar content by nearest-neighbor search.                                                                                                                                                      |
| **Vector database / pgvector**             | A DB optimized for nearest-neighbor queries on embedding vectors. pgvector is a Postgres extension that adds a `vector(N)` column type and the indexes (HNSW, IVFFlat) that make NN search fast.                                                                                                                                                                                                           |
| **HNSW**                                   | "Hierarchical Navigable Small World" — a graph-based index that gives sub-linear approximate-nearest-neighbor search. The standard choice for vector DBs.                                                                                                                                                                                                                                                  |
| **RAG (Retrieval-Augmented Generation)**   | The pattern of (1) embedding the user's query, (2) finding similar documents in a vector DB, (3) feeding those documents as context into the LLM, (4) generating an answer grounded in retrieved content.                                                                                                                                                                                                  |
| **Prompt caching**                         | Provider-side feature that caches the prefix of an LLM prompt for ~5 minutes so subsequent requests with the same prefix are cheaper. Not the same as caching the _response_.                                                                                                                                                                                                                              |
| **Multi-tenancy**                          | The architectural pattern where one server instance serves multiple isolated "tenants" (teams, organizations, customers). Every database query must filter by tenant ID; failure to do so is the most common security bug in SaaS apps.                                                                                                                                                                    |
| **Tool call**                              | When an LLM emits a structured request asking the client to run a function (with named arguments) and feed the result back. The LLM doesn't actually execute anything — it just asks.                                                                                                                                                                                                                      |
| **Tool description**                       | The prose string set when registering a tool (e.g. `server.registerTool(name, { description: "Get the team leaderboard..." })`). This is what the LLM reads to decide when to call the tool — replaces the need for a separate `.md` file.                                                                                                                                                                 |
| **Output schema**                          | A schema (typically Zod) declaring exactly which fields a tool's response can contain. The server validates output against this schema before returning. Acts as a privacy / safety guarantee — fields not in the schema can't accidentally leak.                                                                                                                                                          |
| **System prompt**                          | The initial instructions sent to the LLM that establish its role and rules. Usually fixed for an app. Distinct from user messages.                                                                                                                                                                                                                                                                         |
| **Instructions / agent rules**             | Files like `CLAUDE.md`, `.cursorrules`, `.continue/config.ts` that ride along on every LLM request and tell the LLM about project-specific conventions. Loaded into context at session start; cost tokens on every request.                                                                                                                                                                                |
| **AsyncLocalStorage**                      | A Node.js feature for propagating context (like the authenticated user) through async call chains without threading it manually as an argument. Used in this codebase to make `userId` available to MCP tool handlers without passing `req` everywhere.                                                                                                                                                    |
| **Streamable HTTP**                        | The MCP transport that uses regular HTTP requests + Server-Sent Events for streaming. The other option is stdio (used for subprocess-based MCP servers).                                                                                                                                                                                                                                                   |
| **Pre-push hook**                          | A Git hook that runs before `git push` and aborts the push on failure. This codebase uses `.githooks/pre-push` to run lint + tests + npm audit + build, catching bugs before they leave the developer's machine.                                                                                                                                                                                           |
| **Live data**                              | Data that reflects current state at the moment the query is made. Opposed to "static" data (the codebase, documentation, last week's snapshot). Live data requires a real-time path to the source of truth — usually the database.                                                                                                                                                                         |
| **Text-to-SQL**                            | The pattern of asking an LLM to translate a natural-language question into a SQL query. Works for prototypes and supervised contexts (where a human approves the query). Hard to make production-safe in a multi-user setting because LLM-generated SQL is non-deterministic and unconstrained.                                                                                                            |
| **Named query / stored template**          | A SQL query stored in a file (or DB) with a fixed shape and parameters; the server compiles it at startup into a callable function. The LLM invokes it by name with arguments, never composes the SQL itself. Pairs naturally with MCP — the named query is the body of an MCP tool.                                                                                                                       |
| **Prepared statement**                     | A SQL query parsed and planned by the database once, then re-executed many times with different parameter values. Faster than re-parsing, and immune to SQL injection because parameters are bound, not interpolated.                                                                                                                                                                                      |
| **Run-anything tool**                      | A tool with very broad authority — `run_sql(query)`, `run_shell(cmd)`, `eval(code)`. Easy to design; impossible to secure in a multi-user product because the safety boundary is "trust the LLM to pass safe input." Always replaceable with a set of narrow tools that constrain what's possible.                                                                                                         |
| **Agent skill / playbook / slash command** | A `.md` file (or equivalent) that describes a multi-step workflow combining existing tools. Examples: `.claude/commands/*.md`, Cursor custom rules, Continue slash commands. Sits **on top of** MCP/built-in tools — the LLM still uses tools to execute steps; the skill describes which steps to take in what order. Useful when one user-intent maps to several tool calls. Does **not** replace tools. |
| **Service-layer routing**                  | A common (and ultimately incorrect) intuition: write prose `.md` files that name an existing JS/TS service function for the LLM to call. Sounds tighter than raw SQL but still requires a generic invoker tool, at which point you've reinvented MCP without its safety layers. The right version of this idea is to wrap each service as an MCP tool with input/output schemas.                           |

---

<a id="how-to-add"></a>

## How to add to this doc

When a new "wait, how does X actually work?" question comes up:

1. Add a row to the **Table of contents** under the right topic group, with an anchor `<a id="qN"></a>`.
2. Write the entry following the same structure (each subsection is required unless it doesn't apply):
   - **Question** (phrased generally, not specific to one user)
   - **TL;DR** (1–2 sentences — what to remember if you only read one line)
   - **The full picture** (the explanation; use concrete examples)
   - **Visual** (ASCII diagram, table, or comparison if it helps. Skip if pure prose is clearer.)
   - **How this codebase does it** (file refs, so the reader can verify)
   - **Try this yourself** (a verifiable observation — pasting a curl, opening DevTools, etc.)
   - **When this comes up** (real scenarios where this question shows up — helps the reader recognize the situation)
   - **Trap for newcomers** (the most common wrong answer)
3. Add any new jargon to the **Glossary**.

If a question turns out to deserve a full build note (because answering it taught you something architecturally important), promote it: write the note in `docs/ai-engineering/NN-some-topic.md` and link from this FAQ. The FAQ stays scannable; the build notes go deep.

The goal: by the time a learner has read this whole doc, they should be able to read the rest of `docs/ai-engineering/` without getting tripped up on jargon or "wait, why?" moments. Add to it whenever you notice yourself explaining the same thing twice.

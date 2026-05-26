# Agent Tooling Reference

A working guide to **how LLMs talk to external systems** — MCP, tool calling, LangChain, LangGraph — with concrete examples from this codebase. Written as a learning reference: explain the concept first, then show how it shows up here, then link to canonical sources.

> **Last updated**: 2026-05-26 — when D10 + roadmap entry shipped, before Phase MCP-1 starts.

---

## Table of contents

1. [Why this doc exists](#why-this-doc-exists)
2. [Foundation — what is "tool calling" in LLMs?](#foundation--what-is-tool-calling-in-llms)
3. [The four ecosystems compared](#the-four-ecosystems-compared)
4. [Model Context Protocol (MCP) — deep dive](#model-context-protocol-mcp--deep-dive)
5. [LangChain — what it is and why we don't use it](#langchain--what-it-is-and-why-we-dont-use-it)
6. [LangGraph — what it is and why we don't use it](#langgraph--what-it-is-and-why-we-dont-use-it)
7. [Why we chose MCP for this project](#why-we-chose-mcp-for-this-project)
8. [Architecture decision log](#architecture-decision-log)
9. [Security threat model](#security-threat-model)
10. [Phase plan summary](#phase-plan-summary)
11. [Glossary](#glossary)
12. [Further reading](#further-reading)

---

## Why this doc exists

This project is shipping an **MCP server** (Phase MCP-1 starting now). MCP is one of several technologies that let an AI assistant talk to external systems. The others — LangChain, LangGraph, raw OpenAI tool calls — solve overlapping problems with different trade-offs.

If you're new to this space, the names blur together. This doc separates them, tells you which one we use here and why, and gives you enough mental model to read the codebase.

If you only have time for one section: read [Foundation](#foundation--what-is-tool-calling-in-llms) and [Why we chose MCP](#why-we-chose-mcp-for-this-project).

---

## Foundation — what is "tool calling" in LLMs?

### The problem

Out of the box, an LLM is a function: text in, text out. It can't:

- Read your database
- Send an email
- Look up today's weather
- Submit your code for review

It only knows what was in its training data. If you ask it "what's my D1 score?" it has no idea — Binary Thinkers didn't exist when it was trained, and even if it did, your account is yours.

### The mechanism

Modern LLMs (GPT-4, Claude 3+, Gemini, etc.) support **tool calling** (sometimes called function calling). The flow:

```
1. You declare available tools to the LLM:
   "There's a function get_readiness_report() that returns the user's 10D scores."

2. User asks: "How's my pattern recognition?"

3. LLM responds with structured JSON instead of plain text:
   { "tool": "get_readiness_report", "arguments": {} }

4. Your code receives that JSON, runs the actual function, gets the data.

5. You feed the result back to the LLM:
   "Tool returned: { D1: { score: 27, n: 3, ... } }"

6. LLM now writes the answer using the real data:
   "Your Pattern Recognition is at 27/100 — let me explain what that means..."
```

The LLM doesn't actually call anything. It just produces structured intent. **Your code is the bridge** between the LLM's intent and the real world.

### Where this lives in our codebase today

We already use tool calling extensively in the existing AI features — but at the **OpenAI SDK level**, not via MCP:

- `server/src/services/interview.engine.js` — mock interview AI calls tools like `getInterviewState`, `getDesignWorkspace`, `recordHint`
- `server/src/services/designStudio.controller.js` — design coach uses `validate` / `guide` / `teach` tool modes

The pattern is: we hand a tool schema to OpenAI's API, OpenAI's model emits a tool-call JSON, we execute it, we feed the result back. **MCP standardizes this protocol** so any client (not just our own code) can discover and call our tools.

### Why this matters for MCP

MCP is the **distribution layer** for tool calling. Our existing tool calls only work inside our own server. With MCP, a user running Claude Code in their terminal can call the same tools — because Claude Code speaks MCP.

It's the difference between:
- **Today**: only the Binary Thinkers backend can call `get_readiness_report` (internal API)
- **With MCP**: any MCP-compatible LLM client can call `get_readiness_report` — Claude Code, Cursor, ChatGPT, VS Code, Continue, custom agents

---

## The four ecosystems compared

Four overlapping things you'll hear about. Here's the cheat sheet:

| Tech | What it is | Maintained by | When you'd use it |
|---|---|---|---|
| **Raw OpenAI tools** | The OpenAI SDK's `tools` parameter on chat completions | OpenAI | You only need tool calls inside your own backend, talking to OpenAI's API |
| **MCP** | Open protocol for LLMs to discover + call tools across processes | Anthropic + open-source | You want any LLM client (Claude Code, ChatGPT, Cursor) to use your tools |
| **LangChain** | Python/JS framework for building LLM apps with reusable building blocks | LangChain Inc. | You want a high-level abstraction layer over many LLM providers + tool patterns |
| **LangGraph** | LangChain's graph-based state machine for multi-step agent workflows | LangChain Inc. | You're building complex agents with branching, retries, human-in-the-loop |

### Quick mental model

- **Raw tool calls** → narrow, vendor-specific, your code is the only consumer.
- **MCP** → standardized, any client can use it, **distribution-focused**.
- **LangChain** → opinionated framework, lots of pre-built integrations, **abstraction-focused**.
- **LangGraph** → state-machine-based agents, **orchestration-focused**.

These can be combined (you can use LangGraph to orchestrate calls to MCP servers, for example). But they solve different problems.

---

## Model Context Protocol (MCP) — deep dive

### Origin

MCP was [open-sourced by Anthropic in November 2024](https://www.anthropic.com/news/model-context-protocol) as a vendor-neutral standard. Think USB-C for AI: any compliant client can talk to any compliant server. The spec lives at [modelcontextprotocol.io](https://modelcontextprotocol.io/).

By mid-2025 the major LLM clients had all adopted it: Claude Code, Claude Desktop, ChatGPT, Cursor, VS Code Copilot Chat, Continue, MCPJam, and a [growing ecosystem](https://modelcontextprotocol.io/clients).

### Three primitives

An MCP server can expose three things ([spec](https://modelcontextprotocol.io/docs/learn/server-concepts)):

#### 1. Resources

**File-like read-only data with addressable URIs.**

Example for our project:
```
readiness://my-report          → the user's full 10D Intelligence Report (JSON)
readiness://my-patterns        → pattern mastery matrix (JSON)
readiness://my-queue           → SM-2 overdue items
```

The LLM can request resources by URI. Resources are **passive** — the LLM doesn't "do" anything by reading one, it just gets context.

Best for: **stable data the LLM might want as context**.

#### 2. Tools

**Functions the LLM can call (with user approval).**

Example:
```js
get_readiness_report()                    → returns the same data as the resource above
get_dim_breakdown(dim_key: "patternRecognition") → returns one specific dim
get_recommended_problems(count: 3)        → returns 3 problems tailored to the user
```

Tools are **active** — the LLM is invoking a function. MCP clients (Claude Code, Cursor, etc.) typically show a confirmation prompt before executing.

Best for: **on-demand queries with arguments**.

#### 3. Prompts

**Pre-written templates.**

Example:
```
/weekly-prep-checkin → loads user's data + formats a guided weekly check-in conversation
/pre-interview-brief → summarizes weakest dims into a 5-min readiness brief
/pattern-deep-dive(pattern: "Two Pointers") → coaching template using the pattern matrix
```

Prompts are **conversation starters** — the user invokes them like a slash command, the server returns a primed system message + initial user message that gets the conversation going on the right foot.

Best for: **templated workflows** the user does often.

### Two transports

MCP servers can be reached two ways:

#### stdio (local subprocess)

Client launches the server as a child process. Communication via stdin/stdout. JSON-RPC messages.

```
Client (Claude Code)
   ↓ (spawns)
   Server process
   ↓ (stdout JSON-RPC)
   Client
```

**When to use**: local-first servers (offline tools, reading user's filesystem, pre-bundled npm packages).

#### Streamable HTTP (remote)

Server runs as a long-lived HTTP service. Client makes POST + GET requests to a single endpoint (e.g. `https://probsolver-api.up.railway.app/mcp`).

```
Client (Claude Code)
   ↓ HTTPS POST  /mcp + JSON-RPC body
   Server (Railway)
   ↓ HTTPS response (JSON or SSE stream)
   Client
```

This **replaced** the older HTTP+SSE transport in spec version 2025-06-18.

**When to use**: SaaS like ours. Centralized auth, no install required, easier to update.

### Adding an MCP server (user perspective)

```bash
# Claude Code:
claude mcp add binary-thinkers https://probsolver-api.up.railway.app/mcp \
  --header "Authorization: Bearer <token>"

# Cursor: settings → MCP → add server (URL + token)
# VS Code: command palette → "MCP: Add Server" → enter URL + token
# ChatGPT: settings → connectors → add custom MCP
# Claude Desktop: settings → developer → MCP servers → JSON config
```

Once added, the LLM client introspects the server (`tools/list`, `resources/list`, `prompts/list`) and surfaces the capabilities to the user.

### Auth

The spec recommends OAuth 2.0 for end-user auth. **Simpler alternative for v1**: bearer tokens.

```
Settings page in your app:
  → User clicks "Generate MCP token"
  → Server creates a 24h JWT scoped to mcp:read
  → User copy-pastes into the `claude mcp add ...` command above
```

Tokens travel in the `Authorization: Bearer <jwt>` header, **never in URL query strings** (per MCP spec security warning — URL params get logged everywhere).

### The TypeScript SDK

Anthropic publishes `@modelcontextprotocol/sdk` (Node + browser). Server-side shape:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const server = new McpServer({
  name: "binary-thinkers",
  version: "1.0.0",
});

server.registerTool(
  "get_readiness_report",
  {
    description: "Get the user's 10D readiness report (D1-D10 scores).",
    inputSchema: {},  // no arguments
  },
  async () => {
    // The auth-validated userId + teamId come from middleware-set request context
    const report = await fetchReportFor(req.user.id, req.teamId);
    return { content: [{ type: "text", text: JSON.stringify(report) }] };
  },
);

const transport = new StreamableHTTPServerTransport({ ... });
await server.connect(transport);
```

That's the shape. Each tool: name, description, Zod schema, async handler.

---

## LangChain — what it is and why we don't use it

### What it is

LangChain is a Python (also TypeScript) framework that gives you reusable "chains" — composable building blocks for LLM apps. A chain is a sequence: prompt → LLM call → output parser → next prompt → another LLM call → etc.

Examples of LangChain components:
- `ChatOpenAI`, `ChatAnthropic` — vendor-neutral LLM wrappers
- `PromptTemplate` — string templating with variable interpolation
- `OutputParser` — convert LLM text into structured data
- `Tool` — an executable function the LLM can call (predates MCP)
- `VectorStore` — abstraction over Pinecone, Chroma, pgvector, etc.
- `Memory` — conversation history management
- `Agent` — wraps an LLM that loops: think → call tool → think → call tool → ...

### Why we don't use it here

CLAUDE.md memory: **"Stay on OpenAI, don't propose Claude/Anthropic"** — and the same principle applies to LangChain. We use the OpenAI SDK directly because:

1. **Less abstraction = less surprise**. A LangChain bug in `ChatOpenAI` is two layers away from the issue. Direct OpenAI calls fail in obvious places.
2. **No framework upgrade churn**. LangChain has shipped breaking changes frequently (~quarterly major versions). Our pinned `openai` SDK changes ~monthly with backward-compat.
3. **We don't need the cross-vendor abstraction**. We're committed to OpenAI. The "switch providers easily" argument is moot.
4. **Tool calling is already a first-class OpenAI feature**. We don't need a wrapper.

LangChain is great for prototyping or for codebases that need to support multiple LLM vendors. We have a focused use case and a stable vendor commitment, so the abstraction is overhead.

### Where you might still see it referenced

- Online tutorials / blog posts about "AI agents" disproportionately use LangChain
- Some research papers prototype agents in LangChain
- Knowledge for completeness: when a job description says "experience with LangChain", they usually mean "you've built an LLM app of any kind"

---

## LangGraph — what it is and why we don't use it

### What it is

LangGraph is LangChain's **state-machine-based agent orchestration framework**. Where LangChain is a library of components, LangGraph is the runtime that wires them together for complex multi-step agents.

Mental model: think of an agent as a graph where each node is a step and each edge is a decision. LangGraph gives you:

- **Stateful nodes**: each step has access to the conversation state + can update it
- **Conditional routing**: "if the user wants X, go to node A; else node B"
- **Loops**: "keep calling the LLM + a tool until the answer is good enough"
- **Human-in-the-loop**: pause for human input mid-graph
- **Checkpointing**: persist state so a workflow can resume after a crash

### Why we don't use it here

Same reasons as LangChain (extra abstraction layer + tied to LangChain ecosystem), plus:

1. Our existing agent flows (mock interview, design coaching) are **linear conversations**, not branching graphs. The interview engine has phases, but they advance forward — no loops, no human-in-the-loop pauses, no conditional routing.
2. We use OpenAI's tool calling natively in those engines. The "agent loop" (call LLM → execute tool → call LLM with result → ...) is ~30 lines in `interview.engine.js` and we can read it without a framework.
3. Adding LangGraph would require migrating to LangChain primitives, which we don't want.

### When LangGraph would make sense

- Building an agent that genuinely branches (e.g. a debugging agent that decides between "search the codebase" / "run the failing test" / "ask the user" at each step)
- Long-running workflows that need durable checkpoints (multi-day async agents)
- Multi-agent systems (one agent coordinates several sub-agents)

We don't have any of those use cases right now.

---

## Why we chose MCP for this project

Three reasons in priority order:

### 1. Distribution to where users already live

Our target users (devs prepping for interviews) spend their day in Claude Code / Cursor / VS Code. They don't context-switch to a web UI mid-coding to check their readiness profile. With MCP, the data flows into their IDE.

This is the kind of value-add that's invisible when you describe it but obvious the moment you experience it. *"Walking through Two Pointers — your D1 mastery shows this is Untouched, so I'll explain the chunk-recognition fundamentals first."* No competitor does this.

### 2. Read-only constraint dramatically simplifies trust

A general MCP server has to answer: *"What if the LLM gets tricked into auto-submitting bad code?"* With our **read-only-only** design, that question doesn't exist. The worst case is "the LLM reads your data" — which is what the user explicitly authorized.

This compresses the security surface from "every action is a potential attack vector" to "every read is a potential leak vector" — and we already have the multi-tenancy filtering machinery to prevent leaks.

### 3. Standardization without commitment

The MCP spec is open. If Claude Code disappears tomorrow, our MCP server still works with Cursor, VS Code, ChatGPT, Continue. No vendor lock-in. This is the same logic as "use REST instead of a vendor-specific RPC framework" — bet on the open standard.

---

## Architecture decision log

Lock these and they don't get re-litigated.

### Decision 1: Read-only only (no write tools)

**Status**: Locked.

**Why**: Privacy + security are the project's stated #1 priority. Eliminating mutation operations cuts the threat surface in half and removes the LLM-trust question entirely.

**Implication**: No `submit_solution`, `submit_review`, `take_quiz`, `schedule_mock`, etc. Those stay in the web/REST UI only. If users demand write tools later, that's a future scope — not v1.

### Decision 2: Streamable HTTP transport (not stdio)

**Status**: Locked.

**Why**: We're a SaaS. Streamable HTTP gives us:
- Centralized auth (one source of truth — the JWT)
- No client-side install (lower friction for adoption)
- Easy server-side updates (no per-user `npm update`)
- Works in cloud-hosted clients (ChatGPT can't run a stdio binary)

**Implication**: The server is just another Express route at `/mcp`. No separate process, no separate deployment. Same Prisma client, same multi-tenancy middleware, same logger.

### Decision 3: Bearer token auth (not OAuth 2.0) for v1

**Status**: Locked.

**Why**: Bearer tokens are simpler to ship (~3 days less work). User generates a 24h token from their settings page, copy-pastes into `claude mcp add ... --header "Authorization: Bearer <token>"`. Spec-compliant.

**Implication**: Slightly worse first-run UX vs OAuth (user has to manually paste a token). Can always add OAuth in a follow-on if user demand surfaces.

**Future**: OAuth 2.0 is on the deferred list — `mcp-server-oauth-flow` roadmap entry post-v1.

### Decision 4: Token expiry default 24h, max 30d

**Status**: Locked.

**Why**: Cap blast radius without being annoying. Combined with always-on revocation (via the `RevokedMcpToken` table), a leaked token is invalidatable instantly *and* expires within a day automatically.

**Implication**: Power users who want set-and-forget can extend to 30d in advanced settings. Default is conservative.

### Decision 5: Separate JWT scope (`mcp:read`)

**Status**: Locked.

**Why**: A leaked MCP token shouldn't be usable as a web JWT (which has full read-write scope). And vice versa — if someone steals the web JWT from localStorage, they shouldn't suddenly be able to query MCP either, since web JWTs don't carry the `mcp:read` scope.

**Implication**: Web auth middleware rejects any JWT with the `scope` claim set. MCP middleware rejects any JWT without `scope: "mcp:read"`. Clean separation.

### Decision 6: Reuse existing JWT secret + Prisma client

**Status**: Locked.

**Why**: One secret, one identity store, one multi-tenancy filter. No duplication.

**Implication**: All security work that already exists (JWT lib, `authenticate` middleware, `req.teamId` filter convention) is leveraged directly. The MCP server is "an Express route that speaks MCP" — not a separate service.

### Decision 7: Pin SDK version exactly (not `^X.Y.Z`)

**Status**: Locked.

**Why**: Supply-chain attack via SDK update is a real threat. Pinning prevents auto-upgrade. Manual review on each version bump.

**Implication**: Slight maintenance overhead (we have to bump the version manually). Worth it.

---

## Security threat model

Full table from the design discussion. **Every defense must have a corresponding test fixture before the MCP endpoint is enabled in production.**

| # | Threat | Severity | Defense | Test fixture |
|---|---|---|---|---|
| 1 | Stolen JWT (logged URL, malicious extension) | Critical | Bearer in header only; short-lived MCP-scoped token; `jti` revocation list | Revoked JWT → 401 |
| 2 | Cross-tenant data leak | Critical | `req.teamId` filter on every Prisma query; ESLint rule enforces | Cross-tenant ID injection → 403 |
| 3 | Prompt injection (user content escaping into LLM context) | High | XML-tag wrap user content + HTML escape + truncation | User content with `<system>` tags → wrapped + escaped |
| 4 | DNS rebinding (MCP-specific) | High | `Origin` header allowlist | Origin spoofing → 403 |
| 5 | TLS downgrade / SSL strip | High | HTTPS-only + HSTS preload | HTTP request → 403 |
| 6 | DoS via huge payloads | Medium | 60 req/min/user, 600 req/min/IP, 100KB max body, 10s timeout | Oversized body → 413; flood → throttle |
| 7 | Supply chain (compromised SDK) | Medium | Pinned exact SDK version + `npm audit` on pre-push | npm audit clean |
| 8 | Compromised MCP client | Medium | All authz server-side; never trust client claims | Server reads `req.user`, ignores body claims |
| 9 | Timing attacks on token compare | Low | `crypto.timingSafeEqual`; rely on JWT lib | (handled by lib) |
| 10 | Header injection / response splitting | Low | Never echo user input into headers; CRLF strip | (passive — no echo paths) |
| 11 | Secrets in logs | High | Pino redaction allowlist | Log capture test asserts no `Authorization` value |
| 12 | Session hijacking | Medium | `Mcp-Session-Id` bound to userId+IP at init | Session-ID swap test → 401 |
| 13 | PII over-disclosure | Medium | Per-tool Zod output schema (response field allowlist) | Output schema validation test |
| 14 | Cross-user enumeration | Medium | All lookups by current user; reject opaque-ID args | ID-injection test |
| 15 | Info leakage via error messages | Low | Generic 503 to client; full stack to logs only | Error response test |

---

## Phase plan summary

| Phase | Scope | Effort |
|---|---|---|
| MCP-1 | Foundation + security middleware + skeleton + security test suite | 1.5 weeks |
| MCP-2 | 8 read tools + per-tool tests | 1 week |
| MCP-3 | 4 prompt templates | 3 days |
| MCP-4 | Token UX (settings page) + diagnostics + docs page | 1 week |
| MCP-5 | Hardening review + super-admin canary + GA | 3 days |
| **Total** | | **~4 weeks** |

**Rollout**: `FEATURE_MCP_ENABLED=false` default → super-admin canary → general availability after one week clean.

---

## Glossary

| Term | Definition |
|---|---|
| **Tool calling** | The general mechanism where an LLM emits structured intent (JSON) describing a function to call, and a separate runtime executes it and feeds the result back. |
| **MCP** | Model Context Protocol. Open spec by Anthropic for standardized tool/resource/prompt exposure to LLM clients. |
| **MCP server** | Process exposing tools/resources/prompts via the MCP protocol. |
| **MCP client** | LLM application (Claude Code, Cursor, etc.) that consumes MCP servers. |
| **Resource (MCP)** | Read-only addressable URI (e.g. `readiness://my-report`) the LLM can request as context. |
| **Tool (MCP)** | Callable function with a JSON schema. The LLM emits a tool-call request; the server executes; the result returns to the LLM. |
| **Prompt (MCP)** | Pre-written conversation template the user invokes (often via slash command) to start a guided workflow. |
| **stdio transport** | MCP transport where the client launches the server as a subprocess and communicates via stdin/stdout. |
| **Streamable HTTP transport** | MCP transport over HTTP. Single endpoint accepts POST (JSON-RPC requests) and GET (SSE for server-to-client streaming). Modern replacement for HTTP+SSE. |
| **JSON-RPC** | The wire format MCP uses. Lightweight RPC over JSON. |
| **`Mcp-Session-Id`** | Optional HTTP header MCP servers can use to track multi-request sessions over Streamable HTTP. |
| **Bearer token** | Auth pattern where the client sends `Authorization: Bearer <token>` on every request. The "bearer" of the token is treated as authenticated — no other proof required. |
| **OAuth 2.0** | Standardized auth flow involving redirect to an authorization server, user consent, and exchange for an access token. More complex than bearer; better UX for first-run. |
| **JWT (JSON Web Token)** | Self-contained signed token. Carries claims (userId, scope, expiry) signed by the server. Stateless — server can verify without DB lookup. |
| **`jti`** | "JWT ID" claim — a unique identifier per token. Used here for revocation lookup. |
| **Scope** | A permission claim on a JWT. We use `mcp:read` to mark tokens issued for MCP use only. |
| **DNS rebinding attack** | Attack where a malicious site tricks a victim's browser into making requests to localhost or other internal addresses by manipulating DNS resolution. MCP spec specifically warns about this. |
| **Multi-tenancy** | Architectural pattern where one application instance serves multiple isolated customers (teams). Filtering by `teamId` on every query is how isolation is enforced in this codebase. |
| **LangChain** | Python/JS framework providing reusable components for LLM apps (prompts, parsers, tools, chains). Vendor-neutral. We don't use it. |
| **LangGraph** | LangChain's state-machine-based agent orchestration framework. We don't use it. |

---

## Further reading

### MCP

- [modelcontextprotocol.io/introduction](https://modelcontextprotocol.io/introduction) — start here
- [modelcontextprotocol.io/docs/learn/server-concepts](https://modelcontextprotocol.io/docs/learn/server-concepts) — Resources/Tools/Prompts deep dive
- [modelcontextprotocol.io/docs/concepts/transports](https://modelcontextprotocol.io/docs/concepts/transports) — stdio + Streamable HTTP spec
- [modelcontextprotocol.io/docs/develop/build-server](https://modelcontextprotocol.io/docs/develop/build-server) — TypeScript + Python tutorials
- [modelcontextprotocol.io/clients](https://modelcontextprotocol.io/clients) — full list of MCP clients
- [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — official Node SDK source
- [Anthropic MCP launch blog](https://www.anthropic.com/news/model-context-protocol) — context

### Tool calling fundamentals

- [OpenAI function calling guide](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic tool use guide](https://docs.claude.com/en/docs/build-with-claude/tool-use)

### LangChain / LangGraph (for completeness)

- [langchain.com](https://www.langchain.com/) — official site
- [LangChain JS docs](https://js.langchain.com/)
- [LangGraph docs](https://langchain-ai.github.io/langgraph/)

### Security references

- [OWASP Top 10 LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — prompt injection + others
- [MCP transport security warning](https://modelcontextprotocol.io/docs/concepts/transports) — DNS rebinding, origin validation

### Related project docs

- `CLAUDE.md` — project-level guidance, especially the AI layer + multi-tenancy sections
- `docs/mcp-integration.html` — older MCP proposal (some context preserved; this MD doc supersedes for v1 design)
- `docs/ai-learning-roadmap.md` — broader AI learning path

---

## Maintenance notes

This doc is hand-maintained — when MCP shipping decisions change, update the **Architecture decision log** section. When threats are discovered or mitigated, update the **Security threat model** table. New phases should be added to the **Phase plan summary**.

If you're a future contributor wondering "do we use LangChain?" — the answer is no, and the rationale is in this doc.

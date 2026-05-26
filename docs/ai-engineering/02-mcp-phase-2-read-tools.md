# Phase MCP-2 — Read tools (the actual functionality)

> **Status**: ✅ Batches 1 + 2 shipped + verified end-to-end on 2026-05-26.
> 7 tools live (`get_readiness_report`, `get_pattern_matrix`, `get_review_queue`, `get_dim_breakdown`, `get_recommended_problems`, `get_team_leaderboard`, `get_calibration_status`).
> 1 tool deferred: `get_weekly_plan` — current controller calls OpenAI on every invocation, would burn AI quota for every "let me check" thought from the LLM. Right shipping shape needs cache-first read + quota gate + streaming. Tracked as a follow-up.
> End-to-end verified by invoking `weekly-prep-checkin` (Phase MCP-3 prompt) which transparently called 6 of these tools across one conversation turn — the LLM produced a calibrated coaching response grounded in real Binary Thinkers team data.
>
> **Prerequisite**: read [`01-mcp-phase-1-foundation.md`](./01-mcp-phase-1-foundation.md) first. This note assumes the security middleware + auth chain are in place; MCP-2 plugs the actual tools into them.

## Quick reference

```
- Phase:         MCP-2 (read tools)
- Status:        Batch 1 shipped 2026-05-26 (3 tools); batch 2 in-progress
- Theme:         AI & Intelligence + Trust & Truth
- One-line goal: Register 8 read-only tools so MCP clients can query D1-D10 data, pattern matrix, review queue, recommendations, leaderboard.
- Key concepts:  AsyncLocalStorage, capture-res shim, stateless transport, per-request server isolation, Zod input + output schemas
- Stack added:   AsyncLocalStorage usage, no new dependencies
- Effort:        M (≈ 3 hours of focused work + ~2 hours of debugging the stateful-vs-stateless bug + Claude Code scoping UX)
- Dependencies:  Phase MCP-1 (auth chain + middleware) + existing controllers (get6DReport, getLeaderboard, etc.)
- Rollback:      Tools are flag-gated by FEATURE_MCP_ENABLED. Remove a specific tool by removing its line from src/mcp/tools/index.js — no schema changes needed.
```

---

## What we're building & why

### The user-facing change

Phase MCP-1 had a connected MCP server with `0 tools, 0 resources, 0 prompts`. Cosmetically present but useless — Claude Code couldn't actually do anything with it.

Phase MCP-2 plugs in the actual queries. After this ships, asking Claude Code:

> _"What's my readiness profile?"_

routes to `get_readiness_report` and returns the user's real D1-D10 scores, tier readiness, and dim breakdown. The LLM then composes a natural-language answer grounded in real numbers.

The 8 planned tools (3 in batch 1, 5 in batch 2):

| #   | Tool                              | What it answers                           |
| --- | --------------------------------- | ----------------------------------------- |
| 1   | `get_readiness_report`            | "How am I doing overall?"                 |
| 2   | `get_pattern_matrix`              | "What patterns am I weak on / strong on?" |
| 3   | `get_review_queue`                | "What do I need to review today?"         |
| 4   | `get_dim_breakdown(dim_key)`      | "Tell me more about my D2 score."         |
| 5   | `get_recommended_problems(count)` | "What problem should I solve next?"       |
| 6   | `get_team_leaderboard`            | "Where do I stand vs my team?"            |
| 7   | `get_calibration_status`          | "How calibrated is my self-assessment?"   |
| 8   | `get_weekly_plan`                 | "What's my plan for the week?"            |

### The why-now

We need AT LEAST a meaningful subset of tools shipped before users can derive value from MCP-1's foundation. Three is the minimum viable set: a top-level summary (`get_readiness_report`), a drill-down (`get_pattern_matrix`), and a daily-driver (`get_review_queue`). Without these three, the foundation is just plumbing.

### Non-goals (deliberate)

- **No write tools** — same constraint as MCP-1. Read-only stays read-only.
- **No external API calls from tools** — every tool reads from our DB or computes locally. We don't proxy out to OpenAI / external services. Keeps blast radius contained.
- **No streaming output** — tools return one-shot JSON. Streaming would help for AI-generated outputs (Weekly Plan) but adds protocol complexity. Deferred.

---

## Concept primer

### AsyncLocalStorage (Node)

- **What it is**: Node's standard mechanism for propagating "request-scoped" state through async call chains without threading it manually. Set context in middleware → it's available in handlers, even after `await` boundaries.
- **Why MCP needs it**: The SDK's tool handler signature is `(args) => result` — no `req` argument. Without ALS, handlers can't access the JWT-derived userId/teamId. With ALS, our Express middleware does `mcpContext.run({ userId, teamId, ... }, () => transport.handleRequest(...))` and the handlers read it via `getMcpContext()`.
- **Confusion**: It's NOT thread-local storage. Node is single-threaded. ALS works by tracking the async call chain via `async_hooks` — every `await` / Promise / setTimeout / etc. inherits the current context.
- **Reference**: [nodejs.org/api/async_context](https://nodejs.org/api/async_context.html#class-asynclocalstorage)

### Capture-res pattern

- **What it is**: A stub Express response object that records `res.status(...).json(...)` calls instead of sending HTTP. Lets you call existing HTTP-shaped controllers without an actual HTTP request.
- **Why MCP needs it**: Our controllers like `get6DReport(req, res)` are HTTP-shaped. Refactoring every controller to take `(userId, teamId)` → data would be a rewrite. The shim is a 30-line workaround that lets us reuse them today.
- **The trade-off**: Less elegant than a clean refactor, but ships in 1 day instead of 1 week. We can refactor case-by-case if MCP usage grows.

### Stateless vs stateful MCP transport

- **Stateful** (`sessionIdGenerator: () => uuid()`): Each session has its own state. Server tracks `Mcp-Session-Id` headers. Required if you need server-to-client SSE notifications across requests.
- **Stateless** (`sessionIdGenerator: undefined`): No session tracking. Each request is fully independent. Simpler. Required for our use case (read-only tool calls = pure functions of args + auth context).
- **Critical**: In stateless mode, **create a new `McpServer` + `Transport` per request**. Sharing one globally causes "Server already initialized" errors and concurrent-request ID collisions. This is THE bug that consumed half a day of debugging — see Issue 1 below.

### Tool input/output schema

- **Input schema**: Zod object with `.strict()` — rejects unknown args (e.g. `userId: "spoofed"`). First line of defense against arg-based privilege escalation.
- **Output schema**: Zod object — validates what the handler returns. Acts as a per-tool **field allowlist** (don't accidentally leak internal IDs / PII / large blobs into the LLM context).

---

## Architecture

```
LLM client (Claude Code, Cursor, etc.)
      │ JSON-RPC POST /mcp { method: "tools/call", params: {...} }
      ▼
┌─────────────────────────────────┐
│ Express                         │
│  → mcpOrigin                    │
│  → express.json (100KB)         │
│  → mcpAuth (JWT + scope + jti)  │  sets req.user, req.teamId
│  → mcpRateLimit                 │
│  → handleMcp ─────────┐         │
└────────────────────────┼────────┘
                         │
            ┌────────────▼────────────┐
            │ NEW per-request:        │
            │   McpServer instance    │
            │   StreamableHTTPTransp  │  stateless mode
            │   register all tools    │
            │                         │
            │ mcpContext.run({        │
            │   userId, teamId, ...   │  ← AsyncLocalStorage
            │ }, () => {              │
            │   transport.handleReq() │
            │ })                      │
            └────────────┬────────────┘
                         │ JSON-RPC routes to tool handler
                         ▼
            ┌─────────────────────────┐
            │ Tool handler (e.g.      │
            │   readinessReport.js)   │
            │                         │
            │ const { userId, teamId }│
            │   = getMcpContext()     │  ← reads ALS
            │                         │
            │ if (!teamId) return     │
            │   isError("no team")    │
            │                         │
            │ callController(         │
            │   get6DReport,          │  ← capture-res shim
            │   { user, teamId }      │
            │ )                       │
            │                         │
            │ wrap user fields via    │
            │   wrapUserContent()     │  ← prompt-injection defense
            │                         │
            │ Zod-validate output     │  ← field allowlist
            │                         │
            │ return { content: [...] │
            └─────────────────────────┘
```

The critical design choices:

1. **Per-request server+transport** (not global): isolation between concurrent requests, no shared state pollution. Created fresh in `createServerAndTransport()`, disposed on `res.on("close")`.
2. **ALS for auth context** (not args, not closures): tools read `userId`/`teamId` from `getMcpContext()`. Args from the LLM are never trusted for identity.
3. **Capture-res for controller reuse**: avoid rewriting every controller; lets MCP layer be a thin wrapper.
4. **Zod on both sides**: input validation rejects spoofed args; output validation prevents accidental PII leak.

---

## Decisions log

### Decision 1: Stateless transport, per-request creation

**Status**: Locked.

**Choice**: `sessionIdGenerator: undefined` on the SDK transport. Create a new McpServer + transport pair for every incoming request.

**Why**: Read-only tool calls are pure functions of args + JWT-derived context. We don't need server-to-client SSE notifications across requests. Stateless is simpler. Per-request creation avoids shared-state bugs (see Issue 1).

**Rejected alternatives**:

- Stateful with one global instance — "Server already initialized" on second request. Demonstrably broken.
- Stateful with per-session instances tracked in a `Map<sessionId, transport>` — adds session-state complexity we don't need.

**Cost**: ~1ms per request to construct fresh server + register tools. Trivially acceptable for read-only tool calls.

**Implication**: Future tools that DO need cross-request state (e.g. a long-running computation tracked via SSE) would need to opt into stateful mode separately. Not in v1 scope.

### Decision 2: AsyncLocalStorage for auth context

**Status**: Locked.

**Choice**: Express middleware sets `mcpContext.run({...}, () => transport.handleRequest(...))`. Tool handlers read via `getMcpContext()`.

**Why**: The SDK's tool handler signature is `(args) => result` — no other way to thread auth context through cleanly. ALS is the standard Node pattern for request-scoped state. Already used elsewhere in the Node ecosystem (e.g. Pino logger context).

**Rejected alternatives**:

- Pass auth in args — terrible. Args come from the LLM, untrusted by definition.
- Closure capture — would require rebuilding the McpServer per request to capture context (we DO this for stateless mode anyway, but ALS is cleaner because tool registration shape stays the same).
- Custom middleware that re-binds tool handlers per request — fragile, hard to test.

**Implication**: Every tool handler MUST read auth from `getMcpContext()`. ESLint rule could enforce this; for now it's a convention + test fixture per tool.

### Decision 3: Capture-res shim for controller reuse

**Status**: Locked.

**Choice**: `makeCaptureRes()` + `callController()` — synthetic Express req/res that lets MCP tools call existing HTTP-shaped controllers.

**Why**: 18 existing controllers in `stats.controller.js` alone. Refactoring each to `(userId, teamId) → data` is a multi-day rewrite for marginal benefit. The shim is 30 lines and is precedented (the existing `generateReadinessVerdict` uses the same pattern internally to call `get6DReport`).

**Rejected alternatives**:

- Full refactor of controllers to pure functions — better long-term but blocks MCP-2 by ~5 days.
- Duplicate query logic in MCP tools — nightmare to keep in sync. Rejected immediately.

**Implication**: When a controller's behavior changes, MCP tools that wrap it inherit the change automatically. When MCP needs a slice of data the controller doesn't expose cleanly, we either accept extracting from the full response or refactor that one controller.

### Decision 4: Per-tool Zod output schemas

**Status**: Locked.

**Choice**: Every tool returns a Zod-validated structure — explicit field allowlist.

**Why**: A controller may return more fields than the LLM should see. Without an output schema, every controller change risks leaking new fields into MCP responses (PII, internal IDs, AI prompts, large blobs). The schema is the explicit boundary.

**Rejected alternatives**:

- Just trust the controller — fine for REST consumers but MCP returns flow into LLM context with different security implications (prompt injection, context budget).
- Post-process via custom serializers — same idea, more error-prone.

**Implication**: Adding a new field to the response requires updating the schema. That's the friction we want — adding fields should be a deliberate decision.

### Decision 5: 3-tool minimum viable batch first

**Status**: Locked.

**Choice**: Ship `get_readiness_report` + `get_pattern_matrix` + `get_review_queue` as batch 1. Verify end-to-end. Then add the remaining 5 in batch 2.

**Why**: De-risks. The first batch tests the entire pattern (ALS, capture-res, Zod schemas, registration plumbing). Once one tool works, the rest are mechanical — same shape, different controller.

**Implication**: Slight delivery delay for the user but lower risk of "we wrote 8 tools and 4 don't work for the same reason".

---

## What we built — file by file

| File                                        | Purpose                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/src/mcp/context.js`                 | AsyncLocalStorage for request-scoped auth. `mcpContext` + `getMcpContext()` + `tryGetMcpContext()`.                                                                      |
| `server/src/mcp/utils/captureRes.js`        | `makeCaptureRes()` + `makeCaptureReq()` + `callController()` — call existing HTTP controllers without HTTP.                                                              |
| `server/src/mcp/tools/index.js`             | Tool registry. `registerAllTools(server)` is called from server.js. Includes `withErrorBoundary` wrapper that turns thrown errors into LLM-friendly `isError` responses. |
| `server/src/mcp/tools/readinessReport.js`   | `get_readiness_report` tool. Reuses `get6DReport`. Optional `include_basis`.                                                                                             |
| `server/src/mcp/tools/patternMatrix.js`     | `get_pattern_matrix` tool. 5 filter options (all / faang-core / gaps / in-progress / owned). Slices `d1Score.patternMatrix` from report.                                 |
| `server/src/mcp/tools/reviewQueue.js`       | `get_review_queue` tool. Direct Prisma query (no controller). Limit 1-20. Optional `include_upcoming`.                                                                   |
| `server/src/mcp/server.js` (modified)       | Switched from global cached transport to **per-request `createServerAndTransport()`**. Wraps SDK call in `mcpContext.run()`.                                             |
| `server/scripts/mintMcpToken.js` (modified) | Added `--email=` lookup, `--list` flag, dedicated quiet PrismaClient (no log pollution).                                                                                 |
| `server/scripts/testMcpToolCall.js`         | NEW — end-to-end test script that does the full handshake (initialize → tools/call). Honors `$TOKEN` env.                                                                |
| `server/test/mcp/context.test.js`           | 5 ALS isolation tests including concurrent-request leak guard.                                                                                                           |
| `server/test/mcp/tools.test.js`             | 14 per-tool tests covering security + behavior + multi-tenancy + Zod schema enforcement.                                                                                 |

### File-by-file commentary on the non-obvious parts

**`server/src/mcp/server.js`** — `createServerAndTransport()` is called PER REQUEST. The temptation to cache one globally is wrong (Issue 1). The slight performance cost (registering tools is ~1ms) is negligible compared to the correctness gain.

**`server/src/mcp/context.js`** — `getMcpContext()` THROWS if called outside a request. That's deliberate: the alternative (returning `null`) would let bugs ship silently — a tool that forgot to gate on team context would just silently leak data. Loud failure is better.

**`server/src/mcp/tools/index.js`** — the `withErrorBoundary` wrapper monkey-patches `server.registerTool` to wrap every handler with try/catch. Without this, a thrown error in any tool returns an opaque 500 with no body to the client, and only a generic "request handler error" line on the server. With it, the server gets a full stack trace AND the client gets a graceful `isError: true` response that the LLM can actually reason about.

**`server/scripts/testMcpToolCall.js`** — the test script does the FULL MCP handshake (initialize → tools/call). Don't try to skip the initialize step — the SDK requires it before tools/call works, even in stateless mode.

---

## Build journal

### Day 1 / morning

- 🟢 Wrote `mcp/context.js` (AsyncLocalStorage)
- 🟢 Wrote `mcp/utils/captureRes.js`
- 🟢 First tool `get_readiness_report` — registered, basic structure
- 🟡 Wired into `server.js` — needed to wrap `transport.handleRequest()` in `mcpContext.run(...)` so the ALS is set BEFORE the SDK calls our handler

### Day 1 / afternoon

- 🟢 Wrote `get_pattern_matrix` + `get_review_queue` (mechanical after the first one)
- 🟢 Wrote 14 tool tests — caught bugs in mock-server validation that would have been silent in real SDK use
- 🟡 Tests revealed the mock server didn't enforce Zod validation by default — fixed by reconstructing the schema from the registered shape
- 🟢 All 759 tests pass; lint clean
- 🔴 First end-to-end test from Claude Code: tool returned "no team context" because admin user has no `currentTeamId`. **Issue 4** — script update.

### Day 2 / morning

- 🔴 Re-minted with team. Test script returned 500. Server log: `"Cannot read properties of undefined (reading 'findUnique')"` — Prisma client wasn't regenerated after the new `RevokedMcpToken` model. Fixed via `npx prisma generate` + restart. (This was technically MCP-1's revocation table; the bug surfaced only when the auth code actually ran.)
- 🔴 After fix: test script returns 200 on initialize, **400 on tools/call**. Diagnosis: globally-cached transport hit "Server already initialized" because Claude Code's earlier handshake had set its state. **Issue 1** — switched to stateless mode + per-request transport.
- 🟢 Test script returns real data. 200 on both init and tools/call.

### Day 2 / afternoon

- 🔴 User couldn't see real data because the test script auto-minted for SUPER_ADMIN, ignoring `$TOKEN`. **Issue 2**.
- 🔴 User minted for their actual account but Claude Code couldn't see the tools — registration was project-scoped to `server/` while Claude Code launched from `problem-solver/`. **Issue 3**.
- 🟢 With `--scope user` registration: Claude Code sees the tools. End-to-end win.

---

## Issues & fixes

### Issue 1: "Server already initialized" — global transport caching

**Symptom**:

```
[test] POST initialize → 200 OK
[test] POST tools/call → 400 "Invalid Request: Server already initialized"
```

**Hypothesis 1**: Claude Code is sending a stale `Mcp-Session-Id`. **Wrong** — we're in stateless mode with no session ID.

**Hypothesis 2**: Authentication is failing on the second request. **Wrong** — server logs show `user:cmowryfo... team:cmox...` set, meaning auth passed.

**Root cause**: I cached ONE `StreamableHTTPServerTransport` instance globally. The SDK's transport tracks per-instance initialization state. Once any client triggered `initialize`, the cached instance was "initialized" — every subsequent client got the rejection.

**Fix**: Switched to **stateless mode** (`sessionIdGenerator: undefined`) AND **per-request server+transport creation**:

```js
async function createServerAndTransport() {
  const server = new McpServer({...});
  registerAllTools(server);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return { server, transport };
}

// In handler:
const { server, transport } = await createServerAndTransport();
res.on("close", () => { transport?.close?.(); server?.close?.(); });
```

Each request gets its own server+transport pair. They're disposed when the response closes.

**Lesson**: 💡 In stateless mode, the SDK doesn't share state across requests because each request is meant to be independent. Caching a single transport globally breaks that invariant. If you ever see "Server already initialized," check whether you're sharing a transport across what should be independent requests.

**Prevention**: Add a comment at every `new StreamableHTTPServerTransport(...)` call site documenting whether it's stateless and why. The pattern is non-obvious; make it discoverable.

### Issue 2: Test script auto-minted for SUPER_ADMIN, ignored `$TOKEN`

**Symptom**: User minted a token via `mintMcpToken.js --email=...`, exported it as `$TOKEN`, ran `testMcpToolCall.js`. Test ran successfully but returned data for the WRONG user — kept showing admin's empty team.

**Hypothesis 1**: The token isn't being sent. **Wrong** — server logs showed the request reaching the handler.

**Root cause**: `testMcpToolCall.js` had its own internal `mintToken()` that always picks the first SUPER_ADMIN. It ignored `$TOKEN` entirely.

**Fix**: Made the script honor `$TOKEN` if set:

```js
let token;
if (process.env.TOKEN && process.env.TOKEN.length > 20) {
  console.error(`[test] using existing $TOKEN env var`);
  token = process.env.TOKEN;
} else {
  console.error(`[test] no $TOKEN env — auto-minting for first SUPER_ADMIN`);
  token = await mintToken();
}
```

**Lesson**: ⚠️ A test script that auto-mints for the FIRST user found is convenient but dangerous — it silently overrides whatever the user is trying to test. Default to "use the env's token if set; auto-mint only as fallback."

**Prevention**: Always echo the user/team being used to stderr (we already do this). Make the override path obvious.

### Issue 3: `claude mcp add` registers per-cwd, not globally

**Symptom**: User ran `claude mcp add` from `~/Downloads/Projects/problem-solver/server/`. Connection worked there. They started Claude Code from `~/Downloads/Projects/problem-solver/` (parent dir) — `claude mcp list` showed empty. The server was "registered" but invisible.

**Root cause**: Claude Code's default scope is "project" — keyed by the current working directory. Different cwd = different config namespace = different MCP servers.

**Fix**: Re-add with `--scope user`:

```bash
claude mcp add --transport http --scope user binary-thinkers ...
```

User-scoped registrations apply globally regardless of cwd.

**Lesson**: 🎓 For SaaS-style remote MCP servers (one server, many projects), `--scope user` is the right default. Project scope makes sense for stdio servers tied to a specific repo (e.g. a `learn-ai` server bundled with a learning project). Confusing defaults — Claude Code could pick a smarter default for HTTP transport.

**Prevention**: Document the `--scope user` flag prominently in the project's MCP setup doc. Train future contributors not to silently fail when their MCP server "doesn't appear."

### Issue 4: User had no `currentTeamId` (admin used personal team)

**Symptom**: `get_readiness_report` returned `isError: true` with "No active team context" — even though Claude Code was clearly connected and the JWT was valid.

**Root cause**: The `me` shortcut in `mintMcpToken.js` picks the first SUPER_ADMIN, but that user's `currentTeamId` was `null` (admin only ever interacted via the API, never switched teams via the web UI).

**Fix**: Two-layer:

1. Mint script auto-finds a team for SUPER_ADMINs without `currentTeamId` (picks first ACTIVE team)
2. Added `--email=<email> --teamId=<id>` flags so the user can target a specific account + team

**Lesson**: 💡 Users without a `currentTeamId` are a real edge case in multi-tenant systems. The web UI's flow always sets it (you can't NOT have a team), but tokens minted via API/CLI can skip that step. Tools that require team context need a graceful "no team" path that tells the user how to set one.

**Prevention**: When the eventual MCP-4 settings page ships, the "Generate MCP token" button should require the user to confirm their target team — making the team selection explicit at issuance time.

---

## Verification

End-to-end checklist for batch 1 (3 tools):

- [x] Lint clean (`npm run lint`)
- [x] All tests pass (759 server tests, including 19 new MCP-2 tests)
- [x] `node scripts/testMcpToolCall.js get_readiness_report` returns real D1-D6 scores against Binary Thinkers team
- [x] `node scripts/testMcpToolCall.js get_pattern_matrix '{"filter":"all"}'` — works (returns activation message when D1 v2 flag is off, returns matrix when on)
- [x] `node scripts/testMcpToolCall.js get_review_queue '{"limit":3}'` returns SM-2 queue (or empty if all caught up)
- [x] Bad token → server returns 401 (security middleware verified post MCP-2 changes)
- [x] Cross-tenant attempt: token for user A's team can't see user B's data (Zod `.strict()` schema rejects userId arg; handler reads from JWT-derived ALS only)
- [x] Claude Code `/mcp list` shows `✓ Connected   3 tools`
- [x] Claude Code natural-language query routes to a tool and returns grounded answer

---

## FAQ as a learner

### 🎓 Why does each request create a new McpServer instance?

In stateless mode, the SDK doesn't share state across requests by design. If you cache one server globally, the second request collides with the first's internal state ("Server already initialized"). Per-request creation gives you full isolation: each request gets its own initialize/handshake state, request-ID counter, and tool registry. Cost is ~1ms — trivially acceptable for read tool calls.

For comparison: in a stateful MCP server with long-lived sessions, you'd cache one server + transport per session, keyed by `Mcp-Session-Id`. We don't need that complexity for read-only tools.

### 🎓 Why AsyncLocalStorage instead of just passing context to tools?

The SDK's `server.registerTool(name, schema, handler)` signature is fixed — `handler` receives only the tool's parsed args. There's no extra parameter for context.

Three alternatives I considered:

1. **Bake context into the handler closure at request time** — would require rebuilding the server (and re-registering all tools) per request. We do this anyway for stateless mode, but ALS is cleaner because tool registration shape stays static.
2. **Pass auth in tool args** — terrible. Args come from the LLM, not the server. The whole point of the auth middleware is to NOT trust client-supplied identity.
3. **Use AsyncLocalStorage** — Node's standard pattern for request-scoped state. Set in middleware, read anywhere in the call chain. Doesn't pollute function signatures.

ALS won. The `getMcpContext()` call is one line in each tool, and the security invariant ("auth comes from JWT, not args") is unambiguous.

### 🎓 What's a "capture-res shim"?

Our existing controllers are HTTP-shaped: `(req, res) => res.status(200).json(data)`. They want an Express `res` object to call `.json(...)` on.

The shim creates a fake `res` that records what would have been sent:

```js
function makeCaptureRes() {
  return {
    _statusCode: 200,
    _body: null,
    status(code) {
      this._statusCode = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
    set() {
      return this;
    },
  };
}
```

Pass that fake res into the controller, then read `_body` to get what the controller would have responded with. Lets MCP tools reuse 18+ existing controllers without rewriting them as pure functions. ~30 lines of glue.

### 🎓 Why a Zod output schema, not just an input schema?

Two reasons:

1. **Field allowlist**: A controller might return more fields than the LLM should see (internal IDs, raw AI prompts, large blobs). Without an output schema, every controller change risks leaking new fields. The schema is the explicit boundary — adding a field to the response requires updating the schema. Friction we want.

2. **Catch handler bugs early**: If the handler accidentally returns `score: undefined` instead of `null`, Zod fails loud. Without it, the LLM gets weird data and hallucinates around it.

### 🎓 Why are the tools "slow" on first request?

First request: ~1.8 seconds. Subsequent: ~6ms. The slow first request is a one-time DB round-trip to check the JWT's jti against the revocation table. We cache the result for 60s, so subsequent requests hit the cache.

The other contributor is `get6DReport` itself — it runs the full 10-dim computation pipeline (Pattern Mastery, Solution Depth, Communication, etc.) on every call. There's a 5-minute cache on the verdict log but not on the report itself; could add one but the slowness only shows up on cold queries.

### 🎓 What happens if a tool throws?

`withErrorBoundary` (in `tools/index.js`) catches it and returns:

```json
{
  "content": [
    { "type": "text", "text": "Tool 'X' failed. Server-side error logged." }
  ],
  "isError": true
}
```

The full stack trace goes to the server log (with `[mcp:tool:<name>] error:` prefix). The client gets a graceful response that the LLM can reason about ("I'll try a different approach..."). Without this wrapper, errors return as opaque 500s with no body — debugging from the client is impossible.

### 🎓 Why does Claude Code need `--scope user`?

Claude Code's default scope is "project," keyed by current working directory. So registering from `server/` doesn't show up when you launch Claude from `problem-solver/`. For a SaaS-style MCP server (one URL, many projects), `--scope user` is the right call — the server is the same regardless of which project you're working on.

### 🎓 If I want to add a 9th tool, what's the workflow?

1. Create `server/src/mcp/tools/<toolName>.js`. Copy the shape from `readinessReport.js`:
   - Zod input schema (`.strict()`)
   - Zod output schema (field allowlist)
   - Handler that reads from `getMcpContext()`, calls a controller (or queries Prisma), wraps user content via `wrapUserContent()`, returns MCP response shape
2. Add `import { register as registerNewTool } from "./newTool.js";` to `tools/index.js`. Add `registerNewTool(server)` to `registerAllTools()`.
3. Write a test in `test/mcp/tools.test.js` covering: valid invocation, multi-tenancy enforcement, Zod schema rejection of unknown args, no-team handling.
4. Restart the server. Verify with `node scripts/testMcpToolCall.js <toolName>`.

That's it. The pattern is mechanical once the first 3 are working.

### 🎓 Why doesn't the "registers with the server" test actually invoke the handler?

Earlier version of the test invoked `server.invoke(...)` outside of `mcpContext.run()`. The handler called `getMcpContext()` and threw "No request context found." Since the invocation returned a Promise that rejected, but the test didn't await it, the rejection became an unhandled rejection, polluting the test output.

The fix: every test that invokes a handler MUST wrap the call in `mcpContext.run(validCtx, () => server.invoke(...))`. The "registers with the server" test now does this and asserts the call doesn't throw, which is functionally equivalent and avoids the unhandled rejection.

### 🎓 The `withErrorBoundary` wraps `server.registerTool` — isn't that a hack?

Yes. It monkey-patches the SDK's API to inject error boundaries around every tool handler. Cleaner alternatives would be:

1. Wrap each individual tool's handler at registration time (verbose, easy to forget)
2. Write a custom McpServer subclass (heavyweight, ties us to SDK internals)
3. Live without error boundaries (ship opaque 500s — bad UX)

The monkey-patch is contained to a 30-line wrapper and only modifies the server reference within `registerAllTools`. Acceptable for the value it provides.

---

## Try this yourself

Hands-on exercises that test the security boundaries.

| #   | Exercise                                                                                                                                            | Concept reinforced                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | Mint a token, run `node scripts/testMcpToolCall.js get_readiness_report`. Confirm real data.                                                        | End-to-end happy path               |
| 2   | Try to send `{"userId": "spoofed"}` in tool args. Confirm Zod schema rejects it.                                                                    | Strict schema as defense-in-depth   |
| 3   | Mint a token for one user, but try to read another user's data via a custom curl. Confirm the server enforces multi-tenancy from JWT.               | ALS-based auth                      |
| 4   | Set `DEBUG_MCP=true`, watch the request log during a Claude Code call.                                                                              | Observability                       |
| 5   | Stop the dev server mid-request (Ctrl+C in the npm run dev terminal). Confirm the test script reports failure cleanly.                              | Error boundary + graceful failure   |
| 6   | Run two test scripts in parallel (`node scripts/testMcpToolCall.js ... &` twice). Confirm both succeed without "Server already initialized."        | Per-request transport isolation     |
| 7   | Add a console.log in your tool handler. Restart server. Confirm the log fires per request.                                                          | Tool registration mechanics         |
| 8   | Remove `mcpContext.run()` from `handleMcp` temporarily. Re-run the test. Confirm `getMcpContext()` throws and the error boundary returns `isError`. | ALS isolation + graceful error path |

---

## Glossary

| Term                             | Definition                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AsyncLocalStorage (ALS)**      | Node's standard mechanism for propagating request-scoped state through async call chains. Used here to make JWT-derived auth context available inside tool handlers without threading it through every function. |
| **Capture-res shim**             | A stub Express `res` object that records `.status(...).json(...)` calls instead of sending HTTP. Lets MCP tools call existing HTTP-shaped controllers.                                                           |
| **Stateless transport mode**     | MCP Streamable HTTP mode where each request is fully independent. No `Mcp-Session-Id` tracking. Required setup: `sessionIdGenerator: undefined`.                                                                 |
| **Per-request server+transport** | Pattern of constructing a fresh `McpServer` + `Transport` pair for every incoming request. Required in stateless mode to avoid request-ID collisions.                                                            |
| **Field allowlist**              | Output Zod schema that explicitly enumerates which fields a tool can return. Prevents accidental PII / internal-ID leaks.                                                                                        |
| **withErrorBoundary**            | Wrapper around tool handlers that catches thrown errors, logs them server-side with full stack, and returns a graceful `isError: true` response to the LLM.                                                      |
| **MCP scope (Claude Code)**      | The directory namespace under which `claude mcp add` registers a server. Defaults to "project" (current cwd). For shared SaaS servers, use `--scope user`.                                                       |
| **JTI revocation cache**         | 60-second in-memory TTL cache for "is this token revoked?" lookups. Avoids per-request DB round-trip while keeping revocation lag bounded.                                                                       |
| **`mcpContext.run(ctx, fn)`**    | Sets the AsyncLocalStorage store to `ctx` for the duration of `fn` (and any async chains it spawns). The standard Node pattern for "give me this context, run my code, then put it back."                        |

---

## Further reading

- [`docs/AGENT_TOOLING_REFERENCE.md`](../AGENT_TOOLING_REFERENCE.md) — architecture-level reference; pair with this build note
- [`docs/ai-engineering/01-mcp-phase-1-foundation.md`](./01-mcp-phase-1-foundation.md) — the foundation; read FIRST
- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage) — official API docs
- [MCP TypeScript SDK Streamable HTTP example](https://github.com/modelcontextprotocol/typescript-sdk#streamable-http) — the canonical stateless-mode pattern
- [MCP server concepts](https://modelcontextprotocol.io/docs/learn/server-concepts) — Tools, Resources, Prompts spec

---

## What's next

- **MCP-2 batch 2** — 5 remaining tools: `get_dim_breakdown`, `get_recommended_problems`, `get_team_leaderboard`, `get_calibration_status`, `get_weekly_plan`. All mechanical (~20 min each) given the pattern works.
- **Phase MCP-3** — prompt templates: `weekly-prep-checkin`, `pre-interview-brief`, `pattern-deep-dive`, `calibration-coach`. Read-only since prompts pull data, not push.
- **Phase MCP-4** — token UX (settings page) + diagnostics dashboard. Replaces the dev-only mint script with production-grade revocation.

This file is **append-only**. When MCP-2 batch 2 ships, append new issues to "Issues & fixes." When MCP-3 ships, create a separate `03-mcp-phase-3-prompts.md` and link forward.

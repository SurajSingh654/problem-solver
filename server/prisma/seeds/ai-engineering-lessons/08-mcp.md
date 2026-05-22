# 08 — Model Context Protocol (MCP)

> Reference: [Model Context Protocol](https://modelcontextprotocol.io) · [Anthropic MCP docs](https://docs.claude.com/en/docs/agents-and-tools/mcp)

**MCP** is an open protocol for connecting LLMs to tools and data sources. Anthropic introduced it in late 2024; it's now supported by Claude Code, Claude Desktop, and a growing ecosystem of clients and servers.

## The problem MCP solves

Without MCP, every AI app reinvents the same wiring:

- App A connects to GitHub: writes its own GitHub tool definitions, auth, error handling.
- App B connects to GitHub: writes its own GitHub tool definitions, auth, error handling.
- App C wants to talk to your private database: you write a custom integration _for that app_.

MCP standardizes the _protocol between an LLM client and a tool/data provider_, so:

- Anyone can write an **MCP server** (e.g. "GitHub MCP server", "Postgres MCP server").
- Any **MCP client** (Claude Code, Claude Desktop, Cursor, Continue, etc.) can connect to it.
- Tools, prompts, and resources are advertised through a standard interface.

## The three primitives

An MCP server can expose any of:

| Primitive     | What it is                 | Example                                    |
| ------------- | -------------------------- | ------------------------------------------ |
| **Tools**     | Functions the LLM can call | `create_github_issue`, `query_database`    |
| **Resources** | Data the LLM can read      | `file:///docs/api.md`, `db://orders/today` |
| **Prompts**   | Reusable prompt templates  | `"summarize-pr-template"`                  |

Most servers expose tools. Resources matter for read-only context (think "file system").

## Transports

An MCP server speaks one of:

- **stdio** — server is a subprocess; communicates over stdin/stdout. Most local servers use this. Simple, no networking.
- **HTTP + SSE / streamable HTTP** — for remote/hosted servers.

Claude Code supports both. For local development, stdio is the default.

## Anatomy of a minimal MCP server (Python, FastMCP)

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("learning-assistant")

@mcp.tool()
def search_notes(query: str, top_k: int = 5) -> list[dict]:
    """Search the user's personal notes for the query.

    Returns up to `top_k` results, each with `title`, `content`, `score`.
    """
    # ... implementation
    return [{"title": "...", "content": "...", "score": 0.87}]

if __name__ == "__main__":
    mcp.run()
```

That's a complete server. Connect it to Claude Code by adding it to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "learning-assistant": {
      "command": "uv",
      "args": ["run", "python", "-m", "learning_assistant.mcp_servers.notes"]
    }
  }
}
```

Restart Claude Code; the new tool is available.

You'll do this end-to-end in [`lessons/11_mcp_server/`](../lessons/11_mcp_server/).

## Why MCP instead of just defining tools in code?

If your tools live inside one Python app talking to one Claude API, plain tool use is fine.

You want MCP when:

- You want **the same toolset usable from multiple clients** (Claude Code on your dev machine, a Slack bot on the server).
- You want to **distribute tools to other people** (publish an MCP server; users plug it in).
- You want to **separate concerns** — the server owns auth, rate limiting, observability for its tools; the client just consumes them.

## Security model

Critical: **MCP servers run with whatever permissions you give them.** A misbehaving (or malicious) MCP server is essentially a plugin with full access to whatever it can reach.

- **Only install MCP servers from sources you trust.**
- Review the tools an MCP server exposes before approving it.
- Claude Code shows you a permission prompt the first time a tool is called — read it.

## What to do next

Build a minimal MCP server in [`lessons/11_mcp_server/`](../lessons/11_mcp_server/), then expose your capstone's RAG retriever as an MCP tool — now Claude Code itself can query your knowledge base.

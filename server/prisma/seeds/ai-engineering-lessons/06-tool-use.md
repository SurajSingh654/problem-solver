# 06 — Tool use

> Reference: [Tool use overview](https://docs.claude.com/en/docs/build-with-claude/tool-use/overview)

**Tool use** lets the model call functions you define. It's the bridge between language and the outside world.

## The protocol

Tool use is a **multi-turn** dance, not a single response.

```text
You ─────────────────────────────►  Claude
  "What's the weather in Tokyo?"
  + tool: get_weather(city: str)

You ◄─────────────────────────────  Claude
  stop_reason: "tool_use"
  content: [tool_use { name: "get_weather", input: {"city": "Tokyo"} }]

(Your code runs get_weather("Tokyo") → "22°C, clear")

You ─────────────────────────────►  Claude
  + previous messages
  + user message with tool_result { tool_use_id: ..., content: "22°C, clear" }

You ◄─────────────────────────────  Claude
  "It's 22°C and clear in Tokyo right now."
```

Three things to notice:

1. **You** execute the tool. The model just _describes_ the call. You decide whether to actually run it.
2. **The result is fed back** as a `tool_result` content block in a `user` message.
3. **The loop can continue** — the model might call another tool based on the result.

## Defining a tool

A tool definition is a JSON schema:

```python
TOOLS = [
    {
        "name": "get_weather",
        "description": "Get current weather for a city. Returns temp + conditions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "City name, e.g. 'Tokyo'"},
                "units": {"type": "string", "enum": ["celsius", "fahrenheit"], "default": "celsius"},
            },
            "required": ["city"],
        },
    }
]
```

The model uses the **description** + **schema** to decide when and how to call. Write the description like you're explaining to a smart intern who hasn't seen the rest of your code:

- Say what the tool _does_, not _how_.
- Mention preconditions ("only call this if the user is logged in").
- Mention what the tool returns and what failures look like.

A vague description is the #1 cause of bad tool use.

## Parallel tool calls

In one turn, the model can request multiple tool calls at once:

```text
content: [
  tool_use { name: "get_weather", input: {"city": "Tokyo"} },
  tool_use { name: "get_weather", input: {"city": "London"} },
]
```

Run them in parallel; return both `tool_result`s in the same user message. Latency win.

## Forcing a tool call (`tool_choice`)

| `tool_choice`                   | Effect                      |
| ------------------------------- | --------------------------- |
| `{"type": "auto"}` (default)    | Model decides               |
| `{"type": "any"}`               | Model _must_ call some tool |
| `{"type": "tool", "name": "X"}` | Model _must_ call tool X    |

Use `tool_choice: {type: "tool", name: "X"}` for **structured output via tools** — define a tool whose only job is to receive the structured data, force a call, parse the input, you have validated JSON. More reliable than asking for JSON in prose.

## What goes into the system prompt vs tool descriptions

- **Tool descriptions** describe _what each tool does and when to use it_.
- **System prompt** describes _the overall task and policies_ ("Always confirm before sending email; never delete files without asking").

Don't duplicate. Don't put tool schemas in the system prompt — Claude already sees them via the `tools` parameter.

## Failure modes

- **Hallucinated tool calls**: model calls a tool you didn't define. Validate against your tool list before executing.
- **Wrong arguments**: model passes the wrong type or shape. Validate the input with Pydantic before calling the underlying function.
- **Infinite loops**: model keeps calling tools forever. Set a max-turn budget on your loop (e.g. 10 turns).
- **Tool error → confusion**: if the tool errors, return the error text as the `tool_result` content. Claude will usually try to recover.

## What to do next

Run [`lessons/08_tool_use/`](../lessons/08_tool_use/). You'll define a single tool, then add a second, then call them in parallel — each as separate scripts so you can diff them.

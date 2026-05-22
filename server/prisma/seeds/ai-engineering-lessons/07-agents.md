# 07 — Agents

> Reference: [Building agents](https://docs.claude.com/en/docs/agents-and-tools/computer-use)

An **agent** is an LLM in a loop with tools and an objective.

## The minimal agent loop

```text
while True:
    response = claude.messages.create(messages=history, tools=TOOLS)
    history.append(response)

    if response.stop_reason == "end_turn":
        return response.content        # the model decided it's done

    if response.stop_reason == "tool_use":
        for block in response.content:
            if block.type == "tool_use":
                result = execute(block.name, block.input)
                history.append(user_message_with_tool_result(block.id, result))
        continue                       # let the model react to the result

    raise Unexpected(response.stop_reason)
```

That's an agent. Everything else — planning, reflection, multi-agent orchestration — is variations on this loop.

You'll build this from scratch in [`lessons/09_agent_loop/`](../lessons/09_agent_loop/), then see the same agent in LangGraph in [`lesson 10`](../lessons/10_langgraph/).

## Why frameworks (LangGraph, etc.)?

The minimal loop above breaks down once you want:

- **State that persists across iterations** (an evolving plan, a scratchpad).
- **Branching** (different tool results lead to different next steps).
- **Streaming intermediate state to the user** (so they can see the agent thinking).
- **Human-in-the-loop pauses**.
- **Recovery** from a failed step without restarting.
- **Replay / time-travel** for debugging.

Frameworks like LangGraph give you this for free, in exchange for some abstraction tax.

> **Rule of thumb:** Build the loop yourself first. Only adopt a framework once you've felt the pain it solves.

## Common agent patterns

| Pattern                             | Idea                                                 | When                                      |
| ----------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| **ReAct**                           | Alternate "Thought:" / "Action:" / "Observation:"    | Single agent, simple tasks                |
| **Plan-and-execute**                | Generate a plan up front, then execute step by step  | Multi-step tasks, debuggable              |
| **Reflexion**                       | Agent critiques its own output and retries           | Quality-sensitive tasks                   |
| **Multi-agent (planner + workers)** | One agent decomposes; specialized agents do the work | Complex tasks with subtasks               |
| **Router**                          | A small model picks which agent/tool to invoke       | Saves on big-model calls for simple paths |

The capstone uses a **planner → researcher → writer → critic** chain — see [`project/ARCHITECTURE.md`](../project/ARCHITECTURE.md).

## Stopping conditions

Without a stop, agents loop forever. You need at least:

- **Max-turn budget**: a hard cap (e.g. 10 turns).
- **Token budget**: stop when total tokens exceed a threshold.
- **Final-answer detection**: explicit `stop_reason == "end_turn"` or a "final_answer" tool.
- **No-progress detection**: if the agent repeats the same tool call with the same args twice, abort.

The capstone implements all four.

## Cost and latency

Agent calls are not cheap. Each turn = one LLM call + tool execution. A 5-turn agent with caching: ~$0.05–0.20 per session on Sonnet 4.6. Watch:

- **Cache the system prompt aggressively.** Same agent across the whole session = same system prompt = high cache hit rate.
- **Trim history.** After 10+ turns, summarize older turns into the system prompt.
- **Pick the right model.** Use Haiku for routing/classification, Sonnet for the main loop, Opus for the few hardest steps.

## Safety

Agents take actions. That makes them riskier than chatbots.

- **Confirm before destructive tools.** Pause for human approval on file-delete, send-email, push-code.
- **Sandbox tool execution.** Don't let an agent run arbitrary shell.
- **Allow-list tools per scope.** A research agent doesn't need a `delete_file` tool.
- **Watch for prompt injection** in tool results. A web page the agent fetches can contain instructions.

## What to do next

Build the loop by hand in [`lessons/09_agent_loop/`](../lessons/09_agent_loop/). Then see the same agent in LangGraph in [`lesson 10`](../lessons/10_langgraph/) and feel where the abstraction earns its keep.

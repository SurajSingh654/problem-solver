# 09 — LangChain vs LangGraph

A frequent point of confusion. Short version:

- **LangChain** is a library of utilities for LLM apps — chunkers, document loaders, output parsers, vector store wrappers, retrieval helpers.
- **LangGraph** is a framework for building stateful, multi-step agent workflows on top of LangChain primitives. The "graph" is the agent's flow of execution.

LangGraph is the modern choice for agents. LangChain is still useful for the _plumbing_.

## When to use which

| Need                                       | Tool                                   |
| ------------------------------------------ | -------------------------------------- |
| Split a PDF into chunks                    | `langchain-text-splitters`             |
| Load HTML / Markdown / PDF                 | `langchain-community` document loaders |
| Wrap a vector DB in a uniform interface    | LangChain's `VectorStore`              |
| Single LLM call with retries               | Plain `anthropic` SDK + your own retry |
| **Agent with state, branching, streaming** | **LangGraph**                          |
| RAG pipeline as a multi-step graph         | LangGraph                              |

## What LangGraph gives you

A LangGraph **state graph** has:

- A **state schema** (TypedDict or Pydantic): the data structure passed between nodes.
- **Nodes**: functions that take state and return state updates.
- **Edges**: control flow between nodes, including conditional edges.

```python
from langgraph.graph import StateGraph

class State(TypedDict):
    question: str
    docs: list[str]
    answer: str | None

g = StateGraph(State)
g.add_node("retrieve", retrieve_node)
g.add_node("answer", answer_node)
g.set_entry_point("retrieve")
g.add_edge("retrieve", "answer")
g.set_finish_point("answer")
app = g.compile()

result = app.invoke({"question": "What is RAG?", "docs": [], "answer": None})
```

This buys you:

- **Persistence** — `app.invoke` can be paused and resumed (with a checkpointer).
- **Streaming** — stream state updates to a UI as nodes run.
- **Replay / time-travel** — re-run from a past state with different inputs (great for debugging agents).
- **Human-in-the-loop** — interrupt before a sensitive node and wait for approval.

## Why we don't lean on LangChain "chains"

LangChain originally had a "chain" abstraction (`LLMChain`, `SequentialChain`, `RetrievalQA`, …). They hide what's actually happening, and when something goes wrong you have to peel back layers to debug.

In this repo:

- **Lessons** show the raw mechanics (call Claude directly, write the loop).
- **Capstone** uses LangGraph for orchestration, but the nodes inside the graph are _plain Python_ calling the `anthropic` SDK or your own helpers — no `LLMChain`-style indirection.

This is opinionated. The benefit: when something breaks, you can step through it.

## What to do next

Build an agent from scratch in [`lessons/09_agent_loop/`](../lessons/09_agent_loop/), then port it to LangGraph in [`lesson 10`](../lessons/10_langgraph/). You'll feel the abstraction tax and the abstraction benefit at the same time.

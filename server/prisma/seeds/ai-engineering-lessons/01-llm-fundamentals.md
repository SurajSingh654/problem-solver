# 01 — LLM fundamentals

> Reference: [What is a Claude model?](https://docs.claude.com/en/docs/about-claude/models/overview)

Before you can build with LLMs, you need a working model of what they actually are.

## What an LLM is, in one sentence

A **Large Language Model** is a neural network trained to predict the next **token** given the tokens before it.

That's it. Everything else — chat, tool use, reasoning, agents — is built on top of "predict the next token, repeatedly".

## Tokens

A token is the unit a model reads and writes. Roughly **0.75 of an English word**, but the exact mapping depends on the model's tokenizer.

```text
"Hello, world!"   → ['Hello', ',', ' world', '!']     (~4 tokens)
"antidisestablishmentarianism" → ['anti', 'dis', 'establishment', 'arian', 'ism']
```

Why this matters:

- **Cost** is measured in tokens (input tokens + output tokens, priced separately).
- **Context windows** are measured in tokens. Claude Sonnet 4.6 supports 200K standard, 1M with the `context-1m-2025-08-07` beta.
- **Latency** scales with output tokens. Long answers are slow; long inputs are _less_ slow because they're processed in parallel.

## Context window

The maximum tokens a model can see in one call: system prompt + all messages + the response being generated.

> **Practical rule:** A 200K context is ~150K words of input — about a 600-page book. You almost never need to fill it. Bigger context = slower + more expensive.

When you exceed the limit, you don't get a smart truncation — you get an error. Managing context is your job.

## Sampling: how the next token is picked

The model outputs a _probability distribution_ over its entire vocabulary (~100K tokens). Sampling parameters decide how that distribution turns into one token.

| Parameter           | What it does                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `temperature` (0–1) | Sharpens (low) or flattens (high) the distribution. 0 = always pick the highest-probability token. |
| `top_p` (0–1)       | Only consider tokens whose cumulative probability is in the top _p_. Caps the long tail.           |
| `top_k`             | Only consider the top _k_ tokens.                                                                  |
| `stop_sequences`    | Strings that, if generated, end the response.                                                      |

> **Common confusion:** Temperature 0 is _not_ deterministic across runs. Floating-point math, batching, and GPU non-determinism mean you can get different outputs even with `temperature=0`. Closer to deterministic, not equal to deterministic.

## Modes of using a model

| Mode                  | What it looks like                                 | When to use                        |
| --------------------- | -------------------------------------------------- | ---------------------------------- |
| **Single-turn**       | One user message → one response                    | Simple Q&A, classification         |
| **Multi-turn (chat)** | Alternating user/assistant messages                | Conversations, refining outputs    |
| **Streaming**         | Tokens arrive as they're generated                 | Chat UIs, long outputs             |
| **Tool use**          | Model returns "call this function" instead of text | Agents, structured actions         |
| **Extended thinking** | Model produces visible reasoning before answering  | Hard problems, debugging the model |

## Roles in a conversation

Three roles you'll see in `messages` arrays:

- **`system`** — your instructions to the model (role, style, constraints). Stable across the conversation.
- **`user`** — what the user (or your code, on behalf of the user) said.
- **`assistant`** — what the model said previously. You include it in subsequent calls so the model has its own history.

> Claude doesn't have a separate "tool" role in the message list — tool calls and tool results live as content blocks inside `assistant` and `user` messages.

## Determinism, safety, and quirks

- LLMs **hallucinate** — generate plausible-sounding wrong answers. Mitigations: RAG (give it real data), tool use (let it look things up), evals (catch regressions).
- LLMs are **stateless** — every call is independent. State lives in the message history _you_ send.
- LLMs respect **prompt structure** — clear instructions in the system prompt, then user content, then explicit output instructions, in that order, gets you the most reliable results.

## What to do next

Run [`lessons/01_first_call/`](../lessons/01_first_call/). Make a single Claude call and look at the response object — `usage.input_tokens`, `usage.output_tokens`, `stop_reason`. These are the things you'll be measuring forever.

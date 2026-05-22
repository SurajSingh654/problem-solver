# 02 — Prompting

> Reference: [Prompt engineering overview](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview)

Prompting is how you steer the model. Most LLM application bugs are prompt bugs.

## The three places instructions go

| Slot                  | Use for                                                 | Cached?                               |
| --------------------- | ------------------------------------------------------- | ------------------------------------- |
| **System prompt**     | Role, style, hard constraints, output format spec       | Yes (5-min default, 1-hour with beta) |
| **User message**      | The actual task or question, plus any retrieved context | Optionally                            |
| **Assistant prefill** | The first few characters of the assistant's reply       | N/A                                   |

**Default rule:** Stable instructions go in the system prompt. Per-request data goes in the user message. Use the assistant prefill to nudge the format ("the response is JSON, starts with `{`").

## Anatomy of a good system prompt

```text
You are a research assistant for software engineers.

When the user asks a question:
1. If the question is about a specific library, prefer official docs over forum posts.
2. Quote sources verbatim; never paraphrase numbers.
3. If you don't know, say "I don't know" — do not guess.

Output format: Markdown. Headings only when the answer has 2+ sections.
```

What this gets right:

- **Role** in one sentence.
- **Numbered behaviors**, not paragraphs. Easier for the model to follow consistently.
- **A "do not" rule.** Negative constraints are as important as positive ones.
- **Output format** explicit.

## Few-shot vs zero-shot

- **Zero-shot**: just instructions. Works for simple tasks.
- **Few-shot**: 1–5 example input/output pairs in the prompt. Use when:
  - The output format is non-obvious.
  - You want a specific style.
  - The task has edge cases that are hard to describe in rules.

Show _bad_ examples too if the model keeps making the same mistake. Label them clearly:

```text
Good:  {"intent": "refund", "confidence": 0.92}
Bad:   {"intent": "refund please", "confidence": "high"}   # values must be numeric
```

## Prompt caching — the most important production technique

Long system prompts and long retrieved contexts repeat across calls. **Prompt caching** stores them on Anthropic's side; subsequent calls reuse the cache at **~10% of the input cost** (and lower latency).

You opt in with `cache_control` on a content block:

```python
messages.create(
    model="claude-sonnet-4-6",
    system=[
        {"type": "text", "text": LONG_SYSTEM_PROMPT,
         "cache_control": {"type": "ephemeral"}},
    ],
    messages=[...],
)
```

The cache lasts 5 minutes (default) or 1 hour (with the `extended-cache-ttl-2025-04-11` beta). For an agent making 20 calls in a session, this can cut cost by 5–10×.

> **Practical impact:** If your system prompt is >1024 tokens, _always_ cache it. Hands-on in [`lessons/02_streaming_and_caching/`](../lessons/02_streaming_and_caching/).

## Structured output

When you want JSON, **don't just ask** "return JSON". Do all of:

1. Specify the schema in the system prompt.
2. Show one or two examples.
3. Use the assistant prefill to start the JSON: `{`.
4. Validate with Pydantic on the way out.

Better: use **tool use** as a structured-output mechanism. Define a tool whose only purpose is to receive the structured data; force the model to call it. This is the most reliable way. See lesson 03.

## XML tags help with long prompts

Claude is trained to understand XML-style tags as section delimiters. They're not magic, but they clarify intent:

```xml
<context>
{retrieved chunks here}
</context>

<question>
{user question}
</question>

Answer the question using only the context above. If the context doesn't contain the answer, say so.
```

## Common pitfalls

- **Long, paragraphy instructions.** Numbered lists get followed; paragraphs get skimmed.
- **Conflicting instructions.** "Be thorough" and "be concise" don't compose. Pick one.
- **Putting the question before the context.** Model attention degrades on long inputs; put the _task_ near the end.
- **Forgetting the system prompt is cacheable.** If you build it dynamically every call, you lose the cache. Stable parts at the top, dynamic parts (date, user name) at the bottom or in user messages.

## What to do next

Run [`lessons/02_streaming_and_caching/`](../lessons/02_streaming_and_caching/) to see prompt caching in action — same prompt twice, look at the `cache_creation_input_tokens` and `cache_read_input_tokens` fields.

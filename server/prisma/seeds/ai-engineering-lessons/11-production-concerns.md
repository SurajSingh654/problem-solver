# 11 — Production concerns

The lessons above teach you to _build_. This page is about _operating_ — what changes when an AI system goes from a notebook to real users.

## Caching, aggressively

Already covered in [docs/02-prompting.md](02-prompting.md), but worth repeating: **prompt caching is the highest-ROI production technique**.

- Long system prompts → cache.
- Long retrieved context that's reused (e.g. same docs across user questions) → cache.
- Multi-turn agents with stable system prompt → cache the system prompt; subsequent turns hit the cache.

Typical impact: 5–10× cost reduction on agent workloads. Latency reduction is also real (often 30–60%).

## Retries and rate limits

The Anthropic API can return:

| Error                 | What to do                                 |
| --------------------- | ------------------------------------------ |
| `429` rate limit      | Exponential backoff; respect `retry-after` |
| `529` overloaded      | Wait + retry                               |
| `500` / `502` / `503` | Retry up to 3 times                        |
| `400` bad request     | **Don't retry.** Fix the request.          |
| `401` auth            | **Don't retry.** Fix the API key.          |

The official `anthropic` SDK has retries built in (`max_retries=2` by default). Tune it; don't disable it.

## Observability

You need to see what your agent is doing. At minimum, log:

- For every LLM call: model, input token count, output token count, cache hit/miss tokens, cost, latency.
- For every tool call: tool name, args, result (or error), latency.
- For every agent run: turn count, total cost, total latency, final outcome.

Tools that help: [Langfuse](https://langfuse.com), [LangSmith](https://smith.langchain.com), [Helicone](https://helicone.ai), [Arize Phoenix](https://phoenix.arize.com). All free at low volumes.

For this repo, lesson 13 builds a minimal `structlog`-based logger that gets you 80% of the value with zero dependencies.

## Cost management

Concrete numbers (Sonnet 4.6, mid-2026 prices, check current):

- ~$3 per million input tokens, ~$15 per million output tokens.
- A 1M-token cached input is ~10% of normal input cost on cache hit.
- A typical RAG turn: ~5K input + ~500 output = ~$0.02.
- A typical 5-turn agent: ~$0.05–0.20.

Watch:

- **Output tokens dominate cost** (5× input). Set `max_tokens` reasonably.
- **Models matter.** Haiku is ~10× cheaper than Sonnet, ~5× faster. Route simple decisions to Haiku.
- **Long context costs add up.** A 200K context call is 40× more expensive than a 5K context call. Use RAG to keep contexts small.

## Latency

Most users feel an LLM response is "slow" above ~2 seconds. Things that help:

- **Stream the response.** Time-to-first-token is ~300–500ms; users tolerate long total time if tokens are flowing.
- **Cache the system prompt.** First token is faster on cache hits.
- **Run tool calls in parallel.** When the model emits multiple `tool_use` blocks, fire all of them concurrently.
- **Pick the right model.** Haiku is faster than Sonnet is faster than Opus. Use Haiku for routing.

## Safety and abuse

- **Prompt injection.** A web page or document the agent reads can contain "ignore previous instructions" attacks. Mitigations: separate untrusted input visually (XML tags), prompt the model to ignore instructions in retrieved content, gate destructive tools behind human confirmation. See `lessons/13_observability/` for a defensive-prompting demo.
- **PII leakage.** If your retrieved context contains personal data, the model can repeat it. Apply data minimization at indexing time.
- **Tool abuse.** A user can trick an agent into calling tools it shouldn't. Allow-list tools per scope; require confirmation for dangerous ones.

## Versioning and migration

You will change models. Plan for it.

- Pin the model version in code (`claude-sonnet-4-6`, not just `claude-sonnet`).
- Have an eval harness so you can compare old-vs-new before flipping.
- Test prompt-caching behavior — caches are not portable across model versions.

When Anthropic releases a new model, run your evals on it. Don't assume "newer = better for my task". Sometimes a smaller, faster model is the right move; sometimes the new model breaks a prompt that depended on the old one's quirks.

## A production checklist

Before shipping an LLM feature:

- [ ] Eval harness with at least 50 cases, covering golden path + edge cases + adversarial.
- [ ] Prompt caching configured for the system prompt and any reused context.
- [ ] Retries with backoff; non-retryable errors surfaced clearly.
- [ ] Cost and latency logged per request; dashboards for p50/p95/p99.
- [ ] Token budgets per request; circuit breaker when costs spike.
- [ ] Tool calls authorized per user/scope; destructive tools gated.
- [ ] Prompt-injection mitigations on any tool that ingests untrusted content.
- [ ] Model version pinned; rollback plan documented.
- [ ] Privacy review: no PII in logs unless required and access-controlled.

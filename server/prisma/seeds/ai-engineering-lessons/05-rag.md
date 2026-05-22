# 05 — Retrieval-Augmented Generation (RAG)

> Reference: [Retrieval-Augmented Generation (RAG)](https://docs.claude.com/en/docs/build-with-claude/retrieval)

**RAG** is the dominant pattern for "answer questions about my data". The recipe:

1. **Index time** (offline): chunk your documents → embed → store in a vector DB.
2. **Query time** (per request): embed the question → retrieve top-K chunks → put them in the prompt → ask Claude to answer.

That's it. The complexity is in making each step work well.

## Why RAG instead of just stuffing docs into the prompt?

Three reasons:

- **Cost.** A 1M-token context costs ~$3 of input per call. Retrieval narrows it to 5K tokens.
- **Latency.** Long contexts are slower to process.
- **Quality.** Models attend less reliably to information buried in long contexts ("lost in the middle"). Smaller, relevant context = better answers.

Caveat: with prompt caching + 1M context, sometimes "just put the whole doc in" is fine. Pick the simpler approach when it works.

## The chunking decision

Splitting documents into chunks is the single biggest quality lever in RAG.

| Strategy                  | What it does                                        | Use when                             |
| ------------------------- | --------------------------------------------------- | ------------------------------------ |
| **Fixed-size**            | Cut every N tokens                                  | Docs are uniform (logs, transcripts) |
| **Recursive character**   | Split on `\n\n` → `\n` → ` ` until small enough     | General prose                        |
| **Markdown / code aware** | Split on headings, function defs                    | Technical docs, code                 |
| **Semantic**              | Split where meaning shifts (cosine break detection) | High-value corpora; expensive        |

Always include **chunk overlap** (typically 10–20%) — a fact sitting on the chunk boundary will be missed otherwise.

Common starting point: **500-token chunks, 50-token overlap, recursive character splitter**.

## Top-K, but how many?

Default to **K=5** for question answering, **K=10–20** when feeding into a reranker, **K=50+** for heavy synthesis tasks.

More isn't always better. With K too high you (a) pay for tokens you don't need and (b) dilute the signal.

## The three failure modes of retrieval

| Failure                                    | Symptom                                               | Fix                                                                           |
| ------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Wrong chunk retrieved**                  | Top result doesn't actually answer the question       | Reranker; better query rewriting                                              |
| **Right info, missed by retrieval**        | Answer is in your corpus but K=5 didn't find it       | Hybrid search (vector + BM25); higher K + reranker                            |
| **Right info retrieved, model ignores it** | Chunk is in context but the answer pretends it wasn't | Tighter prompt ("Answer ONLY using…"); cite sources; use tool use to "ground" |

If your RAG is bad, you're hitting one of these three. Diagnosing _which_ is the actual work.

## Query rewriting

Users ask vague questions. "How do I do auth?" matches less well than "How do I configure OAuth 2.0 in version 2.x?".

Two patterns:

- **HyDE** (Hypothetical Document Embeddings): ask the LLM to write a _fake_ answer to the question, then embed _that_ and retrieve. Often retrieves better than embedding the question directly.
- **Multi-query**: ask the LLM to generate 3–5 reworded versions; retrieve from all; deduplicate.

Both add a Claude call before retrieval. Worth it for hard queries; overkill for "what's in this doc".

## Reranking

Vector search retrieves _similar_, not necessarily _relevant_. A reranker is a second-pass model (cross-encoder, often) that scores each (query, chunk) pair for true relevance.

Pattern: retrieve K=20 with vector search → rerank → keep top 5.

The Voyage AI `rerank-2` model and Cohere's `rerank-3` are the common picks. Both have free tiers.

## Hybrid search

Vector search excels at meaning. BM25 (keyword) excels at exact terms — IDs, function names, error codes. Hybrid search combines them with a weighted sum or **reciprocal rank fusion**.

You'll see this in lesson 07.

## Citations

When the model answers from retrieved chunks, surface _which chunk_. Two approaches:

1. **Tag each chunk with an ID** in the prompt (`<chunk id="42">…</chunk>`) and tell the model to cite IDs.
2. Use Claude's built-in [citation feature](https://docs.claude.com/en/docs/build-with-claude/citations), which returns citation spans alongside the answer automatically.

Always cite. Without citations, you can't tell hallucination from real answer.

## What to do next

Run [`lessons/06_rag_basic/`](../lessons/06_rag_basic/) for an end-to-end basic pipeline, then [`lessons/07_rag_advanced/`](../lessons/07_rag_advanced/) for reranking, hybrid search, and query rewriting.

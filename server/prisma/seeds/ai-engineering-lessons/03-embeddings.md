# 03 — Embeddings

> Reference: [Embeddings](https://docs.claude.com/en/docs/build-with-claude/embeddings)

An **embedding** is a vector — a list of floats, typically 384 to 3072 of them — that represents the meaning of a piece of text.

The miracle: texts with similar meaning produce vectors that point in similar directions, even if they share no words.

```text
"A cat sat on the mat."        → [ 0.12, -0.04, 0.88, ...]   (384 numbers)
"The feline rested on a  ̰rug."  → [ 0.10, -0.06, 0.89, ...]   ← very similar direction
"My WiFi is broken."           → [-0.31,  0.55, -0.20, ...]  ← different direction
```

## Why this is useful

- **Semantic search** — given a query, find the documents whose embeddings are closest. This is the "R" in RAG.
- **Clustering** — group related items even if they don't share keywords.
- **Classification** — train a tiny model on top of embeddings instead of fine-tuning the LLM.
- **Deduplication** — find near-duplicate texts without exact match.

## How similarity is measured

Two main metrics:

| Metric                | Formula                         | Range   | When to use                                        |
| --------------------- | ------------------------------- | ------- | -------------------------------------------------- |
| **Cosine similarity** | `cos(θ) = (a·b) / (\|a\|\|b\|)` | [-1, 1] | Default for text. Insensitive to vector magnitude. |
| **Euclidean (L2)**    | `sqrt(Σ(aᵢ - bᵢ)²)`             | [0, ∞)  | When magnitude matters (rare for text).            |

For text embeddings, **always start with cosine**. Most embedding models are trained with cosine in mind.

> Note: cosine similarity and "dot product on normalized vectors" are the same thing. If your library normalizes embeddings to unit length (most do), you can use cheap dot product as your similarity metric.

## Choosing an embedding model

Three trade-offs:

1. **Dimension** — More dimensions = more nuance, but more storage and compute. 384, 768, 1024, 1536, 3072 are common.
2. **Quality** — Measured on benchmarks like [MTEB](https://huggingface.co/spaces/mteb/leaderboard). Pay attention to the relevant subset (e.g. retrieval, not classification).
3. **Speed / cost** — Local (free, slower) vs. cloud (fast, paid).

This repo uses two:

| Model                                    | Why                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sentence-transformers/all-MiniLM-L6-v2` | 384-dim, runs on a Mac in milliseconds. Good for learning.                                                    |
| Voyage AI `voyage-3-large`               | 1024-dim, top-tier retrieval quality. Anthropic's recommended partner. Used when you have a `VOYAGE_API_KEY`. |

## What embedding models are _not_

- **Not LLMs.** They don't generate text. They turn text into vectors. (Some models share weights; the use case is different.)
- **Not magic.** They embed _meaning as captured by their training data_. A medical embedding model embeds medical concepts well; ask it about cricket and it shrugs.
- **Not stable across versions.** If you upgrade your embedding model, you must re-embed everything in your store. Embeddings from different models are not comparable.

## Practical concerns

### Chunking

You usually embed _chunks_ of documents, not whole documents. A 50-page PDF gets one summary embedding that captures everything badly. Better: split into ~500-token chunks; each gets an embedding; retrieval finds the relevant chunks. See [`05-rag.md`](05-rag.md).

### Caching

Embeddings are deterministic for a given (text, model) pair. Cache them. Don't re-embed the same text twice.

### Normalization

Most modern embedding APIs return unit-normalized vectors already. If you're storing them in a vector DB, check whether the DB also normalizes (some do, some don't). If both normalize, you're fine. If neither does, your distances are wrong.

## What to do next

Run [`lessons/04_embeddings/`](../lessons/04_embeddings/). You'll generate embeddings for a small set of sentences, compute cosine similarity, and visualize them in 2D with PCA — you'll _see_ the clustering.

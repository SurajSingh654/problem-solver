# 04 — Vector databases

A **vector database** stores embeddings and finds the nearest neighbors of a query vector quickly.

## Why you need one

You have 100,000 document chunks, each with a 1024-dim embedding. A user types a question. You embed the question and want the top-5 most similar chunks.

Naive approach: compute cosine similarity between the query and all 100,000 vectors. That's 100,000 dot products on 1024-dim vectors — doable, but it's `O(N)` per query and gets ugly fast at scale.

Vector DBs use **approximate nearest neighbor (ANN)** indexes that find the top-K in roughly `O(log N)` time, trading a small amount of recall for huge speedups.

## How HNSW works (the dominant index)

**HNSW** = Hierarchical Navigable Small World. Imagine a multi-layer graph:

- The top layer has just a few nodes — well-spread sentinels.
- Each lower layer adds more nodes, connecting close neighbors.
- The bottom layer has every vector.

To search:

1. Start at a top-layer entry point.
2. Greedily walk to the neighbor closest to the query.
3. When you can't get closer, drop a layer and continue.
4. At the bottom, return the closest K.

The result: you visit a logarithmic fraction of the graph instead of the whole thing. Recall is typically 95–99% of brute force at fractions of the cost.

> Other indexes you'll hear about: **IVF** (inverted file, partition-based), **PQ** (product quantization, compresses vectors). HNSW is the modern default.

## Vector DBs you'll encounter

| DB           | Embed                      | Best for                                          |
| ------------ | -------------------------- | ------------------------------------------------- |
| **ChromaDB** | In-process, file-backed    | Learning, small projects. Used in this repo.      |
| **Qdrant**   | Self-hostable server, Rust | Production self-hosted. Best balance of features. |
| **Weaviate** | Self-hostable server, Go   | Hybrid search, schema-rich.                       |
| **pgvector** | Postgres extension         | When you already run Postgres.                    |
| **Pinecone** | Managed cloud              | Don't want to run anything.                       |
| **LanceDB**  | File-backed, columnar      | Multi-modal, large scale on disk.                 |

You'll learn ChromaDB hands-on. The concepts transfer to all of them.

## What's stored

A vector DB record typically contains:

| Field       | Example                                                  | Why                              |
| ----------- | -------------------------------------------------------- | -------------------------------- |
| `id`        | `"doc:guide.pdf#chunk:42"`                               | Unique key                       |
| `embedding` | `[0.12, -0.04, ...]`                                     | The vector for similarity search |
| `document`  | `"...the actual text..."`                                | Returned to the LLM as context   |
| `metadata`  | `{"source": "guide.pdf", "page": 12, "section": "Auth"}` | Filtering and citation           |

**Metadata filtering is critical.** A query like _"How do I configure auth in v2?"_ can be served much better by retrieving from `{version: "v2", section: "Auth"}` first, _then_ doing similarity search inside that filter.

## What vector DBs are bad at

- **Exact match.** "Find documents containing the literal string `OAUTH2_CLIENT_ID`" — use BM25 or full-text search instead.
- **Recency.** Embeddings have no notion of time. Add a `timestamp` to metadata and filter/boost by it.
- **Reasoning.** They find similar text. They don't understand _why_ it's relevant. That's the LLM's job, with the retrieved chunks as input.

This is why **hybrid search** (vector + keyword) and **rerankers** (a smarter model re-scoring top-K) exist. See lesson 07.

## What to do next

Run [`lessons/05_vector_db/`](../lessons/05_vector_db/). You'll create a Chroma collection, add documents, query it, and see metadata filtering in action.

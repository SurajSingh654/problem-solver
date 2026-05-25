// ============================================================================
// AI Engineering — Day-1 Calibration Quiz
// ============================================================================
//
// 8 multiple-choice questions across the spine concepts. The bank is the
// source of truth for the calibration UI; admin reviews changes via PR
// (no separate DB table for v1 — the JSON column on TopicEnrollment.calibration
// stores the result).
//
// Authoring rules:
//   - One correct answer per question (key A/B/C/D).
//   - Distractors are plausible-but-wrong (common misconceptions from the
//     lesson primers — see server/prisma/seeds/ai-engineering-lessons/).
//   - Rationale explains WHY the correct answer is correct AND why the
//     most-tempting distractor is wrong; surfaced in the result screen.
//   - Don't change `id` after first ship — TopicEnrollment.calibration JSON
//     stores per-question correctness keyed by id.
//
// Sources are the lesson primers themselves (drafted in this session).
// ============================================================================

const QUESTIONS = [
  {
    id: "ae-1",
    conceptSlug: "llm-fundamentals",
    prompt: "What is a 'token' in an LLM, and why does it matter?",
    choices: [
      { key: "A", text: "A token is one English word — input cost equals word count." },
      { key: "B", text: "A subword unit (~0.75 of an English word on average) — cost, context window, and latency are all measured in tokens." },
      { key: "C", text: "An authentication credential the model uses to validate API requests." },
      { key: "D", text: "A single character — context length is measured in characters." },
    ],
    correct: "B",
    rationale:
      "Tokens are subword units produced by the tokenizer (~0.75 of an English word on average). Cost is billed per input + output token, the context window is measured in tokens, and output-token count drives latency. (A) and (D) are common but wrong intuitions about granularity; (C) confuses LLM tokens with auth tokens.",
  },
  {
    id: "ae-2",
    conceptSlug: "llm-fundamentals",
    prompt: "Why is `temperature=0` not fully deterministic across runs?",
    choices: [
      { key: "A", text: "Because the model adds random noise to outputs even at temperature 0." },
      { key: "B", text: "Because temperature 0 enables top-k sampling internally." },
      { key: "C", text: "Floating-point math, batching, and GPU non-determinism mean the same input can pick different next tokens — closer to deterministic, not equal." },
      { key: "D", text: "Because the cache returns slightly different prefixes on each call." },
    ],
    correct: "C",
    rationale:
      "Temperature 0 means 'always pick the highest-probability token,' but floating-point ordering, GPU kernel scheduling, and request batching can flip near-tied probabilities differently between runs. Treat temperature 0 as 'closer to deterministic,' not equal to it.",
  },
  {
    id: "ae-3",
    conceptSlug: "prompting",
    prompt: "Where do stable instructions (role, output format, hard rules) belong, and why?",
    choices: [
      { key: "A", text: "In the user message — closest to the question, so the model attends to them." },
      { key: "B", text: "In the system prompt — stable across calls, cacheable, and the model treats them as policy." },
      { key: "C", text: "In the assistant prefill — guarantees the model follows them." },
      { key: "D", text: "Repeated in every message — prevents the model from forgetting." },
    ],
    correct: "B",
    rationale:
      "System prompts are designed to carry stable role, style, and output-format instructions; they're prompt-cacheable (~50–90% input cost reduction at scale) and the model treats them as policy. Per-request data goes in the user message; the assistant prefill is for nudging output format. Repeating instructions every turn is wasteful and breaks caching.",
  },
  {
    id: "ae-4",
    conceptSlug: "embeddings",
    prompt: "Two texts produce embeddings that point in similar directions. What does that primarily indicate?",
    choices: [
      { key: "A", text: "They share many of the same words." },
      { key: "B", text: "They have similar lengths." },
      { key: "C", text: "They have similar meaning, even if they share no words." },
      { key: "D", text: "They were authored by the same person." },
    ],
    correct: "C",
    rationale:
      "Embeddings capture meaning as learned by the model, not surface form. 'A cat sat on the mat' and 'The feline rested on a rug' embed to similar directions despite zero overlapping content words. Length and authorship are unrelated; word overlap is what BM25 / keyword search uses, which is exactly the failure mode embeddings fix.",
  },
  {
    id: "ae-5",
    conceptSlug: "vector-databases",
    prompt: "Which is HNSW (and vector search in general) bad at?",
    choices: [
      { key: "A", text: "Approximate nearest-neighbor recall on millions of vectors." },
      { key: "B", text: "Exact-string matches like a specific function name or error code." },
      { key: "C", text: "Returning a configurable top-K." },
      { key: "D", text: "Filtering by metadata fields like version or section." },
    ],
    correct: "B",
    rationale:
      "Vector search excels at semantic similarity. Exact matches on tokens like `OAUTH2_CLIENT_ID` are BM25 / full-text-search territory — that's why hybrid search (vector + keyword) exists. (A) and (C) are core strengths; metadata filtering (D) is a standard and important feature in modern vector DBs.",
  },
  {
    id: "ae-6",
    conceptSlug: "rag",
    prompt: "Your RAG system returns confidently wrong answers. Which is NOT one of the three canonical retrieval failure modes you should diagnose?",
    choices: [
      { key: "A", text: "The wrong chunk was retrieved (top result doesn't answer the question)." },
      { key: "B", text: "The right info exists in your corpus but retrieval missed it (recall failure)." },
      { key: "C", text: "The right info was retrieved, but the model ignored it." },
      { key: "D", text: "The embedding model is using cosine instead of Euclidean similarity." },
    ],
    correct: "D",
    rationale:
      "The three failure modes are: wrong chunk retrieved, right info missed, right info retrieved but ignored. Each has a different fix (reranker; hybrid search; tighter grounding prompt). (D) is a red herring — cosine is the correct default for text embeddings; flipping to Euclidean wouldn't be the source of confidently wrong answers.",
  },
  {
    id: "ae-7",
    conceptSlug: "tool-use",
    prompt: "How is tool use best described to a teammate who's never seen it?",
    choices: [
      { key: "A", text: "A single API call — the model returns either an answer or a tool result." },
      { key: "B", text: "A multi-turn dance: the model describes the call, your code executes it, you feed the result back, and the loop can continue." },
      { key: "C", text: "The model directly executes functions on your server using a sandbox." },
      { key: "D", text: "Like RAG, but the retrieval source is a function instead of a document store." },
    ],
    correct: "B",
    rationale:
      "Tool use is multi-turn by design. The model emits a `tool_use` block describing the call (with arguments). YOUR code decides whether to run it, runs it, and feeds the result back as a `tool_result` content block in a `user` message — at which point the loop can continue. The model never executes anything itself; you stay in control.",
  },
  {
    id: "ae-8",
    conceptSlug: "evaluations",
    prompt: "When grading open-ended LLM outputs, why is pairwise comparison (\"which of A or B is better?\") preferred over absolute 1–5 scoring?",
    choices: [
      { key: "A", text: "Pairwise calls are cheaper than scoring calls." },
      { key: "B", text: "Pairwise judgments are far more reliable than absolute scores; humans (and LLM judges) are noisier on absolute scales than on relative ones — this is why RLHF training data is pairwise." },
      { key: "C", text: "Absolute scoring is biased toward shorter answers." },
      { key: "D", text: "Pairwise eliminates the need for reference answers entirely." },
    ],
    correct: "B",
    rationale:
      "Both humans and LLM judges anchor and drift on absolute scales (the same answer scored 3/5 today might be 4/5 tomorrow), but they're consistent on relative judgments. RLHF preference data is pairwise for exactly this reason. (A) is incidental at best; (C) is a separate bias (length bias affects pairwise too — mitigate by length-normalizing); (D) is wrong — you still need reference answers to ground the comparison.",
  },
];

export default QUESTIONS;

# 10 — Evaluations

> Reference: [Evaluating prompts](https://docs.claude.com/en/docs/test-and-evaluate/develop-tests)

If you can't measure your AI system, you can't improve it. **Evals** are the unit tests of LLM apps.

## Why LLM evals are hard

For a sort function, the test is `sorted([3, 1, 2]) == [1, 2, 3]`. Easy.

For "Did the agent answer the user's question correctly?":

- **There's often more than one right answer.** "Paris" and "It's Paris, the capital of France" are both correct.
- **Stylistic differences.** Verbosity, tone, formatting all vary across runs.
- **Non-determinism.** Same input, slightly different output.
- **Cost.** Running 1,000 evals = 1,000 LLM calls.

The trick is to design the eval so it's _repeatable enough to be informative, not so strict it rejects valid answers_.

## Eval types, simplest to hardest

### 1. Exact / regex match

Use when the output is structured: a number, a label, a JSON field.

```python
assert response["intent"] == "refund"
assert re.match(r"^\d{4}-\d{2}-\d{2}$", response["date"])
```

Fast, cheap, deterministic. **Always start here** if your task allows it.

### 2. String similarity (BLEU, ROUGE, etc.)

For tasks with a known reference answer, like translation. These metrics are mediocre for open-ended QA.

### 3. Embedding similarity to a reference

Embed the model output and the reference answer; require cosine similarity > threshold. Looser than exact match, tighter than free-form. Good for "does it contain roughly this answer".

### 4. LLM-as-judge

Ask another LLM (Claude!) to grade the output against a rubric. The most flexible; the most expensive; the most subject to bias.

```python
JUDGE_PROMPT = """
You are grading an AI's answer to a user question.

User question: {q}
AI's answer: {a}
Reference answer: {ref}

Score 1-5 on:
- Correctness (does it match the reference's facts)
- Helpfulness (does it actually answer the question)

Return JSON: {"correctness": int, "helpfulness": int, "reasoning": str}
"""
```

Known LLM-judge biases:

- **Position bias** — judges prefer the first option presented.
- **Length bias** — longer answers often score higher even when not better.
- **Same-model bias** — Claude judging Claude scores Claude higher than GPT does.

Mitigations: shuffle order, length-normalize, judge with a _different_ model than the one being evaluated.

### 5. Pairwise comparison (preferred over scoring)

Instead of "score this answer 1–5", show the judge two answers (A and B) and ask "which is better?". Pairwise judgments are far more reliable than absolute scores. This is what RLHF training data uses.

## Building an eval harness

A useful eval harness has:

- **Test cases**: a list of `(input, expected, metadata)` tuples. Start with 20; grow to hundreds.
- **A grader** — one of the methods above.
- **A runner** — calls the system under test, applies the grader, aggregates results.
- **Reports** — pass rate, per-category breakdown, regression vs. previous run.

The capstone has a working harness in `project/src/learning_assistant/evals/`, exercised in [`lessons/12_evals/`](../lessons/12_evals/).

## What to evaluate

- **Retrieval quality** — for a known query, are the right chunks in top-K? (recall@K, MRR)
- **Answer quality** — given the retrieved chunks, is the final answer good? (LLM-judge or pairwise)
- **End-to-end** — given the user's raw question, does the system answer it?
- **Failure modes** — adversarial inputs (typos, prompt injections, out-of-scope questions). Does the system fail gracefully?

Run all four. Each tells you about a different layer.

## What to do next

Build the eval harness in [`lessons/12_evals/`](../lessons/12_evals/) and run it against the capstone before _and_ after a change to see whether the change actually helps.

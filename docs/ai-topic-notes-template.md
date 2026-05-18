# AI Topic Notes — Template

> **How to use this doc:** when starting a new AI/ML concept (an architecture, a training technique, a loss function, a theory, a library), run this template top-to-bottom. Each section has: what it's for, what good output looks like, the discipline rule, and how to know you're done. The worked example at the bottom shows what a fully-filled template looks like for **Backpropagation** — copy that depth and rigor for every concept you study. Refine the template as your skill ceiling rises.

---

## Why this template exists

AI is uniquely demanding among technical fields because it sits at the intersection of **four** literacies:

1. **Math** — you can't actually understand attention without seeing the QKᵀ matrix multiply.
2. **Code** — you can't *use* anything until you've implemented it, even crudely.
3. **Intuition** — you need a mental model that survives forgetting the details.
4. **Empirical results** — what works on benchmarks vs. what works in production are different worlds.

Most learners pick one or two and skip the rest. Their understanding leaks. The candidate who memorizes the Transformer paper but can't write attention from scratch will fail any serious interview. The engineer who can fine-tune HuggingFace but doesn't know what gradient descent *is* will silently break things and not notice.

**This template forces all four.** Skipping a section means leaving a gap you'll trip over later.

### The cognitive science behind the structure

These principles are baked into the section order — knowing why helps you not skip them:

| Principle | Where it appears |
|---|---|
| **Feynman Technique** — if you can't explain it simply, you don't understand it | §3 Mental model, §13 Interview script |
| **Worked example effect** (Sweller) — explicit step-through reduces cognitive load | §6 Worked example by hand, bottom of doc |
| **Generation effect** (Slamecka & Graf) — producing answers > re-reading | §7 Implementation, §15 Self-test |
| **Productive failure** (Kapur) — try before you read = stronger encoding | §3 Mental model (write yours BEFORE reading others) |
| **Dual coding** (Paivio) — words + visuals → 2× retention | §5 Visualization is mandatory, not optional |
| **Spaced repetition** (Ebbinghaus, Bjork) — review schedule beats marathon study | §15 Self-test, §16 Action items |
| **Bloom's taxonomy** — Remember → Understand → Apply → Analyze → Evaluate → Create | Section progression mirrors this |
| **Elaboration & connection** — link new to old to lock it in | §10 Compared to alternatives, §12 Research lineage |

---

## Adapting the template to topic type

Not every section is equally heavy for every topic. Lean into the right ones:

| Topic type | Heaviest sections | Lighter sections |
|---|---|---|
| **Architecture** (Transformer, ResNet, U-Net, GNN) | §4 First principles, §5 Visualization, §7 Implementation, §10 Compared to alternatives | §11 Real-world (often obvious) |
| **Training technique** (Adam, BatchNorm, Dropout, LR schedule) | §8 Hyperparameters, §9 Failure modes, §10 Compared to alternatives | §6 Worked example (math is shorter) |
| **Loss function** (cross-entropy, focal, contrastive, KL) | §4 First principles, §6 Worked by hand, §10 Compared to alternatives | §11 Real-world |
| **Theory** (VC dim, info theory, NTK, scaling laws) | §3 Mental model, §4 First principles, §14 Open questions | §7 Implementation (often inapplicable) |
| **Application / pipeline** (NER, RAG, fine-tuning, RLHF) | §6 Worked example, §7 Implementation, §11 Real-world, §9 Failure modes | §4 First principles |
| **Library / tool** (PyTorch idioms, HF Transformers, vLLM) | §7 Implementation, §8 Hyperparameters, §11 Real-world | §4 First principles |

The template stays the same; the *weight* shifts. Don't skip sections — write less, but write something honest.

---

# The 16-Section Framework

---

## Quick reference (always fill — top of every note, scannable)

A 6-bullet summary you can re-read in 30 seconds when you encounter the term again later. Forces you to compress before expanding.

```
- Family: <architecture | optimizer | loss | regularization | theory | technique | application>
- One-line definition: <≤ 25 words>
- Key hyperparameters: <2-4 most-tuned>
- When to use it: <one situation>
- When NOT to use it: <one situation>
- Famous failure mode: <one bug or pathology>
- Canonical paper / source: <author, year, ≤ 8 words on what it proved>
```

### Discipline rule

**Fill the Quick Reference FIRST and LAST.** First pass = your initial guess (forces commitment). Last pass = the version you trust after writing the full note. The drift between the two reveals what you actually learned.

---

## 1. The 30-second pitch

What this is, in **plain English**, with **zero jargon**. If your dad asked "what's a Transformer," what would you say? That's the bar.

### What good looks like

> "A Transformer is a neural network architecture that processes a sequence of tokens (words, image patches, whatever) by letting each token *look at every other token in parallel* and decide which ones matter. It replaced RNNs because RNNs had to read tokens one by one — like reading a book through a straw — while Transformers see the whole page at once."

### What weak looks like

> "A Transformer is a neural network with self-attention layers and feedforward layers using residual connections and layer normalization that achieves state-of-the-art performance on many sequence-to-sequence tasks."

(Restating the paper is not a pitch.)

### Discipline rule

**No equations, no acronyms in this section.** If you need them, you don't have the pitch yet.

### How to know you're done

You can deliver it from memory, with no notes, in under 30 seconds, to someone outside the field, and they nod.

---

## 2. The problem it solves

What was painful **before** this existed? What was the dominant alternative? What metric did this improve, and by how much?

### What good looks like

A short three-part story:

1. **Before:** "RNNs/LSTMs had to process tokens sequentially. Long sequences forgot early tokens (the vanishing-gradient story). Training was slow because parallelism was capped by sequence length."
2. **The frustration:** "Translating a 100-word sentence took ~100 sequential steps. Bigger models on bigger data plateaued because you couldn't parallelize."
3. **The improvement:** "Transformers ('Attention Is All You Need', Vaswani et al. 2017) parallelized the entire sequence. BLEU on WMT'14 EN-DE went from 24.6 (best LSTM) → 28.4 (Transformer). Same compute, dramatically faster training."

### Discipline rule

**Cite at least one number.** "It was better" is hand-wavy. "BLEU 28.4 vs 24.6" is a fact you can hold.

### How to know you're done

You can name the predecessor, the painful failure mode, and at least one quantitative win.

---

## 3. Mental model

The **analogy** that makes the concept click. The image you reach for when explaining it.

This is the most important section in the doc. Without a mental model, you have memorized facts that decay. With one, you have a *stable representation* that decays slower than the facts and can re-derive them.

### What good looks like

> "Attention is **library lookup with soft matches**. Each query (Q) walks into a library, asks 'who's most relevant to me?' Each book has a key (K) and a content (V). Q's similarity to each K becomes a *weight*. The output is a weighted blend of all V's — books that matched strongly contribute more, books that matched weakly contribute less. The 'softness' (no exact match needed) is what makes it a *neural* lookup vs. a hash table."

### Discipline rule

**Write your mental model BEFORE reading anyone else's.** This is the *productive failure* principle — your first attempt is wrong but useful, and the gap between yours and the right one is what locks the concept in. After reading authoritative sources, *update* your model with the new insight; don't replace it wholesale.

### How to know you're done

Six months from now, having forgotten the math, the analogy alone lets you re-derive how the thing roughly works.

---

## 4. First-principles derivation

The **math from scratch**. Start at the simplest case (1 input, 1 output, scalar). Build up to general (batched, multi-dim). Annotate every dimension.

### What good looks like

```
Goal: scaled dot-product attention.

Inputs:  Q ∈ R^(n × d_k)        [n queries, each of dimension d_k]
         K ∈ R^(n × d_k)        [n keys]
         V ∈ R^(n × d_v)        [n values]

Step 1 — score.
  S = Q · K^T          shape: (n × d_k) · (d_k × n) = (n × n)
  Each S[i,j] = how much query i relates to key j.

Step 2 — scale.
  S' = S / sqrt(d_k)
  Why divide? At large d_k, raw dot products grow ~sqrt(d_k) in magnitude.
  Without scaling, softmax saturates → ~zero gradient.

Step 3 — normalize.
  A = softmax(S')      shape: (n × n)
  Row i sums to 1: each query's attention weights are a distribution.

Step 4 — blend.
  Out = A · V          shape: (n × n) · (n × d_v) = (n × d_v)
  Output i = weighted sum of values, weights from row i.
```

### Discipline rule

**Annotate every shape.** A wall of equations without dimensions is unreadable in three months. With dimensions, it's a recipe.

### How to know you're done

Given only this section, you could implement the topic in numpy from scratch.

---

## 5. Visualization

You're a visual species. **Draw the thing.** Multiple perspectives if needed.

### What kinds of visualizations actually help

| Topic type | Visualization to draw |
|---|---|
| Architecture | Computation graph (boxes + arrows; data shapes annotated) |
| Optimizer | Loss-landscape contour with the path of updates |
| Attention | Heatmap (rows=query tokens, cols=key tokens, color=weight) |
| Embedding | t-SNE / UMAP scatter, colored by class |
| Decision boundary | 2D scatter with the classifier's contour overlaid |
| Loss / metric over time | Line chart, ideally on log scale |
| Probability | Density plot or histogram |
| Information flow | Sankey diagram |

### Three tiers of visualization (use all when relevant)

**Tier 1 — ASCII / text diagram.** Always doable in markdown. Computation graphs, simple architectures.

```
Input x  ──►  [W₁ · x + b₁]  ──►  ReLU  ──►  [W₂ · h + b₂]  ──►  softmax  ──►  ŷ
                                                                                │
                                                                                ▼
                                                                              loss(ŷ, y)
```

**Tier 2 — Runnable plot snippet.** Save as a code block. Run it, paste the output image as a markdown link `![](attention-heatmap.png)` next to it.

```python
import matplotlib.pyplot as plt
import torch
# ... compute attention weights ...
plt.imshow(attn_weights, cmap='viridis')
plt.colorbar()
plt.xlabel('Key tokens')
plt.ylabel('Query tokens')
plt.savefig('attention-heatmap.png', dpi=120, bbox_inches='tight')
```

**Tier 3 — Descriptive prose.** When the visualization is conceptual, not data-driven.

> "Picture a 3D loss landscape: rolling hills with one deep valley (the global minimum) and many shallow basins (local minima). SGD is a marble that bounces around, escaping shallow basins. Adam is a heavier marble with momentum AND adaptive friction per dimension."

### Discipline rule

**At least one Tier 1 (ASCII) diagram per note, always.** It forces you to articulate the *structure*, not just the math. Tier 2 and 3 are optional but recommended for non-trivial topics.

### How to know you're done

A peer with no context can look at your visualization and approximately understand the data flow / computation / geometry.

---

## 6. Worked example by hand

The **smallest possible inputs** traced through, by hand, with **real numbers**.

This is where understanding solidifies. Symbols can be moved around without comprehension; **numbers cannot lie**. If your forward pass produces `[0.7, 0.2, 0.1]` and you can't say *why* the first class won, you don't understand it.

### What good looks like

For a 2-layer net with 1 input, 2 hidden, 1 output:

```
Input:  x = 0.5
Weights: W₁ = [0.3, 0.7]   b₁ = [0.1, -0.2]
         W₂ = [0.4, -0.5]  b₂ = 0.05

Forward pass:
  z₁ = W₁ · x + b₁ = [0.3·0.5 + 0.1, 0.7·0.5 - 0.2]
                  = [0.25, 0.15]
  h  = ReLU(z₁)   = [0.25, 0.15]    (both positive → unchanged)
  z₂ = W₂ · h + b₂ = 0.4·0.25 + (-0.5)·0.15 + 0.05
                   = 0.1 - 0.075 + 0.05 = 0.075
  ŷ  = sigmoid(0.075) ≈ 0.519

Loss (target y=1, BCE):
  L = -log(0.519) ≈ 0.656
```

### Discipline rule

**Pick the smallest inputs that exercise every component.** For attention, n=2 tokens with d_k=2. For backprop, 1-input-2-hidden-1-output. Bigger and you're doing arithmetic; smaller and you skip parts.

### How to know you're done

You hand-traced both forward AND backward passes (when applicable), with numbers, and the numbers match what your code would produce.

---

## 7. Implementation

**Runnable code.** Two tiers when possible:

1. **Numpy from scratch** — strips away framework magic. Forces you to confront the math.
2. **PyTorch / framework idiomatic** — what production looks like.

### What good looks like

```python
# ── Tier 1: numpy, no autograd, ~20 lines ─────────────────────────────
import numpy as np

def softmax(x, axis=-1):
    x = x - x.max(axis=axis, keepdims=True)   # numerical stability
    e = np.exp(x)
    return e / e.sum(axis=axis, keepdims=True)

def scaled_dot_product_attention(Q, K, V):
    """
    Q, K: (n, d_k)
    V:    (n, d_v)
    returns out: (n, d_v), attn: (n, n)
    """
    d_k = Q.shape[-1]
    scores = Q @ K.T / np.sqrt(d_k)            # (n, n)
    attn   = softmax(scores, axis=-1)
    out    = attn @ V                          # (n, d_v)
    return out, attn

# Tiny test
np.random.seed(0)
Q = np.random.randn(3, 4)
K = np.random.randn(3, 4)
V = np.random.randn(3, 5)
out, attn = scaled_dot_product_attention(Q, K, V)
print('output shape:', out.shape)               # (3, 5)
print('attention rows sum to 1:', attn.sum(-1)) # ~[1, 1, 1]
```

```python
# ── Tier 2: PyTorch idiomatic, with batching ──────────────────────────
import torch, torch.nn.functional as F

def attention(Q, K, V, mask=None):
    # Q, K: (B, n, d_k) ; V: (B, n, d_v)
    d_k = Q.size(-1)
    scores = Q @ K.transpose(-2, -1) / d_k**0.5         # (B, n, n)
    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))
    attn = F.softmax(scores, dim=-1)
    return attn @ V, attn
```

### Discipline rule

**Run the code.** Don't just stare at it. Pasting and watching the output is what reveals the off-by-one bugs and dimension mistakes that "looking" misses. Save the output (shapes, sample values) IN the note so future-you sees what success looks like.

### How to know you're done

You ran the code, saved actual outputs, and you can match them to the worked example in §6.

---

## 8. Hyperparameters and what they do

A **table**: every meaningful hyperparameter, with default, range, what it controls, and what goes wrong at the extremes.

### What good looks like

| Hyperparameter | Default | Typical range | Controls | Symptom if too high | Symptom if too low |
|---|---|---|---|---|---|
| Learning rate | 1e-3 (Adam) | 1e-5 — 1e-2 | Step size | Loss explodes / NaN | Loss flat or training stalls |
| Batch size | 32–256 | 8 — 4096 | Gradient noise / parallelism | Memory OOM; sometimes generalization drops | Slow training; noisy loss |
| Weight decay | 1e-4 | 0 — 1e-1 | L2 regularization | Underfits | Overfits |
| Warmup steps | 1000 | 100 — 10k | LR ramp at start | Late-training instability | Training stalls or diverges early |
| Dropout | 0.1 | 0 — 0.5 | Regularization | Underfits, slow convergence | Overfits |

### Discipline rule

**For each row, name a real symptom you can detect.** "Loss explodes" is observable; "model doesn't generalize" is too vague.

### How to know you're done

Given a misbehaving training run, you can use this table as a debugging flowchart.

---

## 9. Common failure modes

What goes wrong, why, and how to spot it. Each entry: **symptom, cause, fix, early-warning sign.**

### What good looks like

```
Failure 1 — Vanishing gradients in deep nets.
  Symptom:   Loss plateaus early; layer 0 weights barely change.
  Cause:     Sigmoid/tanh saturate → derivative → 0 → product of small
             gradients → exponentially small at deep layers.
  Fix:       Use ReLU/GELU; residual connections; LayerNorm; proper init
             (He / Xavier).
  Detect early: Plot per-layer gradient norms. Layer 0 << layer N → broken.

Failure 2 — Softmax saturation in attention.
  Symptom:   One attention weight ≈ 1.0; rest ≈ 0; gradients vanish on
             those rows.
  Cause:     Raw dot products at large d_k grow ~sqrt(d_k); softmax
             approaches one-hot.
  Fix:       The 1/sqrt(d_k) scaling step (literally why it's there).
  Detect early: Plot attention entropy over training. Plummeting to 0 →
                problem.
```

### Discipline rule

**At least 3 failure modes.** Every non-trivial AI concept has them. If you only have one, you haven't read enough.

### How to know you're done

You can predict, before running, what's likely to go wrong with this technique on a new problem.

---

## 10. Compared to alternatives

A **decision-tree or table** of "use X over Y when…". This is what makes you useful in code review and design discussions.

### What good looks like

| You want | Use | Don't use | Why |
|---|---|---|---|
| Sequence-to-sequence on long inputs | Transformer | LSTM | Parallelism + long-range dependencies |
| Sequence on short inputs, low compute | LSTM/GRU | Transformer | Lower constant overhead, less memory |
| Streaming / online generation | Linear attention / state-space | Vanilla Transformer | O(n) per token vs O(n²) |
| Tiny dataset (<10K examples) | Pretrained + fine-tune | Train from scratch | Inductive bias from pretrain |
| Inference latency-critical | Distilled / quantized model | Full model | Latency ceiling matters |

### Decision tree (alternative form)

```
Need to model a sequence?
├── Length < 100 + low compute        → LSTM/GRU
├── Length < 10K + plenty of compute  → Transformer
├── Length > 10K (long context)       → Sparse attention / Mamba / RWKV
└── Streaming inference required      → Linear attention or RNN-like state-space
```

### Discipline rule

**Each "use X" needs a criterion.** "It's better" is not a criterion. "Latency under 50ms" is.

### How to know you're done

You can choose between alternatives without re-deriving them every time.

---

## 11. Real-world usage

Where is this in **production today**? At what scale? With what latency? With what known compromises?

### What good looks like

> Transformer attention is the backbone of every modern LLM.
> - **GPT-4, Claude, Gemini, Llama**: all use multi-head attention; recent variants (e.g., grouped-query attention in Llama 3) trade quality for inference cost.
> - **Production latency**: ~50ms first-token for a 7B model on a single A100 with FlashAttention; ~200ms for full 256-token generation.
> - **Cost driver**: KV cache memory at long contexts. A 70B model at 32K context uses ~40GB of KV cache per request — half the memory of the model itself.
> - **Open-source implementations**: HuggingFace `transformers`, `xformers`, FlashAttention-2, vLLM, exllamav2.

### Discipline rule

**Cite real numbers and real systems.** "Used in many systems" is wallpaper.

### How to know you're done

You know the rough cost / latency / scale at which this technique runs in production, and the commonly-used optimization (e.g., FlashAttention for attention).

---

## 12. Research lineage

Predecessors → this paper → successors. With dates and one-line takeaways. This is how you avoid reinventing things and how you anticipate where the field is going.

### What good looks like

```
Predecessors
  • Bahdanau et al. 2014 — first "attention" mechanism for neural translation;
    weighted sum of encoder states.
  • Luong et al. 2015 — multiplicative variant; introduced the QKᵀ shape.

Canonical
  • Vaswani et al. 2017 — "Attention Is All You Need." Eliminated recurrence
    entirely. Multi-head attention + positional encoding + residual + LayerNorm.

Successors
  • BERT 2018 — encoder-only, masked LM pretraining.
  • GPT 2018 → 2023 — decoder-only, causal LM, scaled.
  • Vision Transformer 2020 — applied to image patches.
  • FlashAttention 2022 — IO-aware exact attention; 2-4× faster, 10× less memory.
  • Mamba / state-space 2023 — rivals on long sequences, no attention at all.
```

### Discipline rule

**Date every paper.** Helps you track *when* the consensus shifted.

### How to know you're done

Given a new paper that cites this technique, you can place it in the timeline above and know its likely contribution category.

---

## 13. The interview / explanation script

A **45-second verbal explanation** + **3 likely follow-ups** with answers.

### What good looks like

> **Setup (45s):** "Attention is a way for each token in a sequence to selectively attend to others. We compute three projections of each token: Q, K, V. The score between tokens i and j is Q_i · K_j, scaled by 1/√d_k for numerical stability. We softmax across keys to get a probability distribution, then take a weighted sum of values. Multi-head means we do this in parallel across multiple lower-dim subspaces, then concatenate. Positional encodings let the model know token order. Time is O(n²) in sequence length."
>
> **Follow-up: "Why divide by √d_k?"** "At large d_k, raw dot products grow with √d_k — the variance scales linearly. Without the scaling, softmax saturates to near one-hot, killing the gradient on most attention rows. The 1/√d_k normalizes the variance back to ~1."
>
> **Follow-up: "What's the time and memory cost?"** "Time is O(n² · d). Memory is O(n²) for the attention matrix. That's why long-context is hard — at 32K tokens, the n² matrix is 4 GB at fp16, just for storage. FlashAttention computes it in tiles to avoid materializing the full matrix in HBM."
>
> **Follow-up: "Why multi-head instead of one big head?"** "Different heads can specialize: one for syntactic relations, one for coreference, one for distant tokens. The concat-and-project at the end is a learned mixture. Empirically, 8-16 heads outperforms one wide head at the same parameter count."

### Discipline rule

**Read it out loud.** The interview is verbal; rehearse verbally. Your written script is the floor; the spoken version should be a notch tighter.

### How to know you're done

You can deliver the setup + 3 follow-ups in <3 minutes, no notes, with confidence.

---

## 14. Open questions and what I don't yet understand

Honest gaps. **The gaps are the next study.**

### What good looks like

> 1. I don't fully understand WHY positional encoding via sinusoids works as well as learned positional embeddings. They're not the same function class — what's going on?
> 2. I've never derived the gradient of softmax + cross-entropy by hand. I should.
> 3. RoPE (rotary positional embeddings) are now the default in modern LLMs but I haven't read the paper.
> 4. How exactly does FlashAttention avoid materializing the n×n matrix? I've read "tiling" but not traced it.

### Discipline rule

**Be specific.** "I don't fully understand attention" is not a question — it's a vibe. "I don't understand why the QK softmax row sums to 1 by construction" IS a question.

### How to know you're done

Each open question is concrete enough that you'd recognize the answer if you saw it.

---

## 15. Self-test (for spaced repetition)

5–10 questions answerable from this note. Re-encounter at 1d / 3d / 7d / 14d / 30d intervals. The act of recall is the consolidation.

### What good looks like

```
Q1. What is the time complexity of vanilla attention in sequence length?
    (Answer: O(n²·d). Quadratic in n is the bottleneck.)

Q2. Why divide scores by √d_k before softmax?
    (Answer: dot products at large d_k have variance ~d_k. Without scaling,
     softmax saturates → vanishing gradients on most rows.)

Q3. Given Q ∈ R^(n×d_k), K ∈ R^(n×d_k), V ∈ R^(n×d_v), what's the shape of
    the output of attention(Q, K, V)?
    (Answer: (n, d_v).)

Q4. Name three failure modes of attention training.
    (Answer: 1. Saturation w/o √d_k scaling. 2. Numerical instability in
     softmax → use the max-subtraction trick. 3. Quadratic memory blow-up
     at long context.)

Q5. Why multi-head over a single wide head?
    (Answer: Heads can specialize on different relation types. Empirically
     better at the same parameter budget.)
```

### Discipline rule

**Answers below the question, not next to it.** You should be able to fold the answer down and *try* before reading it. Generation > re-reading.

### How to know you're done

You can answer all questions cold, 7 days later, with no warmup.

---

## 16. Action items

The **single most important next step**. Don't list five — pick one. List five only after the first is done.

### What good looks like

> **Action:** Implement multi-head attention from scratch in numpy (no PyTorch). Tiny inputs (n=4, d_k=8, d_v=8, h=2 heads). Hand-trace the shape of every intermediate. Compare to PyTorch's `nn.MultiheadAttention` on identical inputs — outputs should match to 1e-5.
>
> **Why this:** Forces every prior section into one concrete artifact. If I can do this without notes, I understand attention. If I can't, I find out exactly which section I faked.

### Discipline rule

**Make it doable in <2 hours.** Big ambitions = nothing happens. "Implement GPT" is not an action item; "implement scaled dot-product attention in numpy" is.

### How to know you're done

The action item is small, specific, and time-boxed.

---

# Common analysis traps

These are the failures that show up most often even from people who "know the template":

1. **Reading the section labels and skipping the work.** "I have a mental model" without writing one is fiction.
2. **Substituting the paper's prose for your own words.** Quoting Vaswani et al. is not understanding; it's transcription.
3. **Skipping §6 worked example because "the math is clear."** The math is never as clear as you think. Numbers expose self-deception.
4. **Stuffing §3 mental model with multiple analogies.** One. Pick one. Multiple = none.
5. **Treating §15 self-test as performative.** If you can already answer them when you write them, they're not testing — they're flexing. Write the questions you'd struggle with on day 30.
6. **Filing the note and never re-opening.** The spaced-repetition schedule is the *whole point*. Without it, you're writing for a future self who never returns.

---

# What separates strong vs weak AI notes

| Weak | Strong |
|---|---|
| Copies paper abstract | Writes the 30-second pitch in own words |
| One mental model from a textbook | One mental model the writer invented and refined |
| Math without dimensions | Every shape annotated |
| "I implemented it in PyTorch" | Numpy from scratch + PyTorch idiomatic, both runnable |
| "It works well" | Real numbers (BLEU 28.4 vs 24.6) |
| No failure modes section | 3+ specific symptoms with detection signals |
| "Use it for sequences" | Decision tree with criteria |
| Cites the paper once | Lineage of 3-5 papers, dated |
| No self-test | Self-test with answers folded; reviewed at intervals |
| Action item: "study more" | Action item: "implement X by Friday in <2 hours" |
| File-and-forget | Re-reviewed and updated as understanding deepens |

---

# How to use this going forward

Every AI concept you study from now on follows:

```
1. Quick reference (first guess) — 2 min
2. The 30-second pitch — 5 min
3. The problem it solves — 10 min
4. Mental model (yours BEFORE reading authoritative) — 10 min
5. First-principles derivation — 30 min
6. Visualization — 15 min
7. Worked example by hand — 30 min
8. Implementation (numpy + framework) — 60 min
9. Hyperparameters table — 15 min
10. Failure modes — 20 min
11. Compared to alternatives — 15 min
12. Real-world usage — 15 min
13. Research lineage — 15 min
14. Interview script — 15 min
15. Open questions — 5 min
16. Self-test — 10 min
17. Action item — 2 min
─────────────────────────────────
~4-5 hours per concept (front-loaded; later concepts compress as patterns emerge)

Then:
+ 1d review (spot-check self-test) — 5 min
+ 3d review — 10 min
+ 7d review — 15 min
+ 14d review — 15 min
+ 30d review — 15 min
─────────────────────────────────
~60 min review distributed = lifetime retention
```

The first concept you study with this template will take longer because the template is unfamiliar. By concept 5, you're at ~3 hours. By concept 20, ~90 minutes for a moderate topic.

---

# Why interviewers and researchers care

Top labs (DeepMind, Anthropic, OpenAI, Meta AI, Google Brain) explicitly probe the four literacies in interviews:

- **Math literacy:** "Derive the gradient of softmax + cross-entropy."
- **Code literacy:** "Implement attention in numpy in 15 minutes."
- **Intuition literacy:** "Why does scaling by √d_k matter?"
- **Empirical literacy:** "What benchmark would you use to evaluate this, and why?"

A candidate who can do three of four gets rejected. A candidate who can do all four — even at modest depth on each — gets the offer. This template is structured to ensure you don't have a hole in any one of them.

---

# Worked example — Backpropagation through a 2-layer MLP

This is what a fully-filled template looks like for a real concept. Use this as the model for every AI concept note you write going forward.

## Quick reference

```
- Family: Training algorithm (gradient computation)
- One-line definition: Reverse-mode automatic differentiation applied to neural-network loss; computes ∂L/∂params via the chain rule from output back to input.
- Key hyperparameters: (none — backprop itself is parameter-free; the gradient
  it produces is consumed by the optimizer, where LR / momentum live)
- When to use it: Any time you train a neural net via gradient descent. Always.
- When NOT to use it: When the loss is non-differentiable (use REINFORCE / RL) or
  when you have a closed-form solution (linear regression with normal equations).
- Famous failure mode: Vanishing / exploding gradients in deep networks.
- Canonical paper: Rumelhart, Hinton & Williams (1986), "Learning representations
  by back-propagating errors." Established backprop as the dominant NN-training algorithm.
```

---

## 1. The 30-second pitch

Backpropagation is **the chain rule, applied to a function defined as a sequence of matrix multiplies and nonlinearities, executed from the back forward.** You compute the loss at the end, then walk backward through every operation, asking "how did this operation contribute to the loss?" The answer at each step is one matrix multiplication. By the time you reach the input, you've computed the gradient of the loss with respect to every parameter — and that's what the optimizer uses to update them.

It's the algorithm that makes neural networks *learn from data* feasible. Without it, you'd estimate gradients by finite differences, costing one forward pass per parameter — millions of forward passes per training step. Backprop computes all gradients in **one** backward pass.

---

## 2. The problem it solves

**Before backprop:** Training neural networks meant either (a) using closed-form solutions for very narrow architectures (perceptron, linear regression), or (b) estimating gradients by finite differences (compute loss at θ + ε for every θ — millions of forward passes per step). Both were dead-ends. Multi-layer nets *existed* in theory but couldn't be trained at scale.

**The frustration:** the perceptron's failure to learn XOR (Minsky & Papert 1969) led to the first "AI winter." Many believed multi-layer nets were inherently untrainable.

**The improvement:** Rumelhart, Hinton & Williams 1986 showed that the chain rule, applied algorithmically backward through the network, computes ALL parameter gradients in one O(network-size) pass. This made deep learning possible at all. Twenty-five years later it scaled with GPUs into the modern era.

---

## 3. Mental model

Backprop is **assigning blame**. The loss is "what went wrong." Each layer says: "I produced this output, given these inputs and these weights. How much of the wrongness is *my* fault?" That blame gets split into:

- **Blame for my weights** — `∂L/∂W` — what the optimizer uses to update.
- **Blame for my inputs** — `∂L/∂x` — what we pass back to the previous layer, which becomes *its* "what went wrong."

It's a backward telephone game: the loss is "unhappiness," and each layer takes the unhappiness it received from the layer above, splits it into "weights I should change" and "inputs that caused this," and passes the latter back.

---

## 4. First-principles derivation

For a 2-layer MLP with 1 input, 2 hidden, 1 output, sigmoid output, BCE loss:

```
Forward
  z₁ = W₁ · x + b₁                  shapes: x (1,) ;  W₁ (2,1) ; z₁ (2,)
  h  = ReLU(z₁)                     h (2,)
  z₂ = W₂ · h + b₂                  W₂ (1,2) ; z₂ (1,)
  ŷ  = sigmoid(z₂)                  ŷ (1,)
  L  = -[y log ŷ + (1-y) log(1-ŷ)]  scalar

Backward (chain rule)
  ∂L/∂z₂ = ŷ - y                    (BCE + sigmoid simplifies cleanly)
  ∂L/∂W₂ = (∂L/∂z₂) · hᵀ            shape (1,2)
  ∂L/∂b₂ = ∂L/∂z₂                   shape (1,)
  ∂L/∂h  = W₂ᵀ · (∂L/∂z₂)           shape (2,)
  ∂L/∂z₁ = ∂L/∂h ⊙ ReLU'(z₁)        ⊙ = elementwise; ReLU'(z) = 1 if z>0 else 0
  ∂L/∂W₁ = (∂L/∂z₁) · xᵀ            shape (2,1)
  ∂L/∂b₁ = ∂L/∂z₁                   shape (2,)
```

Two things to internalize:

1. **Every gradient is a matrix multiply** — same operations as forward, just transposed.
2. **The chain rule's "multiplication" is matrix multiplication when you pass through layers, elementwise when you pass through pointwise nonlinearities.**

---

## 5. Visualization

### Computation graph (Tier 1 — ASCII)

```
     forward ─────────────────────────────────────────────────►

        x ──► [W₁,b₁] ──► z₁ ──► ReLU ──► h ──► [W₂,b₂] ──► z₂ ──► sigmoid ──► ŷ ──► loss(ŷ,y) ──► L
                                                                                                    │
     ◄─────────────────────────────────────────────────  backward                                   ▼
                                                                                                  ∂L/∂L = 1
       ∂L/∂x ◄── (W₁ᵀ·) ◄── ∂L/∂z₁ ◄── (⊙ReLU') ◄── ∂L/∂h ◄── (W₂ᵀ·) ◄── ∂L/∂z₂ ◄── (ŷ-y) ◄────────┘

     gradients to update: ∂L/∂W₁ , ∂L/∂b₁ , ∂L/∂W₂ , ∂L/∂b₂  (computed at each box)
```

### Loss-landscape (Tier 3 — descriptive)

> Picture a wrinkled bedsheet (the loss surface over W₁, W₂). Backprop computes the **slope** at your current position. Gradient descent uses that slope to take a step downhill. The wrinkles are the optimization difficulty: too smooth and you take huge steps; too rough and you bounce.

---

## 6. Worked example by hand

Take the architecture above. Concrete numbers:

```
x = 0.5, y = 1
W₁ = [[0.3], [0.7]]    b₁ = [0.1, -0.2]
W₂ = [[0.4, -0.5]]     b₂ = [0.05]

Forward
  z₁ = W₁·x + b₁ = [0.3·0.5+0.1, 0.7·0.5-0.2] = [0.25, 0.15]
  h  = ReLU(z₁) = [0.25, 0.15]
  z₂ = W₂·h + b₂ = 0.4·0.25 + (-0.5)·0.15 + 0.05 = 0.1 - 0.075 + 0.05 = 0.075
  ŷ  = sigmoid(0.075) ≈ 0.5187
  L  = -log(0.5187) ≈ 0.6562

Backward
  ∂L/∂z₂ = ŷ - y = 0.5187 - 1 = -0.4813
  ∂L/∂W₂ = ∂L/∂z₂ · hᵀ = -0.4813 · [0.25, 0.15] = [-0.1203, -0.0722]
  ∂L/∂b₂ = ∂L/∂z₂ = [-0.4813]
  ∂L/∂h  = W₂ᵀ · ∂L/∂z₂ = [0.4, -0.5]ᵀ · -0.4813 = [-0.1925, 0.2406]
  ∂L/∂z₁ = ∂L/∂h ⊙ ReLU'(z₁) = [-0.1925, 0.2406] ⊙ [1,1] = [-0.1925, 0.2406]
  ∂L/∂W₁ = ∂L/∂z₁ · xᵀ = [-0.1925, 0.2406] · 0.5 = [-0.0963, 0.1203]
  ∂L/∂b₁ = ∂L/∂z₁ = [-0.1925, 0.2406]
```

Sanity check: ∂L/∂z₂ is negative (we want to *increase* z₂ because target is 1, current is 0.5187), so ∂L/∂W₂ has the same sign pattern as -h, meaning we'll move W₂ to push z₂ up. Correct.

---

## 7. Implementation

```python
# ── numpy from scratch — verifies the hand trace ──────────────────────
import numpy as np

def sigmoid(z): return 1.0 / (1.0 + np.exp(-z))
def relu(z):    return np.maximum(0, z)
def relu_grad(z): return (z > 0).astype(float)

# Setup
x = np.array([0.5])
y = 1.0
W1 = np.array([[0.3], [0.7]])      # (2,1)
b1 = np.array([0.1, -0.2])         # (2,)
W2 = np.array([[0.4, -0.5]])       # (1,2)
b2 = np.array([0.05])              # (1,)

# Forward
z1 = W1 @ x + b1
h  = relu(z1)
z2 = W2 @ h + b2
yhat = sigmoid(z2)
L = -(y * np.log(yhat) + (1-y) * np.log(1-yhat))
print(f"forward: z1={z1} h={h} z2={z2} yhat={yhat} L={L}")

# Backward
dz2 = yhat - y                          # shape (1,)
dW2 = np.outer(dz2, h)                  # (1,2)
db2 = dz2                               # (1,)
dh  = W2.T @ dz2                        # (2,)
dz1 = dh * relu_grad(z1)                # (2,)
dW1 = np.outer(dz1, x)                  # (2,1)
db1 = dz1                               # (2,)

print(f"dW2={dW2} db2={db2} dW1={dW1.flatten()} db1={db1}")

# ── PyTorch idiomatic — verifies via autograd ─────────────────────────
import torch

x_t  = torch.tensor([0.5], requires_grad=False)
y_t  = torch.tensor([1.0])
W1_t = torch.tensor([[0.3], [0.7]], requires_grad=True)
b1_t = torch.tensor([0.1, -0.2], requires_grad=True)
W2_t = torch.tensor([[0.4, -0.5]], requires_grad=True)
b2_t = torch.tensor([0.05], requires_grad=True)

yhat_t = torch.sigmoid(W2_t @ torch.relu(W1_t @ x_t + b1_t) + b2_t)
L_t = torch.nn.functional.binary_cross_entropy(yhat_t, y_t)
L_t.backward()

print("autograd ∂W2 =", W2_t.grad)
print("autograd ∂W1 =", W1_t.grad)
# Should match the numpy results to ~1e-7.
```

---

## 8. Hyperparameters and what they do

Backprop itself has no hyperparameters. The *consumer* (the optimizer) does. But the architecture choices that affect backprop's behavior are:

| Choice | Effect on backprop | Failure if wrong |
|---|---|---|
| Activation function | Determines `f'(z)` factor in chain rule | Sigmoid/tanh saturate → gradients vanish |
| Network depth | More multiplications in the chain | Deep nets without residuals → gradients vanish or explode |
| Weight initialization | Sets the variance of activations / gradients | Bad init → gradients vanish/explode immediately |
| Use of LayerNorm/BatchNorm | Stabilizes the variance of intermediate activations | Without it, very deep nets are nearly impossible to train |

---

## 9. Common failure modes

```
Failure 1 — Vanishing gradients.
  Symptom:   Loss plateaus; layers near input barely update.
  Cause:     Product of many sub-1 derivatives → exponentially small.
              Sigmoid/tanh worst; the derivatives saturate.
  Fix:       Use ReLU/GELU; residual connections; LayerNorm; He/Xavier init.
  Detect:    Plot per-layer gradient norm. If layer 0 is 1e-10 and layer N
              is 1e-2, you have a vanishing-gradient problem.

Failure 2 — Exploding gradients.
  Symptom:   Loss spikes to NaN; loss diverges; weights grow huge.
  Cause:     Product of many >1 derivatives → exponentially large.
              Recurrent nets are particularly susceptible.
  Fix:       Gradient clipping (clip norm at 1.0 or similar); smaller LR;
              LayerNorm.
  Detect:    Track gradient norm per step. Sudden spike to 1e6+ → trouble
              imminent.

Failure 3 — Dead ReLU units.
  Symptom:   Some neurons output 0 always; their weights never update.
  Cause:     Pre-activation z drifts negative; ReLU outputs 0 → ReLU' is 0
              → gradient through that unit is 0 → weights frozen.
  Fix:       Use Leaky ReLU / GELU / Swish (no flat zero region). Reduce LR
              to avoid the initial drift.
  Detect:    Count fraction of zero activations per layer. If > 50% of a
              layer is always zero, dead ReLUs.

Failure 4 — Gradient flow blocked by detach() / no_grad().
  Symptom:   Some parameters' .grad is None after backward(); training does
              nothing for them.
  Cause:     Computation graph severed (intentional or accidental).
  Fix:       Audit every .detach() call; remove unintended ones.
  Detect:    `for p in model.parameters(): assert p.grad is not None`
```

---

## 10. Compared to alternatives

| Method | When to use | Why backprop wins (or loses) |
|---|---|---|
| **Backprop** | Differentiable losses, gradient descent | Default. Exact gradient in O(network) per step. |
| **Finite differences** | Sanity check during development | O(parameters) per step — too slow for real training. Useful to verify gradients in tests. |
| **REINFORCE / policy gradient** | Non-differentiable rewards (RL) | Higher variance, but works where backprop can't (discrete actions). |
| **Evolutionary strategies** | Black-box objectives | Very slow but trivially parallelizable; rare in practice. |
| **Forward-mode AD** | Few inputs, many outputs | Backprop (reverse-mode) wins for many params, one loss — which is the NN setup. |

---

## 11. Real-world usage

Every modern neural network training run uses backprop. It's the default mode of `loss.backward()` in every framework (PyTorch, JAX, TensorFlow). Variants in production:

- **Mixed-precision (fp16/bf16):** gradients computed in lower precision; loss scaled to keep gradients in representable range.
- **Gradient accumulation:** for batch sizes that don't fit in memory, run several forward+backward passes, accumulate gradients, then apply.
- **Gradient checkpointing:** trade compute for memory by recomputing intermediate activations during backward instead of storing them. Used to train multi-billion-parameter models on 80GB GPUs.
- **Distributed data parallel:** each GPU computes its own backward pass; gradients all-reduced across GPUs before the optimizer step.

---

## 12. Research lineage

```
Predecessors
  • 1960s — chain rule applied to control theory by Kelley, Bryson, Ho.
  • 1970 — Linnainmaa's master's thesis: reverse-mode autodiff in general.
  • 1974 — Werbos applied the idea to neural networks (didn't catch on).

Canonical
  • 1986 — Rumelhart, Hinton & Williams. Made backprop the standard NN
    training method.

Successors / refinements
  • 1989 — LeCun's CNN training (LeNet) demonstrated backprop at scale.
  • 1998 — LeCun et al. — second-order methods studied; mostly abandoned for
    large-scale.
  • 2010s — autograd / autograd-like libraries (Theano, PyTorch, JAX) made
    backprop trivially composable. Same algorithm, dramatic ergonomic shift.
  • 2015 — ResNet enabled training >100-layer nets by routing gradient through
    skip connections — directly addresses backprop's vanishing-gradient problem.
```

---

## 13. The interview script

> **Setup (45s):** "Backprop is the chain rule applied to a neural network's computation graph. You do a forward pass, compute the loss, and then walk the graph in reverse, computing ∂loss/∂each-tensor. At each operation you compute two things: how the loss depends on this operation's parameters (which the optimizer will use), and how it depends on the inputs (which gets passed back to the previous operation). For a 2-layer net it's just two matrix multiplies forward and two matrix multiplies backward. The clever bit is that even for arbitrarily complex graphs, the algorithm is a generic graph traversal — that's what autograd implements."
>
> **Q: "Why does backprop scale better than finite differences?"** "Finite differences cost O(parameters) forward passes per gradient because you perturb each parameter individually. Backprop costs ONE forward pass and ONE backward pass — total O(network size). For a 1B-parameter model that's the difference between 1B forward passes per step and 2 passes."
>
> **Q: "What's the vanishing-gradient problem?"** "Backprop multiplies derivatives along the chain. If most of those derivatives are below 1 (sigmoid's max is 0.25), the product shrinks exponentially with depth. By layer 50 your gradient is 10^-30 — effectively zero. Three fixes work: (1) ReLU which doesn't saturate on the positive side, (2) residual connections that route gradient around layers, (3) LayerNorm which keeps the variance of activations stable."
>
> **Q: "How do you check if your gradient implementation is correct?"** "Gradient checking with finite differences. Pick a parameter θ, compute (loss(θ+ε) - loss(θ-ε)) / (2ε), compare to your backprop's gradient. They should match to ~1e-7 with double precision. Most autograd bugs show up here."

---

## 14. Open questions and what I don't yet understand

1. I haven't traced backprop through LayerNorm by hand — what exactly is the gradient of (x - μ) / σ when both μ and σ depend on x? (The answer is more than `1/σ`; there are corrections from the dependence.)
2. I should learn the gradient of softmax-cross-entropy explicitly. The simplification that ∂L/∂z = ŷ - y is famous, but I've never derived it.
3. What does the gradient look like for attention with multiple heads? Specifically, how does the concat-and-project layer split gradient across heads?
4. Reversible architectures (RevNets) compute the backward pass without storing activations. I don't understand how.

## 15. Self-test

```
Q1. What is the time complexity of one backprop step relative to one forward
    pass?
    Answer: ~2× the forward pass. Same operations, mostly transposed.

Q2. Why is the gradient of the loss w.r.t. the pre-softmax logits simply
    (ŷ − y) for cross-entropy?
    Answer: The softmax derivative and the log derivative cancel; many of the
    intermediate terms simplify because Σŷ_i = 1 and y is one-hot. Worth
    deriving in full once.

Q3. You see a network where layer-0 gradients are 1e-12 and layer-10 gradients
    are 1e-1. What's wrong, and what would you change?
    Answer: Vanishing gradients — chain of small derivatives. Switch to
    ReLU/GELU; add residual connections; check init.

Q4. Gradient checking returns 0.4 instead of the expected ~1e-7. What does
    that tell you?
    Answer: Your backprop has a bug. The gradients differ at the *first*
    decimal — that's a real implementation error, not numerical noise.

Q5. Why is reverse-mode AD preferred over forward-mode for neural-net training?
    Answer: Reverse-mode cost is proportional to outputs (1 — the scalar loss).
    Forward-mode cost is proportional to inputs (millions of params). For
    n_params >> n_outputs, reverse mode is exponentially cheaper.
```

---

## 16. Action item

**Implement the 2-layer MLP backprop above, in numpy, then verify it matches PyTorch autograd on identical inputs.** Take it to <1e-7 agreement. Time-box: 45 minutes. If it doesn't match, debug *which gradient* is wrong by inspecting them one at a time.

Why this: it's the smallest possible exercise that exercises every section of this note simultaneously.

---

# Closing — using this template at scale

You will study many AI concepts. The first ten will take ~4 hours each with this template — front-loaded learning. By the time you've done thirty, the patterns rhyme: every architecture has a forward graph, a backward graph, hyperparameters, failure modes, lineage. You'll fill in §4 in 5 minutes because you've seen attention, you've seen RNN, you've seen CNN — the math has shape, the shape has rhythm.

The template is a **scaffold for thinking**, not a checklist to satisfy. When in doubt, ask: *if I forget everything I've written here in 6 months and re-open this note, what's the minimum that lets me re-derive the rest?* That answer is the irreducible content of each section. Everything else is bonus.

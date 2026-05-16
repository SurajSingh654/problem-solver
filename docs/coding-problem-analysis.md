# Problem Analysis Template — The Pre-Coding Phase

> **How to use this doc:** when starting a new coding problem, run the template top-to-bottom (Phases 0–7) before writing any code. Each phase has: what it's for, the mental shift from the previous phase, the sub-steps or lenses to apply, what good output looks like, the discipline rule, and how to know you're done. The worked example at the bottom shows what a full rigorous analysis looks like for LeetCode 121 — copy that structure for every problem you write notes on. Refine the template as your skill ceiling rises.

---

## Why this template exists

90% of candidates rush into coding. The strong ones spend the first 5–10 minutes **deconstructing** the problem before clarifying questions, before pseudo-code, before any line of real code.

**The core principle:** every line of a problem statement is intentional. Every constraint hides a hint. Every example is chosen to illuminate an edge or a pattern. Your job is to extract MEANING from each piece — not just READ it.

A weak candidate produces the same code as a strong candidate but in a different order: code first, understand later. The interviewer can tell.

---

# The 8-Phase Framework — full walkthrough

---

## Phase 0 — Scan before you read (30 seconds)

### What this phase is for

You're building a *cognitive anchor* before deep-reading. Without it, you parse the problem statement word-by-word with no genre context — like reading a novel without knowing if it's a thriller or a romance. With anchor, every sentence in Phase 1 lands against the right backdrop.

### Mental shift

| Before Phase 0 | After Phase 0 |
|---|---|
| Blank slate | Rough genre + complexity ceiling + input/output shape |
| "What is this problem?" | "What *kind* of problem am I walking into?" |

### The four glances (do them in order, ~7 seconds each)

**Glance 1 — Title.** What *specific words* in the title signal genre? Verbs ("find", "count", "return"), superlatives ("best", "max", "min"), domain words ("tree", "graph", "stock") all carry information. Don't expect the title to give you the algorithm — it tells you the *category*.

**Glance 2 — Constraints.** Just the largest `n`. That single number tells you the algorithm class.
- `n ≤ 100` → brute force fine
- `n ≤ 10⁵` → must be O(n log n) or O(n)
- `n ≤ 10⁹` → must be O(log n) or O(1)

You'll do precise constraint decoding in Phase 2 — Phase 0 is just the temperature gauge.

**Glance 3 — Examples.** Don't trace yet. Just look at the *silhouette*:
- How many examples?
- What shape is the input? (array, string, matrix, graph, tree)
- What shape is the output? (number, list, boolean, structured)
- Do any examples look like edge cases? (all-zero, all-equal, single element, empty)

**Glance 4 — Return type.** Two follow-up questions:
- *Value or index?* "Return the index of…" vs "return the value at…" are different problems.
- *Bounded?* Can the answer be negative? Zero? Always positive? This affects accumulator initialization.

### Output shape

A four-bullet anchor list:

```
- Genre: <optimization | counting | search | check | construction>
- Time budget: O(<class>) only; forbids <class>
- Input/output shape: <e.g., array → single number>
- Edge case hints from examples: <e.g., all-decreasing returns 0>
```

### Discipline rule

**Phase 0 takes 30 seconds.** If you spend two minutes here, you're starting Phase 1 too late. If you spend ten seconds, you didn't actually read the constraints. Aim for ~30s.

### How to know you're done

You can answer the question *"if a friend asked what kind of problem this is, in one sentence, what would I say?"*. If you can't, do another scan.

---

## Phase 1 — Deep-read line by line (2-3 minutes)

### What this phase is for

This is your *forensic read*. Phase 0 was a skim; Phase 1 is the lawyer's read. Every sentence in the problem statement is a contract clause — your job is to extract every constraint, permission, and unstated assumption it carries.

### Mental shift

| Phase 0 | Phase 1 |
|---|---|
| Skim, label | Sentence by sentence, drain each one |
| Genre intuition | Algorithm spec building |
| 30 sec | 2-3 min |

### The four lenses (apply to every sentence)

For each sentence, ask all four. Don't skip. If a lens has no answer, write **"nothing relevant"** rather than skipping silently.

**Lens 1 — Literal.** Paraphrase in your own words. Confirms you actually read the words. Catches "different day" vs "different value" mistakes that haunt later phases.

**Lens 2 — Rules out.** What is *forbidden* by this sentence? Each clause is a constraint that eliminates moves. "In-place" rules out aux arrays. "Different day" rules out same-day transactions. "Non-negative answer" rules out returning -1.

**Lens 3 — Rules in.** What is *required or guaranteed*? Less common but high-signal when present. "Sorted" rules in binary search. "Always at least one valid answer" rules in skipping the not-found sentinel.

**Lens 4 — Implicit.** What's *not stated* but assumed for the problem to make sense? "Array" doesn't say "non-empty"; check examples or constraints to confirm. "Maximize profit" doesn't say "subject to fee" — implicit: fee = 0 (changes in a follow-up problem).

### Generic phrase patterns

| Phrase | Hidden questions |
|---|---|
| "You are given an array…" | Random access? Mutable? Sorted? Indexed from 0 or 1? |
| "Choose any element…" | One? At most one? Exactly one? Multiple allowed? |
| "…in the future" / "…before X" | Order matters; index relations matter |
| "maximum / minimum" | Optimization; one numeric answer |
| "If you cannot…, return X" | The answer is bounded; you're not forced to act |
| "subarray" vs "subsequence" | Contiguous vs non-contiguous (people get this wrong) |
| "in-place" | Cannot allocate auxiliary array of size n |
| "may contain duplicates" | Hashing / counting becomes more nuanced |

### Output shape

A table — sentence as row, four lenses as columns:

| Sentence | Literal | Rules out | Rules in | Implicit |
|---|---|---|---|---|
| "[s1]" | … | … | … | … |
| "[s2]" | … | … | … | … |

3-7 rows for typical problems. Most cells filled. At least one *surprising* extraction (something Phase 0 missed).

### Discipline rule

**One sentence at a time.** Don't skim two sentences and answer for both — you'll miss the precision of each. The slowness IS the point.

### How to know you're done

You discovered at least one constraint or assumption that you didn't see during the Phase 0 scan. If you didn't, you weren't reading deeply enough.

---

## Phase 2 — Decode constraints (1-2 minutes)

### What this phase is for

You touched the constraints in Phase 0 (just the size) and Phase 1 (where they appeared in sentences). Now they get a *dedicated pass*, because constraints encode the *interviewer's whisper* about what algorithm class is expected. Misreading a constraint is the single most expensive Phase mistake.

### Mental shift

| Phase 1 | Phase 2 |
|---|---|
| What does each *sentence* say? | What does each *number* say? |
| Spec for the problem | Spec for the runtime |
| English-language analysis | Big-O analysis |

### The decoding sub-steps

**Sub-step 1 — Translate every numeric constraint into algorithm classes.** Use the time-budget table:

| n size | Class allowed | Class forbidden |
|---|---|---|
| ≤ 10 | brute force, permutations | — |
| ≤ 20 | bitmask DP, exponential | factorial |
| ≤ 100 | O(n³) | O(2ⁿ) |
| ≤ 1,000 | O(n²) | O(n³) |
| ≤ 10⁴ | O(n²) borderline; prefer O(n log n) | O(n³) |
| ≤ 10⁵ | O(n log n) or O(n) | **O(n²)** |
| ≤ 10⁶ | O(n) | O(n log n) borderline |
| ≤ 10⁹ | O(log n) or O(1) | anything that stores the input |

**Sub-step 2 — Translate every value-range constraint into data-structure choices.**

| Constraint shape | What it tells you |
|---|---|
| `values ≤ 10⁴` (small) | Counting sort, bucket array, or array-as-hashmap viable |
| `values ≤ 10⁹` (large) | Need real hash map; can't index by value |
| Negatives allowed | Can't index by value directly; rules out direct counting; affects sums (overflow) |
| Zero allowed | Edge cases for division, multiplication, geometric mean |
| Floats allowed | Equality is suspect; tolerances matter |
| `n ≥ 1` (no empty) | One specific edge case removed — but n=1 is still its own edge |

**Sub-step 3 — Ask "why this number?" for every constraint.** Bounds are *calibrated*. The problem-setter chose `n ≤ 10⁵` for a reason — they wanted to force O(n log n). If they'd wanted to allow O(n²) they'd have written `n ≤ 10³`.

**Sub-step 4 — Look for hidden constraints.** Sometimes constraints are implicit:
- "Values fit in int" → no overflow concerns
- "k test cases, each ≤ X" → outer loop runs k times, inner algorithm runs against X
- Combined bounds (sum of all n across test cases ≤ 10⁶) → controls total work, not per-case

### Output shape

A two-column table per constraint:

| Constraint | Decoded |
|---|---|
| `n ≤ 10⁵` | O(n log n) ceiling. Forbids O(n²). Single-pass O(n) is the target. |
| `values ≤ 10⁴` | Fits in 16-bit; no overflow; can index by value. |

### Discipline rule

**Every numerical constraint must produce at least one algorithmic implication.** If a constraint is "decoded" as just "values are small" with no algorithm consequence, you didn't decode — you restated.

### How to know you're done

You can name an O(...) bound that the problem allows AND name an O(...) bound the problem forbids. Both must come from constraints, not guesses.

---

## Phase 3 — Mine the examples (2-3 minutes)

### What this phase is for

Examples are *not random*. They are deliberately curated counterexamples and tutorials. The problem-setter chose them to (a) demonstrate the algorithm's basic shape, (b) refute a tempting wrong approach, and (c) stress edge cases. Mining them gives you algorithm hints the problem statement alone doesn't.

### Mental shift

| Phase 1 | Phase 3 |
|---|---|
| Read English (sentences) | Read data (numbers) |
| Extract constraints | Extract algorithm hints |
| Static analysis | Trace + hypothesis |

### The mining sub-steps

**Sub-step 1 — Trace each given example by hand.** What's the literal path from input to answer? Which elements participate? Which don't? Don't just look at input → output; understand the *mechanism*.

**Sub-step 2 — Identify what each example showcases.** Each official example has a purpose:
- Example 1 is usually the *typical case* — establishes the basic shape
- Example 2 (when present) is often the *counterexample* — refutes a naive approach
- Example 3 (when present) usually stresses an edge

Ask: "what naive algorithm would WORK on example 1 but FAIL on example 2?" That gap is the lesson.

**Sub-step 3 — Generate your own examples.** Official examples cover ~50% of cases. You generate the rest:
- Smallest valid input (n=1, n=2)
- All-equal values
- Strictly increasing / strictly decreasing
- Single value repeated
- Adversarial: input designed to break your first instinct

**Sub-step 4 — Tweak one number.** Pick a value in an official example and change it. Does the answer change? By how much? This reveals which positions/values are *load-bearing* in the algorithm.

### Output shape

```
Example 1 (input → output): <trace>. Showcases: <property>. Confirms: <hint>.
Example 2 (input → output): <trace>. Showcases: <edge>. Refutes: <wrong approach>.
[continue for each official example]

Self-generated examples:
- [smallest case] → <answer>
- [all-equal] → <answer>
- [strictly decreasing] → <answer>
- [adversarial] → <answer>
```

### Discipline rule

**Generate at least 3 of your own examples.** Officials don't cover edges; you must.

### How to know you're done

You can articulate at least one algorithm hint that the problem statement alone didn't give you. If your "Phase 3 output" is just "yep, the examples confirm what I read", you didn't mine — you transcribed.

---

## Phase 4 — Form explicit conclusions (1-2 minutes)

### What this phase is for

Phases 1-3 produced *observations*. Phase 4 converts them into *spec items* — hard requirements the algorithm must satisfy. This is where loose intuition becomes a checklist.

### Mental shift

| Phases 1-3 | Phase 4 |
|---|---|
| Extract observations | Synthesize requirements |
| What is true about the problem? | What must my algorithm do? |
| Bullet points | "Because/therefore" sentences |

### The conclusion shape

Every conclusion takes this form:

> **"Because of [observation from Phase 1/2/3], my algorithm must [requirement]."**

Examples:

- "Because n ≤ 10⁵, my algorithm must run in O(n log n) or better."
- "Because order matters (verified by example 2), my algorithm must NOT sort the input."
- "Because the answer is bounded below by 0, my accumulator can initialize to 0 (no sentinel needed)."
- "Because each element is used at most once, this is NOT unbounded knapsack."

### Sub-steps

**Sub-step 1 — Walk each observation from earlier phases and ask: "what does this REQUIRE of my algorithm?"** Not every observation produces a conclusion — some are inert. But every constraint, every example refutation, every implicit assumption SHOULD produce one.

**Sub-step 2 — Verify the conclusions don't contradict each other.** If you have "must process in order" AND "must sort the input", you've misread something.

**Sub-step 3 — Verify coverage.** For each conclusion, identify which Phase produced it. If you have phases with zero conclusions, either nothing relevant came up or you skimmed that phase.

### Output shape

A numbered list of 3-7 conclusions, each in because/therefore form:

```
1. Because [X], my algorithm must [Y].
2. Because [X], my algorithm must [Y].
3. ...
```

### Discipline rule

**3-5 conclusions minimum.** Fewer = you didn't extract enough from earlier phases. More = you're listing observations as conclusions; trim.

### How to know you're done

A conclusion list short enough to memorize but specific enough that, given only this list, someone else could write the algorithm.

---

## Phase 5 — Classify the category (30 seconds)

### What this phase is for

Pattern matching to known algorithm classes. Categorization shortcuts you to a *known solution shape* — you don't have to invent the algorithm from scratch; you adapt a template.

### Mental shift

| Phases 1-4 | Phase 5 |
|---|---|
| Per-problem analysis | Per-pattern lookup |
| Specific to this problem | General to a class of problems |

### The classification sub-steps

**Sub-step 1 — Match against the signal table.** From the problem's structure (verbs, constraints, output type), pick categories from the standard taxonomy:

| Signal | Likely category |
|---|---|
| "Find a pair with property" | Two pointers / hash map |
| "Subarray with property X" | Sliding window / prefix sum |
| "Subsequence with property X" | DP |
| "Find min/max while iterating" | Greedy / single pass |
| "Count ways" | DP |
| "Shortest / longest path" | BFS / DFS / Dijkstra |
| "Sorted array" | Binary search / two pointers |
| "Hierarchical" | Tree / recursion |
| "Maximize / minimize" | Greedy *or* DP (constraints decide) |
| "Kth largest/smallest" | Heap / quickselect |
| "Intervals" | Sort + sweep |
| "Cycles in choices" | Graph / Union-Find |

**Sub-step 2 — Identify primary + secondary candidates.** It's fine to list multiple. The primary is the one you'll try first; secondary is your fallback.

**Sub-step 3 — Connect the category to your conclusions.** If your conclusions say "single pass with state", the category is greedy/single-pass. If they say "must explore all combinations", it's backtracking. The category should *follow from* your Phase 4 conclusions, not contradict them.

### Output shape

```
Primary category: <name>
Why: <one-line reason from Phase 4 conclusions>

Secondary candidates: <name>, <name>
```

### Discipline rule

**At least one named category.** "I don't know" means you skipped Phase 4 or didn't pattern-match. Even if your category is "I think this is a custom shape", that itself is a signal — interview problems usually map to a known class.

### How to know you're done

You can name a *similar problem* you've seen before. Not the same problem — a *similar shape*. If you can't name any, you don't have categorization yet.

---

## Phase 6 — Clarifying questions (1 minute)

### What this phase is for

In an interview, this phase signals careful reading. In self-practice, it surfaces assumptions you made during Phases 1-5 that *might be wrong*.

### Mental shift

| Phases 1-5 | Phase 6 |
|---|---|
| What can I extract? | What did I assume? |
| Reading the problem | Auditing my reading |

### The categorized question types

Don't ask everything — ask only where the problem statement was *genuinely ambiguous*. Asking obvious questions signals weak reading.

**Bounds**
- What's the maximum size? (if not in the constraints)
- Can the input be empty / null?
- Can n = 1?

**Semantics**
- Is "subarray" contiguous, or "subsequence"?
- Is the comparison strict or ≤?
- Does "different X" mean different *index* or different *value*?
- Are duplicates allowed?

**Return value**
- What should I return if the answer doesn't exist? (-1? null? 0? throw?)
- Should the result be sorted?
- Index or value?

**Mutability / side effects**
- Can I modify the input?
- Is the input guaranteed valid?

**Operational**
- Multiple queries on the same data, or one-shot?
- Static or streaming?

### Sub-steps

**Sub-step 1 — Walk back through Phases 1-3 and notice every place you ASSUMED something.** Each assumption is a candidate question.

**Sub-step 2 — Filter to the genuinely ambiguous.** If the problem statement clearly answered it, don't ask. If you had to guess, do ask.

**Sub-step 3 — Prioritize.** If you have 6 questions, pick the top 2-3. Asking too many wastes interview time.

### Output shape

```
Questions I'd ask the interviewer:
1. <Question> — because the statement was ambiguous about <X>
2. <Question> — because <Y>
```

### Discipline rule

**0 questions is acceptable.** If the problem statement was unambiguous, don't manufacture questions. Forcing questions to "look thoughtful" signals weak reading too.

### How to know you're done

You have 0-3 questions, each tied to a specific ambiguity in the problem statement.

---

## Phase 7 — State the approach plan (1 minute)

### What this phase is for

This is your *commitment*. You declare the algorithm you're about to write. The narration itself is what interviewers grade — two candidates write the same code; the one who narrated the why scores higher.

### Mental shift

| Phases 0-6 | Phase 7 |
|---|---|
| Analysis | Synthesis + commitment |
| What I see | What I will do |
| Internal | External (out loud) |

### Required components

A complete Phase 7 narration includes:

1. **Constraint cite** — "Based on n ≤ X, I need O(...)"
2. **Observation cite** — "I observed Y, which means Z"
3. **Brute force first** — "The simplest approach is..."
4. **Optimal next** — "I'll optimize by..."
5. **Final complexity** — "This runs in O(...) time, O(...) space"
6. **Edge cases acknowledged** — "Edge cases: [a], [b]; my approach handles them by..."

### The narration template

> "Based on the constraint n ≤ [X], I need O(...) or better.
> I observed [Y], which means [Z].
> The simplest approach is brute force [A] which is O([B]). Let me verify it on the examples first.
> The optimal approach is [C] — O([D]) time, O([E]) space — by tracking [state].
> Edge cases I'm watching: [list]."

### Discipline rule

**State it OUT LOUD or in writing.** Internal monologue doesn't count for the interviewer (or for catching contradictions). The act of narration forces you to confront vague pieces.

### How to know you're done

If a colleague heard your narration without seeing the problem, they could write the algorithm. If they'd be confused, your plan is incomplete.

---

# Common analysis traps to avoid

These are the failures that show up most often, even from people who "know the template":

1. **Skipping Phase 2 because the problem looks easy.** Easy-looking problems still have constraint signals. Skipping = missing them.
2. **Reading the problem only once.** First read = vocabulary; second read = structure; third read = edge cases. One read is never enough.
3. **Trusting the official examples to cover edges.** They almost never do. Generate your own (n=1, all-equal, all-decreasing).
4. **"Maximize" auto-greedy reflex.** Not every "maximize" is greedy. DP is often the right answer; constraint analysis tells you which.
5. **Confusing "subarray" with "subsequence."** Contiguous vs not. Get this wrong and you're solving a different problem.
6. **Anchoring on the first valid algorithm you think of.** Spend an extra 60 seconds asking "is there an O(n) here?" before settling for O(n log n).
7. **Writing conclusions in your head, not on paper.** Out-loud + written conclusions catch contradictions; mental conclusions don't.
8. **Misreading constraints by an order of magnitude** (`10⁴` vs `10⁵`). The single most expensive Phase 0/2 mistake — it routes you to the wrong algorithm class.

---

# What separates strong vs weak analysis

| Weak | Strong |
|---|---|
| Reads problem once | Reads three times: vocab → structure → edges |
| Memorizes constraint table | Asks *why* the bound was chosen |
| Trusts official examples | Generates own counterexamples |
| Categorizes from problem title alone | Categorizes from observations + conclusions |
| Jumps to optimal solution | States brute force first, then optimizes |
| Asks all clarifying questions | Asks only the ones the statement was ambiguous about |
| Internal monologue | External narration ("I notice…, which means…") |
| One-word answers per phase | Sentence-level reasoning per lens |
| Treats the template as a checklist | Treats the template as a thinking tool |

---

# How to use this going forward

Every coding problem from now on follows:

```
1. Pre-coding analysis (this template) — 5–10 minutes
   ├── Phase 0: Scan
   ├── Phase 1: Read line-by-line
   ├── Phase 2: Decode constraints
   ├── Phase 3: Mine examples
   ├── Phase 4: Form conclusions
   ├── Phase 5: Classify category
   ├── Phase 6: Clarifying questions
   └── Phase 7: State approach plan

2. Solution journey
   ├── Brute force (with code + WHY it's slow)
   ├── Intermediate attempts (with WHY they fail / improve)
   └── Optimal solution

3. Pseudo-code (brute force + optimal)

4. Final code (in your language)

5. Edge cases & pitfalls

6. Pattern recognition summary

7. What this problem really teaches

8. Related problems

9. Action item (one specific thing to retain)
```

The first hour you spend on a problem should be ~50% analysis, ~50% solution. By problem 30, your analysis phase will compress to ~5 minutes because the patterns become muscle memory — but the *order* (analyze → conclude → solve) stays.

---

# Why interviewers care

Hiring managers explicitly look for this. Per the published interview guides at Google, Stripe, and Meta:

> "Strong candidates restate the problem in their own words, decode the constraints out loud, articulate observations from the examples, and explicitly state their approach plan before writing code. Candidates who jump to code, even with the same final solution, score notably lower on **problem-solving** and **communication** axes."

Two candidates produce the same code. The one who narrated their analysis gets the offer.

---

# Worked example — Best Time to Buy and Sell Stock (LeetCode 121)

This is what a full rigorous analysis looks like applied to a real problem. Use this as the model for every problem note you write going forward.

## The problem

> You are given an array `prices` where `prices[i]` is the price of a given stock on the i-th day.
> You want to maximize your profit by choosing a single day to buy one stock and choosing a different day in the future to sell that stock.
> Return the maximum profit you can achieve from this transaction. If you cannot achieve any profit, return 0.

**Constraints:** `1 ≤ prices.length ≤ 10⁵`; `0 ≤ prices[i] ≤ 10⁴`
**Examples:** `[7,1,5,3,6,4] → 5`; `[7,6,4,3,1] → 0`

---

## Phase 0 — Scan (30 sec)

- **Genre:** Optimization on an ordered array. "Best" = max/min. "Buy and Sell" = two ordered actions. "Time" = order matters.
- **Time budget:** Largest n is 10⁵. Need O(n log n) or O(n). Forbids O(n²).
- **Input/output shape:** array → single number (value, not index, non-negative).
- **Edge case hint:** Example 2 returns 0 — the problem allows refusing to transact.

---

## Phase 1 — Deep read

| Sentence | Literal | Rules out | Rules in | Implicit |
|---|---|---|---|---|
| "array `prices` where `prices[i]` is the price on the i-th day" | A sequence of prices indexed by day. Index = time. | Reordering — index is meaningful. | Random access; iteration is natural. | n ≥ 0 (constraints say ≥ 1); prices are concrete values. |
| "single day to buy one stock" | Pick exactly one buy day; one unit. | Multiple buys; partial units. | Quantity is fixed at 1. | Buying is mandatory IF you transact. |
| "different day in the future to sell" | Sell on a day BOTH (a) different from buy and (b) chronologically after. | Buy and sell on same day; sell-before-buy. | sell index > buy index strictly. | "Future" is strict, not "next or future". |
| "maximize your profit" | Optimization toward a max. | Other targets (avg, total volume). | One numeric answer. | Single transaction (multi would change the verb). |
| "If you cannot achieve any profit, return 0" | Bounded below by 0. | Returning negative or null. | Answer is always defined. | You're NOT forced to transact. |

**Surprising extraction (vs Phase 0):** the **strict** "different day in the future" — not "different OR future". Rules out same-day even if you wanted it.

---

## Phase 2 — Decode constraints

| Constraint | Decoded |
|---|---|
| `1 ≤ prices.length ≤ 10⁵` | n is large. **O(n²) is forbidden** (10¹⁰ ops, times out). Need O(n log n) or O(n). Single-pass is the natural fit. n=1 is allowed → must handle. |
| `0 ≤ prices[i] ≤ 10⁴` | Values are non-negative and small. Profit ≤ 10⁴ — no int overflow. Could use values as counting indices, but no obvious need here. |

**Why these bounds?**
- 10⁵ specifically forbids the lazy O(n²) brute force; the problem-setter wants the single-pass solution.
- 10⁴ for values is a sanity bound — eliminates overflow as a concern.

---

## Phase 3 — Mine examples

**Example 1: `[7,1,5,3,6,4] → 5`** Trace: best buy day is index 1 (value 1); best sell day is index 4 (value 6); 6−1 = 5. **Showcases**: typical positive case. **Confirms**: at any sell index j, the right buy is the running min of `prices[0..j-1]`.

**Example 2: `[7,6,4,3,1] → 0`** Trace: array is strictly decreasing; max(prices)−min(prices) = 6 but max comes BEFORE min. **Showcases**: edge case where order makes the obvious diff unusable. **Refutes**: "max − min" as the algorithm. **Confirms**: 0-floor is real (you can refuse to transact).

**Self-generated examples:**

- `[1] → 0` — n=1; no future day exists.
- `[1,1] → 0` — same-value pair; profit can't exceed 0.
- `[1,2] → 1` — smallest positive case.
- `[2,1] → 0` — smallest negative case (forced to refuse).
- `[1,2,1,2] → 1` — multiple opportunities; only one transaction allowed.
- `[3,1,4,1,5,9,2,6] → 8` — running min must be tracked across resets.

The `[1]` and `[1,2,1,2]` are interview probes — boundary handling and "single transaction" understanding.

---

## Phase 4 — Conclusions (because/therefore)

1. Because order matters (Example 2 refutes max−min), my algorithm **must NOT sort** the input.
2. Because n ≤ 10⁵, my algorithm **must run in O(n log n) or better**; brute force O(n²) is forbidden.
3. Because the right buy for any sell index `j` is `min(prices[0..j-1])`, my algorithm **must track the running minimum** as it iterates.
4. Because the answer is bounded below by 0, my **accumulator initializes to 0** and I only update on positive profit (no -∞ sentinel).
5. Because n=1 is allowed, my algorithm **must handle the single-element case** (return 0; no valid pair exists).
6. Because state collapses to two scalars (running min, running max profit), my algorithm **needs only O(1) auxiliary space**.

---

## Phase 5 — Classify

**Primary category:** Greedy / single-pass (running aggregate replaces the inner loop of an O(n²) brute force).
**Why:** Conclusion 3 (track running minimum) and Conclusion 6 (O(1) state) both point at single-pass.

**Secondary:** Dynamic programming with state "best profit if I've sold by today" — same answer, different framing. Useful when the problem extends to multiple transactions (LC 122/123/188).

**Similar problems I've seen:** Maximum Subarray (Kadane's) — same shape, different aggregate.

---

## Phase 6 — Clarifying questions

The problem is mostly unambiguous, but in an interview I'd confirm:

1. "Just to confirm — exactly one buy and one sell, no partial transactions?" (Yes — but worth saying out loud because LC 122 is the multi-transaction variant.)
2. "If `prices.length === 1`, expected answer is 0?" (Yes — implicit but I'd verify.)

I would NOT ask "are negatives allowed" (constraints answer it) or "is the output an integer" (the example answers it).

---

## Phase 7 — Approach plan (out loud)

> "Based on n ≤ 10⁵, I need O(n) or O(n log n). I observed that at any sell index j, the right buy is the minimum of prices[0..j-1] — that's the algorithmic insight. Brute force is O(n²): for each pair (i, j) with j > i, compute profit and take max. Too slow.
>
> Optimal: one forward pass tracking `minPriceSoFar` and `maxProfitSoFar`. At each day j (starting from index 1):
> - first, update `maxProfitSoFar = max(maxProfitSoFar, prices[j] − minPriceSoFar)`
> - then, update `minPriceSoFar = min(minPriceSoFar, prices[j])`
>
> The order of these two matters — computing profit before updating min ensures we never buy and sell on the same day.
>
> Initialize `minPriceSoFar = prices[0]`, `maxProfitSoFar = 0`. The 0 init handles the 'no profitable transaction' case automatically.
>
> Edge cases I'm watching:
> - n=1 → loop doesn't execute → return 0 (handled by init)
> - all-decreasing → maxProfit stays 0 (handled by init)
> - all-equal → profit at every step is 0 (handled by max comparison)
>
> Time: O(n). Space: O(1)."

---

## Solution journey

### Brute force — O(n²) — for completeness

```
maxProfit = 0
for i from 0 to n-1:
  for j from i+1 to n-1:
    maxProfit = max(maxProfit, prices[j] - prices[i])
return maxProfit
```

Why it fails: at n = 10⁵, this is 5×10⁹ operations. Times out.

### Optimal — O(n) single pass

```
minPriceSoFar = prices[0]
maxProfitSoFar = 0
for j from 1 to n-1:
  maxProfitSoFar = max(maxProfitSoFar, prices[j] - minPriceSoFar)
  minPriceSoFar = min(minPriceSoFar, prices[j])
return maxProfitSoFar
```

**Order of the two updates matters** — must compute profit *before* updating min, otherwise you're allowing buy and sell on the same day (violates the "different day in the future" constraint).

### Java

```java
class Solution {
    public int maxProfit(int[] prices) {
        if (prices.length < 2) return 0;       // n=1 → no transaction possible
        int minPriceSoFar = prices[0];
        int maxProfit = 0;
        for (int j = 1; j < prices.length; j++) {
            // IMPORTANT: compute profit FIRST, then update min.
            // Reversing this allows buying and selling on the same day.
            maxProfit = Math.max(maxProfit, prices[j] - minPriceSoFar);
            minPriceSoFar = Math.min(minPriceSoFar, prices[j]);
        }
        return maxProfit;
    }
}
```

**Time: O(n). Space: O(1).**

---

## Edge cases & pitfalls

| Case | Why it matters | Handled? |
|---|---|---|
| `[1]` | n=1 — no transaction possible | Yes — early return; loop doesn't execute |
| `[7,6,4,3,1]` | All decreasing — answer is 0 | Yes — `maxProfit` initialized to 0; never updated |
| `[1,1,1]` | All equal — answer is 0 | Yes — profit at every step is 0 |
| Order of update | Computing profit AFTER updating min would let buy = sell day | Yes — explicit comment in code |
| Empty array | Constraint says n ≥ 1, so impossible — but defensive check anyway | The `< 2` guard handles n=0 too |
| Integer overflow | Max profit ≤ 10⁴ — far from overflow | Not a concern given constraints |

---

## Pattern recognition summary

This is the canonical **"max diff with order constraint"** pattern. The trick: at each index `j`, you only need the running optimum of one side (the buy side here). Single pass, O(1) state, O(n) time.

Pattern signals to recognize this in future problems:
- "max/min difference between two elements"
- "j > i" constraint (or similar)
- Single numerical answer
- O(n²) brute force is "for each pair"
- O(n) optimization tracks running min (or running max) of the constrained side

---

## What this problem really teaches

It's not really about stocks. It's about: **when an O(n²) "for each pair" brute force naturally exists, look for whether one of the two loops can be replaced by a running aggregate.**

That's the abstraction. Buy/Sell Stock II (multiple transactions) breaks the abstraction by allowing many opportunities; III/IV (limited transactions) restore it with DP state for transaction count. Whenever you see "do something between two indices i < j," ask "do I need both loops, or can the inner one collapse?"

---

## Related problems (for spaced repetition later)

- **Best Time to Buy and Sell Stock II** (LC 122) — multiple transactions; greedy on every up-move
- **Best Time to Buy and Sell Stock III** (LC 123) — at most 2 transactions; DP with transaction count
- **Best Time to Buy and Sell Stock IV** (LC 188) — at most k transactions; same DP, generalized
- **Maximum Subarray** (LC 53, Kadane's) — same shape: running aggregate replaces inner loop
- **Container With Most Water** (LC 11) — same "two indices, max diff" shape but different aggregate (two pointers)

---

## Action item

If you forget everything else: when you see "max profit / max diff between two indices with j > i," your hand should reflexively reach for **track the running min, update the running answer.** That's the pattern; everything else is bookkeeping.

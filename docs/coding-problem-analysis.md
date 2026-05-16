# Coding Problem Analysis — Template + Worked Example

> **How to use this doc:** when starting a new coding problem, run the template top-to-bottom (Phases 0–7) before writing any code. The worked example at the bottom shows what the full analysis looks like for LeetCode 121 — copy that structure for every problem you write notes on. Refine the template as your skill ceiling rises.

---

## Why this template exists

90% of candidates rush into coding. The strong ones spend the first 5–10 minutes **deconstructing** the problem before clarifying questions, before pseudo-code, before any line of real code.

**The core principle:** every line of a problem statement is intentional. Every constraint hides a hint. Every example is chosen to illuminate an edge or a pattern. Your job is to extract MEANING from each piece — not just READ it.

A weak candidate produces the same code as a strong candidate but in a different order: code first, understand later. The interviewer can tell.

---

## Phase 0 — Scan before you read (30 seconds)

Before deep reading, do a fast pass to anchor:

- **Glance at the title** — often a signal ("Best Time to Buy and Sell Stock" → optimization, time-series)
- **Glance at the constraints** — sets your time-budget ceiling on the algorithm
- **Glance at the examples** — gives a concrete shape before you parse abstract language
- **Glance at the return type** — single number? list? boolean? structured object?

Now you know roughly what kind of problem you're walking into. THEN do Phase 1.

---

## Phase 1 — Deep-read line by line

For every sentence in the problem statement, ask:

- **What is this telling me literally?**
- **What does it RULE OUT?** (forbidden actions, invalid states, disallowed inputs)
- **What does it RULE IN?** (mandatory operations, allowed flexibility)
- **What's IMPLICIT?** (assumptions not stated but required for the problem to make sense)

Generic examples of how to interrogate language:

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

Don't move past a sentence until you've drained it.

---

## Phase 2 — Decode constraints

Each constraint is a **clue about the expected solution complexity.** Treat them as the interviewer's whisper.

### Time-budget table

| Constraint | What it means | Likely complexity ceiling |
|---|---|---|
| `n ≤ 10` | Tiny | Brute force, backtracking, full permutations OK |
| `n ≤ 20` | Small | Bitmask DP (2ⁿ states), exponential OK |
| `n ≤ 50` | Small | O(n!) probably fails; O(2ⁿ) borderline |
| `n ≤ 100` | Small | O(n³) ≈ 10⁶ — fine |
| `n ≤ 1,000` | Medium | O(n²) ≈ 10⁶ — fine; classic DP territory |
| `n ≤ 10⁴` | Medium-large | O(n²) borderline (10⁸ ≈ 1–2s); prefer O(n log n) |
| `n ≤ 10⁵` | Large | **O(n²) is forbidden.** O(n log n) or O(n). |
| `n ≤ 10⁶` | Very large | O(n) or O(n log n) only |
| `n ≤ 10⁷` | Very large | O(n) only; constants matter; avoid heavy allocation |
| `n ≤ 10⁹` | Huge | O(log n) or O(1); cannot store |

### Value-range constraints decoded

| Constraint shape | What it tells you |
|---|---|
| `values ≤ 10⁴` (small) | Counting sort, bucket array, or array-as-hashmap viable |
| `values ≤ 10⁹` (large) | Need real hash map; can't index by value |
| Negatives allowed | Can't index by value directly; rules out direct counting; affects sums (overflow) |
| Zero allowed | Edge cases for division, multiplication, geometric mean |
| Floats allowed | Equality is suspect; tolerances matter |
| `n ≥ 1` (no empty) | One specific edge case removed — but n=1 is still its own edge |

### The two questions to ask of every constraint

1. **Why this upper bound and not 10× more or less?** (the bound is calibrated to a specific complexity)
2. **What does this constraint forbid?** (e.g., `n ≤ 10⁵` forbids O(n²))

---

## Phase 3 — Mine the examples

Examples are deliberately curated. They're not random.

For each example:

- **Trace through manually** — what's the path from input to answer?
- **What property does this example showcase?** (sorted, reversed, all-equal, all-negative, single-element, duplicates)
- **What would change if I tweaked one number?** (does the answer flip? does a new edge emerge?)
- **Does the example violate a naive assumption I might have?** (often the second example is chosen specifically to break a greedy that worked on the first)

What to extract:

- Structural properties (monotonic? periodic? sparse?)
- Whether order, position, or frequency drives the answer
- Forbidden combinations the example demonstrates
- Counterexamples to the simplest greedy you can think of

If only one example is given, **invent your own**: the smallest case (n=1), an all-decreasing case, an all-equal case, a case with duplicates. These reveal more than the official examples.

---

## Phase 4 — Form explicit conclusions

This phase converts observations into **design constraints for your algorithm.** Write them down. Out loud, ideally.

A good conclusion takes the form: *"Because of [X observation], my algorithm must [Y]."*

Examples of conclusion shape:

- "Because order matters, I cannot sort the input."
- "Because n ≤ 10⁵, brute force O(n²) is forbidden."
- "Because the answer is non-negative and we can refuse to transact, I can initialize the answer to 0."
- "Because each element is used at most once, this is *not* unbounded knapsack."
- "Because I need the running minimum, a single forward pass with state suffices."
- "Because the input is sorted, binary search is on the table."

These conclusions become the spec for the algorithm you're about to design. If you can't write 3–5 explicit conclusions, you haven't analyzed enough — go back to Phase 1.

---

## Phase 5 — Classify the category

Based on the observations + conclusions, give the problem a name. Categorization is half the battle — it routes you to a known solution shape.

| Signal in the problem | Likely category |
|---|---|
| "Find a pair with property" | Two pointers / hash map |
| "Subarray with property X" | Sliding window / prefix sum |
| "Subsequence with property X" | Dynamic programming |
| "Find min/max while iterating; single value answer" | Greedy / single-pass |
| "Count the number of ways to…" | Dynamic programming |
| "Shortest / longest path" | BFS / DFS / Dijkstra |
| "Reach a target value/state" | DP / BFS / backtracking |
| "Sorted array operations" | Binary search / two pointers |
| "Hierarchical / parent-child relationships" | Tree / recursion |
| "Order doesn't matter, group by property" | Hash map / sorting |
| "Maximize profit / score" | Greedy *or* DP (verify with constraints) |
| "Find Kth largest/smallest" | Heap / quickselect |
| "Anything with intervals" | Sort + sweep / interval merge |
| "Anything with prefix queries" | Prefix sum / segment tree / Fenwick |
| "Anything with cycles in choices" | Graph theory / Union-Find |

If the problem fits multiple categories, list them — you'll narrow down once you start sketching.

---

## Phase 6 — Clarifying questions (categorized)

After Phases 1–5 you'll have natural questions. Categorize them so you don't miss any:

**Bounds**
- What's the maximum size? (if not in the constraints)
- Can the input be empty / null?
- Can n = 1?

**Semantics**
- Is "subarray" contiguous, or do you mean "subsequence"?
- Does "different day" mean different INDEX or different VALUE?
- Are duplicates allowed in the input?

**Return value**
- What should I return if the answer doesn't exist? (-1? 0? throw?)
- Should the result be sorted? In any specific order?
- Index or value?

**Mutability / side effects**
- Can I modify the input in place?
- Is the input guaranteed to be valid (no need for input validation)?

**Operational**
- Multiple queries on the same data, or one-shot?
- Is the data static or streaming?

Don't ask all of them — ask the ones the problem statement was genuinely ambiguous about. Asking obvious ones signals weak reading.

---

## Phase 7 — State the approach plan (out loud)

Before pseudo-code, narrate:

> "Based on the constraint n ≤ 10⁵, I need O(n) or O(n log n).
> I observed [X], which means [Y].
> The simplest approach is brute force [Z] which is O(n²). Let me verify it's correct on the examples first, then I'll optimize.
> The optimization I'm thinking about is [W], which I think gets us to O(n) by tracking [state]."

This narration is what interviewers grade you on. **The verbal plan is the differentiator** — two candidates write the same code; the one who narrated the why scores higher.

---

## Common analysis traps to avoid

These are the failures that show up most often, even from people who "know the template":

1. **Skipping Phase 2 because the problem looks easy.** Easy-looking problems still have constraint signals. Skipping = missing them.
2. **Reading the problem only once.** First read = vocabulary; second read = structure; third read = edge cases. One read is never enough.
3. **Trusting the official examples to cover edges.** They almost never do. Generate your own (n=1, all-equal, all-decreasing).
4. **"Maximize" auto-greedy reflex.** Not every "maximize" is greedy. DP is often the right answer; constraint analysis tells you which.
5. **Confusing "subarray" with "subsequence."** Contiguous vs not. Get this wrong and you're solving a different problem.
6. **Anchoring on the first valid algorithm you think of.** Spend an extra 60 seconds asking "is there an O(n) here?" before settling for O(n log n).
7. **Writing conclusions in your head, not on paper.** Out-loud + written conclusions catch contradictions; mental conclusions don't.

---

## What separates strong vs weak analysis

| Weak | Strong |
|---|---|
| Reads problem once | Reads three times: vocab → structure → edges |
| Memorizes constraint table | Asks *why* the bound was chosen |
| Trusts official examples | Generates own counterexamples |
| Categorizes from problem title alone | Categorizes from observations + conclusions |
| Jumps to optimal solution | States brute force first, then optimizes |
| Asks all clarifying questions | Asks only the ones the statement was ambiguous about |
| Internal monologue | External narration ("I notice…, which means…") |

---

## How to use this going forward

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

## Why interviewers care

Hiring managers explicitly look for this. Per the published interview guides at Google, Stripe, and Meta:

> "Strong candidates restate the problem in their own words, decode the constraints out loud, articulate observations from the examples, and explicitly state their approach plan before writing code. Candidates who jump to code, even with the same final solution, score notably lower on **problem-solving** and **communication** axes."

Two candidates produce the same code. The one who narrated their analysis gets the offer.

---

# Worked example: Best Time to Buy and Sell Stock (LeetCode 121)

This is what your notes should look like for every problem you do — the template applied, not just the template stated.

## The problem

> You are given an array `prices` where `prices[i]` is the price of a given stock on the i-th day.
> You want to maximize your profit by choosing a single day to buy one stock and choosing a different day in the future to sell that stock.
> Return the maximum profit you can achieve from this transaction. If you cannot achieve any profit, return 0.

**Constraints:**
- `1 ≤ prices.length ≤ 10⁵`
- `0 ≤ prices[i] ≤ 10⁴`

**Examples:**
- `[7,1,5,3,6,4]` → `5` (buy at 1, sell at 6)
- `[7,6,4,3,1]` → `0` (strictly decreasing; no profit possible)

---

## Phase 0 — Scan (30 seconds)

- Title says "Best Time…to Buy and Sell" → optimization, time-ordered
- Constraints: n up to 10⁵ — O(n) or O(n log n) territory
- Single integer return
- Two examples: one positive answer, one zero answer
- I'm looking at a single-pass / greedy / DP shape

---

## Phase 1 — Deep read

| Sentence | What it tells me |
|---|---|
| "array `prices` where `prices[i]` is the price on the i-th day" | Random-access array; index = day number; index is time |
| "single day to buy one stock" | Exactly one buy. One unit. Quantity is fixed. |
| "different day in the future" | sell index > buy index. STRICT inequality (different day, future) |
| "maximize your profit" | Optimization; one numeric answer |
| "If you cannot achieve any profit, return 0" | Profit is bounded below by 0; you're NOT forced to transact |

**Implicit (rule-out / rule-in):**
- Order is fixed — I can't sort
- I cannot buy and sell on the same day
- I cannot sell before I buy
- I cannot do multiple transactions (this matters — there's a follow-up problem where you can)

---

## Phase 2 — Decode constraints

| Constraint | Decoded |
|---|---|
| `1 ≤ prices.length ≤ 10⁵` | Array is non-empty (so I don't need a null check) but n=1 is possible. **O(n²) is forbidden.** Need O(n) or O(n log n). |
| `0 ≤ prices[i] ≤ 10⁴` | Prices are non-negative. No int overflow concerns (max possible profit = 10⁴, fits in a byte even). Not very informative for this problem — they're just preventing pathological values. |

**Why these bounds?**
- `n ≤ 10⁵` says: O(n²) brute force is wrong. Single-pass O(n) is the target.
- `prices[i] ≥ 0` says: profit is bounded above by `max(prices) - 0` = 10⁴. Sanity bound.

---

## Phase 3 — Mine examples

**Example 1: `[7,1,5,3,6,4]` → 5**

- Optimal: buy at index 1 (price 1), sell at index 4 (price 6), profit 5
- The maximum price (7) is at index 0 — BEFORE the minimum (1). It's unusable.
- The minimum price (1) is at index 1 — but the highest *future* price is 6, not the global max
- **Key observation:** at any sell index `j`, the best buy is the *minimum of* `prices[0..j-1]`

**Example 2: `[7,6,4,3,1]` → 0**

- Strictly decreasing
- Every future price is lower than the current
- The "If you cannot…return 0" clause activates
- This example exists specifically to confirm: don't force a transaction with negative profit

**Examples I should generate myself:**

- `[1]` → 0 (n=1, no future day)
- `[1,1,1,1]` → 0 (no profit possible from same prices)
- `[1,2]` → 1 (smallest positive case)
- `[2,1]` → 0 (smallest negative case)
- `[1,2,1,2]` → 1 (multiple opportunities; only one transaction allowed)
- `[3,1,4,1,5,9,2,6]` → 8 (buy at 1, sell at 9)

The `[1]` case is the one most candidates miss.

---

## Phase 4 — Form explicit conclusions

1. **Because order matters, I cannot sort.** Sorting would let me pair max with min trivially, but it destroys the temporal constraint.
2. **Because n ≤ 10⁵, O(n²) is forbidden.** Pairwise brute force won't pass.
3. **Because I want max(prices[j] − prices[i]) where j > i, the answer at any j is `prices[j] − min(prices[0..j-1])`.** This is the algorithmic insight.
4. **Because I'm not forced to transact, the answer is `max(0, computed_max)`.** I can initialize answer = 0 and only update on positive profit.
5. **Because n=1 is allowed, my code must handle it.** With one day, no transaction → return 0.
6. **I need only two pieces of state during the iteration:** running minimum price seen so far, running maximum profit seen so far.

These are the 6 design constraints for the algorithm.

---

## Phase 5 — Classify

Two valid categorizations:

- **Greedy / single-pass** — track running min, update running max profit at each step
- **Dynamic programming** — at each day, state is "best profit if I've sold by today" (degenerates to the same thing)

Greedy is the natural shape because the state collapses to two scalars. DP framing matters for follow-up problems (Buy and Sell Stock II, III, IV, with cooldown, with fee) where state expands.

---

## Phase 6 — Clarifying questions

Most are answered by the constraints/statement. The few I'd actually ask:

- Confirm: only one buy + one sell, total? (Yes per "single day to buy" and "a different day…to sell." If they say "no, multiple transactions OK," it's a different problem.)
- Confirm: must I transact? (No — return 0 is allowed.)
- Confirm: what should I return if input is length 1? (Implicit: 0 — no future day.)

Don't ask "are negatives allowed" — the constraints answer that.

---

## Phase 7 — State the approach plan

Out loud:

> "Constraint is n ≤ 10⁵, so I need O(n) or O(n log n).
> Observation: at any sell index j, the best buy was `min(prices[0..j-1])`. So profit at j = `prices[j] − running min`.
> Brute force is O(n²): for each pair (i, j) with j > i, compute profit; take max. I'll mention this for completeness but not implement.
> Optimal: one forward pass tracking `minPriceSoFar` and `maxProfitSoFar`. At each day:
>  - update `maxProfitSoFar = max(maxProfitSoFar, prices[j] − minPriceSoFar)`
>  - update `minPriceSoFar = min(minPriceSoFar, prices[j])`
> Initialize `minPriceSoFar = prices[0]`, `maxProfitSoFar = 0`.
> Edge case: array length 1 → loop doesn't execute → return 0. Handled."

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

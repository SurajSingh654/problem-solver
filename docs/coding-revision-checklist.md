# Coding Revision Checklist — Read Before Every Problem

> **What this doc is.** A scannable revision card you re-read before each new problem AND after each finished one. Different genre from `coding-problem-analysis.md` (the per-problem template). This doc is the **bug-prevention reflex log** — concrete habits and discriminator tests that catch the bugs you've actually made, plus pattern reflexes built up across the problems you've solved.
>
> **How to use it.**
>
> - **Before solving:** read sections 1–4 (60–90 seconds). Anchors the genre detectors and physical-discipline rules in working memory.
> - **After solving:** if you made a mistake, log it in section 6 (Bug autopsy). If you discovered a new pattern reflex or discriminator, add it to sections 3 / 5.
> - **Monthly:** prune. Bugs you've fully internalized (haven't made in 30+ problems) can graduate out.

---

## 1. The 60-second pre-flight

Before reading the problem statement itself, run this micro-routine:

```
[ ] Title — what genre word? (find / count / max / valid / longest / climb …)
[ ] Constraints — what's the largest n? Translate to allowed Big-O class.
[ ] Examples — input shape (array / string / integer / matrix)? Output shape (number / boolean / list)?
[ ] Return type — value or index? Bounded? Can it grow exponentially?
```

Then, sentence by sentence, run the four lenses (literal / rules out / rules in / implicit). Don't write code until Phase 4 conclusions are on paper.

**Reminder of the discipline rule that keeps this honest:** if any phase produces zero new information beyond what you already had, you skimmed it. Slow down.

---

## 2. Pattern reflexes — when you see X, your hand types Y

Built from the problems you've solved. Extend after every new problem.

| Signal                                                             | Reflex (the pattern your hand reaches for)                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| "find a pair summing to target" / "find two indices with property" | **Hash map of complement** — single pass, O(n). (LC 1 Two Sum)                        |
| "max profit / max diff between two indices i < j"                  | **Track running min + update running max** — single pass, O(1) state. (LC 121)        |
| "max sum subarray" / running-aggregate optimization                | **Kadane's** — `currMax = max(x, currMax + x); ans = max(ans, currMax)`. (LC 53)      |
| "validate matched / balanced / nested / well-formed"               | **Stack + tiny match-map**. Closing char must match top. (LC 20)                      |
| "longest substring with property X"                                | **Sliding window** — two pointers, expand right, contract left only as needed. (LC 3) |
| "shortest substring containing all of Y"                           | Sliding window with frequency-map invariant                                           |
| "in how many distinct ways" / "count the number of sequences"      | **1D DP** — ask "what was the LAST move into this state?" (LC 70)                     |
| "min cost / min ops to reach state n"                              | DP — same recurrence-discovery question                                               |
| "k-th largest / smallest"                                          | Heap (size-k) or quickselect                                                          |
| "find element in sorted array"                                     | Binary search                                                                         |

---

## 3. Physical-discipline rules — atomic typing phrases

These are the rules that defeat **invisible bugs**: bugs the compiler accepts, small inputs hide, and only adversarial inputs expose. Memorize the typing rhythm, not just the rule.

### Rule A — Memoization is `compute → put → return`, atomically

```java
// ❌ BROKEN — your bug from LC 70
if (cache.containsKey(n)) return cache.get(n);
int result = climbStairs(n - 1) + climbStairs(n - 2);
return result;                            // never wrote — cache stays empty

// ✅ Safe pattern 1 (HashMap, explicit)
if (cache.containsKey(n)) return cache.get(n);
int result = climbStairs(n - 1) + climbStairs(n - 2);
cache.put(n, result);                     // ← inseparable from compute
return result;

// ✅ Safe pattern 2 (HashMap, idiomatic)
return cache.computeIfAbsent(n, k -> climbStairs(k - 1) + climbStairs(k - 2));

// ✅ Safe pattern 3 (array, assign-and-return)
return memo[n] = helper(n - 1, memo) + helper(n - 2, memo);
```

**The keyboard rule:** `compute` and `cache.put` must be on consecutive lines. Never type one without typing the other immediately.

### Rule B — Sliding-window state needs a freshness guard

```java
// ❌ BROKEN — your bug from LC 3
if (map.containsKey(c)) {
    left = map.get(c) + 1;                // could move left BACKWARD on stale entry
}

// ✅ Safe — `containsKey` + `>= left` are one atomic phrase
if (map.containsKey(c) && map.get(c) >= left) {
    left = map.get(c) + 1;
}
```

**The keyboard rule:** the moment you type `if (map.containsKey(c)`, your next keystrokes are ` && map.get(c) >= left)`. Treat it as one phrase. Even when the entry is "obviously" fresh.

**Why this rule is asymmetric and you should always follow it:** if the guard is unnecessary, it costs nothing. If the guard is necessary and you forgot it, you ship a silent staleness bug. Always include.

### Rule C — Stack pop must be guarded by isEmpty

```java
// ❌ BROKEN — NoSuchElementException on first close-bracket of an empty stack
if (stack.pop() != match.get(c)) return false;

// ✅ Safe — check isEmpty FIRST, short-circuit
if (stack.isEmpty() || stack.pop() != match.get(c)) return false;
```

### Rule D — Compute order matters in single-pass aggregates

```java
// ❌ Wrong order — LC 121: lets you buy and sell on the same day
minPrice = Math.min(minPrice, prices[j]);              // updates min first
maxProfit = Math.max(maxProfit, prices[j] - minPrice); // diff is now zero

// ✅ Right order — profit BEFORE updating min
maxProfit = Math.max(maxProfit, prices[j] - minPrice); // uses prior min
minPrice = Math.min(minPrice, prices[j]);              // then update
```

**The keyboard rule:** when an aggregate has a constraint (`j > i`, "must be different day", etc.), the _constrained_ update happens FIRST, then the _state_ update. Constraint-then-state.

### Rule E — DP base cases before the general recurrence

```java
public int climbStairs(int n) {
    if (n <= 2) return n;                              // ← base cases first
    // … recurrence here, knowing n ≥ 3
}
```

If your recurrence references `f(n-2)`, you cannot apply it at `n=1`. Always handle base cases at the top of the function. Saves you from `ArrayIndexOutOfBounds` and stack-overflow on tiny inputs.

---

## 4. Discriminator test cases — the 2-4 input that catches the wrong approach

Every problem-class has an adversarial input that distinguishes the right algorithm from the most-tempting wrong one. Run your solution mentally on these BEFORE submitting. If it can't handle the discriminator, your approach is wrong — don't waste a submission.

| Problem class          | Discriminator                       | Why it catches the wrong approach                                                                                                               |
| ---------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| LC 121 max-profit      | `[7,6,4,3,1]` (strictly decreasing) | Refutes "max − min"; max precedes min so the diff is invalid. Forces order-aware logic.                                                         |
| LC 53 max subarray     | `[-2,1,-3,4,-1,2,1,-5,4]`           | Running sum goes negative; naive "always extend" gives 4, correct is 6. Forces Kadane's reset.                                                  |
| LC 20 parens           | `"([)]"`                            | Numerically balanced (one of each pair). Refutes counting; only LIFO catches it.                                                                |
| LC 3 longest substring | `"abba"`                            | Char leaves window then re-enters with stale index. Catches missing `>= left` guard. Also `"dvdf"` — needs to keep `'v'` after `'d'` collision. |
| LC 70 climbing stairs  | `n = 45` with naive recursion       | 2⁴⁵ ≈ 35 trillion — TLE. Catches "memoization is just a `containsKey` check" bugs.                                                              |
| LC 1 two sum           | `[3,3]` target `6`                  | Duplicate values; the answer uses both copies. Catches "skip same value" or "use a Set" bugs.                                                   |

**Ritual:** before clicking Submit, mentally trace through the discriminator for the genre. 30 seconds saved bug.

---

## 5. Cross-problem lessons (the recurring meta-insights)

These are the patterns that span the 6 problems you've solved. They generalize.

### 5.1 Brute force is genre-dependent

- Optimization (LC 121) — nested loops over pairs
- Validation (LC 20) — repeated collapse / regenerate
- Counting / DP (LC 70) — **naive recursion**, not nested loops
- Sliding window (LC 3) — nested "for each substring, check"
- Counting on arrays (LC 53) — nested "for each (i,j), sum prices[i..j]"

Don't force a nested-loop framing onto a problem where the natural brute force is recursion or collapse.

### 5.2 State structures may carry stale entries

HashMap of last-index, frequency counter, "seen" set across an entire scan — these contain entries from outside the current window. **Either prune explicitly (HashSet remove + while-loop) or query with a freshness guard (HashMap with `>= left` filter).** Never assume the state and the window are the same thing.

### 5.3 Order constraints forbid sorting

"i < j", "in the future", "in the same order" — any phrase locking sequence forbids `Arrays.sort()`. If you find yourself reaching for sort, re-read the problem; you're probably solving the wrong thing.

### 5.4 Bounds are calibrated

Every constraint number was chosen for a reason:

- `n ≤ 10⁵` forces O(n log n) or O(n)
- `n ≤ 45` forces memoization (because 2⁴⁵ TLEs) AND fits Fibonacci in 32-bit int
- `n ≤ 20` allows bitmask DP / exponential
- `values ≤ 10⁴` allows array-as-hashmap (no real hash needed)

Ask "why this number?" before settling on an algorithm. Bounds whisper.

### 5.5 Subarray ≠ subsequence

**Subarray = contiguous.** `[1,2,3]` has subarrays `[1]`, `[2]`, `[3]`, `[1,2]`, `[2,3]`, `[1,2,3]` — and that's it.
**Subsequence = order-preserving but not contiguous.** Same input has subsequences `[1,3]`, `[1,2,3]`, etc.

LC 53 is subarray (Kadane). LC 300 (Longest Increasing Subsequence) is subsequence (DP, much harder). The problem-statement word is load-bearing — never read past it.

### 5.6 "Two halves" pattern

Many algorithms have read + write halves that must both be present:

- Memoization: read cache + write cache
- Sliding window with last-index map: query freshness + update index
- Greedy with running aggregate: use prior min + update min

When you implement only one half, the algorithm appears to work but silently degrades to its un-optimized version. The two halves should be physically adjacent in the code.

---

## 6. Bug autopsy log — your actual mistakes, dated

Append to this. Don't delete entries even after you've internalized them — old bugs are training data.

### 2026-05-28 — LC 70 Climbing Stairs: forgot `cache.put`

**What happened:** wrote a HashMap-based memoized solution. Had `containsKey` check; had recursive call; **forgot the `cache.put(n, result)` line**. The cache stayed empty across all calls, making the solution effectively naive recursion. Compiled fine, returned correct answers on n ≤ 30, TLE'd at n = 45.

**Lesson:** Memoization has two halves. Adopt Rule A (compute → put → return atomic block) or use `computeIfAbsent`.

**How to never repeat:** don't type `int result = recurse(...)` without immediately typing `cache.put(n, result);` on the next line.

### 2026-05-28 — LC 3 attempt 1: bespoke "reset on duplicate" instead of sliding window

**What happened:** tried to invent the algorithm rather than pattern-match. On duplicate, reset window to just the current char. Failed on `"dvdf"` (returned 2 instead of 3) because the reset discarded valid prior chars.

**Lesson:** Phase 5 categorization first. "Longest substring with property X" → sliding window (in the signal table). Don't write bespoke logic when a known pattern fits.

**How to never repeat:** Phase 5 (categorize) is non-skippable. If you can't name the category in 10 seconds, don't start coding.

### 2026-05-28 — LC 3 attempt 2: missing `>= left` guard in sliding-window HashMap

**What happened:** correct sliding window structure, but on duplicate, jumped `left = map.get(c) + 1` without checking whether the previous index was actually inside the current window. On `"abba"`, the stale `'a' → 0` entry would have moved `left` backward.

**Lesson:** Stale state in sliding-window data structures. Adopt Rule B (`containsKey + >= left` atomic phrase).

**How to never repeat:** the keyboard rhythm — `containsKey(c)` is followed immediately by ` && map.get(c) >= left`. Always.

---

## 7. Problems-solved log

Tracking what you've covered, what genre each fell into, and the one-line pattern that unlocks each.

| #   | Problem                                             | Genre                               | The pattern that unlocks it                                                         |
| --- | --------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | LC 1 Two Sum                                        | Hash-map lookup                     | "Have I seen `target − x` already?" → store complements in a map.                   |
| 2   | LC 121 Best Time to Buy and Sell Stock              | Optimization (greedy / single-pass) | At each sell index j, the right buy is `min(prices[0..j-1])`. Track running min.    |
| 3   | LC 20 Valid Parentheses                             | Validation (stack)                  | LIFO matching: most-recent open must match next close.                              |
| 4   | LC 53 Maximum Subarray                              | Optimization (Kadane's)             | At each i, either extend the running sum or reset to `nums[i]`. Track running max.  |
| 5   | LC 3 Longest Substring Without Repeating Characters | Sliding window                      | Two pointers; advance left only enough to remove the duplicate. Beware stale state. |
| 6   | LC 70 Climbing Stairs                               | 1D DP                               | `f(n) = f(n-1) + f(n-2)`. The last step was either a 1-step or a 2-step.            |

When the count hits ~30 problems, group by genre and look at frequency. The most-common genres deserve the most-internalized reflexes.

---

## 8. How to revise and grow this doc

**After every new problem:**

1. Did you make a mistake? → Add an entry to **Bug autopsy log** with date, what happened, lesson, "how to never repeat."
2. Did you learn a new pattern reflex? → Add a row to the **Pattern reflexes** table.
3. Did you learn a new discriminator test case? → Add a row to **Discriminator test cases**.
4. Always: add a row to **Problems-solved log** with the one-line unlock.

**Every 10 problems:**

- Re-read sections 1–5 cold. If anything feels stale or already-internalized, mark it for graduation.
- Look at the Problems-solved log: are there patterns clustering? Add the cluster to Pattern reflexes if not already there.

**Every 30 problems:**

- Move "graduated" autopsy entries to a separate `coding-graduated-bugs.md` file (so they're still searchable but not crowding your active revision card).
- Refresh the discriminator test case table — keep only the ones still adding signal.

**The goal:** by problem 50, this doc should be ~2 pages long. Not because you're forgetting — because the bugs you used to make have become impossible to type.

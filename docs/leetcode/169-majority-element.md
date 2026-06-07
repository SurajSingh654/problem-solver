# 169. Majority Element

- **Link:** https://leetcode.com/problems/majority-element/description/
- **Difficulty:** Easy
- **Pattern:** Boyer-Moore Voting Algorithm
- **Time / Space:** O(n) / O(1)

## Problem

Given an array `nums` of size `n`, return the **majority element** — the element that appears more than `⌊n/2⌋` times. The problem guarantees that a majority element always exists.

---

## Code

```java
class Solution {
    public int majorityElement(int[] nums) {
        int count = 0;
        int candidate = 0;

        for (int num : nums) {
            if (count == 0) {
                candidate = num;
            }

            if (num == candidate) {
                count++;
            } else {
                count--;
            }
        }

        return candidate;
    }
}
```

## Pseudo Code

```
function majorityElement(nums):
    count     ← 0
    candidate ← undefined

    for num in nums:
        if count == 0:
            candidate ← num            # adopt a new working hypothesis
        if num == candidate:
            count ← count + 1          # same vote → leader's lead grows
        else:
            count ← count - 1          # opposing vote → cancel one leader vote

    return candidate
```

Two integers, one pass, no extra structures. The two `if`s are independent (not `if/else`) — when `count == 0`, the freshly-adopted candidate must immediately match itself and bump `count` to 1.

## Algorithm Explained — Boyer-Moore Voting

**Origin.** Published 1981 by Robert S. Boyer and J Strother Moore in _A Fast Majority Vote Algorithm_. Same Boyer & Moore who designed the Boyer-Moore string-search algorithm. Their goal was a fault-tolerant voting protocol — find the majority answer among possibly-disagreeing distributed processes — using minimal memory.

### The core mathematical claim

> If an element appears strictly more than `n/2` times in an array of length `n`, then no matter how the rest of the elements are arranged, **the majority element will survive a pairwise cancellation of disagreements**.

Why? Let `k` be the count of the majority element. The non-majority elements total `n - k`. Since `k > n/2`, we have `n - k < n/2 < k`. Even if every non-majority vote cancels a majority vote one-for-one (the worst case for the majority), `k - (n - k) = 2k - n > 0` majority votes remain.

### From idea to algorithm

The algorithm performs that pairwise cancellation in a single pass. Two state variables:

- `candidate` — the element we're "currently betting on" as the majority.
- `count` — the lead `candidate` has accumulated minus opposition seen so far.

Three rules per element:

1. **`count == 0`** — we have no working hypothesis (either we just started, or our previous candidate was completely cancelled out). Adopt the current element as the new candidate.
2. **Element matches `candidate`** — increment `count`. The leader's lead grows by one.
3. **Element doesn't match `candidate`** — decrement `count`. One leader vote and one opponent vote pair off and cancel.

### The invariant (subtle but exact)

After processing the first `i` elements, **if a majority element exists in the full array, then it is _some_ element that has appeared in the first `i` elements** — and _if_ `count > 0`, the current `candidate` is one of the elements that could still be the majority of the _full_ array.

Crucially, the candidate is **NOT necessarily the majority of the prefix `nums[0..i]`** — it can be a non-majority element mid-scan, because the true majority might appear later and "rescue" itself. The algorithm only guarantees correctness at the end.

### Worked trace

`nums = [2, 2, 1, 1, 1, 2, 2]`, `n = 7`, true majority is `2` (appears 4 times > 3.5).

| step | num | count before | rule fired    | candidate after | count after |
| ---- | --- | ------------ | ------------- | --------------- | ----------- |
| 1    | 2   | 0            | adopt + match | 2               | 1           |
| 2    | 2   | 1            | match         | 2               | 2           |
| 3    | 1   | 2            | cancel        | 2               | 1           |
| 4    | 1   | 1            | cancel        | 2               | 0           |
| 5    | 1   | 0            | adopt + match | 1               | 1           |
| 6    | 2   | 1            | cancel        | 1               | 0           |
| 7    | 2   | 0            | adopt + match | 2               | 1           |

Final candidate: `2`. ✅

Notice step 5: `2` was the candidate, got fully cancelled, then `1` took over briefly before being cancelled itself in step 6. The candidate flips around mid-scan. That's expected — the math guarantees the _final_ candidate is correct, not every intermediate one.

### Why the algorithm fails without the majority guarantee

If no element exceeds `n/2`, the algorithm still returns whichever element ended the scan as the candidate — but that element might appear only twice in the array. Boyer-Moore is only correct under the **majority-exists precondition**. In practice, do a verification pass: count occurrences of the returned value and confirm it exceeds `n/2`.

### Complexity proof

- **Time:** O(n). Each element triggers at most three constant-time ops (compare, increment, assignment). One pass.
- **Space:** O(1). Two integers regardless of input size — `candidate` and `count`. No allocation, no recursion.

You cannot do better on time (you must read every element to be certain) or on space (you can't fit a counting structure into less than O(1)). This is **provably optimal** for the problem.

### Why this is hard to invent from scratch

Most people, given the problem, reach for one of:

- **Hash map** — natural, O(n) time but O(n) space.
- **Sort + return middle** — clever, but O(n log n) time.

The Boyer-Moore leap is recognizing that the strict majority condition (`> n/2`, not `≥`) gives you an algebraic guarantee strong enough to discard most state. Without that strict inequality, the algorithm doesn't work — and that's why it doesn't generalize trivially to "find the most-frequent element" (which has no algebraic shortcut and needs O(n) space).

## Optimized Code

The submitted code is **already the optimal solution** for this problem (Boyer-Moore Voting). No reduction in time or space is possible:

- O(n) time is required since we must read every element to determine majority.
- O(1) space is the lower bound — Boyer-Moore achieves it.

A minor stylistic tightening (single `if/else` for the count update) — same algorithm, same complexity:

```java
class Solution {
    public int majorityElement(int[] nums) {
        int count = 0, candidate = 0;
        for (int num : nums) {
            if (count == 0) candidate = num;
            count += (num == candidate) ? 1 : -1;
        }
        return candidate;
    }
}
```

### Alternative approaches (slower / more memory)

| Approach             | Time       | Space        | Notes                                                                           |
| -------------------- | ---------- | ------------ | ------------------------------------------------------------------------------- |
| Sort + return middle | O(n log n) | O(1) or O(n) | Sort-then-pick `nums[n/2]`. Works because majority must occupy the middle slot. |
| Hash map count       | O(n)       | O(n)         | Count occurrences, return whichever exceeds `n/2`.                              |
| Boyer-Moore (this)   | **O(n)**   | **O(1)**     | Optimal.                                                                        |

---

## Key Insight

A majority element appears **strictly more than half** the time, so when you pair it up against every other element, it will always have leftovers.

That observation translates into an algorithm: as you scan, **pair off disagreements** (one vote for the current leader cancels one vote against). Whatever survives the scan must be the majority — because the non-majority elements together are fewer than `n/2`, and even if every one of them cancels a majority vote, there are still `2k - n > 0` majority votes left standing.

The candidate variable is _not_ always the majority during the scan — it flips as runs cancel out. The invariant only re-establishes itself at the end. That's the surprising part.

---

## Explain It Simply

Imagine a tournament where every voter walks in and shouts the name of their favorite candidate. The rule: whenever two voters shout _different_ names, both walk out the door — they cancel each other. Whenever a voter agrees with whoever is currently winning, they stack up behind that candidate.

If one candidate has more than half the votes, no matter how cleverly the others try to cancel them out, **they can't cancel them all** — there will always be at least one of them left standing at the end of the line. That last person standing is the answer.

The algorithm is just bookkeeping for that thought experiment. Two integers — `candidate` (current leader) and `count` (their lead) — are enough. You don't need a map, a sorted array, or anything else. The math guarantees the leader at the end is the right one.

---

## Common pitfalls

1. **"What if there's no majority?"** Boyer-Moore returns _something_, but it'll be garbage. LeetCode 169 guarantees a majority exists; in real code, do a second pass to verify.
2. **Order of `if`s matters.** The `count == 0` check must come _before_ the match check. Reordering or merging into `if/else if` silently breaks the algorithm.
3. **Don't expect `candidate` to hold the majority mid-scan.** It flips. Only the final value is meaningful.

---

## Generalizations

- **Majority Element II (LC 229)** — find all elements appearing more than `n/3` times. Same idea with **two** candidates and **two** counters (Boyer-Moore for `⌊n/k⌋` uses `k-1` candidates).
- **Misra-Gries / heavy hitters** — generalization to streaming data: find frequent items in a billion-element stream with sub-linear memory. Same DNA.

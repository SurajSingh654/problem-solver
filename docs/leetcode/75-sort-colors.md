# 75. Sort Colors

- **Link:** https://leetcode.com/problems/sort-colors/
- **Difficulty:** Medium
- **Pattern:** Dutch National Flag (Three-Way Partitioning)
- **Time / Space:** O(n) / O(1) — single pass, in-place

## Problem

Given an array `nums` containing only `0`, `1`, and `2` (representing red, white, and blue), sort the array **in-place** so that objects of the same color are adjacent in the order `red → white → blue` (i.e. `0`s, then `1`s, then `2`s).

You must solve this without using any built-in sort. **Follow-up:** can you do it in **one pass** using **constant extra space**?

---

## Code

```java
class Solution {
    public void sortColors(int[] nums) {
        int[] colorCount = {0,0,0};
        for(int i=0;i<nums.length;i++){
            colorCount[nums[i]]+=1;
        }

        for(int i=0;i<nums.length;i++){
            if(colorCount[0]>0){
                nums[i]=0;
                colorCount[nums[i]]-=1;
            }else if(colorCount[1]>0){
                nums[i]=1;
                colorCount[nums[i]]-=1;
            }else{
                 nums[i]=2;
                 colorCount[nums[i]]-=1;
            }
        }
    }
}
```

This is **counting sort** specialized to a 3-element domain. It works correctly and is O(n) time, O(1) space (the count array is fixed at 3 ints regardless of `n`). But it makes **two passes** over the array — one to count, one to overwrite — which the LeetCode follow-up explicitly asks you to avoid.

## Pseudo Code

### Counting sort (your approach — 2 passes)

```
function sortColors(nums):
    count ← [0, 0, 0]
    for num in nums:                   # pass 1: tally each color
        count[num] ← count[num] + 1

    i ← 0
    for color in [0, 1, 2]:             # pass 2: write back in order
        repeat count[color] times:
            nums[i] ← color
            i ← i + 1
```

### Dutch National Flag (one pass — the optimal answer)

```
function sortColors(nums):
    low  ← 0                            # boundary: everything left of low is 0
    mid  ← 0                            # cursor: scans the unknown region
    high ← length(nums) - 1             # boundary: everything right of high is 2

    while mid <= high:
        if nums[mid] == 0:
            swap(nums[low], nums[mid])  # 0 belongs in the left zone
            low  ← low + 1
            mid  ← mid + 1              # safe to advance — value at low was already scanned
        else if nums[mid] == 1:
            mid  ← mid + 1              # 1 belongs in the middle — leave it, move on
        else:                            # nums[mid] == 2
            swap(nums[mid], nums[high]) # 2 belongs in the right zone
            high ← high - 1
            # do NOT advance mid — the swapped-in value is unscanned
```

The asymmetry between the `0`-branch and the `2`-branch is the only thing to memorize. We'll prove it's correct below.

## Algorithm Explained — Dutch National Flag

**Origin.** Posed by Edsger W. Dijkstra in _A Discipline of Programming_ (1976) as the "Dutch National Flag Problem" — the Netherlands' flag has three horizontal bands (red, white, blue), and Dijkstra asked how to rearrange a sequence of red/white/blue pebbles into the flag's order using only O(1) extra space and O(n) comparisons. It's the canonical example of **three-way partitioning**.

### The core idea: maintain four regions

At every moment during the scan, the array is mentally partitioned into **four zones**:

```
[ 0 0 0 0 | 1 1 1 | ?  ?  ?  ?  ?  | 2 2 2 ]
          ↑       ↑                ↑
         low     mid              high
```

| Region           | Index range           | Invariant                              |
| ---------------- | --------------------- | -------------------------------------- |
| **Red zone**     | `nums[0 .. low-1]`    | All `0`s. Sorted, untouchable.         |
| **White zone**   | `nums[low .. mid-1]`  | All `1`s. Sorted, untouchable.         |
| **Unknown zone** | `nums[mid .. high]`   | Not yet examined. Could be 0, 1, or 2. |
| **Blue zone**    | `nums[high+1 .. n-1]` | All `2`s. Sorted, untouchable.         |

The algorithm shrinks the unknown zone by one element per iteration and grows the appropriate sorted zone. When the unknown zone is empty (`mid > high`), the array is sorted.

### Why the three rules work

**Case `nums[mid] == 0`** — this element belongs at the right edge of the red zone. Swap it with `nums[low]`. The element that came from `low` was already known to be `1` (because it was just left of `mid` in the white zone), so after the swap, `nums[mid]` is now a `1` — already correctly placed in the white zone. **Advance both `low` and `mid`** — the white zone shifts right by one, and we've finished examining position `mid`.

> Edge case: when `low == mid`, the swap is a no-op and we still advance both. Same effect.

**Case `nums[mid] == 1`** — already in the right zone. Just advance `mid`. The white zone grows by one; nothing moves.

**Case `nums[mid] == 2`** — this element belongs at the left edge of the blue zone. Swap it with `nums[high]`. The element that came from `high` was in the **unknown** zone (we hadn't examined it yet), so after the swap, `nums[mid]` could be 0, 1, or 2 — we don't know. **Advance `high` only** — the blue zone grows by one, but `mid` stays put because we haven't examined the new value at `mid`.

The asymmetry is the trickiest part of the algorithm: when you swap with `low`, the displaced value is _known_ (already-scanned `1`), so `mid` can advance. When you swap with `high`, the displaced value is _unknown_, so `mid` must re-examine it.

### Worked trace

`nums = [2, 0, 2, 1, 1, 0]`, `n = 6`. Start: `low=0, mid=0, high=5`.

| step | low | mid | high | nums            | rule                | reason                             |
| ---- | --- | --- | ---- | --------------- | ------------------- | ---------------------------------- |
| 0    | 0   | 0   | 5    | `[2,0,2,1,1,0]` | start               | —                                  |
| 1    | 0   | 0   | 4    | `[0,0,2,1,1,2]` | nums[mid]=2         | swap mid↔high (2↔0), high--        |
| 2    | 1   | 1   | 4    | `[0,0,2,1,1,2]` | nums[mid]=0         | swap low↔mid (no-op), low++, mid++ |
| 3    | 2   | 2   | 4    | `[0,0,2,1,1,2]` | nums[mid]=2... wait |

Let me re-trace step 2. At step 1 the array is `[0,0,2,1,1,2]` with low=0, mid=0, high=4. nums[mid]=nums[0]=0 → swap low↔mid (no-op since equal), low++→1, mid++→1.

| step | low | mid | high | nums            | rule                                           |
| ---- | --- | --- | ---- | --------------- | ---------------------------------------------- |
| 0    | 0   | 0   | 5    | `[2,0,2,1,1,0]` | start                                          |
| 1    | 0   | 0   | 4    | `[0,0,2,1,1,2]` | nums[0]=2 → swap nums[0]↔nums[5], high--       |
| 2    | 1   | 1   | 4    | `[0,0,2,1,1,2]` | nums[0]=0 → swap nums[0]↔nums[0], low++, mid++ |
| 3    | 2   | 2   | 4    | `[0,0,2,1,1,2]` | nums[1]=0 → swap nums[1]↔nums[1], low++, mid++ |
| 4    | 2   | 2   | 3    | `[0,0,1,1,2,2]` | nums[2]=2 → swap nums[2]↔nums[4], high--       |
| 5    | 2   | 3   | 3    | `[0,0,1,1,2,2]` | nums[2]=1 → mid++                              |
| 6    | 2   | 4   | 3    | `[0,0,1,1,2,2]` | nums[3]=1 → mid++                              |
| —    | —   | —   | —    | —               | terminate (mid > high)                         |

Result: `[0,0,1,1,2,2]`. ✅ Six iterations, six element-touches at most twice each.

### The invariant (formal)

At the top of each loop iteration:

```
∀ i ∈ [0,    low)  : nums[i] = 0
∀ i ∈ [low,  mid)  : nums[i] = 1
∀ i ∈ (high, n)    : nums[i] = 2
nums[mid .. high]  : unexamined
```

Each rule preserves all four clauses (proof by case analysis — exactly the three branches above). Termination: `high - mid` strictly decreases when the rule is the `0`-branch or the `2`-branch (one of `mid` or `high` moves toward the other), and the `1`-branch decreases `high - mid` by exactly 1 as well. So the loop runs at most `n` iterations.

### Complexity proof

- **Time:** O(n). Each iteration either advances `mid` or retreats `high`. The combined movement is bounded by `n`. Each iteration is O(1) work.
- **Space:** O(1). Three integer pointers, no auxiliary structures.
- **Passes:** **One.** Each array element is examined at most once (after which it sits in a finalized zone). Two-pointer movement makes this strictly tighter than counting sort.

### Why this is the canonical solution

Sort Colors is the textbook excuse to teach Dutch National Flag because:

1. The 3-way partitioning idea generalizes directly to **3-way quicksort** (Bentley-McIlroy 1993, the standard algorithm in `Arrays.sort` for primitive types in modern JDKs) — handles arrays with many duplicate keys in O(n) instead of O(n log n).
2. It's the simplest non-trivial use of **multiple coordinated pointers maintaining a loop invariant** — a pattern that recurs in problems like "Move Zeroes", "Remove Duplicates from Sorted Array", and "Partition Array".
3. The asymmetry (advance `mid` on left-swap, don't advance on right-swap) is the kind of subtlety that interviewers love to probe — "what happens at this edge?"

---

## Optimized Code

```java
class Solution {
    public void sortColors(int[] nums) {
        int low = 0, mid = 0, high = nums.length - 1;
        while (mid <= high) {
            switch (nums[mid]) {
                case 0:
                    swap(nums, low++, mid++);
                    break;
                case 1:
                    mid++;
                    break;
                case 2:
                    swap(nums, mid, high--);
                    break;
            }
        }
    }

    private void swap(int[] a, int i, int j) {
        int t = a[i]; a[i] = a[j]; a[j] = t;
    }
}
```

One pass. O(n) time, O(1) space. Handles `n=0` and `n=1` trivially via the `mid <= high` guard.

### Alternative approaches

| Approach                  | Time       | Space    | Passes | Notes                                                               |
| ------------------------- | ---------- | -------- | ------ | ------------------------------------------------------------------- |
| Counting sort (your code) | O(n)       | O(1)     | **2**  | Correct and simple, but the follow-up explicitly asks for one pass. |
| Library sort              | O(n log n) | O(log n) | 1      | Disallowed by problem; doesn't exploit the 3-value domain.          |
| Dutch National Flag       | **O(n)**   | **O(1)** | **1**  | Optimal. The canonical answer.                                      |

---

## Key Insight

The array has only **three possible values**, and they have a natural total order (`0 < 1 < 2`). So instead of generic comparison-based sorting, you can mark off **finalized zones** at the two ends of the array and sweep the middle. Every element belongs in exactly one of three zones — left (`0`), middle (`1`), or right (`2`) — and you can place it there with at most one swap.

The asymmetry that's easy to miss: when you swap a `0` to the left zone, the element you displace was already inspected (it was a `1`), so you advance the cursor. When you swap a `2` to the right zone, the element you displace was _not yet inspected_ (it came from the unknown region), so you must re-examine the cursor's position. Same swap, different bookkeeping — because the two ends of the array have different histories.

---

## Explain It Simply

Imagine you're sorting a pile of red, white, and blue marbles strewn along a long shelf, and you want them ordered red → white → blue. You have two helpers: one stands at the **left end** and reaches rightward to grow a "red zone"; the other stands at the **right end** and reaches leftward to grow a "blue zone". You walk down the middle of the shelf, picking up marbles one at a time.

- **Red marble?** Toss it to the left helper. They place it at the right edge of the red zone. The marble that was sitting there gets handed back to you — but you've already seen it (it was white, sitting in the white zone), so you just put it where you were standing and take a step right.
- **White marble?** Leave it where it is. The white zone naturally grows behind you as you step right.
- **Blue marble?** Toss it to the right helper. They place it at the left edge of the blue zone. The marble that was there gets handed back to you — but you **haven't** seen it yet (it came from the un-sorted middle), so you stay put and look at it next.

When you and the right helper meet in the middle, the shelf is sorted. One walk, no extra shelf space, every marble touched at most twice.

The elegance is in the asymmetry: the left helper hands you a _known_ marble (advance), the right helper hands you an _unknown_ marble (re-examine). Same swap, different next step — because what's "behind" each end of the shelf is different.

---

## Common pitfalls

1. **Advancing `mid` after a right-swap.** The most common bug. After `swap(nums[mid], nums[high]); high--;`, you must NOT do `mid++` — the new value at `mid` came from the unknown zone and might be a `0` or `2` that needs re-handling. Tracing the algorithm with `[2, 0, 1]` exposes this immediately.
2. **Loop condition `mid < high` instead of `mid <= high`.** Off-by-one. When `mid == high`, that element still needs to be classified. Skipping it leaves a single unsorted value at the boundary.
3. **Calling it "two-pointer" — it's three.** `low`, `mid`, `high`. The middle pointer is the active cursor; the other two are zone boundaries. Confusing this with the standard left/right two-pointer pattern leads to wrong invariants.
4. **Trying to generalize to k colors with the same code.** DNF is hardcoded to three regions. For `k` distinct values, you'd need `k-1` boundary pointers (or, more commonly, switch to counting sort which is O(n + k) and trivially handles arbitrary `k`).

---

## Generalizations

- **3-way Quicksort (Bentley-McIlroy 1993):** uses DNF partitioning around a pivot — `< pivot`, `== pivot`, `> pivot`. Reduces quicksort's worst case from O(n²) to O(n) on arrays with many duplicates. This is what `Arrays.sort` for primitives uses in modern JDKs.
- **K-way partitioning:** for k > 3, use counting sort (O(n + k) time, O(k) space). Beyond a small constant `k`, DNF's pointer-juggling becomes more code than it's worth.
- **Move Zeroes (LC 283), Partition Array (LC 905, 922):** two-region versions of the same idea — one cursor scans, one boundary grows from one end.

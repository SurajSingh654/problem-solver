# 31. Next Permutation

- **Link:** https://leetcode.com/problems/next-permutation/
- **Difficulty:** Medium
- **Pattern:** In-place array rearrangement (Narayana Pandita's algorithm)
- **Time / Space:** O(n) / O(1) — three passes, all linear, no extra memory

## Problem

A **permutation** of an array of integers is any arrangement of its members in a sequence or linear order.

The **next permutation** is the lexicographically next greater permutation of its integer values. If no such permutation exists (the array is sorted in descending order), the next permutation is the smallest one (sorted ascending).

Replace `nums` with its next permutation. The replacement must be **in-place** and use only **constant extra memory**.

Examples:

| Input | Output |
| --- | --- |
| `[1,2,3]` | `[1,3,2]` |
| `[3,2,1]` | `[1,2,3]` |
| `[1,1,5]` | `[1,5,1]` |
| `[1,3,2]` | `[2,1,3]` |
| `[2,1,5,4,3]` | `[2,3,1,4,5]` |

---

## Code

```java
class Solution {
    public void nextPermutation(int[] nums) {
        int pivotIndex = -1;
        for (int i = nums.length - 1; i > 0; i--) {
            if (nums[i] > nums[i - 1]) {
                pivotIndex = i - 1;
                break;
            }
        }

        if (pivotIndex == -1) {
            reverse(nums, 0, nums.length - 1);
        } else {
            for (int j = nums.length - 1; j > pivotIndex; j--) {
                if (nums[j] > nums[pivotIndex]) {
                    int temp = nums[j];
                    nums[j] = nums[pivotIndex];
                    nums[pivotIndex] = temp;
                    break;
                }
            }

            reverse(nums, pivotIndex + 1, nums.length - 1);
        }
    }

    public void reverse(int[] nums, int left, int right) {
        while (left < right) {
            int temp = nums[left];
            nums[left] = nums[right];
            nums[right] = temp;
            left++;
            right--;
        }
    }
}
```

Already O(n) time, O(1) space, in-place. This is the optimal solution — no further algorithmic improvement is possible.

The bug-trap that's worth memorizing: the `break;` after the swap on line 16 is **load-bearing**. Without it, the inner loop keeps swapping every tail value greater than the running pivot value into position, which on a descending tail bubbles the largest tail value all the way to the pivot — wrong answer. The simple test cases (`[1,2,3]`, `[3,2,1]`, `[1,1,5]`, `[1,3,2]`) all pass without the break because their tails have at most one value greater than the pivot. `[2,1,5,4,3]` is the smallest fixture that exposes the missing-break bug.

## Pseudo Code

```
function nextPermutation(nums):
    n ← length(nums)

    # Step 1 — find the pivot.
    # Scan right→left; pivot is the FIRST index i where nums[i] < nums[i+1]
    # (the place where the descending suffix breaks).
    pivot ← -1
    for i from n-2 down to 0:
        if nums[i] < nums[i+1]:
            pivot ← i
            break

    # Step 2 — if no pivot, the array is fully descending = last permutation.
    # Wrap around to the first permutation by reversing the whole array.
    if pivot == -1:
        reverse(nums, 0, n-1)
        return

    # Step 3 — find the swap target.
    # Scan tail right→left; pick the FIRST j > pivot where nums[j] > nums[pivot].
    # Because the tail is descending, the first such j is automatically the
    # SMALLEST tail value still greater than nums[pivot] — exactly the minimal bump.
    for j from n-1 down to pivot+1:
        if nums[j] > nums[pivot]:
            swap(nums[pivot], nums[j])
            break

    # Step 4 — reverse the tail.
    # After the swap, the tail (starting at pivot+1) is still descending.
    # Reversing it makes it ascending = the smallest arrangement of those values.
    reverse(nums, pivot+1, n-1)
```

## Algorithm Explained

### The mental model: two halves of the array

After scanning right→left and finding the pivot at index `i`, the array splits into two parts:

```
nums = [  prefix    | nums[i] |    tail (descending)    ]
         ^^^^^^^^^^^^         ^^^^^^^^^^^^^^^^^^^^^^^^^^
         0 .. i-1             i+1 .. n-1
```

- **Prefix** (`nums[0 .. i-1]`) — untouched. The result must share this prefix; otherwise we'd be jumping to a different "permutation bucket" much farther in the lex order than necessary.
- **Pivot** (`nums[i]`) — the digit we must *bump up* to advance to the next permutation.
- **Tail** (`nums[i+1 .. n-1]`) — already descending = already the **largest** arrangement of those tail values. That's why we had to look further left for the pivot at all.

### Why the algorithm produces the lex-next permutation

Three local choices, each minimal:

1. **Pivot location is as far right as possible.** A pivot further left would change more digits than necessary, jumping past intervening permutations. Scanning right→left and stopping at the first ascending pair guarantees the rightmost pivot.

2. **Swap target is the smallest tail value still greater than the pivot.** We have to bump the pivot up (otherwise the result is smaller, not greater). Bumping by the smallest possible amount keeps the overall change minimal. Because the tail is descending, walking it right→left visits values in ascending order — so the *first* hit `> pivot` is automatically the smallest such value.

3. **Tail is reset to ascending.** After the swap, the tail is *still* descending (the swap preserves the property — proof below). Descending tail = largest possible suffix; we want the *smallest* possible suffix to keep the total increase minimal. Reverse-in-place = O(k) = beats sorting at O(k log k), and yields the same result because reversing a descending sequence produces an ascending one.

### Why the post-swap tail is still descending

Before the swap, the tail satisfies `nums[i+1] > nums[i+2] > ... > nums[n-1]`. Let `j` be the swap target — the leftmost (right-to-left scan: first hit) index where `nums[j] > nums[i]`. Two things are true at `j`:

- `nums[j-1] > nums[j]` (descending invariant, if `j > i+1`).
- `nums[j+1] ≤ nums[i]` (if `j < n-1`) — because if `nums[j+1] > nums[i]`, then `j+1` would have been hit first by the right-to-left scan.

After swap, position `j` holds the old `nums[i]`. Check the order around `j`:

- `nums[j-1]` (old, unchanged) `> nums[j]` (old `nums[i]`)? Yes — because `nums[j-1] > nums[j] > nums[i]`, so `nums[j-1] > nums[i]`. Descending order at `j-1, j` holds.
- `nums[j]` (now old `nums[i]`) `> nums[j+1]` (old, unchanged)? Yes — because `nums[j+1] ≤ nums[i]`. Descending order at `j, j+1` holds.

So the tail remains descending after the swap, and reversing it = ascending = minimal suffix. ✓

### Worked trace: `[2, 1, 5, 4, 3]`

**Step 1 — find pivot.** Scan right→left comparing adjacent pairs:

| `i` | `nums[i]` vs `nums[i+1]` | descending? |
| --- | --- | --- |
| 3 | `4 > 3` | yes — keep going |
| 2 | `5 > 4` | yes — keep going |
| 1 | `1 < 5` | **NO — pivot = 1** (value `1`) |

**Step 2 — swap target.** Tail is `[5, 4, 3]` at indices 2..4. Scan right→left for first `> 1`:

| `j` | `nums[j]` > `1`? |
| --- | --- |
| 4 | `3 > 1` — yes, swap and break |

Swap `nums[1]` ↔ `nums[4]` → `[2, 3, 5, 4, 1]`.

**Step 3 — reverse tail.** Reverse `nums[2..4]` = `[5, 4, 1]` → `[1, 4, 5]`.

Final: `[2, 3, 1, 4, 5]`. ✓

### Worked trace: `[3, 2, 1]` (no-pivot case)

Scan right→left: `i=1: 2>1` keep, `i=0: 3>2` keep. Ran off the left end without finding `nums[i] < nums[i+1]`. Pivot = `-1`.

Reverse whole array → `[1, 2, 3]`. ✓

### Complexity proof

- **Time:** O(n). Three passes, each examining at most `n` elements (pivot scan, swap-target scan, tail reverse). Sum is at most `3n`.
- **Space:** O(1). Two int variables (`pivotIndex` and the loop counters), no auxiliary arrays.
- **Passes:** Three, all linear and right-to-left or symmetric two-pointer. No nested loops, no recursion.

---

## Key Insight

The "next" in lexicographic order means making the **smallest possible increase**. That decomposes into three local choices:

1. **Change as late in the array as possible** → find pivot from the right.
2. **At the pivot, bump up by the smallest amount** → swap with the smallest tail value still greater than the pivot.
3. **Reset everything to the right of the pivot to its smallest arrangement** → since the tail is descending after the swap, reverse it.

The whole algorithm runs in O(n) because the **descending invariant of the tail** survives steps 1 and 2, which is what lets step 3 use a reverse (O(k)) instead of a real sort (O(k log k)) — and what lets step 2 take the first match instead of scanning the whole tail for a minimum.

---

## Explain It Simply

### All arrangements of `[1, 2, 3]` in order

```
123 ← smallest
132
213
231
312
321 ← biggest
```

The problem is: given one of these, find the **next** one in the list.

### Watch ONE transition: `132 → 213`

We started with `1, 3, 2`. The next one is `2, 1, 3`. Three questions answer the whole algorithm.

**Q1 — Which position changed first?**

Going left to right: `1`→`2` is the first difference. So position 1 changed.

**Q2 — How did we know to change position 1, not position 2 or 3?**

Try the rightmost positions first (smaller changes = smaller jump = closer to "next"):

- **Can we change ONLY position 3?** That would mean swapping the `2` with something bigger to its right. But there's nothing to its right. **No.**
- **Can we change ONLY position 2 (and stuff after it)?** Position 2 is `3`. We'd need to put something bigger than `3` there, using only the digits to its right (`2`). `2 < 3`. **No.**
- **Can we change position 1?** Position 1 is `1`. We need something bigger than `1` from its right side (`3, 2`). Both are bigger. **Yes.**

Position 1 is where we change. Call it the **pivot**.

**Q3 — What do we put in the pivot's place?**

We want the *smallest* possible bump up. So among the digits to the right of the pivot (`3, 2`), pick the **smallest one that's still bigger than the pivot value (`1`)**.

Smaller of `3` and `2` = `2`. Swap `1` ↔ `2`:

```
Before swap:  1 3 2
After swap:   2 3 1
```

**Q4 — What about the part after the pivot?**

After the swap, positions 2 and 3 hold `3, 1`. We just made the big change at position 1; everything after it should be as **small** as possible.

Sort `3, 1` small-to-big → `1, 3`. Result:

```
2 1 3
```

Which is exactly `213`. Done.

### The whole algorithm in 3 lines

1. **Find the pivot** — walking from the right, find the first digit that has a bigger digit somewhere to its right.
2. **Swap** — replace the pivot with the smallest digit to its right that's still bigger than it.
3. **Sort the tail** — sort everything after the pivot from small to big.

### One trick that saves time

The digits to the right of the pivot are **always sorted big-to-small** already (otherwise we wouldn't have stopped where we did). Sorting them small-to-big is the same as **flipping** them — start at both ends and swap inward. That's why we use "reverse" instead of "sort" in the code — same result, faster.

### Try it: `[1, 5, 8, 4, 7, 6, 5, 3, 1]`

Walking right-to-left, asking "is there something bigger to my right?":

| Position | Value | Anything bigger to its right? |
| --- | --- | --- |
| last | `1` | nothing to right |
| | `3` | nothing bigger (only `1`) |
| | `5` | nothing bigger (`3, 1`) |
| | `6` | nothing bigger (`5, 3, 1`) |
| | `7` | nothing bigger (`6, 5, 3, 1`) |
| | **`4`** | **YES — `7, 6, 5` are all bigger. STOP.** |

Pivot = the `4`. To its right: `7, 6, 5, 3, 1`. Smallest of those still bigger than `4` = `5`. Swap → `1, 5, 8, 5, 7, 6, 4, 3, 1`. Reverse the tail `7, 6, 4, 3, 1` → `1, 3, 4, 6, 7`.

Final: `1, 5, 8, 5, 1, 3, 4, 6, 7`.

---

## Common pitfalls

1. **Missing the `break` after the swap in Step 3.** This is THE bug for this problem. Without `break`, the loop keeps re-swapping, walking the new (larger) pivot value against tail values that are *also* larger (because the tail is descending). The result is that the **largest** tail value ends up at the pivot — completely wrong. Simple test cases mask it; you need a fixture like `[2,1,5,4,3]` where the tail has ≥2 values greater than the pivot to expose it. Mirrors a real lesson from Sprint 3.4.b: weak test fixtures (using valid enum values) hid the typeLabel fallback XSS path.

2. **Reversing the wrong range.** The tail to reverse starts at `pivotIndex + 1`, not `pivotIndex`. Reversing from the pivot would un-do the swap.

3. **Using `sort` instead of `reverse` for Step 4.** Works but O(k log k) instead of O(k) — and on `int[]` in Java, `Arrays.sort` for primitives is a randomized dual-pivot quicksort with O(log n) stack space, not even O(1). Interviewers will catch the missed optimization. The descending-invariant property is the signal they're probing for.

4. **Pivot scan that goes off the left end without `pivotIndex == -1` handling.** If you forget the wrap-around case for a fully-descending array, your code either crashes (NegativeArraySizeException on a malformed reverse) or returns the input unchanged. Tested by `[3,2,1] → [1,2,3]`.

5. **Comparing wrong direction in Step 1.** The pivot rule is `nums[i] < nums[i+1]` (descending streak BROKE). Reversing this to `nums[i] > nums[i+1]` finds the last position *still* in the descending streak — meaningless and wrong.

---

## Generalizations

- **Narayana Pandita (14th century).** The algorithm is attributed to the Indian mathematician Narayana Pandita, who described it for permuting digits in his *Ganita Kaumudi* (~1356). Same algorithm independently rediscovered as `std::next_permutation` in the C++ STL.

- **`std::next_permutation` (C++) and `itertools.permutations` (Python).** Both produce permutations in lex order — `next_permutation` uses this exact algorithm; Python's `itertools` is recursive but yields the same sequence. Reading `std::next_permutation`'s libstdc++ source is a good exercise in seeing the same four-step structure with iterator gymnastics.

- **Previous permutation.** The mirror algorithm: scan for the first position where `nums[i] > nums[i+1]` (ascending streak BROKE), swap with the *largest* tail value still *less* than the pivot, then reverse. `std::prev_permutation` in C++.

- **k-th permutation directly (LC 60).** Don't generate all preceding permutations — use factorial-number-system encoding to jump directly. O(n²) vs O(k · n) for repeated calls to next_permutation.

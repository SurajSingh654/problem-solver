# 34. Find First and Last Position of Element in Sorted Array

- **Link:** https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/
- **Difficulty:** Medium
- **Pattern:** Binary Search (two-pass — left boundary + right boundary)
- **Time / Space:** O(log n) / O(1)

## Problem

Given an integer array `nums` sorted in non-decreasing order and a target value, return `[firstIndex, lastIndex]` of `target`. Return `[-1, -1]` if not found. Must run in **O(log n)**.

---

## Code

```java
class Solution {
    public int[] searchRange(int[] nums, int target) {
        int[] indexPositions = {-1, -1};
        for (int i = 0; i < nums.length; i++) {
            if (nums[i] == target) {
                if (indexPositions[0] == -1) {
                    indexPositions[0] = i;
                    indexPositions[1] = i;
                } else {
                    indexPositions[1] = i;
                }
            }
        }
        return indexPositions;
    }
}
```

This is a correct O(n) linear scan — it finds both boundaries in one pass. However, the problem **explicitly requires O(log n)**, so this would fail the runtime constraint in an interview and earns partial credit at best. The array being sorted is the key signal: whenever an array is sorted and you need to locate a value, think binary search first.

The pattern label "Array/Hashing" is also wrong — there's no hash map involved, and the structure being exploited is sortedness, which maps to Binary Search.

---

## Optimized Code

```java
class Solution {
    public int[] searchRange(int[] nums, int target) {
        return new int[]{findBound(nums, target, true), findBound(nums, target, false)};
    }

    private int findBound(int[] nums, int target, boolean findFirst) {
        int lo = 0, hi = nums.length - 1, bound = -1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (nums[mid] == target) {
                bound = mid;
                if (findFirst) hi = mid - 1;   // keep searching left
                else           lo = mid + 1;   // keep searching right
            } else if (nums[mid] < target) {
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return bound;
    }
}
```

Two binary searches, each O(log n). Total: O(log n) time, O(1) space.

The only difference between finding the left boundary and the right boundary is what you do **when you hit the target**: don't stop — record it and keep narrowing in the appropriate direction.

### Alternative: `lower_bound` / `upper_bound` style (also common in interviews)

```java
class Solution {
    public int[] searchRange(int[] nums, int target) {
        int first = lowerBound(nums, target);
        if (first == nums.length || nums[first] != target) return new int[]{-1, -1};
        int last = lowerBound(nums, target + 1) - 1;
        return new int[]{first, last};
    }

    // Returns the index of the first element >= target
    private int lowerBound(int[] nums, int target) {
        int lo = 0, hi = nums.length;
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (nums[mid] < target) lo = mid + 1;
            else                    hi = mid;
        }
        return lo;
    }
}
```

This is how C++ `std::lower_bound` works. `lowerBound(target)` gives the first position `>= target`; `lowerBound(target + 1) - 1` gives the last position `== target`. Clean, reusable, worth memorizing.

---

## Key Insight

The array is **sorted** — that's the binary search signal. When you find the target, don't immediately return. Instead, record the index and **keep narrowing toward the boundary you want**: shrink `hi` to search left (first position), grow `lo` to search right (last position). You're doing two independent binary searches that share the same structure.

The common trap: treating binary search as "find and return." In boundary problems, finding the target is the middle of the work, not the end.

---

## Explain It Simply

Imagine a row of numbered lockers in sorted order. You're looking for all the red lockers, and you know they're clustered together somewhere in the row. Rather than walking the whole row, you:

1. **Find the leftmost red locker:** Do a binary search. Whenever you hit a red locker, mark it but keep looking *left* — maybe there's an earlier one. You'll converge on the very first one.
2. **Find the rightmost red locker:** Same binary search, but whenever you hit a red locker, mark it and keep looking *right* — maybe there's a later one. You'll converge on the very last one.

Two searches, each cutting the problem in half every step. Even if there are a million lockers, you find both ends in about 40 steps total (log₂(10⁶) ≈ 20 per search).

The linear scan works too, but it's like walking every locker — fine for 10, painful for a million.

---

## Common Pitfalls

1. **Stopping at the first hit.** Standard binary search returns the moment it finds the target. For this problem you must keep going — don't break when `nums[mid] == target`.
2. **`mid = (lo + hi) / 2` integer overflow.** For very large indices, `lo + hi` can overflow a 32-bit int. Use `mid = lo + (hi - lo) / 2`.
3. **Loop condition `lo < hi` vs `lo <= hi`.** The two-boundary style above uses `lo <= hi` with `bound` tracking the last successful hit — straightforward. The `lower_bound` style uses `lo < hi` with `hi = nums.length` as a sentinel. Don't mix them.
4. **Wrong direction when target is found.** `findFirst=true` → `hi = mid - 1` (go left). `findFirst=false` → `lo = mid + 1` (go right). Swapping these silently returns wrong answers.

---

## Complexity

| Approach       | Time     | Space | Notes                                      |
| -------------- | -------- | ----- | ------------------------------------------ |
| Linear scan    | O(n)     | O(1)  | Correct but fails the O(log n) constraint  |
| Two binary searches | **O(log n)** | **O(1)** | Required — exploits sortedness  |

---

## Generalizations

- **LC 35 Search Insert Position** — same `lower_bound` pattern.
- **LC 278 First Bad Version** — binary search on a monotone predicate (all-good prefix, then all-bad suffix).
- **LC 153 Find Minimum in Rotated Sorted Array** — binary search on a sorted array that's been rotated; same "keep searching in a direction" idea.
- Any problem of the form "find the first/last index where condition flips" → binary search on the predicate.

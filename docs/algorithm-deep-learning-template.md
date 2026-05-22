# Algorithm Deep Learning — Template

> **How to use this doc:** when learning a new algorithm or data-structure pattern (binary search, two pointers, Dijkstra, segment trees, KMP, anything), run this template top-to-bottom. Each section has a *purpose*, a *discipline rule*, and *exit criteria*. The worked example at the bottom shows what a fully-filled template looks like for **Binary Search** — copy that depth and rigor for every algorithm you study. If you can't finish a section, the gap is where your understanding actually ends.

---

## Why this template exists

Algorithms are not memorisable. Trying to memorise N algorithms is a treadmill — you fall off whenever the problem is shaped slightly differently. The candidates who succeed in interviews and the engineers who ship correct production code are the ones who internalise a small number of *ideas* and *recognition cues* deeply enough to derive the right algorithm under pressure.

This template forces depth at the layer where memorisation breaks: the **why** beneath the **what**. Surface-level study reads like "binary search has O(log n) time"; deep study reads like "binary search works because the search space halves on every comparison, *which only holds if the array is sorted on the dimension we're branching on*, and the off-by-one trap lives in how we update lo/hi to preserve the loop invariant."

There are **four literacies** algorithm mastery requires. Most learners pick one or two and skip the rest.

| Literacy | What good looks like |
|---|---|
| **Math** | You can derive the time complexity from first principles, write the recurrence, prove correctness via a loop invariant, and reason about edge cases analytically. |
| **Code** | You can implement the algorithm from scratch in two languages without a reference, including the boundary-condition handling that's actually hard. |
| **Intuition** | You have a *picture* — a visual or spatial model that survives forgetting the code. You can sketch a bad explanation on a whiteboard. |
| **Pattern recognition** | You can read a brand-new problem and feel "this is binary search" before you've worked out the details. The recognition is the hard part of interviews. |

This template is structured so that skipping a section leaves a hole in one of these four. You will find the holes when you get a real problem wrong and have to come back here.

### The cognitive science behind the structure

These principles drive the section ordering — knowing why helps you not skip them:

| Principle | Source | Where it appears |
|---|---|---|
| **Worked example effect** — explicit step-throughs reduce extraneous load | Sweller, 1988 | §6 Hand trace, bottom worked example |
| **Worked → faded → unsupported** sequence | Renkl & Atkinson, 2003 | §6 → §7 → §17 progression |
| **Productive failure** — struggle before being shown | Kapur, 2008 | §3 Naive approach (try first), §15 Self-test |
| **Self-explanation effect** — generating "why" beats reading | Chi et al., 1989 | §4 Key insight, §8 Correctness argument |
| **Variation theory** — see the same pattern in many surfaces | Marton, 2015 | §13 Pattern recognition, §16 Practice ladder |
| **Dual coding** — words + images doubles retention | Paivio, 1991 | §5 Mental model is mandatory, not optional |
| **Concrete to abstract** | Bruner, 1966 | §6 (concrete trace) before §10 (general invariant) |
| **Spaced retrieval** | Bjork & Bjork, 1992 | §15 Self-test, §17 Practice ladder, SM-2 reviews |
| **Elaborative interrogation** — answering "why" links new to existing knowledge | Pressley et al., 1987 | §3, §4, §11 |
| **Bloom's taxonomy** — Remember → Understand → Apply → Analyze → Evaluate → Create | Bloom, 1956 | Section progression mirrors this |

### Worked → faded → unsupported in this template

This template explicitly walks you through the three phases that worked-example-effect research has shown to maximise transfer:

1. **§6 Hand trace** — fully worked. Every step shown, every variable annotated.
2. **§7 Implementation** — partially faded. Pseudocode given, you write the code.
3. **§17 Practice ladder** — unsupported. New problems, no scaffolding.

If you write the §6 trace but skip §17, you will pass the practice quiz and fail the interview. The unsupported phase is where mastery is built.

---

## Adapting the template to algorithm type

Not every section is equally heavy for every algorithm. Lean into the right ones — but write *something* in every section.

| Algorithm type | Heaviest sections | Lighter sections |
|---|---|---|
| **Search/scan** (binary search, two pointers, sliding window, KMP) | §4 Key insight, §10 Loop invariant, §14 Pitfalls | §11 Real-world (often built into stdlib) |
| **Tree/graph traversal** (BFS, DFS, topological sort, Dijkstra, Union-Find) | §5 Visualization, §6 Hand trace, §13 Pattern recognition | §10 Loop invariant (graph proofs are different) |
| **Dynamic programming** | §3 Naive recursion, §4 Subproblem insight, §10 State invariant, §11 Memo vs tabulation | §5 Visualization (state grid is the visual) |
| **Greedy** | §4 Exchange argument, §10 Optimality proof, §15 Counter-examples | §11 Variations |
| **Divide & conquer** (merge sort, quickselect, FFT) | §5 Recursion tree, §6 Hand trace, §11 Recurrence solving | §13 Pattern recognition (rarely subtle) |
| **Number theory / math** (modular arithmetic, sieve, GCD, fast exponentiation) | §4 Why the math works, §11 Edge cases (negatives, overflow) | §5 Visualization (sometimes none) |
| **Hashing / probabilistic** (Bloom filter, MinHash, HyperLogLog) | §4 Probabilistic guarantee, §11 Tuning, §14 Failure modes | §10 Worst-case analysis (use expected case) |
| **Concurrent / lock-free** (CAS algorithms, MPMC queues) | §10 Linearizability, §14 ABA + memory ordering, §15 Counter-examples | §13 Pattern recognition (these are last-resort) |

The template stays the same; the *weight* shifts. Don't skip sections — write less, but write something honest.

---

## Anti-patterns the AI must avoid when filling this template

If you are an AI generating notes from this template:

1. **No hand-waving on complexity.** "It's O(n log n)" is not a section. Show the recurrence or the dominant term derivation.
2. **No fake worked examples.** If you trace an algorithm, every variable's value at every step must be honest. If you don't know, say so — don't fabricate.
3. **No identical implementations across languages.** Show real differences (Python's `bisect` vs Java's `Collections.binarySearch` vs handwritten — different ergonomics, different edge cases).
4. **No omitted edge cases.** Empty input, single element, duplicates, all-equal, sorted descending, integer overflow on `(lo+hi)/2` — these belong in §14, not in vague "watch out for boundary conditions."
5. **No copying from a textbook.** If you don't add a *new* observation (a non-obvious connection, a real-world failure story, a counter-example), you've added nothing.
6. **No "see also" without payoff.** "Related to merge sort" is useless; "the same divide-and-conquer recurrence T(n) = 2T(n/2) + O(n) appears in merge sort and is solved by the master theorem case 2" is useful.
7. **Show your work in pictures, not promises.** §5 must include an actual ASCII diagram, table, or step grid — "imagine a tree" is not a visualization.
8. **No bullet-point soup.** Bullets are fine for lists; they are *not* fine for explanations. If a section has more than 60% bullets, rewrite as prose.

---

# The 17-Section Framework

---

## Quick reference card (always fill — top of every note, scannable)

A 6-bullet card you can re-read in 30 seconds when you encounter the algorithm again later. Forces you to compress before expanding.

```
- Family: <search | sort | graph | tree | DP | greedy | divide-and-conquer | hashing | math | string | concurrency>
- One-line definition: <≤ 25 words>
- Time: <best / average / worst with brief why>
- Space: <auxiliary, not input>
- Required precondition: <e.g. "array sorted on the search key">
- Recognition cue: <the one-sentence interview-shaped problem signal>
- Most common bug: <the off-by-one or invariant violation people ship>
- Canonical reference: <CLRS / Skiena / paper> §X.Y
```

### Discipline rule

**Fill the Quick Reference FIRST and LAST.** First pass = your initial guess (commits you). Last pass = the version you trust after writing the full note. The drift between them reveals what you actually learned.

---

## 1. The 30-second pitch

The algorithm in **plain English**, with **zero jargon**, the way you'd describe it to a smart non-programmer. If your manager who hasn't coded in five years asked "what's Dijkstra," what would you say in two sentences?

### Discipline rule

If you can't pass the dad test (explain to a non-technical adult) and the colleague test (explain to an engineer who knows the area but not this specific algorithm) in two sentences each, you don't have the pitch yet. Write both versions explicitly.

### Exit criterion

Two paragraphs maximum. One zero-jargon, one engineer-grade. Both end with the *purpose* sentence: "This is useful when you have X and want Y."

---

## 2. The motivating problem

The original problem this algorithm solves, in concrete terms. Not "search" — "given a sorted array of 10 million records and a target, find its index in fewer than 25 comparisons." Numbers ground the problem.

### Why this section exists

Every algorithm exists because a *specific* prior approach was too slow, too memory-hungry, or too brittle. If you don't know what was wrong before, you can't recognise the next problem that needs this fix.

### Exit criterion

A scenario the reader can picture: input shape, scale, what answer is needed, what naive approaches would take. Concrete numbers. The "before this algorithm" pain.

---

## 3. The naive approach (and why it fails)

What's the dumbest correct algorithm? Write its complexity. Then explain the *specific* reason it's not good enough at scale.

### Why this section exists — productive failure

Research (Kapur 2008, 2014) shows that *struggling with the naive solution before being shown the better one* produces stronger encoding than skipping straight to the answer. This section is mandatory even for algorithms where the naive approach is "obvious." Writing it down is the discipline.

### Discipline rule

Show the naive approach in pseudocode (3–10 lines). Compute its complexity. Then write the *one sentence* that captures why this won't work for the target use case (input size? real-time constraint? memory? worst-case spike?). That sentence is the scaffolding for §4.

### Exit criterion

You can argue with someone who proposes the naive solution and explain *exactly* where it breaks down. "It's O(n²)" is not enough — "for the 1M-row request log we get hourly, n² is 10¹², which at 10⁹ ops/sec is 1000 seconds, three orders of magnitude over our 1-second SLO" is.

---

## 4. The key insight

The single observation that makes the optimal algorithm work. *One sentence ideally.* Two if you must.

This is the soul of the algorithm. It's the thing you need to remember when you've forgotten the implementation and the complexity. If you can re-derive the algorithm from the insight, you understand it.

### Examples of good insight statements

- **Binary search:** "On a sorted array, every comparison eliminates half the remaining search space."
- **Two pointers (sorted-pair-sum):** "If the current pair is too small, the smaller pointer is wasted; advance it."
- **DP (Fibonacci):** "Each subproblem only depends on a constant number of smaller subproblems, so we can compute bottom-up in linear time and constant space."
- **Topological sort (Kahn's):** "A node with in-degree zero has no remaining prerequisites and can be emitted; emitting it reduces in-degree of its neighbours."
- **Floyd's cycle detection:** "In a circular path, a 2x-speed pointer must eventually lap a 1x-speed pointer, and the meeting point relates to the cycle entry by a simple distance argument."

### Discipline rule

If your insight runs more than two sentences, you don't have the insight yet — you have a paraphrase of the algorithm. Compress until one sentence captures the *idea*; everything else is mechanics for §7.

### Exit criterion

Show the insight to someone who's never seen this algorithm. They should be able to start *guessing* the algorithm structure, even if they can't write it.

---

## 5. Mental model & visualization

The picture in your head. **Mandatory diagram.** ASCII art, table, mermaid, hand-drawn — anything visual. Words alone are not enough; *dual coding* (Paivio) doubles retention.

### What good looks like

- **Binary search:** an array with `lo`, `mid`, `hi` markers shown after each iteration; the search space shrinking visibly.
- **DFS on a tree:** the call stack drawn as a column with current path highlighted, backtracking shown as pops.
- **DP grid:** a 2D table where each cell shows its dependency arrows.
- **Union-Find:** disjoint trees with rank annotations, before-and-after path compression.
- **Sliding window:** a horizontal array with `left` and `right` markers and the current window shaded.

### Discipline rule

You must produce **at least one** ASCII diagram or table inline in this section. "Imagine X" is not a visualization. If the algorithm operates on graphs, draw a small graph (≤ 6 nodes) and show how the algorithm transforms it.

### Exit criterion

A reader could understand the algorithm's *shape* from the diagram alone, without reading §6 or §7.

---

## 6. Hand trace by example (worked)

Pick a small concrete input (n = 4 to 8 typically). Show every step. Every variable's value at every iteration. This is the **worked example**, and Sweller's research is unambiguous: this is where understanding sticks.

### Format

Use a table, not prose. One row per iteration. Columns: iteration number, key variables, the comparison/decision made, the resulting state, comment.

Example shape (binary search on `[1, 3, 5, 7, 9, 11, 13]`, target = 7):

| Iter | lo | hi | mid | a[mid] | Decision | New range |
|---|---|---|---|---|---|---|
| 0 | 0 | 6 | 3 | 7 | found | done |

### Discipline rule

If your trace has any "...and so on" or "you can see it converges," you've cheated. Show every iteration. Boring is correct here.

### Exit criterion

A reader could verify your trace by running the algorithm in their head step by step. Every value must be defensible.

---

## 7. Implementation — multiple languages

Implement the algorithm in **at least two languages** that exercise different ergonomics. Pick from: Python (succinct), Java (verbose, exception-pedantic), C++ (manual memory, integer overflow real), Go (no generics until 1.18, explicit error handling), Rust (ownership constraints), JavaScript (loose typing pitfalls).

### Why two languages?

Single-language implementations hide the cases where the algorithm interacts with the *language's* edge cases. The off-by-one in `(lo + hi) / 2` causing integer overflow is a *Java/C++* problem, not a *binary search* problem — but you'd never notice in Python. The same algorithm written twice surfaces these.

### Discipline rule

The two implementations must differ *somewhere meaningful*. If they're translations of each other, you missed the point. Show:
- A different boundary-handling style (e.g., `lo < hi` vs `lo <= hi`).
- A different way to avoid overflow (`lo + (hi - lo) / 2` vs `lo + ((hi - lo) >>> 1)` in Java for unsigned shift).
- A different approach to invariants (Rust's borrow checker forcing different state structuring).

### Exit criterion

Both implementations correct, both runnable. Annotate any non-obvious line with a single-line comment. If you needed to look up the syntax, you should write the algorithm again from memory tomorrow without looking.

---

## 8. Correctness argument

Why does this algorithm produce the right answer? You don't need a formal proof — you need an argument robust enough to defend in an interview.

### The three styles

| Style | Used for |
|---|---|
| **Loop invariant** — a property true before and after each iteration that implies correctness on termination | Iterative algorithms (binary search, two pointers, sliding window, DP iteration order) |
| **Inductive argument** — base case + inductive step | Recursive algorithms (DFS, divide & conquer, recursive DP) |
| **Exchange argument** — assume an optimal solution differs from greedy choice; show you can swap without losing optimality | Greedy algorithms (interval scheduling, Huffman, MST) |

### Discipline rule

State the invariant or argument *before* writing the proof. The invariant is the algorithm; the proof just shows it holds.

For binary search: invariant = "the target, if it exists, is in `a[lo..hi]`." Initially true (whole array). Preserved by both branches (we recurse into the half that still contains target). On termination (`lo > hi`), the range is empty so target doesn't exist. Done.

### Exit criterion

You can defend the algorithm against a hostile interviewer asking "but what if input is [edge case]?" by referring to the invariant rather than re-tracing.

---

## 9. Complexity — derived, not stated

Complexity is **derived** from the algorithm structure, not memorised. Show the work.

### What "derived" means

- **Recurrence + master theorem** for divide-and-conquer: write T(n), apply Master Theorem case, show the result.
- **Summation** for nested loops: show the actual sum (e.g., ∑ᵢ₌₀ⁿ⁻¹ i = n(n-1)/2 = O(n²)), not just "two nested loops, O(n²)."
- **Amortised analysis** for data structures (dynamic array push, Union-Find with path compression): show the potential function or accounting argument.
- **Expected vs worst-case** for randomised (quickselect, Bloom filter): both bounds, not just one.

### Required for every algorithm

| Bound | Required? |
|---|---|
| Time — best | Often equal to average; state when it's not |
| Time — average | Required; show derivation |
| Time — worst | Required; show derivation |
| Space — auxiliary | Required; do *not* count the input |
| Recursion stack depth | Required for recursive algorithms |

### Discipline rule

If your derivation is "two nested loops, so n²," it's not derivation. Show the summation. Show the recurrence. Show the master theorem case. Make the math visible.

### Exit criterion

Asked "why is this O(n log n) and not O(n²)?", you can answer in 60 seconds with the recurrence and either Master Theorem case or unrolling.

---

## 10. Loop invariant or recurrence

The mathematical heart of correctness. Often overlaps §8 but stated independently for clarity.

### Why a separate section

Many engineers can implement the algorithm and trace it but cannot state the invariant. The invariant is what you cite in §8 (correctness) and §14 (debugging). Keeping it in a separate section forces you to write it down explicitly.

### Discipline rule

State the invariant in one sentence. Show: (a) it holds before the first iteration, (b) it's preserved by each iteration, (c) it implies the post-condition on termination.

For recursive algorithms, write the recurrence: T(n) = aT(n/b) + f(n), with the meaning of each term.

### Exit criterion

You can write the invariant from memory next month without consulting the algorithm code.

---

## 11. Pattern recognition signals

The interview-shaped sentences that should make you reach for this algorithm. The actual hard part of interviews — not implementation, but recognition.

### Format

A bulleted list of phrases or problem features that map to this algorithm. For binary search:

- "Sorted array..." with a search-like target → binary search.
- "Find the smallest/largest x such that P(x) is true" with P monotonic → binary search on the answer.
- "Find peak / find the point where a function changes" → binary search.
- O(n) but problem asks for sublinear → think about whether sorted/monotonic structure exists.

### For DP:

- "How many ways..." → counting DP.
- "Optimal X given a sequence of choices" → optimisation DP.
- "Subproblem appears to repeat" → memoisation candidate.
- "Choose / not choose" → 0/1 knapsack family.

### Discipline rule

The signals must be *triggers you'd notice mid-problem*, not summaries of what the algorithm does. Phrase them as the candidate's internal monologue. Aim for 5+ distinct signals per algorithm.

### Exit criterion

Given a new problem you've never seen, you can read it and either say "this is X" with a confidence level, or say "doesn't trigger any of my recognition cues" — and that signal itself is useful.

---

## 12. Variations and siblings

Algorithms come in families. Map this one's neighbourhood.

### What to include

For binary search:
- Lower bound (find first >= target) — different boundary handling.
- Upper bound (find first > target).
- Binary search on the answer (parametric search).
- Floor/ceiling.
- Rotated sorted array binary search.
- Binary search on a function.
- Exponential search → binary search (for unbounded).

For two pointers:
- Opposite ends (sum problems).
- Same direction (sliding window).
- Fast and slow (cycle detection).
- Three pointers (3-Sum).

### Discipline rule

For each variation, state in one line *what changes* relative to the canonical version (boundary, direction, termination, augmentation). If two "variations" have the same code, they're the same algorithm.

### Exit criterion

Given a problem requiring a variation, you can identify which variation and what the diff is, instead of reinventing.

---

## 13. Pitfalls and edge cases

The bugs that ship. The off-by-ones, overflows, infinite loops, missed boundary conditions. **First-class section, not an afterthought.**

### Format — the "Mistake Museum"

A table or list. Each entry: the bug, the symptom, the cause, the fix. Make it specific.

For binary search:

| Bug | Symptom | Cause | Fix |
|---|---|---|---|
| `(lo + hi) / 2` overflows on big arrays in Java/C++ | Crash or negative `mid` for arrays of size > 2³⁰ | Sum exceeds `Integer.MAX_VALUE` | `lo + (hi - lo) / 2` |
| Infinite loop with `lo = mid` instead of `lo = mid + 1` | Runs forever on certain inputs | Range never shrinks when `lo == mid` | Always advance: `lo = mid + 1` or `hi = mid - 1` |
| Returns wrong index when duplicates exist | Returns an arbitrary occurrence, not the first | Standard binary search isn't stable on duplicates | Use lower-bound variant |
| Off-by-one between `lo < hi` and `lo <= hi` styles | Either misses last element or runs one too many iterations | Termination condition mismatched with range update style | Pick one style and be consistent: `[lo, hi]` inclusive uses `lo <= hi` and `hi = mid - 1`; `[lo, hi)` half-open uses `lo < hi` and `hi = mid` |

### Discipline rule

Each entry must be a *specific* bug with a specific repro. Generic advice ("be careful with off-by-one") doesn't go here — it goes nowhere, because it doesn't help.

### Exit criterion

You can recall the top-3 bugs for this algorithm without consulting the note. These are the ones you'll trip on in interviews; encode them.

---

## 14. Compared to alternatives

A decision matrix: when *not* to use this algorithm, and what to use instead.

### Format — the alternatives table

| Use case | This algorithm | Better alternative | Why |
|---|---|---|---|
| Search a sorted array of < 50 elements | Binary search | Linear scan | Cache locality, branch prediction; constant factors dominate |
| Search an array updated frequently | Binary search | Hash set | O(1) lookup beats O(log n) when updates are common |
| Find rank/order statistics in a streaming setting | Binary search | Order statistic tree, skip list | Binary search assumes sorted state, which streams break |
| Search structured data (DB) | Binary search | B-tree / B+-tree index | Disk I/O dominates; B-trees minimise it |

### Discipline rule

For each row, the "why" must explain the trade-off in *real* terms (cache, I/O, update frequency, memory) — not abstract "it's faster." The whole point is to know when this algorithm is the wrong choice.

### Exit criterion

You can defend choosing or not choosing this algorithm against any alternative for a given problem.

---

## 15. Counter-examples and adversarial inputs

What inputs break the algorithm or expose its weaknesses?

### What to include

- **Worst-case input** — what shape of input forces the worst-case complexity? (Quickselect with sorted input, hash table with collision-bombing keys.)
- **Boundary inputs** — empty, single-element, all-equal, max-size.
- **Adversarial inputs** — inputs that pass weak tests but break the algorithm. (For randomised quickselect: an adversary that observes pivot choices and constructs worst-case input. For hash-based: known-bad keys.)
- **Off-by-one inputs** — inputs that probe the boundary conditions (target at start, target at end, target absent).

### Discipline rule

Generate at least one input that's unusual enough that a careless implementation would miss it. Run your §7 implementation against it mentally.

### Exit criterion

Asked "what input would break this," you can produce a concrete example and explain why.

---

## 16. Real-world systems

Where this algorithm actually lives in production. Specific. Not "search engines use this" — *which* search engines, *where* in the stack, *what version*.

### Examples

- **Binary search:** glibc's `bsearch`, Python's `bisect`, Java's `Collections.binarySearch`, PostgreSQL's B-tree leaf scan, Linux kernel's `bsearch` for symbol resolution.
- **Hash maps:** Java's `HashMap` (chaining + tree-ification at collision threshold), Go's runtime map (open addressing), Redis (incremental rehashing).
- **Bloom filters:** Bitcoin SPV nodes (transaction filtering), Cassandra (read-path optimisation), Chrome's Safe Browsing, BigTable.
- **Topological sort:** Make and Bazel (build order), package managers (Cargo, npm), Linux init systems (systemd dependency resolution).

### Discipline rule

If you can't name a specific system, search for one. "Used in databases" is not enough — *which* database, *what file*, *what name does it have in the source*.

### Exit criterion

You can answer "where would I see this in real life?" with a specific named system and a one-sentence story of how it's used.

---

## 17. Practice ladder

A graded sequence of problems from "trivial" to "research-level," with the connection to this algorithm spelled out. The unsupported phase of the worked-faded-unsupported sequence.

### Format

| Difficulty | Problem | Why this one |
|---|---|---|
| Warm-up | First-occurrence binary search | Pure mechanics, no twist |
| Standard | Search in rotated sorted array | Recognising the unrotated half |
| Variation | Find peak element | Binary search where there's no explicit "sortedness" |
| Application | Median of two sorted arrays | Binary search on the answer space |
| Advanced | Aggressive cows / parametric search | Binary search on a continuous answer |

### Discipline rule

Each level's "why" must articulate what *new skill* is being practiced. Don't just list problems — list the progression of cognitive demands.

### Exit criterion

You've actually worked the warm-up + standard tier, and you've at least *attempted* one variation. Notes on what tripped you up go into §13 retroactively.

---

## 18. Self-test (active recall prompts)

Questions you ask yourself a week from now without re-reading the note. **Active recall is the highest-leverage learning move available.** This section is what makes the note re-useful.

### Format

A list of 8–12 prompts. Mix of recall, application, and analysis.

For binary search:

1. Without looking, write the canonical inclusive-range binary search in any language.
2. State the loop invariant.
3. What's the correct mid-point computation in Java to avoid overflow, and why?
4. Explain to a non-engineer why the algorithm is O(log n) in 30 seconds.
5. Given a sorted array of 1B elements, how many comparisons in the worst case? (~30, derive it.)
6. When is binary search the wrong choice even on sorted data?
7. Lower-bound binary search: change *which two lines* of the canonical version?
8. Trace binary search by hand on `[1,3,5,7,9]` looking for `4`.
9. Why does binary search on the answer work for "find smallest x such that P(x)"?
10. Name two real systems that ship binary search, and where in the system.

### Discipline rule

Questions must be *answerable in under 2 minutes each* and must not be lookups (no "what is the time complexity"). Each must require *generation* of an answer, not recognition.

### Exit criterion

You can answer all 8+ questions without consulting the note. Schedule the self-test 24h after writing, then 1w, then 1m (Ebbinghaus spaced retrieval).

---

## 19. Interview cheat sheet

The 30-second, 2-minute, and 5-minute versions of the algorithm for interview pressure. Pre-computed so you don't fumble under stress.

### The three timings

**30 seconds (the elevator pitch)** — name, complexity, key insight, recognition cue. Memorise verbatim.

**2 minutes (the architectural answer)** — pitch + naive approach + insight + complexity + one variation. Practice aloud.

**5 minutes (the deep answer)** — 2-minute version + correctness sketch + edge case story + real-world example.

### Discipline rule

Write all three. Time yourself reading them. If 30s overruns, compress. If 2min underruns, you missed depth.

### Exit criterion

You can deliver the 2-minute version on demand, in a tense interview, while sketching code on a whiteboard.

---

## 20. Sources and deeper reading

The references that earned their place. Curate, don't dump.

### Discipline rule

Maximum 5 references. For each, one sentence on what it's *for* (when to consult it).

For binary search:
- **CLRS §2.3.1, §12.2** — canonical correctness proof + boundary discussion.
- **Skiena, *The Algorithm Design Manual*, §4.9** — practical recognition.
- **"Nearly All Binary Searches and Mergesorts Are Broken"** — Joshua Bloch's 2006 Google blog post on the `(lo+hi)/2` overflow that lived in `java.util.Arrays.binarySearch` for nine years.
- **CP-Algorithms — binary search** — for competitive programming variants and parametric search.

### Exit criterion

Each reference is one you'd actually return to, not one you cite to look thorough.

---

# Worked Example — Binary Search

The full template applied to one canonical algorithm, end-to-end. This is the depth target. Copy this rigour for every algorithm note.

---

## Quick reference card

```
- Family: Search
- One-line definition: Find a target in a sorted array by halving the search space each step.
- Time: best O(1), avg O(log n), worst O(log n)
- Space: O(1) iterative, O(log n) recursive
- Required precondition: array sorted on the search key
- Recognition cue: "sorted array + find / find-rank-of / find-smallest-x-such-that"
- Most common bug: integer overflow in (lo+hi)/2, infinite loop on lo=mid
- Canonical reference: CLRS §2.3.1
```

## 1. The 30-second pitch

**For your dad:** "I have a sorted phone book and I want to find a name. Instead of reading every page, I open to the middle, see if my name is before or after, throw away the wrong half, and repeat. Three or four halvings get me to any name in a 1000-page book."

**For an engineer:** "Given a sorted sequence and a target, find the target's position (or where it would go) in O(log n) comparisons. Halve the search range each step using the sorted-order property."

This is useful when you have a static sorted dataset and need fast random lookups, or when you're searching for the boundary point in a monotonic predicate (binary search on the answer).

## 2. The motivating problem

Concrete: a sorted log file with 100M timestamped entries; you need to find the first entry on a given date. Linear scan is 100M comparisons (~50ms at 2ns per compare). Binary search is ~27 comparisons (~54ns). Three orders of magnitude under your 1ms SLO; this is the move.

## 3. The naive approach (and why it fails)

Linear scan from the start. O(n) time, O(1) space. For 100M entries this is a hot loop you can fit comfortably, but for a service handling 100K queries per second you'd spend 5,000 CPU-seconds per second of wall-clock. The naive approach scales linearly with data; binary search makes the data growth almost free.

## 4. The key insight

**On a sorted array, every comparison eliminates half the remaining search space.**

That's it. Everything else — the indexing, the recursion or iteration, the boundary handling — is mechanics that follow from this idea.

## 5. Mental model & visualization

Picture the array as a line segment. Mark `lo` and `hi`. Compute `mid`. The comparison at `a[mid]` cuts the segment in half:

```
target = 7

iter 0:  [1, 3, 5, 7, 9, 11, 13]      lo=0, hi=6, mid=3
                ^                       a[3]=7 → found!
iter 0:  [1, 3, 5,*7, 9, 11, 13]
          └── search range ───┘

target = 10

iter 0:  lo=0  hi=6  mid=3  a[3]=7   < 10 → search right
                            └─ shrink
iter 1:  lo=4  hi=6  mid=5  a[5]=11  > 10 → search left
iter 2:  lo=4  hi=4  mid=4  a[4]=9   < 10 → search right
iter 3:  lo=5  hi=4  → exit; not found
```

The active range shrinks from `[0,6]` (7 elements) to `[4,6]` (3) to `[4,4]` (1) to empty. log₂(7) ≈ 2.8, so 3 comparisons are enough.

## 6. Hand trace by example

Input: `[1, 3, 5, 7, 9, 11, 13]`, target = `11`.

| Iter | lo | hi | mid | a[mid] | Compare | New range |
|---|---|---|---|---|---|---|
| 0 | 0 | 6 | 3 | 7 | 7 < 11 → go right | [4, 6] |
| 1 | 4 | 6 | 5 | 11 | 11 == 11 → found | return 5 |

Two comparisons. log₂(7) ≈ 2.8, so 3 is the worst-case ceiling for n=7. Matches.

## 7. Implementation — Python and Java

**Python** (canonical, half-open `[lo, hi)`):

```python
def binary_search(a, target):
    lo, hi = 0, len(a)         # half-open: hi is exclusive
    while lo < hi:
        mid = (lo + hi) // 2   # Python ints are unbounded, no overflow
        if a[mid] < target:
            lo = mid + 1       # target > a[mid], so target lives in (mid, hi)
        elif a[mid] > target:
            hi = mid           # target < a[mid], so target lives in [lo, mid)
        else:
            return mid
    return -1                   # not found
```

**Java** (canonical, inclusive `[lo, hi]`, overflow-safe):

```java
public static int binarySearch(int[] a, int target) {
    int lo = 0, hi = a.length - 1;            // inclusive on both ends
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;         // overflow-safe; (lo+hi)/2 breaks for big arrays
        if (a[mid] < target) lo = mid + 1;
        else if (a[mid] > target) hi = mid - 1;
        else return mid;
    }
    return -1;
}
```

Differences worth noticing: half-open vs inclusive (different termination + different `hi` update); Python's arbitrary-precision int sidesteps overflow that Java must defend against; Java's `Integer.MAX_VALUE / 2 ≈ 1B`, so the canonical-but-broken `(lo+hi)/2` form silently returns negative `mid` for arrays larger than ~1B elements (real-world: this lived in `java.util.Arrays.binarySearch` until Java 6, fixed by Joshua Bloch).

## 8. Correctness argument

Loop invariant: **the target, if it exists in the array, is in `a[lo..hi]`** (inclusive style).

- **Initially:** lo=0, hi=n-1; the range is the whole array; target is in it iff it's in the array. ✓
- **After each iteration:** if `a[mid] < target`, target can't be in `a[lo..mid]` (all those are ≤ a[mid] < target); we set lo = mid+1, preserving the invariant. Symmetric for `a[mid] > target`. ✓
- **On termination** (lo > hi): the range is empty, so target isn't in it; combined with invariant, target isn't in the array. Return -1. ✓

## 9. Complexity — derived

Each iteration halves the range. Starting size n; after k iterations, size is n / 2^k. The loop terminates when size < 1, i.e., k > log₂(n). So the worst case is ⌈log₂(n)⌉ + O(1) iterations.

- **Time:** O(log n) — every operation in the loop is O(1), iteration count is O(log n).
- **Space:** O(1) iterative; O(log n) recursive (recursion stack depth = iterations).
- **Best case:** O(1) when target is at the initial mid.

## 10. Loop invariant

Stated above: `target ∈ array ⟺ target ∈ a[lo..hi]`. The invariant is the algorithm; lines updating lo and hi are constructed precisely to preserve it.

## 11. Pattern recognition signals

- "Sorted array..." with a search-like target.
- "Find smallest/largest x such that P(x) is true" with P monotonic → binary search on the answer.
- O(n) feels too slow for the constraints (n ≥ 10⁵, sub-millisecond SLO).
- "Find peak / find inflection point" of a function — local maxima can be found by binary-searching for `f(mid) < f(mid+1)`.
- The problem mentions a "first" or "last" occurrence — lower/upper bound variant.
- Problem operates on a half-pipe answer space (e.g., capacity, threshold, allocation) where bigger always works or smaller always works.

## 12. Variations and siblings

| Variation | Diff from canonical |
|---|---|
| Lower bound (first index ≥ target) | `if (a[mid] >= target) hi = mid;` instead of branching on equality |
| Upper bound (first index > target) | `if (a[mid] > target) hi = mid;` |
| Search in rotated sorted array | Determine which half is sorted; binary search the sorted half |
| Binary search on the answer | Outer binary search; inner predicate `feasible(x)`; monotonic in x |
| Floor / ceiling | Run lower-bound; adjust by ±1 based on equality |
| Exponential search | Find a finite upper bound in O(log n) by doubling, then binary-search the range — used when array length is unknown or unbounded |

## 13. Pitfalls — Mistake Museum

| Bug | Symptom | Fix |
|---|---|---|
| `(lo + hi) / 2` overflows in Java/C++ | Negative `mid`, ArrayIndexOutOfBounds | `lo + (hi - lo) / 2` |
| Infinite loop on `lo = mid` (instead of `mid + 1`) | Hangs on certain inputs | Always advance the boundary past `mid` |
| Mismatched termination (`lo < hi` with `hi = mid - 1`) | Misses last element | Either `lo <= hi` with `hi = mid - 1`, or `lo < hi` with `hi = mid`. Pick a style. |
| Returns arbitrary occurrence on duplicates | Inconsistent across runs | Use lower-bound to get *first* occurrence; subtract 1 from upper-bound for *last* |
| Comparator is not consistent with the sort order | Returns wrong index or fails to find | Ensure search comparator matches sort comparator exactly |

## 14. Compared to alternatives

| Use case | Binary search | Better choice | Why |
|---|---|---|---|
| Sorted array of < 50 elements | Yes | Linear scan | Cache locality and branch prediction win at small n |
| Frequently updated sorted set | No | Hash set | O(1) lookup; binary search needs re-sort on updates |
| Range queries on sorted data | Partial | Segment tree / BIT | Binary search finds endpoints; tree finds the range sum/min |
| Disk-resident sorted data | Yes, but | B-tree | Binary search has poor I/O locality; B-trees minimise disk seeks |
| Streaming / online | No | Order statistic tree / skip list | No sorted invariant in a stream |

## 15. Counter-examples

- **Quickselect with sorted input** isn't binary search but is a useful comparison: deterministic median-of-medians is needed to make it O(n) worst-case rather than O(n²) on adversarial input. Binary search has no such issue — its worst case is the input *length*, not its content.
- **Adversarial input for binary search:** the only thing an adversary controls is which element is the target; if absent, you do log₂(n) comparisons; if present, you do at most that many. There's no input-content adversary; this is rare and pleasant.

## 16. Real-world systems

- **glibc** — `bsearch(3)`.
- **Java** — `java.util.Arrays.binarySearch`, `Collections.binarySearch`, internally in `TreeMap` floor/ceiling.
- **Python** — `bisect.bisect_left`, `bisect.bisect_right` (used heavily in scheduling, leaderboards).
- **PostgreSQL** — leaf-page scan in B-tree index; binary search within the page.
- **Linux kernel** — `lib/bsearch.c`, used for symbol resolution and IRQ tables.
- **Redis** — sorted set range queries use a hybrid skip list / hash structure but binary-search the skip list spans.

## 17. Practice ladder

| Tier | Problem | Skill |
|---|---|---|
| Warm-up | LC 704 Binary Search | Pure mechanics |
| Standard | LC 35 Search Insert Position | Lower-bound variant |
| Standard | LC 33 Search in Rotated Sorted Array | Identifying the sorted half |
| Variation | LC 162 Find Peak Element | Binary search without explicit sortedness |
| Variation | LC 540 Single Element in Sorted Array | Index parity invariant |
| Application | LC 4 Median of Two Sorted Arrays | Partition-based binary search |
| Advanced | LC 1011 Capacity to Ship Packages | Binary search on the answer |
| Advanced | LC 410 Split Array Largest Sum | Binary search on the answer with feasibility check |

## 18. Self-test prompts

1. Write canonical inclusive binary search in Java, from scratch, in 90 seconds.
2. State the loop invariant.
3. Show by induction that the algorithm terminates.
4. Why does `lo + (hi - lo) / 2` not overflow but `(lo + hi) / 2` does?
5. Explain to a non-engineer why ~20 halvings reach 1M.
6. Given the rotated-sorted variant, what's the new condition for "this half is sorted"?
7. When is linear scan faster than binary search in practice?
8. Lower-bound binary search: which two lines change?
9. Hand-trace canonical binary search on `[2, 4, 6, 8]` looking for `5`. (3 iterations, returns -1.)
10. Name a real production system that ships binary search and where in the system.

## 19. Interview cheat sheet

**30 seconds:** "Binary search finds a target in a sorted array in O(log n) by halving the search space each comparison. Loop invariant: target is in the active range. Implementation traps: overflow-safe mid computation, advance the boundary past mid to avoid infinite loops, pick inclusive vs half-open consistently."

**2 minutes:** the 30s plus: "Lower-bound and upper-bound variants for first/last occurrence. Binary search on the answer turns optimisation problems into search problems: define a monotonic feasibility predicate, binary-search the answer space. Real systems: every stdlib's sorted-array search, B-tree leaf scans, schedulers."

**5 minutes:** the 2-min plus: invariant proof, the Joshua Bloch overflow story, the tradeoff with hash sets for frequently-updated data, and a sketch of a parametric search example (e.g., "minimum capacity to ship packages within D days").

## 20. Sources

- **CLRS, *Introduction to Algorithms*, 3rd ed., §2.3.1** — canonical proof and boundary conditions.
- **Skiena, *The Algorithm Design Manual*, §4.9** — practical recognition signals.
- **Bloch, "Nearly All Binary Searches and Mergesorts Are Broken,"** Google Research Blog, 2006 — the real-world overflow bug story; required reading.
- **CP-Algorithms — *Binary Search*** — competitive-programming-flavoured variants and parametric search.

---

# Quality checklist for the AI generating this template

Before delivering the note, the AI must verify:

1. ☐ Quick reference card filled, both at top and re-checked at end.
2. ☐ §1 has both the dad-test and engineer-test versions.
3. ☐ §3 includes pseudocode for the naive approach + complexity + the *specific* failure reason.
4. ☐ §4 is one or two sentences, not a paraphrase of the algorithm.
5. ☐ §5 contains an actual ASCII diagram or table — "imagine X" rejected.
6. ☐ §6 trace shows every iteration; no "and so on."
7. ☐ §7 has implementations in two languages with *meaningful* differences highlighted.
8. ☐ §8 states the invariant explicitly and shows base case + preservation + termination.
9. ☐ §9 derives complexity (recurrence, sum, or amortised) — does not just state it.
10. ☐ §11 has 5+ recognition signals phrased as the candidate's internal monologue.
11. ☐ §12 lists variations with what *changes* relative to canonical.
12. ☐ §13 Mistake Museum has 3+ entries with bug → symptom → fix triples.
13. ☐ §14 alternatives table has *real* trade-off explanations.
14. ☐ §16 names specific production systems by name and where in the stack.
15. ☐ §17 practice ladder progresses through skill levels, with a "why" for each.
16. ☐ §18 self-test has 8+ active-recall prompts, all generative.
17. ☐ §19 has all three timings (30s / 2min / 5min).
18. ☐ §20 has ≤ 5 curated references, each with a one-sentence purpose.

If any check fails, the section is incomplete. Iterate.

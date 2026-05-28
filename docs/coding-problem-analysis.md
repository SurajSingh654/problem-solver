# Problem Analysis Template — The Pre-Coding Phase

> **How to use this doc:** when starting a new coding problem, run the template top-to-bottom (Phases 0–7) before writing any code. Each phase has: what it's for, the sub-steps or lenses to apply, what good output looks like, the discipline rule, and how to know you're done. The three worked examples at the bottom show what a full rigorous analysis looks like across three different genres (optimization, validation, counting/DP) — copy that structure for every problem you write notes on. Refine the template as your skill ceiling rises.

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

You're building a _cognitive anchor_ before deep-reading. Without it, you parse the problem statement word-by-word with no genre context — like reading a novel without knowing if it's a thriller or a romance. With anchor, every sentence in Phase 1 lands against the right backdrop.

### Mental shift

| Before Phase 0          | After Phase 0                                         |
| ----------------------- | ----------------------------------------------------- |
| Blank slate             | Rough genre + complexity ceiling + input/output shape |
| "What is this problem?" | "What _kind_ of problem am I walking into?"           |

### The four glances (do them in order, ~7 seconds each)

**Glance 1 — Title.** What _specific words_ in the title signal genre? Verbs ("find", "count", "return"), superlatives ("best", "max", "min"), domain words ("tree", "graph", "stock", "stairs") all carry information. Don't expect the title to give you the algorithm — it tells you the _category_.

**Glance 2 — Constraints.** Just the largest `n`. That single number tells you the algorithm class.

- `n ≤ 100` → brute force fine
- `n ≤ 10⁵` → must be O(n log n) or O(n)
- `n ≤ 10⁹` → must be O(log n) or O(1)

You'll do precise constraint decoding in Phase 2 — Phase 0 is just the temperature gauge.

**Glance 3 — Examples.** Don't trace yet. Just look at the _silhouette_:

- How many examples?
- What shape is the input? (array, string, matrix, graph, tree, **single integer**)
- What shape is the output? (number, list, boolean, structured)
- Do any examples look like edge cases? (all-zero, all-equal, single element, empty)

**Glance 4 — Return type.** Two follow-up questions:

- _Value or index?_ "Return the index of…" vs "return the value at…" are different problems.
- _Bounded?_ Can the answer be negative? Zero? Always positive? Can it grow exponentially with n? This affects accumulator initialization AND data type.

### Output shape

A four-bullet anchor list:

```
- Genre: one of —
    optimization (max / min, single best answer)
  | counting (how many ways, total — often DP)
  | search / lookup (find element, find position)
  | check / validate (boolean — is this string valid? does this exist?)
  | construction (build a new structure)
  | transformation (modify input → output)
  | parsing / decoding (interpret structured input)
- Time budget: O(<class>) only; forbids <class>
- Input/output shape: <e.g., array → number, string → boolean, integer → integer>
- Edge case hints from examples: <e.g., all-decreasing returns 0; smallest n is its own case>
```

### Discipline rule

**Phase 0 takes 30 seconds.** If you spend two minutes here, you're starting Phase 1 too late. If you spend ten seconds, you didn't actually read the constraints. Aim for ~30s.

### How to know you're done

You can answer the question _"if a friend asked what kind of problem this is, in one sentence, what would I say?"_. If you can't, do another scan.

---

## Phase 1 — Deep-read line by line (2-3 minutes)

### What this phase is for

This is your _forensic read_. Phase 0 was a skim; Phase 1 is the lawyer's read. Every sentence in the problem statement is a contract clause — your job is to extract every constraint, permission, and unstated assumption it carries.

### Mental shift

| Phase 0         | Phase 1                              |
| --------------- | ------------------------------------ |
| Skim, label     | Sentence by sentence, drain each one |
| Genre intuition | Algorithm spec building              |
| 30 sec          | 2-3 min                              |

### The four lenses (apply to every sentence)

For each sentence, ask all four. Don't skip. If a lens has no answer, write **"nothing relevant"** rather than skipping silently.

**Lens 1 — Literal.** Paraphrase in your own words. Confirms you actually read the words. Catches "different day" vs "different value" mistakes that haunt later phases.

**Lens 2 — Rules out.** What is _forbidden_ by this sentence? Each clause is a constraint that eliminates moves. "In-place" rules out aux arrays. "Different day" rules out same-day transactions. "Non-negative answer" rules out returning -1.

**Lens 3 — Rules in.** What is _required or guaranteed_? Less common but high-signal when present. "Sorted" rules in binary search. "Always at least one valid answer" rules in skipping the not-found sentinel.

**Lens 4 — Implicit.** What's _not stated_ but assumed for the problem to make sense? "Array" doesn't say "non-empty"; check examples or constraints to confirm. "Maximize profit" doesn't say "subject to fee" — implicit: fee = 0 (changes in a follow-up problem).

### Generic phrase patterns

| Phrase                                               | Hidden questions                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| "You are given an array…"                            | Random access? Mutable? Sorted? Indexed from 0 or 1?                               |
| "You are given an integer `n`…" (no array)           | Often combinatorial / DP / math; brute force is recursion not loops                |
| "Choose any element…"                                | One? At most one? Exactly one? Multiple allowed?                                   |
| "…in the future" / "…before X"                       | Order matters; index relations matter                                              |
| "maximum / minimum"                                  | Optimization; one numeric answer                                                   |
| "in how many distinct ways" / "count the number of"  | Counting genre; **almost always DP**; "distinct" usually means ordered sequences   |
| "If you cannot…, return X"                           | The answer is bounded; you're not forced to act                                    |
| "subarray" vs "subsequence"                          | Contiguous vs non-contiguous (people get this wrong)                               |
| "in-place"                                           | Cannot allocate auxiliary array of size n                                          |
| "may contain duplicates"                             | Hashing / counting becomes more nuanced                                            |
| "valid / invalid / well-formed"                      | Boolean predicate; can short-circuit on first violation                            |
| "matching / balanced / nested"                       | Pairing structure; almost always **stack**                                         |
| "open and close" / "begin and end"                   | Nesting; LIFO; stack                                                               |
| "in the correct order" / "in the same order"         | Sequence-dependent; can't shuffle                                                  |
| "consisting of [character set]"                      | Bounded alphabet; constant-size lookup viable                                      |
| "must be / cannot be"                                | Strict requirement; not optional, not "should"                                     |
| "determine if / return whether"                      | Boolean answer; one bit out                                                        |
| "every / each [X] has a corresponding [Y]"           | Bijection; pair-counting; stack or hash map                                        |
| "string of length n"                                 | Char-by-char iteration; charset matters                                            |
| "rotate / reverse / shift"                           | Geometric/structural transformation                                                |
| "reach state X" / "arrive at n" / "climb to the top" | State-based DP; ask "what was the LAST move into this state?"                      |
| "k operations / at most k transactions"              | Adds a state dimension; usually 2D DP                                              |
| "each time you can either X or Y"                    | Discrete choice per step → DP recurrence with branching factor = number of choices |

### Output shape

A table — sentence as row, four lenses as columns:

| Sentence | Literal | Rules out | Rules in | Implicit |
| -------- | ------- | --------- | -------- | -------- |
| "[s1]"   | …       | …         | …        | …        |
| "[s2]"   | …       | …         | …        | …        |

3-7 rows for typical problems. Most cells filled. At least one _surprising_ extraction (something Phase 0 missed).

### Discipline rule

**One sentence at a time.** Don't skim two sentences and answer for both — you'll miss the precision of each. The slowness IS the point.

### How to know you're done

You discovered at least one constraint or assumption that you didn't see during the Phase 0 scan. If you didn't, you weren't reading deeply enough.

---

## Phase 2 — Decode constraints (1-2 minutes)

### What this phase is for

You touched the constraints in Phase 0 (just the size) and Phase 1 (where they appeared in sentences). Now they get a _dedicated pass_, because constraints encode the _interviewer's whisper_ about what algorithm class is expected. Misreading a constraint is the single most expensive Phase mistake.

### Mental shift

| Phase 1                        | Phase 2                      |
| ------------------------------ | ---------------------------- |
| What does each _sentence_ say? | What does each _number_ say? |
| Spec for the problem           | Spec for the runtime         |
| English-language analysis      | Big-O analysis               |

### The decoding sub-steps

**Sub-step 1 — Translate every numeric constraint into algorithm classes.** Use the time-budget table:

| n size  | Class allowed                                                                                                                                                                                                                                    | Class forbidden                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| ≤ 10    | brute force, permutations                                                                                                                                                                                                                        | —                              |
| ≤ 20    | bitmask DP, exponential                                                                                                                                                                                                                          | factorial                      |
| ≤ 45    | **n is small as an array size, but the answer-space may be exponential** — naive recursion at 2ⁿ is forbidden; memoized DP at O(n) is the target. Common signal for "Fibonacci-flavored" problems where the bound is calibrated to int overflow. | naive recursion                |
| ≤ 100   | O(n³)                                                                                                                                                                                                                                            | O(2ⁿ)                          |
| ≤ 1,000 | O(n²)                                                                                                                                                                                                                                            | O(n³)                          |
| ≤ 10⁴   | O(n²) borderline; prefer O(n log n)                                                                                                                                                                                                              | O(n³)                          |
| ≤ 10⁵   | O(n log n) or O(n)                                                                                                                                                                                                                               | **O(n²)**                      |
| ≤ 10⁶   | O(n)                                                                                                                                                                                                                                             | O(n log n) borderline          |
| ≤ 10⁹   | O(log n) or O(1)                                                                                                                                                                                                                                 | anything that stores the input |

**Note the n ≤ 45 row carefully.** This bound is small _as an array size_ — if the input were an array of length 45, brute force O(n²) at 2025 ops would be fine. But when n is given as a single integer and the _answer-space_ grows exponentially (counting paths, partitions, sequences), the bound is calibrated against the answer-space, not the iteration count. Common in counting/DP problems.

**Sub-step 2 — Translate every value-range constraint into data-structure choices.**

| Constraint shape                               | What it tells you                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `values ≤ 10⁴` (small)                         | Counting sort, bucket array, or array-as-hashmap viable                           |
| `values ≤ 10⁹` (large)                         | Need real hash map; can't index by value                                          |
| Negatives allowed                              | Can't index by value directly; rules out direct counting; affects sums (overflow) |
| Zero allowed                                   | Edge cases for division, multiplication, geometric mean                           |
| Floats allowed                                 | Equality is suspect; tolerances matter                                            |
| `n ≥ 1` (no empty)                             | One specific edge case removed — but n=1 is still its own edge                    |
| Answer fits in int (e.g. n ≤ 45 for Fibonacci) | Bound calibrated to overflow boundary; standard int is enough                     |

**Sub-step 3 — Ask "why this number?" for every constraint.** Bounds are _calibrated_. The problem-setter chose `n ≤ 10⁵` for a reason — they wanted to force O(n log n). If they'd wanted to allow O(n²) they'd have written `n ≤ 10³`. If they chose `n ≤ 45` for a counting problem, they wanted the answer to fit in 32-bit int while keeping naive recursion infeasible.

**Sub-step 4 — Look for hidden constraints.** Sometimes constraints are implicit:

- "Values fit in int" → no overflow concerns
- "k test cases, each ≤ X" → outer loop runs k times, inner algorithm runs against X
- Combined bounds (sum of all n across test cases ≤ 10⁶) → controls total work, not per-case

### Output shape

A two-column table per constraint:

| Constraint     | Decoded                                                            |
| -------------- | ------------------------------------------------------------------ |
| `n ≤ 10⁵`      | O(n log n) ceiling. Forbids O(n²). Single-pass O(n) is the target. |
| `values ≤ 10⁴` | Fits in 16-bit; no overflow; can index by value.                   |

### Discipline rule

**Every numerical constraint must produce at least one algorithmic implication.** If a constraint is "decoded" as just "values are small" with no algorithm consequence, you didn't decode — you restated.

### How to know you're done

You can name an O(...) bound that the problem allows AND name an O(...) bound the problem forbids. Both must come from constraints, not guesses.

---

## Phase 3 — Mine the examples (2-3 minutes)

### What this phase is for

Examples are _not random_. They are deliberately curated counterexamples and tutorials. The problem-setter chose them to (a) demonstrate the algorithm's basic shape, (b) refute a tempting wrong approach, and (c) stress edge cases. Mining them gives you algorithm hints the problem statement alone doesn't.

### Mental shift

| Phase 1                  | Phase 3                 |
| ------------------------ | ----------------------- |
| Read English (sentences) | Read data (numbers)     |
| Extract constraints      | Extract algorithm hints |
| Static analysis          | Trace + hypothesis      |

### The mining sub-steps

**Sub-step 1 — Trace each given example by hand.** What's the literal path from input to answer? Which elements participate? Which don't? Don't just look at input → output; understand the _mechanism_.

**Sub-step 2 — Identify what each example showcases.** Each official example has a purpose:

- Example 1 is usually the _typical case_ — establishes the basic shape
- Example 2 (when present) is often the _counterexample_ — refutes a naive approach
- Example 3 (when present) usually stresses an edge

Ask: "what naive algorithm would WORK on example 1 but FAIL on example 2?" That gap is the lesson.

**Sub-step 3 — Generate your own examples.** Official examples cover ~50% of cases. You generate the rest:

- Smallest valid input (n=1, n=2)
- All-equal values
- Strictly increasing / strictly decreasing
- Single value repeated
- Adversarial: input designed to break your first instinct

**Sub-step 4 — Tweak one number.** Pick a value in an official example and change it. Does the answer change? By how much? This reveals which positions/values are _load-bearing_ in the algorithm.

**Sub-step 5 (counting/DP problems only) — Look for a recurrence in the answer sequence.** Compute the answer for n=1, 2, 3, 4, 5. Does the sequence look familiar? Fibonacci (1, 1, 2, 3, 5, 8, …)? Powers of 2? Catalan? Spotting the recurrence at this stage is half the algorithm. This sub-step is what separates "I'll think about it" from "I have the recurrence."

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

(For counting problems) Answer sequence f(1), f(2), f(3), …: <sequence>. Recurrence hypothesis: <formula>.
```

### Discipline rule

**Generate at least 3 of your own examples.** Officials don't cover edges; you must.

### How to know you're done

You can articulate at least one algorithm hint that the problem statement alone didn't give you. If your "Phase 3 output" is just "yep, the examples confirm what I read", you didn't mine — you transcribed.

---

## Phase 4 — Form explicit conclusions (1-2 minutes)

### What this phase is for

Phases 1-3 produced _observations_. Phase 4 converts them into _spec items_ — hard requirements the algorithm must satisfy. This is where loose intuition becomes a checklist.

### The conclusion shape

Every conclusion takes this form:

> **"Because of [observation from Phase 1/2/3], my algorithm must [requirement]."**

Examples:

- "Because n ≤ 10⁵, my algorithm must run in O(n log n) or better."
- "Because order matters (verified by example 2), my algorithm must NOT sort the input."
- "Because the answer is bounded below by 0, my accumulator can initialize to 0 (no sentinel needed)."
- "Because the answer at n only depends on n−1 and n−2, my algorithm needs only O(1) state."
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

Pattern matching to known algorithm classes. Categorization shortcuts you to a _known solution shape_ — you don't have to invent the algorithm from scratch; you adapt a template.

### The classification sub-steps

**Sub-step 1 — Match against the signal table.** From the problem's structure (verbs, constraints, output type), pick categories from the standard taxonomy:

| Signal                                                           | Likely category                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| "Find a pair with property"                                      | Two pointers / hash map                                                          |
| "Subarray with property X"                                       | Sliding window / prefix sum                                                      |
| "Subsequence with property X"                                    | DP                                                                               |
| "Find min/max while iterating"                                   | Greedy / single pass                                                             |
| **"Count ways" / "in how many distinct ways"**                   | **DP (counting variant)**                                                        |
| **"Reach state n from prior states"**                            | **DP — identify recurrence by asking "what was the LAST move into this state?"** |
| **"Answer at n decomposes into answers at smaller subproblems"** | **DP — top-down (memoization) or bottom-up (tabulation)**                        |
| **"Each step you can either X or Y" (constant branching)**       | **1D DP with `f(n) = f(n-X) + f(n-Y)` recurrence**                               |
| "Shortest / longest path"                                        | BFS / DFS / Dijkstra                                                             |
| "Sorted array"                                                   | Binary search / two pointers                                                     |
| "Hierarchical"                                                   | Tree / recursion                                                                 |
| "Maximize / minimize"                                            | Greedy _or_ DP (constraints decide)                                              |
| "Kth largest/smallest"                                           | Heap / quickselect                                                               |
| "Intervals"                                                      | Sort + sweep                                                                     |
| "Cycles in choices"                                              | Graph / Union-Find                                                               |
| "Match brackets / balanced / nested / well-formed"               | **Stack**                                                                        |
| "Validate / parse structured input"                              | **Stack or state machine**                                                       |
| "Track depth / nesting level"                                    | **Stack or running counter**                                                     |
| "Palindrome / mirror / read same forward/backward"               | **Two pointers (or stack)**                                                      |
| "Reverse-order / undo last operation / LIFO"                     | **Stack**                                                                        |
| "Most-recent X"                                                  | **Stack** (most recent open / most recent unmatched)                             |
| "Boolean predicate (true/false)"                                 | Whatever the structure suggests, but **short-circuit on first violation**        |
| "Sliding average / running statistic"                            | Sliding window                                                                   |
| "Anything with a fixed small alphabet (e.g. 6 chars)"            | Constant-size lookup table; charset-specific shortcuts                           |

**Sub-step 2 — Identify primary + secondary candidates.** It's fine to list multiple. The primary is the one you'll try first; secondary is your fallback.

**Sub-step 3 — Connect the category to your conclusions.** If your conclusions say "single pass with state", the category is greedy/single-pass. If they say "answer at n depends on n-1 and n-2", the category is 1D DP. The category should _follow from_ your Phase 4 conclusions, not contradict them.

### Output shape

```
Primary category: <name>
Why: <one-line reason from Phase 4 conclusions>

Secondary candidates: <name>, <name>
```

### Discipline rule

**At least one named category.** "I don't know" means you skipped Phase 4 or didn't pattern-match. Even if your category is "I think this is a custom shape", that itself is a signal — interview problems usually map to a known class.

### How to know you're done

You can name a _similar problem_ you've seen before. Not the same problem — a _similar shape_. If you can't name any, you don't have categorization yet.

---

## Phase 6 — Clarifying questions (1 minute)

### What this phase is for

In an interview, this phase signals careful reading. In self-practice, it surfaces assumptions you made during Phases 1-5 that _might be wrong_.

### The categorized question types

Don't ask everything — ask only where the problem statement was _genuinely ambiguous_. Asking obvious questions signals weak reading.

**Bounds** — what's the maximum size? Can input be empty / null? Can n = 1?
**Semantics** — subarray vs subsequence? Strict or ≤? Different _index_ or different _value_? Duplicates allowed? "Distinct" = ordered or unordered?
**Return value** — what to return if the answer doesn't exist (-1? null? 0? throw?)? Should it be sorted? Index or value?
**Mutability** — can I modify the input? Is the input guaranteed valid?
**Operational** — multiple queries on the same data, or one-shot? Static or streaming?

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

This is your _commitment_. You declare the algorithm you're about to write. The narration itself is what interviewers grade — two candidates write the same code; the one who narrated the why scores higher.

### Required components

A complete Phase 7 narration includes:

1. **Constraint cite** — "Based on n ≤ X, I need O(...)"
2. **Observation cite** — "I observed Y, which means Z"
3. **Brute force first** — "The simplest approach is..."
4. **Optimal next** — "I'll optimize by..."
5. **Final complexity** — "This runs in O(...) time, O(...) space"
6. **Edge cases acknowledged** — "Edge cases: [a], [b]; my approach handles them by..."

### Brute force is genre-dependent

What "brute force" looks like depends on the problem genre — don't force a nested-loop framing onto a problem where the natural brute force is recursion:

| Genre                       | Brute force shape                                                  |
| --------------------------- | ------------------------------------------------------------------ |
| Optimization (LC 121-style) | Nested loops over all pairs / triples                              |
| Validation (LC 20-style)    | Repeated collapse / regenerate until stable                        |
| Counting / DP (LC 70-style) | **Naive recursion** — `f(n) = f(n-1) + f(n-2)`. NOT a nested loop. |
| Search / lookup             | Linear scan                                                        |
| Construction                | Try all permutations / all subsets                                 |

For DP problems, the **optimization arc** has 4 levels rather than 2:

```
Naive recursion (exponential)
   ↓ memoize the recursive calls
Top-down DP / memoization (O(n) time, O(n) space + recursion stack)
   ↓ flip recursion to iteration
Bottom-up DP / tabulation (O(n) time, O(n) space, no stack)
   ↓ keep only the prior k values you need
Space-optimized DP (O(n) time, O(1) space)
```

You don't always have to walk all four — but acknowledging them in your narration shows depth.

### The narration template

> "Based on the constraint n ≤ [X], I need O(...) or better.
> I observed [Y], which means [Z].
> The simplest approach is [brute force shape] which is O([B]). Let me verify it on the examples first.
> The optimal approach is [C] — O([D]) time, O([E]) space — by [tracking state / using a recurrence / ...].
> Edge cases I'm watching: [list]."

### Discipline rule

**State it OUT LOUD or in writing.** Internal monologue doesn't count for the interviewer (or for catching contradictions). The act of narration forces you to confront vague pieces.

### How to know you're done

If a colleague heard your narration without seeing the problem, they could write the algorithm. If they'd be confused, your plan is incomplete.

---

## Phase 7.5 — Pseudocode pass (1 minute)

### What this phase is for

Phase 7 produced an English plan. The final code will be in your interview language (Java, Python, etc.). **The bridge between them is pseudocode** — language-agnostic structured prose that nails the algorithm shape before you commit to syntax. This catches loop-bound errors, missing state updates, and order-of-operations bugs while they're still cheap to fix.

### Mental shift

| Phase 7         | Phase 7.5                               | Final code                  |
| --------------- | --------------------------------------- | --------------------------- |
| English plan    | Structured pseudocode                   | Language-specific code      |
| "I will track…" | `lastSeen ← empty map`                  | `Map<Character, Integer> …` |
| Verbal          | Code-shaped but type-free + syntax-free | Compilable                  |

### Conventions

| Convention                        | What it means                                                                |
| --------------------------------- | ---------------------------------------------------------------------------- | --- | --- |
| `←` (or `=`)                      | Assignment. `←` is more textbook; `=` is fine if you stay consistent.        |
| Lowercase `for` / `if` / `return` | Standard. (CLRS uses uppercase; either works if consistent.)                 |
| Indentation = scope               | No braces, no `END IF`/`END FOR`.                                            |
| `for right from 0 to n − 1`       | Inclusive range. Off-by-one errors hide in `for x in s` style — be explicit. |
| `c in lastSeen`                   | Membership check. Cleaner than `lastSeen.containsKey(c)`.                    |
| Empty/abstract types              | `empty map`, `empty list`. Never `HashMap<Character, Integer>`.              |
| Math notation OK                  | `max(a, b)`, `length(s)`, `                                                  | s   | `.  |
| One operation per line            | Don't chain. Pseudocode is read by humans first.                             |

### Three levels of pseudocode

Pick the level that fits the situation.

**Level 1 — Step-by-step English (narrative)**. Use when explaining out loud or writing in a notebook.

```
1. Maintain a sliding window [left, right] over the string.
2. Maintain a map: char → most recent index.
3. For each right from 0 to n−1:
   a. If current char is in the map AND its stored index is in the window, advance left.
   b. Update map: char → right.
   c. Update answer: max(answer, current window length).
4. Return answer.
```

**Level 2 — Structured pseudocode (interview standard)**. Use on a whiteboard, in design docs, or as the canonical pseudocode pass.

```
function longestSubstring(s):
    left      ← 0
    maxLen    ← 0
    lastSeen  ← empty map      // char → most recent index

    for right from 0 to length(s) − 1:
        c ← s[right]
        if c in lastSeen and lastSeen[c] >= left:
            left ← lastSeen[c] + 1
        lastSeen[c] ← right
        maxLen ← max(maxLen, right − left + 1)

    return maxLen
```

**Level 3 — Code-shaped pseudocode (almost-Python)**. Use for personal scratch work when you just want to nail structure quickly.

```
left, maxLen = 0, 0
lastSeen = {}                  # char -> most recent index
for right in range(n):
    c = s[right]
    if c in lastSeen and lastSeen[c] >= left:
        left = lastSeen[c] + 1
    lastSeen[c] = right
    maxLen = max(maxLen, right - left + 1)
return maxLen
```

### The 30-second pseudocode checklist

Before you start writing real code, your pseudocode should answer:

```
[ ] What state am I tracking?            (variables + their meaning)
[ ] What's the loop structure?           (range, direction, what advances)
[ ] What are the branch conditions?      (every if has a clear English meaning)
[ ] What gets updated when?              (order of updates inside the loop)
[ ] What's the final return value?       (and where does it come from)
[ ] What edge cases survive without special handling?
```

If your pseudocode answers all six, the language translation is mechanical. If it doesn't, you have an algorithm-shaped hole — find it before you start typing.

### Discipline rule

**Drop types, drop noise, keep structure.** No `int`, no `HashMap<…>`, no `s.charAt(i)`. Just `c ← s[right]`. The point of pseudocode is to think about _what_ the algorithm does, not _how_ the language expresses it.

### How to know you're done

A reader who only knows Python could implement your Java solution from your pseudocode (and vice versa). If they'd need to ask "what's the type of `lastSeen`?", that's fine — answer "a map." If they'd need to ask "what does this loop do?", your pseudocode is incomplete.

---

# Failure modes — what separates strong vs weak analysis

Strong and weak candidates produce the same code; what separates them is everything that happens _before_ the code. The most common failure modes:

| Trap                                   | What weak does                                          | What strong does                                                                                          |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Phase skipping**                     | Skips Phase 2 because the problem "looks easy"          | Always does the constraint pass — easy-looking problems still have signals                                |
| **Single read**                        | Reads the problem once, dives in                        | Reads three times: vocab → structure → edges                                                              |
| **Trusting officials**                 | Trusts the official examples to cover edges             | Generates own counterexamples (n=1, all-equal, all-decreasing, adversarial)                               |
| **Auto-greedy**                        | "Maximize" → reaches reflexively for greedy             | Asks "could DP be the right answer here?" — constraints decide                                            |
| **Subarray ≠ subsequence**             | Treats them as interchangeable                          | Notices contiguous vs non-contiguous; one of the most common bugs                                         |
| **Surface anchor**                     | Anchors on the first valid algorithm                    | Spends an extra 60s asking "is there an O(n) here?" before settling                                       |
| **Mental conclusions**                 | Holds conclusions in head                               | Writes them out — out-loud + written conclusions catch contradictions                                     |
| **Wrong magnitude**                    | Reads `10⁴` as `10⁵` (or vice versa)                    | Re-reads the constraint — single most expensive analysis mistake; routes you to the wrong algorithm class |
| **Memorizes the table**                | Treats the constraint table as a lookup                 | Asks _why_ the bound was chosen — every bound is calibrated to forbid one approach and force another      |
| **Categorizes from title**             | Reaches for a known data structure based on title alone | Categorizes from observations + conclusions, not the title                                                |
| **Skips brute force**                  | Jumps to optimal                                        | States brute force first — establishes baseline AND lets you sanity-check on examples                     |
| **Forces brute-force-as-nested-loops** | Tries to fit nested loops onto a DP problem             | Recognizes that brute force for counting/DP is naive recursion                                            |
| **Forces clarifying questions**        | Asks every question to "look thoughtful"                | Asks only the ones the problem was genuinely ambiguous about                                              |
| **Internal monologue**                 | Thinks silently                                         | Narrates externally — "I notice X, which means Y"                                                         |
| **Checklist mode**                     | Treats the template as a checklist to satisfy           | Treats it as a thinking tool — phases produce real output, not boilerplate                                |

The deeper pattern: **weak candidates extract the minimum information needed to start coding; strong candidates extract the maximum information available, then commit.** The first 5 minutes feel slow but make the next 25 minutes feel certain.

---

# How to use this going forward

```
1. Pre-coding analysis (this template, Phases 0–7)        ~ 5–10 minutes
2. Pseudocode pass (Phase 7.5 — Level 2 structured)       ~ 1 minute
3. Solution journey (brute → intermediate → optimal, with "why" at each step)
4. Final code in your language (translation from pseudocode is mechanical)
5. Edge cases & pitfalls
6. Pattern recognition summary + what this problem really teaches
7. Related problems (for spaced repetition)
8. Action item — one specific thing to retain
```

The first hour you spend on a problem should be ~50% analysis, ~50% solution. By problem 30, your analysis phase compresses to ~5 minutes because the patterns become muscle memory — but the _order_ (analyze → conclude → solve) stays.

---

# Why interviewers care

Per the published interview guides at Google, Stripe, and Meta:

> "Strong candidates restate the problem in their own words, decode the constraints out loud, articulate observations from the examples, and explicitly state their approach plan before writing code. Candidates who jump to code, even with the same final solution, score notably lower on **problem-solving** and **communication** axes."

Two candidates produce the same code. The one who narrated their analysis gets the offer.

---

# Worked example #1 — Best Time to Buy and Sell Stock (LeetCode 121)

> Genre: **optimization**. Demonstrates: greedy / single-pass replacing an O(n²) "for each pair" brute force.

## The problem

> You are given an array `prices` where `prices[i]` is the price of a given stock on the i-th day.
> You want to maximize your profit by choosing a single day to buy one stock and choosing a different day in the future to sell that stock.
> Return the maximum profit you can achieve from this transaction. If you cannot achieve any profit, return 0.

**Constraints:** `1 ≤ prices.length ≤ 10⁵`; `0 ≤ prices[i] ≤ 10⁴`
**Examples:** `[7,1,5,3,6,4] → 5`; `[7,6,4,3,1] → 0`

## Phase 0 — Scan (30 sec)

- **Genre:** Optimization on an ordered array. "Best" = max/min. "Buy and Sell" = two ordered actions. "Time" = order matters.
- **Time budget:** Largest n is 10⁵. Need O(n log n) or O(n). Forbids O(n²).
- **Input/output shape:** array → single number (value, not index, non-negative).
- **Edge case hint:** Example 2 returns 0 — the problem allows refusing to transact.

## Phase 1 — Deep read

| Sentence                                                        | Literal                                                                  | Rules out                                  | Rules in                             | Implicit                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------ | -------------------------------------------------------- |
| "array `prices` where `prices[i]` is the price on the i-th day" | A sequence of prices indexed by day. Index = time.                       | Reordering — index is meaningful.          | Random access; iteration is natural. | n ≥ 0 (constraints say ≥ 1); prices are concrete values. |
| "single day to buy one stock"                                   | Pick exactly one buy day; one unit.                                      | Multiple buys; partial units.              | Quantity is fixed at 1.              | Buying is mandatory IF you transact.                     |
| "different day in the future to sell"                           | Sell on a day BOTH (a) different from buy and (b) chronologically after. | Buy and sell on same day; sell-before-buy. | sell index > buy index strictly.     | "Future" is strict.                                      |
| "maximize your profit"                                          | Optimization toward a max.                                               | Other targets (avg, total volume).         | One numeric answer.                  | Single transaction.                                      |
| "If you cannot achieve any profit, return 0"                    | Bounded below by 0.                                                      | Returning negative or null.                | Answer is always defined.            | You're NOT forced to transact.                           |

**Surprising extraction:** the **strict** "different day in the future" — not "different OR future". Rules out same-day even if you wanted it.

## Phase 2 — Decode constraints

| Constraint                | Decoded                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `1 ≤ prices.length ≤ 10⁵` | n is large. **O(n²) is forbidden** (10¹⁰ ops, times out). Need O(n log n) or O(n). Single-pass is the natural fit. n=1 is allowed → must handle. |
| `0 ≤ prices[i] ≤ 10⁴`     | Values are non-negative and small. Profit ≤ 10⁴ — no int overflow.                                                                               |

10⁵ specifically forbids the lazy O(n²) brute force; the problem-setter wants the single-pass solution.

## Phase 3 — Mine examples

**Example 1: `[7,1,5,3,6,4] → 5`** Trace: best buy index is 1 (value 1); best sell index is 4 (value 6); 6−1 = 5. **Confirms**: at any sell index j, the right buy is the running min of `prices[0..j-1]`.

**Example 2: `[7,6,4,3,1] → 0`** Strictly decreasing; max(prices)−min(prices) = 6 but max comes BEFORE min. **Refutes**: "max − min" as the algorithm. **Confirms**: 0-floor is real.

**Self-generated examples:**

- `[1] → 0` — n=1; no future day exists.
- `[1,2] → 1` — smallest positive case.
- `[2,1] → 0` — smallest negative case.
- `[1,2,1,2] → 1` — multiple opportunities; only one transaction allowed.

## Phase 4 — Conclusions

1. Because order matters (Example 2 refutes max−min), my algorithm **must NOT sort** the input.
2. Because n ≤ 10⁵, my algorithm **must run in O(n log n) or better**.
3. Because the right buy for any sell index `j` is `min(prices[0..j-1])`, my algorithm **must track the running minimum**.
4. Because the answer is bounded below by 0, my **accumulator initializes to 0**.
5. Because n=1 is allowed, my algorithm **must handle the single-element case** (return 0).
6. Because state collapses to two scalars, my algorithm **needs only O(1) auxiliary space**.

## Phase 5 — Classify

**Primary:** Greedy / single-pass. Conclusion 3 (running min) and Conclusion 6 (O(1) state) point at single-pass.
**Secondary:** DP with state "best profit if I've sold by today". Useful for LC 122/123/188 extensions.
**Similar problems:** Maximum Subarray (Kadane's) — same shape, different aggregate.

## Phase 6 — Clarifying questions

1. "Just to confirm — exactly one buy and one sell, no partial transactions?"
2. "If `prices.length === 1`, expected answer is 0?"

## Phase 7 — Approach plan

> "Based on n ≤ 10⁵, I need O(n) or O(n log n). I observed that at any sell index j, the right buy is the minimum of prices[0..j-1] — that's the algorithmic insight. Brute force is O(n²): for each pair (i, j) with j > i, compute profit and take max. Too slow.
>
> Optimal: one forward pass tracking `minPriceSoFar` and `maxProfitSoFar`. At each day j (starting from index 1):
>
> - first, update `maxProfitSoFar = max(maxProfitSoFar, prices[j] − minPriceSoFar)`
> - then, update `minPriceSoFar = min(minPriceSoFar, prices[j])`
>
> The order of these two matters — computing profit before updating min ensures we never buy and sell on the same day.
>
> Initialize `minPriceSoFar = prices[0]`, `maxProfitSoFar = 0`. The 0 init handles the 'no profitable transaction' case automatically.
>
> Edge cases: n=1 → loop doesn't execute → return 0. All-decreasing → maxProfit stays 0. All-equal → profit at every step is 0.
>
> Time: O(n). Space: O(1)."

## Solution journey

### Brute force — O(n²)

```
maxProfit = 0
for i from 0 to n-1:
  for j from i+1 to n-1:
    maxProfit = max(maxProfit, prices[j] - prices[i])
return maxProfit
```

At n = 10⁵: 5×10⁹ operations. Times out.

### Optimal — O(n) single pass

```java
class Solution {
    public int maxProfit(int[] prices) {
        if (prices.length < 2) return 0;
        int minPriceSoFar = prices[0];
        int maxProfit = 0;
        for (int j = 1; j < prices.length; j++) {
            // IMPORTANT: profit FIRST, then update min.
            // Reversing this allows buying and selling on the same day.
            maxProfit = Math.max(maxProfit, prices[j] - minPriceSoFar);
            minPriceSoFar = Math.min(minPriceSoFar, prices[j]);
        }
        return maxProfit;
    }
}
```

**Time: O(n). Space: O(1).**

## Pattern recognition

The canonical **"max diff with order constraint"** pattern. Whenever an O(n²) "for each pair" brute force naturally exists, look for whether one of the two loops can be replaced by a running aggregate.

## What this problem really teaches

Not stocks. **When an O(n²) "for each pair" brute force naturally exists, one of the two loops can often collapse into a running aggregate.** Whenever you see "do something between two indices i < j," ask "do I need both loops, or can the inner one collapse?"

## Related problems

- **LC 122** — multiple transactions; greedy on every up-move
- **LC 123 / 188** — at most k transactions; DP
- **LC 53 (Maximum Subarray / Kadane's)** — same shape, different aggregate
- **LC 11 (Container With Most Water)** — same "two indices, max diff" shape but two pointers

## Action item

When you see "max profit / max diff between two indices with j > i," your hand should reflexively reach for **track the running min, update the running answer.**

---

# Worked example #2 — Valid Parentheses (LeetCode 20)

> Genre: **validation**. Demonstrates: stack-based pattern recognition, boolean predicate, LIFO matching.

## The problem

> Given a string `s` containing just the characters `'('`, `')'`, `'{'`, `'}'`, `'['` and `']'`, determine if the input string is valid. Valid means: every open bracket is closed by the _same type_ of bracket, in the _correct order_, and every close bracket has a matching open bracket before it.

**Constraints:** `1 ≤ s.length ≤ 10⁴`. `s` consists of parentheses only.

## Phase 0 — Scan

```
- Genre: validation / boolean predicate
- Time budget: n ≤ 10⁴ → O(n) comfortable
- Input/output shape: string → boolean
- Edge case hints: matched pairs, nested, interleaved, mismatched, unclosed
```

**Title decode.** "Valid" → boolean predicate. "Parentheses" → bracket matching → strong stack signal.

## Phase 1 — Slow read

| Phrase                                              | What it really means                                        |
| --------------------------------------------------- | ----------------------------------------------------------- |
| "valid"                                             | Boolean predicate — yes/no, no degree                       |
| "open bracket closed by same type"                  | Type-matching constraint, not just count                    |
| "in the correct order"                              | LIFO ordering — most-recent-open must match next-close      |
| "every close bracket has a matching open before it" | A `)` with no prior `(` is invalid — order matters strictly |
| "just the characters …"                             | Closed alphabet of 6 — no other chars to filter             |

The **stack signal is screaming**: "most-recent open must match next close" is the textbook LIFO definition.

**Restatement:** Walk the string. Each open goes on a stack. Each close must match the top of the stack — if it doesn't, or if the stack is empty when a close arrives, it's invalid. At the end, the stack must be empty.

## Phase 2 — Constraints

| Constraint            | Implication                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `1 ≤ s.length ≤ 10⁴`  | n ≥ 1 (no empty string), so I don't need the "empty = true" branch — but I'll handle it defensively |
| Only 6 chars possible | No need to validate input alphabet                                                                  |
| n ≤ 10⁴               | O(n) is overkill-comfortable. Stack solution is naturally O(n)                                      |

## Phase 3 — Examples

**`"()"`** — valid. Push `(`. Pop on `)`. End empty. ✓
**`"()[]{}"`** — valid. Sequential push/pop. ✓
**`"(]"`** — invalid. `(` push; `]` arrives; top `(` mismatches. ✓
**`"([)]"`** — invalid (the _order_ test). `(` push; `[` push; `)` arrives; top is `[` — mismatch. ✓
**`"("`** — invalid. End reached with stack non-empty. ✓
**`")"`** — invalid. Stack empty when `)` arrives. ✓

The `"([)]"` example is the discriminator. A naive "count each bracket type" returns `true` here (3 pairs balanced numerically) — but it's invalid because the _interleaving_ breaks LIFO order. **Counting fails; stack succeeds.**

## Phase 4 — Brute force first

"Repeatedly find adjacent matched pairs `()`, `[]`, `{}` and remove them. If the string becomes empty, valid."

```
while changed:
  s = s.replace("()", "").replace("[]", "").replace("{}", "")
return s == ""
```

Time: O(n²) worst case. The _insight_: we keep collapsing the most recent matched pair. That collapsing is a stack.

## Phase 5 — Pattern recognition

| Signal                            | Maps to                               |
| --------------------------------- | ------------------------------------- |
| "Match brackets"                  | **Stack**                             |
| "Validate"                        | **Stack** (or single-pass with state) |
| "Most-recent X must match next Y" | **Stack** (LIFO)                      |
| "Boolean predicate"               | Single-pass with early exit           |
| "Bounded alphabet (6 chars)"      | Lookup table for type matching        |

## Phase 7 — Plan + code

> "Use a stack. Walk each char: open → push; close → top must match (or false); end → stack must be empty.
> Time: O(n). Space: O(n) worst case (all opens)."

```java
class Solution {
    public boolean isValid(String s) {
        Map<Character, Character> match = Map.of(')', '(', ']', '[', '}', '{');
        Deque<Character> stack = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                stack.push(c);
            } else {
                if (stack.isEmpty() || stack.pop() != match.get(c)) return false;
            }
        }
        return stack.isEmpty();
    }
}
```

**Why `ArrayDeque` not `Stack`:** Java's legacy `Stack` extends `Vector` and is synchronized — slower and not idiomatic. `ArrayDeque` is the modern recommendation.

## Pattern recognition summary

The canonical **"LIFO matching"** pattern. Whenever you see "match X with Y in correct order" / "valid nesting" / "most-recent open must match next close" + bounded alphabet of paired symbols → reach for a **stack with a tiny match-map**. The discriminator that proves a stack is required (vs. counting) is the interleaving case `"([)]"`.

## What this problem really teaches

Not parentheses. **LIFO order is a fundamentally different constraint than count.** Two problems can have the same set of items in the same multiplicities — but if order matters in a "most-recent-first" way, you need a stack. Counting collapses order; stacks preserve it.

Once internalized, you spot stacks in places that don't look like brackets: function call resolution, HTML/XML tag validation, undo history, expression evaluation, monotonic-stack problems.

## Related problems

- **LC 155** Min Stack — augment with O(1) min query
- **LC 496/503** Next Greater Element — monotonic stack
- **LC 84** Largest Rectangle in Histogram — monotonic stack, harder
- **LC 394** Decode String — stack of contexts
- **LC 224** Basic Calculator — stack for operator precedence

## Action item

When you see **"validate matched/nested/balanced + LIFO ordering matters,"** your hand should reflexively reach for a **stack with a tiny match-map.**

---

# Worked example #3 — Climbing Stairs (LeetCode 70)

> Genre: **counting / DP**. Demonstrates: recurrence discovery, the 4-level DP optimization arc (recursion → memoization → tabulation → space-optimized), input shape "single integer" rather than array/string.

## The problem

> You are climbing a staircase. It takes `n` steps to reach the top.
> Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?

**Constraints:** `1 ≤ n ≤ 45`
**Examples:** `n = 2 → 2`; `n = 3 → 3`

## Phase 0 — Scan

- **Genre:** counting ("in how many distinct ways"). Counting + recurrence-able structure → **almost certainly DP**.
- **Time budget:** `n ≤ 45`. This bound is small as an _array size_, but the answer-space grows exponentially without optimization. Naive recursion at 2⁴⁵ ≈ 35 trillion is forbidden. Memoized DP at O(n) is the target.
- **Input/output shape:** integer → integer (a count).
- **Edge case hints:** smallest n cases (n=1, n=2) are likely base cases; n ≤ 45 hints the answer fits in 32-bit int.

**Title decode.** "Climbing Stairs" → discrete state space (each step is a state). "Distinct ways" → ordered sequences are different. Already smells like Fibonacci.

## Phase 1 — Deep read

| Sentence                                              | Literal                              | Rules out                        | Rules in                | Implicit                                                                    |
| ----------------------------------------------------- | ------------------------------------ | -------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| "It takes n steps to reach the top"                   | A target count, indexed by integer n | nothing relevant                 | n is a positive integer | n ≥ 1 (constraints confirm); reaching the top = reaching position n exactly |
| "Each time you can either climb 1 or 2 steps"         | At each move, choose +1 or +2        | other step sizes (3+); zero-step | binary choice per move  | order of choices matters (it's a sequence)                                  |
| "In how many distinct ways can you climb to the top?" | Count all _ordered_ sequences        | unordered counts (combinations)  | "distinct" = ordered    | sequence ends exactly at n, not over                                        |

**Surprising extraction:** "**distinct ways**" means **ordered**. (1+2) and (2+1) are two different ways. This isn't combinations; it's sequences. Counts grow much faster than they would for combinations.

## Phase 2 — Constraints

| Constraint   | Decoded                                                                                                                                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1 ≤ n ≤ 45` | Small n, but answer-space is exponential without memoization. Naive recursion O(2ⁿ) ≈ 35 trillion at n=45 → **forbidden**. Memoized or bottom-up DP at O(n) is the target. The bound 45 is also _calibrated to int_: Fibonacci(45) ≈ 1.13 × 10⁹, just under 2³¹−1. **No overflow if we use 32-bit int and stop at 45.** |

**Why exactly 45?** Fibonacci(46) = 1,836,311,903 — still fits in 32-bit signed int (max 2,147,483,647), but Fibonacci(47) = 2,971,215,073 — overflows. The bound is calibrated against int-overflow. The problem-setter is whispering: _standard int is enough; you don't need long_.

## Phase 3 — Mine examples + look for recurrence

**Example 1: `n=2 → 2`.** Ways: `(1+1)`, `(2)`. Showcases: smallest non-trivial case.

**Example 2: `n=3 → 3`.** Ways: `(1+1+1)`, `(1+2)`, `(2+1)`. Showcases that order matters: `(1+2) ≠ (2+1)`. Also: 3 = 2 + 1 (the answer at n−1 plus the answer at n−2). **First hint of the recurrence.**

**Self-generated examples:**

- `n = 1 → 1` (only `(1)`). Tiniest base case.
- `n = 4 → 5` ways: `1+1+1+1`, `1+1+2`, `1+2+1`, `2+1+1`, `2+2`. Note 5 = 3 + 2.
- `n = 5 → 8` ways. Note 8 = 5 + 3.
- `n = 6 → 13`. 13 = 8 + 5.

**The sequence: 1, 2, 3, 5, 8, 13, 21, …** That's Fibonacci. The recurrence is `f(n) = f(n-1) + f(n-2)`.

**Why the recurrence holds (the algorithmic insight):** to reach step n, your _last move_ was either a 1-step (so you came from step n−1) or a 2-step (from step n−2). These are the only options, and they're disjoint — no sequence is double-counted. Therefore: `ways(n) = ways(n-1) + ways(n-2)`.

This is Phase 3 sub-step 5 — **looking for a recurrence in the answer sequence**. Once you spot it, the algorithm follows.

## Phase 4 — Conclusions

1. Because each move from step k goes to either k+1 or k+2, **the answer at n decomposes as `f(n) = f(n-1) + f(n-2)`**.
2. Because n ≤ 45 and naive recursion is O(2ⁿ), my algorithm **must use memoization or tabulation** — not pure recursion.
3. Because the answer at n only depends on the previous two values (not the whole history), **only O(1) state is needed** (we don't have to keep the whole `dp[]` array).
4. Because Fibonacci(45) fits in 32-bit int by deliberate calibration, **standard `int` is enough**; no `long` or `BigInteger`.
5. Because n=1 and n=2 are the base cases of the recurrence, my algorithm **must handle them explicitly** (you can't apply `f(n-2)` at n=1).

## Phase 5 — Classify

**Primary:** Dynamic programming, 1D, counting variant. The recurrence `f(n) = f(n-1) + f(n-2)` is the textbook 1D DP shape.

**Secondary:** Closed-form (Binet's formula for Fibonacci). Uses floating-point and isn't the typical interview answer — the interviewer wants to see DP reasoning.

**Similar problems seen:** Fibonacci Number (LC 509), House Robber (LC 198) — same 1D-DP shape, different recurrence.

## Phase 6 — Clarifying questions

The problem is mostly unambiguous, but I'd verify:

1. "Just to confirm — `(1+2)` and `(2+1)` are counted as two distinct ways?" (Yes — but worth saying because the unordered-count variant is a different problem.)
2. "Is n=0 possible?" (Constraint says ≥ 1; convention would be `f(0) = 1` — empty path — but not needed here.)

## Phase 7 — Approach plan

> "Based on n ≤ 45, I need O(n) — naive recursion is O(2ⁿ) and times out at 35 trillion. The algorithmic insight: to reach step n, the last move was from n−1 (a 1-step) or from n−2 (a 2-step), so `ways(n) = ways(n-1) + ways(n-2)`. Base cases: `ways(1) = 1`, `ways(2) = 2`.
>
> I'll walk through four solutions to show the optimization arc, then pick the best:
>
> **Level 0 — Naive recursion** — direct translation of the recurrence. O(2ⁿ) time. TLEs at n=45.
>
> **Level 1 — Top-down with memoization** — same recursion, but cache results. O(n) time, O(n) space + recursion stack.
>
> **Level 2 — Bottom-up tabulation** — flip recursion to iteration. O(n) time, O(n) space, no recursion overhead.
>
> **Level 3 — Space-optimized** — only the last two values are needed. O(n) time, O(1) space.
>
> Edge cases: n=1 (return 1), n=2 (return 2). Both handled by the base-case initialization.
>
> Final: O(n) time, O(1) space."

## Phase 7.5 — Pseudocode pass

Before committing to Java syntax, the algorithm at each level looks like this:

**Naive recursion (Level 0)**

```
function climbStairs(n):
    if n ≤ 2:
        return n
    return climbStairs(n − 1) + climbStairs(n − 2)
```

**Top-down memoization (Level 1)**

```
function climbStairs(n):
    memo ← empty map        // n → ways(n)
    return helper(n, memo)

function helper(n, memo):
    if n ≤ 2:
        return n
    if n in memo:
        return memo[n]
    result ← helper(n − 1, memo) + helper(n − 2, memo)
    memo[n] ← result        // ← inseparable from compute (Rule A)
    return result
```

**Bottom-up tabulation (Level 2)**

```
function climbStairs(n):
    if n ≤ 2:
        return n
    dp ← array of length n+1
    dp[1] ← 1
    dp[2] ← 2
    for i from 3 to n:
        dp[i] ← dp[i − 1] + dp[i − 2]
    return dp[n]
```

**Space-optimized (Level 3)**

```
function climbStairs(n):
    if n ≤ 2:
        return n
    prev2 ← 1               // f(1)
    prev1 ← 2               // f(2)
    for i from 3 to n:
        curr  ← prev1 + prev2
        prev2 ← prev1
        prev1 ← curr
    return prev1
```

Running the **30-second checklist** against Level 3:

- ✓ State: `prev1`, `prev2`, `curr` (the rolling two-value window)
- ✓ Loop: `i from 3 to n`, advances by 1
- ✓ Branches: only the base-case `if n ≤ 2`
- ✓ Update order: compute `curr` first, then shift `prev2` and `prev1`. Reversing this would corrupt `prev2`.
- ✓ Return: `prev1` (which holds `f(n)` after the last iteration)
- ✓ Edge cases: `n = 1` and `n = 2` exit at the early return; `n = 3` runs the loop once

All six answered. Translation to Java is mechanical from here.

## Solution journey

### Level 0 — Naive recursion (brute force)

```java
public int climbStairs(int n) {
    if (n <= 2) return n;
    return climbStairs(n - 1) + climbStairs(n - 2);
}
```

Time: O(2ⁿ). Space: O(n) recursion stack. Times out at n=45 — the same `f(k)` is recomputed exponentially many times.

### Level 1 — Top-down (memoization)

```java
public int climbStairs(int n) {
    int[] memo = new int[n + 1];
    return helper(n, memo);
}
private int helper(int n, int[] memo) {
    if (n <= 2) return n;
    if (memo[n] != 0) return memo[n];
    return memo[n] = helper(n - 1, memo) + helper(n - 2, memo);
}
```

Time: O(n) — each `f(k)` is computed exactly once. Space: O(n) memo + O(n) recursion stack.

#### Memoization sanity checklist (read this BEFORE writing memoized code)

The single most common DP bug for beginners: **writing a memoized solution that doesn't actually memoize.** The compiler accepts it; small inputs return correct answers; large inputs TLE. Two patterns avoid the trap.

**The four required steps (in this order):**

1. **Read from cache** — `if (cache.containsKey(n)) return cache.get(n);`
2. **Compute the result** — `int result = climbStairs(n - 1) + climbStairs(n - 2);`
3. **Write to cache** — `cache.put(n, result);` ← this is the line beginners forget
4. **Return the result** — `return result;`

**The classic bug (HashMap version):**

```java
// ❌ BROKEN — looks memoized, isn't.
if (cache.containsKey(n)) return cache.get(n);
int result = climbStairs(n - 1) + climbStairs(n - 2);
return result;                                  // ← never wrote to cache
```

The `containsKey` check is dead weight here — the cache is never populated, so it's always `false`. Effectively naive recursion. TLE at n = 45.

**Two safer patterns:**

| Pattern                               | Code                                                                         | Why it's safe                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Assign-and-return (array-based)**   | `return memo[n] = helper(n-1, memo) + helper(n-2, memo);`                    | Single expression — read, compute, write, return all happen at once. Used in the Level 1 code above.              |
| **`computeIfAbsent` (HashMap-based)** | `return cache.computeIfAbsent(n, k -> climbStairs(k-1) + climbStairs(k-2));` | The lambda only fires on cache miss AND its return value is automatically stored. Read and write are inseparable. |

If you must use the explicit `if-then-compute-put-return` form, treat **steps 2-3-4 as a single atomic block** — never write step 2 without step 3 immediately below it. The bug rate drops to zero once you adopt this physical discipline at the keyboard.

Why this bug is invisible: the compiler can't catch it because the code is syntactically valid. Small inputs (n ≤ 30 or so) finish in milliseconds even without real memoization, so unit tests pass. Only at n = 40+ does the exponential blowup show. **Always verify memoization by checking if `cache.put` (or its equivalent) appears on the path from "compute" to "return."**

### Level 2 — Bottom-up (tabulation)

```java
public int climbStairs(int n) {
    if (n <= 2) return n;
    int[] dp = new int[n + 1];
    dp[1] = 1;
    dp[2] = 2;
    for (int i = 3; i <= n; i++) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }
    return dp[n];
}
```

Time: O(n). Space: O(n). No recursion overhead.

### Level 3 — Space-optimized

```java
public int climbStairs(int n) {
    if (n <= 2) return n;
    int prev2 = 1;  // f(1)
    int prev1 = 2;  // f(2)
    for (int i = 3; i <= n; i++) {
        int curr = prev1 + prev2;
        prev2 = prev1;
        prev1 = curr;
    }
    return prev1;
}
```

Time: O(n). Space: **O(1)**. This is the answer you'd write in an interview after walking the optimization arc.

## Edge cases & pitfalls

| Case                               | Why it matters                        | Handled?                               |
| ---------------------------------- | ------------------------------------- | -------------------------------------- |
| `n = 1`                            | Base case below the recurrence        | Yes — `if (n <= 2) return n`           |
| `n = 2`                            | Other base case                       | Yes — same guard                       |
| `n = 45`                           | Largest valid; tests int bounds       | Yes — Fibonacci(45) < 2³¹              |
| Order of `prev1` / `prev2` updates | Reversing them gives the wrong answer | Yes — explicit `curr` temp prevents it |
| Off-by-one in the loop             | `i = 3` start, `i <= n` end           | Yes — careful loop bounds              |

## Pattern recognition summary

The canonical **1D DP** template. Whenever:

- **"Count distinct ways" / "in how many sequences"** — counting genre
- The answer at state `n` depends on a **constant number of prior states** (`n-1`, `n-2`, or a small fixed set)
- States can be enumerated linearly (1, 2, 3, …)

→ Reach for 1D DP. The optimization arc (recursion → memoize → tabulate → space-optimize) is the signature progression. **At minimum, write the bottom-up tabulation in an interview**; mention space optimization if time allows.

## What this problem really teaches

1D DP IS the discovery of the recurrence. Once you identify "what does the answer at n depend on?" — and the answer is "a constant number of prior states" — DP is the structural answer. The implementation arc (recursion → memoization → tabulation → constant-space) is mechanical.

The deeper meta-lesson: **the question to ask in any DP problem is "what was the LAST step / move / decision before reaching this state?"** That single question unlocks most counting DP problems. For Climbing Stairs: the last step was either +1 or +2. For House Robber: rob this house or skip it. For Coin Change: each available denomination.

## Related problems

- **LC 509** Fibonacci Number — same recurrence, no application framing
- **LC 198** House Robber — `f(n) = max(f(n-1), f(n-2) + nums[n])` (slight twist)
- **LC 213** House Robber II — circular variant
- **LC 746** Min Cost Climbing Stairs — cost-weighted version
- **LC 322** Coin Change — multi-recurrence (sum over each denomination)
- **LC 91** Decode Ways — Climbing Stairs but with conditional transitions

## Action item

When you see **"in how many distinct ways"** + a counting target, your hand should reflexively reach for **DP, and ask: what was the LAST step into this state?** That single question reveals the recurrence. From the recurrence, the optimization arc is mechanical.

---

# Cross-genre reflection — three worked examples compared

| Dimension                           | LC 121 (Optimization)                | LC 20 (Validation)                                            | LC 70 (Counting / DP)                                     |
| ----------------------------------- | ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------- |
| **Genre**                           | Optimization (max profit)            | Validation (boolean)                                          | Counting (number of ways)                                 |
| **Input shape**                     | array → number                       | string → boolean                                              | integer → integer                                         |
| **Output bounded by**               | profit ≤ 10⁴                         | true / false                                                  | int max (calibrated)                                      |
| **Brute force shape**               | O(n²) nested loops                   | O(n²) repeated collapse                                       | O(2ⁿ) **naive recursion**                                 |
| **Optimal complexity**              | O(n) running min                     | O(n) stack                                                    | O(n) DP, O(1) space                                       |
| **Key insight**                     | Inner loop → running aggregate       | Counting fails; LIFO needed                                   | Recurrence: answer at n depends on n−1 and n−2            |
| **Discriminator example**           | `[7,6,4,3,1] → 0` (refutes max−min)  | `"([)]"` (refutes counting)                                   | `n=3 → 3` reveals 3 = 2 + 1 (Fibonacci)                   |
| **Data structure**                  | Two scalars                          | Stack                                                         | Two scalars (after optimization)                          |
| **Phase that surfaced the insight** | Phase 3 (tracing example 2)          | Phase 1 (the phrase "most-recent open must match next close") | Phase 3 (looking for a recurrence in the answer sequence) |
| **Key Phase 5 signal**              | "max diff between two indices i < j" | "match brackets in correct order"                             | "in how many distinct ways"                               |

The template held up for all three genres. The two tables doing the most work are:

1. **The Phase 1 phrase pattern table** — translates English into algorithmic moves
2. **The Phase 5 category signal table** — translates moves into known patterns

When you encounter a new genre (graph, two-pointer, monotonic stack, segment tree, etc.), extend those two tables before solving. They're the entry points that route different genres to different patterns. **The template's growth surface is those two tables; the rest of the framework is invariant.**

The other invariant is the discipline: scan → deep-read → decode → mine → conclude → classify → clarify → narrate. The genre changes; the order doesn't. Three problems in, the patterns start to chunk; thirty problems in, Phase 0–5 collapses to ~3 minutes; and the difference between weak and strong analysis becomes invisible because it's been internalized.

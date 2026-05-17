# LC 20 — Valid Parentheses · Solution Review

> Per-problem learning artifact. Structure intentionally repeated across all problem reviews so you build muscle memory: read the same sections in the same order every time.

## Table of contents

- [LC 20 — Valid Parentheses · Solution Review](#lc-20--valid-parentheses--solution-review)
  - [Table of contents](#table-of-contents)
  - [1. Problem](#1-problem)
  - [2. Concepts you need to know](#2-concepts-you-need-to-know)
    - [2.1 Data structures](#21-data-structures)
    - [2.2 Algorithms / patterns](#22-algorithms--patterns)
    - [2.3 Java-specific concepts](#23-java-specific-concepts)
    - [2.4 What this problem really teaches](#24-what-this-problem-really-teaches)
  - [3. Pseudo code — brute force](#3-pseudo-code--brute-force)
    - [Why it works](#why-it-works)
    - [Why it's bad](#why-its-bad)
    - [What it gives you](#what-it-gives-you)
  - [4. Pseudo code — optimized](#4-pseudo-code--optimized)
    - [Why it works](#why-it-works-1)
    - [Cost](#cost)
    - [Discriminator example](#discriminator-example)
  - [5. Your submission](#5-your-submission)
  - [6. Code review — what's good, what's wrong](#6-code-review--whats-good-whats-wrong)
    - [What's good](#whats-good)
    - [Real issues, in order of severity](#real-issues-in-order-of-severity)
      - [Issue 1 — ⚠️ The `!=` comparison is correct _by accident_](#issue-1--️-the--comparison-is-correct-by-accident)
      - [Issue 2 — `validCharacters` is a misleading name](#issue-2--validcharacters-is-a-misleading-name)
      - [Issue 3 — `openBracket` boolean is dead weight](#issue-3--openbracket-boolean-is-dead-weight)
      - [Issue 4 — Comment typos and imprecise wording](#issue-4--comment-typos-and-imprecise-wording)
      - [Issue 5 — Inconsistent brace style](#issue-5--inconsistent-brace-style)
  - [7. Polished version](#7-polished-version)
  - [8. Edge cases checklist](#8-edge-cases-checklist)
  - [9. Complexity analysis](#9-complexity-analysis)
  - [10. What to say in an interview](#10-what-to-say-in-an-interview)
  - [11. Related problems for spaced repetition](#11-related-problems-for-spaced-repetition)
  - [12. Verdict](#12-verdict)

---

## 1. Problem

**LeetCode 20 — Valid Parentheses.** Given a string `s` containing only `()[]{}`, return `true` iff every open bracket is closed by the **same type** of bracket, in the **correct order**, and every close bracket has a matching open before it.

- `1 ≤ s.length ≤ 10⁴`
- Closed alphabet of 6 characters
- Output: boolean

---

## 2. Concepts you need to know

This is the prerequisite knowledge map. If any cell is fuzzy, that's a study target before this problem feels easy.

### 2.1 Data structures

| Concept                     | Why this problem needs it                                                               | Where to read                 |
| --------------------------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| **Stack / LIFO discipline** | Most-recent-open must match next-close → "last in, first out" is the literal definition | Any DS textbook ch. on stacks |
| **Hash map (`Map<K, V>`)**  | O(1) lookup from close-char → matching open-char                                        | Java collections doc          |
| **String as `char[]`**      | We iterate per-character; treat the input as an indexable sequence                      | `String.toCharArray()`        |

### 2.2 Algorithms / patterns

| Concept                            | Why this problem needs it                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single-pass scan**               | Each character is processed exactly once — no nested re-scanning                                                                            |
| **Validation / boolean predicate** | We're not optimizing or counting; we're checking a property                                                                                 |
| **Early exit on failure**          | The first violation is enough — return false immediately, don't keep scanning                                                               |
| **LIFO matching pattern**          | The discriminator that distinguishes this from a counting problem. `"([)]"` has balanced counts but invalid order — only a stack catches it |

### 2.3 Java-specific concepts

These are the language-level traps and idioms a senior reviewer expects you to know.

| Concept                              | Detail                                                                                                                           | Trap                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ArrayDeque` vs `Stack`**          | `Stack` extends `Vector` and is synchronized on every op; `ArrayDeque` is the modern LIFO recommendation, faster, unsynchronized | Writing `Stack<Character>` is a code-smell signal in 2026 Java                                                                                      |
| **`Deque` interface**                | `push(e)` / `pop()` / `peek()` — same LIFO API as `Stack`                                                                        | `Deque` is also a queue (`offer`/`poll`); make sure you call the LIFO methods                                                                       |
| **`Map.of(...)`**                    | Java 9+ static factory for small immutable maps. Up to 10 entries; throws on duplicate keys                                      | Mutable map needed → use `new HashMap<>()`                                                                                                          |
| **Autoboxing & `Character` cache**   | Java caches `Character` instances for code points 0–127. `Character.valueOf('x') == Character.valueOf('x')` is `true` for ASCII  | `==` / `!=` on boxed `Character` is **reference comparison**. Outside the cache, two equal-valued `Character` objects are not `==`. Don't trust it. |
| **Explicit unboxing**                | `.charValue()` on a `Character` returns primitive `char`; primitives compare by value                                            | Defensive unbox makes intent obvious to a reviewer                                                                                                  |
| **Enhanced for-loop on char arrays** | `for (char c : s.toCharArray())` — `c` is primitive `char`, no boxing in the loop variable                                       | If you change to `Character[]` you start boxing on every iteration                                                                                  |

### 2.4 What this problem really teaches

**LIFO order is a fundamentally different constraint than count.** Two strings can have the same multiset of brackets and different validity. Counting collapses order; stacks preserve it. That's the lesson — not "use a stack for brackets," but "recognize _order-sensitive matching_."

This pattern shows up everywhere brackets don't:

- Function call resolution (the call stack)
- HTML / XML tag validation
- Undo history
- Expression evaluation (Shunting yard, postfix)
- Monotonic stack problems (Next Greater Element, Largest Rectangle)

---

## 3. Pseudo code — brute force

**Idea.** Repeatedly remove the smallest matched pairs (`()`, `[]`, `{}`). If the string collapses to empty, it was valid; otherwise invalid.

```
function isValid_BruteForce(s):
    repeat:
        prev = s
        s = s.replace("()", "")
        s = s.replace("[]", "")
        s = s.replace("{}", "")
        if s == prev:           # nothing collapsed this pass — stable
            break
    return s == ""
```

### Why it works

Every valid parenthesization, by definition, contains an innermost adjacent pair somewhere. Removing it leaves a still-valid (smaller) string. Iterating eventually empties the string. Conversely, if the string is invalid, some character will have nothing to match with and the process plateaus.

### Why it's bad

| Dimension  | Cost                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Time       | **O(n²)** worst case. Each pass is O(n) for `replace`. The number of passes is O(n) on adversarial input. |
| Space      | **O(n)** — `replace` allocates new strings each pass                                                      |
| At n = 10⁴ | ~10⁸ ops — slow but passes                                                                                |
| At n = 10⁶ | times out                                                                                                 |

### What it gives you

The brute force is the conceptual seed: "we keep collapsing the most-recent matched pair." That's a stack — implicit. Recognizing the implicit stack inside a brute force is the move that takes you from "I see brackets" to "I should use a stack."

---

## 4. Pseudo code — optimized

**Idea.** Walk the string once. Push opens on a stack. On a close, pop and verify the type matches; bail if it doesn't or if the stack is empty. At the end, the stack must be empty (any leftover opens are unclosed).

```
function isValid_Optimized(s):
    matchingOpen = { ')': '(',  ']': '[',  '}': '{' }
    stack = []                                     # LIFO (ArrayDeque in Java)

    for c in s:
        if c is an opening bracket:
            push c onto stack
        else:                                       # c is a closing bracket
            if stack is empty:
                return false                        # nothing to match
            top = pop from stack
            if top != matchingOpen[c]:
                return false                        # type mismatch

    return stack is empty                           # any leftover opens?
```

### Why it works

The stack at any point holds the chain of _unmatched_ opens, in nesting order. When a close arrives, it can only legally match the most-recent unmatched open — that's the top of the stack. Anything else is illegal, and the LIFO property guarantees we always check against the right candidate.

### Cost

| Dimension | Cost                                                |
| --------- | --------------------------------------------------- |
| Time      | **O(n)** — each char pushed and popped at most once |
| Space     | **O(n)** — worst case all opens (`"(((((..."`)      |

### Discriminator example

```
"([)]"
```

A naive count-each-bracket-type returns _true_ (1 of each type, counts balanced). The stack catches it: at `)`, the top is `[`, not `(`. **This is the input that proves a stack is required, not a counter.**

---

## 5. Your submission

```java
class Solution {
    public boolean isValid(String s) {
        Map<Character, Character> validCharacters = Map.of(')', '(', ']', '[', '}', '{');
        // Deque Over Stack to ruleOut Synchonization
        Deque<Character> charStack = new ArrayDeque<>();
        for (char c : s.toCharArray()) {
            boolean openBracket = (c == '(' || c == '[' || c == '{');
            if (openBracket) {
                charStack.push(c);
            } else {
                if (charStack.isEmpty() || charStack.pop() != validCharacters.get(c))
                    return false;
            }
        }
        return charStack.isEmpty();
    }
}
```

**Verdict: correct, accepts on LeetCode. Time O(n), Space O(n).** Reads cleanly. A few real issues worth knowing.

---

## 6. Code review — what's good, what's wrong

### What's good

1. **`ArrayDeque` over `Stack`** — exactly right, and you commented why. Nine out of ten candidates write `Stack<Character>` reflexively; you didn't.
2. **`Map.of(')', '(', …)`** — correct direction (close → open). Mapping open → close would force you to pop and _then_ look up which close to expect, which is one indirection too many.
3. **Short-circuit `isEmpty()` before `pop()`** — protects against `NoSuchElementException` on inputs like `")"`. Easy to forget; you got it.
4. **Final `charStack.isEmpty()`** — catches the `"("` case (unclosed open). Many people end the loop with `return true` and lose at least one test.

### Real issues, in order of severity

#### Issue 1 — ⚠️ The `!=` comparison is correct _by accident_

```java
charStack.pop() != validCharacters.get(c)
```

Both sides are `Character` (boxed, not primitive `char`). `!=` on objects compares **references**, not values.

This works _only_ because Java caches `Character` for ASCII (0–127), and `(`, `[`, `{` are all in that range. Both sides happen to point to the same cached object, so reference equality coincides with value equality.

Change the alphabet to characters outside the cache and this silently breaks.

**Fix — explicit unbox:**

```java
char top = charStack.pop();
Character expected = validCharacters.get(c);
if (expected == null || top != expected) return false;  // unboxes 'expected' on `!=`
```

The unboxing on `!=` here is safe because the _left_ side is primitive `char`, which forces the right side to unbox. **Rule: don't use `==` / `!=` on boxed types directly. Either unbox first or use `.equals()`.**

#### Issue 2 — `validCharacters` is a misleading name

The map doesn't tell you what's "valid." It's a lookup from a close-bracket to its matching open-bracket. Name it for what it does:

```java
Map<Character, Character> matchingOpen = Map.of(')', '(', ']', '[', '}', '{');
```

`matchingOpen.get(c)` reads as English: "the matching open for c." `validCharacters.get(c)` is a riddle.

#### Issue 3 — `openBracket` boolean is dead weight

```java
boolean openBracket = (c == '(' || c == '[' || c == '{');
if (openBracket) { ... } else { ... }
```

Set, read once, never used again. Inline it. Naming a one-shot boolean is justifiable when the condition is _complex_ (3+ clauses with mixed `&&`/`||`); here, the condition is short enough that the name doesn't earn its line.

#### Issue 4 — Comment typos and imprecise wording

```java
// Deque Over Stack to ruleOut Synchonization
```

Two typos: `ruleOut` → `rule out`, `Synchonization` → `Synchronization`. Also the phrasing is wrong — `Stack` _is_ synchronized; we're avoiding the synchronization overhead, not "ruling out" the possibility.

**Better:**

```java
// ArrayDeque, not Stack: Stack extends Vector and synchronizes on every op.
```

In an interview, the wrong word costs you. The verbal version of this comment — _"I used `ArrayDeque` to avoid the synchronization overhead from the legacy Vector-based `Stack`"_ — is a strong signal.

#### Issue 5 — Inconsistent brace style

```java
if (openBracket) {
    charStack.push(c);
} else {
    if (charStack.isEmpty() || charStack.pop() != validCharacters.get(c))
        return false;          // no braces — one-liner
}
```

The outer `if/else` uses braces; the inner one-liner doesn't. Pick one and stay consistent. Most modern Java style guides (Google, Sun, Oracle) require braces always. Bonus: collapse `else { if (...) }` to `else if (...)`.

---

## 7. Polished version

```java
class Solution {
    public boolean isValid(String s) {
        // close → matching open. ArrayDeque, not Stack: Stack extends Vector
        // and synchronizes on every op — pure overhead in single-threaded code.
        Map<Character, Character> matchingOpen = Map.of(')', '(', ']', '[', '}', '{');
        Deque<Character> stack = new ArrayDeque<>();

        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                stack.push(c);
            } else if (stack.isEmpty() || stack.pop() != matchingOpen.get(c).charValue()) {
                return false;
            }
        }
        return stack.isEmpty();
    }
}
```

Five lines of meat. Same algorithm. No dead variable, no boxed-equality footgun, no typo. `.charValue()` makes the unbox intent explicit.

---

## 8. Edge cases checklist

| Case                             | Why it matters                                                                                                          | Handled in polished version?                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `"()"`                           | Single matched pair — sanity                                                                                            | ✅                                                                  |
| `"()[]{}"`                       | Multiple sequential — sanity                                                                                            | ✅                                                                  |
| `"([)]"`                         | Interleaved — counting fails, stack succeeds                                                                            | ✅ — top mismatch on `)`                                            |
| `"("`                            | Single open — stack non-empty at end                                                                                    | ✅ — final `isEmpty()`                                              |
| `")"`                            | Single close — stack empty when close arrives                                                                           | ✅ — short-circuit `isEmpty()`                                      |
| `"((("`                          | All opens — stack non-empty                                                                                             | ✅                                                                  |
| `")))"`                          | All closes — first iteration fails                                                                                      | ✅                                                                  |
| `s.length() == 1`                | Either an unclosed open or unmatched close                                                                              | ✅ — both branches handle it                                        |
| Order of `isEmpty()` and `pop()` | Reverse order throws `NoSuchElementException`                                                                           | ✅ — short-circuit `\|\|` runs `isEmpty()` first                    |
| Non-bracket char                 | Constraint says only brackets, so unreachable — but `matchingOpen.get('a')` returns null and we'd NPE on `.charValue()` | Defensible given problem constraint; in production add a null check |

---

## 9. Complexity analysis

|           | Brute force                                                    | Optimized                                |
| --------- | -------------------------------------------------------------- | ---------------------------------------- |
| **Time**  | O(n²)                                                          | O(n)                                     |
| **Space** | O(n)                                                           | O(n)                                     |
| **Why**   | Each pass scans n chars; up to n passes for adversarial inputs | Each char pushed and popped at most once |

**Why O(n) space, not O(1)?** Worst case all opens (`"((((..."`) — every char ends up on the stack. There's no way to do this in less space because the verifier must remember the entire chain of unclosed opens to know what each future close should match.

**Aside: amortized analysis.** Even though `pop` is O(1) and we may do up to n pushes and n pops, the total work across the loop is bounded by 2n stack ops, each O(1) — so the loop is O(n) overall. This is why "single-pass with stack" is a strong default for _order-sensitive validation_.

---

## 10. What to say in an interview

> "Stack of opens. `ArrayDeque` because `Stack` extends `Vector` and is synchronized — overhead I don't need.
>
> Map close→open so I can look up what each close needs. Walk the string: open → push; close → check the stack isn't empty, pop, compare types. End with `stack.isEmpty()` to catch unclosed opens.
>
> `Map.of` here gives me a small immutable map — Java 9 idiom. I'm being careful with `Character` autoboxing — `.charValue()` makes the equality check primitive so I don't accidentally do reference comparison.
>
> O(n) time, each char pushed and popped at most once. O(n) space, worst case all opens.
>
> Edge cases: single open returns false at the final empty-check; single close returns false at the empty-stack check; `'([)]'` returns false because the top mismatch on `)` — that's the discriminator that proves you need a stack, not just a counter."

This script is ~45 seconds. Hit _(a)_ the data-structure choice with reasoning, _(b)_ the Java specificity (Map.of, autoboxing), _(c)_ complexity, _(d)_ a discriminator edge case. Most candidates skip (b) and (d).

---

## 11. Related problems for spaced repetition

Re-encounter these in 1d / 3d / 7d / 14d intervals to consolidate the pattern.

| Problem                        | LC #      | Pattern                                                                         |
| ------------------------------ | --------- | ------------------------------------------------------------------------------- |
| Min Stack                      | 155       | Augment a stack with O(1) min query                                             |
| Next Greater Element I / II    | 496 / 503 | **Monotonic stack**                                                             |
| Largest Rectangle in Histogram | 84        | Monotonic stack, harder                                                         |
| Decode String                  | 394       | Stack of contexts                                                               |
| Basic Calculator               | 224       | Stack for operator precedence                                                   |
| Generate Parentheses           | 22        | Same domain but generation, not validation; uses recursion + invariant tracking |

Patterns to internalize across all of them:

- **Stack of opens / contexts** — match-something-most-recent
- **Monotonic stack** — track running extrema
- **Stack as recursion-without-recursion** — Decode String, Basic Calculator

---

## 12. Verdict

| Aspect                | Rating                                   |
| --------------------- | ---------------------------------------- |
| Correctness           | ✅ Passes all LC tests                   |
| Time / Space          | ✅ Optimal                               |
| Data structure choice | ✅ Right call (`ArrayDeque`)             |
| Code quality          | ⚠️ Boxed-equality, naming, dead variable |
| Interview-readiness   | ⚠️ Polish needed (the items above)       |

**Net:** solid solution that would pass the bar at most companies. A senior interviewer would catch the boxed `!=` and ask _"are you sure that's safe?"_ — be ready for that, and have the `Character` cache explanation in your back pocket.

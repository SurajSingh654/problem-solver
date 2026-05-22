# Java Deep Learning — Template

> **How to use this doc:** when learning a new Java concept (a language feature, a JVM mechanism, a stdlib class, a concurrency primitive, a framework internal), run this template top-to-bottom. Each section has a *purpose*, a *discipline rule*, and *exit criteria*. The worked example at the bottom shows what a fully-filled template looks like for **HashMap** — copy that depth and rigour for every concept you study. The point is not to memorise Java; it's to build a mental model that survives forgetting the syntax.

---

## Why this template exists

Java is unusually punishing for learners who only learn the surface. The language and its runtime are layered: `String s = "x"` involves the language, the bytecode, the constant pool, the JIT, the garbage collector, the memory model, and the standard library — each layer has its own gotchas, and the bug you ship usually lives at a layer you weren't paying attention to.

Most engineers stop at *layer 1* (syntax and library use). Their code works in tests and breaks in production. The senior engineers who debug those bugs know what's happening at *layer 4–5* (memory model, JIT, GC). This template forces you down the stack.

There are **four literacies** that Java mastery requires. Most learners pick one or two and skip the rest.

| Literacy | What good looks like |
|---|---|
| **Specification** | You can read the JLS or JVM spec, find the relevant chapter, and quote the rule that decides the edge case in question. |
| **Bytecode / JVM** | You can `javap -c` a class file, read what it compiles to, and explain why two source-level expressions produce different bytecode. |
| **Idiom** | You write the canonical Java way — not the C++-port-to-Java way and not the Kotlin-port-to-Java way. You know which standard library construct to reach for. |
| **Production reality** | You know the bugs that ship, the classes deprecated for reasons (`Vector`, `Date`, `SimpleDateFormat`, `Hashtable`), and the modern replacements. |

Skipping the spec literacy means you'll lose to subtle questions ("does `String.equals` use `compareTo`? does it short-circuit on length?"). Skipping bytecode literacy means you'll write code that looks fine and surprises you in a profile. Skipping idiom literacy means you'll be the person who writes `for (int i=0; i<list.size(); i++)` instead of an enhanced-for or stream. Skipping production literacy means you'll confidently ship code that's been a known anti-pattern for fifteen years.

This template is structured so that skipping a section leaves a hole in one of the four. You will find the holes when you ship a real bug.

### The cognitive science behind the structure

| Principle | Source | Where it appears |
|---|---|---|
| **Worked example effect** — explicit step-throughs reduce extraneous load | Sweller, 1988 | §6 Bytecode walk-through, §7 Worked usage example |
| **Productive failure** — try the wrong way first to lock in the right way | Kapur, 2008 | §3 The naive Java way, §11 Anti-patterns |
| **Self-explanation effect** — generating "why" beats reading | Chi et al., 1989 | §4 Why this exists, §10 Memory model implications |
| **Variation theory** — see the same concept across many surfaces | Marton, 2015 | §13 Across Java versions, §14 Compared to other languages |
| **Dual coding** — text + diagrams doubles retention | Paivio, 1991 | §5 Mental model is mandatory |
| **Concrete to abstract** | Bruner, 1966 | §6 Bytecode (concrete) → §10 Memory model (abstract) |
| **Spaced retrieval** | Bjork & Bjork, 1992 | §17 Self-test, SM-2 reviews |
| **Elaborative interrogation** — answer "why does this work like this?" | Pressley et al., 1987 | §3, §4, §10, §13 |
| **Bloom's taxonomy** | Bloom, 1956 | Section progression: Remember → Understand → Apply → Analyze → Evaluate → Create |

### What "deep" means for Java specifically

Three layers of understanding for any Java concept:

1. **The visible layer** — what the syntax looks like, what the API does, what type signatures are exposed.
2. **The bytecode / runtime layer** — what `javac` produced, what the JVM executes, where memory lives.
3. **The specification layer** — what the JLS or JVM spec actually requires, including the corner cases compilers and JVMs disagree on, the things "happen to work" today but aren't guaranteed.

Most Java tutorials cover layer 1. Most Java seniors operate at layers 2 and 3. The template forces all three.

---

## Adapting the template to concept type

Not every section is equally heavy for every Java concept. Lean into the right ones — but write something in every section.

| Concept type | Heaviest sections | Lighter sections |
|---|---|---|
| **Language feature** (lambdas, generics, records, sealed types, pattern matching) | §3 Why exists, §6 Bytecode, §13 Across versions, §14 Vs other languages | §9 Concurrency (often n/a) |
| **Standard library class** (HashMap, ArrayList, ConcurrentHashMap, CompletableFuture, Optional) | §5 Mental model, §8 Performance, §11 Anti-patterns, §12 Production usage | §6 Bytecode (most weight is in the JDK source, not the calling bytecode) |
| **Concurrency primitive** (`volatile`, `synchronized`, `AtomicInteger`, `ReentrantLock`, `Semaphore`) | §10 Memory model, §9 Thread safety, §11 Anti-patterns, §15 Counter-examples | §6 Bytecode (some — but the spec dominates) |
| **JVM internals** (classloading, GC, JIT, escape analysis, intrinsics) | §6 Bytecode, §10 Memory model, §8 Performance, §13 Across JVMs | §11 Anti-patterns (often n/a — these are layers below the user) |
| **Framework concept** (Spring DI lifecycle, Hibernate session, JPA second-level cache) | §5 Mental model, §11 Anti-patterns, §12 Production usage | §6 Bytecode (often hidden by AOP / proxies — note this explicitly) |
| **Idiom / pattern** (Builder, try-with-resources, Optional usage, Stream collector) | §3 Why exists, §11 Anti-patterns, §14 Vs other languages | §10 Memory model |

The template stays the same; the *weight* shifts. Don't skip sections — write less, but write something honest.

---

## Anti-patterns the AI must avoid when filling this template

If you are an AI generating notes from this template:

1. **No hand-waving on the JVM.** "Strings are interned" is not a section. Show what `javap -c` outputs for `String s = "x";` versus `String s = new String("x");`, and explain the constant pool, the `ldc` instruction, and where the actual `char[]` lives.
2. **No invented bytecode.** If you show `javap` output, it must be plausibly real. If you don't know, say so — don't fabricate `invokespecial #42` opcodes.
3. **No identical examples to other tutorials.** Add at least one *new* observation: a non-obvious bug story, a connection between two unrelated parts of the JVM, a comparison nobody draws.
4. **No omitted concurrency.** For any class held in shared state, you must explicitly state thread-safety guarantees and reference the JLS happens-before edges that establish them.
5. **No "modern Java says..." without version numbers.** Every claim about modern Java cites the JEP that introduced the change and the JDK version (e.g., "JEP 286, var keyword, JDK 10").
6. **No copying javadoc.** Paraphrasing the JDK javadoc adds zero value. The template's job is to add what javadoc *doesn't* say: the bytecode, the bugs, the comparison, the production failure stories.
7. **Show your work in code AND output.** Every code sample includes the expected output (or compiler error, or runtime exception). "Try this" without the result is not enough.
8. **No bullet-point soup for explanations.** Bullets are fine for lists; not for reasoning. If a section is more than 60% bullets, rewrite as prose.

---

# The 18-Section Framework

---

## Quick reference card (always fill — top of every note, scannable)

A scannable summary you re-read in 30 seconds. Forces you to compress before expanding.

```
- Family: <language feature | stdlib class | concurrency primitive | JVM internal | framework concept | idiom>
- One-line definition: <≤ 25 words>
- Introduced in: <JDK version, JEP number if applicable>
- Replaces / supersedes: <legacy alternative, if any>
- Thread-safe: <yes / no / conditional, with one-sentence reason>
- Most common bug: <the production-shipped failure mode>
- Performance note: <best-case big-O, worst-case big-O, JIT-friendliness>
- Idiom signal: <the one-sentence "use this when" recognition cue>
- Canonical reference: <JLS §X.Y, JVM spec §X.Y, or *Effective Java* item N>
```

### Discipline rule

**Fill the Quick Reference FIRST and LAST.** First pass = your initial guess (commits you). Last pass = the version you trust after writing the full note. Drift between the two reveals what you actually learned.

---

## 1. The 30-second pitch

The concept in **plain English**, twice: once for an engineer who knows another OO language but not Java, once for a non-technical reader. Two sentences each.

**Two-audience example for `Optional<T>`:**

- *For an engineer:* "Optional is a wrapper that says 'this value might or might not be there.' It exists so the type system can warn callers about nulls instead of letting them blow up at runtime."
- *For a non-engineer:* "It's a box that's labelled 'might be empty.' Whoever opens the box has to check the label before reaching in, so they can't get surprised."

### Discipline rule

If you can't pass *both* tests in two sentences each, you don't have the pitch yet. Each pitch must end with the *purpose* sentence: "This is useful when X."

### Exit criterion

Two short paragraphs maximum. Both end with the explicit purpose sentence.

---

## 2. The motivating problem

The concrete problem this Java concept exists to solve, with numbers and code shape. Not "for null safety" — "before Optional, every Java method that *could* return null forced every caller to either remember to null-check or trust the upstream method's documentation, and the typical Java codebase had thousands of `if (foo != null)` checks scattered throughout business logic, with NPEs dominating production exception logs."

### Discipline rule

Show *the original problem in code*. The pre-Optional NullPointerException-trap. The pre-record getter/equals/hashCode boilerplate. The pre-`var` redundant type declaration. Make the cost of *not* having this concept tangible.

### Exit criterion

A reader who's never used the concept understands what life was like before it existed and what it costs to do without it today.

---

## 3. The naive Java way (and why it fails)

The version a non-Java engineer or a less-experienced Java engineer would write. Then explain *the specific Java reason* it's wrong.

### Why this section exists — productive failure

For Java specifically, learners coming from C++, Python, or Kotlin write idiomatically wrong Java. Showing the wrong way explicitly — and naming it — locks in why the right way exists.

### Discipline rule

Write the naive code (5–15 lines). Compile it mentally — it should compile. Then write the *specific* failure mode: which JLS rule it violates, which production bug it ships, what idiomatic Java says instead.

### Examples of failures to surface

- Comparing strings with `==` when the operand isn't from the constant pool. JLS §15.21.3 — `==` on reference types is identity, not equality.
- Using `Date` and `SimpleDateFormat` for new code in 2026. SimpleDateFormat is non-thread-safe and shared-static use ships data corruption; java.time is the answer since JDK 8.
- Catching `Exception` and swallowing — the production-on-fire pattern.
- Iterating a `Collections.synchronizedList` without external synchronization — the iterator isn't thread-safe even though the list operations are.

### Exit criterion

You can argue with someone proposing the naive approach and explain *exactly* which spec rule or runtime mechanic makes it wrong.

---

## 4. The key insight (the "why" of the design)

Java's design choices have reasons. Articulate the *one observation* that motivates this concept's existence.

### Examples

- **Generics:** "The compiler can erase type parameters at runtime because all reference types share an object header layout, so the JVM never sees the parameter — but the compiler still type-checks before erasure, giving compile-time safety with zero runtime cost." (Decision: erasure over reification.)
- **Lambda → invokedynamic:** "The JVM can defer the lambda's class generation to runtime via `invokedynamic`, allowing the JIT to inline most lambdas down to direct calls and avoid creating a class file per lambda site at compile time."
- **Records:** "Records exist because the compiler can derive equals/hashCode/toString/accessors mechanically from the canonical constructor signature, eliminating the boilerplate that made Java's value-class story humiliating compared to Kotlin/Scala."
- **`volatile`:** "Volatile establishes a happens-before edge between writes and subsequent reads on the same field, providing visibility across threads without the mutual-exclusion cost of synchronization."

### Discipline rule

If your insight runs more than two sentences, you don't have the insight yet — you have a paraphrase. Compress until one sentence captures the *idea*; everything else is mechanics for §6 and §10.

### Exit criterion

You can defend the design choice against the obvious "why didn't they do X instead?" challenge, citing the trade-off.

---

## 5. Mental model & visualization

The picture in your head. **Mandatory diagram or table.** Words alone aren't enough.

### What good looks like for Java concepts

- **HashMap:** an ASCII grid of buckets with chained entries; show the load factor and the treeification threshold (TREEIFY_THRESHOLD = 8) by annotating one bucket.
- **ClassLoader hierarchy:** the parent-delegation chain drawn as a tree (Bootstrap → Platform → System → user) with arrows showing lookup direction.
- **Memory layout of a `String`:** object header (12 bytes on 64-bit) + `byte[] value` reference + `int hash` field, with the actual `char[]` data on a separate heap region.
- **JVM memory regions:** stack frames, heap (young/survivor/old), Metaspace, PC register, native stack — drawn as adjacent boxes with thread-locality annotations.
- **`synchronized` block:** the monitor enter/exit pair around the critical section, with the implicit happens-before edges drawn as arrows from the unlock to the next lock acquisition.

### Discipline rule

Inline at least one ASCII diagram or table. "Imagine the JVM..." is not a visualization. If the concept involves memory layout, draw the layout.

### Exit criterion

A reader could understand the concept's *shape* from the diagram alone, before reading §6 or §7.

---

## 6. Bytecode / runtime view

What does `javac` produce? What does the JVM execute? Show the `javap -c` output (or its plausible equivalent) and explain.

### Why this section is non-negotiable

Half of the Java surprises in production come from the gap between source-level intuition and bytecode reality. `String s = a + b;` doesn't just call `String.concat`; pre-JDK 9 it compiled to `StringBuilder` allocation; post-JDK 9 it compiles to `invokedynamic` against a bootstrapped MethodHandle (JEP 280, indified string concatenation). Knowing the bytecode tells you whether your concat-in-a-loop is safe.

### What to include

- The bytecode for a representative example (5–15 lines of source → annotated bytecode).
- The JVM-level resource lifecycle: where does the relevant data live (stack, heap, Metaspace)? When is it allocated? When is it eligible for GC?
- For language features that compile to specific bytecode patterns (lambdas → invokedynamic + LambdaMetafactory; switch → tableswitch/lookupswitch; try-with-resources → finally + addSuppressed): show that pattern.

### Discipline rule

Real bytecode, not invented. If you can't recall, run `javap -c -p` mentally on a small example and verify your output matches what you'd expect from the JVM spec. Annotate non-obvious opcodes.

### Exit criterion

You can explain to a colleague how a specific source-level construct gets executed, going as far down as the JVM dispatch model (`invokestatic` vs `invokevirtual` vs `invokeinterface` vs `invokedynamic`).

---

## 7. Worked usage example

A real, complete code example using the concept correctly, with surrounding context. Not a snippet — a small program or class fragment that compiles and runs.

### Format

The code, the expected output (or exception), and a sentence-by-sentence walk-through of the non-obvious lines.

```java
// Demonstrates ConcurrentHashMap.compute — atomic read-modify-write.
ConcurrentHashMap<String, AtomicInteger> counts = new ConcurrentHashMap<>();

counts.compute("alpha", (k, v) -> {
    if (v == null) return new AtomicInteger(1);
    v.incrementAndGet();
    return v;
});
// counts == {alpha=1}
```

The lambda inside `compute` runs *atomically with respect to other operations on the same key* — this is the property that `synchronized(counts) { ... }` would also give but at a much higher cost. The `compute` method holds an internal bucket lock while running the lambda; this is documented in `ConcurrentHashMap`'s javadoc and visible in the JDK source. **Implication:** the lambda must not block on or call back into the same map, or you can deadlock.

### Discipline rule

Every line of your example must be defensible. If you used a method, you must know its thread-safety contract. If you used a generic, you must know what the erasure looks like.

### Exit criterion

The example runs as written. Output is as stated. Edge cases (nulls, exceptions in the lambda, concurrent modifications) are noted in the walk-through, not glossed.

---

## 8. Performance characteristics

What's fast, what's slow, and *why*. Not "constant time" — "amortised O(1) for `get` because of the hash function plus chained collision resolution; worst-case O(n) on adversarial keys; mitigated by treeification at chain length 8 in JDK 8+."

### What to include

| Metric | What to write |
|---|---|
| Big-O complexity | Best, average, worst, with the input shape that achieves each |
| Allocation cost | Does this method allocate? Where? (heap escape, stack escape via escape analysis, off-heap?) |
| GC pressure | Does using this concept produce short-lived garbage? Long-lived? Effects on Eden / Survivor / Old? |
| JIT-friendliness | Is this construct inlinable? Does it have a megamorphic call site that the JIT bails on? |
| Cache behavior | Memory locality of the data structure |
| Lock contention | If concurrency-relevant, what's the contention profile? |

### Discipline rule

For every claim, name *what would be slower if you used the wrong alternative*. "HashMap is faster than TreeMap for unsorted access" is the wrong shape; "HashMap.get is amortised O(1) versus TreeMap.get's O(log n) red-black-tree traversal — for n=10⁶ random-key access workloads I've seen 5-7× throughput differences in JMH benchmarks" is the right shape.

### Exit criterion

Asked "would I write this in a hot loop?", you can answer with a complexity, a JIT consideration, and a real-world data point.

---

## 9. Concurrency and thread safety

For *any* class or feature, state the concurrency contract explicitly. Most Java bugs in production are concurrency bugs; treating thread safety as an afterthought is the failure mode.

### Required answers

| Question | Required? |
|---|---|
| Is this thread-safe? | Yes / No / Conditional — always answer |
| If yes, by what mechanism? | `synchronized`, `volatile`, `final`, immutable, lock-free CAS, `Concurrent*` class, etc. |
| If conditional, what's the condition? | E.g., "safe if you only call it from one thread"; "safe if you never iterate without external sync" |
| What's the visibility guarantee across threads? | Happens-before edge — name the JLS §17.4 rule that establishes it |
| Is iteration safe under concurrent modification? | Fail-fast iterator? Weakly consistent iterator? Snapshot iterator? |

### Discipline rule

Answer in terms of the **Java Memory Model** (JLS §17.4). Specifically: which writes happen-before which reads, and *why*. "It's thread-safe because it uses `synchronized`" is half an answer; the full answer is "the implicit unlock action establishes a synchronizes-with edge to subsequent acquire actions on the same monitor, providing visibility of all writes within the block."

### Exit criterion

You can defend the concurrency contract against an adversarial reviewer asking "what if thread A does X and thread B does Y simultaneously?"

---

## 10. Memory model implications

Where data lives, when it's allocated, when it's collected. The JLS plus the GC perspective.

### What to include

- **Object layout:** for a class instance, what does the heap object look like? (Header, fields, padding.)
- **Lifetime:** how long does this typically live? Eligible for escape analysis (stack allocation)? Long-lived enough to reach Old gen?
- **Strong / weak references:** does this class participate in `WeakReference`, `SoftReference`, `PhantomReference`, or finalisation? (E.g., `WeakHashMap`'s entries.)
- **JLS §17 happens-before:** what edges are established by use of this concept?
- **Compiler/JIT reorderings:** what's the spec allow / disallow? (E.g., reads/writes of `volatile` are not reordered with subsequent volatile reads/writes; double-checked locking without volatile is a famous broken idiom because of allowed reorderings.)

### Discipline rule

For concurrent constructs, cite the *exact* JLS happens-before rule. For non-concurrent constructs, sketch the heap layout (object header + fields, with sizes when relevant).

### Exit criterion

You can explain to a colleague why a specific reordering of operations is or is not legal under the memory model.

---

## 11. Idioms and anti-patterns

The canonical Java way + the things people get wrong. Effective Java territory.

### Format — two parallel lists

**Idioms (the right way):**
- One-line statement of the pattern.
- A code snippet showing it.
- The reason it's idiomatic (cite Effective Java item if applicable).

**Anti-patterns (the wrong way):**
- One-line statement of the smell.
- A code snippet of the wrong code.
- The bug it produces or the canonical replacement.

### Discipline rule

Anti-patterns must be *real* code people write — not strawmen. Citing *Effective Java* items legitimises the rule. Don't paraphrase the book; quote the item number and write your own one-sentence summary.

### Exit criterion

You can review someone else's PR and call out idiom violations citing the rule, not just instinct.

---

## 12. Production usage — real systems

Where this concept actually lives in production. Be specific to the level of file or class name.

### Examples to inspire scope

- **`CompletableFuture`:** Spring WebFlux's reactive async return types; Netty's inbound handler pipeline; AWS SDK v2 async clients; the "future you await" pattern in millions of Java services.
- **`HashMap`:** Spring's `BeanFactory` registry uses it (with explicit synchronization); `System.getProperties()` returns one (technically `Properties extends Hashtable`); Tomcat's session attribute storage.
- **`synchronized`:** lock striping in `ConcurrentHashMap` 1.6's segment-based design; Tomcat's connection pool's free-list manipulation; the JDK's `Vector` (legacy and not recommended for new code).
- **Records:** Java's `Optional`-like return types in newer JDK APIs; many teams' DTOs since JDK 16.

### Discipline rule

Name a specific system. "Used in web frameworks" is not enough — *Spring*, *Spring WebFlux*, *the WebFilter chain*, *that's where this lives*. If you don't know one, search for one.

### Exit criterion

You can answer "where would I see this in real life?" with at least one specific named system and the role this concept plays in it.

---

## 13. Evolution across Java versions

Java's history matters because (a) you'll encounter old code in real codebases and (b) the modern way is sometimes wildly better than the old way.

### What to include

A timeline of how this concept changed from JDK 1.0 (or whenever it first appeared) to the latest LTS (JDK 21 / 25 in 2026).

### Format

| Version | What changed | JEP / source |
|---|---|---|
| JDK 1.0 | Initial introduction | — |
| JDK 1.5 | Generics added; type-safety upgrade | JLS §4.4–§4.6 |
| JDK 8 | Default methods; Stream API; lambdas | JEP 126, 109 |
| JDK 9 | `Map.of`, `List.of` factory methods (immutable) | JEP 269 |
| JDK 11 LTS | `var` for local-variable type inference (since 10) | JEP 286 |
| JDK 14 | Records preview | JEP 359 |
| JDK 16 | Records GA | JEP 395 |
| JDK 17 LTS | Sealed classes GA | JEP 409 |
| JDK 21 LTS | Pattern matching for switch GA, virtual threads GA | JEP 441, 444 |

### Discipline rule

Cite the JEP number and a one-line summary of what changed. If a deprecation happened, name it (`Hashtable`, `Stack`, `StringBuffer` for new code, `Date`/`Calendar`/`SimpleDateFormat`).

### Exit criterion

You can answer "should I use this in code targeting JDK X?" with the right version-aware answer.

---

## 14. Compared to other languages

Java doesn't exist in a vacuum. Compare to the languages you'll meet — Kotlin, Scala, C#, Python, Go, Rust — to crystallise what's *Java about Java*.

### What to include

A table comparing the concept across 2–4 other languages.

### Example for `Optional<T>`:

| Language | Equivalent | Differences |
|---|---|---|
| Kotlin | `T?` (nullable type) | Compiler-enforced; no wrapper class; smart-casts after null check; null safety baked into the type system |
| Scala | `Option[T]` (`Some` / `None`) | Same mental model; richer combinators; integrates with for-comprehensions |
| Rust | `Option<T>` (`Some` / `None`) | Stack-allocated, no GC; compiler enforces exhaustive matching; zero-cost abstractions |
| C# | `Nullable<T>` (`T?`) for value types; reference types use null + nullable annotations | Different layers for value vs reference; no functional combinators |
| Python | `Optional[T]` from `typing` (informational only) | Not enforced at runtime; equivalent to "this might be `None`" |

### Discipline rule

The differences must be real and named. Generic statements ("more functional") don't go here — the *what* and *why* of each difference does.

### Exit criterion

You can explain to a Kotlin engineer what's different about Java's version of the concept and why it's that way.

---

## 15. Common bugs and counter-examples

Bugs that ship. Inputs or usage patterns that break the concept. **First-class section, not an afterthought.**

### Format — the Mistake Museum

A table or list of real bugs. Each entry: the bug, the symptom, the cause, the fix.

### Examples

| Bug | Symptom | Cause | Fix |
|---|---|---|---|
| Iterating a `Collections.synchronizedList` without external sync | `ConcurrentModificationException` or silent corruption | The list operations are synchronized, but the iterator is not | Wrap the iteration: `synchronized (list) { for (T x : list) { ... } }`, or use `CopyOnWriteArrayList` |
| Comparing `Integer` with `==` for values > 127 | False even when values are equal | Integer cache is `-128..127` by default; outside that range, `Integer.valueOf` allocates new objects | Use `.equals()` for object comparisons; for primitives use `int` |
| `SimpleDateFormat` shared across threads | Random parse failures, corrupted output | `SimpleDateFormat` is not thread-safe and uses a shared `Calendar` field | Use `DateTimeFormatter` (java.time) which is immutable and thread-safe |
| Returning `Stream<T>` from a public method that re-runs computation each call | Silent O(n²) when callers iterate twice | Stream is single-use; consumers expect it to be replayable | Return a `List<T>` or `Iterable<T>` if the consumer might iterate twice |
| Catching `InterruptedException` and swallowing | Threads ignore shutdown signals | The interrupt flag is cleared by the catch but not reset | Restore the flag (`Thread.currentThread().interrupt()`) or rethrow as `RuntimeException` |
| Double-checked locking without `volatile` | Returns partially-constructed objects under concurrent access | The JVM may reorder writes inside the constructor relative to the assignment to the field | Make the field `volatile`; better, use `Holder` idiom or `LazyInitializer` |

### Discipline rule

Each bug must be specific. Generic ("watch out for concurrency issues") doesn't go here; specific ("`SimpleDateFormat` is not thread-safe; replace with `DateTimeFormatter` which is") does.

### Exit criterion

You can recall the top-3 bugs for this concept without consulting the note. These are the ones that ship.

---

## 16. Testing strategy

How you actually verify code that uses this concept works. Java's testing landscape is opinionated; pick the right tool.

### What to include

- **Unit testing:** What does a useful unit test look like for code using this concept? (Setup, action, assertion, edge cases.)
- **Integration testing:** When is this concept hard to test in isolation? (Often: anything that touches threads, time, IO, or JVM state.)
- **Property-based testing:** Is this a candidate? (For data-structure or algorithm-shaped concepts: yes. JUnit + jqwik or junit-quickcheck.)
- **Concurrency testing:** For thread-relevant concepts, name the tool. (jcstress for memory-model tests, JMH for performance.)
- **Mocking:** For framework concepts, what gets mocked vs. what gets used real?

### Discipline rule

Include at least one *failing* test case — what does a test look like that would catch the most common bug from §15?

### Exit criterion

You know what your CI would test for this concept and what it would miss.

---

## 17. Self-test (active recall prompts)

Questions you ask yourself a week from now without re-reading the note. **Active recall is the highest-leverage learning move available.** This section is what makes the note re-useful.

### Format

A list of 8–12 prompts. Mix of recall, application, and analysis.

### Example for `HashMap`

1. From memory, write a class that uses HashMap to count word frequencies, handling concurrent reads safely.
2. State the bucket structure: array of what? Each entry is what type? When does treeification happen?
3. Why is `HashMap.size()` an `int`, not a `long`? What happens if you add 2³¹ entries?
4. What's the difference between `put`, `putIfAbsent`, and `compute`? When would you use each?
5. Walk through what happens to the bucket array when the load factor is exceeded.
6. Why is `HashMap` not safe for concurrent reads in JDK 7? (Hint: rehashing.) What did JDK 8 change?
7. Hand-trace `map.put("a", 1)` in a 16-bucket HashMap. Where does it land?
8. Explain to a non-engineer why hashtables are O(1) "on average."
9. When would you reach for `LinkedHashMap` instead of `HashMap`?
10. What's the hashing trick that makes `HashMap` resilient to attackers who craft bad keys? (Hint: not perfect.)

### Discipline rule

Questions must be *answerable in under 2 minutes each*, must require *generation*, and must not be lookups. No "what is the time complexity" — instead "given an adversarial input, what's the realistic worst-case time complexity, and what JDK feature mitigates it?"

### Exit criterion

You can answer all 8+ questions without consulting the note. Schedule the self-test 24h after writing, then 1w, then 1m.

---

## 18. Sources and deeper reading

The references that earned their place. Curate, don't dump.

### Discipline rule

Maximum 5–6 references. For each, one sentence on what it's *for* (when to consult it).

### Examples

- **JLS — *Java Language Specification*** — when an edge case actually matters and you need to know what's *required* vs what *happens to work*.
- **JVM Spec — *Java Virtual Machine Specification*** — for bytecode-level questions and dispatch model.
- **Bloch, *Effective Java* (3rd ed.)** — the idiom bible. Cite by item number.
- **Goetz et al., *Java Concurrency in Practice*** — the concurrency bible; the JLS §17 reading made digestible.
- **Marc Kramnis blog, Mechanical Sympathy** — JIT and performance internals from people who actually run Java in production.
- **JEP database (openjdk.org/jeps)** — for "when did this feature land and what was the design rationale?"

### Exit criterion

Each reference is one you'd actually return to, not one you cite to look thorough.

---

# Worked Example — `HashMap`

The full template applied to one canonical Java class, end-to-end. This is the depth target. Copy this rigour for every concept note.

---

## Quick reference card

```
- Family: stdlib class — collection, key-value map
- One-line definition: An array-of-bucket-chains hash map with separate chaining, treeification on long chains, dynamic rehashing.
- Introduced in: JDK 1.2 (1998); core internals overhauled in JDK 8 (treeification)
- Replaces / supersedes: Hashtable (legacy, do not use for new code)
- Thread-safe: NO — concurrent put/resize can drop entries or infinite-loop (pre-JDK 8 cycle bug)
- Most common bug: assuming thread-safety; using mutable keys; ignoring iteration order is unspecified
- Performance: O(1) average get/put; O(log n) worst-case (treeified chain); O(n) catastrophic if treeification disabled
- Idiom signal: "I have keys mapping to values, no insertion-order requirement, single-threaded access"
- Canonical reference: Effective Java item 11 (equals/hashCode contract); JDK source `java.util.HashMap`
```

## 1. The 30-second pitch

**For an engineer:** "HashMap is Java's standard hash-based key-value store. Insertion and lookup are constant-time on average via hashing the key into a bucket array; collisions resolve by chaining; when chains get long (8 entries), they become red-black trees for worst-case O(log n)."

**For a non-engineer:** "It's a way to look things up by name very fast. Imagine a coat-check: instead of searching every coat, you give your ticket number and they walk straight to the right hook."

This is useful when you have a key-value relationship, don't need ordered iteration, and operate in a single-threaded context.

## 2. The motivating problem

Storing 10M (key, value) pairs and looking up by key in microseconds. Linear-scanning a list is 10M operations per lookup — at 10ns per compare, that's 100ms per lookup, three orders of magnitude over a sane SLO. A balanced BST gives O(log n) ≈ 23 compares per lookup, ~230ns. A hashtable gives O(1) on average — one hash + one bucket access + maybe a chain walk of 0–7, ~50ns. The constant factors crush the BST.

## 3. The naive Java way (and why it fails)

```java
// The wrong way: comparing references with == on autoboxed Integer keys.
Map<Integer, String> map = new HashMap<>();
map.put(1000, "alpha");

Integer key = 1000;
if (key == 1000) { ... }  // Sometimes true, sometimes false!
```

The `==` comparison fails for autoboxed `Integer` values outside the cache range (-128 to 127). JLS §5.1.7 mandates the cache for small integers, but for `1000`, `Integer.valueOf(1000)` allocates a new Integer instance each time, and `==` compares references. **Idiomatic fix:** use `.equals()` for object comparisons, or use primitive `int` if the API allows.

A more subtle Java-naive bug for HashMap specifically:

```java
// Mutable key — silent corruption.
class Key {
    int value;
    @Override public int hashCode() { return value; }
    @Override public boolean equals(Object o) { return o instanceof Key k && k.value == value; }
}
Map<Key, String> map = new HashMap<>();
Key k = new Key(); k.value = 1;
map.put(k, "first");
k.value = 2;             // mutate after insertion
map.get(k);              // returns null — the entry is in the wrong bucket
```

The HashMap looked up bucket `1` at insertion time, stored the entry there, then when we mutate the key the lookup goes to bucket `2`. The entry is lost in plain sight. Fix: **never mutate keys after insertion**; use immutable objects as keys (Effective Java item 17).

## 4. The key insight

**A good hash function maps keys uniformly across O(n) buckets, so the expected chain length is O(1) and lookup amortises to constant time.** Everything else — the resize policy, the treeification, the iteration order trade-off — is engineering to handle the cases where the hash is *not* uniform or the load factor changes.

## 5. Mental model & visualization

```
HashMap (capacity = 16, size = 6):

bucket[0]  ─→ null
bucket[1]  ─→ Entry(key="b", val=2, next=null)
bucket[2]  ─→ null
bucket[3]  ─→ Entry(key="a", val=1) ─→ Entry(key="z", val=26) ─→ null
bucket[4]  ─→ null
bucket[5]  ─→ Entry(key="e", val=5, next=null)
…
bucket[8]  ─→ Entry(...) ─→ Entry(...) ─→ ... ─→ TreeNode (red-black tree once chain length ≥ 8 AND capacity ≥ 64)
…
bucket[15] ─→ null

Load factor = 0.75 (default) — when size > capacity * 0.75, resize doubles capacity.
Treeification threshold = 8 (TREEIFY_THRESHOLD)
Untreeification threshold = 6 (UNTREEIFY_THRESHOLD)
```

The bucket-index for key K is computed as `(h ^ (h >>> 16)) & (capacity - 1)` where `h = K.hashCode()`. The XOR with the high half is to defend against poor hashes that vary only in the low bits (a real-world example: `String.hashCode()` for short strings).

## 6. Bytecode / runtime view

A naive use compiles uneventfully:

```java
HashMap<String,Integer> m = new HashMap<>();
m.put("a", 1);
```

```
0: new           #2 // class java/util/HashMap
3: dup
4: invokespecial #3 // Method java/util/HashMap."<init>":()V
7: astore_1
8: aload_1
9: ldc           #4 // String "a"
11: iconst_1
12: invokestatic  #5 // Method java/lang/Integer.valueOf:(I)Ljava/lang/Integer;
15: invokevirtual #6 // Method java/util/HashMap.put:(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
18: pop
```

The `invokevirtual` to `put` dispatches into the JDK's HashMap.put implementation, which:
1. Computes `hash(key)` — the key's hashCode XORed with its high half.
2. Indexes into the bucket array via `(n - 1) & hash`.
3. If the bucket is empty, allocates a new `Node` and stores it.
4. Otherwise walks the chain (or tree); if the same key (`equals`) is found, replaces the value and returns the old; otherwise appends.
5. Increments size; if `size > threshold`, calls `resize()` which doubles capacity and re-buckets every entry (this is the expensive O(n) operation hidden behind amortised-O(1)).

Memory layout: each `Node` is `{ int hash; K key; V value; Node next; }` — 4 reference fields plus a 4-byte hash plus the object header (~12 bytes on 64-bit) plus padding. Roughly 48 bytes per entry on a 64-bit JVM with compressed oops. For 10M entries, that's 480 MB before counting key and value objects.

## 7. Worked usage example

```java
// Word frequency counter — the canonical HashMap example.
Map<String, Integer> counts = new HashMap<>();
String[] words = {"to", "be", "or", "not", "to", "be"};
for (String w : words) {
    counts.merge(w, 1, Integer::sum);
}
System.out.println(counts);
// Output: {to=2, be=2, not=1, or=1}  (iteration order unspecified, may vary)
```

`merge` is the modern idiom (JDK 8+). It atomically replaces the older pattern:

```java
// Pre-Java-8 — five lines for what merge does in one.
Integer count = counts.get(w);
if (count == null) {
    counts.put(w, 1);
} else {
    counts.put(w, count + 1);
}
```

The `merge` form is also faster — it avoids the second hash + bucket lookup that the explicit `get` + `put` does. **Caveat:** `merge` does NOT make HashMap thread-safe; for concurrent counts use `ConcurrentHashMap.merge`.

## 8. Performance characteristics

| Metric | Value | Notes |
|---|---|---|
| `get` (avg) | O(1) | Hash + bucket access + ≤ 8 chain walks |
| `get` (worst, treeified) | O(log n) | Red-black tree traversal |
| `get` (worst, no treeification) | O(n) | If TREEIFY_THRESHOLD=8 not met, or capacity < 64 |
| `put` (avg) | O(1) amortised | Resize is O(n) but happens log(n) times |
| `put` (worst) | O(n) | When resize triggers |
| Iteration | O(n + capacity) | Walks every bucket including empties |
| Memory per entry | ~48 bytes | Plus key + value object size; compressed oops on 64-bit |
| Cache behavior | Poor | Bucket pointers point all over the heap; L1/L2 misses common at scale |
| JIT | Inlinable | `put`/`get` are commonly hot, JIT inlines well |

**Adversarial input:** keys all hashing to the same bucket cause O(n) chain walks. Pre-JDK 8 this could DoS web services that used HashMap on user-supplied keys (the "hash flooding" attack). JDK 8 mitigates via treeification + a randomised hash seed for `String.hashCode` (deactivated by default — opt in via `-XX:+UseString`).

## 9. Concurrency and thread safety

**Not thread-safe.** Two specific failure modes:

1. **Concurrent put + resize (pre-JDK 8):** the linked list rebucketing during resize could create a cycle, infinite-looping any subsequent `get` on the affected bucket. Famous "100% CPU" production incidents (e.g., the 2009 incident at a major web company that ran on JDK 6).
2. **Concurrent put + put (any version):** two writes can produce a lost update — the entry-count field is not atomic, and the bucket linked-list update isn't atomic either.

For concurrent use:
- `ConcurrentHashMap` — lock-striped (or per-bucket CAS in JDK 8+) — the right answer for new code.
- `Collections.synchronizedMap(new HashMap())` — wraps every method in a `synchronized` — works but coarse; iteration still requires external sync.
- `Hashtable` — legacy, every method synchronized; do not use for new code.

Visibility: `HashMap` writes do not establish any happens-before edges with reads from other threads — without external synchronization, a thread that calls `get` after another thread's `put` may see the old value or worse, a half-constructed `Node`. JLS §17.4 has nothing to say on `HashMap`'s behalf.

## 10. Memory model implications

- **Object layout:** `HashMap` instance has fields `table` (Node[]), `size`, `threshold`, `loadFactor`. Each `Node` is allocated separately on the heap. The array `table` itself is one heap object; entries are independent heap objects pointed to by it.
- **GC pressure:** rapidly inserted-and-removed entries produce short-lived garbage in Eden. Long-lived maps (like a Spring application context's bean registry) move the table and entries to Old gen, where they sit forever — fine, but watch for cases where a long-lived map holds references to short-lived values, preventing collection (the canonical leak).
- **Reference type:** standard strong references. For weak-keyed maps (e.g., metadata about objects you don't want to retain), use `WeakHashMap`.
- **Reordering:** without external sync, the JLS allows the JIT to reorder writes inside `put` arbitrarily relative to other threads' reads. This is *the* reason concurrent `HashMap` use is broken — there's no happens-before to rely on.

## 11. Idioms and anti-patterns

**Idioms:**
- Use `merge`, `computeIfAbsent`, `computeIfPresent`, `compute` instead of explicit get-then-put. (Effective Java item 8.)
- Use immutable keys. (Effective Java item 17.)
- Provide an initial capacity if you know the size: `new HashMap<>(expectedSize / 0.75 + 1)` to avoid rehashes.
- Override `hashCode` and `equals` consistently for custom key types. (Effective Java items 10 and 11.)

**Anti-patterns:**
- Mutating keys after insertion. (See §3.)
- Using `HashMap` from multiple threads. (See §9.)
- Iterating order — `HashMap` order is *not* guaranteed (it's deterministic for a given JDK version + capacity but not stable across JDK upgrades). For ordered iteration, use `LinkedHashMap`. For sorted iteration, use `TreeMap`.
- Returning a `Map` from a public API and forgetting to specify whether it's mutable, ordered, or thread-safe. The return type tells the caller too little.

## 12. Production usage

- **Spring `BeanFactory`** — bean registry uses `ConcurrentHashMap` (post-Spring 3); singleton lookups are happening dozens of times per second per request.
- **Tomcat session attributes** — each HttpSession holds a `ConcurrentHashMap` of attributes.
- **JDK runtime** — `System.getProperties()` returns a `Properties` (which extends `Hashtable`, the legacy synchronized cousin); used by countless apps to read config.
- **Hibernate `SessionFactory`** — entity metadata caches use HashMap-family types; long-lived, populated at startup.
- **Logback / Log4j** — logger registries; the leak that ate a process is usually a misuse of these, not the maps themselves.

## 13. Evolution

| Version | Change | JEP |
|---|---|---|
| JDK 1.2 (1998) | `HashMap` introduced | — |
| JDK 1.5 (2004) | Generics — `HashMap<K, V>` | JLS §4.4 |
| JDK 8 (2014) | Treeification (chains → red-black trees at length 8); randomised seed for `String.hashCode` (opt-in) | JEP 180 |
| JDK 8 (2014) | Default methods `merge`, `computeIfAbsent`, etc. on the Map interface | JEP 109 |
| JDK 9 (2017) | `Map.of(...)` factory methods (immutable, no nulls) | JEP 269 |
| JDK 10 (2018) | `Map.copyOf` for immutable copies | — |

## 14. Compared to other languages

| Language | Equivalent | Differences |
|---|---|---|
| Kotlin | `HashMap<K,V>` (same JDK class); `mapOf` (read-only view); `mutableMapOf` (mutable) | Kotlin distinguishes read-only and mutable at the type level; the underlying instance is the same |
| Scala | `mutable.HashMap`, `immutable.HashMap` | Persistent (structural sharing) for immutable; distinct API |
| C# | `Dictionary<TKey, TValue>` | Open addressing rather than chaining; throws on duplicate add (no put-returns-old) |
| Python | `dict` | Compact/insertion-order since CPython 3.7 (LIN spec); same O(1) profile but no thread-safety |
| Go | `map[K]V` | Per-bucket overflow chaining; randomised iteration order *intentionally* (to surface order-dependent bugs); not safe for concurrent use without sync |
| Rust | `HashMap<K, V>` (std) | SipHash-1-3 by default for DOS resistance; `Hash`/`Eq` traits replace `hashCode`/`equals` |

The Java-specific quirk: HashMap's `null` key and value support. Most other language hash-maps reject `null` keys. Java is permissive; this has produced bugs (you don't notice a key is null until you have `null=>X` and `someOtherKey=>X`, and subsequent code assumes "if it's in the map, the key is non-null").

## 15. Common bugs

| Bug | Symptom | Fix |
|---|---|---|
| Mutable keys | Entries silently disappear (wrong bucket on lookup) | Use immutable keys; mark fields final |
| Comparing autoboxed Integer with `==` for values > 127 | False even when equal | Use `.equals()` |
| Iterating HashMap with concurrent modification | `ConcurrentModificationException` | Use `Iterator.remove`, snapshot via `keySet().toArray`, or switch to `ConcurrentHashMap` |
| Forgetting `hashCode` when overriding `equals` | Map can't find inserted keys | Override both per Effective Java item 11 |
| Concurrent put + resize | 100% CPU, infinite loop (pre-JDK 8) or lost updates (any version) | Use `ConcurrentHashMap` |
| Iterating order assumed stable across JDK versions | Tests pass on JDK 8, fail on JDK 11 | Don't depend on iteration order; use `LinkedHashMap` if you need it |
| HashMap holding references to large/long-lived values | Memory leak (objects never collected) | Audit map lifetimes; consider `WeakHashMap` if values shouldn't outlive their keys |

## 16. Testing strategy

- **Unit:** test put/get/remove with null keys and values, with duplicate keys, with collision-prone keys (override hashCode to return the same value, verify chaining works).
- **Concurrency:** use `jcstress` for memory-model assertions if you're testing a `HashMap` wrapper. Use JMH for performance regressions.
- **Property-based:** jqwik or junit-quickcheck — assert that `put(k, v); get(k) == v` for arbitrary k, v pairs; that size matches the count of unique keys put; that iteration doesn't leak entries.
- **Adversarial:** craft a key class with a constant hashCode; verify treeification kicks in (post-JDK 8) by inserting > 8 colliding entries and checking that lookup remains O(log n).

## 17. Self-test prompts

1. From memory, sketch the structure of the `Node` class inside HashMap, including types and the fact that it's actually `Node<K,V>`.
2. State the load factor's default value and what happens when it's exceeded.
3. What's `TREEIFY_THRESHOLD` and what does it do?
4. Why is the bucket index `(n - 1) & hash` rather than `hash % n`?
5. Why does HashMap XOR the hash with its high half before bucketing?
6. Hand-trace inserting `("a", 1), ("b", 2), ("c", 3)` into an empty HashMap with capacity 4.
7. What happens if you put 13 entries with the same hashCode into a fresh HashMap (capacity 16)?
8. Why is concurrent put + resize broken in JDK 7 and what changed in JDK 8?
9. When would you use `LinkedHashMap` over `HashMap`? What does it cost?
10. Explain to a non-engineer how a hashtable can do lookups in "constant time."
11. Give one *non-obvious* reason to prefer `ConcurrentHashMap` over `Collections.synchronizedMap(new HashMap<>())`.

## 18. Sources

- **JDK source — `java.util.HashMap`** — the implementation is well-commented; reading it teaches more than any tutorial.
- **Bloch, *Effective Java* (3rd ed.), items 8, 10, 11, 17** — the contract rules around equals/hashCode and immutability.
- **Goetz et al., *Java Concurrency in Practice*, ch. 5** — concurrency contract for collections, including why HashMap fails under multithreading.
- **JEP 180** — treeification, the JDK 8 fix for hash-flooding DoS.
- **JLS §15.21.3** — for the autoboxed-`Integer`-with-`==` confusion; the language-level rule.

---

# Quality checklist for the AI generating this template

Before delivering the note, the AI must verify:

1. ☐ Quick reference card filled, both at top and re-checked at end.
2. ☐ §1 has both engineer and non-engineer pitches, each ending with a "useful when" sentence.
3. ☐ §2 shows the *pre-concept* code or pain explicitly.
4. ☐ §3 includes naive code with the *specific* JLS or runtime reason it fails.
5. ☐ §4 is one or two sentences; no algorithmic walk-through allowed here.
6. ☐ §5 contains an actual ASCII diagram, not "imagine X."
7. ☐ §6 has plausible bytecode output (`javap -c`-style) with at least one annotated non-obvious opcode.
8. ☐ §7 has a complete runnable example with expected output and a sentence-by-sentence walk-through.
9. ☐ §8 has each performance metric with a real-world trade-off, not a generic claim.
10. ☐ §9 cites the Java Memory Model (JLS §17.4) for any thread-safety claim.
11. ☐ §10 sketches heap layout or names the happens-before edge for the relevant case.
12. ☐ §11 idioms cite Effective Java items where applicable; anti-patterns are real, not strawmen.
13. ☐ §12 names specific production systems by name (Spring, Tomcat, etc.).
14. ☐ §13 evolution table cites JEP numbers and JDK versions.
15. ☐ §14 comparison table has *real* differences, not generic ("more functional").
16. ☐ §15 Mistake Museum has 5+ entries with bug → symptom → fix triples.
17. ☐ §17 self-test has 8+ active-recall prompts, all generative.
18. ☐ §18 has ≤ 6 curated references, each with a one-sentence purpose.

If any check fails, the section is incomplete. Iterate.

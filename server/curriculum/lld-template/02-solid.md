---
slug: 02-solid
name: "SOLID principles"
order: 2
estimatedMinutes: 90
prerequisites:
  - 01-oop-for-lld
expectedQuestions:
  - "What's the difference between DI and DIP?"
  - "Give a concrete LSP violation and its fix."
  - "When is violating SOLID the right call?"
  - "Why is `if/else on type` an OCP smell?"
  - "How do ISP and composition-over-inheritance reinforce each other?"
canonicalSources:
  - { title: "Clean Architecture", type: "book", author: "Robert C. Martin (2017)" }
  - { title: "Data Abstraction and Hierarchy", type: "paper", author: "Barbara Liskov (1987)" }
  - { title: "Design Principles and Design Patterns", type: "paper", author: "Robert C. Martin (2000)" }
readinessRubric:
  explainToJunior: "Explain each SOLID letter to a junior in one sentence per letter, no jargon."
  sketchArchitecture: "Sketch how to refactor a god-class NotificationService into SRP-compliant collaborators."
  buildFromScratch: "Implement a small OCP-compliant Shape hierarchy without any `instanceof` or `switch` on type."
  nameFailureModes: "Name a specific LSP violation (concrete class + method) and explain what breaks for callers."
  compareAlternatives: "Compare DIP with DI — what's the principle vs the mechanism, and can you have DI without DIP?"
  estimateCost: "For a codebase with 5 payment providers, estimate the OCP-cost of each new provider (files touched)."
  blastRadius: "Predict what breaks when a subclass strengthens a precondition (LSP violation) — name 2 concrete symptoms."
  debugFromSymptoms: "Given a bug where `Collections.unmodifiableList` throws on `add()`, walk through the ISP diagnostic."
---

# Module 02 · SOLID principles

*Part of: LowLevelDesign curriculum · Language: Java 17+ · Reading time: ~40 min*

---

## Learning objectives

By the end of this module you can:

- Name a specific SOLID violation in any Java code within 60 seconds
- Refactor an SRP violation by extracting responsibilities into collaborators
- Diagnose subtle LSP violations (the "override changes the contract" trap)
- Design an ISP-compliant interface (small + focused, not fat)
- Answer *"which SOLID principle does DI enable, and why?"*
- Argue *against* a SOLID rule when the simpler alternative is better

## Prerequisites

- Module 01 (OOP for LLD) — encapsulation, composition, polymorphism internalised
- Java 17+ with IDE

## What SOLID is (and isn't)

Coined by Robert C. Martin (~2000). Five heuristics for making code that the *next* person to touch it can safely change.

- **S** — Single Responsibility (one reason to change)
- **O** — Open/Closed (extend without modifying)
- **L** — Liskov Substitution (subtypes must not surprise callers)
- **I** — Interface Segregation (small role interfaces beat fat ones)
- **D** — Dependency Inversion (depend on abstractions)

**Three misconceptions to correct:**

1. SOLID is NOT rules to blindly apply — over-application leads to "Java Enterprise Poisoning"
2. SOLID is NOT a measurable metric — qualitative judgment calls
3. SOLID is NOT the same as "clean code" — specifically about dependency shape between modules

---

## S — Single Responsibility Principle

**Formal:** *"A class should have only one reason to change."*
**Modern reading:** *"...where 'reason' means a single stakeholder or actor whose requirements drive changes."*

The unit is *who*, not *what*. Ask: *whose complaint would send me back to this file?*

**God-class example:** an `Employee` doing payroll (CFO), persistence (DBA), and reporting (reporting team) — three actors, three reasons, one class → violation.

**Refactor:** split into `Employee` (data), `PayrollCalculator`, `EmployeeRepository`, `EmployeeReporter`. Each has one reason to change.

**Signals:**
- Vague names — `Manager`, `Util`, `Helper`
- Methods at wildly different abstraction levels (business logic + raw SQL)
- Testing one behaviour needs heavy mocking
- `git blame` shows 4+ teams touching the same file

**When over-engineering:** one-off scripts, no team boundaries, or "responsibilities" that never change independently. Rule of thumb: wait for the pain, then refactor.

---

## O — Open/Closed Principle

**Formal (Meyer, 1988):** *"Software entities should be open for extension, but closed for modification."*

Adding a feature should be *additive*, never *invasive*.

**Retro-reinforcement:** your Module 01 answer for `FixedDepositAccount` — 2 files created, 11 files untouched — was OCP.

**Bad:** `AreaCalculator` with `if (shape instanceof Circle) ... else if (shape instanceof Square)` — every new shape reopens the same file.

**Good:** `Shape` interface with `area()`, each shape implements. Adding `Hexagon` is one new file, zero modifications.

**OCP is what polymorphism was invented for.**

**Signals:** `switch`/`if-else` on type; the same file appearing in every feature PR; comments like `// TODO: add case for X`.

**When over-engineering:** interfaces with one implementation forever. Rule of three — wait for the second variation.

---

## L — Liskov Substitution Principle

**Formal (Liskov 1987; Liskov & Wing 1994):** *"If S is a subtype of T, objects of T may be replaced with objects of S without altering desirable properties of the program."*

Subtypes must be substitutable — no caller surprises.

**Rectangle/Square example:** mathematically a square is a rectangle, but a `Square extends Rectangle` breaks callers that expect `setWidth(5); setHeight(10);` to yield area 50. Square gives 100.

**The four contract rules ("ask for less, give more"):**

| Rule | Direction |
|---|---|
| Preconditions | Can be *weakened*, never *strengthened* |
| Postconditions | Can be *strengthened*, never *weakened* |
| Invariants | Must be preserved |
| Exceptions | Must not add new types not in parent's contract |

**Cross-module diagnostic:** `CheckingAccount.withdraw()` in Module 01 throws `TransactionLimitException` which parent doesn't declare — strict LSP violation. Defensible (unchecked exception, class name telegraphs) but should be *documented* in `BankAccount.withdraw()` Javadoc.

**Signals:** override throws `UnsupportedOperationException`, override adds new exception types, override checks `instanceof` on argument.

**Java stdlib deliberate violations:** `Stack extends Vector`, `Collections.unmodifiableList` — known trade-offs.

---

## I — Interface Segregation Principle

**Formal:** *"Clients should not be forced to depend on methods they do not use."*

**Worker/Robot example:** a `Worker` interface with `work()`, `eat()`, `sleep()` forces `Robot` to fake `eat()`/`sleep()` (throw `UnsupportedOperationException`). Fix: split into `Workable`, `Eatable`, `Sleepable` role interfaces.

**Java stdlib win:** `Runnable` — one method, one purpose. Because it's tiny, every class with any async-executable behaviour can implement it. Reusability wins.

**The `java.util.List` critique:** immutable implementations must implement mutation methods but throw on them → ISP violation. Kotlin fixes with separate `List` and `MutableList`; Java can't retrofit.

**Signals:** `UnsupportedOperationException` on inherited methods, vague interface names (`Manager`, `Handler`, `Service`), implementers using only 1-2 methods of a large interface.

**When over-engineering:** one-method interfaces for everything, splitting cohesive operations that always change together.

**Tie-back to Module 01:** `InterestStrategy` and `WithdrawalPolicy` are perfect single-method role interfaces. Composition seams tend toward ISP by design.

---

## D — Dependency Inversion Principle

**Formal (Martin, 2000):**

1. *High-level modules should not depend on low-level modules. Both should depend on abstractions.*
2. *Abstractions should not depend on details. Details should depend on abstractions.*

**The "inversion":** without DIP, high-level calls low-level directly (source-code + call flow same direction). With DIP, both depend on the abstraction; source-code dependency of the low-level module is *flipped* to point at the abstraction.

**Retro-reinforcement — you applied DIP twice in Module 01:**

- `SavingsAccount` depends on `InterestStrategy` abstraction, not `FlatRate`/`TieredRate` concretes (injected via constructor)
- Your Q3 invention `WithdrawalPolicy` — same pattern

**Logger example:** don't `new FileLogger()` inside `OrderService` — accept `Logger` interface via constructor. Now: testable (`InMemoryLogger` in tests), swappable (Kafka in prod, Console in dev), no I/O coupling in business logic.

**DI ≠ DIP:**

- **DIP** = design principle (depend on abstractions)
- **DI** = mechanism (pass dependencies in from outside instead of `new`-ing internally)

DI is one way to achieve DIP. Spring's `@Autowired`, Guice's `@Inject`, constructor arguments — all DI mechanisms serving the DIP goal.

**Signals:** `new` inside business logic, concrete-type fields, constructors that don't take collaborators.

**When over-engineering:** value objects (`Money`), stable framework classes (`String`, `Math`), interfaces with one impl forever, pure computation utilities.

---

## SOLID as a diagnostic tool, not a rule book

Senior engineers don't apply SOLID as rules — they use it as **vocabulary**.

**The 5-question checklist for code review:**

| Principle | Question |
|---|---|
| S | How many actors would send me back to modify this class? |
| O | If a new type is added tomorrow, how many files do I touch? |
| L | Can every subtype quietly replace the parent without callers noticing? |
| I | Does any implementer have to write no-ops or throw on methods it doesn't support? |
| D | Does this class depend on abstractions I can substitute in tests? |

**Four legitimate reasons to violate SOLID:**

1. Prototype / throwaway code
2. Value objects and pure data
3. Framework glue (framework's contract dictates shape)
4. When the alternative is worse (e.g. `Collections.unmodifiableList`)

**Senior rule:** *know* when you're violating, have a *reason*, *document* it.

**Kent Beck's Four Rules of Simple Design** complement SOLID: (1) passes all tests, (2) reveals intention, (3) no duplication, (4) fewest elements. A great code review touches both.

**The 5 reinforce each other** — one habit (composition + role interfaces) satisfies all five as a byproduct.

---

## Worked example

**Grading a Module 01 reference solution against SOLID:**

| Class / Interface | SRP | OCP | LSP | ISP | DIP |
|---|---|---|---|---|---|
| `BankAccount` (abstract) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SavingsAccount` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `CheckingAccount` | ✅ | ✅ | ⚠️ documented | ✅ | — |
| `InterestStrategy` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rate implementations | ✅ | ✅ | ✅ | ✅ | ✅ |
| `Bank` | ✅ | ✅ | ✅ | ✅ | ✅ |

**Score: 29/30.** Composition + role interfaces yielded SOLID compliance as a byproduct.

The one ⚠️ is `CheckingAccount.withdraw()` throwing `TransactionLimitException` — a technical LSP violation because the parent `BankAccount.withdraw()` doesn't declare it. Defensible with a Javadoc note on the parent that documents the extended contract, but strict Liskov would want the exception hierarchy hoisted.

---

## Hands-on lab

The `NotificationSystem` refactor lab lands in a follow-up sync — starter code violates all 5 SOLID principles, learner walks the diagnose → plan → refactor loop. Watch this module for the lab.

Until then, a **study exercise:**

1. Take any class you've written in the last month.
2. Score it on the 5-question checklist above.
3. Identify the highest-leverage violation and write a 3-line refactor plan for it.
4. If nothing scored badly, congratulations — you've internalised the habits. If everything scored badly, that's normal and the point of the module is to give you the vocabulary to name the smells.

---

## Further reading

- Robert C. Martin, *Clean Architecture* (2017) — the definitive SOLID book
- Barbara Liskov's 1987 keynote "Data Abstraction and Hierarchy" (LSP origin)
- Uncle Bob's original 2000 paper: *Design Principles and Design Patterns*

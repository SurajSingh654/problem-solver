---
slug: 01-oop-for-lld
name: "OOP for LLD"
order: 1
estimatedMinutes: 90
prerequisites: []
expectedQuestions:
  - "When would you prefer composition over inheritance?"
  - "How does encapsulation differ from abstraction in practice?"
  - "Give an example of an OOP smell and its refactor."
  - "Why is `instanceof` on type the #1 smell in machine-coding submissions?"
  - "Explain dynamic dispatch in one sentence an interviewer would accept."
canonicalSources:
  - { title: "Design Patterns", type: "book", author: "Gang of Four (1994)" }
  - { title: "Effective Java (3rd ed) — Item 18", type: "book", author: "Josh Bloch" }
  - { title: "Test-Driven Development: By Example", type: "book", author: "Kent Beck" }
readinessRubric:
  explainToJunior: "Explain composition-over-inheritance to a junior in 60 seconds without cheat-sheeting."
  sketchArchitecture: "Sketch a BankAccount hierarchy that uses strategy over inheritance for interest calculation."
  buildFromScratch: "Implement BankAccount + two subtypes + a pluggable InterestStrategy without looking at reference."
  nameFailureModes: "Name two common OOP smells in a BankAccount design and how you'd detect each in code review."
  compareAlternatives: "Compare inheritance vs composition for the interest-calculation problem; justify the pick."
  estimateCost: "Estimate the maintenance cost delta of a Bank with 10 subclasses vs 10 strategies over time."
  blastRadius: "Predict what breaks when a new AccountType is added under each design (inheritance vs composition)."
  debugFromSymptoms: "Given a bug where SavingsAccount.calculateInterest returns 0 for all customers, walk your debug path."
---

# Module 01 · OOP for LLD — the four pillars + composition over inheritance

*Part of: LowLevelDesign curriculum · Language: Java 17+ · Reading time: ~18 min*

---

## Learning objectives

By the end of this module you can:

- Explain the difference between abstraction and encapsulation (they're routinely confused in interviews)
- Design a class with genuinely private state and only the public API a caller actually needs
- Use polymorphism to eliminate `if/else` or `switch` on type — the #1 code smell in machine-coding submissions
- Recognise inheritance abuse in code review and refactor to composition
- Justify inheritance vs composition for a specific design choice with senior-engineer reasoning

## Prerequisites

- Basic Java familiarity (class, interface, field, method, public/private)
- JDK 17+ installed with IntelliJ IDEA (or VS Code + Red Hat Java)
- Single-file compilation is fine — no Maven/Gradle needed yet

## The problem OOP solves

Before OOP existed at scale (mid-1980s), code was **procedures + shared mutable state**. A bank program was a bunch of top-level functions like `credit(accountId, amount)`, `debit(accountId, amount)`, `getBalance(accountId)`, all reading and writing a big global `accounts[]` array.

Two things kept breaking:

1. **No ownership** — any function anywhere could mutate `accounts[]`. Bugs required grepping the entire codebase to find every writer.
2. **No change safety** — swapping storage (array → database) meant hunting down every function that touched `accounts[]`.

**The core OOP insight:** bundle data with the code that manipulates it, and hide the implementation from callers. One place mutates balance (inside `Account`), callers only see a public API — internals change freely without breaking users. Everything else in OOP is scaffolding around that insight.

## Mental model

> Each class is a **service with a public API (contract) and private implementation (your problem)**. The public API is a promise to the caller. The private implementation is yours to change without notice, as long as the promise holds.

If you can hold this in your head, most OOP design decisions become obvious.

## The four pillars

### 1. Encapsulation — bundle data with behaviour, hide the data

**What:** Bundle fields and methods into one unit. Hide the fields — force all mutation through methods.

**Why:** Without it, invariants can't be enforced. Public `balance` → anyone sets it to `-1000`. Private `balance` with validated methods → mutation is centralised.

```java
// ❌ No encapsulation
class Account {
    public double balance;  // anyone can set to anything
}

// ✅ Encapsulated
class Account {
    private double balance;

    public void withdraw(double amount) {
        if (amount <= 0) throw new IllegalArgumentException("amount must be positive");
        if (amount > balance) throw new InsufficientFundsException();
        balance -= amount;
    }

    public double getBalance() { return balance; }
}
```

**Interview lens:** *"How do you enforce invariants?"* → private state + validated methods.

### 2. Abstraction — expose only what the caller needs

**What:** Show the *contract* (what) without the *implementation* (how).

**Why it's not encapsulation:** Encapsulation is the mechanism. Abstraction is the design decision. You can encapsulate badly by exposing 50 public methods. Good abstraction = small, stable API surface.

```java
// ❌ Low abstraction
class UserRepository {
    public Connection getDbConnection() { ... }   // caller shouldn't know we use SQL
    public String buildInsertQuery(User u) { ... }
    public void executeQuery(String sql) { ... }
}

// ✅ Good abstraction
class UserRepository {
    public void save(User u) { ... }              // impl could be SQL/Mongo/in-memory
    public Optional<User> findById(String id) { ... }
}
```

**Interview lens:** *"Design a X"* always begins with *"what's the public API?"*. 20+ public methods = failed abstraction.

### 3. Inheritance — reuse behaviour by extending a base

**What:** Subclass gets parent's fields and methods; can override or add.

**Why it's dangerous:** Tightest possible coupling. Subclass can break when parent adds a conflicting method (fragile base class problem), depend silently on parent's internal behaviour (Liskov violations — Module 02), or get locked into a hierarchy that doesn't fit later.

**Interview lens:** *"Why not inheritance here?"* is a standard follow-up.

### 4. Polymorphism — same call, different behaviour

**What:** Same method call resolves to different implementations based on the actual object type at runtime.

**Why:** Eliminates `if/else`/`switch` on type — the #1 code smell in machine coding.

```java
// ❌ Non-polymorphic — must edit every time a new shape is added
double area(Object shape) {
    if (shape instanceof Circle)    return ((Circle) shape).r * ...;
    else if (shape instanceof Square) return ((Square) shape).side * ...;
    else throw new IllegalArgumentException();
}

// ✅ Polymorphic — new shape? just implement Shape.area(). This method never changes.
double area(Shape shape) { return shape.area(); }
```

**Interview lens:** `instanceof` or `switch` on type → interviewer's mental model of you drops a level.

### 4.5. Composition over inheritance (the informal fifth pillar)

- **Composition** = "has-a". A `Car` has an `Engine`.
- **Inheritance** = "is-a". A `Car` is a `Vehicle`.

```java
// ❌ Inheritance — Car locked into being a Vehicle. Electric variant is awkward.
class Vehicle { Engine engine; void start() { engine.start(); } }
class ElectricCar extends Vehicle { ... }  // but has a Battery, not an Engine!

// ✅ Composition — Car has-a PowerSource. Swap freely.
interface PowerSource { void start(); }
class Engine  implements PowerSource { ... }
class Battery implements PowerSource { ... }

class Car {
    private final PowerSource power;
    public Car(PowerSource power) { this.power = power; }
    public void start() { power.start(); }
}
```

**The heuristic:** Start with composition. Reach for inheritance only when you have a genuine "is-a" relationship AND need language-level polymorphism. Almost every design pattern (Strategy, Decorator, Observer, State, Composite) is composition-based specifically to avoid inheritance rigidity.

**Interview lens:** *"Why did you choose inheritance here?"* — if you can't justify beyond "reuse", the answer is "I should have used composition".

**Gang of Four's second core principle (1994):** *"Favor object composition over class inheritance."* Thirty years later, the bet has held.

---

## Worked example

## Hands-on lab — BankAccount system

Design in Java:

1. `BankAccount` with `deposit`/`withdraw`, balance never negative, not mutable from outside
2. Two account types:
   - `SavingsAccount` — `calculateInterest()`
   - `CheckingAccount` — monthly transaction limit
3. Interest calculation for `SavingsAccount` is pluggable — `FlatRate`, `TieredRate`, `PromotionalRate` — without modifying `SavingsAccount`
4. `Bank` holds `List<BankAccount>`, has `applyMonthlyInterest()` — no `instanceof`, no `switch` on type
5. 2-3 tests: overdraw rejected, tiered interest correct, checking limit works

See `labs/01-oop-for-lld/` for the hands-on lab. The lab task, constraints, and submission workflow are in the lab's `README.md`; a reference solution unlocks after the AI reviewer grades your submission as **STRONG** or **ADEQUATE**.

---

## Under the hood — the JVM's role in polymorphism

When `account.applyMonthlyInterest()` runs inside `Bank`:

1. **Compile time:** compiler only knows `account` is declared `BankAccount`. Records "call the method with this signature".
2. **Runtime:** JVM looks at the actual object (not the reference type) and dispatches to that class's implementation.

The JVM uses a **vtable** (virtual method table) — one per class — storing pointers to each overridable method's implementation. Cost: ~1 nanosecond per call. Essentially free.

This mechanism is called **dynamic dispatch** (also **virtual method invocation** or **runtime polymorphism**). It's the language-level feature that makes the `if/else`-on-type refactor possible.

---

## Trade-offs

| Approach | Wins when | Loses when |
|---|---|---|
| **Composition + interface** (this lesson) | Behaviour varies independently; multiple axes of variation; need runtime swappability | Interface count grows large; adds one layer of indirection |
| **Inheritance hierarchy** | Genuine "is-a" relationship; sharing common invariants; base class is stable | Combinatorial explosion with multiple axes; fragile base class; hard to unwind later |
| **Direct `if/else` on type** | Small, stable set of types; one-off code | Every new type touches this code; violates Open/Closed; scattered logic |

---

## Production concerns

- **Failure modes:** silent-fail deposit/withdraw is a classic production bug — the caller thinks it succeeded, downstream state is now wrong. Loud (throw) always beats silent.
- **Observability:** in real code, log every rejected deposit/withdraw with `accountId`, requested amount, and current balance. Balance mismatches at reconciliation time are otherwise unsolvable.
- **Cost/scale:** polymorphism itself is free. Concern: shared mutable state on strategy objects (e.g. `MaxWithdrawalsPerMonth` holding `usedThisMonth`) — not thread-safe. Real deployments would either make policies stateless (pass state via `BankAccount`) or add synchronisation.
- **Common footguns:** overriding `withdraw` in `CheckingAccount` without preserving parent's contract (Liskov violation — Module 02). Storing money as `double` (loses precision) — should be `BigDecimal` in production. Failing to reset monthly counters on cycle boundaries.

### Debug drill

*"Reconciliation team reports that ₹500 was deducted from account C042 but no transaction record exists. Where would you look first?"*

Ordered hypotheses:
1. Silent-fail in `withdraw` — validation rejects, counter increments before throw, or reverse order bug
2. Transaction record write happens in a separate service after withdraw; that service failed but withdraw succeeded (missing atomicity)
3. Concurrent withdraws — two threads decremented balance both times, only one recorded
4. `resetMonthlyCounter()` called mid-flight, corrupting state

Root cause almost always: **withdraw and transaction-record write are not atomic**. Real fix: transactional boundary (DB transaction or Saga).

---

## Senior-engineer perspective

- **Architectural implication:** the composition + polymorphism pattern here is exactly what Spring's `HandlerInterceptor`, Servlet filter chains, and JPA repositories use. Once you internalise it, you'll see it everywhere.
- **Migration risk:** if this design ships and needs adjustment later, adding a new account type (`FixedDepositAccount`) is *additive*: create the file, done. Adding a new *cross-cutting rule* (e.g. audit logging on every mutation) requires more work — that's Module 04 (Decorator) and Module 07 (Chain of Responsibility) territory.
- **Team implications:** the `WithdrawalPolicy` / `InterestStrategy` seams are excellent onboarding surfaces — a new team member can add a `HolidayFreezeStrategy` without touching core account logic.
- **When NOT to use this:** for a one-off script or throwaway integration, the ceremony of interfaces + strategies is over-engineering. Rule of three: after the second variation, refactor to the composition seam. Not before.

---

## Check-in questions

### Q1 · Recall

In `Bank.applyMonthlyInterest()`, iterating and calling `account.applyMonthlyInterest()` — no `instanceof` — how does the right method run for each object at runtime?

*A strong answer names **dynamic dispatch** (virtual method invocation) and describes the JVM looking at the actual object type at runtime and calling that class's version via the vtable.*

### Q2 · Apply

You need to add `FixedDepositAccount` (8% annually, 12-month lock-in). (a) What files do you create? (b) Which files are you certain you don't need to modify — and why does that answer itself prove your design works?

*A strong answer creates `FixedDepositAccount.java` + `LockInPeriodException.java`, and identifies that `BankAccount.java`, `Bank.java` (⭐ zero changes — dynamic dispatch handles it), `SavingsAccount.java`, `CheckingAccount.java`, `InterestStrategy.java` + all rate classes, and both existing exception files are untouched. This is Open/Closed in action (Module 02 formalises it).*

### Q3 · Design / Build

Add "max 6 withdrawals per month" to `SavingsAccount` **without hardcoding**. Sketch the design.

*A strong answer defines a `WithdrawalPolicy` interface with `checkAllowed(account, amount)`, multiple implementations (`Unlimited`, `MaxWithdrawalsPerMonth(6)`, `PremiumTier`), and composes it into `SavingsAccount` via constructor. `SavingsAccount.withdraw()` calls `policy.checkAllowed(...)` before delegating to `super.withdraw(amount)`. Same shape as `InterestStrategy` — that's not a coincidence, that's the Strategy pattern (Module 06).*

---

## Further reading

- Gang of Four, *Design Patterns* (1994) — canonical source. Chapter 1 (Introduction) covers the "favor composition" principle before any specific pattern.
- Josh Bloch, *Effective Java* (3rd edition) — Item 18: "Favor composition over inheritance". The most-cited Java advice ever written.
- Kent Beck, *Test-Driven Development: By Example* — the money-example chapter (Chapter 1) demonstrates iterative OOP design from scratch.

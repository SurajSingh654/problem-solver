# Lab 01 · OOP for LLD — BankAccount system

**Time-box:** ~25-30 minutes
**Language:** Java 17+

## The task

Design a `BankAccount` system that satisfies:

1. **`BankAccount`** stores balance, supports `deposit(amount)` / `withdraw(amount)`. Balance must never go negative and must not be mutable from outside.
2. **Two account types:**
   - `SavingsAccount` — `calculateInterest()`
   - `CheckingAccount` — monthly transaction limit; reject `withdraw` if it would exceed the limit for the current cycle
3. **Interest calculation for `SavingsAccount` is pluggable** — support `FlatRate`, `TieredRate`, `PromotionalRate` without modifying `SavingsAccount` itself.
4. **`Bank`** holds `List<BankAccount>` and has `applyMonthlyInterest()`. **No `instanceof` or `switch` on type** — use polymorphism.
5. **Write 2-3 tests** covering: overdraw rejected, tiered interest correct, checking-account limit works.

## Constraints

- Java 17+ syntax where it helps (records, `var`, switch expressions if useful)
- No external libs beyond JUnit if you use it
- Public API as small as possible (abstraction test)
- Every field `private` unless you have a specific reason
- `Bank.applyMonthlyInterest()` must not use `instanceof`

## How to submit

1. Write your Java code in the Monaco editor on the lab page. Use the **+ Add file** button for each new class (`BankAccount.java`, `SavingsAccount.java`, `CheckingAccount.java`, `Bank.java`, `InterestStrategy.java`, and any rate implementations you add).
2. Multi-file submissions are packed automatically — you don't need `// File: X.java` separators.
3. Click **Submit**. The AI reviewer will grade your code with a teaching lens (not just correctness) — it checks for encapsulation, the `instanceof` smell, missing polymorphism hooks, silent-failure bugs, and other pedagogy signals in addition to whether the tests pass.
4. Only after your review comes back **STRONG** or **ADEQUATE** will the reference solution unlock. Peeking before that is on the honor system, but the payoff of struggling first is real — the learning is in the friction.
5. To iterate: address the reviewer's feedback and resubmit. Each attempt is tracked in your progress log; unlimited retries.

## What "done" looks like

- All 4+ classes exist (`BankAccount`, `SavingsAccount`, `CheckingAccount`, `Bank`, plus interest-strategy files)
- Every field is `private` unless there's a specific reason
- `Bank.applyMonthlyInterest()` compiles and runs without any `instanceof` check
- At least 2-3 tests pass (JUnit or a plain `main()` with `assert` — the reviewer accepts either)
- You could walk through your design in 3 minutes without looking at the code

// InterestStrategy.java
// A functional interface — one abstract method, so it can also be implemented
// with a lambda if desired (e.g. `s -> balance -> balance * 0.05`).
//
// This is the composition seam: SavingsAccount HAS-A InterestStrategy.
// Changing the strategy doesn't require changing SavingsAccount.

@FunctionalInterface
public interface InterestStrategy {

    // Given a balance, returns the interest for one ANNUAL period.
    // Monthly interest is annual / 12 at the caller's discretion.
    double calculate(double balance);
}

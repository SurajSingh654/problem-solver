// SavingsAccount.java
// Extends BankAccount. Composes an InterestStrategy — this is the pattern that lets
// us mix and match interest calculations without touching this class's code.
//
// The critical override: applyMonthlyInterest(). This is what makes Bank's iteration
// work polymorphically. No instanceof; the base's no-op is overridden here.

public class SavingsAccount extends BankAccount {

    private final InterestStrategy interestStrategy;

    public SavingsAccount(String accountId, double initialBalance, InterestStrategy strategy) {
        super(accountId, initialBalance);
        if (strategy == null) {
            throw new IllegalArgumentException("Interest strategy required");
        }
        this.interestStrategy = strategy;
    }

    // The annual interest for the current balance.
    public double calculateInterest() {
        return interestStrategy.calculate(getBalance());
    }

    // Override the base's no-op — pay ourselves the monthly interest.
    @Override
    public void applyMonthlyInterest() {
        double monthly = calculateInterest() / 12.0;
        credit(monthly);
    }
}

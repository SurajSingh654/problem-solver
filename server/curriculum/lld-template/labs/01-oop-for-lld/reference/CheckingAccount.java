// CheckingAccount.java
// Extends BankAccount. Adds a monthly transaction limit.
// Overrides withdraw() to enforce the limit BEFORE calling super — so the parent's
// balance-check invariants remain unchanged.
//
// Note: does NOT override applyMonthlyInterest() — so the base's no-op runs.
// That's exactly what we want; checking accounts don't accrue interest.

public class CheckingAccount extends BankAccount {

    private final int monthlyLimit;
    private int transactionsThisMonth;

    public CheckingAccount(String accountId, double initialBalance, int monthlyLimit) {
        super(accountId, initialBalance);
        if (monthlyLimit <= 0) {
            throw new IllegalArgumentException("Monthly limit must be positive");
        }
        this.monthlyLimit = monthlyLimit;
        this.transactionsThisMonth = 0;
    }

    @Override
    public void withdraw(double amount) {
        if (transactionsThisMonth >= monthlyLimit) {
            throw new TransactionLimitException(
                "Monthly transaction limit of " + monthlyLimit + " reached");
        }
        super.withdraw(amount);          // parent handles balance validation
        transactionsThisMonth++;         // only bumped on a successful withdraw
    }

    public void resetMonthlyCounter() {
        transactionsThisMonth = 0;
    }

    public int getTransactionsThisMonth() {
        return transactionsThisMonth;
    }

    public int getMonthlyLimit() {
        return monthlyLimit;
    }
}

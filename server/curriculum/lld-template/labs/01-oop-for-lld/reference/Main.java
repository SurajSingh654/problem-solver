// Main.java
// Plain-assertion tests. Run with `java -ea Main` to enable assertions,
// OR use ./run.sh which does that for you.

public class Main {

    public static void main(String[] args) {
        testOverdrawRejected();
        testDepositRejectsNegative();
        testTieredInterest();
        testCheckingAccountLimit();
        testBankAppliesInterestPolymorphically();

        System.out.println("✅ All 5 tests passed");
    }

    // 1. Withdraw beyond balance is rejected.
    static void testOverdrawRejected() {
        SavingsAccount acc = new SavingsAccount("S001", 1000, new FlatRate(0.04));
        try {
            acc.withdraw(1500);
            throw new AssertionError("Expected InsufficientFundsException");
        } catch (InsufficientFundsException expected) {
            // pass
        }
        assert acc.getBalance() == 1000
            : "Balance should be unchanged after failed withdraw";
        System.out.println("  ✓ testOverdrawRejected");
    }

    // 2. Invalid inputs throw — no silent failures.
    static void testDepositRejectsNegative() {
        SavingsAccount acc = new SavingsAccount("S002", 1000, new FlatRate(0.04));
        try {
            acc.deposit(-50);
            throw new AssertionError("Expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            // pass
        }
        assert acc.getBalance() == 1000;
        System.out.println("  ✓ testDepositRejectsNegative");
    }

    // 3. TieredRate: 4% up to 100k, 5.5% above. Balance = 150k → 6,750.
    static void testTieredInterest() {
        InterestStrategy tiered = new TieredRate(0.04, 0.055, 100_000);
        SavingsAccount acc = new SavingsAccount("S003", 150_000, tiered);
        double interest = acc.calculateInterest();
        assert Math.abs(interest - 6750) < 0.001
            : "Expected 6750, got " + interest;
        System.out.println("  ✓ testTieredInterest");
    }

    // 4. CheckingAccount enforces monthly transaction limit.
    static void testCheckingAccountLimit() {
        CheckingAccount acc = new CheckingAccount("C001", 5000, 3);
        acc.withdraw(100);
        acc.withdraw(100);
        acc.withdraw(100);
        try {
            acc.withdraw(100);
            throw new AssertionError("Expected TransactionLimitException on 4th withdraw");
        } catch (TransactionLimitException expected) {
            // pass
        }
        assert acc.getTransactionsThisMonth() == 3;
        assert acc.getBalance() == 4700 : "3 successful withdraws of 100 from 5000";
        System.out.println("  ✓ testCheckingAccountLimit");
    }

    // 5. Bank.applyMonthlyInterest() — polymorphism at work. No instanceof.
    //    SavingsAccount receives interest; CheckingAccount is untouched.
    static void testBankAppliesInterestPolymorphically() {
        Bank bank = new Bank();
        SavingsAccount savings   = new SavingsAccount("S004", 12_000, new FlatRate(0.12));  // 12% annual = 1% monthly
        CheckingAccount checking = new CheckingAccount("C002", 5000, 10);

        bank.addAccount(savings);
        bank.addAccount(checking);
        bank.applyMonthlyInterest();

        // Savings: 12,000 + (12% / 12 = 1%) = 12,000 + 120 = 12,120
        assert Math.abs(savings.getBalance() - 12_120) < 0.001
            : "Expected 12120, got " + savings.getBalance();

        // Checking: unchanged
        assert checking.getBalance() == 5000
            : "Checking should not receive interest, got " + checking.getBalance();

        System.out.println("  ✓ testBankAppliesInterestPolymorphically");
    }
}

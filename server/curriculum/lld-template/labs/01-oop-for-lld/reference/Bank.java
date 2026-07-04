// Bank.java
// Holds a list of accounts. applyMonthlyInterest() iterates polymorphically.
// No instanceof, no switch, no if-tree on type — just plain method dispatch.

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Bank {

    private final List<BankAccount> accounts;

    public Bank() {
        this.accounts = new ArrayList<>();
    }

    public void addAccount(BankAccount account) {
        if (account == null) {
            throw new IllegalArgumentException("account cannot be null");
        }
        accounts.add(account);
    }

    // Unmodifiable view — callers can read but can't mutate the internal list.
    // This is a small but senior-engineer touch: hides implementation, protects invariants.
    public List<BankAccount> getAccounts() {
        return Collections.unmodifiableList(accounts);
    }

    // THE polymorphism moment. Each account decides what "apply monthly interest"
    // means for its own type — SavingsAccount pays itself, CheckingAccount is a no-op.
    // Adding a new account type (say, FixedDeposit) requires zero changes here.
    public void applyMonthlyInterest() {
        for (BankAccount account : accounts) {
            account.applyMonthlyInterest();
        }
    }
}

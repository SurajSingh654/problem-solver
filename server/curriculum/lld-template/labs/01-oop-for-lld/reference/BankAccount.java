/**
 * Abstract base class for all account types.
 *
 * <p>You never want to instantiate a plain {@code BankAccount} — only concrete subclasses
 * such as {@link SavingsAccount} and {@link CheckingAccount}. Declaring it abstract
 * enforces this at compile time.
 *
 * <p>Concrete subclasses may <strong>extend</strong> the contracts of
 * {@link #withdraw(double)} and {@link #deposit(double)} — see each method's Javadoc for
 * details. Callers working against a {@code BankAccount} reference should handle unchecked
 * exceptions defensively.
 */
public abstract class BankAccount {

    private final String accountId;
    private double balance;

    protected BankAccount(String accountId, double initialBalance) {
        if (accountId == null || accountId.isBlank()) {
            throw new IllegalArgumentException("accountId is required");
        }
        if (initialBalance < 0) {
            throw new IllegalArgumentException("initialBalance cannot be negative");
        }
        this.accountId = accountId;
        this.balance = initialBalance;
    }

    public String getAccountId() { return accountId; }
    public double getBalance()   { return balance; }

    /**
     * Deposits {@code amount} into this account's balance.
     *
     * <p>On success the balance increases by {@code amount}. On failure the balance is
     * unchanged and an unchecked exception is thrown.
     *
     * <p><strong>Subclasses may extend this contract</strong> by imposing additional
     * preconditions and throwing further {@link RuntimeException} subtypes not listed
     * here. Callers holding a {@code BankAccount} reference should therefore handle
     * unchecked exceptions defensively rather than assume the exception set below is
     * closed.
     *
     * @param amount the amount to deposit; must be strictly positive
     * @throws IllegalArgumentException if {@code amount} is zero or negative
     */
    public void deposit(double amount) {
        requirePositive(amount);
        balance += amount;
    }

    /**
     * Withdraws {@code amount} from this account's balance.
     *
     * <p>On success the balance decreases by {@code amount}. On failure the balance is
     * unchanged and an unchecked exception is thrown.
     *
     * <p><strong>Subclasses may extend this contract</strong> by imposing additional
     * failure conditions and throwing further {@link RuntimeException} subtypes not
     * listed below. For example, {@link CheckingAccount} rejects withdrawals that would
     * exceed the monthly transaction limit by throwing {@link TransactionLimitException},
     * and future subclasses may add lock-in periods or fraud checks with their own
     * unchecked exceptions. Callers working against a {@code BankAccount} reference must
     * therefore handle unchecked exceptions defensively — the set of possible failures
     * is <em>not closed</em> by the exceptions declared on this base method.
     *
     * @param amount the amount to withdraw; must be strictly positive
     * @throws IllegalArgumentException if {@code amount} is zero or negative
     * @throws InsufficientFundsException if {@code amount} exceeds the current balance
     */
    public void withdraw(double amount) {
        requirePositive(amount);
        if (amount > balance) {
            throw new InsufficientFundsException(
                "Cannot withdraw " + amount + " — current balance is " + balance);
        }
        balance -= amount;
    }

    // The polymorphism hook. Default is a no-op. Subclasses that pay interest
    // override this to credit themselves. Bank.applyMonthlyInterest() calls this
    // on every account uniformly — no instanceof needed.
    public void applyMonthlyInterest() {
        // no-op by default
    }

    // Protected — subclasses can top up the balance (e.g. SavingsAccount when
    // crediting interest) without going through the deposit() validation path.
    // Kept protected (not public) because callers shouldn't be able to bypass validation.
    protected void credit(double amount) {
        requirePositive(amount);
        balance += amount;
    }

    private static void requirePositive(double amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Amount must be positive, got " + amount);
        }
    }
}

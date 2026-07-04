// InsufficientFundsException.java
// Unchecked (RuntimeException) — modern Java strongly prefers unchecked exceptions
// for business errors. Callers don't need to litter their code with try/catch
// for every operation; they handle at a strategic layer.

public class InsufficientFundsException extends RuntimeException {
    public InsufficientFundsException(String message) {
        super(message);
    }
}

// FlatRate.java
// The simplest strategy — flat percentage on the whole balance.

public class FlatRate implements InterestStrategy {

    private final double annualRate;

    public FlatRate(double annualRate) {
        if (annualRate < 0) {
            throw new IllegalArgumentException("Rate cannot be negative");
        }
        this.annualRate = annualRate;
    }

    @Override
    public double calculate(double balance) {
        return balance * annualRate;
    }
}

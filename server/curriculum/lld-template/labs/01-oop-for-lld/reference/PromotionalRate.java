// PromotionalRate.java
// Same shape as FlatRate — separate class because "promotional" is a business concept.
// A senior engineer might argue this could just be `new FlatRate(0.07)` at construction —
// and that's a valid design conversation. Keeping it separate here documents intent.

public class PromotionalRate implements InterestStrategy {

    private final double annualRate;

    public PromotionalRate(double annualRate) {
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

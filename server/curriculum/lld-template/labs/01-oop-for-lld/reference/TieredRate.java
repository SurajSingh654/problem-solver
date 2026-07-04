// TieredRate.java
// Different rate below vs above a threshold.
// Example: 4% up to 1 lakh, 5.5% on anything above.
//   150,000 balance → 100,000 * 0.04 + 50,000 * 0.055 = 4,000 + 2,750 = 6,750

public class TieredRate implements InterestStrategy {

    private final double lowRate;
    private final double highRate;
    private final double threshold;

    public TieredRate(double lowRate, double highRate, double threshold) {
        if (lowRate < 0 || highRate < 0 || threshold <= 0) {
            throw new IllegalArgumentException("rates must be non-negative, threshold must be positive");
        }
        this.lowRate = lowRate;
        this.highRate = highRate;
        this.threshold = threshold;
    }

    @Override
    public double calculate(double balance) {
        if (balance <= threshold) {
            return balance * lowRate;
        }
        double lowPortion  = threshold * lowRate;
        double highPortion = (balance - threshold) * highRate;
        return lowPortion + highPortion;
    }
}

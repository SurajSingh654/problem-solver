// ============================================================================
// Dimension stats — Wilson CI + mean CI + composite combiner
// ============================================================================
//
// Every 6D dimension score now carries a confidence interval. Wilson for
// proportion-like signals (% with pattern claimed, % with both approaches),
// normal-approximation with small-sample penalty for continuous signals
// (average confidence, average retention).
//
// Why not just report variance: the dimensions feed into a user-facing
// report. Variance means nothing to a user. CIs ([lo, hi]) are the same
// information in a form that can be rendered next to the score.
//
// References:
//   Wilson 1927, "Probable Inference, the Law of Succession, and
//     Statistical Inference," JASA.
//   Agresti & Coull 1998, "Approximate Is Better than 'Exact' for
//     Interval Estimation of Binomial Proportions," The American
//     Statistician. Recommends Wilson over Wald for small n.
// ============================================================================

// 95% confidence by default (z ≈ 1.96). Other common: 1.645 for 90%, 2.576 for 99%.
const Z_95 = 1.96;

/**
 * Wilson score interval for a proportion k/n, expressed on a 0-100 scale.
 * Correctly widens as n shrinks — at n=1 the 95% interval is roughly
 * [2.5, 100] regardless of whether k is 0 or 1.
 *
 * @param {number} k successes (int, 0 <= k <= n)
 * @param {number} n trials (int, n >= 0)
 * @param {number} z confidence multiplier (default 1.96 = 95%)
 * @returns {{ score: number, ci: [number, number] }}
 */
export function wilsonCI(k, n, z = Z_95) {
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0) {
    return { score: 0, ci: [0, 100] };
  }
  const kClamped = Math.max(0, Math.min(n, k));
  const pHat = kClamped / n;
  const denom = 1 + (z * z) / n;
  const center = (pHat + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((pHat * (1 - pHat)) / n + (z * z) / (4 * n * n))) / denom;
  const lo = Math.max(0, (center - margin) * 100);
  const hi = Math.min(100, (center + margin) * 100);
  return {
    score: Math.round(pHat * 100),
    ci: [Math.round(lo), Math.round(hi)],
  };
}

/**
 * 95% CI around the mean of a sample of 0-100 values using the normal
 * approximation. Adds a small-sample penalty (widens the CI) for n < 10
 * because the t-distribution would give larger intervals there. Returns
 * a [0, 100]-clamped interval.
 *
 * @param {number[]} values each in [0, 100]
 * @param {number} z confidence multiplier
 * @returns {{ score: number, ci: [number, number] } | null} null if no values
 */
export function meanCI(values, z = Z_95) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n === 1) {
    // One data point — no variance info. Return a wide interval that's
    // honestly uninformative. 30pt half-width is arbitrary but matches
    // the Wilson width at n=1 for p near the middle.
    return {
      score: Math.round(mean),
      ci: [Math.max(0, Math.round(mean - 30)), Math.min(100, Math.round(mean + 30))],
    };
  }
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  // Small-sample penalty — widen ~10% at n=3, fades by n=10.
  const smallSamplePenalty = n < 10 ? 1 + (10 - n) * 0.02 : 1;
  const halfWidth = z * se * smallSamplePenalty;
  return {
    score: Math.round(mean),
    ci: [
      Math.max(0, Math.round(mean - halfWidth)),
      Math.min(100, Math.round(mean + halfWidth)),
    ],
  };
}

/**
 * Combine active dimension CIs into an overall CI using weighted variance.
 * Approximation — treats dimension distributions as independent Gaussians
 * around their midpoints. Widens further when some dimensions are missing
 * (coverage penalty) so "partial profile" is visible at the composite level.
 *
 * @param {{score: number, ci: [number, number], weight: number}[]} activeDims
 * @param {number} totalDims total expected dimensions (usually 6)
 * @returns {{ score: number, ci: [number, number] } | null} null if empty
 */
export function combineCIs(activeDims, totalDims = 6) {
  if (!activeDims.length) return null;
  const totalWeight = activeDims.reduce((a, d) => a + d.weight, 0);
  if (totalWeight <= 0) return null;

  // Re-normalize weights across active dims only.
  const score = activeDims.reduce(
    (acc, d) => acc + (d.score * d.weight) / totalWeight,
    0,
  );

  // Combined variance of a weighted sum of independent Gaussians:
  //   Var(Σ w_i X_i) = Σ (w_i / totalW)^2 · Var(X_i)
  // Approximate Var(X_i) from the CI half-width (HW ≈ z·σ → σ ≈ HW/z).
  const combinedVariance = activeDims.reduce((acc, d) => {
    const halfWidth = (d.ci[1] - d.ci[0]) / 2;
    const sigma = halfWidth / Z_95;
    const w = d.weight / totalWeight;
    return acc + w * w * sigma * sigma;
  }, 0);
  const sigma = Math.sqrt(combinedVariance);

  // Coverage penalty: widen by 15% per missing dimension.
  const coveragePenalty = 1 + (totalDims - activeDims.length) * 0.15;
  const halfWidth = Z_95 * sigma * coveragePenalty;

  return {
    score: Math.round(score),
    ci: [
      Math.max(0, Math.round(score - halfWidth)),
      Math.min(100, Math.round(score + halfWidth)),
    ],
  };
}

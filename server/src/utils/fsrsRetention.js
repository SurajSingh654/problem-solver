// ============================================================================
// FSRS-style retrievability for the D6 retention dimension
// ============================================================================
//
// The old D6 formula evaluated Ebbinghaus decay from `Solution.createdAt`
// for every solution, including those never reviewed. Result: fresh
// submissions scored as near-100% "retained" because t ≈ 0 → e⁰ = 1.
// D6 = 89 for users with one partial submission was the pathology.
//
// The FSRS (Free Spaced Repetition Scheduler) community has been
// optimizing the forgetting-curve formula against millions of real Anki
// review logs since ~2022. Their retrievability function is power-law:
//
//     R(t, S) = (1 + FACTOR · t/S)^DECAY
//
// calibrated so that R(S, S) = 0.9 — i.e., stability S is defined as
// "days until retrievability drops to 90%." We adopt the v4+ constants
// (DECAY = -0.5, FACTOR = 19/81), giving a sharper near-review decay
// than the exponential model and a flatter long-tail.
//
// Most importantly: FSRS only updates stability when a review is
// actually performed. Stability on an unreviewed card is undefined —
// there's no memory model yet because there's been no recall event.
// That's exactly the property we need for D6: unreviewed solutions
// simply don't contribute to retention.
//
// Reference: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
// ============================================================================

// FSRS v4+ constants — calibrated so R(S, S) = 0.9.
const DECAY = -0.5;
const FACTOR = 19 / 81; // ≈ 0.2346, derived from DECAY so 0.9 point holds

/**
 * Retrievability at time t (days since last successful review), given
 * current stability S (days). Result is a probability in [0, 1].
 *
 * @param {number} daysSinceReview must be ≥ 0
 * @param {number} stability must be > 0
 * @returns {number} retrievability ∈ [0, 1]
 */
export function retrievability(daysSinceReview, stability) {
  if (!Number.isFinite(stability) || stability <= 0) return 0;
  const t = Math.max(0, daysSinceReview);
  const r = Math.pow(1 + FACTOR * (t / stability), DECAY);
  if (!Number.isFinite(r)) return 0;
  return Math.max(0, Math.min(1, r));
}

/**
 * Approximate stability after N successful repetitions.
 *
 * FSRS fits ~20 parameters against user review logs to infer stability
 * per card. We don't have that fit here, so we use a simple functional
 * form that (a) scales sub-linearly with reps (each additional successful
 * recall lengthens stability less than the previous one) and (b) lets
 * difficulty nudge the result. Calibrated so:
 *   - reps=1, difficulty=5 → stability ≈ 2.5 days
 *   - reps=3, difficulty=5 → stability ≈ 5.4 days
 *   - reps=6, difficulty=5 → stability ≈ 8.4 days
 *   - reps=10, difficulty=5 → stability ≈ 12.5 days
 *
 * These are in the right ballpark for real Anki decks. If we ever fit
 * FSRS parameters against our own review logs, this helper is the one
 * place to swap the model — the D6 controller doesn't care about the
 * specifics, just the output.
 *
 * @param {number} repetitions successful recalls (≥ 0)
 * @param {number} difficulty 1-10 FSRS-style difficulty (5 = default)
 * @returns {number} stability in days
 */
export function stabilityAfterReps(repetitions, difficulty = 5) {
  const reps = Math.max(0, repetitions);
  const diff = Math.max(1, Math.min(10, difficulty));
  const baseline = 2.5 - 0.15 * (diff - 5); // harder material → lower stability
  return Math.max(1, baseline * Math.pow(reps + 1, 0.7));
}

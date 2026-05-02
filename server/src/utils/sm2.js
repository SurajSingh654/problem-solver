// ============================================================================
// SM-2 Spaced Repetition Algorithm
// ============================================================================
// Based on: Wozniak, P.A. (1990). "Optimization of learning."
// SuperMemo 2 algorithm — the foundation of Anki, SuperMemo, and
// every scientifically-validated spaced repetition system.
//
// ALGORITHM:
// Input: quality (0-5), current EF, current interval, current repetitions
// Output: new EF, new interval, new repetitions, next review date
//
// Quality scale mapped from our 1-5 confidence:
//   confidence 1 → quality 0 (complete blackout)
//   confidence 2 → quality 2 (wrong but remembered on seeing answer)
//   confidence 3 → quality 3 (correct with difficulty)
//   confidence 4 → quality 4 (correct after hesitation)
//   confidence 5 → quality 5 (perfect recall)
//
// EF (Easiness Factor):
//   Starts at 2.5. Increases when quality is high, decreases when low.
//   Minimum 1.3 — items never become harder to schedule than this.
//   Formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
//
// Interval:
//   Repetition 1: 1 day
//   Repetition 2: 6 days
//   Repetition n: interval(n-1) * EF
//
// Reset on quality < 3:
//   Repetitions reset to 0, interval resets to 1.
//   This implements the "forgetting" — item goes back to the start.
// ============================================================================

/**
 * Map our 1-5 confidence scale to SM-2 quality scale (0-5)
 * Confidence 1-2 = failed recall (quality < 3) → triggers reset
 * Confidence 3-5 = successful recall (quality >= 3) → progresses
 */
export function confidenceToQuality(confidence) {
  const map = {
    1: 0, // Complete blackout — saw answer, still don't know
    2: 2, // Wrong but recognized correct answer
    3: 3, // Correct but required significant effort
    4: 4, // Correct after hesitation
    5: 5, // Perfect, immediate recall
  };
  return map[confidence] ?? 3;
}

/**
 * Core SM-2 calculation
 *
 * @param {number} quality - 0-5 quality of recall
 * @param {number} easinessFactor - current EF (default 2.5)
 * @param {number} interval - current interval in days
 * @param {number} repetitions - consecutive successful reviews
 * @returns {{ easinessFactor, interval, repetitions, nextReviewDate }}
 */
export function calculateSM2(quality, easinessFactor, interval, repetitions) {
  // Clamp inputs to valid ranges
  const q = Math.max(0, Math.min(5, quality));
  const ef = Math.max(1.3, easinessFactor ?? 2.5);
  const rep = Math.max(0, repetitions ?? 0);

  let newEF = ef;
  let newInterval;
  let newRepetitions;

  if (q < 3) {
    // Failed recall — reset repetitions and interval
    // The item will be reviewed again very soon
    newRepetitions = 0;
    newInterval = 1;
    // EF decreases on failure — item becomes "harder"
    // Still apply EF update formula but it will decrease
    newEF = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  } else {
    // Successful recall — advance the schedule
    newRepetitions = rep + 1;

    // SM-2 interval progression
    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      // For subsequent repetitions: previous interval * EF
      newInterval = Math.round(interval * ef);
    }

    // EF update: quality 5 increases EF, quality 3 decreases slightly
    newEF = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  }

  // Cap maximum interval at 180 days (6 months)
  // Beyond this, even well-known items should be refreshed
  newInterval = Math.min(newInterval, 180);

  // Compute next review date
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
  nextReviewDate.setHours(0, 0, 0, 0); // normalize to start of day

  return {
    easinessFactor: Math.round(newEF * 100) / 100, // 2 decimal places
    interval: newInterval,
    repetitions: newRepetitions,
    nextReviewDate,
  };
}

/**
 * Calculate initial SM-2 state on first submission.
 * First review is always in 1 day regardless of initial confidence.
 * The initial confidence adjusts the starting EF so well-understood
 * items get longer intervals faster.
 *
 * @param {number} confidence - 1-5 initial confidence at submission time
 * @returns {{ easinessFactor, interval, repetitions, nextReviewDate }}
 */
export function initialSM2State(confidence) {
  // Initial EF is adjusted by submission confidence
  // High initial confidence = start with higher EF (items will space out faster)
  // Low initial confidence = start with lower EF (items will come back sooner)
  const initialEFMap = {
    1: 1.5, // Very unsure — will come back frequently
    2: 1.8,
    3: 2.2, // Average — standard starting point (slightly lower than default 2.5)
    4: 2.5, // Confident — standard SM-2 default
    5: 2.8, // Very confident — will space out quickly
  };

  const easinessFactor = initialEFMap[confidence] ?? 2.5;

  // First review always in 1 day — regardless of confidence
  // We need to observe actual recall before extending intervals
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + 1);
  nextReviewDate.setHours(0, 0, 0, 0);

  return {
    easinessFactor,
    interval: 1,
    repetitions: 0,
    nextReviewDate,
  };
}

/**
 * Estimate current retention probability using Ebbinghaus forgetting curve
 * R = e^(-t/S) where t = days since last review, S = stability (EF-based)
 *
 * Used by the 6D report (D6) and for sorting the review queue
 * (most forgotten items should appear first)
 *
 * @param {number} daysSinceReview - days since last review/submission
 * @param {number} easinessFactor - current EF
 * @param {number} repetitions - number of successful reviews
 * @returns {number} retention probability 0-1
 */
export function estimateRetention(
  daysSinceReview,
  easinessFactor,
  repetitions,
) {
  // Stability increases with each successful repetition and EF
  // More reviews + higher EF = slower forgetting
  const stability = Math.max(
    1,
    easinessFactor * Math.pow(repetitions + 1, 0.7),
  );
  const retention = Math.exp(-daysSinceReview / (stability * 10));
  return Math.max(0, Math.min(1, retention));
}

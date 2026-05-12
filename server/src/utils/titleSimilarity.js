// ============================================================================
// Title similarity — token-Jaccard for detecting duplicate problem titles
// ============================================================================
//
// Catches AI-generated variants of existing problems before the admin
// approves a duplicate. Not a semantic match (that's what embeddings are
// for), just title-overlap — fast, free, deterministic, sufficient to
// catch the common "Two Sum" vs "Two Sum II" / "Valid Parentheses" vs
// "Valid Parenthesis" failure modes.
// ============================================================================

// Common English stopwords that appear in problem titles without carrying
// meaning ("Find the longest …", "Sum of an array"). Filtered out before
// tokenization so they don't inflate false positives.
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "with",
  "is", "are", "be", "by", "at", "from", "as", "this", "that", "it", "its",
  "find", "given",
]);

/**
 * Tokenize a title into a Set of content words.
 * Lowercased, stripped of punctuation and whitespace, filtered:
 *   - single-character tokens dropped (noise, e.g. "a", "i")
 *   - stopwords dropped
 */
function tokenize(title) {
  if (!title) return new Set();
  return new Set(
    String(title)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t)),
  );
}

/**
 * Jaccard similarity over content tokens: |A ∩ B| / |A ∪ B|.
 * Returns 0-1. Both empty → 0 (avoid NaN and avoid flagging empty-empty
 * as a duplicate).
 */
export function tokenJaccard(titleA, titleB) {
  const a = tokenize(titleA);
  const b = tokenize(titleB);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Find candidates from `pool` that are similar to `target` title.
 * Returns top `limit` matches scoring >= `threshold`, descending.
 *
 * @param {string} target
 * @param {{id: string, title: string}[]} pool
 * @param {{threshold?: number, limit?: number}} opts
 * @returns {{id: string, title: string, score: number}[]}
 */
export function findSimilarTitles(target, pool, opts = {}) {
  const threshold = opts.threshold ?? 0.5;
  const limit = opts.limit ?? 3;
  const scored = [];
  for (const item of pool) {
    const score = tokenJaccard(target, item.title);
    if (score >= threshold) {
      scored.push({ id: item.id, title: item.title, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

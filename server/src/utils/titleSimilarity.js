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

// ============================================================================
// Problem-title casing safety net
// ============================================================================
// The AI prompt instructs the model to return canonical Title Case, but the
// model occasionally regresses (especially in URL recall mode where the slug
// `check-if-array-is-sorted-and-rotated` biases output to lowercase). This is
// the cheap defensive fix.
//
// Conservative gate: only normalize titles whose alphabetic characters are
// 100% lowercase or 100% uppercase. Anything with even one existing capital
// is passed through untouched.
//
// Why so conservative: titles can contain hyphenated English compounds
// ("trade-offs", "follow-up", "real-world"). A naive "if it has hyphens,
// split it" rule treats those as slug separators and silently changes the
// content from "trade-offs" → "Trade Offs". A title with any existing
// capital letter implies the author was thinking about casing — trust them.
//
// All-lowercase titles WITH hyphens (e.g. literal LeetCode slugs like
// `longest-substring-without-repeating-characters`) still pass the gate via
// the all-lowercase property, and hyphens still get split inside the
// title-casing step. So slug-mode normalization still works; we just don't
// trigger it on already-capitalized inputs.
// ============================================================================

// Smallwords kept lowercase in the middle of a title. First and last words
// are always capitalized regardless. Chicago Manual of Style: lowercase all
// articles, conjunctions, and prepositions in the middle.
const TITLE_CASE_LOWERCASE_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor", "for", "so", "yet",
  "of", "in", "on", "at", "to", "by", "as", "via",
  "vs",
]);

// Roman numerals length 2+ (LC has plenty of "Meeting Rooms II", "Course
// Schedule III", "Best Time to Buy and Sell Stock IV"). Length-1 "i", "v",
// "x" alone aren't matched — they could be real English words / variables.
const ROMAN_NUMERAL_RE = /^(i|v|x){2,4}$/;

/**
 * Normalize a problem title's casing to canonical Title Case when the input
 * is clearly degenerate (all-lower / all-upper / slug). Otherwise return as-is.
 */
export function normalizeProblemTitle(title) {
  if (typeof title !== "string") return title;
  const trimmed = title.trim();
  if (trimmed.length === 0) return trimmed;

  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return trimmed;

  const isAllLower = letters === letters.toLowerCase();
  const isAllUpper = letters === letters.toUpperCase();

  // Any existing capital → trust the author. Preserves acronyms ("BST",
  // "LRU"), proper nouns ("iPhone"), and hyphenated compounds ("trade-offs").
  if (!isAllLower && !isAllUpper) return trimmed;

  // Replace slug separators with spaces, collapse whitespace.
  const spaced = trimmed.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

  const words = spaced.split(" ");
  const lastIdx = words.length - 1;
  const titled = words.map((w, idx) => {
    const lw = w.toLowerCase();
    if (ROMAN_NUMERAL_RE.test(lw)) return lw.toUpperCase();
    if (idx > 0 && idx < lastIdx && TITLE_CASE_LOWERCASE_WORDS.has(lw)) {
      return lw;
    }
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  });
  return titled.join(" ");
}

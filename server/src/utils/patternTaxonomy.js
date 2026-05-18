// ============================================================================
// Pattern taxonomy — canonical labels + normalizer
// ============================================================================
//
// MUST stay in lock-step with `client/src/utils/constants.js::PATTERNS`.
// They're duplicated rather than shared because (a) the lists change rarely
// and (b) sharing requires a build step we don't otherwise have.
//
// Behaviour goal: accept what the user typed, but bound it (length, dedup),
// and log non-canonical entries so we can promote frequent custom tags into
// the canonical list later.
// ============================================================================

// Order matches client PATTERNS for readability; the order itself doesn't
// affect anything functional.
export const CANONICAL_PATTERN_LABELS = [
  "Array / Hashing",
  "Two Pointers",
  "Fast & Slow Pointers",
  "Sliding Window",
  "Stack",
  "Monotonic Stack",
  "Queue",
  "BFS",
  "DFS",
  "Binary Search",
  "Linked List",
  "Trees",
  "Tries",
  "Heap / Priority Queue",
  "Top K Elements",
  "Matrix",
  "Backtracking",
  "Graphs",
  "Union-Find",
  "Topological Sort",
  "Dynamic Programming",
  "Greedy",
  "Intervals",
  "Math & Geometry",
  "Bit Manipulation",
];

// Lowercase set for fast O(1) canonical lookup.
const CANONICAL_LOWER = new Set(
  CANONICAL_PATTERN_LABELS.map((p) => p.toLowerCase()),
);

const MAX_PATTERN_LEN = 60;
const MAX_PATTERNS_PER_SOLUTION = 10;

/**
 * Normalize a user-submitted patterns array.
 *
 * - Trims whitespace, collapses internal runs of spaces.
 * - Caps individual length at 60 chars.
 * - Dedupes case-insensitively (keeps first occurrence's casing).
 * - Caps the array at 10 entries.
 * - Drops empty / non-string values.
 * - Logs non-canonical entries to telemetry (one log line per entry, with
 *   user id + solution id for triage).
 *
 * Returns the cleaned array. Never throws — invalid input yields [].
 *
 * @param {unknown}  patterns  what the client sent
 * @param {object}   ctx       { userId, solutionId? } — for the log line
 * @returns {string[]}
 */
export function normalizePatterns(patterns, { userId, solutionId } = {}) {
  if (!Array.isArray(patterns)) return [];
  const seen = new Set();
  const out = [];

  for (const raw of patterns) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.replace(/\s+/g, " ").trim().slice(0, MAX_PATTERN_LEN);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_PATTERNS_PER_SOLUTION) break;
  }

  // Log anything not in the canonical list. One line per custom value;
  // grep `[patterns:custom]` later to see what users are typing.
  for (const p of out) {
    if (!CANONICAL_LOWER.has(p.toLowerCase())) {
      const ctxStr = [
        userId ? `user=${userId}` : null,
        solutionId ? `sol=${solutionId}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.warn(`[patterns:custom] "${p}"${ctxStr ? " " + ctxStr : ""}`);
    }
  }

  return out;
}

/**
 * Quick check used by other modules — true iff the label exactly matches
 * one of the canonical entries (case-insensitive).
 */
export function isCanonicalPattern(label) {
  if (typeof label !== "string") return false;
  return CANONICAL_LOWER.has(label.trim().toLowerCase());
}

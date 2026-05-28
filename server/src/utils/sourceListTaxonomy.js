// ============================================================================
// Source list taxonomy — canonical curriculum labels + normalizer
// ============================================================================
//
// MUST stay in lock-step with `client/src/utils/constants.js::SOURCE_LISTS`.
// They're duplicated rather than shared because the lists change rarely and
// sharing requires a build step we don't otherwise have.
//
// Behaviour goal: accept what the admin typed, but bound it (length, dedup),
// and log non-canonical entries so we can promote frequent custom labels
// (e.g. "Apna College DSA") into the canonical list later.
//
// Soft allowlist semantics: canonical entries pass silently; custom entries
// pass through but log a `[sourceLists:custom]` warning. Never throws —
// invalid input yields [].
// ============================================================================

// Order matches client SOURCE_LISTS for readability.
export const CANONICAL_SOURCE_LISTS = [
  "Striver A2Z",
  "Neetcode 150",
  "Blind 75",
  "LeetCode Top 100",
];

// Lowercase set for fast O(1) canonical lookup.
const CANONICAL_LOWER = new Set(
  CANONICAL_SOURCE_LISTS.map((s) => s.toLowerCase()),
);

const MAX_SOURCE_LIST_LEN = 50;
const MAX_SOURCE_LISTS_PER_PROBLEM = 30;

/**
 * Normalize an admin-submitted sourceLists array.
 *
 * - Trims whitespace, collapses internal runs of spaces.
 * - Caps individual length at 50 chars.
 * - Dedupes case-insensitively (keeps first occurrence's casing).
 * - Caps the array at 30 entries.
 * - Drops empty / non-string values.
 * - Logs non-canonical entries to telemetry. One line per custom value;
 *   grep `[sourceLists:custom]` later to see what admins are typing.
 *
 * Returns the cleaned array. Never throws — invalid input yields [].
 *
 * @param {unknown} lists       what the client sent
 * @param {object}  ctx         { userId, problemId? } — for the log line
 * @returns {string[]}
 */
export function normalizeSourceLists(lists, { userId, problemId } = {}) {
  if (!Array.isArray(lists)) return [];
  const seen = new Set();
  const out = [];

  for (const raw of lists) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_LIST_LEN);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_SOURCE_LISTS_PER_PROBLEM) break;
  }

  for (const s of out) {
    if (!CANONICAL_LOWER.has(s.toLowerCase())) {
      const ctxStr = [
        userId ? `user=${userId}` : null,
        problemId ? `problem=${problemId}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.warn(`[sourceLists:custom] "${s}"${ctxStr ? " " + ctxStr : ""}`);
    }
  }

  return out;
}

/**
 * Quick check used by other modules — true iff the label exactly matches
 * one of the canonical entries (case-insensitive).
 */
export function isCanonicalSourceList(label) {
  if (typeof label !== "string") return false;
  return CANONICAL_LOWER.has(label.trim().toLowerCase());
}
